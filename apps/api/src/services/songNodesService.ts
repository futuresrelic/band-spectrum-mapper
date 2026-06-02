/**
 * Song Nodes Service — builds a Cytoscape.js-compatible graph of songs,
 * albums, artists, themes, tags, and lyric keywords with typed edges.
 *
 * Layout presets:
 *   artist-universe     — all songs from selected bands, hierarchy + shared tags
 *   album-cluster       — songs in an album with tag/theme satellites
 *   tag-constellation   — songs grouped around shared AI tags
 *   maynard-universe    — preset: bands matching TOOL/APC/Puscifer names
 *   emotional-similarity— songs connected by cosine-similar radar profiles
 *   lyrical-dna         — songs connected by top shared keywords
 */

import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeType = 'song' | 'album' | 'artist' | 'theme' | 'tag' | 'keyword' | 'emotion';
export type EdgeType =
  | 'same_artist'
  | 'same_album'
  | 'shared_tag'
  | 'similar_radar'
  | 'conceptual'
  | 'shared_word'
  | 'remix_of';

export type GraphLayoutPreset =
  | 'artist-universe'
  | 'album-cluster'
  | 'tag-constellation'
  | 'maynard-universe'
  | 'emotional-similarity'
  | 'lyrical-dna';

/** Which genre score set to use for song positioning in Cinema genre-radar layout.
 *  No longer used for building visible graph nodes — genre nodes have been removed. */
export type GenreSource = 'ai' | 'community' | 'priority';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: {
    bandId?: string;
    albumId?: string;
    bandName?: string;
    albumTitle?: string;
    albumType?: string;
    scores?: Record<string, number>;
    color?: string;
    size?: number;
    count?: number;
    imageUrl?: string;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;    // 0–1
  label?: string;
  description?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  preset: GraphLayoutPreset;
  label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<NodeType, string> = {
  song:     '#6366f1',
  album:    '#8b5cf6',
  artist:   '#f59e0b',
  theme:    '#10b981',
  tag:      '#06b6d4',
  keyword:  '#64748b',
  emotion:  '#ec4899',
};

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
}

function tokenize(text: string): string[] {
  const STOP = new Set(['the','a','an','and','or','in','on','at','to','for','of',
    'with','by','is','was','are','be','i','you','he','she','it','we','they',
    'my','your','his','its','not','no','so','than','very','just','let','s','t']);
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

function songNode(s: {
  id: string; title: string;
  band: { id: string; name: string };
  album: { id: string; title: string } | null;
  score: { aggression: number; complexity: number; atmosphere: number;
           emotion: number; psychedelic: number; concept: number } | null;
  isRemix?: boolean;
  remixOfSongId?: string | null;
}): GraphNode {
  return {
    id: `song:${s.id}`,
    type: 'song',
    label: s.title,
    data: {
      bandId: s.band.id,
      bandName: s.band.name,
      ...(s.album ? { albumId: s.album.id, albumTitle: s.album.title } : {}),
      ...(s.score ? { scores: {
        aggression: s.score.aggression, complexity: s.score.complexity,
        atmosphere: s.score.atmosphere, emotion: s.score.emotion,
        psychedelic: s.score.psychedelic, concept: s.score.concept,
      } } : {}),
      color: NODE_COLORS.song,
      ...(s.isRemix ? { isRemix: true } : {}),
      ...(s.remixOfSongId ? { remixOfSongId: s.remixOfSongId } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Shared DB query for songs with all relations
// ---------------------------------------------------------------------------

async function fetchSongs(filter: {
  bandIds?: string[];
  albumId?: string;
  albumTypes?: string[];
  limit?: number;
}) {
  const { bandIds, albumId, albumTypes, limit = 200 } = filter;
  return prisma.song.findMany({
    where: {
      ...(bandIds?.length && { bandId: { in: bandIds } }),
      ...(albumId && { albumId }),
      ...(albumTypes?.length && {
        OR: [
          { album: { albumType: { in: albumTypes as any[] } } },
          // Songs with no album are always included
          { albumId: null },
        ],
      }),
    },
    include: {
      band: { select: { id: true, name: true, logoUrl: true } },
      album: { select: { id: true, title: true, artworkUrl: true, albumType: true, year: true } },
      score: true,
      songTags: { include: { tag: true } },
      aiAnalysis: { select: { themes: true } },
      lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
    },
    take: limit,
    orderBy: { title: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Layout: artist-universe
// ---------------------------------------------------------------------------

async function buildArtistUniverse(bandIds: string[], albumTypes?: string[], nodeLimit?: number): Promise<GraphData> {
  const limit = Math.max(100, Math.min(nodeLimit ?? 600, 3000));
  const songs = await fetchSongs({ bandIds, limit, ...(albumTypes?.length ? { albumTypes } : {}) });

  if (!songs.length) {
    return { nodes: [], edges: [], preset: 'artist-universe', label: 'Artist Universe' };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const bandSet   = new Map<string, { name: string; logoUrl?: string | null }>();  // bandId → info
  const albumSet  = new Map<string, { title: string; artworkUrl?: string | null; albumType?: string | null; year?: number | null }>(); // albumId → info
  const albumBandMap = new Map<string, string>();    // albumId → bandId
  const tagSet = new Map<string, string>();          // tagId → name
  // Note: Theme nodes removed from artist-universe — Tags carry the same data
  // since the AI analysis batch now writes to both SongTag and aiAnalysis.themes.
  // Tag-constellation preset uses SongTag for its dedicated grouped view.
  let edgeIdx = 0;

  for (const s of songs) {
    nodes.push(songNode(s));
    bandSet.set(s.band.id, { name: s.band.name, logoUrl: s.band.logoUrl });
    if (s.album) {
      albumSet.set(s.album.id, { title: s.album.title, artworkUrl: s.album.artworkUrl, albumType: s.album.albumType, year: s.album.year });
      albumBandMap.set(s.album.id, s.band.id);
    }

    // song → album (or song → artist when no album)
    if (s.album) {
      edges.push({
        id: `e${edgeIdx++}`, source: `song:${s.id}`,
        target: `album:${s.album.id}`, type: 'same_album', weight: 0.9,
      });
    } else {
      // Albumless songs connect directly to their artist
      edges.push({
        id: `e${edgeIdx++}`, source: `song:${s.id}`,
        target: `artist:${s.band.id}`, type: 'same_artist', weight: 0.7,
      });
    }

    // song → tag
    for (const st of s.songTags) {
      tagSet.set(st.tag.id, st.tag.name);
      edges.push({
        id: `e${edgeIdx++}`, source: `song:${s.id}`,
        target: `tag:${st.tag.id}`, type: 'shared_tag', weight: 0.6,
        ...(st.description ? { description: st.description } : {}),
      });
    }

    // remix → original song
    if (s.isRemix && s.remixOfSongId) {
      edges.push({
        id: `e${edgeIdx++}`, source: `song:${s.id}`,
        target: `song:${s.remixOfSongId}`, type: 'remix_of', weight: 0.8,
      });
    }

  }

  // Artist nodes
  for (const [id, info] of bandSet) {
    const songCount = songs.filter((s) => s.band.id === id).length;
    nodes.push({ id: `artist:${id}`, type: 'artist', label: info.name,
      data: {
        color: NODE_COLORS.artist,
        size: Math.min(60, 20 + songCount * 3),
        ...(info.logoUrl ? { imageUrl: info.logoUrl } : {}),
      },
    });
  }

  // Album nodes + album → artist edges (clean 3-tier hierarchy)
  for (const [id, info] of albumSet) {
    nodes.push({ id: `album:${id}`, type: 'album', label: info.title,
      data: {
        color: NODE_COLORS.album,
        ...(info.artworkUrl ? { imageUrl: info.artworkUrl } : {}),
        ...(info.albumType ? { albumType: info.albumType } : {}),
        ...(info.year != null ? { year: info.year } : {}),
      },
    });
    const bandId = albumBandMap.get(id);
    if (bandId) {
      edges.push({
        id: `e${edgeIdx++}`, source: `album:${id}`,
        target: `artist:${bandId}`, type: 'same_artist', weight: 1,
      });
    }
  }

  // Tag nodes (only tags shared by ≥ 2 songs)
  const tagUsage = new Map<string, number>();
  for (const s of songs) {
    for (const st of s.songTags) {
      tagUsage.set(st.tag.id, (tagUsage.get(st.tag.id) ?? 0) + 1);
    }
  }
  for (const [id, name] of tagSet) {
    if ((tagUsage.get(id) ?? 0) >= 2) {
      nodes.push({ id: `tag:${id}`, type: 'tag', label: name,
        data: { color: NODE_COLORS.tag, count: tagUsage.get(id)! } });
    } else {
      // Remove edges for singleton tags
      const pruned = edges.filter(
        (e) => !(e.type === 'shared_tag' && e.target === `tag:${id}`),
      );
      edges.length = 0;
      edges.push(...pruned);
    }
  }

  const bandNames = [...bandSet.values()].map(b => b.name).join(', ');
  return { nodes, edges, preset: 'artist-universe', label: `Artist Universe: ${bandNames}` };
}

// ---------------------------------------------------------------------------
// Layout: album-cluster
// ---------------------------------------------------------------------------

async function buildAlbumCluster(albumId: string): Promise<GraphData> {
  const songs = await fetchSongs({ albumId });
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: { band: { select: { id: true, name: true } } },
  });

  if (!songs.length || !album) {
    return { nodes: [], edges: [], preset: 'album-cluster', label: 'Album Cluster' };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const tagSet = new Map<string, string>();
  let edgeIdx = 0;

  // Central album node
  nodes.push({
    id: `album:${albumId}`, type: 'album',
    label: `${album.title}\n${album.band.name}`,
    data: { color: NODE_COLORS.album, size: 60 },
  });

  for (const s of songs) {
    nodes.push(songNode(s));
    edges.push({
      id: `e${edgeIdx++}`, source: `song:${s.id}`,
      target: `album:${albumId}`, type: 'same_album', weight: 1,
    });

    for (const st of s.songTags) {
      tagSet.set(st.tag.id, st.tag.name);
      edges.push({
        id: `e${edgeIdx++}`, source: `song:${s.id}`,
        target: `tag:${st.tag.id}`, type: 'shared_tag', weight: 0.6,
        ...(st.description ? { description: st.description } : {}),
      });
    }
    // Theme nodes removed — Tags carry the same data after the merged AI batch.
    // tag-constellation preset handles its own tag-hub graph separately.
  }

  // Tag nodes
  for (const [id, name] of tagSet) {
    nodes.push({ id: `tag:${id}`, type: 'tag', label: name,
      data: { color: NODE_COLORS.tag } });
  }

  return {
    nodes, edges, preset: 'album-cluster',
    label: `${album.title} — ${album.band.name}`,
  };
}

// ---------------------------------------------------------------------------
// Layout: tag-constellation
// ---------------------------------------------------------------------------

async function buildTagConstellation(bandIds: string[]): Promise<GraphData> {
  const songs = await fetchSongs({ bandIds, limit: 200 });
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const tagMap = new Map<string, { count: number; songs: string[] }>();
  let edgeIdx = 0;

  for (const s of songs) {
    nodes.push(songNode(s));
    for (const st of s.songTags) {
      const key = st.tag.name.toLowerCase().trim();
      const entry = tagMap.get(key) ?? { count: 0, songs: [] };
      entry.count += 1;
      entry.songs.push(s.id);
      tagMap.set(key, entry);
      edges.push({
        id: `e${edgeIdx++}`, source: `song:${s.id}`,
        target: `tag:${key}`, type: 'shared_tag', weight: 0.8,
        ...(st.description ? { description: st.description } : {}),
      });
    }
  }

  // Tag nodes — sized by how many songs use them
  for (const [key, { count }] of tagMap) {
    if (count >= 1) {
      nodes.push({
        id: `tag:${key}`, type: 'tag', label: key,
        data: { color: NODE_COLORS.tag, size: Math.min(50, 15 + count * 5), count },
      });
    }
  }

  const bandNames = [...new Set(songs.map((s) => s.band.name))].join(', ');
  return { nodes, edges, preset: 'tag-constellation', label: `Tag Constellation: ${bandNames}` };
}

// ---------------------------------------------------------------------------
// Layout: maynard-universe (or any artist grouping by search)
// ---------------------------------------------------------------------------

async function buildMaynardUniverse(): Promise<GraphData> {
  const maynardNames = ['tool', 'a perfect circle', 'puscifer', 'maynard'];
  const allBands = await prisma.band.findMany({ select: { id: true, name: true } });
  const maynardBands = allBands.filter((b) =>
    maynardNames.some((n) => b.name.toLowerCase().includes(n)),
  );

  // Fallback: use all bands if none match (band-agnostic)
  const targetBands = maynardBands.length > 0 ? maynardBands : allBands;
  const bandIds = targetBands.map((b) => b.id);
  const result = await buildArtistUniverse(bandIds);

  const label = maynardBands.length > 0
    ? `Maynard Universe: ${maynardBands.map((b) => b.name).join(' · ')}`
    : `Full Artist Universe`;

  return { ...result, preset: 'maynard-universe', label };
}

// ---------------------------------------------------------------------------
// Layout: emotional-similarity
// ---------------------------------------------------------------------------

async function buildEmotionalSimilarity(bandIds: string[]): Promise<GraphData> {
  const songs = await fetchSongs({ bandIds, limit: 150 });
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let edgeIdx = 0;

  const scoredSongs = songs.filter((s) => s.score);

  for (const s of scoredSongs) {
    nodes.push(songNode(s));
  }

  // Connect songs with cosine similarity > 0.90 on radar profile
  const THRESHOLD = 0.90;
  for (let i = 0; i < scoredSongs.length; i++) {
    for (let j = i + 1; j < scoredSongs.length; j++) {
      const si = scoredSongs[i]!;
      const sj = scoredSongs[j]!;
      if (!si.score || !sj.score) continue;

      const vi = [si.score.aggression, si.score.complexity, si.score.atmosphere,
                  si.score.emotion, si.score.psychedelic, si.score.concept];
      const vj = [sj.score.aggression, sj.score.complexity, sj.score.atmosphere,
                  sj.score.emotion, sj.score.psychedelic, sj.score.concept];

      const sim = cosineSim(vi, vj);
      if (sim >= THRESHOLD) {
        edges.push({
          id: `e${edgeIdx++}`, source: `song:${si.id}`,
          target: `song:${sj.id}`, type: 'similar_radar',
          weight: Math.round(sim * 100) / 100,
        });
      }
    }
  }

  // Add emotion dimension nodes as anchors
  const EMOTION_DIMS: { key: string; label: string }[] = [
    { key: 'aggression', label: 'Aggressive' },
    { key: 'atmosphere', label: 'Atmospheric' },
    { key: 'emotion', label: 'Emotional' },
    { key: 'psychedelic', label: 'Psychedelic' },
    { key: 'concept', label: 'Conceptual' },
  ];
  for (const dim of EMOTION_DIMS) {
    nodes.push({
      id: `emotion:${dim.key}`, type: 'emotion', label: dim.label,
      data: { color: NODE_COLORS.emotion, size: 40 },
    });
  }

  // Connect songs to their strongest emotion dimension
  for (const s of scoredSongs) {
    if (!s.score) continue;
    const scoreObj: Record<string, number> = {
      aggression: s.score.aggression, atmosphere: s.score.atmosphere,
      emotion: s.score.emotion, psychedelic: s.score.psychedelic, concept: s.score.concept,
    };
    const dominant = Object.entries(scoreObj).sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[1] > 6) {
      edges.push({
        id: `e${edgeIdx++}`, source: `song:${s.id}`,
        target: `emotion:${dominant[0]}`, type: 'similar_radar',
        weight: dominant[1] / 10,
      });
    }
  }

  const bandNames = [...new Set(songs.map((s) => s.band.name))].join(', ');
  return { nodes, edges, preset: 'emotional-similarity', label: `Emotional Map: ${bandNames}` };
}

// ---------------------------------------------------------------------------
// Layout: lyrical-dna
// ---------------------------------------------------------------------------

async function buildLyricalDna(bandIds: string[]): Promise<GraphData> {
  const songs = await fetchSongs({ bandIds, limit: 100 });
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let edgeIdx = 0;

  // Build keyword sets per song
  type SongWithKeywords = { id: string; title: string; band: { id: string; name: string };
    album: { id: string; title: string } | null;
    score: { aggression: number; complexity: number; atmosphere: number;
             emotion: number; psychedelic: number; concept: number } | null;
    keywords: Set<string> };

  const songsWithKw: SongWithKeywords[] = [];
  const keywordCounts = new Map<string, number>();

  for (const s of songs) {
    const text = s.lyrics[0]?.text ?? '';
    const tokens = tokenize(text);
    // Use ALL unique content words — the ≥2-songs shared filter below keeps the
    // graph manageable. A top-N cutoff was the cause of words like "fall" being
    // present in a song's lyrics but missing from its keyword set.
    const topKw = new Set(tokens);
    songsWithKw.push({ ...s, keywords: topKw });
    for (const kw of topKw) keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
  }

  // Only show keywords that appear in ≥ 2 songs
  const sharedKeywords = new Set(
    [...keywordCounts.entries()].filter(([, c]) => c >= 2).map(([w]) => w),
  );

  const keywordNodes = new Map<string, boolean>();

  for (const s of songsWithKw) {
    nodes.push(songNode(s));
    for (const kw of s.keywords) {
      if (sharedKeywords.has(kw)) {
        if (!keywordNodes.has(kw)) {
          keywordNodes.set(kw, true);
          nodes.push({
            id: `kw:${kw}`, type: 'keyword', label: kw,
            data: { color: NODE_COLORS.keyword, count: keywordCounts.get(kw)! },
          });
        }
        edges.push({
          id: `e${edgeIdx++}`, source: `song:${s.id}`,
          target: `kw:${kw}`, type: 'shared_word', weight: 0.5,
        });
      }
    }
  }

  const bandNames = [...new Set(songs.map((s) => s.band.name))].join(', ');
  return { nodes, edges, preset: 'lyrical-dna', label: `Lyrical DNA: ${bandNames}` };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function buildGraph(
  preset: GraphLayoutPreset,
  params: { bandIds?: string[]; albumId?: string; genreSource?: GenreSource; albumTypes?: string[]; nodeLimit?: number },
): Promise<GraphData> {
  const { bandIds = [], albumId, albumTypes, nodeLimit } = params;

  switch (preset) {
    case 'artist-universe':
      return buildArtistUniverse(bandIds, albumTypes, nodeLimit);

    case 'album-cluster':
      if (!albumId) throw Object.assign(new Error('albumId required for album-cluster'), { statusCode: 400 });
      return buildAlbumCluster(albumId);

    case 'tag-constellation':
      return buildTagConstellation(bandIds);

    case 'maynard-universe':
      return buildMaynardUniverse();

    case 'emotional-similarity':
      return buildEmotionalSimilarity(bandIds);

    case 'lyrical-dna':
      return buildLyricalDna(bandIds);

    default:
      throw Object.assign(new Error(`Unknown preset: ${preset}`), { statusCode: 400 });
  }
}

// List available bands + albums for selector
export async function listScopeOptions() {
  const [bands, albums] = await Promise.all([
    prisma.band.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.album.findMany({
      select: { id: true, title: true, year: true, band: { select: { id: true, name: true } } },
      orderBy: [{ band: { name: 'asc' } }, { year: 'asc' }],
    }),
  ]);
  return { bands, albums };
}

export { NODE_COLORS };

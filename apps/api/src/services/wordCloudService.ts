/**
 * Word Cloud Service — aggregates lyric frequency, AI themes, and tags
 * into a weighted word list suitable for visual display.
 *
 * Weight formula: 0.55 * freq_norm + 0.30 * theme_boost + 0.15 * tag_boost
 */

import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudScope = 'song' | 'album' | 'artist' | 'universe';

export interface CloudWord {
  text: string;
  weight: number;           // 0–100
  frequency: number;        // raw occurrence count
  themeBoost: number;       // 0–1 from AI theme presence
  tagBoost: number;         // 0–1 from tag matches
  songs: { id: string; title: string; band: string }[];
}

export interface WordCloudData {
  words: CloudWord[];
  scope: CloudScope;
  label: string;
  totalTokens: number;
  uniqueWords: number;
}

// ---------------------------------------------------------------------------
// Stopwords (extend from DB custom_stopwords)
// ---------------------------------------------------------------------------

const BUILTIN_STOPWORDS = new Set([
  // Articles, conjunctions, prepositions
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','as','about','into','through','if','because','so','than',
  // Auxiliary / copula verbs
  'is','was','are','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  // Pronouns and possessives
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their',
  // Demonstratives / interrogatives / quantifiers
  'this','that','these','those',
  'what','which','who','when','where','how',
  'all','each','every','both','more','most','other','some','such',
  'no','not','only','same','too','very','just',
  // Discourse / filler (non-semantic in lyrics context)
  'then','there','here','up','out',
  // Numbers as words
  'one','two','three',
  // Tokenizer fragments (apostrophe splits)
  's','t','re','don','didn','doesn','won','wouldn',
  // Informal / contracted forms
  'im','its','youre','thats','dont','cant','wont','isnt',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')   // strip [bracketed annotations]
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length >= 3 && !BUILTIN_STOPWORDS.has(w));
}

async function getCustomStopwords(): Promise<Set<string>> {
  const rows = await prisma.customStopword.findMany({ select: { word: true } });
  return new Set(rows.map((r) => r.word.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchSongIds(scope: CloudScope, id: string): Promise<string[]> {
  switch (scope) {
    case 'song':
      return [id];

    case 'album': {
      const songs = await prisma.song.findMany({
        where: { albumId: id },
        select: { id: true },
      });
      return songs.map((s) => s.id);
    }

    case 'artist': {
      // id may be a single bandId or comma-separated list for multi-band clouds
      const ids = id.split(',').map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return [];
      const songs = await prisma.song.findMany({
        where: { bandId: { in: ids } },
        select: { id: true },
      });
      return songs.map((s) => s.id);
    }

    case 'universe':
    default: {
      const songs = await prisma.song.findMany({ select: { id: true } });
      return songs.map((s) => s.id);
    }
  }
}

async function getScopeLabel(scope: CloudScope, id: string): Promise<string> {
  switch (scope) {
    case 'song': {
      const s = await prisma.song.findUnique({
        where: { id },
        include: { band: true },
      });
      return s ? `${s.title} — ${s.band.name}` : id;
    }
    case 'album': {
      const a = await prisma.album.findUnique({
        where: { id },
        include: { band: true },
      });
      return a ? `${a.title} — ${a.band.name}` : id;
    }
    case 'artist': {
      const ids = id.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return 'Artist';
      const bands = await prisma.band.findMany({
        where: { id: { in: ids } },
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      return bands.map((b) => b.name).join(' + ');
    }
    case 'universe':
      return 'All Songs';
  }
}

// ---------------------------------------------------------------------------
// Build word cloud data
// ---------------------------------------------------------------------------

export async function buildWordCloud(
  scope: CloudScope,
  id: string,
  opts: {
    limit?: number;
    minFreq?: number;
    maxFreqFilter?: number;
    includeLyrics?: boolean;
    includeThemes?: boolean;
    includeTags?: boolean;
  } = {},
): Promise<WordCloudData> {
  const {
    limit = 120,
    minFreq = 2,
    maxFreqFilter,
    includeLyrics = true,
    includeThemes = true,
    includeTags = true,
  } = opts;

  const customStopwords = await getCustomStopwords();
  const songIds = await fetchSongIds(scope, id);
  const label = await getScopeLabel(scope, id);

  if (songIds.length === 0) {
    return { words: [], scope, label, totalTokens: 0, uniqueWords: 0 };
  }

  // ── Fetch all the data we need in parallel (skip disabled sources) ─────────
  const [lyrics, songMeta, aiAnalyses, tags] = await Promise.all([
    includeLyrics
      ? prisma.lyric.findMany({
          where: { songId: { in: songIds }, isPrimary: true },
          select: { songId: true, text: true },
        })
      : Promise.resolve([]),
    prisma.song.findMany({
      where: { id: { in: songIds } },
      select: { id: true, title: true, band: { select: { name: true } } },
    }),
    includeThemes
      ? prisma.songAiAnalysis.findMany({
          where: { songId: { in: songIds } },
          select: { songId: true, themes: true },
        })
      : Promise.resolve([]),
    includeTags
      ? prisma.songTag.findMany({
          where: { songId: { in: songIds } },
          include: { tag: true, song: { select: { id: true, title: true, band: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  const songById = new Map(songMeta.map((s) => [s.id, s]));

  // ── Word frequency across all songs ──────────────────────────────────────
  // Map: word → { totalFreq, songsSet }
  const wordFreq = new Map<string, { freq: number; songIds: Set<string> }>();
  let totalTokens = 0;

  for (const lyric of lyrics) {
    const tokens = tokenize(lyric.text).filter((w) => !customStopwords.has(w));
    totalTokens += tokens.length;
    for (const token of tokens) {
      const entry = wordFreq.get(token) ?? { freq: 0, songIds: new Set() };
      entry.freq += 1;
      entry.songIds.add(lyric.songId);
      wordFreq.set(token, entry);
    }
  }

  // ── AI theme boost ────────────────────────────────────────────────────────
  const themeWords = new Map<string, number>(); // word → occurrence count across songs
  for (const analysis of aiAnalyses) {
    const themes = analysis.themes as string[] | null ?? [];
    for (const theme of themes) {
      const tokens = tokenize(theme).filter((w) => !customStopwords.has(w));
      for (const t of tokens) {
        themeWords.set(t, (themeWords.get(t) ?? 0) + 1);
      }
    }
  }
  const maxThemeCount = Math.max(1, ...themeWords.values());

  // ── Tag boost ─────────────────────────────────────────────────────────────
  const tagWordMap = new Map<string, { count: number; songIds: Set<string> }>();
  for (const st of tags) {
    const tagTokens = tokenize(st.tag.name).filter((w) => !customStopwords.has(w));
    for (const t of tagTokens) {
      const entry = tagWordMap.get(t) ?? { count: 0, songIds: new Set() };
      entry.count += 1;
      entry.songIds.add(st.song.id);
      tagWordMap.set(t, entry);
    }
    // Also add the full tag slug if short (≤ 2 words)
    const fullTag = st.tag.name.toLowerCase().trim();
    if (!BUILTIN_STOPWORDS.has(fullTag) && !customStopwords.has(fullTag) && fullTag.length >= 3) {
      const entry = tagWordMap.get(fullTag) ?? { count: 0, songIds: new Set() };
      entry.count += 1;
      entry.songIds.add(st.song.id);
      tagWordMap.set(fullTag, entry);
    }
  }
  const maxTagCount = Math.max(1, ...([...tagWordMap.values()].map((e) => e.count)));

  // ── Combine all candidate words ───────────────────────────────────────────
  // Union of enabled source words
  const allWords = new Set([
    ...(includeLyrics ? wordFreq.keys() : []),
    ...(includeThemes ? themeWords.keys() : []),
    ...(includeTags ? tagWordMap.keys() : []),
  ]);

  const maxFreqNorm = Math.max(1, ...([...wordFreq.values()].map((e) => e.freq)));

  const results: CloudWord[] = [];

  for (const word of allWords) {
    const freqEntry = wordFreq.get(word);
    const freq = freqEntry?.freq ?? 0;

    if (freq < minFreq && !themeWords.has(word) && !tagWordMap.has(word)) continue;
    // Max frequency filter: skip words that appear too often (for rare-word analysis)
    if (maxFreqFilter !== undefined && maxFreqFilter > 0 && freq > maxFreqFilter) continue;

    const freqNorm = includeLyrics ? freq / maxFreqNorm : 0;
    const themeBoost = includeThemes ? (themeWords.get(word) ?? 0) / maxThemeCount : 0;
    const tagBoost = includeTags ? ((tagWordMap.get(word)?.count ?? 0)) / maxTagCount : 0;

    const weight = Math.round(
      (freqNorm * 0.55 + themeBoost * 0.30 + tagBoost * 0.15) * 100,
    );

    if (weight < 2) continue;

    // Song associations
    const songIdsForWord = new Set<string>([
      ...(freqEntry?.songIds ?? []),
      ...(tagWordMap.get(word)?.songIds ?? []),
    ]);

    const songList = [...songIdsForWord]
      .map((sid) => songById.get(sid))
      .filter(Boolean)
      .map((s) => ({ id: s!.id, title: s!.title, band: s!.band.name }));

    results.push({ text: word, weight, frequency: freq, themeBoost, tagBoost, songs: songList });
  }

  // Sort by weight desc, take top N
  results.sort((a, b) => b.weight - a.weight);
  const topWords = results.slice(0, limit);

  return {
    words: topWords,
    scope,
    label,
    totalTokens,
    uniqueWords: wordFreq.size,
  };
}

// ---------------------------------------------------------------------------
// Word clusters — find groups of words that co-appear across the most songs
// ---------------------------------------------------------------------------

export interface WordCluster {
  words: string[];
  songs: { id: string; title: string; band: string; albumTitle: string | null }[];
  songCount: number;
  wordCount: number;
  score: number; // songCount * wordCount — primary sort key
}

export interface WordClustersResult {
  clusters: WordCluster[];
  totalSongs: number;
  candidateWords: number; // how many words were searched
}

export async function findWordClusters(
  opts: {
    bandIds?: string[];
    minSongs?: number;
    maxSongs?: number;    // upper bound: skip clusters shared by more songs than this
    minWords?: number;    // minimum word group size to emit (default 2)
    maxGroupSize?: number;
    topN?: number;
    vocabLimit?: number; // max candidate words to consider — guards perf
    excludeWords?: string[];     // remove these words from candidates entirely
    requireCrossBand?: boolean;  // only emit clusters spanning ≥2 bands
    requireCrossAlbum?: boolean; // only emit clusters spanning ≥2 albums
  } = {},
): Promise<WordClustersResult> {
  const {
    bandIds,
    minSongs = 3,
    maxSongs,
    minWords = 2,
    maxGroupSize = 4,
    topN = 25,
    vocabLimit = 70,
    excludeWords,
    requireCrossBand = false,
    requireCrossAlbum = false,
  } = opts;

  const customStopwords = await getCustomStopwords();

  // Fetch primary lyrics for selected bands
  const lyrics = await prisma.lyric.findMany({
    where: {
      isPrimary: true,
      ...(bandIds?.length ? { song: { bandId: { in: bandIds } } } : {}),
    },
    select: {
      text: true,
      song: {
        select: {
          id: true, title: true,
          band:  { select: { name: true } },
          album: { select: { title: true } },
        },
      },
    },
  });

  if (lyrics.length === 0) return { clusters: [], totalSongs: 0, candidateWords: 0 };

  // Build per-song word sets and metadata
  const songWordSets = new Map<string, Set<string>>();
  const songMeta = new Map<string, { id: string; title: string; band: string; albumTitle: string | null }>();

  for (const lyric of lyrics) {
    const words = tokenize(lyric.text).filter((w) => !customStopwords.has(w));
    const set = songWordSets.get(lyric.song.id) ?? new Set<string>();
    for (const w of words) set.add(w);
    songWordSets.set(lyric.song.id, set);
    if (!songMeta.has(lyric.song.id)) {
      songMeta.set(lyric.song.id, {
        id: lyric.song.id,
        title: lyric.song.title,
        band: lyric.song.band.name,
        albumTitle: lyric.song.album?.title ?? null,
      });
    }
  }

  const totalSongs = songWordSets.size;

  // Build inverted index: word → Set<songId>
  const wordToSongs = new Map<string, Set<string>>();
  for (const [songId, words] of songWordSets) {
    for (const word of words) {
      const set = wordToSongs.get(word) ?? new Set<string>();
      set.add(songId);
      wordToSongs.set(word, set);
    }
  }

  // Candidate words: appear in ≥ minSongs songs, not in the exclude list, limited by vocabLimit
  const excludeSet = new Set((excludeWords ?? []).map((w) => w.toLowerCase()));
  const candidates: string[] = [...wordToSongs.entries()]
    .filter(([w, s]) => s.size >= minSongs && !excludeSet.has(w))
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, vocabLimit)
    .map(([w]) => w);

  if (candidates.length < 2) {
    return { clusters: [], totalSongs, candidateWords: candidates.length };
  }

  // Intersection helper — always iterates the smaller set
  function intersect(a: Set<string>, b: Set<string>): Set<string> {
    const result = new Set<string>();
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const id of small) { if (large.has(id)) result.add(id); }
    return result;
  }

  function buildSongList(ids: Set<string>) {
    return [...ids]
      .map((id) => songMeta.get(id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .sort((a, b) => a.band.localeCompare(b.band) || a.title.localeCompare(b.title));
  }

  // Iterative bottom-up layer expansion
  // Each layer entry: { words, songIds, candidateStartIdx }
  interface Layer { words: string[]; songIds: Set<string>; startIdx: number }

  const allResults: WordCluster[] = [];

  // Layer 1: single candidate words (just scaffolding — not emitted)
  let currentLayer: Layer[] = candidates.map((w, i) => ({
    words: [w],
    songIds: wordToSongs.get(w)!,
    startIdx: i + 1,
  }));

  for (let size = 2; size <= maxGroupSize; size++) {
    const nextLayer: Layer[] = [];

    for (const cluster of currentLayer) {
      for (let i = cluster.startIdx; i < candidates.length; i++) {
        const nextWord = candidates[i]!;
        const nextSongs = wordToSongs.get(nextWord);
        if (!nextSongs) continue;
        const coSongs = intersect(cluster.songIds, nextSongs);
        if (coSongs.size < minSongs) continue;

        const newWords = [...cluster.words, nextWord];

        // Emit only when within bounds — still expand regardless so narrower
        // sub-groups can qualify even if a parent cluster was too common / too big.
        if (newWords.length >= minWords && (maxSongs === undefined || coSongs.size <= maxSongs)) {
          // Diversity guard: check band/album spread across the matched songs
          let diversityOk = true;
          if (requireCrossBand || requireCrossAlbum) {
            const bandSet  = new Set<string>();
            const albumSet = new Set<string>();
            for (const id of coSongs) {
              const meta = songMeta.get(id);
              if (meta) {
                bandSet.add(meta.band);
                if (meta.albumTitle) albumSet.add(meta.albumTitle);
              }
            }
            if (requireCrossBand  && bandSet.size  < 2) diversityOk = false;
            if (requireCrossAlbum && albumSet.size < 2) diversityOk = false;
          }
          if (diversityOk) {
            const songs = buildSongList(coSongs);
            allResults.push({
              words: newWords,
              songs,
              songCount: songs.length,
              wordCount: newWords.length,
              score: songs.length * newWords.length,
            });
          }
        }

        nextLayer.push({ words: newWords, songIds: coSongs, startIdx: i + 1 });
      }
    }

    currentLayer = nextLayer;
    if (currentLayer.length === 0) break;
  }

  // Sort: highest score first, then most songs, then most words
  allResults.sort((a, b) =>
    b.score - a.score || b.songCount - a.songCount || b.wordCount - a.wordCount,
  );

  return {
    clusters: allResults.slice(0, topN),
    totalSongs,
    candidateWords: candidates.length,
  };
}

// ---------------------------------------------------------------------------
// Word lookup — find every song whose lyrics contain a given word/phrase
// ---------------------------------------------------------------------------

export interface WordLookupResult {
  word: string;
  songs: { id: string; title: string; band: string; albumTitle: string | null }[];
}

export async function lookupWordInSongs(
  word: string,
  opts: { bandIds?: string[] } = {},
): Promise<WordLookupResult> {
  const { bandIds } = opts;
  const customStopwords = await getCustomStopwords();

  // Tokenize the query so stopwords + punctuation are handled the same way as lyrics
  const searchTokens = tokenize(word).filter((w) => !customStopwords.has(w));
  if (searchTokens.length === 0) return { word, songs: [] };

  const lyrics = await prisma.lyric.findMany({
    where: {
      isPrimary: true,
      ...(bandIds?.length ? { song: { bandId: { in: bandIds } } } : {}),
    },
    select: {
      text: true,
      song: {
        select: {
          id: true,
          title: true,
          band: { select: { name: true } },
          album: { select: { title: true } },
        },
      },
    },
  });

  const matchingSongs: { id: string; title: string; band: string; albumTitle: string | null }[] = [];

  for (const lyric of lyrics) {
    const tokenSet = new Set(tokenize(lyric.text).filter((w) => !customStopwords.has(w)));
    if (searchTokens.every((t) => tokenSet.has(t))) {
      matchingSongs.push({
        id: lyric.song.id,
        title: lyric.song.title,
        band: lyric.song.band.name,
        albumTitle: lyric.song.album?.title ?? null,
      });
    }
  }

  matchingSongs.sort((a, b) => a.band.localeCompare(b.band) || a.title.localeCompare(b.title));
  return { word: searchTokens.join(' '), songs: matchingSongs };
}

// ---------------------------------------------------------------------------
// Song similarity — find songs sharing the most words with a seed song
// ---------------------------------------------------------------------------

export interface SimilarSong {
  song: { id: string; title: string; band: string; albumTitle: string | null };
  sharedWords: string[];
  sharedCount: number;
  seedWordCount: number;
  targetWordCount: number;
}

export interface SimilarSongsResult {
  seed: { id: string; title: string; band: string };
  similar: SimilarSong[];
}

export async function findSimilarSongs(
  seedSongId: string,
  opts: { limit?: number; bandIds?: string[]; minShared?: number } = {},
): Promise<SimilarSongsResult> {
  const { limit = 30, bandIds, minShared = 3 } = opts;

  const seed = await prisma.song.findUnique({
    where: { id: seedSongId },
    include: { band: true },
  });
  if (!seed) throw new Error('Song not found');

  // All other songs that have primary lyrics, optionally filtered by band
  const candidateSongs = await prisma.song.findMany({
    where: {
      id:       { not: seedSongId },
      lyrics:   { some: { isPrimary: true } },
      ...(bandIds?.length ? { bandId: { in: bandIds } } : {}),
    },
    select: {
      id: true, title: true,
      band:  { select: { name: true } },
      album: { select: { title: true } },
    },
  });

  // Load lyrics for seed + candidates in one query
  const allIds = [seedSongId, ...candidateSongs.map((s) => s.id)];
  const [allLyrics, customStopwords] = await Promise.all([
    prisma.lyric.findMany({
      where: { songId: { in: allIds }, isPrimary: true },
      select: { songId: true, text: true },
    }),
    getCustomStopwords(),
  ]);

  // Build unique-word sets per song (use Set to avoid double-counting same word)
  const songWordSets = new Map<string, Set<string>>();
  for (const lyric of allLyrics) {
    const words = tokenize(lyric.text).filter((w) => !customStopwords.has(w));
    const set = songWordSets.get(lyric.songId) ?? new Set<string>();
    for (const w of words) set.add(w);
    songWordSets.set(lyric.songId, set);
  }

  const seedWords = songWordSets.get(seedSongId) ?? new Set<string>();
  const seedWordCount = seedWords.size;

  // Intersect seed word set with each candidate
  const similar: SimilarSong[] = [];
  for (const song of candidateSongs) {
    const targetWords = songWordSets.get(song.id);
    if (!targetWords || targetWords.size === 0) continue;

    const shared: string[] = [];
    for (const w of seedWords) {
      if (targetWords.has(w)) shared.push(w);
    }
    if (shared.length < minShared) continue;

    similar.push({
      song: {
        id:         song.id,
        title:      song.title,
        band:       song.band.name,
        albumTitle: song.album?.title ?? null,
      },
      sharedWords:     shared.sort(),
      sharedCount:     shared.length,
      seedWordCount,
      targetWordCount: targetWords.size,
    });
  }

  similar.sort((a, b) => b.sharedCount - a.sharedCount);

  return {
    seed: { id: seed.id, title: seed.title, band: seed.band.name },
    similar: similar.slice(0, limit),
  };
}

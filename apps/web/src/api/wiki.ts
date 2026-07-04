// Music Wiki API client — types and fetch helpers.
import { api } from '../lib/api';
import type { SongHealth, AggregateHealth, SongMedia } from '@band-spectrum-mapper/shared';

export type { SongHealth, AggregateHealth, SongMedia };

export type WikiBand = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
};

export type WikiAlbumSummary = {
  id: string;
  title: string;
  slug: string;
  year: number | null;
  albumType: string | null;
  artworkUrl: string | null;
  _count: { songs: number };
};

export type WikiSongSummary = {
  id: string;
  title: string;
  slug: string;
  rarity: string;
  band: { slug: string; name: string };
  album: { slug: string; title: string; year: number | null } | null;
};

export type WikiMember = {
  id: string;
  name: string;
  role: string | null;
  bandId: string;
  visualNotes: string | null;
};

export type WikiSongProfile = {
  totalPerformances: number;
  liveStatus: string;
  rarityIndex: number;
  performancePct: number;
  firstPerformanceDate: string | null;
  lastPerformanceDate: string | null;
  yearsSincePlayed: number | null;
  distinctYears: number;
  liveValue: number;
};

export type WikiAxisScore = {
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
  notes: string | null;
  source: 'ai' | 'manual' | 'import' | 'audio' | null;
  createdAt: string;
  updatedAt: string;
};

export type ScoreAxisKey = 'aggression' | 'complexity' | 'atmosphere' | 'emotion' | 'psychedelic' | 'concept';

export type WikiTrackRef = { id: string; title: string; slug: string; value: number };

export type WikiMusicScore = {
  id: string;
  songId: string;
  rhythmicComplexity: number;
  harmonicDepth: number;
  structuralComplexity: number;
  sonicDensity: number;
  tempoEnergy: number;
  tonalDarkness: number;
  rationale: string;
  createdAt: string;
  updatedAt: string;
};

// ── Search ────────────────────────────────────────────────────────────────────

export type WikiSearchResult = {
  bands: WikiBand[];
  albums: Array<WikiAlbumSummary & { band: { slug: string; name: string } }>;
  songs: WikiSongSummary[];
};

export async function wikiSearch(q: string, limit = 10): Promise<WikiSearchResult> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await fetch(`/api/wiki/search?${params}`);
  if (!res.ok) throw new Error('Wiki search failed');
  return res.json() as Promise<WikiSearchResult>;
}

// ── Browse — full lists backing /wiki/bands, /wiki/albums, /wiki/songs, /wiki/artists ─

export type WikiBrowseAlbum = {
  id: string;
  title: string;
  slug: string;
  year: number | null;
  albumType: string | null;
  artworkUrl: string | null;
  band: { id: string; name: string; slug: string };
  _count: { songs: number };
};

export type WikiBrowseSong = {
  id: string;
  title: string;
  slug: string;
  rarity: string;
  band: { id: string; name: string; slug: string };
  album: { title: string; slug: string; year: number | null } | null;
};

export type WikiBrowseArtist = {
  id: string;
  name: string;
  role: string | null;
  band: { id: string; name: string; slug: string; logoUrl: string | null };
};

export async function getWikiAlbumsBrowse(): Promise<WikiBrowseAlbum[]> {
  const res = await fetch('/api/wiki/albums');
  if (!res.ok) throw new Error('Failed to load albums');
  return (await res.json() as { albums: WikiBrowseAlbum[] }).albums;
}

export async function getWikiSongsBrowse(): Promise<WikiBrowseSong[]> {
  const res = await fetch('/api/wiki/songs');
  if (!res.ok) throw new Error('Failed to load songs');
  return (await res.json() as { songs: WikiBrowseSong[] }).songs;
}

export async function getWikiArtistsBrowse(): Promise<WikiBrowseArtist[]> {
  const res = await fetch('/api/wiki/artists');
  if (!res.ok) throw new Error('Failed to load artists');
  return (await res.json() as { members: WikiBrowseArtist[] }).members;
}

// ── Band page ─────────────────────────────────────────────────────────────────

export type WikiTopPlayed = {
  totalPerformances: number;
  liveStatus: string;
  song: { id: string; title: string; slug: string; rarity: string; album: { title: string; slug: string } | null };
};

export type WikiBandPageData = {
  band: WikiBand & {
    members: WikiMember[];
    albums: WikiAlbumSummary[];
    liveDataCache: {
      fetchStatus: string;
      fetchedShows: number;
      totalShows: number;
      lastFetchedAt: string | null;
    } | null;
    _count: { songs: number; albums: number };
  };
  topPlayed: WikiTopPlayed[];
  rarestPlayed: Array<{
    rarityIndex: number;
    liveStatus: string;
    song: { id: string; title: string; slug: string; album: { title: string; slug: string } | null };
  }>;
  spectrumRollup: {
    avgSpectrum: Record<ScoreAxisKey, number>;
    strongestAxis: { axis: ScoreAxisKey; average: number } | null;
    albumsByComplexity: Array<{ albumId: string; title: string; avgComplexity: number; songCount: number }>;
    extremeTracks: {
      mostComplex: WikiTrackRef | null;
      mostAtmospheric: WikiTrackRef | null;
      mostAggressive: WikiTrackRef | null;
    };
  } | null;
  health: AggregateHealth;
};

export async function getWikiBand(slug: string): Promise<WikiBandPageData> {
  const res = await fetch(`/api/wiki/bands/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error('Band not found');
  return res.json() as Promise<WikiBandPageData>;
}

// ── Album page ────────────────────────────────────────────────────────────────

export type WikiAlbumSong = {
  id: string;
  title: string;
  slug: string;
  trackNumber: number | null;
  durationSeconds: number | null;
  isInstrumental: boolean;
  rarity: string;
  score: WikiAxisScore | null;
  bandRpgProfile: {
    totalPerformances: number;
    liveStatus: string;
    rarityIndex: number;
  } | null;
};

export type WikiAlbumPageData = {
  band: { id: string; name: string; slug: string };
  album: {
    id: string;
    title: string;
    slug: string;
    year: number | null;
    albumType: string | null;
    artworkUrl: string | null;
    notes: string | null;
    songs: WikiAlbumSong[];
  };
  avgSpectrum: WikiAxisScore | null;
  strongestAxis: { axis: ScoreAxisKey; average: number } | null;
  mostComplexTrack: WikiTrackRef | null;
  mostAtmosphericTrack: WikiTrackRef | null;
  rarityBreakdown: Record<string, number>;
  health: AggregateHealth;
};

export async function getWikiAlbum(bandSlug: string, albumSlug: string): Promise<WikiAlbumPageData> {
  const res = await fetch(`/api/wiki/albums/${encodeURIComponent(bandSlug)}/${encodeURIComponent(albumSlug)}`);
  if (!res.ok) throw new Error('Album not found');
  return res.json() as Promise<WikiAlbumPageData>;
}

// ── Song page ─────────────────────────────────────────────────────────────────

export type WikiSongRelated = {
  id: string;
  title: string;
  slug: string;
  rarity: string;
  album: { title: string; slug: string; year: number | null } | null;
  bandRpgProfile: { liveStatus: string; totalPerformances: number } | null;
};

export type WikiSongSibling = {
  id: string;
  title: string;
  slug: string;
  trackNumber: number | null;
  rarity: string;
};

export type WikiBandRarityCount = {
  rarity: string;
  _count: { id: number };
};

export type WikiSongPageData = {
  song: {
    id: string;
    title: string;
    slug: string;
    rarity: string;
    isInstrumental: boolean;
    isRemix: boolean;
    trackNumber: number | null;
    durationSeconds: number | null;
    notes: string | null;
    bandId: string;
    band: { id: string; name: string; slug: string; logoUrl: string | null };
    album: { id: string; title: string; slug: string; year: number | null; artworkUrl: string | null } | null;
    score: WikiAxisScore | null;
    bandRpgProfile: WikiSongProfile | null;
    media: SongMedia | null;
    lyrics: Array<{ id: string; sourceType: string; sourceLabel: string | null; text: string }>;
    _count: { ratings: number };
  };
  collectedCount: number;
  albumSiblings: WikiSongSibling[];
  bandRarityCounts: WikiBandRarityCount[];
  relatedByRarity: WikiSongRelated[];
  liveCache: { fetchedShows: number; totalShows: number } | null;
  musicScore: WikiMusicScore | null;
  relatedBySpectrum: Array<{
    id: string;
    title: string;
    slug: string;
    album: { title: string; slug: string } | null;
    distance: number;
  }>;
  health: SongHealth;
};

export async function getWikiSong(songId: string): Promise<WikiSongPageData> {
  const res = await fetch(`/api/wiki/songs/${encodeURIComponent(songId)}`);
  if (!res.ok) throw new Error('Song not found');
  return res.json() as Promise<WikiSongPageData>;
}

// ── Song Spectrum admin actions (auth required — uses api.* for Bearer token) ─

export type UpsertSpectrumInput = {
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
  notes?: string | null;
};

export async function updateSongSpectrum(songId: string, data: UpsertSpectrumInput): Promise<WikiAxisScore> {
  return api.put<WikiAxisScore>(`/api/songs/${encodeURIComponent(songId)}/score`, data);
}

export async function generateSongSpectrum(songId: string): Promise<WikiAxisScore> {
  return api.post<WikiAxisScore>(`/api/analysis/ai/${encodeURIComponent(songId)}/core-score/generate`, {});
}

export async function generateMusicScore(songId: string): Promise<WikiMusicScore> {
  return api.post<WikiMusicScore>(`/api/analysis/ai/${encodeURIComponent(songId)}/music-score/regenerate`, {});
}

export async function fetchSongLyricsAi(songId: string): Promise<unknown> {
  return api.post(`/api/songs/${encodeURIComponent(songId)}/ai-lyrics`, {});
}

// ── Song media (YouTube) — admin add/replace/edit/remove ─────────────────────

export async function upsertSongMedia(songId: string, url: string, title?: string | null): Promise<SongMedia> {
  return api.put<SongMedia>(`/api/songs/${encodeURIComponent(songId)}/media`, { url, title: title ?? null });
}

export async function patchSongMedia(
  songId: string,
  data: { status?: 'needs_review' | 'broken' | 'private'; title?: string | null },
): Promise<SongMedia> {
  return api.patch<SongMedia>(`/api/songs/${encodeURIComponent(songId)}/media`, data);
}

export async function removeSongMedia(songId: string): Promise<SongMedia> {
  return api.delete<SongMedia>(`/api/songs/${encodeURIComponent(songId)}/media`);
}

// ── Player context (requires auth — uses api.get so Bearer token is included) ─

export type WikiSongPlayerContext = {
  collected: boolean;
  collectedAt: string | null;
  frozenRarity: string | null;
  guessedCorrectly: boolean | null;
  scoreEarned: number | null;
  setlistCount: number;
  bandProgress: { owned: number; total: number };
  albumProgress: { owned: number; total: number } | null;
  rarityProgress: Record<string, { owned: number; total: number }>;
};

export async function getWikiSongPlayerContext(songId: string): Promise<WikiSongPlayerContext> {
  return api.get<WikiSongPlayerContext>(`/api/wiki/songs/${encodeURIComponent(songId)}/player-context`);
}

// ── Artist page ───────────────────────────────────────────────────────────────

export type WikiArtistPageData = {
  member: WikiMember & {
    band: WikiBand & {
      albums: WikiAlbumSummary[];
      _count: { songs: number };
    };
  };
};

export async function getWikiArtist(memberId: string): Promise<WikiArtistPageData> {
  const res = await fetch(`/api/wiki/artists/${encodeURIComponent(memberId)}`);
  if (!res.ok) throw new Error('Artist not found');
  return res.json() as Promise<WikiArtistPageData>;
}

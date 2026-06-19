import { api } from '../lib/api';

// ── Selection types ───────────────────────────────────────────────────────────

export interface BandRpgSelectedBand {
  id: string;
  name: string;
  logoUrl?: string | null;
}

export interface BandRpgSelectedCharacter {
  id: string;           // memberId, skinId, or 'archivist'
  name: string;
  role?: string | null;
  dataUrl?: string | null;
}

// ── Session (song discovery) ──────────────────────────────────────────────────

export interface BandRpgLyricFragment {
  id: string;
  text: string;
}

export interface BandRpgSession {
  songId: string | null;
  songTitle: string | null;
  songRarity: string | null;
  fragments: BandRpgLyricFragment[];
}

export interface BandRpgSong {
  id: string;
  title: string;
}

// ── API response types ────────────────────────────────────────────────────────

export interface BandRpgScoreEntry {
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  score: number;
  questsCompleted: number;
  itemsCollected: number;
  bandName: string | null;
  characterName: string | null;
  songTitle: string | null;
  guessedCorrectly: boolean;
  guessBonus: number;
  createdAt: string;
}

export interface BandRpgStats {
  totalRuns: number;
  totalScore: number;
  totalSongsRecovered: number;
  uniqueSongsRecovered: number;
  correctGuessCount: number;
  investigationAccuracy: number;
  albumsCompleted: number;
  favoriteBandId: string | null;
  favoriteBandName: string | null;
  favoriteCharacterId: string | null;
  favoriteCharacterName: string | null;
  lastPlayedAt: string | null;
}

// ── Collection types ──────────────────────────────────────────────────────────

export interface BandRpgCollectedSong {
  id: string;
  songId: string;
  songTitle: string;
  bandId: string;
  bandName: string;
  guessedCorrectly: boolean;
  scoreEarned: number;
  rarity: string;
  recoveredAt: string;
}

export interface BandRpgCollectionGroup {
  bandId: string;
  bandName: string;
  collected: BandRpgCollectedSong[];
  totalSongsInBand: number;
}

// ── Album types ───────────────────────────────────────────────────────────────

export type AlbumState = 'not_started' | 'in_progress' | 'completed';

export interface BandRpgAlbumProgress {
  albumId: string;
  albumTitle: string;
  artworkUrl: string | null;
  albumType: string | null;
  year: number | null;
  bandId: string;
  bandName: string;
  totalSongs: number;
  recoveredSongs: number;
  completionPct: number;
  state: AlbumState;
  completedAt: string | null;
}

export interface BandRpgBandAlbumGroup {
  bandId: string;
  bandName: string;
  totalAlbums: number;
  completedAlbums: number;
  albums: BandRpgAlbumProgress[];
}

export interface BandRpgAlbumSong {
  songId: string;
  title: string;
  rarity: string;
  trackNumber: number | null;
  recovered: boolean;
  recoveredAt: string | null;
  guessedCorrectly: boolean;
}

export interface BandRpgAlbumDetail extends BandRpgAlbumProgress {
  songs: BandRpgAlbumSong[];
}

// ── Setlist types ─────────────────────────────────────────────────────────────

export interface BandRpgSetlistSummary {
  id: string;
  bandId: string;
  bandName: string;
  name: string;
  songCount: number;
  rarityValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface BandRpgSetlistSongEntry {
  id: string;
  songId: string;
  songTitle: string;
  rarity: string;
  position: number;
  addedAt: string;
}

export interface BandRpgSetlistDetail extends BandRpgSetlistSummary {
  albumCount: number;
  songs: BandRpgSetlistSongEntry[];
}

// ── API client ────────────────────────────────────────────────────────────────

export const bandRpgApi = {
  startSession: (bandId: string) =>
    api.get<BandRpgSession>(`/api/band-rpg/start-session?bandId=${encodeURIComponent(bandId)}`),

  getSongs: (bandId: string) =>
    api.get<BandRpgSong[]>(`/api/band-rpg/songs?bandId=${encodeURIComponent(bandId)}`),

  submitScore: (data: {
    score: number;
    questsCompleted: number;
    itemsCollected: number;
    levelsCleared: number;
    bandId?: string;
    bandName?: string;
    characterId?: string;
    characterName?: string;
    songId?: string;
    songTitle?: string;
    guessedCorrectly?: boolean;
    guessBonus?: number;
  }) => api.post<{ ok: boolean; score: number; rank: number }>('/api/band-rpg/scores', data),

  getLeaderboard: (limit = 10, bandId?: string) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (bandId) qs.set('bandId', bandId);
    return api.get<BandRpgScoreEntry[]>(`/api/band-rpg/scores?${qs.toString()}`);
  },

  saveProgress: (data: {
    questPhase: string;
    score: number;
    bandId?: string;
    bandName?: string;
    characterId?: string;
    characterName?: string;
  }) => api.post<{ ok: boolean }>('/api/band-rpg/progress', data),

  getStats: () => api.get<BandRpgStats>('/api/band-rpg/stats'),

  collectSong: (data: {
    songId: string;
    songTitle: string;
    bandId: string;
    bandName: string;
    guessedCorrectly: boolean;
    scoreEarned: number;
    rarity?: string;
  }) => api.post<{
    ok: boolean; isNew: boolean; albumCompleted: boolean;
    completedAlbumId?: string; completedAlbumTitle?: string;
  }>('/api/band-rpg/collect', data),

  getCollection: () => api.get<BandRpgCollectionGroup[]>('/api/band-rpg/collection'),

  getAlbums: () => api.get<BandRpgBandAlbumGroup[]>('/api/band-rpg/albums'),

  getAlbumDetail: (albumId: string) => api.get<BandRpgAlbumDetail>(`/api/band-rpg/albums/${encodeURIComponent(albumId)}`),

  getSetlists: () =>
    api.get<BandRpgSetlistSummary[]>('/api/band-rpg/setlists'),

  createSetlist: (data: { bandId: string; bandName: string; name: string }) =>
    api.post<{ ok: boolean; id: string }>('/api/band-rpg/setlists', data),

  getSetlistDetail: (id: string) =>
    api.get<BandRpgSetlistDetail>(`/api/band-rpg/setlists/${encodeURIComponent(id)}`),

  renameSetlist: (id: string, name: string) =>
    api.put<{ ok: boolean }>(`/api/band-rpg/setlists/${encodeURIComponent(id)}`, { name }),

  deleteSetlist: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/band-rpg/setlists/${encodeURIComponent(id)}`),

  updateSetlistSongs: (id: string, songs: Array<{ songId: string }>) =>
    api.put<{ ok: boolean; songCount: number }>(
      `/api/band-rpg/setlists/${encodeURIComponent(id)}/songs`,
      { songs },
    ),

  adminResetMyData: () =>
    api.post<{ ok: boolean; message: string }>('/api/band-rpg/admin/reset-my-data', {}),

  adminRandomizeRarities: (bandId: string) =>
    api.post<{ ok: boolean; updated: number }>('/api/band-rpg/admin/randomize-rarities', { bandId }),
};

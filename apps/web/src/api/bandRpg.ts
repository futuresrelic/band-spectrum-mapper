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
  favoriteBandId: string | null;
  favoriteBandName: string | null;
  favoriteCharacterId: string | null;
  favoriteCharacterName: string | null;
  lastPlayedAt: string | null;
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
};

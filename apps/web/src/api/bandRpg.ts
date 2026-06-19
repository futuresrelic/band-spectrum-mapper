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
  submitScore: (data: {
    score: number;
    questsCompleted: number;
    itemsCollected: number;
    levelsCleared: number;
    bandId?: string;
    bandName?: string;
    characterId?: string;
    characterName?: string;
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

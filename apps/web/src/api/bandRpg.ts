import { api } from '../lib/api';

export interface BandRpgScoreEntry {
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  score: number;
  questsCompleted: number;
  itemsCollected: number;
  createdAt: string;
}

export const bandRpgApi = {
  submitScore: (data: { score: number; questsCompleted: number; itemsCollected: number; levelsCleared: number }) =>
    api.post<{ ok: boolean; score: number; rank: number }>('/api/band-rpg/scores', data),

  getLeaderboard: (limit = 10) =>
    api.get<BandRpgScoreEntry[]>(`/api/band-rpg/scores?limit=${limit}`),

  saveProgress: (data: { questPhase: string; score: number }) =>
    api.post<{ ok: boolean }>('/api/band-rpg/progress', data),
};

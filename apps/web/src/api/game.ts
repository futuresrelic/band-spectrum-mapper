import { api } from '../lib/api';

export interface GameAlbum {
  id: string;
  title: string;
  year: number | null;
  artworkUrl: string | null;
  band: { id: string; name: string };
}

export interface LeaderboardEntry {
  id: string;
  userId: string;
  score: number;
  level: number;
  duration: number;
  createdAt: string;
  user: { id: string; name: string | null; avatarUrl: string | null };
}

export const gameApi = {
  getAlbums: () => api.get<GameAlbum[]>('/api/game/albums'),
  getLeaderboard: () => api.get<LeaderboardEntry[]>('/api/game/leaderboard'),
  saveScore: (score: number, level: number, duration: number) =>
    api.post<{ ok: boolean; id: string; rank: number }>('/api/game/scores', { score, level, duration }),
};

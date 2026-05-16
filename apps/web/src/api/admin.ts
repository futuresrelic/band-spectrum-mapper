import { api } from '../lib/api';
import type { AdminUser, AdminUserDetail } from '@band-spectrum-mapper/shared';

export type MigrationStatus = {
  key: string;
  description: string;
  applied: boolean;
};

export type MigrationResult = {
  key: string;
  description: string;
  status: 'applied' | 'already_applied' | 'error';
  error?: string;
};

export type UnlinkedSong = {
  id: string;
  title: string;
  slug: string;
  bandId: string;
  bandName: string;
  lyricCount: number;
  ratingCount: number;
  commentCount: number;
  isSafeToDelete: boolean;
};

export type EmptyAlbum = {
  id: string;
  title: string;
  slug: string;
  bandId: string;
  bandName: string;
};

export type EmptyBand = {
  id: string;
  name: string;
  slug: string;
};

export type DuplicateTrackGroup = {
  albumId: string;
  albumTitle: string;
  bandName: string;
  trackNumber: number;
  songs: { id: string; title: string; slug: string }[];
};

export type SongWithoutScore = {
  id: string;
  title: string;
  slug: string;
  albumTitle: string | null;
  bandName: string;
};

export type DbHealthReport = {
  unlinkedSongs: UnlinkedSong[];
  emptyAlbums: EmptyAlbum[];
  emptyBands: EmptyBand[];
  duplicateTrackNumbers: DuplicateTrackGroup[];
  songsWithoutScores: SongWithoutScore[];
};

export type CleanupResults = {
  results: Record<string, number>;
};

export type AlbumOption = {
  id: string;
  title: string;
  year: number | null;
  bandId: string;
  bandName: string;
};

export const adminApi = {
  listUsers: () =>
    api.get<AdminUser[]>('/api/admin/users'),

  getUser: (userId: string) =>
    api.get<AdminUserDetail>(`/api/admin/users/${userId}`),

  updateUser: (userId: string, data: { isCommunityExcluded?: boolean; isActive?: boolean; isAdmin?: boolean }) =>
    api.patch<AdminUser>(`/api/admin/users/${userId}`, data),

  getDbStatus: () =>
    api.get<MigrationStatus[]>('/api/admin/db-status'),

  runDbMigrate: () =>
    api.post<{ results: MigrationResult[] }>('/api/admin/db-migrate', {}),

  runDbPush: () =>
    api.post<{ success: boolean; output: string }>('/api/admin/db-push', {}),

  getDbHealth: () =>
    api.get<DbHealthReport>('/api/admin/db-health'),

  runDbCleanup: (actions: string[]) =>
    api.post<CleanupResults>('/api/admin/db-cleanup', { actions }),

  getAlbumsList: () =>
    api.get<AlbumOption[]>('/api/admin/albums-list'),

  relinkSong: (songId: string, albumId: string) =>
    api.patch<{ ok: boolean }>(`/api/admin/songs/${songId}/relink`, { albumId }),

  deleteSong: (songId: string) =>
    api.delete<{ ok: boolean }>(`/api/admin/songs/${songId}`),

  deleteAlbum: (albumId: string, andSongs: boolean) =>
    api.delete<{ ok: boolean }>(`/api/admin/albums/${albumId}?andSongs=${andSongs}`),

  getMissingLyrics: () =>
    api.get<MissingSong[]>('/api/admin/missing-lyrics'),

  getMissingArtwork: () =>
    api.get<MissingArtworkAlbum[]>('/api/admin/missing-artwork'),

  startLyricsBatch: () =>
    api.post<BatchJobState>('/api/admin/lyrics-batch/start', {}),

  getLyricsBatchStatus: () =>
    api.get<BatchJobState>('/api/admin/lyrics-batch/status'),

  stopLyricsBatch: () =>
    api.post<BatchJobState>('/api/admin/lyrics-batch/stop', {}),

  clearLyricsBatch: () =>
    api.post<BatchJobState>('/api/admin/lyrics-batch/clear', {}),

  approveLyricsItem: (itemId: string) =>
    api.post<{ ok: boolean }>(`/api/admin/lyrics-batch/approve/${itemId}`, {}),

  rejectLyricsItem: (itemId: string) =>
    api.post<{ ok: boolean }>(`/api/admin/lyrics-batch/reject/${itemId}`, {}),

  resumeLyricsBatch: () =>
    api.post<BatchJobState>('/api/admin/lyrics-batch/resume', {}),

  markInstrumental: (songId: string, isInstrumental: boolean) =>
    api.patch<{ ok: boolean; isInstrumental: boolean }>(`/api/admin/songs/${songId}/instrumental`, { isInstrumental }),

  clearNoLyrics: (songId: string) =>
    api.patch<{ ok: boolean }>(`/api/admin/songs/${songId}/clear-no-lyrics`, {}),

  getGameLeaderboard: () =>
    api.get<GameLeaderboardEntry[]>('/api/admin/game/leaderboard'),

  deleteGameScore: (scoreId: string) =>
    api.delete<{ ok: boolean }>(`/api/admin/game/scores/${scoreId}`),
};

export type MissingSong = {
  id: string;
  title: string;
  trackNumber: number | null;
  bandId: string;
  bandName: string;
  albumId: string | null;
  albumTitle: string | null;
};

export type MissingArtworkAlbum = {
  id: string;
  title: string;
  year: number | null;
  bandId: string;
  bandName: string;
};

export type BatchItemStatus = 'found' | 'approved' | 'rejected';

export type BatchItem = {
  id: string;
  songId: string;
  songTitle: string;
  bandName: string;
  albumTitle: string | null;
  text: string;
  source: string;
  status: BatchItemStatus;
  foundAt: string;
};

export type BatchJobState = {
  status: 'idle' | 'running' | 'done' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  totalSongs: number;
  processedSongs: number;
  foundCount: number;
  notFoundCount: number;
  skippedInstrumentalCount: number;  // NEW
  currentSong: string | null;
  items: BatchItem[];
  error: string | null;
  processedSongIds: string[];         // NEW
  notFoundSongIds: string[];          // NEW
};

export type GameLeaderboardEntry = {
  id: string;
  userId: string;
  score: number;
  level: number;
  duration: number;
  createdAt: string;
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
};

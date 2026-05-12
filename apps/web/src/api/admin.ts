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

  getDbHealth: () =>
    api.get<DbHealthReport>('/api/admin/db-health'),

  runDbCleanup: (actions: string[]) =>
    api.post<CleanupResults>('/api/admin/db-cleanup', { actions }),
};

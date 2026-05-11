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
};

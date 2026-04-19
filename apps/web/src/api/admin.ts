import { api } from '../lib/api';
import type { AdminUser, AdminUserDetail } from '@band-spectrum-mapper/shared';

export const adminApi = {
  listUsers: () =>
    api.get<AdminUser[]>('/api/admin/users'),

  getUser: (userId: string) =>
    api.get<AdminUserDetail>(`/api/admin/users/${userId}`),

  updateUser: (userId: string, data: { isCommunityExcluded?: boolean; isActive?: boolean; isAdmin?: boolean }) =>
    api.patch<AdminUser>(`/api/admin/users/${userId}`, data),
};

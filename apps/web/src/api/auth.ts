import { api } from '../lib/api';
import type { AuthUser } from '@band-spectrum-mapper/shared';

export const authApi = {
  me: () => api.get<AuthUser>('/api/auth/me'),
  logout: () => api.post<{ ok: boolean }>('/api/auth/logout', {}),
};

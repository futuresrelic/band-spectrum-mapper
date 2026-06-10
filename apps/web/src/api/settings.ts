import { api } from '../lib/api';
import type { CustomStopword } from '@band-spectrum-mapper/shared';
import type { ConfigSnapshot } from '../cinema/configSnapshots';

export const settingsApi = {
  getStopwords: () => api.get<CustomStopword[]>('/api/settings/stopwords'),
  addStopword: (word: string) => api.post<CustomStopword>('/api/settings/stopwords', { word }),
  removeStopword: (word: string) => api.delete<void>(`/api/settings/stopwords/${encodeURIComponent(word)}`),
  bulkReplaceStopwords: (words: string[]) =>
    api.put<CustomStopword[]>('/api/settings/stopwords', { words }),
  getGameVisibility: () =>
    api.get<{ hiddenIds: string[] }>('/api/settings/game-visibility'),
  setGameVisibility: (hiddenIds: string[]) =>
    api.put<{ hiddenIds: string[] }>('/api/settings/game-visibility', { hiddenIds }),
  getCinemaDefaults: () =>
    api.get<{ adminDefault: ConfigSnapshot | null; userDefault: ConfigSnapshot | null }>('/api/settings/cinema-default'),
  setCinemaDefault: (role: 'admin' | 'user', snapshot: ConfigSnapshot) =>
    api.put<{ ok: boolean }>('/api/settings/cinema-default', { role, snapshot }),
  deleteCinemaDefault: (role: 'admin' | 'user') =>
    api.delete<{ ok: boolean }>(`/api/settings/cinema-default?role=${role}`),
};

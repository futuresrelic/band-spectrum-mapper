import { api } from '../lib/api';
import type { CustomStopword } from '@band-spectrum-mapper/shared';

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
};

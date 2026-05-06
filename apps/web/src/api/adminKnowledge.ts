import { api } from '../lib/api';
import type { AdminKnowledgeEntry } from '@band-spectrum-mapper/shared';

type CreateInput = Pick<AdminKnowledgeEntry, 'title' | 'content' | 'scope' | 'tags' | 'isActive'> & {
  scopeId?: string | null;
};

export const adminKnowledgeApi = {
  list: () =>
    api.get<AdminKnowledgeEntry[]>('/api/admin/knowledge'),

  create: (data: CreateInput) =>
    api.post<AdminKnowledgeEntry>('/api/admin/knowledge', data),

  update: (id: string, data: Partial<CreateInput>) =>
    api.put<AdminKnowledgeEntry>(`/api/admin/knowledge/${id}`, data),

  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/admin/knowledge/${id}`),
};

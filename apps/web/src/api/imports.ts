import { api } from '../lib/api';
import type { Import } from '@band-spectrum-mapper/shared';

const BASE = import.meta.env['VITE_API_URL'] ?? '';

export const importsApi = {
  list: () => api.get<Import[]>('/api/imports'),
  upload: async (bandId: string, file: File): Promise<Import> => {
    const form = new FormData();
    form.append('bandId', bandId);
    form.append('file', file);
    const res = await fetch(`${BASE}/api/imports`, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? 'Upload failed');
    }
    return res.json() as Promise<Import>;
  },
};

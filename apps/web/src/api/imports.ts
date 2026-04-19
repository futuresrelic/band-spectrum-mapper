import { api } from '../lib/api';
import type { Import } from '@band-spectrum-mapper/shared';

const BASE = import.meta.env['VITE_API_URL'] ?? '';

export interface ScoreImportResult {
  total: number;
  matched: number;
  notFound: string[];
  updated: string[];
}

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
  importScores: async (bandId: string, scores: unknown[]): Promise<ScoreImportResult> => {
    const res = await fetch(`${BASE}/api/imports/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bandId, scores }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((body as { error?: string }).error ?? 'Import failed');
    }
    return res.json() as Promise<ScoreImportResult>;
  },
};

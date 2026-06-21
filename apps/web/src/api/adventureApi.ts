const BASE = '/api/band-rpg/adventures';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Adventure {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { levels: number; quests: number; arcs: number; items: number };
}

export interface AdventureExport {
  bandRpgAdventureVersion: 1;
  exportedAt: string;
  adventure: { slug: string; name: string; description?: string; version: number };
  items: object[];
  quests: object[];
  arcs: object[];
  levels: object[];
  timeline: object[];
}

export interface ValidationError { path: string; message: string; }
export interface ImportPreview {
  levelCount: number; npcCount: number; objectiveCount: number;
  questCount: number; arcCount: number; itemCount: number;
  beatCount: number; doorCount: number; switchCount: number;
  puzzleCount: number; timelineCount: number;
}
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  preview: ImportPreview | null;
}
export interface ImportResult {
  ok: boolean;
  adventureId?: string;
  imported?: ImportPreview;
  errors?: ValidationError[];
}

// ── API client ────────────────────────────────────────────────────────────────

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export const adventureApi = {
  list: () => api<Adventure[]>(BASE),

  create: (data: { slug: string; name: string; description?: string }) =>
    api<Adventure>(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{ slug: string; name: string; description: string; isPublished: boolean }>) =>
    api<Adventure>(`${BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    api<{ ok: boolean }>(`${BASE}/${id}`, { method: 'DELETE' }),

  assign: (id: string, data: { levelIds?: string[]; questIds?: string[]; arcIds?: string[]; itemIds?: string[] }) =>
    api<{ ok: boolean }>(`${BASE}/${id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  exportAdventure: async (id: string): Promise<AdventureExport> => {
    const res = await fetch(`${BASE}/${id}/export`, { credentials: 'include' });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<AdventureExport>;
  },

  validate: (payload: unknown) =>
    api<ValidationResult>(`${BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  import: (payload: unknown, mode: 'create' | 'update' | 'replace' = 'create') =>
    api<ImportResult>(`${BASE}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, mode }),
    }),
};

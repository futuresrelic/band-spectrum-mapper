const BASE = '/api/band-rpg/adventures';
const PROGRESS_BASE = '/api/band-rpg/adventure-progress';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Adventure {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: number;
  isPublished: boolean;
  featured: boolean;
  coverImageUrl: string | null;
  authorName: string | null;
  difficulty: string | null;
  estimatedPlaytime: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  _count?: { levels: number; quests: number; arcs: number; items: number; progress?: number };
}

export interface AdventureProgress {
  id: string;
  userId: string;
  adventureId: string;
  startedAt: string;
  completedAt: string | null;
  lastPlayedAt: string;
  completionPct: number;
  questsCompleted: number;
  itemsCollected: number;
  levelsDiscovered: string[];
  isCompleted: boolean;
}

export interface AdventureWithProgress {
  adventure: Adventure;
  progress: AdventureProgress | null;
}

export interface BrowseAdventure extends Adventure {
  progress: Pick<AdventureProgress, 'completionPct' | 'isCompleted' | 'startedAt' | 'lastPlayedAt'> | null;
}

export interface HealthCheck {
  name: string;
  passed: boolean;
  weight: number;
}
export interface AdventureHealth {
  score: number;
  checks: HealthCheck[];
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

// ── API helper ─────────────────────────────────────────────────────────────────

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

// ── Adventure admin API ───────────────────────────────────────────────────────

export const adventureApi = {
  list: () => api<Adventure[]>(BASE),

  create: (data: { slug: string; name: string; description?: string }) =>
    api<Adventure>(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{
    slug: string; name: string; description: string; isPublished: boolean;
    featured: boolean; coverImageUrl: string; authorName: string;
    difficulty: string; estimatedPlaytime: number; tags: string[];
  }>) =>
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

// ── Readiness API (admin) ────────────────────────────────────────────────────

export interface ReadinessCheck { item: string; passed: boolean; }
export interface AdventureHealthSummary { id: string; name: string; slug: string; score: number; checks: { name: string; passed: boolean }[]; }
export interface ReadinessReport {
  summary: {
    adventures: { total: number; published: number; featured: number };
    levels: { total: number; published: number };
    quests: { total: number };
    npcs: { total: number };
    items: { total: number };
    players: { total: number; progressRecords: number };
    averageHealthScore: number;
    readinessPct: number;
  };
  readinessChecks: ReadinessCheck[];
  adventureHealth: AdventureHealthSummary[];
  issues: string[];
}

export const readinessApi = {
  get: () => api<ReadinessReport>('/api/band-rpg/readiness'),
};

// ── Adventure progress (player-facing) API ────────────────────────────────────

export const adventureProgressApi = {
  browse: (opts: { userId?: string; featured?: boolean; difficulty?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.userId) params.set('userId', opts.userId);
    if (opts.featured) params.set('featured', 'true');
    if (opts.difficulty) params.set('difficulty', opts.difficulty);
    const qs = params.toString();
    return api<{ adventures: BrowseAdventure[] }>(`${PROGRESS_BASE}/browse${qs ? `?${qs}` : ''}`);
  },

  my: () => api<{ adventures: AdventureWithProgress[] }>(`${PROGRESS_BASE}/my`),

  get: (adventureId: string) =>
    api<{ adventure: Adventure; progress: AdventureProgress; firstLevelSlug: string | null }>(`${PROGRESS_BASE}/${adventureId}`),

  sync: (adventureId: string, data: {
    levelsDiscovered: string[];
    questsCompleted: number;
    itemsCollected: number;
    isCompleted: boolean;
  }) =>
    api<{ progress: AdventureProgress }>(`${PROGRESS_BASE}/${adventureId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  restart: (adventureId: string) =>
    api<{ progress: AdventureProgress }>(`${PROGRESS_BASE}/${adventureId}/restart`, {
      method: 'POST',
    }),

  health: (adventureId: string) =>
    api<AdventureHealth>(`${PROGRESS_BASE}/${adventureId}/health`),
};

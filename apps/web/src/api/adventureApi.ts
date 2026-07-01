import { api as httpApi } from '../lib/api';

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
export interface GameplayScore {
  total: number;
  exploration: number;
  puzzles: number;
  items: number;
  variety: number;
  progression: number;
  details: string[];
}
export interface ProgressionError   { path: string; message: string; }
export interface ProgressionWarning { path: string; message: string; }
export interface ProgressionResult {
  passed: boolean;
  errors: ProgressionError[];
  warnings: ProgressionWarning[];
  metrics: {
    softlockCount:         number;
    progressionSteps:      number;
    unreachableObjectives: number;
    adventureCompletable:  boolean;
  };
}
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  preview: ImportPreview | null;
  gameplay?: GameplayScore;
  progression?: ProgressionResult;
}
export interface ImportResult {
  ok: boolean;
  adventureId?: string;
  slug?: string | null;
  name?: string | null;
  isPublished?: boolean;
  firstLevelSlug?: string | null;
  imported?: ImportPreview;
  errors?: ValidationError[];
}

// ── Adventure admin API ───────────────────────────────────────────────────────

export const adventureApi = {
  list: () => httpApi.get<Adventure[]>(BASE),

  create: (data: { slug: string; name: string; description?: string }) =>
    httpApi.post<Adventure>(BASE, data),

  update: (id: string, data: Partial<{
    slug: string; name: string; description: string; isPublished: boolean;
    featured: boolean; coverImageUrl: string; authorName: string;
    difficulty: string; estimatedPlaytime: number; tags: string[];
  }>) =>
    httpApi.put<Adventure>(`${BASE}/${id}`, data),

  delete: (id: string) =>
    httpApi.delete<{ ok: boolean }>(`${BASE}/${id}`),

  assign: (id: string, data: { levelIds?: string[]; questIds?: string[]; arcIds?: string[]; itemIds?: string[] }) =>
    httpApi.post<{ ok: boolean }>(`${BASE}/${id}/assign`, data),

  exportAdventure: (id: string): Promise<AdventureExport> =>
    httpApi.get<AdventureExport>(`${BASE}/${id}/export`),

  validate: (payload: unknown) =>
    httpApi.post<ValidationResult>(`${BASE}/validate`, payload),

  import: (payload: unknown, mode: 'create' | 'update' | 'replace' = 'create') =>
    httpApi.post<ImportResult>(`${BASE}/import`, { payload, mode }),

  cleanupOrphans: () =>
    httpApi.post<{ ok: boolean; total: number; deleted: Record<string, number> }>(`${BASE}/cleanup-orphans`, {}),
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
  get: () => httpApi.get<ReadinessReport>('/api/band-rpg/readiness'),
};

// ── Adventure progress (player-facing) API ────────────────────────────────────

export const adventureProgressApi = {
  browse: (opts: { userId?: string; featured?: boolean; difficulty?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.userId) params.set('userId', opts.userId);
    if (opts.featured) params.set('featured', 'true');
    if (opts.difficulty) params.set('difficulty', opts.difficulty);
    const qs = params.toString();
    return httpApi.get<{ adventures: BrowseAdventure[] }>(`${PROGRESS_BASE}/browse${qs ? `?${qs}` : ''}`);
  },

  my: () => httpApi.get<{ adventures: AdventureWithProgress[] }>(`${PROGRESS_BASE}/my`),

  get: (adventureId: string) =>
    httpApi.get<{ adventure: Adventure; progress: AdventureProgress; firstLevelSlug: string | null }>(`${PROGRESS_BASE}/${adventureId}`),

  sync: (adventureId: string, data: {
    levelsDiscovered: string[];
    questsCompleted: number;
    itemsCollected: number;
    isCompleted: boolean;
  }) =>
    httpApi.post<{ progress: AdventureProgress }>(`${PROGRESS_BASE}/${adventureId}/sync`, data),

  restart: (adventureId: string) =>
    httpApi.post<{ progress: AdventureProgress }>(`${PROGRESS_BASE}/${adventureId}/restart`, {}),

  health: (adventureId: string) =>
    httpApi.get<AdventureHealth>(`${PROGRESS_BASE}/${adventureId}/health`),
};

// ── Campaign Generator API (admin only) ──────────────────────────────────────

const CAMPAIGN_BASE = '/api/band-rpg/campaign';

export interface CampaignSettings {
  bandName: string;
  bandId?: string;       // BSM library band ID — passed through for future metadata use
  adventureTitle: string;
  slug?: string;
  theme?: string;
  difficulty?: string;
  estimatedPlaytime?: number;
  numLevels?: number;
  numQuests?: number;
  tone?: string;
  includeCompletionScreen?: boolean;
  includePuzzles?: boolean;
  includeDoorsKeys?: boolean;
  songRecovery?: boolean;
  extraInstructions?: string;
}

export interface BlueprintResult { blueprint: string; model: string; }
export interface GenerateResult { json: unknown; raw: string; model: string; }
export interface RepairResult { json: unknown; raw: string; model: string; attempt: number; }
export interface CampaignPingResult {
  authenticated: boolean;
  userId: string;
  email: string;
  isAdmin: boolean;
  openAiKeyConfigured: boolean;
  model: string;
  status: 'ready' | 'missing_openai_key';
  message: string;
}

// ── Guided Adventure Builder types ──────────────────────────────────────────

export interface GuidedSource {
  mode: 'band' | 'custom';
  bandName: string;
  albumName: string;
  songName: string;
  customTheme: string;
}

export interface GuidedNpc { name: string; role: string; dialogueHint: string; }
export interface GuidedItem { slug: string; name: string; type: string; rarity: string; purpose: string; }
export interface GuidedPuzzle { type: string; name: string; }

export interface GuidedLevelSpec {
  order: number;
  name: string;
  slug: string;
  description: string;
  type: string;
  mapTemplateId: string;
  mapTransform: string;
  npcs: GuidedNpc[];
  items: GuidedItem[];
  puzzle: GuidedPuzzle | null;
  questName: string;
  questEnabled: boolean;
  nextLevelSlug: string;
}

export interface GuidedAdventureSpec {
  source: GuidedSource;
  adventure: { name: string; slug: string; description: string; difficulty: string; tags: string[] };
  levels: GuidedLevelSpec[];
}

export interface GuidedSuggestResult { suggestions: string[]; }
export interface GuidedGenerateResult { json: unknown; raw: string; model: string; }

export const campaignGeneratorApi = {
  ping: () =>
    httpApi.get<CampaignPingResult>(`${CAMPAIGN_BASE}/ping`),

  blueprint: (settings: CampaignSettings) =>
    httpApi.post<BlueprintResult>(`${CAMPAIGN_BASE}/blueprint`, settings),

  generate: (blueprint: string, settings: Pick<CampaignSettings, 'bandName' | 'adventureTitle' | 'slug' | 'numLevels' | 'numQuests' | 'includeCompletionScreen' | 'includePuzzles' | 'includeDoorsKeys'>) =>
    httpApi.post<GenerateResult>(`${CAMPAIGN_BASE}/generate`, { blueprint, ...settings }),

  repair: (json: unknown, errors: Array<{ path?: string; message: string }>, attempt: number) =>
    httpApi.post<RepairResult>(`${CAMPAIGN_BASE}/repair`, { json, errors, attempt }),

  repairReachability: (json: unknown, errors: Array<{ path?: string; message: string }>, attempt: number) =>
    httpApi.post<RepairResult>(`${CAMPAIGN_BASE}/repair-reachability`, { json, errors, attempt }),

  guidedSuggest: (step: string, context: Record<string, unknown>) =>
    httpApi.post<GuidedSuggestResult>(`${CAMPAIGN_BASE}/guided/suggest`, { step, context }),

  guidedGenerate: (spec: GuidedAdventureSpec) =>
    httpApi.post<GuidedGenerateResult>(`${CAMPAIGN_BASE}/guided/generate`, spec),
};

import { api } from '../lib/api';
import type { MapData } from './bandRpgEditor';

// ── Runtime entity types ──────────────────────────────────────────────────────

export interface DialogueLine {
  text: string;
  speakerName?: string;
  portraitUrl?: string;
}

export interface RuntimeNpc {
  id: string;
  name: string;
  role: string | null;
  portraitUrl: string | null;
  dialogue: DialogueLine[];
  tileX: number;
  tileY: number;
}

export interface RuntimeItem {
  id: string;
  entityId: string;
  name: string;
  description: string | null;
  rarity: string;
  scoreValue: number;
  iconUrl: string | null;
  tileX: number;
  tileY: number;
}

export interface RuntimeExit {
  tileX: number;
  tileY: number;
  targetLevelSlug: string;
  label?: string;
}

export interface RuntimeQuest {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  giverId: string | null;
  objectiveIds: string[];
  reward: Record<string, unknown>;
  unlocksLevelId: string | null;
}

export interface RuntimeBeat {
  id: string;
  arcId: string | null;
  levelId: string | null;
  type: string;
  content: Record<string, unknown>;
  unlockCondition: Record<string, unknown>;
  order: number;
}

export interface RuntimeObjective {
  id: string;
  levelId: string;
  name: string;
  description: string | null;
  type: string;
  target: string | null;
  isOptional: boolean;
  order: number;
}

export interface RuntimeLevel {
  id: string;
  slug: string;
  name: string;
  background: string | null;
  mapData: MapData;
  spawnX: number;
  spawnY: number;
  npcs: RuntimeNpc[];
  items: RuntimeItem[];
  exits: RuntimeExit[];
  quests: RuntimeQuest[];
  beats: RuntimeBeat[];
  objectives: RuntimeObjective[];
}

// ── Save state ────────────────────────────────────────────────────────────────

export interface InventoryEntry {
  itemId: string;
  quantity: number;
}

export interface SaveState {
  currentLevelSlug: string | null;
  completedObjectives: string[];
  completedQuests: string[];
  inventory: InventoryEntry[];
  unlockedStoryBeats: string[];
}

// ── API client ────────────────────────────────────────────────────────────────

const BASE = '/api/band-rpg/runtime';

export const bandRpgRuntimeApi = {
  loadLevel: (slug: string) =>
    api.get<RuntimeLevel>(`${BASE}/level/${encodeURIComponent(slug)}`),

  loadSave: () =>
    api.get<SaveState>(`${BASE}/save`),

  saveProgress: (state: Partial<SaveState>) =>
    api.post<{ ok: boolean }>(`${BASE}/save`, state),
};

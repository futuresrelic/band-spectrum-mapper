import { api } from '../lib/api';
import type { MapData } from './bandRpgEditor';

// ── Phase Z.3 — World System types ───────────────────────────────────────────

export type WorldConditionType =
  | 'item_owned' | 'quest_active' | 'quest_complete' | 'story_beat_seen'
  | 'switch_activated' | 'door_open' | 'world_state' | 'always' | 'never';

export interface WorldCondition {
  type: WorldConditionType;
  targetId?: string;   // doorId / switchId / questId / beatId / itemId
  key?: string;        // worldState key (for world_state type)
  value?: unknown;     // worldState expected value
}

export type PuzzleTriggerType =
  | 'item_collected' | 'quest_complete' | 'quest_start' | 'story_beat_seen'
  | 'switch_activated' | 'npc_talked' | 'level_enter' | 'always';

export interface PuzzleTrigger {
  on: PuzzleTriggerType;
  targetId?: string;
}

export type PuzzleActionType =
  | 'open_door' | 'close_door' | 'trigger_beat' | 'reveal_exit'
  | 'set_world_state' | 'grant_item';

export interface PuzzleAction {
  type: PuzzleActionType;
  targetId?: string;  // doorId / beatId / levelSlug / itemId
  key?: string;       // for set_world_state
  value?: unknown;    // for set_world_state
}

export type DoorType = 'key_door' | 'quest_door' | 'story_door' | 'switch_door' | 'free';
export type SwitchType = 'switch' | 'lever' | 'button' | 'pressure_plate';

export interface RuntimeDoor {
  id: string;
  levelId: string;
  name: string;
  tileX: number;
  tileY: number;
  type: DoorType;
  lockCondition: WorldCondition;
  openedByDefault: boolean;
  label: string | null;
}

export interface RuntimeSwitch {
  id: string;
  levelId: string;
  name: string;
  tileX: number;
  tileY: number;
  type: SwitchType;
  effect: PuzzleAction;
  label: string | null;
}

export interface RuntimePuzzle {
  id: string;
  levelId: string;
  name: string;
  trigger: PuzzleTrigger;
  condition: WorldCondition;
  action: PuzzleAction;
  order: number;
}

// ── Runtime entity types ──────────────────────────────────────────────────────

export interface DialogueChoiceAction {
  type: 'accept_quest' | 'complete_quest' | 'give_item' | 'close';
  targetId?: string;
}

export interface DialogueChoice {
  text: string;
  action?: DialogueChoiceAction;
}

export interface DialogueLine {
  text: string;
  speakerName?: string;
  portraitUrl?: string;
  choices?: DialogueChoice[];
}

export interface RuntimeNpc {
  id: string;
  name: string;
  role: string | null;
  portraitUrl: string | null;
  dialogue: DialogueLine[];
  tileX: number;
  tileY: number;
  visibilityCondition: WorldCondition | null;
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
  spawnCondition: WorldCondition | null;
}

export interface RuntimeExit {
  tileX: number;
  tileY: number;
  targetLevelSlug: string;
  label?: string;
  condition: WorldCondition | null;
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
  unlocksQuestId: string | null;
  storyBeatId: string | null;
  isOptional: boolean;
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
  condition: Record<string, unknown>;
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
  doors: RuntimeDoor[];
  switches: RuntimeSwitch[];
  puzzles: RuntimePuzzle[];
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
  activeQuestIds: string[];
  objectiveProgress: Record<string, number>;
  unlockedLevelSlugs: string[];
  openedDoors: string[];
  activatedSwitches: string[];
  worldState: Record<string, unknown>;
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

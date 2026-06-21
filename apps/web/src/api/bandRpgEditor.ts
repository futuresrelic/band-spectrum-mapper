import { api } from '../lib/api';

// ── Map / Tile Types ──────────────────────────────────────────────────────────

export type TileType = 0 | 1 | 2 | 3;

export interface MapEntity {
  id: string;
  type: 'spawn' | 'exit' | 'npc' | 'item';
  x: number;
  y: number;
  refId?: string;
  targetLevelSlug?: string;
  label?: string;
}

export interface MapData {
  width: number;
  height: number;
  tiles: TileType[][];
  entities: MapEntity[];
}

// ── Objective Types ───────────────────────────────────────────────────────────

export type ObjectiveType =
  | 'find_item' | 'talk_to_npc' | 'reach_location' | 'collect_objects'
  | 'inspect_object' | 'trigger_music_node' | 'complete_sequence'
  | 'survive_timer' | 'solve_clue' | 'play_minigame' | 'score_threshold';

export type ItemType =
  | 'collectible' | 'key_item' | 'quest_item' | 'power_up'
  | 'lore_item' | 'album_artifact' | 'song_artifact' | 'cosmetic';

export type BeatType = 'dialogue' | 'narration' | 'cutscene' | 'choice' | 'unlock' | 'trigger';

// ── Level ─────────────────────────────────────────────────────────────────────

export interface EditorLevel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  order: number;
  bandId: string | null;
  albumId: string | null;
  songId: string | null;
  mapData: MapData | Record<string, never>;
  background: string | null;
  spawnX: number;
  spawnY: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { objectives: number; npcs: number };
}

export interface EditorLevelDetail extends EditorLevel {
  objectives: EditorObjective[];
  npcs: EditorNpc[];
}

// ── Objective ─────────────────────────────────────────────────────────────────

export interface EditorObjective {
  id: string;
  levelId: string;
  name: string;
  description: string | null;
  type: ObjectiveType;
  target: string | null;
  condition: Record<string, unknown>;
  reward: Record<string, unknown>;
  dialogueText: string | null;
  prerequisiteId: string | null;
  isOptional: boolean;
  order: number;
}

// ── Quest ─────────────────────────────────────────────────────────────────────

export interface EditorQuest {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  giverId: string | null;
  objectiveIds: string[];
  branchPaths: unknown[];
  reward: Record<string, unknown>;
  unlocksQuestId: string | null;
  unlocksLevelId: string | null;
  storyBeatId: string | null;
  isOptional: boolean;
  order: number;
}

// ── Story ─────────────────────────────────────────────────────────────────────

export interface EditorStoryArc {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  order: number;
  _count?: { beats: number };
}

export interface EditorStoryBeat {
  id: string;
  arcId: string | null;
  levelId: string | null;
  type: BeatType;
  content: Record<string, unknown>;
  unlockCondition: Record<string, unknown>;
  order: number;
}

// ── NPC ───────────────────────────────────────────────────────────────────────

export interface DialogueLine {
  text: string;
  speakerName?: string;
  portraitUrl?: string;
}

export interface EditorNpc {
  id: string;
  levelId: string;
  name: string;
  role: string | null;
  faction: string | null;
  portraitUrl: string | null;
  characterSkinId: string | null;
  defaultDialogue: DialogueLine[];
  positionX: number;
  positionY: number;
  bandMemberId: string | null;
}

// ── Item ─────────────────────────────────────────────────────────────────────

export interface EditorItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: ItemType;
  iconUrl: string | null;
  spriteUrl: string | null;
  rarity: string;
  scoreValue: number;
  bandId: string | null;
  albumId: string | null;
  songId: string | null;
  isVisible: boolean;
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface EditorTimelineEvent {
  id: string;
  title: string;
  type: string;
  refId: string | null;
  order: number;
  isRequired: boolean;
}

// ── Phase Z.3 — World System types ───────────────────────────────────────────

export type WorldConditionType =
  | 'item_owned' | 'quest_active' | 'quest_complete' | 'story_beat_seen'
  | 'switch_activated' | 'door_open' | 'world_state' | 'always' | 'never';

export interface WorldCondition {
  type: WorldConditionType;
  targetId?: string;
  key?: string;
  value?: unknown;
}

export type DoorType = 'key_door' | 'quest_door' | 'story_door' | 'switch_door' | 'free';
export type SwitchType = 'switch' | 'lever' | 'button' | 'pressure_plate';

export type PuzzleTriggerType =
  | 'item_collected' | 'quest_complete' | 'quest_start' | 'story_beat_seen'
  | 'switch_activated' | 'npc_talked' | 'level_enter' | 'always';

export type PuzzleActionType =
  | 'open_door' | 'close_door' | 'trigger_beat' | 'reveal_exit'
  | 'set_world_state' | 'grant_item';

export interface EditorDoor {
  id: string;
  levelId: string;
  name: string;
  tileX: number;
  tileY: number;
  type: DoorType;
  lockCondition: Record<string, unknown>;
  openedByDefault: boolean;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditorSwitch {
  id: string;
  levelId: string;
  name: string;
  tileX: number;
  tileY: number;
  type: SwitchType;
  effect: Record<string, unknown>;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditorPuzzle {
  id: string;
  levelId: string;
  name: string;
  trigger: Record<string, unknown>;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  order: number;
  createdAt: string;
  updatedAt: string;
}

// ── API Client ────────────────────────────────────────────────────────────────

const BASE = '/api/band-rpg/editor';

export const bandRpgEditorApi = {
  // Levels
  listLevels:   ()                           => api.get<EditorLevel[]>(`${BASE}/levels`),
  createLevel:  (data: Partial<EditorLevel>) => api.post<EditorLevel>(`${BASE}/levels`, data),
  getLevel:     (id: string)                 => api.get<EditorLevelDetail>(`${BASE}/levels/${id}`),
  updateLevel:  (id: string, data: Partial<EditorLevel>) => api.put<EditorLevel>(`${BASE}/levels/${id}`, data),
  deleteLevel:  (id: string)                 => api.delete<void>(`${BASE}/levels/${id}`),
  saveMap:      (id: string, mapData: MapData) => api.put<EditorLevel>(`${BASE}/levels/${id}/map`, { mapData }),

  // Objectives
  listObjectives:   (levelId: string)                    => api.get<EditorObjective[]>(`${BASE}/levels/${levelId}/objectives`),
  createObjective:  (levelId: string, data: Partial<EditorObjective>) => api.post<EditorObjective>(`${BASE}/levels/${levelId}/objectives`, data),
  updateObjective:  (levelId: string, objId: string, data: Partial<EditorObjective>) => api.put<EditorObjective>(`${BASE}/levels/${levelId}/objectives/${objId}`, data),
  deleteObjective:  (levelId: string, objId: string)     => api.delete<void>(`${BASE}/levels/${levelId}/objectives/${objId}`),

  // NPCs
  listNpcs:   (levelId: string)                        => api.get<EditorNpc[]>(`${BASE}/levels/${levelId}/npcs`),
  createNpc:  (levelId: string, data: Partial<EditorNpc>) => api.post<EditorNpc>(`${BASE}/levels/${levelId}/npcs`, data),
  updateNpc:  (levelId: string, npcId: string, data: Partial<EditorNpc>) => api.put<EditorNpc>(`${BASE}/levels/${levelId}/npcs/${npcId}`, data),
  deleteNpc:  (levelId: string, npcId: string)         => api.delete<void>(`${BASE}/levels/${levelId}/npcs/${npcId}`),

  // Quests
  listQuests:   ()                            => api.get<EditorQuest[]>(`${BASE}/quests`),
  createQuest:  (data: Partial<EditorQuest>) => api.post<EditorQuest>(`${BASE}/quests`, data),
  getQuest:     (id: string)                  => api.get<EditorQuest>(`${BASE}/quests/${id}`),
  updateQuest:  (id: string, data: Partial<EditorQuest>) => api.put<EditorQuest>(`${BASE}/quests/${id}`, data),
  deleteQuest:  (id: string)                  => api.delete<void>(`${BASE}/quests/${id}`),

  // Story Arcs
  listArcs:   ()                             => api.get<EditorStoryArc[]>(`${BASE}/story/arcs`),
  createArc:  (data: Partial<EditorStoryArc>) => api.post<EditorStoryArc>(`${BASE}/story/arcs`, data),
  updateArc:  (id: string, data: Partial<EditorStoryArc>) => api.put<EditorStoryArc>(`${BASE}/story/arcs/${id}`, data),
  deleteArc:  (id: string)                   => api.delete<void>(`${BASE}/story/arcs/${id}`),

  // Story Beats
  listBeats:    (arcId: string)                          => api.get<EditorStoryBeat[]>(`${BASE}/story/arcs/${arcId}/beats`),
  createBeat:   (arcId: string, data: Partial<EditorStoryBeat>) => api.post<EditorStoryBeat>(`${BASE}/story/arcs/${arcId}/beats`, data),
  updateBeat:   (arcId: string, beatId: string, data: Partial<EditorStoryBeat>) => api.put<EditorStoryBeat>(`${BASE}/story/arcs/${arcId}/beats/${beatId}`, data),
  deleteBeat:   (arcId: string, beatId: string)          => api.delete<void>(`${BASE}/story/arcs/${arcId}/beats/${beatId}`),
  reorderBeats: (arcId: string, orderedIds: string[])    => api.put<{ ok: boolean }>(`${BASE}/story/arcs/${arcId}/beats/reorder`, { orderedIds }),

  // Items
  listItems:   (type?: string)               => api.get<EditorItem[]>(`${BASE}/items${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  createItem:  (data: Partial<EditorItem>)   => api.post<EditorItem>(`${BASE}/items`, data),
  getItem:     (id: string)                  => api.get<EditorItem>(`${BASE}/items/${id}`),
  updateItem:  (id: string, data: Partial<EditorItem>) => api.put<EditorItem>(`${BASE}/items/${id}`, data),
  deleteItem:  (id: string)                  => api.delete<void>(`${BASE}/items/${id}`),

  // Timeline
  listTimelineEvents:   ()                                      => api.get<EditorTimelineEvent[]>(`${BASE}/timeline`),
  createTimelineEvent:  (data: Partial<EditorTimelineEvent>)    => api.post<EditorTimelineEvent>(`${BASE}/timeline`, data),
  updateTimelineEvent:  (id: string, data: Partial<EditorTimelineEvent>) => api.put<EditorTimelineEvent>(`${BASE}/timeline/${id}`, data),
  deleteTimelineEvent:  (id: string)                            => api.delete<void>(`${BASE}/timeline/${id}`),
  reorderTimeline:      (orderedIds: string[])                  => api.put<{ ok: boolean }>(`${BASE}/timeline/reorder`, { orderedIds }),

  // World Systems — Phase Z.3
  listDoors:    (levelId: string)                         => api.get<EditorDoor[]>(`${BASE}/world/levels/${levelId}/doors`),
  createDoor:   (levelId: string, data: Partial<EditorDoor>) => api.post<EditorDoor>(`${BASE}/world/levels/${levelId}/doors`, data),
  updateDoor:   (levelId: string, doorId: string, data: Partial<EditorDoor>) => api.put<EditorDoor>(`${BASE}/world/levels/${levelId}/doors/${doorId}`, data),
  deleteDoor:   (levelId: string, doorId: string)         => api.delete<void>(`${BASE}/world/levels/${levelId}/doors/${doorId}`),

  listSwitches:   (levelId: string)                           => api.get<EditorSwitch[]>(`${BASE}/world/levels/${levelId}/switches`),
  createSwitch:   (levelId: string, data: Partial<EditorSwitch>) => api.post<EditorSwitch>(`${BASE}/world/levels/${levelId}/switches`, data),
  updateSwitch:   (levelId: string, switchId: string, data: Partial<EditorSwitch>) => api.put<EditorSwitch>(`${BASE}/world/levels/${levelId}/switches/${switchId}`, data),
  deleteSwitch:   (levelId: string, switchId: string)         => api.delete<void>(`${BASE}/world/levels/${levelId}/switches/${switchId}`),

  listPuzzles:   (levelId: string)                            => api.get<EditorPuzzle[]>(`${BASE}/world/levels/${levelId}/puzzles`),
  createPuzzle:  (levelId: string, data: Partial<EditorPuzzle>) => api.post<EditorPuzzle>(`${BASE}/world/levels/${levelId}/puzzles`, data),
  updatePuzzle:  (levelId: string, puzzleId: string, data: Partial<EditorPuzzle>) => api.put<EditorPuzzle>(`${BASE}/world/levels/${levelId}/puzzles/${puzzleId}`, data),
  deletePuzzle:  (levelId: string, puzzleId: string)          => api.delete<void>(`${BASE}/world/levels/${levelId}/puzzles/${puzzleId}`),
};

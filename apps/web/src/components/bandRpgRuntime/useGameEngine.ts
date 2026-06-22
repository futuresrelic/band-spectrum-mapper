import { useEffect, useReducer, useCallback, useRef } from 'react';
import type { RuntimeLevel, RuntimeNpc, RuntimeItem, RuntimeBeat, InventoryEntry, DialogueLine, SaveState } from '../../api/bandRpgRuntime';
import {
  parseReward, getObjectiveProgressDelta, isObjectiveDone,
  getRequiredCount, findTriggeredBeats, beatToDialogueLines,
  buildNpcDialogue,
} from './QuestEngine';
import type { QuestReward, ObjectiveEvent, TriggerEvent } from './QuestEngine';
import {
  isDoorOpen, canOpenDoor, doorBlockedMessage,
  findTriggeredPuzzles, evaluatePuzzleAction,
  isNpcVisible,
} from './WorldEngine';
import type { WorldSnapshot, PuzzleEvent } from './WorldEngine';

// ── State ─────────────────────────────────────────────────────────────────────

export interface GameState {
  // Spatial
  playerX: number;
  playerY: number;
  collectedEntityIds: Set<string>;

  // Dialogue (NPC or story beat)
  dialogueMode: 'none' | 'npc' | 'beat';
  activeNpc: RuntimeNpc | null;
  dialogueLines: DialogueLine[];
  dialogueIndex: number;

  // Persistent progress
  completedObjectives: string[];
  completedQuests: string[];
  inventory: InventoryEntry[];
  unlockedBeats: string[];
  activeQuestIds: string[];
  objectiveProgress: Record<string, number>;
  unlockedLevelSlugs: string[];

  // Beat queue
  pendingBeats: RuntimeBeat[];

  // World systems (Phase Z.3)
  openedDoors: string[];
  activatedSwitches: string[];
  worldState: Record<string, unknown>;

  // UI
  showDebug: boolean;
  showCheatPanel: boolean;
  notification: string | null;
  notificationTimer: number;
}

// ── Actions ───────────────────────────────────────────────────────────────────

type GameAction =
  | { type: 'LOAD_LEVEL'; level: RuntimeLevel; save: SaveState | null }
  | { type: 'MOVE'; dx: number; dy: number; level: RuntimeLevel }
  | { type: 'OPEN_NPC_DIALOGUE'; npc: RuntimeNpc; lines: DialogueLine[] }
  | { type: 'NEXT_LINE'; level: RuntimeLevel }
  | { type: 'CHOOSE'; choice: import('../../api/bandRpgRuntime').DialogueChoiceAction; level: RuntimeLevel }
  | { type: 'CLOSE_DIALOGUE' }
  | { type: 'ACCEPT_QUEST'; questId: string; level: RuntimeLevel }
  | { type: 'COMPLETE_QUEST'; questId: string; reward: QuestReward; level: RuntimeLevel }
  | { type: 'TRIGGER_BEAT'; beat: RuntimeBeat }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'TOGGLE_CHEAT_PANEL' }
  | { type: 'CHEAT_COMPLETE_QUEST'; questId: string; level: RuntimeLevel }
  | { type: 'CHEAT_GRANT_ITEM'; itemId: string; itemName: string }
  | { type: 'CHEAT_UNLOCK_LEVEL'; levelSlug: string }
  | { type: 'CHEAT_TELEPORT'; x: number; y: number }
  | { type: 'TICK_NOTIFICATION' }
  | { type: 'INTERACT_DOOR'; doorId: string; level: RuntimeLevel }
  | { type: 'ACTIVATE_SWITCH'; switchId: string; level: RuntimeLevel }
  | { type: 'APPLY_PUZZLE_ACTION'; result: import('./WorldEngine').PuzzleActionResult; level: RuntimeLevel }
  | { type: 'CHEAT_OPEN_DOOR'; doorId: string }
  | { type: 'CHEAT_ACTIVATE_SWITCH'; switchId: string; level: RuntimeLevel };

// ── Helpers ───────────────────────────────────────────────────────────────────

// Door entities own their tile's traversability: open = passable even if the base tile is wall (0).
function isTileCrossable(level: RuntimeLevel, x: number, y: number, snap: WorldSnapshot): boolean {
  if (x < 0 || y < 0 || x >= level.mapData.width || y >= level.mapData.height) return false;
  const door = level.doors.find(d => d.tileX === x && d.tileY === y);
  if (door) return isDoorOpen(door, snap);
  return (level.mapData.tiles[y]?.[x] ?? 0) === 1;
}

function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

function addToInventory(inv: InventoryEntry[], itemId: string): InventoryEntry[] {
  const idx = inv.findIndex(e => e.itemId === itemId);
  if (idx >= 0) return inv.map((e, i) => i === idx ? { ...e, quantity: e.quantity + 1 } : e);
  return [...inv, { itemId, quantity: 1 }];
}

function findAdjacentNpc(px: number, py: number, npcs: RuntimeNpc[]): RuntimeNpc | null {
  return npcs.find(n => isAdjacent(px, py, n.tileX, n.tileY)) ?? null;
}

// Build a WorldSnapshot for condition evaluation
function toWorldSnapshot(s: GameState): WorldSnapshot {
  return {
    inventory: s.inventory,
    activeQuestIds: s.activeQuestIds,
    completedQuests: s.completedQuests,
    unlockedBeats: s.unlockedBeats,
    activatedSwitches: s.activatedSwitches,
    openedDoors: s.openedDoors,
    worldState: s.worldState,
  };
}

// Apply triggered puzzles to state
function applyPuzzleTrigger(
  state: GameState,
  event: PuzzleEvent,
  level: RuntimeLevel,
): GameState {
  const snap = toWorldSnapshot(state);
  const triggered = findTriggeredPuzzles(event, level.puzzles, snap);
  let s = state;
  for (const puzzle of triggered) {
    s = reducer(s, { type: 'APPLY_PUZZLE_ACTION', result: evaluatePuzzleAction(puzzle.action), level });
  }
  return s;
}

// Apply an objective event against all active quest objectives, returning updated state
function applyObjectiveEvent(
  state: GameState,
  event: ObjectiveEvent,
  level: RuntimeLevel,
): GameState {
  let s = state;
  for (const questId of s.activeQuestIds) {
    const quest = level.quests.find(q => q.id === questId);
    if (!quest) continue;
    const ids: string[] = Array.isArray(quest.objectiveIds) ? quest.objectiveIds as string[] : [];
    for (const objId of ids) {
      const obj = level.objectives.find(o => o.id === objId);
      if (!obj || obj.isOptional) continue;
      if (isObjectiveDone(obj, s.completedObjectives, s.objectiveProgress)) continue;
      const delta = getObjectiveProgressDelta(obj, event);
      if (delta === 0) continue;
      const prev = s.objectiveProgress[objId] ?? 0;
      const next = prev + delta;
      const required = getRequiredCount(obj);
      if (next >= required) {
        // Objective complete
        const trigEvent: TriggerEvent = { type: 'objective_complete', targetId: objId };
        const triggered = findTriggeredBeats(trigEvent, level.beats, s.unlockedBeats);
        s = {
          ...s,
          completedObjectives: [...s.completedObjectives, objId],
          objectiveProgress: { ...s.objectiveProgress, [objId]: required },
          pendingBeats: [...s.pendingBeats, ...triggered],
        };
      } else {
        s = { ...s, objectiveProgress: { ...s.objectiveProgress, [objId]: next } };
      }
    }
  }
  return s;
}

// Apply item collection to state (inventory + objectives + beats)
function applyItemCollect(state: GameState, item: RuntimeItem, level: RuntimeLevel): GameState {
  const newCollected = new Set(state.collectedEntityIds);
  newCollected.add(item.entityId);
  let s: GameState = {
    ...state,
    collectedEntityIds: newCollected,
    inventory: addToInventory(state.inventory, item.id),
    notification: `Picked up: ${item.name}`,
    notificationTimer: 120,
  };
  s = applyObjectiveEvent(s, { type: 'collect_item', itemId: item.id }, level);
  const triggered = findTriggeredBeats({ type: 'item_collected', targetId: item.id }, level.beats, s.unlockedBeats);
  if (triggered.length > 0) s = { ...s, pendingBeats: [...s.pendingBeats, ...triggered] };
  return s;
}

// Apply quest reward to state
function applyReward(state: GameState, reward: QuestReward): GameState {
  let s = state;
  const note = reward.message ?? (reward.xp ? `+${reward.xp} XP` : 'Quest complete!');
  s = { ...s, notification: note, notificationTimer: 180 };
  if (reward.items) {
    for (const { itemId } of reward.items) {
      s = { ...s, inventory: addToInventory(s.inventory, itemId) };
    }
  }
  if (reward.unlockLevelSlug && !s.unlockedLevelSlugs.includes(reward.unlockLevelSlug)) {
    s = { ...s, unlockedLevelSlugs: [...s.unlockedLevelSlugs, reward.unlockLevelSlug] };
  }
  if (reward.unlockBeatId && !s.unlockedBeats.includes(reward.unlockBeatId)) {
    // Don't add to unlockedBeats here — we'll trigger it as a beat to show
  }
  return s;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'LOAD_LEVEL': {
      const { level, save } = action;
      const completedObjectives = save?.completedObjectives ?? [];
      const completedQuests = save?.completedQuests ?? [];
      const inventory = save?.inventory ?? [];
      const unlockedBeats = save?.unlockedStoryBeats ?? [];
      const activeQuestIds = save?.activeQuestIds ?? [];
      const objectiveProgress = save?.objectiveProgress ?? {};
      const unlockedLevelSlugs = save?.unlockedLevelSlugs ?? [];
      const openedDoors = save?.openedDoors ?? [];
      const activatedSwitches = save?.activatedSwitches ?? [];
      const worldState = save?.worldState ?? {};

      // Find beats to trigger on level enter
      const enterBeats = findTriggeredBeats(
        { type: 'level_enter', targetId: level.slug },
        level.beats,
        unlockedBeats,
      );
      return {
        ...state,
        playerX: level.spawnX,
        playerY: level.spawnY,
        collectedEntityIds: new Set<string>(),
        dialogueMode: 'none',
        activeNpc: null,
        dialogueLines: [],
        dialogueIndex: 0,
        completedObjectives,
        completedQuests,
        inventory,
        unlockedBeats,
        activeQuestIds,
        objectiveProgress,
        unlockedLevelSlugs,
        pendingBeats: enterBeats,
        openedDoors,
        activatedSwitches,
        worldState,
        notification: null,
        notificationTimer: 0,
      };
    }

    case 'MOVE': {
      const { dx, dy, level } = action;
      if (state.dialogueMode !== 'none') return state;
      const newX = state.playerX + dx;
      const newY = state.playerY + dy;
      if (!isTileCrossable(level, newX, newY, toWorldSnapshot(state))) return state;

      let s: GameState = { ...state, playerX: newX, playerY: newY };

      // Item pickup at destination
      const itemAt = level.items.find(
        i => i.tileX === newX && i.tileY === newY && !state.collectedEntityIds.has(i.entityId)
      );
      if (itemAt) s = applyItemCollect(s, itemAt, level);

      // ReachLocation objectives
      s = applyObjectiveEvent(s, { type: 'reach_location', x: newX, y: newY }, level);

      // Show next pending beat when idle (no dialogue already open)
      if (s.dialogueMode === 'none' && s.pendingBeats.length > 0) {
        const nextBeat = s.pendingBeats[0]!;
        const remaining = s.pendingBeats.slice(1);
        return {
          ...s,
          pendingBeats: remaining,
          dialogueMode: 'beat',
          dialogueLines: beatToDialogueLines(nextBeat),
          dialogueIndex: 0,
          unlockedBeats: [...s.unlockedBeats, nextBeat.id],
        };
      }
      return s;
    }

    case 'OPEN_NPC_DIALOGUE':
      return {
        ...state,
        dialogueMode: 'npc',
        activeNpc: action.npc,
        dialogueLines: action.lines,
        dialogueIndex: 0,
      };

    case 'TRIGGER_BEAT': {
      if (state.unlockedBeats.includes(action.beat.id)) return state;
      return {
        ...state,
        dialogueMode: 'beat',
        dialogueLines: beatToDialogueLines(action.beat),
        dialogueIndex: 0,
        unlockedBeats: [...state.unlockedBeats, action.beat.id],
        pendingBeats: state.pendingBeats.filter(b => b.id !== action.beat.id),
      };
    }

    case 'NEXT_LINE': {
      const next = state.dialogueIndex + 1;
      if (next < state.dialogueLines.length) {
        return { ...state, dialogueIndex: next };
      }
      // End of dialogue
      let s: GameState = { ...state, dialogueMode: 'none', activeNpc: null, dialogueLines: [], dialogueIndex: 0 };

      // Fire talk_to_npc objective if closing NPC dialogue
      if (state.dialogueMode === 'npc' && state.activeNpc) {
        const event: ObjectiveEvent = { type: 'talk_to_npc', npcId: state.activeNpc.id };
        s = applyObjectiveEvent(s, event, action.level);
        const triggered = findTriggeredBeats({ type: 'npc_interact', targetId: state.activeNpc.id }, action.level.beats, s.unlockedBeats);
        if (triggered.length > 0) s = { ...s, pendingBeats: [...s.pendingBeats, ...triggered] };
      }

      // Show next pending beat
      if (s.pendingBeats.length > 0) {
        const nextBeat = s.pendingBeats[0]!;
        return {
          ...s,
          pendingBeats: s.pendingBeats.slice(1),
          dialogueMode: 'beat',
          dialogueLines: beatToDialogueLines(nextBeat),
          dialogueIndex: 0,
          unlockedBeats: [...s.unlockedBeats, nextBeat.id],
        };
      }
      return s;
    }

    case 'CHOOSE': {
      const { choice, level } = action;
      if (choice.type === 'close') {
        return { ...state, dialogueMode: 'none', activeNpc: null, dialogueLines: [], dialogueIndex: 0 };
      }
      if (choice.type === 'accept_quest' && choice.targetId) {
        // Dispatch inline
        return reducer(state, { type: 'ACCEPT_QUEST', questId: choice.targetId, level });
      }
      if (choice.type === 'complete_quest' && choice.targetId) {
        const quest = level.quests.find(q => q.id === choice.targetId);
        const reward = quest ? parseReward(quest.reward) : {};
        return reducer(state, { type: 'COMPLETE_QUEST', questId: choice.targetId, reward, level });
      }
      if (choice.type === 'give_item' && choice.targetId) {
        return {
          ...state,
          inventory: addToInventory(state.inventory, choice.targetId),
          dialogueMode: 'none',
          activeNpc: null,
          dialogueLines: [],
          dialogueIndex: 0,
          notification: 'Item received!',
          notificationTimer: 120,
        };
      }
      return state;
    }

    case 'CLOSE_DIALOGUE':
      return { ...state, dialogueMode: 'none', activeNpc: null, dialogueLines: [], dialogueIndex: 0 };

    case 'ACCEPT_QUEST': {
      const { questId, level } = action;
      if (state.activeQuestIds.includes(questId) || state.completedQuests.includes(questId)) return state;
      const triggered = findTriggeredBeats({ type: 'quest_start', targetId: questId }, level.beats, state.unlockedBeats);
      let s: GameState = {
        ...state,
        activeQuestIds: [...state.activeQuestIds, questId],
        dialogueMode: 'none',
        activeNpc: null,
        dialogueLines: [],
        dialogueIndex: 0,
        notification: 'Quest accepted!',
        notificationTimer: 150,
        pendingBeats: [...state.pendingBeats, ...triggered],
      };
      s = applyPuzzleTrigger(s, { type: 'quest_start', targetId: questId }, level);
      return s;
    }

    case 'COMPLETE_QUEST': {
      const { questId, reward, level } = action;
      if (!state.activeQuestIds.includes(questId)) return state;
      let s: GameState = {
        ...state,
        activeQuestIds: state.activeQuestIds.filter(id => id !== questId),
        completedQuests: [...state.completedQuests, questId],
        dialogueMode: 'none',
        activeNpc: null,
        dialogueLines: [],
        dialogueIndex: 0,
      };
      s = applyReward(s, reward);
      const triggered = findTriggeredBeats({ type: 'quest_complete', targetId: questId }, level.beats, s.unlockedBeats);
      if (triggered.length > 0) s = { ...s, pendingBeats: [...s.pendingBeats, ...triggered] };
      // Unlock reward beat if specified
      if (reward.unlockBeatId) {
        const beat = level.beats.find(b => b.id === reward.unlockBeatId);
        if (beat && !s.unlockedBeats.includes(beat.id)) {
          s = {
            ...s,
            pendingBeats: [...s.pendingBeats, beat],
          };
        }
      }
      // Check complete_quest objectives for any active quests
      s = applyObjectiveEvent(s, { type: 'complete_quest', questId }, level);
      // Fire puzzle triggers on quest complete
      s = applyPuzzleTrigger(s, { type: 'quest_complete', targetId: questId }, level);
      return s;
    }

    case 'TOGGLE_DEBUG':
      return { ...state, showDebug: !state.showDebug };

    case 'TOGGLE_CHEAT_PANEL':
      return { ...state, showCheatPanel: !state.showCheatPanel };

    case 'CHEAT_COMPLETE_QUEST': {
      const { questId, level } = action;
      const quest = level.quests.find(q => q.id === questId);
      const reward = quest ? parseReward(quest.reward) : {};
      if (state.activeQuestIds.includes(questId)) {
        return reducer(state, { type: 'COMPLETE_QUEST', questId, reward, level });
      }
      // If not active yet, activate and immediately complete
      const s1 = reducer(state, { type: 'ACCEPT_QUEST', questId, level });
      return reducer(s1, { type: 'COMPLETE_QUEST', questId, reward, level });
    }

    case 'CHEAT_GRANT_ITEM':
      return {
        ...state,
        inventory: addToInventory(state.inventory, action.itemId),
        notification: `[CHEAT] Granted: ${action.itemName}`,
        notificationTimer: 120,
      };

    case 'CHEAT_UNLOCK_LEVEL':
      if (state.unlockedLevelSlugs.includes(action.levelSlug)) return state;
      return {
        ...state,
        unlockedLevelSlugs: [...state.unlockedLevelSlugs, action.levelSlug],
        notification: `[CHEAT] Unlocked level: ${action.levelSlug}`,
        notificationTimer: 120,
      };

    case 'CHEAT_TELEPORT':
      return { ...state, playerX: action.x, playerY: action.y };

    case 'TICK_NOTIFICATION': {
      const t = state.notificationTimer - 1;
      return { ...state, notificationTimer: t, notification: t <= 0 ? null : state.notification };
    }

    case 'CHEAT_OPEN_DOOR':
      if (state.openedDoors.includes(action.doorId)) return state;
      return {
        ...state,
        openedDoors: [...state.openedDoors, action.doorId],
        notification: '[CHEAT] Door opened',
        notificationTimer: 120,
      };

    case 'CHEAT_ACTIVATE_SWITCH': {
      const { switchId, level } = action;
      return reducer(state, { type: 'ACTIVATE_SWITCH', switchId, level });
    }

    case 'INTERACT_DOOR': {
      const { doorId, level } = action;
      const door = level.doors.find(d => d.id === doorId);
      if (!door) return state;
      if (isDoorOpen(door, toWorldSnapshot(state))) return state;
      if (canOpenDoor(door, toWorldSnapshot(state))) {
        let s: GameState = {
          ...state,
          openedDoors: [...state.openedDoors, doorId],
          notification: `${door.label ?? door.name} opened!`,
          notificationTimer: 120,
        };
        s = applyPuzzleTrigger(s, { type: 'switch_activated', targetId: doorId }, level);
        return s;
      }
      return {
        ...state,
        notification: doorBlockedMessage(door),
        notificationTimer: 150,
      };
    }

    case 'ACTIVATE_SWITCH': {
      const { switchId, level } = action;
      const sw = level.switches.find(s => s.id === switchId);
      if (!sw) return state;
      if (state.activatedSwitches.includes(switchId)) return state; // already on
      let s: GameState = {
        ...state,
        activatedSwitches: [...state.activatedSwitches, switchId],
        notification: `${sw.label ?? sw.name} activated!`,
        notificationTimer: 120,
      };
      // Apply the switch's own effect
      const immediateResult = evaluatePuzzleAction(sw.effect);
      s = reducer(s, { type: 'APPLY_PUZZLE_ACTION', result: immediateResult, level });
      // Fire puzzle triggers for switch activation
      s = applyPuzzleTrigger(s, { type: 'switch_activated', targetId: switchId }, level);
      return s;
    }

    case 'APPLY_PUZZLE_ACTION': {
      const { result, level } = action;
      let s = state;
      if (result.openDoorId && !s.openedDoors.includes(result.openDoorId)) {
        s = { ...s, openedDoors: [...s.openedDoors, result.openDoorId] };
      }
      if (result.closeDoorId) {
        s = { ...s, openedDoors: s.openedDoors.filter(id => id !== result.closeDoorId) };
      }
      if (result.unlockLevelSlug && !s.unlockedLevelSlugs.includes(result.unlockLevelSlug)) {
        s = { ...s, unlockedLevelSlugs: [...s.unlockedLevelSlugs, result.unlockLevelSlug] };
      }
      if (result.worldStateKey !== undefined) {
        s = { ...s, worldState: { ...s.worldState, [result.worldStateKey]: result.worldStateValue } };
      }
      if (result.grantItemId) {
        s = { ...s, inventory: addToInventory(s.inventory, result.grantItemId) };
      }
      if (result.activateBeatId) {
        const beat = level.beats.find(b => b.id === result.activateBeatId);
        if (beat && !s.unlockedBeats.includes(beat.id)) {
          s = { ...s, pendingBeats: [...s.pendingBeats, beat] };
        }
      }
      return s;
    }
  }
}

function makeEmptyLevel(): RuntimeLevel {
  return {
    id: '', slug: '', name: '', background: null,
    mapData: { width: 1, height: 1, tiles: [[1]], entities: [] },
    spawnX: 0, spawnY: 0,
    npcs: [], items: [], exits: [], quests: [], beats: [], objectives: [],
    doors: [], switches: [], puzzles: [],
  };
}

function initState(level: RuntimeLevel, save: SaveState | null): GameState {
  const enterBeats = findTriggeredBeats({ type: 'level_enter', targetId: level.slug }, level.beats, save?.unlockedStoryBeats ?? []);
  return {
    playerX: level.spawnX,
    playerY: level.spawnY,
    collectedEntityIds: new Set<string>(),
    dialogueMode: 'none',
    activeNpc: null,
    dialogueLines: [],
    dialogueIndex: 0,
    completedObjectives: save?.completedObjectives ?? [],
    completedQuests: save?.completedQuests ?? [],
    inventory: save?.inventory ?? [],
    unlockedBeats: save?.unlockedStoryBeats ?? [],
    activeQuestIds: save?.activeQuestIds ?? [],
    objectiveProgress: save?.objectiveProgress ?? {},
    unlockedLevelSlugs: save?.unlockedLevelSlugs ?? [],
    pendingBeats: enterBeats,
    openedDoors: save?.openedDoors ?? [],
    activatedSwitches: save?.activatedSwitches ?? [],
    worldState: save?.worldState ?? {},
    showDebug: false,
    showCheatPanel: false,
    notification: null,
    notificationTimer: 0,
  };
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface GameEngineControls {
  state: GameState;
  getAdjacentNpc: () => RuntimeNpc | null;
  isLevelLocked: (slug: string) => boolean;
  getWorldSnapshot: () => WorldSnapshot;
  handleMove: (dx: number, dy: number) => void;
  handleInteract: () => void;
  handleNextLine: () => void;
  handleChoose: (action: import('../../api/bandRpgRuntime').DialogueChoiceAction) => void;
  handleCloseDlg: () => void;
  handleCloseCheat: () => void;
  cheatCompleteQuest: (questId: string) => void;
  cheatGrantItem: (itemId: string, itemName: string) => void;
  cheatUnlockLevel: (levelSlug: string) => void;
  cheatTeleport: (x: number, y: number) => void;
  cheatOpenDoor: (doorId: string) => void;
  cheatActivateSwitch: (switchId: string) => void;
}

export function useGameEngine(
  level: RuntimeLevel | null,
  save: SaveState | null,
  onLevelTransition: (slug: string) => void,
  onSave: (state: GameState, levelSlug: string) => void,
  isAdmin: boolean,
): GameEngineControls {
  const [state, dispatch] = useReducer(
    reducer,
    null,
    () => initState(level ?? makeEmptyLevel(), save),
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  // Load level when it changes
  useEffect(() => {
    if (level) dispatch({ type: 'LOAD_LEVEL', level, save });
  }, [level?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notification ticker
  useEffect(() => {
    if (state.notificationTimer <= 0) return;
    const id = setTimeout(() => dispatch({ type: 'TICK_NOTIFICATION' }), 16);
    return () => clearTimeout(id);
  }, [state.notificationTimer]);

  // Show first pending beat when dialogue is closed
  useEffect(() => {
    if (state.dialogueMode !== 'none' || state.pendingBeats.length === 0) return;
    const next = state.pendingBeats[0];
    if (next) dispatch({ type: 'TRIGGER_BEAT', beat: next });
  }, [state.dialogueMode, state.pendingBeats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard handler
  useEffect(() => {
    if (!level) return;
    const lv = level;

    function handleKey(e: KeyboardEvent) {
      const s = stateRef.current;

      if (e.key === 'F3' && isAdmin) { e.preventDefault(); dispatch({ type: 'TOGGLE_DEBUG' }); return; }
      if (e.key === 'F4' && isAdmin) { e.preventDefault(); dispatch({ type: 'TOGGLE_CHEAT_PANEL' }); return; }

      // Dialogue: choices shown — do NOT intercept E/Enter (handled by choice buttons)
      const currentLine = s.dialogueLines[s.dialogueIndex];
      if (s.dialogueMode !== 'none' && currentLine?.choices && currentLine.choices.length > 0) {
        if (e.key === 'Escape') { dispatch({ type: 'CLOSE_DIALOGUE' }); }
        return; // Block movement and E-advance when choices are showing
      }

      if (s.dialogueMode !== 'none') {
        if (e.key === 'Escape') { dispatch({ type: 'CLOSE_DIALOGUE' }); return; }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          dispatch({ type: 'NEXT_LINE', level: lv });
          return;
        }
        return;
      }

      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
        ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
        ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
      };
      const move = moves[e.key];
      if (move) {
        e.preventDefault();
        const [dx, dy] = move;
        dispatch({ type: 'MOVE', dx, dy, level: lv });
        const newX = s.playerX + dx;
        const newY = s.playerY + dy;
        if (isTileCrossable(lv, newX, newY, toWorldSnapshot(s))) {
          const exit = lv.exits.find(ex => ex.tileX === newX && ex.tileY === newY);
          if (exit) {
            const locked = s.unlockedLevelSlugs.length > 0 && !s.unlockedLevelSlugs.includes(exit.targetLevelSlug);
            if (!locked) onLevelTransition(exit.targetLevelSlug);
          }
        }
        return;
      }

      if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
        e.preventDefault();
        const snap = toWorldSnapshot(s);

        // Check adjacent door first
        const adjDoor = lv.doors.find(d => isAdjacent(s.playerX, s.playerY, d.tileX, d.tileY));
        if (adjDoor) {
          dispatch({ type: 'INTERACT_DOOR', doorId: adjDoor.id, level: lv });
          return;
        }

        // Check adjacent switch
        const adjSwitch = lv.switches.find(sw => isAdjacent(s.playerX, s.playerY, sw.tileX, sw.tileY));
        if (adjSwitch) {
          dispatch({ type: 'ACTIVATE_SWITCH', switchId: adjSwitch.id, level: lv });
          return;
        }

        // NPC — filter by visibility condition
        const visibleNpcs = lv.npcs.filter(n => isNpcVisible(n, snap));
        const adj = findAdjacentNpc(s.playerX, s.playerY, visibleNpcs);
        if (adj) {
          const lines = buildNpcDialogue(
            adj.id, adj.name, adj.portraitUrl, adj.dialogue,
            lv.quests, s.activeQuestIds, s.completedQuests,
            lv.objectives, s.completedObjectives, s.objectiveProgress,
          );
          dispatch({ type: 'OPEN_NPC_DIALOGUE', npc: adj, lines });
        }
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [level, isAdmin, onLevelTransition]);

  // Auto-save when progress changes
  const prevKey = useRef('');
  useEffect(() => {
    if (!level) return;
    const key = JSON.stringify([
      state.completedObjectives, state.completedQuests,
      state.activeQuestIds, state.inventory.length, state.unlockedLevelSlugs,
      state.openedDoors, state.activatedSwitches,
    ]);
    if (key === prevKey.current) return;
    prevKey.current = key;
    onSave(state, level.slug);
  }, [state.completedObjectives, state.completedQuests, state.activeQuestIds, state.inventory, state.unlockedLevelSlugs, state.openedDoors, state.activatedSwitches, level, onSave]); // eslint-disable-line react-hooks/exhaustive-deps

  const getAdjacentNpc = useCallback((): RuntimeNpc | null => {
    if (!level) return null;
    return findAdjacentNpc(stateRef.current.playerX, stateRef.current.playerY, level.npcs);
  }, [level]);

  const isLevelLocked = useCallback((slug: string): boolean => {
    const s = stateRef.current;
    // A level is only locked if there are explicit unlock slugs and this one isn't included
    // (If unlockedLevelSlugs is empty, all levels are accessible — no locks configured yet)
    if (s.unlockedLevelSlugs.length === 0) return false;
    return !s.unlockedLevelSlugs.includes(slug);
  }, []);

  const cheatCompleteQuest = useCallback((questId: string) => {
    if (level) dispatch({ type: 'CHEAT_COMPLETE_QUEST', questId, level });
  }, [level]);

  const cheatGrantItem = useCallback((itemId: string, itemName: string) => {
    dispatch({ type: 'CHEAT_GRANT_ITEM', itemId, itemName });
  }, []);

  const cheatUnlockLevel = useCallback((levelSlug: string) => {
    dispatch({ type: 'CHEAT_UNLOCK_LEVEL', levelSlug });
  }, []);

  const cheatTeleport = useCallback((x: number, y: number) => {
    dispatch({ type: 'CHEAT_TELEPORT', x, y });
  }, []);

  const handleNextLine = useCallback(() => {
    if (level) dispatch({ type: 'NEXT_LINE', level });
  }, [level]);

  const handleChoose = useCallback((action: import('../../api/bandRpgRuntime').DialogueChoiceAction) => {
    if (level) dispatch({ type: 'CHOOSE', choice: action, level });
  }, [level]);

  const handleCloseDlg = useCallback(() => {
    dispatch({ type: 'CLOSE_DIALOGUE' });
  }, []);

  const handleCloseCheat = useCallback(() => {
    dispatch({ type: 'TOGGLE_CHEAT_PANEL' });
  }, []);

  const getWorldSnapshot = useCallback((): WorldSnapshot => toWorldSnapshot(stateRef.current), []);

  const cheatOpenDoor = useCallback((doorId: string) => {
    dispatch({ type: 'CHEAT_OPEN_DOOR', doorId });
  }, []);

  const cheatActivateSwitch = useCallback((switchId: string) => {
    if (level) dispatch({ type: 'CHEAT_ACTIVATE_SWITCH', switchId, level });
  }, [level]);

  // Mobile / programmatic movement
  const handleMove = useCallback((dx: number, dy: number) => {
    if (!level) return;
    const lv = level;
    const s = stateRef.current;
    // Don't move during dialogue
    if (s.dialogueMode !== 'none') return;
    dispatch({ type: 'MOVE', dx, dy, level: lv });
    const newX = s.playerX + dx;
    const newY = s.playerY + dy;
    if (isTileCrossable(lv, newX, newY, toWorldSnapshot(s))) {
      const exit = lv.exits.find(ex => ex.tileX === newX && ex.tileY === newY);
      if (exit) {
        const locked = s.unlockedLevelSlugs.length > 0 && !s.unlockedLevelSlugs.includes(exit.targetLevelSlug);
        if (!locked) onLevelTransition(exit.targetLevelSlug);
      }
    }
  }, [level, onLevelTransition]);

  const handleInteract = useCallback(() => {
    if (!level) return;
    const lv = level;
    const s = stateRef.current;

    // In dialogue: advance line
    if (s.dialogueMode !== 'none') {
      const currentLine = s.dialogueLines[s.dialogueIndex];
      if (!currentLine?.choices || currentLine.choices.length === 0) {
        dispatch({ type: 'NEXT_LINE', level: lv });
      }
      return;
    }

    const snap = toWorldSnapshot(s);
    const adjDoor = lv.doors.find(d => isAdjacent(s.playerX, s.playerY, d.tileX, d.tileY));
    if (adjDoor) { dispatch({ type: 'INTERACT_DOOR', doorId: adjDoor.id, level: lv }); return; }
    const adjSwitch = lv.switches.find(sw => isAdjacent(s.playerX, s.playerY, sw.tileX, sw.tileY));
    if (adjSwitch) { dispatch({ type: 'ACTIVATE_SWITCH', switchId: adjSwitch.id, level: lv }); return; }
    const visibleNpcs = lv.npcs.filter(n => isNpcVisible(n, snap));
    const adj = findAdjacentNpc(s.playerX, s.playerY, visibleNpcs);
    if (adj) {
      const lines = buildNpcDialogue(
        adj.id, adj.name, adj.portraitUrl, adj.dialogue,
        lv.quests, s.activeQuestIds, s.completedQuests,
        lv.objectives, s.completedObjectives, s.objectiveProgress,
      );
      dispatch({ type: 'OPEN_NPC_DIALOGUE', npc: adj, lines });
    }
  }, [level]);

  return {
    state, getAdjacentNpc, isLevelLocked, getWorldSnapshot,
    handleMove, handleInteract,
    handleNextLine, handleChoose, handleCloseDlg, handleCloseCheat,
    cheatCompleteQuest, cheatGrantItem, cheatUnlockLevel, cheatTeleport,
    cheatOpenDoor, cheatActivateSwitch,
  };
}

export { isAdjacent };

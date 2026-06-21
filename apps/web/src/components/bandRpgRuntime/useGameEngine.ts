import { useEffect, useReducer, useCallback, useRef } from 'react';
import type { RuntimeLevel, RuntimeNpc, InventoryEntry } from '../../api/bandRpgRuntime';
import type { SaveState } from '../../api/bandRpgRuntime';

// ── State ─────────────────────────────────────────────────────────────────────

export interface GameState {
  playerX: number;
  playerY: number;
  collectedEntityIds: Set<string>;
  activeNpc: RuntimeNpc | null;
  dialogueIndex: number;
  completedObjectives: string[];
  completedQuests: string[];
  inventory: InventoryEntry[];
  unlockedBeats: string[];
  showDebug: boolean;
  notification: string | null;
  notificationTimer: number;
}

type GameAction =
  | { type: 'MOVE'; dx: number; dy: number; level: RuntimeLevel }
  | { type: 'OPEN_DIALOGUE'; npc: RuntimeNpc }
  | { type: 'NEXT_DIALOGUE' }
  | { type: 'CLOSE_DIALOGUE' }
  | { type: 'COLLECT_ITEM'; entityId: string; itemId: string; name: string; scoreValue: number }
  | { type: 'COMPLETE_OBJECTIVE'; objectiveId: string }
  | { type: 'COMPLETE_QUEST'; questId: string }
  | { type: 'UNLOCK_BEAT'; beatId: string }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'TICK_NOTIFICATION' }
  | { type: 'LOAD_SAVE'; save: SaveState; level: RuntimeLevel };

function initState(level: RuntimeLevel, save: SaveState | null): GameState {
  return {
    playerX: level.spawnX,
    playerY: level.spawnY,
    collectedEntityIds: new Set(save?.completedObjectives ?? []),
    activeNpc: null,
    dialogueIndex: 0,
    completedObjectives: save?.completedObjectives ?? [],
    completedQuests: save?.completedQuests ?? [],
    inventory: save?.inventory ?? [],
    unlockedBeats: save?.unlockedStoryBeats ?? [],
    showDebug: false,
    notification: null,
    notificationTimer: 0,
  };
}

function canMoveTo(level: RuntimeLevel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.mapData.width || y >= level.mapData.height) return false;
  const tile = level.mapData.tiles[y]?.[x] ?? 0;
  return tile === 1; // only floor tiles are passable
}

function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

function addToInventory(inv: InventoryEntry[], itemId: string): InventoryEntry[] {
  const existing = inv.findIndex(e => e.itemId === itemId);
  if (existing >= 0) {
    return inv.map((e, i) =>
      i === existing ? { ...e, quantity: e.quantity + 1 } : e
    );
  }
  return [...inv, { itemId, quantity: 1 }];
}

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'LOAD_SAVE': {
      const { save, level } = action;
      return {
        ...state,
        playerX: level.spawnX,
        playerY: level.spawnY,
        completedObjectives: save.completedObjectives,
        completedQuests: save.completedQuests,
        inventory: save.inventory,
        unlockedBeats: save.unlockedStoryBeats,
      };
    }

    case 'MOVE': {
      const { dx, dy, level } = action;
      if (state.activeNpc) return state; // block movement during dialogue

      const newX = state.playerX + dx;
      const newY = state.playerY + dy;
      if (!canMoveTo(level, newX, newY)) return state;

      // Check item pickup at new position
      const itemAt = level.items.find(
        i => i.tileX === newX && i.tileY === newY && !state.collectedEntityIds.has(i.entityId)
      );

      if (itemAt) {
        const newCollected = new Set(state.collectedEntityIds);
        newCollected.add(itemAt.entityId);
        const newInventory = addToInventory(state.inventory, itemAt.id);
        return {
          ...state,
          playerX: newX,
          playerY: newY,
          collectedEntityIds: newCollected,
          inventory: newInventory,
          notification: `Picked up: ${itemAt.name}`,
          notificationTimer: 120,
        };
      }

      return { ...state, playerX: newX, playerY: newY };
    }

    case 'OPEN_DIALOGUE':
      return { ...state, activeNpc: action.npc, dialogueIndex: 0 };

    case 'NEXT_DIALOGUE': {
      if (!state.activeNpc) return state;
      const nextIdx = state.dialogueIndex + 1;
      if (nextIdx >= state.activeNpc.dialogue.length) {
        return { ...state, activeNpc: null, dialogueIndex: 0 };
      }
      return { ...state, dialogueIndex: nextIdx };
    }

    case 'CLOSE_DIALOGUE':
      return { ...state, activeNpc: null, dialogueIndex: 0 };

    case 'COLLECT_ITEM': {
      const { entityId, itemId } = action;
      if (state.collectedEntityIds.has(entityId)) return state;
      const newCollected = new Set(state.collectedEntityIds);
      newCollected.add(entityId);
      return {
        ...state,
        collectedEntityIds: newCollected,
        inventory: addToInventory(state.inventory, itemId),
        notification: `Picked up: ${action.name}`,
        notificationTimer: 120,
      };
    }

    case 'COMPLETE_OBJECTIVE':
      if (state.completedObjectives.includes(action.objectiveId)) return state;
      return {
        ...state,
        completedObjectives: [...state.completedObjectives, action.objectiveId],
        notification: 'Objective complete!',
        notificationTimer: 120,
      };

    case 'COMPLETE_QUEST':
      if (state.completedQuests.includes(action.questId)) return state;
      return {
        ...state,
        completedQuests: [...state.completedQuests, action.questId],
        notification: 'Quest complete!',
        notificationTimer: 150,
      };

    case 'UNLOCK_BEAT':
      if (state.unlockedBeats.includes(action.beatId)) return state;
      return { ...state, unlockedBeats: [...state.unlockedBeats, action.beatId] };

    case 'TOGGLE_DEBUG':
      return { ...state, showDebug: !state.showDebug };

    case 'TICK_NOTIFICATION':
      if (state.notificationTimer <= 0) return state;
      const newTimer = state.notificationTimer - 1;
      return {
        ...state,
        notificationTimer: newTimer,
        notification: newTimer <= 0 ? null : state.notification,
      };
  }
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface UseGameEngineResult {
  state: GameState;
  interactWithNearbyNpc: () => void;
  advanceDialogue: () => void;
  closeDialogue: () => void;
  getAdjacentNpc: () => RuntimeNpc | null;
}

export function useGameEngine(
  level: RuntimeLevel | null,
  save: SaveState | null,
  onLevelTransition: (slug: string) => void,
  onSave: (state: GameState, levelSlug: string) => void,
  isAdmin: boolean,
): UseGameEngineResult {
  const [state, dispatch] = useReducer(
    reducer,
    null,
    () => initState(level ?? makeEmptyLevel(), save),
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  // Load save when level or save changes
  useEffect(() => {
    if (level && save) {
      dispatch({ type: 'LOAD_SAVE', save, level });
    }
  }, [level?.id, save]); // eslint-disable-line react-hooks/exhaustive-deps

    // Notification ticker
  useEffect(() => {
    if (state.notificationTimer <= 0) return;
    const id = setTimeout(() => dispatch({ type: 'TICK_NOTIFICATION' }), 16);
    return () => clearTimeout(id);
  }, [state.notificationTimer]);

  // Keyboard input
  useEffect(() => {
    if (!level) return;
    const lv = level; // narrowed to RuntimeLevel for use inside handleKey closure

    function handleKey(e: KeyboardEvent) {
      const s = stateRef.current;

      // Admin debug toggle
      if (e.key === 'F3' && isAdmin) {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_DEBUG' });
        return;
      }

      // Dialogue navigation
      if (s.activeNpc) {
        if (e.key === 'Escape') { dispatch({ type: 'CLOSE_DIALOGUE' }); return; }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          dispatch({ type: 'NEXT_DIALOGUE' });
          return;
        }
        return; // Block movement during dialogue
      }

      // Movement
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

        // Check exit after moving
        const newX = s.playerX + dx;
        const newY = s.playerY + dy;
        const exit = lv.exits.find(ex => ex.tileX === newX && ex.tileY === newY);
        if (exit) {
          onLevelTransition(exit.targetLevelSlug);
        }
        return;
      }

      // Interact
      if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
        e.preventDefault();
        const adj = findAdjacentNpc(s.playerX, s.playerY, lv.npcs);
        if (adj) {
          dispatch({ type: 'OPEN_DIALOGUE', npc: adj });
        }
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [level, isAdmin, onLevelTransition]);

  // Auto-save when inventory or quests change
  const prevSaveKey = useRef('');
  useEffect(() => {
    if (!level) return;
    const key = JSON.stringify([state.completedObjectives, state.completedQuests, state.inventory.length]);
    if (key === prevSaveKey.current) return;
    prevSaveKey.current = key;
    onSave(state, level.slug);
  }, [state.completedObjectives, state.completedQuests, state.inventory, level, onSave]);

  const getAdjacentNpc = useCallback((): RuntimeNpc | null => {
    if (!level) return null;
    return findAdjacentNpc(stateRef.current.playerX, stateRef.current.playerY, level.npcs);
  }, [level]);

  const interactWithNearbyNpc = useCallback(() => {
    const npc = getAdjacentNpc();
    if (npc) dispatch({ type: 'OPEN_DIALOGUE', npc });
  }, [getAdjacentNpc]);

  const advanceDialogue = useCallback(() => dispatch({ type: 'NEXT_DIALOGUE' }), []);
  const closeDialogue = useCallback(() => dispatch({ type: 'CLOSE_DIALOGUE' }), []);

  return { state, interactWithNearbyNpc, advanceDialogue, closeDialogue, getAdjacentNpc };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findAdjacentNpc(px: number, py: number, npcs: RuntimeNpc[]): RuntimeNpc | null {
  return npcs.find(n => isAdjacent(px, py, n.tileX, n.tileY)) ?? null;
}

function makeEmptyLevel(): RuntimeLevel {
  return {
    id: '', slug: '', name: '', background: null,
    mapData: { width: 1, height: 1, tiles: [[1]], entities: [] },
    spawnX: 0, spawnY: 0,
    npcs: [], items: [], exits: [], quests: [], beats: [], objectives: [],
  };
}

// Re-export for components
export { isAdjacent };

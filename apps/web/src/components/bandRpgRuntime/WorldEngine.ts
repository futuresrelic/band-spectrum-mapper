import type {
  WorldCondition, PuzzleTrigger, PuzzleTriggerType, PuzzleAction,
  RuntimeDoor, RuntimeSwitch, RuntimePuzzle, InventoryEntry,
} from '../../api/bandRpgRuntime';

// ── World state snapshot passed to condition evaluators ────────────────────────

export interface WorldSnapshot {
  inventory: InventoryEntry[];
  activeQuestIds: string[];
  completedQuests: string[];
  unlockedBeats: string[];
  activatedSwitches: string[];
  openedDoors: string[];
  worldState: Record<string, unknown>;
}

// ── Condition evaluation ───────────────────────────────────────────────────────

// Adventure JSON may use either `targetId` or `targetSlug` — normalise here.
function resolveTarget(condition: WorldCondition): string | undefined {
  return condition.targetId ?? condition.targetSlug;
}

export function evaluateCondition(
  condition: WorldCondition | null | undefined,
  snap: WorldSnapshot,
): boolean {
  if (!condition) return true;
  const target = resolveTarget(condition);
  switch (condition.type) {
    case 'always': return true;
    case 'never': return false;
    case 'item_owned':
      return !!target && snap.inventory.some(e => e.itemId === target);
    case 'quest_active':
      return snap.activeQuestIds.includes(target ?? '');
    case 'quest_complete':
      return snap.completedQuests.includes(target ?? '');
    case 'story_beat_seen':
      return snap.unlockedBeats.includes(target ?? '');
    case 'switch_activated':
      return snap.activatedSwitches.includes(target ?? '');
    case 'door_open':
      return snap.openedDoors.includes(target ?? '');
    case 'world_state': {
      const k = condition.key ?? '';
      return snap.worldState[k] === condition.value;
    }
    default:
      return false;
  }
}

// ── Door helpers ───────────────────────────────────────────────────────────────

export function isDoorOpen(door: RuntimeDoor, snap: WorldSnapshot): boolean {
  if (door.openedByDefault) return true;
  if (snap.openedDoors.includes(door.id)) return true;
  return false;
}

export function canOpenDoor(door: RuntimeDoor, snap: WorldSnapshot): boolean {
  if (isDoorOpen(door, snap)) return true;
  if (door.type === 'free') return true;
  return evaluateCondition(door.lockCondition, snap);
}

export function doorBlockedMessage(door: RuntimeDoor): string {
  switch (door.type) {
    case 'key_door':    return `${door.label ?? door.name}: requires a key item.`;
    case 'quest_door':  return `${door.label ?? door.name}: complete the required quest to pass.`;
    case 'story_door':  return `${door.label ?? door.name}: a story event must unfold first.`;
    case 'switch_door': return `${door.label ?? door.name}: find the switch to open this.`;
    default:            return `${door.label ?? door.name}: locked.`;
  }
}

export function describeConditionBlocker(
  condition: import('../../api/bandRpgRuntime').WorldCondition | null | undefined,
  snap: WorldSnapshot,
  questIdToName?: Map<string, string>,
): string {
  if (!condition) return 'No condition — should be passable';
  if (evaluateCondition(condition, snap)) return 'Condition already met';
  const target = resolveTarget(condition);
  switch (condition.type) {
    case 'item_owned':      return `Missing item: ${target ?? '(no target set)'}`;
    case 'quest_active': {
      const name = questIdToName?.get(target ?? '');
      return name ? `Quest not active: ${name} (${target ?? ''})` : `Quest not active: ${target ?? '(no target set)'}`;
    }
    case 'quest_complete': {
      const name = questIdToName?.get(target ?? '');
      return name ? `Quest not complete: ${name} (${target ?? ''})` : `Quest not complete: ${target ?? '(no target set)'}`;
    }
    case 'story_beat_seen': return `Story beat not seen: ${target ?? '(no target set)'}`;
    case 'switch_activated':return `Switch not activated: ${target ?? '(no target set)'}`;
    case 'door_open':       return `Door not open: ${target ?? '(no target set)'}`;
    case 'world_state':     return `World state: ${condition.key ?? '?'} ≠ ${String(condition.value ?? '')}`;
    case 'never':           return 'Always blocked (condition type: never)';
    default:                return `Unknown condition type: ${condition.type}`;
  }
}

export function doorBlockedDetailMessage(
  door: import('../../api/bandRpgRuntime').RuntimeDoor,
  snap: WorldSnapshot,
  questIdToName?: Map<string, string>,
): string {
  return `${door.label ?? door.name}: ${describeConditionBlocker(door.lockCondition, snap, questIdToName)}`;
}

export interface ProgressionBlocker {
  category: 'door' | 'exit';
  entityName: string;
  reason: string;
}

export function analyzeProgression(
  doors: import('../../api/bandRpgRuntime').RuntimeDoor[],
  exits: import('../../api/bandRpgRuntime').RuntimeExit[],
  snap: WorldSnapshot,
  questIdToName?: Map<string, string>,
): ProgressionBlocker[] {
  const blockers: ProgressionBlocker[] = [];
  for (const door of doors) {
    if (!isDoorOpen(door, snap) && !canOpenDoor(door, snap)) {
      blockers.push({
        category: 'door',
        entityName: door.label ?? door.name,
        reason: describeConditionBlocker(door.lockCondition, snap, questIdToName),
      });
    }
  }
  for (const exit of exits) {
    if (exit.condition && !evaluateCondition(exit.condition, snap)) {
      blockers.push({
        category: 'exit',
        entityName: exit.label ?? exit.targetLevelSlug,
        reason: describeConditionBlocker(exit.condition, snap, questIdToName),
      });
    }
  }
  return blockers;
}

// ── Switch helpers ────────────────────────────────────────────────────────────

export function isSwitchActivated(sw: RuntimeSwitch, snap: WorldSnapshot): boolean {
  return snap.activatedSwitches.includes(sw.id);
}

// ── Puzzle evaluation ─────────────────────────────────────────────────────────

export interface PuzzleEvent {
  type: PuzzleTriggerType;
  targetId?: string;
}

export function matchesPuzzleTrigger(trigger: PuzzleTrigger, event: PuzzleEvent): boolean {
  if (trigger.on === 'always') return true;
  if (trigger.on !== event.type) return false;
  if (trigger.targetId && trigger.targetId !== event.targetId) return false;
  return true;
}

export function findTriggeredPuzzles(
  event: PuzzleEvent,
  puzzles: RuntimePuzzle[],
  snap: WorldSnapshot,
): RuntimePuzzle[] {
  return puzzles.filter(p => {
    if (!matchesPuzzleTrigger(p.trigger, event)) return false;
    return evaluateCondition(p.condition, snap);
  });
}

// ── Visibility filters ────────────────────────────────────────────────────────

export function isNpcVisible<T extends { visibilityCondition: import('../../api/bandRpgRuntime').WorldCondition | null }>(
  npc: T,
  snap: WorldSnapshot,
): boolean {
  return evaluateCondition(npc.visibilityCondition, snap);
}

export function isItemSpawned<T extends { spawnCondition: import('../../api/bandRpgRuntime').WorldCondition | null }>(
  item: T,
  snap: WorldSnapshot,
): boolean {
  return evaluateCondition(item.spawnCondition, snap);
}

export function isExitVisible<T extends { condition: import('../../api/bandRpgRuntime').WorldCondition | null }>(
  exit: T,
  snap: WorldSnapshot,
): boolean {
  return evaluateCondition(exit.condition, snap);
}

// ── Apply puzzle action (returns partial state updates) ───────────────────────

export interface PuzzleActionResult {
  openDoorId?: string;
  closeDoorId?: string;
  activateBeatId?: string;
  unlockLevelSlug?: string;
  worldStateKey?: string;
  worldStateValue?: unknown;
  grantItemId?: string;
}

export function evaluatePuzzleAction(action: PuzzleAction): PuzzleActionResult {
  switch (action.type) {
    case 'open_door':       return { openDoorId: action.targetId };
    case 'close_door':      return { closeDoorId: action.targetId };
    case 'trigger_beat':    return { activateBeatId: action.targetId };
    case 'reveal_exit':     return { unlockLevelSlug: action.targetId };
    case 'set_world_state': return { worldStateKey: action.key, worldStateValue: action.value };
    case 'grant_item':      return { grantItemId: action.targetId };
    default:                return {};
  }
}

// ── Switch icon labels ─────────────────────────────────────────────────────────

export const SWITCH_ICON: Record<string, string> = {
  switch:         '🔘',
  lever:          '🎚️',
  button:         '🔵',
  pressure_plate: '⬛',
};

export const DOOR_ICON: Record<string, string> = {
  key_door:    '🔐',
  quest_door:  '📜',
  story_door:  '📖',
  switch_door: '🔒',
  free:        '🚪',
};

// ── Future Foundation ─────────────────────────────────────────────────────────
// Stubs for Phase Z.4+ systems (not yet implemented)

export interface FutureWorldFoundation {
  enemies: 'not_implemented';
  bosses: 'not_implemented';
  companions: 'not_implemented';
  abilities: 'not_implemented';
  stealth: 'not_implemented';
  combat: 'not_implemented';
  traps: 'not_implemented';
  keys: 'reserved_use_RuntimeDoor_with_key_door_type';
}

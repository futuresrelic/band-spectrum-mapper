/**
 * Progression Validator — Phase 4.5 of campaign validation.
 *
 * Runs a stateful forward simulation of the adventure to verify that
 * the adventure is actually winnable. Detects:
 *   1. Key-behind-own-door softlocks (item required to open door is only
 *      accessible through that door)
 *   2. Switch-behind-own-door softlocks
 *   3. Quest-gate softlocks (quest required door, quest giver only behind door)
 *   4. Circular dependencies (A requires B, B requires A)
 *   5. Non-completable adventures (simulation gets stuck before __adventure_complete__)
 *   6. Required objectives that are never achievable
 */

export interface ProgressionError   { path: string; message: string; }
export interface ProgressionWarning { path: string; message: string; }

export interface ProgressionResult {
  passed: boolean;
  errors: ProgressionError[];
  warnings: ProgressionWarning[];
  metrics: {
    softlockCount:          number;
    progressionSteps:       number;
    unreachableObjectives:  number;
    adventureCompletable:   boolean;
  };
}

// ── Internal parsed adventure model ───────────────────────────────────────────

interface ProgEntity {
  type: string;
  x: number;
  y: number;
  refId: string;
  targetLevelSlug: string;
}

interface LockCond {
  type: string;
  targetSlug: string;
  targetId:   string;
}

interface ProgDoor {
  name: string;
  tileX: number; tileY: number;
  type: string;
  openedByDefault: boolean;
  lockCond: LockCond | null;
}

interface ProgSwitch {
  name: string;
  tileX: number; tileY: number;
}

interface ProgPuzzle {
  triggerOn:   string;
  triggerId:   string;
  actionType:  string;
  actionId:    string;
  actionSlug:  string;
}

interface ProgNpc {
  name: string;
  posX: number; posY: number;
}

interface ProgObjective {
  name: string;
  type: string;
  target: string;
  isOptional: boolean;
}

interface ProgLevel {
  slug:   string;
  name:   string;
  spawnX: number; spawnY: number;
  width:  number; height: number;
  tiles:  unknown[][];
  entities: ProgEntity[];
  doors:    ProgDoor[];
  switches: ProgSwitch[];
  puzzles:  ProgPuzzle[];
  npcs:     ProgNpc[];
  objectives: ProgObjective[];
}

interface ProgQuest {
  slug: string;
  name: string;
  giverLevelSlug: string;
  giverNpcName:   string;
}

interface ProgAdventure {
  levels: Map<string, ProgLevel>;
  quests: ProgQuest[];
  itemSlugs: Set<string>;
  firstLevelSlug: string;
}

// ── BFS helpers (mirrors reachabilityValidator for consistency) ───────────────

const DIRS: ReadonlyArray<readonly [number, number]> = [[-1,0],[1,0],[0,-1],[0,1]];

function pos(x: number, y: number): string { return `${x},${y}`; }

function bfsFlood(
  width: number, height: number, tiles: unknown[][],
  sx: number, sy: number,
  extras: ReadonlySet<string>,
): Set<string> {
  const visited = new Set<string>();
  function ok(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    if (extras.has(pos(x, y))) return true;
    const t = (tiles[y] as unknown[] | undefined)?.[x];
    return t === 1 || t === 2 || t === 3;
  }
  if (!ok(sx, sy)) return visited;
  const q: Array<[number, number]> = [[sx, sy]];
  visited.add(pos(sx, sy));
  while (q.length > 0) {
    const item = q.shift();
    if (!item) break;
    const [cx, cy] = item;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy, k = pos(nx, ny);
      if (!visited.has(k) && ok(nx, ny)) { visited.add(k); q.push([nx, ny]); }
    }
  }
  return visited;
}

function near(reachable: ReadonlySet<string>, x: number, y: number): boolean {
  if (reachable.has(pos(x, y))) return true;
  for (const [dx, dy] of DIRS) if (reachable.has(pos(x + dx, y + dy))) return true;
  return false;
}

// ── BFS for a level given current open doors ──────────────────────────────────

function bfsLevel(level: ProgLevel, openDoors: ReadonlySet<string>): Set<string> {
  const extras = new Set<string>();
  // Open door tiles are walkable
  for (const door of level.doors) {
    const k = `${level.slug}::${door.name}`;
    if (openDoors.has(k) || door.openedByDefault || door.type === 'free') {
      extras.add(pos(door.tileX, door.tileY));
    }
  }
  // Exit tiles are always approachable (player walks up to them)
  for (const e of level.entities) {
    if (e.type === 'exit') extras.add(pos(e.x, e.y));
  }
  return bfsFlood(level.width, level.height, level.tiles, level.spawnX, level.spawnY, extras);
}

// Same but with a specific door treated as always-locked (for softlock testing)
function bfsLevelWithDoorLocked(
  level: ProgLevel,
  openDoors: ReadonlySet<string>,
  lockedDoorName: string,
): Set<string> {
  const extras = new Set<string>();
  for (const door of level.doors) {
    if (door.name === lockedDoorName) continue; // treat as locked wall
    const k = `${level.slug}::${door.name}`;
    if (openDoors.has(k) || door.openedByDefault || door.type === 'free') {
      extras.add(pos(door.tileX, door.tileY));
    }
  }
  for (const e of level.entities) {
    if (e.type === 'exit') extras.add(pos(e.x, e.y));
  }
  return bfsFlood(level.width, level.height, level.tiles, level.spawnX, level.spawnY, extras);
}

// ── Adventure JSON parser ─────────────────────────────────────────────────────

function parseAdventure(payload: unknown): ProgAdventure | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  if (!Array.isArray(p['levels']) || (p['levels'] as unknown[]).length === 0) return null;

  const rawLevels = p['levels'] as Array<Record<string, unknown>>;
  const rawQuests = Array.isArray(p['quests']) ? (p['quests'] as Array<Record<string, unknown>>) : [];
  const rawItems  = Array.isArray(p['items'])  ? (p['items']  as Array<Record<string, unknown>>) : [];

  const itemSlugs = new Set<string>(
    rawItems.map(i => typeof i['slug'] === 'string' ? i['slug'] : '').filter(Boolean),
  );

  const levels = new Map<string, ProgLevel>();

  for (const raw of rawLevels) {
    const slug = typeof raw['slug'] === 'string' ? raw['slug'] : '';
    if (!slug) continue;

    const md = (raw['mapData'] && typeof raw['mapData'] === 'object')
      ? (raw['mapData'] as Record<string, unknown>)
      : {};

    const tiles  = Array.isArray(md['tiles']) ? (md['tiles'] as unknown[][]) : [];
    const width  = typeof md['width']  === 'number' ? md['width']  : (tiles[0] as unknown[] | undefined)?.length ?? 0;
    const height = typeof md['height'] === 'number' ? md['height'] : tiles.length;

    const rawEnts = Array.isArray(md['entities']) ? (md['entities'] as Array<Record<string, unknown>>) : [];
    const entities: ProgEntity[] = rawEnts.map(e => ({
      type:            typeof e['type']            === 'string' ? e['type']            : '',
      x:               typeof e['x']               === 'number' ? e['x']               : -1,
      y:               typeof e['y']               === 'number' ? e['y']               : -1,
      refId:           typeof e['refId']           === 'string' ? e['refId']           : '',
      targetLevelSlug: typeof e['targetLevelSlug'] === 'string' ? e['targetLevelSlug'] : '',
    }));

    const spawnEnt = entities.find(e => e.type === 'spawn');

    const rawDoors = Array.isArray(raw['doors']) ? (raw['doors'] as Array<Record<string, unknown>>) : [];
    const doors: ProgDoor[] = rawDoors.map(d => {
      const rawCond = d['lockCondition'];
      let lockCond: LockCond | null = null;
      if (rawCond && typeof rawCond === 'object') {
        const c = rawCond as Record<string, unknown>;
        lockCond = {
          type:       typeof c['type']       === 'string' ? c['type']       : '',
          targetSlug: typeof c['targetSlug'] === 'string' ? c['targetSlug'] : '',
          targetId:   typeof c['targetId']   === 'string' ? c['targetId']   : '',
        };
      }
      return {
        name:           typeof d['name']            === 'string'  ? d['name']            : '',
        tileX:          typeof d['tileX']           === 'number'  ? d['tileX']           : 0,
        tileY:          typeof d['tileY']           === 'number'  ? d['tileY']           : 0,
        type:           typeof d['type']            === 'string'  ? d['type']            : '',
        openedByDefault: d['openedByDefault'] === true,
        lockCond,
      };
    }).filter(d => d.name);

    const rawSwitches = Array.isArray(raw['switches']) ? (raw['switches'] as Array<Record<string, unknown>>) : [];
    const switches: ProgSwitch[] = rawSwitches.map(s => ({
      name:  typeof s['name']  === 'string' ? s['name']  : '',
      tileX: typeof s['tileX'] === 'number' ? s['tileX'] : 0,
      tileY: typeof s['tileY'] === 'number' ? s['tileY'] : 0,
    })).filter(s => s.name);

    const rawPuzzles = Array.isArray(raw['puzzles']) ? (raw['puzzles'] as Array<Record<string, unknown>>) : [];
    const puzzles: ProgPuzzle[] = rawPuzzles.flatMap(pz => {
      const trigger = (pz['trigger'] && typeof pz['trigger'] === 'object')
        ? (pz['trigger'] as Record<string, unknown>) : {};
      const action  = (pz['action']  && typeof pz['action']  === 'object')
        ? (pz['action']  as Record<string, unknown>) : {};
      return [{
        triggerOn:  typeof trigger['on']       === 'string' ? trigger['on']       : '',
        triggerId:  typeof trigger['targetId'] === 'string' ? trigger['targetId'] : '',
        actionType: typeof action['type']      === 'string' ? action['type']      : '',
        actionId:   typeof action['targetId']  === 'string' ? action['targetId']  : '',
        actionSlug: typeof action['targetSlug']=== 'string' ? action['targetSlug']: '',
      }];
    });

    const rawNpcs = Array.isArray(raw['npcs']) ? (raw['npcs'] as Array<Record<string, unknown>>) : [];
    const npcs: ProgNpc[] = rawNpcs.map(n => ({
      name: typeof n['name']      === 'string' ? n['name']      : '',
      posX: typeof n['positionX'] === 'number' ? n['positionX'] : -1,
      posY: typeof n['positionY'] === 'number' ? n['positionY'] : -1,
    })).filter(n => n.name);

    const rawObjs = Array.isArray(raw['objectives']) ? (raw['objectives'] as Array<Record<string, unknown>>) : [];
    const objectives: ProgObjective[] = rawObjs.map(o => ({
      name:       typeof o['name']       === 'string'  ? o['name']       : '',
      type:       typeof o['type']       === 'string'  ? o['type']       : '',
      target:     typeof o['target']     === 'string'  ? o['target']     : '',
      isOptional: o['isOptional'] === true,
    }));

    levels.set(slug, {
      slug, name: typeof raw['name'] === 'string' ? raw['name'] : slug,
      spawnX: spawnEnt ? spawnEnt.x : (typeof raw['spawnX'] === 'number' ? raw['spawnX'] : 0),
      spawnY: spawnEnt ? spawnEnt.y : (typeof raw['spawnY'] === 'number' ? raw['spawnY'] : 0),
      width, height, tiles,
      entities, doors, switches, puzzles, npcs, objectives,
    });
  }

  const quests: ProgQuest[] = rawQuests.map(q => ({
    slug:           typeof q['slug']               === 'string' ? q['slug']               : '',
    name:           typeof q['name']               === 'string' ? q['name']               : '',
    giverLevelSlug: typeof q['giverNpcLevelSlug']  === 'string' ? q['giverNpcLevelSlug']  : '',
    giverNpcName:   typeof q['giverNpcName']       === 'string' ? q['giverNpcName']       : '',
  })).filter(q => q.slug);

  // Determine starting level from timeline (first level entry by order) or first in array
  const rawTimeline = Array.isArray(p['timeline']) ? (p['timeline'] as Array<Record<string, unknown>>) : [];
  const tlLevels = rawTimeline
    .filter(t => t['type'] === 'level' && typeof t['refSlug'] === 'string')
    .sort((a, b) => (typeof a['order'] === 'number' ? a['order'] : 999) - (typeof b['order'] === 'number' ? b['order'] : 999));

  const firstLevelSlug = (tlLevels[0]?.['refSlug'] as string | undefined)
    ?? rawLevels[0]?.['slug'] as string | undefined
    ?? '';

  if (!firstLevelSlug || !levels.has(firstLevelSlug)) return null;

  return { levels, quests, itemSlugs, firstLevelSlug };
}

// ── Door condition checker ────────────────────────────────────────────────────

function isDoorOpenable(
  door: ProgDoor,
  levelSlug: string,
  inventory:         ReadonlySet<string>,
  completedQuests:   ReadonlySet<string>,
  activatedSwitches: ReadonlySet<string>,
  openedDoors:       ReadonlySet<string>,
): boolean {
  if (door.openedByDefault || door.type === 'free') return true;
  const k = `${levelSlug}::${door.name}`;
  if (openedDoors.has(k)) return true;
  const c = door.lockCond;
  if (!c || c.type === 'always') return true;
  if (c.type === 'never') return false;
  if (c.type === 'item_owned')      return inventory.has(c.targetSlug);
  if (c.type === 'quest_complete')  return completedQuests.has(c.targetSlug);
  if (c.type === 'switch_activated')return activatedSwitches.has(`${levelSlug}::${c.targetId}`);
  // world_state, quest_active, story_beat_seen — treat as satisfiable (unknown)
  return true;
}

// ── Forward simulation ────────────────────────────────────────────────────────

interface SimState {
  inventory:          Set<string>;
  completedQuests:    Set<string>;
  activatedSwitches:  Set<string>;
  openedDoors:        Set<string>;
  visitedLevels:      Set<string>;
  collectedEntities:  Set<string>;  // "levelSlug::x,y" for collected items
  reachedExitFinal:   boolean;
  progressionSteps:   number;
}

function runSimulation(adv: ProgAdventure): SimState {
  const state: SimState = {
    inventory:         new Set(),
    completedQuests:   new Set(),
    activatedSwitches: new Set(),
    openedDoors:       new Set(),
    visitedLevels:     new Set([adv.firstLevelSlug]),
    collectedEntities: new Set(),
    reachedExitFinal:  false,
    progressionSteps:  0,
  };

  // Pre-open all default-open doors
  for (const level of adv.levels.values()) {
    for (const door of level.doors) {
      if (door.openedByDefault || door.type === 'free' ||
          !door.lockCond || door.lockCond.type === 'always') {
        state.openedDoors.add(`${level.slug}::${door.name}`);
      }
    }
  }

  const MAX_STEPS = 50; // prevent infinite loops on malformed data
  let changed = true;

  while (changed && state.progressionSteps < MAX_STEPS) {
    changed = false;
    state.progressionSteps++;

    for (const levelSlug of [...state.visitedLevels]) {
      const level = adv.levels.get(levelSlug);
      if (!level || level.width === 0 || level.height === 0) continue;

      const reachable = bfsLevel(level, state.openedDoors);

      // Collect items
      for (const e of level.entities) {
        if (e.type !== 'item' || !e.refId || e.x < 0 || e.y < 0) continue;
        const ek = `${levelSlug}::${e.x},${e.y}`;
        if (!state.collectedEntities.has(ek) && near(reachable, e.x, e.y)) {
          state.collectedEntities.add(ek);
          state.inventory.add(e.refId);
          changed = true;
        }
      }

      // Activate switches — and apply puzzle effects immediately
      for (const sw of level.switches) {
        const swKey = `${levelSlug}::${sw.name}`;
        if (!state.activatedSwitches.has(swKey) && near(reachable, sw.tileX, sw.tileY)) {
          state.activatedSwitches.add(swKey);
          changed = true;
          for (const pz of level.puzzles) {
            if (pz.triggerOn === 'switch_activated' && pz.triggerId === sw.name &&
                pz.actionType === 'open_door' && pz.actionId) {
              const dk = `${levelSlug}::${pz.actionId}`;
              if (!state.openedDoors.has(dk)) { state.openedDoors.add(dk); changed = true; }
            }
            if (pz.triggerOn === 'switch_activated' && pz.triggerId === sw.name &&
                pz.actionType === 'grant_item' && pz.actionSlug) {
              if (!state.inventory.has(pz.actionSlug)) { state.inventory.add(pz.actionSlug); changed = true; }
            }
          }
        }
      }

      // Re-evaluate door conditions now that inventory/switches may have grown
      for (const door of level.doors) {
        const dk = `${levelSlug}::${door.name}`;
        if (!state.openedDoors.has(dk) &&
            isDoorOpenable(door, levelSlug, state.inventory, state.completedQuests,
                           state.activatedSwitches, state.openedDoors)) {
          state.openedDoors.add(dk);
          changed = true;
        }
      }

      // Complete quests whose giver NPC is accessible.
      // Quests with no giver metadata are skipped — we cannot simulate their completion,
      // and auto-completing them would mask giver-behind-door softlocks.
      for (const quest of adv.quests) {
        if (state.completedQuests.has(quest.slug)) continue;
        if (!quest.giverLevelSlug || !quest.giverNpcName) continue;
        if (quest.giverLevelSlug !== levelSlug) continue;
        const npc = level.npcs.find(n => n.name === quest.giverNpcName);
        if (npc && near(reachable, npc.posX, npc.posY)) {
          state.completedQuests.add(quest.slug); changed = true;
        }
      }

      // Traverse exits
      for (const e of level.entities) {
        if (e.type !== 'exit' || !e.targetLevelSlug) continue;
        if (!near(reachable, e.x, e.y)) continue;
        if (e.targetLevelSlug === '__adventure_complete__') {
          if (!state.reachedExitFinal) { state.reachedExitFinal = true; changed = true; }
        } else if (!state.visitedLevels.has(e.targetLevelSlug)) {
          state.visitedLevels.add(e.targetLevelSlug);
          changed = true;
        }
      }
    }
  }

  return state;
}

// ── Softlock detection ────────────────────────────────────────────────────────

interface SoftlockInfo {
  path:     string;
  message:  string;
}

function detectSoftlocks(adv: ProgAdventure, finalState: SimState): SoftlockInfo[] {
  const errors: SoftlockInfo[] = [];

  for (const level of adv.levels.values()) {
    if (!finalState.visitedLevels.has(level.slug)) continue;
    if (level.width === 0 || level.height === 0) continue;

    for (const door of level.doors) {
      const dk = `${level.slug}::${door.name}`;
      if (finalState.openedDoors.has(dk)) continue; // door was opened → fine
      if (!door.lockCond) continue;

      const c = door.lockCond;
      const pref = `levels[${level.slug}].doors[${door.name}]`;

      if (c.type === 'item_owned' && c.targetSlug) {
        const slug = c.targetSlug;
        if (!finalState.inventory.has(slug)) {
          // Check: is item accessible without this door?
          const itemLevel = findItemLevel(adv, slug);
          if (itemLevel === level.slug) {
            // Item is in the same level as the door — check if it's behind the door
            const reachableWithoutDoor = bfsLevelWithDoorLocked(
              level, finalState.openedDoors, door.name,
            );
            const itemEnt = level.entities.find(e => e.type === 'item' && e.refId === slug);
            if (itemEnt && !near(reachableWithoutDoor, itemEnt.x, itemEnt.y)) {
              errors.push({
                path: pref,
                message: [
                  `SOFTLOCK: "${door.name}" in level "${level.name}" requires item "${slug}",`,
                  `but that item is only reachable after passing through this door.`,
                  `Move the item to an area accessible before the door, or use a different door type.`,
                ].join(' '),
              });
            }
          } else {
            errors.push({
              path: pref,
              message: [
                `Unsatisfied door: "${door.name}" in level "${level.name}" requires item "${slug}",`,
                `but this item was never collected during progression simulation.`,
                itemLevel ? `The item appears in level "${itemLevel}" which may not be reachable before this door.`
                          : `The item was not found in any level.`,
              ].join(' '),
            });
          }
        }
      }

      if (c.type === 'switch_activated' && c.targetId) {
        const swKey = `${level.slug}::${c.targetId}`;
        if (!finalState.activatedSwitches.has(swKey)) {
          // Check if switch is behind this door
          const sw = level.switches.find(s => s.name === c.targetId);
          if (sw) {
            const reachableWithoutDoor = bfsLevelWithDoorLocked(
              level, finalState.openedDoors, door.name,
            );
            if (!near(reachableWithoutDoor, sw.tileX, sw.tileY)) {
              errors.push({
                path: pref,
                message: [
                  `SOFTLOCK: "${door.name}" in level "${level.name}" requires switch "${c.targetId}" to be activated,`,
                  `but that switch is only reachable after passing through this door.`,
                  `Move the switch to an area accessible before the door.`,
                ].join(' '),
              });
            } else {
              // Also check via puzzle: is there a puzzle linking this switch to the door?
              const hasPuzzle = level.puzzles.some(
                pz => pz.triggerOn === 'switch_activated' && pz.triggerId === c.targetId
                   && pz.actionType === 'open_door' && pz.actionId === door.name,
              );
              if (!hasPuzzle) {
                errors.push({
                  path: pref,
                  message: [
                    `Door "${door.name}" (switch_activated: "${c.targetId}") in level "${level.name}":`,
                    `no puzzle was found that opens this door when switch "${c.targetId}" is activated.`,
                    `Add a puzzle with trigger.on="switch_activated", trigger.targetId="${c.targetId}",`,
                    `action.type="open_door", action.targetId="${door.name}".`,
                  ].join(' '),
                });
              }
            }
          }
        }
      }

      if (c.type === 'quest_complete' && c.targetSlug) {
        const quest = adv.quests.find(q => q.slug === c.targetSlug);
        const questDisplay = quest?.name ? `"${quest.name}"` : `"${c.targetSlug}"`;
        let giverBehindDoor = false;

        // Unconditional check: is the quest giver behind this specific door?
        // Run this even if the simulation marked the quest complete, because the simulation
        // auto-skips quests without giver metadata, which can mask real softlocks.
        if (quest && quest.giverLevelSlug === level.slug && quest.giverNpcName) {
          const reachableWithoutDoor = bfsLevelWithDoorLocked(
            level, finalState.openedDoors, door.name,
          );
          const npc = level.npcs.find(n => n.name === quest.giverNpcName);
          if (npc && !near(reachableWithoutDoor, npc.posX, npc.posY)) {
            giverBehindDoor = true;
            errors.push({
              path: pref,
              message: [
                `SOFTLOCK: Door "${door.name}" requires quest ${questDisplay},`,
                `but the quest giver NPC "${quest.giverNpcName}" is behind that door.`,
                `The player can never start this quest before reaching the door.`,
                `Move the quest giver to an area accessible before the door.`,
              ].join(' '),
            });
          }
        }

        // If giver is not behind this door but quest still wasn't completed, explain why.
        if (!giverBehindDoor && !finalState.completedQuests.has(c.targetSlug)) {
          if (quest && quest.giverLevelSlug && !finalState.visitedLevels.has(quest.giverLevelSlug)) {
            errors.push({
              path: pref,
              message: [
                `SOFTLOCK: Door "${door.name}" requires quest ${questDisplay},`,
                `but the quest giver is in level "${quest.giverLevelSlug}" which was never reached`,
                `during simulation. Ensure that level is accessible before this door.`,
              ].join(' '),
            });
          } else {
            errors.push({
              path: pref,
              message: [
                `Unsatisfied door: "${door.name}" in level "${level.name}" requires quest ${questDisplay} to be completed,`,
                `but this quest was never completed during simulation.`,
              ].join(' '),
            });
          }
        }
      }
    }
  }

  return errors;
}

function findItemLevel(adv: ProgAdventure, itemSlug: string): string | null {
  for (const level of adv.levels.values()) {
    if (level.entities.some(e => e.type === 'item' && e.refId === itemSlug)) {
      return level.slug;
    }
  }
  return null;
}

// ── Dependency cycle detection ────────────────────────────────────────────────

function detectCycles(adv: ProgAdventure): SoftlockInfo[] {
  const errors: SoftlockInfo[] = [];

  // Build: resource → set of doors that block it
  // Then check: does opening any of those doors require the same resource?

  // Map from item slug → the door(s) that block it (in each level)
  const itemBlockedByDoor = new Map<string, Array<{ levelSlug: string; doorName: string }>>();

  for (const level of adv.levels.values()) {
    for (const door of level.doors) {
      if (!door.lockCond || door.type === 'free' || door.openedByDefault) continue;
      // Which items are only behind this door?
      if (level.width === 0) continue;
      const reachableWithout = bfsLevelWithDoorLocked(
        level, new Set(), door.name, // start fresh — nothing open
      );
      for (const e of level.entities) {
        if (e.type !== 'item' || !e.refId) continue;
        if (!near(reachableWithout, e.x, e.y)) {
          const prev = itemBlockedByDoor.get(e.refId) ?? [];
          prev.push({ levelSlug: level.slug, doorName: door.name });
          itemBlockedByDoor.set(e.refId, prev);
        }
      }
    }
  }

  // Detect cross-level cycles:
  // Door A in level 1 requires item X
  // Item X is blocked by Door B in level 2
  // Door B requires item Y
  // Item Y is blocked by Door A
  for (const level of adv.levels.values()) {
    for (const doorA of level.doors) {
      if (!doorA.lockCond || doorA.lockCond.type !== 'item_owned') continue;
      const itemX = doorA.lockCond.targetSlug;
      if (!itemX) continue;
      const blockers = itemBlockedByDoor.get(itemX) ?? [];
      for (const { levelSlug: bLevelSlug, doorName: doorBName } of blockers) {
        const bLevel = adv.levels.get(bLevelSlug);
        if (!bLevel) continue;
        const doorB = bLevel.doors.find(d => d.name === doorBName);
        if (!doorB?.lockCond || doorB.lockCond.type !== 'item_owned') continue;
        const itemY = doorB.lockCond.targetSlug;
        if (!itemY) continue;
        const yBlockers = itemBlockedByDoor.get(itemY) ?? [];
        const cycleClosed = yBlockers.some(
          b => b.levelSlug === level.slug && b.doorName === doorA.name,
        );
        if (cycleClosed) {
          errors.push({
            path: `levels[${level.slug}].doors[${doorA.name}]`,
            message: [
              `Circular dependency detected:`,
              `"${doorA.name}" requires item "${itemX}",`,
              `but "${itemX}" is behind "${doorBName}" which requires item "${itemY}",`,
              `and "${itemY}" is behind "${doorA.name}". These doors can never both be opened.`,
            ].join(' '),
          });
        }
      }
    }
  }

  return errors;
}

// ── Objective completability check ────────────────────────────────────────────

function checkObjectives(
  adv: ProgAdventure,
  finalState: SimState,
): { errors: SoftlockInfo[]; unreachableCount: number } {
  const errors: SoftlockInfo[] = [];
  let unreachableCount = 0;

  for (const level of adv.levels.values()) {
    if (!finalState.visitedLevels.has(level.slug)) continue;

    for (const obj of level.objectives) {
      if (obj.isOptional || !obj.type || !obj.name) continue;

      let completable = true;
      let reason = '';

      switch (obj.type) {
        case 'find_item':
          if (obj.target && !finalState.inventory.has(obj.target)) {
            completable = false;
            reason = `item "${obj.target}" was never collected`;
          }
          break;
        case 'complete_quest':
          if (obj.target && !finalState.completedQuests.has(obj.target)) {
            completable = false;
            reason = `quest "${obj.target}" was never completed`;
          }
          break;
        case 'activate_switch': {
          if (obj.target) {
            const swKey = `${level.slug}::${obj.target}`;
            if (!finalState.activatedSwitches.has(swKey)) {
              completable = false;
              reason = `switch "${obj.target}" was never activated in this level`;
            }
          }
          break;
        }
        case 'talk_to_npc': {
          if (obj.target) {
            const npc = level.npcs.find(n => n.name === obj.target);
            if (npc) {
              const reachable = bfsLevel(level, finalState.openedDoors);
              if (!near(reachable, npc.posX, npc.posY)) {
                completable = false;
                reason = `NPC "${obj.target}" is not reachable in the final game state`;
              }
            }
          }
          break;
        }
        default:
          // reach_location, collect_objects, etc. — assume completable
          break;
      }

      if (!completable) {
        unreachableCount++;
        errors.push({
          path: `levels[${level.slug}].objectives[${obj.name}]`,
          message: `Required objective "${obj.name}" (${obj.type}) in level "${level.name}" is not completable: ${reason}.`,
        });
      }
    }
  }

  return { errors, unreachableCount };
}

// ── Public entry point ────────────────────────────────────────────────────────

export function validateProgression(payload: unknown): ProgressionResult {
  const adv = parseAdventure(payload);

  if (!adv) {
    // Payload too malformed or empty for simulation — skip gracefully
    return {
      passed: true,
      errors: [],
      warnings: [],
      metrics: { softlockCount: 0, progressionSteps: 0, unreachableObjectives: 0, adventureCompletable: false },
    };
  }

  const finalState = runSimulation(adv);

  const errors:   ProgressionError[]   = [];
  const warnings: ProgressionWarning[] = [];

  // 1. Adventure completability
  if (!finalState.reachedExitFinal) {
    errors.push({
      path: 'adventure',
      message: [
        'Adventure is not completable: the simulation could not reach the "__adventure_complete__" exit.',
        'The player gets permanently stuck — check for locked doors whose requirements are never satisfiable.',
      ].join(' '),
    });
  }

  // 2. Softlock detection
  const softlocks = detectSoftlocks(adv, finalState);
  for (const s of softlocks) errors.push(s);

  // 3. Circular dependency detection
  const cycles = detectCycles(adv);
  for (const c of cycles) errors.push(c);

  // 4. Objective completability
  const { errors: objErrors, unreachableCount } = checkObjectives(adv, finalState);
  for (const e of objErrors) errors.push(e);

  // Warnings: levels visited but exits never used, quests not started, etc.
  for (const level of adv.levels.values()) {
    if (finalState.visitedLevels.has(level.slug)) continue;
    const fromTimeline = payload && typeof payload === 'object'
      && Array.isArray((payload as Record<string, unknown>)['timeline'])
      && ((payload as Record<string, unknown>)['timeline'] as Array<Record<string, unknown>>)
        .some(t => t['type'] === 'level' && t['refSlug'] === level.slug);
    if (fromTimeline) {
      warnings.push({
        path: `levels[${level.slug}]`,
        message: `Level "${level.name}" is in the timeline but was never visited during simulation — it may not be reachable.`,
      });
    }
  }

  const softlockCount = softlocks.length + cycles.length;

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    metrics: {
      softlockCount,
      progressionSteps:       finalState.progressionSteps,
      unreachableObjectives:  unreachableCount,
      adventureCompletable:   finalState.reachedExitFinal,
    },
  };
}

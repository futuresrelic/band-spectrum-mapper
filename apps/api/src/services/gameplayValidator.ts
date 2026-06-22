/**
 * Adventure Gameplay Quality Validator
 *
 * Scores five dimensions (0–20 each, total 0–100):
 *   Exploration — interior walls, dead ends, spawn-to-exit distance
 *   Puzzles     — items to collect, switches, locked doors, key-hunt combos
 *   Items       — collectible item entities placed in levels
 *   Variety     — different level types across the campaign
 *   Progression — escalating challenge, EXIT GATING, quest depth, completion
 *
 * Adventures scoring below 60 have gameplay errors added to the error list,
 * blocking import and directing auto-repair.
 *
 * EXIT GATING: A level is "ungated" when the player can walk from spawn to
 * exit without completing any action (no locked door, no switch-door, no
 * puzzle in the path). Ungated levels heavily penalise the Progression score
 * and trigger per-level errors.
 */

const DIRS: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function pos(x: number, y: number): string { return `${x},${y}`; }

// ── Raw types (defensive — payload arrives as unknown) ────────────────────────

interface RawEntity {
  type?: unknown;
  x?: unknown;
  y?: unknown;
  targetLevelSlug?: unknown;
  refId?: unknown;
}
interface RawDoor { type?: unknown; openedByDefault?: unknown; }
interface RawLevel {
  slug?: unknown;
  name?: unknown;
  order?: unknown;
  spawnX?: unknown;
  spawnY?: unknown;
  mapData?: unknown;
  npcs?: unknown;
  switches?: unknown;
  doors?: unknown;
  puzzles?: unknown;
}
interface RawMapData { width?: unknown; height?: unknown; tiles?: unknown; entities?: unknown; }
interface RawPayload { levels?: unknown; quests?: unknown; }

// ── Public types ──────────────────────────────────────────────────────────────

export interface GameplayScore {
  total: number;
  exploration: number;
  puzzles: number;
  items: number;
  variety: number;
  progression: number;
  details: string[];
}

export interface ValidationError { path: string; message: string; }

export interface GameplayResult {
  score: GameplayScore;
  errors: ValidationError[];
}

// ── Per-level analysis ────────────────────────────────────────────────────────

interface LevelAnalysis {
  slug: string;
  name: string;
  order: number;
  itemEntityCount: number;
  switchCount: number;
  npcCount: number;
  puzzleCount: number;
  meaningfulDoorCount: number;
  interiorWallCount: number;
  deadEndCount: number;
  spawnToExitDist: number;   // Infinity if no reachable exit
  hasExitToCompletion: boolean;
  // Exit gating: true when the level has a reachable exit AND at least one
  // mechanism that requires player action (locked door, switch, puzzle, item).
  isGated: boolean;
}

// BFS minimum distance from (sx, sy) to the nearest exit entity.
function bfsMinDist(
  tiles: number[][],
  entities: RawEntity[],
  sx: number, sy: number,
  width: number, height: number,
): number {
  const exits = new Set<string>();
  for (const e of entities) {
    if (e.type === 'exit' && typeof e.x === 'number' && typeof e.y === 'number') {
      exits.add(pos(e.x, e.y));
    }
  }
  if (exits.size === 0) return Infinity;

  const visited = new Set<string>([pos(sx, sy)]);
  const queue: Array<[number, number, number]> = [[sx, sy, 0]];

  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined) break;
    const [x, y, dist] = item;
    if (exits.has(pos(x, y))) return dist;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = pos(nx, ny);
      if (visited.has(key)) continue;
      const tile = tiles[ny]?.[nx];
      if (tile === undefined || tile === 0) continue;
      visited.add(key);
      queue.push([nx, ny, dist + 1]);
    }
  }
  return Infinity;
}

function analyzeLevel(rawLevel: RawLevel): LevelAnalysis {
  const slug = typeof rawLevel.slug === 'string' ? rawLevel.slug : 'unknown';
  const name = typeof rawLevel.name === 'string' ? rawLevel.name : 'Unknown';
  const order = typeof rawLevel.order === 'number' ? rawLevel.order : 0;

  const mapData = rawLevel.mapData as RawMapData | undefined;
  const width = typeof mapData?.width === 'number' ? mapData.width : 0;
  const height = typeof mapData?.height === 'number' ? mapData.height : 0;

  const rawTiles = mapData?.tiles;
  const tiles: number[][] = Array.isArray(rawTiles)
    ? (rawTiles as unknown[]).map(row =>
        Array.isArray(row) ? (row as unknown[]).map(t => typeof t === 'number' ? t : 0) : []
      )
    : [];

  const rawEntities = mapData?.entities;
  const entities: RawEntity[] = Array.isArray(rawEntities)
    ? (rawEntities as unknown[]).map(e => e as RawEntity)
    : [];

  // Locate spawn
  let spawnX = typeof rawLevel.spawnX === 'number' ? rawLevel.spawnX : 0;
  let spawnY = typeof rawLevel.spawnY === 'number' ? rawLevel.spawnY : 0;
  for (const e of entities) {
    if (e.type === 'spawn' && typeof e.x === 'number' && typeof e.y === 'number') {
      spawnX = e.x; spawnY = e.y; break;
    }
  }

  const itemEntityCount = entities.filter(e => e.type === 'item').length;
  const npcCount = Array.isArray(rawLevel.npcs) ? (rawLevel.npcs as unknown[]).length : 0;
  const switchCount = Array.isArray(rawLevel.switches) ? (rawLevel.switches as unknown[]).length : 0;
  const puzzleCount = Array.isArray(rawLevel.puzzles) ? (rawLevel.puzzles as unknown[]).length : 0;

  const rawDoors: RawDoor[] = Array.isArray(rawLevel.doors)
    ? (rawLevel.doors as unknown[]).map(d => d as RawDoor)
    : [];
  const meaningfulDoorCount = rawDoors.filter(d => d.openedByDefault !== true && d.type !== 'free').length;

  let interiorWallCount = 0;
  let deadEndCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tile = tiles[y]?.[x];
      if (tile === undefined) continue;
      if (tile === 0) {
        interiorWallCount++;
      } else {
        let walkableNeighbors = 0;
        for (const [dx, dy] of DIRS) {
          const t = tiles[y + dy]?.[x + dx];
          if (t !== undefined && t !== 0) walkableNeighbors++;
        }
        if (walkableNeighbors === 1) deadEndCount++;
      }
    }
  }

  const hasExitToCompletion = entities.some(
    e => e.type === 'exit' && e.targetLevelSlug === '__adventure_complete__'
  );

  const spawnToExitDist = width > 0 && height > 0
    ? bfsMinDist(tiles, entities, spawnX, spawnY, width, height)
    : Infinity;

  // A level is gated when: exit exists AND at least one blocking mechanism is present.
  // Blocking mechanisms: locked door (player must obtain key) OR switch (may open a door)
  // OR puzzle (may gate exit) OR item+door combo (key hunt).
  // A level with ONLY NPCs and a walkable exit path is ungated — player can skip everything.
  const hasReachableExit = spawnToExitDist !== Infinity;
  const isGated = !hasReachableExit ||  // unreachable exits handled by reachability validator
    meaningfulDoorCount > 0 ||
    switchCount > 0 ||
    puzzleCount > 0;

  return {
    slug, name, order, itemEntityCount, switchCount, npcCount, puzzleCount,
    meaningfulDoorCount, interiorWallCount, deadEndCount,
    spawnToExitDist, hasExitToCompletion, isGated,
  };
}

// ── Dimension scoring ─────────────────────────────────────────────────────────

function scoreExploration(levels: LevelAnalysis[]): number {
  let score = 0;
  for (const lv of levels) {
    if (lv.interiorWallCount > 5) score += 5;
    else if (lv.interiorWallCount > 0) score += 3;

    if (lv.deadEndCount >= 3) score += 4;
    else if (lv.deadEndCount >= 1) score += 2;

    const d = lv.spawnToExitDist;
    if (d !== Infinity) {
      if (d >= 15) score += 5;
      else if (d >= 10) score += 4;
      else if (d >= 5) score += 2;
    }
  }
  return Math.min(20, score);
}

function scorePuzzles(levels: LevelAnalysis[]): number {
  const hasItems = levels.some(l => l.itemEntityCount > 0);
  const hasSwitches = levels.some(l => l.switchCount > 0);
  const hasDoors = levels.some(l => l.meaningfulDoorCount > 0);
  const hasKeyHunt = levels.some(l => l.itemEntityCount > 0 && l.meaningfulDoorCount > 0);
  return (hasItems ? 5 : 0) + (hasSwitches ? 5 : 0) + (hasDoors ? 5 : 0) + (hasKeyHunt ? 5 : 0);
}

function scoreItems(levels: LevelAnalysis[]): number {
  const total = levels.reduce((s, l) => s + l.itemEntityCount, 0);
  if (total === 0) return 0;
  if (total === 1) return 5;
  if (total <= 3) return 10;
  if (total <= 5) return 15;
  return 20;
}

function scoreVariety(levels: LevelAnalysis[]): number {
  const hasPuzzleLevel = levels.some(l =>
    (l.itemEntityCount > 0 && l.meaningfulDoorCount > 0) ||
    (l.switchCount > 0 && l.meaningfulDoorCount > 0) ||
    l.puzzleCount > 0
  );
  const hasExplorationLevel = levels.some(l => l.interiorWallCount > 3 && l.deadEndCount >= 1);
  const hasStoryLevel = levels.some(l => l.npcCount > 0);
  return Math.min(20,
    (hasPuzzleLevel ? 10 : 0) +
    (hasExplorationLevel ? 8 : 0) +
    (hasStoryLevel && (hasPuzzleLevel || hasExplorationLevel) ? 2 : 0)
  );
}

function scoreProgression(levels: LevelAnalysis[], questCount: number): number {
  const hasCompletion = levels.some(l => l.hasExitToCompletion);
  const numLevels = levels.length;

  // Exit gating: levels that require action before progression are "gated".
  // Non-final levels (those without adventure_complete exit) should be gated.
  const nonFinalWithExit = levels.filter(l => !l.hasExitToCompletion && l.spawnToExitDist !== Infinity);
  const gatedCount = nonFinalWithExit.filter(l => l.isGated).length;
  const totalNonFinal = nonFinalWithExit.length;
  const fullyGated = totalNonFinal === 0 || gatedCount === totalNonFinal;
  const partiallyGated = gatedCount > 0;

  const dists = levels.map(l => l.spawnToExitDist).filter(d => d !== Infinity);
  const distIncreases = dists.length >= 2 && (dists[dists.length - 1] ?? 0) > (dists[0] ?? 0);

  return Math.min(20,
    (hasCompletion ? 4 : 0) +
    (questCount >= 2 ? 3 : 0) +
    (questCount >= numLevels ? 2 : 0) +
    (fullyGated ? 7 : partiallyGated ? 3 : 0) +  // exit gating is the biggest factor
    (distIncreases ? 4 : 0)
  );
}

// ── Error generation (only when total < 60) ───────────────────────────────────

function generateErrors(score: GameplayScore, levels: LevelAnalysis[]): ValidationError[] {
  if (score.total >= 60) return [];

  const errors: ValidationError[] = [];

  // Exit gating — highest priority error because it's the most obvious gameplay failure
  const nonFinalWithExit = levels.filter(l => !l.hasExitToCompletion && l.spawnToExitDist !== Infinity);
  const ungated = nonFinalWithExit.filter(l => !l.isGated);
  if (ungated.length > 0) {
    if (ungated.length === nonFinalWithExit.length && ungated.length > 0) {
      errors.push({
        path: 'gameplay.gating',
        message:
          `ALL ${ungated.length} non-final level${ungated.length !== 1 ? 's' : ''} have ungated exits ` +
          `— the player can walk from spawn to exit without doing anything. ` +
          `Each level needs at least ONE gating mechanism before the exit:\n` +
          `  (A) Key Hunt: item entity in map + key_door (openedByDefault:false, lockCondition:{type:"item_owned",targetSlug:"<slug>"})\n` +
          `  (B) Switch-Door: switch entity + switch_door that blocks path to exit\n` +
          `  (C) Quest Gate: quest_door with lockCondition:{type:"quest_complete",targetSlug:"<quest-slug>"}\n` +
          `  (D) Puzzle: puzzle that reveals exit or opens blocking door`,
      });
    } else {
      for (const lv of ungated) {
        errors.push({
          path: `gameplay.gating.${lv.slug}`,
          message:
            `Level "${lv.name}" exit is ungated — player skips it by walking straight through. ` +
            `Add a locked door (key_door), switch-door combo, quest-gated door, or puzzle ` +
            `that must be completed before reaching the exit.`,
        });
      }
    }
  }

  // Per-level short-path errors
  for (const lv of levels) {
    if (lv.spawnToExitDist !== Infinity && lv.spawnToExitDist < 8) {
      errors.push({
        path: `gameplay.levels.${lv.slug}`,
        message: `Level "${lv.name}" spawn-to-exit is only ${lv.spawnToExitDist} tiles. ` +
          `Expand the map to 12×12+, add interior walls and corridors so the player walks ≥10 tiles.`,
      });
    }
  }

  // Variety: all levels are simple talk-to-NPC with no interactables
  const allBoring = levels.every(
    l => l.itemEntityCount === 0 && l.switchCount === 0 && l.meaningfulDoorCount === 0 && l.puzzleCount === 0
  );
  if (allBoring) {
    errors.push({
      path: 'gameplay.variety',
      message: `All levels are "spawn → NPC → exit" with no puzzles, items, or locked doors. ` +
        `Add at least one puzzle level (locked door + key item) and one exploration level (corridor map). ` +
        `Puzzle templates: (A) Key Hunt, (B) Switch Puzzle, (C) Quest Gate, (D) Multi-Room Retrieval.`,
    });
  }

  if (score.puzzles < 10) {
    errors.push({
      path: 'gameplay.puzzles',
      message: `Puzzle score ${score.puzzles}/20. Add items[] to the adventure, place {type:"item"} entities ` +
        `in level mapData.entities, and add at least one locked door (type:"key_door", openedByDefault:false, ` +
        `lockCondition:{type:"item_owned",targetSlug:"<item-slug>"}).`,
    });
  }

  if (score.items < 5) {
    errors.push({
      path: 'gameplay.items',
      message: `No collectible items found in any level. ` +
        `Define items in the top-level items[] array and place them in maps: ` +
        `{id:"item-1",type:"item",x:4,y:4,refId:"<item-slug>"} inside mapData.entities.`,
    });
  }

  if (score.exploration < 8) {
    errors.push({
      path: 'gameplay.exploration',
      message: `Exploration score ${score.exploration}/20. Maps are too open or small. ` +
        `Use 12×12+ maps with interior walls creating corridors and dead-end side rooms. ` +
        `The path from spawn to exit should cross ≥10 floor tiles.`,
    });
  }

  // Score summary — always last, so GPT sees the full picture when repairing
  errors.push({
    path: 'gameplay.score',
    message: `Gameplay quality: ${score.total}/100 (minimum 60 to import). ` +
      `exploration=${score.exploration}/20, puzzles=${score.puzzles}/20, ` +
      `items=${score.items}/20, variety=${score.variety}/20, progression=${score.progression}/20.`,
  });

  return errors;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function validateGameplay(payload: unknown): GameplayResult {
  const raw = payload as RawPayload;

  const rawLevels = Array.isArray(raw?.levels)
    ? (raw.levels as unknown[]).map(l => l as RawLevel)
    : [];

  if (rawLevels.length === 0) {
    return {
      score: { total: 0, exploration: 0, puzzles: 0, items: 0, variety: 0, progression: 0, details: [] },
      errors: [],
    };
  }

  const questCount = Array.isArray(raw?.quests) ? (raw.quests as unknown[]).length : 0;
  const levels = rawLevels.map(analyzeLevel);

  const exploration = scoreExploration(levels);
  const puzzles = scorePuzzles(levels);
  const items = scoreItems(levels);
  const variety = scoreVariety(levels);
  const progression = scoreProgression(levels, questCount);
  const total = exploration + puzzles + items + variety + progression;

  const details = levels.map(l =>
    `${l.name}: dist=${l.spawnToExitDist === Infinity ? '∞' : l.spawnToExitDist}` +
    `, gated=${l.isGated ? 'yes' : 'NO'}` +
    `, items=${l.itemEntityCount}, switches=${l.switchCount}` +
    `, doors=${l.meaningfulDoorCount}, puzzles=${l.puzzleCount}` +
    `, walls=${l.interiorWallCount}, deadEnds=${l.deadEndCount}`
  );

  const score: GameplayScore = { total, exploration, puzzles, items, variety, progression, details };
  const errors = generateErrors(score, levels);

  return { score, errors };
}

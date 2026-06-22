/**
 * Adventure Gameplay Quality Validator
 *
 * Scores five dimensions (0–20 each, total 0–100):
 *   Exploration — interior walls, dead ends, spawn-to-exit distance
 *   Puzzles     — items to collect, switches, locked doors
 *   Items       — collectible item entities placed in levels
 *   Variety     — different level types across the campaign
 *   Progression — escalating challenge, quest chains, completion screen
 *
 * Adventures scoring below 60 have gameplay errors added to the error list,
 * blocking import and directing auto-repair.
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
  meaningfulDoorCount: number;
  interiorWallCount: number;
  deadEndCount: number;
  spawnToExitDist: number;  // Infinity if no exit
  hasExitToCompletion: boolean;
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

  // Locate spawn (prefer entity over level spawnX/spawnY)
  let spawnX = typeof rawLevel.spawnX === 'number' ? rawLevel.spawnX : 0;
  let spawnY = typeof rawLevel.spawnY === 'number' ? rawLevel.spawnY : 0;
  for (const e of entities) {
    if (e.type === 'spawn' && typeof e.x === 'number' && typeof e.y === 'number') {
      spawnX = e.x; spawnY = e.y; break;
    }
  }

  // Item entities placed in the map
  const itemEntityCount = entities.filter(e => e.type === 'item').length;

  // NPC count (from level.npcs array)
  const npcCount = Array.isArray(rawLevel.npcs) ? (rawLevel.npcs as unknown[]).length : 0;

  // Switch count (from level.switches array)
  const switchCount = Array.isArray(rawLevel.switches) ? (rawLevel.switches as unknown[]).length : 0;

  // Meaningful doors: not free / not openedByDefault
  const rawDoors: RawDoor[] = Array.isArray(rawLevel.doors)
    ? (rawLevel.doors as unknown[]).map(d => d as RawDoor)
    : [];
  const meaningfulDoorCount = rawDoors.filter(d => d.openedByDefault !== true && d.type !== 'free').length;

  // Interior geometry analysis
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

  return {
    slug, name, order, itemEntityCount, switchCount, npcCount,
    meaningfulDoorCount, interiorWallCount, deadEndCount,
    spawnToExitDist, hasExitToCompletion,
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
    (l.switchCount > 0 && l.meaningfulDoorCount > 0)
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

  const dists = levels.map(l => l.spawnToExitDist).filter(d => d !== Infinity);
  const distIncreases = dists.length >= 2 && (dists[dists.length - 1] ?? 0) > (dists[0] ?? 0);

  const halfway = Math.floor(numLevels / 2);
  const laterLevelsHaveDoors = numLevels >= 2 &&
    levels.slice(halfway).some(l => l.meaningfulDoorCount > 0);

  return Math.min(20,
    (hasCompletion ? 5 : 0) +
    (questCount >= 2 ? 4 : 0) +
    (questCount >= numLevels ? 3 : 0) +
    (distIncreases ? 4 : 0) +
    (laterLevelsHaveDoors ? 4 : 0)
  );
}

// ── Error generation (only when total < 60) ───────────────────────────────────

function generateErrors(score: GameplayScore, levels: LevelAnalysis[]): ValidationError[] {
  if (score.total >= 60) return [];

  const errors: ValidationError[] = [];

  // Per-level path errors
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
    l => l.itemEntityCount === 0 && l.switchCount === 0 && l.meaningfulDoorCount === 0
  );
  if (allBoring) {
    errors.push({
      path: 'gameplay.variety',
      message: `All levels are "spawn → NPC → exit" with no puzzles, items, or locked doors. ` +
        `Add at least one puzzle level and one exploration level. ` +
        `Puzzle templates: (A) Key Hunt — item entity + key_door locked on item_owned; ` +
        `(B) Switch Puzzle — switch entity + switch_door; ` +
        `(C) Multi-Room — item in side room unlocks exit door.`,
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

  // Always append score summary so GPT knows the breakdown
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
    // Structural validator handles missing levels — skip gameplay
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
    `, items=${l.itemEntityCount}, switches=${l.switchCount}` +
    `, doors=${l.meaningfulDoorCount}, walls=${l.interiorWallCount}` +
    `, deadEnds=${l.deadEndCount}`
  );

  const score: GameplayScore = { total, exploration, puzzles, items, variety, progression, details };
  const errors = generateErrors(score, levels);

  return { score, errors };
}

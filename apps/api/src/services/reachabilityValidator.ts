/**
 * Adventure Reachability Validator
 *
 * Runs a BFS flood-fill from each level's spawn tile to verify that every
 * NPC, item, exit, and switch is physically reachable in normal gameplay.
 *
 * Strategy — "maximum permissive" BFS:
 *   Treat ALL door tiles as walkable, regardless of lock state.
 *   This catches sealed rooms (no path at all) without flagging intentionally
 *   locked areas that require a key or quest to open.
 *
 * Additionally checks campaign-level connectivity: every level listed in the
 * timeline must be reachable transitively from the starting level via exits.
 */

export interface ReachabilityError { path: string; message: string; }

// ── Internal types for raw (unknown-typed) map data ───────────────────────────

interface RawEntity {
  id?:              unknown;
  type?:            unknown;
  x?:               unknown;
  y?:               unknown;
  refId?:           unknown;
  targetLevelSlug?: unknown;
  label?:           unknown;
}

interface RawLevel {
  slug:     string;
  name:     string;
  mapData?: unknown;
  npcs?:    Array<{ name: string; positionX?: number; positionY?: number }>;
  doors?:   Array<{ name: string; tileX: number; tileY: number; openedByDefault?: boolean; type?: string }>;
  switches?: Array<{ name: string; tileX: number; tileY: number }>;
}

interface RawTimeline {
  type?:     unknown;
  refSlug?:  unknown;
  order?:    unknown;
  isRequired?: unknown;
}

// ── BFS helpers ───────────────────────────────────────────────────────────────

function pos(x: number, y: number): string { return `${x},${y}`; }

const DIRS: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function bfsFlood(
  width:    number,
  height:   number,
  tiles:    unknown[][],
  startX:   number,
  startY:   number,
  extras:   ReadonlySet<string>, // positions treated as walkable beyond tile value
): Set<string> {
  const visited = new Set<string>();

  function crossable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    if (extras.has(pos(x, y))) return true;
    const t = (tiles[y] as unknown[] | undefined)?.[x];
    return t === 1 || t === 2 || t === 3;
  }

  if (!crossable(startX, startY)) return visited;

  const queue: Array<[number, number]> = [[startX, startY]];
  visited.add(pos(startX, startY));

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    const [cx, cy] = item;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      const k = pos(nx, ny);
      if (!visited.has(k) && crossable(nx, ny)) {
        visited.add(k);
        queue.push([nx, ny]);
      }
    }
  }

  return visited;
}

// An entity is accessible if its own tile is reachable, OR it sits on an
// impassable tile (wall/border) but an adjacent tile is reachable.
// This handles exits and switches that conventionally sit on border walls.
function accessible(reachable: ReadonlySet<string>, x: number, y: number): boolean {
  if (reachable.has(pos(x, y))) return true;
  for (const [dx, dy] of DIRS) {
    if (reachable.has(pos(x + dx, y + dy))) return true;
  }
  return false;
}

// ── Per-level reachability check ──────────────────────────────────────────────

function checkLevel(level: RawLevel): ReachabilityError[] {
  const errors: ReachabilityError[] = [];
  const pref = `levels[${level.slug}]`;
  const ln   = `Level "${level.name}"`;

  if (!level.mapData || typeof level.mapData !== 'object') return errors;
  const md = level.mapData as Record<string, unknown>;

  const width    = typeof md['width']  === 'number' ? md['width']  : 0;
  const height   = typeof md['height'] === 'number' ? md['height'] : 0;
  const tiles    = Array.isArray(md['tiles'])    ? (md['tiles'] as unknown[][]) : [];
  const entities = Array.isArray(md['entities']) ? (md['entities'] as RawEntity[]) : [];

  if (width === 0 || height === 0 || tiles.length === 0) return errors; // mapData not yet populated

  // ── Spawn ──
  const spawnEnt = entities.find(e => e.type === 'spawn');
  if (!spawnEnt) {
    errors.push({ path: `${pref}.mapData`, message: `${ln}: no spawn entity in mapData.entities` });
    return errors; // can't BFS without spawn
  }

  const sx = typeof spawnEnt.x === 'number' ? spawnEnt.x : -1;
  const sy = typeof spawnEnt.y === 'number' ? spawnEnt.y : -1;
  if (sx < 0 || sy < 0) {
    errors.push({ path: `${pref}.mapData.spawn`, message: `${ln}: spawn entity is missing x/y coordinates` });
    return errors;
  }

  const spawnTile = (tiles[sy] as unknown[] | undefined)?.[sx];
  if (spawnTile !== 1 && spawnTile !== 2 && spawnTile !== 3) {
    errors.push({
      path: `${pref}.mapData.spawn`,
      message: `${ln}: spawn at (${sx},${sy}) is on tile ${String(spawnTile ?? '?')} — must be a walkable tile (1, 2, or 3)`,
    });
    return errors; // BFS would immediately fail
  }

  // ── Build extra-walkable set: exits + ALL door tiles (permissive) ──
  const extras = new Set<string>();
  const exitEnts: RawEntity[] = [];

  for (const e of entities) {
    if (e.type === 'exit') {
      const ex = typeof e.x === 'number' ? e.x : -1;
      const ey = typeof e.y === 'number' ? e.y : -1;
      if (ex >= 0 && ey >= 0) { extras.add(pos(ex, ey)); exitEnts.push(e); }
    }
  }

  for (const door of (level.doors ?? [])) {
    extras.add(pos(door.tileX, door.tileY));
  }

  // ── Flood-fill ──
  const reachable = bfsFlood(width, height, tiles, sx, sy, extras);

  // ── NPCs ──
  const badNpcs: string[] = [];
  for (const npc of (level.npcs ?? [])) {
    const nx = typeof npc.positionX === 'number' ? npc.positionX : -1;
    const ny = typeof npc.positionY === 'number' ? npc.positionY : -1;
    if (nx < 0 || ny < 0) continue;
    if (!accessible(reachable, nx, ny)) badNpcs.push(`${npc.name} at (${nx},${ny})`);
  }
  if (badNpcs.length) {
    errors.push({
      path: `${pref}.npcs`,
      message: `${ln}: unreachable NPC${badNpcs.length > 1 ? 's' : ''} (no walkable path exists even with all doors open — the room is sealed): ${badNpcs.join('; ')}`,
    });
  }

  // ── Items ──
  const badItems: string[] = [];
  for (const e of entities) {
    if (e.type !== 'item') continue;
    const ix = typeof e.x === 'number' ? e.x : -1;
    const iy = typeof e.y === 'number' ? e.y : -1;
    if (ix < 0 || iy < 0) continue;
    const id = typeof e.refId === 'string' ? e.refId
             : typeof e.id    === 'string' ? e.id
             : `item@(${ix},${iy})`;
    if (!accessible(reachable, ix, iy)) badItems.push(`${id} at (${ix},${iy})`);
  }
  if (badItems.length) {
    errors.push({
      path: `${pref}.mapData.entities`,
      message: `${ln}: unreachable item${badItems.length > 1 ? 's' : ''} (sealed room — no floor tile path exists): ${badItems.join('; ')}`,
    });
  }

  // ── Exits ──
  if (exitEnts.length === 0) {
    errors.push({ path: `${pref}.mapData.entities`, message: `${ln}: no exit entity — player cannot leave this level` });
  } else {
    const badExits: string[] = [];
    for (const e of exitEnts) {
      const ex = typeof e.x === 'number' ? e.x : -1;
      const ey = typeof e.y === 'number' ? e.y : -1;
      const label = typeof e.label === 'string' ? e.label : `exit → ${String(e.targetLevelSlug ?? '?')}`;
      if (!accessible(reachable, ex, ey)) badExits.push(`"${label}" at (${ex},${ey})`);
    }
    if (badExits.length) {
      errors.push({
        path: `${pref}.mapData.entities`,
        message: `${ln}: unreachable exit${badExits.length > 1 ? 's' : ''}: ${badExits.join('; ')}`,
      });
    }
  }

  // ── Switches ──
  const badSwitches: string[] = [];
  for (const sw of (level.switches ?? [])) {
    if (!accessible(reachable, sw.tileX, sw.tileY)) badSwitches.push(`"${sw.name}" at (${sw.tileX},${sw.tileY})`);
  }
  if (badSwitches.length) {
    errors.push({
      path: `${pref}.switches`,
      message: `${ln}: unreachable switch${badSwitches.length > 1 ? 'es' : ''}: ${badSwitches.join('; ')}`,
    });
  }

  return errors;
}

// ── Campaign-level connectivity (are all levels reachable from level 1?) ──────

function checkCampaignConnectivity(levels: RawLevel[], timeline: RawTimeline[]): ReachabilityError[] {
  if (levels.length < 2) return [];

  // slug → set of level slugs reachable via exits
  const graph = new Map<string, Set<string>>();
  for (const level of levels) {
    const targets = new Set<string>();
    const md = level.mapData as Record<string, unknown> | undefined;
    if (md && Array.isArray(md['entities'])) {
      for (const e of (md['entities'] as RawEntity[])) {
        if (e.type === 'exit' && typeof e.targetLevelSlug === 'string'
            && e.targetLevelSlug !== '__adventure_complete__') {
          targets.add(e.targetLevelSlug);
        }
      }
    }
    graph.set(level.slug, targets);
  }

  // Ordered timeline level entries
  const tlLevels = timeline
    .filter(t => t.type === 'level' && typeof t.refSlug === 'string')
    .sort((a, b) => (typeof a.order === 'number' ? a.order : 999) - (typeof b.order === 'number' ? b.order : 999));

  const startSlug = (tlLevels[0]?.refSlug as string | undefined) ?? levels[0]?.slug;
  if (!startSlug) return [];

  // BFS over level graph
  const visited = new Set<string>([startSlug]);
  const queue = [startSlug];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of (graph.get(cur) ?? [])) {
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }

  const errors: ReachabilityError[] = [];
  for (const entry of tlLevels.slice(1)) {
    const slug = entry.refSlug as string;
    if (!visited.has(slug)) {
      const name = levels.find(l => l.slug === slug)?.name ?? slug;
      errors.push({
        path: 'timeline',
        message: `Level "${name}" (${slug}) is not reachable from the starting level — no chain of exits connects to it. Add an exit in a preceding level pointing to "${slug}".`,
      });
    }
  }
  return errors;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function validateReachability(payload: unknown): ReachabilityError[] {
  if (!payload || typeof payload !== 'object') return [];

  const p = payload as { levels?: unknown; timeline?: unknown };
  if (!Array.isArray(p.levels) || p.levels.length === 0) return [];

  const levels   = p.levels  as RawLevel[];
  const timeline = Array.isArray(p.timeline) ? (p.timeline as RawTimeline[]) : [];

  const errors: ReachabilityError[] = [];
  for (const level of levels) errors.push(...checkLevel(level));
  errors.push(...checkCampaignConnectivity(levels, timeline));
  return errors;
}

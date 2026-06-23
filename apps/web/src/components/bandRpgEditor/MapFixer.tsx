/**
 * MapFixer — interactive tile editor for fixing map reachability errors.
 * User can click tiles to toggle wall (0) ↔ floor (1).
 * "Auto-Carve" finds unreachable exits and carves a Manhattan corridor to them.
 * On save, calls onSave with the updated mapData.
 */

import { useState, useCallback } from 'react';

interface RawEntity {
  type?: string;
  x?: number;
  y?: number;
  targetLevelSlug?: string;
  refId?: string;
  label?: string;
  id?: string;
}

interface MapData {
  width?: number;
  height?: number;
  tiles?: number[][];
  entities?: RawEntity[];
}

interface MapFixerProps {
  mapData: MapData;
  levelName: string;
  onSave: (updated: MapData) => void;
  onClose: () => void;
}

const CELL_PX = 22;

const TILE_COLORS: Record<number, string> = {
  0: '#374151',  // wall — gray-700
  1: '#e5e7eb',  // floor — gray-200
  2: '#d1d5db',  // elevated — gray-300
  3: '#93c5fd',  // special — blue-300
};

const ENTITY_COLORS: Record<string, string> = {
  spawn:  '#22c55e',   // green-500
  exit:   '#3b82f6',   // blue-500
  npc:    '#a855f7',   // purple-500
  item:   '#facc15',   // yellow-400
  door:   '#ef4444',   // red-500
  switch: '#fb923c',   // orange-400
};

// ── BFS helpers ────────────────────────────────────────────────────────────

function bfsFlood(tiles: number[][], spawnX: number, spawnY: number): Set<string> {
  const height = tiles.length;
  const width  = tiles[0]?.length ?? 0;
  const reachable = new Set<string>();
  const queue: [number, number][] = [[spawnX, spawnY]];
  reachable.add(`${spawnX},${spawnY}`);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const [cx, cy] = next;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = `${nx},${ny}`;
      if (reachable.has(key)) continue;
      const tile = tiles[ny]?.[nx] ?? 0;
      if (tile === 0) continue;
      reachable.add(key);
      queue.push([nx, ny]);
    }
  }
  return reachable;
}

function isAccessible(x: number, y: number, reachable: Set<string>): boolean {
  if (reachable.has(`${x},${y}`)) return true;
  for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
    if (reachable.has(`${x+dx},${y+dy}`)) return true;
  }
  return false;
}

// Find tile in reachable set nearest to target using BFS over reachable tiles
function nearestReachableTo(
  targetX: number, targetY: number,
  reachable: Set<string>,
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestDist = Infinity;
  for (const key of reachable) {
    const [rx, ry] = key.split(',').map(Number) as [number, number];
    const dist = Math.abs(rx - targetX) + Math.abs(ry - targetY);
    if (dist < bestDist) {
      bestDist = dist;
      best = [rx, ry];
    }
  }
  return best;
}

// Carve Manhattan corridor: x-axis first, then y-axis, changing 0→1
function carvePath(
  tiles: number[][],
  fromX: number, fromY: number,
  toX: number, toY: number,
): number[][] {
  const out = tiles.map(row => [...row]);
  let cx = fromX;
  let cy = fromY;
  while (cx !== toX) {
    const row = out[cy];
    if (row && (row[cx] ?? 0) === 0) row[cx] = 1;
    cx += toX > cx ? 1 : -1;
  }
  while (cy !== toY) {
    const row = out[cy];
    if (row && (row[cx] ?? 0) === 0) row[cx] = 1;
    cy += toY > cy ? 1 : -1;
  }
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────

export function MapFixer({ mapData, levelName, onSave, onClose }: MapFixerProps) {
  const origTiles  = mapData.tiles ?? [];
  const origWidth  = mapData.width  ?? (origTiles[0]?.length ?? 0);
  const origHeight = mapData.height ?? origTiles.length;
  const entities   = mapData.entities ?? [];

  // Deep-copy tiles into local state
  const [tiles, setTiles] = useState<number[][]>(() =>
    Array.from({ length: origHeight }, (_, y) =>
      Array.from({ length: origWidth }, (_, x) => origTiles[y]?.[x] ?? 0),
    ),
  );

  const [autoCarveLog, setAutoCarveLog] = useState<string[]>([]);

  // Entities keyed by position for rendering
  const entityAt = useCallback((x: number, y: number): string | null => {
    const e = entities.find(en => en.x === x && en.y === y && en.type);
    return e?.type ?? null;
  }, [entities]);

  const spawn = entities.find(e => e.type === 'spawn');
  const exits = entities.filter(e => e.type === 'exit');

  // Click toggles 0↔1 (walls only; elevated/special stay as-is)
  function toggleTile(x: number, y: number) {
    setTiles(prev => prev.map((row, ry) =>
      ry !== y ? row : row.map((tile, rx) => {
        if (rx !== x) return tile;
        return tile === 0 ? 1 : (tile === 1 ? 0 : tile);
      }),
    ));
  }

  function handleAutoCarve() {
    if (!spawn || typeof spawn.x !== 'number' || typeof spawn.y !== 'number') {
      setAutoCarveLog(['No spawn entity found — cannot auto-carve.']);
      return;
    }

    const spawnX = spawn.x;
    const spawnY = spawn.y;
    const log: string[] = [];
    let currentTiles = tiles;

    for (const exit of exits) {
      if (typeof exit.x !== 'number' || typeof exit.y !== 'number') continue;
      const reachable = bfsFlood(currentTiles, spawnX, spawnY);
      if (isAccessible(exit.x, exit.y, reachable)) {
        log.push(`✓ Exit at (${exit.x},${exit.y}) is already reachable.`);
        continue;
      }

      // Find exit's closest adjacent non-border tile as the target
      const adjOptions: [number, number][] = [
        [exit.x - 1, exit.y], [exit.x + 1, exit.y],
        [exit.x, exit.y - 1], [exit.x, exit.y + 1],
      ].filter(([px, py]) =>
        px >= 0 && py >= 0 && px < origWidth && py < origHeight,
      ) as [number, number][];

      const target = adjOptions[0];
      if (!target) { log.push(`⚠ Exit at (${exit.x},${exit.y}): no adjacent tile to carve to.`); continue; }
      const [tx, ty] = target;

      const nearest = nearestReachableTo(tx, ty, reachable);
      if (!nearest) { log.push(`⚠ No reachable tile found for exit at (${exit.x},${exit.y}).`); continue; }

      log.push(`✂ Carving corridor from (${nearest[0]},${nearest[1]}) to (${tx},${ty}) for exit at (${exit.x},${exit.y}).`);
      currentTiles = carvePath(currentTiles, nearest[0], nearest[1], tx, ty);
    }

    setTiles(currentTiles);
    setAutoCarveLog(log);
  }

  function handleSave() {
    onSave({
      ...mapData,
      width:  origWidth,
      height: origHeight,
      tiles,
    });
  }

  const gridW = origWidth  * CELL_PX;
  const gridH = origHeight * CELL_PX;

  // Compute reachability for live preview
  const spawnX = typeof spawn?.x === 'number' ? spawn.x : -1;
  const spawnY = typeof spawn?.y === 'number' ? spawn.y : -1;
  const reachable = spawnX >= 0 ? bfsFlood(tiles, spawnX, spawnY) : new Set<string>();
  const unreachableExits = exits.filter(e =>
    typeof e.x === 'number' && typeof e.y === 'number' &&
    !isAccessible(e.x, e.y, reachable),
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200 bg-surface-50">
          <div>
            <h2 className="text-sm font-semibold text-surface-900">Map Editor — {levelName}</h2>
            <p className="text-xs text-surface-500 mt-0.5">
              Click tiles to toggle wall ↔ floor. Exits must be reachable from spawn via floor tiles.
            </p>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-700 text-lg leading-none px-2">✕</button>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-4 flex gap-4 flex-wrap">

          {/* Tile grid */}
          <div className="shrink-0">
            <div
              className="relative border border-surface-300 rounded cursor-crosshair"
              style={{ width: gridW, height: gridH }}
            >
              {tiles.map((row, y) =>
                row.map((tile, x) => {
                  const entityType = entityAt(x, y);
                  const isReach = reachable.has(`${x},${y}`);
                  const bg = TILE_COLORS[tile] ?? TILE_COLORS[0]!;
                  const entityColor = entityType ? (ENTITY_COLORS[entityType] ?? '#6b7280') : null;

                  return (
                    <div
                      key={`${y}-${x}`}
                      onClick={() => toggleTile(x, y)}
                      title={entityType ? `${entityType} entity` : (tile === 0 ? 'wall (click→floor)' : 'floor (click→wall)')}
                      style={{
                        position: 'absolute',
                        left: x * CELL_PX,
                        top:  y * CELL_PX,
                        width:  CELL_PX,
                        height: CELL_PX,
                        backgroundColor: entityColor ?? bg,
                        outline: tile !== 0 && !isReach ? '2px solid #f97316' : undefined,
                        opacity: tile === 0 ? 0.85 : 1,
                        boxSizing: 'border-box',
                      }}
                    >
                      {entityType && (
                        <span style={{
                          position: 'absolute', inset: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, color: '#fff',
                          textShadow: '0 0 2px rgba(0,0,0,0.6)',
                        }}>
                          {entityType === 'spawn' ? 'S' : entityType === 'exit' ? 'E' : entityType === 'npc' ? 'N' : entityType === 'item' ? 'I' : entityType === 'door' ? 'D' : 'W'}
                        </span>
                      )}
                    </div>
                  );
                }),
              )}
            </div>
            <p className="text-xs text-surface-400 mt-1 text-center">{origWidth}×{origHeight} tiles</p>
          </div>

          {/* Side panel */}
          <div className="flex-1 min-w-[200px] space-y-4">

            {/* Reachability status */}
            <div className={`rounded-lg p-3 text-xs ${unreachableExits.length === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-orange-50 border border-orange-300'}`}>
              {unreachableExits.length === 0 ? (
                <p className="text-emerald-700 font-medium">✅ All exits are reachable from spawn</p>
              ) : (
                <>
                  <p className="text-orange-800 font-semibold mb-1">⚠ {unreachableExits.length} unreachable exit{unreachableExits.length !== 1 ? 's' : ''}</p>
                  <ul className="space-y-0.5">
                    {unreachableExits.map((e, i) => (
                      <li key={i} className="text-orange-700">
                        Exit at ({e.x},{e.y}){e.targetLevelSlug ? ` → ${e.targetLevelSlug}` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Legend */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-surface-600">Legend</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  { color: TILE_COLORS[0]!, label: 'Wall (0)' },
                  { color: TILE_COLORS[1]!, label: 'Floor (1)' },
                  { color: '#f97316',       label: 'Unreachable', outline: true },
                ].map(({ color, label, outline }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm border border-surface-300 shrink-0"
                      style={{ backgroundColor: color, outline: outline ? '2px solid #f97316' : undefined }} />
                    {label}
                  </div>
                ))}
                {Object.entries(ENTITY_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                    {type}
                  </div>
                ))}
              </div>
            </div>

            {/* Tip */}
            <div className="bg-surface-50 rounded-lg p-3 text-xs text-surface-600 space-y-1">
              <p className="font-medium">Tips</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Click any tile to toggle wall ↔ floor</li>
                <li>Orange outline = floor tile not yet reachable from spawn</li>
                <li>Exits on border walls are accessible if an adjacent floor tile is reachable</li>
                <li><strong>Auto-Carve</strong> draws the shortest corridor to each unreachable exit</li>
              </ul>
            </div>

            {/* Auto-carve log */}
            {autoCarveLog.length > 0 && (
              <div className="bg-surface-50 rounded-lg p-3 text-xs font-mono space-y-0.5">
                {autoCarveLog.map((line, i) => (
                  <div key={i} className={line.startsWith('✓') ? 'text-emerald-600' : line.startsWith('✂') ? 'text-indigo-600' : 'text-orange-600'}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-surface-200 bg-surface-50">
          <button
            onClick={handleAutoCarve}
            className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
          >
            ✂ Auto-Carve Path
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-surface-300 text-surface-600 hover:bg-surface-50 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
            >
              ✓ Apply Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

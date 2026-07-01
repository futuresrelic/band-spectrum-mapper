import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgEditorApi, type EditorLevel, type MapData, type TileType, type MapEntity, type EditorDoor } from '../../api/bandRpgEditor';
import { bandsApi } from '../../api/bands';

// ── Tile palette ──────────────────────────────────────────────────────────────

const TILE_TYPES: Record<number, { label: string; color: string; border: string }> = {
  0: { label: 'Empty',  color: '#1a1a2e', border: '#2a2a3e' },
  1: { label: 'Floor',  color: '#9e835a', border: '#b89a6a' },
  2: { label: 'Wall',   color: '#4a4a6a', border: '#3a3a5a' },
  3: { label: 'Shelf',  color: '#7b5c3a', border: '#8b6c4a' },
};

const ENTITY_TOOLS: Record<string, { label: string; bg: string; char: string }> = {
  spawn: { label: 'Spawn',  bg: '#22c55e', char: 'S' },
  exit:  { label: 'Exit',   bg: '#3b82f6', char: 'X' },
  npc:   { label: 'NPC',    bg: '#a855f7', char: 'N' },
  item:  { label: 'Item',   bg: '#f59e0b', char: 'I' },
  door:  { label: 'Door',   bg: '#ef4444', char: 'D' },
};

const DOOR_TYPES: EditorDoor['type'][] = ['free', 'key_door', 'quest_door', 'story_door', 'switch_door'];

const CELL_SIZE = 16;

type ActiveTool = TileType | 'spawn' | 'exit' | 'npc' | 'item' | 'door' | 'erase';

function makeDefaultMap(w = 40, h = 25): MapData {
  return {
    width: w,
    height: h,
    tiles: Array.from({ length: h }, () => Array.from({ length: w }, (): TileType => 0)),
    entities: [],
  };
}

function parseMapData(raw: unknown): MapData {
  if (
    raw && typeof raw === 'object' && !Array.isArray(raw) &&
    'width' in raw && 'height' in raw && 'tiles' in raw
  ) {
    return raw as MapData;
  }
  return makeDefaultMap();
}

// ── DoorRow — inline door editor used inside the Placed Doors list ────────────

function DoorRow({ door, levelId }: { door: EditorDoor; levelId: string }) {
  const qc = useQueryClient();
  const inv = useCallback(() => void qc.invalidateQueries({ queryKey: ['editor-doors', levelId] }), [qc, levelId]);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(door.name);
  const [type, setType] = useState<EditorDoor['type']>(door.type);
  const [tileX, setTileX] = useState(door.tileX);
  const [tileY, setTileY] = useState(door.tileY);
  const [openedByDefault, setOpenedByDefault] = useState(door.openedByDefault);

  const updateMutation = useMutation({
    mutationFn: () => bandRpgEditorApi.updateDoor(levelId, door.id, { name, type, tileX, tileY, openedByDefault }),
    onSuccess: () => { setEditing(false); inv(); },
  });
  const deleteMutation = useMutation({
    mutationFn: () => bandRpgEditorApi.deleteDoor(levelId, door.id),
    onSuccess: inv,
  });

  const hasNoLockCondition = !door.openedByDefault && door.type !== 'free' && Object.keys(door.lockCondition).length === 0;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="px-1.5 py-0.5 bg-red-500 text-white font-bold rounded flex-shrink-0">D</span>
        <span className="font-medium text-surface-800 flex-1 truncate">{door.name}</span>
        <span className="text-surface-400">({door.tileX},{door.tileY})</span>
        <span className="px-1.5 py-0.5 bg-surface-100 text-surface-600 rounded">{door.type.replace(/_/g, ' ')}</span>
        {door.openedByDefault && <span className="text-emerald-600 font-medium">open</span>}
        {hasNoLockCondition && <span className="text-amber-600" title="No lock condition set">⚠</span>}
        <button onClick={() => setEditing(v => !v)} className="text-indigo-600 hover:text-indigo-800 ml-1">Edit</button>
        <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="text-red-500 hover:text-red-700 ml-1">✕</button>
      </div>
      {editing && (
        <div className="space-y-2 pt-2 border-t border-red-100">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-surface-600 font-medium block mb-0.5">Name</label>
              <input
                className="border border-surface-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-indigo-500"
                value={name} onChange={e => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-surface-600 font-medium block mb-0.5">Type</label>
              <select
                className="border border-surface-300 rounded px-2 py-1 text-xs w-full"
                value={type} onChange={e => setType(e.target.value as EditorDoor['type'])}
              >
                {DOOR_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-surface-600 font-medium block mb-0.5">Tile X</label>
              <input
                type="number" className="border border-surface-300 rounded px-2 py-1 text-xs w-full"
                value={tileX} onChange={e => setTileX(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-xs text-surface-600 font-medium block mb-0.5">Tile Y</label>
              <input
                type="number" className="border border-surface-300 rounded px-2 py-1 text-xs w-full"
                value={tileY} onChange={e => setTileY(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox" id={`obd-${door.id}`}
              checked={openedByDefault} onChange={e => setOpenedByDefault(e.target.checked)}
              className="rounded"
            />
            <label htmlFor={`obd-${door.id}`} className="text-xs text-surface-700">Opened by default (no unlock required)</label>
          </div>
          {!openedByDefault && type !== 'free' && Object.keys(door.lockCondition).length === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              No lock condition set — this door will stay closed forever. Set one in the World Editor Doors tab.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => updateMutation.mutate()}
              disabled={!name.trim() || updateMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Door'}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-surface-500 hover:text-surface-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TileEditor ────────────────────────────────────────────────────────────────

function TileEditor({ levelId, initial }: { levelId: string; initial: MapData }) {
  const qc = useQueryClient();
  const [mapData, setMapData] = useState<MapData>(initial);
  const [activeTool, setActiveTool] = useState<ActiveTool>(1);
  const [isDirty, setIsDirty] = useState(false);
  const isDrawingRef = useRef(false);

  // ── Door state (DB entities, separate from mapData) ─────────────────────────
  const [movingDoorId, setMovingDoorId] = useState<string | null>(null);

  const { data: doors = [] } = useQuery({
    queryKey: ['editor-doors', levelId],
    queryFn: () => bandRpgEditorApi.listDoors(levelId),
    staleTime: 30_000,
  });
  const createDoorMutation = useMutation({
    mutationFn: (data: Partial<EditorDoor>) => bandRpgEditorApi.createDoor(levelId, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['editor-doors', levelId] }),
  });
  const moveDoorMutation = useMutation({
    mutationFn: ({ id, tileX, tileY }: { id: string; tileX: number; tileY: number }) =>
      bandRpgEditorApi.updateDoor(levelId, id, { tileX, tileY }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['editor-doors', levelId] }),
  });
  const deleteDoorMutation = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteDoor(levelId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['editor-doors', levelId] }),
  });

  const saveMutation = useMutation({
    mutationFn: () => bandRpgEditorApi.saveMap(levelId, mapData),
    onSuccess: () => {
      setIsDirty(false);
      void qc.invalidateQueries({ queryKey: ['editor-levels'] });
    },
  });

  const applyTool = useCallback((x: number, y: number) => {
    if (activeTool === 'door') return; // doors are DB entities, handled in handleMouseDown
    setMapData(prev => {
      if (typeof activeTool === 'number') {
        const newTiles = prev.tiles.map((row, ry) =>
          ry === y ? row.map((cell, cx) => cx === x ? activeTool as TileType : cell) : row
        );
        return { ...prev, tiles: newTiles };
      }
      if (activeTool === 'erase') {
        return { ...prev, entities: prev.entities.filter(e => !(e.x === x && e.y === y)) };
      }
      const entityType = activeTool as 'spawn' | 'exit' | 'npc' | 'item';
      let newEntities = prev.entities.filter(e => !(e.x === x && e.y === y));
      if (entityType === 'spawn') {
        newEntities = newEntities.filter(e => e.type !== 'spawn');
      }
      newEntities.push({ id: crypto.randomUUID(), type: entityType, x, y });
      return { ...prev, entities: newEntities };
    });
    setIsDirty(true);
  }, [activeTool]);

  const handleMouseDown = (e: React.MouseEvent, x: number, y: number) => {
    e.preventDefault();
    isDrawingRef.current = true;

    // ── Door tool: select → move, or create ────────────────────────────────
    if (activeTool === 'door') {
      const doorAtTile = doors.find(d => d.tileX === x && d.tileY === y);
      if (doorAtTile) {
        setMovingDoorId(prev => prev === doorAtTile.id ? null : doorAtTile.id);
      } else if (movingDoorId) {
        moveDoorMutation.mutate({ id: movingDoorId, tileX: x, tileY: y });
        setMovingDoorId(null);
      } else {
        createDoorMutation.mutate({
          name: `Gate ${doors.length + 1}`, tileX: x, tileY: y,
          type: 'key_door', openedByDefault: false,
        });
      }
      return;
    }

    // ── Erase: also removes a DB door at the tile ───────────────────────────
    if (activeTool === 'erase') {
      const doorAtTile = doors.find(d => d.tileX === x && d.tileY === y);
      if (doorAtTile) {
        deleteDoorMutation.mutate(doorAtTile.id);
        return;
      }
    }

    applyTool(x, y);
  };
  const handleMouseEnter = (x: number, y: number) => {
    if (isDrawingRef.current && typeof activeTool === 'number') applyTool(x, y);
  };
  const stopDrawing = () => { isDrawingRef.current = false; };

  const resizeMap = (newW: number, newH: number) => {
    setMapData(prev => {
      const newTiles: TileType[][] = Array.from({ length: newH }, (_, ry) => {
        const existingRow = prev.tiles[ry] ?? [];
        return Array.from({ length: newW }, (_c, cx): TileType => existingRow[cx] ?? 0);
      });
      const newEntities = prev.entities.filter(e => e.x < newW && e.y < newH);
      return { width: newW, height: newH, tiles: newTiles, entities: newEntities };
    });
    setIsDirty(true);
  };

  const entityAt = (x: number, y: number): MapEntity | undefined =>
    mapData.entities.find(e => e.x === x && e.y === y);

  const tileCount = (type: number) =>
    mapData.tiles.reduce((sum, row) => sum + row.filter(t => t === type).length, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold text-surface-600 uppercase tracking-wide">Tiles:</span>
        {Object.entries(TILE_TYPES).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setActiveTool(Number(k) as TileType)}
            style={{ backgroundColor: v.color, border: `2px solid ${activeTool === Number(k) ? '#6366f1' : v.border}` }}
            className="w-8 h-8 rounded text-xs text-white font-medium transition-all"
            title={v.label}
          >
            {Number(k) === 0 ? '' : k}
          </button>
        ))}
        <span className="text-xs font-semibold text-surface-600 uppercase tracking-wide ml-3">Place:</span>
        {Object.entries(ENTITY_TOOLS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setActiveTool(k as ActiveTool)}
            style={{ backgroundColor: activeTool === k ? '#6366f1' : v.bg }}
            className="px-2 py-1 rounded text-xs text-white font-semibold transition-colors"
            title={`Place ${v.label}`}
          >
            {v.char} {v.label}
          </button>
        ))}
        <button
          onClick={() => setActiveTool('erase')}
          className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${activeTool === 'erase' ? 'bg-red-600 text-white' : 'bg-surface-200 text-surface-700 hover:bg-surface-300'}`}
        >
          Erase Entity
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-surface-400">{mapData.width}×{mapData.height}</span>
          <button
            onClick={() => { if (isDirty) saveMutation.mutate(); }}
            disabled={!isDirty || saveMutation.isPending}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {saveMutation.isPending ? 'Saving…' : isDirty ? 'Save Map' : 'Saved'}
          </button>
        </div>
      </div>

      {/* Door tool tip */}
      {activeTool === 'door' && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {movingDoorId
            ? 'Door selected (yellow ring) — click a tile to move it. Click the same door to deselect.'
            : 'Door tool — click an empty tile to create a door, or click an existing door (red D) to select it for moving.'}
        </p>
      )}

      {/* Grid */}
      <div
        className="overflow-auto rounded-lg border border-surface-300"
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={{ maxHeight: 440 }}
      >
        <div style={{ position: 'relative', width: mapData.width * CELL_SIZE, height: mapData.height * CELL_SIZE }}>
          {/* Tile grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${mapData.width}, ${CELL_SIZE}px)`,
              width: mapData.width * CELL_SIZE,
            }}
          >
            {mapData.tiles.map((row, y) =>
              row.map((tile, x) => {
                const t = TILE_TYPES[tile] ?? TILE_TYPES[0]!;
                return (
                  <div
                    key={`${y}-${x}`}
                    style={{ width: CELL_SIZE, height: CELL_SIZE, backgroundColor: t.color, boxSizing: 'border-box' }}
                    onMouseDown={e => handleMouseDown(e, x, y)}
                    onMouseEnter={() => handleMouseEnter(x, y)}
                  />
                );
              })
            )}
          </div>
          {/* Entity overlay (mapData entities) */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {mapData.entities.map(ent => {
              const tool = ENTITY_TOOLS[ent.type];
              if (!tool) return null;
              return (
                <div
                  key={ent.id}
                  style={{
                    position: 'absolute',
                    left: ent.x * CELL_SIZE,
                    top: ent.y * CELL_SIZE,
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    backgroundColor: tool.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    fontWeight: 700,
                    color: '#fff',
                    borderRadius: 2,
                    opacity: 0.85,
                  }}
                >
                  {tool.char}
                </div>
              );
            })}
          </div>
          {/* Door overlay (DB entities — always visible regardless of active tool) */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {doors.map(door => (
              <div
                key={door.id}
                style={{
                  position: 'absolute',
                  left: door.tileX * CELL_SIZE,
                  top: door.tileY * CELL_SIZE,
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  backgroundColor: door.openedByDefault ? '#10b981' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 8,
                  fontWeight: 700,
                  color: '#fff',
                  borderRadius: 2,
                  opacity: 0.92,
                  outline: movingDoorId === door.id ? '2px solid #fbbf24' : 'none',
                  outlineOffset: 1,
                  zIndex: 10,
                }}
              >
                D
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Resize + Stats */}
      <div className="flex flex-wrap gap-6 items-start">
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
          <p className="text-xs font-semibold text-surface-700 mb-2">Resize Grid</p>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-surface-500">W</label>
            <input
              type="number" min={10} max={80} defaultValue={mapData.width}
              onChange={e => resizeMap(Number(e.target.value) || mapData.width, mapData.height)}
              className="w-16 border border-surface-300 rounded px-2 py-1 text-xs"
            />
            <label className="text-xs text-surface-500">H</label>
            <input
              type="number" min={5} max={50} defaultValue={mapData.height}
              onChange={e => resizeMap(mapData.width, Number(e.target.value) || mapData.height)}
              className="w-16 border border-surface-300 rounded px-2 py-1 text-xs"
            />
          </div>
        </div>
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-3 flex-1">
          <p className="text-xs font-semibold text-surface-700 mb-2">Map Stats</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-surface-500">
            {Object.entries(TILE_TYPES).map(([k, v]) => (
              <span key={k}>{v.label}: {tileCount(Number(k))}</span>
            ))}
            {Object.entries(ENTITY_TOOLS).map(([k, v]) => (
              <span key={k}>{v.label}: {k === 'door' ? doors.length : mapData.entities.filter(e => e.type === k).length}</span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 max-w-xs">
          <strong>Test Mode (Phase B)</strong><br />
          Full in-editor playtest requires the RPG game engine, which is Phase B.
          <a href="/play/band-rpg" className="ml-1 underline text-amber-900 font-medium">Open Band RPG →</a>
        </div>
      </div>

      {/* Placed entities list */}
      {mapData.entities.length > 0 && (
        <div className="rounded-lg border border-surface-200 bg-white p-3">
          <p className="text-xs font-semibold text-surface-700 mb-2">Placed Entities</p>
          <div className="space-y-1">
            {mapData.entities.map(ent => {
              const tool = ENTITY_TOOLS[ent.type];
              return (
                <div key={ent.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="px-1.5 py-0.5 rounded text-white font-semibold"
                    style={{ backgroundColor: tool?.bg ?? '#888' }}
                  >
                    {tool?.char ?? '?'}
                  </span>
                  <span className="text-surface-700 capitalize">{ent.type}</span>
                  <span className="text-surface-400">({ent.x}, {ent.y})</span>
                  {ent.label && <span className="text-surface-500 italic">{ent.label}</span>}
                  <button
                    className="ml-auto text-red-500 hover:text-red-700"
                    onClick={() => {
                      setMapData(prev => ({ ...prev, entities: prev.entities.filter(e => e.id !== ent.id) }));
                      setIsDirty(true);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Placed Doors (from DB) */}
      {doors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-white p-3">
          <p className="text-xs font-semibold text-surface-700 mb-2">
            Placed Doors <span className="font-normal text-surface-400">({doors.length}) — visible as red D on the grid</span>
          </p>
          <div className="space-y-2">
            {doors.map(door => (
              <DoorRow key={door.id} door={door} levelId={levelId} />
            ))}
          </div>
          <p className="text-xs text-surface-400 mt-2">
            To set lock conditions (which item/quest unlocks a door), use the World Editor → Doors tab.
          </p>
        </div>
      )}

      {/* Door validation warnings */}
      {(() => {
        const warnings: string[] = [];
        const posMap = new Map<string, number>();
        doors.forEach(d => {
          const key = `${d.tileX},${d.tileY}`;
          posMap.set(key, (posMap.get(key) ?? 0) + 1);
          if (!d.openedByDefault && d.type !== 'free' && Object.keys(d.lockCondition).length === 0) {
            warnings.push(`"${d.name}" has type ${d.type.replace(/_/g, ' ')} but no lock condition — it will stay permanently closed.`);
          }
          if (d.tileX < 0 || d.tileX >= mapData.width || d.tileY < 0 || d.tileY >= mapData.height) {
            warnings.push(`"${d.name}" is outside map bounds at (${d.tileX},${d.tileY}).`);
          }
        });
        posMap.forEach((count, key) => {
          if (count > 1) warnings.push(`${count} doors overlap at tile (${key}).`);
        });
        if (warnings.length === 0) return null;
        return (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">Door Warnings</p>
            <ul className="space-y-0.5">
              {warnings.map((w, i) => <li key={i} className="text-xs text-amber-700">⚠ {w}</li>)}
            </ul>
          </div>
        );
      })()}

      {/* Current cell hover info */}
      <p className="text-xs text-surface-400">
        Active tool: <span className="font-medium text-surface-600">
          {typeof activeTool === 'number' ? TILE_TYPES[activeTool]?.label : activeTool}
        </span>
        {entityAt(0, 0) && ' · Click to place entity · Right-click not needed — use Erase Entity tool to remove'}
      </p>
    </div>
  );
}

// ── Level Form ────────────────────────────────────────────────────────────────

interface LevelFormProps {
  initial?: EditorLevel | null;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

function LevelForm({ initial, onSaved, onCancel }: LevelFormProps) {
  const qc = useQueryClient();
  const { data: bands = [] } = useQuery({ queryKey: ['bands'], queryFn: () => bandsApi.list(), staleTime: 5 * 60_000 });

  const [slug, setSlug]             = useState(initial?.slug ?? '');
  const [name, setName]             = useState(initial?.name ?? '');
  const [description, setDesc]      = useState(initial?.description ?? '');
  const [order, setOrder]           = useState(initial?.order ?? 0);
  const [background, setBackground] = useState(initial?.background ?? '#1a1a2e');
  const [spawnX, setSpawnX]         = useState(initial?.spawnX ?? 0);
  const [spawnY, setSpawnY]         = useState(initial?.spawnY ?? 0);
  const [isPublished, setPublished] = useState(initial?.isPublished ?? false);
  const [bandId, setBandId]         = useState(initial?.bandId ?? '');

  const mutation = useMutation({
    mutationFn: () => {
      const data = {
        slug: slug.trim(), name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        order, isPublished,
        background: background || '#1a1a2e',
        spawnX, spawnY,
        ...(bandId ? { bandId } : {}),
      };
      return initial
        ? bandRpgEditorApi.updateLevel(initial.id, data)
        : bandRpgEditorApi.createLevel(data);
    },
    onSuccess: level => {
      void qc.invalidateQueries({ queryKey: ['editor-levels'] });
      onSaved(level.id);
    },
  });

  const inputCls = 'border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full';
  const labelCls = 'block text-xs font-medium text-surface-700 mb-1';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Slug <span className="text-red-500">*</span></label>
          <input className={inputCls} value={slug} onChange={e => setSlug(e.target.value)} placeholder="level-one" />
        </div>
        <div>
          <label className={labelCls}>Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Level One" />
        </div>
      </div>
      <div>
        <label className={labelCls}>Description</label>
        <textarea className={inputCls} rows={2} value={description} onChange={e => setDesc(e.target.value)} placeholder="What is this level about?" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Order</label>
          <input type="number" className={inputCls} value={order} onChange={e => setOrder(Number(e.target.value))} />
        </div>
        <div>
          <label className={labelCls}>Spawn X</label>
          <input type="number" className={inputCls} value={spawnX} onChange={e => setSpawnX(Number(e.target.value))} />
        </div>
        <div>
          <label className={labelCls}>Spawn Y</label>
          <input type="number" className={inputCls} value={spawnY} onChange={e => setSpawnY(Number(e.target.value))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Background Color</label>
          <div className="flex gap-2 items-center">
            <input type="color" value={background} onChange={e => setBackground(e.target.value)} className="h-9 w-12 rounded border border-surface-300 cursor-pointer" />
            <input className={inputCls} value={background} onChange={e => setBackground(e.target.value)} placeholder="#1a1a2e" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Band (optional)</label>
          <select className={inputCls} value={bandId} onChange={e => setBandId(e.target.value)}>
            <option value="">— none —</option>
            {bands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="pub" checked={isPublished} onChange={e => setPublished(e.target.checked)} className="rounded" />
        <label htmlFor="pub" className="text-sm text-surface-700">Published (visible to players)</label>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={!slug.trim() || !name.trim() || mutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          {mutation.isPending ? 'Saving…' : initial ? 'Update Level' : 'Create Level'}
        </button>
        <button onClick={onCancel} className="text-sm text-surface-500 hover:text-surface-700 transition-colors">Cancel</button>
      </div>
      {mutation.isError && <p className="text-sm text-red-600">Failed to save. Check for duplicate slug.</p>}
    </div>
  );
}

// ── ObjectivesMini (within level detail) ─────────────────────────────────────

function ObjectivesMini({ levelId }: { levelId: string }) {
  const qc = useQueryClient();
  const { data: objectives = [], isLoading } = useQuery({
    queryKey: ['editor-objectives', levelId],
    queryFn: () => bandRpgEditorApi.listObjectives(levelId),
    staleTime: 30_000,
  });

  const [adding, setAdding] = useState(false);
  const [objName, setObjName] = useState('');
  const [objType, setObjType] = useState('find_item');

  const createMutation = useMutation({
    mutationFn: () => bandRpgEditorApi.createObjective(levelId, { name: objName, type: objType as never, order: objectives.length }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['editor-objectives', levelId] }); setAdding(false); setObjName(''); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteObjective(levelId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['editor-objectives', levelId] }),
  });

  const TYPES = ['find_item','talk_to_npc','reach_location','collect_objects','inspect_object',
    'trigger_music_node','complete_sequence','survive_timer','solve_clue','play_minigame','score_threshold'];

  if (isLoading) return <p className="text-sm text-surface-400">Loading objectives…</p>;

  return (
    <div className="space-y-3">
      {objectives.length === 0 && !adding && (
        <p className="text-sm text-surface-400 italic">No objectives yet.</p>
      )}
      {objectives.map(obj => (
        <div key={obj.id} className="flex items-center gap-3 rounded-lg border border-surface-200 px-3 py-2 bg-white">
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">{obj.type.replace(/_/g, ' ')}</span>
          <span className="text-sm text-surface-800 flex-1">{obj.name}</span>
          {obj.isOptional && <span className="text-xs text-surface-400">optional</span>}
          <button onClick={() => deleteMutation.mutate(obj.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      ))}
      {adding ? (
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-3 space-y-3">
          <input
            className="border border-surface-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-indigo-500"
            placeholder="Objective name"
            value={objName}
            onChange={e => setObjName(e.target.value)}
          />
          <select
            className="border border-surface-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none"
            value={objType}
            onChange={e => setObjType(e.target.value)}
          >
            {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!objName.trim() || createMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              {createMutation.isPending ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => setAdding(false)} className="text-xs text-surface-500 hover:text-surface-700">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          + Add Objective
        </button>
      )}
    </div>
  );
}

// ── NpcsMini (within level detail) ───────────────────────────────────────────

function NpcsMini({ levelId }: { levelId: string }) {
  const qc = useQueryClient();
  const { data: npcs = [], isLoading } = useQuery({
    queryKey: ['editor-npcs', levelId],
    queryFn: () => bandRpgEditorApi.listNpcs(levelId),
    staleTime: 30_000,
  });

  const [adding, setAdding] = useState(false);
  const [npcName, setNpcName] = useState('');
  const [npcRole, setNpcRole] = useState('ambient');

  const createMutation = useMutation({
    mutationFn: () => bandRpgEditorApi.createNpc(levelId, { name: npcName, role: npcRole }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['editor-npcs', levelId] }); setAdding(false); setNpcName(''); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteNpc(levelId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['editor-npcs', levelId] }),
  });

  const ROLES = ['quest_giver', 'merchant', 'band_member', 'ambient'];

  if (isLoading) return <p className="text-sm text-surface-400">Loading NPCs…</p>;

  return (
    <div className="space-y-3">
      {npcs.length === 0 && !adding && (
        <p className="text-sm text-surface-400 italic">No NPCs yet.</p>
      )}
      {npcs.map(npc => (
        <div key={npc.id} className="flex items-center gap-3 rounded-lg border border-surface-200 px-3 py-2 bg-white">
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">{npc.role ?? 'ambient'}</span>
          <span className="text-sm text-surface-800 flex-1">{npc.name}</span>
          <span className="text-xs text-surface-400">({npc.positionX}, {npc.positionY})</span>
          <button onClick={() => deleteMutation.mutate(npc.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      ))}
      {adding ? (
        <div className="rounded-lg border border-surface-200 bg-surface-50 p-3 space-y-3">
          <input
            className="border border-surface-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-indigo-500"
            placeholder="NPC name"
            value={npcName}
            onChange={e => setNpcName(e.target.value)}
          />
          <select
            className="border border-surface-300 rounded-lg px-3 py-2 text-sm w-full"
            value={npcRole}
            onChange={e => setNpcRole(e.target.value)}
          >
            {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!npcName.trim() || createMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              {createMutation.isPending ? 'Adding…' : 'Add NPC'}
            </button>
            <button onClick={() => setAdding(false)} className="text-xs text-surface-500 hover:text-surface-700">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-sm text-purple-600 hover:text-purple-800 font-medium"
        >
          + Add NPC
        </button>
      )}
    </div>
  );
}

// ── Level Detail ──────────────────────────────────────────────────────────────

type DetailTab = 'details' | 'map' | 'objectives' | 'npcs';

function LevelDetail({ levelId, onBack }: { levelId: string; onBack: () => void }) {
  const [detailTab, setDetailTab] = useState<DetailTab>('details');
  const [isEditing, setEditing] = useState(false);
  const navigate = useNavigate();

  const { data: level, isLoading } = useQuery({
    queryKey: ['editor-level', levelId],
    queryFn: () => bandRpgEditorApi.getLevel(levelId),
    staleTime: 15_000,
  });

  if (isLoading) return <p className="text-sm text-surface-400 py-8 text-center">Loading level…</p>;
  if (!level) return <p className="text-sm text-red-600 py-8 text-center">Level not found.</p>;

  const mapData = parseMapData(level.mapData);

  const DETAIL_TABS: { id: DetailTab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'map', label: 'Map Editor' },
    { id: 'objectives', label: 'Objectives' },
    { id: 'npcs', label: 'NPCs' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-surface-500 hover:text-surface-800 font-medium">← Back</button>
        <h2 className="text-base font-semibold text-surface-900">{level.name}</h2>
        {level.isPublished
          ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">Published</span>
          : <span className="px-2 py-0.5 bg-surface-100 text-surface-500 text-xs rounded">Draft</span>
        }
      </div>

      <div className="flex gap-1 border-b border-surface-200 pb-2">
        {DETAIL_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setDetailTab(t.id); setEditing(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              detailTab === t.id ? 'bg-surface-900 text-white' : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {detailTab === 'details' && (
        <div className="rounded-xl border border-surface-200 bg-white p-6">
          {isEditing ? (
            <LevelForm
              initial={level}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-surface-500">Slug:</span> <span className="font-medium">{level.slug}</span></div>
                <div><span className="text-surface-500">Order:</span> <span className="font-medium">{level.order}</span></div>
                <div><span className="text-surface-500">Spawn:</span> <span className="font-medium">({level.spawnX}, {level.spawnY})</span></div>
                <div className="flex items-center gap-2">
                  <span className="text-surface-500">Background:</span>
                  <span className="w-4 h-4 rounded border border-surface-200 inline-block" style={{ backgroundColor: level.background ?? '#000' }} />
                  <span className="font-medium font-mono text-xs">{level.background ?? 'none'}</span>
                </div>
              </div>
              {level.description && <p className="text-sm text-surface-600">{level.description}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(true)}
                  className="bg-surface-100 hover:bg-surface-200 text-surface-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Edit Details
                </button>
                <button
                  onClick={() => navigate(`/play/band-rpg/game/${encodeURIComponent(level.slug)}`)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  ▶ Play This Level
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {detailTab === 'map' && (
        <div className="rounded-xl border border-surface-200 bg-white p-6">
          <TileEditor levelId={levelId} initial={mapData} />
        </div>
      )}

      {detailTab === 'objectives' && (
        <div className="rounded-xl border border-surface-200 bg-white p-6">
          <h3 className="font-semibold text-surface-900 mb-4">Objectives</h3>
          <ObjectivesMini levelId={levelId} />
        </div>
      )}

      {detailTab === 'npcs' && (
        <div className="rounded-xl border border-surface-200 bg-white p-6">
          <h3 className="font-semibold text-surface-900 mb-4">NPCs</h3>
          <NpcsMini levelId={levelId} />
        </div>
      )}
    </div>
  );
}

// ── Level List ────────────────────────────────────────────────────────────────

function LevelList({ onEdit }: { onEdit: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: levels = [], isLoading } = useQuery({
    queryKey: ['editor-levels'],
    queryFn: () => bandRpgEditorApi.listLevels(),
    staleTime: 30_000,
  });

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteLevel(id),
    onSuccess: () => { setConfirmDelete(null); void qc.invalidateQueries({ queryKey: ['editor-levels'] }); },
  });

  if (isLoading) return <p className="text-sm text-surface-400 py-6 text-center">Loading levels…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">{levels.length} level{levels.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setCreating(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New Level
        </button>
      </div>

      {creating && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <h3 className="font-semibold text-surface-900 mb-4">New Level</h3>
          <LevelForm
            onSaved={id => { setCreating(false); onEdit(id); }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {levels.length === 0 && !creating && (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-10 text-center">
          <p className="text-2xl mb-2">🏔️</p>
          <p className="text-surface-500 text-sm">No levels yet. Create your first level to get started.</p>
        </div>
      )}

      {levels.map(level => (
        <div key={level.id} className="rounded-xl border border-surface-200 bg-white p-4 flex items-center gap-4">
          <div
            className="w-8 h-8 rounded shrink-0 border border-surface-200"
            style={{ backgroundColor: level.background ?? '#1a1a2e' }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-surface-900 text-sm">{level.name}</span>
              {level.isPublished
                ? <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded">Published</span>
                : <span className="px-1.5 py-0.5 bg-surface-100 text-surface-500 text-xs rounded">Draft</span>
              }
            </div>
            <p className="text-xs text-surface-400 mt-0.5">
              /{level.slug} · order {level.order} · {level._count?.objectives ?? 0} objectives · {level._count?.npcs ?? 0} NPCs
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(level.id)}
              className="bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              Edit
            </button>
            {confirmDelete === level.id ? (
              <div className="flex gap-1 items-center">
                <button
                  onClick={() => deleteMutation.mutate(level.id)}
                  disabled={deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                >
                  {deleteMutation.isPending ? '…' : 'Delete'}
                </button>
                <button onClick={() => setConfirmDelete(null)} className="text-xs text-surface-500 px-1">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(level.id)}
                className="text-red-500 hover:text-red-700 text-xs font-medium px-2"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function LevelEditor() {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (editingId) {
    return <LevelDetail levelId={editingId} onBack={() => setEditingId(null)} />;
  }
  return <LevelList onEdit={setEditingId} />;
}

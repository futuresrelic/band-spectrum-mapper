import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import Nav from '../components/layout/Nav';
import { platformerApi, type PlatformerLevelSummary, type EditorCol, type EditorColBase, type LevelData } from '../api/platformer';

// ---------------------------------------------------------------------------
// Editor constants (game coords → editor canvas)
// ---------------------------------------------------------------------------

const GAME_H = 450;
const GAME_GROUND_Y = 390;
const GAME_PLAT_THICKNESS = 14;

const EDITOR_H = 200;
const EDITOR_SCALE = EDITOR_H / GAME_H;
const COL_PX = 44; // screen pixels per column

// Screen Y for each base type
function baseSY(base: EditorColBase): number {
  const gameY = base === 'plat-high' ? 210 : base === 'plat-mid' ? 270 : base === 'plat-low' ? 330 : GAME_GROUND_Y;
  return Math.round(gameY * EDITOR_SCALE);
}

const GROUND_SY = baseSY('ground');
const PLAT_THICKNESS_S = Math.max(3, Math.round(GAME_PLAT_THICKNESS * EDITOR_SCALE));

// ---------------------------------------------------------------------------
// Tool type
// ---------------------------------------------------------------------------

type Tool = EditorColBase | 'record' | 'enemy' | 'erase';

const TOOLS: { id: Tool; label: string; color: string }[] = [
  { id: 'ground',    label: 'Ground',      color: '#6d28d9' },
  { id: 'gap',       label: 'Gap',         color: '#374151' },
  { id: 'plat-low',  label: 'Plat Low',    color: '#1d4ed8' },
  { id: 'plat-mid',  label: 'Plat Mid',    color: '#0f766e' },
  { id: 'plat-high', label: 'Plat High',   color: '#9a3412' },
  { id: 'record',    label: 'Record',      color: '#d97706' },
  { id: 'enemy',     label: 'Enemy',       color: '#dc2626' },
  { id: 'erase',     label: 'Erase',       color: '#4b5563' },
];

// ---------------------------------------------------------------------------
// Template generation (mirrors the random level gen logic)
// ---------------------------------------------------------------------------

function generateTemplateColumns(numCols = 60): EditorCol[] {
  const cols: EditorCol[] = [];
  // Safe start: 4 ground columns
  for (let i = 0; i < 4; i++) {
    cols.push({ base: 'ground', hasRecord: i === 2, hasEnemy: false });
  }
  let lastGroundIdx = 3;
  let i = 4;
  while (i < numCols) {
    const gapLen = Math.random() < 0.35 ? 2 : 1;
    for (let g = 0; g < gapLen && i < numCols; g++, i++) {
      cols.push({ base: 'gap', hasRecord: false, hasEnemy: false });
    }
    if (i >= numCols) break;
    const platLen = 2 + Math.floor(Math.random() * 3);
    const forceGround = i - lastGroundIdx > 6;
    const elevated = !forceGround && Math.random() < 0.55;
    const bases: EditorColBase[] = ['plat-low', 'plat-mid', 'plat-high'];
    const base: EditorColBase = elevated
      ? (bases[Math.floor(Math.random() * 3)] ?? 'plat-low')
      : 'ground';
    if (!elevated) lastGroundIdx = i;
    for (let p = 0; p < platLen && i < numCols; p++, i++) {
      cols.push({
        base,
        hasRecord: Math.random() < 0.33,
        hasEnemy: Math.random() < 0.25,
      });
    }
  }
  return cols;
}

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------

const BASE_COLORS: Record<EditorColBase, string> = {
  ground:     '#1e1b4b',
  gap:        '#0e0e22',
  'plat-low': '#1e3a5f',
  'plat-mid': '#0f3d2c',
  'plat-high':'#3d1a0f',
};

const TOP_COLORS: Record<EditorColBase, string> = {
  ground:     '#6d28d9',
  gap:        'transparent',
  'plat-low': '#2563eb',
  'plat-mid': '#10b981',
  'plat-high':'#f97316',
};

function drawEditorCanvas(
  canvas: HTMLCanvasElement,
  cols: EditorCol[],
  hoveredCol: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const totalW = cols.length * COL_PX;
  canvas.width = Math.max(totalW, 100);
  canvas.height = EDITOR_H;

  // Sky
  ctx.fillStyle = '#0e0e22';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let s = 0; s < 40; s++) {
    ctx.beginPath();
    ctx.arc((s * 97 + 13) % canvas.width, (s * 53 + 7) % (GROUND_SY - 10), 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground baseline
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, GROUND_SY, canvas.width, 1);

  for (let c = 0; c < cols.length; c++) {
    const col = cols[c];
    if (!col) continue;
    const x = c * COL_PX;
    const base = col.base;

    if (base !== 'gap') {
      const sy = baseSY(base);
      // Fill solid block from platform top to bottom edge
      ctx.fillStyle = BASE_COLORS[base];
      ctx.fillRect(x + 1, sy, COL_PX - 2, EDITOR_H - sy);
      // Platform top highlight
      ctx.fillStyle = TOP_COLORS[base];
      ctx.fillRect(x + 1, sy, COL_PX - 2, PLAT_THICKNESS_S);
    }

    // Record icon
    if (col.hasRecord) {
      const platSY = base === 'gap' ? GROUND_SY : baseSY(base);
      const cy = platSY - 12;
      const cx = x + COL_PX / 2;
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemy icon
    if (col.hasEnemy) {
      const platSY = base === 'gap' ? GROUND_SY : baseSY(base);
      const cy = platSY - 9;
      const cx = x + COL_PX / 2;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx - 5, cy - 8, 10, 8);
      ctx.fillStyle = '#fca5a5';
      ctx.beginPath();
      ctx.arc(cx - 2, cy - 5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 2, cy - 5, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Column divider
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, 0, 1, EDITOR_H);

    // Column number (every 5)
    if (c % 5 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(c), x + COL_PX / 2, EDITOR_H - 3);
    }

    // Hover highlight
    if (c === hoveredCol) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(x, 0, COL_PX, EDITOR_H);
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminPlatformerLevelsPage() {
  const qc = useQueryClient();
  const { data: levels = [], isLoading } = useQuery<PlatformerLevelSummary[]>({
    queryKey: ['platformer-levels'],
    queryFn: () => platformerApi.getLevels(),
    staleTime: 30_000,
  });

  // Editor state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [levelName, setLevelName] = useState('');
  const [levelDesc, setLevelDesc] = useState('');
  const [isTemplate, setIsTemplate] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedTool, setSelectedTool] = useState<Tool>('ground');
  const [hoveredCol, setHoveredCol] = useState(-1);
  const [redrawTick, setRedrawTick] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Mutable cols — updated in-place to avoid re-renders during drag
  const colsRef = useRef<EditorCol[]>([]);
  const isPainting = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ---------------------------------------------------------------------------
  // Load a level into the editor
  // ---------------------------------------------------------------------------
  function loadLevel(lv: PlatformerLevelSummary) {
    setSelectedId(lv.id);
    setLevelName(lv.name);
    setLevelDesc(lv.description ?? '');
    setIsTemplate(lv.isTemplate);
    colsRef.current = lv.levelData.cols.map((c) => ({ ...c }));
    setIsDirty(false);
    setSaveStatus('idle');
    setRedrawTick((t) => t + 1);
  }

  function newLevel() {
    setSelectedId(null);
    setLevelName('Untitled Level');
    setLevelDesc('');
    setIsTemplate(false);
    colsRef.current = [];
    for (let i = 0; i < 4; i++) colsRef.current.push({ base: 'ground', hasRecord: false, hasEnemy: false });
    for (let i = 0; i < 56; i++) colsRef.current.push({ base: 'gap', hasRecord: false, hasEnemy: false });
    setIsDirty(true);
    setSaveStatus('idle');
    setRedrawTick((t) => t + 1);
  }

  // ---------------------------------------------------------------------------
  // Canvas redraw
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current) return;
    drawEditorCanvas(canvasRef.current, colsRef.current, hoveredCol);
  }, [redrawTick, hoveredCol]);

  // ---------------------------------------------------------------------------
  // Paint a column with the current tool
  // ---------------------------------------------------------------------------
  const paintCol = useCallback((colIdx: number) => {
    const cols = colsRef.current;
    const col = cols[colIdx];
    if (!col) return;

    if (selectedTool === 'record') {
      col.hasRecord = !col.hasRecord;
    } else if (selectedTool === 'enemy') {
      col.hasEnemy = !col.hasEnemy;
    } else if (selectedTool === 'erase') {
      col.base = 'gap';
      col.hasRecord = false;
      col.hasEnemy = false;
    } else {
      col.base = selectedTool as EditorColBase;
    }
    setIsDirty(true);
    setRedrawTick((t) => t + 1);
  }, [selectedTool]);

  function getColFromEvent(e: React.MouseEvent<HTMLCanvasElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.floor(x / COL_PX);
  }

  // ---------------------------------------------------------------------------
  // Column management
  // ---------------------------------------------------------------------------
  function addCols(n = 10) {
    for (let i = 0; i < n; i++) {
      colsRef.current.push({ base: 'gap', hasRecord: false, hasEnemy: false });
    }
    setIsDirty(true);
    setRedrawTick((t) => t + 1);
  }

  function removeCols(n = 10) {
    colsRef.current = colsRef.current.slice(0, Math.max(10, colsRef.current.length - n));
    setIsDirty(true);
    setRedrawTick((t) => t + 1);
  }

  function applyTemplate() {
    colsRef.current = generateTemplateColumns(60);
    setIsDirty(true);
    setRedrawTick((t) => t + 1);
  }

  function clearLevel() {
    const len = colsRef.current.length || 60;
    colsRef.current = Array.from({ length: len }, () => ({ base: 'gap' as EditorColBase, hasRecord: false, hasEnemy: false }));
    setIsDirty(true);
    setRedrawTick((t) => t + 1);
  }

  // ---------------------------------------------------------------------------
  // Save / delete mutations
  // ---------------------------------------------------------------------------
  const createMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; isTemplate: boolean; levelData: LevelData }) =>
      platformerApi.createLevel(data),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['platformer-levels'] });
      setSelectedId(saved.id);
      setIsDirty(false);
      setSaveStatus('saved');
    },
    onError: () => setSaveStatus('error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof platformerApi.updateLevel>[1] }) =>
      platformerApi.updateLevel(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platformer-levels'] });
      setIsDirty(false);
      setSaveStatus('saved');
    },
    onError: () => setSaveStatus('error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => platformerApi.deleteLevel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platformer-levels'] });
      setSelectedId(null);
      setLevelName('');
      setLevelDesc('');
      colsRef.current = [];
      setRedrawTick((t) => t + 1);
    },
  });

  function handleSave() {
    if (!levelName.trim()) return;
    setSaveStatus('saving');
    const levelData: LevelData = { colWidthUnits: 100, cols: colsRef.current.map((c) => ({ ...c })) };
    if (selectedId) {
      updateMutation.mutate({
        id: selectedId,
        data: { name: levelName.trim(), description: levelDesc.trim() || null, isTemplate, levelData },
      });
    } else {
      createMutation.mutate({
        name: levelName.trim(),
        ...(levelDesc.trim() ? { description: levelDesc.trim() } : {}),
        isTemplate,
        levelData,
      });
    }
  }

  function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm('Delete this level? This cannot be undone.')) return;
    deleteMutation.mutate(selectedId);
  }

  const hasEditor = selectedId !== null || isDirty;
  const colCount = colsRef.current.length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SiteHeader theme="light" />
      <div className="flex flex-1 overflow-hidden">
        <Nav />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Vinyl Runner — Level Designer</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Design custom levels. Each column = 100 world units wide.
                </p>
              </div>
            </div>

            <div className="flex gap-6 items-start">
              {/* ── Left: level list ── */}
              <div className="w-56 flex-shrink-0 space-y-2">
                <button
                  onClick={newLevel}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  + New Level
                </button>
                {isLoading ? (
                  <p className="text-xs text-gray-400 px-1">Loading…</p>
                ) : levels.length === 0 ? (
                  <p className="text-xs text-gray-400 px-1">No levels yet.</p>
                ) : (
                  <div className="space-y-1">
                    {levels.map((lv) => (
                      <button
                        key={lv.id}
                        onClick={() => loadLevel(lv)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors border ${
                          selectedId === lv.id
                            ? 'border-violet-500 bg-violet-50 text-violet-900'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-medium truncate">{lv.name}</div>
                        {lv.isTemplate && (
                          <div className="text-xs text-violet-500">template</div>
                        )}
                        <div className="text-xs text-gray-400">
                          {lv.levelData.cols.length} cols
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Right: editor ── */}
              <div className="flex-1 min-w-0 space-y-4">
                {!hasEditor ? (
                  <div className="border border-gray-200 rounded-xl p-12 text-center text-gray-400">
                    Select a level from the list or create a new one.
                  </div>
                ) : (
                  <>
                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Level name</label>
                        <input
                          value={levelName}
                          onChange={(e) => { setLevelName(e.target.value); setIsDirty(true); }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description (optional)</label>
                        <input
                          value={levelDesc}
                          onChange={(e) => { setLevelDesc(e.target.value); setIsDirty(true); }}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isTemplate}
                          onChange={(e) => { setIsTemplate(e.target.checked); setIsDirty(true); }}
                          className="rounded text-violet-600"
                        />
                        Mark as template (visible to all players)
                      </label>
                    </div>

                    {/* Tools */}
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tool</div>
                      <div className="flex flex-wrap gap-1.5">
                        {TOOLS.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTool(t.id)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border-2 transition-colors ${
                              selectedTool === t.id
                                ? 'text-white'
                                : 'border-gray-300 text-gray-600 hover:border-gray-400'
                            }`}
                            style={{
                              backgroundColor: selectedTool === t.id ? t.color : undefined,
                              borderColor: selectedTool === t.id ? t.color : undefined,
                            } as React.CSSProperties}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Canvas */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Level canvas — {colCount} columns ({(colCount * 100 / 100).toFixed(0)} tiles)
                        </div>
                        <div className="flex gap-1 ml-auto">
                          <button
                            onClick={() => addCols(10)}
                            className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition-colors"
                          >
                            +10 cols
                          </button>
                          <button
                            onClick={() => removeCols(10)}
                            className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 transition-colors"
                          >
                            -10 cols
                          </button>
                        </div>
                      </div>

                      <div
                        className="overflow-x-auto rounded-lg border border-gray-700"
                        style={{ background: '#0e0e22', cursor: 'crosshair' }}
                      >
                        <canvas
                          ref={canvasRef}
                          height={EDITOR_H}
                          style={{ display: 'block', userSelect: 'none' }}
                          onMouseDown={(e) => {
                            isPainting.current = true;
                            paintCol(getColFromEvent(e));
                          }}
                          onMouseMove={(e) => {
                            const col = getColFromEvent(e);
                            setHoveredCol(col);
                            if (isPainting.current) paintCol(col);
                          }}
                          onMouseUp={() => { isPainting.current = false; }}
                          onMouseLeave={() => { isPainting.current = false; setHoveredCol(-1); }}
                        />
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-3 text-xs text-gray-400 pt-1">
                        {TOOLS.filter((t) => t.id !== 'erase' && t.id !== 'record' && t.id !== 'enemy').map((t) => (
                          <span key={t.id} className="flex items-center gap-1">
                            <span className="inline-block w-3 h-3 rounded" style={{ background: t.color }} />
                            {t.label}
                          </span>
                        ))}
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-3 h-3 rounded-full border-2 border-yellow-400" />
                          Record
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="inline-block w-3 h-3 rounded" style={{ background: '#ef4444' }} />
                          Enemy
                        </span>
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={applyTemplate}
                        className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors"
                      >
                        Generate template
                      </button>
                      <button
                        onClick={clearLevel}
                        className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors"
                      >
                        Clear all
                      </button>
                    </div>

                    {/* Save / Delete */}
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                      <button
                        onClick={handleSave}
                        disabled={!isDirty || !levelName.trim() || saveStatus === 'saving'}
                        className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {saveStatus === 'saving' ? 'Saving…' : selectedId ? 'Save changes' : 'Create level'}
                      </button>
                      {selectedId && (
                        <button
                          onClick={handleDelete}
                          disabled={deleteMutation.isPending}
                          className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-300 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      )}
                      {saveStatus === 'saved' && (
                        <span className="text-sm text-emerald-600 font-medium">Saved!</span>
                      )}
                      {saveStatus === 'error' && (
                        <span className="text-sm text-red-600 font-medium">Save failed.</span>
                      )}
                      {isDirty && saveStatus !== 'saving' && (
                        <span className="text-xs text-amber-600 ml-auto">Unsaved changes</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Usage tips */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-600 space-y-1">
              <div className="font-semibold text-gray-700">How to use</div>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Select a tool, then click or drag on the canvas to paint columns.</li>
                <li><strong>Ground</strong> — solid walkable surface at floor level.</li>
                <li><strong>Gap</strong> — void; player falls and loses a life.</li>
                <li><strong>Plat Low / Mid / High</strong> — elevated platforms at increasing heights.</li>
                <li><strong>Record</strong> — toggles a collectible vinyl record above that column.</li>
                <li><strong>Enemy</strong> — toggles a patrolling robot on that column's platform.</li>
                <li><strong>Erase</strong> — removes base, record, and enemy from a column.</li>
                <li>Use <em>Generate template</em> to seed a pre-built randomised layout.</li>
                <li>Template levels appear to players in the "Play a Level" mode selector.</li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

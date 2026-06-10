/**
 * Band 2048 — a band-themed 2048 puzzle game with sliding tile animation.
 * Route: /play/2048
 *
 * Mechanics:
 *   - Arrow keys (or swipe) to slide all tiles.
 *   - Two matching tiles merge into the next album level.
 *   - Level 1 = "Starter" (seed tile); levels 2+ = albums in chronological order.
 *   - Reach the final album tile to win!
 *
 * Animation:
 *   - Each tile has a stable numeric id. React preserves the DOM node
 *     between renders, so the CSS `top/left` transition fires on every move.
 *   - New tiles spawn with a scale-up animation (tile-appear keyframe).
 *   - Merged tiles appear at the merge position with a pop (tile-pop keyframe).
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveTile {
  id: number;
  level: number;
  row: number;
  col: number;
  isNew: boolean;
  isMerged: boolean;
}

interface TileLevel {
  level: number;
  label: string;
  sub: string;
  artworkUrl?: string;
}

type Direction = 'left' | 'right' | 'up' | 'down';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRID_SIZE = 4;
const GAP_PX   = 8;
const PAD_PX   = 8;

const LEVEL_COLORS = [
  { bg: '#1f2937', fg: 'rgba(255,255,255,0.55)' }, // 1  starter
  { bg: '#7f1d1d', fg: '#fecaca'                }, // 2
  { bg: '#7c2d12', fg: '#fed7aa'                }, // 3
  { bg: '#92400e', fg: '#fde68a'                }, // 4
  { bg: '#78350f', fg: '#fef3c7'                }, // 5
  { bg: '#365314', fg: '#d9f99d'                }, // 6
  { bg: '#14532d', fg: '#bbf7d0'                }, // 7
  { bg: '#134e4a', fg: '#99f6e4'                }, // 8
  { bg: '#0c4a6e', fg: '#bae6fd'                }, // 9
  { bg: '#1e3a5f', fg: '#c7d2fe'                }, // 10
  { bg: '#3b0764', fg: '#e9d5ff'                }, // 11
  { bg: '#4c1d95', fg: '#ddd6fe'                }, // 12
  { bg: '#581c87', fg: '#f3e8ff'                }, // 13+
];

function tileColor(level: number) {
  const idx = Math.min(level - 1, LEVEL_COLORS.length - 1);
  return LEVEL_COLORS[idx] ?? LEVEL_COLORS[LEVEL_COLORS.length - 1]!;
}

function cellOffset(idx: number, cs: number): number {
  return PAD_PX + idx * (cs + GAP_PX);
}

// ---------------------------------------------------------------------------
// Game logic (tile-identity-aware)
// ---------------------------------------------------------------------------

function processMove(
  liveTiles: LiveTile[],
  dir: Direction,
  makeId: () => number,
): { tiles: LiveTile[]; score: number; changed: boolean } {
  let getLine: (t: LiveTile) => number;
  let getPos:  (t: LiveTile) => number;
  let toCoord: (line: number, pos: number) => { row: number; col: number };
  let ascending: boolean;

  switch (dir) {
    case 'left':
      getLine   = (t) => t.row; getPos = (t) => t.col;
      toCoord   = (l, p) => ({ row: l, col: p });
      ascending = true; break;
    case 'right':
      getLine   = (t) => t.row; getPos = (t) => t.col;
      toCoord   = (l, p) => ({ row: l, col: GRID_SIZE - 1 - p });
      ascending = false; break;
    case 'up':
      getLine   = (t) => t.col; getPos = (t) => t.row;
      toCoord   = (l, p) => ({ row: p, col: l });
      ascending = true; break;
    default: // down
      getLine   = (t) => t.col; getPos = (t) => t.row;
      toCoord   = (l, p) => ({ row: GRID_SIZE - 1 - p, col: l });
      ascending = false; break;
  }

  const lines = new Map<number, LiveTile[]>();
  for (let i = 0; i < GRID_SIZE; i++) lines.set(i, []);
  for (const t of liveTiles) lines.get(getLine(t))!.push(t);

  let score = 0; let changed = false;
  const result: LiveTile[] = [];

  for (const [lineIdx, row] of lines) {
    const sorted = row.slice().sort((a, b) =>
      ascending ? getPos(a) - getPos(b) : getPos(b) - getPos(a),
    );
    let out = 0; let i = 0;
    while (i < sorted.length) {
      const t = sorted[i]!;
      const next = sorted[i + 1];
      const c = toCoord(lineIdx, out);
      if (next && next.level === t.level) {
        const newLevel = t.level + 1;
        score += newLevel;
        if (!changed) changed = true;
        result.push({ id: makeId(), level: newLevel, row: c.row, col: c.col, isNew: false, isMerged: true });
        i += 2;
      } else {
        if (!changed && (t.row !== c.row || t.col !== c.col)) changed = true;
        result.push({ ...t, row: c.row, col: c.col, isMerged: false, isNew: false });
        i++;
      }
      out++;
    }
  }

  return { tiles: result, score, changed };
}

function spawnTile(tiles: LiveTile[], makeId: () => number): LiveTile[] {
  const occupied = new Set(tiles.map((t) => `${t.row},${t.col}`));
  const empty: { row: number; col: number }[] = [];
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (!occupied.has(`${r},${c}`)) empty.push({ row: r, col: c });
  if (!empty.length) return tiles;
  const pos = empty[Math.floor(Math.random() * empty.length)]!;
  return [...tiles, {
    id: makeId(), level: Math.random() < 0.85 ? 1 : 2,
    row: pos.row, col: pos.col, isNew: true, isMerged: false,
  }];
}

function canMove(tiles: LiveTile[]): boolean {
  if (tiles.length < GRID_SIZE * GRID_SIZE) return true;
  const byPos = new Map(tiles.map((t) => [`${t.row},${t.col}`, t.level]));
  for (const t of tiles) {
    if (byPos.get(`${t.row},${t.col + 1}`) === t.level) return true;
    if (byPos.get(`${t.row + 1},${t.col}`) === t.level) return true;
  }
  return false;
}

function topLevel(tiles: LiveTile[]): number {
  return tiles.reduce((m, t) => Math.max(m, t.level), 0);
}

// ---------------------------------------------------------------------------
// Tile visual (absolutely positioned, animated via CSS transitions)
// ---------------------------------------------------------------------------

function TileCell({ tile, levels, cs }: { tile: LiveTile; levels: TileLevel[]; cs: number }) {
  const tl    = levels[tile.level - 1];
  const color = tileColor(tile.level);
  const label = tl?.label ?? String(tile.level);
  const sub   = tl?.sub   ?? '';
  const art   = tl?.artworkUrl;

  return (
    <div
      style={{
        position: 'absolute',
        width: cs, height: cs,
        top:  cellOffset(tile.row, cs),
        left: cellOffset(tile.col, cs),
        borderRadius: 11,
        overflow: 'hidden',
        zIndex: tile.isMerged ? 2 : 1,
        userSelect: 'none',
        // Slide animation: React keeps the same DOM node for the same key,
        // so when top/left change the CSS transition fires automatically.
        transition: tile.isNew ? 'none' : 'top 110ms ease-in-out, left 110ms ease-in-out',
        animation: tile.isNew
          ? 'tile-appear 140ms ease-out both'
          : tile.isMerged
          ? 'tile-pop 130ms ease-out both'
          : 'none',
      }}
    >
      {art ? (
        <>
          <div style={{
            width: '100%', height: '100%',
            backgroundImage: `url(${art})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.1) 55%,transparent 100%)',
          }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '3px 5px' }}>
            <p style={{
              color: '#fff', fontWeight: 900, textAlign: 'center', lineHeight: 1.2, margin: 0,
              fontSize: label.length > 10 ? 9 : label.length > 6 ? 10 : 11,
              textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            }}>{label}</p>
            {sub && <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 7, textAlign: 'center', margin: 0, marginTop: 1, lineHeight: 1.1 }}>{sub}</p>}
          </div>
        </>
      ) : (
        <div style={{
          width: '100%', height: '100%', backgroundColor: color.bg,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 4,
        }}>
          <p style={{
            color: color.fg, fontWeight: 900, textAlign: 'center', lineHeight: 1.2, margin: 0,
            fontSize: label.length > 10 ? 10 : label.length > 6 ? 12 : 14,
          }}>{label}</p>
          {sub && <p style={{ color: color.fg, fontSize: 8, textAlign: 'center', margin: 0, marginTop: 2, opacity: 0.6, lineHeight: 1.2 }}>{sub}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Level mapping
// ---------------------------------------------------------------------------

function makeLevels(
  albums: { id: string; title: string; bandName: string; year: number; artworkUrl?: string | null }[],
): TileLevel[] {
  // Albums map directly to levels 1, 2, 3… — no placeholder tile.
  // Level 1 = oldest album, last level = newest album (the win condition).
  return albums.slice().sort((a, b) => a.year - b.year).map((album, i) => ({
    level: i + 1,
    label: album.title.length > 16 ? album.title.slice(0, 14) + '…' : album.title,
    sub: `${album.bandName} · ${album.year}`,
    ...(album.artworkUrl ? { artworkUrl: album.artworkUrl } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Swipe detection
// ---------------------------------------------------------------------------

function useSwipe(onSwipe: (dir: Direction) => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) startRef.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!startRef.current) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      startRef.current = null;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    },
  };
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

function SetupScreen({
  bands, selectedBandIds, toggle, onStart, albumCount,
}: {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  toggle: (id: string) => void;
  onStart: () => void;
  albumCount: number;
}) {
  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <div className="text-6xl mb-4">🎮</div>
      <h1 className="text-3xl font-bold text-white mb-2">Band 2048</h1>
      <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-md mx-auto">
        Slide tiles to merge them. Two identical album tiles combine into the next album in the discography.
        Can you reach the final album?
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-5 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Select artists</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {bands.map((b) => {
            const on = selectedBandIds.includes(b.id);
            return (
              <label key={b.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                ${on ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-white/5 border border-white/10 hover:border-white/20'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(b.id)} className="accent-purple-500" />
                <span className={`text-sm ${on ? 'text-white' : 'text-white/50'}`}>{b.name}</span>
              </label>
            );
          })}
        </div>
        {albumCount > 0 && (
          <p className="text-xs text-purple-400/70 mt-3">{albumCount} album{albumCount !== 1 ? 's' : ''} — reach the latest one to win!</p>
        )}
        {selectedBandIds.length === 0 && (
          <p className="text-xs text-amber-400/70 mt-3">Pick at least one artist</p>
        )}
      </div>
      <button
        onClick={onStart}
        disabled={selectedBandIds.length === 0 || albumCount === 0}
        className="w-full py-3.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors"
      >
        Start →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Band2048Page() {
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [phase, setPhase]             = useState<'setup' | 'playing' | 'won' | 'over'>('setup');
  const [tiles, setTiles]             = useState<LiveTile[]>([]);
  const [score, setScore]             = useState(0);
  const [best, setBest]               = useState(() => {
    try { return parseInt(localStorage.getItem('band2048-best') ?? '0', 10) || 0; } catch { return 0; }
  });
  const [levels, setLevels]           = useState<TileLevel[]>([]);
  const [winLevel, setWinLevel]       = useState(0);
  const [wonAcknowledged, setWonAck]  = useState(false);
  const [cellSize, setCellSize]       = useState(80);

  const tileIdRef = useRef(0);
  const gridRef   = useRef<HTMLDivElement>(null);

  const makeId = useCallback(() => ++tileIdRef.current, []);

  // Responsive cell size via ResizeObserver
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.getBoundingClientRect().width;
      setCellSize(Math.max(40, Math.floor((w - PAD_PX * 2 - GAP_PX * (GRID_SIZE - 1)) / GRID_SIZE)));
    };
    calc();
    const obs = new ResizeObserver(calc);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedBandIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }, []);

  const { data: scopes } = useQuery({
    queryKey: ['band2048-scopes'],
    queryFn: () => api.get<{
      bands:  { id: string; name: string }[];
      albums: { id: string; title: string; year: number | null; artworkUrl: string | null; band: { id: string; name: string } }[];
    }>('/api/public/graph/scopes'),
  });

  const bands = scopes?.bands ?? [];

  const selectedAlbums = (scopes?.albums ?? [])
    .filter((a) => selectedBandIds.includes(a.band.id) && a.year != null)
    .map((a) => ({
      id: a.id, title: a.title, bandName: a.band.name, year: a.year!,
      ...(a.artworkUrl ? { artworkUrl: a.artworkUrl } : {}),
    }))
    .sort((a, b) => a.year - b.year);

  function startGame() {
    const lvls = makeLevels(selectedAlbums);
    setLevels(lvls);
    setWinLevel(lvls.length);
    tileIdRef.current = 0;
    let ts: LiveTile[] = [];
    ts = spawnTile(ts, makeId);
    ts = spawnTile(ts, makeId);
    setTiles(ts);
    setScore(0);
    setPhase('playing');
    setWonAck(false);
  }

  const applyMove = useCallback((dir: Direction) => {
    if (phase !== 'playing') return;
    setTiles((prev) => {
      const { tiles: moved, score: gained, changed } = processMove(prev, dir, makeId);
      if (!changed) return prev;
      setScore((s) => {
        const ns = s + gained;
        setBest((b) => {
          const nb = Math.max(b, ns);
          try { localStorage.setItem('band2048-best', String(nb)); } catch { /* ignore */ }
          return nb;
        });
        return ns;
      });
      const withNew = spawnTile(moved, makeId);
      const ml = topLevel(withNew);
      if (!wonAcknowledged && winLevel > 0 && ml >= winLevel) setPhase('won');
      else if (!canMove(withNew)) setPhase('over');
      return withNew;
    });
  }, [phase, winLevel, wonAcknowledged, makeId]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, Direction> = {
        ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
        a: 'left', d: 'right', w: 'up', s: 'down',
      };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); applyMove(dir); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [applyMove]);

  const swipeHandlers = useSwipe(applyMove);
  const goalTitle = levels[winLevel - 1]?.label ?? '?';
  const gridPx    = PAD_PX * 2 + GRID_SIZE * cellSize + (GRID_SIZE - 1) * GAP_PX;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      {/* Top bar */}
      <div className="border-b border-white/10 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/games" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Games</Link>
          <span className="text-white/20">·</span>
          <h1 className="text-sm font-semibold text-white/80">Band 2048</h1>
        </div>
        {phase !== 'setup' && (
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-[10px] text-white/30 uppercase tracking-wide">Score</div>
              <div className="text-sm font-bold text-white tabular-nums">{score.toLocaleString()}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-white/30 uppercase tracking-wide">Best</div>
              <div className="text-sm font-bold text-white/60 tabular-nums">{best.toLocaleString()}</div>
            </div>
            <button
              onClick={() => setPhase('setup')}
              className="text-xs text-white/30 hover:text-white/60 transition-colors ml-2"
            >New Game</button>
          </div>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-6">

        {phase === 'setup' && (
          <SetupScreen bands={bands} selectedBandIds={selectedBandIds} toggle={toggle} onStart={startGame} albumCount={selectedAlbums.length} />
        )}

        {(phase === 'playing' || phase === 'won' || phase === 'over') && (
          <div className="space-y-4">
            <div className="text-center text-xs text-white/30">
              Goal: reach <span className="text-purple-300 font-semibold">{goalTitle}</span> — arrow keys or swipe
            </div>

            {phase === 'won' && !wonAcknowledged && (
              <div className="rounded-2xl bg-purple-900/80 border border-purple-400/60 p-6 text-center">
                <div className="text-4xl mb-2">🏆</div>
                <h2 className="text-xl font-bold text-white mb-1">You reached {goalTitle}!</h2>
                <p className="text-white/60 text-sm mb-4">Keep going — how high can you stack it?</p>
                <button
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-colors"
                  onClick={() => { setWonAck(true); setPhase('playing'); }}
                >Keep Playing →</button>
              </div>
            )}

            {phase === 'over' && (
              <div className="rounded-2xl bg-gray-900/90 border border-white/20 p-6 text-center">
                <div className="text-4xl mb-2">😵</div>
                <h2 className="text-xl font-bold text-white mb-1">Game Over</h2>
                <p className="text-white/50 text-sm mb-1">Final score: <span className="text-white font-bold">{score.toLocaleString()}</span></p>
                <p className="text-white/30 text-xs mb-4">Highest tile: level {topLevel(tiles)} / {winLevel}</p>
                <button
                  className="px-6 py-2 bg-purple-700 hover:bg-purple-600 text-white font-bold text-sm rounded-xl transition-colors"
                  onClick={startGame}
                >Try Again →</button>
              </div>
            )}

            {/* Animated game grid — tiles are absolutely positioned children */}
            <div
              ref={gridRef}
              className="bg-gray-900 rounded-2xl select-none"
              style={{ position: 'relative', height: gridPx, touchAction: 'none' }}
              {...swipeHandlers}
            >
              {/* Background cells (static grid slots) */}
              {Array.from({ length: GRID_SIZE }).flatMap((_, r) =>
                Array.from({ length: GRID_SIZE }).map((_, c) => (
                  <div
                    key={`bg-${r}-${c}`}
                    style={{
                      position: 'absolute',
                      width: cellSize, height: cellSize,
                      top:  cellOffset(r, cellSize),
                      left: cellOffset(c, cellSize),
                      borderRadius: 10,
                      backgroundColor: 'rgba(255,255,255,0.04)',
                    }}
                  />
                )),
              )}
              {/* Live tiles — each keeps its DOM node across moves (same key = same node = CSS transition fires) */}
              {tiles.map((tile) => (
                <TileCell key={tile.id} tile={tile} levels={levels} cs={cellSize} />
              ))}
            </div>

            {/* Level legend */}
            <details className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <summary className="px-4 py-2.5 text-xs font-semibold text-white/40 cursor-pointer select-none">
                Album levels ({levels.length - 1} albums)
              </summary>
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {levels.map((tl) => {
                  const c = tileColor(tl.level);
                  return (
                    <span
                      key={tl.level}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: c.bg, color: c.fg }}
                    >
                      {tl.level} · {tl.label}
                    </span>
                  );
                })}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

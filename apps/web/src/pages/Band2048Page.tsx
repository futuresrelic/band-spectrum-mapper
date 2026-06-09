/**
 * Band 2048 — a band-themed 2048 puzzle game.
 * Route: /play/2048
 *
 * Mechanics (same as standard 2048):
 *   - Arrow keys (or swipe) to slide all tiles.
 *   - Two matching tiles merge into the next level.
 *   - Level 1 = "Demo" (new tile); level 2+ = band albums in chronological order.
 *   - Reach the final album tile to win!
 *   - No valid moves = game over.
 *
 * All game logic is pure frontend — no API calls during play.
 * Band / album data is fetched once from the public scopes endpoint.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Grid = (number | null)[][];  // number = level (1-based)

interface TileLevel {
  level: number;
  label: string;
  sub: string;
  bg: string;
  text: string;
  artworkUrl?: string;
}

const GRID_SIZE = 4;

// Colour palette: level 1 (demo) to level 12+
const LEVEL_PALETTES = [
  { bg: 'bg-gray-800',       text: 'text-white/70'  }, // 1 demo
  { bg: 'bg-rose-900',       text: 'text-rose-200'  }, // 2
  { bg: 'bg-orange-900',     text: 'text-orange-200'}, // 3
  { bg: 'bg-amber-800',      text: 'text-amber-200' }, // 4
  { bg: 'bg-yellow-700',     text: 'text-yellow-100'}, // 5
  { bg: 'bg-lime-800',       text: 'text-lime-200'  }, // 6
  { bg: 'bg-emerald-800',    text: 'text-emerald-200'},// 7
  { bg: 'bg-teal-700',       text: 'text-teal-100'  }, // 8
  { bg: 'bg-cyan-700',       text: 'text-cyan-100'  }, // 9
  { bg: 'bg-sky-700',        text: 'text-sky-100'   }, // 10
  { bg: 'bg-indigo-700',     text: 'text-indigo-100'}, // 11
  { bg: 'bg-violet-700',     text: 'text-violet-100'}, // 12
  { bg: 'bg-purple-700',     text: 'text-purple-100'}, // 13 max displayed
];

function palette(level: number) {
  const idx = Math.min(level - 1, LEVEL_PALETTES.length - 1);
  return LEVEL_PALETTES[idx] ?? LEVEL_PALETTES[LEVEL_PALETTES.length - 1]!;
}

// ---------------------------------------------------------------------------
// Pure 2048 logic
// ---------------------------------------------------------------------------

function emptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

function addRandomTile(grid: Grid): Grid {
  const empty: [number, number][] = [];
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      if (grid[r]![c] === null) empty.push([r, c]);
  if (empty.length === 0) return grid;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]!;
  const next = grid.map((row) => [...row]) as Grid;
  next[r]![c] = Math.random() < 0.85 ? 1 : 2; // mostly 1s, occasionally 2s
  return next;
}

function slideRow(row: (number | null)[]): { row: (number | null)[]; score: number } {
  const vals = row.filter((v): v is number => v !== null);
  let score = 0;
  const merged: (number | null)[] = [];
  let i = 0;
  while (i < vals.length) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      const newVal = vals[i]! + 1;
      merged.push(newVal);
      score += newVal;
      i += 2;
    } else {
      merged.push(vals[i]!);
      i++;
    }
  }
  while (merged.length < GRID_SIZE) merged.push(null);
  return { row: merged, score };
}

type Direction = 'left' | 'right' | 'up' | 'down';

function move(grid: Grid, dir: Direction): { grid: Grid; score: number; changed: boolean } {
  let score = 0;
  let changed = false;
  let g: Grid = grid.map((row) => [...row]);

  function applyLeft(): void {
    for (let r = 0; r < GRID_SIZE; r++) {
      const { row: newRow, score: rowScore } = slideRow(g[r]!);
      if (newRow.some((v, c) => v !== g[r]![c])) changed = true;
      g[r] = newRow;
      score += rowScore;
    }
  }

  if (dir === 'left') {
    applyLeft();
  } else if (dir === 'right') {
    g = g.map((row) => [...row].reverse()) as Grid;
    applyLeft();
    g = g.map((row) => [...row].reverse()) as Grid;
  } else if (dir === 'up') {
    g = transpose(g);
    applyLeft();
    g = transpose(g);
  } else {
    g = transpose(g);
    g = g.map((row) => [...row].reverse()) as Grid;
    applyLeft();
    g = g.map((row) => [...row].reverse()) as Grid;
    g = transpose(g);
  }

  return { grid: g, score, changed };
}

function transpose(grid: Grid): Grid {
  return Array.from({ length: GRID_SIZE }, (_, r) =>
    Array.from({ length: GRID_SIZE }, (__, c) => grid[c]![r] ?? null),
  ) as Grid;
}

function hasValidMoves(grid: Grid): boolean {
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r]![c] === null) return true;
      if (c + 1 < GRID_SIZE && grid[r]![c] === grid[r]![c + 1]) return true;
      if (r + 1 < GRID_SIZE && grid[r]![c] === grid[r + 1]![c]) return true;
    }
  return false;
}

function maxLevel(grid: Grid): number {
  let max = 0;
  for (const row of grid) for (const v of row) if (v && v > max) max = v;
  return max;
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
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? 'right' : 'left');
      else onSwipe(dy > 0 ? 'down' : 'up');
      startRef.current = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Tile label helpers
// ---------------------------------------------------------------------------

function makeLevels(albums: { id: string; title: string; bandName: string; year: number; artworkUrl?: string | null }[]): TileLevel[] {
  const sorted = albums.slice().sort((a, b) => a.year - b.year);
  const levels: TileLevel[] = [
    { level: 1, label: '♫', sub: 'Demo', bg: '', text: '' },
  ];
  sorted.forEach((album, i) => {
    levels.push({
      level: i + 2,
      label: album.title.length > 16 ? album.title.slice(0, 14) + '…' : album.title,
      sub:   `${album.bandName} · ${album.year}`,
      bg: '', text: '',
      ...(album.artworkUrl ? { artworkUrl: album.artworkUrl } : {}),
    });
  });
  return levels;
}

// ---------------------------------------------------------------------------
// Tile component
// ---------------------------------------------------------------------------

function Tile({ level, levels }: { level: number; levels: TileLevel[] }) {
  const tl = levels[level - 1];
  const pal = palette(level);
  const label = tl?.label ?? String(level);
  const sub   = tl?.sub   ?? '';
  const art   = tl?.artworkUrl;

  if (art) {
    return (
      <div
        className="w-full aspect-square flex flex-col items-end justify-end rounded-xl overflow-hidden relative select-none"
        style={{ backgroundImage: `url(${art})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="relative z-10 w-full p-1">
          <span className={`block font-black leading-tight text-center text-white drop-shadow ${label.length > 10 ? 'text-[9px]' : label.length > 6 ? 'text-[10px]' : 'text-[11px]'}`}>
            {label}
          </span>
          {sub && (
            <span className="block text-[7px] text-white/60 text-center mt-0.5 leading-tight line-clamp-2">{sub}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full aspect-square flex flex-col items-center justify-center rounded-xl ${pal.bg} ${pal.text} transition-all select-none p-1`}>
      <span className={`font-black leading-tight text-center ${label.length > 10 ? 'text-[10px]' : label.length > 6 ? 'text-xs' : 'text-sm'}`}>
        {label}
      </span>
      {sub && (
        <span className="text-[8px] opacity-60 text-center mt-0.5 leading-tight px-0.5 line-clamp-2">{sub}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band/album picker
// ---------------------------------------------------------------------------

interface SetupProps {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  toggle: (id: string) => void;
  onStart: () => void;
  albumCount: number;
}

function SetupScreen({ bands, selectedBandIds, toggle, onStart, albumCount }: SetupProps) {
  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <div className="text-6xl mb-4">🎮</div>
      <h1 className="text-3xl font-bold text-white mb-2">Band 2048</h1>
      <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-md mx-auto">
        Slide tiles to merge them. Two identical album tiles merge into the next album.
        Work your way from demo tracks up through the full discography.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-5 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Select artists</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {bands.map((b) => {
            const checked = selectedBandIds.includes(b.id);
            return (
              <label key={b.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                ${checked ? 'bg-purple-600/30 border border-purple-500/50' : 'bg-white/5 border border-white/10 hover:border-white/20'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(b.id)} className="accent-purple-500" />
                <span className={`text-sm ${checked ? 'text-white' : 'text-white/50'}`}>{b.name}</span>
              </label>
            );
          })}
        </div>
        {albumCount > 0 && (
          <p className="text-xs text-purple-400/70 mt-3">
            {albumCount} album{albumCount !== 1 ? 's' : ''} selected — goal: reach the latest one!
          </p>
        )}
        {selectedBandIds.length === 0 && (
          <p className="text-xs text-amber-400/70 mt-3">Pick at least one artist</p>
        )}
      </div>
      <button
        className="w-full py-3.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors"
        onClick={onStart}
        disabled={selectedBandIds.length === 0 || albumCount === 0}
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
  const [phase, setPhase] = useState<'setup' | 'playing' | 'won' | 'over'>('setup');
  const [grid, setGrid]   = useState<Grid>(emptyGrid());
  const [score, setScore] = useState(0);
  const [best, setBest]   = useState(() => {
    try { return parseInt(localStorage.getItem('band2048-best') ?? '0', 10) || 0; } catch { return 0; }
  });
  const [levels, setLevels]   = useState<TileLevel[]>([]);
  const [winLevel, setWinLevel] = useState(0);
  const [wonAcknowledged, setWonAcknowledged] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelectedBandIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }, []);

  // Fetch bands + albums for level mapping
  const { data: scopes } = useQuery({
    queryKey: ['band2048-scopes'],
    queryFn:  () => api.get<{
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
    setWinLevel(lvls.length); // reaching the last album = win
    let g = emptyGrid();
    g = addRandomTile(g);
    g = addRandomTile(g);
    setGrid(g);
    setScore(0);
    setPhase('playing');
    setWonAcknowledged(false);
  }

  const applyMove = useCallback((dir: Direction) => {
    if (phase !== 'playing') return;
    setGrid((prev) => {
      const { grid: next, score: gained, changed } = move(prev, dir);
      if (!changed) return prev;
      setScore((s) => {
        const newScore = s + gained;
        setBest((b) => {
          const newBest = Math.max(b, newScore);
          try { localStorage.setItem('band2048-best', String(newBest)); } catch { /* ignore */ }
          return newBest;
        });
        return newScore;
      });
      const withNew = addRandomTile(next);
      const ml = maxLevel(withNew);
      if (!wonAcknowledged && winLevel > 0 && ml >= winLevel) {
        setPhase('won');
      } else if (!hasValidMoves(withNew)) {
        setPhase('over');
      }
      return withNew;
    });
  }, [phase, winLevel, wonAcknowledged]);

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

        {/* Setup */}
        {phase === 'setup' && (
          <SetupScreen
            bands={bands}
            selectedBandIds={selectedBandIds}
            toggle={toggle}
            onStart={startGame}
            albumCount={selectedAlbums.length}
          />
        )}

        {/* Playing / won / over */}
        {(phase === 'playing' || phase === 'won' || phase === 'over') && (
          <div className="space-y-4">
            {/* Goal banner */}
            <div className="text-center text-xs text-white/30">
              Goal: reach <span className="text-purple-300 font-semibold">{goalTitle}</span> — use arrow keys or swipe
            </div>

            {/* Win overlay */}
            {phase === 'won' && !wonAcknowledged && (
              <div className="relative rounded-2xl bg-purple-900/80 border border-purple-400/60 p-6 text-center">
                <div className="text-4xl mb-2">🏆</div>
                <h2 className="text-xl font-bold text-white mb-1">You reached {goalTitle}!</h2>
                <p className="text-white/60 text-sm mb-4">Keep going — how high can you stack it?</p>
                <button
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl transition-colors"
                  onClick={() => { setWonAcknowledged(true); setPhase('playing'); }}
                >
                  Keep Playing →
                </button>
              </div>
            )}

            {/* Game over overlay */}
            {phase === 'over' && (
              <div className="rounded-2xl bg-gray-900/90 border border-white/20 p-6 text-center">
                <div className="text-4xl mb-2">😵</div>
                <h2 className="text-xl font-bold text-white mb-1">Game Over</h2>
                <p className="text-white/50 text-sm mb-1">Final score: <span className="text-white font-bold">{score.toLocaleString()}</span></p>
                <p className="text-white/30 text-xs mb-4">Highest tile: level {maxLevel(grid)} / {winLevel}</p>
                <button
                  className="px-6 py-2 bg-purple-700 hover:bg-purple-600 text-white font-bold text-sm rounded-xl transition-colors"
                  onClick={startGame}
                >
                  Try Again →
                </button>
              </div>
            )}

            {/* Grid — touchAction:none stops the page from scrolling on swipe */}
            <div
              className="bg-gray-900 rounded-2xl p-2 select-none"
              style={{ touchAction: 'none' }}
              {...swipeHandlers}
            >
              <div className="grid grid-cols-4 gap-2">
                {grid.map((row, r) =>
                  row.map((cell, c) => (
                    <div key={`${r}-${c}`} className="aspect-square">
                      {cell !== null ? (
                        <Tile level={cell} levels={levels} />
                      ) : (
                        <div className="w-full h-full rounded-xl bg-white/5" />
                      )}
                    </div>
                  )),
                )}
              </div>
            </div>

            {/* Level legend (scrollable) */}
            <details className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <summary className="px-4 py-2.5 text-xs font-semibold text-white/40 cursor-pointer select-none">
                Album levels ({levels.length - 1} albums)
              </summary>
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                {levels.map((tl) => {
                  const pal = palette(tl.level);
                  return (
                    <span key={tl.level} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${pal.bg} ${pal.text}`}>
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

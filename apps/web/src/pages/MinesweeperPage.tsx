import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CellState = 'hidden' | 'revealed' | 'flagged';
type GamePhase = 'idle' | 'playing' | 'won' | 'lost';

interface Cell {
  isFlop: boolean;
  state: CellState;
  neighbors: number;
}

interface Difficulty {
  id: string;
  label: string;
  cols: number;
  rows: number;
  flops: number;
  color: string;
  btnColor: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIFFICULTIES: Difficulty[] = [
  { id: 'easy',   label: 'Warm-Up',    cols: 9,  rows: 9,  flops: 10, color: 'border-emerald-500 bg-emerald-950/20 text-emerald-300', btnColor: 'bg-emerald-700 hover:bg-emerald-600' },
  { id: 'normal', label: 'Club Show',  cols: 16, rows: 16, flops: 40, color: 'border-sky-500 bg-sky-950/20 text-sky-300',           btnColor: 'bg-sky-700 hover:bg-sky-600' },
  { id: 'hard',   label: 'World Tour', cols: 30, rows: 16, flops: 99, color: 'border-rose-500 bg-rose-950/20 text-rose-300',         btnColor: 'bg-rose-700 hover:bg-rose-600' },
];

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

function idx(col: number, row: number, cols: number): number {
  return row * cols + col;
}

function neighbors(col: number, row: number, cols: number, rows: number): [number, number][] {
  const result: [number, number][] = [];
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (dc === 0 && dr === 0) continue;
      const nc = col + dc;
      const nr = row + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) result.push([nc, nr]);
    }
  }
  return result;
}

function buildGrid(cols: number, rows: number): Cell[] {
  return Array.from({ length: cols * rows }, () => ({
    isFlop: false, state: 'hidden', neighbors: 0,
  }));
}

function placeFlopsSafe(
  grid: Cell[], cols: number, rows: number, flops: number,
  safeCol: number, safeRow: number,
): Cell[] {
  const safe = new Set<number>();
  safe.add(idx(safeCol, safeRow, cols));
  for (const [nc, nr] of neighbors(safeCol, safeRow, cols, rows)) {
    safe.add(idx(nc, nr, cols));
  }

  const candidates: number[] = [];
  for (let i = 0; i < cols * rows; i++) {
    if (!safe.has(i)) candidates.push(i);
  }

  // Fisher-Yates shuffle to pick flop positions
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }

  const next = grid.map((c) => ({ ...c }));
  for (let i = 0; i < Math.min(flops, candidates.length); i++) {
    next[candidates[i]!]!.isFlop = true;
  }

  // Compute neighbor counts
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (next[idx(c, r, cols)]!.isFlop) continue;
      let count = 0;
      for (const [nc, nr] of neighbors(c, r, cols, rows)) {
        if (next[idx(nc, nr, cols)]!.isFlop) count++;
      }
      next[idx(c, r, cols)]!.neighbors = count;
    }
  }

  return next;
}

function cascadeReveal(grid: Cell[], startCol: number, startRow: number, cols: number, rows: number): Cell[] {
  const next = grid.map((c) => ({ ...c }));
  const queue: [number, number][] = [[startCol, startRow]];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const item = queue.shift()!;
    const [c, r] = item;
    const i = idx(c, r, cols);
    if (visited.has(i)) continue;
    visited.add(i);

    const cell = next[i]!;
    if (cell.state === 'flagged') continue;
    cell.state = 'revealed';

    if (cell.neighbors === 0 && !cell.isFlop) {
      for (const [nc, nr] of neighbors(c, r, cols, rows)) {
        if (!visited.has(idx(nc, nr, cols))) {
          queue.push([nc, nr]);
        }
      }
    }
  }

  return next;
}

function checkWin(grid: Cell[]): boolean {
  return grid.every((c) => c.isFlop || c.state === 'revealed');
}

// ---------------------------------------------------------------------------
// Cell component
// ---------------------------------------------------------------------------

const NUMBER_COLORS = ['', 'text-blue-400', 'text-emerald-400', 'text-red-400', 'text-purple-400', 'text-rose-600', 'text-cyan-400', 'text-gray-300', 'text-gray-500'];

interface CellProps {
  cell: Cell;
  phase: GamePhase;
  onClick: () => void;
  onRightClick: (e: React.MouseEvent) => void;
  cellSize: number;
}

function GridCell({ cell, phase, onClick, onRightClick, cellSize }: CellProps) {
  const size = `${cellSize}px`;
  const base = `border border-gray-700 flex items-center justify-center select-none cursor-pointer text-xs font-bold transition-colors`;

  if (cell.state === 'revealed') {
    if (cell.isFlop) {
      return (
        <div className={`${base} bg-rose-900 border-rose-700`} style={{ width: size, height: size, fontSize: cellSize > 20 ? 14 : 10 }}>
          💣
        </div>
      );
    }
    return (
      <div className={`${base} bg-gray-800 border-gray-700 cursor-default`} style={{ width: size, height: size }}>
        {cell.neighbors > 0 && (
          <span className={NUMBER_COLORS[cell.neighbors] ?? 'text-white'} style={{ fontSize: cellSize > 20 ? 13 : 9 }}>
            {cell.neighbors}
          </span>
        )}
      </div>
    );
  }

  if (cell.state === 'flagged') {
    return (
      <div
        className={`${base} bg-gray-900 hover:bg-gray-800`}
        style={{ width: size, height: size, fontSize: cellSize > 20 ? 14 : 10 }}
        onClick={onClick}
        onContextMenu={onRightClick}
      >
        🚩
      </div>
    );
  }

  // Hidden — show flop if game lost
  if ((phase === 'lost' || phase === 'won') && cell.isFlop) {
    return (
      <div className={`${base} bg-gray-900 border-gray-700`} style={{ width: size, height: size, fontSize: cellSize > 20 ? 14 : 10 }}>
        💣
      </div>
    );
  }

  return (
    <div
      className={`${base} bg-gray-900 hover:bg-gray-700 active:bg-gray-600`}
      style={{ width: size, height: size }}
      onClick={onClick}
      onContextMenu={onRightClick}
    />
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function MinesweeperPage() {
  const [diffId, setDiffId] = useState('normal');
  const diff = DIFFICULTIES.find((d) => d.id === diffId) ?? DIFFICULTIES[1]!;

  const [grid, setGrid] = useState<Cell[]>(() => buildGrid(diff.cols, diff.rows));
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstClick = useRef(true);

  // Dynamic cell size based on column count
  const cellSize = diff.cols <= 9 ? 36 : diff.cols <= 16 ? 28 : 20;

  const flagCount = grid.filter((c) => c.state === 'flagged').length;
  const flopCount = diff.flops;
  const remaining = flopCount - flagCount;

  // ── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'playing') {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ── Reset when difficulty changes ─────────────────────────────────────────

  useEffect(() => {
    resetGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const resetGame = useCallback(() => {
    setGrid(buildGrid(diff.cols, diff.rows));
    setPhase('idle');
    setElapsed(0);
    isFirstClick.current = true;
  }, [diff]);

  function handleClick(col: number, row: number) {
    if (phase === 'won' || phase === 'lost') return;
    const i = idx(col, row, diff.cols);
    const cell = grid[i]!;
    if (cell.state === 'flagged' || cell.state === 'revealed') return;

    let current = grid;

    // First click: place flops avoiding this cell
    if (isFirstClick.current) {
      current = placeFlopsSafe(grid, diff.cols, diff.rows, diff.flops, col, row);
      isFirstClick.current = false;
      setPhase('playing');
    }

    if (current[i]!.isFlop) {
      // Hit a flop — reveal all flops and end game
      const revealed = current.map((c) => ({
        ...c,
        state: (c.isFlop ? 'revealed' : c.state) as CellState,
      }));
      // Mark the clicked cell distinctly (already revealed)
      setGrid(revealed);
      setPhase('lost');
      return;
    }

    const next = cascadeReveal(current, col, row, diff.cols, diff.rows);
    setGrid(next);
    if (checkWin(next)) setPhase('won');
  }

  function handleRightClick(e: React.MouseEvent, col: number, row: number) {
    e.preventDefault();
    if (phase === 'won' || phase === 'lost') return;
    const i = idx(col, row, diff.cols);
    const cell = grid[i]!;
    if (cell.state === 'revealed') return;

    setGrid((prev) => {
      const next = prev.map((c) => ({ ...c }));
      const target = next[i]!;
      target.state = target.state === 'flagged' ? 'hidden' : 'flagged';
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-5xl mb-2">💣</p>
          <h1 className="text-3xl sm:text-4xl font-black">Flop Sweeper</h1>
          <p className="text-gray-400 mt-1 text-sm">Flag the flops. Uncover the hits. Don't get booed off stage.</p>
        </div>

        {/* Difficulty */}
        <div className="flex flex-wrap justify-center gap-3 mb-6">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDiffId(d.id)}
              className={`px-5 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                diffId === d.id ? d.color : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-white'
              }`}
            >
              {d.label}
              <span className="ml-2 text-xs opacity-70">{d.cols}×{d.rows} · {d.flops} flops</span>
            </button>
          ))}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between max-w-2xl mx-auto mb-4 px-2">
          <div className="flex items-center gap-2 text-lg font-mono font-bold">
            <span>💣</span>
            <span className={remaining < 0 ? 'text-rose-400' : 'text-white'}>{remaining}</span>
          </div>

          <button
            onClick={resetGame}
            className="text-2xl hover:scale-110 transition-transform active:scale-95"
            title="New game"
          >
            {phase === 'won' ? '🏆' : phase === 'lost' ? '💀' : '😤'}
          </button>

          <div className="text-lg font-mono font-bold">
            <span className="text-gray-400 mr-1 text-sm">⏱</span>
            <span>{formatTime(elapsed)}</span>
          </div>
        </div>

        {/* Result banner */}
        {phase === 'won' && (
          <div className="max-w-2xl mx-auto mb-4 rounded-xl bg-emerald-950 border border-emerald-500/50 px-6 py-4 text-center">
            <p className="text-2xl font-black text-emerald-400">🎸 Sold Out! No Flops!</p>
            <p className="text-emerald-300 text-sm mt-1">You headlined the tour in {formatTime(elapsed)}.</p>
            <button onClick={resetGame} className="mt-3 px-5 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-bold transition-colors">Play Again</button>
          </div>
        )}
        {phase === 'lost' && (
          <div className="max-w-2xl mx-auto mb-4 rounded-xl bg-rose-950 border border-rose-500/50 px-6 py-4 text-center">
            <p className="text-2xl font-black text-rose-400">💀 Flopped! The crowd walked out.</p>
            <p className="text-rose-300 text-sm mt-1">The band played {formatTime(elapsed)} before hitting a flop.</p>
            <button onClick={resetGame} className="mt-3 px-5 py-2 bg-rose-700 hover:bg-rose-600 rounded-lg text-sm font-bold transition-colors">Try Again</button>
          </div>
        )}

        {/* Grid */}
        <div className="overflow-x-auto pb-4">
          <div
            className="inline-grid mx-auto border border-gray-600 rounded-lg overflow-hidden"
            style={{ gridTemplateColumns: `repeat(${diff.cols}, ${cellSize}px)` }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {Array.from({ length: diff.rows }, (_, r) =>
              Array.from({ length: diff.cols }, (_, c) => {
                const cell = grid[idx(c, r, diff.cols)];
                if (!cell) return null;
                return (
                  <GridCell
                    key={`${c}-${r}`}
                    cell={cell}
                    phase={phase}
                    cellSize={cellSize}
                    onClick={() => handleClick(c, r)}
                    onRightClick={(e) => handleRightClick(e, c, r)}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Instructions */}
        {phase === 'idle' && (
          <div className="text-center mt-6 text-gray-500 text-xs space-y-1">
            <p>Left click to reveal a cell · Right click (or long-press) to plant a flag 🚩</p>
            <p>First click is always safe. Numbers show how many flops are adjacent.</p>
          </div>
        )}

        <div className="text-center mt-8">
          <Link to="/games" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← Back to Games</Link>
        </div>
      </div>
    </div>
  );
}

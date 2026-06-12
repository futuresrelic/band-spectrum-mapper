/**
 * CrosswordPage — interactive AI-powered crossword puzzle game.
 * Route: /play/crossword
 * Auth: any user (score saving requires auth)
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrosswordCell {
  letter: string | null;
  number: number | null;
}

interface CrosswordClue {
  number: number;
  direction: 'across' | 'down';
  clue: string;
  answer: string;
  row: number;
  col: number;
  length: number;
}

interface CrosswordData {
  size: number;
  cells: CrosswordCell[][];
  acrossClues: CrosswordClue[];
  downClues: CrosswordClue[];
  difficulty: string;
  bandScope: string;
  title: string;
  dailyDate?: string;
}

interface DailyResponse {
  puzzleId: string;
  puzzle: CrosswordData;
  title: string;
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
type Phase = 'setup' | 'playing' | 'complete';

const DIFF_CONFIG: Record<Difficulty, { label: string; multiplier: number; activeClass: string; description: string }> = {
  easy:   { label: 'Easy',   multiplier: 1.0, activeClass: 'bg-emerald-700 text-white', description: 'Straightforward clues · 11×11 grid' },
  medium: { label: 'Medium', multiplier: 1.5, activeClass: 'bg-indigo-600  text-white', description: 'Mixed references · 13×13 grid' },
  hard:   { label: 'Hard',   multiplier: 2.0, activeClass: 'bg-orange-700  text-white', description: 'Deep cuts & themes · 15×15 grid' },
  expert: { label: 'Expert', multiplier: 3.0, activeClass: 'bg-rose-700    text-white', description: 'Cryptic-adjacent clues · 15×15 grid' },
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function calcScore(timeSec: number, hintsUsed: number, mistakes: number, multiplier: number): number {
  const base     = 2000;
  const timePen  = Math.min(timeSec * 2, 1200);
  const hintPen  = hintsUsed * 150;
  const mistPen  = mistakes * 80;
  return Math.max(0, Math.round((base - timePen - hintPen - mistPen) * multiplier));
}

// ---------------------------------------------------------------------------
// Cell map helpers — precomputed from clues
// ---------------------------------------------------------------------------

interface CellInfo {
  acrossNum: number | null;
  downNum: number | null;
}

function buildCellMap(
  acrossClues: CrosswordClue[],
  downClues: CrosswordClue[],
): Map<string, CellInfo> {
  const map = new Map<string, CellInfo>();

  for (const clue of [...acrossClues, ...downClues]) {
    for (let i = 0; i < clue.length; i++) {
      const r = clue.direction === 'down'   ? clue.row + i : clue.row;
      const c = clue.direction === 'across' ? clue.col + i : clue.col;
      const key = `${r},${c}`;
      const ex = map.get(key);
      if (clue.direction === 'across') {
        map.set(key, { acrossNum: clue.number, downNum: ex?.downNum ?? null });
      } else {
        map.set(key, { acrossNum: ex?.acrossNum ?? null, downNum: clue.number });
      }
    }
  }

  return map;
}

function clueWordCells(clue: CrosswordClue): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < clue.length; i++) {
    const r = clue.direction === 'down' ? clue.row + i : clue.row;
    const c = clue.direction === 'across' ? clue.col + i : clue.col;
    s.add(`${r},${c}`);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

interface SetupProps {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  toggleBand: (id: string) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onGenerate: () => void;
  onPlayDaily: () => void;
  hasDaily: boolean;
  isLoading: boolean;
  error: string;
}

function SetupScreen({
  bands, selectedBandIds, toggleBand, difficulty, setDifficulty,
  onGenerate, onPlayDaily, hasDaily, isLoading, error,
}: SetupProps) {
  return (
    <div className="max-w-xl mx-auto text-center">
      <div className="text-6xl mb-4">🧩</div>
      <h1 className="text-3xl font-bold text-white mb-2">BSM Crossword</h1>
      <p className="text-gray-400 mb-8 leading-relaxed">
        AI-generated crossword puzzles built from your music library — songs, albums, themes, and lyrical concepts all turned into clues.
      </p>

      {hasDaily && (
        <div className="bg-amber-900/30 border border-amber-700/40 rounded-2xl p-5 mb-6 text-left">
          <h2 className="text-amber-300 font-semibold mb-1">📅 Today's Daily Puzzle</h2>
          <p className="text-sm text-gray-400 mb-3">A pre-made puzzle has been set for today. Jump straight in!</p>
          <button
            onClick={onPlayDaily}
            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
          >
            Play Daily Puzzle →
          </button>
        </div>
      )}

      {/* Band selector */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-5 text-left">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Custom Puzzle — Choose Bands</h2>
        <div className="flex flex-wrap gap-2">
          {bands.map((b) => {
            const sel = selectedBandIds.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggleBand(b.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  sel
                    ? 'bg-yellow-700 border-yellow-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Difficulty */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-8 text-left">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Difficulty</h2>
        <div className="grid grid-cols-4 gap-2">
          {(Object.entries(DIFF_CONFIG) as [Difficulty, typeof DIFF_CONFIG[Difficulty]][]).map(([d, cfg]) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`py-3 px-1 rounded-xl text-xs font-semibold border transition-colors text-center ${
                difficulty === d
                  ? `${cfg.activeClass} border-transparent`
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              <div className="font-bold">{cfg.label}</div>
              <div className={`text-[10px] mt-0.5 font-normal leading-tight ${difficulty === d ? 'text-white/70' : 'text-gray-600'}`}>{cfg.description}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onGenerate}
        disabled={selectedBandIds.length === 0 || isLoading}
        className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white font-bold px-10 py-4 rounded-2xl text-lg transition-colors"
      >
        {isLoading ? '⚙️ Building Puzzle…' : '✦ Generate Puzzle →'}
      </button>
      {selectedBandIds.length === 0 && (
        <p className="text-xs text-gray-600 mt-3">Select at least one band to generate a custom puzzle.</p>
      )}
      {error && <p className="text-rose-400 text-sm mt-3">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive crossword grid
// ---------------------------------------------------------------------------

interface GridProps {
  puzzle: CrosswordData;
  userGrid: (string | null)[][];
  selected: { row: number; col: number } | null;
  revealed: Set<string>;
  mistakes: Set<string>;
  corrected: Set<string>;
  currentWordCells: Set<string>;
  onCellClick: (row: number, col: number) => void;
}

function CrosswordGrid({
  puzzle, userGrid, selected, revealed, mistakes, corrected, currentWordCells, onCellClick,
}: GridProps) {
  const { size, cells } = puzzle;
  return (
    <div style={{ width: '100%', maxWidth: `${size * 36}px` }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gap: '2px',
        }}
        className="select-none"
      >
        {cells.map((row, r) =>
          row.map((cell, c) => {
            if (cell.letter === null) {
              return (
                <div
                  key={`${r}-${c}`}
                  style={{ aspectRatio: '1 / 1' }}
                  className="bg-gray-900"
                />
              );
            }

            const key = `${r},${c}`;
            const isSel = selected?.row === r && selected?.col === c;
            const inWord = currentWordCells.has(key);
            const isRev  = revealed.has(key);
            const isMist = mistakes.has(key);
            const isCorr = corrected.has(key);
            const userLetter = userGrid[r]?.[c] ?? null;

            let bg = 'bg-white';
            if (isSel)       bg = 'bg-blue-300';
            else if (inWord) bg = 'bg-blue-100';
            else if (isCorr) bg = 'bg-emerald-100';
            else if (isMist) bg = 'bg-rose-100';

            return (
              <div
                key={`${r}-${c}`}
                style={{ aspectRatio: '1 / 1' }}
                onClick={() => onCellClick(r, c)}
                className={`relative border border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden ${bg}`}
              >
                {cell.number !== null && (
                  <span className="absolute top-0 left-0.5 text-[8px] leading-none text-gray-500 font-medium select-none">
                    {cell.number}
                  </span>
                )}
                {userLetter && (
                  <span className={`text-[11px] font-bold select-none leading-none ${isRev ? 'text-indigo-600' : isMist ? 'text-rose-600' : 'text-gray-900'}`}>
                    {userLetter}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clue list
// ---------------------------------------------------------------------------

function ClueList({
  clues,
  activeNum,
  direction,
  onSelect,
}: {
  clues: CrosswordClue[];
  activeNum: number | null;
  direction: 'across' | 'down';
  onSelect: (clue: CrosswordClue) => void;
}) {
  const filtered = clues.filter((c) => c.direction === direction);
  const label    = direction === 'across' ? 'Across' : 'Down';

  return (
    <div>
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{label}</h3>
      <div className="space-y-1 max-h-48 lg:max-h-64 overflow-y-auto pr-1">
        {filtered.map((clue) => {
          const active = activeNum === clue.number && direction === clue.direction;
          return (
            <button
              key={`${clue.direction}-${clue.number}`}
              onClick={() => onSelect(clue)}
              className={`w-full text-left flex gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                active
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span className={`font-bold shrink-0 w-5 text-right ${active ? 'text-blue-200' : 'text-gray-500'}`}>
                {clue.number}.
              </span>
              <span className="leading-snug">{clue.clue}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play screen
// ---------------------------------------------------------------------------

interface PlayProps {
  puzzle: CrosswordData;
  difficulty: Difficulty;
  onComplete: (score: number, timeSec: number, hintsUsed: number, mistakes: number) => void;
}

function PlayScreen({ puzzle, difficulty, onComplete }: PlayProps) {
  const [userGrid, setUserGrid]         = useState<(string | null)[][]>(
    () => puzzle.cells.map((row) => row.map(() => null)),
  );
  const [selected, setSelected]         = useState<{ row: number; col: number } | null>(null);
  const [direction, setDirection]       = useState<'across' | 'down'>('across');
  const [revealed, setRevealed]         = useState<Set<string>>(new Set());
  const [mistakes, setMistakes]         = useState<Set<string>>(new Set());
  const [corrected, setCorrected]       = useState<Set<string>>(new Set());
  const [hintsUsed, setHintsUsed]       = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [startTime]                     = useState(() => Date.now());
  const [elapsedSec, setElapsedSec]     = useState(0);
  const inputRef                        = useRef<HTMLInputElement>(null);

  // Tick timer
  useEffect(() => {
    const t = setInterval(() => setElapsedSec(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTime]);

  const cellMap = useMemo(
    () => buildCellMap(puzzle.acrossClues, puzzle.downClues),
    [puzzle],
  );

  const allClues = useMemo(
    () => [...puzzle.acrossClues, ...puzzle.downClues],
    [puzzle],
  );

  // Current active clue (from selected cell + direction)
  const activeClue = useMemo((): CrosswordClue | null => {
    if (!selected) return null;
    const info = cellMap.get(`${selected.row},${selected.col}`);
    if (!info) return null;
    const num = direction === 'across' ? info.acrossNum : info.downNum;
    if (num === null) {
      // Fall back to the other direction
      const altNum = direction === 'across' ? info.downNum : info.acrossNum;
      if (altNum === null) return null;
      return allClues.find((c) => c.direction !== direction && c.number === altNum) ?? null;
    }
    return allClues.find((c) => c.direction === direction && c.number === num) ?? null;
  }, [selected, direction, cellMap, allClues]);

  const currentWordCells = useMemo(
    () => (activeClue ? clueWordCells(activeClue) : new Set<string>()),
    [activeClue],
  );

  // Active clue number for list highlighting
  const activeNum = activeClue?.number ?? null;

  // Keep input focused for keyboard capture
  function ensureFocused() {
    inputRef.current?.focus();
  }

  // Find a valid direction for a cell (prefers current direction)
  function validDirectionForCell(row: number, col: number, preferDir: 'across' | 'down'): 'across' | 'down' {
    const info = cellMap.get(`${row},${col}`);
    if (!info) return preferDir;
    if (preferDir === 'across' && info.acrossNum !== null) return 'across';
    if (preferDir === 'down'   && info.downNum   !== null) return 'down';
    return info.acrossNum !== null ? 'across' : 'down';
  }

  function handleCellClick(row: number, col: number) {
    ensureFocused();
    if (selected?.row === row && selected?.col === col) {
      // Toggle direction
      const info = cellMap.get(`${row},${col}`);
      if (info) {
        const newDir: 'across' | 'down' = direction === 'across' ? 'down' : 'across';
        const valid = newDir === 'across' ? info.acrossNum !== null : info.downNum !== null;
        if (valid) setDirection(newDir);
      }
    } else {
      setSelected({ row, col });
      setDirection(validDirectionForCell(row, col, direction));
    }
  }

  function handleClueSelect(clue: CrosswordClue) {
    setSelected({ row: clue.row, col: clue.col });
    setDirection(clue.direction);
    ensureFocused();
  }

  function advanceCursor(row: number, col: number, dir: 'across' | 'down') {
    const nextR = dir === 'down' ? row + 1 : row;
    const nextC = dir === 'across' ? col + 1 : col;
    if (nextR >= puzzle.size || nextC >= puzzle.size) return;
    const nextCell = puzzle.cells[nextR]?.[nextC];
    if (!nextCell || nextCell.letter === null) return;
    const info = cellMap.get(`${nextR},${nextC}`);
    if (!info) return;
    const hasDir = dir === 'across' ? info.acrossNum !== null : info.downNum !== null;
    if (!hasDir) return;
    setSelected({ row: nextR, col: nextC });
  }

  function retreatCursor(row: number, col: number, dir: 'across' | 'down') {
    const prevR = dir === 'down' ? row - 1 : row;
    const prevC = dir === 'across' ? col - 1 : col;
    if (prevR < 0 || prevC < 0) return;
    const prevCell = puzzle.cells[prevR]?.[prevC];
    if (!prevCell || prevCell.letter === null) return;
    const info = cellMap.get(`${prevR},${prevC}`);
    if (!info) return;
    const hasDir = dir === 'across' ? info.acrossNum !== null : info.downNum !== null;
    if (!hasDir) return;
    setSelected({ row: prevR, col: prevC });
  }

  function checkCompletion(grid: (string | null)[][]) {
    for (let r = 0; r < puzzle.size; r++) {
      for (let c = 0; c < puzzle.size; c++) {
        const cell = puzzle.cells[r]?.[c];
        if (!cell || cell.letter === null) continue;
        const user = grid[r]?.[c];
        if (!user || user !== cell.letter) return false;
      }
    }
    return true;
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!selected) return;

      // Only prevent default for keys we handle — lets mobile 'Unidentified' keys
      // fall through so the browser inserts a character, which onInput captures.
      const letter = e.key.toUpperCase();
      const isHandled = ['Backspace','Delete','ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Tab'].includes(e.key)
        || /^[A-Z]$/.test(letter);
      if (isHandled) e.preventDefault();

      const { row, col } = selected;

      if (e.key === 'Backspace') {
        const existing = userGrid[row]?.[col];
        if (existing) {
          setUserGrid((prev) => {
            const next = prev.map((r) => [...r]);
            next[row]![col] = null;
            return next;
          });
          // Clear mistake/corrected state
          const key = `${row},${col}`;
          setMistakes((prev) => { const s = new Set(prev); s.delete(key); return s; });
          setCorrected((prev) => { const s = new Set(prev); s.delete(key); return s; });
        } else {
          retreatCursor(row, col, direction);
        }
        return;
      }

      if (e.key === 'Delete') {
        const key = `${row},${col}`;
        setUserGrid((prev) => { const next = prev.map((r) => [...r]); next[row]![col] = null; return next; });
        setMistakes((prev) => { const s = new Set(prev); s.delete(key); return s; });
        setCorrected((prev) => { const s = new Set(prev); s.delete(key); return s; });
        return;
      }

      if (e.key === 'ArrowRight') { setSelected({ row, col: Math.min(puzzle.size - 1, col + 1) }); setDirection('across'); return; }
      if (e.key === 'ArrowLeft')  { setSelected({ row, col: Math.max(0, col - 1) }); setDirection('across'); return; }
      if (e.key === 'ArrowDown')  { setSelected({ row: Math.min(puzzle.size - 1, row + 1), col }); setDirection('down'); return; }
      if (e.key === 'ArrowUp')    { setSelected({ row: Math.max(0, row - 1), col }); setDirection('down'); return; }

      if (e.key === 'Tab') {
        // Jump to next clue start
        const clues = [...puzzle.acrossClues, ...puzzle.downClues].sort((a, b) => a.number - b.number);
        const curIdx = activeClue ? clues.findIndex((c) => c.number === activeClue.number && c.direction === activeClue.direction) : -1;
        const nextIdx = (curIdx + 1) % clues.length;
        const next = clues[nextIdx];
        if (next) { setSelected({ row: next.row, col: next.col }); setDirection(next.direction); }
        return;
      }

      // Letter input
      if (/^[A-Z]$/.test(letter)) {
        const correctLetter = puzzle.cells[row]?.[col]?.letter;
        if (!correctLetter) return;

        const key = `${row},${col}`;
        const isCorrect = letter === correctLetter;

        setUserGrid((prev) => {
          const next = prev.map((r) => [...r]);
          next[row]![col] = letter;
          return next;
        });

        // Track mistakes
        if (!isCorrect) {
          setMistakeCount((m) => m + 1);
          setMistakes((prev) => new Set([...prev, key]));
          setCorrected((prev) => { const s = new Set(prev); s.delete(key); return s; });
        } else {
          setMistakes((prev) => { const s = new Set(prev); s.delete(key); return s; });
          setCorrected((prev) => new Set([...prev, key]));
        }

        // Check completion with updated grid
        const nextGrid = userGrid.map((r) => [...r]);
        nextGrid[row]![col] = letter;
        if (checkCompletion(nextGrid)) {
          const finalTime = Math.floor((Date.now() - startTime) / 1000);
          const finalScore = calcScore(finalTime, hintsUsed, mistakeCount + (isCorrect ? 0 : 1), DIFF_CONFIG[difficulty].multiplier);
          onComplete(finalScore, finalTime, hintsUsed, mistakeCount + (isCorrect ? 0 : 1));
          return;
        }

        advanceCursor(row, col, direction);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, direction, userGrid, puzzle, activeClue, hintsUsed, mistakeCount, startTime, difficulty, onComplete],
  );

  // Mobile soft keyboards fire 'input' not 'keydown'. Capture whatever character
  // was inserted, clear the field, then process it as a letter entry.
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const val = e.currentTarget.value;
      e.currentTarget.value = '';
      if (!val || !selected) return;
      const char = val.slice(-1).toUpperCase();
      if (!/^[A-Z]$/.test(char)) return;

      const { row, col } = selected;
      const correctLetter = puzzle.cells[row]?.[col]?.letter;
      if (!correctLetter) return;

      const key = `${row},${col}`;
      const isCorrect = char === correctLetter;

      setUserGrid((prev) => {
        const next = prev.map((r) => [...r]);
        next[row]![col] = char;
        return next;
      });

      if (!isCorrect) {
        setMistakeCount((m) => m + 1);
        setMistakes((prev) => new Set([...prev, key]));
        setCorrected((prev) => { const s = new Set(prev); s.delete(key); return s; });
      } else {
        setMistakes((prev) => { const s = new Set(prev); s.delete(key); return s; });
        setCorrected((prev) => new Set([...prev, key]));
      }

      const nextGrid = userGrid.map((r) => [...r]);
      nextGrid[row]![col] = char;
      if (checkCompletion(nextGrid)) {
        const finalTime = Math.floor((Date.now() - startTime) / 1000);
        const finalScore = calcScore(finalTime, hintsUsed, mistakeCount + (isCorrect ? 0 : 1), DIFF_CONFIG[difficulty].multiplier);
        onComplete(finalScore, finalTime, hintsUsed, mistakeCount + (isCorrect ? 0 : 1));
        return;
      }

      advanceCursor(row, col, direction);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, direction, userGrid, puzzle, cellMap, hintsUsed, mistakeCount, startTime, difficulty, onComplete],
  );

  function hintCurrentCell() {
    if (!selected) return;
    const { row, col } = selected;
    const correct = puzzle.cells[row]?.[col]?.letter;
    if (!correct) return;

    const key = `${row},${col}`;
    setHintsUsed((h) => h + 1);
    setRevealed((prev) => new Set([...prev, key]));
    setMistakes((prev) => { const s = new Set(prev); s.delete(key); return s; });
    setCorrected((prev) => new Set([...prev, key]));
    setUserGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[row]![col] = correct;
      return next;
    });

    // Check completion after hint
    const nextGrid = userGrid.map((r) => [...r]);
    nextGrid[row]![col] = correct;
    if (checkCompletion(nextGrid)) {
      const finalTime = Math.floor((Date.now() - startTime) / 1000);
      const finalScore = calcScore(finalTime, hintsUsed + 1, mistakeCount, DIFF_CONFIG[difficulty].multiplier);
      onComplete(finalScore, finalTime, hintsUsed + 1, mistakeCount);
    }
  }

  function hintCurrentWord() {
    if (!activeClue) return;
    const cells = clueWordCells(activeClue);
    const newRevealed = new Set(revealed);
    const newGrid = userGrid.map((r) => [...r]);
    let added = 0;

    for (const key of cells) {
      const [rStr, cStr] = key.split(',');
      const r = parseInt(rStr ?? '0');
      const c = parseInt(cStr ?? '0');
      const correct = puzzle.cells[r]?.[c]?.letter;
      if (!correct) continue;
      newRevealed.add(key);
      newGrid[r]![c] = correct;
      added++;
    }

    if (added > 0) {
      setHintsUsed((h) => h + added);
      setRevealed(newRevealed);
      setMistakes(new Set([...mistakes].filter((k) => !cells.has(k))));
      setCorrected(new Set([...corrected, ...cells]));
      setUserGrid(newGrid);

      if (checkCompletion(newGrid)) {
        const finalTime = Math.floor((Date.now() - startTime) / 1000);
        const finalScore = calcScore(finalTime, hintsUsed + added, mistakeCount, DIFF_CONFIG[difficulty].multiplier);
        onComplete(finalScore, finalTime, hintsUsed + added, mistakeCount);
      }
    }
  }

  function giveUp() {
    // Reveal entire puzzle
    const newGrid = puzzle.cells.map((row) => row.map((cell) => cell.letter));
    const newRevealed = new Set<string>();
    for (let r = 0; r < puzzle.size; r++) {
      for (let c = 0; c < puzzle.size; c++) {
        if (puzzle.cells[r]?.[c]?.letter) newRevealed.add(`${r},${c}`);
      }
    }
    setUserGrid(newGrid);
    setRevealed(newRevealed);
    const finalTime = Math.floor((Date.now() - startTime) / 1000);
    onComplete(0, finalTime, hintsUsed, mistakeCount);
  }

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div>
      {/* Hidden input — captures physical keyboard (keydown) and mobile soft keyboard (input) */}
      <input
        ref={inputRef}
        className="sr-only"
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        inputMode="text"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        autoFocus
      />

      {/* HUD */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-white text-lg">{puzzle.title}</h2>
          <p className="text-xs text-gray-500">{puzzle.difficulty} · {puzzle.acrossClues.length + puzzle.downClues.length} clues</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-lg font-mono font-bold text-white">{formatTime(elapsedSec)}</p>
            <p className="text-[10px] text-gray-600 uppercase">Time</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white">{hintsUsed}</p>
            <p className="text-[10px] text-gray-600 uppercase">Hints</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white">{mistakeCount}</p>
            <p className="text-[10px] text-gray-600 uppercase">Errors</p>
          </div>
        </div>
      </div>

      {/* Current clue banner */}
      {activeClue && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3">
          <span className="text-xs font-bold text-gray-500 uppercase shrink-0">
            {activeClue.number} {activeClue.direction === 'across' ? 'Across' : 'Down'}
          </span>
          <span className="text-sm text-white">{activeClue.clue}</span>
        </div>
      )}

      {/* Main grid + clue lists */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6 lg:items-start">
        {/* Grid */}
        <div className="flex justify-center lg:justify-start" onClick={ensureFocused}>
          <CrosswordGrid
            puzzle={puzzle}
            userGrid={userGrid}
            selected={selected}
            revealed={revealed}
            mistakes={mistakes}
            corrected={corrected}
            currentWordCells={currentWordCells}
            onCellClick={handleCellClick}
          />
        </div>

        {/* Clue lists */}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
          <ClueList
            clues={allClues}
            activeNum={direction === 'across' ? activeNum : null}
            direction="across"
            onSelect={handleClueSelect}
          />
          <ClueList
            clues={allClues}
            activeNum={direction === 'down' ? activeNum : null}
            direction="down"
            onSelect={handleClueSelect}
          />
        </div>
      </div>

      {/* Hint actions */}
      <div className="flex gap-2 flex-wrap mt-5">
        <button
          onClick={hintCurrentCell}
          disabled={!selected}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 border border-gray-700 text-gray-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          Reveal Letter
        </button>
        <button
          onClick={hintCurrentWord}
          disabled={!activeClue}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 border border-gray-700 text-gray-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          Reveal Word
        </button>
        <button
          onClick={giveUp}
          className="bg-gray-800 hover:bg-rose-900/50 border border-gray-700 hover:border-rose-700/50 text-gray-500 hover:text-rose-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ml-auto"
        >
          Give Up
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-xs text-gray-700 mt-3">Tap a cell, then type · Tab = next clue · Backspace = delete · Tap twice = flip direction</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score screen
// ---------------------------------------------------------------------------

interface ScoreProps {
  score: number;
  timeSec: number;
  hintsUsed: number;
  mistakes: number;
  difficulty: Difficulty;
  bandIds: string[];
  puzzleId: string | null;
  onPlayAgain: () => void;
  leaderboard: LeaderboardEntry[];
  leaderboardLoading: boolean;
  leaderboardDiff: Difficulty;
  setLeaderboardDiff: (d: Difficulty) => void;
}

interface LeaderboardEntry {
  rank: number;
  playerName: string;
  avatarUrl?: string | null;
  score: number;
  timeSec: number;
  hintsUsed: number;
  mistakes: number;
  bandScopeNames?: string | null;
  createdAt: string;
}

function ScoreScreen({
  score, timeSec, hintsUsed, mistakes, difficulty, bandIds, puzzleId,
  onPlayAgain, leaderboard, leaderboardLoading, leaderboardDiff, setLeaderboardDiff,
}: ScoreProps) {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [rank, setRank] = useState<number | null>(null);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  async function submit() {
    try {
      const res = await api.post('/api/crossword/scores', {
        score, timeSec, hintsUsed, mistakes, completed: score > 0,
        difficulty, bandScope: bandIds.join(',') || null,
        ...(puzzleId ? { puzzleId } : {}),
      }) as { rank: number };
      setRank(res.rank);
      setSubmitted(true);
    } catch {
      setSubmitError('Could not save score. Try again.');
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center mb-8">
        <div className="text-5xl mb-4">{score > 0 ? '🎉' : '😔'}</div>
        <h2 className="text-2xl font-bold text-white mb-1">{score > 0 ? 'Puzzle Complete!' : 'Puzzle Revealed'}</h2>
        <p className="text-gray-400 text-sm mb-6">{DIFF_CONFIG[difficulty].label} difficulty</p>

        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Score', value: score.toLocaleString(), highlight: true },
            { label: 'Time',  value: formatTime(timeSec) },
            { label: 'Hints', value: String(hintsUsed) },
            { label: 'Errors', value: String(mistakes) },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="bg-gray-800 rounded-xl p-3">
              <p className={`text-xl font-bold ${highlight ? 'text-white' : 'text-gray-300'}`}>{value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        {rank !== null && (
          <p className="text-emerald-400 font-semibold mb-4">You ranked #{rank} on the leaderboard!</p>
        )}

        {!submitted && user && score > 0 && (
          <div className="mb-4">
            <button
              onClick={submit}
              className="bg-yellow-700 hover:bg-yellow-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Save Score
            </button>
            {submitError && <p className="text-rose-400 text-sm mt-2">{submitError}</p>}
          </div>
        )}
        {!user && (
          <p className="text-sm text-gray-500 mb-4">
            <a href="/api/auth/google" className="text-yellow-400 hover:text-yellow-300 underline">Sign in</a> to save your score.
          </p>
        )}

        <button
          onClick={onPlayAgain}
          className="bg-gray-700 hover:bg-gray-600 text-white font-medium px-6 py-2.5 rounded-xl transition-colors"
        >
          Play Again
        </button>
      </div>

      {/* Leaderboard */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Leaderboard</h3>
          <select
            value={leaderboardDiff}
            onChange={(e) => setLeaderboardDiff(e.target.value as Difficulty)}
            className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1"
          >
            {(Object.keys(DIFF_CONFIG) as Difficulty[]).map((d) => (
              <option key={d} value={d}>{DIFF_CONFIG[d].label}</option>
            ))}
          </select>
        </div>
        {leaderboardLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : leaderboard.length === 0 ? (
          <p className="text-sm text-gray-500">No scores yet for this difficulty.</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((e) => (
              <div key={e.rank} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 w-5 text-center">
                    {e.rank <= 3 ? ['🥇','🥈','🥉'][e.rank - 1] : e.rank}
                  </span>
                  {e.avatarUrl && <img src={e.avatarUrl} alt="" className="w-6 h-6 rounded-full" />}
                  <div>
                    <p className="text-sm font-medium text-white">{e.playerName}</p>
                    {e.bandScopeNames && <p className="text-xs text-gray-500">{e.bandScopeNames}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{e.score.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{formatTime(e.timeSec)} · {e.hintsUsed}h</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CrosswordPage() {
  const [phase, setPhase]                 = useState<Phase>('setup');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [difficulty, setDifficulty]       = useState<Difficulty>('medium');
  const [puzzle, setPuzzle]               = useState<CrosswordData | null>(null);
  const [puzzleId, setPuzzleId]           = useState<string | null>(null);
  const [loadError, setLoadError]         = useState('');
  const [isGenerating, setIsGenerating]   = useState(false);
  const [finalScore, setFinalScore]       = useState(0);
  const [finalTime, setFinalTime]         = useState(0);
  const [finalHints, setFinalHints]       = useState(0);
  const [finalMistakes, setFinalMistakes] = useState(0);
  const [leaderboardDiff, setLeaderboardDiff] = useState<Difficulty>('medium');

  const today = new Date().toISOString().slice(0, 10);

  const { data: bands = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['bands'],
    queryFn: () => api.get('/api/bands'),
    staleTime: 300_000,
  });

  const { data: dailyData } = useQuery<DailyResponse | null>({
    queryKey: ['crossword-daily', today],
    queryFn: async () => {
      try {
        return await api.get(`/api/crossword/daily?date=${today}`) as DailyResponse;
      } catch {
        return null;
      }
    },
    staleTime: 300_000,
  });

  const { data: leaderboard = [], isLoading: lbLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['crossword-scores', leaderboardDiff],
    queryFn: () => api.get(`/api/crossword/scores?difficulty=${leaderboardDiff}&limit=15`),
    staleTime: 30_000,
  });

  function toggleBand(id: string) {
    setSelectedBandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function generatePuzzle() {
    if (selectedBandIds.length === 0) { setLoadError('Select at least one band.'); return; }
    setLoadError('');
    setIsGenerating(true);
    try {
      const data = await api.post('/api/crossword/generate', {
        bandIds: selectedBandIds,
        difficulty,
      }) as CrosswordData;
      setPuzzle(data);
      setPuzzleId(null);
      setDifficulty((data.difficulty as Difficulty) || difficulty);
      setPhase('playing');
    } catch (e: unknown) {
      setLoadError((e as { message?: string })?.message ?? 'Failed to generate puzzle. Try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  function playDaily() {
    if (!dailyData) return;
    setPuzzle(dailyData.puzzle);
    setPuzzleId(dailyData.puzzleId);
    setDifficulty((dailyData.puzzle.difficulty as Difficulty) || 'medium');
    setPhase('playing');
  }

  function handleComplete(score: number, timeSec: number, hintsUsed: number, mistakes: number) {
    setFinalScore(score);
    setFinalTime(timeSec);
    setFinalHints(hintsUsed);
    setFinalMistakes(mistakes);
    setLeaderboardDiff((difficulty as Difficulty));
    setPhase('complete');
  }

  function handlePlayAgain() {
    setPuzzle(null);
    setPuzzleId(null);
    setPhase('setup');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link to="/games" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to Games
          </Link>
        </div>

        {phase === 'setup' && (
          <SetupScreen
            bands={bands}
            selectedBandIds={selectedBandIds}
            toggleBand={toggleBand}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onGenerate={generatePuzzle}
            onPlayDaily={playDaily}
            hasDaily={!!dailyData}
            isLoading={isGenerating}
            error={loadError}
          />
        )}

        {phase === 'playing' && puzzle && (
          <PlayScreen
            puzzle={puzzle}
            difficulty={difficulty}
            onComplete={handleComplete}
          />
        )}

        {phase === 'complete' && (
          <ScoreScreen
            score={finalScore}
            timeSec={finalTime}
            hintsUsed={finalHints}
            mistakes={finalMistakes}
            difficulty={difficulty}
            bandIds={selectedBandIds}
            puzzleId={puzzleId}
            onPlayAgain={handlePlayAgain}
            leaderboard={leaderboard}
            leaderboardLoading={lbLoading}
            leaderboardDiff={leaderboardDiff}
            setLeaderboardDiff={setLeaderboardDiff}
          />
        )}
      </main>
    </div>
  );
}

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WordSolution { word: string; row: number; col: number; dr: number; dc: number; }
interface WordSearchData {
  size: number;
  grid: string[][];
  words: { word: string; clue: string }[];
  solutions: WordSolution[];
  difficulty: string;
  bandScope: string;
  title: string;
}
interface LeaderboardEntry {
  rank: number; playerName: string; avatarUrl: string | null;
  score: number; wordsFound: number; totalWords: number; timeSec: number;
  difficulty: string; bandScopeNames: string | null; createdAt: string;
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
type Phase = 'setup' | 'loading' | 'play' | 'over';

const DIFF_LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
const DIFF_TIME: Record<Difficulty, number> = { easy: 300, medium: 240, hard: 180, expert: 150 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cellKey(r: number, c: number) { return `${r},${c}`; }

function getCellsForSolution(sol: WordSolution): string[] {
  const cells: string[] = [];
  for (let i = 0; i < sol.word.length; i++) {
    cells.push(cellKey(sol.row + sol.dr * i, sol.col + sol.dc * i));
  }
  return cells;
}

function scorePuzzle(wordsFound: number, totalWords: number, timeSec: number, timeLimit: number, difficulty: string): number {
  const diff = { easy: 1, medium: 1.5, hard: 2, expert: 2.5 }[difficulty] ?? 1;
  const base = wordsFound * 100;
  const timeBonus = Math.max(0, Math.floor(((timeLimit - timeSec) / timeLimit) * 300));
  const completionBonus = wordsFound === totalWords ? 500 : 0;
  return Math.floor((base + timeBonus + completionBonus) * diff);
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

function SetupScreen({
  bands, selectedBandIds, setSelectedBandIds, difficulty, setDifficulty, onGenerate, loading,
}: {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  setSelectedBandIds: React.Dispatch<React.SetStateAction<string[]>>;
  difficulty: Difficulty;
  setDifficulty: React.Dispatch<React.SetStateAction<Difficulty>>;
  onGenerate: () => void;
  loading: boolean;
}) {
  function toggle(id: string) {
    setSelectedBandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SiteHeader theme="dark" active="games" />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🔍</div>
            <h1 className="text-3xl font-bold">BSM Word Search</h1>
            <p className="text-gray-400 mt-2 text-sm">AI-generated from your music library</p>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">
            {/* Band picker */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Select Bands</h2>
              <div className="flex flex-wrap gap-2">
                {bands.map((b) => {
                  const sel = selectedBandIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggle(b.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        sel
                          ? 'bg-cyan-600 border-cyan-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
              {selectedBandIds.length === 0 && (
                <p className="text-xs text-amber-500 mt-2">Select at least one band.</p>
              )}
            </div>

            {/* Difficulty */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Difficulty</h2>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(DIFF_LABELS) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      difficulty === d
                        ? 'bg-cyan-600 border-transparent text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {DIFF_LABELS[d]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {difficulty === 'easy' && 'Left-to-right and downward only · 10 min · 10 words'}
                {difficulty === 'medium' && '4 directions · 4 min · 14 words'}
                {difficulty === 'hard' && 'All 8 directions · 3 min · 18 words'}
                {difficulty === 'expert' && 'All 8 directions · 2:30 · 22 words'}
              </p>
            </div>

            <button
              onClick={onGenerate}
              disabled={selectedBandIds.length === 0 || loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? '⚙️ Generating puzzle…' : '✦ Generate Word Search'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word Search grid (pointer-event drag-to-select, fully responsive)
// ---------------------------------------------------------------------------

function WordGrid({
  puzzle,
  foundWords,
  revealedCells,
  onSelect,
}: {
  puzzle: WordSearchData;
  foundWords: Set<string>;
  revealedCells: Set<string>;
  onSelect: (cells: string[], word: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ r: number; c: number } | null>(null);
  const [dragCells, setDragCells] = useState<string[]>([]);
  // gridRef is on the CSS grid div so getBoundingClientRect() gives us the true grid bounds
  const gridRef = useRef<HTMLDivElement>(null);

  function getCellState(r: number, c: number): 'found' | 'revealed' | 'drag' | 'none' {
    const k = cellKey(r, c);
    if (dragCells.includes(k)) return 'drag';
    if (foundWords.size > 0) {
      for (const sol of puzzle.solutions) {
        if (foundWords.has(sol.word)) {
          for (let i = 0; i < sol.word.length; i++) {
            if (cellKey(sol.row + sol.dr * i, sol.col + sol.dc * i) === k) return 'found';
          }
        }
      }
    }
    if (revealedCells.has(k)) return 'revealed';
    return 'none';
  }

  function lineBetween(r1: number, c1: number, r2: number, c2: number): string[] {
    const dr = r2 - r1; const dc = c2 - c1;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps === 0) return [cellKey(r1, c1)];
    const ndr = Math.round(dr / steps); const ndc = Math.round(dc / steps);
    if (Math.abs(dr) !== 0 && Math.abs(dc) !== 0 && Math.abs(dr) !== Math.abs(dc)) {
      if (Math.abs(dr) >= Math.abs(dc)) return lineBetween(r1, c1, r2, c1);
      return lineBetween(r1, c1, r1, c2);
    }
    const cells: string[] = [];
    for (let i = 0; i <= steps; i++) cells.push(cellKey(r1 + ndr * i, c1 + ndc * i));
    return cells;
  }

  function cellFromPoint(clientX: number, clientY: number): { r: number; c: number } | null {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    // pitch = (total grid width + 1 gap) / N  — works for any responsive size
    const pitch = (rect.width + 2) / puzzle.size;
    const col = Math.floor((clientX - rect.left) / pitch);
    const row = Math.floor((clientY - rect.top) / pitch);
    if (row < 0 || row >= puzzle.size || col < 0 || col >= puzzle.size) return null;
    return { r: row, c: col };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault(); // block scroll / context-menu on touch
    const pos = cellFromPoint(e.clientX, e.clientY);
    if (!pos) return;
    // Capture on the grid div so all subsequent move/up events arrive here
    gridRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragStart(pos);
    setDragCells([cellKey(pos.r, pos.c)]);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStart) return;
    const pos = cellFromPoint(e.clientX, e.clientY);
    if (!pos) return;
    setDragCells(lineBetween(dragStart.r, dragStart.c, pos.r, pos.c));
  }

  function onPointerUp() {
    if (!dragging || dragCells.length === 0) { setDragging(false); setDragCells([]); return; }
    const str = dragCells
      .map((k) => {
        const [r, c] = k.split(',').map(Number);
        return puzzle.grid[r]?.[c] ?? '';
      })
      .join('');
    const revStr = str.split('').reverse().join('');
    for (const sol of puzzle.solutions) {
      if (sol.word === str || sol.word === revStr) {
        onSelect(dragCells, sol.word);
        break;
      }
    }
    setDragging(false);
    setDragCells([]);
    setDragStart(null);
  }

  // Max desired cell size in px — grid shrinks to fit any screen width
  const MAX_CELL = 40;

  return (
    // Outer wrapper caps max size on desktop; on mobile it fills available width
    <div
      className="w-full mx-auto"
      style={{ maxWidth: `${puzzle.size * (MAX_CELL + 2)}px` }}
    >
      <div
        ref={gridRef}
        className="select-none touch-none w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`,
          gap: '2px',
          cursor: 'crosshair',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {puzzle.grid.map((row, r) =>
          row.map((letter, c) => {
            const state = getCellState(r, c);
            const bg =
              state === 'drag'     ? 'bg-cyan-500 text-white'         :
              state === 'found'    ? 'bg-emerald-500 text-white'      :
              state === 'revealed' ? 'bg-amber-500/40 text-amber-200' :
              'bg-gray-800 text-gray-300';
            return (
              <div
                key={`${r}-${c}`}
                // aspect-ratio keeps cells square regardless of 1fr column width
                style={{ aspectRatio: '1 / 1' }}
                className={`flex items-center justify-center font-bold text-xs rounded ${bg}`}
              >
                {letter}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play screen
// ---------------------------------------------------------------------------

function PlayScreen({
  puzzle,
  difficulty,
  onFinish,
}: {
  puzzle: WordSearchData;
  difficulty: Difficulty;
  onFinish: (score: number, wordsFound: number, timeSec: number) => void;
}) {
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [revealedCells, setRevealedCells] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timeLimit = DIFF_TIME[difficulty];
  const elapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleExpire = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const sc = scorePuzzle(foundWords.size, puzzle.words.length, elapsedRef.current, timeLimit, difficulty);
    onFinish(sc, foundWords.size, elapsedRef.current);
  }, [foundWords.size, puzzle.words.length, timeLimit, difficulty, onFinish]);

  useEffect(() => {
    if (!started) return;
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed((p) => p + 1);
      if (elapsedRef.current >= timeLimit) {
        clearInterval(intervalRef.current!);
        const sc = scorePuzzle(foundWords.size, puzzle.words.length, elapsedRef.current, timeLimit, difficulty);
        onFinish(sc, foundWords.size, elapsedRef.current);
      }
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Check for all found
  useEffect(() => {
    if (started && foundWords.size === puzzle.words.length) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const sc = scorePuzzle(foundWords.size, puzzle.words.length, elapsedRef.current, timeLimit, difficulty);
      onFinish(sc, foundWords.size, elapsedRef.current);
    }
  }, [foundWords.size, puzzle.words.length, started, timeLimit, difficulty, onFinish]);

  function handleSelect(_cells: string[], word: string) {
    if (foundWords.has(word)) return;
    if (!started) setStarted(true);
    setFoundWords((prev) => new Set([...prev, word]));
  }

  function revealWord(word: string) {
    const sol = puzzle.solutions.find((s) => s.word === word);
    if (!sol) return;
    const cells = getCellsForSolution(sol);
    setRevealedCells((prev) => new Set([...prev, ...cells]));
    setFoundWords((prev) => new Set([...prev, word]));
  }

  const remaining = timeLimit - elapsed;
  const pct = remaining / timeLimit;
  const timerColor = pct > 0.5 ? 'text-emerald-400' : pct > 0.25 ? 'text-amber-400' : 'text-red-400';
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SiteHeader theme="dark" active="games" />
      <main className="flex-1 px-3 py-4 max-w-6xl mx-auto w-full">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate">{puzzle.title}</h1>
            <p className="text-xs text-gray-500">{puzzle.size}×{puzzle.size} · {puzzle.words.length} words · {difficulty}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`font-mono text-xl font-bold ${timerColor}`}>
              {mins}:{String(secs).padStart(2, '0')}
            </span>
            <span className="text-xs text-gray-400 whitespace-nowrap">{foundWords.size}/{puzzle.words.length}</span>
          </div>
        </div>

        {!started && (
          <div className="mb-2 text-xs text-cyan-400 text-center animate-pulse">
            Drag across letters to find words
          </div>
        )}

        {/* Main layout — grid stacks above word list on mobile */}
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-6 lg:items-start">
          {/* Grid — full width on mobile, natural size on desktop */}
          <div className="w-full lg:flex-shrink-0 lg:w-auto">
            <WordGrid
              puzzle={puzzle}
              foundWords={foundWords}
              revealedCells={revealedCells}
              onSelect={handleSelect}
            />
          </div>

          {/* Word list */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Words to Find</h2>
            {/* Two-column grid on mobile so all words fit without excessive scrolling */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-1 max-h-[50vh] lg:max-h-[600px] overflow-y-auto pr-1">
              {puzzle.words.map(({ word, clue }) => {
                const found = foundWords.has(word);
                return (
                  <div
                    key={word}
                    className={`rounded-lg px-2.5 py-1.5 flex items-start gap-2 transition-colors ${
                      found ? 'bg-emerald-900/40 border border-emerald-700/30' : 'bg-gray-900 border border-gray-800'
                    }`}
                  >
                    <span className={`font-mono text-xs font-bold pt-0.5 shrink-0 ${found ? 'text-emerald-400 line-through' : 'text-cyan-400'}`}>
                      {word}
                    </span>
                    <span className="text-xs text-gray-500 leading-relaxed line-clamp-2">{clue}</span>
                    {!found && (
                      <button
                        onClick={() => revealWord(word)}
                        className="ml-auto shrink-0 text-[10px] text-gray-600 hover:text-amber-400 transition-colors"
                        title="Reveal this word"
                      >
                        reveal
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleExpire}
              className="mt-3 w-full text-xs text-gray-600 hover:text-gray-400 py-2 border border-gray-800 rounded-lg transition-colors"
            >
              Give Up
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score / leaderboard screen
// ---------------------------------------------------------------------------

function ScoreScreen({
  score, wordsFound, totalWords, timeSec, difficulty, bandIds,
  onPlayAgain,
}: {
  score: number; wordsFound: number; totalWords: number; timeSec: number;
  difficulty: Difficulty; bandIds: string[];
  onPlayAgain: () => void;
}) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [lbDiff, setLbDiff] = useState<Difficulty>(difficulty);

  const { data: lb = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ['ws-leaderboard', lbDiff],
    queryFn: () => api.get(`/api/word-search/scores?difficulty=${lbDiff}&limit=15`),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!user || saved) return;
    api.post('/api/word-search/scores', { score, wordsFound, totalWords, timeSec, difficulty, bandIds })
      .then((r: unknown) => {
        const res = r as { rank?: number };
        if (res.rank) setRank(res.rank);
        setSaved(true);
      })
      .catch(() => { /* score save failure is non-fatal */ });
  }, [user, saved, score, wordsFound, totalWords, timeSec, difficulty, bandIds]);

  const mins = Math.floor(timeSec / 60);
  const secs = timeSec % 60;
  const complete = wordsFound === totalWords;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SiteHeader theme="dark" active="games" />
      <main className="flex-1 px-4 py-12 max-w-2xl mx-auto w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">{complete ? '🎉' : '🔍'}</div>
          <h1 className="text-3xl font-bold">{complete ? 'Puzzle Complete!' : 'Time\'s Up'}</h1>
          {rank && <p className="text-cyan-400 mt-1 text-sm font-medium">You ranked #{rank} on {difficulty}!</p>}
          {!user && <p className="text-gray-500 mt-1 text-sm">Sign in to save your score.</p>}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Score', value: score.toLocaleString() },
            { label: 'Words Found', value: `${wordsFound}/${totalWords}` },
            { label: 'Time', value: `${mins}:${String(secs).padStart(2,'0')}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
              <div className="text-2xl font-bold text-cyan-400">{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold">Leaderboard</h2>
            <div className="flex gap-1">
              {(Object.keys(DIFF_LABELS) as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setLbDiff(d)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    lbDiff === d ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {DIFF_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
          {lb.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">No scores yet</p>
          ) : (
            <div className="space-y-1">
              {lb.map((entry) => (
                <div key={entry.rank} className="flex items-center gap-3 py-1.5 border-b border-gray-800 last:border-0">
                  <span className="w-6 text-right text-xs text-gray-500 shrink-0">#{entry.rank}</span>
                  <span className="text-sm font-medium flex-1 truncate">{entry.playerName}</span>
                  <span className="text-xs text-gray-500">{entry.wordsFound}/{entry.totalWords}</span>
                  <span className="text-sm font-bold text-cyan-400 w-16 text-right">{entry.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={onPlayAgain}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Play Again
          </button>
          <Link
            to="/games"
            className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            All Games
          </Link>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function WordSearchPage() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [puzzle, setPuzzle] = useState<WordSearchData | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [finalWordsFound, setFinalWordsFound] = useState(0);
  const [finalTimeSec, setFinalTimeSec] = useState(0);

  const { data: bands = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['bands'],
    queryFn: () => api.get('/api/bands'),
    staleTime: 300_000,
  });

  async function generate() {
    setPhase('loading');
    try {
      const data = await api.post('/api/word-search/generate', { bandIds: selectedBandIds, difficulty }) as WordSearchData;
      setPuzzle(data);
      setPhase('play');
    } catch {
      setPhase('setup');
      alert('Failed to generate puzzle. Please try again.');
    }
  }

  function handleFinish(score: number, wordsFound: number, timeSec: number) {
    setFinalScore(score);
    setFinalWordsFound(wordsFound);
    setFinalTimeSec(timeSec);
    setPhase('over');
  }

  if (phase === 'setup' || phase === 'loading') {
    return (
      <SetupScreen
        bands={bands}
        selectedBandIds={selectedBandIds}
        setSelectedBandIds={setSelectedBandIds}
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        onGenerate={generate}
        loading={phase === 'loading'}
      />
    );
  }

  if (phase === 'play' && puzzle) {
    return (
      <PlayScreen
        puzzle={puzzle}
        difficulty={difficulty}
        onFinish={handleFinish}
      />
    );
  }

  if (phase === 'over' && puzzle) {
    return (
      <ScoreScreen
        score={finalScore}
        wordsFound={finalWordsFound}
        totalWords={puzzle.words.length}
        timeSec={finalTimeSec}
        difficulty={difficulty}
        bandIds={selectedBandIds}
        onPlayAgain={() => setPhase('setup')}
      />
    );
  }

  return null;
}

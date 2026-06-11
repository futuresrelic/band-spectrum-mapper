/**
 * AdminCrosswordPage — generate AI-powered crossword puzzles, preview them,
 * download as PNG, and schedule as daily puzzles.
 * Route: /admin/crossword-builder
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

// ---------------------------------------------------------------------------
// Types (mirror the API)
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
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

const DIFF_LABELS: Record<Difficulty, string> = {
  easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert',
};

// ---------------------------------------------------------------------------
// Crossword grid preview (read-only, shows answer letters)
// ---------------------------------------------------------------------------

const CELL_PX = 28;

function CrosswordPreview({ puzzle }: { puzzle: CrosswordData }) {
  const { size, cells } = puzzle;
  return (
    <div className="overflow-x-auto">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${size}, ${CELL_PX}px)`,
          gap: '2px',
          width: `${size * (CELL_PX + 2)}px`,
        }}
      >
        {cells.map((row, r) =>
          row.map((cell, c) => {
            if (cell.letter === null) {
              return <div key={`${r}-${c}`} style={{ width: CELL_PX, height: CELL_PX }} className="bg-gray-900" />;
            }
            return (
              <div
                key={`${r}-${c}`}
                style={{ width: CELL_PX, height: CELL_PX }}
                className="bg-white border border-gray-300 relative flex items-center justify-center"
              >
                {cell.number !== null && (
                  <span className="absolute top-0 left-0.5 text-[7px] leading-none text-gray-500 font-medium">
                    {cell.number}
                  </span>
                )}
                <span className="text-[11px] font-bold text-gray-800">{cell.letter}</span>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PNG download (blank puzzle grid — shareable challenge image)
// ---------------------------------------------------------------------------

function downloadPNG(puzzle: CrosswordData, title: string) {
  const CANVAS_W = 1080;
  const CANVAS_H = 1080;
  const PADDING  = 60;
  const TITLE_H  = 80;
  const FOOTER_H = 50;
  const usable   = CANVAS_W - PADDING * 2;
  const cell     = Math.floor(Math.min(usable, CANVAS_H - PADDING * 2 - TITLE_H - FOOTER_H) / puzzle.size);
  const gridW    = cell * puzzle.size;
  const gridX    = Math.floor((CANVAS_W - gridW) / 2);
  const gridY    = PADDING + TITLE_H;

  const canvas  = document.createElement('canvas');
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx     = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font      = 'bold 38px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, CANVAS_W / 2, PADDING + 44);

  // Grid
  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      const x   = gridX + c * cell;
      const y   = gridY + r * cell;
      const cel = puzzle.cells[r]?.[c];

      if (!cel || cel.letter === null) {
        ctx.fillStyle = '#111827';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.strokeStyle = '#9CA3AF';
        ctx.lineWidth   = 0.5;
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);

        if (cel.number !== null) {
          ctx.fillStyle  = '#374151';
          ctx.font       = `bold ${Math.max(8, Math.floor(cell * 0.27))}px system-ui, sans-serif`;
          ctx.textAlign  = 'left';
          ctx.fillText(String(cel.number), x + 3, y + Math.floor(cell * 0.38));
        }
      }
    }
  }

  // Footer branding
  ctx.fillStyle = '#6B7280';
  ctx.font      = '18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Band Spectrum Mapper · Daily Challenge', CANVAS_W / 2, gridY + gridW + 40);

  const link    = document.createElement('a');
  link.download = `bsm-crossword-${new Date().toISOString().slice(0, 10)}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminCrosswordPage() {
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [difficulty, setDifficulty]           = useState<Difficulty>('medium');
  const [customTitle, setCustomTitle]         = useState('');
  const [puzzle, setPuzzle]                   = useState<CrosswordData | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [savedDate, setSavedDate]             = useState('');
  const [saveMsg, setSaveMsg]                 = useState('');
  const [savingDaily, setSavingDaily]         = useState(false);

  const { data: bands = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['bands'],
    queryFn: () => api.get('/api/bands'),
    staleTime: 300_000,
  });

  // Default save date = today
  const today = new Date().toISOString().slice(0, 10);

  function toggleBand(id: string) {
    setSelectedBandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function generate() {
    if (selectedBandIds.length === 0) { setError('Select at least one band.'); return; }
    setError('');
    setLoading(true);
    setPuzzle(null);
    try {
      const data = await api.post('/api/crossword/generate', {
        bandIds: selectedBandIds,
        difficulty,
      }) as CrosswordData;
      setPuzzle(data);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Generation failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function saveAsDaily() {
    if (!puzzle) return;
    setSavingDaily(true);
    setSaveMsg('');
    try {
      const title = customTitle.trim() || puzzle.title;
      const date  = savedDate || today;
      await api.post('/api/crossword/daily', { puzzleData: puzzle, date, title });
      setSaveMsg(`Saved as daily for ${date}!`);
    } catch (e: unknown) {
      setSaveMsg((e as { message?: string })?.message ?? 'Save failed.');
    } finally {
      setSavingDaily(false);
    }
  }

  const puzzleTitle = customTitle.trim() || puzzle?.title || 'BSM Crossword';

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-bold text-surface-900 mb-1">Crossword Builder</h1>
      <p className="text-sm text-surface-500 mb-6">
        Generate AI-powered crossword puzzles from your band library. Preview, download, and schedule as a daily.
      </p>

      {/* Config panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Band selector */}
        <div className="bg-white border border-surface-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-surface-700 mb-3">Bands</h2>
          <div className="flex flex-wrap gap-2">
            {bands.map((b) => {
              const sel = selectedBandIds.includes(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => toggleBand(b.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    sel
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-surface-50 border-surface-200 text-surface-600 hover:border-surface-400'
                  }`}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
          {selectedBandIds.length === 0 && (
            <p className="text-xs text-amber-600 mt-2">Select at least one band.</p>
          )}
        </div>

        {/* Settings */}
        <div className="bg-white border border-surface-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-surface-700 mb-2">Difficulty</h2>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(DIFF_LABELS) as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    difficulty === d
                      ? 'bg-indigo-600 border-transparent text-white'
                      : 'bg-surface-50 border-surface-200 text-surface-600 hover:border-surface-400'
                  }`}
                >
                  {DIFF_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-surface-700 block mb-1">Custom Title</label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={puzzle?.title ?? 'e.g. Today\'s TOOL Crossword'}
              className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          <button
            onClick={generate}
            disabled={selectedBandIds.length === 0 || loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {loading ? '⚙️ Generating…' : '✦ Generate Puzzle'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>

      {/* Puzzle preview */}
      {puzzle && (
        <div className="bg-white border border-surface-200 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-base font-bold text-surface-900">{puzzleTitle}</h2>
              <p className="text-xs text-surface-500">
                {puzzle.size}×{puzzle.size} · {puzzle.acrossClues.length + puzzle.downClues.length} clues · {puzzle.difficulty}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => downloadPNG(puzzle, puzzleTitle)}
                className="bg-surface-900 hover:bg-surface-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                ↓ Download PNG
              </button>
              <button
                onClick={generate}
                className="bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-surface-300"
              >
                ↻ Regenerate
              </button>
            </div>
          </div>

          {/* Grid + Clues layout */}
          <div className="flex gap-6 flex-wrap">
            <CrosswordPreview puzzle={puzzle} />

            <div className="flex gap-6 flex-1 min-w-0">
              {/* Across clues */}
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-surface-700 uppercase tracking-wider mb-2">Across</h3>
                <div className="space-y-1 text-xs text-surface-700 max-h-80 overflow-y-auto">
                  {puzzle.acrossClues.map((clue) => (
                    <div key={clue.number} className="flex gap-1.5">
                      <span className="font-bold shrink-0 text-surface-400">{clue.number}.</span>
                      <span>{clue.clue}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Down clues */}
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-surface-700 uppercase tracking-wider mb-2">Down</h3>
                <div className="space-y-1 text-xs text-surface-700 max-h-80 overflow-y-auto">
                  {puzzle.downClues.map((clue) => (
                    <div key={clue.number} className="flex gap-1.5">
                      <span className="font-bold shrink-0 text-surface-400">{clue.number}.</span>
                      <span>{clue.clue}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Schedule as daily */}
          <div className="mt-6 border-t border-surface-100 pt-5">
            <h3 className="text-sm font-semibold text-surface-700 mb-3">Schedule as Daily Puzzle</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="date"
                value={savedDate || today}
                onChange={(e) => setSavedDate(e.target.value)}
                className="border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
              <button
                onClick={saveAsDaily}
                disabled={savingDaily}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {savingDaily ? 'Saving…' : 'Set as Daily →'}
              </button>
              {saveMsg && (
                <span className={`text-sm font-medium ${saveMsg.includes('Saved') ? 'text-emerald-600' : 'text-red-600'}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hint block */}
      {!puzzle && !loading && (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-8 text-center text-surface-500">
          <div className="text-4xl mb-3">🧩</div>
          <p className="text-sm">
            Select bands and click <strong>Generate Puzzle</strong> to create a crossword from your music library.
          </p>
          <p className="text-xs mt-2 text-surface-400">
            The AI uses song titles, album names, themes, and lyrical concepts to build words and clues.
          </p>
        </div>
      )}
    </div>
  );
}

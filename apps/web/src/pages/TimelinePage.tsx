/**
 * Timeline Challenge — put albums in chronological order.
 * Route: /play/timeline
 *
 * Mechanics:
 *   - 5 random albums (from selected artists) are shown without years.
 *   - Click them in order from oldest to newest to set your ranking.
 *   - Submit → years are revealed; score based on positions correct.
 *   - Perfect order = 1000 pts. Each wrong position = −150 pts.
 */
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineItem {
  id:         string;
  title:      string;
  bandName:   string;
  artworkUrl: string | null;
  year:       number;
}

interface RoundData {
  items: TimelineItem[];
}

type Phase = 'setup' | 'playing' | 'result';

const WRONG_POSITION_PENALTY = 150;
const ROUND_BASE             = 1000;
const TOTAL_ROUNDS           = 5;

function calcRoundScore(items: TimelineItem[], order: string[]): number {
  const correct = items
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((item) => item.id);
  let score = ROUND_BASE;
  for (let i = 0; i < order.length; i++) {
    if (order[i] !== correct[i]) score -= WRONG_POSITION_PENALTY;
  }
  return Math.max(0, score);
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

function SetupScreen({
  bands, selectedBandIds, toggle, onStart, loading, error,
}: {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  toggle: (id: string) => void;
  onStart: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <div className="text-6xl mb-4">🗓️</div>
      <h1 className="text-3xl font-bold text-white mb-2">Timeline Challenge</h1>
      <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-md mx-auto">
        Five albums appear — no release years shown. Click them in order from oldest to newest.
        How well do you know your band's history?
      </p>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-5 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Select artists</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {bands.map((b) => {
            const checked = selectedBandIds.includes(b.id);
            return (
              <label key={b.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                ${checked ? 'bg-teal-600/30 border border-teal-500/50' : 'bg-white/5 border border-white/10 hover:border-white/20'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(b.id)} className="accent-teal-500" />
                <span className={`text-sm ${checked ? 'text-white' : 'text-white/50'}`}>{b.name}</span>
              </label>
            );
          })}
        </div>
        {selectedBandIds.length === 0 && (
          <p className="text-xs text-amber-400/70 mt-3">Pick at least one artist</p>
        )}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 text-left text-xs text-white/40 space-y-1.5">
        <div className="font-semibold text-white/60 mb-2">Scoring</div>
        <div>· Perfect order → <span className="text-white">{ROUND_BASE} pts per round</span></div>
        <div>· Each album in wrong position → <span className="text-rose-400">−{WRONG_POSITION_PENALTY} pts</span></div>
        <div>· {TOTAL_ROUNDS} rounds total · max {ROUND_BASE * TOTAL_ROUNDS} pts</div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-900/40 border border-red-500/30 text-sm text-red-300">{error}</div>
      )}

      <button
        className="w-full py-3.5 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors"
        onClick={onStart}
        disabled={selectedBandIds.length === 0 || loading}
      >
        {loading ? 'Loading…' : 'Start Game →'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Album card
// ---------------------------------------------------------------------------

function AlbumCard({
  item, position, onClick, revealed, correct,
}: {
  item: TimelineItem;
  position: number | null;
  onClick: () => void;
  revealed: boolean;
  correct: boolean | null; // null = not yet evaluated
}) {
  const hasPos = position !== null;

  let borderColor = 'border-white/10';
  if (hasPos && !revealed)            borderColor = 'border-teal-500/60';
  if (revealed && correct === true)   borderColor = 'border-green-500/70';
  if (revealed && correct === false)  borderColor = 'border-red-500/50';

  return (
    <button
      onClick={onClick}
      disabled={revealed}
      className={`relative w-full bg-white/5 border rounded-xl p-4 text-left transition-all group
        ${borderColor}
        ${!revealed && !hasPos ? 'hover:border-teal-400/40 hover:bg-white/10 cursor-pointer' : ''}
        ${!revealed && hasPos  ? 'cursor-pointer hover:bg-white/10' : ''}
        ${revealed             ? 'cursor-default' : ''}`}
    >
      {/* Position badge */}
      {hasPos && (
        <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black
          ${revealed && correct ? 'bg-green-600' : revealed ? 'bg-red-700' : 'bg-teal-600'}`}>
          {position + 1}
        </div>
      )}

      {/* Artwork thumbnail */}
      {item.artworkUrl ? (
        <img src={item.artworkUrl} alt="" className="w-10 h-10 rounded object-cover mb-3" />
      ) : (
        <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center text-white/20 text-xl mb-3">♪</div>
      )}

      <div className="text-sm font-semibold text-white truncate pr-6">{item.title}</div>
      <div className="text-xs text-white/40 mt-0.5">{item.bandName}</div>

      {/* Year reveal */}
      {revealed && (
        <div className={`text-xs font-bold mt-2 ${correct ? 'text-green-400' : 'text-rose-400'}`}>
          {item.year}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TimelinePage() {
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [phase, setPhase]   = useState<Phase>('setup');
  const [round, setRound]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [items, setItems]         = useState<TimelineItem[]>([]);
  const [order, setOrder]         = useState<string[]>([]); // album IDs in click order
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [revealed, setRevealed]   = useState(false);

  const { data: scopes } = useQuery({
    queryKey: ['timeline-scopes'],
    queryFn:  () => api.get<{ bands: { id: string; name: string }[] }>('/api/public/graph/scopes'),
  });
  const bands = scopes?.bands ?? [];

  const toggle = useCallback((id: string) => {
    setSelectedBandIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }, []);

  async function loadRound() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<RoundData>(
        `/api/timeline/round?bandIds=${selectedBandIds.join(',')}&count=5`,
      );
      setItems(data.items);
      setOrder([]);
      setRevealed(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load round.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    setRound(0);
    setRoundScores([]);
    setPhase('playing');
    await loadRound();
  }

  function handleCardClick(id: string) {
    if (revealed) return;
    if (order.includes(id)) {
      // Deselect: remove it and all items ranked after it
      const idx = order.indexOf(id);
      setOrder(order.slice(0, idx));
    } else {
      setOrder([...order, id]);
    }
  }

  function handleSubmit() {
    setRevealed(true);
    const score = calcRoundScore(items, order);
    setRoundScores((prev) => [...prev, score]);
  }

  async function handleNext() {
    const nextRound = round + 1;
    if (nextRound >= TOTAL_ROUNDS) {
      setPhase('result');
    } else {
      setRound(nextRound);
      await loadRound();
    }
  }

  function handleRestart() {
    setPhase('setup');
    setRoundScores([]);
    setRound(0);
    setItems([]);
    setOrder([]);
  }

  // Compute correctness per item when revealed
  const correctOrder = revealed
    ? items.slice().sort((a, b) => a.year - b.year).map((i) => i.id)
    : [];

  const totalScore = roundScores.reduce((s, x) => s + x, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      {/* Top bar */}
      <div className="border-b border-white/10 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/games" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Games</Link>
          <span className="text-white/20">·</span>
          <h1 className="text-sm font-semibold text-white/80">Timeline Challenge</h1>
          {phase === 'playing' && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-xs text-teal-400">Round {round + 1}/{TOTAL_ROUNDS}</span>
            </>
          )}
        </div>
        {phase === 'playing' && (
          <span className="text-xs text-white/40 tabular-nums">
            {totalScore.toLocaleString()} pts
          </span>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Setup */}
        {phase === 'setup' && (
          <SetupScreen
            bands={bands} selectedBandIds={selectedBandIds} toggle={toggle}
            onStart={handleStart} loading={loading} error={error}
          />
        )}

        {/* Result summary */}
        {phase === 'result' && (
          <div className="max-w-md mx-auto text-center py-10 px-4">
            <div className="text-5xl mb-4">📅</div>
            <h2 className="text-2xl font-bold text-white mb-1">Timeline Complete!</h2>
            <p className="text-white/40 text-sm mb-6">
              {totalScore >= ROUND_BASE * TOTAL_ROUNDS * 0.8 ? 'Excellent — you really know your music history!' : 'Keep practising — the years will come to you.'}
            </p>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
              <div className="text-xs text-white/30 uppercase tracking-wider mb-1">Total Score</div>
              <div className="text-6xl font-black text-teal-400 font-mono">{totalScore.toLocaleString()}</div>
              <div className="text-xs text-white/30 mt-1">{TOTAL_ROUNDS} rounds · max {ROUND_BASE * TOTAL_ROUNDS}</div>
            </div>
            <div className="space-y-2 mb-6">
              {roundScores.map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                  <span className="text-xs text-white/40">Round {i + 1}</span>
                  <span className={`text-sm font-bold font-mono ${s === ROUND_BASE ? 'text-green-400' : s >= 700 ? 'text-teal-400' : 'text-white/50'}`}>{s}</span>
                </div>
              ))}
            </div>
            <button
              className="w-full py-3 bg-teal-700 hover:bg-teal-600 text-white font-bold text-sm rounded-xl transition-colors"
              onClick={handleRestart}
            >
              Play Again →
            </button>
          </div>
        )}

        {/* Playing */}
        {phase === 'playing' && (
          loading ? (
            <div className="flex justify-center items-center py-24 gap-2">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Progress */}
              <div className="flex gap-1.5">
                {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    i < round ? 'bg-teal-500' : i === round ? 'bg-teal-400/60' : 'bg-white/10'
                  }`} />
                ))}
              </div>

              {/* Instruction */}
              <div className="text-center">
                <p className="text-white/60 text-sm">
                  {!revealed
                    ? `Click albums in order — oldest (1) to newest (${items.length})`
                    : `Revealed! ${calcRoundScore(items, order) === ROUND_BASE ? '🎉 Perfect order!' : `${calcRoundScore(items, order)} pts this round`}`}
                </p>
                {!revealed && order.length > 0 && (
                  <p className="text-xs text-white/30 mt-1">Click a ranked album again to unselect it from that position onward</p>
                )}
              </div>

              {/* Album grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {items.map((item) => {
                  const posIdx = order.indexOf(item.id);
                  const position = posIdx >= 0 ? posIdx : null;
                  const correctIdx = correctOrder.indexOf(item.id);
                  const isCorrect = revealed ? (posIdx === correctIdx) : null;
                  return (
                    <AlbumCard
                      key={item.id}
                      item={item}
                      position={position}
                      onClick={() => handleCardClick(item.id)}
                      revealed={revealed}
                      correct={isCorrect}
                    />
                  );
                })}
              </div>

              {/* Correct order (shown after submit) */}
              {revealed && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">Correct order</div>
                  <div className="flex flex-wrap gap-2">
                    {correctOrder.map((id, i) => {
                      const item = items.find((x) => x.id === id)!;
                      return (
                        <span key={id} className="text-xs px-2.5 py-1 bg-white/10 rounded-full text-white/70">
                          {i + 1}. {item.title} <span className="text-teal-400">({item.year})</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3">
                {!revealed ? (
                  <>
                    <button
                      onClick={() => setOrder([])}
                      className="px-4 py-2 text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={order.length < items.length}
                      className="px-6 py-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors"
                    >
                      Submit Order →
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleNext}
                    className="px-6 py-2 bg-teal-700 hover:bg-teal-600 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    {round + 1 < TOTAL_ROUNDS ? 'Next Round →' : 'See Results →'}
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

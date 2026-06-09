/**
 * Lyric Dissection — "Name That Song" word-reveal game.
 * Route: /play/lyric-dissection
 *
 * Mechanics:
 *   - One lyric word revealed at a time (first word shown automatically).
 *   - Click "Next word →" for more hints (costs −80 pts per word).
 *   - Click a song title from the pool to guess (wrong guess = −200 pts).
 *   - Game is 5 rounds; total score across all rounds is your final score.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SongEntry { id: string; title: string; bandName: string }

interface RoundData {
  songId:   string;
  title:    string;
  bandName: string;
  words:    string[];
  songPool: SongEntry[];
}

type RoundPhase = 'playing' | 'correct' | 'failed';

interface RoundResult {
  songId:      string;
  title:       string;
  bandName:    string;
  wordsUsed:   number;
  wrongCount:  number;
  roundScore:  number;
  solved:      boolean;
}

const TOTAL_ROUNDS    = 5;
const WRONG_PENALTY   = 200;
const WORD_PENALTY    = 80;
const BASE_SCORE      = 1000;

function calcRoundScore(wordsUsed: number, wrongCount: number): number {
  return Math.max(0, BASE_SCORE - (wordsUsed - 1) * WORD_PENALTY - wrongCount * WRONG_PENALTY);
}

// ---------------------------------------------------------------------------
// Band setup (shared pattern with other games)
// ---------------------------------------------------------------------------

interface SetupProps {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  toggle: (id: string) => void;
  onStart: () => void;
  loading: boolean;
}

function SetupScreen({ bands, selectedBandIds, toggle, onStart, loading }: SetupProps) {
  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <div className="text-6xl mb-4">🎵</div>
      <h1 className="text-3xl font-bold text-white mb-2">Lyric Dissection</h1>
      <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-md mx-auto">
        A word from a song's lyrics appears. Guess the song — or reveal more words for clues.
        Fewer words needed = higher score.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Select artists</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {bands.map((b) => {
            const checked = selectedBandIds.includes(b.id);
            return (
              <label key={b.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                ${checked ? 'bg-indigo-600/30 border border-indigo-500/50' : 'bg-white/5 border border-white/10 hover:border-white/20'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(b.id)} className="accent-indigo-500" />
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
        <div className="font-semibold text-white/60 mb-2">How to score</div>
        <div>· Guess on word 1 → <span className="text-white">{BASE_SCORE} pts</span></div>
        <div>· Each extra word revealed → <span className="text-rose-400">−{WORD_PENALTY} pts</span></div>
        <div>· Each wrong guess → <span className="text-rose-400">−{WRONG_PENALTY} pts</span></div>
        <div>· {TOTAL_ROUNDS} rounds total</div>
      </div>
      <button
        className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors"
        onClick={onStart}
        disabled={selectedBandIds.length === 0 || loading}
      >
        {loading ? 'Loading…' : 'Start Game →'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word reveal display
// ---------------------------------------------------------------------------

function WordReveal({ words, revealed }: { words: string[]; revealed: number }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center py-4">
      {words.slice(0, revealed).map((w, i) => (
        <span key={i} className="px-3 py-1.5 bg-amber-900/40 border border-amber-500/40 rounded-lg text-amber-200 font-bold text-sm uppercase tracking-widest">
          {w}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Song pool grid
// ---------------------------------------------------------------------------

function SongPool({
  pool, wrongIds, correctId, solved, onGuess,
}: {
  pool: SongEntry[];
  wrongIds: Set<string>;
  correctId: string;
  solved: boolean;
  onGuess: (s: SongEntry) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {pool.map((s) => {
        const isWrong   = wrongIds.has(s.id);
        const isCorrect = s.id === correctId;
        const isRevealed = solved || isWrong;

        let cls = 'bg-white/5 border border-white/10 hover:bg-amber-600/20 hover:border-amber-500/50 cursor-pointer';
        if (isWrong)             cls = 'bg-red-900/30 border border-red-500/40 cursor-not-allowed';
        if (isCorrect && solved) cls = 'bg-green-800/40 border border-green-400/60';

        return (
          <button
            key={s.id}
            disabled={isWrong || solved}
            onClick={() => onGuess(s)}
            className={`text-left px-3 py-2.5 rounded-xl transition-all ${cls}`}
          >
            <div className={`text-xs font-semibold truncate ${isWrong ? 'text-red-400 line-through' : isCorrect && isRevealed ? 'text-green-300' : 'text-white/80'}`}>
              {s.title}
            </div>
            <div className="text-[10px] text-white/30 truncate mt-0.5">{s.bandName}</div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary screen
// ---------------------------------------------------------------------------

function SummaryScreen({ results, onRestart }: { results: RoundResult[]; onRestart: () => void }) {
  const total = results.reduce((sum, r) => sum + r.roundScore, 0);
  const perfect = results.filter((r) => r.wordsUsed === 1 && r.wrongCount === 0).length;

  return (
    <div className="max-w-md mx-auto text-center py-10 px-4">
      <div className="text-5xl mb-4">🏆</div>
      <h2 className="text-2xl font-bold text-white mb-1">Game Over!</h2>
      <p className="text-white/40 text-sm mb-6">{perfect > 0 ? `${perfect} perfect round${perfect > 1 ? 's' : ''}! ` : ''}Try to beat your score next time.</p>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
        <div className="text-xs text-white/30 uppercase tracking-wider mb-1">Total Score</div>
        <div className="text-6xl font-black text-amber-400 font-mono">{total.toLocaleString()}</div>
        <div className="text-xs text-white/30 mt-1">{TOTAL_ROUNDS} rounds · max {BASE_SCORE * TOTAL_ROUNDS}</div>
      </div>

      <div className="space-y-2 mb-6">
        {results.map((r, i) => (
          <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
            <span className="text-white/30 font-mono text-xs w-4">{i + 1}</span>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-semibold text-white truncate">{r.title}</div>
              <div className="text-[10px] text-white/30">{r.bandName} · {r.wordsUsed} word{r.wordsUsed !== 1 ? 's' : ''}{r.wrongCount > 0 ? ` · ${r.wrongCount} wrong` : ''}</div>
            </div>
            <span className={`text-sm font-bold font-mono tabular-nums ${r.roundScore >= 800 ? 'text-green-400' : r.roundScore >= 500 ? 'text-amber-400' : 'text-white/50'}`}>
              {r.roundScore}
            </span>
          </div>
        ))}
      </div>

      <button
        className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm rounded-xl transition-colors"
        onClick={onRestart}
      >
        Play Again →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LyricDissectionPage() {
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [phase, setPhase]     = useState<'setup' | 'playing' | 'summary'>('setup');
  const [round, setRound]     = useState(0); // 0-based index
  const [results, setResults] = useState<RoundResult[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Active round state
  const [roundData, setRoundData]     = useState<RoundData | null>(null);
  const [revealed, setRevealed]       = useState(1);
  const [wrongIds, setWrongIds]       = useState<Set<string>>(new Set());
  const [roundPhase, setRoundPhase]   = useState<RoundPhase>('playing');

  // Timer
  const [elapsed, setElapsed]  = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);
  useEffect(() => () => stopTimer(), [stopTimer]);

  const { data: scopes } = useQuery({
    queryKey: ['lyric-dissection-scopes'],
    queryFn:  () => api.get<{ bands: { id: string; name: string }[] }>('/api/public/graph/scopes'),
  });
  const bands = scopes?.bands ?? [];

  const toggle = useCallback((id: string) => {
    setSelectedBandIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }, []);

  async function fetchRound() {
    setFetching(true);
    setFetchError(null);
    try {
      const data = await api.get<RoundData>(
        `/api/lyric-dissection/round?bandIds=${selectedBandIds.join(',')}&poolSize=12`,
      );
      setRoundData(data);
      setRevealed(1);
      setWrongIds(new Set());
      setRoundPhase('playing');
      startTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load round — make sure selected artists have lyrics.';
      setFetchError(msg);
    } finally {
      setFetching(false);
    }
  }

  async function handleStart() {
    setResults([]);
    setRound(0);
    setPhase('playing');
    await fetchRound();
  }

  function handleGuess(song: SongEntry) {
    if (!roundData || roundPhase !== 'playing') return;
    if (song.id === roundData.songId) {
      stopTimer();
      setRoundPhase('correct');
    } else {
      const next = new Set(wrongIds);
      next.add(song.id);
      setWrongIds(next);
      // Force reveal next word on wrong guess
      if (revealed < roundData.words.length) {
        setRevealed((r) => r + 1);
      } else {
        // No more words — reveal answer
        stopTimer();
        setRoundPhase('failed');
      }
    }
  }

  function handleNextWord() {
    if (!roundData) return;
    if (revealed >= roundData.words.length) return;
    setRevealed((r) => r + 1);
  }

  function handleNextRound() {
    if (!roundData) return;
    const score = roundPhase === 'correct'
      ? calcRoundScore(revealed, wrongIds.size)
      : 0;
    const result: RoundResult = {
      songId:     roundData.songId,
      title:      roundData.title,
      bandName:   roundData.bandName,
      wordsUsed:  revealed,
      wrongCount: wrongIds.size,
      roundScore: score,
      solved:     roundPhase === 'correct',
    };
    const nextResults = [...results, result];
    setResults(nextResults);
    const nextRound = round + 1;
    if (nextRound >= TOTAL_ROUNDS) {
      setPhase('summary');
      setRoundData(null);
    } else {
      setRound(nextRound);
      void fetchRound();
    }
  }

  function handleRestart() {
    setPhase('setup');
    setResults([]);
    setRound(0);
    setRoundData(null);
    stopTimer();
  }

  const wordsRemaining = roundData ? roundData.words.length - revealed : 0;
  const canReveal      = roundPhase === 'playing' && wordsRemaining > 0;
  const currentScore   = roundPhase === 'correct' ? calcRoundScore(revealed, wrongIds.size) : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      {/* Top bar */}
      <div className="border-b border-white/10 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/games" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Games</Link>
          <span className="text-white/20">·</span>
          <h1 className="text-sm font-semibold text-white/80">Lyric Dissection</h1>
          {phase === 'playing' && roundData && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-xs text-amber-400">Round {round + 1}/{TOTAL_ROUNDS}</span>
            </>
          )}
        </div>
        {phase === 'playing' && (
          <div className="flex items-center gap-4 text-xs">
            <span className="text-white/40 font-mono">{String(Math.floor(elapsed / 60)).padStart(2,'0')}:{String(elapsed % 60).padStart(2,'0')}</span>
            <span className="text-white/40">{results.reduce((s, r) => s + r.roundScore, 0).toLocaleString()} pts</span>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Setup */}
        {phase === 'setup' && (
          <>
            {fetchError && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-900/40 border border-red-500/30 text-sm text-red-300 max-w-lg mx-auto">
                {fetchError}
              </div>
            )}
            <SetupScreen bands={bands} selectedBandIds={selectedBandIds} toggle={toggle} onStart={handleStart} loading={fetching} />
          </>
        )}

        {/* Summary */}
        {phase === 'summary' && (
          <SummaryScreen results={results} onRestart={handleRestart} />
        )}

        {/* Playing */}
        {phase === 'playing' && (
          fetching ? (
            <div className="flex justify-center items-center py-24 gap-2">
              {[0,1,2].map((i) => (
                <div key={i} className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          ) : roundData ? (
            <div className="space-y-5">
              {/* Progress bar */}
              <div className="flex gap-1.5">
                {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    i < round ? 'bg-amber-500' : i === round ? 'bg-amber-400/60' : 'bg-white/10'
                  }`} />
                ))}
              </div>

              {/* Word reveal */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
                  {revealed === 1 ? 'First word from the lyrics:' : `${revealed} words revealed:`}
                </div>
                <WordReveal words={roundData.words} revealed={revealed} />

                {roundPhase === 'playing' && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                    <div className="text-xs text-white/30">
                      {wordsRemaining > 0 ? `${wordsRemaining} word${wordsRemaining !== 1 ? 's' : ''} remaining` : 'All words revealed'}
                    </div>
                    <button
                      onClick={handleNextWord}
                      disabled={!canReveal}
                      className="px-4 py-1.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-xs font-semibold text-white rounded-lg transition-colors"
                    >
                      Next word → <span className="text-white/40">−{WORD_PENALTY} pts</span>
                    </button>
                  </div>
                )}

                {roundPhase === 'correct' && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                    <div className="text-sm text-green-400 font-semibold">✓ Correct! +{currentScore} pts</div>
                    <button
                      onClick={handleNextRound}
                      className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      {round + 1 < TOTAL_ROUNDS ? 'Next Round →' : 'See Results →'}
                    </button>
                  </div>
                )}

                {roundPhase === 'failed' && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                    <div className="text-sm text-rose-400 font-semibold">
                      It was: <span className="text-white">{roundData.title}</span>
                    </div>
                    <button
                      onClick={handleNextRound}
                      className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      {round + 1 < TOTAL_ROUNDS ? 'Next Round →' : 'See Results →'}
                    </button>
                  </div>
                )}
              </div>

              {/* Song pool */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">
                  {roundPhase === 'playing'
                    ? wrongIds.size > 0 ? `Guess the song — ${wrongIds.size} wrong so far` : 'Guess the song'
                    : roundPhase === 'correct' ? '✓ Identified' : 'Song pool'}
                </div>
                <SongPool
                  pool={roundData.songPool}
                  wrongIds={wrongIds}
                  correctId={roundData.songId}
                  solved={roundPhase !== 'playing'}
                  onGuess={handleGuess}
                />
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

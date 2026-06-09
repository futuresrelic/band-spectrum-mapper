/**
 * Spectrum Guesser — identify a band from their 6-axis radar profile.
 * Route: /play/spectrum-guesser
 *
 * Each round: a radar chart of a band's average scores appears with no name.
 * Pick the correct band from 4 options. 5 rounds, scored on speed.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Band { id: string; name: string; _count?: { songs: number } }

interface BandAverage {
  bandId: string;
  name: string;
  songCount: number;
  averages: {
    aggression: number; complexity: number; atmosphere: number;
    emotion: number; psychedelic: number; concept: number;
  } | null;
}

interface Round {
  correct: BandAverage;
  options: string[]; // shuffled band names
}

const AXES = ['aggression','complexity','atmosphere','emotion','psychedelic','concept'] as const;
const AXIS_LABELS: Record<string, string> = {
  aggression: 'Aggression', complexity: 'Complexity', atmosphere: 'Atmosphere',
  emotion: 'Emotion', psychedelic: 'Psychedelic', concept: 'Concept',
};
const ROUNDS = 5;
const MAX_ROUND_SCORE = 1000;
const ROUND_TIME = 20; // seconds per round

// ---------------------------------------------------------------------------
// Mini radar (no legend, no tooltip — keeps the band anonymous)
// ---------------------------------------------------------------------------

function GameRadar({ averages }: { averages: BandAverage['averages'] }) {
  if (!averages) return null;
  const data = AXES.map((ax) => ({
    axis: AXIS_LABELS[ax] ?? ax,
    value: averages[ax],
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <Radar name="band" dataKey="value" stroke="#818cf8" fill="#818cf8" fillOpacity={0.35} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Shuffle helper
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

function SetupScreen({ bands, onStart }: { bands: Band[]; onStart: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const eligible = bands.filter((b) => (b._count?.songs ?? 0) >= 3);

  function toggle(id: string) {
    setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <div className="text-6xl mb-4">📡</div>
      <h1 className="text-3xl font-bold text-white mb-2">Spectrum Guesser</h1>
      <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-md mx-auto">
        A radar chart of a band's psychological profile appears with no name.
        Identify the band from their sonic fingerprint. 5 rounds, 20 seconds each.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-5 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Include bands</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
          {eligible.map((b) => {
            const checked = sel.includes(b.id);
            return (
              <label key={b.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                ${checked ? 'bg-indigo-600/30 border border-indigo-500/50' : 'bg-white/5 border border-white/10 hover:border-white/20'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(b.id)} className="accent-indigo-500" />
                <span className={`text-sm truncate ${checked ? 'text-white' : 'text-white/50'}`}>{b.name}</span>
              </label>
            );
          })}
        </div>
        {sel.length < 4 && <p className="text-xs text-amber-400/70 mt-3">Select at least 4 bands</p>}
      </div>
      <button
        className="w-full py-3.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors"
        onClick={() => onStart(sel)}
        disabled={sel.length < 4}
      >
        Start →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SpectrumGuesserPage() {
  const [phase, setPhase]       = useState<'setup' | 'loading' | 'playing' | 'summary'>('setup');
  const [bandPool, setBandPool] = useState<string[]>([]);
  const [round, setRound]       = useState<Round | null>(null);
  const [roundNum, setRoundNum] = useState(0);
  const [scores, setScores]     = useState<number[]>([]);
  const [picked, setPicked]     = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const timerRef                = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundStartRef           = useRef<number>(Date.now());

  // Load all bands
  const { data: bandsData } = useQuery({
    queryKey: ['spectrum-guesser-bands'],
    queryFn: () => api.get<Band[]>('/api/public/bands'),
  });

  const bands = bandsData ?? [];

  // Fetch averages for 4 random bands from the pool
  const loadRound = useCallback(async (pool: string[]) => {
    if (pool.length < 4) return;
    setPhase('loading');
    const picked4 = shuffle(pool).slice(0, 4);
    const data: BandAverage[] = await api.get(
      `/api/public/spectrum/band-averages?bandIds=${picked4.join(',')}`,
    );
    // Filter to those that have actual averages (scored songs)
    const valid = data.filter((b) => b.averages !== null);
    if (valid.length < 2) {
      // Not enough scored bands — try again with different random 4
      loadRound(pool);
      return;
    }
    const correctIdx = Math.floor(Math.random() * valid.length);
    const correct = valid[correctIdx]!;
    const options = shuffle(valid.map((b) => b.name));
    setRound({ correct, options });
    setPicked(null);
    setTimeLeft(ROUND_TIME);
    roundStartRef.current = Date.now();
    setPhase('playing');
  }, []);

  // Timer countdown
  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          if (!picked) {
            setPicked('__timeout__');
            setScores((s) => [...s, 0]);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase, picked]);

  function handleGuess(name: string) {
    if (picked || !round) return;
    clearInterval(timerRef.current!);
    const elapsed = (Date.now() - roundStartRef.current) / 1000;
    const isCorrect = name === round.correct.name;
    const pts = isCorrect ? Math.max(100, Math.round(MAX_ROUND_SCORE - elapsed * (MAX_ROUND_SCORE / ROUND_TIME))) : 0;
    setPicked(name);
    setScores((s) => [...s, pts]);
  }

  function nextRound() {
    const next = roundNum + 1;
    if (next >= ROUNDS) {
      setPhase('summary');
      return;
    }
    setRoundNum(next);
    loadRound(bandPool);
  }

  function startGame(ids: string[]) {
    setBandPool(ids);
    setRoundNum(0);
    setScores([]);
    loadRound(ids);
  }

  const totalScore = scores.reduce((s, v) => s + v, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <div className="border-b border-white/10 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/games" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Games</Link>
          <span className="text-white/20">·</span>
          <h1 className="text-sm font-semibold text-white/80">Spectrum Guesser</h1>
        </div>
        {phase === 'playing' && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/40 text-xs">Round {roundNum + 1}/{ROUNDS}</span>
            <span className={`font-bold tabular-nums ${timeLeft <= 5 ? 'text-red-400' : 'text-white/70'}`}>{timeLeft}s</span>
            <span className="text-indigo-400 font-bold tabular-nums">{totalScore.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-6">

        {/* Setup */}
        {phase === 'setup' && (
          <SetupScreen bands={bands} onStart={startGame} />
        )}

        {/* Loading */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/30 text-sm">Loading round…</p>
          </div>
        )}

        {/* Playing */}
        {phase === 'playing' && round && (
          <div className="space-y-5">
            {/* Round indicator */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {Array.from({ length: ROUNDS }).map((_, i) => (
                  <div key={i} className={`h-1.5 w-8 rounded-full ${i < roundNum ? 'bg-indigo-500' : i === roundNum ? 'bg-indigo-400' : 'bg-white/10'}`} />
                ))}
              </div>
              <div className={`text-xs font-mono ${timeLeft <= 5 ? 'text-red-400 font-bold' : 'text-white/30'}`}>
                {timeLeft}s
              </div>
            </div>

            {/* Radar chart */}
            <div className="bg-gray-900 rounded-2xl p-4 border border-white/10">
              <p className="text-xs text-white/30 text-center mb-2 uppercase tracking-widest">Whose profile is this?</p>
              <GameRadar averages={round.correct.averages} />
            </div>

            {/* Options */}
            <div className="grid grid-cols-2 gap-3">
              {round.options.map((name) => {
                const isCorrect = name === round.correct.name;
                const isSelected = picked === name;
                let cls = 'bg-gray-900 border border-white/10 hover:border-white/30 text-white/80 hover:text-white';
                if (picked) {
                  if (isCorrect) cls = 'bg-green-900/60 border border-green-500/60 text-green-200';
                  else if (isSelected) cls = 'bg-red-900/60 border border-red-500/60 text-red-200';
                  else cls = 'bg-gray-900 border border-white/5 text-white/30';
                }
                return (
                  <button
                    key={name}
                    onClick={() => handleGuess(name)}
                    disabled={!!picked}
                    className={`rounded-xl px-4 py-3.5 text-sm font-semibold text-center transition-all ${cls}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>

            {/* Feedback */}
            {picked && (
              <div className="text-center space-y-3">
                {picked === round.correct.name ? (
                  <p className="text-green-400 font-bold">+{scores[scores.length - 1]!.toLocaleString()} pts</p>
                ) : picked === '__timeout__' ? (
                  <p className="text-amber-400 text-sm">Time's up! The answer was <span className="text-white font-bold">{round.correct.name}</span></p>
                ) : (
                  <p className="text-red-400 text-sm">Wrong — it was <span className="text-white font-bold">{round.correct.name}</span></p>
                )}
                <button
                  onClick={nextRound}
                  className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-sm rounded-xl transition-colors"
                >
                  {roundNum + 1 >= ROUNDS ? 'See Results →' : 'Next Round →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {phase === 'summary' && (
          <div className="max-w-md mx-auto text-center py-10 space-y-6">
            <div className="text-6xl">{totalScore >= 3000 ? '🏆' : totalScore >= 1500 ? '🥈' : '🎸'}</div>
            <h2 className="text-3xl font-bold text-white">{totalScore.toLocaleString()}</h2>
            <p className="text-white/50 text-sm">Total score across {ROUNDS} rounds</p>
            <div className="space-y-2">
              {scores.map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-900 rounded-xl px-4 py-2.5">
                  <span className="text-white/40 text-sm">Round {i + 1}</span>
                  <span className={`font-bold tabular-nums ${s > 0 ? 'text-indigo-400' : 'text-white/20'}`}>{s > 0 ? `+${s.toLocaleString()}` : '—'}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setPhase('setup'); setScores([]); setRoundNum(0); }}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                Change Bands
              </button>
              <button
                onClick={() => { setRoundNum(0); setScores([]); loadRound(bandPool); }}
                className="flex-1 py-3 bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-sm rounded-xl transition-colors"
              >
                Play Again →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

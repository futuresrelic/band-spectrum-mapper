/**
 * Lyric Match — connect lyric snippets to their song titles.
 * Route: /play/lyric-match
 *
 * 5 lyric fragments on the left; 5 shuffled titles on the right.
 * Click a snippet then its matching title to connect them.
 * Score: 800 base per pair – 200 per wrong attempt – time penalty.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Band { id: string; name: string; _count?: { songs: number } }

interface Pair {
  songId: string;
  title: string;
  snippet: string;
}

interface RoundData { pairs: Pair[] }

const PAIR_BASE = 800;
const WRONG_PENALTY = 200;
const TIME_PENALTY = 2; // pts per second
const ROUNDS = 5;
const PAIR_COUNT = 5;

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

function SetupScreen({ bands, onStart }: { bands: Band[]; onStart: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const eligible = bands.filter((b) => (b._count?.songs ?? 0) >= 5);

  function toggle(id: string) {
    setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }
  function selectAll() { setSel(eligible.map((b) => b.id)); }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <div className="text-6xl mb-4">🧩</div>
      <h1 className="text-3xl font-bold text-white mb-2">Lyric Match</h1>
      <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-md mx-auto">
        Lyric fragments on the left, song titles on the right. Connect each lyric
        to its song as fast as possible. {ROUNDS} rounds of {PAIR_COUNT} pairs.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-5 text-left">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/40">Select artists</div>
          <button onClick={selectAll} className="text-xs text-amber-400/70 hover:text-amber-400">Select all</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
          {eligible.map((b) => {
            const checked = sel.includes(b.id);
            return (
              <label key={b.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                ${checked ? 'bg-amber-600/30 border border-amber-500/50' : 'bg-white/5 border border-white/10 hover:border-white/20'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(b.id)} className="accent-amber-500" />
                <span className={`text-sm truncate ${checked ? 'text-white' : 'text-white/50'}`}>{b.name}</span>
              </label>
            );
          })}
        </div>
        {sel.length === 0 && (
          <p className="text-xs text-white/30 mt-3">Leave empty to pull from all bands</p>
        )}
      </div>
      <button
        className="w-full py-3.5 bg-amber-700 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-colors"
        onClick={() => onStart(sel)}
      >
        Start →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type ConnectionState = { [snippetIdx: number]: number }; // snippetIdx → titleIdx

export default function LyricMatchPage() {
  const [phase, setPhase]         = useState<'setup' | 'loading' | 'playing' | 'result' | 'summary'>('setup');
  const [bandIds, setBandIds]     = useState<string[]>([]);
  const [pairs, setPairs]         = useState<Pair[]>([]);
  const [titleOrder, setTitleOrder] = useState<number[]>([]); // shuffled indices into pairs[]
  const [connections, setConnections] = useState<ConnectionState>({});
  const [selected, setSelected]   = useState<{ side: 'snippet' | 'title'; idx: number } | null>(null);
  const [wrong, setWrong]         = useState<{ snippet: number; title: number } | null>(null);
  const [wrongCounts, setWrongCounts] = useState<{ [snippetIdx: number]: number }>({});
  const [roundNum, setRoundNum]   = useState(0);
  const [roundScores, setRoundScores] = useState<number[]>([]);
  const [elapsed, setElapsed]     = useState(0);
  const startRef                  = useRef<number>(Date.now());
  const timerRef                  = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: bandsData } = useQuery({
    queryKey: ['lyric-match-bands'],
    queryFn: () => api.get<Band[]>('/api/public/bands'),
  });
  const bands = bandsData ?? [];

  const loadRound = useCallback(async (ids: string[]) => {
    setPhase('loading');
    const qp = ids.length ? `&bandIds=${ids.join(',')}` : '';
    try {
      const data: RoundData = await api.get(`/api/public/lyric-match/round?count=${PAIR_COUNT}${qp}`);
      const shuffled = [...data.pairs.keys()].sort(() => Math.random() - 0.5);
      setPairs(data.pairs);
      setTitleOrder(shuffled);
      setConnections({});
      setSelected(null);
      setWrong(null);
      setWrongCounts({});
      setElapsed(0);
      startRef.current = Date.now();
      setPhase('playing');
    } catch {
      setPhase('setup');
    }
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (phase !== 'playing') return;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 500);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  // Check round complete
  useEffect(() => {
    if (phase !== 'playing') return;
    if (Object.keys(connections).length === pairs.length && pairs.length > 0) {
      clearInterval(timerRef.current!);
      const totalElapsed = Math.floor((Date.now() - startRef.current) / 1000);
      // Score: sum of per-pair scores
      let roundScore = 0;
      for (let i = 0; i < pairs.length; i++) {
        const wrongs = wrongCounts[i] ?? 0;
        const base = Math.max(0, PAIR_BASE - wrongs * WRONG_PENALTY);
        roundScore += Math.max(0, base - Math.floor(totalElapsed * TIME_PENALTY));
      }
      setRoundScores((rs) => [...rs, Math.round(roundScore)]);
      setPhase('result');
    }
  }, [connections, pairs.length, phase, wrongCounts]);

  function handleSnippetClick(idx: number) {
    if (connections[idx] !== undefined) return; // already connected
    setWrong(null);
    if (selected?.side === 'snippet' && selected.idx === idx) {
      setSelected(null); return;
    }
    if (selected?.side === 'title') {
      // Attempt connection: snippet idx → title position selected.idx
      const titleIdx = titleOrder[selected.idx]!;
      if (titleIdx === idx) {
        setConnections((c) => ({ ...c, [idx]: selected.idx }));
        setSelected(null);
      } else {
        setWrong({ snippet: idx, title: selected.idx });
        setWrongCounts((wc) => ({ ...wc, [idx]: (wc[idx] ?? 0) + 1 }));
        setTimeout(() => setWrong(null), 600);
        setSelected(null);
      }
      return;
    }
    setSelected({ side: 'snippet', idx });
  }

  function handleTitleClick(pos: number) {
    const titleIdx = titleOrder[pos]!;
    const alreadyConnected = Object.values(connections).includes(pos);
    if (alreadyConnected) return;
    setWrong(null);
    if (selected?.side === 'title' && selected.idx === pos) {
      setSelected(null); return;
    }
    if (selected?.side === 'snippet') {
      const snippetIdx = selected.idx;
      if (titleIdx === snippetIdx) {
        setConnections((c) => ({ ...c, [snippetIdx]: pos }));
        setSelected(null);
      } else {
        setWrong({ snippet: snippetIdx, title: pos });
        setWrongCounts((wc) => ({ ...wc, [snippetIdx]: (wc[snippetIdx] ?? 0) + 1 }));
        setTimeout(() => setWrong(null), 600);
        setSelected(null);
      }
      return;
    }
    setSelected({ side: 'title', idx: pos });
  }

  function nextRound() {
    const next = roundNum + 1;
    if (next >= ROUNDS) {
      setPhase('summary');
      return;
    }
    setRoundNum(next);
    loadRound(bandIds);
  }

  function startGame(ids: string[]) {
    setBandIds(ids);
    setRoundNum(0);
    setRoundScores([]);
    loadRound(ids);
  }

  const totalScore = roundScores.reduce((s, v) => s + v, 0);

  // Color helpers
  const ACCENT = 'amber';
  function snippetCls(idx: number): string {
    const isConnected = connections[idx] !== undefined;
    const isSelected = selected?.side === 'snippet' && selected.idx === idx;
    const isWrong = wrong?.snippet === idx;
    if (isConnected) return 'bg-green-900/40 border-green-600/50 text-green-200 cursor-default';
    if (isWrong)    return 'bg-red-900/50 border-red-500/60 text-red-200 cursor-pointer';
    if (isSelected) return `bg-${ACCENT}-700/40 border-${ACCENT}-500 text-white cursor-pointer`;
    return 'bg-gray-900 border-white/10 hover:border-white/30 text-white/80 hover:text-white cursor-pointer';
  }
  function titleCls(pos: number): string {
    const isConnected = Object.values(connections).includes(pos);
    const isSelected = selected?.side === 'title' && selected.idx === pos;
    const isWrong = wrong?.title === pos;
    if (isConnected) return 'bg-green-900/40 border-green-600/50 text-green-200 cursor-default';
    if (isWrong)     return 'bg-red-900/50 border-red-500/60 text-red-200 cursor-pointer';
    if (isSelected)  return `bg-${ACCENT}-700/40 border-${ACCENT}-500 text-white cursor-pointer`;
    return 'bg-gray-900 border-white/10 hover:border-white/30 text-white/80 hover:text-white cursor-pointer';
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <div className="border-b border-white/10 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/games" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Games</Link>
          <span className="text-white/20">·</span>
          <h1 className="text-sm font-semibold text-white/80">Lyric Match</h1>
        </div>
        {(phase === 'playing' || phase === 'result') && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/40 text-xs">Round {roundNum + 1}/{ROUNDS}</span>
            <span className="text-amber-400 font-bold tabular-nums">{totalScore.toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">

        {phase === 'setup' && <SetupScreen bands={bands} onStart={startGame} />}

        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white/30 text-sm">Loading round…</p>
          </div>
        )}

        {phase === 'playing' && (
          <div className="space-y-5">
            {/* Progress + timer */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {Array.from({ length: ROUNDS }).map((_, i) => (
                  <div key={i} className={`h-1.5 w-8 rounded-full ${i < roundNum ? 'bg-amber-500' : i === roundNum ? 'bg-amber-400' : 'bg-white/10'}`} />
                ))}
              </div>
              <span className="text-white/30 text-xs font-mono">{elapsed}s</span>
            </div>

            <p className="text-xs text-white/30 text-center">
              {selected
                ? selected.side === 'snippet'
                  ? 'Now click the matching song title →'
                  : '← Now click the matching lyric snippet'
                : 'Click a lyric snippet, then its song title'}
            </p>

            {/* Two-column grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Snippets */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-white/20 text-center mb-1">Lyric</div>
                {pairs.map((p, i) => (
                  <button
                    key={p.songId}
                    onClick={() => handleSnippetClick(i)}
                    className={`w-full text-left rounded-xl border px-3 py-3 text-xs leading-relaxed transition-all ${snippetCls(i)}`}
                  >
                    <span className="italic opacity-80">"{p.snippet}"</span>
                    {connections[i] !== undefined && <span className="block text-green-400 text-[10px] mt-1 not-italic">✓ matched</span>}
                  </button>
                ))}
              </div>

              {/* Titles (shuffled) */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-white/20 text-center mb-1">Song</div>
                {titleOrder.map((realIdx, pos) => (
                  <button
                    key={realIdx}
                    onClick={() => handleTitleClick(pos)}
                    className={`w-full text-left rounded-xl border px-3 py-3 text-xs font-semibold transition-all ${titleCls(pos)}`}
                  >
                    {pairs[realIdx]?.title ?? ''}
                    {Object.values(connections).includes(pos) && <span className="block text-green-400 text-[10px] mt-1 font-normal">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === 'result' && (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Round {roundNum + 1} complete</p>
              <p className="text-2xl font-bold text-amber-400">+{roundScores[roundNum]?.toLocaleString() ?? 0}</p>
            </div>
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={p.songId} className="bg-gray-900 rounded-xl px-4 py-3 flex items-start gap-3">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{p.title}</p>
                    <p className="text-[11px] text-white/40 italic mt-0.5">"{p.snippet}"</p>
                    {(wrongCounts[i] ?? 0) > 0 && (
                      <p className="text-[10px] text-red-400/70 mt-0.5">{wrongCounts[i]} wrong guess{(wrongCounts[i] ?? 0) !== 1 ? 'es' : ''}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={nextRound}
              className="w-full py-3 bg-amber-700 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-colors"
            >
              {roundNum + 1 >= ROUNDS ? 'See Results →' : 'Next Round →'}
            </button>
          </div>
        )}

        {phase === 'summary' && (
          <div className="max-w-md mx-auto text-center py-10 space-y-6">
            <div className="text-6xl">{totalScore >= 15000 ? '🏆' : totalScore >= 8000 ? '🥈' : '🎵'}</div>
            <h2 className="text-3xl font-bold text-white">{totalScore.toLocaleString()}</h2>
            <p className="text-white/50 text-sm">Total score across {ROUNDS} rounds</p>
            <div className="space-y-2">
              {roundScores.map((s, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-900 rounded-xl px-4 py-2.5">
                  <span className="text-white/40 text-sm">Round {i + 1}</span>
                  <span className="text-amber-400 font-bold tabular-nums">+{s.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setPhase('setup'); setRoundScores([]); setRoundNum(0); }}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                Change Bands
              </button>
              <button
                onClick={() => { setRoundNum(0); setRoundScores([]); loadRound(bandIds); }}
                className="flex-1 py-3 bg-amber-700 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-colors"
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

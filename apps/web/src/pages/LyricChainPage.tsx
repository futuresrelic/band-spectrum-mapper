/**
 * LyricChainPage — word→song→word→song chain game.
 * Route: /play/lyric-chain
 * Auth: any logged-in user (score submission requires auth)
 */
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WordOption {
  word: string;
  songCount: number;
}

interface SongOption {
  id: string;
  title: string;
  bandName: string;
  albumId: string | null;
  albumTitle: string | null;
}

type ChainEntry =
  | { type: 'word'; value: string; songCount: number }
  | { type: 'song'; id: string; title: string; bandName: string; albumId: string | null; albumTitle: string | null };

type GamePhase = 'setup' | 'picking-word' | 'picking-song' | 'dead-end';

// ---------------------------------------------------------------------------
// Difficulty levels
// ---------------------------------------------------------------------------

type DifficultyId = 'super-easy' | 'easy' | 'medium' | 'hard' | 'very-hard';

interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  count: number;       // options shown per step (words AND songs)
  hardMode: boolean;   // album-restriction rule
  activeClass: string; // Tailwind classes when selected
  description: string;
}

const DIFFICULTIES: DifficultyConfig[] = [
  { id: 'super-easy', label: 'Super Easy', count: 6, hardMode: false, activeClass: 'bg-emerald-700 text-white', description: '6 options per step. Albums can repeat.' },
  { id: 'easy',       label: 'Easy',       count: 5, hardMode: false, activeClass: 'bg-blue-700   text-white', description: '5 options per step. Albums can repeat.' },
  { id: 'medium',     label: 'Medium',     count: 4, hardMode: false, activeClass: 'bg-indigo-600 text-white', description: '4 options per step. Albums can repeat.' },
  { id: 'hard',       label: 'Hard',       count: 3, hardMode: true,  activeClass: 'bg-orange-700 text-white', description: '3 options per step. No same-album songs.' },
  { id: 'very-hard',  label: 'Very Hard',  count: 2, hardMode: true,  activeClass: 'bg-rose-700   text-white', description: '2 options per step. No same-album songs.' },
];

interface LeaderboardEntry {
  rank: number;
  playerName: string;
  avatarUrl?: string;
  chainLength: number;
  hardMode: boolean;
  bandScope: string | null;
  bandScopeNames?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

interface SetupProps {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  toggleBand: (id: string) => void;
  difficulty: DifficultyId;
  setDifficulty: (d: DifficultyId) => void;
  onStart: () => void;
  starting: boolean;
  startError: string | null;
}

function SetupScreen({ bands, selectedBandIds, toggleBand, difficulty, setDifficulty, onStart, starting, startError }: SetupProps) {
  const canStart = selectedBandIds.length > 0;
  const activeDiff = DIFFICULTIES.find(d => d.id === difficulty) ?? DIFFICULTIES[2]!;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <div className="text-6xl mb-4">🔗</div>
      <h1 className="text-3xl font-bold text-white mb-2">Lyric Chain</h1>
      <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-md mx-auto">
        You start with a song. Pick a word from it, find a new song with that word, pick another word — keep going.
        Build the longest chain without repeating songs or words.
      </p>

      {/* Band picker */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-5 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Select artists</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {bands.map((b) => {
            const checked = selectedBandIds.includes(b.id);
            return (
              <label
                key={b.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                  ${checked ? 'bg-indigo-600/30 border border-indigo-500/50' : 'bg-white/5 border border-white/10 hover:border-white/20'}`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleBand(b.id)} className="accent-indigo-500" />
                <span className={`text-sm ${checked ? 'text-white' : 'text-white/50'}`}>{b.name}</span>
              </label>
            );
          })}
        </div>
        {selectedBandIds.length === 0 && (
          <p className="text-xs text-amber-400/70 mt-3">Pick at least one artist to play</p>
        )}
      </div>

      {/* Difficulty */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Difficulty</div>
        <div className="grid grid-cols-5 gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={`py-2.5 rounded-xl text-xs font-bold transition-colors ${
                difficulty === d.id
                  ? d.activeClass
                  : 'bg-white/5 text-white/40 hover:text-white/70 border border-white/10'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/30 mt-2 leading-snug">{activeDiff.description}</p>
      </div>

      {startError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-900/40 border border-red-500/30 text-sm text-red-300">
          {startError}
        </div>
      )}

      <button
        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors"
        onClick={onStart}
        disabled={!canStart || starting}
      >
        {starting ? 'Loading…' : 'Start Game →'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word picker
// ---------------------------------------------------------------------------

function WordPicker({ words, onPick, loading }: { words: WordOption[]; onPick: (w: WordOption) => void; loading: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">
        {loading ? 'Loading words…' : 'Pick a word'}
      </div>
      {loading ? (
        <div className="flex gap-1.5 justify-center py-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {words.map((w) => (
            <button
              key={w.word}
              onClick={() => onPick(w)}
              className="group flex flex-col items-center justify-center px-4 py-5 bg-white/5 hover:bg-indigo-600/30 border border-white/10 hover:border-indigo-500/60 rounded-2xl transition-all"
            >
              <span className="text-lg font-bold text-white uppercase tracking-widest group-hover:text-indigo-200 transition-colors">
                {w.word}
              </span>
              <span className="text-xs text-white/30 mt-1 group-hover:text-white/50 transition-colors">
                {w.songCount} song{w.songCount !== 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Song picker
// ---------------------------------------------------------------------------

function SongPicker({ songs, word, onPick, loading }: { songs: SongOption[]; word: string; onPick: (s: SongOption) => void; loading: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">
        {loading ? 'Loading songs…' : 'Pick a song containing'}
      </div>
      {!loading && (
        <div className="text-xl font-bold text-indigo-300 uppercase tracking-widest mb-4">{word}</div>
      )}
      {loading ? (
        <div className="flex gap-1.5 justify-center py-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {songs.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-indigo-600/20 border border-white/10 hover:border-indigo-500/50 rounded-xl transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-900/60 border border-indigo-500/30 flex items-center justify-center shrink-0 text-indigo-300 text-xs font-bold group-hover:border-indigo-500/70 transition-colors">
                ♪
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{s.title}</div>
                <div className="text-xs text-white/40 truncate">
                  {s.bandName}{s.albumTitle ? ` · ${s.albumTitle}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chain display (left panel)
// ---------------------------------------------------------------------------

function ChainDisplay({ chain }: { chain: ChainEntry[] }) {
  if (chain.length === 0) return null;

  return (
    <div className="space-y-1">
      {chain.map((entry, i) => (
        <div key={i}>
          {entry.type === 'word' ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-900/30 border border-indigo-500/30">
              <span className="text-xs text-indigo-400 shrink-0">WORD</span>
              <span className="text-sm font-bold text-white uppercase tracking-wider truncate">{entry.value}</span>
              <span className="text-xs text-white/30 ml-auto shrink-0">{entry.songCount}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 ml-4">
              <span className="text-indigo-400 shrink-0 text-xs">♪</span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white/90 truncate">{entry.title}</div>
                <div className="text-[10px] text-white/30 truncate">{entry.bandName}</div>
              </div>
            </div>
          )}
          {i < chain.length - 1 && (
            <div className="flex justify-center my-0.5">
              <span className="text-white/20 text-xs">↓</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dead end / score screen
// ---------------------------------------------------------------------------

interface ScoreScreenProps {
  chainLength: number;
  diffConfig: DifficultyConfig;
  chain: ChainEntry[];
  onSubmit: () => void;
  submitting: boolean;
  submitted: { chainLength: number; rank: number } | null;
  onRestart: () => void;
  isLoggedIn: boolean;
}

function ScoreScreen({ chainLength, diffConfig, chain, onSubmit, submitting, submitted, onRestart, isLoggedIn }: ScoreScreenProps) {
  const [showChain, setShowChain] = useState(false);

  return (
    <div className="text-center py-8 px-4 max-w-md mx-auto">
      <div className="text-5xl mb-3">⛓️</div>
      <h2 className="text-2xl font-bold text-white mb-1">Chain Complete!</h2>
      <p className="text-white/40 text-sm mb-6">
        {chainLength === 0 ? 'No chain built — try again!' : `You built a ${chainLength}-link chain on ${diffConfig.label}.`}
      </p>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
        <div className="text-xs uppercase tracking-wider text-white/30 mb-1">Chain Length</div>
        <div className="text-6xl font-black text-indigo-400 font-mono">{chainLength}</div>
        <div className={`text-xs mt-1 font-semibold ${diffConfig.activeClass} inline-block px-2 py-0.5 rounded`}>
          {diffConfig.label.toUpperCase()}
        </div>
      </div>

      {submitted ? (
        <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4 mb-5 text-sm">
          <div className="text-green-300 font-semibold mb-1">Score saved!</div>
          <div className="text-white/60">Rank #{submitted.rank} · {submitted.chainLength} links</div>
        </div>
      ) : isLoggedIn ? (
        <button
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors mb-3"
          onClick={onSubmit}
          disabled={submitting || chainLength === 0}
        >
          {submitting ? 'Saving…' : '🏆 Save to Leaderboard'}
        </button>
      ) : (
        <div className="text-sm text-white/30 mb-4">
          <a href="/api/auth/google" className="text-indigo-300 hover:underline">Sign in</a> to save your score
        </div>
      )}

      <button
        className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-xl transition-colors mb-4"
        onClick={onRestart}
      >
        Play again →
      </button>

      {chain.length > 0 && (
        <button
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
          onClick={() => setShowChain((v) => !v)}
        >
          {showChain ? '▲ Hide chain' : '▼ Show full chain'}
        </button>
      )}

      {showChain && (
        <div className="mt-4 text-left">
          <ChainDisplay chain={chain} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LyricChainPage() {
  const { user } = useAuth();

  // Setup state
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [difficulty, setDifficulty]           = useState<DifficultyId>('medium');
  const [starting, setStarting]               = useState(false);
  const [startError, setStartError]           = useState<string | null>(null);

  // Derived from difficulty
  const diffConfig = DIFFICULTIES.find(d => d.id === difficulty) ?? DIFFICULTIES[2]!;
  const optionCount = diffConfig.count;
  const hardMode    = diffConfig.hardMode;

  // Game state
  const [phase, setPhase]             = useState<GamePhase>('setup');
  const [wordOptions, setWordOptions] = useState<WordOption[]>([]);
  const [songOptions, setSongOptions] = useState<SongOption[]>([]);
  const [chain, setChain]             = useState<ChainEntry[]>([]);
  const [pendingWord, setPendingWord] = useState<WordOption | null>(null);
  const [loading, setLoading]         = useState(false);

  // Score state
  const [submitting, setSubmitting]     = useState(false);
  const [submitted, setSubmitted]       = useState<{ chainLength: number; rank: number } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [hardLeaderboard, setHardLeaderboard] = useState(false);

  // Left panel tab: 'chain' = history, 'used' = burned items
  const [leftTab, setLeftTab] = useState<'chain' | 'used'>('chain');

  // Helpers derived from chain
  const usedSongIds = chain.filter((e) => e.type === 'song').map((e) => (e as { type: 'song'; id: string }).id);
  const chainLength = usedSongIds.length;

  // Full song entries (for Used panel)
  const usedSongEntries = chain.filter((e) => e.type === 'song') as Extract<ChainEntry, { type: 'song' }>[];
  // Words used as links (excludes the first song — only explicit word choices)
  const usedWordValues  = chain.filter((e) => e.type === 'word').map((e) => (e as Extract<ChainEntry, { type: 'word' }>).value);

  // Band list
  const { data: scopes } = useQuery({
    queryKey: ['lyric-chain-scopes'],
    queryFn:  () => api.get<{ bands: { id: string; name: string }[] }>('/api/public/graph/scopes'),
  });

  const { data: leaderboard, refetch: refetchLeaderboard } = useQuery({
    queryKey: ['lyric-chain-leaderboard', hardLeaderboard],
    queryFn:  () => api.get<LeaderboardEntry[]>(`/api/lyric-chain/scores?limit=15&hardMode=${hardLeaderboard}`),
    enabled:  showLeaderboard,
  });

  const toggleBand = useCallback((id: string) => {
    setSelectedBandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  // ---------------------------------------------------------------------------
  // Game actions
  // ---------------------------------------------------------------------------

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      const data = await api.get<{ seed: SongOption; words: WordOption[] }>(
        `/api/lyric-chain/start-song?bandIds=${selectedBandIds.join(',')}&count=${optionCount}`,
      );
      const seedEntry: ChainEntry = {
        type: 'song',
        id: data.seed.id,
        title: data.seed.title,
        bandName: data.seed.bandName,
        albumId: data.seed.albumId,
        albumTitle: data.seed.albumTitle,
      };
      setChain([seedEntry]);
      setWordOptions(data.words);
      setPendingWord(null);
      setSubmitted(null);
      setPhase('picking-word');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start game — make sure selected bands have lyrics.';
      setStartError(msg);
    } finally {
      setStarting(false);
    }
  }

  async function handlePickWord(w: WordOption) {
    setPendingWord(w);
    setLoading(true);
    setPhase('picking-song');
    setSongOptions([]);
    try {
      // Hard mode: only exclude the album of the immediately previous song.
      // Past albums are reusable — the restriction is only one step deep.
      const lastSong = chain.filter((e) => e.type === 'song').slice(-1)[0] as { type: 'song'; albumId: string | null } | undefined;
      const blockedAlbums = hardMode && lastSong?.albumId ? [lastSong.albumId] : [];
      const data = await api.post<{ songs: SongOption[] }>('/api/lyric-chain/songs', {
        word: w.word, bandIds: selectedBandIds,
        usedSongIds, hardMode, usedAlbumIds: blockedAlbums,
        count: optionCount,
      });
      setSongOptions(data.songs);
    } finally {
      setLoading(false);
    }
  }

  async function handlePickSong(s: SongOption) {
    // Append word + song to chain
    const newChain: ChainEntry[] = [
      ...chain,
      { type: 'word', value: pendingWord!.word, songCount: pendingWord!.songCount },
      { type: 'song', id: s.id, title: s.title, bandName: s.bandName, albumId: s.albumId, albumTitle: s.albumTitle },
    ];
    setChain(newChain);

    // Compute updated used lists from new chain
    const newUsedSongIds = newChain.filter((e) => e.type === 'song').map((e) => (e as { type: 'song'; id: string }).id);
    const newUsedWords   = newChain.filter((e) => e.type === 'word').map((e) => (e as { type: 'word'; value: string }).value);

    setLoading(true);
    setPhase('picking-word');
    setWordOptions([]);
    try {
      // Hard mode: the NEXT song must not be from the album of the song just picked (s).
      // We do not accumulate album history — only the immediately prior song is blocked.
      const blockedAlbums = hardMode && s.albumId ? [s.albumId] : [];
      const data = await api.post<{ words: WordOption[] }>('/api/lyric-chain/next-words', {
        songId: s.id, bandIds: selectedBandIds,
        usedWords: newUsedWords, usedSongIds: newUsedSongIds,
        hardMode, usedAlbumIds: blockedAlbums, count: optionCount,
      });
      if (data.words.length === 0) {
        setPhase('dead-end');
      } else {
        setWordOptions(data.words);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitScore() {
    if (!user) return;
    setSubmitting(true);
    try {
      const result = await api.post<{ chainLength: number; rank: number }>('/api/lyric-chain/scores', {
        chainLength,
        chainJson: JSON.stringify(chain),
        bandIds: selectedBandIds,
        hardMode: diffConfig.hardMode,
      });
      setSubmitted(result);
      void refetchLeaderboard();
    } catch {
      // score saving is optional
    } finally {
      setSubmitting(false);
    }
  }

  function handleRestart() {
    setPhase('setup');
    setChain([]);
    setWordOptions([]);
    setSongOptions([]);
    setPendingWord(null);
    setSubmitted(null);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const bands = scopes?.bands ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      {/* Top bar */}
      <div className="border-b border-white/10 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/games" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Games</Link>
          <span className="text-white/20">·</span>
          <h1 className="text-sm font-semibold text-white/80">Lyric Chain</h1>
          {phase !== 'setup' && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-xs text-indigo-400">{chainLength} link{chainLength !== 1 ? 's' : ''}</span>
              <span className={`text-xs font-semibold ${diffConfig.activeClass} px-1.5 py-0.5 rounded`}>
                {diffConfig.label}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {phase !== 'setup' && (
            <button
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
              onClick={handleRestart}
            >
              ↩ Restart
            </button>
          )}
          <button
            className={`text-xs transition-colors ${showLeaderboard ? 'text-indigo-300' : 'text-white/40 hover:text-white/70'}`}
            onClick={() => setShowLeaderboard((v) => !v)}
          >
            🏆 Scores
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">

        {/* Leaderboard (collapsible) */}
        {showLeaderboard && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold text-white">🏆 Leaderboard — Longest Chains</div>
              <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
                <button
                  className={`px-3 py-1 transition-colors ${!hardLeaderboard ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white/70'}`}
                  onClick={() => setHardLeaderboard(false)}
                >Normal</button>
                <button
                  className={`px-3 py-1 transition-colors ${hardLeaderboard ? 'bg-rose-700 text-white' : 'text-white/40 hover:text-white/70'}`}
                  onClick={() => setHardLeaderboard(true)}
                >Hard</button>
              </div>
            </div>
            {!leaderboard ? (
              <div className="text-xs text-white/40">Loading…</div>
            ) : leaderboard.length === 0 ? (
              <div className="text-xs text-white/40">No scores yet — be the first!</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/30 text-left">
                    <th className="pr-3 pb-2 font-medium">#</th>
                    <th className="pr-3 pb-2 font-medium">Player</th>
                    <th className="pr-3 pb-2 font-medium">Artists</th>
                    <th className="pr-3 pb-2 font-medium text-right">Links</th>
                    <th className="pb-2 font-medium text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((e) => (
                    <tr key={e.rank} className="border-t border-white/5">
                      <td className="pr-3 py-1.5 text-white/30 font-mono">{e.rank}</td>
                      <td className="pr-3 py-1.5 text-white font-medium">{e.playerName}</td>
                      <td className="pr-3 py-1.5 text-white/40 max-w-[160px] truncate">{e.bandScopeNames ?? '—'}</td>
                      <td className="pr-3 py-1.5 text-indigo-300 font-bold font-mono text-right">{e.chainLength}</td>
                      <td className="py-1.5 text-white/30 text-right">{new Date(e.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Setup */}
        {phase === 'setup' && (
          <SetupScreen
            bands={bands}
            selectedBandIds={selectedBandIds}
            toggleBand={toggleBand}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onStart={handleStart}
            starting={starting}
            startError={startError}
          />
        )}

        {/* Score screen */}
        {phase === 'dead-end' && (
          <ScoreScreen
            chainLength={chainLength}
            diffConfig={diffConfig}
            chain={chain}
            onSubmit={handleSubmitScore}
            submitting={submitting}
            submitted={submitted}
            onRestart={handleRestart}
            isLoggedIn={!!user}
          />
        )}

        {/* Active game */}
        {(phase === 'picking-word' || phase === 'picking-song') && (
          <div className="flex flex-col lg:flex-row gap-5">

            {/* Left panel: Chain history / Used items */}
            <aside className="w-full lg:w-64 lg:shrink-0">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 sticky top-4">

                {/* Tab row */}
                <div className="flex gap-1 mb-3">
                  <button
                    onClick={() => setLeftTab('chain')}
                    className={`flex-1 text-xs py-1 rounded-lg font-semibold transition-colors ${
                      leftTab === 'chain'
                        ? 'bg-indigo-600/40 border border-indigo-500/40 text-indigo-300'
                        : 'text-white/30 hover:text-white/60'
                    }`}
                  >
                    Chain · {chainLength}
                  </button>
                  <button
                    onClick={() => setLeftTab('used')}
                    className={`flex-1 text-xs py-1 rounded-lg font-semibold transition-colors ${
                      leftTab === 'used'
                        ? 'bg-rose-700/40 border border-rose-500/40 text-rose-300'
                        : 'text-white/30 hover:text-white/60'
                    }`}
                  >
                    Used · {usedWordValues.length + usedSongEntries.length}
                  </button>
                </div>

                {leftTab === 'chain' ? (
                  /* ── Chain history ── */
                  chain.length === 0 ? (
                    <p className="text-xs text-white/20 italic">Your chain will appear here as you play…</p>
                  ) : (
                    <div className="max-h-[480px] overflow-y-auto pr-1">
                      <ChainDisplay chain={chain} />
                    </div>
                  )
                ) : (
                  /* ── Used (burned) items ── */
                  <div className="max-h-[480px] overflow-y-auto pr-1 space-y-4">

                    {/* Burned words */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-rose-400/60 mb-2">
                        Words burned · {usedWordValues.length}
                      </div>
                      {usedWordValues.length === 0 ? (
                        <p className="text-xs text-white/20 italic">None yet — pick your first word</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {usedWordValues.map((w) => (
                            <span
                              key={w}
                              className="text-xs px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/20 text-white/30 line-through decoration-rose-500/40"
                            >
                              {w}
                            </span>
                          ))}
                        </div>
                      )}
                      {usedWordValues.length > 0 && (
                        <p className="text-[10px] text-white/20 mt-2 leading-snug">
                          These words cannot appear again as chain links in this session.
                        </p>
                      )}
                    </div>

                    {/* Played songs */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-rose-400/60 mb-2">
                        Songs played · {usedSongEntries.length}
                      </div>
                      {usedSongEntries.length === 0 ? (
                        <p className="text-xs text-white/20 italic">No songs played yet</p>
                      ) : (
                        <div className="space-y-1">
                          {usedSongEntries.map((s, i) => (
                            <div
                              key={`${s.id}-${i}`}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/10"
                            >
                              <span className="text-rose-500/40 text-xs shrink-0">✕</span>
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-white/30 line-through decoration-rose-500/30 truncate">
                                  {s.title}
                                </div>
                                <div className="text-[10px] text-white/20 truncate">{s.bandName}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {usedSongEntries.length > 0 && (
                        <p className="text-[10px] text-white/20 mt-2 leading-snug">
                          These songs are eliminated — they won't appear in future song picks.
                        </p>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </aside>

            {/* Choice panel (center) */}
            <main className="flex-1 min-w-0">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                {phase === 'picking-word' && (
                  <WordPicker words={wordOptions} onPick={handlePickWord} loading={loading} />
                )}
                {phase === 'picking-song' && pendingWord && (
                  <SongPicker songs={songOptions} word={pendingWord.word} onPick={handlePickSong} loading={loading} />
                )}
              </div>

              {/* Instructions */}
              <div className="mt-4 flex gap-6 text-xs text-white/25">
                <span>Start with a <span className="text-indigo-300">song</span></span>
                <span>→</span>
                <span>Pick a <span className="text-indigo-300">word</span> from it</span>
                <span>→</span>
                <span>Pick a <span className="text-indigo-300">song</span> containing that word</span>
                <span>→</span>
                <span>Repeat until dead end</span>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

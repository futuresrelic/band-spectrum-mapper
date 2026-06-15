import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuizEntry {
  id: string;
  score: number;
  level: number;
  duration: number;
  createdAt: string;
  user: { id: string; name: string | null; username: string | null; avatarUrl: string | null };
}

interface WordHuntEntry {
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  word: string;
  score: number;
  attempts: number;
  wrongCount: number;
  timeSec: number;
  createdAt: string;
}

interface LyricChainEntry {
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  chainLength: number;
  hardMode: boolean;
  bandScopeNames: string | null;
  createdAt: string;
}

interface Band2048Entry {
  id: string;
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  score: number;
  topLevel: number;
  winLevel: number;
  won: boolean;
  createdAt: string;
}

interface VinylRunnerEntry {
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  score: number;
  level: number;
  recordsCollected: number;
  distancePx: number;
  createdAt: string;
}

type Tab = 'quiz' | 'wordhunt' | 'lyricchain' | 'band2048' | 'vinylrunner';

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) return <img src={url} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />;
  return (
    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400 font-bold flex-shrink-0">
      {(name ?? '?')[0]?.toUpperCase()}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const color =
    rank === 1 ? 'text-yellow-400' :
    rank === 2 ? 'text-gray-300'   :
    rank === 3 ? 'text-amber-600'  :
                 'text-gray-600';
  return <span className={`w-7 text-sm font-bold tabular-nums flex-shrink-0 ${color}`}>{rank}</span>;
}

function fmtTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function QuizTab() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['leaderboard-quiz'],
    queryFn: () => api.get<QuizEntry[]>('/api/game/leaderboard'),
  });

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white">Album Art Quiz</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Identify bands from their album covers. Score = correct answers × points + level bonus.
        </p>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-600 text-sm py-10">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-center text-gray-600 text-sm py-10">
          No scores yet —{' '}
          <Link to="/play" className="text-indigo-400 hover:underline">
            be the first
          </Link>
          !
        </p>
      ) : (
        <div className="divide-y divide-gray-800">
          {entries.map((e, i) => (
            <div key={e.id} className="flex items-center gap-3 px-5 py-3.5">
              <RankBadge rank={i + 1} />
              <Avatar name={e.user.name} url={e.user.avatarUrl} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{e.user.username ?? e.user.name ?? 'Player'}</p>
                <p className="text-xs text-gray-500">Level {e.level} · {fmtTime(e.duration)}</p>
              </div>
              <span className="text-sm font-bold text-indigo-400 tabular-nums">
                {e.score.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4 border-t border-gray-800">
        <Link
          to="/play"
          className="block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          Play Album Art Quiz →
        </Link>
      </div>
    </div>
  );
}

function WordHuntTab() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['leaderboard-wordhunt'],
    queryFn: () => api.get<WordHuntEntry[]>('/api/public/word-hunt/leaderboard?limit=20'),
  });

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white">Word Hunt</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Find the hidden word hidden across band lyrics. Score = 1000 − wrong×100 − seconds×2.
        </p>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-600 text-sm py-10">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-center text-gray-600 text-sm py-10">
          No scores yet —{' '}
          <Link to="/play/word-hunt" className="text-emerald-400 hover:underline">
            be the first
          </Link>
          !
        </p>
      ) : (
        <div className="divide-y divide-gray-800">
          {entries.map((e) => (
            <div key={`${e.rank}-${e.createdAt}`} className="flex items-center gap-3 px-5 py-3.5">
              <RankBadge rank={e.rank} />
              <Avatar name={e.playerName} url={e.avatarUrl} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{e.playerName}</p>
                <p className="text-xs text-gray-500">
                  &ldquo;{e.word}&rdquo; · {e.wrongCount} wrong · {fmtTime(e.timeSec)}
                </p>
              </div>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">
                {e.score.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4 border-t border-gray-800">
        <Link
          to="/play/word-hunt"
          className="block w-full text-center bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          Play Word Hunt →
        </Link>
      </div>
    </div>
  );
}

function LyricChainTab() {
  const [hardMode, setHardMode] = useState(false);
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['leaderboard-lyricchain', hardMode],
    queryFn: () => api.get<LyricChainEntry[]>(`/api/lyric-chain/scores?limit=20&hardMode=${hardMode}`),
  });

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">Lyric Chain</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Build the longest chain: song → word → song → word, without repeating.
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs shrink-0">
          <button
            className={`px-3 py-1.5 transition-colors ${!hardMode ? 'bg-violet-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setHardMode(false)}
          >Normal</button>
          <button
            className={`px-3 py-1.5 transition-colors ${hardMode ? 'bg-rose-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            onClick={() => setHardMode(true)}
          >Hard</button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-600 text-sm py-10">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-center text-gray-600 text-sm py-10">
          No scores yet —{' '}
          <Link to="/play/lyric-chain" className="text-violet-400 hover:underline">
            be the first
          </Link>
          !
        </p>
      ) : (
        <div className="divide-y divide-gray-800">
          {entries.map((e) => (
            <div key={`${e.rank}-${e.createdAt}`} className="flex items-center gap-3 px-5 py-3.5">
              <RankBadge rank={e.rank} />
              <Avatar name={e.playerName} url={e.avatarUrl} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{e.playerName}</p>
                <p className="text-xs text-gray-500 truncate">
                  {e.bandScopeNames ?? 'All artists'}
                  {e.hardMode && <span className="ml-1.5 text-rose-400 font-semibold">HARD</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-violet-400 tabular-nums">{e.chainLength}</div>
                <div className="text-[10px] text-gray-600">{new Date(e.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4 border-t border-gray-800">
        <Link
          to="/play/lyric-chain"
          className="block w-full text-center bg-violet-700 hover:bg-violet-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          Play Lyric Chain →
        </Link>
      </div>
    </div>
  );
}

function Band2048Tab() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['leaderboard-band2048'],
    queryFn: () => api.get<Band2048Entry[]>('/api/band2048/leaderboard?limit=20'),
  });

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white">Band 2048</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Slide tiles to merge albums. Score = sum of all merge values.
        </p>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-600 text-sm py-10">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-center text-gray-600 text-sm py-10">
          No scores yet —{' '}
          <Link to="/play/2048" className="text-purple-400 hover:underline">
            be the first
          </Link>
          !
        </p>
      ) : (
        <div className="divide-y divide-gray-800">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-5 py-3.5">
              <RankBadge rank={e.rank} />
              <Avatar name={e.playerName} url={e.avatarUrl} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{e.playerName}</p>
                <p className="text-xs text-gray-500">
                  Level {e.topLevel}/{e.winLevel}
                  {e.won && <span className="ml-1.5 text-yellow-400 font-semibold">WIN</span>}
                </p>
              </div>
              <span className="text-sm font-bold text-purple-400 tabular-nums">
                {e.score.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4 border-t border-gray-800">
        <Link
          to="/play/2048"
          className="block w-full text-center bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          Play Band 2048 →
        </Link>
      </div>
    </div>
  );
}

function VinylRunnerTab() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['leaderboard-vinylrunner'],
    queryFn: () => api.get<VinylRunnerEntry[]>('/api/platformer/scores?limit=20'),
  });

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white">Vinyl Runner</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Side-scrolling platformer — collect vinyl records, stomp enemies, survive.
        </p>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-600 text-sm py-10">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-center text-gray-600 text-sm py-10">
          No scores yet —{' '}
          <Link to="/play/platformer" className="text-violet-400 hover:underline">
            be the first
          </Link>
          !
        </p>
      ) : (
        <div className="divide-y divide-gray-800">
          {entries.map((e) => (
            <div key={`${e.rank}-${e.score}-${e.createdAt}`} className="flex items-center gap-3 px-5 py-3.5">
              <RankBadge rank={e.rank} />
              <Avatar name={e.playerName} url={e.avatarUrl} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{e.playerName}</p>
                <p className="text-xs text-gray-500">
                  Lv {e.level} · {e.recordsCollected} records · {Math.round(e.distancePx / 100)} m
                </p>
              </div>
              <span className="text-sm font-bold text-violet-400 tabular-nums">
                {e.score.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-5 py-4 border-t border-gray-800">
        <Link
          to="/play/platformer"
          className="block w-full text-center bg-violet-700 hover:bg-violet-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          Play Vinyl Runner →
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('quiz');

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="leaderboard" />

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
          <p className="text-gray-400">Top scores across all games — updated in real time.</p>
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap gap-1 mb-8 bg-gray-900 p-1 rounded-xl w-fit">
          {([
            ['quiz',        'Album Art Quiz', 'bg-indigo-600'],
            ['wordhunt',    'Word Hunt',      'bg-emerald-700'],
            ['lyricchain',  'Lyric Chain',    'bg-violet-700'],
            ['band2048',    'Band 2048',      'bg-purple-700'],
            ['vinylrunner', 'Vinyl Runner',   'bg-violet-800'],
          ] as const).map(([key, label, activeCls]) => (
            <button
              key={key}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === key ? `${activeCls} text-white` : 'text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'quiz'        && <QuizTab />}
        {tab === 'wordhunt'    && <WordHuntTab />}
        {tab === 'lyricchain'  && <LyricChainTab />}
        {tab === 'band2048'    && <Band2048Tab />}
        {tab === 'vinylrunner' && <VinylRunnerTab />}

        {/* Bottom nav links */}
        <div className="mt-10 pt-8 border-t border-gray-800 flex flex-wrap gap-4 justify-center text-sm text-gray-500">
          <Link to="/games"   className="hover:text-gray-300 transition-colors">All Games</Link>
          <Link to="/explore" className="hover:text-gray-300 transition-colors">Explore the Graph</Link>
          <Link to="/view"    className="hover:text-gray-300 transition-colors">Browse Library</Link>
          <Link to="/landing" className="hover:text-gray-300 transition-colors">Home</Link>
        </div>
      </main>
    </div>
  );
}

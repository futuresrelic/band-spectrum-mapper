import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuizEntry {
  id: string;
  score: number;
  level: number;
  duration: number;
  createdAt: string;
  user: { id: string; name: string | null; avatarUrl: string | null };
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

type Tab = 'quiz' | 'wordhunt';

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
                <p className="text-sm text-white truncate">{e.user.name ?? 'Unknown'}</p>
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>('quiz');
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <Link
            to="/landing"
            className="text-sm font-semibold text-gray-100 tracking-tight hover:text-white transition-colors"
          >
            Band Spectrum Mapper
          </Link>
          <nav className="flex items-center gap-4 text-sm flex-wrap justify-end">
            <Link to="/explore" className="text-gray-400 hover:text-gray-200 transition-colors">Explore</Link>
            <Link to="/play"    className="text-gray-400 hover:text-gray-200 transition-colors">Games</Link>
            <Link to="/view"    className="text-gray-400 hover:text-gray-200 transition-colors">Library</Link>
            {user ? (
              <Link
                to={user.isAdmin ? '/dashboard' : '/my/rate'}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                {user.isAdmin ? 'Dashboard' : 'My Ratings'}
              </Link>
            ) : (
              <a
                href="/api/auth/google"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Sign In
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
          <p className="text-gray-400">Top scores across all games — updated in real time.</p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-8 bg-gray-900 p-1 rounded-xl w-fit">
          {([['quiz', 'Album Art Quiz'], ['wordhunt', 'Word Hunt']] as const).map(([key, label]) => (
            <button
              key={key}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'quiz'     && <QuizTab />}
        {tab === 'wordhunt' && <WordHuntTab />}

        {/* Bottom nav links */}
        <div className="mt-10 pt-8 border-t border-gray-800 flex flex-wrap gap-4 justify-center text-sm text-gray-500">
          <Link to="/explore" className="hover:text-gray-300 transition-colors">Explore the Graph</Link>
          <Link to="/view"    className="hover:text-gray-300 transition-colors">Browse Library</Link>
          <Link to="/landing" className="hover:text-gray-300 transition-colors">Home</Link>
        </div>
      </main>
    </div>
  );
}

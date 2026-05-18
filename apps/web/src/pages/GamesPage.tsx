import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';

const GAMES = [
  {
    id: 'quiz',
    icon: '🖼️',
    title: 'Album Art Quiz',
    subtitle: 'Test your visual memory',
    desc: 'Album artwork flashes up — name the band before the clock runs out. Difficulty ramps every five rounds. How far can you get?',
    rules: ['5 seconds per round (less as you level up)', 'Three lives — a wrong answer costs one', 'Streak bonuses for consecutive correct answers'],
    href: '/play',
    cta: 'Play Quiz',
    color: 'border-sky-500/40 hover:border-sky-400/70',
    btnColor: 'bg-sky-600 hover:bg-sky-500',
    accentText: 'text-sky-400',
  },
  {
    id: 'wordhunt',
    icon: '🔤',
    title: 'Word Hunt',
    subtitle: 'Dig into the lyrics',
    desc: 'A word is hidden somewhere in the library\'s lyrics. Click song nodes in the graph to find which songs contain it. Speed and precision both count.',
    rules: ['Word pool drawn from real song lyrics', 'Each wrong click costs 100 points', 'Time penalty: −2 points per second'],
    href: '/play/word-hunt',
    cta: 'Hunt Words',
    color: 'border-emerald-500/40 hover:border-emerald-400/70',
    btnColor: 'bg-emerald-700 hover:bg-emerald-600',
    accentText: 'text-emerald-400',
  },
];

export default function GamesPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold mb-3">Games</h1>
          <p className="text-gray-400 text-lg max-w-lg mx-auto">
            Two ways to put your music knowledge to the test. Sign in to save scores and compete on the leaderboard.
          </p>
          {!user && (
            <a
              href="/api/auth/google"
              className="inline-block mt-5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              Sign in to save scores
            </a>
          )}
        </div>

        {/* Game cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {GAMES.map((g) => (
            <div
              key={g.id}
              className={`rounded-2xl bg-gray-900 border p-7 flex flex-col gap-5 transition-colors ${g.color}`}
            >
              {/* Header */}
              <div>
                <div className="text-4xl mb-3">{g.icon}</div>
                <h2 className="text-xl font-bold text-white">{g.title}</h2>
                <p className={`text-sm font-medium mt-0.5 ${g.accentText}`}>{g.subtitle}</p>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-400 leading-relaxed flex-1">
                {g.desc}
              </p>

              {/* Rules */}
              <ul className="space-y-1">
                {g.rules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className={`mt-0.5 ${g.accentText}`}>›</span>
                    {rule}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                to={g.href}
                className={`block text-center text-white font-semibold py-2.5 rounded-xl transition-colors text-sm ${g.btnColor}`}
              >
                {g.cta} →
              </Link>
            </div>
          ))}
        </div>

        {/* Leaderboard CTA */}
        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              <span>🏆</span> Leaderboard
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              See top scores for both games — updated in real time.
            </p>
          </div>
          <Link
            to="/leaderboard"
            className="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shrink-0"
          >
            View Leaderboard →
          </Link>
        </div>
      </main>
    </div>
  );
}

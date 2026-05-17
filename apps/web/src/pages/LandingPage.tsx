import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SCORE_AXES, AXIS_COLORS, AXIS_LABELS, AXIS_INFO } from '@band-spectrum-mapper/shared';

// Quick-access tiles shown between the hero and the features grid.
const EXPLORE_TILES = [
  {
    icon: '📚',
    title: 'Browse Library',
    desc: 'Bands, albums, songs — all free to explore. No account needed.',
    href: '/view',
    cta: 'Open Library',
    color: 'border-indigo-500/30 hover:border-indigo-400/60',
    btnColor: 'bg-indigo-600 hover:bg-indigo-500',
    auth: false,
  },
  {
    icon: '🕸️',
    title: 'Explore the Graph',
    desc: 'Interactive network visualizing how songs, albums, and artists connect.',
    href: '/explore',
    cta: 'Open Graph',
    color: 'border-violet-500/30 hover:border-violet-400/60',
    btnColor: 'bg-violet-600 hover:bg-violet-500',
    auth: false,
  },
  {
    icon: '🖼️',
    title: 'Album Art Quiz',
    desc: 'Guess bands from their album covers. Compete for the leaderboard.',
    href: '/play',
    cta: 'Play Now',
    color: 'border-sky-500/30 hover:border-sky-400/60',
    btnColor: 'bg-sky-600 hover:bg-sky-500',
    auth: true,
  },
  {
    icon: '🔤',
    title: 'Word Hunt',
    desc: 'Find a hidden word scattered across band lyrics. Race the clock.',
    href: '/play/word-hunt',
    cta: 'Hunt Words',
    color: 'border-emerald-500/30 hover:border-emerald-400/60',
    btnColor: 'bg-emerald-700 hover:bg-emerald-600',
    auth: true,
  },
  {
    icon: '🏆',
    title: 'Leaderboard',
    desc: 'See who is topping the charts across both games. Claim your spot.',
    href: '/leaderboard',
    cta: 'View Scores',
    color: 'border-yellow-500/30 hover:border-yellow-400/60',
    btnColor: 'bg-yellow-600 hover:bg-yellow-500',
    auth: false,
  },
  {
    icon: '🎚️',
    title: 'Rate Songs',
    desc: 'Score your favourite tracks across the six spectrum axes.',
    href: '/my/rate',
    cta: 'Start Rating',
    color: 'border-rose-500/30 hover:border-rose-400/60',
    btnColor: 'bg-rose-600 hover:bg-rose-500',
    auth: true,
  },
];

const FEATURES = [
  {
    icon: '🎚️',
    title: 'Spectrum Scoring',
    desc: 'Rate songs across six axes — aggression, complexity, atmosphere, emotion, psychedelia, and concept. Your scores sit alongside the community average and AI scores on a shared radar chart.',
  },
  {
    icon: '🤖',
    title: 'Three-Layer AI',
    desc: 'Lyric analysis reveals themes and emotional register. Song research pulls Wikipedia context and music style. Deep synthesis brings everything together into a critic-level reading.',
  },
  {
    icon: '📡',
    title: 'Wikipedia Research',
    desc: 'Automatic background research on every song, album, and artist — sourced, summarised, and enriched with a dedicated musical style profile covering genre, instrumentation, and production.',
  },
  {
    icon: '💬',
    title: 'Community Discussion',
    desc: 'Comment sections where fans share interpretations. The AI actually reads the discussion and weaves compelling community insights into its Deep Analysis when regenerated.',
  },
  {
    icon: '🔬',
    title: 'Cross-Reference',
    desc: 'Compare bands and albums on the spectrum radar. See how one album sits relative to another, or how a band\'s sound evolves across releases.',
  },
  {
    icon: '🔗',
    title: 'Share & Discover',
    desc: 'Every song has a dedicated shareable analysis card with spectrum scores, AI insights, and a direct link — ready to post anywhere.',
  },
];


const HOW_IT_WORKS = [
  {
    n: '01',
    title: 'Browse the library',
    desc: 'Start at the public library — bands, albums, songs, all free to explore. No account needed. Click into any song to see its full spectrum profile, lyrics, AI analysis, and community discussion.',
  },
  {
    n: '02',
    title: 'Read the analysis',
    desc: 'Three AI layers per song: lyric analysis (themes, emotional register), song research (Wikipedia background + music style), and deep synthesis (title significance, historical context, lyrical interpretation). The title analysis is particularly interesting — many progressive songs state their concept in the title and never utter it in the lyrics.',
  },
  {
    n: '03',
    title: 'Rate, comment, and share',
    desc: 'Sign in to add your own spectrum scores, join the discussion, and shape the AI\'s analysis — it reads community comments when synthesising. Share any song\'s analysis card to social media.',
  },
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky nav */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-surface-200">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <span className="font-bold text-surface-900 tracking-tight whitespace-nowrap">Band Spectrum Mapper</span>
          <nav className="flex items-center gap-3 text-sm flex-wrap justify-end">
            <Link to="/view"        className="text-surface-600 hover:text-surface-900 transition-colors">Library</Link>
            <Link to="/explore"     className="text-surface-600 hover:text-surface-900 transition-colors">Explore</Link>
            <Link to="/play"        className="text-surface-600 hover:text-surface-900 transition-colors">Games</Link>
            <Link to="/leaderboard" className="text-surface-600 hover:text-surface-900 transition-colors">Leaderboard</Link>
            <Link to="/help"        className="text-surface-600 hover:text-surface-900 transition-colors">Help</Link>
            {user ? (
              <Link to={user.isAdmin ? '/dashboard' : '/my/rate'} className="btn-primary text-sm">
                {user.isAdmin ? 'Dashboard' : 'My Ratings'}
              </Link>
            ) : (
              <a href="/api/auth/google" className="btn-primary text-sm">Sign In</a>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-slate-950 text-white">
        <div className="max-w-4xl mx-auto px-6 py-24 sm:py-32 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-8 tracking-widest uppercase">
            Fan-Built · Independent · Free to Browse
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-none">
            Band Spectrum<br />Mapper
          </h1>
          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
            The obsessive fan's tool for deep music analysis. Spectrum scoring,
            AI-powered research, lyrical interpretation, and community discussion.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              to="/view"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors text-base"
            >
              Browse Library
            </Link>
            {user ? (
              <Link
                to={user.isAdmin ? '/dashboard' : '/my/rate'}
                className="bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors text-base"
              >
                {user.isAdmin ? 'Go to Dashboard' : 'My Ratings'}
              </Link>
            ) : (
              <a
                href="/api/auth/google"
                className="bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3.5 rounded-lg transition-colors text-base"
              >
                Sign In with Google
              </a>
            )}
            <Link
              to="/help"
              className="text-slate-400 hover:text-slate-200 font-medium px-4 py-3.5 transition-colors text-base"
            >
              How it works →
            </Link>
          </div>
          <p className="text-slate-600 text-sm mt-8">
            No account needed to browse. Sign in to rate, comment, and share.
          </p>
        </div>
      </section>

      {/* Quick-access tiles */}
      <section className="py-16 bg-slate-900">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-xl font-bold text-white text-center mb-2">Jump in</h2>
          <p className="text-slate-400 text-center mb-10 text-sm">
            Everything the platform has to offer — pick where to start.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {EXPLORE_TILES.map((t) => (
              <div
                key={t.title}
                className={`bg-slate-800/60 rounded-xl border p-5 flex flex-col gap-3 transition-colors ${t.color}`}
              >
                <div className="text-3xl">{t.icon}</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-1">{t.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{t.desc}</p>
                  {t.auth && (
                    <p className="text-xs text-slate-600 mt-1">Sign in required</p>
                  )}
                </div>
                <Link
                  to={t.href}
                  className={`inline-block text-center text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${t.btnColor}`}
                >
                  {t.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-3">Everything a music obsessive needs</h2>
          <p className="text-surface-600 text-center mb-12 max-w-xl mx-auto">
            Built for people who read lyrics while listening and argue about what songs really mean.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-surface-200 p-6 hover:border-surface-400 transition-colors">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-surface-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Six axes */}
      <section className="py-20 bg-surface-50 border-y border-surface-200">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-3">The six spectrum axes</h2>
          <p className="text-surface-600 text-center mb-12 max-w-xl mx-auto">
            Every song is rated across six dimensions by you, the community, and AI — then compared on a shared radar chart.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SCORE_AXES.map((axis) => (
              <div key={axis} className="bg-white rounded-xl border border-surface-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: AXIS_COLORS[axis] }} />
                  <span className="font-semibold" style={{ color: AXIS_COLORS[axis] }}>{AXIS_LABELS[axis]}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-200 mb-2 overflow-hidden">
                  <div className="h-full w-1/2 rounded-full" style={{ backgroundColor: AXIS_COLORS[axis], opacity: 0.7 }} />
                </div>
                <div className="flex justify-between text-xs text-surface-500">
                  <span>0 · {AXIS_INFO[axis].lo}</span>
                  <span>10 · {AXIS_INFO[axis].hi}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-14">How it works</h2>
          <div className="space-y-10">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.n} className="flex gap-6">
                <div className="text-5xl font-bold text-surface-200 tabular-nums leading-none w-14 flex-shrink-0 pt-1">{s.n}</div>
                <div>
                  <h3 className="font-semibold mb-2 text-lg">{s.title}</h3>
                  <p className="text-sm text-surface-600 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sharing callout */}
      <section className="py-16 bg-indigo-50 border-y border-indigo-100">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-xl font-bold mb-3">Built for sharing</h2>
          <p className="text-surface-600 mb-6 leading-relaxed">
            Every song has a dedicated share page with its full spectrum profile and AI analysis highlights.
            Copy the link, screenshot the card, or post directly to X. Bring people into the conversation.
          </p>
          <Link to="/view" className="btn-primary">Find a song to share →</Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-slate-950 text-white py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to dive in?</h2>
          <p className="text-slate-400 mb-8">
            Start browsing now — no account needed. Sign in to unlock ratings, games, and commenting.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/view" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-lg transition-colors">
              Browse Library
            </Link>
            <Link to="/explore" className="bg-violet-700 hover:bg-violet-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors">
              Explore Graph
            </Link>
            <Link to="/leaderboard" className="bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3 rounded-lg transition-colors">
              Leaderboard
            </Link>
            {!user && (
              <a href="/api/auth/google" className="bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-3 rounded-lg transition-colors">
                Sign In with Google
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-slate-500 text-sm">
          <span>Band Spectrum Mapper · Independent fan project</span>
          <div className="flex flex-wrap gap-6 items-center">
            <a
              href="https://buymeacoffee.com/bandspectrummapper"
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-500 hover:text-yellow-400 transition-colors font-medium"
            >
              ☕ Buy me a coffee
            </a>
            <Link to="/explore"     className="hover:text-slate-300 transition-colors">Explore</Link>
            <Link to="/leaderboard" className="hover:text-slate-300 transition-colors">Leaderboard</Link>
            <Link to="/help"        className="hover:text-slate-300 transition-colors">Help & FAQ</Link>
            <Link to="/legal"       className="hover:text-slate-300 transition-colors">Legal</Link>
            <Link to="/view"        className="hover:text-slate-300 transition-colors">Library</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

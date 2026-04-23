import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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

const AXES = [
  { name: 'Aggression', lo: 'Calm · Peaceful', hi: 'Intense · Abrasive', color: '#ef4444' },
  { name: 'Complexity', lo: 'Simple · Repetitive', hi: 'Dense · Intricate', color: '#8b5cf6' },
  { name: 'Atmosphere', lo: 'Dry · Direct', hi: 'Immersive · Cinematic', color: '#06b6d4' },
  { name: 'Emotion', lo: 'Detached · Cold', hi: 'Raw · Vulnerable', color: '#ec4899' },
  { name: 'Psychedelic', lo: 'Grounded · Literal', hi: 'Surreal · Mind-bending', color: '#10b981' },
  { name: 'Concept', lo: 'Personal · Narrative', hi: 'Philosophical · Abstract', color: '#f59e0b' },
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
            <Link to="/view" className="text-surface-600 hover:text-surface-900 transition-colors">Library</Link>
            <Link to="/help" className="text-surface-600 hover:text-surface-900 transition-colors">Help</Link>
            <Link to="/legal" className="text-surface-600 hover:text-surface-900 transition-colors">Legal</Link>
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
            {AXES.map((axis) => (
              <div key={axis.name} className="bg-white rounded-xl border border-surface-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: axis.color }} />
                  <span className="font-semibold">{axis.name}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-200 mb-2 overflow-hidden">
                  <div className="h-full w-1/2 rounded-full" style={{ backgroundColor: axis.color, opacity: 0.7 }} />
                </div>
                <div className="flex justify-between text-xs text-surface-500">
                  <span>0 · {axis.lo}</span>
                  <span>10 · {axis.hi}</span>
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
            Start browsing now — no account needed. Sign in to unlock ratings, comments, and sharing.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/view" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-lg transition-colors">
              Browse Library
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
          <div className="flex gap-6">
            <Link to="/help" className="hover:text-slate-300 transition-colors">Help & FAQ</Link>
            <Link to="/legal" className="hover:text-slate-300 transition-colors">Legal</Link>
            <Link to="/view" className="hover:text-slate-300 transition-colors">Library</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

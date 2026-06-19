import { Link } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';
import AxisExplainer from '../components/AxisExplainer';

const DISCOVER_CARDS = [
  {
    icon: '📚',
    title: 'Browse the Library',
    desc: 'Bands, albums, songs — all free to explore. Click into any song for its full spectrum profile, AI analysis, and community discussion.',
    href: '/view',
    cta: 'Open Library',
    border: 'border-indigo-500/30 hover:border-indigo-400/60',
    bg: 'bg-indigo-950/20',
    btn: 'bg-indigo-600 hover:bg-indigo-500',
  },
  {
    icon: '🕸️',
    title: 'Explore the Graph',
    desc: 'An interactive network showing how songs, albums, artists, and themes connect. Drag, zoom, and follow the links.',
    href: '/explore',
    cta: 'Explore Graph',
    border: 'border-violet-500/30 hover:border-violet-400/60',
    bg: 'bg-violet-950/20',
    btn: 'bg-violet-600 hover:bg-violet-500',
  },
  {
    icon: '🎬',
    title: 'Cinema Mode',
    desc: 'A cinematic 3D tour of the entire music library. Camera choreography, floating lyrics, and orbit controls.',
    href: '/cinema',
    cta: 'Enter Cinema',
    border: 'border-purple-500/30 hover:border-purple-400/60',
    bg: 'bg-purple-950/20',
    btn: 'bg-purple-700 hover:bg-purple-600',
  },
  {
    icon: '🎮',
    title: 'Play a Game',
    desc: 'Spectrum Guesser, Lyric Duel, Flop Sweeper, and 14 more ways to test your music knowledge.',
    href: '/games',
    cta: 'See All Games',
    border: 'border-sky-500/30 hover:border-sky-400/60',
    bg: 'bg-sky-950/20',
    btn: 'bg-sky-600 hover:bg-sky-500',
  },
  {
    icon: '📡',
    title: 'Spectrum Guesser',
    desc: 'You are given a song — guess its psychological scores on all six axes. Points for accuracy. How well do you know the music?',
    href: '/play/spectrum-guesser',
    cta: 'Play Spectrum Guesser',
    border: 'border-rose-500/30 hover:border-rose-400/60',
    bg: 'bg-rose-950/20',
    btn: 'bg-rose-600 hover:bg-rose-500',
  },
  {
    icon: '🏆',
    title: 'Leaderboard',
    desc: 'Top scores across all BSM games — updated in real time. See who knows their music best.',
    href: '/leaderboard',
    cta: 'View Leaderboard',
    border: 'border-amber-500/30 hover:border-amber-400/60',
    bg: 'bg-amber-950/20',
    btn: 'bg-amber-600 hover:bg-amber-500',
  },
];

export default function DiscoverPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="discover" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-widest uppercase">
            Fan-Built · Free to Browse
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-5 leading-tight">
            Discover Band Spectrum Mapper
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
            BSM turns songs into psychological maps, games, and visual journeys —
            helping fans explore music by emotion, complexity, atmosphere, and meaning.
          </p>
        </div>

        {/* What is BSM? */}
        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-8 mb-12">
          <h2 className="text-xl font-bold mb-6 text-white">What is BSM?</h2>
          <ul className="space-y-4">
            {[
              { icon: '📊', text: 'Map songs across 6 psychological axes — aggression, complexity, atmosphere, emotion, psychedelic, and concept' },
              { icon: '⚖️', text: 'Compare songs, bands, albums, and fan perception side by side on shared radar charts' },
              { icon: '🎮', text: 'Explore music through games, graphs, and cinematic visuals that bring the data to life' },
              { icon: '🔍', text: 'Discover music through patterns, lyrics, themes, and emotional fingerprints' },
            ].map(({ icon, text }) => (
              <li key={text} className="flex items-start gap-4">
                <span className="text-2xl mt-0.5 shrink-0">{icon}</span>
                <span className="text-gray-300 leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Entry cards */}
        <h2 className="text-lg font-semibold mb-5 text-gray-300">Where do you want to start?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
          {DISCOVER_CARDS.map((c) => (
            <div
              key={c.title}
              className={`rounded-2xl border p-6 flex flex-col gap-4 transition-colors ${c.border} ${c.bg}`}
            >
              <div className="text-3xl">{c.icon}</div>
              <div className="flex-1">
                <h3 className="font-semibold text-white mb-2">{c.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{c.desc}</p>
              </div>
              <Link
                to={c.href}
                className={`block text-center text-white text-sm font-semibold py-2.5 rounded-xl transition-colors ${c.btn}`}
              >
                {c.cta} →
              </Link>
            </div>
          ))}
        </div>

        {/* The 6 axes */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-300">The 6 Spectrum Axes</h2>
          <p className="text-sm text-gray-500 mb-6">
            Every song is scored across six psychological dimensions — by curators, AI lyric analysis, audio analysis, and the community.
            Scores run from 0 to 10. Any combination of scores is valid — a song can be simultaneously high-emotion and low-aggression.
          </p>
          <AxisExplainer theme="dark" />
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 rounded-2xl bg-indigo-950/50 border border-indigo-500/30 p-8 text-center">
          <h3 className="text-xl font-bold mb-3">Ready to dive in?</h3>
          <p className="text-gray-400 mb-6 text-sm">No account needed to browse, explore the graph, or watch Cinema Mode.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/view" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm">
              Browse Library
            </Link>
            <Link to="/games" className="bg-sky-600 hover:bg-sky-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm">
              Play Games
            </Link>
            <Link to="/cinema" className="bg-purple-700 hover:bg-purple-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm">
              Cinema Mode
            </Link>
            <a href="/api/auth/google" className="bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm">
              Sign In with Google
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

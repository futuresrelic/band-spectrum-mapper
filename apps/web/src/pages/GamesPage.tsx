import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';

const GAMES = [
  {
    id: 'quiz',
    icon: '🖼️',
    title: 'Album Art Quiz',
    subtitle: 'Test your visual memory',
    desc: "Album artwork flashes up — name the band before the clock runs out. Difficulty ramps every five rounds. How far can you get?",
    rules: ['5 seconds per round (less as you level up)', 'Three lives — a wrong answer costs one', 'Streak bonuses for consecutive correct answers'],
    href: '/play',
    cta: 'Play Quiz',
    color: 'border-sky-500/40 hover:border-sky-400/70',
    btnColor: 'bg-sky-600 hover:bg-sky-500',
    accentText: 'text-sky-400',
  },
  {
    id: 'lyric-dissection',
    icon: '🎵',
    title: 'Lyric Dissection',
    subtitle: 'Name that song',
    desc: "One word from a song's lyrics appears. Guess the song title — or reveal more words for clues. Fewer hints needed means a higher score. Race the clock across 5 rounds.",
    rules: ['First word shown — guess or reveal more', '-80 pts per extra word revealed', '-200 pts per wrong guess'],
    href: '/play/lyric-dissection',
    cta: 'Dissect Lyrics',
    color: 'border-amber-500/40 hover:border-amber-400/70',
    btnColor: 'bg-amber-600 hover:bg-amber-500',
    accentText: 'text-amber-400',
  },
  {
    id: 'timeline',
    icon: '🗓️',
    title: 'Timeline Challenge',
    subtitle: 'Sort by release year',
    desc: "Five albums appear without their release years. Click them in order from oldest to newest. How sharp is your music history knowledge?",
    rules: ['No years shown — memory only', '5 albums per round, 5 rounds total', '-150 pts per album in wrong position'],
    href: '/play/timeline',
    cta: 'Sort the Timeline',
    color: 'border-teal-500/40 hover:border-teal-400/70',
    btnColor: 'bg-teal-700 hover:bg-teal-600',
    accentText: 'text-teal-400',
  },
  {
    id: '2048',
    icon: '🎮',
    title: 'Band 2048',
    subtitle: 'Merge your way to the masterpiece',
    desc: "The classic 2048 puzzle themed around your band collection. Slide tiles to merge them — two identical album tiles combine into the next album in the discography. Reach the final album to win!",
    rules: ['Arrow keys or swipe to slide', 'Two matching tiles merge into the next album', 'Game over when no valid moves remain'],
    href: '/play/2048',
    cta: 'Play 2048',
    color: 'border-purple-500/40 hover:border-purple-400/70',
    btnColor: 'bg-purple-700 hover:bg-purple-600',
    accentText: 'text-purple-400',
  },
  {
    id: 'wordhunt',
    icon: '🔤',
    title: 'Word Hunt',
    subtitle: 'Dig into the lyrics',
    desc: "A word is hidden somewhere in the library's lyrics. Click song nodes in the graph to find which songs contain it. Speed and precision both count.",
    rules: ['Word pool drawn from real song lyrics', 'Each wrong click costs 100 points', 'Time penalty: -2 points per second'],
    href: '/play/word-hunt',
    cta: 'Hunt Words',
    color: 'border-emerald-500/40 hover:border-emerald-400/70',
    btnColor: 'bg-emerald-700 hover:bg-emerald-600',
    accentText: 'text-emerald-400',
  },
  {
    id: 'lyricchain',
    icon: '🔗',
    title: 'Lyric Chain',
    subtitle: 'Build the longest word-song chain',
    desc: "Start with a song — pick a word from it — find a new song with that word — pick another word — keep going. How long a chain can you build before hitting a dead end?",
    rules: ['Each word and each song can only be used once', 'Chain ends when no connecting songs remain', 'Hard mode: no same album twice in a row'],
    href: '/play/lyric-chain',
    cta: 'Start Chaining',
    color: 'border-violet-500/40 hover:border-violet-400/70',
    btnColor: 'bg-violet-700 hover:bg-violet-600',
    accentText: 'text-violet-400',
  },
  {
    id: 'graphhunt',
    icon: '🌐',
    title: '3D Graph Hunt',
    subtitle: 'Navigate the lyrical universe',
    desc: "You're dropped into a 3D network of songs and keywords. Starting from a random song, navigate node by node to find the hidden target word — guided only by hot/cold hints.",
    rules: ['Move one node at a time through the graph', '-25 pts per hop, -1 pt per second', 'Target revealed when within 2 hops'],
    href: '/graph-hunt',
    cta: 'Enter the Graph',
    color: 'border-indigo-500/40 hover:border-indigo-400/70',
    btnColor: 'bg-indigo-700 hover:bg-indigo-600',
    accentText: 'text-indigo-400',
  },
];

const COMING_SOON = [
  {
    id: 'spectrum-guesser',
    icon: '📡',
    title: 'Spectrum Guesser',
    desc: "A radar chart of a band's 6-axis psychological profile appears with no name. Identify the band from their sonic fingerprint alone.",
  },
  {
    id: 'lyric-match',
    icon: '🧩',
    title: 'Lyric Match',
    desc: "Two columns: lyric fragments on the left, song titles on the right. Connect each lyric to its song as fast as possible.",
  },
  {
    id: 'album-bracket',
    icon: '🏟️',
    title: 'Album Bracket',
    desc: "Head-to-head tournament of albums. Vote for your favourite in each round until one reigns supreme.",
  },
];

export default function GamesPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold mb-3">Games</h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Seven ways to put your music knowledge to the test. Sign in to save scores and compete on the leaderboard.
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
          {GAMES.map((g) => (
            <div
              key={g.id}
              className={`rounded-2xl bg-gray-900 border p-7 flex flex-col gap-5 transition-colors ${g.color}`}
            >
              <div>
                <div className="text-4xl mb-3">{g.icon}</div>
                <h2 className="text-xl font-bold text-white">{g.title}</h2>
                <p className={`text-sm font-medium mt-0.5 ${g.accentText}`}>{g.subtitle}</p>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed flex-1">{g.desc}</p>
              <ul className="space-y-1">
                {g.rules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-xs text-gray-500">
                    <span className={`mt-0.5 ${g.accentText}`}>›</span>
                    {rule}
                  </li>
                ))}
              </ul>
              <Link
                to={g.href}
                className={`block text-center text-white font-semibold py-2.5 rounded-xl transition-colors text-sm ${g.btnColor}`}
              >
                {g.cta} →
              </Link>
            </div>
          ))}
        </div>

        {/* Coming Soon */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">Coming Soon</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {COMING_SOON.map((g) => (
              <div key={g.id} className="rounded-xl bg-gray-900/60 border border-gray-800 p-5 opacity-60">
                <div className="text-2xl mb-2">{g.icon}</div>
                <div className="text-sm font-semibold text-gray-400 mb-1">{g.title}</div>
                <p className="text-xs text-gray-600 leading-relaxed">{g.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard CTA */}
        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              <span>🏆</span> Leaderboard
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              Top scores across all games — updated in real time.
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

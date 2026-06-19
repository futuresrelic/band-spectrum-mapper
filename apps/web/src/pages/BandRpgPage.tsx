import { Link } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';

export default function BandRpgPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <main className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="text-6xl mb-6">🗺️</div>
        <h1 className="text-4xl font-bold mb-4">Band RPG</h1>
        <p className="text-gray-400 text-lg mb-8 leading-relaxed max-w-xl mx-auto">
          An RPG adventure where the entire BSM library becomes the world. Explore levels built around
          real bands, complete quests tied to albums and songs, collect items, and progress through a
          narrative driven by music data.
        </p>

        <div className="rounded-2xl bg-gray-900 border border-amber-500/30 p-8 mb-8">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-4 tracking-widest uppercase">
            Coming Soon
          </div>
          <h2 className="text-xl font-semibold mb-3">The world is being built</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Band RPG is under active development. The first playable level — complete with objectives,
            quests, NPCs, and collectibles drawn from the BSM library — is on the way.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            {[
              { icon: '🗺️', label: 'Levels', desc: 'Tile-based maps built around real bands and albums' },
              { icon: '📜', label: 'Quests', desc: 'Objectives tied to songs, themes, and music knowledge' },
              { icon: '🎭', label: 'Characters', desc: 'Band member NPCs with dialogue and faction roles' },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="rounded-xl bg-gray-800/60 border border-gray-700/50 p-4">
                <div className="text-2xl mb-2">{icon}</div>
                <div className="text-sm font-semibold text-white mb-1">{label}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <Link to="/games" className="bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm">
            ← Back to Games
          </Link>
          <Link to="/play/spectrum-guesser" className="bg-rose-700 hover:bg-rose-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm">
            Play Spectrum Guesser
          </Link>
          <Link to="/play/lyric-duel" className="bg-indigo-700 hover:bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm">
            Play Lyric Duel
          </Link>
        </div>
      </main>
    </div>
  );
}

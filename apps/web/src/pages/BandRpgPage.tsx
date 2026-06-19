import { useNavigate } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';
import BandRpgGame from '../components/band-rpg/BandRpgGame';
import { useAuth } from '../contexts/AuthContext';

export default function BandRpgPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-gray-950 overflow-hidden">
      <SiteHeader theme="dark" active="games" />

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/50 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🗺️</span>
          <span className="text-white font-semibold text-sm">Band RPG</span>
          <span className="text-gray-600 text-xs">· The Archives</span>
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-emerald-400 text-xs">● {user.username ?? user.name ?? 'Player'}</span>}
        </div>
      </div>

      {/* Game fills remaining space */}
      <div className="flex-1 overflow-hidden min-h-0">
        <BandRpgGame onExit={() => navigate('/games')} />
      </div>

      {/* Desktop controls hint */}
      <div className="hidden sm:flex items-center justify-center gap-6 px-4 py-1.5 bg-black/40 border-t border-gray-900 text-gray-600 text-xs shrink-0">
        <span><kbd className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">WASD</kbd> / <kbd className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">↑↓←→</kbd> Move</span>
        <span><kbd className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">E</kbd> Interact</span>
        <span><kbd className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">Esc</kbd> Pause</span>
      </div>
    </div>
  );
}

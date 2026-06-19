import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import BandSelectionScreen from '../components/band-rpg/BandSelectionScreen';
import CharacterSelectionScreen from '../components/band-rpg/CharacterSelectionScreen';
import BandRpgGame from '../components/band-rpg/BandRpgGame';
import { useAuth } from '../contexts/AuthContext';
import { bandRpgApi } from '../api/bandRpg';
import type { BandRpgSelectedBand, BandRpgSelectedCharacter, BandRpgSession } from '../api/bandRpg';

type Screen = 'select-band' | 'select-char' | 'loading-session' | 'game';

export default function BandRpgPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [screen,            setScreen]            = useState<Screen>('select-band');
  const [selectedBand,      setSelectedBand]      = useState<BandRpgSelectedBand | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<BandRpgSelectedCharacter | null>(null);

  // Fetch session once we have a band + character selected (before game starts)
  const { data: session, isLoading: sessionLoading, isError: sessionError, refetch: refetchSession } = useQuery({
    queryKey: ['band-rpg-session', selectedBand?.id],
    queryFn:  () => bandRpgApi.startSession(selectedBand!.id),
    enabled:  false, // Only trigger manually
    staleTime: 0,    // Always fresh — new random song each run
    retry: 2,
  });

  function handleBandSelect(band: BandRpgSelectedBand) {
    setSelectedBand(band);
    setScreen('select-char');
  }

  function handleCharSelect(char: BandRpgSelectedCharacter) {
    setSelectedCharacter(char);
    setScreen('loading-session');
    refetchSession().then(({ data }) => {
      if (data) setScreen('game');
    });
  }

  function handleChangeBand() {
    setSelectedBand(null);
    setSelectedCharacter(null);
    setScreen('select-band');
  }

  function handleNewRun(nextSession: BandRpgSession) {
    // Already have a new session — enter game directly
    void nextSession; // used by BandRpgGame to trigger a new run
    setScreen('game');
  }

  const mapLabel = screen === 'game' && selectedBand ? selectedBand.name : 'The Archives';

  return (
    <div className="h-screen flex flex-col bg-gray-950 overflow-hidden">
      <SiteHeader theme="dark" active="games" />

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/50 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🗺️</span>
          <span className="text-white font-semibold text-sm">Band RPG</span>
          <span className="text-gray-600 text-xs">· {mapLabel}</span>
          {screen === 'game' && selectedCharacter && (
            <span className="text-violet-400/70 text-xs">· {selectedCharacter.name}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-emerald-400 text-xs">● {user.username ?? user.name ?? 'Player'}</span>}
        </div>
      </div>

      {/* Screens */}
      <div className="flex-1 overflow-hidden min-h-0">
        {screen === 'select-band' && (
          <BandSelectionScreen
            onSelect={handleBandSelect}
            onBack={() => navigate('/games')}
          />
        )}

        {screen === 'select-char' && selectedBand && (
          <CharacterSelectionScreen
            selectedBand={selectedBand}
            onSelect={handleCharSelect}
            onBack={() => setScreen('select-band')}
          />
        )}

        {screen === 'loading-session' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-white">
            {sessionError ? (
              <>
                <p className="text-red-400 text-sm">Failed to load session. Check your connection.</p>
                <button
                  onClick={() => { refetchSession().then(({ data }) => { if (data) setScreen('game'); }); }}
                  className="bg-amber-700 hover:bg-amber-600 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
                >
                  Retry
                </button>
                <button onClick={() => setScreen('select-char')} className="text-gray-500 text-sm hover:text-gray-300 transition-colors">
                  ← Back
                </button>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full border-2 border-amber-500/60 border-t-amber-400 animate-spin" />
                <p className="text-gray-400 text-sm">{sessionLoading ? 'Finding a song for you…' : 'Preparing the Archives…'}</p>
              </>
            )}
          </div>
        )}

        {screen === 'game' && selectedBand && selectedCharacter && session && (
          <BandRpgGame
            onExit={() => navigate('/games')}
            onChangeBand={handleChangeBand}
            onNewRun={handleNewRun}
            selectedBand={selectedBand}
            selectedCharacter={selectedCharacter}
            session={session}
            refetchSession={() => bandRpgApi.startSession(selectedBand.id)}
          />
        )}
      </div>

      {/* Desktop controls hint — only shown during gameplay */}
      {screen === 'game' && (
        <div className="hidden sm:flex items-center justify-center gap-6 px-4 py-1.5 bg-black/40 border-t border-gray-900 text-gray-600 text-xs shrink-0">
          <span><kbd className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">WASD</kbd> / <kbd className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">↑↓←→</kbd> Move</span>
          <span><kbd className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">E</kbd> Interact</span>
          <span><kbd className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">Esc</kbd> Pause</span>
        </div>
      )}
    </div>
  );
}

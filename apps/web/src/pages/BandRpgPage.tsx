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

type Screen = 'select-mode' | 'select-band' | 'select-char' | 'loading-session' | 'game';

export default function BandRpgPage() {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [screen,            setScreen]            = useState<Screen>('select-mode');
  const [selectedBand,      setSelectedBand]      = useState<BandRpgSelectedBand | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<BandRpgSelectedCharacter | null>(null);

  const { data: session, isLoading: sessionLoading, isError: sessionError, refetch: refetchSession } = useQuery({
    queryKey: ['band-rpg-session', selectedBand?.id],
    queryFn:  () => bandRpgApi.startSession(selectedBand!.id),
    enabled:  false,
    staleTime: 0,
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
    void nextSession;
    setScreen('game');
  }

  const mapLabel = screen === 'game' && selectedBand
    ? selectedBand.name
    : screen === 'select-mode'
      ? 'Choose Your Path'
      : 'The Archives';

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
        {screen === 'select-mode' && (
          <ModeSelectionScreen
            onAdventures={() => navigate('/play/band-rpg/adventures')}
            onClassic={() => setScreen('select-band')}
            onBack={() => navigate('/games')}
          />
        )}

        {screen === 'select-band' && (
          <BandSelectionScreen
            onSelect={handleBandSelect}
            onBack={() => setScreen('select-mode')}
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

// ── Mode selection screen ─────────────────────────────────────────────────────

function ModeSelectionScreen({
  onAdventures, onClassic, onBack,
}: {
  onAdventures: () => void;
  onClassic: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-6 py-10 overflow-y-auto">
      <div className="text-center space-y-1">
        <h1 className="text-3xl font-bold text-white">Band RPG</h1>
        <p className="text-gray-500 text-sm">Choose how you want to play.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {/* Adventures — primary */}
        <button
          onClick={onAdventures}
          className="group flex flex-col gap-3 rounded-2xl border border-indigo-700/50 bg-indigo-950/40 hover:bg-indigo-900/50 hover:border-indigo-500 p-6 text-left transition-all"
        >
          <div className="text-3xl">🗺️</div>
          <div>
            <div className="font-bold text-white text-lg mb-0.5">Adventures</div>
            <p className="text-indigo-400 text-xs font-medium">Authored campaigns</p>
          </div>
          <p className="text-gray-400 text-sm leading-relaxed flex-1">
            Play hand-crafted adventures with story, quests, puzzles, and levels. Start with <em className="text-gray-300">Tool — The Lost Archive</em>.
          </p>
          <span className="inline-block bg-indigo-600 group-hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors w-fit">
            Browse Adventures →
          </span>
        </button>

        {/* Classic — secondary */}
        <button
          onClick={onClassic}
          className="group flex flex-col gap-3 rounded-2xl border border-gray-700 bg-gray-900/40 hover:bg-gray-900 hover:border-gray-500 p-6 text-left transition-all"
        >
          <div className="text-3xl">📼</div>
          <div>
            <div className="font-bold text-white text-lg mb-0.5">Classic Archive Mode</div>
            <p className="text-amber-500 text-xs font-medium">Band-selection sandbox</p>
          </div>
          <p className="text-gray-400 text-sm leading-relaxed flex-1">
            Choose a band and character, then recover songs by identifying lyric fragments. Build your collection.
          </p>
          <span className="inline-block border border-gray-600 group-hover:border-gray-400 text-gray-300 text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors w-fit">
            Enter Classic Mode →
          </span>
        </button>
      </div>

      <button onClick={onBack} className="text-gray-700 hover:text-gray-400 text-sm transition-colors">
        ← Back to Games
      </button>
    </div>
  );
}

import { useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import TileRenderer from '../components/bandRpgRuntime/TileRenderer';
import DialogueBox from '../components/bandRpgRuntime/DialogueBox';
import GameHud from '../components/bandRpgRuntime/GameHud';
import DebugPanel from '../components/bandRpgRuntime/DebugPanel';
import { useGameEngine } from '../components/bandRpgRuntime/useGameEngine';
import { bandRpgRuntimeApi } from '../api/bandRpgRuntime';
import { useAuth } from '../contexts/AuthContext';
import type { GameState } from '../components/bandRpgRuntime/useGameEngine';

export default function BandRpgGamePage() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Support ?slug= for test mode (from level editor "Play This Level")
  const slug = slugParam ?? searchParams.get('slug') ?? '';

  const { data: level, isLoading: levelLoading, isError: levelError } = useQuery({
    queryKey: ['runtime-level', slug],
    queryFn: () => bandRpgRuntimeApi.loadLevel(slug),
    enabled: !!slug,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: save, isLoading: saveLoading } = useQuery({
    queryKey: ['runtime-save'],
    queryFn: () => bandRpgRuntimeApi.loadSave(),
    staleTime: 0,
  });

  const saveMutation = useMutation({
    mutationFn: (state: Partial<typeof save>) =>
      bandRpgRuntimeApi.saveProgress(state ?? {}),
  });

  const handleLevelTransition = useCallback((targetSlug: string) => {
    navigate(`/play/band-rpg/game/${encodeURIComponent(targetSlug)}`);
  }, [navigate]);

  const handleSave = useCallback((gameState: GameState, levelSlug: string) => {
    saveMutation.mutate({
      currentLevelSlug: levelSlug,
      completedObjectives: gameState.completedObjectives,
      completedQuests: gameState.completedQuests,
      inventory: gameState.inventory,
      unlockedStoryBeats: gameState.unlockedBeats,
    });
  }, [saveMutation]);

  const isAdmin = user?.isAdmin ?? false;

  const { state, advanceDialogue, closeDialogue } = useGameEngine(
    level ?? null,
    save ?? null,
    handleLevelTransition,
    handleSave,
    isAdmin,
  );

  // Focus the game area so keyboard events work immediately
  useEffect(() => {
    const el = document.getElementById('band-rpg-game-container');
    el?.focus();
  }, [level]);

  if (!slug) {
    return (
      <div className="h-screen flex flex-col bg-gray-950 text-white">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-gray-400">No level specified.</p>
          <button onClick={() => navigate('/play/band-rpg')} className="text-indigo-400 hover:text-indigo-300 text-sm">
            ← Back to Band RPG
          </button>
        </div>
      </div>
    );
  }

  if (levelLoading || saveLoading) {
    return (
      <div className="h-screen flex flex-col bg-gray-950 text-white">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 animate-pulse">Loading level…</p>
        </div>
      </div>
    );
  }

  if (levelError || !level) {
    return (
      <div className="h-screen flex flex-col bg-gray-950 text-white">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-red-400">Level not found: <code>{slug}</code></p>
          <button onClick={() => navigate('/play/band-rpg')} className="text-indigo-400 hover:text-indigo-300 text-sm">
            ← Back to Band RPG
          </button>
        </div>
      </div>
    );
  }

  const levelBg = level.background ?? '#0f172a';

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
      <SiteHeader theme="dark" active="games" />

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/60 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/play/band-rpg')}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            ←
          </button>
          <span className="text-white font-semibold text-sm">{level.name}</span>
          <span className="text-gray-600 text-xs">/{level.slug}</span>
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-emerald-400 text-xs">● {user.username ?? user.name ?? 'Player'}</span>}
          {isAdmin && (
            <span className="text-green-500 text-xs opacity-60">
              Admin · F3 debug
            </span>
          )}
          {saveMutation.isPending && <span className="text-gray-500 text-xs">Saving…</span>}
        </div>
      </div>

      {/* Game area */}
      <div
        id="band-rpg-game-container"
        className="flex-1 flex overflow-hidden outline-none"
        tabIndex={0}
        style={{ backgroundColor: levelBg }}
      >
        {/* Main viewport */}
        <div className="flex-1 flex items-center justify-center relative" style={{ minWidth: 0 }}>
          <div style={{ position: 'relative' }}>
            <TileRenderer
              level={level}
              playerX={state.playerX}
              playerY={state.playerY}
              collectedEntityIds={state.collectedEntityIds}
            />

            {/* Dialogue box overlaid on viewport */}
            {state.activeNpc && (
              <DialogueBox
                npc={state.activeNpc}
                dialogueIndex={state.dialogueIndex}
                onNext={advanceDialogue}
                onClose={closeDialogue}
              />
            )}

            {/* Debug panel */}
            {state.showDebug && isAdmin && (
              <DebugPanel state={state} level={level} />
            )}
          </div>
        </div>

        {/* HUD sidebar */}
        <div
          style={{
            width: 220,
            backgroundColor: 'rgba(0,0,0,0.7)',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            color: 'white',
          }}
        >
          <GameHud
            level={level}
            completedQuests={state.completedQuests}
            completedObjectives={state.completedObjectives}
            inventory={state.inventory}
            notification={state.notification}
          />
        </div>
      </div>
    </div>
  );
}

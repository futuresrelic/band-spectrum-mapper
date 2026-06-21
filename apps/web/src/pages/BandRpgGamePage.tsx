import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import TileRenderer from '../components/bandRpgRuntime/TileRenderer';
import DialogueBox from '../components/bandRpgRuntime/DialogueBox';
import GameHud from '../components/bandRpgRuntime/GameHud';
import DebugPanel from '../components/bandRpgRuntime/DebugPanel';
import CheatPanel from '../components/bandRpgRuntime/CheatPanel';
import { useGameEngine } from '../components/bandRpgRuntime/useGameEngine';
import { bandRpgRuntimeApi } from '../api/bandRpgRuntime';
import { useAuth } from '../contexts/AuthContext';
import { isNpcVisible, isItemSpawned, isExitVisible } from '../components/bandRpgRuntime/WorldEngine';
import type { GameState } from '../components/bandRpgRuntime/useGameEngine';

export default function BandRpgGamePage() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

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
    mutationFn: (partial: Parameters<typeof bandRpgRuntimeApi.saveProgress>[0]) =>
      bandRpgRuntimeApi.saveProgress(partial),
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
      activeQuestIds: gameState.activeQuestIds,
      objectiveProgress: gameState.objectiveProgress,
      unlockedLevelSlugs: gameState.unlockedLevelSlugs,
      openedDoors: gameState.openedDoors,
      activatedSwitches: gameState.activatedSwitches,
      worldState: gameState.worldState,
    });
  }, [saveMutation]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = user?.isAdmin ?? false;

  const {
    state, getWorldSnapshot,
    handleNextLine, handleChoose, handleCloseDlg, handleCloseCheat,
    cheatCompleteQuest, cheatGrantItem, cheatUnlockLevel, cheatTeleport,
    cheatOpenDoor, cheatActivateSwitch,
  } = useGameEngine(
    level ?? null,
    save ?? null,
    handleLevelTransition,
    handleSave,
    isAdmin,
  );

  // Focus so keyboard events fire immediately
  useEffect(() => {
    document.getElementById('band-rpg-game-container')?.focus();
  }, [level]);

  // Filter entities by world conditions
  const worldSnap = getWorldSnapshot();
  const visibleNpcs = useMemo(
    () => level?.npcs.filter(n => isNpcVisible(n, worldSnap)) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level?.npcs, state.activatedSwitches, state.completedQuests, state.unlockedBeats, state.openedDoors],
  );
  const visibleItems = useMemo(
    () => level?.items.filter(i => isItemSpawned(i, worldSnap)) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level?.items, state.activatedSwitches, state.completedQuests, state.unlockedBeats],
  );
  const visibleExits = useMemo(
    () => level?.exits.filter(e => isExitVisible(e, worldSnap)) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level?.exits, state.activatedSwitches, state.completedQuests, state.unlockedBeats, state.unlockedLevelSlugs],
  );

  if (!slug) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-gray-400">No level specified.</p>
          <button onClick={() => navigate('/play/band-rpg')} className="text-indigo-400 hover:text-indigo-300 text-sm">← Band RPG</button>
        </div>
      </Shell>
    );
  }

  if (levelLoading || saveLoading) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 animate-pulse">Loading level…</p>
        </div>
      </Shell>
    );
  }

  if (levelError || !level) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-red-400">Level not found: <code>{slug}</code></p>
          <button onClick={() => navigate('/play/band-rpg')} className="text-indigo-400 hover:text-indigo-300 text-sm">← Band RPG</button>
        </div>
      </Shell>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#0f172a' }}>
      <SiteHeader theme="dark" active="games" />

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/60 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/play/band-rpg')} className="text-gray-500 hover:text-gray-300 text-sm">←</button>
          <span className="text-white font-semibold text-sm">{level.name}</span>
          <span className="text-gray-600 text-xs">/{level.slug}</span>
          {state.activeQuestIds.length > 0 && (
            <span className="text-blue-400 text-xs">⚡ {state.activeQuestIds.length} active</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="text-emerald-400 text-xs">● {user.username ?? user.name ?? 'Player'}</span>}
          {isAdmin && <span className="text-green-500 text-xs opacity-50">F3 debug · F4 cheat</span>}
          {saveMutation.isPending && <span className="text-gray-500 text-xs">Saving…</span>}
        </div>
      </div>

      {/* Game area */}
      <div
        id="band-rpg-game-container"
        className="flex-1 flex overflow-hidden outline-none"
        tabIndex={0}
        style={{ backgroundColor: level.background ?? '#0f172a' }}
      >
        {/* Viewport */}
        <div className="flex-1 flex items-center justify-center relative" style={{ minWidth: 0 }}>
          <div style={{ position: 'relative' }}>
            <TileRenderer
              level={{ ...level, items: visibleItems, exits: visibleExits }}
              playerX={state.playerX}
              playerY={state.playerY}
              collectedEntityIds={state.collectedEntityIds}
              unlockedLevelSlugs={state.unlockedLevelSlugs}
              openedDoors={state.openedDoors}
              activatedSwitches={state.activatedSwitches}
              visibleNpcs={visibleNpcs}
            />

            {/* Dialogue / Beat overlay */}
            {state.dialogueMode !== 'none' && (
              <DialogueBox
                lines={state.dialogueLines}
                index={state.dialogueIndex}
                mode={state.dialogueMode}
                onNext={handleNextLine}
                onClose={handleCloseDlg}
                onChoose={handleChoose}
              />
            )}

            {/* Debug overlay */}
            {state.showDebug && isAdmin && (
              <DebugPanel state={state} level={level} />
            )}

            {/* Cheat panel */}
            {state.showCheatPanel && isAdmin && (
              <CheatPanel
                state={state}
                level={level}
                onCompleteQuest={cheatCompleteQuest}
                onGrantItem={cheatGrantItem}
                onUnlockLevel={cheatUnlockLevel}
                onTeleport={cheatTeleport}
                onOpenDoor={cheatOpenDoor}
                onActivateSwitch={cheatActivateSwitch}
                onClose={handleCloseCheat}
              />
            )}
          </div>
        </div>

        {/* HUD sidebar */}
        <div style={{ width: 220, backgroundColor: 'rgba(0,0,0,0.75)', borderLeft: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <GameHud
            level={level}
            activeQuestIds={state.activeQuestIds}
            completedQuests={state.completedQuests}
            completedObjectives={state.completedObjectives}
            objectiveProgress={state.objectiveProgress}
            inventory={state.inventory}
            notification={state.notification}
            unlockedLevelSlugs={state.unlockedLevelSlugs}
          />
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />
      {children}
    </div>
  );
}

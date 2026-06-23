import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import TileRenderer from '../components/bandRpgRuntime/TileRenderer';
import DialogueBox from '../components/bandRpgRuntime/DialogueBox';
import GameHud from '../components/bandRpgRuntime/GameHud';
import DebugPanel from '../components/bandRpgRuntime/DebugPanel';
import CheatPanel from '../components/bandRpgRuntime/CheatPanel';
import MobileControls from '../components/bandRpgRuntime/MobileControls';
import CompletionReport from '../components/bandRpgRuntime/CompletionReport';
import { useGameEngine } from '../components/bandRpgRuntime/useGameEngine';
import { bandRpgRuntimeApi } from '../api/bandRpgRuntime';
import { adventureProgressApi } from '../api/adventureApi';
import { useAuth } from '../contexts/AuthContext';
import { isNpcVisible, isItemSpawned, isExitVisible } from '../components/bandRpgRuntime/WorldEngine';
import type { GameState } from '../components/bandRpgRuntime/useGameEngine';
import type { Adventure, AdventureProgress } from '../api/adventureApi';

// ── Viewport detection ────────────────────────────────────────────────────────

function useViewport() {
  const [state, setState] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
    touch: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  }));

  useEffect(() => {
    const update = () => setState({
      w: window.innerWidth,
      h: window.innerHeight,
      touch: window.matchMedia('(pointer: coarse)').matches,
    });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return state;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BandRpgGamePage() {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const slug = slugParam ?? searchParams.get('slug') ?? '';
  const adventureId = searchParams.get('adventureId') ?? null;

  const [showCompletion, setShowCompletion] = useState(false);
  const [completionAdventure, setCompletionAdventure] = useState<Adventure | null>(null);
  const [completionProgress, setCompletionProgress] = useState<AdventureProgress | null>(null);
  const [hudOpen, setHudOpen] = useState(false);

  const vp = useViewport();
  // Mobile = touch device OR narrow screen. Compact = short landscape (typical Android/iOS landscape).
  const isMobile = vp.touch || vp.w < 768;
  const isCompact = isMobile && vp.h < 500;

  // Dialogue clearance above mobile controls.
  // Normal mobile D-pad: 3×44 + 2×4 = 140px + 16px edge = 156px. Add 12px gap → 168px.
  // Compact D-pad:       3×38 + 2×3 = 120px + 8px edge  = 128px. Add 8px gap  → 136px.
  const mobileDialogueBottom = isCompact ? 136 : 168;

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 640, h: 480 });
  const gameStateRef = useRef<GameState | null>(null);
  // slugRef lets stable callbacks read the latest level slug without stale closures
  const slugRef = useRef(slug);
  slugRef.current = slug;

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setCanvasSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const { data: adventureDetail } = useQuery({
    queryKey: ['adventure-for-hud', adventureId],
    queryFn: () => adventureProgressApi.get(adventureId!),
    enabled: !!adventureId && !!user,
    staleTime: 300_000,
  });
  const adventureName = adventureDetail?.adventure?.name ?? null;
  // adventureDetailRef lets stable callbacks read latest adventure/quest counts without stale closures
  const adventureDetailRef = useRef(adventureDetail);
  adventureDetailRef.current = adventureDetail;

  const saveMutation = useMutation({
    mutationFn: (partial: Parameters<typeof bandRpgRuntimeApi.saveProgress>[0]) =>
      bandRpgRuntimeApi.saveProgress(partial),
  });

  const progressSyncMutation = useMutation({
    mutationFn: (data: Parameters<typeof adventureProgressApi.sync>[1]) =>
      adventureProgressApi.sync(adventureId!, data),
    onSuccess: ({ progress }) => {
      if (progress.isCompleted && !showCompletion) {
        console.log('[adventure-complete] sync confirmed', {
          adventureId,
          completionPct: progress.completionPct,
          questsCompleted: progress.questsCompleted,
          levelsDiscovered: progress.levelsDiscovered,
          itemsCollected: progress.itemsCollected,
          isCompleted: progress.isCompleted,
        });
        void adventureProgressApi.get(adventureId!).then(({ adventure, progress: freshProgress }) => {
          setCompletionAdventure(adventure);
          setCompletionProgress(freshProgress);
          setShowCompletion(true);
        });
      }
    },
  });

  const handleResetSave = useCallback(async () => {
    await bandRpgRuntimeApi.resetSave();
    window.location.reload();
  }, []);

  const handleLevelTransition = useCallback((targetSlug: string) => {
    if (targetSlug === '__adventure_complete__') {
      if (adventureId) {
        const gs = gameStateRef.current;
        const currentSlug = slugRef.current;

        // Soft gate: warn if there are quests in this adventure the player hasn't completed.
        const totalQuests = adventureDetailRef.current?.adventure._count?.quests ?? 0;
        const completedCount = gs?.completedQuests.length ?? 0;
        if (totalQuests > 0 && completedCount < totalQuests) {
          const remaining = totalQuests - completedCount;
          const ok = window.confirm(
            `You still have ${remaining} quest${remaining !== 1 ? 's' : ''} to complete.\n` +
            `Finishing now will lower your completion score.\n\n` +
            `Complete adventure anyway?`,
          );
          if (!ok) return;
        }

        // Include the current level slug so it counts toward levelsDiscovered.
        // The server merges this with previously-synced levels, so no history is lost.
        const visited = Array.from(new Set([...(gs?.unlockedLevelSlugs ?? []), currentSlug]));

        const payload = {
          levelsDiscovered: visited,
          questsCompleted: completedCount,
          itemsCollected: gs?.inventory.length ?? 0,
          isCompleted: true as const,
        };
        console.log('[adventure-complete] final sync payload', {
          adventureId,
          currentSlug,
          levelsDiscovered: payload.levelsDiscovered,
          questsCompleted: payload.questsCompleted,
          itemsCollected: payload.itemsCollected,
        });
        progressSyncMutation.mutate(payload);
      }
      return;
    }
    const params = adventureId ? `?adventureId=${encodeURIComponent(adventureId)}` : '';
    navigate(`/play/band-rpg/game/${encodeURIComponent(targetSlug)}${params}`);
  }, [navigate, adventureId, progressSyncMutation]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReplay = useCallback(async () => {
    if (!adventureId) return;
    await adventureProgressApi.restart(adventureId);
    await bandRpgRuntimeApi.resetSave();
    navigate(`/play/band-rpg/adventures/${encodeURIComponent(adventureId)}`);
  }, [adventureId, navigate]);

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
    if (adventureId) {
      // Include the current level slug in levelsDiscovered so each level visit is tracked.
      // The server merges with existing, so levels accumulate across the whole adventure.
      const visited = Array.from(new Set([...gameState.unlockedLevelSlugs, levelSlug]));
      progressSyncMutation.mutate({
        levelsDiscovered: visited,
        questsCompleted: gameState.completedQuests.length,
        itemsCollected: gameState.inventory.length,
        isCompleted: false,
      });
    }
  }, [saveMutation, progressSyncMutation, adventureId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = user?.isAdmin ?? false;

  const {
    state, getWorldSnapshot,
    handleMove, handleInteract,
    handleNextLine, handleChoose, handleCloseDlg, handleCloseCheat,
    handleToggleDebug, handleToggleCheatPanel,
    cheatCompleteQuest, cheatGrantItem, cheatUnlockLevel, cheatTeleport,
    cheatOpenDoor, cheatActivateSwitch,
  } = useGameEngine(
    level ?? null,
    save ?? null,
    handleLevelTransition,
    handleSave,
    isAdmin,
  );

  // Keep ref in sync so handleLevelTransition can read current state without stale closure
  gameStateRef.current = state;

  useEffect(() => {
    document.getElementById('band-rpg-game-container')?.focus();
  }, [level]);

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

  const hudProps = {
    level,
    adventureName,
    activeQuestIds: state.activeQuestIds,
    completedQuests: state.completedQuests,
    completedObjectives: state.completedObjectives,
    objectiveProgress: state.objectiveProgress,
    inventory: state.inventory,
    notification: state.notification,
    unlockedLevelSlugs: state.unlockedLevelSlugs,
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: '100dvh', backgroundColor: '#0f172a' }}
    >
      {showCompletion && completionAdventure && completionProgress && (
        <CompletionReport
          adventure={completionAdventure}
          progress={completionProgress}
          onDismiss={() => setShowCompletion(false)}
          onReplay={handleReplay}
        />
      )}

      <SiteHeader theme="dark" active="games" />

      {/* Title bar — compact on short landscape screens */}
      <div
        className={`flex items-center justify-between px-3 bg-black/60 border-b border-gray-800 shrink-0 ${isCompact ? 'py-1' : 'py-2'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate(adventureId ? `/play/band-rpg/adventures/${adventureId}` : '/play/band-rpg')}
            className="text-gray-500 hover:text-gray-300 text-sm shrink-0"
          >←</button>
          {adventureName && (
            <span className="text-indigo-400/70 text-xs hidden sm:block truncate max-w-[120px]">{adventureName}</span>
          )}
          {adventureName && <span className="text-gray-700 text-xs hidden sm:block">›</span>}
          <span className="text-white font-semibold text-sm truncate">{level.name}</span>
          {!isCompact && <span className="text-gray-700 text-xs hidden sm:block shrink-0">/{level.slug}</span>}
          {state.activeQuestIds.length > 0 && (
            <span className="text-blue-400 text-xs shrink-0">⚡ {state.activeQuestIds.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {user && <span className="text-emerald-400 text-xs">● {user.username ?? user.name ?? 'Player'}</span>}
          {isAdmin && !isCompact && <span className="text-green-500 text-xs opacity-50">F3 · F4</span>}
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
        {/* ── Canvas + overlay ──────────────────────────────────────────── */}
        <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden" style={{ minWidth: 0 }}>

          {/* Canvas fills the entire game area — viewport derived from container size */}
          <TileRenderer
            level={{ ...level, items: visibleItems, exits: visibleExits }}
            playerX={state.playerX}
            playerY={state.playerY}
            collectedEntityIds={state.collectedEntityIds}
            unlockedLevelSlugs={state.unlockedLevelSlugs}
            openedDoors={state.openedDoors}
            activatedSwitches={state.activatedSwitches}
            visibleNpcs={visibleNpcs}
            viewportW={canvasSize.w}
            viewportH={canvasSize.h}
          />

          {/* Admin panels — positioned absolute within game area */}
          {state.showDebug && isAdmin && (
            <DebugPanel state={state} level={level} viewportW={canvasSize.w} viewportH={canvasSize.h} />
          )}
          {state.showCheatPanel && isAdmin && (
            <CheatPanel
              state={state}
              level={level}
              adventureDetail={adventureDetail ?? null}
              onCompleteQuest={cheatCompleteQuest}
              onGrantItem={cheatGrantItem}
              onUnlockLevel={cheatUnlockLevel}
              onTeleport={cheatTeleport}
              onOpenDoor={cheatOpenDoor}
              onActivateSwitch={cheatActivateSwitch}
              onResetSave={handleResetSave}
              onClose={handleCloseCheat}
            />
          )}

          {/* Overlay — covers the full game area; dialogue + controls live here */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }}>

            {/* Mobile admin shortcuts — F3/F4 not available on touch devices */}
            {isMobile && isAdmin && (
              <div style={{
                pointerEvents: 'auto',
                position: 'absolute',
                top: `calc(env(safe-area-inset-top, 0px) + 8px)`,
                left: `calc(env(safe-area-inset-left, 0px) + 8px)`,
                display: 'flex',
                gap: 6,
                zIndex: 60,
              }}>
                <button
                  onClick={handleToggleDebug}
                  style={{
                    backgroundColor: state.showDebug ? 'rgba(34,197,94,0.35)' : 'rgba(0,0,0,0.65)',
                    border: `1px solid ${state.showDebug ? 'rgba(34,197,94,0.7)' : 'rgba(34,197,94,0.3)'}`,
                    borderRadius: 8,
                    padding: isCompact ? '3px 8px' : '4px 10px',
                    color: '#22c55e',
                    fontSize: isCompact ? 11 : 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  aria-label="Toggle Debug (F3)"
                >
                  🐞
                </button>
                <button
                  onClick={handleToggleCheatPanel}
                  style={{
                    backgroundColor: state.showCheatPanel ? 'rgba(34,197,94,0.35)' : 'rgba(0,0,0,0.65)',
                    border: `1px solid ${state.showCheatPanel ? 'rgba(34,197,94,0.7)' : 'rgba(34,197,94,0.3)'}`,
                    borderRadius: 8,
                    padding: isCompact ? '3px 8px' : '4px 10px',
                    color: '#22c55e',
                    fontSize: isCompact ? 11 : 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  aria-label="Toggle Tools (F4)"
                >
                  🛠
                </button>
              </div>
            )}

            {/* Dialogue box — above controls on mobile, at bottom on desktop */}
            {state.dialogueMode !== 'none' && (
              <div style={{
                pointerEvents: 'auto',
                position: 'absolute',
                bottom: isMobile
                  ? `calc(env(safe-area-inset-bottom, 0px) + ${mobileDialogueBottom}px)`
                  : 0,
                left: 0,
                right: 0,
                padding: '0 12px 12px',
              }}>
                <DialogueBox
                  lines={state.dialogueLines}
                  index={state.dialogueIndex}
                  mode={state.dialogueMode}
                  onNext={handleNextLine}
                  onClose={handleCloseDlg}
                  onChoose={handleChoose}
                />
              </div>
            )}

            {/* Mobile controls — D-pad bottom-left, [E] bottom-right */}
            {isMobile && (
              <MobileControls
                onMove={handleMove}
                onInteract={handleInteract}
                compact={isCompact}
              />
            )}

            {/* Mobile HUD toggle button — top-right */}
            {isMobile && !hudOpen && (
              <button
                onClick={() => setHudOpen(true)}
                style={{
                  pointerEvents: 'auto',
                  position: 'absolute',
                  top: `calc(env(safe-area-inset-top, 0px) + 8px)`,
                  right: `calc(env(safe-area-inset-right, 0px) + 8px)`,
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  border: '1px solid rgba(99,102,241,0.45)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  color: '#a5b4fc',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  maxWidth: 160,
                }}
              >
                <span>📋</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {state.activeQuestIds.length > 0
                    ? `⚡${state.activeQuestIds.length} · ${level.name}`
                    : level.name
                  }
                </span>
              </button>
            )}

            {/* Mobile HUD drawer — slides over canvas */}
            {isMobile && hudOpen && (
              <div
                style={{
                  pointerEvents: 'auto',
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(0,0,0,0.93)',
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 10,
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  flexShrink: 0,
                }}>
                  <span style={{ color: '#a5b4fc', fontSize: 13, fontWeight: 600 }}>
                    {adventureName ?? level.name}
                  </span>
                  <button
                    onClick={() => setHudOpen(false)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#64748b', fontSize: 20, lineHeight: 1,
                      padding: '0 4px',
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <GameHud {...hudProps} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Desktop HUD sidebar (hidden on mobile) ────────────────────── */}
        {!isMobile && (
          <div style={{
            width: 220,
            backgroundColor: 'rgba(0,0,0,0.75)',
            borderLeft: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
            overflowY: 'auto',
          }}>
            <GameHud {...hudProps} />
          </div>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-gray-950 text-white" style={{ height: '100dvh' }}>
      <SiteHeader theme="dark" active="games" />
      {children}
    </div>
  );
}

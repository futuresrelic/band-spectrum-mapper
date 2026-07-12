/**
 * Headliner — Concert Viewport (Phase Z.17.14 Part C, extended Z.17.17)
 *
 * The visual heart of Headliner: stage -> crowd -> Concert Pulse, laid
 * out top to bottom. Everything here is a presentation-layer read of
 * ConcertVisualState (itself a pure projection of server-sent data) plus
 * admin-editable CrowdVisualConfig — nothing in this file computes a
 * score, a faction reaction, or a candidate ranking.
 *
 * Crowd Neighborhoods: the engine only exposes faction-LEVEL reactions
 * (no per-seat/per-section data), so each faction is deterministically
 * assigned one visual zone rather than inventing section-level metrics:
 *   casual -> Rear Floor, hardcore -> Pit, deepCut -> Left Floor,
 *   progHeads -> Right Floor, firstTimers -> Balcony.
 * This mapping is fixed and documented, not derived from any new engine
 * data — see docs/ARCHITECTURE.md's "Crowd Neighborhoods" section.
 *
 * Render modes (dots/silhouettes/pixel/minimal) all share the same
 * underlying per-faction data; only the spectator shape/fallback differs.
 * The viewport is decorative (aria-hidden) — everything it depicts is
 * already stated in text elsewhere (ConcertPulse, CrowdRead), consistent
 * with "when the viewport is disabled, all information still exists in
 * text/meters."
 */
import type { FactionId } from '../../api/headliner';
import type { CrowdVisualConfig } from '../../api/crowdVisualConfig';
import type { ConcertVisualState } from './concertVisualState';
import type { CrowdMemory } from './crowdMemory';
import { warmthToGlowOpacity } from './crowdMemory';
import { computeLightingSignals } from './concertLighting';
import { FACTION_LABELS } from './factionLabels';
import ConcertStage from './ConcertStage';

const FACTION_ORDER: readonly FactionId[] = ['casual', 'hardcore', 'deepCut', 'progHeads', 'firstTimers'];
const FACTION_DOT_COLOR: Record<FactionId, string> = {
  casual: '#38bdf8', hardcore: '#fb7185', deepCut: '#a78bfa', progHeads: '#facc15', firstTimers: '#4ade80',
};

/** Documented, fixed faction -> visual-zone mapping (see file header). Presentation only. */
export const FACTION_NEIGHBORHOOD: Record<FactionId, string> = {
  hardcore: 'Pit', casual: 'Rear Floor', deepCut: 'Left Floor', progHeads: 'Right Floor', firstTimers: 'Balcony',
};

type SpectatorState = 'standing' | 'active' | 'lowEnergy' | 'walkout';

function spectatorState(direction: 'up' | 'down' | 'flat', atWalkoutRisk: boolean): SpectatorState {
  if (atWalkoutRisk) return 'walkout';
  if (direction === 'up') return 'active';
  if (direction === 'down') return 'lowEnergy';
  return 'standing';
}

function spriteFor(config: CrowdVisualConfig, state: SpectatorState): string | null {
  if (state === 'active') return config.activeSpriteUrl;
  if (state === 'lowEnergy') return config.lowEnergySpriteUrl;
  if (state === 'walkout') return config.walkoutSpriteUrl;
  return config.standingSpriteUrl;
}

function Spectator({
  faction, state, config, delayMs,
}: { faction: FactionId; state: SpectatorState; config: CrowdVisualConfig; delayMs: number }) {
  const sprite = spriteFor(config, state);
  const size = config.spectatorSize;
  const animate = config.animationsEnabled && config.animationIntensity !== 'off';
  const bobClass = animate
    ? state === 'active'
      ? 'animate-[headliner-bob_1.1s_ease-in-out_infinite]'
      : state === 'lowEnergy'
        ? 'animate-[headliner-bob_2.4s_ease-in-out_infinite]'
        : ''
    : '';

  if (state === 'walkout' && !sprite) {
    // No literal per-song attendance count exists — an empty slot is the honest way to show "gone," not a shrinking number.
    return <span style={{ width: size, height: size }} aria-hidden />;
  }

  if (sprite) {
    const isPixel = config.crowdRenderMode === 'pixel';
    return (
      <img
        src={sprite}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={`motion-reduce:animate-none ${bobClass}`}
        style={{
          width: size, height: size, animationDelay: `${delayMs}ms`, opacity: state === 'walkout' ? 0.25 : 1,
          imageRendering: isPixel ? 'pixelated' : undefined,
        }}
      />
    );
  }

  const shapeClass = config.crowdRenderMode === 'silhouettes' ? 'rounded-t-full' : config.crowdRenderMode === 'pixel' ? 'rounded-none' : 'rounded-full';
  const height = config.crowdRenderMode === 'silhouettes' ? size * 1.6 : size;

  return (
    <span
      aria-hidden
      className={`inline-block motion-reduce:animate-none ${shapeClass} ${bobClass}`}
      style={{
        width: size, height,
        backgroundColor: FACTION_DOT_COLOR[faction],
        opacity: state === 'walkout' ? 0.25 : state === 'lowEnergy' ? 0.55 : 1,
        animationDelay: `${delayMs}ms`,
      }}
    />
  );
}

function FactionZone({
  faction, count, state, config, memoryWarmth,
}: {
  faction: FactionId; count: number; state: SpectatorState; config: CrowdVisualConfig; memoryWarmth: number;
}) {
  const glowOpacity = config.crowdMemoryEnabled ? warmthToGlowOpacity(memoryWarmth) : 0.5;
  const glowColor = memoryWarmth >= 0 ? 'rgba(74,222,128,' : 'rgba(251,113,133,';
  return (
    <div
      className="rounded-xl p-2 flex flex-col items-center gap-1 transition-[box-shadow] duration-1000"
      style={{
        boxShadow: config.crowdMemoryEnabled ? `0 0 ${12 + glowOpacity * 20}px ${glowColor}${glowOpacity * 0.35})` : undefined,
      }}
    >
      <div className="flex flex-wrap gap-1.5 justify-center max-w-[9rem]">
        {Array.from({ length: count }, (_, i) => (
          <Spectator key={i} faction={faction} state={state} config={config} delayMs={(i * 3 % 20) * 60} />
        ))}
      </div>
      <span className="text-[9px] text-gray-500 uppercase tracking-wide">{FACTION_NEIGHBORHOOD[faction]}</span>
    </div>
  );
}

const VENUE_BACKDROP_GRADIENT: Record<CrowdVisualConfig['venuePreset'], string> = {
  club: 'linear-gradient(180deg, #1c1917 0%, #0c0a09 100%)',
  arena: 'linear-gradient(180deg, #1e1b4b 0%, #0b0a1e 100%)',
  festival: 'linear-gradient(180deg, #164e63 0%, #0c1e26 100%)',
  historic: 'linear-gradient(180deg, #422006 0%, #1c0f02 100%)',
};

export default function ConcertViewport({
  visualState, config, crowdMemory, reducedMotion, cameraMotionEnabled,
}: {
  visualState: ConcertVisualState;
  config: CrowdVisualConfig;
  crowdMemory: CrowdMemory;
  reducedMotion: boolean;
  cameraMotionEnabled: boolean;
}) {
  const factionsById = new Map(visualState.factions.map((f) => [f.id, f]));
  const totalDots = Math.max(5, Math.round(config.spectatorDensity));
  const lighting = config.lightingEnabled ? computeLightingSignals(visualState.currentSongAxis) : null;
  const cameraActive = cameraMotionEnabled && !reducedMotion;

  if (config.crowdRenderMode === 'minimal') {
    return (
      <div aria-hidden className="rounded-2xl border border-gray-800 bg-gray-950 p-4 text-center">
        <span className={`inline-block w-3 h-3 rounded-full motion-reduce:animate-none ${!reducedMotion ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: visualState.momentumDirection === 'rising' ? '#4ade80' : visualState.momentumDirection === 'falling' ? '#fb7185' : '#9ca3af' }}
        />
        <p className="text-xs text-gray-500 mt-2">Minimal view — pulse only.</p>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="rounded-2xl border border-gray-800 overflow-hidden relative"
      style={{ opacity: config.viewportOpacity }}
    >
      <style>{`
        @keyframes headliner-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes headliner-camera { 0%, 100% { transform: scale(1) translateY(0); } 50% { transform: scale(1.015) translateY(-2px); } }
      `}</style>
      <div
        className="motion-reduce:animate-none"
        style={{ animation: cameraActive ? 'headliner-camera 18s ease-in-out infinite' : undefined }}
      >
        <ConcertStage
          activeSlots={config.activePerformerSlots}
          sprites={config.performerSprites}
          backdropUrl={config.stageBackdropUrl}
          animate={config.animationsEnabled && !reducedMotion}
          idleMotionIntensity={config.idleMotionIntensity}
        />

        <div
          className="relative p-4"
          style={{
            backgroundImage: config.viewportBackgroundUrl ? `url(${config.viewportBackgroundUrl})` : VENUE_BACKDROP_GRADIENT[config.venuePreset],
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {lighting && (
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-[3000ms]"
              style={{
                background: `radial-gradient(circle at 50% 0%, ${lighting.warmthColor}55, transparent 60%)`,
                opacity: 0.4 + lighting.glowIntensity * 0.4,
              }}
            />
          )}
          {lighting && config.fogEnabled && (
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-[3000ms]"
              style={{ background: 'linear-gradient(180deg, rgba(226,232,240,0.15), transparent 70%)', opacity: lighting.fogOpacity }}
            />
          )}

          <div className="relative flex flex-wrap gap-2 justify-center">
            {FACTION_ORDER.map((faction) => {
              const summary = factionsById.get(faction);
              const share = summary?.crowdShare ?? 0.2;
              const count = config.showFactionClusters
                ? Math.max(1, Math.round(totalDots * share))
                : Math.round(totalDots / FACTION_ORDER.length);
              const state = spectatorState(summary?.direction ?? 'flat', summary?.atWalkoutRisk ?? false);
              return (
                <FactionZone
                  key={faction}
                  faction={faction}
                  count={count}
                  state={state}
                  config={config}
                  memoryWarmth={crowdMemory[faction]?.warmth ?? 0}
                />
              );
            })}
          </div>

          {config.stageForegroundUrl && (
            <img src={config.stageForegroundUrl} alt="" aria-hidden loading="lazy" decoding="async" className="w-full mt-2 rounded-lg relative" />
          )}
        </div>
      </div>
      <p className="sr-only">
        Crowd faction key: {FACTION_ORDER.map((f) => `${FACTION_LABELS[f]} (${FACTION_NEIGHBORHOOD[f]})`).join(', ')}.
      </p>
    </div>
  );
}

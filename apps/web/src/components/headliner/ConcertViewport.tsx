/**
 * Headliner — Concert Viewport (Creative Bible §14, Part C)
 *
 * A lightweight, always-CSS-capable audience view: rows of small dots
 * (or configured sprite images) grouped into the five crowd factions.
 * No 3D, no per-person simulation — just enough movement to make the
 * room feel alive, driven entirely by the same Concert Pulse data the
 * text widgets already show. Works with zero configuration (plain
 * circles); an admin can swap in sprite images per spectator state via
 * the Crowd Visual Config below without code changes.
 *
 * The viewport is decorative — everything it communicates (momentum,
 * walkout risk, split room, recovery) is already stated in text by
 * ConcertPulse, so it's marked aria-hidden rather than duplicating a
 * textual description of moving dots.
 */
import type { ConcertPulseState, FactionId } from '../../api/headliner';
import type { CrowdVisualConfig } from '../../api/crowdVisualConfig';
import { FACTION_LABELS } from './factionLabels';

const FACTION_ORDER: readonly FactionId[] = ['casual', 'hardcore', 'deepCut', 'progHeads', 'firstTimers'];
const FACTION_DOT_COLOR: Record<FactionId, string> = {
  casual: '#38bdf8', hardcore: '#fb7185', deepCut: '#a78bfa', progHeads: '#facc15', firstTimers: '#4ade80',
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
    return (
      <img
        src={sprite}
        alt=""
        aria-hidden
        className={`motion-reduce:animate-none ${bobClass}`}
        style={{ width: size, height: size, animationDelay: `${delayMs}ms`, opacity: state === 'walkout' ? 0.25 : 1 }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-block rounded-full motion-reduce:animate-none ${bobClass}`}
      style={{
        width: size, height: size,
        backgroundColor: FACTION_DOT_COLOR[faction],
        opacity: state === 'walkout' ? 0.25 : state === 'lowEnergy' ? 0.55 : 1,
        animationDelay: `${delayMs}ms`,
      }}
    />
  );
}

export default function ConcertViewport({ pulse, config }: { pulse: ConcertPulseState | null; config: CrowdVisualConfig }) {
  const factionsById = new Map((pulse?.factions ?? []).map((f) => [f.id, f]));
  const totalDots = Math.max(5, Math.round(config.spectatorDensity));

  return (
    <div
      aria-hidden
      className="rounded-2xl border border-gray-800 overflow-hidden p-4"
      style={{
        opacity: config.viewportOpacity,
        backgroundImage: config.viewportBackgroundUrl ? `url(${config.viewportBackgroundUrl})` : undefined,
        backgroundColor: config.viewportBackgroundUrl ? undefined : '#111827',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <style>{'@keyframes headliner-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }'}</style>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {FACTION_ORDER.flatMap((faction, factionIndex) => {
          const summary = factionsById.get(faction);
          const share = summary?.crowdShare ?? 0.2;
          const count = config.showFactionClusters
            ? Math.max(1, Math.round(totalDots * share))
            : Math.round(totalDots / FACTION_ORDER.length);
          const state = spectatorState(summary?.direction ?? 'flat', summary?.atWalkoutRisk ?? false);
          return Array.from({ length: count }, (_, i) => (
            <Spectator
              key={`${faction}-${i}`}
              faction={faction}
              state={state}
              config={config}
              delayMs={((factionIndex * 7 + i * 3) % 20) * 60}
            />
          ));
        })}
      </div>
      {config.stageForegroundUrl && (
        <img src={config.stageForegroundUrl} alt="" aria-hidden className="w-full mt-2 rounded-lg" />
      )}
      <p className="sr-only">Crowd faction key: {FACTION_ORDER.map((f) => FACTION_LABELS[f]).join(', ')}.</p>
    </div>
  );
}

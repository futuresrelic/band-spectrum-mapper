/**
 * Headliner — Crowd Memory (Phase Z.17.17)
 *
 * A slowly decaying, per-faction VISUAL-ONLY history of recent audience
 * reaction. It does not change scoring — it's a rendering-time smoothing
 * layer over ConcertPulseState.factions, so a faction's warmth doesn't
 * jump instantly when a new pulse arrives, and doesn't vanish instantly
 * when the reaction passes either. The only inputs are the same
 * FactionPulseSummary values the pulse already exposes (real
 * direction/intensity, honestly derived from engine state) — nothing
 * here reads or influences EngineState/candidateValue/scoring.
 *
 * Deterministic input, real-time decay: given the same sequence of pulse
 * readings and elapsed times, stepCrowdMemory always produces the same
 * output (it's a pure function) — but the elapsed-time input itself
 * comes from the render loop's wall clock, exactly as the spec allows
 * ("visual smoothing may use elapsed animation time").
 */
import type { FactionId, FactionPulseSummary, PulseIntensity } from '../../api/headliner';

export const FACTION_ORDER: readonly FactionId[] = ['casual', 'hardcore', 'deepCut', 'progHeads', 'firstTimers'];

export interface FactionMemory {
  /** -100..100. Positive = warm/energized, negative = cold/subdued. Decays toward 0 over time. */
  warmth: number;
}

export type CrowdMemory = Record<FactionId, FactionMemory>;

export function initialCrowdMemory(): CrowdMemory {
  const memory = {} as CrowdMemory;
  for (const f of FACTION_ORDER) memory[f] = { warmth: 0 };
  return memory;
}

function intensityToTarget(intensity: PulseIntensity): number {
  if (intensity === 'high') return 85;
  if (intensity === 'medium') return 45;
  return 15;
}

function targetWarmthFor(faction: FactionPulseSummary | undefined): number {
  if (!faction) return 0;
  if (faction.atWalkoutRisk) return -90;
  const magnitude = intensityToTarget(faction.intensity);
  if (faction.direction === 'up') return magnitude;
  if (faction.direction === 'down') return -magnitude;
  return 0;
}

/**
 * Configurable decay/response tuning — presentation-only constants (see
 * CrowdVisualConfig's crowdMemoryDecayMs). Not gameplay tuning.
 */
export interface CrowdMemoryTuning {
  /** Milliseconds for existing warmth to decay halfway back to neutral. */
  decayHalfLifeMs: number;
  /** 0-1: how much of the gap to the new target closes per step (independent of decay) — keeps reactions from teleporting to full warmth instantly. */
  responsiveness: number;
}

export const DEFAULT_CROWD_MEMORY_TUNING: CrowdMemoryTuning = {
  decayHalfLifeMs: 9000,
  responsiveness: 0.3,
};

/**
 * Pure step function: decays existing warmth toward neutral over
 * `elapsedMs`, then nudges every faction a fraction of the way toward
 * its current pulse-derived target. Call this once per animation frame
 * (small elapsedMs, continuous decay) or once per new pulse (larger
 * elapsedMs since the last pick) — both are valid, since it's a pure
 * function of (previous, factions, elapsed).
 */
export function stepCrowdMemory(
  previous: CrowdMemory,
  factions: readonly FactionPulseSummary[],
  elapsedMs: number,
  tuning: CrowdMemoryTuning = DEFAULT_CROWD_MEMORY_TUNING,
): CrowdMemory {
  const bySelf = new Map(factions.map((f) => [f.id, f]));
  const decayFactor = Math.pow(0.5, Math.max(0, elapsedMs) / tuning.decayHalfLifeMs);
  const next = {} as CrowdMemory;
  for (const id of FACTION_ORDER) {
    const prevWarmth = previous[id]?.warmth ?? 0;
    const decayed = prevWarmth * decayFactor;
    const target = targetWarmthFor(bySelf.get(id));
    const nudged = decayed + (target - decayed) * tuning.responsiveness;
    next[id] = { warmth: Math.max(-100, Math.min(100, nudged)) };
  }
  return next;
}

/** 0-1 convenience for rendering opacity/glow intensity from a warmth value. */
export function warmthToGlowOpacity(warmth: number): number {
  return Math.max(0, Math.min(1, (warmth + 100) / 200));
}

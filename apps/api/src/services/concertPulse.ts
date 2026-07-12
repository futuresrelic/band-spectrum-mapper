/**
 * Headliner — Concert Pulse (Creative Bible §14, Phase Z.17.14 Part C)
 *
 * A presentation/interpretation layer over values the engine already
 * tracks — not a new gameplay formula. Distills the current EngineState
 * (plus the current pick's Live Reaction Log entries) into a small,
 * typed snapshot the Concert Pulse UI renders: momentum direction and
 * intensity, new show highs/lows, recovery after a decline, a split-room
 * read, walkout risk, the current show phase, and a deterministic
 * relevance ranking over the five factions so the UI can show the three
 * most relevant ones persistently (Bible §14 "no more than three
 * always-visible meters") while the full five stay available on demand.
 *
 * Per-song attendance/satisfaction are deliberately NOT part of this
 * state: the engine has no per-song attendance or satisfaction figure to
 * expose (only the running audienceRetention metric and, for Daily runs,
 * an end-of-show finalAttendance/satisfaction) — inventing a per-song
 * value here would be exactly the fabrication Creative Bible Part B
 * forbids. "Faction explicitly targeted by venue/context" (one of the
 * relevance factors named for the compact faction display) also isn't
 * implemented: ShowBundle carries no such signal today, so relevance
 * uses only the three factors the engine can honestly support (share of
 * crowd, this-song delta, deviation from neutral).
 */

import { FACTIONS, type EngineState, type FactionId } from './concertEngine.js';
import { computeShowPositions, type ShowPhaseLabel } from './concertShowHistory.js';
import type { ReactionLogEntry } from './liveReactionLog.js';

export type MomentumDirection = 'rising' | 'falling' | 'steady';
export type PulseIntensity = 'low' | 'medium' | 'high';

export interface FactionPulseSummary {
  id: FactionId;
  direction: 'up' | 'down' | 'flat';
  intensity: PulseIntensity;
  /** In-crowd walkout territory right now (momentum at/below the walkout threshold) — never hidden by ranking. */
  atWalkoutRisk: boolean;
  /** 0 = most relevant. Stable, deterministic order — never randomized, never hidden. */
  relevanceRank: number;
  /** This faction's real share of the crowd (ShowRules.factionShare, 0-1) — for proportional crowd-viewport sizing, not a new value. */
  crowdShare: number;
}

export interface ConcertPulseState {
  hasPlayedASong: boolean;
  momentumDirection: MomentumDirection;
  momentumIntensity: PulseIntensity;
  isNewShowHigh: boolean;
  isNewShowLow: boolean;
  /** Momentum is rising after 2+ consecutive songs of decline. */
  isRecovery: boolean;
  /** This song's faction reactions spread wide — some factions loved it, others didn't. */
  isSplitRoom: boolean;
  /** True if ANY faction's momentum is currently at/below the walkout threshold. */
  walkoutRisk: boolean;
  phase: ShowPhaseLabel | null;
  /** The Live Reaction Log's top-priority line for this song, if any — the "short live reaction line" the pulse surfaces. */
  topLine: string | null;
  /** All 5 factions, ranked by relevance (see rankFactionsByRelevance) — callers slice the top N for a compact view. */
  factions: FactionPulseSummary[];
}

/**
 * Presentation-only thresholds — decide what the pulse SHOWS, never what
 * the engine computes. Reuses liveReactionLog.ts's walkout threshold
 * (which itself reuses the existing explainReaction "checked out" band)
 * rather than inventing a second number for the same concept.
 */
const PULSE_TUNING = {
  walkoutMomentumThreshold: -45,
  splitRoomReactionSpread: 60, // spread (max-min) across the 5 factions' per-song reaction scores that counts as a "split room"
  intensityMedium: 6,
  intensityHigh: 15,
  /** Relevance score weights — share of crowd, this-song delta, deviation from neutral. */
  relevanceShareWeight: 100,
  relevanceDeltaWeight: 3,
  relevanceMomentumWeight: 1,
  /** Any faction at/below the walkout threshold is forced to the top of the ranking — a warning is never hidden by ranking. */
  walkoutRelevanceBoost: 100_000,
} as const;

function classifyIntensity(absValue: number): PulseIntensity {
  if (absValue >= PULSE_TUNING.intensityHigh) return 'high';
  if (absValue >= PULSE_TUNING.intensityMedium) return 'medium';
  return 'low';
}

/**
 * Deterministic relevance ranking for the compact faction display: largest
 * share of the crowd, largest this-song delta, and strongest deviation
 * from neutral momentum — ties broken by FACTIONS' fixed declared order,
 * never randomly. A faction currently at walkout risk is always ranked
 * first, regardless of the other factors, so a real warning can never be
 * pushed out of the visible set.
 */
export function rankFactionsByRelevance(state: EngineState): FactionPulseSummary[] {
  const lastEntry = state.history[state.history.length - 1] ?? null;
  const factionShare = state.bundle.rules.factionShare;

  const scored = FACTIONS.map((f, declaredIndex) => {
    const momentum = state.factionMomentum[f.id];
    const delta = lastEntry ? lastEntry.factionDeltas[f.id].delta : 0;
    const atWalkoutRisk = momentum <= PULSE_TUNING.walkoutMomentumThreshold;
    const direction: FactionPulseSummary['direction'] = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
    const intensity = classifyIntensity(Math.abs(delta));
    const relevanceScore = factionShare[f.id] * PULSE_TUNING.relevanceShareWeight
      + Math.abs(delta) * PULSE_TUNING.relevanceDeltaWeight
      + Math.abs(momentum) * PULSE_TUNING.relevanceMomentumWeight
      + (atWalkoutRisk ? PULSE_TUNING.walkoutRelevanceBoost : 0);
    return { id: f.id, direction, intensity, atWalkoutRisk, relevanceScore, declaredIndex };
  });

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore || a.declaredIndex - b.declaredIndex);
  return scored.map((s, rank) => ({
    id: s.id, direction: s.direction, intensity: s.intensity, atWalkoutRisk: s.atWalkoutRisk, relevanceRank: rank,
    crowdShare: factionShare[s.id],
  }));
}

/** Builds the current Concert Pulse snapshot from the engine state and (optionally) this pick's Live Reaction Log. */
export function computeConcertPulse(state: EngineState, reactionLog: readonly ReactionLogEntry[] = []): ConcertPulseState {
  const history = state.history;
  const lastEntry = history[history.length - 1] ?? null;
  const positions = computeShowPositions(state);
  const lastPosition = positions[positions.length - 1] ?? null;

  const momentumDirection: MomentumDirection = !lastEntry
    ? 'steady'
    : lastEntry.crowdEnergyDelta > 0.5 ? 'rising' : lastEntry.crowdEnergyDelta < -0.5 ? 'falling' : 'steady';
  const momentumIntensity = classifyIntensity(Math.abs(lastEntry?.crowdEnergyDelta ?? 0));

  const isRecovery = history.length >= 3
    && history[history.length - 3]!.crowdEnergyDelta < 0
    && history[history.length - 2]!.crowdEnergyDelta < 0
    && (lastEntry?.crowdEnergyDelta ?? 0) > 0;

  const reactionScores = lastEntry ? FACTIONS.map((f) => lastEntry.factionReactionScores[f.id]) : [];
  const isSplitRoom = reactionScores.length > 0
    && (Math.max(...reactionScores) - Math.min(...reactionScores)) >= PULSE_TUNING.splitRoomReactionSpread;

  return {
    hasPlayedASong: history.length > 0,
    momentumDirection,
    momentumIntensity,
    isNewShowHigh: lastEntry?.isNewHighEnergy ?? false,
    isNewShowLow: lastEntry?.isNewLowEnergy ?? false,
    isRecovery,
    isSplitRoom,
    walkoutRisk: FACTIONS.some((f) => state.factionMomentum[f.id] <= PULSE_TUNING.walkoutMomentumThreshold),
    phase: lastPosition?.phase ?? null,
    topLine: reactionLog[0]?.text ?? null,
    factions: rankFactionsByRelevance(state),
  };
}

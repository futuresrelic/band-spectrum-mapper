/**
 * Headliner — ConcertVisualState adapter (Phase Z.17.17)
 *
 * A pure, read-only projection of data the client ALREADY receives from
 * the server (ConcertPulseState, the latest per-song metrics snapshot,
 * the last pick result, the accumulated Live Reaction Log, and a little
 * screen state the page already tracks) into one small typed object the
 * viewport renders from. No gameplay calculation lives here — this file
 * never computes a score, a faction reaction, or a candidate ranking; it
 * only reshapes numbers the engine already produced for presentation.
 *
 * Flow: Headliner engine state (server) -> PickResponse (pulse,
 * metricsSnapshot, reactionLog, result) -> this adapter -> viewport
 * renderer. The adapter also does NOT fabricate anything the server
 * hasn't sent: fields the server can't honestly support are `null`
 * (e.g. every metric before the first song is played), never a guessed
 * number.
 *
 * "satisfaction" uses audienceRetention as the closest existing metric —
 * there is no separate mid-show "satisfaction" figure in the engine (only
 * Daily's end-of-show satisfaction, which isn't per-song). Documented
 * here rather than silently relabeled.
 */
import type {
  Axis, ConcertPulseState, FactionPulseSummary, PickResult, ReactionLogEntry, TrackType,
} from '../../api/headliner';

export type EncoreVisualState = 'not_yet' | 'building' | 'choosing' | 'playing' | 'declined';

export interface ConcertVisualMetrics {
  satisfaction: number | null;
  authenticity: number | null;
  pacing: number | null;
  energy: number | null;
  emotionalMomentum: number | null;
}

export interface ConcertVisualState {
  hasStarted: boolean;
  metrics: ConcertVisualMetrics;
  /** 0-1 proxy derived from satisfaction — a presentation stand-in for "how full the room feels," not a literal headcount (the engine has none per song). */
  attendanceRatio: number;
  momentumDirection: ConcertPulseState['momentumDirection'];
  momentumIntensity: ConcertPulseState['momentumIntensity'];
  isRecovery: boolean;
  isSplitRoom: boolean;
  walkoutRisk: boolean;
  isNewShowHigh: boolean;
  isNewShowLow: boolean;
  phase: ConcertPulseState['phase'];
  factions: FactionPulseSummary[];
  recentReactionLines: string[];
  currentSongTitle: string | null;
  currentSongTrackType: TrackType | null;
  /** The current song's real 6-axis Song Spectrum, for lighting — null if the song has no spectrum score. */
  currentSongAxis: Record<Axis, number> | null;
  encoreState: EncoreVisualState;
}

const DEFAULT_METRICS: ConcertVisualMetrics = {
  satisfaction: null, authenticity: null, pacing: null, energy: null, emotionalMomentum: null,
};

export const NEUTRAL_VISUAL_STATE: ConcertVisualState = {
  hasStarted: false,
  metrics: DEFAULT_METRICS,
  attendanceRatio: 0.7,
  momentumDirection: 'steady',
  momentumIntensity: 'low',
  isRecovery: false,
  isSplitRoom: false,
  walkoutRisk: false,
  isNewShowHigh: false,
  isNewShowLow: false,
  phase: null,
  factions: [],
  recentReactionLines: [],
  currentSongTitle: null,
  currentSongTrackType: null,
  currentSongAxis: null,
  encoreState: 'not_yet',
};

export interface BuildConcertVisualStateInput {
  pulse: ConcertPulseState | null;
  metricsSnapshot: Record<string, number> | null | undefined;
  lastResult: PickResult | null;
  /** Most recent reaction lines across the whole show, newest last — the adapter shows only the tail. */
  reactionLogHistory: { entries: ReactionLogEntry[] }[];
  /** True once the server has offered encore candidates for this run (screen state the page already tracks). */
  isChoosingEncore: boolean;
  /** True once an encore song has actually been picked. */
  hasEncorePlayed: boolean;
  /** True once the run is finished without an encore being played. */
  isFinishedWithoutEncore: boolean;
}

function deriveEncoreState(input: BuildConcertVisualStateInput): EncoreVisualState {
  if (input.hasEncorePlayed) return 'playing';
  if (input.isChoosingEncore) return 'choosing';
  if (input.isFinishedWithoutEncore) return 'declined';
  if (input.pulse?.phase === 'closing') return 'building';
  return 'not_yet';
}

/** Builds the current Concert Viewport visual state from data the client already has — never recomputes gameplay. */
export function buildConcertVisualState(input: BuildConcertVisualStateInput): ConcertVisualState {
  const { pulse, metricsSnapshot, lastResult } = input;

  const metrics: ConcertVisualMetrics = metricsSnapshot
    ? {
        satisfaction: metricsSnapshot['audienceRetention'] ?? null,
        authenticity: metricsSnapshot['authenticity'] ?? null,
        pacing: metricsSnapshot['paceDiscipline'] ?? null,
        energy: metricsSnapshot['energyCurveFit'] ?? null,
        emotionalMomentum: metricsSnapshot['emotionalJourney'] ?? null,
      }
    : DEFAULT_METRICS;

  const attendanceRatio = metrics.satisfaction !== null
    ? Math.max(0.1, Math.min(1, metrics.satisfaction / 100))
    : NEUTRAL_VISUAL_STATE.attendanceRatio;

  const recentLines = input.reactionLogHistory
    .slice(-3)
    .flatMap((s) => s.entries.map((e) => e.text));

  return {
    hasStarted: pulse?.hasPlayedASong ?? false,
    metrics,
    attendanceRatio,
    momentumDirection: pulse?.momentumDirection ?? 'steady',
    momentumIntensity: pulse?.momentumIntensity ?? 'low',
    isRecovery: pulse?.isRecovery ?? false,
    isSplitRoom: pulse?.isSplitRoom ?? false,
    walkoutRisk: pulse?.walkoutRisk ?? false,
    isNewShowHigh: pulse?.isNewShowHigh ?? false,
    isNewShowLow: pulse?.isNewShowLow ?? false,
    phase: pulse?.phase ?? null,
    factions: pulse?.factions ?? [],
    recentReactionLines: recentLines,
    currentSongTitle: lastResult?.song.title ?? null,
    currentSongTrackType: lastResult?.song.trackType ?? null,
    currentSongAxis: lastResult?.song.axis ?? null,
    encoreState: deriveEncoreState(input),
  };
}

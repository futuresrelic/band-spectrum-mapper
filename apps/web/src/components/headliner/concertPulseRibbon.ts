/**
 * Headliner — Concert Pulse ribbon derivation (Phase Z.17.17)
 *
 * Pure math only: turns a ConcertVisualState into the small set of
 * numbers the Canvas ribbon renderer needs (amplitude, coherence,
 * brightness, segment count). Kept separate from the renderer so the
 * "what does a healthy/awkward/recovering show look like" logic is
 * unit-testable without a canvas, and so a future non-Canvas renderer
 * (or a text-only fallback) can reuse the same derivation.
 *
 * Inputs are exactly the fields ConcertVisualState already exposes — no
 * new metric, no gameplay read. "Coherence" (how connected/fragmented
 * the ribbon looks) is presentation-only: it isn't a report metric, it's
 * a blend of pacing + emotional momentum + walkout/split-room flags,
 * documented here as an interpretation, not a new score.
 */
import type { ConcertVisualState } from './concertVisualState';

export interface PulseRibbonParams {
  /** 0-1: how tall the waveform's peaks are. */
  amplitude: number;
  /** 0-1: 1 = one smooth continuous ribbon, 0 = fully fragmented into disconnected segments. */
  coherence: number;
  /** 0-1: overall brightness/opacity of the ribbon. */
  brightness: number;
  /** How many visually distinct segments the ribbon breaks into at the current coherence. */
  segmentCount: number;
}

function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

const INTENSITY_TO_AMPLITUDE: Record<ConcertVisualState['momentumIntensity'], number> = {
  low: 0.25, medium: 0.55, high: 0.9,
};

/**
 * Derives ribbon rendering parameters. Healthy show (good pacing, no
 * split room, no walkout risk) -> high coherence, one smooth segment.
 * Awkward pacing or a split room -> lower coherence, more segments.
 * Recovery (isRecovery=true) nudges coherence back up even before the
 * numbers fully catch up, so a reconnecting moment reads as such.
 */
export function computePulseRibbonParams(state: ConcertVisualState): PulseRibbonParams {
  const { metrics } = state;
  const energyLike = average([metrics.energy, metrics.emotionalMomentum]);
  const amplitude = Math.max(0.15, Math.min(1,
    (energyLike !== null ? energyLike / 100 : 0.4) * 0.6 + INTENSITY_TO_AMPLITUDE[state.momentumIntensity] * 0.4,
  ));

  const pacingScore = metrics.pacing ?? 60;
  let coherence = pacingScore / 100;
  if (state.isSplitRoom) coherence -= 0.3;
  if (state.walkoutRisk) coherence -= 0.25;
  if (state.isRecovery) coherence += 0.25;
  if (state.encoreState === 'building' || state.encoreState === 'playing') coherence += 0.1;
  coherence = Math.max(0, Math.min(1, coherence));

  const brightnessSource = average([metrics.satisfaction, metrics.authenticity]);
  const brightness = Math.max(0.2, Math.min(1, brightnessSource !== null ? brightnessSource / 100 : 0.5));

  const segmentCount = coherence >= 0.8 ? 1 : coherence >= 0.55 ? 2 : coherence >= 0.3 ? 3 : 4;

  return { amplitude, coherence, brightness, segmentCount };
}

/**
 * Headliner — stage lighting derivation (Phase Z.17.17)
 *
 * Pure math: turns the current song's real 6-axis Song Spectrum into a
 * small set of rendering signals (fog opacity, color warmth, glow,
 * pattern/geometric intensity, animation speed). No axis is hardcoded to
 * a single fixed color alone — warmth is a continuous blend, and every
 * signal changes gradually (the renderer lerps toward these targets, it
 * never jumps). This is presentation math only: nothing here reads or
 * writes engine state, and it has no bearing on spectrumMatch or any
 * other score.
 */
import type { Axis } from '../../api/headliner';

export interface LightingSignals {
  /** 0-1: haze/fog overlay opacity — driven by atmosphere. */
  fogOpacity: number;
  /** Interpolated hex color: cool (low aggression) to warm (high aggression). */
  warmthColor: string;
  /** 0-1: spotlight/glow strength — driven by emotion. */
  glowIntensity: number;
  /** 0-1: moving layered texture strength — driven by psychedelic. */
  patternIntensity: number;
  /** 0-1: restrained geometric overlay strength — driven by complexity. */
  geometricIntensity: number;
  /** Multiplier on lighting animation speed — driven by aggression (never so high it flashes). */
  speedScale: number;
}

export const NEUTRAL_LIGHTING: LightingSignals = {
  fogOpacity: 0.1, warmthColor: '#60a5fa', glowIntensity: 0.3, patternIntensity: 0.1, geometricIntensity: 0.1, speedScale: 0.7,
};

const COOL_COLOR = { r: 0x38, g: 0xbd, b: 0xf8 }; // #38bdf8
const WARM_COLOR = { r: 0xf9, g: 0x73, b: 0x16 }; // #f97316

function normAxis(value: number): number {
  return Math.max(0, Math.min(1, value / 10));
}

function toHex(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0');
}

function mixColor(t: number): string {
  const r = COOL_COLOR.r + (WARM_COLOR.r - COOL_COLOR.r) * t;
  const g = COOL_COLOR.g + (WARM_COLOR.g - COOL_COLOR.g) * t;
  const b = COOL_COLOR.b + (WARM_COLOR.b - COOL_COLOR.b) * t;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Derives lighting signals for the current song's axis scores. Never flashes — speedScale is capped well below anything strobe-like. */
export function computeLightingSignals(axis: Record<Axis, number> | null): LightingSignals {
  if (!axis) return NEUTRAL_LIGHTING;
  const aggression = normAxis(axis.aggression);
  const atmosphere = normAxis(axis.atmosphere);
  const emotion = normAxis(axis.emotion);
  const psychedelic = normAxis(axis.psychedelic);
  const complexity = normAxis(axis.complexity);

  return {
    fogOpacity: Math.min(0.5, atmosphere * 0.5),
    warmthColor: mixColor(aggression),
    glowIntensity: emotion,
    patternIntensity: psychedelic,
    geometricIntensity: complexity * 0.6, // "restrained geometric lighting forms" — kept subtle even at max complexity
    speedScale: 0.6 + aggression * 0.6, // capped range [0.6, 1.2] — deliberately never fast enough to read as flashing
  };
}

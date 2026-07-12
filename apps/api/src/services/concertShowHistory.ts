/**
 * Headliner — Show History Analysis (Creative Bible §16.B, Phase Z.17.14)
 *
 * Pure, derived helpers over `EngineState.history` (concertEngine.ts). These
 * don't change the simulation — they interpret data the engine already
 * recorded, for the Live Reaction Log, Concert Pulse, richer review
 * templates (ENC-09), and future achievement evaluation. Nothing here
 * fabricates a value the engine doesn't actually have: if a condition can't
 * be honestly determined (e.g. no song ever produced a positive reaction),
 * the result says so (`isPeak: false` everywhere, `peakSongId: null`) rather
 * than guessing.
 */

import type { EngineState, FactionId, SongHistoryEntry } from './concertEngine.js';

export type ShowPhaseLabel = 'opening' | 'middle' | 'closing' | 'encore';

export interface SongPositionInfo {
  songId: string;
  /** 0-based position among all picks (main set + encore). */
  index: number;
  totalSongs: number;
  /** 0-1 across the main set only; encore entries are always 1. */
  normalizedPosition: number;
  phase: ShowPhaseLabel;
  /** True only for the song that produced the show's single highest faction reaction — never guessed. */
  isPeak: boolean;
}

function classifyMainSetPhase(indexInMainSet: number, mainSetTotal: number): 'opening' | 'middle' | 'closing' {
  if (mainSetTotal <= 1) return 'opening';
  const normalized = indexInMainSet / (mainSetTotal - 1);
  if (normalized < 0.25) return 'opening';
  if (normalized >= 0.75) return 'closing';
  return 'middle';
}

/**
 * Which song (if any) produced the show's single highest faction reaction.
 * Returns null when the peak is 0 or negative — i.e. no song ever produced
 * a genuinely positive reaction worth calling a "peak." Ties resolve to the
 * LAST song that (re)achieved the final peak value, matching "the peak was
 * reached at this point," not "first touched and never bettered."
 */
export function findPeakSongId(state: EngineState): string | null {
  if (state.crowdPeak <= 0) return null;
  let peakSongId: string | null = null;
  for (const entry of state.history) {
    if (entry.bestFactionReaction === state.crowdPeak) peakSongId = entry.songId;
  }
  return peakSongId;
}

/** Per-song show-position classification — computed once the history is available (whole show or so far). */
export function computeShowPositions(state: EngineState): SongPositionInfo[] {
  const { history } = state;
  const totalSongs = history.length;
  const mainSetTotal = history.filter((h) => !h.isEncore).length;
  const peakSongId = findPeakSongId(state);

  let mainSetIndex = 0;
  return history.map((entry) => {
    const phase: ShowPhaseLabel = entry.isEncore ? 'encore' : classifyMainSetPhase(mainSetIndex, mainSetTotal);
    const normalizedPosition = entry.isEncore ? 1 : (mainSetTotal > 1 ? mainSetIndex / (mainSetTotal - 1) : 0);
    if (!entry.isEncore) mainSetIndex += 1;
    return {
      songId: entry.songId,
      index: entry.index,
      totalSongs,
      normalizedPosition,
      phase,
      isPeak: peakSongId === entry.songId,
    };
  });
}

/** True only if the show's peak moment is both known and happened during the encore — the honest ENC-09 condition. */
export function peakHappenedDuringEncore(state: EngineState): boolean {
  const peakSongId = findPeakSongId(state);
  if (!peakSongId) return false;
  const entry = state.history.find((h) => h.songId === peakSongId);
  return entry?.isEncore === true;
}

/** Convenience: a single history entry's faction delta, typed for callers that only need one faction. */
export function factionDelta(entry: SongHistoryEntry, factionId: FactionId): number {
  return entry.factionDeltas[factionId].delta;
}

/**
 * Headliner — Concert Engine (Phase Z.17.9)
 *
 * Pure, deterministic simulation core. A function of (seed, state, pick) only —
 * no database access, no Math.random(), no Date.now(), no AI calls. Every
 * "random" decision is derived from `rngFloat(seed, stepIndex)`, so replaying
 * the same seed with the same sequence of picks always produces the same
 * candidate hands, the same crowd reactions, and the same final report.
 *
 * See docs/proposals/HEADLINER_DATA_FLOW.md for where every input comes from
 * and docs/proposals/CONCERT_ARCHITECT.md for the game design this implements.
 *
 * This module knows nothing about Prisma, Express, or HTTP — concertDataService.ts
 * assembles the ShowBundle from the database once, at run start, and
 * headliner routes call these functions against the snapshot stored in
 * ConcertRun.stateJson.
 */

import { buildConcertNarrative } from './headlinerReviewTemplates.js';
import type { TrackType } from '@band-spectrum-mapper/shared';

export type Axis = 'aggression' | 'complexity' | 'atmosphere' | 'emotion' | 'psychedelic' | 'concept';

export const AXES: readonly Axis[] = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'];

export type AudienceDimension =
  | 'progressive' | 'heavy' | 'technical' | 'atmospheric' | 'experimental'
  | 'accessible' | 'psychedelic' | 'emotional' | 'aggressive' | 'improvisational';

export const AUDIENCE_DIMENSIONS: readonly AudienceDimension[] = [
  'progressive', 'heavy', 'technical', 'atmospheric', 'experimental',
  'accessible', 'psychedelic', 'emotional', 'aggressive', 'improvisational',
];

export type LiveFrequencyTier =
  | 'Essential' | 'Frequent' | 'Occasional' | 'Rare' | 'Legendary' | 'Mythic' | 'Unclassified';

export type FactionId = 'casual' | 'hardcore' | 'deepCut' | 'progHeads' | 'firstTimers';

export const FACTIONS: readonly { id: FactionId; label: string; shareOfCrowd: number }[] = [
  { id: 'casual',      label: 'Casual Listeners',  shareOfCrowd: 0.35 },
  { id: 'hardcore',    label: 'Hardcore Fans',     shareOfCrowd: 0.20 },
  { id: 'deepCut',     label: 'Deep-Cut Hunters',  shareOfCrowd: 0.15 },
  { id: 'progHeads',   label: 'Prog Heads',        shareOfCrowd: 0.15 },
  { id: 'firstTimers', label: 'First-Timers',      shareOfCrowd: 0.15 },
];

export interface EngineSong {
  id: string;
  title: string;
  albumId: string | null;
  albumTitle: string | null;
  durationSeconds: number;
  axis: Record<Axis, number> | null;
  tempoEnergy: number | null; // SongMusicScore.tempoEnergy, 0-10, null if no row
  audience: Record<AudienceDimension, number>;
  audienceIsFallback: boolean;
  liveTier: LiveFrequencyTier;
  liveSource: 'live' | 'estimated';
  liveValue: number;
  /**
   * Track Classification (Phase Z.17.15): false for tracks marked
   * ineligible for Headliner (e.g. a spoken-word interlude). This never
   * removes the song from the candidate pool — it's a strong ranking
   * preference in candidateValue, not a hard filter, so a small catalog
   * can still fall back to it. Daily Challenge, which needs a hard
   * filter, excludes ineligible songs at the query level instead — see
   * concertDataService.ts's buildShowBundle.
   */
  eligibleHeadliner: boolean;
  /**
   * Track Classification (Phase Z.17.15, expanded Z.17.16): what this
   * recording IS (Song, Interlude, SpokenWord, ...). Presentation-only in
   * the engine itself — nothing here reads it to change candidateValue,
   * momentum, or any formula. Exposed on EngineSong purely so the Concert
   * Viewport (Phase Z.17.17) can apply a small visual treatment (e.g. an
   * Interlude cues lower crowd motion) without a second query.
   */
  trackType: TrackType;
}

export interface EngineVenue {
  id: string;
  name: string;
  capacity: number;
  affinity: Record<Axis, number>; // BandRpgVenue's *Affinity ints, 0-10 normalized
  rarityBonus: number;
}

/**
 * Per-run overrides for the constants that differ between Quick Show and
 * Campaign stages (and, later, Daily Challenge). This is how mode-specific
 * behavior enters the engine — never by forking the simulation. Quick Show
 * uses DEFAULT_SHOW_RULES verbatim; Campaign stages override a subset via
 * campaignStages.ts config.
 */
export interface ShowRules {
  minSongs: number;
  maxSongs: number;
  factionShare: Record<FactionId, number>;
  encoreEnergyThreshold: number;
}

export interface ShowBundle {
  bandId: string;
  bandName: string;
  songs: EngineSong[];
  targetSpectrum: Record<Axis, number>;
  venue: EngineVenue | null;
  showLengthBudgetSeconds: number;
  rules: ShowRules;
}

export interface EngineState {
  bundle: ShowBundle;
  seed: string;
  stepIndex: number;
  playedSongIds: string[];
  elapsedSeconds: number;
  runningSpectrumSum: Record<Axis, number>;
  runningSpectrumCount: number;
  factionMomentum: Record<FactionId, number>;
  crowdPeak: number;
  recentAxisWindow: Axis[];
  recentAlbumWindow: (string | null)[];
  pacingPenaltyTotal: number;
  fallbackSongCount: number;
  encoreEligible: boolean;
  encorePlayed: boolean;
  encoreMomentumSwing: number | null;
  phase: 'main' | 'encore' | 'finished';
  /**
   * The exact song IDs offered by the most recent generateCandidates/
   * generateEncoreCandidates call. applyPick/applyEncorePick reject any
   * songId not in this set — a server-side integrity rule so a client can
   * never pick outside the hand it was actually shown (Phase Z.17.11:
   * required for Daily Challenge score verification, and closes the same
   * gap for Quick Show and Campaign as a safe shared improvement).
   */
  currentCandidateIds: string[];
  /** Chronological per-song exposure — see SongHistoryEntry. Appended by applyPick; never mutates prior entries. */
  history: SongHistoryEntry[];
}

export interface CandidateHand {
  candidates: EngineSong[];
  state: EngineState; // stepIndex advanced
}

export interface PickResult {
  song: EngineSong;
  factionReactions: Record<FactionId, { score: number; explanation: string }>;
  crowdEnergyDelta: number;
  pacingPenalty: number;
  rarityMoment: boolean;
  state: EngineState;
}

// ---------------------------------------------------------------------------
// Show history — per-song exposure for narrative systems (Creative Bible
// §16.B: Live Reaction Log, Concert Pulse, richer review templates, future
// achievements). Populated incrementally by applyPick alongside the existing
// state mutations; changes nothing about how momentum, pacing, or metrics
// are CALCULATED — every value here is read from (or recomputed with the
// exact same formula as) fields the engine already tracked before this.
// ---------------------------------------------------------------------------

export interface FactionDeltaEntry {
  before: number;
  after: number;
  delta: number;
}

export interface SongHistoryEntry {
  songId: string;
  /** 0-based position among ALL picks so far, main set and encore alike. */
  index: number;
  isEncore: boolean;
  factionMomentumBefore: Record<FactionId, number>;
  factionMomentumAfter: Record<FactionId, number>;
  factionDeltas: Record<FactionId, FactionDeltaEntry>;
  /** This song's own single best faction reaction (pre-dampening score), for honest peak-song detection — see concertShowHistory.ts. */
  bestFactionReaction: number;
  /** Every faction's raw per-song reaction score (-100..100, pre-dampening) — the same values PickResult.factionReactions carries, just persisted per song. */
  factionReactionScores: Record<FactionId, number>;
  crowdEnergyBefore: number;
  crowdEnergyAfter: number;
  crowdEnergyDelta: number;
  /** This song's pacing penalty from the existing energy-curve formula (0 = no penalty) — same value PickResult.pacingPenalty carries. */
  pacingPenalty: number;
  /** The 10 report metrics recomputed AS OF this point in the show — same formulas buildReport uses at the end, just run earlier. Not interpolated. */
  metricsSnapshot: Record<ScoreMetric, number>;
  /** crowdEnergyAfter is a new running high/low across the whole show so far (ties do not count as new). */
  isNewHighEnergy: boolean;
  isNewLowEnergy: boolean;
}

// ---------------------------------------------------------------------------
// Central tuning config — every weight and constant Headliner uses lives here.
// ---------------------------------------------------------------------------

export const TUNING = {
  minSongsBeforeEndAllowed: 10,
  maxMainSetSongs: 16,
  defaultSongSeconds: 240,
  handSizeMin: 2,
  handSizeMax: 4,
  obviousCutCount: 1,       // top N "best" songs excluded from each hand
  shortlistWindow: 6,       // how many next-best songs the hand is sampled from

  spectrumFitWeight: 1.0,
  rarityWeight: 0.6,
  varietyBonusWeight: 0.5,
  albumClumpPenalty: 18,
  axisSaturationPenalty: 14,
  pacingMismatchWeight: 0.8,
  // Track Classification (Phase Z.17.15): a strong ranking preference away
  // from headliner-ineligible tracks (e.g. spoken-word interludes) — large
  // enough that they almost never surface in a normal-sized catalog's
  // candidate hand, but never a hard exclusion from the pool itself.
  headlinerIneligiblePenalty: 500,

  // energy curve checkpoints: [progressFraction 0-1, expected tempoEnergy 0-10]
  energyCurve: [
    { progress: 0.0,  expected: 5.5 },
    { progress: 0.35, expected: 7.5 },
    { progress: 0.55, expected: 8.5 },
    { progress: 0.72, expected: 6.0 }, // "the dip"
    { progress: 0.9,  expected: 8.0 },
    { progress: 1.0,  expected: 9.0 },
  ],

  factionWeights: {
    casual:      { accessible: 1.0, emotional: 0.3, technical: -0.4, experimental: -0.5, progressive: -0.3 },
    hardcore:    { heavy: 1.0, aggressive: 0.8, technical: 0.5, accessible: -0.5 },
    deepCut:     { experimental: 0.7, improvisational: 0.6, progressive: 0.4, accessible: -0.2 },
    progHeads:   { progressive: 1.0, technical: 0.8, atmospheric: 0.5, accessible: -0.4 },
    firstTimers: { accessible: 1.0, emotional: 0.6, experimental: -0.6, progressive: -0.4 },
  } satisfies Record<FactionId, Partial<Record<AudienceDimension, number>>>,

  factionRarityWeight: {
    casual: 0.1, hardcore: 0.2, deepCut: 1.0, progHeads: 0.4, firstTimers: 0.05,
  } satisfies Record<FactionId, number>,

  liveTierExcitement: {
    Essential: 0, Frequent: 5, Occasional: 20, Rare: 45, Legendary: 75, Mythic: 100, Unclassified: 10,
  } satisfies Record<LiveFrequencyTier, number>,

  momentumDampening: 0.35,
  encoreCrowdEnergyThreshold: 15, // weighted momentum must clear this to earn an encore
  encoreCandidateCount: 2,

  scoreWeights: {
    spectrumMatch:    0.16,
    energyCurveFit:   0.12,
    emotionalJourney: 0.10,
    audienceRetention:0.14,
    rarityExcitement: 0.10,
    diversity:        0.09,
    authenticity:     0.07,
    encoreQuality:    0.10,
    paceDiscipline:   0.07,
    crowdPeak:        0.05,
  } satisfies Record<ScoreMetric, number>,

  targetShowMinutes: 72,
} as const;

export type ScoreMetric =
  | 'spectrumMatch' | 'energyCurveFit' | 'emotionalJourney' | 'audienceRetention'
  | 'rarityExcitement' | 'diversity' | 'authenticity' | 'encoreQuality'
  | 'paceDiscipline' | 'crowdPeak';

/**
 * Bump this when TUNING/formulas change in a way that would alter results
 * for an identical (seed, picks) pair. Stored on every ConcertRun and
 * HeadlinerDailyChallenge so historical Daily leaderboards keep verifying
 * against the engine version they were created with — a tuning change
 * never silently reshuffles a past leaderboard.
 */
export const ENGINE_VERSION = 'HEADLINER_ENGINE_V1';

/** Quick Show's rules — the exact behavior Phase 1 shipped with, unchanged. */
export const DEFAULT_SHOW_RULES: ShowRules = {
  minSongs: TUNING.minSongsBeforeEndAllowed,
  maxSongs: TUNING.maxMainSetSongs,
  factionShare: FACTIONS.reduce((acc, f) => { acc[f.id] = f.shareOfCrowd; return acc; }, {} as Record<FactionId, number>),
  encoreEnergyThreshold: TUNING.encoreCrowdEnergyThreshold,
};

// ---------------------------------------------------------------------------
// Deterministic PRNG — pure function of (seed, step). No mutable RNG object,
// so replay only needs the seed string and a step counter, both of which are
// already persisted in EngineState.
// ---------------------------------------------------------------------------

function hashSeed(seed: string, step: number): number {
  let h = 2166136261 >>> 0;
  const str = `${seed}:${step}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pseudorandom float in [0, 1). Same (seed, step) always returns the same value. */
export function rngFloat(seed: string, step: number): number {
  let a = hashSeed(seed, step) | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function rngInt(seed: string, step: number, minInclusive: number, maxInclusive: number): number {
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(rngFloat(seed, step) * span);
}

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

function zeroAxisRecord(): Record<Axis, number> {
  return { aggression: 0, complexity: 0, atmosphere: 0, emotion: 0, psychedelic: 0, concept: 0 };
}

function zeroFactionRecord(): Record<FactionId, number> {
  return { casual: 0, hardcore: 0, deepCut: 0, progHeads: 0, firstTimers: 0 };
}

export function createInitialState(bundle: ShowBundle, seed: string): EngineState {
  return {
    bundle,
    seed,
    stepIndex: 0,
    playedSongIds: [],
    elapsedSeconds: 0,
    runningSpectrumSum: zeroAxisRecord(),
    runningSpectrumCount: 0,
    factionMomentum: zeroFactionRecord(),
    crowdPeak: 0,
    recentAxisWindow: [],
    recentAlbumWindow: [],
    pacingPenaltyTotal: 0,
    fallbackSongCount: 0,
    encoreEligible: false,
    encorePlayed: false,
    encoreMomentumSwing: null,
    phase: 'main',
    currentCandidateIds: [],
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Candidate hand generation
// ---------------------------------------------------------------------------

function dominantAxis(song: EngineSong): Axis | null {
  if (!song.axis) return null;
  let best: Axis | null = null;
  let bestVal = -Infinity;
  for (const axis of AXES) {
    const v = song.axis[axis];
    if (v > bestVal) { bestVal = v; best = axis; }
  }
  return best;
}

function expectedEnergyAt(progress: number): number {
  const curve = TUNING.energyCurve;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]!;
    const b = curve[i + 1]!;
    if (progress >= a.progress && progress <= b.progress) {
      const span = b.progress - a.progress || 1;
      const frac = (progress - a.progress) / span;
      return a.expected + (b.expected - a.expected) * frac;
    }
  }
  return curve[curve.length - 1]!.expected;
}

function spectrumGapReduction(song: EngineSong, state: EngineState): number {
  if (!song.axis) return 0;
  const { targetSpectrum } = state.bundle;
  const count = state.runningSpectrumCount;
  let reduction = 0;
  for (const axis of AXES) {
    const target = targetSpectrum[axis];
    const currentAvg = count > 0 ? state.runningSpectrumSum[axis] / count : target;
    const currentGap = Math.abs(target - currentAvg);
    const nextAvg = count > 0 ? (state.runningSpectrumSum[axis] + song.axis[axis]) / (count + 1) : song.axis[axis];
    const nextGap = Math.abs(target - nextAvg);
    reduction += currentGap - nextGap;
  }
  return reduction;
}

function candidateValue(song: EngineSong, state: EngineState): number {
  const progress = Math.min(1, state.elapsedSeconds / state.bundle.showLengthBudgetSeconds);
  const fit = spectrumGapReduction(song, state) * TUNING.spectrumFitWeight;
  const rarity = (TUNING.liveTierExcitement[song.liveTier] / 100) * TUNING.rarityWeight * 10;
  const axis = dominantAxis(song);
  const overrepresented = axis !== null && state.recentAxisWindow.filter((a) => a === axis).length >= 2;
  const variety = overrepresented ? -TUNING.varietyBonusWeight * 10 : TUNING.varietyBonusWeight * 5;
  const clump = song.albumId !== null && state.recentAlbumWindow.filter((a) => a === song.albumId).length >= 2
    ? -TUNING.albumClumpPenalty : 0;
  const expected = expectedEnergyAt(progress);
  const actualTempo = song.tempoEnergy ?? 5;
  const pacing = -Math.abs(actualTempo - expected) * TUNING.pacingMismatchWeight;
  const eligibility = song.eligibleHeadliner ? 0 : -TUNING.headlinerIneligiblePenalty;
  return fit + rarity + variety + clump + pacing + eligibility;
}

/**
 * Generates the next candidate hand (2-4 songs). Deliberately excludes the
 * single highest-value song from the offered hand so the game never degenerates
 * into "always pick the top-scored song" — see CONCERT_ARCHITECT.md.
 */
export function generateCandidates(state: EngineState): CandidateHand {
  const played = new Set(state.playedSongIds);
  const pool = state.bundle.songs.filter((s) => !played.has(s.id));

  if (pool.length === 0) {
    return { candidates: [], state };
  }

  const ranked = pool
    .map((song) => ({ song, value: candidateValue(song, state) }))
    .sort((a, b) => b.value - a.value);

  const cut = Math.min(TUNING.obviousCutCount, Math.max(0, ranked.length - TUNING.handSizeMin));
  const shortlist = ranked.slice(cut, cut + TUNING.shortlistWindow);
  const pickPool = shortlist.length >= TUNING.handSizeMin ? shortlist : ranked;

  let step = state.stepIndex;
  const handSize = Math.min(
    pickPool.length,
    rngInt(state.seed, step++, TUNING.handSizeMin, TUNING.handSizeMax),
  );

  const remaining = [...pickPool];
  const chosen: EngineSong[] = [];
  for (let i = 0; i < handSize && remaining.length > 0; i++) {
    const idx = rngInt(state.seed, step++, 0, remaining.length - 1);
    const picked = remaining.splice(idx, 1)[0];
    if (picked) chosen.push(picked.song);
  }

  return { candidates: chosen, state: { ...state, stepIndex: step, currentCandidateIds: chosen.map((s) => s.id) } };
}

// ---------------------------------------------------------------------------
// Faction reactions
// ---------------------------------------------------------------------------

function factionAffinityScore(song: EngineSong, factionId: FactionId): number {
  const weights: Partial<Record<AudienceDimension, number>> = TUNING.factionWeights[factionId];
  let sum = 0;
  let weightTotal = 0;
  for (const dim of AUDIENCE_DIMENSIONS) {
    const w = weights[dim];
    if (w === undefined) continue;
    sum += ((song.audience[dim] - 50) / 50) * w; // -1..1 centered, weighted
    weightTotal += Math.abs(w);
  }
  const normalized = weightTotal > 0 ? sum / weightTotal : 0; // -1..1
  return normalized * 60; // scale to roughly -60..60
}

function factionRaritySignal(song: EngineSong, factionId: FactionId): number {
  return (TUNING.liveTierExcitement[song.liveTier] / 100) * TUNING.factionRarityWeight[factionId] * 60;
}

function explainReaction(factionLabel: string, score: number, song: EngineSong): string {
  let base: string;
  if (score >= 45)       base = `${factionLabel} lose it — this is exactly their sound.`;
  else if (score >= 15)  base = `${factionLabel} are into it, nodding along.`;
  else if (score >= -15) base = `${factionLabel} are lukewarm on this one.`;
  else if (score >= -45) base = `${factionLabel} look a little confused.`;
  else                   base = `${factionLabel} are checked out.`;

  if (song.liveTier === 'Legendary' || song.liveTier === 'Mythic') {
    return `${base} A ripple of recognition — this one almost never gets played.`;
  }
  return base;
}

export function reactToSong(song: EngineSong, state: EngineState): PickResult['factionReactions'] {
  const reactions = {} as PickResult['factionReactions'];
  for (const faction of FACTIONS) {
    const score = Math.max(-100, Math.min(100,
      factionAffinityScore(song, faction.id) + factionRaritySignal(song, faction.id),
    ));
    reactions[faction.id] = { score, explanation: explainReaction(faction.label, score, song) };
  }
  return reactions;
}

function weightedCrowdEnergy(momentum: Record<FactionId, number>, factionShare: Record<FactionId, number>): number {
  return FACTIONS.reduce((sum, f) => sum + momentum[f.id] * factionShare[f.id], 0);
}

// ---------------------------------------------------------------------------
// Applying a pick
// ---------------------------------------------------------------------------

export function applyPick(state: EngineState, songId: string): PickResult | null {
  if (!state.currentCandidateIds.includes(songId)) return null;
  const song = state.bundle.songs.find((s) => s.id === songId);
  if (!song || state.playedSongIds.includes(songId)) return null;

  const reactions = reactToSong(song, state);
  const progress = Math.min(1, state.elapsedSeconds / state.bundle.showLengthBudgetSeconds);
  const expected = expectedEnergyAt(progress);
  const actualTempo = song.tempoEnergy ?? 5;
  const pacingPenalty = Math.abs(actualTempo - expected) * TUNING.pacingMismatchWeight;

  const nextMomentum = { ...state.factionMomentum };
  let peak = state.crowdPeak;
  for (const faction of FACTIONS) {
    const r = reactions[faction.id]!;
    nextMomentum[faction.id] = Math.max(-100, Math.min(100,
      nextMomentum[faction.id] + r.score * TUNING.momentumDampening,
    ));
    if (r.score > peak) peak = r.score;
  }

  const nextSpectrumSum = { ...state.runningSpectrumSum };
  let nextSpectrumCount = state.runningSpectrumCount;
  if (song.axis) {
    for (const axis of AXES) nextSpectrumSum[axis] += song.axis[axis];
    nextSpectrumCount += 1;
  }

  const axis = dominantAxis(song);
  const recentAxisWindow = [...state.recentAxisWindow, ...(axis ? [axis] : [])].slice(-4);
  const recentAlbumWindow = [...state.recentAlbumWindow, song.albumId].slice(-4);

  const factionShare = state.bundle.rules.factionShare;
  const crowdEnergyBefore = weightedCrowdEnergy(state.factionMomentum, factionShare);
  const crowdEnergyAfter = weightedCrowdEnergy(nextMomentum, factionShare);
  const crowdEnergyDelta = crowdEnergyAfter - crowdEnergyBefore;

  const stateBeforeHistory: EngineState = {
    ...state,
    playedSongIds: [...state.playedSongIds, song.id],
    elapsedSeconds: state.elapsedSeconds + song.durationSeconds,
    runningSpectrumSum: nextSpectrumSum,
    runningSpectrumCount: nextSpectrumCount,
    factionMomentum: nextMomentum,
    crowdPeak: peak,
    recentAxisWindow,
    recentAlbumWindow,
    pacingPenaltyTotal: state.pacingPenaltyTotal + pacingPenalty,
    fallbackSongCount: state.fallbackSongCount + (song.audienceIsFallback ? 1 : 0),
  };

  const factionDeltas = {} as Record<FactionId, FactionDeltaEntry>;
  for (const faction of FACTIONS) {
    const before = state.factionMomentum[faction.id];
    const after = nextMomentum[faction.id];
    factionDeltas[faction.id] = { before, after, delta: after - before };
  }

  const priorEnergies = [0, ...state.history.map((h) => h.crowdEnergyAfter)];
  const historyEntry: SongHistoryEntry = {
    songId: song.id,
    index: state.history.length,
    isEncore: state.phase === 'encore',
    factionMomentumBefore: state.factionMomentum,
    factionMomentumAfter: nextMomentum,
    factionDeltas,
    bestFactionReaction: Math.max(...FACTIONS.map((f) => reactions[f.id]!.score)),
    factionReactionScores: FACTIONS.reduce((acc, f) => { acc[f.id] = reactions[f.id]!.score; return acc; }, {} as Record<FactionId, number>),
    crowdEnergyBefore,
    crowdEnergyAfter,
    crowdEnergyDelta,
    pacingPenalty,
    metricsSnapshot: computeMetricsSnapshot(stateBeforeHistory),
    isNewHighEnergy: crowdEnergyAfter > Math.max(...priorEnergies),
    isNewLowEnergy: crowdEnergyAfter < Math.min(...priorEnergies),
  };

  const nextState: EngineState = {
    ...stateBeforeHistory,
    history: [...state.history, historyEntry],
  };

  return {
    song,
    factionReactions: reactions,
    crowdEnergyDelta,
    pacingPenalty,
    rarityMoment: song.liveTier === 'Legendary' || song.liveTier === 'Mythic',
    state: nextState,
  };
}

/** True once the main set has reached the minimum length AND either hit the song cap or the time budget. */
export function isMainSetComplete(state: EngineState): boolean {
  const count = state.playedSongIds.length;
  const { minSongs, maxSongs } = state.bundle.rules;
  if (count < minSongs) return false;
  if (count >= maxSongs) return true;
  return state.elapsedSeconds >= state.bundle.showLengthBudgetSeconds;
}

/** Call once the main set is complete. Determines encore eligibility from crowd energy. */
export function resolveEncoreEligibility(state: EngineState): EngineState {
  const energy = weightedCrowdEnergy(state.factionMomentum, state.bundle.rules.factionShare);
  return { ...state, encoreEligible: energy >= state.bundle.rules.encoreEnergyThreshold, phase: 'encore' };
}

/** Generates the (smaller, rarity-leaning) encore candidate hand. */
export function generateEncoreCandidates(state: EngineState): CandidateHand {
  const played = new Set(state.playedSongIds);
  const pool = state.bundle.songs.filter((s) => !played.has(s.id));
  if (pool.length === 0) return { candidates: [], state };

  const ranked = pool
    .map((song) => ({
      song,
      value: candidateValue(song, state) + (TUNING.liveTierExcitement[song.liveTier] / 100) * 40,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TUNING.encoreCandidateCount + 2);

  let step = state.stepIndex;
  const chosen: EngineSong[] = [];
  const remaining = [...ranked];
  const count = Math.min(TUNING.encoreCandidateCount, remaining.length);
  for (let i = 0; i < count; i++) {
    const idx = rngInt(state.seed, step++, 0, remaining.length - 1);
    const picked = remaining.splice(idx, 1)[0];
    if (picked) chosen.push(picked.song);
  }
  return { candidates: chosen, state: { ...state, stepIndex: step, currentCandidateIds: chosen.map((s) => s.id) } };
}

export function applyEncorePick(state: EngineState, songId: string): PickResult | null {
  const factionShare = state.bundle.rules.factionShare;
  const before = weightedCrowdEnergy(state.factionMomentum, factionShare);
  const result = applyPick(state, songId);
  if (!result) return null;
  const after = weightedCrowdEnergy(result.state.factionMomentum, factionShare);
  const finished: EngineState = {
    ...result.state,
    encorePlayed: true,
    encoreMomentumSwing: after - before,
    phase: 'finished',
  };
  return { ...result, state: finished };
}

/** No-encore path — crowd energy didn't clear the bar. */
export function skipEncore(state: EngineState): EngineState {
  return { ...state, encorePlayed: false, encoreMomentumSwing: 0, phase: 'finished' };
}

// ---------------------------------------------------------------------------
// Final report — 10 weighted (not averaged) metrics
// ---------------------------------------------------------------------------

export interface ConcertReport {
  metrics: Record<ScoreMetric, number>; // each 0-100
  overallScore: number;                 // weighted sum scaled to 0-1000
  highlights: string[];
  reviewText: string;
  usedFallbackData: boolean;
  fallbackSongCount: number;
}

function clamp01to100(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/**
 * The 10 report metrics, computed AS OF whatever `state` currently is. This
 * is the exact same math buildReport always used — extracted so it can also
 * run mid-show (once per pick, for SongHistoryEntry.metricsSnapshot) without
 * duplicating a single formula. Every input here is a running aggregate the
 * engine already tracked before Creative Bible §16.B (runningSpectrumSum,
 * pacingPenaltyTotal, factionMomentum, crowdPeak, fallbackSongCount) — this
 * is not a new calculation, just an earlier read of ones that already existed.
 */
export function computeMetricsSnapshot(state: EngineState): Record<ScoreMetric, number> {
  const { bundle } = state;
  const playedCount = state.playedSongIds.length;
  const count = state.runningSpectrumCount;

  // 1. spectrumMatch — how close the running average lands to the catalog target
  let spectrumMatch = 50;
  if (count > 0) {
    let totalGap = 0;
    for (const axis of AXES) {
      const avg = state.runningSpectrumSum[axis] / count;
      totalGap += Math.abs(bundle.targetSpectrum[axis] - avg);
    }
    const avgGap = totalGap / AXES.length; // 0-10 scale gap
    spectrumMatch = clamp01to100(100 - avgGap * 14);
  }

  // 2. energyCurveFit — inverse of accumulated pacing penalty
  const avgPacingPenalty = playedCount > 0 ? state.pacingPenaltyTotal / playedCount : 0;
  const energyCurveFit = clamp01to100(100 - avgPacingPenalty * 10);

  // 3. emotionalJourney — rewards an actual arc in the emotion axis, not flatness
  let emotionalJourney = 40;
  if (count > 1) {
    const emotionAvg = state.runningSpectrumSum.emotion / count;
    emotionalJourney = clamp01to100(40 + emotionAvg * 6);
  }

  // 4. audienceRetention — weighted crowd momentum so far, rescaled from -100..100 to 0..100
  const finalEnergy = weightedCrowdEnergy(state.factionMomentum, bundle.rules.factionShare);
  const audienceRetention = clamp01to100(50 + finalEnergy / 2);

  // 5. rarityExcitement — how many rarity moments landed so far, scaled by tier
  const rarityMoments = bundle.songs
    .filter((s) => state.playedSongIds.includes(s.id))
    .reduce((sum, s) => sum + TUNING.liveTierExcitement[s.liveTier], 0);
  const rarityExcitement = clamp01to100(rarityMoments / Math.max(1, playedCount));

  // 6. diversity — inverse of album/axis clumping observed so far
  const albumIds = bundle.songs.filter((s) => state.playedSongIds.includes(s.id)).map((s) => s.albumId);
  const uniqueAlbums = new Set(albumIds.filter(Boolean)).size;
  const diversity = clamp01to100(playedCount > 0 ? (uniqueAlbums / playedCount) * 130 : 50);

  // 7. authenticity — proportion of songs so far that used real (non-fallback) audience data
  const authenticity = clamp01to100(
    playedCount > 0 ? 100 - (state.fallbackSongCount / playedCount) * 100 : 100,
  );

  // 8. encoreQuality — 0 until the encore is actually played, same as always
  const encoreQuality = state.encorePlayed
    ? clamp01to100(50 + (state.encoreMomentumSwing ?? 0))
    : 0;

  // 9. paceDiscipline — same signal as energyCurveFit but penalizes runaway pacing penalties harder
  const paceDiscipline = clamp01to100(100 - avgPacingPenalty * 16);

  // 10. crowdPeak — the single best faction reaction achieved so far
  const crowdPeak = clamp01to100(50 + state.crowdPeak / 2);

  return {
    spectrumMatch, energyCurveFit, emotionalJourney, audienceRetention, rarityExcitement,
    diversity, authenticity, encoreQuality, paceDiscipline, crowdPeak,
  };
}

export function computeOverallScore(metrics: Record<ScoreMetric, number>): number {
  let weightedSum = 0;
  for (const key of Object.keys(TUNING.scoreWeights) as ScoreMetric[]) {
    weightedSum += metrics[key] * TUNING.scoreWeights[key];
  }
  return Math.round(weightedSum * 10); // 0-1000
}

export function buildReport(state: EngineState): ConcertReport {
  const metrics = computeMetricsSnapshot(state);
  const overallScore = computeOverallScore(metrics);

  // Narrative text (review + highlights) is centralized in headlinerReviewTemplates.ts
  // per the Creative Bible §7 — see buildConcertNarrative for the template-selection
  // and contradiction-prevention rules. This function only supplies the metrics.
  const { reviewText, highlights } = buildConcertNarrative(state, metrics, overallScore);

  return {
    metrics,
    overallScore,
    highlights,
    reviewText,
    usedFallbackData: state.fallbackSongCount > 0,
    fallbackSongCount: state.fallbackSongCount,
  };
}

/**
 * Headliner — Live Reaction Log (Creative Bible §8, Phase Z.17.14 Part C)
 *
 * One-line messages surfaced between songs, built purely from data the
 * engine already tracks per song (concertEngine.ts's SongHistoryEntry) —
 * no metric numbers in the text, no new score/momentum/pacing formulas.
 * At most two lines per song; when more than two triggers fire, priority
 * order (Bible §8) decides which survive: walkout-risk > faction spikes >
 * pacing observations > spectrum notes.
 *
 * A handful of "how large is large" thresholds (LOG_TUNING below) exist
 * only to decide which line fires — they never touch scoring, momentum,
 * or pacing math, which stay exactly as concertEngine.ts computes them.
 * Where a threshold already exists in the shipped engine (the 45/-45
 * bands in explainReaction, the Bible §7.0 metric bands), this reuses it
 * rather than inventing a new number.
 *
 * Variant selection is deterministic (narrativeSeed.ts's pickBySeededHash,
 * seeded by the run's own seed + the song's id + the message category) —
 * never Math.random(). Replaying the same seed with the same picks always
 * produces the same log.
 */

import {
  FACTIONS, type EngineState, type EngineSong, type FactionId, type SongHistoryEntry,
} from './concertEngine.js';
import { pickBySeededHash } from './narrativeSeed.js';

export type ReactionLogCategory =
  | 'strongOpener' | 'weakOpener' | 'successfulContrast' | 'repetitiveStretch'
  | 'energySurge' | 'emotionalPeak' | 'complexityOverload' | 'accessibilityBoost'
  | 'deepCutSurprise' | 'casualFanLoss' | 'hardcoreExcitement' | 'crowdRecovery'
  | 'spectrumCorrection' | 'spectrumDrift' | 'successfulEncoreSetup' | 'encoreDemand'
  | 'poorTransition' | 'excellentTransition';

export interface ReactionLogEntry {
  category: ReactionLogCategory;
  text: string;
}

/** Bible §8's stated priority order — lower index wins when more than MAX_LOG_LINES_PER_SONG trigger at once. */
type PriorityTier = 'walkoutRisk' | 'factionSpike' | 'pacing' | 'spectrum';
const PRIORITY_ORDER: readonly PriorityTier[] = ['walkoutRisk', 'factionSpike', 'pacing', 'spectrum'];

const MAX_LOG_LINES_PER_SONG = 2;

/**
 * Narrative-only thresholds. These decide which log line fires — they are
 * never read by concertEngine.ts's scoring, momentum, or pacing math. Where
 * a boundary already exists in the shipped engine or the Creative Bible
 * (§7.0's metric bands, explainReaction's reaction bands), it's reused
 * here rather than invented fresh.
 */
const LOG_TUNING = {
  contrastTempoGap: 3.5, // |tempoEnergy diff| (0-10 scale) that counts as a "large" gap between two songs
  repetitiveTempoRange: 1.5, // max tempoEnergy spread across a 3-song window that counts as a "narrow" band
  surgeEnergyDelta: 8, // crowdEnergyDelta that counts as momentum rising "sharply"
  spectrumShiftMaterial: 3, // spectrumMatch point change that counts as "material" movement
  highAudienceDimension: 70, // Bible §7.0 "Strong" band boundary, reused
  exceptionalAudienceDimension: 85, // Bible §7.0 "Exceptional" band boundary, reused
  hardcoreExcitementReaction: 45, // reuses explainReaction's existing "lose it" reaction threshold
  walkoutMomentumThreshold: -45, // reuses explainReaction's existing "checked out" reaction threshold
  pacingPenaltyEpsilon: 0.5, // pacing penalties at or below this count as "no penalty" (rounding noise)
} as const;

const RARE_OR_ABOVE_TIERS: readonly EngineSong['liveTier'][] = ['Rare', 'Legendary', 'Mythic'];

interface LogContext {
  state: EngineState;
  index: number;
  entry: SongHistoryEntry;
  song: EngineSong;
  prevEntry: SongHistoryEntry | null;
  prevSong: EngineSong | null;
  prevPrevEntry: SongHistoryEntry | null;
  /** True only on the single pick that completed the main set (whether or not an encore followed). */
  mainSetJustEnded: boolean;
}

function songById(state: EngineState, songId: string): EngineSong | null {
  return state.bundle.songs.find((s) => s.id === songId) ?? null;
}

function windowOf3(ctx: LogContext): SongHistoryEntry[] | null {
  if (!ctx.prevEntry || !ctx.prevPrevEntry) return null;
  return [ctx.prevPrevEntry, ctx.prevEntry, ctx.entry];
}

// ---------------------------------------------------------------------------
// Triggers — one pure predicate per Bible §8 item, over SongHistoryEntry data.
// ---------------------------------------------------------------------------

function isStrongOpener(ctx: LogContext): boolean {
  if (ctx.index !== 0) return false;
  const positiveCount = FACTIONS.filter((f) => ctx.entry.factionDeltas[f.id].delta > 0).length;
  return positiveCount >= 3;
}

function isWeakOpener(ctx: LogContext): boolean {
  return ctx.index === 0 && ctx.entry.crowdEnergyDelta < 0;
}

function isSuccessfulContrast(ctx: LogContext): boolean {
  if (!ctx.prevSong) return false;
  const gap = Math.abs((ctx.song.tempoEnergy ?? 5) - (ctx.prevSong.tempoEnergy ?? 5));
  return gap >= LOG_TUNING.contrastTempoGap && ctx.entry.crowdEnergyDelta > 0;
}

function isRepetitiveStretch(ctx: LogContext): boolean {
  const window = windowOf3(ctx);
  if (!window) return false;
  const tempos = window.map((e) => songById(ctx.state, e.songId)?.tempoEnergy ?? 5);
  return Math.max(...tempos) - Math.min(...tempos) <= LOG_TUNING.repetitiveTempoRange;
}

function isEnergySurge(ctx: LogContext): boolean {
  return ctx.entry.crowdEnergyDelta >= LOG_TUNING.surgeEnergyDelta;
}

function isEmotionalPeak(ctx: LogContext): boolean {
  return ctx.song.audience.emotional >= LOG_TUNING.exceptionalAudienceDimension && ctx.entry.crowdEnergyDelta > 0;
}

function isComplexityOverload(ctx: LogContext): boolean {
  const window = windowOf3(ctx);
  if (!window) return false;
  const allHighComplexity = window.every((e) => {
    const s = songById(ctx.state, e.songId);
    return s !== null && (s.audience.technical >= LOG_TUNING.highAudienceDimension || s.audience.progressive >= LOG_TUNING.highAudienceDimension);
  });
  if (!allHighComplexity) return false;
  const first = window[0]!;
  const last = window[window.length - 1]!;
  return last.factionMomentumAfter.casual < first.factionMomentumBefore.casual
    && last.factionMomentumAfter.firstTimers < first.factionMomentumBefore.firstTimers;
}

function isAccessibilityBoost(ctx: LogContext): boolean {
  if (!ctx.prevEntry) return false;
  const highAccessible = ctx.song.audience.accessible >= LOG_TUNING.highAudienceDimension;
  const nowPositive = ctx.entry.factionDeltas.casual.delta > 0 && ctx.entry.factionDeltas.firstTimers.delta > 0;
  const wasDeclining = ctx.prevEntry.factionDeltas.casual.delta < 0 && ctx.prevEntry.factionDeltas.firstTimers.delta < 0;
  return highAccessible && nowPositive && wasDeclining;
}

function isDeepCutSurprise(ctx: LogContext): boolean {
  return RARE_OR_ABOVE_TIERS.includes(ctx.song.liveTier);
}

function isCasualFanLoss(ctx: LogContext): boolean {
  const { casual: before } = ctx.entry.factionMomentumBefore;
  const { casual: after } = ctx.entry.factionMomentumAfter;
  return before >= LOG_TUNING.walkoutMomentumThreshold && after < LOG_TUNING.walkoutMomentumThreshold;
}

function isHardcoreExcitement(ctx: LogContext): boolean {
  return ctx.entry.factionReactionScores.hardcore >= LOG_TUNING.hardcoreExcitementReaction;
}

function isCrowdRecovery(ctx: LogContext): boolean {
  if (!ctx.prevEntry || !ctx.prevPrevEntry) return false;
  return ctx.prevPrevEntry.crowdEnergyDelta < 0 && ctx.prevEntry.crowdEnergyDelta < 0 && ctx.entry.crowdEnergyDelta > 0;
}

function isSpectrumCorrection(ctx: LogContext): boolean {
  if (!ctx.prevEntry) return false;
  return ctx.entry.metricsSnapshot.spectrumMatch - ctx.prevEntry.metricsSnapshot.spectrumMatch >= LOG_TUNING.spectrumShiftMaterial;
}

function isSpectrumDrift(ctx: LogContext): boolean {
  const window = windowOf3(ctx);
  if (!window) return false;
  const [a, b, c] = window.map((e) => e.metricsSnapshot.spectrumMatch);
  return b! < a! && c! < b!;
}

function isSuccessfulEncoreSetup(ctx: LogContext): boolean {
  if (ctx.entry.isEncore || ctx.mainSetJustEnded) return false;
  const threshold = ctx.state.bundle.rules.encoreEnergyThreshold;
  return ctx.entry.crowdEnergyBefore < threshold && ctx.entry.crowdEnergyAfter >= threshold;
}

function isEncoreDemand(ctx: LogContext): boolean {
  return ctx.mainSetJustEnded && ctx.state.encoreEligible;
}

function isPoorTransition(ctx: LogContext): boolean {
  return ctx.prevSong !== null && ctx.entry.pacingPenalty > LOG_TUNING.pacingPenaltyEpsilon;
}

function isExcellentTransition(ctx: LogContext): boolean {
  if (!ctx.prevEntry) return false;
  const bothClean = ctx.entry.pacingPenalty <= LOG_TUNING.pacingPenaltyEpsilon && ctx.prevEntry.pacingPenalty <= LOG_TUNING.pacingPenaltyEpsilon;
  const bothPositive = ctx.entry.crowdEnergyDelta > 0 && ctx.prevEntry.crowdEnergyDelta > 0;
  return bothClean && bothPositive;
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

interface ReactionTemplate {
  category: ReactionLogCategory;
  priority: PriorityTier;
  trigger: (ctx: LogContext) => boolean;
  variants: string[];
  /** deepCutSurprise only: an extra variant included in the pool only when the song is Mythic. */
  mythicOnlyVariant?: string;
}

const REACTION_TEMPLATES: readonly ReactionTemplate[] = [
  { category: 'strongOpener', priority: 'factionSpike', trigger: isStrongOpener, variants: [
    'Strong open — the room decided to like tonight.',
    'That\'s how you say hello. The floor is yours for now.',
  ] },
  { category: 'weakOpener', priority: 'factionSpike', trigger: isWeakOpener, variants: [
    'Cold start — the room is waiting to be convinced.',
    'That opener asked a lot of a crowd that doesn\'t know you yet.',
  ] },
  { category: 'successfulContrast', priority: 'pacing', trigger: isSuccessfulContrast, variants: [
    'Whiplash, the good kind — the contrast made both songs bigger.',
    'The gear-change landed. The room likes being surprised on purpose.',
  ] },
  { category: 'repetitiveStretch', priority: 'pacing', trigger: isRepetitiveStretch, variants: [
    'Three of a kind in a row — the room is starting to hear one long song.',
    'This stretch is looping. Contrast would be oxygen right now.',
  ] },
  { category: 'energySurge', priority: 'factionSpike', trigger: isEnergySurge, variants: [
    'The floor just woke up.',
    'Momentum\'s building — you can hear it between songs now.',
  ] },
  { category: 'emotionalPeak', priority: 'factionSpike', trigger: isEmotionalPeak, variants: [
    'That one landed somewhere deeper than applause.',
    'Quiet in the room — the good kind.',
  ] },
  { category: 'complexityOverload', priority: 'factionSpike', trigger: isComplexityOverload, variants: [
    'The casual crowd stopped keeping up two songs ago.',
    'Impressive stretch — for the third of the room still following it.',
  ] },
  { category: 'accessibilityBoost', priority: 'factionSpike', trigger: isAccessibilityBoost, variants: [
    'A handhold, at last — the back of the room grabbed it.',
    'That one let everybody in. Attendance thanks you.',
  ] },
  { category: 'deepCutSurprise', priority: 'factionSpike', trigger: isDeepCutSurprise, variants: [
    'Setlist historians, start your engines — that was a genuine rarity.',
    'Somebody in the front row just gasped for archival reasons.',
  ], mythicOnlyVariant: 'Never played live — until fifteen seconds ago.' },
  { category: 'casualFanLoss', priority: 'walkoutRisk', trigger: isCasualFanLoss, variants: [
    'The casual crowd is heading for the doors — this stretch gave them nothing.',
    'Walkouts starting at the back. They wanted a song to hold onto.',
  ] },
  { category: 'hardcoreExcitement', priority: 'factionSpike', trigger: isHardcoreExcitement, variants: [
    'The front rows just went off.',
    'That\'s the song the pit was waiting through the ballads for.',
  ] },
  { category: 'crowdRecovery', priority: 'factionSpike', trigger: isCrowdRecovery, variants: [
    'You pulled the room back. That was the risky part of the night.',
    'The bleeding stopped — the crowd\'s yours again, gently.',
  ] },
  { category: 'spectrumCorrection', priority: 'spectrum', trigger: isSpectrumCorrection, variants: [
    'That pick steered the set back toward the band\'s true north.',
    'Identity re-centering — the show sounds like this band again.',
  ] },
  { category: 'spectrumDrift', priority: 'spectrum', trigger: isSpectrumDrift, variants: [
    'The set is drifting from what this band is. Deliberate, or a current?',
    'Two picks off-identity in a row — the room can hear the compass spinning.',
  ] },
  { category: 'successfulEncoreSetup', priority: 'factionSpike', trigger: isSuccessfulEncoreSetup, variants: [
    'The room\'s warm enough to want more — an encore is on the table if you land the closer.',
    'Keep this energy through the closer and they won\'t let you leave.',
  ] },
  { category: 'encoreDemand', priority: 'factionSpike', trigger: isEncoreDemand, variants: [
    'They\'re not leaving. The floor is stamping for one more.',
    'Houselights up, nobody moving. Your call.',
  ] },
  { category: 'poorTransition', priority: 'pacing', trigger: isPoorTransition, variants: [
    'Rough gear-change — the momentum snagged between those two songs.',
    'That transition asked the crowd to jump a gap. Some didn\'t.',
  ] },
  { category: 'excellentTransition', priority: 'pacing', trigger: isExcellentTransition, variants: [
    'Seamless — those two songs shook hands mid-air.',
    'That\'s sequencing: the second song started before anyone finished cheering the first.',
  ] },
];

/**
 * Builds up to MAX_LOG_LINES_PER_SONG log lines for the most recently played
 * song in `state.history`. Pass `mainSetJustEnded: true` only for the single
 * pick that completed the main set (whether or not an encore followed) —
 * everywhere else it should be false, including every encore-song pick.
 */
export function buildReactionLogForSong(state: EngineState, mainSetJustEnded = false): ReactionLogEntry[] {
  const index = state.history.length - 1;
  if (index < 0) return [];
  const entry = state.history[index]!;
  const song = songById(state, entry.songId);
  if (!song) return [];

  const prevEntry = index >= 1 ? state.history[index - 1]! : null;
  const prevSong = prevEntry ? songById(state, prevEntry.songId) : null;
  const prevPrevEntry = index >= 2 ? state.history[index - 2]! : null;

  const ctx: LogContext = { state, index, entry, song, prevEntry, prevSong, prevPrevEntry, mainSetJustEnded };

  const triggered = REACTION_TEMPLATES.filter((t) => t.trigger(ctx));
  triggered.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  return triggered.slice(0, MAX_LOG_LINES_PER_SONG).map((t) => {
    const pool = t.mythicOnlyVariant && song.liveTier === 'Mythic' ? [...t.variants, t.mythicOnlyVariant] : t.variants;
    return { category: t.category, text: pickBySeededHash(pool, state.seed, entry.songId, t.category) };
  });
}

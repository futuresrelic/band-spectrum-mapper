/**
 * Headliner — Achievement Evaluation Helpers (Creative Bible §12, Phase Z.17.14)
 *
 * Pure predicates only — no persistence, no awarding, no achievement
 * table. The project has no existing achievement-storage mechanism, and
 * building one is explicitly out of scope for this phase; these
 * functions exist so a future persistence layer can ask "did this
 * completed show earn achievement N?" without recalculating or scraping
 * UI state — everything here reads only EngineState/ConcertReport (plus,
 * for Campaign/Daily-specific achievements, the small already-computed
 * context a caller has on hand at finalize time: stageKey, stars,
 * whether this was an official Daily attempt, the Daily's contextKey).
 *
 * Scope, from the Creative Bible's 30-achievement table: only
 * achievements determinable from ONE completed show are implemented
 * here. Explicitly NOT implemented, and why:
 *
 *   - #2 Bedrock, #10 The Archivist, #14 Era-Proof, #19 Working Band,
 *     #22 The Whole Ladder — need a count/condition across MULTIPLE
 *     completed shows (a cross-run counter), which is a persistence
 *     concern this phase doesn't build.
 *   - #12 Witness, #17 Always Wanted, #24 Regular — need a streak
 *     counter across shows/days; same reason.
 *   - #25 Same Room, Better Night — needs the player's persisted
 *     previous-best score to compare against; that's progress-record
 *     state, not something one show's report/state can answer alone.
 *   - #30 Matinee Idol, Evening Legend — requires the aspirational venue
 *     archetypes (Arena, Historic Venue, etc.) from Bible §4, which
 *     don't exist as real venues yet. Explicitly left future-gated per
 *     the phase instructions: never approximate this one to activate it.
 *
 * #8 (The Turnaround) and #27 (Friend of the Floor) are the two that
 * became newly evaluable this phase, thanks to Part B's per-song history
 * (SongHistoryEntry.metricsSnapshot) and the per-faction final momentum
 * already sitting in EngineState. #28/#29 reuse the existing Daily
 * contextKey values ('hardcore_crowd', 'newcomer_friendly') already
 * shipped in dailyChallengeService.ts.
 */

import { FACTIONS, type ConcertReport, type EngineState } from './concertEngine.js';
import { RARE_OR_BELOW_TIERS, type StageKey } from './campaignStages.js';

/** Reuses the existing per-song reaction "lose it" threshold (concertEngine.ts's explainReaction) as the momentum band for "a faction's final standing is exceptional" — no new number invented. */
const HIGH_MOMENTUM_BAND = 45;

export function achievesTheRealThing(state: EngineState, report: ConcertReport): boolean {
  return report.metrics.authenticity === 100 && state.playedSongIds.length >= 6;
}

export function achievesNobodyLeftEarly(state: EngineState, report: ConcertReport): boolean {
  return report.metrics.audienceRetention >= 90 && state.playedSongIds.length >= 6;
}

export function achievesPackedHouse(report: ConcertReport, stageKey: StageKey | null): boolean {
  return (stageKey === 'festival_side_stage' || stageKey === 'major_theatre') && report.metrics.audienceRetention >= 80;
}

export function achievesTideChart(report: ConcertReport): boolean {
  return report.metrics.energyCurveFit >= 90;
}

export function achievesCleanHands(state: EngineState, report: ConcertReport): boolean {
  return report.metrics.paceDiscipline === 100 && state.playedSongIds.length >= 8;
}

export function achievesSomewhereElseEntirely(report: ConcertReport): boolean {
  return report.metrics.emotionalJourney >= 90;
}

/**
 * "Lose the room, then win it back" — the per-song audienceRetention
 * snapshot (Part B) dipped below Poor (< 40) at some point in the show,
 * and the FINAL report still reached Strong (>= 70). Never approximated
 * from the final score alone — it genuinely checks the show's history.
 */
export function achievesTheTurnaround(state: EngineState, report: ConcertReport): boolean {
  const droppedBelow40 = state.history.some((h) => h.metricsSnapshot.audienceRetention < 40);
  return droppedBelow40 && report.metrics.audienceRetention >= 70;
}

export function achievesDugDeep(state: EngineState): boolean {
  const played = state.bundle.songs.filter((s) => state.playedSongIds.includes(s.id));
  const rareCount = played.filter((s) => RARE_OR_BELOW_TIERS.includes(s.liveTier)).length;
  return rareCount >= 3;
}

export function achievesFirstTimeForEverything(state: EngineState): boolean {
  return state.bundle.songs.some((s) => state.playedSongIds.includes(s.id) && s.liveTier === 'Mythic');
}

export function achievesFullCatalog(state: EngineState, report: ConcertReport): boolean {
  const played = state.bundle.songs.filter((s) => state.playedSongIds.includes(s.id));
  const albumCount = new Set(played.map((s) => s.albumId).filter((id): id is string => id !== null)).size;
  return report.metrics.diversity >= 90 && played.length >= 8 && albumCount >= 5;
}

export function achievesOneMore(state: EngineState): boolean {
  return state.encorePlayed;
}

export function achievesExitThroughTheRoof(report: ConcertReport): boolean {
  return report.metrics.encoreQuality >= 85;
}

export function achievesOffBook(stageKey: StageKey | null, stars: number): boolean {
  return stageKey === 'rehearsal_room' && stars >= 1;
}

export function achievesTopOfTheMarquee(stageKey: StageKey | null, stars: number): boolean {
  return stageKey === 'major_theatre' && stars >= 1;
}

export function achievesNoNotes(stars: number): boolean {
  return stars >= 3;
}

export function achievesShowedUp(isOfficialDailyAttempt: boolean): boolean {
  return isOfficialDailyAttempt;
}

export function achievesHouseFavorite(stageKey: StageKey | null, stars: number, report: ConcertReport): boolean {
  return stageKey === 'festival_side_stage' && stars >= 3 && report.metrics.rarityExcitement >= 70;
}

/** "Send every faction home happy" — every faction's final momentum is positive. */
export function achievesFriendOfTheFloor(state: EngineState): boolean {
  return FACTIONS.every((f) => state.factionMomentum[f.id] > 0);
}

export function achievesSpeaksFluentHunter(state: EngineState, dailyContextKey: string | null): boolean {
  return dailyContextKey === 'hardcore_crowd' && state.factionMomentum.deepCut >= HIGH_MOMENTUM_BAND;
}

export function achievesOpenDoorPolicy(state: EngineState, dailyContextKey: string | null): boolean {
  return dailyContextKey === 'newcomer_friendly' && state.factionMomentum.firstTimers >= HIGH_MOMENTUM_BAND;
}

export interface AchievementEvalContext {
  /** Campaign-only. Null/undefined for Quick Show and Daily runs. */
  stageKey?: StageKey | null;
  /** Campaign-only star result for this run, already computed by campaignService.computeStars. */
  stars?: number | null;
  /** Daily-only: was this the day's Official Attempt (not a practice run)? */
  isOfficialDailyAttempt?: boolean;
  /** Daily-only: the challenge's contextKey (e.g. 'hardcore_crowd', 'newcomer_friendly'). */
  dailyContextKey?: string | null;
}

export interface AchievementEvalResult {
  id: number;
  name: string;
  met: boolean;
}

/**
 * Evaluates every Bible §12 achievement that's determinable from a single
 * completed show, given the run's EngineState/ConcertReport plus whatever
 * small mode-specific context a caller already has at finalize time.
 * Returns met=true/false for each — nothing here persists or awards.
 */
export function evaluateSingleShowAchievements(
  state: EngineState,
  report: ConcertReport,
  ctx: AchievementEvalContext = {},
): AchievementEvalResult[] {
  const stageKey = ctx.stageKey ?? null;
  const stars = ctx.stars ?? 0;
  const dailyContextKey = ctx.dailyContextKey ?? null;

  return [
    { id: 1, name: 'The Real Thing', met: achievesTheRealThing(state, report) },
    { id: 3, name: 'Nobody Left Early', met: achievesNobodyLeftEarly(state, report) },
    { id: 4, name: 'Packed House', met: achievesPackedHouse(report, stageKey) },
    { id: 5, name: 'Tide Chart', met: achievesTideChart(report) },
    { id: 6, name: 'Clean Hands', met: achievesCleanHands(state, report) },
    { id: 7, name: 'Somewhere Else Entirely', met: achievesSomewhereElseEntirely(report) },
    { id: 8, name: 'The Turnaround', met: achievesTheTurnaround(state, report) },
    { id: 9, name: 'Dug Deep', met: achievesDugDeep(state) },
    { id: 11, name: 'First Time for Everything', met: achievesFirstTimeForEverything(state) },
    { id: 13, name: 'Full Catalog', met: achievesFullCatalog(state, report) },
    { id: 15, name: 'One More', met: achievesOneMore(state) },
    { id: 16, name: 'Exit Through the Roof', met: achievesExitThroughTheRoof(report) },
    { id: 18, name: 'Off Book', met: achievesOffBook(stageKey, stars) },
    { id: 20, name: 'Top of the Marquee', met: achievesTopOfTheMarquee(stageKey, stars) },
    { id: 21, name: 'No Notes', met: achievesNoNotes(stars) },
    { id: 23, name: 'Showed Up', met: achievesShowedUp(ctx.isOfficialDailyAttempt === true) },
    { id: 26, name: 'House Favorite', met: achievesHouseFavorite(stageKey, stars, report) },
    { id: 27, name: 'Friend of the Floor', met: achievesFriendOfTheFloor(state) },
    { id: 28, name: 'Speaks Fluent Hunter', met: achievesSpeaksFluentHunter(state, dailyContextKey) },
    { id: 29, name: 'Open Door Policy', met: achievesOpenDoorPolicy(state, dailyContextKey) },
  ];
}

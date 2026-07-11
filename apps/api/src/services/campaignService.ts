/**
 * Headliner — Campaign Service (Phase Z.17.10)
 *
 * Orchestrates everything Campaign-specific: stage-ladder progress,
 * eligibility explanations, objective feasibility/evaluation, star scoring,
 * and stage unlocks. Reuses the same pure concertEngine.ts as Quick Show —
 * every Campaign-specific rule enters through campaignStages.ts config and
 * the ShowBundle's `rules`, never a forked simulation.
 *
 * Star/objective evaluation reads the raw EngineState (already available at
 * finish time from ConcertRun.stateJson) instead of extending
 * concertEngine.ts's ConcertReport shape — keeps the shared engine artifact
 * untouched by Campaign-only concerns.
 */

import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { ConcertReport, EngineState } from './concertEngine.js';
import {
  CAMPAIGN_STAGES, STAGE_ORDER, RARE_OR_BELOW_TIERS, getStage, nextStageKey,
  type StageKey, type CampaignStageConfig, type StageObjective,
} from './campaignStages.js';
import { getRecoveredCatalogDetail, type RecoveredCatalogEntry } from './campaignEligibilityService.js';

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export async function getOrCreateProgress(userId: string, bandId: string) {
  const existing = await prisma.headlinerCampaignProgress.findUnique({ where: { userId_bandId: { userId, bandId } } });
  if (existing) return existing;
  return prisma.headlinerCampaignProgress.create({ data: { userId, bandId } });
}

export async function markTutorialCompleted(userId: string, bandId: string): Promise<void> {
  const progress = await getOrCreateProgress(userId, bandId);
  if (progress.tutorialCompleted) return;
  await prisma.headlinerCampaignProgress.update({ where: { id: progress.id }, data: { tutorialCompleted: true } });
}

// ---------------------------------------------------------------------------
// Stage readiness — the "explain exactly what's missing" rule (never "Locked")
// ---------------------------------------------------------------------------

export interface StageReadiness {
  eligible: boolean;
  missingSongs: number;
  missingDurationSeconds: number;
  message: string | null;
}

export function checkStageReadiness(
  stage: CampaignStageConfig,
  bandName: string,
  catalog: RecoveredCatalogEntry[],
): StageReadiness {
  const totalDuration = catalog.reduce((sum, c) => sum + c.durationSeconds, 0);
  const missingSongs = Math.max(0, stage.requiredRecoveredSongs - catalog.length);
  const missingDurationSeconds = Math.max(0, stage.requiredMinDurationSeconds - totalDuration);
  const eligible = missingSongs === 0 && missingDurationSeconds === 0;

  let message: string | null = null;
  if (!eligible) {
    const reqMin = Math.round(stage.requiredMinDurationSeconds / 60);
    message = `You have recovered ${catalog.length} ${bandName} song${catalog.length === 1 ? '' : 's'}. `
      + `${stage.name} requires at least ${stage.requiredRecoveredSongs} songs or ${reqMin} minutes of playable material.`;
  }
  return { eligible, missingSongs, missingDurationSeconds, message };
}

// ---------------------------------------------------------------------------
// Objective feasibility (pre-run) and evaluation (post-run)
// ---------------------------------------------------------------------------

export function isObjectiveFeasible(objective: StageObjective, catalog: RecoveredCatalogEntry[]): boolean {
  switch (objective.type) {
    case 'minAlbumsRepresented': {
      const albums = new Set(catalog.map((c) => c.albumId).filter((id): id is string => id !== null));
      return albums.size >= objective.count;
    }
    case 'playRareOrBelow':
      return catalog.some((c) => RARE_OR_BELOW_TIERS.includes(c.liveTier));
    default:
      return true; // score-based objectives are always theoretically reachable
  }
}

function uniqueAlbumsPlayed(state: EngineState): number {
  const albumIds = state.bundle.songs
    .filter((s) => state.playedSongIds.includes(s.id))
    .map((s) => s.albumId)
    .filter((id): id is string => id !== null);
  return new Set(albumIds).size;
}

function rareOrBelowPlayed(state: EngineState): boolean {
  return state.bundle.songs
    .filter((s) => state.playedSongIds.includes(s.id))
    .some((s) => RARE_OR_BELOW_TIERS.includes(s.liveTier));
}

function evaluateObjective(objective: StageObjective, report: ConcertReport, state: EngineState): boolean {
  switch (objective.type) {
    case 'minAudienceRetention': return report.metrics.audienceRetention >= objective.threshold;
    case 'minAuthenticity':      return report.metrics.authenticity >= objective.threshold;
    case 'minAlbumsRepresented': return uniqueAlbumsPlayed(state) >= objective.count;
    case 'playRareOrBelow':      return rareOrBelowPlayed(state);
    case 'minSpectrumMatch':     return report.metrics.spectrumMatch >= objective.threshold;
    case 'strongEncore':         return state.encorePlayed && report.metrics.encoreQuality >= objective.threshold;
  }
}

// ---------------------------------------------------------------------------
// Stars
// ---------------------------------------------------------------------------

export interface ObjectiveResult {
  key: string;
  label: string;
  met: boolean;
  wasRequired: boolean; // false if this objective was infeasible given the recovered catalog, so it didn't block 3 stars
}

export interface StarResult {
  stars: number;
  objectiveResults: ObjectiveResult[];
}

export function computeStars(
  stage: CampaignStageConfig,
  report: ConcertReport,
  state: EngineState,
  feasibleObjectiveKeys: Set<string>,
): StarResult {
  const objectiveResults: ObjectiveResult[] = stage.objectives.map((o) => ({
    key: o.key,
    label: o.label,
    met: evaluateObjective(o, report, state),
    wasRequired: feasibleObjectiveKeys.has(o.key),
  }));

  let stars = 0;
  if (report.overallScore >= stage.starThresholds.oneStar) stars = 1;

  const twoStarGateMet = stage.twoStarGates.length === 0
    || stage.twoStarGates.some((g) => report.metrics[g.metric] >= g.threshold);
  if (stars >= 1 && report.overallScore >= stage.starThresholds.twoStar && twoStarGateMet) stars = 2;

  const requiredObjectivesMet = objectiveResults.filter((r) => r.wasRequired).every((r) => r.met);
  if (stars >= 2 && report.overallScore >= stage.starThresholds.threeStar && requiredObjectivesMet) stars = 3;

  return { stars, objectiveResults };
}

// ---------------------------------------------------------------------------
// Ladder (stage-select screen)
// ---------------------------------------------------------------------------

export interface StageCard {
  key: StageKey;
  order: number;
  name: string;
  description: string;
  contextLabel: string;
  capacity: number;
  showLengthMinutes: number;
  requiredRecoveredSongs: number;
  requiredMinDurationSeconds: number;
  objectives: { key: string; label: string }[];
  starThresholds: CampaignStageConfig['starThresholds'];
  status: 'locked' | 'available' | 'cleared';
  bestScore: number | null;
  bestStars: number;
  readiness: StageReadiness;
  tutorial: boolean;
}

export interface CampaignLadder {
  bandId: string;
  bandName: string;
  bandSlug: string;
  currentStage: StageKey;
  unlockedStage: StageKey;
  totalShowsCompleted: number;
  bestScore: number | null;
  totalAudienceReached: number;
  starsEarned: number;
  tutorialCompleted: boolean;
  recoveredCount: number;
  stages: StageCard[];
}

export async function getLadder(userId: string, bandId: string): Promise<CampaignLadder> {
  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { id: true, name: true, slug: true } });
  if (!band) throw new HttpError(404, 'Band not found');

  const [progress, catalog, results] = await Promise.all([
    getOrCreateProgress(userId, bandId),
    getRecoveredCatalogDetail(userId, bandId),
    prisma.headlinerCampaignShowResult.findMany({
      where: { progress: { userId, bandId } },
      select: { stageKey: true, score: true, stars: true },
    }),
  ]);

  const bestByStage = new Map<StageKey, { score: number; stars: number }>();
  for (const r of results) {
    const key = r.stageKey as StageKey;
    const cur = bestByStage.get(key);
    bestByStage.set(key, {
      score: Math.max(cur?.score ?? -Infinity, r.score),
      stars: Math.max(cur?.stars ?? 0, r.stars),
    });
  }

  const unlockedOrder = getStage(progress.unlockedStage as StageKey).order;

  const stages: StageCard[] = STAGE_ORDER.map((key) => {
    const stage = CAMPAIGN_STAGES[key];
    const best = bestByStage.get(key) ?? null;
    const status: StageCard['status'] = best && best.stars >= 1 ? 'cleared' : stage.order <= unlockedOrder ? 'available' : 'locked';
    return {
      key: stage.key,
      order: stage.order,
      name: stage.name,
      description: stage.description,
      contextLabel: stage.contextLabel,
      capacity: stage.capacity,
      showLengthMinutes: stage.showLengthMinutes,
      requiredRecoveredSongs: stage.requiredRecoveredSongs,
      requiredMinDurationSeconds: stage.requiredMinDurationSeconds,
      objectives: stage.objectives.map((o) => ({ key: o.key, label: o.label })),
      starThresholds: stage.starThresholds,
      status,
      bestScore: best?.score ?? null,
      bestStars: best?.stars ?? 0,
      readiness: checkStageReadiness(stage, band.name, catalog),
      tutorial: stage.tutorial,
    };
  });

  return {
    bandId: band.id,
    bandName: band.name,
    bandSlug: band.slug,
    currentStage: progress.currentStage as StageKey,
    unlockedStage: progress.unlockedStage as StageKey,
    totalShowsCompleted: progress.totalShowsCompleted,
    bestScore: progress.bestScore,
    totalAudienceReached: progress.totalAudienceReached,
    starsEarned: progress.starsEarned,
    tutorialCompleted: progress.tutorialCompleted,
    recoveredCount: catalog.length,
    stages,
  };
}

/** Validates a stage attempt is fair before a run is created — never starts an unwinnable/unfair run. */
export async function assertStageStartable(userId: string, bandId: string, stageKey: string): Promise<{
  stage: CampaignStageConfig;
  catalog: RecoveredCatalogEntry[];
  recoveredSongIds: string[];
}> {
  const stage = CAMPAIGN_STAGES[stageKey as StageKey];
  if (!stage) throw new HttpError(400, `Unknown Campaign stage "${stageKey}"`);

  const progress = await getOrCreateProgress(userId, bandId);
  if (stage.order > getStage(progress.unlockedStage as StageKey).order) {
    throw new HttpError(403, `${stage.name} is not unlocked yet — clear ${getStage(progress.unlockedStage as StageKey).name} first.`);
  }

  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { name: true } });
  if (!band) throw new HttpError(404, 'Band not found');

  const catalog = await getRecoveredCatalogDetail(userId, bandId);
  const readiness = checkStageReadiness(stage, band.name, catalog);
  if (!readiness.eligible) {
    throw new HttpError(422, readiness.message ?? 'Not enough recovered songs for this stage yet.');
  }

  return { stage, catalog, recoveredSongIds: catalog.map((c) => c.songId) };
}

// ---------------------------------------------------------------------------
// Finalize — called once a Campaign run's report is built
// ---------------------------------------------------------------------------

export interface CampaignFinishResult {
  stageKey: StageKey;
  stageName: string;
  score: number;
  stars: number;
  objectiveResults: ObjectiveResult[];
  previousBest: number | null;
  isNewBest: boolean;
  firstClear: boolean;
  nextStageUnlocked: StageKey | null;
  totalShowsCompleted: number;
  totalAudienceReached: number;
  starsEarned: number;
  recoverySuggestion: string | null;
}

export async function finalizeCampaignRun(
  userId: string,
  bandId: string,
  concertRunId: string,
  stageKey: StageKey,
  report: ConcertReport,
  state: EngineState,
): Promise<CampaignFinishResult> {
  const stage = getStage(stageKey);
  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { name: true } });
  if (!band) throw new HttpError(404, 'Band not found');

  const progress = await getOrCreateProgress(userId, bandId);
  const catalog = await getRecoveredCatalogDetail(userId, bandId);
  const feasibleObjectiveKeys = new Set(
    stage.objectives.filter((o) => isObjectiveFeasible(o, catalog)).map((o) => o.key),
  );
  const { stars, objectiveResults } = computeStars(stage, report, state, feasibleObjectiveKeys);

  const previousBest = progress.bestScore;
  const priorResultForStage = await prisma.headlinerCampaignShowResult.findFirst({
    where: { progressId: progress.id, stageKey },
  });
  const firstClear = !priorResultForStage && stars >= 1;

  await prisma.headlinerCampaignShowResult.create({
    data: { progressId: progress.id, stageKey, concertRunId, score: report.overallScore, stars, firstClear },
  });

  const allResults = await prisma.headlinerCampaignShowResult.findMany({
    where: { progressId: progress.id },
    select: { stageKey: true, stars: true },
  });
  const bestStarsByStage = new Map<string, number>();
  for (const r of allResults) {
    bestStarsByStage.set(r.stageKey, Math.max(bestStarsByStage.get(r.stageKey) ?? 0, r.stars));
  }
  const starsEarned = [...bestStarsByStage.values()].reduce((a, b) => a + b, 0);

  let unlockedStage = progress.unlockedStage as StageKey;
  let nextStageUnlocked: StageKey | null = null;
  if (stageKey === unlockedStage && stars >= stage.unlockRequiresStars) {
    const next = nextStageKey(stageKey);
    if (next) { unlockedStage = next; nextStageUnlocked = next; }
  }

  const updated = await prisma.headlinerCampaignProgress.update({
    where: { id: progress.id },
    data: {
      currentStage: stageKey,
      unlockedStage,
      totalShowsCompleted: { increment: 1 },
      bestScore: Math.max(progress.bestScore ?? 0, report.overallScore),
      totalAudienceReached: { increment: stage.capacity },
      starsEarned,
    },
  });

  const upcomingStage = getStage(unlockedStage);
  const upcomingReadiness = checkStageReadiness(upcomingStage, band.name, catalog);
  const recoverySuggestion = upcomingReadiness.eligible ? null : upcomingReadiness.message;

  return {
    stageKey,
    stageName: stage.name,
    score: report.overallScore,
    stars,
    objectiveResults,
    previousBest: previousBest ?? null,
    isNewBest: report.overallScore > (previousBest ?? -1),
    firstClear,
    nextStageUnlocked,
    totalShowsCompleted: updated.totalShowsCompleted,
    totalAudienceReached: updated.totalAudienceReached,
    starsEarned: updated.starsEarned,
    recoverySuggestion,
  };
}

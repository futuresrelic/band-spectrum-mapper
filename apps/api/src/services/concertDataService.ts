/**
 * Headliner — Concert Data Service (Phase Z.17.9, extended Z.17.10 for Campaign)
 *
 * The ONLY place Headliner touches Prisma. Assembles a ShowBundle once, at
 * run start, and everything after that runs against the frozen snapshot
 * stored in ConcertRun.stateJson — see the "Snapshot boundary" note in
 * docs/proposals/HEADLINER_DATA_FLOW.md.
 *
 * Deliberately does NOT import audienceProfileService: that service can
 * trigger a synchronous OpenAI call on a cache miss (`getOrCreate`), which
 * would break the engine's determinism and AI-free-gameplay guarantee. This
 * service reads `prisma.songAudienceProfile` directly and falls back to a
 * neutral profile for songs with no row, exactly as documented in the data
 * flow blueprint (§3).
 */

import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { scoreService } from './scoreService.js';
import { deriveLiveFrequency } from '@band-spectrum-mapper/shared';
import {
  TUNING, AUDIENCE_DIMENSIONS, AXES, DEFAULT_SHOW_RULES,
  type ShowBundle, type EngineSong, type EngineVenue, type Axis, type AudienceDimension,
} from './concertEngine.js';
import type { CampaignStageConfig } from './campaignStages.js';

export const MIN_SCORED_SONGS_FOR_BAND = 5;

const NEUTRAL_AUDIENCE: Record<AudienceDimension, number> = AUDIENCE_DIMENSIONS.reduce(
  (acc, dim) => { acc[dim] = 50; return acc; },
  {} as Record<AudienceDimension, number>,
);

const SONG_SELECT = {
  id: true,
  title: true,
  albumId: true,
  durationSeconds: true,
  rarity: true,
  eligibleHeadliner: true,
  trackType: true,
  album: { select: { title: true } },
  score: { select: { aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true } },
  musicScore: { select: { tempoEnergy: true } },
  audienceProfile: {
    select: {
      progressive: true, heavy: true, technical: true, atmospheric: true, experimental: true,
      accessible: true, psychedelic: true, emotional: true, aggressive: true, improvisational: true,
    },
  },
  bandRpgProfile: { select: { liveStatus: true, liveValue: true } },
} as const;

type SongRow = Awaited<ReturnType<typeof prisma.song.findMany<{ where: { bandId: string }; select: typeof SONG_SELECT }>>>[number];

function mapSongRow(s: SongRow): EngineSong {
  const { tier, source } = deriveLiveFrequency(s.bandRpgProfile?.liveStatus ?? null, s.rarity);
  const audienceIsFallback = !s.audienceProfile;
  return {
    id: s.id,
    title: s.title,
    albumId: s.albumId,
    albumTitle: s.album?.title ?? null,
    durationSeconds: s.durationSeconds ?? TUNING.defaultSongSeconds,
    axis: s.score
      ? {
          aggression: s.score.aggression, complexity: s.score.complexity, atmosphere: s.score.atmosphere,
          emotion: s.score.emotion, psychedelic: s.score.psychedelic, concept: s.score.concept,
        }
      : null,
    tempoEnergy: s.musicScore?.tempoEnergy ?? null,
    audience: s.audienceProfile
      ? {
          progressive: s.audienceProfile.progressive, heavy: s.audienceProfile.heavy,
          technical: s.audienceProfile.technical, atmospheric: s.audienceProfile.atmospheric,
          experimental: s.audienceProfile.experimental, accessible: s.audienceProfile.accessible,
          psychedelic: s.audienceProfile.psychedelic, emotional: s.audienceProfile.emotional,
          aggressive: s.audienceProfile.aggressive, improvisational: s.audienceProfile.improvisational,
        }
      : NEUTRAL_AUDIENCE,
    audienceIsFallback,
    liveTier: tier,
    liveSource: source,
    liveValue: s.bandRpgProfile?.liveValue ?? 0,
    eligibleHeadliner: s.eligibleHeadliner,
    trackType: s.trackType,
  };
}

/** The band's canonical identity target — same average Quick Show and every Campaign stage aim for. */
async function loadTargetSpectrum(bandId: string): Promise<{ targetSpectrum: Record<Axis, number>; scoredSongCount: number }> {
  const axisAverages = await scoreService.averagesByBand(bandId);
  const scoredSongCount = axisAverages[0]?.count ?? 0;
  const targetSpectrum = axisAverages.reduce((acc, a) => {
    acc[a.axis as Axis] = a.average;
    return acc;
  }, {} as Record<Axis, number>);
  for (const axis of AXES) {
    if (targetSpectrum[axis] === undefined) targetSpectrum[axis] = 5;
  }
  return { targetSpectrum, scoredSongCount };
}

export interface BandEligibility {
  bandId: string;
  bandName: string;
  eligible: boolean;
  scoredSongCount: number;
  reason?: string;
}

/** Lightweight check for the Quick Show band-select screen — no full bundle assembly. */
export async function checkBandEligibility(bandId: string): Promise<BandEligibility> {
  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { id: true, name: true } });
  if (!band) throw new HttpError(404, 'Band not found');

  const { scoredSongCount } = await loadTargetSpectrum(bandId);

  if (scoredSongCount < MIN_SCORED_SONGS_FOR_BAND) {
    return {
      bandId: band.id,
      bandName: band.name,
      eligible: false,
      scoredSongCount,
      reason: `Needs at least ${MIN_SCORED_SONGS_FOR_BAND} spectrum-scored songs to play Headliner (currently has ${scoredSongCount}).`,
    };
  }
  return { bandId: band.id, bandName: band.name, eligible: true, scoredSongCount };
}

async function loadVenue(venueId: string | null): Promise<EngineVenue | null> {
  if (!venueId) return null;
  const venue = await prisma.bandRpgVenue.findUnique({ where: { id: venueId } });
  if (!venue) return null;
  return {
    id: venue.id,
    name: venue.name,
    capacity: venue.capacity,
    affinity: {
      aggression: venue.aggressionAffinity,
      complexity: venue.complexityAffinity,
      atmosphere: venue.atmosphereAffinity,
      emotion: venue.emotionAffinity,
      psychedelic: venue.psychedelicAffinity,
      concept: venue.conceptAffinity,
    },
    rarityBonus: venue.rarityBonus,
  };
}

/**
 * Track Classification (Phase Z.17.15): Quick Show and Campaign prefer
 * eligible tracks (a strong ranking penalty in concertEngine.ts's
 * candidateValue — every song stays in the pool, see EngineSong's doc
 * comment). Daily Challenge is stricter: "should only consider tracks
 * eligible for Daily Challenge" is a hard requirement, so its pool is
 * filtered at the query level instead.
 */
export type SongPoolMode = 'headliner' | 'daily';

/**
 * Assembles the full playable song catalog + identity target for a band.
 * Called exactly once, at POST /api/headliner/runs — never again for the
 * lifetime of that run.
 */
export async function buildShowBundle(bandId: string, venueId: string | null, mode: SongPoolMode = 'headliner'): Promise<ShowBundle> {
  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { id: true, name: true } });
  if (!band) throw new HttpError(404, 'Band not found');

  const { targetSpectrum, scoredSongCount } = await loadTargetSpectrum(bandId);
  if (scoredSongCount < MIN_SCORED_SONGS_FOR_BAND) {
    throw new HttpError(422, `This band needs at least ${MIN_SCORED_SONGS_FOR_BAND} spectrum-scored songs before Headliner can be played (has ${scoredSongCount}).`);
  }

  const rows = await prisma.song.findMany({
    where: mode === 'daily' ? { bandId, eligibleDailyChallenge: true } : { bandId },
    select: SONG_SELECT,
  });
  const songs = rows.map(mapSongRow);
  const venue = await loadVenue(venueId);

  return {
    bandId: band.id,
    bandName: band.name,
    songs,
    targetSpectrum,
    venue,
    showLengthBudgetSeconds: TUNING.targetShowMinutes * 60,
    rules: DEFAULT_SHOW_RULES,
  };
}

/**
 * Campaign variant: the candidate pool is restricted to songs this user has
 * actually recovered for this band in Band RPG (`BandRpgCollectedSong` —
 * checked by the caller before this runs; see campaignEligibilityService.ts).
 * The identity target stays the band's full canonical average — same as
 * Quick Show — so a small recovered catalog is a genuine gameplay
 * constraint (per the design spec: "difficulty comes from catalog
 * limitations, not hidden information"), never a shrunk, easier target.
 *
 * No `eligibleHeadliner` query filter here, deliberately — Campaign is
 * Headliner gameplay, so it gets the same soft preference (not a hard
 * exclusion) that Quick Show gets, already applied universally by
 * concertEngine.ts's candidateValue once mapSongRow carries the flag.
 */
export async function buildCampaignShowBundle(
  bandId: string,
  recoveredSongIds: string[],
  stage: CampaignStageConfig,
): Promise<ShowBundle> {
  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { id: true, name: true } });
  if (!band) throw new HttpError(404, 'Band not found');
  if (recoveredSongIds.length === 0) {
    throw new HttpError(422, 'No recovered songs for this band yet — recover songs in Band RPG first.');
  }

  const { targetSpectrum, scoredSongCount } = await loadTargetSpectrum(bandId);
  if (scoredSongCount < MIN_SCORED_SONGS_FOR_BAND) {
    throw new HttpError(422, `This band needs at least ${MIN_SCORED_SONGS_FOR_BAND} spectrum-scored songs before Headliner can be played (has ${scoredSongCount}).`);
  }

  const rows = await prisma.song.findMany({
    where: { bandId, id: { in: recoveredSongIds } },
    select: SONG_SELECT,
  });
  const songs = rows.map(mapSongRow);

  return {
    bandId: band.id,
    bandName: band.name,
    songs,
    targetSpectrum,
    venue: null, // Campaign venues are narrative flavor from campaignStages.ts, not BandRpgVenue rows
    showLengthBudgetSeconds: stage.showLengthMinutes * 60,
    rules: { ...DEFAULT_SHOW_RULES, ...stage.rulesOverride },
  };
}

/**
 * Headliner — Concert Data Service (Phase Z.17.9)
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
  TUNING, AUDIENCE_DIMENSIONS, AXES,
  type ShowBundle, type EngineSong, type EngineVenue, type Axis, type AudienceDimension,
} from './concertEngine.js';

export const MIN_SCORED_SONGS_FOR_BAND = 5;

const NEUTRAL_AUDIENCE: Record<AudienceDimension, number> = AUDIENCE_DIMENSIONS.reduce(
  (acc, dim) => { acc[dim] = 50; return acc; },
  {} as Record<AudienceDimension, number>,
);

export interface BandEligibility {
  bandId: string;
  bandName: string;
  eligible: boolean;
  scoredSongCount: number;
  reason?: string;
}

/** Lightweight check for the band-select screen — no full bundle assembly. */
export async function checkBandEligibility(bandId: string): Promise<BandEligibility> {
  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { id: true, name: true } });
  if (!band) throw new HttpError(404, 'Band not found');

  const axisAverages = await scoreService.averagesByBand(bandId);
  const scoredSongCount = axisAverages[0]?.count ?? 0;

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
 * Assembles the full playable song catalog + identity target for a band.
 * Called exactly once, at POST /api/headliner/runs — never again for the
 * lifetime of that run.
 */
export async function buildShowBundle(bandId: string, venueId: string | null): Promise<ShowBundle> {
  const band = await prisma.band.findUnique({ where: { id: bandId }, select: { id: true, name: true } });
  if (!band) throw new HttpError(404, 'Band not found');

  const axisAverages = await scoreService.averagesByBand(bandId);
  const scoredSongCount = axisAverages[0]?.count ?? 0;
  if (scoredSongCount < MIN_SCORED_SONGS_FOR_BAND) {
    throw new HttpError(422, `This band needs at least ${MIN_SCORED_SONGS_FOR_BAND} spectrum-scored songs before Headliner can be played (has ${scoredSongCount}).`);
  }

  const targetSpectrum = axisAverages.reduce((acc, a) => {
    acc[a.axis as Axis] = a.average;
    return acc;
  }, {} as Record<Axis, number>);
  for (const axis of AXES) {
    if (targetSpectrum[axis] === undefined) targetSpectrum[axis] = 5;
  }

  const rows = await prisma.song.findMany({
    where: { bandId },
    select: {
      id: true,
      title: true,
      albumId: true,
      durationSeconds: true,
      rarity: true,
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
    },
  });

  const songs: EngineSong[] = rows.map((s) => {
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
    };
  });

  const venue = await loadVenue(venueId);

  return {
    bandId: band.id,
    bandName: band.name,
    songs,
    targetSpectrum,
    venue,
    showLengthBudgetSeconds: TUNING.targetShowMinutes * 60,
  };
}

/**
 * Headliner — Campaign Eligibility Service (Phase Z.17.9, extended Z.17.10)
 *
 * `BandRpgCollectedSong` (Band RPG's own Collection table) is the ONLY
 * source of truth for "has this player unlocked this song." No second
 * unlock inventory is created here or anywhere in Headliner — newly
 * recovered songs become Campaign-eligible automatically because this
 * service always reads live, never a cached/synced copy.
 */

import { prisma } from '../lib/prisma.js';
import { deriveLiveFrequency, type LiveFrequencyTier } from '@band-spectrum-mapper/shared';
import { TUNING } from './concertEngine.js';

/** Songs this user has recovered for this band in Band RPG, in the exact set Campaign mode may draw from. */
export async function getRecoveredSongIds(userId: string, bandId: string): Promise<Set<string>> {
  const rows = await prisma.bandRpgCollectedSong.findMany({
    where: { userId, bandId },
    select: { songId: true },
  });
  return new Set(rows.map((r) => r.songId));
}

export interface RecoveredCatalogEntry {
  songId: string;
  title: string;
  durationSeconds: number;
  albumId: string | null;
  liveTier: LiveFrequencyTier;
}

/**
 * Full detail on every recovered song for this user+band — durations, albums,
 * and Live Frequency tiers — used to validate stage requirements and stage
 * objective feasibility before a Campaign run is allowed to start.
 */
export async function getRecoveredCatalogDetail(userId: string, bandId: string): Promise<RecoveredCatalogEntry[]> {
  const collected = await prisma.bandRpgCollectedSong.findMany({
    where: { userId, bandId },
    select: { songId: true },
  });
  if (collected.length === 0) return [];

  const songs = await prisma.song.findMany({
    where: { id: { in: collected.map((c) => c.songId) } },
    select: {
      id: true, title: true, durationSeconds: true, albumId: true, rarity: true,
      bandRpgProfile: { select: { liveStatus: true } },
    },
  });

  return songs.map((s) => {
    const { tier } = deriveLiveFrequency(s.bandRpgProfile?.liveStatus ?? null, s.rarity);
    return {
      songId: s.id,
      title: s.title,
      durationSeconds: s.durationSeconds ?? TUNING.defaultSongSeconds,
      albumId: s.albumId,
      liveTier: tier,
    };
  });
}

export interface CampaignEligibilitySummary {
  bandId: string;
  recoveredCount: number;
  totalDurationSeconds: number;
  uniqueAlbumCount: number;
  eligible: boolean; // has at least one recovered song
}

/** Used by the Campaign entry card to show real, non-fake numbers instead of a placeholder. */
export async function getCampaignEligibilitySummary(userId: string, bandId: string): Promise<CampaignEligibilitySummary> {
  const catalog = await getRecoveredCatalogDetail(userId, bandId);
  const uniqueAlbumCount = new Set(catalog.map((c) => c.albumId).filter(Boolean)).size;
  const totalDurationSeconds = catalog.reduce((sum, c) => sum + c.durationSeconds, 0);
  return {
    bandId,
    recoveredCount: catalog.length,
    totalDurationSeconds,
    uniqueAlbumCount,
    eligible: catalog.length > 0,
  };
}

export interface RecoveredBandSummary {
  bandId: string;
  bandName: string;
  recoveredCount: number;
}

/** Every band this user has recovered at least one song for — the Campaign band-select list. */
export async function getBandsWithRecoveredSongs(userId: string): Promise<RecoveredBandSummary[]> {
  const rows = await prisma.bandRpgCollectedSong.groupBy({
    by: ['bandId', 'bandName'],
    where: { userId },
    _count: { songId: true },
  });
  return rows
    .map((r) => ({ bandId: r.bandId, bandName: r.bandName, recoveredCount: r._count.songId }))
    .sort((a, b) => a.bandName.localeCompare(b.bandName));
}

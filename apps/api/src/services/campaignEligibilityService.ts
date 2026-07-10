/**
 * Headliner — Campaign Eligibility Service (Phase Z.17.9, architecture prep)
 *
 * Campaign mode itself is architecture-only in Phase 1 (see CONCERT_ARCHITECT.md
 * and HEADLINER_DATA_FLOW.md §17) — this service is the one small piece that IS
 * built now, because it's the eligibility rule everything else in Campaign
 * depends on and it's "nearly free": recovered-song status already lives in
 * `BandRpgCollectedSong` (Band RPG's own Collection table). This is the sole
 * source of truth for "has this player unlocked this song" — no second unlock
 * inventory is created here or anywhere in Headliner.
 */

import { prisma } from '../lib/prisma.js';

/** Songs this user has recovered for this band in Band RPG, in the exact set Campaign mode may draw from. */
export async function getRecoveredSongIds(userId: string, bandId: string): Promise<Set<string>> {
  const rows = await prisma.bandRpgCollectedSong.findMany({
    where: { userId, bandId },
    select: { songId: true },
  });
  return new Set(rows.map((r) => r.songId));
}

export interface CampaignEligibilitySummary {
  bandId: string;
  recoveredCount: number;
  eligible: boolean; // has at least one recovered song
}

/** Used by the Campaign "coming soon" card to show a real, non-fake count instead of a placeholder. */
export async function getCampaignEligibilitySummary(userId: string, bandId: string): Promise<CampaignEligibilitySummary> {
  const recovered = await getRecoveredSongIds(userId, bandId);
  return { bandId, recoveredCount: recovered.size, eligible: recovered.size > 0 };
}

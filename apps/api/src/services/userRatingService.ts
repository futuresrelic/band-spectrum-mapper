import { prisma } from '../lib/prisma.js';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';
import type { UpsertUserRatingInput, AxisScoreMap, CommunityScore } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

type RatingRow = {
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
};

function computeCommunity(rows: RatingRow[]): CommunityScore | null {
  if (!rows.length) return null;
  const n = rows.length;
  const scores = {} as AxisScoreMap;
  for (const axis of SCORE_AXES) {
    const sum = rows.reduce((s, r) => s + (r[axis] as number), 0);
    scores[axis] = Math.round((sum / n) * 10) / 10;
  }
  return { count: n, scores };
}

export const userRatingService = {
  async getMyRating(userId: string, songId: string) {
    return prisma.userSongRating.findUnique({
      where: { userId_songId: { userId, songId } },
    });
  },

  async upsert(userId: string, songId: string, data: UpsertUserRatingInput) {
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) throw new HttpError(404, 'Song not found');

    return prisma.userSongRating.upsert({
      where: { userId_songId: { userId, songId } },
      create: { userId, songId, ...data },
      update: data,
    });
  },

  async getCommunityRating(songId: string): Promise<CommunityScore | null> {
    const rows = await prisma.userSongRating.findMany({
      where: { songId, user: { isCommunityExcluded: false, isActive: true } },
    });
    return computeCommunity(rows);
  },

  // Batch: returns a map of songId → CommunityScore
  async getCommunityRatings(songIds: string[]): Promise<Record<string, CommunityScore>> {
    if (!songIds.length) return {};
    const rows = await prisma.userSongRating.findMany({
      where: { songId: { in: songIds }, user: { isCommunityExcluded: false, isActive: true } },
    });
    const grouped: Record<string, RatingRow[]> = {};
    for (const r of rows) {
      if (!grouped[r.songId]) grouped[r.songId] = [];
      grouped[r.songId]!.push(r);
    }
    const result: Record<string, CommunityScore> = {};
    for (const [songId, songRows] of Object.entries(grouped)) {
      const score = computeCommunity(songRows);
      if (score) result[songId] = score;
    }
    return result;
  },

  // Batch: returns a map of songId → UserSongRating
  async getMyRatings(userId: string, songIds: string[]) {
    if (!songIds.length) return {} as Record<string, Awaited<ReturnType<typeof prisma.userSongRating.findUnique>>>;
    const rows = await prisma.userSongRating.findMany({
      where: { userId, songId: { in: songIds } },
    });
    const result: Record<string, (typeof rows)[number]> = {};
    for (const r of rows) result[r.songId] = r;
    return result;
  },
};

import { prisma } from '../lib/prisma.js';
import { MUSIC_SCORE_AXES } from '@band-spectrum-mapper/shared';
import type { UpsertUserMusicRatingInput, MusicScoreMap, CommunityMusicScore } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

type MusicRatingRow = {
  rhythmicComplexity: number;
  harmonicDepth: number;
  structuralComplexity: number;
  sonicDensity: number;
  tempoEnergy: number;
  tonalDarkness: number;
};

function computeCommunity(rows: MusicRatingRow[]): CommunityMusicScore | null {
  if (!rows.length) return null;
  const n = rows.length;
  const scores = {} as MusicScoreMap;
  for (const axis of MUSIC_SCORE_AXES) {
    const sum = rows.reduce((s, r) => s + (r[axis] as number), 0);
    scores[axis] = Math.round((sum / n) * 10) / 10;
  }
  return { count: n, scores };
}

export const userMusicRatingService = {
  async getMyRating(userId: string, songId: string) {
    return prisma.userMusicRating.findUnique({
      where: { userId_songId: { userId, songId } },
    });
  },

  async upsert(userId: string, songId: string, data: UpsertUserMusicRatingInput) {
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) throw new HttpError(404, 'Song not found');

    return prisma.userMusicRating.upsert({
      where: { userId_songId: { userId, songId } },
      create: { userId, songId, ...data },
      update: data,
    });
  },

  async getCommunityRating(songId: string): Promise<CommunityMusicScore | null> {
    const rows = await prisma.userMusicRating.findMany({
      where: { songId, user: { isCommunityExcluded: false, isActive: true } },
    });
    return computeCommunity(rows);
  },
};

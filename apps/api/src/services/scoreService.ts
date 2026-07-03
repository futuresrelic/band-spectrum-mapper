import { prisma } from '../lib/prisma.js';
import type { UpsertScoreInput } from '@band-spectrum-mapper/shared';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

type AxisAverage = { axis: string; average: number; count: number };

export const scoreService = {
  async getBySong(songId: string) {
    return prisma.songAxisScore.findUnique({ where: { songId } });
  },

  async upsert(songId: string, data: UpsertScoreInput) {
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) throw new HttpError(404, 'Song not found');

    return prisma.songAxisScore.upsert({
      where: { songId },
      create: {
        songId,
        bandId: song.bandId,
        ...data,
        notes: data.notes ?? null,
        source: data.source ?? 'manual',
      },
      update: {
        ...data,
        notes: data.notes ?? null,
        source: data.source ?? 'manual',
      },
    });
  },

  async averagesByBand(bandId: string): Promise<AxisAverage[]> {
    const scores = await prisma.songAxisScore.findMany({ where: { bandId } });
    if (scores.length === 0) return [];

    return SCORE_AXES.map((axis) => ({
      axis,
      average:
        scores.reduce((sum, s) => sum + (s[axis] as number), 0) / scores.length,
      count: scores.length,
    }));
  },

  async averagesByAlbum(albumId: string): Promise<AxisAverage[]> {
    const songs = await prisma.song.findMany({
      where: { albumId },
      include: { score: true },
    });
    const scores = songs.map((s) => s.score).filter(Boolean) as NonNullable<
      (typeof songs)[number]['score']
    >[];
    if (scores.length === 0) return [];

    return SCORE_AXES.map((axis) => ({
      axis,
      average: scores.reduce((sum, s) => sum + (s[axis] as number), 0) / scores.length,
      count: scores.length,
    }));
  },

  async averagesBySongs(songIds: string[]): Promise<AxisAverage[]> {
    const scores = await prisma.songAxisScore.findMany({
      where: { songId: { in: songIds } },
    });
    if (scores.length === 0) return [];

    return SCORE_AXES.map((axis) => ({
      axis,
      average: scores.reduce((sum, s) => sum + (s[axis] as number), 0) / scores.length,
      count: scores.length,
    }));
  },
};

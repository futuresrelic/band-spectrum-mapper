import { prisma } from '../lib/prisma.js';
import type { CreateLyricInput, UpdateLyricInput } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

export const lyricService = {
  async listBySong(songId: string) {
    return prisma.lyric.findMany({
      where: { songId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  },

  async getById(id: string) {
    const lyric = await prisma.lyric.findUnique({ where: { id } });
    if (!lyric) throw new HttpError(404, 'Lyric not found');
    return lyric;
  },

  async getRevisions(lyricId: string) {
    await lyricService.getById(lyricId);
    return prisma.lyricRevision.findMany({
      where: { lyricId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(songId: string, data: CreateLyricInput) {
    // Ensure song exists
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) throw new HttpError(404, 'Song not found');

    // If this lyric will be primary, clear other primaries first
    if (data.isPrimary) {
      await prisma.lyric.updateMany({
        where: { songId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return prisma.lyric.create({
      data: {
        songId,
        sourceType: data.sourceType,
        sourceLabel: data.sourceLabel ?? null,
        text: data.text,
        isPrimary: data.isPrimary,
      },
    });
  },

  async update(id: string, data: UpdateLyricInput) {
    const lyric = await lyricService.getById(id);

    // If text is changing, record a revision
    if (data.text !== undefined && data.text !== lyric.text) {
      await prisma.lyricRevision.create({
        data: {
          lyricId: id,
          previousText: lyric.text,
          newText: data.text,
          changeNote: data.changeNote ?? null,
        },
      });
    }

    // If setting primary, clear other primaries for this song
    if (data.isPrimary === true) {
      await prisma.lyric.updateMany({
        where: { songId: lyric.songId, isPrimary: true, NOT: { id } },
        data: { isPrimary: false },
      });
    }

    return prisma.lyric.update({
      where: { id },
      data: {
        ...(data.text !== undefined && { text: data.text }),
        ...(data.sourceType !== undefined && { sourceType: data.sourceType }),
        ...(data.sourceLabel !== undefined && { sourceLabel: data.sourceLabel }),
        ...(data.isPrimary !== undefined && { isPrimary: data.isPrimary }),
      },
    });
  },

  async delete(id: string) {
    await lyricService.getById(id);
    return prisma.lyric.delete({ where: { id } });
  },

  async restoreRevision(lyricId: string, revisionId: string) {
    const revision = await prisma.lyricRevision.findUnique({ where: { id: revisionId } });
    if (!revision || revision.lyricId !== lyricId) {
      throw new HttpError(404, 'Revision not found');
    }

    return lyricService.update(lyricId, {
      text: revision.previousText,
      changeNote: `Restored from revision ${revisionId}`,
    });
  },
};

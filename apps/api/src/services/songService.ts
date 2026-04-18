import { prisma } from '../lib/prisma.js';
import { toSlug } from '@band-spectrum-mapper/shared';
import type { CreateSongInput, UpdateSongInput } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

export const songService = {
  async listByBand(bandId: string, search?: string) {
    return prisma.song.findMany({
      where: {
        bandId,
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: {
        album: { select: { id: true, title: true, slug: true } },
        score: true,
      },
      orderBy: [{ album: { year: 'asc' } }, { trackNumber: 'asc' }, { title: 'asc' }],
    });
  },

  async listByAlbum(albumId: string) {
    return prisma.song.findMany({
      where: { albumId },
      include: {
        score: true,
        lyrics: { where: { isPrimary: true }, take: 1 },
      },
      orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
    });
  },

  async getById(id: string) {
    const song = await prisma.song.findUnique({
      where: { id },
      include: {
        band: true,
        album: true,
        score: true,
        lyrics: { orderBy: { createdAt: 'desc' } },
        songTags: { include: { tag: true } },
      },
    });
    if (!song) throw new HttpError(404, 'Song not found');
    return song;
  },

  async create(bandId: string, data: CreateSongInput) {
    const slug = data.slug ?? toSlug(data.title);
    const existing = await prisma.song.findUnique({
      where: { bandId_slug: { bandId, slug } },
    });
    if (existing) throw new HttpError(409, `Song slug "${slug}" is already in use for this band`);

    return prisma.song.create({
      data: {
        bandId,
        albumId: data.albumId ?? null,
        title: data.title,
        slug,
        trackNumber: data.trackNumber ?? null,
        durationSeconds: data.durationSeconds ?? null,
        notes: data.notes ?? null,
      },
    });
  },

  async update(id: string, data: UpdateSongInput) {
    const song = await songService.getById(id);

    if (data.slug) {
      const conflict = await prisma.song.findFirst({
        where: { bandId: song.bandId, slug: data.slug, NOT: { id } },
      });
      if (conflict) throw new HttpError(409, `Song slug "${data.slug}" is already in use`);
    }

    return prisma.song.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.albumId !== undefined && { albumId: data.albumId }),
        ...(data.trackNumber !== undefined && { trackNumber: data.trackNumber }),
        ...(data.durationSeconds !== undefined && { durationSeconds: data.durationSeconds }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
  },

  async delete(id: string) {
    await songService.getById(id);
    return prisma.song.delete({ where: { id } });
  },

  async search(query: string) {
    return prisma.song.findMany({
      where: { title: { contains: query, mode: 'insensitive' } },
      include: {
        band: { select: { id: true, name: true, slug: true } },
        album: { select: { id: true, title: true, slug: true } },
      },
      take: 50,
      orderBy: { title: 'asc' },
    });
  },
};

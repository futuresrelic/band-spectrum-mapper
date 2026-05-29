import { prisma } from '../lib/prisma.js';
import { toSlug } from '@band-spectrum-mapper/shared';
import type { CreateAlbumInput, UpdateAlbumInput } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

export const albumService = {
  async listByBand(bandId: string) {
    return prisma.album.findMany({
      where: { bandId },
      include: {
        _count: { select: { songs: true } },
      },
      orderBy: [{ year: 'asc' }, { title: 'asc' }],
    });
  },

  async getById(id: string) {
    const album = await prisma.album.findUnique({
      where: { id },
      include: {
        songs: {
          orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
          include: { score: true },
        },
        band: true,
      },
    });
    if (!album) throw new HttpError(404, 'Album not found');
    return album;
  },

  async create(bandId: string, data: CreateAlbumInput) {
    const slug = data.slug ?? toSlug(data.title);
    const existing = await prisma.album.findUnique({
      where: { bandId_slug: { bandId, slug } },
    });
    if (existing) throw new HttpError(409, `Album slug "${slug}" is already in use for this band`);

    return prisma.album.create({
      data: {
        bandId,
        title: data.title,
        slug,
        year: data.year ?? null,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
        artworkUrl: data.artworkUrl ?? null,
        notes: data.notes ?? null,
      },
    });
  },

  async update(id: string, data: UpdateAlbumInput) {
    const album = await albumService.getById(id);

    if (data.slug) {
      const conflict = await prisma.album.findFirst({
        where: { bandId: album.bandId, slug: data.slug, NOT: { id } },
      });
      if (conflict) throw new HttpError(409, `Album slug "${data.slug}" is already in use`);
    }

    return prisma.album.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.year !== undefined && { year: data.year }),
        ...(data.releaseDate !== undefined && {
          releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
        }),
        ...(data.artworkUrl !== undefined && { artworkUrl: data.artworkUrl }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.albumType !== undefined && { albumType: data.albumType }),
      },
    });
  },

  async delete(id: string) {
    await albumService.getById(id);
    return prisma.album.delete({ where: { id } });
  },
};

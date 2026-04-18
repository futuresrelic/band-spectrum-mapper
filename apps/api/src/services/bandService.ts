import { prisma } from '../lib/prisma.js';
import { toSlug } from '@band-spectrum-mapper/shared';
import type { CreateBandInput, UpdateBandInput } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

export const bandService = {
  async list(search?: string) {
    return prisma.band.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
      include: {
        _count: { select: { albums: true, songs: true } },
      },
      orderBy: { name: 'asc' },
    });
  },

  async getById(id: string) {
    const band = await prisma.band.findUnique({
      where: { id },
      include: {
        albums: { orderBy: { year: 'asc' } },
        _count: { select: { albums: true, songs: true } },
      },
    });
    if (!band) throw new HttpError(404, 'Band not found');
    return band;
  },

  async getBySlug(slug: string) {
    const band = await prisma.band.findUnique({
      where: { slug },
      include: {
        albums: { orderBy: { year: 'asc' } },
        _count: { select: { albums: true, songs: true } },
      },
    });
    if (!band) throw new HttpError(404, 'Band not found');
    return band;
  },

  async create(data: CreateBandInput) {
    const slug = data.slug ?? toSlug(data.name);
    const existing = await prisma.band.findUnique({ where: { slug } });
    if (existing) throw new HttpError(409, `Band slug "${slug}" is already in use`);

    return prisma.band.create({
      data: {
        name: data.name,
        slug,
        description: data.description ?? null,
      },
    });
  },

  async update(id: string, data: UpdateBandInput) {
    await bandService.getById(id);

    if (data.slug) {
      const conflict = await prisma.band.findFirst({
        where: { slug: data.slug, NOT: { id } },
      });
      if (conflict) throw new HttpError(409, `Band slug "${data.slug}" is already in use`);
    }

    return prisma.band.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  },

  async delete(id: string) {
    await bandService.getById(id);
    return prisma.band.delete({ where: { id } });
  },
};

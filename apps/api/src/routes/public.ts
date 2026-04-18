import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

// Read-only public endpoints — no write access, no auth required.
// Safe to share. Returns only what viewers need to see.
export const publicRouter = Router();

publicRouter.get('/bands', async (_req, res, next) => {
  try {
    const bands = await prisma.band.findMany({
      include: { _count: { select: { albums: true, songs: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(bands);
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/bands/:slug', async (req, res, next) => {
  try {
    const band = await prisma.band.findUnique({
      where: { slug: req.params['slug']! },
      include: {
        albums: { orderBy: [{ year: 'asc' }, { title: 'asc' }] },
        _count: { select: { albums: true, songs: true } },
      },
    });
    if (!band) { res.status(404).json({ error: 'Band not found' }); return; }
    res.json(band);
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/bands/:slug/albums', async (req, res, next) => {
  try {
    const band = await prisma.band.findUnique({ where: { slug: req.params['slug']! } });
    if (!band) { res.status(404).json({ error: 'Band not found' }); return; }

    const albums = await prisma.album.findMany({
      where: { bandId: band.id },
      include: {
        songs: {
          orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
          include: {
            score: true,
            lyrics: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
      orderBy: [{ year: 'asc' }, { title: 'asc' }],
    });
    res.json(albums);
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/songs/:id', async (req, res, next) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params['id']! },
      include: {
        band: true,
        album: true,
        score: true,
        lyrics: { where: { isPrimary: true }, take: 1 },
      },
    });
    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }
    res.json(song);
  } catch (e) {
    next(e);
  }
});

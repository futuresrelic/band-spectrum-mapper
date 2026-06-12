import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const playlistRouter = Router();

// GET /api/playlist/bands — all bands with song count (public)
playlistRouter.get('/bands', async (_req, res, next) => {
  try {
    const bands = await prisma.band.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        _count: { select: { songs: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(bands);
    return;
  } catch (e) {
    next(e);
  }
});

// GET /api/playlist/round?bandIds=a,b,c&count=3&exclude=x,y,z
// Returns `count` random songs from the given bands, excluding already-picked IDs.
// Tries to pick from different bands per round where possible.
playlistRouter.get('/round', async (req, res, next) => {
  try {
    const bandIdsParam = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const excludeParam = typeof req.query['exclude'] === 'string' ? req.query['exclude'] : '';
    const countParam = typeof req.query['count'] === 'string' ? parseInt(req.query['count'], 10) : 3;

    const bandIds = bandIdsParam ? bandIdsParam.split(',').filter(Boolean) : [];
    const excludeIds = excludeParam ? excludeParam.split(',').filter(Boolean) : [];
    const count = Math.max(2, Math.min(6, isNaN(countParam) ? 3 : countParam));

    if (bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' });
      return;
    }

    // Fetch all eligible songs with band/album info
    const eligible = await prisma.song.findMany({
      where: {
        bandId: { in: bandIds },
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
        isInstrumental: false,
      },
      select: {
        id: true,
        title: true,
        durationSeconds: true,
        bandId: true,
        band: { select: { id: true, name: true, slug: true, logoUrl: true } },
        album: { select: { id: true, title: true, year: true, artworkUrl: true } },
      },
    });

    if (eligible.length === 0) {
      res.json([]);
      return;
    }

    // Shuffle all eligible songs
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = eligible[i]!;
      eligible[i] = eligible[j]!;
      eligible[j] = tmp;
    }

    // Try to pick from distinct bands when possible
    const picked: typeof eligible = [];
    const usedBands = new Set<string>();

    // First pass: one song per band
    for (const song of eligible) {
      if (picked.length >= count) break;
      if (!usedBands.has(song.bandId)) {
        picked.push(song);
        usedBands.add(song.bandId);
      }
    }

    // Second pass: fill remaining slots from any band
    for (const song of eligible) {
      if (picked.length >= count) break;
      if (!picked.some((p) => p.id === song.id)) {
        picked.push(song);
      }
    }

    res.json(picked);
    return;
  } catch (e) {
    next(e);
  }
});

// POST /api/playlist — save a playlist (auth optional — saves with userId if logged in)
playlistRouter.post('/', async (req, res, next) => {
  try {
    const userId = (req as typeof req & { user?: { id: string } }).user?.id ?? null;

    const { name, songIds } = req.body as { name?: unknown; songIds?: unknown };

    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    if (!Array.isArray(songIds) || songIds.length === 0) {
      res.status(400).json({ error: 'songIds required' });
      return;
    }
    if (songIds.length > 500) {
      res.status(400).json({ error: 'Playlist may not exceed 500 songs' });
      return;
    }

    const ids = songIds as string[];

    const playlist = await prisma.playlist.create({
      data: {
        name: name.trim(),
        ...(userId ? { userId } : {}),
        songs: {
          create: ids.map((songId, i) => ({ songId, position: i })),
        },
      },
      include: {
        songs: {
          include: {
            song: {
              include: {
                band: { select: { id: true, name: true, slug: true } },
                album: { select: { id: true, title: true, year: true, artworkUrl: true } },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    res.json(playlist);
    return;
  } catch (e) {
    next(e);
  }
});

// GET /api/playlist/:id — get a saved playlist (public)
playlistRouter.get('/:id', async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findUnique({
      where: { id: req.params['id']! },
      include: {
        songs: {
          include: {
            song: {
              include: {
                band: { select: { id: true, name: true, slug: true } },
                album: { select: { id: true, title: true, year: true, artworkUrl: true } },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    res.json(playlist);
    return;
  } catch (e) {
    next(e);
  }
});

// GET /api/playlist — list playlists for logged-in user (auth required)
playlistRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as typeof req & { user: { id: string } }).user.id;

    const playlists = await prisma.playlist.findMany({
      where: { userId },
      include: {
        _count: { select: { songs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(playlists);
    return;
  } catch (e) {
    next(e);
  }
});

// DELETE /api/playlist/:id — delete (auth required, must be owner)
playlistRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req as typeof req & { user: { id: string } }).user.id;

    const playlist = await prisma.playlist.findUnique({ where: { id: req.params['id']! } });
    if (!playlist) { res.status(404).json({ error: 'Not found' }); return; }
    if (playlist.userId !== userId) { res.status(403).json({ error: 'Forbidden' }); return; }

    await prisma.playlist.delete({ where: { id: req.params['id']! } });
    res.json({ ok: true });
    return;
  } catch (e) {
    next(e);
  }
});

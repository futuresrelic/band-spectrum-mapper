/**
 * Pattern Lab routes — admin-only deep analysis tools.
 * All endpoints are configure-before-execute; nothing runs at page load.
 */

import { Router } from 'express';
import { requireAuth }  from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  findRecurringWords,
  findRecurringPhrases,
  getAlbumDna,
  getArtistDna,
  findUniversalConnectors,
} from '../services/patternLabService.js';

export const patternLabRouter = Router();

patternLabRouter.use(requireAuth);
patternLabRouter.use(requireAdmin);

// GET /api/pattern-lab/scopes — reuse band + album lists
patternLabRouter.get('/scopes', async (_req, res, next): Promise<void> => {
  try {
    const { prisma } = await import('../lib/prisma.js');
    const [bands, albums] = await Promise.all([
      prisma.band.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.album.findMany({
        select: { id: true, title: true, year: true, band: { select: { id: true, name: true } } },
        orderBy: [{ band: { name: 'asc' } }, { year: 'asc' }],
      }),
    ]);
    res.json({ bands, albums });
  } catch (err) { next(err); }
});

// GET /api/pattern-lab/recurring
patternLabRouter.get('/recurring', async (req, res, next): Promise<void> => {
  try {
    const bandIdsRaw  = (req.query['bandIds']  as string) ?? '';
    const albumIdsRaw = (req.query['albumIds'] as string) ?? '';
    const bandIds  = bandIdsRaw  ? bandIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)  : undefined;
    const albumIds = albumIdsRaw ? albumIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    const minSongs        = Math.max(1, parseInt((req.query['minSongs']        as string) ?? '2',  10) || 2);
    const requireAllAlbums = (req.query['requireAllAlbums'] as string) === 'true';
    const limit           = Math.min(300, parseInt((req.query['limit']          as string) ?? '150', 10) || 150);

    if (!bandIds?.length && !albumIds?.length) {
      res.status(400).json({ error: 'bandIds or albumIds required' });
      return;
    }

    const result = await findRecurringWords({
      ...(bandIds  ? { bandIds  } : {}),
      ...(albumIds ? { albumIds } : {}),
      minSongs,
      requireAllAlbums,
      limit,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/pattern-lab/phrases
patternLabRouter.get('/phrases', async (req, res, next): Promise<void> => {
  try {
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    if (!bandIds?.length) {
      res.status(400).json({ error: 'bandIds required' });
      return;
    }

    const phraseLength  = Math.min(6, Math.max(2, parseInt((req.query['phraseLength']  as string) ?? '2',   10) || 2));
    const minSongCount  = Math.max(1,             parseInt((req.query['minSongCount']  as string) ?? '2',   10) || 2);
    const limit         = Math.min(200,            parseInt((req.query['limit']         as string) ?? '100', 10) || 100);

    const result = await findRecurringPhrases({ bandIds, phraseLength, minSongCount, limit });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/pattern-lab/album-dna?albumId=xxx
patternLabRouter.get('/album-dna', async (req, res, next): Promise<void> => {
  try {
    const albumId = (req.query['albumId'] as string) ?? '';
    if (!albumId) { res.status(400).json({ error: 'albumId required' }); return; }
    const result = await getAlbumDna(albumId);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/pattern-lab/artist-dna?bandIds=a,b
patternLabRouter.get('/artist-dna', async (req, res, next): Promise<void> => {
  try {
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (bandIds.length === 0) { res.status(400).json({ error: 'bandIds required' }); return; }
    const result = await getArtistDna(bandIds);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/pattern-lab/connectors?bandIds=a,b,c
patternLabRouter.get('/connectors', async (req, res, next): Promise<void> => {
  try {
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (bandIds.length < 2) { res.status(400).json({ error: 'At least two bandIds required' }); return; }
    const result = await findUniversalConnectors(bandIds);
    res.json(result);
  } catch (err) { next(err); }
});

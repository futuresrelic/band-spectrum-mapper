/**
 * Word Cloud routes — returns aggregated word data for interactive
 * and exportable word cloud visualizations.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { buildWordCloud, findSimilarSongs, lookupWordInSongs, findWordClusters, type CloudScope } from '../services/wordCloudService.js';

export const wordCloudRouter = Router();

wordCloudRouter.use(requireAuth);
wordCloudRouter.use(requireAdmin);

const VALID_SCOPES: CloudScope[] = ['song', 'album', 'artist', 'universe'];

// GET /api/word-cloud?scope=song|album|artist|universe&id=...&limit=120&minFreq=2
wordCloudRouter.get('/', async (req, res, next): Promise<void> => {
  try {
    const scope = (req.query['scope'] as string) ?? 'universe';
    const id = (req.query['id'] as string) ?? '';
    const limit = Math.min(200, parseInt((req.query['limit'] as string) ?? '120', 10) || 120);
    const minFreq = parseInt((req.query['minFreq'] as string) ?? '2', 10) || 2;
    const maxFreqRaw = parseInt((req.query['maxFreq'] as string) ?? '0', 10);
    const maxFreqFilter = maxFreqRaw > 0 ? maxFreqRaw : undefined;
    const includeLyrics = (req.query['includeLyrics'] as string) !== 'false';
    const includeThemes = (req.query['includeThemes'] as string) !== 'false';
    const includeTags   = (req.query['includeTags']   as string) !== 'false';

    if (!VALID_SCOPES.includes(scope as CloudScope)) {
      res.status(400).json({ error: `scope must be one of: ${VALID_SCOPES.join(', ')}` });
      return;
    }
    if (scope !== 'universe' && !id) {
      res.status(400).json({ error: 'id is required for non-universe scopes' });
      return;
    }

    const data = await buildWordCloud(scope as CloudScope, id, {
      limit, minFreq, includeLyrics, includeThemes, includeTags,
      ...(maxFreqFilter !== undefined ? { maxFreqFilter } : {}),
    });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/word-cloud/scopes — list all bands + albums for scope selector
wordCloudRouter.get('/scopes', async (_req, res, next): Promise<void> => {
  try {
    const { prisma } = await import('../lib/prisma.js');
    const [bands, albums] = await Promise.all([
      prisma.band.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.album.findMany({
        select: { id: true, title: true, band: { select: { id: true, name: true } } },
        orderBy: [{ band: { name: 'asc' } }, { year: 'asc' }],
      }),
    ]);
    res.json({ bands, albums });
  } catch (err) { next(err); }
});

// GET /api/word-cloud/similar?songId=xxx&limit=30&bandIds=a,b&minShared=3
wordCloudRouter.get('/similar', async (req, res, next): Promise<void> => {
  try {
    const songId = (req.query['songId'] as string) ?? '';
    if (!songId) { res.status(400).json({ error: 'songId is required' }); return; }

    const limit     = Math.min(100, parseInt((req.query['limit']     as string) ?? '30', 10) || 30);
    const minShared = Math.max(1,   parseInt((req.query['minShared'] as string) ?? '3',  10) || 3);
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    const result = await findSimilarSongs(songId, { limit, minShared, ...(bandIds ? { bandIds } : {}) });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/word-cloud/songs?bandId=xxx — songs with lyrics for a specific band
wordCloudRouter.get('/songs', async (req, res, next): Promise<void> => {
  try {
    const bandId = (req.query['bandId'] as string) ?? '';
    if (!bandId) {
      res.status(400).json({ error: 'bandId is required' });
      return;
    }
    const { prisma } = await import('../lib/prisma.js');
    const songs = await prisma.song.findMany({
      where: {
        bandId,
        lyrics: { some: { isPrimary: true } },
      },
      select: {
        id: true, title: true,
        album: { select: { title: true } },
      },
      orderBy: { title: 'asc' },
    });
    res.json(songs);
  } catch (err) { next(err); }
});

// GET /api/word-cloud/lookup?word=sky&bandIds=id1,id2 — songs whose lyrics contain a word
wordCloudRouter.get('/lookup', async (req, res, next): Promise<void> => {
  try {
    const word = ((req.query['word'] as string) ?? '').trim();
    if (!word) { res.status(400).json({ error: 'word is required' }); return; }

    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    const result = await lookupWordInSongs(word, { ...(bandIds ? { bandIds } : {}) });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/word-cloud/clusters?bandIds=id1,id2&minSongs=3&maxGroupSize=4&topN=25
wordCloudRouter.get('/clusters', async (req, res, next): Promise<void> => {
  try {
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    const minSongs     = Math.max(2, parseInt((req.query['minSongs']     as string) ?? '3',  10) || 3);
    const maxGroupSize = Math.min(5, Math.max(2, parseInt((req.query['maxGroupSize'] as string) ?? '4', 10) || 4));
    const topN         = Math.min(50, parseInt((req.query['topN']        as string) ?? '25', 10) || 25);

    const result = await findWordClusters({
      ...(bandIds ? { bandIds } : {}),
      minSongs,
      maxGroupSize,
      topN,
    });
    res.json(result);
  } catch (err) { next(err); }
});

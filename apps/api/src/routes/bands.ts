import { Router } from 'express';
import { bandService } from '../services/bandService.js';
import { albumService } from '../services/albumService.js';
import { songService } from '../services/songService.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { createBandSchema, updateBandSchema, createAlbumSchema, createSongSchema } from '@band-spectrum-mapper/shared';
import { fetchWikiSummary } from '../lib/wikiSummary.js';

export const bandsRouter = Router();

// Bands
bandsRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
    res.json(await bandService.list(search));
  } catch (e) { next(e); }
});

bandsRouter.post('/', requireAuth, requireAdmin, validateBody(createBandSchema), async (req, res, next) => {
  try {
    res.status(201).json(await bandService.create(req.body));
  } catch (e) { next(e); }
});

bandsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await bandService.getById(req.params['id']!));
  } catch (e) { next(e); }
});

bandsRouter.patch('/:id', requireAuth, requireAdmin, validateBody(updateBandSchema), async (req, res, next) => {
  try {
    res.json(await bandService.update(req.params['id']!, req.body));
  } catch (e) { next(e); }
});

bandsRouter.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await bandService.delete(req.params['id']!);
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /api/bands/:id/wiki — fetch a Wikipedia intro summary for the artist
bandsRouter.get('/:id/wiki', async (req, res, next): Promise<void> => {
  try {
    const band = await bandService.getById(req.params['id']!);
    const result = await fetchWikiSummary(`${band.name} band`);
    res.json(result);
  } catch (e) { next(e); }
});

// Albums nested under band
bandsRouter.get('/:bandId/albums', async (req, res, next) => {
  try {
    res.json(await albumService.listByBand(req.params['bandId']!));
  } catch (e) { next(e); }
});

bandsRouter.post('/:bandId/albums', requireAuth, requireAdmin, validateBody(createAlbumSchema), async (req, res, next) => {
  try {
    res.status(201).json(await albumService.create(req.params['bandId']!, req.body));
  } catch (e) { next(e); }
});

// Songs nested under band
bandsRouter.get('/:bandId/songs', async (req, res, next) => {
  try {
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
    res.json(await songService.listByBand(req.params['bandId']!, search));
  } catch (e) { next(e); }
});

bandsRouter.post('/:bandId/songs', requireAuth, requireAdmin, validateBody(createSongSchema), async (req, res, next) => {
  try {
    res.status(201).json(await songService.create(req.params['bandId']!, req.body));
  } catch (e) { next(e); }
});

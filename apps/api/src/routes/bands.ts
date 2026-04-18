import { Router } from 'express';
import { bandService } from '../services/bandService.js';
import { albumService } from '../services/albumService.js';
import { songService } from '../services/songService.js';
import { validateBody } from '../middleware/validate.js';
import { createBandSchema, updateBandSchema, createAlbumSchema, createSongSchema } from '@band-spectrum-mapper/shared';

export const bandsRouter = Router();

// Bands
bandsRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
    res.json(await bandService.list(search));
  } catch (e) { next(e); }
});

bandsRouter.post('/', validateBody(createBandSchema), async (req, res, next) => {
  try {
    res.status(201).json(await bandService.create(req.body));
  } catch (e) { next(e); }
});

bandsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await bandService.getById(req.params['id']!));
  } catch (e) { next(e); }
});

bandsRouter.patch('/:id', validateBody(updateBandSchema), async (req, res, next) => {
  try {
    res.json(await bandService.update(req.params['id']!, req.body));
  } catch (e) { next(e); }
});

bandsRouter.delete('/:id', async (req, res, next) => {
  try {
    await bandService.delete(req.params['id']!);
    res.status(204).end();
  } catch (e) { next(e); }
});

// Albums nested under band
bandsRouter.get('/:bandId/albums', async (req, res, next) => {
  try {
    res.json(await albumService.listByBand(req.params['bandId']!));
  } catch (e) { next(e); }
});

bandsRouter.post('/:bandId/albums', validateBody(createAlbumSchema), async (req, res, next) => {
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

bandsRouter.post('/:bandId/songs', validateBody(createSongSchema), async (req, res, next) => {
  try {
    res.status(201).json(await songService.create(req.params['bandId']!, req.body));
  } catch (e) { next(e); }
});

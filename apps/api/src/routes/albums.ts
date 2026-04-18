import { Router } from 'express';
import { albumService } from '../services/albumService.js';
import { songService } from '../services/songService.js';
import { validateBody } from '../middleware/validate.js';
import { updateAlbumSchema } from '@band-spectrum-mapper/shared';

export const albumsRouter = Router();

albumsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await albumService.getById(req.params['id']!));
  } catch (e) { next(e); }
});

albumsRouter.patch('/:id', validateBody(updateAlbumSchema), async (req, res, next) => {
  try {
    res.json(await albumService.update(req.params['id']!, req.body));
  } catch (e) { next(e); }
});

albumsRouter.delete('/:id', async (req, res, next) => {
  try {
    await albumService.delete(req.params['id']!);
    res.status(204).end();
  } catch (e) { next(e); }
});

albumsRouter.get('/:albumId/songs', async (req, res, next) => {
  try {
    res.json(await songService.listByAlbum(req.params['albumId']!));
  } catch (e) { next(e); }
});

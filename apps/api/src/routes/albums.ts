import { Router } from 'express';
import { albumService } from '../services/albumService.js';
import { songService } from '../services/songService.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { updateAlbumSchema } from '@band-spectrum-mapper/shared';
import { fetchWikiSummary } from '../lib/wikiSummary.js';

export const albumsRouter = Router();

albumsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await albumService.getById(req.params['id']!));
  } catch (e) { next(e); }
});

albumsRouter.patch('/:id', requireAuth, requireAdmin, validateBody(updateAlbumSchema), async (req, res, next) => {
  try {
    res.json(await albumService.update(req.params['id']!, req.body));
  } catch (e) { next(e); }
});

albumsRouter.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
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

// GET /api/albums/:id/wiki — fetch a Wikipedia intro summary for the album
albumsRouter.get('/:id/wiki', async (req, res, next): Promise<void> => {
  try {
    const album = await albumService.getById(req.params['id']!);
    const bandName = (album as any).band?.name ?? '';
    const query = bandName ? `${album.title} album ${bandName}` : `${album.title} album`;
    const result = await fetchWikiSummary(query);
    res.json(result);
  } catch (e) { next(e); }
});

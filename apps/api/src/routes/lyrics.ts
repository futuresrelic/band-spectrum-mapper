import { Router } from 'express';
import { lyricService } from '../services/lyricService.js';
import { validateBody } from '../middleware/validate.js';
import { updateLyricSchema } from '@band-spectrum-mapper/shared';

export const lyricsRouter = Router();

lyricsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await lyricService.getById(req.params['id']!));
  } catch (e) { next(e); }
});

lyricsRouter.patch('/:id', validateBody(updateLyricSchema), async (req, res, next) => {
  try {
    res.json(await lyricService.update(req.params['id']!, req.body));
  } catch (e) { next(e); }
});

lyricsRouter.delete('/:id', async (req, res, next) => {
  try {
    await lyricService.delete(req.params['id']!);
    res.status(204).end();
  } catch (e) { next(e); }
});

lyricsRouter.get('/:id/revisions', async (req, res, next) => {
  try {
    res.json(await lyricService.getRevisions(req.params['id']!));
  } catch (e) { next(e); }
});

lyricsRouter.post('/:lyricId/revisions/:revisionId/restore', async (req, res, next) => {
  try {
    res.json(
      await lyricService.restoreRevision(req.params['lyricId']!, req.params['revisionId']!),
    );
  } catch (e) { next(e); }
});

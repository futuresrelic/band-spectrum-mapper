import { Router } from 'express';
import { settingsService } from '../services/settingsService.js';
import { validateBody } from '../middleware/validate.js';
import { addStopwordSchema } from '@band-spectrum-mapper/shared';
import { z } from 'zod';

export const settingsRouter = Router();

settingsRouter.get('/stopwords', async (req, res, next) => {
  try {
    res.json(await settingsService.getStopwords());
  } catch (e) { next(e); }
});

settingsRouter.post('/stopwords', validateBody(addStopwordSchema), async (req, res, next) => {
  try {
    res.status(201).json(await settingsService.addStopword(req.body.word));
  } catch (e) { next(e); }
});

settingsRouter.delete('/stopwords/:word', async (req, res, next) => {
  try {
    const result = await settingsService.removeStopword(req.params['word']!);
    if (!result) { res.status(404).json({ error: 'Stopword not found' }); return; }
    res.status(204).end();
  } catch (e) { next(e); }
});

settingsRouter.put(
  '/stopwords',
  validateBody(z.object({ words: z.array(z.string().min(1)) })),
  async (req, res, next) => {
    try {
      res.json(await settingsService.bulkReplaceStopwords(req.body.words));
    } catch (e) { next(e); }
  },
);

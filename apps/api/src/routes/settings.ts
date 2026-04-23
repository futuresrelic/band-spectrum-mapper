import { Router } from 'express';
import { settingsService } from '../services/settingsService.js';
import { validateBody } from '../middleware/validate.js';
import { addStopwordSchema } from '@band-spectrum-mapper/shared';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

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

settingsRouter.get('/icons', async (_req, res, next) => {
  try {
    const icons = await prisma.appIcon.findMany({ orderBy: { size: 'asc' } });
    res.json(icons);
  } catch (e) { next(e); }
});

settingsRouter.post(
  '/icons',
  requireAuth,
  validateBody(z.object({
    icons: z.array(z.object({ size: z.number().int().positive(), dataUrl: z.string().min(10) })),
  })),
  async (req, res, next) => {
    try {
      if (!req.user?.isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }
      const { icons } = req.body as { icons: { size: number; dataUrl: string }[] };
      await Promise.all(
        icons.map(({ size, dataUrl }) =>
          prisma.appIcon.upsert({
            where: { size },
            create: { size, dataUrl },
            update: { dataUrl },
          })
        )
      );
      res.json({ saved: icons.length });
    } catch (e) { next(e); }
  }
);

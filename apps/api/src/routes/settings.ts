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

// GET /api/settings/cinema-default — returns admin + user startup configs
settingsRouter.get('/cinema-default', async (_req, res, next): Promise<void> => {
  try {
    const [admin, user] = await Promise.all([
      prisma.siteConfig.findUnique({ where: { key: 'cinema_default_admin' } }),
      prisma.siteConfig.findUnique({ where: { key: 'cinema_default_user'  } }),
    ]);
    res.json({ adminDefault: admin?.value ?? null, userDefault: user?.value ?? null }); return;
  } catch (e) { next(e); }
});

// PUT /api/settings/cinema-default — admin only; body: { role, snapshot }
settingsRouter.put(
  '/cinema-default',
  requireAuth,
  validateBody(z.object({ role: z.enum(['admin', 'user']), snapshot: z.record(z.unknown()) })),
  async (req, res, next): Promise<void> => {
    try {
      if (!req.user?.isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }
      const { role, snapshot } = req.body as { role: 'admin' | 'user'; snapshot: Record<string, unknown> };
      const key = role === 'admin' ? 'cinema_default_admin' : 'cinema_default_user';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = snapshot as any;
      await prisma.siteConfig.upsert({
        where:  { key },
        create: { key, value },
        update: { value },
      });
      res.json({ ok: true }); return;
    } catch (e) { next(e); }
  },
);

// DELETE /api/settings/cinema-default?role=admin|user — admin only
settingsRouter.delete('/cinema-default', requireAuth, async (req, res, next): Promise<void> => {
  try {
    if (!req.user?.isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }
    const role = (req.query['role'] as string | undefined);
    if (role !== 'admin' && role !== 'user') { res.status(400).json({ error: 'role must be admin or user' }); return; }
    const key = role === 'admin' ? 'cinema_default_admin' : 'cinema_default_user';
    await prisma.siteConfig.deleteMany({ where: { key } });
    res.json({ ok: true }); return;
  } catch (e) { next(e); }
});

// GET /api/settings/game-visibility — readable by anyone (GamesPage uses this)
settingsRouter.get('/game-visibility', async (_req, res, next): Promise<void> => {
  try {
    const config = await prisma.siteConfig.findUnique({ where: { key: 'game_visibility' } });
    const value = config?.value as { hiddenIds?: string[] } | null;
    res.json({ hiddenIds: value?.hiddenIds ?? [] }); return;
  } catch (e) { next(e); }
});

// PUT /api/settings/game-visibility — admin only
settingsRouter.put(
  '/game-visibility',
  requireAuth,
  validateBody(z.object({ hiddenIds: z.array(z.string()) })),
  async (req, res, next): Promise<void> => {
    try {
      if (!req.user?.isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }
      const { hiddenIds } = req.body as { hiddenIds: string[] };
      await prisma.siteConfig.upsert({
        where:  { key: 'game_visibility' },
        create: { key: 'game_visibility', value: { hiddenIds } },
        update: { value: { hiddenIds } },
      });
      res.json({ hiddenIds }); return;
    } catch (e) { next(e); }
  },
);

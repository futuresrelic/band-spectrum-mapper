import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const wordHuntRouter = Router();

// POST /api/word-hunt/scores — save a won game (auth required)
wordHuntRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { word, attempts, wrongCount, timeSec, bandScope } = req.body as {
      word?: unknown; attempts?: unknown; wrongCount?: unknown; timeSec?: unknown; bandScope?: unknown;
    };

    if (typeof word !== 'string' || word.length < 2 || word.length > 60) {
      res.status(400).json({ error: 'Invalid word' }); return;
    }
    if (typeof attempts !== 'number' || attempts < 1 || attempts > 500) {
      res.status(400).json({ error: 'Invalid attempts' }); return;
    }
    if (typeof wrongCount !== 'number' || wrongCount < 0) {
      res.status(400).json({ error: 'Invalid wrongCount' }); return;
    }
    if (typeof timeSec !== 'number' || timeSec < 0 || timeSec > 86400) {
      res.status(400).json({ error: 'Invalid timeSec' }); return;
    }

    const score = Math.max(0, Math.round(1000 - wrongCount * 100 - timeSec * 2));

    const saved = await prisma.wordHuntScore.create({
      data: {
        userId,
        word: word.toLowerCase().trim(),
        attempts: Math.floor(attempts),
        wrongCount: Math.floor(wrongCount),
        timeSec: Math.floor(timeSec),
        score,
        ...(typeof bandScope === 'string' && bandScope ? { bandScope } : {}),
      },
    });

    const rank = await prisma.wordHuntScore.count({ where: { score: { gt: saved.score } } });
    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

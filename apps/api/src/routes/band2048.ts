import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const band2048Router = Router();

// POST /api/band2048/scores — save a finished game (auth required)
band2048Router.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { score, topLevel, winLevel, won, bandScope } = req.body as {
      score?: unknown; topLevel?: unknown; winLevel?: unknown; won?: unknown; bandScope?: unknown;
    };

    if (typeof score !== 'number' || score < 0) {
      res.status(400).json({ error: 'Invalid score' }); return;
    }
    if (typeof topLevel !== 'number' || topLevel < 1) {
      res.status(400).json({ error: 'Invalid topLevel' }); return;
    }
    if (typeof winLevel !== 'number' || winLevel < 1) {
      res.status(400).json({ error: 'Invalid winLevel' }); return;
    }

    const saved = await prisma.band2048Score.create({
      data: {
        userId,
        score: Math.floor(score),
        topLevel: Math.floor(topLevel),
        winLevel: Math.floor(winLevel),
        won: won === true,
        ...(typeof bandScope === 'string' && bandScope ? { bandScope } : {}),
      },
    });

    const rank = await prisma.band2048Score.count({ where: { score: { gt: saved.score } } });
    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// GET /api/band2048/leaderboard?limit=20
band2048Router.get('/leaderboard', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt((req.query['limit'] as string) ?? '20', 10) || 20));
    const top = await prisma.band2048Score.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      include: { user: { select: { name: true, username: true, avatarUrl: true } } },
    });
    res.json(top.map((s, i) => ({
      id: s.id,
      rank: i + 1,
      playerName: s.user.username ?? s.user.name ?? 'Player',
      avatarUrl: s.user.avatarUrl,
      score: s.score,
      topLevel: s.topLevel,
      winLevel: s.winLevel,
      won: s.won,
      createdAt: s.createdAt,
    })));
  } catch (e) { next(e); }
});

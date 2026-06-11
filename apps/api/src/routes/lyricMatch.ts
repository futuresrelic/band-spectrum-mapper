import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const lyricMatchRouter = Router();

// POST /api/lyric-match/scores — auth required
lyricMatchRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { score, totalRounds, bandIds } = req.body as { score?: unknown; totalRounds?: unknown; bandIds?: unknown };
    if (typeof score !== 'number' || score < 0) { res.status(400).json({ error: 'Invalid score' }); return; }
    const safeBandScope = Array.isArray(bandIds)
      ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
      : null;
    const saved = await prisma.lyricMatchScore.create({
      data: {
        userId,
        score: Math.floor(score),
        totalRounds: typeof totalRounds === 'number' ? Math.max(1, Math.floor(totalRounds)) : 8,
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });
    const rank = await prisma.lyricMatchScore.count({ where: { score: { gt: saved.score } } });
    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// GET /api/lyric-match/scores — public leaderboard
lyricMatchRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, parseInt(typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10) || 15);
    const scores = await prisma.lyricMatchScore.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      select: { id: true, score: true, totalRounds: true, createdAt: true, user: { select: { name: true, avatarUrl: true } } },
    });
    res.json(scores.map((s, i) => ({ rank: i + 1, playerName: s.user.name ?? 'Anonymous', avatarUrl: s.user.avatarUrl, score: s.score, totalRounds: s.totalRounds, createdAt: s.createdAt })));
  } catch (e) { next(e); }
});

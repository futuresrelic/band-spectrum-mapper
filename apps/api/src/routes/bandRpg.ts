import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const bandRpgRouter = Router();

// POST /scores — save score (auth optional; works for anonymous too)
bandRpgRouter.post('/scores', async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId ?? null;
    const body = req.body as Record<string, unknown>;
    const score       = typeof body['score']       === 'number' ? Math.max(0, Math.floor(body['score']))       : 0;
    const questsCompleted = typeof body['questsCompleted'] === 'number' ? Math.floor(body['questsCompleted']) : 0;
    const itemsCollected  = typeof body['itemsCollected']  === 'number' ? Math.floor(body['itemsCollected'])  : 0;
    const levelsCleared   = typeof body['levelsCleared']   === 'number' ? Math.floor(body['levelsCleared'])   : 0;

    const saved = await prisma.bandRpgScore.create({
      data: {
        ...(userId ? { userId } : {}),
        score,
        questsCompleted,
        itemsCollected,
        levelsCleared,
        isAnonymous: !userId,
      },
    });

    const rank = (await prisma.bandRpgScore.count({ where: { score: { gt: saved.score } } })) + 1;
    res.status(201).json({ ok: true, score: saved.score, rank });
  } catch (e) { next(e); }
});

// GET /scores — public leaderboard
bandRpgRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const raw = req.query['limit'];
    const limit = Math.min(50, Math.max(1, parseInt(typeof raw === 'string' ? raw : '10', 10) || 10));

    const scores = await prisma.bandRpgScore.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      select: {
        score: true, questsCompleted: true, itemsCollected: true, createdAt: true,
        user: { select: { name: true, username: true, avatarUrl: true } },
      },
    });

    res.json(scores.map((s, i) => ({
      rank: i + 1,
      playerName: s.user?.username ?? s.user?.name ?? 'Anonymous',
      avatarUrl:  s.user?.avatarUrl ?? null,
      score: s.score,
      questsCompleted: s.questsCompleted,
      itemsCollected:  s.itemsCollected,
      createdAt: s.createdAt,
    })));
  } catch (e) { next(e); }
});

// POST /progress — save player progress (auth required)
bandRpgRouter.post('/progress', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const body = req.body as Record<string, unknown>;
    const questPhase = typeof body['questPhase'] === 'string' ? body['questPhase'] : 'pre_quest';
    const score      = typeof body['score']       === 'number' ? Math.max(0, Math.floor(body['score'])) : 0;

    await prisma.bandRpgPlayerProgress.upsert({
      where:  { userId },
      update: { score, completedQuests: questPhase === 'complete' ? ['archives_main'] : [] },
      create: {
        userId, score,
        completedQuests: questPhase === 'complete' ? ['archives_main'] : [],
      },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

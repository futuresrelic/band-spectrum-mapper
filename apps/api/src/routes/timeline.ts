import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const timelineRouter = Router();

// GET /api/timeline/round?bandIds=id1,id2&count=5
// Returns `count` random albums (with known release dates) in shuffled order.
// The client must sort them chronologically to score.
timelineRouter.get('/round', async (req, res, next): Promise<void> => {
  try {
    const raw = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];
    const count = Math.min(8, Math.max(3,
      parseInt(typeof req.query['count'] === 'string' ? req.query['count'] : '5', 10) || 5,
    ));

    if (bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' }); return;
    }

    const albums = await prisma.album.findMany({
      where: {
        bandId: { in: bandIds },
        year:   { not: null },
      },
      select: {
        id: true, title: true, year: true, artworkUrl: true,
        band: { select: { name: true } },
      },
    });

    if (albums.length < count) {
      res.status(400).json({ error: 'Not enough albums with release years for these bands' }); return;
    }

    const shuffled = [...albums].sort(() => Math.random() - 0.5);
    const picked   = shuffled.slice(0, count);

    // Return in a freshly shuffled order — client must not know correct order
    res.json({
      items: picked
        .map((a) => ({
          id:         a.id,
          title:      a.title,
          bandName:   a.band.name,
          artworkUrl: a.artworkUrl,
          year:       a.year!,
        }))
        .sort(() => Math.random() - 0.5),
    });
  } catch (e) { next(e); }
});

// POST /api/timeline/scores — auth required
timelineRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { score, totalRounds, bandIds } = req.body as { score?: unknown; totalRounds?: unknown; bandIds?: unknown };
    if (typeof score !== 'number' || score < 0) { res.status(400).json({ error: 'Invalid score' }); return; }
    const safeBandScope = Array.isArray(bandIds)
      ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
      : null;
    const saved = await prisma.timelineScore.create({
      data: {
        userId,
        score: Math.floor(score),
        totalRounds: typeof totalRounds === 'number' ? Math.max(1, Math.floor(totalRounds)) : 5,
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });
    const rank = await prisma.timelineScore.count({ where: { score: { gt: saved.score } } });
    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// GET /api/timeline/scores — public leaderboard
timelineRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, parseInt(typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10) || 15);
    const scores = await prisma.timelineScore.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      select: { id: true, score: true, totalRounds: true, createdAt: true, user: { select: { name: true, avatarUrl: true } } },
    });
    res.json(scores.map((s, i) => ({ rank: i + 1, playerName: s.user.name ?? 'Anonymous', avatarUrl: s.user.avatarUrl, score: s.score, totalRounds: s.totalRounds, createdAt: s.createdAt })));
  } catch (e) { next(e); }
});

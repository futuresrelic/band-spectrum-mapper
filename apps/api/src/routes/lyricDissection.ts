import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const lyricDissectionRouter = Router();

const STOP = new Set([
  'the','a','an','and','or','in','on','at','to','for','of',
  'with','by','is','was','are','be','i','you','he','she','it','we','they',
  'my','your','his','its','not','no','so','than','very','just','let','s','t',
  'that','this','have','had','has','but','from','all','when','what','here',
  'there','will','can','get','got','like','more','some','been','her','him',
  'they','them','then','into','about','up','out','do','did','don',
]);

function tokenizeOrdered(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

// GET /api/lyric-dissection/round?bandIds=id1,id2&poolSize=12
// Returns a target song, its ordered lyric words, and a pool of song names (correct + decoys).
lyricDissectionRouter.get('/round', async (req, res, next): Promise<void> => {
  try {
    const raw = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];
    const poolSize = Math.min(20, Math.max(6,
      parseInt(typeof req.query['poolSize'] === 'string' ? req.query['poolSize'] : '12', 10) || 12,
    ));

    if (bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' }); return;
    }

    const songs = await prisma.song.findMany({
      where: {
        bandId: { in: bandIds },
        isInstrumental: false,
        lyrics: { some: { isPrimary: true } },
      },
      select: {
        id: true, title: true,
        band:   { select: { name: true } },
        lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
      },
      take: 3000,
    });

    if (songs.length < poolSize) {
      res.status(400).json({ error: 'Not enough songs with lyrics for these bands' }); return;
    }

    // Shuffle and find a target song with sufficient lyric content
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    let target: typeof songs[number] | null = null;
    let targetWords: string[] = [];

    for (const song of shuffled) {
      const words = tokenizeOrdered(song.lyrics[0]?.text ?? '');
      if (words.length >= 15) {
        target = song;
        targetWords = words;
        break;
      }
    }

    if (!target) {
      res.status(400).json({ error: 'No songs with enough lyrics found' }); return;
    }

    // Pool: target + random decoys, shuffled
    const pool = [
      { id: target.id, title: target.title, bandName: target.band.name },
      ...shuffled
        .filter((s) => s.id !== target!.id)
        .slice(0, poolSize - 1)
        .map((s) => ({ id: s.id, title: s.title, bandName: s.band.name })),
    ].sort(() => Math.random() - 0.5);

    res.json({
      songId:   target.id,
      title:    target.title,
      bandName: target.band.name,
      words:    targetWords.slice(0, 50),
      songPool: pool,
    });
  } catch (e) { next(e); }
});

// POST /api/lyric-dissection/scores — auth required
lyricDissectionRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { score, totalRounds, bandIds } = req.body as { score?: unknown; totalRounds?: unknown; bandIds?: unknown };
    if (typeof score !== 'number' || score < 0) { res.status(400).json({ error: 'Invalid score' }); return; }
    const safeBandScope = Array.isArray(bandIds)
      ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
      : null;
    const saved = await prisma.lyricDissectionScore.create({
      data: {
        userId,
        score: Math.floor(score),
        totalRounds: typeof totalRounds === 'number' ? Math.max(1, Math.floor(totalRounds)) : 5,
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });
    const rank = await prisma.lyricDissectionScore.count({ where: { score: { gt: saved.score } } });
    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// GET /api/lyric-dissection/scores — public leaderboard
lyricDissectionRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, parseInt(typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10) || 15);
    const scores = await prisma.lyricDissectionScore.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      select: { id: true, score: true, totalRounds: true, createdAt: true, user: { select: { name: true, username: true, avatarUrl: true } } },
    });
    res.json(scores.map((s, i) => ({ rank: i + 1, playerName: s.user.username ?? s.user.name ?? 'Anonymous', avatarUrl: s.user.avatarUrl, score: s.score, totalRounds: s.totalRounds, createdAt: s.createdAt })));
  } catch (e) { next(e); }
});

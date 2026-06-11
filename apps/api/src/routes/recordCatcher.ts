import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const recordCatcherRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/record-catcher/round?bandIds=id1,id2
// Returns a random album + correct songs + decoy songs for one round.
// ---------------------------------------------------------------------------

recordCatcherRouter.get('/round', async (req, res, next): Promise<void> => {
  try {
    const raw     = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];

    if (bandIds.length === 0) { res.status(400).json({ error: 'bandIds required' }); return; }

    // Pick a random album with artwork and enough songs
    const albums = await prisma.album.findMany({
      where: {
        bandId:    { in: bandIds },
        artworkUrl: { not: null },
        songs: { some: {} },
      },
      select: {
        id: true, title: true, year: true, artworkUrl: true,
        band: { select: { id: true, name: true } },
        songs: {
          where:  { isInstrumental: false },
          select: { id: true, title: true },
          take:   20,
        },
      },
      take: 50,
    });

    // Filter to albums with ≥ 3 songs
    const eligible = albums.filter((a) => a.songs.length >= 3);

    if (eligible.length === 0) {
      // Fallback: include albums without artwork or with fewer songs
      const fallback = await prisma.album.findMany({
        where: { bandId: { in: bandIds }, songs: { some: {} } },
        select: {
          id: true, title: true, year: true, artworkUrl: true,
          band: { select: { id: true, name: true } },
          songs: { where: { isInstrumental: false }, select: { id: true, title: true }, take: 20 },
        },
        take: 50,
      });
      const fallbackEligible = fallback.filter((a) => a.songs.length >= 2);
      if (fallbackEligible.length === 0) {
        res.status(400).json({ error: 'Not enough songs/albums found for these bands' }); return;
      }
      eligible.push(...fallbackEligible);
    }

    const album = eligible[Math.floor(Math.random() * eligible.length)]!;

    // Correct songs: all from this album (shuffled, max 8)
    const shuffledCorrect = [...album.songs].sort(() => Math.random() - 0.5).slice(0, 8);

    // Decoy songs: from other albums in these bands (not from this album)
    const decoySongs = await prisma.song.findMany({
      where: {
        bandId: { in: bandIds },
        albumId: { not: album.id },
        isInstrumental: false,
      },
      select: { id: true, title: true },
      take:   60,
    });
    const shuffledDecoys = [...decoySongs].sort(() => Math.random() - 0.5).slice(0, 10);

    res.json({
      album: {
        id:         album.id,
        title:      album.title,
        year:       album.year,
        artworkUrl: album.artworkUrl,
        bandName:   album.band.name,
        bandId:     album.band.id,
      },
      correctSongs: shuffledCorrect,
      decoySongs:   shuffledDecoys,
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/record-catcher/scores  — auth required
// ---------------------------------------------------------------------------

recordCatcherRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { score, level, songsCorrect, songsWrong, bandIds } = req.body as {
      score?: unknown; level?: unknown; songsCorrect?: unknown; songsWrong?: unknown; bandIds?: unknown;
    };

    if (typeof score !== 'number' || score < 0) { res.status(400).json({ error: 'Invalid score' }); return; }

    const safeBandScope = Array.isArray(bandIds)
      ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
      : null;

    const saved = await prisma.recordCatcherScore.create({
      data: {
        userId,
        score:        Math.floor(score),
        level:        typeof level        === 'number' ? Math.max(1, Math.floor(level))        : 1,
        songsCorrect: typeof songsCorrect === 'number' ? Math.max(0, Math.floor(songsCorrect)) : 0,
        songsWrong:   typeof songsWrong   === 'number' ? Math.max(0, Math.floor(songsWrong))   : 0,
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });

    const rank = await prisma.recordCatcherScore.count({ where: { score: { gt: saved.score } } });

    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/record-catcher/scores  — public leaderboard
// ---------------------------------------------------------------------------

recordCatcherRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, parseInt(
      typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10,
    ) || 15);

    const scores = await prisma.recordCatcherScore.findMany({
      orderBy: { score: 'desc' },
      take:    limit,
      select: {
        id: true, score: true, level: true, songsCorrect: true,
        songsWrong: true, bandScope: true, createdAt: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    });

    const allBandIds = [...new Set(scores.flatMap((s) => s.bandScope ? s.bandScope.split(',').filter(Boolean) : []))];
    const bandNameMap = new Map<string, string>();
    if (allBandIds.length > 0) {
      const bands = await prisma.band.findMany({ where: { id: { in: allBandIds } }, select: { id: true, name: true } });
      for (const b of bands) bandNameMap.set(b.id, b.name);
    }

    res.json(scores.map((s, i) => ({
      rank:           i + 1,
      playerName:     s.user.name ?? 'Anonymous',
      avatarUrl:      s.user.avatarUrl,
      score:          s.score,
      level:          s.level,
      songsCorrect:   s.songsCorrect,
      bandScopeNames: s.bandScope ? s.bandScope.split(',').filter(Boolean).map((id) => bandNameMap.get(id) ?? id).join(', ') : null,
      createdAt:      s.createdAt,
    })));
  } catch (e) { next(e); }
});

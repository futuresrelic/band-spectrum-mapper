import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const bandRpgRouter = Router();

// GET /start-session?bandId=xxx — pick random song + extract lyric fragments
bandRpgRouter.get('/start-session', async (req, res, next): Promise<void> => {
  try {
    const rawBandId = req.query['bandId'];
    const bandId = typeof rawBandId === 'string' ? rawBandId : null;
    if (!bandId) { res.status(400).json({ error: 'bandId is required' }); return; }

    const count = await prisma.song.count({
      where: { bandId, isInstrumental: false, lyrics: { some: { isPrimary: true } } },
    });

    if (count === 0) {
      // Fallback: no lyrics found — return placeholder session
      res.json({ songId: null, songTitle: null, fragments: [] });
      return;
    }

    const skip = Math.floor(Math.random() * count);
    const song = await prisma.song.findFirst({
      where: { bandId, isInstrumental: false, lyrics: { some: { isPrimary: true } } },
      select: { id: true, title: true, lyrics: { where: { isPrimary: true }, take: 1, select: { text: true } } },
      skip,
    });

    if (!song) { res.json({ songId: null, songTitle: null, fragments: [] }); return; }

    const lyricText = song.lyrics[0]?.text ?? '';
    const fragments = extractFragments(lyricText, 3);

    res.json({ songId: song.id, songTitle: song.title, fragments });
  } catch (e) { next(e); }
});

function extractFragments(text: string, count: number): { id: string; text: string }[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 8 && !l.startsWith('[') && !l.startsWith('(') && l.length <= 80);

  // Shuffle lines
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = lines[i]; lines[i] = lines[j]!; lines[j] = tmp!;
  }

  return lines.slice(0, count).map((text, i) => ({ id: `frag_${i}`, text }));
}

// POST /scores — save run score (auth optional)
bandRpgRouter.post('/scores', async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId ?? null;
    const body = req.body as Record<string, unknown>;
    const score           = typeof body['score']           === 'number' ? Math.max(0, Math.floor(body['score'])) : 0;
    const questsCompleted = typeof body['questsCompleted'] === 'number' ? Math.floor(body['questsCompleted'])    : 0;
    const itemsCollected  = typeof body['itemsCollected']  === 'number' ? Math.floor(body['itemsCollected'])     : 0;
    const levelsCleared   = typeof body['levelsCleared']   === 'number' ? Math.floor(body['levelsCleared'])      : 0;
    const bandId          = typeof body['bandId']          === 'string' ? body['bandId']          : null;
    const bandName        = typeof body['bandName']        === 'string' ? body['bandName']        : null;
    const characterId     = typeof body['characterId']     === 'string' ? body['characterId']     : null;
    const characterName   = typeof body['characterName']   === 'string' ? body['characterName']   : null;
    const songId          = typeof body['songId']          === 'string' ? body['songId']          : null;
    const songTitle       = typeof body['songTitle']       === 'string' ? body['songTitle']       : null;

    const saved = await prisma.bandRpgScore.create({
      data: {
        ...(userId        ? { userId }        : {}),
        score, questsCompleted, itemsCollected, levelsCleared,
        isAnonymous: !userId,
        ...(bandId        ? { bandId }        : {}),
        ...(bandName      ? { bandName }      : {}),
        ...(characterId   ? { characterId }   : {}),
        ...(characterName ? { characterName } : {}),
        ...(songId        ? { songId }        : {}),
        ...(songTitle     ? { songTitle }     : {}),
      },
    });

    const rank = (await prisma.bandRpgScore.count({ where: { score: { gt: saved.score } } })) + 1;
    res.status(201).json({ ok: true, score: saved.score, rank });
  } catch (e) { next(e); }
});

// GET /scores — public leaderboard (optional ?bandId= filter)
bandRpgRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const rawLimit  = req.query['limit'];
    const rawBandId = req.query['bandId'];
    const limit = Math.min(50, Math.max(1, parseInt(typeof rawLimit === 'string' ? rawLimit : '10', 10) || 10));
    const bandIdFilter = typeof rawBandId === 'string' ? rawBandId : undefined;

    const scores = await prisma.bandRpgScore.findMany({
      where: bandIdFilter ? { bandId: bandIdFilter } : {},
      orderBy: { score: 'desc' },
      take: limit,
      select: {
        score: true, questsCompleted: true, itemsCollected: true,
        bandName: true, characterName: true, songTitle: true, createdAt: true,
        user: { select: { name: true, username: true, avatarUrl: true } },
      },
    });

    res.json(scores.map((s, i) => ({
      rank: i + 1,
      playerName:      s.user?.username ?? s.user?.name ?? 'Anonymous',
      avatarUrl:       s.user?.avatarUrl ?? null,
      score:           s.score,
      questsCompleted: s.questsCompleted,
      itemsCollected:  s.itemsCollected,
      bandName:        s.bandName      ?? null,
      characterName:   s.characterName ?? null,
      songTitle:       s.songTitle     ?? null,
      createdAt:       s.createdAt,
    })));
  } catch (e) { next(e); }
});

// POST /progress — save progress + update lifetime stats (auth required)
bandRpgRouter.post('/progress', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const body = req.body as Record<string, unknown>;
    const questPhase    = typeof body['questPhase']    === 'string' ? body['questPhase']    : 'pre_quest';
    const score         = typeof body['score']         === 'number' ? Math.max(0, Math.floor(body['score'])) : 0;
    const bandId        = typeof body['bandId']        === 'string' ? body['bandId']        : null;
    const bandName      = typeof body['bandName']      === 'string' ? body['bandName']      : null;
    const characterId   = typeof body['characterId']   === 'string' ? body['characterId']   : null;
    const characterName = typeof body['characterName'] === 'string' ? body['characterName'] : null;
    const isComplete    = questPhase === 'complete';

    const existing = await prisma.bandRpgPlayerProgress.findUnique({ where: { userId } });
    const newTotalRuns  = (existing?.totalRuns  ?? 0) + 1;
    const newTotalScore = (existing?.totalScore ?? 0) + score;

    const bandFields = {
      ...(bandId        ? { favoriteBandId:       bandId        } : {}),
      ...(bandName      ? { favoriteBandName:      bandName      } : {}),
      ...(characterId   ? { favoriteCharacterId:   characterId   } : {}),
      ...(characterName ? { favoriteCharacterName: characterName } : {}),
    };

    await prisma.bandRpgPlayerProgress.upsert({
      where:  { userId },
      update: {
        score,
        completedQuests: isComplete ? ['archives_main'] : [],
        totalRuns: newTotalRuns,
        totalScore: newTotalScore,
        lastPlayedAt: new Date(),
        ...bandFields,
      },
      create: {
        userId, score,
        completedQuests: isComplete ? ['archives_main'] : [],
        totalRuns: 1,
        totalScore: score,
        ...bandFields,
      },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /stats — player lifetime stats (auth required)
bandRpgRouter.get('/stats', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const progress = await prisma.bandRpgPlayerProgress.findUnique({
      where: { userId },
      select: {
        totalRuns: true, totalScore: true,
        favoriteBandId: true, favoriteBandName: true,
        favoriteCharacterId: true, favoriteCharacterName: true,
        lastPlayedAt: true,
      },
    });

    res.json(progress ?? {
      totalRuns: 0, totalScore: 0,
      favoriteBandId: null, favoriteBandName: null,
      favoriteCharacterId: null, favoriteCharacterName: null,
      lastPlayedAt: null,
    });
  } catch (e) { next(e); }
});

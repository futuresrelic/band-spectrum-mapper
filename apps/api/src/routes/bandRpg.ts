import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const bandRpgRouter = Router();

// ── Rarity system ──────────────────────────────────────────────────────────────

const RARITY_WEIGHTS: Record<string, number> = {
  Common:    10,
  Uncommon:   6,
  Rare:       3,
  Legendary:  1.5,
  Mythic:     0.7,
};

const ALREADY_COLLECTED_MULTIPLIER = 0.3;

// Distribution used for batch randomization (sums to 100)
const RANDOMIZE_DISTRIBUTION: { rarity: string; weight: number }[] = [
  { rarity: 'Common',    weight: 50 },
  { rarity: 'Uncommon',  weight: 25 },
  { rarity: 'Rare',      weight: 15 },
  { rarity: 'Legendary', weight: 7  },
  { rarity: 'Mythic',    weight: 3  },
];

function weightedRandomRarity(): string {
  const total = RANDOMIZE_DISTRIBUTION.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const d of RANDOMIZE_DISTRIBUTION) {
    r -= d.weight;
    if (r <= 0) return d.rarity;
  }
  return 'Common';
}

// ── GET /start-session?bandId=xxx ─────────────────────────────────────────────

bandRpgRouter.get('/start-session', async (req, res, next): Promise<void> => {
  try {
    const rawBandId = req.query['bandId'];
    const bandId = typeof rawBandId === 'string' ? rawBandId : null;
    if (!bandId) { res.status(400).json({ error: 'bandId is required' }); return; }

    const userId = req.user?.userId ?? null;

    // Fetch all eligible songs (have primary lyrics, not instrumental)
    const eligible = await prisma.song.findMany({
      where: { bandId, isInstrumental: false, lyrics: { some: { isPrimary: true } } },
      select: { id: true, title: true, rarity: true },
    });

    if (eligible.length === 0) {
      res.json({ songId: null, songTitle: null, songRarity: null, fragments: [] });
      return;
    }

    // Fetch already-collected song IDs for de-weighting
    const collectedIds = new Set<string>();
    if (userId) {
      const collected = await prisma.bandRpgCollectedSong.findMany({
        where: { userId, bandId },
        select: { songId: true },
      });
      for (const c of collected) collectedIds.add(c.songId);
    }

    // Weighted random selection
    const weighted = eligible.map((s) => ({
      id: s.id,
      title: s.title,
      rarity: s.rarity,
      weight: (RARITY_WEIGHTS[s.rarity] ?? 10) * (collectedIds.has(s.id) ? ALREADY_COLLECTED_MULTIPLIER : 1),
    }));

    const totalWeight = weighted.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * totalWeight;
    let selected = weighted[0]!;
    for (const s of weighted) {
      r -= s.weight;
      if (r <= 0) { selected = s; break; }
    }

    // Fetch lyrics for selected song
    const song = await prisma.song.findUnique({
      where: { id: selected.id },
      select: {
        id: true, title: true, rarity: true,
        lyrics: { where: { isPrimary: true }, take: 1, select: { text: true } },
      },
    });

    if (!song) { res.json({ songId: null, songTitle: null, songRarity: null, fragments: [] }); return; }

    const lyricText = song.lyrics[0]?.text ?? '';
    const fragments = extractFragments(lyricText, 3);

    res.json({ songId: song.id, songTitle: song.title, songRarity: song.rarity, fragments });
  } catch (e) { next(e); }
});

function extractFragments(text: string, count: number): { id: string; text: string }[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 8 && !l.startsWith('[') && !l.startsWith('(') && l.length <= 80);

  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = lines[i]; lines[i] = lines[j]!; lines[j] = tmp!;
  }

  return lines.slice(0, count).map((t, i) => ({ id: `frag_${i}`, text: t }));
}

// ── GET /songs?bandId=xxx ─────────────────────────────────────────────────────

bandRpgRouter.get('/songs', async (req, res, next): Promise<void> => {
  try {
    const rawBandId = req.query['bandId'];
    const bandId = typeof rawBandId === 'string' ? rawBandId : null;
    if (!bandId) { res.status(400).json({ error: 'bandId is required' }); return; }

    const songs = await prisma.song.findMany({
      where: { bandId },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
      take: 500,
    });

    res.json(songs);
  } catch (e) { next(e); }
});

// ── POST /scores ──────────────────────────────────────────────────────────────

bandRpgRouter.post('/scores', async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId ?? null;
    const body = req.body as Record<string, unknown>;
    const score            = typeof body['score']            === 'number'  ? Math.max(0, Math.floor(body['score'])) : 0;
    const questsCompleted  = typeof body['questsCompleted']  === 'number'  ? Math.floor(body['questsCompleted'])    : 0;
    const itemsCollected   = typeof body['itemsCollected']   === 'number'  ? Math.floor(body['itemsCollected'])     : 0;
    const levelsCleared    = typeof body['levelsCleared']    === 'number'  ? Math.floor(body['levelsCleared'])      : 0;
    const bandId           = typeof body['bandId']           === 'string'  ? body['bandId']           : null;
    const bandName         = typeof body['bandName']         === 'string'  ? body['bandName']         : null;
    const characterId      = typeof body['characterId']      === 'string'  ? body['characterId']      : null;
    const characterName    = typeof body['characterName']    === 'string'  ? body['characterName']    : null;
    const songId           = typeof body['songId']           === 'string'  ? body['songId']           : null;
    const songTitle        = typeof body['songTitle']        === 'string'  ? body['songTitle']        : null;
    const guessedCorrectly = typeof body['guessedCorrectly'] === 'boolean' ? body['guessedCorrectly'] : false;
    const guessBonus       = typeof body['guessBonus']       === 'number'  ? Math.floor(body['guessBonus'])         : 0;

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
        guessedCorrectly,
        guessBonus,
      },
    });

    const rank = (await prisma.bandRpgScore.count({ where: { score: { gt: saved.score } } })) + 1;
    res.status(201).json({ ok: true, score: saved.score, rank });
  } catch (e) { next(e); }
});

// ── GET /scores ───────────────────────────────────────────────────────────────

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
        bandName: true, characterName: true, songTitle: true,
        guessedCorrectly: true, guessBonus: true, createdAt: true,
        user: { select: { name: true, username: true, avatarUrl: true } },
      },
    });

    res.json(scores.map((s, i) => ({
      rank: i + 1,
      playerName:       s.user?.username ?? s.user?.name ?? 'Anonymous',
      avatarUrl:        s.user?.avatarUrl ?? null,
      score:            s.score,
      questsCompleted:  s.questsCompleted,
      itemsCollected:   s.itemsCollected,
      bandName:         s.bandName         ?? null,
      characterName:    s.characterName    ?? null,
      songTitle:        s.songTitle        ?? null,
      guessedCorrectly: s.guessedCorrectly,
      guessBonus:       s.guessBonus,
      createdAt:        s.createdAt,
    })));
  } catch (e) { next(e); }
});

// ── POST /progress ────────────────────────────────────────────────────────────

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
      ...(bandId        ? { favoriteBandId:        bandId        } : {}),
      ...(bandName      ? { favoriteBandName:       bandName      } : {}),
      ...(characterId   ? { favoriteCharacterId:    characterId   } : {}),
      ...(characterName ? { favoriteCharacterName:  characterName } : {}),
    };

    await prisma.bandRpgPlayerProgress.upsert({
      where:  { userId },
      update: {
        score,
        completedQuests: isComplete ? ['archives_main'] : [],
        totalRuns:    newTotalRuns,
        totalScore:   newTotalScore,
        lastPlayedAt: new Date(),
        ...bandFields,
      },
      create: {
        userId, score,
        completedQuests: isComplete ? ['archives_main'] : [],
        totalRuns:  1,
        totalScore: score,
        ...bandFields,
      },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── GET /stats ────────────────────────────────────────────────────────────────

bandRpgRouter.get('/stats', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const [progress, uniqueSongsRecovered, correctGuessCount] = await Promise.all([
      prisma.bandRpgPlayerProgress.findUnique({
        where: { userId },
        select: {
          totalRuns: true, totalScore: true,
          totalSongsRecovered: true,
          favoriteBandId: true, favoriteBandName: true,
          favoriteCharacterId: true, favoriteCharacterName: true,
          lastPlayedAt: true,
        },
      }),
      prisma.bandRpgCollectedSong.count({ where: { userId } }),
      prisma.bandRpgCollectedSong.count({ where: { userId, guessedCorrectly: true } }),
    ]);

    const investigationAccuracy = uniqueSongsRecovered > 0
      ? Math.round((correctGuessCount / uniqueSongsRecovered) * 100)
      : 0;

    res.json({
      totalRuns:              progress?.totalRuns              ?? 0,
      totalScore:             progress?.totalScore             ?? 0,
      totalSongsRecovered:    progress?.totalSongsRecovered    ?? 0,
      uniqueSongsRecovered,
      correctGuessCount,
      investigationAccuracy,
      favoriteBandId:         progress?.favoriteBandId         ?? null,
      favoriteBandName:       progress?.favoriteBandName       ?? null,
      favoriteCharacterId:    progress?.favoriteCharacterId    ?? null,
      favoriteCharacterName:  progress?.favoriteCharacterName  ?? null,
      lastPlayedAt:           progress?.lastPlayedAt           ?? null,
    });
  } catch (e) { next(e); }
});

// ── POST /collect ─────────────────────────────────────────────────────────────

bandRpgRouter.post('/collect', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const body = req.body as Record<string, unknown>;
    const songId           = typeof body['songId']           === 'string'  ? body['songId']           : null;
    const songTitle        = typeof body['songTitle']        === 'string'  ? body['songTitle']        : null;
    const bandId           = typeof body['bandId']           === 'string'  ? body['bandId']           : null;
    const bandName         = typeof body['bandName']         === 'string'  ? body['bandName']         : null;
    const rarity           = typeof body['rarity']           === 'string'  ? body['rarity']           : 'Common';
    const guessedCorrectly = typeof body['guessedCorrectly'] === 'boolean' ? body['guessedCorrectly'] : false;
    const scoreEarned      = typeof body['scoreEarned']      === 'number'  ? Math.max(0, Math.floor(body['scoreEarned'])) : 0;

    if (!songId || !songTitle || !bandId || !bandName) {
      res.status(400).json({ error: 'songId, songTitle, bandId, bandName are required' });
      return;
    }

    const existing = await prisma.bandRpgCollectedSong.findUnique({
      where: { userId_songId: { userId, songId } },
      select: { scoreEarned: true, guessedCorrectly: true },
    });

    const isNew = !existing;

    await prisma.bandRpgCollectedSong.upsert({
      where:  { userId_songId: { userId, songId } },
      update: {
        ...(scoreEarned > (existing?.scoreEarned ?? 0) ? { scoreEarned, rarity } : {}),
        ...(guessedCorrectly && !(existing?.guessedCorrectly ?? false) ? { guessedCorrectly: true } : {}),
      },
      create: { userId, songId, songTitle, bandId, bandName, guessedCorrectly, scoreEarned, rarity },
    });

    await prisma.bandRpgPlayerProgress.upsert({
      where:  { userId },
      update: { totalSongsRecovered: { increment: 1 } },
      create: { userId, totalSongsRecovered: 1 },
    });

    res.json({ ok: true, isNew });
  } catch (e) { next(e); }
});

// ── GET /collection ───────────────────────────────────────────────────────────

bandRpgRouter.get('/collection', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const entries = await prisma.bandRpgCollectedSong.findMany({
      where: { userId },
      orderBy: { recoveredAt: 'desc' },
      select: {
        id: true, songId: true, songTitle: true,
        bandId: true, bandName: true,
        guessedCorrectly: true, scoreEarned: true, rarity: true, recoveredAt: true,
      },
    });

    const bandMap = new Map<string, {
      bandId: string; bandName: string;
      collected: typeof entries;
    }>();

    for (const entry of entries) {
      let group = bandMap.get(entry.bandId);
      if (!group) {
        group = { bandId: entry.bandId, bandName: entry.bandName, collected: [] };
        bandMap.set(entry.bandId, group);
      }
      group.collected.push(entry);
    }

    const bandIds = Array.from(bandMap.keys());
    const songCounts = await Promise.all(
      bandIds.map((bandId) => prisma.song.count({ where: { bandId } })),
    );

    const groups = bandIds.map((bandId, i) => {
      const group = bandMap.get(bandId)!;
      return {
        bandId,
        bandName: group.bandName,
        collected: group.collected,
        totalSongsInBand: songCounts[i] ?? 0,
      };
    });

    groups.sort((a, b) => {
      const aTime = a.collected[0]?.recoveredAt?.getTime() ?? 0;
      const bTime = b.collected[0]?.recoveredAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    res.json(groups);
  } catch (e) { next(e); }
});

// ── POST /admin/reset-my-data ────────────────────────────────────────────────

bandRpgRouter.post('/admin/reset-my-data', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    await prisma.$transaction([
      prisma.bandRpgCollectedSong.deleteMany({ where: { userId } }),
      prisma.bandRpgPlayerProgress.deleteMany({ where: { userId } }),
    ]);

    res.json({ ok: true, message: 'Band RPG collection and progress cleared.' });
  } catch (e) { next(e); }
});

// ── POST /admin/randomize-rarities ───────────────────────────────────────────

bandRpgRouter.post('/admin/randomize-rarities', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const bandId = typeof body['bandId'] === 'string' ? body['bandId'] : null;
    if (!bandId) { res.status(400).json({ error: 'bandId is required' }); return; }

    const songs = await prisma.song.findMany({
      where: { bandId },
      select: { id: true },
    });

    if (songs.length === 0) {
      res.json({ ok: true, updated: 0 });
      return;
    }

    await prisma.$transaction(
      songs.map((s) =>
        prisma.song.update({
          where: { id: s.id },
          data: { rarity: weightedRandomRarity() as 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Mythic' },
        }),
      ),
    );

    res.json({ ok: true, updated: songs.length });
  } catch (e) { next(e); }
});

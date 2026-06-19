import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const bandRpgRouter = Router();

// ── Rarity system ──────────────────────────────────────────────────────────────

const RARITY_VALUE: Record<string, number> = {
  Common: 1, Uncommon: 2, Rare: 4, Legendary: 8, Mythic: 15,
};

// diversityBonus = 0 when all songs from same album; scales up to 40% of rarityValue at full diversity
function computeDiversityBonus(uniqueAlbums: number, songCount: number, rarityValue: number): number {
  if (songCount === 0 || uniqueAlbums === 0) return 0;
  return Math.floor((uniqueAlbums / songCount) * rarityValue * 0.4);
}

function computeGrade(total: number): string {
  if (total >= 80) return 'S';
  if (total >= 50) return 'A';
  if (total >= 25) return 'B';
  if (total >= 10) return 'C';
  return 'D';
}

const RARITY_WEIGHTS: Record<string, number> = {
  Common:    10,
  Uncommon:   6,
  Rare:       3,
  Legendary:  1.5,
  Mythic:     0.7,
};

const ALREADY_COLLECTED_MULTIPLIER = 0.3;

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

    const eligible = await prisma.song.findMany({
      where: { bandId, isInstrumental: false, lyrics: { some: { isPrimary: true } } },
      select: { id: true, title: true, rarity: true },
    });

    if (eligible.length === 0) {
      res.json({ songId: null, songTitle: null, songRarity: null, fragments: [] });
      return;
    }

    const collectedIds = new Set<string>();
    if (userId) {
      const collected = await prisma.bandRpgCollectedSong.findMany({
        where: { userId, bandId },
        select: { songId: true },
      });
      for (const c of collected) collectedIds.add(c.songId);
    }

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

    const [progress, uniqueSongsRecovered, correctGuessCount, albumsCompleted] = await Promise.all([
      prisma.bandRpgPlayerProgress.findUnique({
        where: { userId },
        select: {
          totalRuns: true, totalScore: true, totalSongsRecovered: true,
          favoriteBandId: true, favoriteBandName: true,
          favoriteCharacterId: true, favoriteCharacterName: true,
          lastPlayedAt: true,
        },
      }),
      prisma.bandRpgCollectedSong.count({ where: { userId } }),
      prisma.bandRpgCollectedSong.count({ where: { userId, guessedCorrectly: true } }),
      prisma.bandRpgCompletedAlbum.count({ where: { userId } }),
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
      albumsCompleted,
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

    // ── Album completion check ──────────────────────────────────────────────
    let albumCompleted = false;
    let completedAlbumId: string | null = null;
    let completedAlbumTitle: string | null = null;

    const songRecord = await prisma.song.findUnique({
      where: { id: songId },
      select: { albumId: true, album: { select: { id: true, title: true } } },
    });

    if (songRecord?.albumId && songRecord.album) {
      const albumId = songRecord.albumId;
      const albumSongs = await prisma.song.findMany({
        where: { albumId },
        select: { id: true },
      });

      if (albumSongs.length > 0) {
        const albumSongIds = albumSongs.map((s) => s.id);
        const recoveredCount = await prisma.bandRpgCollectedSong.count({
          where: { userId, songId: { in: albumSongIds } },
        });

        if (recoveredCount === albumSongs.length) {
          const alreadyCompleted = await prisma.bandRpgCompletedAlbum.findUnique({
            where: { userId_albumId: { userId, albumId } },
          });

          if (!alreadyCompleted) {
            await prisma.bandRpgCompletedAlbum.create({
              data: {
                userId, albumId,
                albumTitle: songRecord.album.title,
                bandId,
                bandName,
                songCount: albumSongs.length,
              },
            });
            albumCompleted = true;
            completedAlbumId = albumId;
            completedAlbumTitle = songRecord.album.title;
          }
        }
      }
    }
    // ── End album completion check ─────────────────────────────────────────

    res.json({
      ok: true, isNew, albumCompleted,
      ...(completedAlbumId ? { completedAlbumId, completedAlbumTitle } : {}),
    });
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

// ── GET /albums — band-grouped album progress ─────────────────────────────────

bandRpgRouter.get('/albums', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const collectedSongs = await prisma.bandRpgCollectedSong.findMany({
      where: { userId },
      select: { songId: true, bandId: true, bandName: true },
    });

    if (collectedSongs.length === 0) { res.json([]); return; }

    const bandIds = [...new Set(collectedSongs.map((s) => s.bandId))];
    const collectedSongIdSet = new Set(collectedSongs.map((s) => s.songId));
    const bandNameMap = new Map(collectedSongs.map((s) => [s.bandId, s.bandName]));

    const [albums, completedAlbums] = await Promise.all([
      prisma.album.findMany({
        where: { bandId: { in: bandIds } },
        select: {
          id: true, title: true, artworkUrl: true, albumType: true, year: true, bandId: true,
          songs: { select: { id: true } },
        },
        orderBy: [{ bandId: 'asc' }, { year: 'asc' }, { title: 'asc' }],
      }),
      prisma.bandRpgCompletedAlbum.findMany({
        where: { userId },
        select: { albumId: true, completedAt: true },
      }),
    ]);

    const completedMap = new Map(completedAlbums.map((a) => [a.albumId, a.completedAt]));

    const bandMap = new Map<string, {
      bandId: string; bandName: string; albums: unknown[]; completedCount: number;
    }>();

    for (const album of albums) {
      if (album.songs.length === 0) continue;

      const songIds = album.songs.map((s) => s.id);
      const recoveredCount = songIds.filter((id) => collectedSongIdSet.has(id)).length;
      const completedAt = completedMap.get(album.id) ?? null;
      const state = completedAt ? 'completed' : recoveredCount > 0 ? 'in_progress' : 'not_started';

      const progress = {
        albumId:      album.id,
        albumTitle:   album.title,
        artworkUrl:   album.artworkUrl   ?? null,
        albumType:    album.albumType    ?? null,
        year:         album.year         ?? null,
        bandId:       album.bandId,
        bandName:     bandNameMap.get(album.bandId) ?? 'Unknown Band',
        totalSongs:   songIds.length,
        recoveredSongs: recoveredCount,
        completionPct: Math.round((recoveredCount / songIds.length) * 100),
        state,
        completedAt:  completedAt?.toISOString() ?? null,
      };

      let group = bandMap.get(album.bandId);
      if (!group) {
        group = { bandId: album.bandId, bandName: bandNameMap.get(album.bandId) ?? 'Unknown', albums: [], completedCount: 0 };
        bandMap.set(album.bandId, group);
      }
      group.albums.push(progress);
      if (state === 'completed') group.completedCount++;
    }

    const result = [...bandMap.values()].map((g) => ({
      bandId: g.bandId,
      bandName: g.bandName,
      totalAlbums: g.albums.length,
      completedAlbums: g.completedCount,
      albums: g.albums,
    }));

    res.json(result);
  } catch (e) { next(e); }
});

// ── GET /albums/:albumId — album detail with per-song recovery status ─────────

bandRpgRouter.get('/albums/:albumId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const albumId = req.params['albumId'];
    if (!albumId) { res.status(400).json({ error: 'albumId is required' }); return; }

    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: {
        id: true, title: true, artworkUrl: true, albumType: true, year: true,
        band: { select: { id: true, name: true } },
        songs: {
          select: { id: true, title: true, rarity: true, trackNumber: true },
          orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
        },
      },
    });

    if (!album) { res.status(404).json({ error: 'Album not found' }); return; }

    const songIds = album.songs.map((s) => s.id);

    const [collectedForAlbum, completedRecord] = await Promise.all([
      prisma.bandRpgCollectedSong.findMany({
        where: { userId, songId: { in: songIds } },
        select: { songId: true, recoveredAt: true, guessedCorrectly: true },
      }),
      prisma.bandRpgCompletedAlbum.findUnique({
        where: { userId_albumId: { userId, albumId } },
        select: { completedAt: true },
      }),
    ]);

    const collectedMap = new Map(collectedForAlbum.map((c) => [c.songId, c]));

    const songs = album.songs.map((s) => {
      const c = collectedMap.get(s.id);
      return {
        songId:          s.id,
        title:           s.title,
        rarity:          s.rarity,
        trackNumber:     s.trackNumber ?? null,
        recovered:       !!c,
        recoveredAt:     c?.recoveredAt.toISOString() ?? null,
        guessedCorrectly: c?.guessedCorrectly ?? false,
      };
    });

    res.json({
      albumId:       album.id,
      albumTitle:    album.title,
      artworkUrl:    album.artworkUrl   ?? null,
      albumType:     album.albumType    ?? null,
      year:          album.year         ?? null,
      bandId:        album.band.id,
      bandName:      album.band.name,
      totalSongs:    songIds.length,
      recoveredSongs: collectedForAlbum.length,
      completionPct: songIds.length > 0
        ? Math.round((collectedForAlbum.length / songIds.length) * 100)
        : 0,
      state: completedRecord
        ? 'completed'
        : collectedForAlbum.length > 0 ? 'in_progress' : 'not_started',
      completedAt: completedRecord?.completedAt.toISOString() ?? null,
      songs,
    });
  } catch (e) { next(e); }
});

// ── GET /setlists ─────────────────────────────────────────────────────────────

bandRpgRouter.get('/setlists', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const setlists = await prisma.bandRpgSetlist.findMany({
      where: { userId },
      include: { songs: { select: { songId: true, rarity: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Batch album lookup for all songs across all setlists
    const allSongIds = setlists.flatMap((sl) => sl.songs.map((s) => s.songId));
    const songAlbumRows = allSongIds.length > 0
      ? await prisma.song.findMany({
          where: { id: { in: allSongIds }, albumId: { not: null } },
          select: { id: true, albumId: true },
        })
      : [];
    const songAlbumMap = new Map(songAlbumRows.map((s) => [s.id, s.albumId as string]));

    res.json(setlists.map((sl) => {
      const rarityValue    = sl.songs.reduce((sum, s) => sum + (RARITY_VALUE[s.rarity] ?? 1), 0);
      const albumCount     = new Set(
        sl.songs.map((s) => songAlbumMap.get(s.songId)).filter((id): id is string => !!id),
      ).size;
      const diversityBonus = computeDiversityBonus(albumCount, sl.songs.length, rarityValue);
      const grade          = computeGrade(rarityValue + diversityBonus);
      return {
        id:            sl.id,
        bandId:        sl.bandId,
        bandName:      sl.bandName,
        name:          sl.name,
        songCount:     sl.songs.length,
        rarityValue,
        albumCount,
        diversityBonus,
        grade,
        createdAt:     sl.createdAt.toISOString(),
        updatedAt:     sl.updatedAt.toISOString(),
      };
    }));
  } catch (e) { next(e); }
});

// ── POST /setlists ────────────────────────────────────────────────────────────

bandRpgRouter.post('/setlists', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const body     = req.body as Record<string, unknown>;
    const bandId   = typeof body['bandId']   === 'string' ? body['bandId']         : null;
    const bandName = typeof body['bandName'] === 'string' ? body['bandName']       : null;
    const name     = typeof body['name']     === 'string' ? body['name'].trim()    : null;

    if (!bandId || !bandName || !name) {
      res.status(400).json({ error: 'bandId, bandName, and name are required' }); return;
    }

    const setlist = await prisma.bandRpgSetlist.create({
      data: { userId, bandId, bandName, name },
    });

    res.status(201).json({ ok: true, id: setlist.id });
  } catch (e) { next(e); }
});

// ── GET /setlists/:setlistId ──────────────────────────────────────────────────

bandRpgRouter.get('/setlists/:setlistId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const setlistId = req.params['setlistId'];
    if (!setlistId) { res.status(400).json({ error: 'setlistId is required' }); return; }

    const setlist = await prisma.bandRpgSetlist.findFirst({
      where: { id: setlistId, userId },
      include: { songs: { orderBy: { position: 'asc' } } },
    });
    if (!setlist) { res.status(404).json({ error: 'Not found' }); return; }

    const songIds = setlist.songs.map((s) => s.songId);
    let albumCount = 0;
    if (songIds.length > 0) {
      const songsWithAlbums = await prisma.song.findMany({
        where: { id: { in: songIds }, albumId: { not: null } },
        select: { albumId: true },
      });
      albumCount = new Set(
        songsWithAlbums.map((s) => s.albumId).filter((id): id is string => id !== null),
      ).size;
    }

    const rarityValue    = setlist.songs.reduce((sum, s) => sum + (RARITY_VALUE[s.rarity] ?? 1), 0);
    const diversityBonus = computeDiversityBonus(albumCount, setlist.songs.length, rarityValue);
    const grade          = computeGrade(rarityValue + diversityBonus);

    const rarityBreakdown: Record<string, number> = {
      Common: 0, Uncommon: 0, Rare: 0, Legendary: 0, Mythic: 0,
    };
    for (const s of setlist.songs) {
      rarityBreakdown[s.rarity] = (rarityBreakdown[s.rarity] ?? 0) + 1;
    }

    res.json({
      id:            setlist.id,
      bandId:        setlist.bandId,
      bandName:      setlist.bandName,
      name:          setlist.name,
      songCount:     setlist.songs.length,
      rarityValue,
      albumCount,
      diversityBonus,
      grade,
      rarityBreakdown,
      createdAt:     setlist.createdAt.toISOString(),
      updatedAt:     setlist.updatedAt.toISOString(),
      songs: setlist.songs.map((s) => ({
        id:        s.id,
        songId:    s.songId,
        songTitle: s.songTitle,
        rarity:    s.rarity,
        position:  s.position,
        addedAt:   s.addedAt.toISOString(),
      })),
    });
  } catch (e) { next(e); }
});

// ── PUT /setlists/:setlistId — rename ────────────────────────────────────────

bandRpgRouter.put('/setlists/:setlistId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const setlistId = req.params['setlistId'];
    if (!setlistId) { res.status(400).json({ error: 'setlistId is required' }); return; }

    const body = req.body as Record<string, unknown>;
    const name = typeof body['name'] === 'string' ? body['name'].trim() : null;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }

    const setlist = await prisma.bandRpgSetlist.findFirst({ where: { id: setlistId, userId } });
    if (!setlist) { res.status(404).json({ error: 'Not found' }); return; }

    await prisma.bandRpgSetlist.update({ where: { id: setlistId }, data: { name } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── DELETE /setlists/:setlistId ───────────────────────────────────────────────

bandRpgRouter.delete('/setlists/:setlistId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const setlistId = req.params['setlistId'];
    if (!setlistId) { res.status(400).json({ error: 'setlistId is required' }); return; }

    const setlist = await prisma.bandRpgSetlist.findFirst({ where: { id: setlistId, userId } });
    if (!setlist) { res.status(404).json({ error: 'Not found' }); return; }

    await prisma.bandRpgSetlist.delete({ where: { id: setlistId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── PUT /setlists/:setlistId/songs — replace ordered song list ────────────────

bandRpgRouter.put('/setlists/:setlistId/songs', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const setlistId = req.params['setlistId'];
    if (!setlistId) { res.status(400).json({ error: 'setlistId is required' }); return; }

    const body = req.body as Record<string, unknown>;
    const rawSongs = Array.isArray(body['songs']) ? body['songs'] as Record<string, unknown>[] : [];
    const songIds = rawSongs
      .map((s) => typeof s['songId'] === 'string' ? s['songId'] : null)
      .filter((id): id is string => id !== null);

    const setlist = await prisma.bandRpgSetlist.findFirst({ where: { id: setlistId, userId } });
    if (!setlist) { res.status(404).json({ error: 'Not found' }); return; }

    const collected = await prisma.bandRpgCollectedSong.findMany({
      where: { userId, songId: { in: songIds }, bandId: setlist.bandId },
      select: { songId: true, songTitle: true, rarity: true },
    });
    const collectedMap = new Map(collected.map((s) => [s.songId, s]));

    // Preserve the caller's order; skip uncollected / wrong-band songs
    const validSongs = songIds
      .filter((id) => collectedMap.has(id))
      .map((id, idx) => {
        const c = collectedMap.get(id)!;
        return { songId: id, songTitle: c.songTitle, rarity: c.rarity, position: idx };
      });

    await prisma.$transaction([
      prisma.bandRpgSetlistSong.deleteMany({ where: { setlistId } }),
      ...validSongs.map((s) =>
        prisma.bandRpgSetlistSong.create({
          data: { setlistId, songId: s.songId, songTitle: s.songTitle, rarity: s.rarity, position: s.position },
        }),
      ),
    ]);

    await prisma.bandRpgSetlist.update({ where: { id: setlistId }, data: { updatedAt: new Date() } });

    res.json({ ok: true, songCount: validSongs.length });
  } catch (e) { next(e); }
});

// ── POST /admin/reset-my-data ─────────────────────────────────────────────────

bandRpgRouter.post('/admin/reset-my-data', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    await prisma.$transaction([
      prisma.bandRpgCollectedSong.deleteMany({ where: { userId } }),
      prisma.bandRpgCompletedAlbum.deleteMany({ where: { userId } }),
      prisma.bandRpgSetlist.deleteMany({ where: { userId } }),
      prisma.bandRpgPlayerProgress.deleteMany({ where: { userId } }),
    ]);

    res.json({ ok: true, message: 'Band RPG collection, albums, setlists, and progress cleared.' });
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

    if (songs.length === 0) { res.json({ ok: true, updated: 0 }); return; }

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

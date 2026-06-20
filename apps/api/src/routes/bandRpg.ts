import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { grantXP, persistChallengeTitles, XP_GRANTS } from '../services/curatorService.js';
import {
  searchArtistOnSetlistFm,
  storeBandArtistMatch,
  fetchBandLiveData,
  computeConcertRealism,
  computeFestivalRealism,
  computeHistoricalHighlights,
  type SongHistoricalSummary,
} from '../services/setlistIntelligenceService.js';

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

    // XP grants — fire-and-forget; never block the response
    if (isNew) {
      void grantXP(userId, XP_GRANTS.SONG_RECOVERED, { setFirstRecovery: true }).catch(() => undefined);
      if (guessedCorrectly) {
        void grantXP(userId, XP_GRANTS.CORRECT_GUESS).catch(() => undefined);
      }
    }
    if (albumCompleted) {
      void grantXP(userId, XP_GRANTS.ALBUM_COMPLETED).catch(() => undefined);
    }

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

    // Fetch live profiles for all collected songs (Phase V enrichment — optional)
    const songIds     = [...new Set(entries.map((e) => e.songId))];
    const liveProfiles = songIds.length > 0
      ? await prisma.bandRpgSongProfile.findMany({
          where:  { songId: { in: songIds } },
          select: {
            songId: true, liveStatus: true, liveValue: true, rarityIndex: true,
            totalPerformances: true, performancePct: true,
            yearsSincePlayed: true, lastPerformanceDate: true, firstPerformanceDate: true,
          },
        })
      : [];
    const liveProfileMap = new Map(liveProfiles.map((p) => [p.songId, p]));

    type LiveDataShape = {
      liveStatus: string; liveValue: number; rarityIndex: number;
      totalPerformances: number; performancePct: number;
      yearsSincePlayed: number | null;
      lastPerformanceDate: string | null; firstPerformanceDate: string | null;
    };
    const bandMap = new Map<string, {
      bandId: string; bandName: string;
      collected: Array<typeof entries[0] & { liveData: LiveDataShape | null }>;
    }>();

    for (const entry of entries) {
      let group = bandMap.get(entry.bandId);
      if (!group) {
        group = { bandId: entry.bandId, bandName: entry.bandName, collected: [] };
        bandMap.set(entry.bandId, group);
      }
      const lp = liveProfileMap.get(entry.songId) ?? null;
      group.collected.push({
        ...entry,
        liveData: lp ? {
          liveStatus:          lp.liveStatus,
          liveValue:           lp.liveValue,
          rarityIndex:         lp.rarityIndex,
          totalPerformances:   lp.totalPerformances,
          performancePct:      lp.performancePct,
          yearsSincePlayed:    lp.yearsSincePlayed,
          lastPerformanceDate: lp.lastPerformanceDate?.toISOString() ?? null,
          firstPerformanceDate: lp.firstPerformanceDate?.toISOString() ?? null,
        } : null,
      });
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

    void grantXP(userId, XP_GRANTS.SETLIST_CREATED).catch(() => undefined);
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

// ── Venue catalog ─────────────────────────────────────────────────────────────

interface VenueCatalogEntry {
  id: string; name: string; description: string; capacity: number;
  atmosphereAffinity: number; aggressionAffinity: number; complexityAffinity: number;
  emotionAffinity: number; psychedelicAffinity: number; conceptAffinity: number;
  rarityBonus: number;
}

const VENUE_CATALOG: VenueCatalogEntry[] = [
  {
    id: 'venue-spiral-hall', name: 'Spiral Hall', capacity: 2000,
    description: 'The Spiral Hall thrives on immersive, layered experiences. Psychedelic and atmospheric performances unlock its full resonance.',
    atmosphereAffinity: 5, aggressionAffinity: 1, complexityAffinity: 2, emotionAffinity: 2, psychedelicAffinity: 5, conceptAffinity: 2, rarityBonus: 3,
  },
  {
    id: 'venue-reflection-theatre', name: 'The Reflection Theatre', capacity: 800,
    description: 'The Reflection Theatre is built for emotional resonance. Vulnerable, introspective performances find their fullest expression here.',
    atmosphereAffinity: 3, aggressionAffinity: 1, complexityAffinity: 3, emotionAffinity: 5, psychedelicAffinity: 2, conceptAffinity: 4, rarityBonus: 2,
  },
  {
    id: 'venue-rosetta-pavilion', name: 'The Rosetta Pavilion', capacity: 5000,
    description: 'The Rosetta Pavilion rewards diversity and range. Concerts that span multiple albums and moods are celebrated here.',
    atmosphereAffinity: 3, aggressionAffinity: 2, complexityAffinity: 3, emotionAffinity: 3, psychedelicAffinity: 3, conceptAffinity: 3, rarityBonus: 6,
  },
  {
    id: 'venue-spectrum-centre', name: 'Spectrum Centre', capacity: 10000,
    description: 'Spectrum Centre honours all dimensions equally. Balanced concerts that score across every axis reach their peak potential here.',
    atmosphereAffinity: 4, aggressionAffinity: 4, complexityAffinity: 4, emotionAffinity: 4, psychedelicAffinity: 4, conceptAffinity: 4, rarityBonus: 4,
  },
  {
    id: 'venue-lateral-arena', name: 'The Lateral Arena', capacity: 15000,
    description: 'The Lateral Arena was built for high-energy confrontation. Raw aggression and relentless power dominate its stage.',
    atmosphereAffinity: 1, aggressionAffinity: 5, complexityAffinity: 2, emotionAffinity: 1, psychedelicAffinity: 1, conceptAffinity: 2, rarityBonus: 2,
  },
  {
    id: 'venue-aether-dome', name: 'The Æther Dome', capacity: 3000,
    description: 'The Æther Dome suspends reality. Psychedelic, atmospheric, and conceptually dense performances create unforgettable events here.',
    atmosphereAffinity: 5, aggressionAffinity: 1, complexityAffinity: 3, emotionAffinity: 3, psychedelicAffinity: 5, conceptAffinity: 4, rarityBonus: 4,
  },
  {
    id: 'venue-observatory', name: 'The Observatory', capacity: 1200,
    description: 'The Observatory rewards thoughtful and concept-heavy performances. Complexity and intellectual depth are prized above all else.',
    atmosphereAffinity: 3, aggressionAffinity: 1, complexityAffinity: 5, emotionAffinity: 2, psychedelicAffinity: 3, conceptAffinity: 5, rarityBonus: 3,
  },
  {
    id: 'venue-crystal-stage', name: 'The Crystal Stage', capacity: 4000,
    description: 'The Crystal Stage amplifies rare and legendary material. The rarer the setlist, the more brilliantly it resonates here.',
    atmosphereAffinity: 3, aggressionAffinity: 2, complexityAffinity: 3, emotionAffinity: 4, psychedelicAffinity: 3, conceptAffinity: 3, rarityBonus: 10,
  },
  {
    id: 'venue-parallax-amphitheatre', name: 'The Parallax Amphitheatre', capacity: 8000,
    description: 'The Parallax Amphitheatre celebrates momentum and flow. Concerts with consistent energy and strong transitions are rewarded here.',
    atmosphereAffinity: 3, aggressionAffinity: 3, complexityAffinity: 2, emotionAffinity: 3, psychedelicAffinity: 3, conceptAffinity: 2, rarityBonus: 2,
  },
];

const VENUE_MAP = new Map(VENUE_CATALOG.map((v) => [v.id, v]));

let venuesSeeded = false;
async function ensureVenuesSeeded(): Promise<void> {
  if (venuesSeeded) return;
  await Promise.all(
    VENUE_CATALOG.map((v) =>
      prisma.bandRpgVenue.upsert({ where: { id: v.id }, update: {}, create: v }),
    ),
  );
  venuesSeeded = true;
}

function computeVenueFit(
  venue: VenueCatalogEntry,
  avgs: { aggression: number | null; atmosphere: number | null; emotion: number | null; complexity: number | null; psychedelic: number | null; concept: number | null },
  rarityValue: number,
): number {
  const axes: Array<{ value: number | null; affinity: number }> = [
    { value: avgs.aggression,  affinity: venue.aggressionAffinity  },
    { value: avgs.atmosphere,  affinity: venue.atmosphereAffinity   },
    { value: avgs.emotion,     affinity: venue.emotionAffinity      },
    { value: avgs.complexity,  affinity: venue.complexityAffinity   },
    { value: avgs.psychedelic, affinity: venue.psychedelicAffinity  },
    { value: avgs.concept,     affinity: venue.conceptAffinity      },
  ];
  const scored = axes.filter((a): a is { value: number; affinity: number } => a.value !== null);

  let spectrumFit: number;
  if (scored.length === 0) {
    spectrumFit = 40;
  } else {
    let totalWeight = 0, totalScore = 0;
    for (const { value, affinity } of scored) {
      const alignment = 1 - Math.abs(value / 5 - affinity / 5);
      totalScore  += alignment * affinity;
      totalWeight += affinity;
    }
    spectrumFit = totalWeight > 0 ? (totalScore / totalWeight) * 80 : 40;
  }

  // rarityBonus 2–10; Crystal Stage (10) gives big bonus to rare-heavy setlists
  const rarityFit = Math.min(20, Math.round(rarityValue / 150 * 20 * (venue.rarityBonus / 5)));
  return Math.min(100, Math.round(spectrumFit + rarityFit));
}

function venueFitLabel(score: number): string {
  if (score >= 80) return 'Legendary Fit';
  if (score >= 60) return 'Excellent Fit';
  if (score >= 40) return 'Good Fit';
  return 'Poor Fit';
}

// ── Setlist intelligence helpers ──────────────────────────────────────────────

const RARITY_FAN_PTS: Record<string, number>  = { Common: 3, Uncommon: 2 };
const RARITY_DEEP_PTS: Record<string, number> = { Rare: 2, Legendary: 3, Mythic: 5 };

function computeFanServiceScore(songs: Array<{ rarity: string }>): number {
  if (songs.length === 0) return 0;
  const pts = songs.reduce((s, x) => s + (RARITY_FAN_PTS[x.rarity] ?? 0), 0);
  return Math.min(100, Math.round((pts / (songs.length * 3)) * 100));
}

function computeDeepCutScore(songs: Array<{ rarity: string }>): number {
  if (songs.length === 0) return 0;
  const pts = songs.reduce((s, x) => s + (RARITY_DEEP_PTS[x.rarity] ?? 0), 0);
  return Math.min(100, Math.round((pts / (songs.length * 5)) * 100));
}

const AXIS_PERSONALITY: Record<string, string> = {
  aggression:  'The Assault',
  atmosphere:  'The Dreamscape',
  emotion:     'The Catharsis',
  complexity:  'The Labyrinth',
  psychedelic: 'The Ritual',
  concept:     'The Manifesto',
};

function computeConcertPersonality(avgs: {
  aggression: number | null; atmosphere: number | null; emotion: number | null;
  complexity: number | null; psychedelic: number | null; concept: number | null;
}): string {
  const entries = (Object.entries(avgs) as [string, number | null][])
    .filter((e): e is [string, number] => e[1] !== null)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return 'The Unknown';
  const [topAxis, topVal] = entries[0]!;
  const secondVal = entries[1]?.[1] ?? 0;

  if (topVal < 2.5) return 'The Expedition';
  if (topVal >= 3.0 && (topVal - secondVal) < 0.3) return 'The Convergence';
  return AXIS_PERSONALITY[topAxis] ?? 'The Expedition';
}

interface SongRef { songId: string; songTitle: string; rarity: string; position: number }

function findLegendTrack(songs: SongRef[]): SongRef | null {
  if (songs.length === 0) return null;
  return songs.reduce((best, s) => (RARITY_VALUE[s.rarity] ?? 0) > (RARITY_VALUE[best.rarity] ?? 0) ? s : best);
}

function findDeepCutSong(songs: SongRef[]): SongRef | null {
  const eligible = songs.filter((s) => s.position > 0 && (RARITY_VALUE[s.rarity] ?? 0) >= 4);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, s) => (RARITY_VALUE[s.rarity] ?? 0) > (RARITY_VALUE[best.rarity] ?? 0) ? s : best);
}

function findMostFamiliar(songs: SongRef[]): SongRef | null {
  const commons = songs.filter((s) => s.rarity === 'Common');
  if (commons.length > 0) return commons[Math.floor(commons.length / 2)]!;
  const uncommons = songs.filter((s) => s.rarity === 'Uncommon');
  return uncommons[0] ?? null;
}

const PERSONALITY_STORY: Record<string, (b: string, n: number, a: number, op: string, cl: string) => string> = {
  'The Assault':     (b, n, a, op, cl) => `${b} bring the fire across ${n} songs and ${a} album${a !== 1 ? 's' : ''}. From the opening salvo of "${op}" to the final blow of "${cl}", this concert hits hard and never yields.`,
  'The Dreamscape':  (b, n, a, op, cl) => `${b} craft an immersive journey through ${n} songs from ${a} album${a !== 1 ? 's' : ''}. "${op}" opens the gates and "${cl}" lets the dream dissolve — a concert that lives in atmosphere.`,
  'The Catharsis':   (b, n, a, op, cl) => `${b} turn emotion into architecture across ${n} songs and ${a} album${a !== 1 ? 's' : ''}. "${op}" breaks the surface and "${cl}" carries the weight home — a concert built for feeling.`,
  'The Labyrinth':   (b, n, a, op, cl) => `${b} construct a web of complexity across ${n} songs from ${a} album${a !== 1 ? 's' : ''}. "${op}" opens the maze and "${cl}" seals it — a concert that demands full attention.`,
  'The Ritual':      (b, n, a, op, cl) => `${b} perform a ceremony: ${n} songs drawn from ${a} album${a !== 1 ? 's' : ''}. "${op}" begins the invocation. "${cl}" closes the circle. This concert does not entertain — it transforms.`,
  'The Manifesto':   (b, n, a, op, cl) => `${b} make a statement in ${n} songs across ${a} album${a !== 1 ? 's' : ''}. "${op}" announces the intent. "${cl}" seals it. A concert with something to say.`,
  'The Convergence': (b, n, a, op, cl) => `${b} defy easy classification across ${n} songs from ${a} album${a !== 1 ? 's' : ''}. Multiple dimensions converge — "${op}" sets the stage and "${cl}" refuses to resolve the tension.`,
  'The Expedition':  (b, n, a, op, cl) => `${b} span ${n} songs from ${a} album${a !== 1 ? 's' : ''} in a survey of range and breadth. "${op}" starts the journey. "${cl}" marks the furthest point reached.`,
  'The Unknown':     (b, n, a, op, cl) => `${b} stage ${n} songs from ${a} album${a !== 1 ? 's' : ''}. "${op}" opens and "${cl}" closes — a concert whose character remains to be discovered.`,
};

function generateSetlistStory(
  personality: string, bandName: string, songCount: number,
  albumCount: number, opener: string, closer: string,
): string {
  const fn = PERSONALITY_STORY[personality] ?? PERSONALITY_STORY['The Unknown']!;
  return fn(bandName, songCount, albumCount, opener || 'the first song', closer || 'the last song');
}

// ── GET /venues ───────────────────────────────────────────────────────────────

bandRpgRouter.get('/venues', async (_req, res, next): Promise<void> => {
  try {
    await ensureVenuesSeeded();
    res.json(VENUE_CATALOG);
  } catch (e) { next(e); }
});

// ── Concert helpers ───────────────────────────────────────────────────────────

const OPENER_RARITY_SCORE: Record<string, number> = {
  Common: 2, Uncommon: 3, Rare: 5, Legendary: 7, Mythic: 9,
};

function computeFlowScore(aggressionValues: number[]): number {
  if (aggressionValues.length < 2) return 10;
  let totalDelta = 0;
  for (let i = 1; i < aggressionValues.length; i++) {
    totalDelta += Math.abs((aggressionValues[i] ?? 0) - (aggressionValues[i - 1] ?? 0));
  }
  return Math.max(0, Math.floor(20 * (1 - totalDelta / (aggressionValues.length - 1) / 5)));
}

function openerLabel(rarity: string, aggression: number | null): string {
  const score = OPENER_RARITY_SCORE[rarity] ?? 2;
  const energetic = (aggression ?? 0) >= 3.5;
  if (score >= 7 && energetic) return 'Electrifying Opener';
  if (score >= 7)              return 'Commanding Entry';
  if (score >= 5 && energetic) return 'High-Energy Start';
  if (score >= 5)              return 'Bold Entry';
  if (score >= 3)              return 'Measured Start';
  return 'Quiet Open';
}

function closerLabel(rarity: string, emotion: number | null): string {
  const score = OPENER_RARITY_SCORE[rarity] ?? 2;
  const emotional = (emotion ?? 0) >= 3.5;
  if (score >= 7 && emotional) return 'Legendary Closer';
  if (score >= 7)              return 'Epic Finale';
  if (score >= 5 && emotional) return 'Emotional Send-Off';
  if (score >= 5)              return 'Powerful Close';
  if (score >= 3)              return 'Solid Closer';
  return 'Gentle End';
}

// ── GET /concerts ─────────────────────────────────────────────────────────────

bandRpgRouter.get('/concerts', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    await ensureVenuesSeeded();

    const concerts = await prisma.bandRpgConcert.findMany({
      where: { userId },
      include: { setlist: { include: { songs: { orderBy: { position: 'asc' } } } }, venue: true },
      orderBy: { createdAt: 'desc' },
    });

    if (concerts.length === 0) { res.json([]); return; }

    // Batch axis scores + album lookups across all concerts
    const allSongIds = [...new Set(concerts.flatMap((c) => c.setlist.songs.map((s) => s.songId)))];

    const [axisRows, songAlbumRows] = await Promise.all([
      allSongIds.length > 0
        ? prisma.songAxisScore.findMany({
            where: { songId: { in: allSongIds } },
            select: { songId: true, aggression: true, atmosphere: true, emotion: true, complexity: true, psychedelic: true, concept: true },
          })
        : [],
      allSongIds.length > 0
        ? prisma.song.findMany({
            where: { id: { in: allSongIds }, albumId: { not: null } },
            select: { id: true, albumId: true },
          })
        : [],
    ]);

    const axisMap     = new Map(axisRows.map((r) => [r.songId, r]));
    const songAlbumMap = new Map(songAlbumRows.map((r) => [r.id, r.albumId as string]));

    res.json(concerts.map((concert) => {
      const songs          = concert.setlist.songs;
      const rarityValue    = songs.reduce((s, x) => s + (RARITY_VALUE[x.rarity] ?? 1), 0);
      const albumCount     = new Set(songs.map((s) => songAlbumMap.get(s.songId)).filter((id): id is string => !!id)).size;
      const diversityBonus = computeDiversityBonus(albumCount, songs.length, rarityValue);

      const scoredRows     = songs.map((s) => axisMap.get(s.songId)).filter((r): r is NonNullable<typeof r> => r !== undefined);
      const getAvg = (field: 'aggression' | 'atmosphere' | 'emotion' | 'complexity' | 'psychedelic' | 'concept') =>
        scoredRows.length > 0 ? scoredRows.reduce((a, r) => a + r[field], 0) / scoredRows.length : null;
      const avgs = {
        aggression: getAvg('aggression'), atmosphere: getAvg('atmosphere'), emotion: getAvg('emotion'),
        complexity: getAvg('complexity'), psychedelic: getAvg('psychedelic'), concept: getAvg('concept'),
      };

      const aggrValues   = scoredRows.map((r) => r.aggression);
      const flowScore    = computeFlowScore(aggrValues);

      const firstSong    = songs[0];
      const lastSong     = songs[songs.length - 1];
      const firstAxis    = firstSong ? axisMap.get(firstSong.songId) : undefined;
      const lastAxis     = lastSong  ? axisMap.get(lastSong.songId)  : undefined;
      const opScore      = firstSong ? Math.min(10, (OPENER_RARITY_SCORE[firstSong.rarity] ?? 2) + ((firstAxis?.aggression ?? 0) >= 3.5 ? 1 : 0)) : 0;
      const clScore      = lastSong  ? Math.min(10, (OPENER_RARITY_SCORE[lastSong.rarity]  ?? 2) + ((lastAxis?.emotion     ?? 0) >= 3.5 ? 1 : 0)) : 0;

      const venueEntry    = concert.venue ? (VENUE_MAP.get(concert.venue.id) ?? null) : null;
      const venueFit      = venueEntry ? computeVenueFit(venueEntry, avgs, rarityValue) : null;
      const venueContrib  = venueFit !== null ? Math.floor(venueFit * 0.1) : 0;
      const concertTotal  = rarityValue + diversityBonus + flowScore + opScore + clScore + venueContrib;

      const fanServiceScore    = computeFanServiceScore(songs);
      const deepCutScore       = computeDeepCutScore(songs);
      const concertPersonality = computeConcertPersonality(avgs);

      return {
        id:               concert.id,
        concertName:      concert.concertName,
        bandId:           concert.bandId,
        bandName:         concert.bandName,
        setlistId:        concert.setlistId,
        setlistName:      concert.setlist.name,
        songCount:        songs.length,
        rarityValue,
        albumCount,
        diversityBonus,
        flowScore,
        openerScore:      opScore,
        closerScore:      clScore,
        venueId:          concert.venueId  ?? null,
        venueName:        concert.venue?.name ?? null,
        venueFit,
        venueFitLabel:    venueFit !== null ? venueFitLabel(venueFit) : null,
        venueContribution: venueContrib,
        concertTotal,
        grade:            computeGrade(concertTotal),
        encorePosition:   concert.encorePosition ?? null,
        realWorldScore:   concert.realWorldScore ?? null,
        fanServiceScore,
        deepCutScore,
        concertPersonality,
        createdAt:        concert.createdAt.toISOString(),
        updatedAt:        concert.updatedAt.toISOString(),
      };
    }));
  } catch (e) { next(e); }
});

// ── POST /concerts ────────────────────────────────────────────────────────────

bandRpgRouter.post('/concerts', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const body        = req.body as Record<string, unknown>;
    const setlistId   = typeof body['setlistId']   === 'string' ? body['setlistId']            : null;
    const concertName = typeof body['concertName'] === 'string' ? body['concertName'].trim()   : null;
    const venueId     = typeof body['venueId']     === 'string' ? body['venueId']              : null;

    if (!setlistId || !concertName) {
      res.status(400).json({ error: 'setlistId and concertName are required' }); return;
    }

    const setlist = await prisma.bandRpgSetlist.findFirst({ where: { id: setlistId, userId } });
    if (!setlist) { res.status(404).json({ error: 'Setlist not found' }); return; }

    if (venueId) {
      await ensureVenuesSeeded();
      const venueExists = await prisma.bandRpgVenue.findUnique({ where: { id: venueId }, select: { id: true } });
      if (!venueExists) { res.status(400).json({ error: 'Venue not found' }); return; }
    }

    const concert = await prisma.bandRpgConcert.create({
      data: { userId, bandId: setlist.bandId, bandName: setlist.bandName, concertName, setlistId, ...(venueId ? { venueId } : {}) },
    });

    void grantXP(userId, XP_GRANTS.CONCERT_CREATED).catch(() => undefined);
    res.status(201).json({ ok: true, id: concert.id });
  } catch (e) { next(e); }
});

// ── GET /concerts/:concertId ──────────────────────────────────────────────────

bandRpgRouter.get('/concerts/:concertId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const concertId = req.params['concertId'];
    if (!concertId) { res.status(400).json({ error: 'concertId is required' }); return; }

    await ensureVenuesSeeded();

    const concert = await prisma.bandRpgConcert.findFirst({
      where: { id: concertId, userId },
      include: { setlist: { include: { songs: { orderBy: { position: 'asc' } } } }, venue: true },
    });
    if (!concert) { res.status(404).json({ error: 'Not found' }); return; }

    const songs      = concert.setlist.songs;
    const songIds    = songs.map((s) => s.songId);

    const [axisRows, songAlbumRows, liveRows] = await Promise.all([
      songIds.length > 0
        ? prisma.songAxisScore.findMany({
            where: { songId: { in: songIds } },
            select: { songId: true, aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true },
          })
        : [],
      songIds.length > 0
        ? prisma.song.findMany({
            where: { id: { in: songIds }, albumId: { not: null } },
            select: { id: true, albumId: true },
          })
        : [],
      songIds.length > 0
        ? prisma.bandRpgSongProfile.findMany({
            where: { songId: { in: songIds } },
            select: { songId: true, liveStatus: true },
          })
        : Promise.resolve([]),
    ]);

    const axisMap      = new Map(axisRows.map((r) => [r.songId, r]));
    const songAlbumMap = new Map(songAlbumRows.map((r) => [r.id, r.albumId as string]));
    const albumCount   = new Set(songAlbumRows.map((r) => r.albumId as string)).size;

    const rarityValue    = songs.reduce((s, x) => s + (RARITY_VALUE[x.rarity] ?? 1), 0);
    const diversityBonus = computeDiversityBonus(albumCount, songs.length, rarityValue);

    const aggrValues = songs.map((s) => axisMap.get(s.songId)?.aggression).filter((v): v is number => v !== undefined);
    const flowScore  = computeFlowScore(aggrValues);

    const firstSong = songs[0];
    const lastSong  = songs[songs.length - 1];
    const firstAxis = firstSong ? axisMap.get(firstSong.songId) : undefined;
    const lastAxis  = lastSong  ? axisMap.get(lastSong.songId)  : undefined;
    const opScore   = firstSong ? Math.min(10, (OPENER_RARITY_SCORE[firstSong.rarity] ?? 2) + ((firstAxis?.aggression ?? 0) >= 3.5 ? 1 : 0)) : 0;
    const clScore   = lastSong  ? Math.min(10, (OPENER_RARITY_SCORE[lastSong.rarity]  ?? 2) + ((lastAxis?.emotion     ?? 0) >= 3.5 ? 1 : 0)) : 0;

    // Spectrum averages from songs that have axis scores
    const avg = (field: 'aggression' | 'complexity' | 'atmosphere' | 'emotion' | 'psychedelic' | 'concept'): number | null => {
      const vals = axisRows.map((r) => r[field]);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const avgs = {
      aggression: avg('aggression'), atmosphere: avg('atmosphere'), emotion: avg('emotion'),
      complexity: avg('complexity'), psychedelic: avg('psychedelic'), concept: avg('concept'),
    };

    const venueEntry   = concert.venue ? (VENUE_MAP.get(concert.venue.id) ?? null) : null;
    const venueFit     = venueEntry ? computeVenueFit(venueEntry, avgs, rarityValue) : null;
    const venueContrib = venueFit !== null ? Math.floor(venueFit * 0.1) : 0;
    const concertTotal = rarityValue + diversityBonus + flowScore + opScore + clScore + venueContrib;

    const rarityBreakdown: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0, Mythic: 0 };
    for (const s of songs) { rarityBreakdown[s.rarity] = (rarityBreakdown[s.rarity] ?? 0) + 1; }

    const encorePos = concert.encorePosition ?? null;
    const mappedSongs = songs.map((s) => ({
      id:        s.id,
      songId:    s.songId,
      songTitle: s.songTitle,
      rarity:    s.rarity,
      position:  s.position,
      addedAt:   s.addedAt.toISOString(),
    }));

    // Phase V — Concert Realism (from live profiles, null if insufficient data)
    const liveStatusMap = new Map(liveRows.map((r) => [r.songId, r.liveStatus]));
    const songStatuses  = songIds.map((id) => liveStatusMap.get(id) ?? 'Unknown');
    const realismResult = computeConcertRealism(songStatuses);

    // Phase M — Setlist Intelligence
    const songRefs          = songs.map((s, idx) => ({ songId: s.songId, songTitle: s.songTitle, rarity: s.rarity, position: idx }));
    const fanServiceScore    = computeFanServiceScore(songs);
    const deepCutScore       = computeDeepCutScore(songs);
    const concertPersonality = computeConcertPersonality(avgs);
    const legendTrack        = findLegendTrack(songRefs);
    const deepCutSong        = findDeepCutSong(songRefs);
    const mostFamiliar       = findMostFamiliar(songRefs);
    const setlistStory       = generateSetlistStory(
      concertPersonality,
      concert.bandName,
      songs.length,
      albumCount,
      firstSong?.songTitle ?? '',
      lastSong?.songTitle  ?? '',
    );

    res.json({
      id:               concert.id,
      concertName:      concert.concertName,
      bandId:           concert.bandId,
      bandName:         concert.bandName,
      setlistId:        concert.setlistId,
      setlistName:      concert.setlist.name,
      songCount:        songs.length,
      rarityValue,
      albumCount,
      diversityBonus,
      flowScore,
      openerScore:      opScore,
      closerScore:      clScore,
      venueId:          concert.venueId  ?? null,
      venueName:        concert.venue?.name ?? null,
      venueFit,
      venueFitLabel:    venueFit !== null ? venueFitLabel(venueFit) : null,
      venueContribution: venueContrib,
      concertTotal,
      grade:            computeGrade(concertTotal),
      encorePosition:   encorePos,
      realWorldScore:   concert.realWorldScore ?? null,
      avgAggression:    avgs.aggression,
      avgAtmosphere:    avgs.atmosphere,
      avgEmotion:       avgs.emotion,
      avgComplexity:    avgs.complexity,
      avgPsychedelic:   avgs.psychedelic,
      avgConcept:       avgs.concept,
      openerLabel:      firstSong ? openerLabel(firstSong.rarity, firstAxis?.aggression ?? null) : '',
      closerLabel:      lastSong  ? closerLabel(lastSong.rarity,  lastAxis?.emotion     ?? null) : '',
      venueDescription: concert.venue?.description ?? null,
      venueAffinities:  venueEntry ? {
        aggression:  venueEntry.aggressionAffinity,
        atmosphere:  venueEntry.atmosphereAffinity,
        emotion:     venueEntry.emotionAffinity,
        complexity:  venueEntry.complexityAffinity,
        psychedelic: venueEntry.psychedelicAffinity,
        concept:     venueEntry.conceptAffinity,
      } : null,
      rarityBreakdown,
      songs:           mappedSongs,
      mainSet:         encorePos !== null ? mappedSongs.slice(0, encorePos) : mappedSongs,
      encore:          encorePos !== null ? mappedSongs.slice(encorePos)    : [],
      fanServiceScore,
      deepCutScore,
      concertPersonality,
      setlistStory,
      legendTrack,
      deepCutSong,
      mostFamiliar,
      realismScore:  realismResult?.realismScore  ?? null,
      realismLabel:  realismResult?.realismLabel  ?? null,
      createdAt:       concert.createdAt.toISOString(),
      updatedAt:       concert.updatedAt.toISOString(),
    });
  } catch (e) { next(e); }
});

// ── PUT /concerts/:concertId ──────────────────────────────────────────────────

bandRpgRouter.put('/concerts/:concertId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const concertId = req.params['concertId'];
    if (!concertId) { res.status(400).json({ error: 'concertId is required' }); return; }

    const concert = await prisma.bandRpgConcert.findFirst({ where: { id: concertId, userId } });
    if (!concert) { res.status(404).json({ error: 'Not found' }); return; }

    const body        = req.body as Record<string, unknown>;
    const concertName = typeof body['concertName'] === 'string' ? body['concertName'].trim() : undefined;
    const rawEncore   = body['encorePosition'];
    const encorePosition = rawEncore === null ? null : typeof rawEncore === 'number' ? rawEncore : undefined;
    const rawVenue    = body['venueId'];
    const venueId     = rawVenue === null ? null : typeof rawVenue === 'string' ? rawVenue : undefined;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (concertName     !== undefined) updateData['concertName']    = concertName;
    if (encorePosition  !== undefined) updateData['encorePosition'] = encorePosition;
    if (venueId         !== undefined) updateData['venueId']        = venueId;

    await prisma.bandRpgConcert.update({ where: { id: concertId }, data: updateData });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── DELETE /concerts/:concertId ───────────────────────────────────────────────

bandRpgRouter.delete('/concerts/:concertId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const concertId = req.params['concertId'];
    if (!concertId) { res.status(400).json({ error: 'concertId is required' }); return; }

    const concert = await prisma.bandRpgConcert.findFirst({ where: { id: concertId, userId } });
    if (!concert) { res.status(404).json({ error: 'Not found' }); return; }

    await prisma.bandRpgConcert.delete({ where: { id: concertId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Festival helpers ──────────────────────────────────────────────────────────

const CONCERT_TO_FESTIVAL_PERSONALITY: Record<string, string> = {
  'The Assault':     'Heavy Music Celebration',
  'The Dreamscape':  'Atmospheric Summit',
  'The Catharsis':   'Emotional Journey Festival',
  'The Labyrinth':   'Progressive Gathering',
  'The Ritual':      'Psychedelic Communion',
  'The Manifesto':   'Conceptual Assembly',
  'The Convergence': 'Spectrum Showcase',
  'The Expedition':  'Discovery Festival',
  'The Unknown':     'Archive Gathering',
};

function computeFestivalPersonality(concerts: Array<{
  concertPersonality: string; fanServiceScore: number; deepCutScore: number;
}>): string {
  if (concerts.length === 0) return 'Archive Gathering';
  const counts: Record<string, number> = {};
  for (const c of concerts) counts[c.concertPersonality] = (counts[c.concertPersonality] ?? 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topP, topCount] = sorted[0]!;
  if (topCount / concerts.length >= 0.5) return CONCERT_TO_FESTIVAL_PERSONALITY[topP] ?? 'Spectrum Showcase';
  const avgDeep = concerts.reduce((s, c) => s + c.deepCutScore, 0) / concerts.length;
  if (avgDeep >= 65) return 'Deep Cut Convention';
  const avgFan  = concerts.reduce((s, c) => s + c.fanServiceScore, 0) / concerts.length;
  if (avgFan >= 70) return 'Legendary Archive Festival';
  return 'Spectrum Showcase';
}

const FESTIVAL_STORIES: Record<string, (b: number, s: number, c: number) => string> = {
  'Heavy Music Celebration':    (b, s, c) => `A festival built for impact — ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, and ${s} songs that hit hard from first note to last. This lineup does not relent.`,
  'Atmospheric Summit':         (b, s, c) => `${c} performance${c !== 1 ? 's' : ''} across ${b} band${b !== 1 ? 's' : ''}, united by atmosphere and immersion. ${s} songs that breathe, build, and dissolve — a festival that lives in the space between the notes.`,
  'Emotional Journey Festival': (b, s, c) => `${b} band${b !== 1 ? 's' : ''}, ${c} concert${c !== 1 ? 's' : ''}, ${s} songs — and every one of them means something. This festival was not assembled for spectacle. It was assembled to be felt.`,
  'Progressive Gathering':      (b, s, c) => `A gathering for those who listen carefully. ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, and ${s} songs built on complexity, patience, and architecture.`,
  'Psychedelic Communion':      (b, s, c) => `${c} ritual${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, ${s} songs. This festival does not ask for passive listening — it asks for surrender.`,
  'Conceptual Assembly':        (b, s, c) => `${b} band${b !== 1 ? 's' : ''} with something to say — assembled across ${c} concert${c !== 1 ? 's' : ''} and ${s} songs. Each performance is an argument. The festival is the conclusion.`,
  'Spectrum Showcase':          (b, s, c) => `A festival of range: ${b} band${b !== 1 ? 's' : ''}, ${c} concert${c !== 1 ? 's' : ''}, ${s} songs, and no singular direction. This is not a genre festival. This is a celebration of what music can become.`,
  'Discovery Festival':         (b, s, c) => `The journey is the point. ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, and ${s} songs — arranged not for spectacle, but for exploration.`,
  'Deep Cut Convention':        (b, s, c) => `This festival rewards the patient fan. ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, and ${s} songs — leaning heavily on rare material that casual audiences have never encountered.`,
  'Legendary Archive Festival': (b, s, c) => `A celebration for the devoted. ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, ${s} songs — curated to deliver the songs fans know and love, elevated to something extraordinary.`,
  'Archive Gathering':          (b, s, c) => `${c} concert${c !== 1 ? 's' : ''} assembled from ${b} band${b !== 1 ? 's' : ''} across ${s} songs. A festival taking shape — its identity still revealing itself.`,
};

function generateFestivalStory(personality: string, bandCount: number, songCount: number, concertCount: number): string {
  const fn = FESTIVAL_STORIES[personality] ?? FESTIVAL_STORIES['Archive Gathering']!;
  return fn(bandCount, songCount, concertCount);
}

// ── Festival Chemistry — Phase P ──────────────────────────────────────────────
// Rule-based, no AI. Computes 6 sub-scores → weighted composite 0-100.

interface BandAudienceProfileData {
  progressive: number; heavy: number; technical: number;
  atmospheric: number; experimental: number; accessible: number;
  psychedelic: number; emotional: number; aggressive: number;
  improvisational: number;
}

export interface FestivalChemistryResult {
  chemistryScore: number;          // 0-100 weighted composite
  chemistryLabel: string;
  chemistryReport: string;
  audienceOverlap: number | null;  // null when no BandAudienceProfile rows exist
  personalityCompatibility: number;
  festivalFlow: number;
  venueCompatibility: number | null;
  fanServiceBalance: number;
  deepCutBalance: number;
  hasAudienceData: boolean;
}

const AUD_DIMS = [
  'progressive','heavy','technical','atmospheric','experimental',
  'accessible','psychedelic','emotional','aggressive','improvisational',
] as const;
type AudDim = typeof AUD_DIMS[number];

// Personality family — drives compatibility pairwise scoring
const PERS_FAMILY: Record<string, string> = {
  'The Dreamscape': 'atmospheric', 'The Ritual': 'atmospheric', 'The Expedition': 'atmospheric',
  'The Assault': 'intense',       'The Manifesto': 'intense',
  'The Labyrinth': 'cerebral',    'The Catharsis': 'cerebral',
  'The Convergence': 'bridge',
};

function personalityCompatPair(a: string, b: string): number {
  if (a === b) return 70;
  const fa = PERS_FAMILY[a] ?? 'unknown';
  const fb = PERS_FAMILY[b] ?? 'unknown';
  if (fa === 'bridge' || fb === 'bridge') return 75;
  if (fa === 'unknown' || fb === 'unknown') return 55;
  if (fa === fb) return 80;
  if ((fa === 'atmospheric' && fb === 'intense') || (fa === 'intense' && fb === 'atmospheric')) return 40;
  if ((fa === 'atmospheric' && fb === 'cerebral') || (fa === 'cerebral' && fb === 'atmospheric')) return 72;
  if ((fa === 'intense' && fb === 'cerebral') || (fa === 'cerebral' && fb === 'intense')) return 65;
  return 55;
}

function computePersonalityCompatibility(personalities: string[]): number {
  if (personalities.length <= 1) return 80;
  let total = 0, pairs = 0;
  for (let i = 0; i < personalities.length; i++) {
    for (let j = i + 1; j < personalities.length; j++) {
      total += personalityCompatPair(personalities[i]!, personalities[j]!);
      pairs++;
    }
  }
  return pairs > 0 ? Math.round(total / pairs) : 80;
}

function computeAudienceOverlap(profiles: BandAudienceProfileData[]): number | null {
  if (profiles.length === 0) return null;
  if (profiles.length === 1) return 80;
  const stdDevs: number[] = [];
  for (const dim of AUD_DIMS) {
    const vals = profiles.map((p) => p[dim as AudDim]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    stdDevs.push(Math.sqrt(variance));
  }
  const avgStdDev = stdDevs.reduce((s, v) => s + v, 0) / stdDevs.length;
  return Math.max(0, Math.round(100 - avgStdDev * 1.5));
}

function computeFestivalFlowScore(
  orderedPersonalities: string[],
  orderedProfiles: Array<BandAudienceProfileData | undefined>,
): number {
  if (orderedPersonalities.length <= 1) return 80;

  // Consecutive pair personality compatibility (base flow)
  let baseTotal = 0;
  for (let i = 0; i < orderedPersonalities.length - 1; i++) {
    baseTotal += personalityCompatPair(orderedPersonalities[i]!, orderedPersonalities[i + 1]!);
  }
  const baseFlow = baseTotal / (orderedPersonalities.length - 1);

  // Dimensional analysis (when profiles are available)
  const validProfiles = orderedProfiles.filter((p): p is BandAudienceProfileData => p !== undefined);
  if (validProfiles.length < 2) return Math.round(baseFlow);

  // Dimensional smoothness: penalise large jumps between consecutive bands
  let dimSmoothTotal = 0;
  for (let i = 0; i < validProfiles.length - 1; i++) {
    const a = validProfiles[i]!;
    const b = validProfiles[i + 1]!;
    const avgChange = AUD_DIMS.reduce((s, d) => s + Math.abs(a[d as AudDim] - b[d as AudDim]), 0) / AUD_DIMS.length;
    dimSmoothTotal += Math.max(0, 100 - avgChange * 1.5);
  }
  const dimSmooth = dimSmoothTotal / (validProfiles.length - 1);

  // Energy progression: heavy+aggressive+progressive should build toward the headliner
  const energies = validProfiles.map((p) => (p.heavy + p.aggressive + p.progressive) / 3);
  const mid = Math.max(1, Math.floor(energies.length / 2));
  const firstHalf  = energies.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
  const secondHalf = energies.slice(mid).reduce((s, v) => s + v, 0) / Math.max(1, energies.length - mid);

  let progressionScore: number;
  if (secondHalf > firstHalf + 15)           progressionScore = 90;
  else if (secondHalf > firstHalf + 5)       progressionScore = 75;
  else if (Math.abs(secondHalf - firstHalf) <= 5) progressionScore = 62;
  else                                       progressionScore = 40;

  return Math.max(0, Math.round(baseFlow * 0.40 + dimSmooth * 0.30 + progressionScore * 0.30));
}

function computeChemistryTotal(params: {
  audienceOverlap: number | null;
  personalityCompatibility: number;
  festivalFlow: number;
  venueCompatibility: number | null;
  fanServiceBalance: number;
  deepCutBalance: number;
}): number {
  const entries: Array<[number, number]> = [];
  if (params.audienceOverlap !== null)   entries.push([params.audienceOverlap, 25]);
  entries.push([params.personalityCompatibility, 20]);
  entries.push([params.festivalFlow, 20]);
  if (params.venueCompatibility !== null) entries.push([params.venueCompatibility, 15]);
  entries.push([params.fanServiceBalance, 10]);
  entries.push([params.deepCutBalance, 10]);
  const totalW  = entries.reduce((s, [, w]) => s + w, 0);
  const weightedSum = entries.reduce((s, [v, w]) => s + v * w, 0);
  return Math.round(weightedSum / totalW);
}

function computeChemistryLabel(
  score: number,
  audienceOverlap: number | null,
  dominantPersonality: string,
  avgFanService: number,
  avgDeepCuts: number,
): string {
  if (score >= 88) return (audienceOverlap !== null && audienceOverlap >= 72) ? 'Legendary Combination' : 'Perfect Match';
  if (score >= 75) {
    const fam = PERS_FAMILY[dominantPersonality] ?? 'unknown';
    if (fam === 'atmospheric')  return 'Atmospheric Journey';
    if (fam === 'intense')      return 'Heavy Onslaught';
    if (dominantPersonality === 'The Ritual')    return 'Ritual Experience';
    if (dominantPersonality === 'The Catharsis') return 'Cathartic Journey';
    if (fam === 'cerebral')     return 'Progressive Gathering';
    return 'Strong Alignment';
  }
  if (score >= 60) {
    if (avgFanService >= 65) return 'Fan Favourite Festival';
    if (avgDeepCuts   >= 60) return 'Deep Cut Convention';
    return 'Solid Festival';
  }
  if (score >= 45) return 'Eclectic Experience';
  if (score >= 30) return 'Wild Experiment';
  return 'Chaotic Lineup';
}

function generateChemistryReport(label: string, bandCount: number, concertCount: number): string {
  const c = concertCount, b = bandCount;
  const acts  = `${c} act${c !== 1 ? 's' : ''}`;
  const bands = `${b} band${b !== 1 ? 's' : ''}`;
  const REPORTS: Record<string, string> = {
    'Legendary Combination':  `A rare convergence — ${acts} across ${bands} whose musical identities align almost perfectly. This lineup does not merely work; it resonates at every dimension, from sound to audience to flow.`,
    'Perfect Match':          `Every element aligns across ${acts}. Personality, flow, and balance combine to create a festival that feels curated rather than assembled — a lineup with intention behind every slot.`,
    'Atmospheric Journey':    `The atmospheric thread running through these ${acts} creates a festival of sustained immersion. ${bands} united by mood and texture, building a world the audience can step inside and stay.`,
    'Heavy Onslaught':        `${acts} built for maximum impact. The intensity across ${bands} is consistent and cumulative — a festival that does not ask for passive listening, it demands full surrender.`,
    'Progressive Gathering':  `Complexity and craft define this ${acts} lineup. These ${bands} reward patience and punish distraction. A festival that grows in the memory long after the last note.`,
    'Ritual Experience':      `A festival that transcends entertainment. The ${acts} across ${bands} share a ceremonial quality — performances that become collective rituals rather than individual concerts.`,
    'Cathartic Journey':      `Emotion is the connective tissue across these ${acts}. The ${bands} build tension and release it, then build it again — a lineup designed for emotional impact at scale.`,
    'Strong Alignment':       `Strong personality compatibility across ${acts}. These ${bands} share enough musical DNA to feel intentional, with enough variety to avoid predictability — a festival with a clear identity.`,
    'Fan Favourite Festival': `Heavy on familiar material, this ${acts} lineup services its audience faithfully. The ${bands} deliver what fans came for — crowd-pleasing setlists that reward the converted.`,
    'Deep Cut Convention':    `For the devoted only. These ${acts} across ${bands} lean into rare and deep material that casual audiences will not recognise — and hardcore fans will never forget.`,
    'Solid Festival':         `A well-constructed ${acts} lineup across ${bands}. No single dimension dominates — this festival works because it balances its ambitions rather than chasing a single vision.`,
    'Eclectic Experience':    `The range is the point. These ${acts} across ${bands} resist a single label — expect surprise, contrast, and an experience that refuses to settle into one identity.`,
    'Wild Experiment':        `Bold choices across ${acts} from ${bands}. Some combinations here were not expected to work. Whether they do is left to the audience — but the ambition is undeniable.`,
    'Chaotic Lineup':         `A festival that challenges coherence itself. These ${acts} across ${bands} share little in common musically. The result may be exhilarating, exhausting, or both — but predictable it is not.`,
  };
  return REPORTS[label] ?? `A ${acts} festival across ${bands}.`;
}

function computeFestivalChemistry(
  sortedConcerts: Array<{
    bandId: string; concertPersonality: string;
    fanServiceScore: number; deepCutScore: number; venueFit: number | null;
  }>,
  bandProfileMap: Map<string, BandAudienceProfileData>,
  festivalPersonality: string,
  avgFanService: number,
  avgDeepCuts: number,
): FestivalChemistryResult {
  if (sortedConcerts.length === 0) {
    return {
      chemistryScore: 0, chemistryLabel: 'Chaotic Lineup',
      chemistryReport: 'No concerts in this festival yet.',
      audienceOverlap: null, personalityCompatibility: 0, festivalFlow: 0,
      venueCompatibility: null, fanServiceBalance: 0, deepCutBalance: 0, hasAudienceData: false,
    };
  }

  const personalities     = sortedConcerts.map((c) => c.concertPersonality);
  const uniqueBandIds     = [...new Set(sortedConcerts.map((c) => c.bandId))];
  const uniqueProfiles    = uniqueBandIds.map((id) => bandProfileMap.get(id)).filter((p): p is BandAudienceProfileData => p !== undefined);
  const orderedProfiles   = sortedConcerts.map((c) => bandProfileMap.get(c.bandId));

  const audienceOverlap          = computeAudienceOverlap(uniqueProfiles);
  const personalityCompatibility = computePersonalityCompatibility(personalities);
  const festivalFlow             = computeFestivalFlowScore(personalities, orderedProfiles);

  const venueFits        = sortedConcerts.map((c) => c.venueFit).filter((v): v is number => v !== null);
  const venueCompatibility = venueFits.length > 0
    ? Math.round(venueFits.reduce((s, v) => s + v, 0) / venueFits.length)
    : null;

  const fanServiceBalance = Math.max(0, Math.round(100 - Math.abs(avgFanService - 55) * 2));
  const deepCutBalance    = Math.max(0, Math.round(100 - Math.abs(avgDeepCuts   - 45) * 2));

  const chemistryScore  = computeChemistryTotal({ audienceOverlap, personalityCompatibility, festivalFlow, venueCompatibility, fanServiceBalance, deepCutBalance });
  const chemistryLabel  = computeChemistryLabel(chemistryScore, audienceOverlap, festivalPersonality, avgFanService, avgDeepCuts);
  const chemistryReport = generateChemistryReport(chemistryLabel, uniqueBandIds.length, sortedConcerts.length);

  return {
    chemistryScore, chemistryLabel, chemistryReport,
    audienceOverlap, personalityCompatibility, festivalFlow,
    venueCompatibility, fanServiceBalance, deepCutBalance,
    hasAudienceData: uniqueProfiles.length > 0,
  };
}

// Shared per-concert computation used by both festival list and detail endpoints.
// Takes pre-fetched concert data + shared lookups; returns derived metrics.
function deriveConcertMetrics(
  concert: {
    id: string; bandId: string; bandName: string; concertName: string; venueId: string | null;
    venue: { id: string; name: string; description: string } | null;
    setlist: { songs: Array<{ songId: string; songTitle: string; rarity: string; position: number }> };
  },
  axisMap: Map<string, { aggression: number; atmosphere: number; emotion: number; complexity: number; psychedelic: number; concept: number }>,
  songAlbumMap: Map<string, string>,
) {
  const songs       = concert.setlist.songs;
  const rarityValue = songs.reduce((s, x) => s + (RARITY_VALUE[x.rarity] ?? 1), 0);
  const albumCount  = new Set(songs.map((s) => songAlbumMap.get(s.songId)).filter((id): id is string => !!id)).size;
  const diversityBonus = computeDiversityBonus(albumCount, songs.length, rarityValue);

  const scoredRows = songs.map((s) => axisMap.get(s.songId)).filter((r): r is NonNullable<typeof r> => r !== undefined);
  const getAvg = (f: 'aggression' | 'atmosphere' | 'emotion' | 'complexity' | 'psychedelic' | 'concept') =>
    scoredRows.length > 0 ? scoredRows.reduce((a, r) => a + r[f], 0) / scoredRows.length : null;
  const avgs = {
    aggression:  getAvg('aggression'),  atmosphere:  getAvg('atmosphere'),
    emotion:     getAvg('emotion'),     complexity:  getAvg('complexity'),
    psychedelic: getAvg('psychedelic'), concept:     getAvg('concept'),
  };

  const aggrValues = scoredRows.map((r) => r.aggression);
  const flowScore  = computeFlowScore(aggrValues);

  const firstSong = songs[0];
  const lastSong  = songs[songs.length - 1];
  const firstAxis = firstSong ? axisMap.get(firstSong.songId) : undefined;
  const lastAxis  = lastSong  ? axisMap.get(lastSong.songId)  : undefined;
  const opScore   = firstSong ? Math.min(10, (OPENER_RARITY_SCORE[firstSong.rarity] ?? 2) + ((firstAxis?.aggression ?? 0) >= 3.5 ? 1 : 0)) : 0;
  const clScore   = lastSong  ? Math.min(10, (OPENER_RARITY_SCORE[lastSong.rarity]  ?? 2) + ((lastAxis?.emotion     ?? 0) >= 3.5 ? 1 : 0)) : 0;

  const venueEntry    = concert.venue ? (VENUE_MAP.get(concert.venue.id) ?? null) : null;
  const venueFit      = venueEntry ? computeVenueFit(venueEntry, avgs, rarityValue) : null;
  const venueContrib  = venueFit !== null ? Math.floor(venueFit * 0.1) : 0;
  const concertTotal  = rarityValue + diversityBonus + flowScore + opScore + clScore + venueContrib;

  return {
    songCount:          songs.length,
    rarityValue,
    albumCount,
    diversityBonus,
    flowScore,
    concertTotal,
    grade:              computeGrade(concertTotal),
    venueFit,
    venueFitLabel:      venueFit !== null ? venueFitLabel(venueFit) : null,
    venueName:          concert.venue?.name ?? null,
    fanServiceScore:    computeFanServiceScore(songs),
    deepCutScore:       computeDeepCutScore(songs),
    concertPersonality: computeConcertPersonality(avgs),
    openerScore:        opScore,
    closerScore:        clScore,
  };
}

// ── Phase R: Lineup Roles & Headliner Analysis ──────────────────────────────

type LineupRole = 'Opening Act' | 'Support Act' | 'Featured Act' | 'Co-Headliner' | 'Headliner';

const GRADE_SCORE: Record<string, number> = { S: 97, A: 82, B: 67, C: 52, D: 37, F: 15 };

function assignLineupRole(position: number, total: number): LineupRole {
  if (total <= 1) return 'Headliner';
  if (position === 0) return 'Opening Act';
  if (position === total - 1) return 'Headliner';
  if (total >= 4 && position === total - 2) return 'Co-Headliner';
  if (position === 1) return 'Support Act';
  return 'Featured Act';
}

const HEADLINER_PERS_BONUS = new Set(['The Assault', 'The Catharsis', 'The Manifesto', 'The Labyrinth', 'The Convergence']);
const OPENER_PERS_BONUS    = new Set(['The Dreamscape', 'The Expedition', 'The Assault', 'The Ritual', 'The Convergence']);

function computeHeadlinerStrength(m: {
  grade: string; venueFit: number | null;
  fanServiceScore: number; deepCutScore: number; concertPersonality: string;
}): number {
  const g = GRADE_SCORE[m.grade] ?? 37;
  const v = m.venueFit ?? 55;
  const p = HEADLINER_PERS_BONUS.has(m.concertPersonality) ? 8 : 0;
  return Math.min(100, Math.max(0, Math.round(g * 0.40 + v * 0.20 + m.fanServiceScore * 0.25 + m.deepCutScore * 0.15) + p));
}

function computeOpenerStrength(m: {
  grade: string; fanServiceScore: number; flowScore: number; concertPersonality: string;
}): number {
  const g = GRADE_SCORE[m.grade] ?? 37;
  const f = Math.min(100, (m.flowScore / 20) * 100);
  const p = OPENER_PERS_BONUS.has(m.concertPersonality) ? 10 : 0;
  return Math.min(100, Math.max(0, Math.round(g * 0.30 + m.fanServiceScore * 0.45 + f * 0.25) + p));
}

const LINEUP_INTENSITY: Record<string, number> = {
  'The Expedition': 30, 'The Dreamscape': 40, 'The Ritual': 50, 'The Unknown': 50,
  'The Catharsis': 65, 'The Labyrinth': 70, 'The Convergence': 75,
  'The Manifesto': 85, 'The Assault': 95,
};

function computeFlowRating(concerts: Array<{
  concertTotal: number; concertPersonality: string; headlinerStrength: number;
}>): number {
  const n = concerts.length;
  if (n === 0) return 0;
  if (n === 1) return 70;

  const half      = Math.floor(n / 2);
  const fhAvg     = concerts.slice(0, half).reduce((s, c) => s + c.concertTotal, 0) / half;
  const shAvg     = concerts.slice(half).reduce((s, c) => s + c.concertTotal, 0) / (n - half);
  const buildScore = shAvg >= fhAvg ? 100 : Math.max(0, 100 - (fhAvg - shAvg) * 0.8);

  const lastHS  = concerts[n - 1]!.headlinerStrength;
  const maxHS   = Math.max(...concerts.map((c) => c.headlinerStrength));
  const hlScore = maxHS > 0 ? Math.round((lastHS / maxHS) * 100) : 50;

  let escalations = 0;
  for (let i = 1; i < n; i++) {
    const prev = LINEUP_INTENSITY[concerts[i - 1]!.concertPersonality] ?? 50;
    const curr = LINEUP_INTENSITY[concerts[i]!.concertPersonality] ?? 50;
    if (curr >= prev) escalations++;
  }
  const escalScore = Math.round((escalations / (n - 1)) * 100);

  let noDropScore = 80;
  if (n >= 3) {
    const pen   = concerts[n - 2]!.concertTotal;
    const fin   = concerts[n - 1]!.concertTotal;
    const ratio = fin > 0 ? pen / fin : 1;
    noDropScore = ratio >= 0.70 ? 100 : Math.max(20, Math.round(ratio * 100 + 30));
  }

  return Math.min(100, Math.round(buildScore * 0.40 + hlScore * 0.30 + escalScore * 0.20 + noDropScore * 0.10));
}

const OPENER_LABELS: Record<string, string> = {
  'The Dreamscape': 'Dream Weaver',    'The Expedition': 'Ignition Point',
  'The Assault':    'Crowd Igniter',   'The Ritual':     'Ceremony Opener',
  'The Catharsis':  'Emotional Spark', 'The Labyrinth':  'Early Favourite',
  'The Convergence':'Crowd Warmer',    'The Manifesto':  'Statement Starter',
  'The Unknown':    'Wild Card',
};
const HEADLINER_LABELS: Record<string, string> = {
  'The Assault':    'Final Assault',   'The Catharsis':  'Grand Catharsis',
  'The Manifesto':  'Final Manifesto', 'The Labyrinth':  'Closing Labyrinth',
  'The Convergence':'The Convergence', 'The Dreamscape': 'Closing Dream',
  'The Ritual':     'Closing Ritual',  'The Expedition': 'Final Expedition',
  'The Unknown':    'The Unknown Finale',
};
const SUPPORT_LABELS: Record<string, string> = {
  'The Dreamscape': 'Atmosphere Builder', 'The Expedition': 'Momentum Keeper',
  'The Assault':    'Energy Surge',       'The Ritual':     'Deep Cut Hero',
  'The Catharsis':  'Bridge Builder',     'The Labyrinth':  'Complexity Carrier',
  'The Convergence':'Crowd Connector',    'The Manifesto':  'Statement Maker',
  'The Unknown':    'Wild Card',
};
const COHEAD_LABELS: Record<string, string> = {
  'The Assault':    'Second Storm',      'The Catharsis':  'Emotional Peak',
  'The Manifesto':  'Rising Manifesto',  'The Labyrinth':  'Second Mind',
  'The Convergence':'Pre-Finale Surge',  'The Dreamscape': 'Pre-Finale Dream',
  'The Ritual':     'Pre-Finale Ritual', 'The Expedition': 'Pre-Finale Push',
  'The Unknown':    'The Other Unknown',
};

function assignRoleLabel(role: LineupRole, personality: string): string {
  if (role === 'Opening Act')  return OPENER_LABELS[personality]   ?? 'Crowd Warmer';
  if (role === 'Headliner')    return HEADLINER_LABELS[personality] ?? 'Main Event';
  if (role === 'Co-Headliner') return COHEAD_LABELS[personality]   ?? 'Co-Headliner';
  return SUPPORT_LABELS[personality] ?? 'Momentum Keeper';
}

function generateLineupQualityReport(p: {
  flowRating: number; headlinerScore: number; openerScore: number;
  headlinerName: string; headlinerIsStrongest: boolean; concertCount: number;
}): string {
  const { flowRating, headlinerScore, openerScore, headlinerName, headlinerIsStrongest, concertCount } = p;
  if (concertCount === 1) return `Solo headliner festival — ${headlinerName} carries everything.`;
  if (!headlinerIsStrongest) return `The strongest act appears before the finale — ${headlinerName} doesn't feel like the natural closer. Reorder the lineup.`;
  if (flowRating >= 85 && headlinerScore >= 80) return `Perfect escalation toward a dominant finale. ${headlinerName} earns every second of the closing slot.`;
  if (headlinerScore >= 80 && flowRating >= 70) return `${headlinerName} is a commanding headliner. The lineup builds naturally toward a powerful close.`;
  if (headlinerScore < 45) return `Weak headliner drags down the festival. The finale needs a stronger act to land with impact.`;
  if (flowRating < 45) return `Festival energy lacks direction. The lineup doesn't build momentum toward the finale.`;
  if (openerScore >= 80 && headlinerScore >= 65) return `Strong opener ignites the crowd and a worthy headliner delivers the finale. Solid night.`;
  if (openerScore >= 80) return `Explosive opener — the headliner needs to match that opening energy to stick the landing.`;
  if (flowRating >= 75 && headlinerScore >= 60) return `Excellent escalation toward a solid finale. Momentum builds throughout the night.`;
  return `A functional lineup. Reordering concerts could unlock better flow and a stronger finale.`;
}

interface LineupConcertInput {
  concertName: string; bandName: string;
  concertTotal: number; grade: string; venueFit: number | null;
  fanServiceScore: number; deepCutScore: number;
  concertPersonality: string; flowScore: number;
}

interface LineupAnalysisResult {
  flowRating: number;
  lineupReport: string;
  headlinerScore: number;
  openerScore: number;
  headlinerName: string;
  openerName: string;
  headlinerBandName: string;
  openerBandName: string;
  headlinerIsStrongest: boolean;
}

function computeLineupAnalysis(orderedConcerts: LineupConcertInput[]): {
  lineupAnalysis: LineupAnalysisResult;
  perConcert: Array<{ role: LineupRole; roleLabel: string; headlinerStrength: number; openerStrength: number }>;
} {
  const n = orderedConcerts.length;

  const perConcert = orderedConcerts.map((c, idx) => {
    const role              = assignLineupRole(idx, n);
    const headlinerStrength = computeHeadlinerStrength(c);
    const openerStrength    = computeOpenerStrength(c);
    const roleLabel         = assignRoleLabel(role, c.concertPersonality);
    return { role, roleLabel, headlinerStrength, openerStrength };
  });

  const maxHS              = n > 0 ? Math.max(...perConcert.map((c) => c.headlinerStrength)) : 0;
  const headliner          = perConcert[n - 1];
  const opener             = perConcert[0];
  const headlinerIsStrongest = headliner ? headliner.headlinerStrength >= maxHS * 0.95 : false;

  const flowRating = computeFlowRating(orderedConcerts.map((c, idx) => ({
    concertTotal:       c.concertTotal,
    concertPersonality: c.concertPersonality,
    headlinerStrength:  perConcert[idx]?.headlinerStrength ?? 0,
  })));

  const lineupReport = generateLineupQualityReport({
    flowRating,
    headlinerScore:      headliner?.headlinerStrength ?? 0,
    openerScore:         opener?.openerStrength       ?? 0,
    headlinerName:       orderedConcerts[n - 1]?.concertName ?? '',
    headlinerIsStrongest,
    concertCount:        n,
  });

  return {
    lineupAnalysis: {
      flowRating,
      lineupReport,
      headlinerScore:    headliner?.headlinerStrength ?? 0,
      openerScore:       opener?.openerStrength       ?? 0,
      headlinerName:     orderedConcerts[n - 1]?.concertName  ?? '',
      openerName:        orderedConcerts[0]?.concertName       ?? '',
      headlinerBandName: orderedConcerts[n - 1]?.bandName      ?? '',
      openerBandName:    orderedConcerts[0]?.bandName           ?? '',
      headlinerIsStrongest,
    },
    perConcert,
  };
}

// ── Phase T: Audience Archetypes ──────────────────────────────────────────────
// Rule-based, no AI. 10 archetypes scored 0-100 from band profiles + festival data.

export interface AudienceArchetype {
  key: string;
  name: string;
  icon: string;
  score: number;
  explanation: string;
}

export interface FestivalAudienceResult {
  archetypes: AudienceArchetype[];
  primaryArchetype: AudienceArchetype;
  secondaryArchetype: AudienceArchetype | null;
  audienceDiversityScore: number;
  audienceDiversityLabel: string;
  audienceReport: string;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function persBonus(festivalPersonality: string, liked: string[]): number {
  return liked.includes(festivalPersonality) ? 12 : 0;
}

function avgBandProfile(profiles: BandAudienceProfileData[]): BandAudienceProfileData {
  if (profiles.length === 0) {
    return { progressive: 0, heavy: 0, technical: 0, atmospheric: 0,
             experimental: 0, accessible: 0, psychedelic: 0, emotional: 0,
             aggressive: 0, improvisational: 0 };
  }
  const sums: Record<string, number> = {};
  for (const d of AUD_DIMS) sums[d] = 0;
  for (const p of profiles) for (const d of AUD_DIMS) sums[d]! += p[d as AudDim];
  const result: Record<string, number> = {};
  for (const d of AUD_DIMS) result[d] = sums[d]! / profiles.length;
  return result as unknown as BandAudienceProfileData;
}

// Weighted score helper: each entry [value 0-100, weight].
function ws(components: Array<[number, number]>): number {
  const totalW = components.reduce((s, [, w]) => s + w, 0);
  const sum    = components.reduce((s, [v, w]) => s + v * w, 0);
  return totalW > 0 ? sum / totalW : 0;
}

function computeAudienceArchetypes(
  bandProfiles: BandAudienceProfileData[],
  avgFanService: number,
  avgDeepCuts: number,
  festivalPersonality: string,
  chemistry: FestivalChemistryResult,
): FestivalAudienceResult {
  const a = avgBandProfile(bandProfiles);
  const overlap = chemistry.audienceOverlap ?? 50;
  const hasData = bandProfiles.length > 0;

  // ── 10 archetypes ────────────────────────────────────────────────────────────

  const rawScores: Array<Omit<AudienceArchetype, 'explanation'>> = [
    {
      key: 'progressive_pilgrims', name: 'Progressive Pilgrims', icon: '🎭',
      score: clamp(ws([
        [a.progressive, 30], [a.technical, 25], [a.experimental, 20],
        [100 - a.accessible, 10], [chemistry.festivalFlow, 15],
      ]) + persBonus(festivalPersonality, ['Progressive Gathering', 'Conceptual Assembly', 'Spectrum Showcase'])),
    },
    {
      key: 'deep_cut_hunters', name: 'Deep Cut Hunters', icon: '🔍',
      score: clamp(ws([
        [avgDeepCuts, 40], [100 - avgFanService, 25], [a.experimental, 20], [100 - a.accessible, 15],
      ]) + persBonus(festivalPersonality, ['Deep Cut Convention', 'Discovery Festival', 'Archive Gathering'])),
    },
    {
      key: 'atmosphere_seekers', name: 'Atmosphere Seekers', icon: '🌌',
      score: clamp(ws([
        [a.atmospheric, 40], [a.psychedelic, 20], [a.emotional, 25], [a.improvisational, 15],
      ]) + persBonus(festivalPersonality, ['Atmospheric Summit', 'Psychedelic Communion', 'Emotional Journey Festival'])),
    },
    {
      key: 'heavy_devotees', name: 'Heavy Devotees', icon: '🔥',
      score: clamp(ws([
        [a.heavy, 45], [a.aggressive, 30], [a.technical, 10], [100 - a.accessible, 15],
      ]) + persBonus(festivalPersonality, ['Heavy Music Celebration'])),
    },
    {
      key: 'technical_musicians', name: 'Technical Musicians', icon: '🎸',
      score: clamp(ws([
        [a.technical, 40], [a.progressive, 25], [a.improvisational, 20], [a.experimental, 15],
      ])),
    },
    {
      key: 'psychedelic_travelers', name: 'Psychedelic Travelers', icon: '🌀',
      score: clamp(ws([
        [a.psychedelic, 45], [a.atmospheric, 25], [a.experimental, 15], [a.emotional, 15],
      ]) + persBonus(festivalPersonality, ['Psychedelic Communion', 'Atmospheric Summit'])),
    },
    {
      key: 'concept_explorers', name: 'Concept Explorers', icon: '💡',
      score: clamp(ws([
        [a.experimental, 30], [a.progressive, 30], [a.emotional, 15], [a.technical, 15], [a.atmospheric, 10],
      ]) + persBonus(festivalPersonality, ['Conceptual Assembly', 'Progressive Gathering', 'Spectrum Showcase'])),
    },
    {
      key: 'festival_casuals', name: 'Festival Casuals', icon: '🎪',
      score: clamp(ws([
        [a.accessible, 35], [avgFanService, 35], [100 - avgDeepCuts, 20], [overlap, 10],
      ]) + persBonus(festivalPersonality, ['Legendary Archive Festival', 'Heavy Music Celebration'])),
    },
    {
      key: 'album_purists', name: 'Album Purists', icon: '🎵',
      score: clamp(ws([
        [a.emotional, 30], [avgFanService, 30], [a.atmospheric, 20], [a.accessible, 20],
      ]) + persBonus(festivalPersonality, ['Legendary Archive Festival', 'Emotional Journey Festival'])),
    },
    {
      key: 'collector_class', name: 'Collector Class', icon: '📦',
      score: clamp(ws([
        [avgDeepCuts, 40], [100 - a.accessible, 25], [a.experimental, 20], [100 - avgFanService, 15],
      ]) + persBonus(festivalPersonality, ['Deep Cut Convention', 'Archive Gathering', 'Discovery Festival'])),
    },
  ];

  // ── Explanations ──────────────────────────────────────────────────────────────

  function explain(key: string, score: number): string {
    const prog = Math.round(a.progressive), tech = Math.round(a.technical);
    const atmo = Math.round(a.atmospheric), psyc = Math.round(a.psychedelic);
    const hevy = Math.round(a.heavy),       aggr = Math.round(a.aggressive);
    const dc   = Math.round(avgDeepCuts),   fs   = Math.round(avgFanService);
    const exp  = Math.round(a.experimental);

    switch (key) {
      case 'progressive_pilgrims':
        if (score >= 70) return `Progressive (${prog}) and technical (${tech}) dimensions attract fans who demand compositional depth and structural ambition.`;
        if (score >= 45) return `Moderate progressive weight (${prog}) offers something for prog fans, though accessible elements broaden the draw.`;
        return `Low progressive and technical scores — this festival prioritises feel over structure, limiting appeal to dedicated prog listeners.`;
      case 'deep_cut_hunters':
        if (score >= 70) return `High deep cut average (${dc}) and measured fan service (${fs}) signal a setlist-first festival built for devoted collectors.`;
        if (score >= 45) return `Moderate deep cut presence (${dc}) rewards collectors, though familiar material keeps a wider audience comfortable.`;
        return `Fan-service-heavy setlists (${fs} avg) mean casual fans are the priority — not the collectors hunting rarities.`;
      case 'atmosphere_seekers':
        if (score >= 70) return `Atmospheric (${atmo}) and emotional (${Math.round(a.emotional)}) dimensions create a festival of sustained immersion that rewards patient listeners.`;
        if (score >= 45) return `Some atmospheric depth (${atmo}) draws seekers of texture, but heavier or more aggressive elements compete for attention.`;
        return `Low atmospheric and psychedelic scores mean this festival leads with impact over immersion.`;
      case 'heavy_devotees':
        if (score >= 70) return `Heavy (${hevy}) and aggressive (${aggr}) profiles define this festival — fans who measure success by physical impact will be satisfied.`;
        if (score >= 45) return `A significant heavy presence (${hevy}) draws devotees, balanced against more cerebral or atmospheric material.`;
        return `Low heavy and aggressive scores mean this festival rewards the mind more than the body.`;
      case 'technical_musicians':
        if (score >= 70) return `Technical (${tech}) and progressive (${prog}) scores are high — fellow musicians and gear enthusiasts will find much to admire.`;
        if (score >= 45) return `Technical merit (${tech}) is present but not dominant — music students and craftspeople will find highlights.`;
        return `Technical scores are modest (${tech}) — this festival prioritises emotional or atmospheric qualities over instrumental complexity.`;
      case 'psychedelic_travelers':
        if (score >= 70) return `High psychedelic (${psyc}) and atmospheric (${atmo}) scores make this a natural pilgrimage for fans of mind-expanding sonic experiences.`;
        if (score >= 45) return `Psychedelic elements (${psyc}) are present but not dominant — moments of transcendence exist alongside more grounded material.`;
        return `Low psychedelic scores mean this festival stays on solid ground — less likely to attract fans seeking altered-state music.`;
      case 'concept_explorers':
        if (score >= 70) return `Experimental (${exp}) and progressive (${prog}) dimensions, combined with festival personality "${festivalPersonality}", attract fans who follow ideas as much as sounds.`;
        if (score >= 45) return `Conceptual and experimental threads (${exp}) run through this lineup, though not every act takes this approach.`;
        return `Low experimental and concept scores — this festival communicates through feeling rather than themes and ideas.`;
      case 'festival_casuals':
        if (score >= 70) return `High accessibility (${Math.round(a.accessible)}) and fan service (${fs}) make this festival immediately welcoming to newcomers and casual attendees.`;
        if (score >= 45) return `A balance of familiar hits (${fs} fan service) and deeper cuts (${dc}) keeps casual fans engaged without alienating collectors.`;
        return `The deep cut focus (${dc} avg) and lower accessibility mean this festival rewards homework — not the casual drop-in.`;
      case 'album_purists':
        if (score >= 70) return `Emotional depth (${Math.round(a.emotional)}) and high fan service (${fs}) create a festival that feels like a curated celebration of the catalogue.`;
        if (score >= 45) return `Fan service (${fs}) and emotional dimensions give purists plenty to love, even as the setlist extends into less familiar territory.`;
        return `Lower fan service scores (${fs}) mean the setlist is exploratory rather than celebratory — album purists may feel underserved.`;
      case 'collector_class':
        if (score >= 70) return `Deep cuts (${dc}), low accessibility, and an experimental edge (${exp}) make this a festival designed for the obsessive completionist.`;
        if (score >= 45) return `The collector class will find valuable material (${dc} deep cuts) among more familiar selections.`;
        return `Fan service (${fs}) and accessibility mean casual fans are the intended audience — the collector will need to look harder.`;
      default:
        return score >= 70 ? 'Strong affinity with this festival.' : score >= 45 ? 'Moderate affinity.' : 'Low affinity.';
    }
  }

  const archetypes: AudienceArchetype[] = rawScores
    .map((a) => ({ ...a, explanation: explain(a.key, a.score) }))
    .sort((a, b) => b.score - a.score);

  // When no audience profile data exists, all dim-based scores will be 0 — flag gracefully
  const effectiveArchetypes = hasData ? archetypes : archetypes;

  const primaryArchetype   = effectiveArchetypes[0]!;
  const secondaryArchetype = effectiveArchetypes[1] && effectiveArchetypes[1].score >= 40
    ? effectiveArchetypes[1] : null;

  // ── Diversity score ────────────────────────────────────────────────────────
  const above50 = archetypes.filter((a) => a.score >= 50).length;
  const audienceDiversityScore = Math.round((above50 / archetypes.length) * 100);
  const audienceDiversityLabel =
    audienceDiversityScore >= 80 ? 'Universal Appeal' :
    audienceDiversityScore >= 60 ? 'Broad Audience'   :
    audienceDiversityScore >= 40 ? 'Balanced'          :
    audienceDiversityScore >= 20 ? 'Focused'           :
                                   'Niche';

  // ── Audience report ────────────────────────────────────────────────────────
  const PRIMARY_REPORTS: Record<string, string> = {
    'Progressive Pilgrims': 'This festival is designed for fans of progressive and conceptual music — listeners who reward complexity, patience, and architectural ambition. Expect an audience that has done their homework.',
    'Deep Cut Hunters':     'A festival for the devoted collector. The setlists lean toward rare and deep material — fans who want the B-sides, the vault recordings, and the songs most crowds have never heard.',
    'Atmosphere Seekers':   'Immersion is the draw. Fans of texture, mood, and the space between notes will find this festival a natural home. This audience does not just listen — it disappears into the sound.',
    'Heavy Devotees':       'Built for physical impact. The heavy and aggressive profile of this lineup attracts fans who measure a festival by how hard it hits from first note to last.',
    'Technical Musicians':  'Fellow craftspeople will find much to admire. This festival is for listeners who notice the details — the time signatures, the transitions, the technique behind every moment.',
    'Psychedelic Travelers':'A festival that invites surrender. Fans of mind-expanding, consciousness-shifting music will feel at home in a lineup built for transcendence over spectacle.',
    'Concept Explorers':    'This festival is built for fans who follow ideas as much as sounds — listeners who want a musical argument, a theme, a point of view embedded in every performance.',
    'Festival Casuals':     'Accessible and fan-service-forward, this festival welcomes newcomers and casual listeners alongside devoted fans. The hits are here — this event does not require homework.',
    'Album Purists':        'A celebration of the catalogue. This festival rewards fans who know the records deeply — high fan service and emotional resonance suggest a lineup built for the devoted, not the casual.',
    'Collector Class':      'This event is built for the obsessive completionist — fans who track rarities, show frequencies, and catalogue depth. The deep cuts are the main draw.',
  };

  const SECONDARY_ADDENDA: Record<string, string> = {
    'Progressive Pilgrims': 'Progressive listeners add a cerebral layer to the crowd.',
    'Deep Cut Hunters':     'Alongside them, collectors hunting rarities will be well rewarded.',
    'Atmosphere Seekers':   'Atmosphere seekers will find immersive moments woven throughout.',
    'Heavy Devotees':       'A contingent of heavy music devotees rounds out the audience with raw energy.',
    'Technical Musicians':  'Musicians and technically-minded listeners add a discerning ear to the crowd.',
    'Psychedelic Travelers':'A psychedelic-leaning secondary audience brings openness and curiosity.',
    'Concept Explorers':    'Fans who follow themes and ideas add conceptual depth to the audience.',
    'Festival Casuals':     'A casual secondary audience ensures the festival remains broadly welcoming.',
    'Album Purists':        'Album purists in the secondary crowd will appreciate the catalogue-first approach.',
    'Collector Class':      'Collectors in the mix will be hunting the deep cuts throughout the night.',
  };

  const primaryReport = PRIMARY_REPORTS[primaryArchetype.name] ?? `A festival with ${primaryArchetype.name} as its primary audience.`;
  const secondaryAddendum = secondaryArchetype ? ` ${SECONDARY_ADDENDA[secondaryArchetype.name] ?? ''}` : '';
  const audienceReport = primaryReport + secondaryAddendum;

  return {
    archetypes: effectiveArchetypes,
    primaryArchetype,
    secondaryArchetype,
    audienceDiversityScore,
    audienceDiversityLabel,
    audienceReport,
  };
}

// ── Phase U: Festival Prestige & Dream Festivals ──────────────────────────────

export interface FestivalAchievement {
  key: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
}

export interface FestivalPrestigeResult {
  prestigeScore: number;
  prestigeTier: string;
  legacyReport: string;
  achievements: FestivalAchievement[];
}

interface PrestigeInputs {
  chemistryScore: number;
  headlinerStrength: number;
  openerStrength: number;
  audienceDiversityScore: number;
  avgConcertTotal: number;
  avgVenueFit: number | null;
  avgFanService: number;
  avgDeepCuts: number;
  bandCount: number;
  concertCount: number;
  festivalPersonality: string;
  primaryArchetypeName: string;
}

function computeFestivalPrestige(inputs: PrestigeInputs): FestivalPrestigeResult {
  const {
    chemistryScore, headlinerStrength, openerStrength, audienceDiversityScore,
    avgConcertTotal, avgVenueFit, avgFanService, avgDeepCuts,
    bandCount, concertCount, festivalPersonality, primaryArchetypeName,
  } = inputs;

  // Normalize raw values to 0-100
  const normalizedConcertTotal = Math.min(avgConcertTotal / 200 * 100, 100);
  const venueScore             = avgVenueFit ?? 0;
  const fanServiceBalance      = Math.max(0, 100 - Math.abs(avgFanService - 50) * 2);
  const deepCutBalance         = Math.max(0, 100 - Math.abs(avgDeepCuts - 50) * 2);
  const bandScore              = Math.min(bandCount / 5 * 100, 100);
  const concertScore           = Math.min(concertCount / 4 * 100, 100);

  // Weighted prestige formula — weights sum to 100
  const prestigeRaw = ws([
    [chemistryScore,         28],
    [headlinerStrength,      15],
    [audienceDiversityScore, 12],
    [normalizedConcertTotal, 13],
    [venueScore,             10],
    [fanServiceBalance,       7],
    [deepCutBalance,          7],
    [bandScore,               5],
    [concertScore,            3],
  ]);
  const prestigeScore = clamp(prestigeRaw);

  const prestigeTier =
    prestigeScore >= 90 ? 'Mythic Festival'      :
    prestigeScore >= 75 ? 'World Class Festival' :
    prestigeScore >= 60 ? 'Legendary Event'      :
    prestigeScore >= 40 ? 'Cult Festival'        :
    prestigeScore >= 20 ? 'Regional Event'       :
                          'Local Gathering';

  const achievements = computeFestivalAchievements({
    chemistryScore, headlinerStrength, openerStrength, audienceDiversityScore,
    avgFanService, avgDeepCuts, avgVenueFit, bandCount, concertCount, prestigeScore,
  });

  const legacyReport = generateLegacyReport(
    prestigeScore, prestigeTier, festivalPersonality, primaryArchetypeName,
    chemistryScore, achievements,
  );

  return { prestigeScore, prestigeTier, legacyReport, achievements };
}

function computeFestivalAchievements(params: {
  chemistryScore: number;
  headlinerStrength: number;
  openerStrength: number;
  audienceDiversityScore: number;
  avgFanService: number;
  avgDeepCuts: number;
  avgVenueFit: number | null;
  bandCount: number;
  concertCount: number;
  prestigeScore: number;
}): FestivalAchievement[] {
  const { chemistryScore, headlinerStrength, openerStrength, audienceDiversityScore,
          avgFanService, avgDeepCuts, avgVenueFit, bandCount, concertCount, prestigeScore } = params;
  return [
    {
      key: 'perfectly_curated', name: 'Perfectly Curated', icon: '🧪',
      description: 'Festival chemistry score of 90 or higher.',
      unlocked: chemistryScore >= 90,
    },
    {
      key: 'headliner_excellence', name: 'Headliner Excellence', icon: '⭐',
      description: 'Headliner strength score of 80 or higher.',
      unlocked: headlinerStrength >= 80,
    },
    {
      key: 'universal_crowd', name: 'Universal Crowd', icon: '🌍',
      description: 'Audience diversity score of 70 or higher.',
      unlocked: audienceDiversityScore >= 70,
    },
    {
      key: 'deep_archive', name: 'Deep Archive', icon: '🔍',
      description: 'Average deep cut score of 70 or higher.',
      unlocked: avgDeepCuts >= 70,
    },
    {
      key: 'fan_favourite', name: 'Fan Favourite', icon: '❤️',
      description: 'Average fan service score of 75 or higher.',
      unlocked: avgFanService >= 75,
    },
    {
      key: 'venue_harmony', name: 'Venue Harmony', icon: '🏟️',
      description: 'Average venue fit of 80 or higher.',
      unlocked: (avgVenueFit ?? 0) >= 80,
    },
    {
      key: 'grand_coalition', name: 'Grand Coalition', icon: '🤝',
      description: 'Four or more different bands performing.',
      unlocked: bandCount >= 4,
    },
    {
      key: 'marathon_event', name: 'Marathon Event', icon: '🎪',
      description: 'Four or more concerts in the lineup.',
      unlocked: concertCount >= 4,
    },
    {
      key: 'rising_headliner', name: 'Rising Headliner', icon: '📈',
      description: 'Headliner is the strongest act and opener scores 60+.',
      unlocked: headlinerStrength >= openerStrength && openerStrength >= 60,
    },
    {
      key: 'mythic_status', name: 'Mythic Status', icon: '🌟',
      description: 'Festival prestige score of 90 or higher.',
      unlocked: prestigeScore >= 90,
    },
  ];
}

function generateLegacyReport(
  prestige: number,
  tier: string,
  personality: string,
  primaryAudience: string,
  chemistryScore: number,
  achievements: FestivalAchievement[],
): string {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const achievementClause =
    unlockedCount >= 8 ? `${unlockedCount} of 10 achievements unlocked — a near-complete collection of recognition.` :
    unlockedCount >= 5 ? `${unlockedCount} of 10 achievements unlocked.` :
    unlockedCount >= 2 ? `${unlockedCount} of 10 achievements unlocked — room to grow.` :
                         'No achievements unlocked yet — there is ground still to cover.';

  const chemistryClause =
    chemistryScore >= 80 ? 'The chemistry between acts is exceptional' :
    chemistryScore >= 60 ? 'The chemistry between acts is solid'       :
    chemistryScore >= 40 ? 'The chemistry between acts is adequate'    :
                           'The chemistry between acts is yet to be refined';

  const TIER_OPENINGS: Record<string, string> = {
    'Mythic Festival':      'This festival has transcended the ordinary. Its name belongs in the same breath as the greatest live music events ever conceived.',
    'World Class Festival': 'A festival of genuine prestige. The calibre of acts, the setlist depth, and the crowd chemistry place this event among the elite.',
    'Legendary Event':      'A strong and memorable festival. The pieces are in place — a few refinements away from world class.',
    'Cult Festival':        'This event has built something real. The devoted will remember it; the uninitiated will regret missing it.',
    'Regional Event':       'A promising festival still finding its identity. The foundations are here; the legend is being written.',
    'Local Gathering':      'A start. Every great festival began here — with a lineup, a crowd, and a vision not yet fully realised.',
  };

  const opening = TIER_OPENINGS[tier] ?? `A ${tier.toLowerCase()} with a prestige score of ${prestige}.`;
  const audienceClause  = primaryAudience ? `The primary audience — ${primaryAudience} — have found their festival.` : '';
  const personalityClause = personality   ? `The ${personality} personality runs through every act on the bill.`    : '';

  return [opening, `${chemistryClause}. ${audienceClause}`, personalityClause, achievementClause]
    .filter(Boolean).join(' ');
}

// Shared data-fetching preamble used by festival list + detail to load concert data in bulk.
async function loadConcertDataForFestivals(concertIds: string[]) {
  if (concertIds.length === 0) return {
    concertRows:    [],
    axisMap:        new Map<string, { songId: string; aggression: number; atmosphere: number; emotion: number; complexity: number; psychedelic: number; concept: number }>(),
    songAlbumMap:   new Map<string, string>(),
    bandProfileMap: new Map<string, BandAudienceProfileData>(),
    liveProfileMap: new Map<string, { liveStatus: string; yearsSincePlayed: number | null; firstPerformanceDate: Date | null }>(),
  };

  const concertRows = await prisma.bandRpgConcert.findMany({
    where: { id: { in: concertIds } },
    include: {
      setlist: { include: { songs: { orderBy: { position: 'asc' } } } },
      venue: true,
    },
  });

  const allSongIds  = [...new Set(concertRows.flatMap((c) => c.setlist.songs.map((s) => s.songId)))];
  const allBandIds  = [...new Set(concertRows.map((c) => c.bandId))];

  const [axisRows, songAlbumRows, bandProfileRows, liveProfileRows] = await Promise.all([
    allSongIds.length > 0
      ? prisma.songAxisScore.findMany({
          where: { songId: { in: allSongIds } },
          select: { songId: true, aggression: true, atmosphere: true, emotion: true, complexity: true, psychedelic: true, concept: true },
        })
      : Promise.resolve([]),
    allSongIds.length > 0
      ? prisma.song.findMany({
          where: { id: { in: allSongIds }, albumId: { not: null } },
          select: { id: true, albumId: true },
        })
      : Promise.resolve([]),
    allBandIds.length > 0
      ? prisma.bandAudienceProfile.findMany({
          where: { bandId: { in: allBandIds } },
          select: {
            bandId: true, progressive: true, heavy: true, technical: true,
            atmospheric: true, experimental: true, accessible: true,
            psychedelic: true, emotional: true, aggressive: true, improvisational: true,
          },
        })
      : Promise.resolve([]),
    allSongIds.length > 0
      ? prisma.bandRpgSongProfile.findMany({
          where: { songId: { in: allSongIds } },
          select: { songId: true, liveStatus: true, yearsSincePlayed: true, firstPerformanceDate: true },
        })
      : Promise.resolve([]),
  ]);

  const axisMap       = new Map(axisRows.map((r) => [r.songId, r]));
  const songAlbumMap  = new Map(songAlbumRows.map((r) => [r.id, r.albumId as string]));
  const bandProfileMap = new Map<string, BandAudienceProfileData>(
    bandProfileRows.map((p) => [p.bandId, p as BandAudienceProfileData]),
  );
  const liveProfileMap = new Map(liveProfileRows.map((p) => [p.songId, p]));
  return { concertRows, axisMap, songAlbumMap, bandProfileMap, liveProfileMap };
}

// ── GET /festivals ────────────────────────────────────────────────────────────

bandRpgRouter.get('/festivals', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    await ensureVenuesSeeded();

    const festivals = await prisma.bandRpgFestival.findMany({
      where: { userId },
      include: { concerts: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    if (festivals.length === 0) { res.json([]); return; }

    const allConcertIds = [...new Set(festivals.flatMap((f) => f.concerts.map((fc) => fc.concertId)))];
    const { concertRows, axisMap, songAlbumMap, bandProfileMap, liveProfileMap } = await loadConcertDataForFestivals(allConcertIds);
    const concertMap = new Map(concertRows.map((c) => [c.id, c]));

    const metricsCache = new Map(
      concertRows.map((c) => [c.id, deriveConcertMetrics(c, axisMap, songAlbumMap)]),
    );

    res.json(festivals.map((festival) => {
      const computed = festival.concerts
        .map((fc) => metricsCache.get(fc.concertId))
        .filter((m): m is NonNullable<typeof m> => m !== undefined);

      const concert = festival.concerts
        .map((fc) => concertMap.get(fc.concertId))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);

      const concertCount  = festival.concerts.length;
      const bandCount     = new Set(concert.map((c) => c.bandId)).size;
      const totalSongs    = computed.reduce((s, m) => s + m.songCount, 0);
      const avgFanService = computed.length > 0 ? Math.round(computed.reduce((s, m) => s + m.fanServiceScore, 0) / computed.length) : 0;
      const avgDeepCuts   = computed.length > 0 ? Math.round(computed.reduce((s, m) => s + m.deepCutScore, 0) / computed.length) : 0;
      const fitVals       = computed.filter((m) => m.venueFit !== null).map((m) => m.venueFit!);
      const avgVenueFit   = fitVals.length > 0 ? Math.round(fitVals.reduce((s, v) => s + v, 0) / fitVals.length) : null;

      const personality = computeFestivalPersonality(computed.map((m) => ({
        concertPersonality: m.concertPersonality, fanServiceScore: m.fanServiceScore, deepCutScore: m.deepCutScore,
      })));

      const sortedConcerts = festival.concerts
        .map((fc) => {
          const c = concertMap.get(fc.concertId);
          const m = metricsCache.get(fc.concertId);
          if (!c || !m) return null;
          return {
            bandId: c.bandId,
            concertPersonality: m.concertPersonality,
            fanServiceScore: m.fanServiceScore,
            deepCutScore: m.deepCutScore,
            venueFit: m.venueFit,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const chemistry = computeFestivalChemistry(sortedConcerts, bandProfileMap, personality, avgFanService, avgDeepCuts);

      const lineupInput: LineupConcertInput[] = festival.concerts.map((fc) => {
        const m = metricsCache.get(fc.concertId);
        const c = concertMap.get(fc.concertId);
        if (!m || !c) return null;
        return {
          concertName:        c.concertName,
          bandName:           c.bandName,
          concertTotal:       m.concertTotal,
          grade:              m.grade,
          venueFit:           m.venueFit,
          fanServiceScore:    m.fanServiceScore,
          deepCutScore:       m.deepCutScore,
          concertPersonality: m.concertPersonality,
          flowScore:          m.flowScore,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);
      const { lineupAnalysis } = computeLineupAnalysis(lineupInput);

      const uniqueBandProfiles = [...new Set(sortedConcerts.map((c) => c.bandId))]
        .map((id) => bandProfileMap.get(id))
        .filter((p): p is BandAudienceProfileData => p !== undefined);
      const audience = computeAudienceArchetypes(uniqueBandProfiles, avgFanService, avgDeepCuts, personality, chemistry);

      const avgConcertTotal = computed.length > 0
        ? computed.reduce((s, m) => s + m.concertTotal, 0) / computed.length : 0;
      const prestige = computeFestivalPrestige({
        chemistryScore:         chemistry.chemistryScore,
        headlinerStrength:      lineupAnalysis.headlinerScore,
        openerStrength:         lineupAnalysis.openerScore,
        audienceDiversityScore: audience.audienceDiversityScore,
        avgConcertTotal,
        avgVenueFit,
        avgFanService,
        avgDeepCuts,
        bandCount,
        concertCount,
        festivalPersonality:  personality,
        primaryArchetypeName: audience.primaryArchetype.name,
      });

      // Phase V — Festival Realism + Historical Highlights
      const festivalSongIds = festival.concerts
        .flatMap((fc) => concertMap.get(fc.concertId)?.setlist.songs.map((s) => s.songId) ?? []);
      const festivalStatuses = festivalSongIds.map((id) => liveProfileMap.get(id)?.liveStatus ?? 'Unknown');
      const festivalRealism  = computeFestivalRealism(festivalStatuses);
      const historicalSummaries: SongHistoricalSummary[] = festivalSongIds.map((id) => {
        const lp = liveProfileMap.get(id);
        return {
          liveStatus:          lp?.liveStatus          ?? 'Unknown',
          yearsSincePlayed:    lp?.yearsSincePlayed     ?? null,
          firstPerformanceDate: lp?.firstPerformanceDate ?? null,
        };
      });
      const historicalHighlights = computeHistoricalHighlights(historicalSummaries);

      return {
        id:                 festival.id,
        name:               festival.name,
        description:        festival.description ?? null,
        isDream:            festival.isDream,
        visibility:         festival.visibility,
        concertCount,
        bandCount,
        totalSongs,
        avgFanService,
        avgDeepCuts,
        avgVenueFit,
        festivalPersonality: personality,
        festivalStory:       generateFestivalStory(personality, bandCount, totalSongs, concertCount),
        chemistry,
        lineupAnalysis,
        audience,
        prestige,
        realismScore:        festivalRealism?.realismScore  ?? null,
        realismLabel:        festivalRealism?.realismLabel  ?? null,
        historicalHighlights,
        createdAt:           festival.createdAt.toISOString(),
        updatedAt:           festival.updatedAt.toISOString(),
      };
    }));
  } catch (e) { next(e); }
});

// ── POST /festivals ───────────────────────────────────────────────────────────

bandRpgRouter.post('/festivals', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const body        = req.body as Record<string, unknown>;
    const name        = typeof body['name']        === 'string' ? body['name'].trim()        : null;
    const description = typeof body['description'] === 'string' ? body['description'].trim() : null;
    const rawConcerts = Array.isArray(body['concertIds']) ? body['concertIds'] as string[] : [];

    if (!name) { res.status(400).json({ error: 'name is required' }); return; }

    // Validate concert ownership
    const concertIds = rawConcerts.filter((id): id is string => typeof id === 'string');
    if (concertIds.length > 0) {
      const owned = await prisma.bandRpgConcert.findMany({
        where: { id: { in: concertIds }, userId },
        select: { id: true },
      });
      const ownedSet = new Set(owned.map((c) => c.id));
      const invalid  = concertIds.filter((id) => !ownedSet.has(id));
      if (invalid.length > 0) { res.status(400).json({ error: 'One or more concert IDs are invalid' }); return; }
    }

    const festival = await prisma.bandRpgFestival.create({
      data: {
        userId, name,
        ...(description ? { description } : {}),
        concerts: {
          create: concertIds.map((concertId, idx) => ({ concertId, position: idx })),
        },
      },
    });

    void grantXP(userId, XP_GRANTS.FESTIVAL_CREATED).catch(() => undefined);
    res.status(201).json({ ok: true, id: festival.id });
  } catch (e) { next(e); }
});

// ── GET /festivals/:festivalId ────────────────────────────────────────────────

bandRpgRouter.get('/festivals/:festivalId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const festivalId = req.params['festivalId'];
    if (!festivalId) { res.status(400).json({ error: 'festivalId is required' }); return; }

    await ensureVenuesSeeded();

    const festival = await prisma.bandRpgFestival.findFirst({
      where: { id: festivalId, userId },
      include: { concerts: { orderBy: { position: 'asc' } } },
    });
    if (!festival) { res.status(404).json({ error: 'Not found' }); return; }

    const concertIds = festival.concerts.map((fc) => fc.concertId);
    const { concertRows, axisMap, songAlbumMap, bandProfileMap, liveProfileMap: detailLiveMap } = await loadConcertDataForFestivals(concertIds);
    const concertMap = new Map(concertRows.map((c) => [c.id, c]));

    const computedRaw = festival.concerts.map((fc) => {
      const concert = concertMap.get(fc.concertId);
      if (!concert) return null;
      const metrics = deriveConcertMetrics(concert, axisMap, songAlbumMap);
      return {
        festivalConcertId: fc.id,
        position:          fc.position,
        concertId:         fc.concertId,
        concertName:       concert.concertName,
        bandId:            concert.bandId,
        bandName:          concert.bandName,
        metrics,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    const lineupInput: LineupConcertInput[] = computedRaw.map((c) => ({
      concertName:        c.concertName,
      bandName:           c.bandName,
      concertTotal:       c.metrics.concertTotal,
      grade:              c.metrics.grade,
      venueFit:           c.metrics.venueFit,
      fanServiceScore:    c.metrics.fanServiceScore,
      deepCutScore:       c.metrics.deepCutScore,
      concertPersonality: c.metrics.concertPersonality,
      flowScore:          c.metrics.flowScore,
    }));
    const { lineupAnalysis, perConcert } = computeLineupAnalysis(lineupInput);

    const computed = computedRaw.map((c, idx) => {
      const pc = perConcert[idx];
      return {
        festivalConcertId:  c.festivalConcertId,
        position:           c.position,
        concertId:          c.concertId,
        concertName:        c.concertName,
        bandId:             c.bandId,
        bandName:           c.bandName,
        ...c.metrics,
        role:              pc?.role              ?? ('Support Act' as LineupRole),
        roleLabel:         pc?.roleLabel         ?? 'Momentum Keeper',
        headlinerStrength: pc?.headlinerStrength ?? 0,
        openerStrength:    pc?.openerStrength    ?? 0,
      };
    });

    const concertCount  = festival.concerts.length;
    const bandCount     = new Set(computed.map((m) => m.bandId)).size;
    const totalSongs    = computed.reduce((s, m) => s + m.songCount, 0);
    const avgFanService = computed.length > 0 ? Math.round(computed.reduce((s, m) => s + m.fanServiceScore, 0) / computed.length) : 0;
    const avgDeepCuts   = computed.length > 0 ? Math.round(computed.reduce((s, m) => s + m.deepCutScore, 0) / computed.length) : 0;
    const fitVals       = computed.filter((m) => m.venueFit !== null).map((m) => m.venueFit!);
    const avgVenueFit   = fitVals.length > 0 ? Math.round(fitVals.reduce((s, v) => s + v, 0) / fitVals.length) : null;

    const personality = computeFestivalPersonality(computed.map((m) => ({
      concertPersonality: m.concertPersonality, fanServiceScore: m.fanServiceScore, deepCutScore: m.deepCutScore,
    })));

    const sortedConcerts = computed.map((m) => ({
      bandId:             m.bandId,
      concertPersonality: m.concertPersonality,
      fanServiceScore:    m.fanServiceScore,
      deepCutScore:       m.deepCutScore,
      venueFit:           m.venueFit,
    }));
    const chemistry = computeFestivalChemistry(sortedConcerts, bandProfileMap, personality, avgFanService, avgDeepCuts);

    const uniqueBandProfilesDetail = [...new Set(sortedConcerts.map((c) => c.bandId))]
      .map((id) => bandProfileMap.get(id))
      .filter((p): p is BandAudienceProfileData => p !== undefined);
    const audience = computeAudienceArchetypes(uniqueBandProfilesDetail, avgFanService, avgDeepCuts, personality, chemistry);

    const avgConcertTotalDetail = computed.length > 0
      ? computed.reduce((s, m) => s + m.concertTotal, 0) / computed.length : 0;
    const prestige = computeFestivalPrestige({
      chemistryScore:         chemistry.chemistryScore,
      headlinerStrength:      lineupAnalysis.headlinerScore,
      openerStrength:         lineupAnalysis.openerScore,
      audienceDiversityScore: audience.audienceDiversityScore,
      avgConcertTotal:        avgConcertTotalDetail,
      avgVenueFit,
      avgFanService,
      avgDeepCuts,
      bandCount,
      concertCount,
      festivalPersonality:  personality,
      primaryArchetypeName: audience.primaryArchetype.name,
    });

    // Phase V — Festival Realism + Historical Highlights
    const detailSongIds = concertRows.flatMap((c) => c.setlist.songs.map((s) => s.songId));
    const detailStatuses = detailSongIds.map((id) => detailLiveMap.get(id)?.liveStatus ?? 'Unknown');
    const detailRealism  = computeFestivalRealism(detailStatuses);
    const detailHistoricalSummaries: SongHistoricalSummary[] = detailSongIds.map((id) => {
      const lp = detailLiveMap.get(id);
      return {
        liveStatus:           lp?.liveStatus          ?? 'Unknown',
        yearsSincePlayed:     lp?.yearsSincePlayed     ?? null,
        firstPerformanceDate: lp?.firstPerformanceDate ?? null,
      };
    });
    const detailHighlights = computeHistoricalHighlights(detailHistoricalSummaries);

    res.json({
      id:                  festival.id,
      name:                festival.name,
      description:         festival.description ?? null,
      isDream:             festival.isDream,
      visibility:          festival.visibility,
      concertCount,
      bandCount,
      totalSongs,
      avgFanService,
      avgDeepCuts,
      avgVenueFit,
      festivalPersonality: personality,
      festivalStory:       generateFestivalStory(personality, bandCount, totalSongs, concertCount),
      chemistry,
      lineupAnalysis,
      audience,
      prestige,
      realismScore:        detailRealism?.realismScore  ?? null,
      realismLabel:        detailRealism?.realismLabel  ?? null,
      historicalHighlights: detailHighlights,
      concerts:            computed,
      createdAt:           festival.createdAt.toISOString(),
      updatedAt:           festival.updatedAt.toISOString(),
    });
  } catch (e) { next(e); }
});

// ── PUT /festivals/:festivalId ────────────────────────────────────────────────

bandRpgRouter.put('/festivals/:festivalId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const festivalId = req.params['festivalId'];
    if (!festivalId) { res.status(400).json({ error: 'festivalId is required' }); return; }

    const festival = await prisma.bandRpgFestival.findFirst({ where: { id: festivalId, userId } });
    if (!festival) { res.status(404).json({ error: 'Not found' }); return; }

    const body        = req.body as Record<string, unknown>;
    const name        = typeof body['name']        === 'string' ? body['name'].trim()        : undefined;
    const description = typeof body['description'] === 'string' ? body['description'].trim() : undefined;

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (name        !== undefined) data['name']        = name;
    if (description !== undefined) data['description'] = description;

    await prisma.bandRpgFestival.update({ where: { id: festivalId }, data });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── PATCH /festivals/:festivalId/dream ───────────────────────────────────────

bandRpgRouter.patch('/festivals/:festivalId/dream', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const festivalId = req.params['festivalId'];
    if (!festivalId) { res.status(400).json({ error: 'festivalId is required' }); return; }

    const festival = await prisma.bandRpgFestival.findFirst({ where: { id: festivalId, userId } });
    if (!festival) { res.status(404).json({ error: 'Not found' }); return; }

    const body    = req.body as Record<string, unknown>;
    const isDream = typeof body['isDream'] === 'boolean' ? body['isDream'] : null;
    if (isDream === null) { res.status(400).json({ error: 'isDream (boolean) is required' }); return; }

    if (isDream) {
      // At most one Dream Festival per user — clear existing, then set new one
      await prisma.$transaction([
        prisma.bandRpgFestival.updateMany({
          where: { userId, isDream: true },
          data:  { isDream: false },
        }),
        prisma.bandRpgFestival.update({
          where: { id: festivalId },
          data:  { isDream: true, updatedAt: new Date() },
        }),
      ]);
    } else {
      await prisma.bandRpgFestival.update({
        where: { id: festivalId },
        data:  { isDream: false, updatedAt: new Date() },
      });
    }

    res.json({ ok: true, isDream });
  } catch (e) { next(e); }
});

// ── DELETE /festivals/:festivalId ─────────────────────────────────────────────

bandRpgRouter.delete('/festivals/:festivalId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const festivalId = req.params['festivalId'];
    if (!festivalId) { res.status(400).json({ error: 'festivalId is required' }); return; }

    const festival = await prisma.bandRpgFestival.findFirst({ where: { id: festivalId, userId } });
    if (!festival) { res.status(404).json({ error: 'Not found' }); return; }

    await prisma.bandRpgFestival.delete({ where: { id: festivalId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── PUT /festivals/:festivalId/visibility ─────────────────────────────────────

bandRpgRouter.put('/festivals/:festivalId/visibility', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId     = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const festivalId = req.params['festivalId'];
    if (!festivalId) { res.status(400).json({ error: 'festivalId is required' }); return; }
    const { visibility } = req.body as { visibility?: string };
    if (!visibility || !['public', 'unlisted', 'private'].includes(visibility)) {
      res.status(400).json({ error: 'visibility must be public, unlisted, or private' }); return;
    }
    const festival = await prisma.bandRpgFestival.findFirst({ where: { id: festivalId, userId } });
    if (!festival) { res.status(404).json({ error: 'Not found' }); return; }
    await prisma.bandRpgFestival.update({ where: { id: festivalId }, data: { visibility } });
    res.json({ ok: true, visibility }); return;
  } catch (e) { next(e); }
});

// ── PUT /festivals/:festivalId/concerts ───────────────────────────────────────

bandRpgRouter.put('/festivals/:festivalId/concerts', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const festivalId = req.params['festivalId'];
    if (!festivalId) { res.status(400).json({ error: 'festivalId is required' }); return; }

    const festival = await prisma.bandRpgFestival.findFirst({ where: { id: festivalId, userId } });
    if (!festival) { res.status(404).json({ error: 'Not found' }); return; }

    const body    = req.body as Record<string, unknown>;
    const rawIds  = Array.isArray(body['concertIds']) ? body['concertIds'] as unknown[] : [];
    const concertIds = rawIds.filter((id): id is string => typeof id === 'string');

    // Validate ownership of all concerts
    if (concertIds.length > 0) {
      const owned = await prisma.bandRpgConcert.findMany({
        where: { id: { in: concertIds }, userId },
        select: { id: true },
      });
      const ownedSet = new Set(owned.map((c) => c.id));
      if (concertIds.some((id) => !ownedSet.has(id))) {
        res.status(400).json({ error: 'One or more concert IDs are invalid' }); return;
      }
    }

    await prisma.$transaction([
      prisma.bandRpgFestivalConcert.deleteMany({ where: { festivalId } }),
      ...concertIds.map((concertId, idx) =>
        prisma.bandRpgFestivalConcert.create({ data: { festivalId, concertId, position: idx } }),
      ),
    ]);
    await prisma.bandRpgFestival.update({ where: { id: festivalId }, data: { updatedAt: new Date() } });

    res.json({ ok: true, concertCount: concertIds.length });
  } catch (e) { next(e); }
});

// ── Phase V: Live Intelligence endpoints ──────────────────────────────────────

// GET /live-profiles?bandId=...
bandRpgRouter.get('/live-profiles', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const bandId = typeof req.query['bandId'] === 'string' ? req.query['bandId'] : null;
    if (!bandId) { res.status(400).json({ error: 'bandId query param required' }); return; }

    const [profiles, cache] = await Promise.all([
      prisma.bandRpgSongProfile.findMany({
        where: { song: { bandId } },
        select: {
          songId: true, liveStatus: true, liveValue: true, rarityIndex: true,
          totalPerformances: true, performancePct: true, yearsSincePlayed: true,
          lastPerformanceDate: true, firstPerformanceDate: true, distinctYears: true,
          lastLiveDataFetchedAt: true,
        },
      }),
      prisma.bandLiveDataCache.findUnique({ where: { bandId } }),
    ]);

    res.json({
      profiles: profiles.map((p) => ({
        ...p,
        lastPerformanceDate:  p.lastPerformanceDate?.toISOString()  ?? null,
        firstPerformanceDate: p.firstPerformanceDate?.toISOString() ?? null,
        lastLiveDataFetchedAt: p.lastLiveDataFetchedAt?.toISOString() ?? null,
      })),
      cache: cache ? {
        setlistFmMbid:  cache.setlistFmMbid,
        setlistFmName:  cache.setlistFmName,
        totalShows:     cache.totalShows,
        fetchedShows:   cache.fetchedShows,
        lastFetchedAt:  cache.lastFetchedAt?.toISOString() ?? null,
        fetchStatus:    cache.fetchStatus,
        errorMessage:   cache.errorMessage ?? null,
      } : null,
    });
  } catch (e) { next(e); }
});

// GET /admin/live-data-status?bandId=...
bandRpgRouter.get('/admin/live-data-status', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const bandId = typeof req.query['bandId'] === 'string' ? req.query['bandId'] : null;
    if (!bandId) { res.status(400).json({ error: 'bandId query param required' }); return; }

    const cache = await prisma.bandLiveDataCache.findUnique({ where: { bandId } });
    res.json(cache ? {
      bandId:        cache.bandId,
      setlistFmMbid: cache.setlistFmMbid  ?? null,
      setlistFmName: cache.setlistFmName  ?? null,
      totalShows:    cache.totalShows,
      fetchedShows:  cache.fetchedShows,
      lastFetchedAt: cache.lastFetchedAt?.toISOString() ?? null,
      fetchStatus:   cache.fetchStatus,
      errorMessage:  cache.errorMessage   ?? null,
    } : null);
  } catch (e) { next(e); }
});

// POST /admin/search-setlistfm
bandRpgRouter.post('/admin/search-setlistfm', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const body       = req.body as Record<string, unknown>;
    const artistName = typeof body['artistName'] === 'string' ? body['artistName'].trim() : '';
    if (!artistName) { res.status(400).json({ error: 'artistName is required' }); return; }

    const artists = await searchArtistOnSetlistFm(artistName);
    res.json({ artists });
  } catch (e) { next(e); }
});

// POST /admin/set-setlistfm-artist
bandRpgRouter.post('/admin/set-setlistfm-artist', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const body   = req.body as Record<string, unknown>;
    const bandId = typeof body['bandId'] === 'string' ? body['bandId'].trim() : '';
    const mbid   = typeof body['mbid']   === 'string' ? body['mbid'].trim()   : '';
    const name   = typeof body['name']   === 'string' ? body['name'].trim()   : '';
    if (!bandId || !mbid || !name) { res.status(400).json({ error: 'bandId, mbid, and name are required' }); return; }

    await storeBandArtistMatch(bandId, mbid, name);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /admin/fetch-live-data
bandRpgRouter.post('/admin/fetch-live-data', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const body   = req.body as Record<string, unknown>;
    const bandId = typeof body['bandId'] === 'string' ? body['bandId'].trim() : '';
    if (!bandId) { res.status(400).json({ error: 'bandId is required' }); return; }

    const result = await fetchBandLiveData(bandId);
    res.json({ ok: !result.error, ...result });
  } catch (e) { next(e); }
});

// ── POST /admin/reset-my-data ─────────────────────────────────────────────────

bandRpgRouter.post('/admin/reset-my-data', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    await prisma.$transaction([
      prisma.bandRpgFestival.deleteMany({ where: { userId } }),
      prisma.bandRpgConcert.deleteMany({ where: { userId } }),
      prisma.bandRpgCollectedSong.deleteMany({ where: { userId } }),
      prisma.bandRpgCompletedAlbum.deleteMany({ where: { userId } }),
      prisma.bandRpgSetlist.deleteMany({ where: { userId } }),
      prisma.bandRpgPlayerProgress.deleteMany({ where: { userId } }),
    ]);

    res.json({ ok: true, message: 'Band RPG collection, albums, setlists, concerts, festivals, and progress cleared.' });
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

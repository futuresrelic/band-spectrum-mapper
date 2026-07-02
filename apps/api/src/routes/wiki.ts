import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

// Music Wiki — public read-only endpoints.
// No authentication required. Returns curated data for the encyclopedic wiki view.
export const wikiRouter = Router();

// ---------------------------------------------------------------------------
// Search — bands + albums + songs
// ---------------------------------------------------------------------------
wikiRouter.get('/search', async (req, res, next) => {
  try {
    const q = (req.query['q'] as string | undefined)?.trim() ?? '';
    const limit = Math.min(parseInt((req.query['limit'] as string | undefined) ?? '10', 10), 30);

    if (q.length < 2) {
      res.json({ bands: [], albums: [], songs: [] });
      return;
    }

    const [bands, albums, songs] = await Promise.all([
      prisma.band.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true, slug: true, logoUrl: true },
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.album.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        select: {
          id: true,
          title: true,
          slug: true,
          year: true,
          artworkUrl: true,
          band: { select: { slug: true, name: true } },
        },
        take: limit,
        orderBy: [{ year: 'asc' }, { title: 'asc' }],
      }),
      prisma.song.findMany({
        where: { title: { contains: q, mode: 'insensitive' } },
        select: {
          id: true,
          title: true,
          slug: true,
          rarity: true,
          band: { select: { slug: true, name: true } },
          album: { select: { slug: true, title: true, year: true } },
        },
        take: limit,
        orderBy: { title: 'asc' },
      }),
    ]);

    res.json({ bands, albums, songs });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Band page
// ---------------------------------------------------------------------------
wikiRouter.get('/bands/:slug', async (req, res, next) => {
  try {
    const slug = req.params['slug'];
    if (!slug) { res.status(400).json({ error: 'slug required' }); return; }

    const band = await prisma.band.findUnique({
      where: { slug },
      include: {
        members: { orderBy: { name: 'asc' } },
        albums: {
          orderBy: [{ year: 'asc' }, { title: 'asc' }],
          select: {
            id: true,
            title: true,
            slug: true,
            year: true,
            albumType: true,
            artworkUrl: true,
            _count: { select: { songs: true } },
          },
        },
        liveDataCache: {
          select: {
            fetchStatus: true,
            fetchedShows: true,
            totalShows: true,
            lastFetchedAt: true,
          },
        },
        _count: { select: { songs: true, albums: true } },
      },
    });

    if (!band) { res.status(404).json({ error: 'Band not found' }); return; }

    // Top-played songs (live frequency)
    const topPlayed = await prisma.bandRpgSongProfile.findMany({
      where: {
        song: { bandId: band.id },
        totalPerformances: { gt: 0 },
      },
      orderBy: { totalPerformances: 'desc' },
      take: 10,
      include: {
        song: {
          select: {
            id: true,
            title: true,
            slug: true,
            rarity: true,
            album: { select: { title: true, slug: true } },
          },
        },
      },
    });

    // Rarest songs with known live data
    const rarestPlayed = await prisma.bandRpgSongProfile.findMany({
      where: {
        song: { bandId: band.id },
        liveStatus: { in: ['Extremely Rare', 'Rare'] },
      },
      orderBy: { rarityIndex: 'desc' },
      take: 6,
      include: {
        song: {
          select: {
            id: true,
            title: true,
            slug: true,
            album: { select: { title: true, slug: true } },
          },
        },
      },
    });

    res.json({ band, topPlayed, rarestPlayed });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Album page
// ---------------------------------------------------------------------------
wikiRouter.get('/albums/:bandSlug/:albumSlug', async (req, res, next) => {
  try {
    const bandSlug = req.params['bandSlug'];
    const albumSlug = req.params['albumSlug'];
    if (!bandSlug || !albumSlug) {
      res.status(400).json({ error: 'bandSlug and albumSlug required' });
      return;
    }

    const band = await prisma.band.findUnique({
      where: { slug: bandSlug },
      select: { id: true, name: true, slug: true },
    });
    if (!band) { res.status(404).json({ error: 'Band not found' }); return; }

    const album = await prisma.album.findUnique({
      where: { bandId_slug: { bandId: band.id, slug: albumSlug } },
      include: {
        songs: {
          orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
          include: {
            score: true,
            bandRpgProfile: {
              select: {
                totalPerformances: true,
                liveStatus: true,
                rarityIndex: true,
              },
            },
          },
        },
      },
    });
    if (!album) { res.status(404).json({ error: 'Album not found' }); return; }

    // Aggregate spectrum stats across scored songs
    const scoredSongs = album.songs.filter((s) => s.score !== null);
    const avgSpectrum =
      scoredSongs.length > 0
        ? {
            aggression: avg(scoredSongs.map((s) => s.score!.aggression)),
            complexity: avg(scoredSongs.map((s) => s.score!.complexity)),
            atmosphere: avg(scoredSongs.map((s) => s.score!.atmosphere)),
            emotion: avg(scoredSongs.map((s) => s.score!.emotion)),
            psychedelic: avg(scoredSongs.map((s) => s.score!.psychedelic)),
            concept: avg(scoredSongs.map((s) => s.score!.concept)),
          }
        : null;

    // Rarity breakdown
    const rarityBreakdown: Record<string, number> = {};
    for (const song of album.songs) {
      rarityBreakdown[song.rarity] = (rarityBreakdown[song.rarity] ?? 0) + 1;
    }

    res.json({ band, album, avgSpectrum, rarityBreakdown });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Song page
// ---------------------------------------------------------------------------
wikiRouter.get('/songs/:songId', async (req, res, next) => {
  try {
    const songId = req.params['songId'];
    if (!songId) { res.status(400).json({ error: 'songId required' }); return; }

    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: {
        band: { select: { id: true, name: true, slug: true, logoUrl: true } },
        album: { select: { id: true, title: true, slug: true, year: true, artworkUrl: true } },
        score: true,
        bandRpgProfile: true,
        lyrics: {
          where: { isPrimary: true },
          take: 1,
          select: { id: true, sourceType: true, sourceLabel: true, text: true },
        },
        _count: { select: { ratings: true } },
      },
    });

    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }

    const [
      collectedCount,
      albumSiblings,
      bandRarityCounts,
      relatedByRarity,
      liveCache,
    ] = await Promise.all([
      // How many players have collected this song
      prisma.bandRpgCollectedSong.count({ where: { songId } }),

      // Sibling songs on the same album
      song.albumId
        ? prisma.song.findMany({
            where: { albumId: song.albumId, id: { not: songId } },
            select: { id: true, title: true, slug: true, trackNumber: true, rarity: true },
            orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
            take: 20,
          })
        : Promise.resolve([]),

      // Rarity distribution across the band (for collection progress display)
      prisma.song.groupBy({
        by: ['rarity'],
        where: { bandId: song.bandId },
        _count: { id: true },
      }),

      // Other songs with the same game rarity from same band (for "Related by rarity")
      prisma.song.findMany({
        where: { bandId: song.bandId, rarity: song.rarity, id: { not: songId } },
        select: {
          id: true,
          title: true,
          slug: true,
          rarity: true,
          album: { select: { title: true, slug: true, year: true } },
          bandRpgProfile: { select: { liveStatus: true, totalPerformances: true } },
        },
        take: 6,
        orderBy: { title: 'asc' },
      }),

      // Band live data cache — needed for "why rare" denominator
      prisma.bandLiveDataCache.findUnique({
        where: { bandId: song.bandId },
        select: { fetchedShows: true, totalShows: true },
      }),
    ]);

    res.json({ song, collectedCount, albumSiblings, bandRarityCounts, relatedByRarity, liveCache });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Song player context — requires auth; returns collection + progress data
// ---------------------------------------------------------------------------
wikiRouter.get('/songs/:songId/player-context', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const songId = req.params['songId'];
    if (!songId) { res.status(400).json({ error: 'songId required' }); return; }

    const userId = req.user!.userId;

    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { bandId: true, albumId: true },
    });
    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }

    // Collection status for this specific song
    const collected = await prisma.bandRpgCollectedSong.findUnique({
      where: { userId_songId: { userId, songId } },
    });

    // All songs in the band (for progress computation)
    const bandSongs = await prisma.song.findMany({
      where: { bandId: song.bandId },
      select: { id: true, rarity: true, albumId: true },
    });

    // User's collected song IDs for this band
    const userBandCollected = await prisma.bandRpgCollectedSong.findMany({
      where: { userId, bandId: song.bandId },
      select: { songId: true },
    });
    const userCollectedIds = new Set(userBandCollected.map((c) => c.songId));

    // Per-rarity progress (using current Song.rarity, not frozen collect rarity)
    const rarityProgress: Record<string, { owned: number; total: number }> = {};
    for (const s of bandSongs) {
      const tier = s.rarity;
      if (!rarityProgress[tier]) rarityProgress[tier] = { owned: 0, total: 0 };
      rarityProgress[tier].total++;
      if (userCollectedIds.has(s.id)) rarityProgress[tier].owned++;
    }

    // Album progress
    let albumProgress: { owned: number; total: number } | null = null;
    if (song.albumId) {
      const albumSongIds = bandSongs
        .filter((s) => s.albumId === song.albumId)
        .map((s) => s.id);
      albumProgress = {
        owned: albumSongIds.filter((id) => userCollectedIds.has(id)).length,
        total: albumSongIds.length,
      };
    }

    res.json({
      collected: !!collected,
      collectedAt: collected?.recoveredAt ?? null,
      frozenRarity: collected?.rarity ?? null,
      guessedCorrectly: collected?.guessedCorrectly ?? null,
      scoreEarned: collected?.scoreEarned ?? null,
      bandProgress: { owned: userCollectedIds.size, total: bandSongs.length },
      albumProgress,
      rarityProgress,
    });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Artist (band member) page
// ---------------------------------------------------------------------------
wikiRouter.get('/artists/:memberId', async (req, res, next) => {
  try {
    const memberId = req.params['memberId'];
    if (!memberId) { res.status(400).json({ error: 'memberId required' }); return; }

    const member = await prisma.bandMember.findUnique({
      where: { id: memberId },
      include: {
        band: {
          include: {
            albums: {
              orderBy: [{ year: 'asc' }, { title: 'asc' }],
              select: {
                id: true,
                title: true,
                slug: true,
                year: true,
                albumType: true,
                artworkUrl: true,
              },
            },
            _count: { select: { songs: true } },
          },
        },
      },
    });

    if (!member) { res.status(404).json({ error: 'Artist not found' }); return; }

    res.json({ member });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

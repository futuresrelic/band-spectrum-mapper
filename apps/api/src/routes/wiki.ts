import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { scoreService } from '../services/scoreService.js';
import { computeSongHealth, computeAggregateHealth } from '../services/songHealthService.js';
import { SCORE_AXES, type ScoreAxis } from '@band-spectrum-mapper/shared';

// Music Wiki — public read-only endpoints.
// No authentication required. Returns curated data for the encyclopedic wiki view.
export const wikiRouter = Router();

type TrackRef = { id: string; title: string; slug: string; value: number };

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

    // Spectrum rollup — average per axis, albums by avg complexity, extreme tracks.
    // Reuses scoreService (already the canonical averaging logic) rather than
    // re-implementing it here.
    const bandScoreAverages = await scoreService.averagesByBand(band.id);
    const scoredSongsForRollup = bandScoreAverages.length > 0
      ? await prisma.song.findMany({
          where: { bandId: band.id, score: { isNot: null } },
          select: {
            id: true, title: true, slug: true, albumId: true,
            album: { select: { title: true } },
            score: true,
          },
        })
      : [];

    let spectrumRollup: {
      avgSpectrum: Record<ScoreAxis, number>;
      strongestAxis: { axis: ScoreAxis; average: number } | null;
      albumsByComplexity: Array<{ albumId: string; title: string; avgComplexity: number; songCount: number }>;
      extremeTracks: { mostComplex: TrackRef | null; mostAtmospheric: TrackRef | null; mostAggressive: TrackRef | null };
    } | null = null;

    if (bandScoreAverages.length > 0) {
      const avgSpectrum = Object.fromEntries(
        bandScoreAverages.map((a) => [a.axis, a.average]),
      ) as Record<ScoreAxis, number>;

      const strongest = [...bandScoreAverages].sort((a, b) => b.average - a.average)[0] ?? null;

      // Group scored songs by album for the complexity rollup
      const byAlbum = new Map<string, { title: string; total: number; count: number }>();
      for (const s of scoredSongsForRollup) {
        if (!s.albumId || !s.album) continue;
        const entry = byAlbum.get(s.albumId) ?? { title: s.album.title, total: 0, count: 0 };
        entry.total += s.score!.complexity;
        entry.count += 1;
        byAlbum.set(s.albumId, entry);
      }
      const albumsByComplexity = [...byAlbum.entries()]
        .map(([albumId, v]) => ({ albumId, title: v.title, avgComplexity: v.total / v.count, songCount: v.count }))
        .sort((a, b) => b.avgComplexity - a.avgComplexity)
        .slice(0, 5);

      const topBy = (axis: 'complexity' | 'atmosphere' | 'aggression'): TrackRef | null => {
        const top = [...scoredSongsForRollup].sort((a, b) => b.score![axis] - a.score![axis])[0];
        return top ? { id: top.id, title: top.title, slug: top.slug, value: top.score![axis] } : null;
      };

      spectrumRollup = {
        avgSpectrum,
        strongestAxis: strongest ? { axis: strongest.axis as ScoreAxis, average: strongest.average } : null,
        albumsByComplexity,
        extremeTracks: {
          mostComplex: topBy('complexity'),
          mostAtmospheric: topBy('atmosphere'),
          mostAggressive: topBy('aggression'),
        },
      };
    }

    // Database health rollup — module coverage across every song in the band
    const bandSongIds = (await prisma.song.findMany({ where: { bandId: band.id }, select: { id: true } })).map((s) => s.id);
    const health = await computeAggregateHealth(bandSongIds);

    res.json({ band, topPlayed, rarestPlayed, spectrumRollup, health });
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

    // Strongest axis + extreme tracks — cheap, computed from songs already loaded above
    let strongestAxis: { axis: ScoreAxis; average: number } | null = null;
    let mostComplexTrack: TrackRef | null = null;
    let mostAtmosphericTrack: TrackRef | null = null;
    if (avgSpectrum) {
      strongestAxis = SCORE_AXES
        .map((axis) => ({ axis, average: avgSpectrum[axis] }))
        .sort((a, b) => b.average - a.average)[0]!;

      const topBy = (axis: 'complexity' | 'atmosphere'): TrackRef => {
        const top = [...scoredSongs].sort((a, b) => b.score![axis] - a.score![axis])[0]!;
        return { id: top.id, title: top.title, slug: top.slug, value: top.score![axis] };
      };
      mostComplexTrack = topBy('complexity');
      mostAtmosphericTrack = topBy('atmosphere');
    }

    // Rarity breakdown
    const rarityBreakdown: Record<string, number> = {};
    for (const song of album.songs) {
      rarityBreakdown[song.rarity] = (rarityBreakdown[song.rarity] ?? 0) + 1;
    }

    const health = await computeAggregateHealth(album.songs.map((s) => s.id));

    res.json({ band, album, avgSpectrum, strongestAxis, mostComplexTrack, mostAtmosphericTrack, rarityBreakdown, health });
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
      musicScore,
      bandScoredSongs,
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

      // Musical Structure score (Rhythm Lab) — read-only lookup, never triggers
      // AI generation from a public page view. Admins generate it explicitly
      // via the admin action, which hits the existing analysis service directly.
      prisma.songMusicScore.findUnique({ where: { songId } }),

      // Other scored songs in the same band, for "Similar by Spectrum" —
      // only meaningful (and only fetched) when this song itself has a score.
      song.score
        ? prisma.song.findMany({
            where: { bandId: song.bandId, id: { not: songId }, score: { isNot: null } },
            select: {
              id: true, title: true, slug: true,
              album: { select: { title: true, slug: true } },
              score: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // "Similar by Spectrum" — Euclidean distance across the 6 axes. Requires
    // at least 3 comparable (scored) songs in the band or the section stays
    // as a placeholder rather than showing a token 1-2 item list.
    let relatedBySpectrum: Array<{ id: string; title: string; slug: string; album: { title: string; slug: string } | null; distance: number }> = [];
    if (song.score && bandScoredSongs.length >= 3) {
      const base = song.score;
      relatedBySpectrum = bandScoredSongs
        .map((s) => {
          const sc = s.score!;
          const distance = Math.sqrt(
            SCORE_AXES.reduce((sum, axis) => sum + (sc[axis] - base[axis]) ** 2, 0),
          );
          return { id: s.id, title: s.title, slug: s.slug, album: s.album, distance };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4);
    }

    const health = await computeSongHealth({
      songId,
      albumId: song.albumId,
      trackNumber: song.trackNumber,
      durationSeconds: song.durationSeconds,
      hasLyrics: song.lyrics.length > 0,
      isInstrumental: song.isInstrumental,
      hasScore: !!song.score,
      scoreSource: song.score?.source ?? null,
      scoreUpdatedAt: song.score?.updatedAt.toISOString() ?? null,
      hasMusicScore: !!musicScore,
      musicScoreUpdatedAt: musicScore?.updatedAt.toISOString() ?? null,
      hasLiveProfile: !!song.bandRpgProfile,
    });

    res.json({
      song, collectedCount, albumSiblings, bandRarityCounts, relatedByRarity, liveCache,
      musicScore, relatedBySpectrum, health,
    });
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

    // How many of the user's setlists feature this song
    const setlistCount = await prisma.bandRpgSetlistSong.count({
      where: { songId, setlist: { userId } },
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
      setlistCount,
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

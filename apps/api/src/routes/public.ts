import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { userRatingService } from '../services/userRatingService.js';

// Read-only public endpoints — no write access, no auth required.
// Safe to share. Returns only what viewers need to see.
export const publicRouter = Router();

publicRouter.get('/bands', async (_req, res, next) => {
  try {
    const bands = await prisma.band.findMany({
      include: { _count: { select: { albums: true, songs: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(bands);
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/bands/:slug', async (req, res, next) => {
  try {
    const band = await prisma.band.findUnique({
      where: { slug: req.params['slug']! },
      include: {
        albums: { orderBy: [{ year: 'asc' }, { title: 'asc' }] },
        _count: { select: { albums: true, songs: true } },
      },
    });
    if (!band) { res.status(404).json({ error: 'Band not found' }); return; }
    res.json(band);
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/bands/:slug/albums', async (req, res, next) => {
  try {
    const band = await prisma.band.findUnique({ where: { slug: req.params['slug']! } });
    if (!band) { res.status(404).json({ error: 'Band not found' }); return; }

    const albums = await prisma.album.findMany({
      where: { bandId: band.id },
      include: {
        songs: {
          orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
          include: {
            score: true,
            lyrics: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
      orderBy: [{ year: 'asc' }, { title: 'asc' }],
    });
    res.json(albums);
  } catch (e) {
    next(e);
  }
});

publicRouter.get('/songs/:id', async (req, res, next) => {
  try {
    const song = await prisma.song.findUnique({
      where: { id: req.params['id']! },
      include: {
        band: true,
        album: true,
        score: true,
        lyrics: { where: { isPrimary: true }, take: 1 },
      },
    });
    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }
    res.json(song);
  } catch (e) {
    next(e);
  }
});

// GET /api/public/community?songIds=id1,id2,id3
// Batch community averages — no auth required
publicRouter.get('/community', async (req, res, next) => {
  try {
    const raw = typeof req.query['songIds'] === 'string' ? req.query['songIds'] : '';
    const songIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    res.json(await userRatingService.getCommunityRatings(songIds));
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/public/albums/:albumId/spectrum
// All songs in an album with core + AI + community axis scores — powers the
// AlbumRadarCycler widget and the /share/albums/:albumId page.
// ---------------------------------------------------------------------------
publicRouter.get('/albums/:albumId/spectrum', async (req, res, next) => {
  try {
    const album = await prisma.album.findUnique({
      where: { id: req.params['albumId']! },
      include: {
        band: { select: { id: true, name: true, slug: true } },
        songs: {
          orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }],
          include: {
            score: {
              select: { aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true },
            },
            aiSpectrum: {
              select: { aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true },
            },
            ratings: {
              select: { aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true },
            },
          },
        },
      },
    });

    if (!album) { res.status(404).json({ error: 'Album not found' }); return; }

    type AxMap = { aggression: number; complexity: number; atmosphere: number; emotion: number; psychedelic: number; concept: number };

    function avg(rows: AxMap[]): AxMap | null {
      if (rows.length === 0) return null;
      const s = { aggression: 0, complexity: 0, atmosphere: 0, emotion: 0, psychedelic: 0, concept: 0 };
      for (const r of rows) {
        s.aggression  += r.aggression;  s.complexity  += r.complexity;
        s.atmosphere  += r.atmosphere;  s.emotion     += r.emotion;
        s.psychedelic += r.psychedelic; s.concept     += r.concept;
      }
      const n = rows.length;
      return { aggression: s.aggression/n, complexity: s.complexity/n, atmosphere: s.atmosphere/n,
               emotion: s.emotion/n,       psychedelic: s.psychedelic/n, concept: s.concept/n };
    }

    res.json({
      album: { id: album.id, title: album.title, year: album.year, artworkUrl: album.artworkUrl, band: album.band },
      songs: album.songs.map((s) => ({
        id: s.id,
        title: s.title,
        trackNumber: s.trackNumber,
        coreScores:      s.score      ? { aggression: s.score.aggression,      complexity: s.score.complexity,      atmosphere: s.score.atmosphere,      emotion: s.score.emotion,      psychedelic: s.score.psychedelic,      concept: s.score.concept      } : null,
        aiScores:        s.aiSpectrum ? { aggression: s.aiSpectrum.aggression,  complexity: s.aiSpectrum.complexity,  atmosphere: s.aiSpectrum.atmosphere,  emotion: s.aiSpectrum.emotion,  psychedelic: s.aiSpectrum.psychedelic,  concept: s.aiSpectrum.concept  } : null,
        communityScores: avg(s.ratings),
        ratingCount:     s.ratings.length,
      })),
    });
  } catch (e) { next(e); }
});

// GET /api/public/cloud — all songs with tags, genre scores, and axis scores for the song cloud
publicRouter.get('/cloud', async (_req, res, next) => {
  try {
    const songs = await prisma.song.findMany({
      include: {
        band: { select: { name: true, slug: true } },
        songTags: { include: { tag: { select: { name: true, slug: true } } } },
        aiGenreSpectrum: {
          select: { metal: true, rock: true, pop: true, hiphop: true, electronic: true, folk: true },
        },
        score: {
          select: { aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true },
        },
        _count: { select: { ratings: true } },
      },
      orderBy: { title: 'asc' },
    });

    const result = songs.map((s) => ({
      id: s.id,
      title: s.title,
      bandId: s.bandId,
      bandName: s.band.name,
      bandSlug: s.band.slug,
      tags: s.songTags.map((st) => ({ name: st.tag.name, slug: st.tag.slug })),
      genreScores: s.aiGenreSpectrum ?? null,
      axisScores: s.score ?? null,
      ratingsCount: s._count.ratings,
    }));

    res.json(result);
  } catch (e) { next(e); }
});

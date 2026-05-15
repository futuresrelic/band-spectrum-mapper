import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { userRatingService } from '../services/userRatingService.js';
import { buildGraph, listScopeOptions, type GraphLayoutPreset } from '../services/songNodesService.js';

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

// ---------------------------------------------------------------------------
// GET /api/public/graph?preset=artist-universe&bandIds=id1,id2&albumId=id
// Public graph data — same service as admin Song Nodes, no auth required.
// ---------------------------------------------------------------------------

const PUBLIC_PRESETS: GraphLayoutPreset[] = [
  'artist-universe', 'album-cluster', 'theme-constellation',
  'emotional-similarity', 'lyrical-dna',
];

publicRouter.get('/graph', async (req, res, next): Promise<void> => {
  try {
    const preset = ((req.query['preset'] as string) || 'artist-universe') as GraphLayoutPreset;
    if (!PUBLIC_PRESETS.includes(preset)) {
      res.status(400).json({ error: `preset must be one of: ${PUBLIC_PRESETS.join(', ')}` });
      return;
    }
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const albumId    = (req.query['albumId']  as string) ?? '';
    const bandIds    = bandIdsRaw ? bandIdsRaw.split(',').filter(Boolean) : [];
    const data = await buildGraph(preset, {
      bandIds,
      ...(albumId ? { albumId } : {}),
    });
    res.json(data);
  } catch (e) { next(e); }
});

// GET /api/public/graph/scopes — bands + albums for the explore page selector
publicRouter.get('/graph/scopes', async (_req, res, next): Promise<void> => {
  try {
    res.json(await listScopeOptions());
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Word Hunt — challenge word + verification
// ---------------------------------------------------------------------------

// Shared stopwords list
const WORD_HUNT_STOPS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'is','was','are','were','be','been','being','have','has','had','do',
  'does','did','will','would','can','could','may','might','shall','should',
  'not','no','it','its','this','that','these','those','i','me','my','mine',
  'you','your','yours','he','she','we','they','them','their','what','which',
  'who','all','from','by','as','so','if','up','out','about','into','through',
  'than','more','just','like','when','there','here','then','now','how',
  'some','any','each','both','own','him','her','our','us','they','where',
  'also','even','still','yet','too','very','only','over','after','before',
  'down','get','got','let','say','said','know','think','see','look','come',
  'goes','gone','made','make','take','want','well','back','way','much',
  'one','two','three','four','five','six','seven','eight','nine','ten',
]);

// GET /api/public/word-hunt/challenge — returns a random challenge word
publicRouter.get('/word-hunt/challenge', async (_req, res, next): Promise<void> => {
  try {
    const lyrics = await prisma.lyric.findMany({
      where: { isPrimary: true },
      select: { text: true, songId: true },
    });

    // word → set of songIds that contain it
    const wordSongs = new Map<string, Set<string>>();
    for (const lyric of lyrics) {
      const words = lyric.text
        .replace(/\[[^\]]*\]/g, ' ')
        .toLowerCase()
        .match(/[a-z]{4,}/g) ?? [];
      for (const w of new Set(words)) {
        if (WORD_HUNT_STOPS.has(w)) continue;
        const s = wordSongs.get(w) ?? new Set<string>();
        s.add(lyric.songId);
        wordSongs.set(w, s);
      }
    }

    // Prefer words that appear in 2–8 songs — wide enough to be interesting,
    // narrow enough to be findable.
    const bucket = Array.from(wordSongs.entries())
      .filter(([, s]) => s.size >= 2 && s.size <= 8);

    if (bucket.length === 0) {
      res.status(404).json({ error: 'Not enough lyric data to generate a challenge' });
      return;
    }

    const [word, songs] = bucket[Math.floor(Math.random() * bucket.length)]!;
    res.json({ word, songCount: songs.size });
  } catch (e) { next(e); }
});

// GET /api/public/word-hunt/verify?word=X&songId=Y
publicRouter.get('/word-hunt/verify', async (req, res, next): Promise<void> => {
  try {
    const word   = ((req.query['word']   as string) ?? '').toLowerCase().trim();
    const songId = ((req.query['songId'] as string) ?? '').trim();

    if (!word || !songId) {
      res.status(400).json({ error: 'word and songId are required' });
      return;
    }

    const lyric = await prisma.lyric.findFirst({
      where: { songId, isPrimary: true },
      select: { text: true },
    });

    if (!lyric) {
      res.json({ found: false, hasLyrics: false });
      return;
    }

    const words = new Set(
      lyric.text.replace(/\[[^\]]*\]/g, ' ').toLowerCase().match(/[a-z]+/g) ?? [],
    );

    res.json({ found: words.has(word), hasLyrics: true });
  } catch (e) { next(e); }
});

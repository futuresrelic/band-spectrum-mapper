import { Router } from 'express';
import OpenAI from 'openai';
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

// GET /api/public/word-hunt/challenge?bandIds=id1,id2 — returns a random challenge word
publicRouter.get('/word-hunt/challenge', async (req, res, next): Promise<void> => {
  try {
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').filter(Boolean) : [];

    const lyrics = await prisma.lyric.findMany({
      where: {
        isPrimary: true,
        ...(bandIds.length && { song: { bandId: { in: bandIds } } }),
      },
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

// GET /api/public/word-hunt/leaderboard?limit=10 — top scores by points
publicRouter.get('/word-hunt/leaderboard', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt((req.query['limit'] as string) ?? '10', 10) || 10));
    const top = await prisma.wordHuntScore.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      include: { user: { select: { name: true, username: true, avatarUrl: true } } },
    });
    res.json(top.map((s, i) => ({
      rank: i + 1,
      playerName: s.user.username ?? s.user.name ?? 'Player',
      avatarUrl: s.user.avatarUrl,
      word: s.word,
      score: s.score,
      attempts: s.attempts,
      wrongCount: s.wrongCount,
      timeSec: s.timeSec,
      createdAt: s.createdAt,
    })));
  } catch (e) { next(e); }
});

// GET /api/public/word-hunt/reveal?word=X&bandIds=id1,id2
// Returns all songs containing the word — used for the post-give-up reveal.
publicRouter.get('/word-hunt/reveal', async (req, res, next): Promise<void> => {
  try {
    const word       = ((req.query['word']    as string) ?? '').toLowerCase().trim();
    const bandIdsRaw = ((req.query['bandIds'] as string) ?? '');
    const bandIds    = bandIdsRaw ? bandIdsRaw.split(',').filter(Boolean) : [];

    if (!word) { res.status(400).json({ error: 'word is required' }); return; }

    const songs = await prisma.song.findMany({
      where: {
        ...(bandIds.length && { bandId: { in: bandIds } }),
        lyrics: { some: { isPrimary: true } },
      },
      include: {
        lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
        band:   { select: { name: true } },
      },
    });

    const results = songs
      .filter((s) => {
        const text = s.lyrics[0]?.text ?? '';
        const wordSet = new Set(
          text.replace(/\[[^\]]*\]/g, ' ').toLowerCase().match(/[a-z]+/g) ?? [],
        );
        return wordSet.has(word);
      })
      .map((s) => ({ id: `song:${s.id}`, title: s.title, bandName: s.band.name }));

    res.json({ songs: results });
  } catch (e) { next(e); }
});

// ── Lyrics Universe ─────────────────────────────────────────────────────────
// Returns albums with primary lyrics per song, for the 3D lyrics spiral view.

publicRouter.get('/lyrics-universe', async (req, res, next) => {
  try {
    const bandIdsRaw = ((req.query['bandIds'] as string) ?? '');
    const bandIds    = bandIdsRaw ? bandIdsRaw.split(',').filter(Boolean) : [];

    const albums = await prisma.album.findMany({
      where: {
        ...(bandIds.length ? { bandId: { in: bandIds } } : {}),
        songs: { some: { lyrics: { some: { isPrimary: true } } } },
      },
      include: {
        band: { select: { name: true } },
        songs: {
          where: { lyrics: { some: { isPrimary: true } } },
          take: 12,
          orderBy: { trackNumber: 'asc' },
          include: {
            lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
          },
        },
      },
      orderBy: { year: 'asc' },
      take: 8,
    });

    const result = albums.map(a => ({
      id:       a.id,
      title:    a.title,
      year:     a.year,
      bandName: a.band.name,
      songs: a.songs.map(s => ({
        id:        s.id,
        title:     s.title,
        lyricText: s.lyrics[0]?.text ?? '',
      })),
    }));

    res.json({ albums: result });
  } catch (e) { next(e); }
});

// ── AI Director ────────────────────────────────────────────────────────────────
// POST /api/public/cinema-ai
// Interprets a natural-language prompt and returns Cinema scene settings.
publicRouter.post('/cinema-ai', async (req, res, next): Promise<void> => {
  try {
    const { prompt } = req.body as { prompt?: string };
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      res.status(400).json({ ok: false, error: 'prompt required' }); return;
    }

    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      res.status(503).json({ ok: false, error: 'AI not configured' }); return;
    }

    const openai = new OpenAI({ apiKey });

    const system = `You are the AI Director for Band Spectrum Mapper, a music visualization tool.
Your job: interpret the user's creative vision and return ONLY a JSON object (no markdown, no explanation) choosing the best visualization settings.

Available arrangeMode values: "natural", "radial", "sphere", "galaxy", "solar-system", "helix", "emotional-spectrum", "genre-web", "fibonacci-torus", "fractal-tree", "mandala", "wave", "lissajous", "crystal", "fibonacci-spiral"
Available themeId values: "default", "sepia", "negative", "sketch", "solarized", "posterized", "comic", "depth", "neon", "outlines", "bokeh", "halftone", "dali", "escher"
Available cameraPreset values: "top", "side", "isometric", "dramatic", "close"
Available node types to hide: "artist", "album", "song", "keyword", "theme", "tag", "emotion"

Guidance:
- Psychedelic/cosmic/trippy → lissajous or fibonacci-torus, neon or bokeh
- Organic/earthy/nature → fractal-tree or fibonacci-spiral, sepia or dali
- Structured/mathematical/precise → mandala or crystal, solarized or sketch or escher
- Emotional/feeling/soul → emotional-spectrum or mandala, default or bokeh
- Solar/planetary/universe → solar-system, default or neon
- Genre/music taxonomy → genre-web, solarized or default
- Dark/mysterious → galaxy or sphere, depth or outlines
- Bright/comic/energetic → radial or wave, comic or posterized

Return exactly this JSON structure:
{
  "arrangeMode": "<one of the values above>",
  "themeId": "<one of the values above>",
  "orbitSpeed": <number 0.3–3.0>,
  "hiddenTypes": [],
  "description": "<1–2 sentence poetic description of what you created>",
  "cameraPreset": "<one of the values above>"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: prompt.slice(0, 500) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 280,
      temperature: 0.85,
    });

    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(completion.choices[0]?.message.content ?? '{}');
    } catch { /* leave empty */ }

    res.json({ ok: true, settings });
  } catch (e) { next(e); }
});

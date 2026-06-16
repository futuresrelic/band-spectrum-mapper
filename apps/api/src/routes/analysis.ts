import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { analysisService } from '../services/analysisService.js';
import { aiAnalysisService } from '../services/aiAnalysisService.js';
import { songResearchService } from '../services/songResearchService.js';
import { songContextService } from '../services/songContextService.js';
import { albumContextService } from '../services/albumContextService.js';
import { bandContextService } from '../services/bandContextService.js';
import { genreSpectrumService } from '../services/genreSpectrumService.js';
import { themeAnalysisService } from '../services/themeAnalysisService.js';
import { aiTagService } from '../services/aiTagService.js';
import { scoreService } from '../services/scoreService.js';
import { songMusicScoreService } from '../services/songMusicScoreService.js';
import { analysisQuerySchema, compareQuerySchema } from '@band-spectrum-mapper/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const analysisRouter = Router();

// Lyrics analysis
analysisRouter.get('/lyrics', async (req, res, next) => {
  try {
    const parsed = analysisQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
      return;
    }
    res.json(await analysisService.analyze(parsed.data));
  } catch (e) { next(e); }
});

// Compare two selections
analysisRouter.post('/compare', async (req, res, next) => {
  try {
    const parsed = compareQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid comparison query', details: parsed.error.flatten() });
      return;
    }
    res.json(await analysisService.compare(parsed.data));
  } catch (e) { next(e); }
});

// Score aggregations
analysisRouter.get('/scores/band/:bandId', async (req, res, next) => {
  try {
    res.json(await scoreService.averagesByBand(req.params['bandId']!));
  } catch (e) { next(e); }
});

analysisRouter.get('/scores/album/:albumId', async (req, res, next) => {
  try {
    res.json(await scoreService.averagesByAlbum(req.params['albumId']!));
  } catch (e) { next(e); }
});

// AI lyric analysis
analysisRouter.get('/ai/:songId', async (req, res, next) => {
  try {
    res.json(await aiAnalysisService.getOrCreate(req.params['songId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/ai/:songId/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await aiAnalysisService.regenerate(req.params['songId']!));
  } catch (e) { next(e); }
});

// Core Score — emotional human-listener scoring → SongAxisScore
analysisRouter.post('/ai/:songId/core-score/generate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await aiAnalysisService.generateCoreScore(req.params['songId']!));
  } catch (e) { next(e); }
});

// AI spectrum scoring
analysisRouter.get('/ai/:songId/spectrum', async (req, res, next) => {
  try {
    res.json(await aiAnalysisService.getOrCreateSpectrum(req.params['songId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/ai/:songId/spectrum/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await aiAnalysisService.regenerateSpectrum(req.params['songId']!));
  } catch (e) { next(e); }
});

// Song research (Wikipedia + AI summary)
analysisRouter.get('/ai/:songId/research', async (req, res, next) => {
  try {
    res.json(await songResearchService.getOrCreate(req.params['songId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/ai/:songId/research/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await songResearchService.regenerate(req.params['songId']!));
  } catch (e) { next(e); }
});

// Deep context synthesis (lyrics + research + scores + ratings)
analysisRouter.get('/ai/:songId/context', async (req, res, next) => {
  try {
    res.json(await songContextService.getOrCreate(req.params['songId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/ai/:songId/context/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await songContextService.regenerate(req.params['songId']!));
  } catch (e) { next(e); }
});

// AI genre accessibility spectrum — auto-generated, cached per song
analysisRouter.get('/ai/:songId/genre-spectrum', async (req, res, next) => {
  try {
    res.json(await genreSpectrumService.getOrCreate(req.params['songId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/ai/:songId/genre-spectrum/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await genreSpectrumService.regenerate(req.params['songId']!));
  } catch (e) { next(e); }
});

// AI tags — generate thematic tags and apply to song
analysisRouter.post('/ai/:songId/tags', requireAuth, async (req, res, next) => {
  try {
    const tags = await aiTagService.generateAndApply(req.params['songId']!);
    res.json({ tags });
  } catch (e) { next(e); }
});

// GET current tags for a song (returns [{name, description}])
analysisRouter.get('/ai/:songId/tags', async (req, res, next) => {
  try {
    const tags = await aiTagService.getTags(req.params['songId']!);
    res.json({ tags });
  } catch (e) { next(e); }
});

// Album context analysis — synthesizes all song analyses into an album narrative
analysisRouter.get('/albums/:albumId/context', async (req, res, next) => {
  try {
    res.json(await albumContextService.getOrCreate(req.params['albumId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/albums/:albumId/context/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await albumContextService.regenerate(req.params['albumId']!));
  } catch (e) { next(e); }
});

// Band context analysis — synthesizes all album/song analyses into a band profile
analysisRouter.get('/bands/:bandId/context', async (req, res, next) => {
  try {
    res.json(await bandContextService.getOrCreate(req.params['bandId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/bands/:bandId/context/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await bandContextService.regenerate(req.params['bandId']!));
  } catch (e) { next(e); }
});

// Philosophical / thematic analysis — weighted 0.0–1.0 scores per theme category
analysisRouter.get('/ai/:songId/themes', async (req, res, next) => {
  try {
    res.json(await themeAnalysisService.getOrCreate(req.params['songId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/ai/:songId/themes/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await themeAnalysisService.regenerate(req.params['songId']!));
  } catch (e) { next(e); }
});

// Thematically similar songs via cosine similarity on theme vectors
// Optional ?bandId= query param to scope to a single artist
analysisRouter.get('/ai/:songId/themes/similar', async (req, res, next) => {
  try {
    const bandId = typeof req.query['bandId'] === 'string' ? req.query['bandId'] : undefined;
    res.json(await themeAnalysisService.getSimilar(req.params['songId']!, bandId));
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Musical Structure Spectrum — GET/regenerate
// ---------------------------------------------------------------------------
analysisRouter.get('/ai/:songId/music-score', async (req, res, next) => {
  try {
    res.json(await songMusicScoreService.getOrCreate(req.params['songId']!));
  } catch (e) { next(e); }
});

analysisRouter.post('/ai/:songId/music-score/regenerate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await songMusicScoreService.regenerate(req.params['songId']!));
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Audio Spectrum — most recent SongSpectrumAnalysis scores linked to a song
// Returns { aggression, complexity, atmosphere, emotion, psychedelic, concept }
// on a 0-10 scale (audio worker scores are 0-100, divided by 10).
// Returns null when no audio analysis is linked to the song.
// ---------------------------------------------------------------------------
analysisRouter.get('/ai/:songId/audio-spectrum', async (req, res, next) => {
  try {
    const songId = req.params['songId']!;
    const analysis = await prisma.songSpectrumAnalysis.findFirst({
      where: { songId },
      orderBy: { createdAt: 'desc' },
      select: { scores: true, songTitle: true, artistName: true, createdAt: true },
    });
    if (!analysis) { res.json(null); return; }

    const raw = analysis.scores as Record<string, number>;
    // Normalise 0-100 → 0-10, clamp to valid range
    const axes = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
    const normalised: Record<string, number> = {};
    for (const ax of axes) {
      const v = raw[ax];
      normalised[ax] = v !== undefined ? Math.min(10, Math.max(0, v / 10)) : 0;
    }
    res.json({
      ...normalised,
      songTitle:   analysis.songTitle,
      artistName:  analysis.artistName,
      analyzedAt:  analysis.createdAt,
    }); return;
  } catch (e) { next(e); }
});

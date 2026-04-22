import { Router } from 'express';
import { analysisService } from '../services/analysisService.js';
import { aiAnalysisService } from '../services/aiAnalysisService.js';
import { songResearchService } from '../services/songResearchService.js';
import { songContextService } from '../services/songContextService.js';
import { scoreService } from '../services/scoreService.js';
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

import { Router } from 'express';
import { analysisService } from '../services/analysisService.js';
import { aiAnalysisService } from '../services/aiAnalysisService.js';
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

// AI lyric analysis — GET returns cached, POST regenerates (admin only)
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

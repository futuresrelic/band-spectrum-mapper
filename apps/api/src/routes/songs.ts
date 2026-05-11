import { Router } from 'express';
import { songService } from '../services/songService.js';
import { lyricService } from '../services/lyricService.js';
import { scoreService } from '../services/scoreService.js';
import { aiLyricService } from '../services/aiLyricService.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  updateSongSchema,
  createLyricSchema,
  updateLyricSchema,
  upsertScoreSchema,
} from '@band-spectrum-mapper/shared';

export const songsRouter = Router();

// Global song search
songsRouter.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
    if (!q) { res.json([]); return; }
    res.json(await songService.search(q));
  } catch (e) { next(e); }
});

// Song CRUD
songsRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await songService.getById(req.params['id']!));
  } catch (e) { next(e); }
});

songsRouter.patch('/:id', validateBody(updateSongSchema), async (req, res, next) => {
  try {
    res.json(await songService.update(req.params['id']!, req.body));
  } catch (e) { next(e); }
});

songsRouter.delete('/:id', async (req, res, next) => {
  try {
    await songService.delete(req.params['id']!);
    res.status(204).end();
  } catch (e) { next(e); }
});

// Lyrics
songsRouter.get('/:songId/lyrics', async (req, res, next) => {
  try {
    res.json(await lyricService.listBySong(req.params['songId']!));
  } catch (e) { next(e); }
});

songsRouter.post('/:songId/lyrics', validateBody(createLyricSchema), async (req, res, next) => {
  try {
    res.status(201).json(await lyricService.create(req.params['songId']!, req.body));
  } catch (e) { next(e); }
});

// AI lyric recall — admin only, attempts to recall lyrics from GPT training data
songsRouter.post('/:songId/ai-lyrics', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const lyric = await aiLyricService.recallAndStore(req.params['songId']!);
    if (!lyric) {
      res.status(404).json({ error: 'Lyrics not found in AI training data for this song' });
      return;
    }
    res.status(201).json(lyric);
  } catch (e) { next(e); }
});

// Scores
songsRouter.get('/:songId/score', async (req, res, next) => {
  try {
    const score = await scoreService.getBySong(req.params['songId']!);
    if (!score) { res.status(404).json({ error: 'No score found for this song' }); return; }
    res.json(score);
  } catch (e) { next(e); }
});

songsRouter.put('/:songId/score', validateBody(upsertScoreSchema), async (req, res, next) => {
  try {
    res.json(await scoreService.upsert(req.params['songId']!, req.body));
  } catch (e) { next(e); }
});

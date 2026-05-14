/**
 * Song Spectrum Analyzer — Express routes.
 *
 * All routes require admin authentication.
 *
 * Feature flags:
 *   AUDIO_WORKER_URL   — enables audio analysis
 *   YOUTUBE_API_KEY    — enables YouTube metadata fetch
 */

import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import type { YouTubeMetadata } from '@band-spectrum-mapper/shared';
import {
  fetchYouTubeMetadata,
  analyzeAudio,
  createAnalysis,
  updateAnalysis,
  listAnalyses,
  getAnalysis,
  deleteAnalysis,
  computeFinalScore,
  isAudioWorkerConfigured,
  isYouTubeConfigured,
} from '../services/songSpectrumService.js';

export const songSpectrumRouter = Router();

// Auth guard for all routes
songSpectrumRouter.use(requireAuth);
songSpectrumRouter.use(requireAdmin);

// Multer: keep file in memory, max 150 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Feature status
// ---------------------------------------------------------------------------

songSpectrumRouter.get('/status', (_req, res): void => {
  res.json({
    audioWorker: isAudioWorkerConfigured(),
    youtubeApi: isYouTubeConfigured(),
  });
});

// ---------------------------------------------------------------------------
// YouTube metadata fetch
// ---------------------------------------------------------------------------

songSpectrumRouter.post('/youtube-metadata', async (req, res, next): Promise<void> => {
  try {
    const { url } = req.body as { url?: string };
    if (!url?.trim()) {
      res.status(400).json({ error: 'url is required' });
      return;
    }
    const metadata = await fetchYouTubeMetadata(url.trim());
    res.json(metadata);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) {
      res.status((err as Error & { statusCode: number }).statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Audio file upload + analysis
// ---------------------------------------------------------------------------

songSpectrumRouter.post(
  '/analyze-audio',
  upload.single('audio'),
  async (req, res, next): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided (field name: audio)' });
        return;
      }

      const { songTitle, artistName, youtubeUrl, analysisId, lyricsContext } =
        req.body as {
          songTitle?: string;
          artistName?: string;
          youtubeUrl?: string;
          analysisId?: string;
          lyricsContext?: string;
        };

      if (!songTitle?.trim()) {
        res.status(400).json({ error: 'songTitle is required' });
        return;
      }
      if (!artistName?.trim()) {
        res.status(400).json({ error: 'artistName is required' });
        return;
      }

      const { analysis, scores } = await analyzeAudio(
        req.file.buffer,
        req.file.originalname,
        lyricsContext ?? '',
      );

      const flatScores: Record<string, number> = {};
      for (const [axis, detail] of Object.entries(scores)) {
        flatScores[axis] = detail.score;
      }

      if (analysisId) {
        const updated = await updateAnalysis(analysisId, {
          audioFileName: req.file.originalname,
          audioAnalysis: analysis,
          scores: flatScores,
          scoreBreakdown: scores,
        });
        res.json(updated);
        return;
      }

      const created = await createAnalysis({
        songTitle: songTitle.trim(),
        artistName: artistName.trim(),
        ...(youtubeUrl?.trim() ? { youtubeUrl: youtubeUrl.trim() } : {}),
        audioFileName: req.file.originalname,
        audioAnalysis: analysis,
        scores: flatScores,
        scoreBreakdown: scores,
      });

      res.status(201).json(created);
    } catch (err: unknown) {
      if (err instanceof Error && 'statusCode' in err) {
        res.status((err as Error & { statusCode: number }).statusCode).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Create analysis stub (e.g. after YT fetch, before audio upload)
// ---------------------------------------------------------------------------

songSpectrumRouter.post('/analyses', async (req, res, next): Promise<void> => {
  try {
    const { songTitle, artistName, youtubeUrl, ytMetadata, songId } =
      req.body as {
        songTitle?: string;
        artistName?: string;
        youtubeUrl?: string;
        ytMetadata?: unknown;
        songId?: string;
      };

    if (!songTitle?.trim()) {
      res.status(400).json({ error: 'songTitle is required' });
      return;
    }
    if (!artistName?.trim()) {
      res.status(400).json({ error: 'artistName is required' });
      return;
    }

    const created = await createAnalysis({
      songTitle: songTitle.trim(),
      artistName: artistName.trim(),
      ...(youtubeUrl?.trim() ? { youtubeUrl: youtubeUrl.trim() } : {}),
      ...(ytMetadata ? { ytMetadata: ytMetadata as YouTubeMetadata } : {}),
      ...(songId ? { songId } : {}),
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// List all analyses
// ---------------------------------------------------------------------------

songSpectrumRouter.get('/analyses', async (_req, res, next): Promise<void> => {
  try {
    res.json(await listAnalyses());
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Get a single analysis
// ---------------------------------------------------------------------------

songSpectrumRouter.get('/analyses/:id', async (req, res, next): Promise<void> => {
  try {
    const item = await getAnalysis(req.params['id']!);
    if (!item) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(item);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Final score — optionally enrich with linked song lyrics
// ---------------------------------------------------------------------------

songSpectrumRouter.post('/final-score', async (req, res, next): Promise<void> => {
  try {
    const { analysisId, songId } = req.body as {
      analysisId?: string;
      songId?: string;
    };
    if (!analysisId?.trim()) {
      res.status(400).json({ error: 'analysisId is required' });
      return;
    }

    const result = await computeFinalScore(
      analysisId.trim(),
      songId?.trim() || undefined,
    );
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && 'statusCode' in err) {
      res.status((err as Error & { statusCode: number }).statusCode).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Delete an analysis
// ---------------------------------------------------------------------------

songSpectrumRouter.delete('/analyses/:id', async (req, res, next): Promise<void> => {
  try {
    await deleteAnalysis(req.params['id']!);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Patch an analysis (link to library song)
// ---------------------------------------------------------------------------

songSpectrumRouter.patch('/analyses/:id', async (req, res, next): Promise<void> => {
  try {
    const { songId } = req.body as { songId?: string | null };
    const patch =
      songId === undefined
        ? {}
        : { songId: songId };   // null means "unlink", string means "link"
    const updated = await updateAnalysis(req.params['id']!, patch);
    res.json(updated);
  } catch (err) { next(err); }
});

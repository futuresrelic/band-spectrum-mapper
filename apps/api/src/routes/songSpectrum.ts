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
import { prisma } from '../lib/prisma.js';
import type { YouTubeMetadata, RhythmBand } from '@band-spectrum-mapper/shared';
import {
  fetchYouTubeMetadata,
  analyzeAudio,
  analyzeAudioFromYouTube,
  analyzeRhythmBands,
  analyzeRhythmBandsFromYouTube,
  fetchMusicBrainzData,
  fetchRhythmResearch,
  createAnalysis,
  updateAnalysis,
  listAnalyses,
  getAnalysis,
  deleteAnalysis,
  computeFinalScore,
  isAudioWorkerConfigured,
  isYouTubeConfigured,
  isYouTubeAudioEnabled,
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
    youtubeAudio: isYouTubeAudioEnabled(),
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

      const { songTitle, artistName, youtubeUrl, analysisId, lyricsContext, analysisNotes, songId } =
        req.body as {
          songTitle?: string;
          artistName?: string;
          youtubeUrl?: string;
          analysisId?: string;
          lyricsContext?: string;
          analysisNotes?: string;
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

      // Combine analyst notes with any lyrics context — scorer uses both
      const combinedContext = [analysisNotes ?? '', lyricsContext ?? '']
        .filter(Boolean).join('\n\n');

      // Run audio analysis, MusicBrainz lookup, and GPT rhythm research in parallel
      const artist = (artistName ?? '').trim();
      const title  = (songTitle ?? '').trim();
      const [{ analysis: rawAnalysis, scores }, mbData, rhythmData] = await Promise.all([
        analyzeAudio(req.file.buffer, req.file.originalname, combinedContext),
        fetchMusicBrainzData(artist, title),
        fetchRhythmResearch(artist, title),
      ]);

      // Merge analyst notes, MusicBrainz data, and rhythm research into the analysis object
      const analysis = {
        ...rawAnalysis,
        ...(analysisNotes?.trim() ? { userNotes: analysisNotes.trim() } : {}),
        ...(mbData ? { musicBrainzData: mbData } : {}),
        ...(rhythmData ? { rhythmResearch: rhythmData } : {}),
      };

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
        ...(songId?.trim() ? { songId: songId.trim() } : {}),
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
// YouTube audio analysis — download via yt-dlp + run analysis pipeline.
// Gate: ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true (local / personal use only).
// ---------------------------------------------------------------------------

songSpectrumRouter.post('/analyze-youtube-audio', async (req, res, next): Promise<void> => {
  try {
    const { youtubeUrl, songTitle, artistName, analysisId, lyricsContext, analysisNotes, songId } =
      req.body as {
        youtubeUrl?: string;
        songTitle?: string;
        artistName?: string;
        analysisId?: string;
        lyricsContext?: string;
        analysisNotes?: string;
        songId?: string;
      };

    if (!youtubeUrl?.trim()) {
      res.status(400).json({ error: 'youtubeUrl is required' });
      return;
    }
    if (!songTitle?.trim()) {
      res.status(400).json({ error: 'songTitle is required' });
      return;
    }
    if (!artistName?.trim()) {
      res.status(400).json({ error: 'artistName is required' });
      return;
    }

    const combinedContext = [analysisNotes ?? '', lyricsContext ?? '']
      .filter(Boolean).join('\n\n');

    const artist = artistName.trim();
    const title  = songTitle.trim();

    const [{ analysis: rawAnalysis, scores }, mbData, rhythmData] = await Promise.all([
      analyzeAudioFromYouTube(youtubeUrl.trim(), combinedContext),
      fetchMusicBrainzData(artist, title),
      fetchRhythmResearch(artist, title),
    ]);

    const analysis = {
      ...rawAnalysis,
      ...(analysisNotes?.trim() ? { userNotes: analysisNotes.trim() } : {}),
      ...(mbData ? { musicBrainzData: mbData } : {}),
      ...(rhythmData ? { rhythmResearch: rhythmData } : {}),
    };

    const flatScores: Record<string, number> = {};
    for (const [axis, detail] of Object.entries(scores)) {
      flatScores[axis] = detail.score;
    }

    if (analysisId) {
      const updated = await updateAnalysis(analysisId, {
        audioFileName: `youtube:${youtubeUrl.trim()}`,
        audioAnalysis: analysis,
        scores: flatScores,
        scoreBreakdown: scores,
      });
      res.json(updated);
      return;
    }

    const created = await createAnalysis({
      songTitle: title,
      artistName: artist,
      youtubeUrl: youtubeUrl.trim(),
      ...(songId?.trim() ? { songId: songId.trim() } : {}),
      audioFileName: `youtube:${youtubeUrl.trim()}`,
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
});

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
// Push audio scores to the linked library song's Core spectrum
// Audio scores are 0–100; Core scores are 0–10 — divide by 10.
// ---------------------------------------------------------------------------

songSpectrumRouter.post('/analyses/:id/push-to-library', async (req, res, next): Promise<void> => {
  try {
    const item = await getAnalysis(req.params['id']!);
    if (!item) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }
    if (!item.songId) {
      res.status(400).json({ error: 'Analysis is not linked to a library song' });
      return;
    }
    if (!Object.keys(item.scores).length) {
      res.status(400).json({ error: 'Analysis has no scores to push' });
      return;
    }

    const song = await prisma.song.findUnique({ where: { id: item.songId } });
    if (!song) {
      res.status(404).json({ error: 'Linked library song not found' });
      return;
    }

    // Convert 0–100 → 0–10 and upsert SongAxisScore (Core)
    const toCore = (v: number | undefined) => Math.round((v ?? 0) / 10 * 10) / 10;
    await prisma.songAxisScore.upsert({
      where: { songId: item.songId },
      create: {
        songId: item.songId,
        bandId: song.bandId,
        aggression:  toCore(item.scores['aggression']),
        complexity:  toCore(item.scores['complexity']),
        atmosphere:  toCore(item.scores['atmosphere']),
        emotion:     toCore(item.scores['emotion']),
        psychedelic: toCore(item.scores['psychedelic']),
        concept:     toCore(item.scores['concept']),
        notes: `Pushed from Song Spectrum Analyzer (audio analysis of "${item.audioFileName ?? 'audio'}")`,
      },
      update: {
        aggression:  toCore(item.scores['aggression']),
        complexity:  toCore(item.scores['complexity']),
        atmosphere:  toCore(item.scores['atmosphere']),
        emotion:     toCore(item.scores['emotion']),
        psychedelic: toCore(item.scores['psychedelic']),
        concept:     toCore(item.scores['concept']),
        notes: `Pushed from Song Spectrum Analyzer (audio analysis of "${item.audioFileName ?? 'audio'}")`,
      },
    });

    res.json({
      ok: true,
      songId: item.songId,
      pushed: {
        aggression:  toCore(item.scores['aggression']),
        complexity:  toCore(item.scores['complexity']),
        atmosphere:  toCore(item.scores['atmosphere']),
        emotion:     toCore(item.scores['emotion']),
        psychedelic: toCore(item.scores['psychedelic']),
        concept:     toCore(item.scores['concept']),
      },
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Rhythm band analysis — file upload path
// ---------------------------------------------------------------------------

songSpectrumRouter.post(
  '/rhythm-bands',
  upload.single('audio'),
  async (req, res, next): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No audio file provided (field name: audio)' });
        return;
      }

      const { bands: bandsRaw } = req.body as { bands?: string };
      let bands: RhythmBand[] = [];
      if (bandsRaw) {
        try {
          const parsed = JSON.parse(bandsRaw) as unknown[];
          if (Array.isArray(parsed)) {
            bands = parsed.map((b) => {
              const band = b as Record<string, unknown>;
              return {
                label: String(band['label'] ?? 'Band'),
                minHz: Number(band['minHz'] ?? 0),
                maxHz: Number(band['maxHz'] ?? 1000),
              };
            });
          }
        } catch {
          // use defaults
        }
      }

      const result = await analyzeRhythmBands(req.file.buffer, req.file.originalname, bands);
      res.json(result);
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
// Rhythm band analysis — YouTube audio path (local / personal use only)
// ---------------------------------------------------------------------------

songSpectrumRouter.post('/rhythm-bands-youtube', async (req, res, next): Promise<void> => {
  try {
    const { youtubeUrl, bands: bandsRaw } = req.body as {
      youtubeUrl?: string;
      bands?: unknown[];
    };

    if (!youtubeUrl?.trim()) {
      res.status(400).json({ error: 'youtubeUrl is required' });
      return;
    }

    const bands: RhythmBand[] = Array.isArray(bandsRaw)
      ? bandsRaw.map((b) => {
          const band = b as Record<string, unknown>;
          return {
            label: String(band['label'] ?? 'Band'),
            minHz: Number(band['minHz'] ?? 0),
            maxHz: Number(band['maxHz'] ?? 1000),
          };
        })
      : [];

    const result = await analyzeRhythmBandsFromYouTube(youtubeUrl.trim(), bands);
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

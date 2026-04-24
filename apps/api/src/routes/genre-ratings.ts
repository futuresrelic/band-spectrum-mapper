import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { GENRE_PERSPECTIVES } from '@band-spectrum-mapper/shared';

export const genreRatingsRouter = Router();

const VALID_PERSPECTIVES = new Set<string>(GENRE_PERSPECTIVES.map((p) => p.id));

// ---------------------------------------------------------------------------
// GET /api/genre-ratings/songs/:songId
// Public — returns community aggregates + current user's ratings (if authed).
// ---------------------------------------------------------------------------
genreRatingsRouter.get('/songs/:songId', async (req, res, next) => {
  try {
    const { songId } = req.params as { songId: string };

    // Resolve auth token if present (optional — don't fail if absent)
    let userId: string | null = null;
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken');
        const secret = process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production';
        const payload = jwt.default.verify(authHeader.slice(7), secret) as { userId: string };
        userId = payload.userId;
      } catch {
        // invalid token — treat as guest
      }
    }

    const [genreAggregates, analysisAggregates, myGenre, myAnalysis] = await Promise.all([
      // Community genre averages grouped by perspective
      prisma.songGenreRating.groupBy({
        by: ['perspective'],
        where: { songId },
        _avg: { score: true },
        _count: { score: true },
      }),
      // Community analysis helpful ratio
      prisma.songAnalysisRating.groupBy({
        by: ['helpful'],
        where: { songId },
        _count: { helpful: true },
      }),
      // Current user's genre ratings for this song
      userId
        ? prisma.songGenreRating.findMany({ where: { songId, userId } })
        : Promise.resolve([]),
      // Current user's analysis rating
      userId
        ? prisma.songAnalysisRating.findUnique({ where: { userId_songId: { userId, songId } } })
        : Promise.resolve(null),
    ]);

    const helpfulCount = analysisAggregates.find((r) => r.helpful)?._count.helpful ?? 0;
    const notHelpfulCount = analysisAggregates.find((r) => !r.helpful)?._count.helpful ?? 0;

    res.json({
      genreAggregates: genreAggregates.map((r) => ({
        perspective: r.perspective,
        avg: r._avg.score ?? 0,
        count: r._count.score,
      })),
      analysisAggregate: {
        helpful: helpfulCount,
        notHelpful: notHelpfulCount,
        total: helpfulCount + notHelpfulCount,
      },
      myGenreRatings: myGenre.map((r) => ({ perspective: r.perspective, score: r.score })),
      myAnalysisRating: myAnalysis ? myAnalysis.helpful : null,
    });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/genre-ratings/songs/:songId/perspectives/:perspective
// Authenticated — upsert a genre perspective score (1–10).
// ---------------------------------------------------------------------------
genreRatingsRouter.put(
  '/songs/:songId/perspectives/:perspective',
  requireAuth,
  async (req, res, next) => {
    try {
      const { songId, perspective } = req.params as { songId: string; perspective: string };
      const userId = req.user!.userId;

      if (!VALID_PERSPECTIVES.has(perspective)) {
        throw new HttpError(400, `Invalid perspective "${perspective}"`);
      }

      const { score } = req.body as { score?: number };
      if (typeof score !== 'number' || score < 1 || score > 10 || !Number.isInteger(score)) {
        throw new HttpError(400, 'score must be an integer between 1 and 10');
      }

      const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
      if (!song) throw new HttpError(404, 'Song not found');

      const rating = await prisma.songGenreRating.upsert({
        where: { userId_songId_perspective: { userId, songId, perspective } },
        create: { userId, songId, perspective, score },
        update: { score },
      });

      res.json(rating);
    } catch (e) {
      next(e);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/genre-ratings/songs/:songId/perspectives/:perspective
// Authenticated — remove a genre perspective rating.
// ---------------------------------------------------------------------------
genreRatingsRouter.delete(
  '/songs/:songId/perspectives/:perspective',
  requireAuth,
  async (req, res, next) => {
    try {
      const { songId, perspective } = req.params as { songId: string; perspective: string };
      const userId = req.user!.userId;

      await prisma.songGenreRating.deleteMany({ where: { userId, songId, perspective } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /api/genre-ratings/songs/:songId/analysis
// Authenticated — upsert "was this analysis helpful?" vote.
// Body: { helpful: boolean }
// ---------------------------------------------------------------------------
genreRatingsRouter.put('/songs/:songId/analysis', requireAuth, async (req, res, next) => {
  try {
    const { songId } = req.params as { songId: string };
    const userId = req.user!.userId;

    const { helpful } = req.body as { helpful?: boolean };
    if (typeof helpful !== 'boolean') {
      throw new HttpError(400, 'helpful must be a boolean');
    }

    const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
    if (!song) throw new HttpError(404, 'Song not found');

    const rating = await prisma.songAnalysisRating.upsert({
      where: { userId_songId: { userId, songId } },
      create: { userId, songId, helpful },
      update: { helpful },
    });

    res.json(rating);
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/genre-ratings/songs/:songId/analysis
// Authenticated — remove analysis helpfulness vote.
// ---------------------------------------------------------------------------
genreRatingsRouter.delete('/songs/:songId/analysis', requireAuth, async (req, res, next) => {
  try {
    const { songId } = req.params as { songId: string };
    const userId = req.user!.userId;

    await prisma.songAnalysisRating.deleteMany({ where: { userId, songId } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

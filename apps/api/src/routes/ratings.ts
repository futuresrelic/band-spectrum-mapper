import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { userRatingService } from '../services/userRatingService.js';
import { userMusicRatingService } from '../services/userMusicRatingService.js';
import { upsertUserRatingSchema, upsertUserMusicRatingSchema } from '@band-spectrum-mapper/shared';

export const ratingsRouter = Router();

// GET /api/ratings/songs/:songId
// Returns the current user's rating + community aggregate for one song
ratingsRouter.get('/songs/:songId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { songId } = req.params as { songId: string };
    const [myRating, communityRating] = await Promise.all([
      userRatingService.getMyRating(userId, songId),
      userRatingService.getCommunityRating(songId),
    ]);
    res.json({ myRating, communityRating });
  } catch (e) { next(e); }
});

// PUT /api/ratings/songs/:songId
// Upsert current user's rating for a song
ratingsRouter.put('/songs/:songId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { songId } = req.params as { songId: string };
    const data = upsertUserRatingSchema.parse(req.body);
    const rating = await userRatingService.upsert(userId, songId, data);
    res.json(rating);
  } catch (e) { next(e); }
});

// GET /api/ratings/me/songs?songIds=id1,id2,id3
// Batch-fetch current user's ratings for multiple songs
ratingsRouter.get('/me/songs', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const raw = typeof req.query['songIds'] === 'string' ? req.query['songIds'] : '';
    const songIds = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const ratings = await userRatingService.getMyRatings(userId, songIds);
    res.json(ratings);
  } catch (e) { next(e); }
});

// GET /api/ratings/songs/:songId/music
// Returns the current user's music rating + community aggregate for one song
ratingsRouter.get('/songs/:songId/music', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { songId } = req.params as { songId: string };
    const [myRating, communityRating] = await Promise.all([
      userMusicRatingService.getMyRating(userId, songId),
      userMusicRatingService.getCommunityRating(songId),
    ]);
    res.json({ myRating, communityRating });
  } catch (e) { next(e); }
});

// PUT /api/ratings/songs/:songId/music
// Upsert current user's music rating for a song
ratingsRouter.put('/songs/:songId/music', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { songId } = req.params as { songId: string };
    const data = upsertUserMusicRatingSchema.parse(req.body);
    const rating = await userMusicRatingService.upsert(userId, songId, data);
    res.json(rating);
  } catch (e) { next(e); }
});

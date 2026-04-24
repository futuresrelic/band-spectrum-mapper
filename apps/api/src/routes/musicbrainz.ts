import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  searchArtists,
  getArtistAlbums,
  batchGetReleaseGroupTracks,
} from '../services/musicBrainzService.js';

// Accessible to any authenticated user (admin or regular user).
// Admins also use this for the DiscographyImportPage MusicBrainz tab.
export const musicBrainzRouter = Router();

// GET /api/musicbrainz/search?q=Tool
musicBrainzRouter.get('/search', requireAuth, async (req, res, next) => {
  try {
    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
    if (!q || q.length < 2) { res.json([]); return; }
    res.json(await searchArtists(q));
  } catch (e) { next(e); }
});

// GET /api/musicbrainz/artists/:mbId/albums
musicBrainzRouter.get('/artists/:mbId/albums', requireAuth, async (req, res, next) => {
  try {
    res.json(await getArtistAlbums(req.params['mbId']!));
  } catch (e) { next(e); }
});

// POST /api/musicbrainz/tracks
// Body: { releaseGroupIds: string[] }
// Returns tracks for all requested release-groups (sequentially rate-limited on server).
musicBrainzRouter.post('/tracks', requireAuth, async (req, res, next) => {
  try {
    const { releaseGroupIds } = req.body as { releaseGroupIds?: unknown };
    if (!Array.isArray(releaseGroupIds) || releaseGroupIds.length === 0) {
      res.status(400).json({ error: 'releaseGroupIds must be a non-empty array' });
      return;
    }
    if (releaseGroupIds.length > 20) {
      res.status(400).json({ error: 'Maximum 20 albums per request' });
      return;
    }
    const ids = releaseGroupIds.map(String);
    const results = await batchGetReleaseGroupTracks(ids);
    // Convert Map to plain object for JSON serialization
    const out: Record<string, unknown> = {};
    for (const [k, v] of results) out[k] = v;
    res.json(out);
  } catch (e) { next(e); }
});

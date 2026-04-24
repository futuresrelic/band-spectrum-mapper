import express from 'express';
import cors from 'cors';
import passport from 'passport';
import path from 'path';
import { fileURLToPath } from 'url';
import { bandsRouter } from './routes/bands.js';
import { albumsRouter } from './routes/albums.js';
import { songsRouter } from './routes/songs.js';
import { lyricsRouter } from './routes/lyrics.js';
import { analysisRouter } from './routes/analysis.js';
import { importsRouter } from './routes/imports.js';
import { settingsRouter } from './routes/settings.js';
import { exportRouter } from './routes/export.js';
import { publicRouter } from './routes/public.js';
import { discographyRouter } from './routes/discography.js';
import { authRouter } from './routes/auth.js';
import { ratingsRouter } from './routes/ratings.js';
import { adminRouter } from './routes/admin.js';
import { tagsRouter } from './routes/tags.js';
import { commentsRouter } from './routes/comments.js';
import { brandRouter } from './routes/brand.js';
import { genreRatingsRouter } from './routes/genre-ratings.js';
import { musicBrainzRouter } from './routes/musicbrainz.js';
import { contributionsRouter } from './routes/contributions.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Allow credentials from any origin (works for Railway cross-service calls)
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(passport.initialize());

  // Health check — keep this working at all times
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Public brand assets (favicon, logo)
  app.use('/api/brand', brandRouter);

  // Auth
  app.use('/api/auth', authRouter);

  // User ratings (auth required)
  app.use('/api/ratings', ratingsRouter);

  // Admin: user moderation (auth + isAdmin required)
  app.use('/api/admin', adminRouter);

  // Admin / data routes
  app.use('/api/bands', bandsRouter);
  app.use('/api/albums', albumsRouter);
  app.use('/api/songs', songsRouter);
  app.use('/api/lyrics', lyricsRouter);
  app.use('/api/analysis', analysisRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/discography', discographyRouter);
  app.use('/api/tags', tagsRouter);
  app.use('/api/songs/:songId/comments', commentsRouter);

  // Public read-only (no auth)
  app.use('/api/public', publicRouter);

  // Genre perspective ratings + AI analysis ratings (GET is public; PUT/DELETE require auth)
  app.use('/api/genre-ratings', genreRatingsRouter);

  // MusicBrainz proxy (auth required — rate-limited on server)
  app.use('/api/musicbrainz', musicBrainzRouter);

  // Library contributions from users
  app.use('/api/contributions', contributionsRouter);

  if (process.env['NODE_ENV'] === 'production') {
    // Serve the built React SPA. Path is relative to the compiled dist/ output.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const webDist = path.resolve(__dirname, '../../web/dist');
    app.use(express.static(webDist));
    // SPA fallback — any non-/api route gets index.html so React Router works
    app.get(/^(?!\/api\/).*$/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  // Centralized error handler — must be last
  app.use(errorHandler);

  return app;
}

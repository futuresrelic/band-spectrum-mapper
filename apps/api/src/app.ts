import express from 'express';
import cors from 'cors';
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
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check — keep this working at all times
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/bands', bandsRouter);
  app.use('/api/albums', albumsRouter);
  app.use('/api/songs', songsRouter);
  app.use('/api/lyrics', lyricsRouter);
  app.use('/api/analysis', analysisRouter);
  app.use('/api/imports', importsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/discography', discographyRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Centralized error handler — must be last
  app.use(errorHandler);

  return app;
}

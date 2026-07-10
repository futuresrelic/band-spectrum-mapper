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
import { tagProposalsRouter } from './routes/tagProposals.js';
import { brandRouter } from './routes/brand.js';
import { genreRatingsRouter } from './routes/genre-ratings.js';
import { musicBrainzRouter } from './routes/musicbrainz.js';
import { contributionsRouter } from './routes/contributions.js';
import { ogRouter } from './routes/og.js';
import { socialRouter } from './routes/social.js';
import { socialPlannerRouter } from './routes/socialPlanner.js';
import { songSpectrumRouter } from './routes/songSpectrum.js';
import { wordCloudRouter } from './routes/wordCloud.js';
import { lyricLabRouter } from './routes/lyricLab.js';
import { patternLabRouter } from './routes/patternLab.js';
import { songNodesRouter } from './routes/songNodes.js';
import { gameRouter } from './routes/game.js';
import { triviaRouter } from './routes/trivia.js';
import { wordHuntRouter } from './routes/wordHunt.js';
import { lyricChainRouter } from './routes/lyricChain.js';
import { lyricDissectionRouter } from './routes/lyricDissection.js';
import { timelineRouter } from './routes/timeline.js';
import { band2048Router } from './routes/band2048.js';
import { spectrumStudioRouter } from './routes/spectrumStudio.js';
import { nodeSequencesRouter } from './routes/nodeSequences.js';
import { cinemaPersistenceRouter } from './routes/cinemaPersistence.js';
import { dataGridRouter } from './routes/dataGrid.js';
import { setlistsRouter } from './routes/setlists.js';
import { bootlegsRouter } from './routes/bootlegs.js';
import { songLinksRouter } from './routes/songLinks.js';
import { songConnectionsRouter } from './routes/songConnections.js';
import { lyricCompleteRouter } from './routes/lyricComplete.js';
import { crosswordRouter } from './routes/crossword.js';
import { wordSearchRouter } from './routes/wordSearch.js';
import { recordCatcherRouter } from './routes/recordCatcher.js';
import { platformerRouter } from './routes/platformer.js';
import { spectrumGuesserRouter } from './routes/spectrumGuesser.js';
import { lyricMatchRouter } from './routes/lyricMatch.js';
import { graphHuntRouter } from './routes/graphHunt.js';
import { lyricDuelRouter } from './routes/lyricDuel.js';
import { playlistRouter } from './routes/playlist.js';
import { headlinerRouter } from './routes/headliner.js';
import { bandRpgRouter } from './routes/bandRpg.js';
import { tourRouter } from './routes/tourRoutes.js';
import { challengeRouter } from './routes/challengeRoutes.js';
import { curatorRouter } from './routes/curatorRoutes.js';
import { bandRpgPublicRouter } from './routes/bandRpgPublicRoutes.js';
import { communityRouter } from './routes/communityRoutes.js';
import { appreciationRouter } from './routes/appreciationRoutes.js';
import { levelEditorRouter } from './routes/levelEditorRoutes.js';
import { questEditorRouter } from './routes/questEditorRoutes.js';
import { storyEditorRouter } from './routes/storyEditorRoutes.js';
import { itemEditorRouter } from './routes/itemEditorRoutes.js';
import { timelineEditorRouter } from './routes/timelineEditorRoutes.js';
import { worldEditorRouter } from './routes/worldEditorRoutes.js';
import { adventureRouter } from './routes/adventureRoutes.js';
import { adventureProgressRouter } from './routes/adventureProgressRoutes.js';
import { campaignGeneratorRouter } from './routes/campaignGeneratorRoutes.js';
import { readinessRouter } from './routes/readinessRoutes.js';
import { runtimeRouter } from './routes/runtimeRoutes.js';
import { wikiRouter } from './routes/wiki.js';
import { songOgMiddleware } from './middleware/ogMeta.js';
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

  // Public config — exposes non-secret values the frontend needs (client ID is public)
  app.get('/api/config', (_req, res) => {
    res.json({ googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '' });
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
  app.use('/api/songs/:songId/tag-proposals', tagProposalsRouter);

  // Public read-only (no auth)
  app.use('/api/public', publicRouter);

  // Genre perspective ratings + AI analysis ratings (GET is public; PUT/DELETE require auth)
  app.use('/api/genre-ratings', genreRatingsRouter);

  // MusicBrainz proxy (auth required — rate-limited on server)
  app.use('/api/musicbrainz', musicBrainzRouter);

  // Library contributions from users
  app.use('/api/contributions', contributionsRouter);

  // OG image generation (PNG for social share cards)
  app.use('/api/og', ogRouter);

  // Social content generation — AI post generator + strategist chat (admin only)
  app.use('/api/social', socialRouter);

  // Social Media Planner — content calendar, series, prompts, comment mining (admin only)
  app.use('/api/planner', socialPlannerRouter);

  // Song Spectrum Analyzer — audio analysis + YouTube metadata (admin only)
  app.use('/api/song-spectrum', songSpectrumRouter);

  // Word Cloud — aggregated lyric + theme word data (admin only)
  app.use('/api/word-cloud', wordCloudRouter);

  // Lyric Lab — bulk word cloud batch analysis (admin only)
  app.use('/api/lyric-lab', lyricLabRouter);

  // Pattern Lab — admin-only deep analysis and content creation tools
  app.use('/api/pattern-lab', patternLabRouter);

  // Song Nodes — Cytoscape.js graph data (admin only)
  app.use('/api/song-nodes', songNodesRouter);

  // Album art quiz game
  app.use('/api/game', gameRouter);

  // Word Hunt game scores (auth required for POST)
  app.use('/api/word-hunt', wordHuntRouter);

  // Lyric Chain game — GET/POST game flow + leaderboard
  app.use('/api/lyric-chain', lyricChainRouter);

  // Lyric Dissection game — word-reveal song-guessing game
  app.use('/api/lyric-dissection', lyricDissectionRouter);

  // Timeline Challenge — sort albums/songs chronologically
  app.use('/api/timeline', timelineRouter);

  // Band 2048 game scores
  app.use('/api/band2048', band2048Router);

  // Cinema node sequences — per-user saved tour paths
  app.use('/api/node-sequences', nodeSequencesRouter);

  // Cinema persistence — presets, snapshots, keyframes, node overrides (admin only)
  app.use('/api/cinema', cinemaPersistenceRouter);

  // Spectrum Studio — visual data explorer (admin only)
  app.use('/api/spectrum-studio', spectrumStudioRouter);

  // Trivia question generator (admin only)
  app.use('/api/trivia', triviaRouter);

  // Admin data grid — full song matrix for admin review (admin only)
  app.use('/api/admin/data-grid', dataGridRouter);

  // Setlist.fm proxy — concert setlists for Cinema Tour generation (auth required)
  app.use('/api/setlists', setlistsRouter);

  // Archive.org bootleg import (auth + admin required)
  app.use('/api/admin/bootlegs', bootlegsRouter);

  // Song source linking — link live/bootleg/demo songs to their studio original (admin only)
  app.use('/api/song-links', songLinksRouter);

  // Song Connection Explorer — shared words, themes, tags, album, artist (admin only)
  app.use('/api/song-connections', songConnectionsRouter);

  // Lyric Complete game — word-by-word lyric completion
  app.use('/api/lyric-complete', lyricCompleteRouter);

  // BSM Crossword — AI-generated crossword puzzles
  app.use('/api/crossword', crosswordRouter);

  // BSM Word Search — AI-generated word search puzzles
  app.use('/api/word-search', wordSearchRouter);

  // Record Catcher — arcade album-song matching game
  app.use('/api/record-catcher', recordCatcherRouter);

  // 2D Platformer — side-scrolling vinyl record collector game
  app.use('/api/platformer', platformerRouter);

  // Spectrum Guesser scores
  app.use('/api/spectrum-guesser', spectrumGuesserRouter);

  // Lyric Match scores
  app.use('/api/lyric-match', lyricMatchRouter);

  // 3D Graph Hunt scores
  app.use('/api/graph-hunt', graphHuntRouter);

  // Lyric Duel — Celebrity Deathmatch lyric battle
  app.use('/api/lyric-duel', lyricDuelRouter);

  // Playlist Maker — build, save, and retrieve playlists
  app.use('/api/playlist', playlistRouter);

  // Headliner — standalone concert-building game (Phase Z.17.9). Not part of Band RPG.
  app.use('/api/headliner', headlinerRouter);

  // Band RPG — adventure game scores and progress
  app.use('/api/band-rpg', bandRpgRouter);

  // Tour Builder — Phase W
  app.use('/api/band-rpg/tours', tourRouter);

  // Rival Events & Challenges — Phase X
  app.use('/api/band-rpg/challenges', challengeRouter);

  // Curator Progression — Phase X.5
  app.use('/api/band-rpg/curator', curatorRouter);

  // Sharing & Showcase — Phase Y.1 (public, no auth)
  app.use('/api/band-rpg/public', bandRpgPublicRouter);

  // Community Discovery — Phase Y.2 (public, no auth)
  app.use('/api/band-rpg/community', communityRouter);

  // Community Appreciation — Phase Y.3 (auth required)
  app.use('/api/band-rpg/appreciation', appreciationRouter);

  // Creator Toolkit — Phase Z.0 (admin only — enforced in each router)
  app.use('/api/band-rpg/editor/levels', levelEditorRouter);
  app.use('/api/band-rpg/editor/quests', questEditorRouter);
  app.use('/api/band-rpg/editor/story', storyEditorRouter);
  app.use('/api/band-rpg/editor/items', itemEditorRouter);
  app.use('/api/band-rpg/editor/timeline', timelineEditorRouter);
  app.use('/api/band-rpg/editor/world', worldEditorRouter);   // Phase Z.3 — World Systems
  app.use('/api/band-rpg/adventures', adventureRouter);        // Phase Z.4 — Adventure Import/Export
  app.use('/api/band-rpg/adventure-progress', adventureProgressRouter); // Phase Z.5 — Campaign Builder
  app.use('/api/band-rpg/campaign', campaignGeneratorRouter);            // Phase Z.6 — AI Campaign Generator
  app.use('/api/band-rpg/readiness', readinessRouter);                  // Phase Z.6 — v1.0 Dashboard

  // Runtime Engine — Phase Z.1 (auth required)
  app.use('/api/band-rpg/runtime', runtimeRouter);

  // Music Wiki — public encyclopedic data (no auth required)
  app.use('/api/wiki', wikiRouter);

  if (process.env['NODE_ENV'] === 'production') {
    // Serve the built React SPA. Path is relative to the compiled dist/ output.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const webDist = path.resolve(__dirname, '../../web/dist');

    // OG meta injection: intercepts share URLs before static middleware so
    // social crawlers (Facebook, Twitter, etc.) see proper og:image + tags.
    app.use(songOgMiddleware(webDist));

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

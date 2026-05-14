# Changelog

All meaningful changes to Band Spectrum Mapper are documented here.

---

## [Unreleased]

### Added

- Initial monorepo structure (`apps/web`, `apps/api`, `packages/shared`, `prisma`, `docs`)
- Root documentation: `README.md`, `CLAUDE.md`, `docs/DEV_GUIDE.md`, `docs/ARCHITECTURE.md`
- Railway-oriented deployment architecture
- Shared TypeScript types and Zod validation schemas (`packages/shared`)
- Prisma schema covering all core entities:
  - `bands`, `albums`, `songs`
  - `lyrics` with `sourceType` provenance tracking
  - `lyric_revisions` for full edit history
  - `song_axis_scores` for 6-axis spectrum scoring
  - `custom_stopwords`, `tags`, `song_tags`
  - `imports` tracking
  - `comparisons` for saved comparison configs
- Express + TypeScript backend (`apps/api`)
  - Health check endpoint (`GET /api/health`)
  - Band CRUD routes and service
  - Album CRUD routes and service
  - Song CRUD routes and service
  - Lyrics CRUD with revision tracking
  - Song axis score CRUD
  - Lyrics analysis endpoint (tokenization, stopwords, term frequency)
  - Compare endpoint
  - Import handling (txt, md, csv, json)
  - Settings/stopwords management
  - Centralized error handling middleware
  - Request validation via Zod
- React + TypeScript + Tailwind CSS frontend (`apps/web`)
  - App shell with navigation layout
  - Dashboard page
  - Library page (bands → albums → songs browse)
  - Song Detail page with lyrics editor
  - Spectrum scoring page with radar chart (Recharts)
  - Lyrics Analysis page with word cloud and frequency table
  - Compare page (band vs band, album vs album, custom)
  - Imports page
  - Settings page (stopwords management)
- Seed data with example bands, albums, and songs
- Environment variable documentation (`.env.example` files)
- Railway deployment configuration (`railway.json`, build scripts)

### Changed

- N/A (initial build)

### Fixed

- N/A (initial build)

---

---

## Song Spectrum Analyzer + Social Content System (2026-05-14)

### Added

**Song Spectrum Analyzer** (`/song-spectrum`)
- New integrated audio-analysis module, independent of the existing library but
  optionally linkable to library songs.
- Python audio worker (`apps/audio-worker/`) — FastAPI service using librosa,
  numpy, scipy. Deployed as a separate Railway service; controlled by env var
  `AUDIO_WORKER_URL`. Gracefully disabled when not set.
- Audio analysis: BPM + confidence, key estimation (Krumhansl–Schmuckler),
  loudness / dynamic range, waveform envelope, spectrogram (64 bins × 200 frames),
  structural sections (agglomerative), spectral features, onset density, chroma
  profile, 13 MFCC means.
- Transparent heuristic scores (0–100) for all six BSM axes — each score shows
  contributing audio features, confidence rating, and plain-English explanation.
- YouTube metadata import (YouTube Data API v3 — title, channel, description,
  thumbnail, duration, tags). Metadata only; controlled by `YOUTUBE_API_KEY`.
- Canvas waveform and spectrogram visualizations; section timeline bar;
  per-axis accordion breakdown; JSON export.
- Prisma model `SongSpectrumAnalysis`; auto-created on Railway via `prisma db push`.

**Social Content System** (Phases 1–3)
- Social Export: server-side PNG via `@resvg/resvg-js`; 4 themes × 2 formats.
- Social Post Generator (`/social`): AI captions / hashtags via gpt-4o for 5
  platforms, 8 post types, 4 tones.
- AI Social Strategist: global floating chat panel with BSM brand voice,
  song context injection, conversation history.

**Other**
- Lyrics Batch Fetcher (`/admin/lyrics-batch`): background fetch + admin approval.
- Knowledge Feed image attachments with caption-based AI context.
- Song Cloud: axis filter sliders, list view, zoom + pan.

## Word Cloud View + Song Nodes View (2026-05-14)

### Added

**Word Cloud View** (`/word-cloud`)
- Lyric word cloud aggregated across song / album / artist / universe scope.
- Words weighted: lyric frequency 55%, AI theme strength 30%, community tags 15%.
- Custom Archimedean spiral placement algorithm (browser canvas for text
  measurement, SVG rendering) — no extra dependencies.
- Non-linear font sizing curve (`weight^0.6`) for dramatic top-word emphasis.
- Click any word to highlight it in the cloud and view the songs it appears in.
- Export: 1080×1080 square PNG and 1080×1920 story PNG with dark branding.
- Social Post Generator integration via floating AI chat panel (`SocialChatPanel`).

**Song Nodes View** (`/song-nodes`)
- Interactive network graph using Cytoscape.js.
- Node types: song, album, artist, theme, tag, lyric keyword, emotion/radar dimension.
- Edge types: same_artist, same_album, shared_tag, similar_radar (cosine ≥ 0.90),
  conceptual, shared_word.
- Six layout presets: Artist Universe, Album Cluster, Theme Constellation,
  Maynard Universe (searches library for Tool / A Perfect Circle / Puscifer),
  Emotional Similarity Map, Lyrical DNA Map.
- Dark cinematic design — deep navy background, spectrum-colored nodes, glow effects.
- Click node to highlight neighbourhood; sidebar shows scores + song/album context.
- Export: 1080×1080 and 1080×1920 branded PNG via Cytoscape `cy.png()`.
- Social Post Generator integration via floating AI chat panel.

**API additions**
- `GET /api/word-cloud?scope&id&limit&minFreq` — weighted word data
- `GET /api/word-cloud/scopes` — bands, albums, songs with lyrics
- `GET /api/song-nodes?preset&bandIds&albumId` — Cytoscape graph data
- `GET /api/song-nodes/scopes` — bands and albums for scope pickers

## Batch Improvements + Trivia + Album Art Game (2026-05-14)

### Added

**AI Batch Runner improvements** (`/admin/ai-batch`)
- Band filter — select specific bands instead of running all
- Continue from checkpoint — "Continue (X remaining)" button skips rows already
  marked done/skipped, resuming exactly where you stopped
- Reload songs button to refresh the list without losing current progress indicators

**Lyrics Batch improvements** (`/admin/lyrics-batch`)
- Skip instrumentals — songs with `isInstrumental = true` are permanently excluded
- `noLyricsAt` timestamp — songs tried-and-not-found are recorded; future batches skip
  them automatically (within 30-day window), avoiding wasted API calls
- Resume button — continue a stopped batch skipping already-processed songs
- Not-found list — songs that returned no results appear after completion with
  "Mark as instrumental" buttons for one-click permanent exclusion

**Trivia Page** (`/trivia`)
- Admin-only music trivia deck generated from live library data — no AI required
- Question types: highest score, album release order, album art identification,
  lyric snippet → song, radar profile → song, band identification
- Card-by-card reveal with multiple-choice options and correct/wrong feedback
- Score tracker across the round
- "Export as social post" — any question + revealed answer exports as 1080×1080 PNG
  with BSM branding for Facebook/Instagram
- Band filter and regenerate button for fresh question sets

**Album Art Quiz** (`/play`)
- Public game accessible to all logged-in users (not admin-only)
- Randomly selected album art slides in; player identifies the band from 4 options
- 5-second countdown timer (speeds up with level)
- 3 lives; streak bonuses (+5 pts per streak ≥ 2)
- Visual feedback: green/red flash + correct answer reveal
- Score saved to database at game end; instant rank shown
- Leaderboard sidebar (top 10 entries)
- "Leave a comment to earn an extra life" prompt encourages song engagement

**Album Art Quiz Admin** (`/admin/game`)
- Full leaderboard with player details, score, level, session duration
- Delete score button for moderation
- Stats panel: total games played, highest score, most active player

**Database additions**
- `Song.isInstrumental` — `Boolean @default(false)` — permanent skip flag for lyrics batch
- `Song.noLyricsAt` — `DateTime?` — auto-set when batch finds no lyrics; clears on approval
- `GameScore` model — stores score, level, duration per game session per user

---

## Known Limitations (Initial Build)

- Authentication/authorization not implemented (single-user local deployment)
- NLP features are basic (unigram frequency; bigrams optional future work)
- Export polish may come after core flows are stable
- Word cloud library requires client-side rendering
- Railway deployment requires manual PostgreSQL provisioning on first setup

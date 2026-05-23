# Changelog

All meaningful changes to Band Spectrum Mapper are documented here.

---

## Cinema Mode — cinematic autoplay showcase engine (2026-05-23)

### Added

- **Cinema Mode page** (`/cinema`) — a fullscreen cinematic autoplay showcase for the graph.
  - Accessible publicly (no auth required), linked from the SiteHeader and admin Nav.
  - Loads the artist-universe graph (optional band filter) and cycles through 8 named scenes.
  - Each scene has its own 3D arrangement and continuous camera choreography.

- **8 named Cinema scenes** — each with distinct arrangement and camera motion:
  1. **🌟 Artist Universe** — radial arrange, slow horizontal camera orbit
  2. **🌌 Galaxy Drift** — galaxy arrange, camera descends from 900 units above
  3. **🔮 Inside the Sphere** — sphere arrange, camera at centre looking outward, rotates look-at
  4. **🪐 Solar System Tour** — solar-system arrange, flies to each artist node every 9 s
  5. **✨ Node Flythrough** — natural arrange, random walk through connected songs/albums
  6. **💜 Emotional Spectrum** — radial arrange, slow orbit at high altitude
  7. **🧬 Lyrical DNA** — galaxy arrange, slow dolly in from 1 100 units
  8. **🌍 Cosmic Overview** — sphere arrange, sweeping bird's-eye orbit

- **Scene orchestration** — centralized timing + transition system:
  - Progress bar counts down each scene's duration (configurable per scene).
  - Fade-to-black overlay (CSS opacity transition, 700 ms) between scenes.
  - Scene `enter()` fires on switch; `tick()` runs every rAF frame during playback.
  - TrackballControls disabled during playback — camera is fully owned by the scene engine.
  - TrackballControls re-enabled on pause so the user can freely orbit/zoom.

- **Transport controls** — play/pause, prev/next, scene progress bar, scene selector playlist.
  - Keyboard shortcuts: Space/K = play-pause, J/← = prev, L/→ = next, F = social mode.
  - Scene playlist popup (click scene name): jump to any scene with fade transition.

- **Social Mode** (press F or click 🎬):
  - Fullscreen via `document.requestFullscreen()`.
  - All UI chrome hidden — only a minimal transport row appears on mouse move.
  - Cursor auto-hides after 3 s of inactivity.
  - Optional watermark (Band Spectrum Mapper + scene name), toggleable mid-session.
  - Exits cleanly via Esc or the Exit button.

- **Band filter** — optional panel to restrict the graph to specific bands.
  - Defaults to all bands (no bandIds param → full dataset).

### Refactored

- **Shared layout utilities** extracted to `apps/web/src/cinema/graphArrange.ts`:
  - `easeInOutQuad`, `buildAdj`, `computeArrangeTargets`, `animateArrange` and `ArrangeMode` type.
  - `ThreeDGraphView` now imports these instead of duplicating ~170 lines of pure math.
  - No behaviour change to ThreeDGraphView — pure import refactor.

### New files
- `apps/web/src/cinema/graphArrange.ts` — shared 3D layout math
- `apps/web/src/cinema/types.ts` — CinemaScene, CinemaNode, CinemaLink types
- `apps/web/src/cinema/sceneDefinitions.ts` — 8 named scene objects
- `apps/web/src/pages/CinemaPage.tsx` — the Cinema Mode page

### Limitations
- Cinema Mode fetches the artist-universe preset; it does not switch presets between scenes (avoids re-fetch delays that would break the cinematic flow).
- Social Mode does not yet capture screenshots or video — this requires browser MediaRecorder + canvas capture, planned for a future phase.
- BPM sync / beat-reactive motion is architecture-ready (tick functions receive elapsed ms) but not yet wired to audio tempo data.

---

## 3D graph — WASD flight, 3D mode in Explore & Song Nodes, arrange modes (2026-05-22)

### Added

- **WASD / arrow-key flight** in all three 3D graph views (Graph Hunt, Explore 3D, Song Nodes 3D).
  - W/S or ↑/↓ — fly forward/backward along camera look direction.
  - A/D or ←/→ — strafe left/right.
  - Q/E — ascend/descend.
  - Both `camera.position` and `controls.target` translate together so the orbit stays intact.
  - Speed is adaptive: `max(3, distance_from_origin × 0.015)` — faster when zoomed out.
  - Hint overlay shown bottom-left when graph is ready.

- **3D toggle in Explore** (`/explore`) and **Song Nodes** (`/song-nodes`).
  - 2D / 3D pill toggle appears in the graph header once data is loaded.
  - Switching to 3D renders `ThreeDGraphView` (shared component) with the same dataset.
  - The Cytoscape 2D canvas is hidden (not destroyed) so switching back to 2D preserves layout.
  - `cy.resize()` is called after the DOM restores the container.

- **`ThreeDGraphView` shared component** (`apps/web/src/components/ThreeDGraphView.tsx`).
  - Reusable 3D force-directed graph viewer accepting `GraphNode[]` + `GraphEdge[]` props.
  - All features: WASD flight, proximity labels with fade-in, click-to-inspect (highlights node + neighbours), controls panel, arrange modes.

- **5 arrange modes** in ThreeDGraphView (Arrange button, smooth 1.4 s animated transitions):
  - **⚛ Natural** — releases pins and reheats the d3 physics simulation.
  - **🎯 Radial** — concentric cylinders by node type (artist → album → song → keyword → others).
  - **🌐 Sphere** — Fibonacci sphere distribution, radius scales with node count.
  - **🌌 Galaxy** — golden-angle spiral disk, most-connected nodes at centre.
  - **🪐 Solar System** — artists as stars in a ring; albums orbit their artist; songs orbit their album; keywords/tags in outer belt.

- **Labels toggle** in Graph Controls panel across all 3D views — hide all node labels instantly to look around freely.

### Technical

- Inline quaternion math (`applyQuat` / `normalise`) replaces direct `three` import — avoids the missing `.d.ts` issue with three v0.184.0.

---

## 3D Graph Hunt game (2026-05-22)

### Added

- **3D Graph Hunt** (`/graph-hunt`) — public game page (no auth required), accessible from `/games`.
  - Loads the lyrical-dna graph for selected bands via `/api/public/graph?preset=lyrical-dna`.
  - 3D force-directed graph powered by `react-force-graph-3d` (Three.js). Drag to orbit, scroll
    to zoom, the physics simulation runs until the graph stabilises.
  - The player starts at a random **song node** (yellow sphere). The hidden target is a
    **keyword node** reachable in 3–8 hops via BFS through the lyrical network.
  - Movement is one hop at a time — only adjacent (cyan) nodes are clickable.
  - **Hot/cold feedback** after every move: BURNING 🔥 (1 hop) → HOT ♨️ (2) → WARM ☀️ (3) →
    TEPID 🌡️ (4) → COOL 💨 (5) → COLD ❄️ (6+). The target is revealed (green glow) when the
    player comes within 2 hops.
  - Score: `max(0, 1000 − moves×25 − secondsElapsed)`. Displayed at game end.
  - Camera flies smoothly to each new node on every move.
  - **Play Again** restarts with a new random start/target pair without reloading the graph.
  - `react-force-graph-3d` and `three` added to `apps/web` dependencies.
- **Games page** — added 3D Graph Hunt card alongside Album Art Quiz and Word Hunt.

---

## Explore — three new exploration modes (2026-05-22)

### Added

- **Spectrum Compass** (`spectrum-compass`) — reuses the Emotional Similarity graph data. Each
  song is placed at the weighted centroid of its connected axis/emotion anchors. Songs with a
  clear dominant axis cluster tightly near that anchor; songs that span multiple axes drift
  toward the center. The 6 anchors form a regular polygon so the layout reads like a compass
  rose. Artists/albums orbit the outer ring.

- **Tag Galaxy** (`tag-galaxy`) — reuses the Artist Universe graph data. Tags are placed in an
  expanding golden-angle spiral (most-populated tags nearest the center). Songs orbit their
  most-connected tag hub. Artists and albums appear in a wide outer ring. Switching the tag
  visibility sliders while in this mode reveals how genre clusters form and overlap.

- **Keyword Spiral** (`keyword-spiral`) — reuses the Lyrical DNA graph data. Keywords spiral
  outward in golden-angle phyllotaxis (most-used keywords nearest center). Songs fan behind
  their keyword in a 160° arc that faces away from center, so you can visually follow the
  spiral arm of any word. The "Arrange" re-layout button re-seeds the spiral on demand.

### Changed

- `PUBLIC_PRESETS` array now carries a `backendPreset` field so multiple frontend view modes
  can share the same backend API response (and the same TanStack Query cache entry). No extra
  network requests are made when switching between modes that share a backend preset.

---

## Interactive Spectrum Studio nodes, MusicBrainz duration, AI Batch scan (2026-05-22)

### Added

- **Spectrum Studio — interactive Fibonacci nodes**: click any song dot to select it (rotation
  pauses, info panel appears with field values, top-5 similarity lines are drawn to the most
  similar songs). Click again or press × to deselect and resume rotation. Drag any dot to
  reposition it; releasing without moving counts as a click.

- **Spectrum Studio — interactive Fractal nodes**: same click/select/drag mechanism on song,
  album, and band nodes. Dragging a band node moves the entire group (all its albums and songs
  shift together). Dragging a song or album node moves only that node.

- **Spectrum Studio — Dataset quick-select**: four buttons (All / Core / AI / Metadata) in
  the Fields panel instantly activate the corresponding field groups, replacing the current
  selection. Renamed field group "AI Genres" → "Genres" and removed "(AI)" suffix from all
  genre field labels.

- **Spectrum Studio — fieldDist()**: Euclidean distance function in normalised (0–10) field
  space, used to find the top-5 most similar songs to a selected node.

- **AI Batch Runner — Data Coverage Scan**: new scan panel at the top of the page. Click
  "Scan now" to call `GET /api/admin/ai-batch/scan` (respects the current band filter) and
  show a grid of job-type cards with missing counts and fill-level bars. Helps identify which
  AI jobs still need to be run without loading all songs first.

- **AI Batch Runner — Track Duration job**: new "metadata" job type that calls
  `POST /api/admin/songs/:songId/fetch-metadata` to look up track length from MusicBrainz.
  Skips songs that already have `durationSeconds` populated.

- **Backend — `GET /api/admin/ai-batch/scan`**: returns `total` songs and per-job `has` /
  `missing` counts for analysis, spectrum, research, genre, tags, and metadata (duration).
  Accepts optional `?bandIds=` filter.

- **Backend — `POST /api/admin/songs/:songId/fetch-metadata`**: fetches duration via
  MusicBrainz `searchRecordingDuration()`, saves `durationSeconds` on the Song record.

- **MusicBrainz service — `searchRecordingDuration()`**: queries the `/recording` endpoint
  with title + artist, returns the first match's duration in seconds or null.

- **Discography import — duration support**: the `duration_seconds` field is now read from
  import payloads. Written to `durationSeconds` on new songs; existing songs get backfilled
  if their `durationSeconds` is still null.

### Changed

- Spectrum Studio `VizProps` interface now includes `svgRef` (passed to Fibonacci/Fractal
  so drag handlers can convert client coordinates to SVG viewBox space).

---

## Leaderboard Page + Landing Page Overhaul (2026-05-17)

### Added

- **`/leaderboard` page** — public, dark-theme standalone page showing top scores for both games
  - Two tabs: Album Art Quiz | Word Hunt
  - Album Art Quiz: rank, player avatar/name, level, duration, score from `GET /api/game/leaderboard`
  - Word Hunt: rank, player, word used, wrong count, time, score from `GET /api/public/word-hunt/leaderboard`
  - Each tab has an inline "Play Now" CTA button

- **Landing page "Jump In" section** — new section between the hero and the features grid
  - Six cards linking to: Library, Explore Graph, Album Art Quiz, Word Hunt, Leaderboard, Rate Songs
  - Each card shows icon, description, auth note where relevant, and a color-coded CTA button
  - Dark slate background (bg-slate-900) to visually bridge the hero and the white features grid

- **Landing page nav** — added Explore, Games, and Leaderboard links alongside existing Library/Help

- **Landing page final CTA** — added Explore Graph and Leaderboard buttons alongside Browse Library

- **Landing page footer** — added Explore and Leaderboard links

- **UserLayout nav** — added Library, Explore, Games, and Leaderboard links for logged-in users browsing public pages

### Changed

- `App.tsx` — added `<Route path="/leaderboard" element={<LeaderboardPage />} />` as a public route

## Word Hunt — Bug Fix, Scope Toggle, Scoring & Leaderboard (2026-05-17)

### Fixed

- **Verify always returning wrong** — graph node IDs use `song:abc123` prefix; DB expects bare `abc123`.
  Strip prefix before `GET /api/public/word-hunt/verify` call.

### Added

- **"My bands" / "All bands" scope toggle** — controls both the word pool (challenge endpoint) and
  the graph displayed during play
- **Scoring** — `max(0, 1000 − wrongCount×100 − timeSec×2)`; auto-submitted on win via
  `POST /api/word-hunt/scores` (auth required)
- **Leaderboard panel** in the Word Hunt game page (collapsible, 15 entries)
- **Score + rank display** after winning; guests see a sign-in prompt
- **`WordHuntScore` Prisma model** (`word_hunt_scores` table): userId, word, attempts, wrongCount,
  timeSec, score, bandScope, createdAt. Railway will auto-create via `prisma db push`.
- **`POST /api/word-hunt/scores`** — auth-required route, validates and persists score, returns rank
- **`GET /api/public/word-hunt/leaderboard?limit=N`** — public route, top N scores with player info

---

## Social Media Manager — Content Planner Phase 1 (2026-05-15)

### Added

- **Content Planner** (`/social-planner`, admin) — comprehensive internal planning dashboard
  - 8 tabs: Calendar, Ideas, Drafts, Designed/Scheduled, Posted, Series, Prompts, Comment Mining
  - Monthly calendar grid view — click any day to create a post, click a post to edit
  - Post status workflow: `idea → drafted → designed → scheduled → posted → needs_follow_up → archived`
  - Post editor drawer: title, type, platforms (FB Page, FB Group, Instagram, TikTok, YouTube Shorts), band/album/song linkage, series, caption, hashtags, CTA, poll options, AI-generated body, asset tracking, performance metrics
  - Quick status bar for one-click status changes
- **Content Series system** — define recurring content series (e.g. "The Teachings of TOOL") with tone, visual style notes, default caption style, hashtag sets, and example prompts
- **Prompt Library** — store reusable prompts by category (Canva GPT, image background, ChatGPT caption, Claude development, post generation, reply style) with copy-to-clipboard
- **Comment Mining** — paste raw fan comments, AI (GPT-4o) extracts: suggested lyrics, recurring themes, fan phrasing, future post ideas, poll questions, corrections, engagement notes; analysis history saved to DB
- **Asset tracking** per post: images, video, Canva design links, exported file paths, image generation prompts, Canva GPT prompts
- **Performance metrics** (manual entry): likes, comments, shares, saves, reach/views, group posted to, best comments, future ideas from this post
- **AI Assistant panel** — context-aware chat (collapses/expands) in the planner, pre-loaded with post type/band/platform context
- **Prisma schema additions**: `ContentSeries`, `SocialPost`, `MediaAsset`, `PostMetric`, `CommentInsight`, `PromptTemplate` models; `PostStatus`, `AssetType`, `PromptCategory` enums; back-relations on `Band`, `Album`, `Song`
- **API**: `GET/POST/PUT/DELETE /api/planner/posts`, `PATCH /api/planner/posts/:id/status`, `GET /api/planner/calendar`, `PUT /posts/:id/metrics`, `POST/DELETE posts/:id/assets`, `GET/POST/PUT/DELETE /series`, `/prompts`, `/comments`, `POST /comments/analyze`
- **`commentMiningService.ts`** — GPT-4o structured comment analysis with `response_format: json_object`

### Notes

- Phase 1 is fully manual-workflow — no Facebook/Instagram API integration required
- Run `prisma db push` on Railway to apply new tables (or `prisma migrate dev` locally)

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

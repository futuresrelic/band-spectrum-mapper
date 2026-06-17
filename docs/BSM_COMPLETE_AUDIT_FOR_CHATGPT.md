# Band Spectrum Mapper — Complete Platform Audit
## Prepared for External AI Review (ChatGPT / Product Consultant)

**Document Purpose:** This is a complete, unsummarized audit of the Band Spectrum Mapper (BSM) platform. It is designed to give an AI consultant — with no direct codebase access — a full working understanding of the platform's architecture, features, UX, data systems, redundancies, and opportunities.

**Date:** June 2026  
**Platform Status:** Live on Railway (PostgreSQL + Node.js API + React frontend + Python audio worker)  
**Access:** `https://band-spectrum-mapper.railway.app` (private)  

---

# PART 1 — SITE MAP

## Access Tiers

BSM has three access levels:
- **Public (no login):** Landing, legal, help, viewer pages, explore graph, cinema, games directory, leaderboard
- **User (Google login, any account):** All games, song rating, contribution form, profile, playlist maker
- **Admin (flagged account):** Everything above + the full library management, all analysis tools, all admin panels, AI batch runners, social tools, platformer admin

---

## 1.1 Public Pages (no auth required)

| Name | Route | Purpose | Status |
|---|---|---|---|
| Landing Page | `/landing` | Marketing page. Describes features, shows explore tiles (Library / Graph / Cinema / Games / Rate / Contribute), how-it-works steps. Sign-in CTA. | Working |
| Legal | `/legal` | Terms of service / legal text | Working |
| Help | `/help` | Help documentation | Working |
| Viewer Index | `/view` | Public read-only band/library directory | Working |
| Viewer Band | `/view/:bandSlug` | Public read-only per-band page | Working |
| Share Song | `/share/songs/:songId` | Shareable analysis card for a single song | Working |
| Share Album | `/share/albums/:albumId` | Shareable album card | Working |
| Explore Graph | `/explore` | Public Cytoscape.js 2D force graph of songs, albums, artists, themes, tags, keywords, emotions. Sidebar sliders for visual style. | Working |
| Cinema | `/cinema` | Massive 3D ForceGraph visualizer with scenes, orbit camera, tour mode, social mode, band filters, arrange modes, keyframes, director controls | Working |
| Lyrics Universe | `/cinema/lyrics` | 3D space of floating lyrics — albums in rings, songs in sub-rings, lyrics in tower/ribbon/cloud modes | Working |
| Lyrics Flow | `/cinema/lyrics-flow` | Forward camera path gliding through 3D floating lyrics (SpriteText in Three.js) | Working |
| Leaderboard | `/leaderboard` | Unified game score leaderboard across all games | Working |
| Games Directory | `/games` | Card grid of all 17 games (admin can hide games via toggle) | Working |
| Guess The Song | `/guess-the-song` | Song identification game (separate page, not in main GAMES array) | Working |
| Graph Hunt | `/graph-hunt` | 3D graph navigation word-hunt game (listed as public route, separate from `/play/word-hunt`) | Working |
| Spectrum Studio | `/spectrum-studio` | Data visualization lab — 10 chart types, universal field mapper, PNG export | Working (admin-redirects non-admin) |
| Playlist Maker | `/playlist` | Build, save, load, and export playlists to YouTube | Working |
| Playlist (saved) | `/playlist/:id` | Load a named saved playlist | Working |
| Rate Redirect | `/rate` | Short-link redirect: `/rate?songId=xxx` → `/my/rate?songId=xxx` | Working |

---

## 1.2 User Pages (Google login required)

| Name | Route | Purpose | Status |
|---|---|---|---|
| Rate Songs | `/my/rate` | Song rating surface — 6-axis sliders for any song in the library | Working |
| Contribute | `/my/contribute` | Submit a discography for admin review (artist name + MusicBrainz ID) | Working |
| Profile | `/my/profile` | User profile management | Working |
| Album Art Quiz | `/play` | 3-lives multiple-choice arcade: identify bands from album artwork | Working |
| Word Hunt | `/play/word-hunt` | Find a secret word by clicking song nodes in a lyrics graph | Working |
| Lyric Chain | `/play/lyric-chain` | Chain songs by shared lyric words — build the longest chain | Working |
| Lyric Dissection | `/play/lyric-dissection` | Reveal lyric words one at a time, name the song | Working |
| Timeline Challenge | `/play/timeline` | Sort 5 albums by release year (no years shown) | Working |
| Band 2048 | `/play/2048` | 2048 sliding-tile puzzle with albums instead of numbers | Working |
| Spectrum Guesser | `/play/spectrum-guesser` | Identify a band from its anonymous 6-axis radar profile | Working |
| Lyric Match | `/play/lyric-match` | Match lyric fragments to song titles (two-column connection game) | Working |
| Album Bracket | `/play/bracket` | Head-to-head single-elimination tournament bracket for albums | Working |
| Lyric Complete | `/play/lyric-complete` | Fill in missing words from lyric snippets | Working |
| Lyric Duel | `/play/lyric-duel` | AI-judged battle of two bands' lyrics (4 modes, 4 difficulties) | Working |
| Crossword | `/play/crossword` | AI-generated music crossword (4 difficulty levels, daily puzzle mode) | Working |
| Word Search | `/play/word-search` | AI-generated word search from band/lyric data | Working |
| Record Catcher | `/play/record-catcher` | Canvas arcade: catch falling vinyl records belonging to the shown album | Working |
| Vinyl Runner (Platformer) | `/play/platformer` | Full 2D side-scrolling platformer with real album art collectibles | Working |
| Flop Sweeper (Minesweeper) | `/play/minesweeper` | Band-themed Minesweeper — "flops" instead of mines | Working |

---

## 1.3 Admin Pages (isAdmin flag required)

### Library Management
| Name | Route | Purpose | Status |
|---|---|---|---|
| Dashboard | `/dashboard` | Stats overview, band list, tool grid shortcuts, export JSON | Working |
| Library | `/library` | Band list with search, add-band form | Working |
| Band Detail | `/library/bands/:bandId` | Edit band, add albums/singles, Wikipedia fetch, album list | Working |
| Album Detail | `/library/albums/:albumId` | Edit album, artwork search (iTunes/Discogs), add songs, MusicBrainz fetch | Working |
| Song Detail | `/library/songs/:songId` | Full lyric editor, AI analysis, spectrum scores, comments, tags, revision history | Working |
| Tag Songs | `/library/tags/:tagSlug` | All songs under a tag | Working |

### Analysis Tools
| Name | Route | Purpose | Status |
|---|---|---|---|
| Spectrum | `/spectrum` | Radar chart comparison — 4 view modes (song/band/album) × 4 score sources (core/community/mine/AI). Includes Music Structure axes | Working |
| Lyrics Analysis | `/analysis` | Word frequency analysis, word cloud, word-song bipartite graph | Working |
| Compare | `/compare` | Side-by-side band/song comparison tool | Working |
| Song Cloud | `/cloud` | Songs plotted by axis value | Working |
| Word Cloud | `/word-cloud` | Spiral lyric word cloud | Working |
| Lyric Lab | `/lyric-lab` | Canvas word cloud renderer with per-word frequency analysis | Working |
| Song Spectrum | `/song-spectrum` | Audio analysis: YouTube URL/file upload → waveform, spectrogram, 6-axis audio scores, rhythm radar | Working |
| Song Nodes | `/song-nodes` | Cytoscape.js network graph (admin version) | Working |
| Song Connections | `/song-connections` | Connections between songs by words/themes/tags/album/artist | Working |
| Pattern Lab | `/pattern-lab` | 5-tab deep lyric pattern analysis (Recurrence/Phrases/Album DNA/Artist DNA/Connectors). CSV/JSON export. Cinema handoff. | Working |
| Spectrum Studio | `/spectrum-studio` | 10 chart types, all data fields, live style panel, PNG export | Working |

### Content Creation
| Name | Route | Purpose | Status |
|---|---|---|---|
| Social Post Generator | `/social` | AI social posts for Facebook/Instagram/Threads/Reddit/TikTok — 8 post types, 4 tones, 4 sizes | Working |
| Social Planner | `/social-planner` | Content calendar + series management + comment mining | Working |
| Trivia | `/trivia` | DB-powered music trivia + canvas export as 1080×1080 PNG cards | Working |

### Import & Workflow
| Name | Route | Purpose | Status |
|---|---|---|---|
| Imports | `/imports` | Bulk song import (text/CSV/JSON file upload) | Working |
| Lyrics Builder | `/lyrics-builder` | Lyric editing/building tool | Working |
| Discography Import | `/discography` | MusicBrainz discography importer | Working |

### Admin Hub & Batch Tools
| Name | Route | Purpose | Status |
|---|---|---|---|
| Admin Hub | `/admin/hub` | 3 tabs: Overview (coverage scan, contribution alerts, tool shortcuts), Quick Score (inline per-song 6-axis sliders), Contributions (approve/reject submissions) | Working |
| AI Batch Runner | `/admin/ai-batch` | Run AI jobs in bulk: 10 job types, band filter, checkpoint resume, force-regenerate | Working |
| Lyrics Batch Fetcher | `/admin/lyrics-batch` | Auto-fetch missing lyrics (skips instrumentals, recently tried songs) | Working |
| Album Art Quiz Admin | `/admin/game` | Manage Album Art Quiz leaderboard | Working |
| Game Visibility | `/admin/games` | Toggle which games appear on the `/games` card grid | Working |
| Users | `/admin/users` | User management, admin flag, community exclusion toggle | Working |
| Contributions | `/admin/contributions` | Full contributions review (also accessible via Admin Hub) | Working |
| Knowledge | `/admin/knowledge` | Curator knowledge entries injected into AI prompts (scope: global/band/song) | Working |
| DB Admin | `/admin/db` | Raw database operations | Working |
| DB Health | `/admin/db-health` | Find and fix database integrity issues | Working |
| Missing Lyrics | `/admin/missing-lyrics` | Songs without primary lyrics | Working |
| Missing Artwork | `/admin/missing-artwork` | Albums without artwork URLs | Working |
| Missing Band Logos | `/admin/missing-band-logos` | Bands without logos | Working |
| Band Logos | `/admin/band-logos` | Band logo management | Working |
| Song Links | `/admin/song-links` | Link live/bootleg/demo tracks to studio originals; bulk lyrics inheritance | Working |
| Data Grid | `/admin/data-grid` | Full song matrix with all scored/analyzed columns | Working |
| Bootlegs | `/admin/bootlegs` | Archive.org bootleg track import | Working |
| Data Health | `/admin/data-health` | Per-song data completeness grid (9 health columns: lyrics/AI analysis/spectrum/music score/research/context/genre/themes/audio) | Working |
| Crossword Builder | `/admin/crossword-builder` | Generate and manage crossword puzzles | Working |
| Platformer Admin | `/admin/platformer` | Vinyl Runner admin: sprites, skins, members, config, leaderboard | Working |
| Platformer Levels | `/admin/platformer-levels` | Level designer for Vinyl Runner | Working |

### Settings
| Name | Route | Purpose | Status |
|---|---|---|---|
| Settings | `/settings` | App settings management | Working |

---

# PART 2 — USER JOURNEY

## 2.1 Brand New Visitor (No Account)

**Step 1 — Arrival at `/landing`**
User sees a white marketing page with a sticky navigation bar. Links: Library, Explore, Cinema, Games, Leaderboard, Help. A "Sign in" button (Google OAuth) appears at the right of the nav.

Hero section: BSM branding + tagline + CTA. Below: 6 "explore tiles" cards (Browse Library, Explore the Graph, Cinema Mode, Games, Rate Songs [shows "Sign in first"], Contribute [shows "Sign in first"]). Below that: 6 feature descriptions. Below that: 4 "How It Works" steps.

**Potential confusion:** The landing page does not explain *what* the platform does in one sentence. "Band Spectrum Mapper" is an unusual name. Users don't know if it's for making music, listening to music, or something else. There is no elevator pitch.

**Step 2 — Deciding what to do without signing in**
A curious visitor can click:
- `/explore` — Interactive 2D graph of songs, words, albums. Usable but no context labels or tutorial. Dead end if you don't know the bands.
- `/cinema` — 3D cinematic visualization. Impressive but overwhelming. No guidance.
- `/games` — The games directory. This is the most naturally accessible entry point for a new visitor.
- `/leaderboard` — Shows scores but no context on what the games are.

**Step 3 — Games Directory `/games`**
The 17 game cards all have a title, subtitle, rules summary, and a CTA button. Some games (like Album Art Quiz) immediately launch. Others require knowing the library bands.

**Problem:** A new visitor who signs up for games immediately hits a wall if the library is private/specific to one person's music taste. The platform is built around a *specific* collection, not a universal music database.

**Step 4 — Signing In (Google OAuth)**
User clicks "Sign in with Google" → redirected to `/api/auth/google` → Google consent → callback → sets session cookie → redirects:
- Admin users → `/dashboard`
- Regular users → `/my/rate`

**Step 5 — Regular User Landing (`/my/rate`)**
User arrives at the song rating surface. They see a list of songs and can rate them 0–10 on 6 axes. This is the core user contribution flow. However:

**Confusion:** A brand new user has no idea what the 6 axes mean (Aggression, Complexity, Atmosphere, Emotion, Psychedelic, Concept) without reading the axis tooltips. The InfoTooltip icons are small and easy to miss.

**Step 6 — Discovering More**
Navigation offers: Rate / Contribute / Profile. That's it for regular users. They can also access all the games and public pages. The discovery path from "rating songs" to "playing games" to "viewing analysis" is not guided — users must explore on their own.

---

## 2.2 Admin User Journey

**Step 1 — Dashboard**
Admin arrives at a clean stats page: Band count / Album count / Song count, tool grid shortcuts, band list. Export JSON button for data backup.

**Step 2 — Library Management**
Library → Band → Albums → Songs. Each level is a detail/edit page. Adding content is the foundational workflow: add bands, add albums, add songs, paste/import lyrics.

**Step 3 — Analysis**
Once lyrics exist: AI Batch Runner can automatically generate all analysis types (spectrum scores, themes, genre profiles, research, context). This is a background batch process.

**Step 4 — Visualization**
After analysis runs, the Spectrum, Analysis, Cinema, and Explore pages all display data.

---

## 2.3 Identified Problem Areas

| Issue | Location | Impact |
|---|---|---|
| No elevator pitch on landing | `/landing` | High — new visitors don't understand what BSM is |
| No onboarding tutorial | Everywhere | High — no guided walkthrough exists |
| Axes have no inline explanation in games | All games | Medium — players don't understand what "Psychedelic" means in a game context |
| "Rate Songs" as default user landing | `/my/rate` | Medium — feels like a data-entry task, not an engaging experience |
| Admin-only access to most interesting features | Most admin routes | High — the analysis tools, Cinema, etc. are locked behind admin flag |
| Games page is public but some games need library knowledge | `/games` | Medium — Spectrum Guesser, Band 2048, etc. are meaningless to outsiders |
| No "Coming Soon" games listed | `/games` | Low — `COMING_SOON` array is empty |
| No persistent high score display on game pages | Individual game pages | Medium — leaderboard only visible on `/leaderboard` |
| Cinema mode has no tutorial | `/cinema` | High — overwhelming on first visit, no explanation |
| Social Planner and Post Generator overlap | `/social` + `/social-planner` | Medium — two separate tools for social media creation |

---

# PART 3 — FEATURE INVENTORY

## 3.1 Core Library (Band / Album / Song Management)

**What it does:** Full CRUD (Create/Read/Update/Delete) for the music library hierarchy: Bands → Albums → Songs → Lyrics.

**Why it exists:** BSM is built on a private music collection. All analysis and games derive from this library. Without content, nothing works.

**How it works:**
- Admin creates bands with name/description/logo
- Admin adds albums with title/year/artwork/type (14 album types: studio/ep/live/compilation/bootleg/single/demo/lp/remix/mixtape/boxset/soundtrack/acoustic/instrumental)
- Admin adds songs to albums
- Lyrics are added per song via paste, file upload, AI recall, or manual import
- Lyric revisions are preserved — every edit creates a revision record; admin can restore any prior version
- Each lyric stores `sourceType` (manual/paste/file_import/licensed/user_provided/ai_recall) and `sourceLabel` for provenance

**Dependencies:** PostgreSQL, Prisma ORM, Google OAuth for auth

**Limitations:** No automatic lyrics scraping from third-party sites (by design, legal compliance). No public-facing content addition for regular users (except contribution form for full discography submission).

---

## 3.2 The 6-Axis Psychological Spectrum

**What it does:** Scores any song on 6 psychological/emotional axes, each 0–10:
- **Aggression** — Calm → Intense/abrasive
- **Complexity** — Simple/accessible → Dense/intricate
- **Atmosphere** — Dry/direct → Immersive/cinematic
- **Emotion** — Detached → Raw/vulnerable
- **Psychedelic** — Grounded/literal → Surreal/hallucinatory
- **Concept** — Personal/narrative → Philosophical/abstract

**Why it exists:** The raison d'être of BSM — mapping music across psychological dimensions beyond genre labels.

**How it works (4 score sources):**
1. **Core Score** (`SongAxisScore`) — Human-curated by admin, stored as Float 0–10 per song
2. **AI Score** (`SongAiSpectrum`) — GPT-4o-mini analysis of song lyrics + curator knowledge → 6 axis scores + rationale text. Called "Lyric Score" in the UI.
3. **Audio Score** (`SongSpectrumAnalysis.scores`) — Python/librosa audio analysis → same 6 axes, stored 0–100, displayed as 0–10. Called "Music Score" in the UI.
4. **Community Score** — Average of all `UserSongRating` rows per song (non-excluded users only)
5. **My Score** — The logged-in user's own `UserSongRating`

**Inputs:** Lyrics text + curator knowledge entries (AI), audio file or YouTube URL (audio)
**Outputs:** 6 Float scores per song, aggregated to albums/bands by averaging
**Display:** Radar chart, horizontal bars, vertical pillars (via SongSpectrumPanel, RadarChart, BarChart)

**Current limitations:** Audio score only shows in SongSpectrumPanel when a `SongSpectrumAnalysis` row exists and is linked to that song (not auto-generated — requires manual Song Spectrum upload).

---

## 3.3 Song Spectrum Analyzer (`/song-spectrum`)

**What it does:** Full audio analysis of a song from a file upload or YouTube URL. Produces waveform, spectrogram, section timeline, 6-axis spectrum scores, and rhythm band analysis.

**Why it exists:** The "Music Score" counterpart to lyric-based AI analysis — no AI, pure signal processing.

**How it works:**
1. Admin uploads audio file (up to 150 MB, any major audio format) or pastes YouTube URL
2. Node.js API forwards to Python audio worker (`FastAPI` at `AUDIO_WORKER_URL`)
3. Worker runs `librosa` at 22050 Hz sample rate:
   - Extracts waveform (1000-point amplitude envelope)
   - Computes spectrogram (64 freq bins × 200 time frames)
   - Detects BPM and key (Krumhansl-Schmuckler profiles)
   - Segments structural sections (agglomerative clustering)
   - Computes spectral features (centroid, rolloff, flux, contrast, ZCR)
   - Extracts onset density, chroma profile (12 notes), first 13 MFCCs
4. Python `scorer.py` converts audio features to 0–100 axis scores (transparent heuristics, no neural network)
5. Node.js stores result in `SongSpectrumAnalysis`, optionally links to a library song
6. Frontend displays: `WaveformViz`, `SpectrogramViz`, `SectionTimeline`, `ScoreBreakdown`, `RhythmRadarCanvas`, inline SVG radar chart

**Rhythm Lab sub-feature:** A second analysis option using band-pass filtering per frequency band (kick/snare/hihat/cymbal/bass/low-mid/mid/high) → onset detection → IBI statistics → cross-rhythm ratio detection → polyrhythm score. Displayed in `RhythmRadarCanvas` with 5 view modes.

**When audio is uploaded:** Rhythm Lab automatically runs in parallel (auto-trigger added so no second upload is needed).

**APIs used:** Python worker HTTP, MusicBrainz (optional metadata), OpenAI (optional GPT rhythm research)

**Current limitations:** YouTube audio download only works locally with `ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true` (never in production). YouTube metadata (title/thumbnail/channel) works in production via YouTube Data API v3.

---

## 3.4 AI Analysis Suite

BSM has 9 AI-generated data types per song, all GPT-4o-mini, all cached in the DB, all regenerable:

| Type | Model Column | What AI Produces |
|---|---|---|
| Thematic Analysis | `SongAiAnalysis` | Themes JSON, emotional register, conceptual depth, notable elements |
| Spectrum Score | `SongAiSpectrum` | 6-axis scores (0–10) + rationale paragraph ("Lyric Score") |
| Core Score | Generated on demand | 6 axis scores derived from lyrics only, for quick seeding |
| Music Score | `SongMusicScore` | 6 structural axes (Rhythmic Complexity/Harmonic Depth/Structural Complexity/Sonic Density/Tempo Energy/Tonal Darkness) |
| Research | `SongResearch` | Wikipedia + AI synthesis: summary, music style, sources |
| Context | `SongContextAnalysis` | Deep synthesis: title significance, historical context, lyrical interpretation, thematic synthesis, overall narrative |
| Genre Spectrum | `SongAiGenreSpectrum` | 6 genre-perspective scores (Metal/Rock/Pop/Hip-hop/Electronic/Folk) + rationale |
| Tags | `SongThemeScore` | Philosophical theme weights (0–1) across 8 theme groups + 12+ specific themes |
| Album Context | `AlbumContextAnalysis` | Per-album: overall narrative, thematic synthesis, artistic context |
| Band Context | `BandContextAnalysis` | Per-band: overall narrative, thematic synthesis, artistic evolution |

**Batch runner:** `/admin/ai-batch` can run all jobs across the entire library (or a filtered band subset). "Compound mode" covers all 7 per-song job types in just 2 OpenAI API calls. Supports checkpoint resume (skip already-done songs), force-regenerate, and automatic 429 retry with exponential backoff (20s/40s/90s delays).

**Knowledge injection:** `AdminKnowledgeEntry` rows (global or scoped to band/song) are automatically prepended to AI prompts, letting the curator guide AI interpretation with inside knowledge.

---

## 3.5 Community Scoring & Ratings

**What it does:** Any logged-in user can rate any song on the same 6-axis spectrum (0–10) plus the 6 structural music axes. Ratings are aggregated as community averages.

**Also available:**
- Genre perspective ratings (6 genres, 1–10)
- Song analysis helpfulness votes (boolean: was the AI analysis useful?)
- Song comments (free text)

**Display:** Community average shown on Spectrum page and SongSpectrumPanel alongside AI and core scores. Count of raters shown.

**Community exclusion:** Admin can flag a user as `isCommunityExcluded` to remove their ratings from aggregates (for spam/trolling).

---

## 3.6 Lyric Analysis (`/analysis`)

**What it does:** Word frequency analysis across the full library or filtered to band/album/song.

**How it works:** Lyrics are split into words, filtered by stopwords (customizable via `CustomStopword` admin table), counted, and returned as sorted word lists.

**Outputs:**
- Word Cloud (sized by frequency, colored randomly, clickable to find songs containing that word)
- Word Frequency Table (ranked list with count, percentage, and optional song-link drill-down)
- Word-Song Bipartite Graph (SVG: words on left, songs on right, edges showing co-occurrence, hover highlights)

**Inputs:** Scope (song/album/band/artist/universe), N-gram support (bigrams/trigrams), "reversed" mode (rarest words shown largest)

**Reverse mode:** Most unusual/distinctive vocabulary surfaced first — useful for identifying an artist's signature language.

---

## 3.7 Cinema Mode (`/cinema`)

**What it does:** A massive 3D force-directed graph visualization engine with cinematic camera controls, scene definitions, tour mode, social mode, and preset management.

**How it works:** Uses `react-force-graph-3d` (Three.js under the hood). 9 node types: song/keyword/album/artist/theme/tag/emotion/genre/lyric. The cinema module contains:
- `sceneDefinitions` — 8+ named cinematic scenes
- `graphArrange` — 9 spatial arrangement modes (sphere/galaxy/helix/wave/mandala/crystal/radial/galactic, plus free)
- `orbitCamera` — smooth orbital camera transitions
- `cameraRails` — pre-defined camera paths
- `TourPlanner` — builds tours from Setlist.fm or manual sequences
- `CameraDirector` — keyframe-based camera animation
- `MultiProximityAudio` — spatial audio per node proximity
- `LyricPathPanel` — path through lyrics in order
- `userPresets` / `seedPresets` / `configSnapshots` — save/load visualization configurations
- `cinemaHandoff` — integration with PatternLab (push a sequence from pattern analysis to Cinema tour)
- `UserCinemaData` — all cinema state persisted to DB per admin user

**Social Mode:** Toggleable recording mode for capturing scenes as social media content.

**Band filter:** Cinema can be scoped to specific bands.

**Limitations:** Very complex, no tutorial, overwhelming first-time UX. Requires admin access.

---

## 3.8 Explore Mode (`/explore`)

**What it does:** A public (no login required) Cytoscape.js 2D force graph of the entire library — songs, albums, artists, themes, tags, keywords, and emotions as nodes. 7 distinct node colors. 6 distinct edge colors.

**How it works:** Calls `/api/public/graph` for graph data. Layout is force-directed. Visual style (edge opacity, node sizes, label falloff, etc.) is customizable via sidebar sliders and persisted to localStorage.

**BFS label cascade:** Clicking a node highlights its BFS neighborhood, dimming other nodes.

**3D toggle:** A button switches to `ThreeDGraphView` (a 3D force graph overlay using `react-force-graph-3d`).

---

## 3.9 Pattern Lab (`/pattern-lab`)

**What it does:** Deep lyric pattern analysis across the whole library or a band selection.

**5 tabs:**
1. **Recurrence** — Repeated phrases and lyrical patterns within/across songs
2. **Phrases** — Notable phrase extraction and frequency
3. **Album DNA** — What makes an album's language unique
4. **Artist DNA** — What vocabulary is distinctively an artist's own
5. **Connectors** — Lyric phrases that bridge multiple songs/albums

**Extra features:** CSV/JSON export of all analysis data. Cinema handoff — push a pattern sequence directly into Cinema tour mode. Band/album filter via checkboxes.

---

## 3.10 Social Tools

### Social Post Generator (`/social`)
Creates AI-drafted social posts from library content.
- **Platforms:** Facebook, Instagram, Threads, Reddit, TikTok
- **Post Types:** Radar Analysis, Emotional Map, Philosophy, Poll, Entry Point, Discussion, Observational, Compare
- **Tones:** Cinematic, Analytical, Conversational, Provocative
- **Sizes:** Single line, Short, Paragraph, Essay
- Also includes `SocialChatPanel` (chat-style AI strategist) and `SocialExportPanel` (copy/download generated content)

### Social Planner (`/social-planner`)
A full content management system for social media:
- Content calendar view
- Content series management
- Comment mining (extract insights from fan comments)
- Prompt templates
- Post metrics tracking
- Engagement history

---

## 3.11 Trivia System (`/trivia`)

**What it does:** Generates music trivia question cards and exports them as 1080×1080 PNG images (perfect for Instagram Stories, Facebook posts).

**How it works:** Questions are generated from the DB content (`triviaApi`). Canvas rendering produces a dark card with: indigo header bar, question text (word-wrapped), answer in green (`#34d399`), explanation in gray, branding footer.

**Band filter:** Scope trivia to specific bands.

---

## 3.12 Playlist Maker (`/playlist`)

**What it does:** Build and save playlists from library songs, then export them to YouTube.

**How it works:**
- Drag-and-drop (or click) to add up to 500 songs
- Save named playlists via `playlistApi` (DB-persisted)
- YouTube export uses Google Identity Services OAuth2 (user's own YouTube account)
- "Copy tracklist" function for manual playlist creation elsewhere

**Current limitations:** YouTube API requires user's own Google OAuth token. Export errors occur when OAuth token has expired or scopes are insufficient.

---

## 3.13 Vinyl Runner Platformer (`/play/platformer`)

**What it does:** A full 2D side-scrolling platformer game built on HTML5 Canvas.

**Physics constants:** Gravity=0.58, Jump Force=11.2, Double-Jump Force=8.8, Max Horizontal Velocity=4.8, Friction=0.82, Hero size=28×44 pixels

**Game elements:**
- Real album artwork used as collectible "vinyl records" in-game
- Character skins: AI-generated character portraits (headshots) composited over animated body skins (torso/arm/leg parts)
- Platform layouts from admin-designed levels stored in `PlatformerLevel`
- Enemies patrol platforms; stomped from above to defeat; side contact = lose life
- 3 lives; 1500ms invincibility after hit
- Score saved to `PlatformerScore` leaderboard

**Admin management:** Full admin panel at `/admin/platformer`:
- Upload/manage sprite assets (hero/background/enemies/collectibles)
- Create/edit/delete band members (used for character skins)
- Generate AI character portraits via Pollinations.ai (free, no API key)
- Edit headshot portraits with `HeadshotEditor` (brush/eraser/undo/download)
- Manage body skin costumes (segmented torso/arm/leg animations)
- Tweak physics config (gravity, jump force, player speed, records per level)

Level designer at `/admin/platformer-levels`: Design level layouts using a column-based editor (`EditorCol` data with ground/gap/platform-low/mid/high per column).

---

## 3.14 Lyric Duel (`/play/lyric-duel`)

**What it does:** AI-judged lyrical battle game where two bands' songs compete against each other.

**4 Game Modes:**
- **Challenge** — User picks their band; AI picks a rival
- **Custom Duel** — User picks both sides
- **Manual Pick** — User hand-picks every song for every round (both sides)
- **AI Showdown** — AI picks both bands; user watches (spectator mode)

**4 Difficulty Levels:**
- **Friendly** — 3 rounds, AI is generous
- **Normal** — 3 rounds, balanced scoring
- **Ruthless** — 5 rounds, AI holds challenger to strict standard
- **Legendary** — 5 rounds, rival treated as a living legend

**Rule system:** AI draws 3–10 rules from a pool of 40+ named rules (Theme Lock, Rare Words, Killer Line, Aggression, Metaphor Game, etc.) each match. Rules are explained in the pregame brief.

**Round flow:** For each round, the AI picks one song per band (weighted random from pool, no repeats) → extracts lyric excerpt → GPT-4o-mini judges the two songs against the battle theme and all rules → returns scores/commentary/highlights/winner.

---

## 3.15 Admin Hub (`/admin/hub`)

**What it does:** Command center for daily admin workflows.

**3 Tabs:**
1. **Overview** — AI data coverage scan (shows missing/complete counts for 6 AI job types across the library), pending contribution alert, tool shortcuts grid, library workflow guide
2. **Quick Score** — Per-song inline scoring with 6-axis sliders (no need to open individual song pages), album filter, mini axis bar chart preview
3. **Contributions** — Approve/reject pending user-submitted discographies

---

## 3.16 Data Health (`/admin/data-health`)

**What it does:** Shows per-song completeness across 9 health dimensions (columns):
- hasLyrics, hasAiAnalysis, hasAiSpectrum, hasMusicScore, hasResearch, hasContext, hasGenreSpectrum, hasThemes, hasAudioAnalysis

**Output:** Summary counts at top + filterable per-song rows. Band filter. Single view to identify gaps in the library.

---

# PART 4 — DATABASE AND DATA FLOW

## 4.1 Database Overview

**Database:** PostgreSQL via Prisma ORM  
**Total models:** ~55 tables  
**Hosting:** Railway (auto-provisioned PostgreSQL)  
**Schema source of truth:** `prisma/schema.prisma`  

---

## 4.2 Core Data Models

### Library Hierarchy
```
Band (1) ──< Album (N)
Band (1) ──< Song (N)
Album (1) ──< Song (N)
Song (1) ──< Lyric (N)  [one marked isPrimary]
Lyric (1) ──< LyricRevision (N)
Song (1) ──── SongAxisScore (0..1)   [core human scores]
Song (1) ──── SongAiSpectrum (0..1)  [AI lyric scores]
Song (1) ──── SongAiAnalysis (0..1)  [AI thematic analysis]
Song (1) ──── SongResearch (0..1)    [Wikipedia+AI synthesis]
Song (1) ──── SongContextAnalysis (0..1)
Song (1) ──── SongAiGenreSpectrum (0..1)
Song (1) ──── SongMusicScore (0..1)  [structural AI analysis]
Song (1) ──< SongThemeScore (N)      [philosophical theme weights]
Song (1) ──< SongSpectrumAnalysis (N) [audio analysis results]
Song (1) ──< UserSongRating (N)      [community 6-axis ratings]
Song (1) ──< UserMusicRating (N)     [community structural ratings]
Song (1) ──< SongComment (N)
Song (1) ──< SongTag (N) ── Tag (N)
```

### User & Auth
```
User (1) ──< UserSongRating (N)
User (1) ──< UserMusicRating (N)
User (1) ──< SongGenreRating (N)
User (1) ──< SongComment (N)
User (1) ──── UserCinemaData (0..1)  [all cinema presets/keyframes]
User (1) ──< UserNodeSequence (N)
User (1) ──< TagProposal (N)
User (1) ──< TagVote (N)
User (1) ──< PendingContribution (N)
User (1) ──< [all game score tables]
User (1) ──< Playlist (N) ──< PlaylistSong (N) ── Song
```

### Social CMS
```
SocialPost (1) ──< MediaAsset (N)
SocialPost (1) ──< PostMetric (N)
ContentSeries (1) ──< SocialPost (N)
SocialPost ── Band? / Album? / Song?  [optional link]
```

### Platformer
```
Band (1) ──< BandMember (N)
BandMember (1) ──< PlatformerCharacterSkin (N)
Band (1) ──< PlatformerCharacterSkin (N)
PlatformerBodySkin [standalone — not band-linked]
PlatformerAsset [standalone — sprite store]
PlatformerLevel [standalone — level designs]
PlatformerConfig [key/value store]
PlatformerScore (N) ── User?  [nullable — anonymous play allowed]
```

---

## 4.3 Data Flow Diagrams (Text)

### Flow 1: New Song Added to Library
```
Admin: Library → Band → Add Album → Add Song
  │
  ├─ Creates: Band row (if new)
  ├─ Creates: Album row (bandId FK)
  └─ Creates: Song row (bandId + albumId FK)
        │
        └─ Admin pastes/imports lyrics
              │
              ├─ Creates: Lyric row (songId FK, isPrimary=true, sourceType)
              └─ On edit: LyricRevision row preserves prior text
```

### Flow 2: AI Analysis (Spectrum Scoring)
```
Admin: AI Batch Runner → Select Songs → Run "Compound"
  │
  ├─ For each song:
  │     1. Fetch Lyric.text (primary only)
  │     2. Fetch AdminKnowledgeEntry (global + song/band scoped)
  │     3. Build GPT-4o-mini prompt with lyrics + knowledge context
  │     4. OpenAI API call #1 → Returns: SongAiSpectrum + SongAiAnalysis + SongAiGenreSpectrum
  │     5. OpenAI API call #2 → Returns: SongResearch + SongContextAnalysis + SongMusicScore + SongThemeScore[]
  │
  ├─ Stores results in respective tables (upsert — regenerable)
  └─ DataHealthPage shows updated coverage counts
```

### Flow 3: Audio Analysis (Song Spectrum)
```
Admin: /song-spectrum → Upload audio file (or YouTube URL locally)
  │
  ├─ POST /api/song-spectrum/analyze-audio (multipart, ≤150MB)
  │     │
  │     ├─ Node.js API: Forward binary to Python worker at AUDIO_WORKER_URL
  │     │     │
  │     │     └─ Python (librosa @ 22050 Hz):
  │     │           ├─ Waveform (1000 amplitude points)
  │     │           ├─ Spectrogram (64 bins × 200 frames)
  │     │           ├─ BPM + Key detection
  │     │           ├─ Structural section segmentation
  │     │           ├─ Spectral features (centroid, rolloff, flux, etc.)
  │     │           ├─ MFCC (13 coefficients)
  │     │           └─ Scorer: 6-axis scores (0–100) with transparent heuristics
  │     │
  │     ├─ In parallel: MusicBrainz metadata lookup (optional)
  │     └─ In parallel: Auto-trigger RhythmLab analysis (same file)
  │
  ├─ Node.js: Store AudioAnalysisResult + scores in SongSpectrumAnalysis
  │     Optional: Link to library Song (songId FK)
  │
  └─ Frontend displays:
        ├─ WaveformViz (amplitude)
        ├─ SpectrogramViz (frequency heatmap)
        ├─ SectionTimeline (structural form)
        ├─ ScoreBreakdown (expandable per-axis cards)
        ├─ RhythmRadarCanvas (multi-band rhythm patterns)
        └─ Inline SVG 6-axis radar chart
```

### Flow 4: User Rating
```
User: /my/rate → Moves slider → Clicks Save
  │
  ├─ PUT /api/ratings/songs/:songId  {aggression:7, complexity:8, ...}
  │
  ├─ DB: Upsert UserSongRating (unique per userId+songId)
  │
  └─ Community aggregate (on read):
        SELECT AVG(aggression), AVG(complexity)...
        FROM user_song_ratings
        WHERE songId = X
        AND userId NOT IN (isCommunityExcluded users)
```

### Flow 5: Lyric Duel Game
```
User: /play/lyric-duel → Setup → ENTER THE ARENA
  │
  ├─ POST /api/lyric-duel/start {playerBandId, rivalBandId, mode, difficulty, ruleCount}
  │     │
  │     ├─ DB: Find eligible rival band (or AI picks both for showdown)
  │     ├─ Select N rules from 40-rule pool (random)
  │     └─ OpenAI: Generate theme + intro speech + rival pick reason
  │           Returns: MatchSetup {theme, rules, totalRounds, introSpeech, ...}
  │
  ├─ Pregame: Show theme, rules, announcer speech
  │
  └─ For each round (N rounds):
        │
        ├─ POST /api/lyric-duel/round {playerBandId, rivalBandId, theme, rules, usedSongIds}
        │     │
        │     ├─ DB: pickSong() — random from band's songs with lyrics, avoid repeats
        │     │     (or forced song IDs in Manual Pick mode)
        │     ├─ cleanLyricText() — strip [Chorus] tags, (x2) markers, etc.
        │     └─ OpenAI: Judge two lyric excerpts against theme + all rules
        │           Returns: RoundResult {scores, breakdown, highlights, commentary, winner}
        │
        └─ After all rounds:
              POST /api/lyric-duel/scores → Save LyricDuelScore to DB
```

### Flow 6: Game Score Leaderboard
```
Any game ends → POST /api/{game}/scores {userId, score, ...game-specific fields}
  │
  ├─ Creates: {Game}Score row in DB
  │
  └─ GET /api/{game}/scores?limit=N
        │
        └─ Returns: Top N scores with user name + avatar
              Displayed on: /leaderboard (unified), individual game pages
```

---

# PART 5 — CONTENT AUDIT

## 5.1 What Content Exists

- **Axis descriptions:** Each of the 6 psychological axes has a lo/hi description (e.g. "Calm, peaceful, gentle" → "Intense, abrasive, violent") and a Wikipedia link. These appear in InfoTooltip on axis labels. **Present but tiny and easy to miss.**
- **Game rules:** Every game card on `/games` shows 3 bullet rules. Game pages themselves show rules in the pre-game screen. **Present.**
- **AI rationale text:** `SongAiSpectrum.rationale` is shown under the radar chart when AI source is selected. `SongAiGenreSpectrum.rationale` shown similarly. **Present on song detail pages.**
- **How It Works on landing:** 4 steps. **Very high level, no detail.**
- **Help page (`/help`):** Exists but content not audited in detail.

## 5.2 Missing Content / Explanations

| Missing Item | Where Needed | Priority |
|---|---|---|
| "What is BSM?" — 1-sentence elevator pitch | Landing page hero | CRITICAL |
| Axis tutorial / onboarding | First visit to `/my/rate`, game pages | HIGH |
| Cinema mode tutorial | `/cinema` | HIGH |
| What is the spectrum score? | Song detail pages, spectrum page | HIGH |
| Difference between Lyric Score / Music Score / Core Score / Community Score | SongSpectrumPanel | HIGH |
| What is a "Flop" in Flop Sweeper? (theme not explained in-game) | `/play/minesweeper` | LOW |
| Game difficulty explanations | All games | MEDIUM |
| What does "AI picks" mean in Lyric Duel? | `/play/lyric-duel` | LOW |
| What is Pattern Lab for? | `/pattern-lab` | HIGH |
| What is the Audio Spectrum vs Lyric Spectrum? | SongSpectrumPanel tooltip | HIGH |
| Why do I need to sign in to rate songs? | `/landing`, `/my/rate` | MEDIUM |
| What is Vinyl Runner / how do skins work? | `/play/platformer`, admin panel | LOW |
| What is MusicBrainz? (used in discography import) | `/discography`, contribution form | LOW |

## 5.3 Technical Language Non-Technical Users Won't Understand

- "Lyric Score" vs "Music Score" vs "Core Score" vs "Community Score" — four sources for the same axes with no explanation
- "AI Showdown" — does the AI replace the player entirely?
- "Compound analysis" — batch admin term, unclear meaning
- "Song Spectrum Analysis" vs "Lyric Spectrum" — naming collision with the feature name
- "Psychedelic" axis — subjective, needs examples
- "Concept" axis — vague without explanation
- "Structural axes" (Rhythmic Complexity, Harmonic Depth, etc.) — highly technical
- "MusicBrainz" — known only to music data enthusiasts
- "MFCC", "spectrogram", "onset density" — appear in Song Spectrum analysis; engineers only

---

# PART 6 — VISUALIZATION AUDIT

## 6.1 Core Spectrum Radar Chart (`RadarChart.tsx`)

**Purpose:** Show a song/band/album's 6-axis psychological profile as a spider/radar chart.
**Library:** Recharts (SVG-based)
**Container:** 340px tall, responsive width

**Strengths:**
- Instantly comparable across multiple datasets (overlay support)
- Color-coded axes
- Tooltips with exact values
- Works for song, album-average, and band-average comparisons

**Weaknesses:**
- Small axis labels, hard to read at mobile sizes
- Radar shape can be misleading — a flat hexagon (all axes equal) looks neutral but means nothing specific
- No labels inside the chart explaining what each axis means — requires prior knowledge

**What users may misunderstand:**
- Bigger = more intense on all axes (not necessarily good)
- The "shape" of the radar is not a fingerprint of quality
- Low "Complexity" is not a criticism

---

## 6.2 Genre Radar Chart (`GenreRadarChart.tsx`)

**Purpose:** Show accessibility scores across 6 genre perspectives (Metal/Rock/Pop/Hip-hop/Electronic/Folk).
**Same structure as RadarChart** but with genre labels.

**Strengths:** Quickly shows cross-genre appeal
**Weaknesses:** Scores generated by AI without audio input — purely lyric-based inference
**Misunderstanding:** A high "Metal" score doesn't mean the song sounds like metal — it means AI thinks the lyrics would resonate with metal fans.

---

## 6.3 Generic Radar Chart (`GenericRadarChart.tsx`)

**Purpose:** A configurable radar for the 6 structural music axes (Rhythmic Complexity, Harmonic Depth, Structural Complexity, Sonic Density, Tempo Energy, Tonal Darkness) — completely different axes from the psychological spectrum.

**Used for:** Music Structure Spectrum tab on `/spectrum` page, `SongMusicScore` display.

**Weakness:** Visually identical to the psychological radar — users will confuse "Tonal Darkness" (structural) with "Psychedelic" (psychological). No visual distinction.

---

## 6.4 Bar Chart (`BarChart.tsx`)

**Purpose:** Alternative horizontal/vertical bar display of 6 axis scores.
**Strengths:** Easier to read exact values; clearer ordering
**Weaknesses:** Single dataset only (no overlay comparison); less visually distinctive than radar

---

## 6.5 Word Cloud Chart (`WordCloudChart.tsx`)

**Purpose:** Tag-cloud of lyric words sized by frequency.
**Rendering:** Pure CSS flex-wrap (not SVG/Canvas)

**Standard mode:** Most frequent = largest
**Reversed mode:** Rarest = largest (highlights unusual vocabulary — the "signature" words)

**Strengths:** Immediately shows dominant lyrical themes
**Weaknesses:**
- Flex-wrap layout is unpredictable — word placement is purely wrap-order, not artistic
- No control over color assignment (random per render)
- Very common words can dominate unless stopwords are configured
- No way to filter by part of speech

---

## 6.6 Word-Song Bipartite Graph (`WordSongGraph.tsx`)

**Purpose:** SVG visualization showing which words appear in which songs (two-column connected graph).
**Size:** 900px wide SVG

**Strengths:**
- Shows word-to-song relationships at a glance
- Hover/pin interactions make it explorable
- Edge weight (stroke width) shows frequency

**Weaknesses:**
- Fixed 900px width — breaks on small screens
- Can become unreadable with many words/songs
- No zoom, no pan
- Users may not understand what the line thickness means

---

## 6.7 Waveform Visualization (`WaveformViz.tsx`)

**Purpose:** Show audio amplitude over time as a mirrored waveform.
**Rendering:** HTML5 Canvas

**Strengths:** Standard music app visual; immediately intuitive
**Weaknesses:** Read-only, no playback interaction, no time markers, no loop region selection

---

## 6.8 Spectrogram (`SpectrogramViz.tsx`)

**Purpose:** Frequency-vs-time energy heatmap of audio content.
**Rendering:** Canvas ImageData (pixel-level)

**Strengths:** Shows harmonic content, brightness, density over time
**Weaknesses:** 
- Requires technical knowledge to interpret
- No frequency axis labels
- No time axis labels
- No color scale legend
- Will confuse non-technical users completely

---

## 6.9 Section Timeline (`SectionTimeline.tsx`)

**Purpose:** Horizontal timeline showing structural form of a song (verse/chorus/bridge segments as proportional colored bars).

**Strengths:** Immediately shows song structure; meters shown when detected
**Weaknesses:**
- Section labels ("A", "B", "C") are arbitrary algorithmic assignments — do not correspond to "verse/chorus/bridge" in reality
- Users will expect "Chorus" labels but get "A/B/C"
- Time values not shown (only proportional width)

---

## 6.10 Score Breakdown Cards (`ScoreBreakdown.tsx`)

**Purpose:** Per-axis expandable card showing audio-derived score with confidence, audio features, and explanation.

**Strengths:** Transparent scoring — shows exactly why each score was assigned; confidence indicator; expandable for detail
**Weaknesses:**
- Audio features listed (e.g. "RMS energy: 0.12") are meaningless to non-technical users
- Confidence scores have no explanation of what they mean

---

## 6.11 Rhythm Radar Canvas (`RhythmRadarCanvas.tsx`)

**Purpose:** Multi-band animated rhythm pattern visualization with 5 view modes.

**5 modes:**
- **Radar** — Phase-node dots per frequency band around a circle
- **Constellation** — Star-map style connected dots
- **Orbit** — Concentric orbits per frequency band
- **Polyrhythm** — Cross-rhythm ratio visualization
- **Pattern** — Grid-based onset display

**Strengths:**
- Genuinely unique visualization of rhythmic complexity
- Multi-band view separates kick/snare/hihat distinctly
- Animated and interactive

**Weaknesses:**
- 5 modes is too many — most users won't know the difference
- No explanation of what "phase node weight" means
- What is "polyrhythm ratio" is not explained
- Animation can be distracting with no pause button
- "Orbit" mode looks cool but is the hardest to interpret

---

## 6.12 3D ForceGraph Visualizations (Cinema, Explore, Lyrics Universe, etc.)

**Three.js-based 3D graphs used in:** Cinema (`/cinema`), Lyrics Universe (`/cinema/lyrics`), Lyrics Flow (`/cinema/lyrics-flow`), Graph Hunt game

**Strengths:**
- Breathtaking visual when first seen
- Scalable to thousands of nodes
- Band/node-type filtering
- Multiple spatial arrangements

**Weaknesses:**
- No tutorial or legend
- Very high learning curve
- No mobile support (requires mouse+keyboard camera controls)
- Performance can drop with large libraries
- Overwhelming as a "first experience"

---

## 6.13 Cytoscape.js Network Graphs (Explore, SongNodes, SongConnections)

**Used in:** Explore (`/explore` — 2D), SongNodes (`/song-nodes`), SongConnections (`/song-connections`)

**Strengths:**
- 2D force layout works on mobile (touch-drag)
- BFS highlight shows neighborhoods
- Public access for Explore

**Weaknesses:**
- Node label density can become unreadable
- Edge types difficult to distinguish at scale
- Different "graph" pages for public vs admin is confusing (Explore vs SongNodes)

---

# PART 7 — REDUNDANCY ANALYSIS

## 7.1 Duplicate Features

| Duplicate | First Location | Second Location | Recommendation |
|---|---|---|---|
| Social post creation | `/social` (generator) | `/social-planner` | Merge into one page — generator becomes a tab inside planner |
| Song-to-graph views | `/explore` (public Cytoscape) | `/song-nodes` (admin Cytoscape) | Unclear what distinguishes them; consider merging admin into explore with visibility controls |
| Word cloud | `/word-cloud` (spiral layout) | `/lyric-lab` (canvas renderer) | Both show word frequency — different renderers. Merge into Analysis page tabs |
| Word hunt in lyrics | `/play/word-hunt` (graph click) | `/guess-the-song` (separate page, not in main GAMES array) | Overlapping concept; evaluate if both are needed |
| Lyric word analysis | `/analysis` (word frequency) | `/pattern-lab` (pattern analysis) | Complementary, but both could share a unified "Lyrics Intelligence" section |
| Score entry | `/admin/hub` Quick Score tab | `/library/songs/:songId` Song Detail inline | Both allow per-song 6-axis slider scoring; OK to have both but should be flagged as same action |
| Contribution review | `/admin/hub` Contributions tab | `/admin/contributions` full page | Intentional (preview vs full) — fine, but should be clearly labeled |
| Leaderboard display | Per-game sidebar panels | `/leaderboard` unified page | OK to have both, but consistency of which games show per-game leaderboard varies |

---

## 7.2 Overlapping Features

| Overlap | Description | Risk |
|---|---|---|
| Cinema + Explore + Lyrics Universe + Lyrics Flow | Four different "visualize the library in 3D/2D" modes | Users don't know which to choose; each has unique value but no comparison guide exists |
| Pattern Lab + Lyrics Analysis | Both analyze lyric vocabulary/patterns | Pattern Lab is deeper, Analysis is quicker — but no pathway connects them |
| SongSpectrumPanel's 5 score sources | Core/Community/AI/Mine/Audio all in one small toggle bar | Cognitively overwhelming; users don't know what they're comparing |

---

## 7.3 Potentially Unused Features

| Feature | Evidence of Low Use | Recommendation |
|---|---|---|
| `IconManagerPage.tsx` | Not in App.tsx routing at all (orphaned) | Delete or add route |
| `RatePage.tsx` | Not in App.tsx routing (legacy predecessor to `/my/rate`) | Delete |
| `COMING_SOON` array in GamesPage | Defined but empty `[]` | Remove empty array or add real upcoming games |
| `SongAnalysisRating` (AI helpfulness vote) | Present in schema; unclear if shown in UI prominently | Review if this data is actually used |
| `PostMetric` + `CommentInsight` | Detailed social metrics tracking — likely not fully implemented | Audit usage in SocialPlanner |

---

## 7.4 Features That Should Be Merged

1. **`/word-cloud` + `/lyric-lab`** → Both are word frequency tools. Merge into Analysis page as separate view modes.
2. **`/social` + `/social-planner`** → Post generator should be a tab inside the Planner.
3. **`/explore` (public) + `/song-nodes` (admin)** → The distinction is unclear. A single graph page with admin-only actions (filter/edit) would be cleaner.

---

## 7.5 Features That Should Be Removed or Reconsidered

1. **`COMING_SOON` empty array** — Remove dead code.
2. **Orphaned pages** (`IconManagerPage.tsx`, `RatePage.tsx`) — Delete or route.
3. **`/spectrum-studio` redirect for non-admins** — The page is in the public route list but redirects non-admins. Either lock it fully or open it.

---

# PART 8 — MISSING FEATURES (Realistic Additions)

## High Impact / Low Effort

| Feature | What It Is | Why It Fits | Effort |
|---|---|---|---|
| Elevator Pitch on Landing | One sentence: "BSM maps your music collection across 6 psychological dimensions — see what your favourite bands actually sound like on the inside." | Exists nowhere currently. Critical for first impressions. | 1 hour |
| Axis Tooltips in All Game Pages | Small (i) icons on Spectrum Guesser, Lyric Duel, etc. explaining what each axis means | Tooltips already built (`InfoTooltip.tsx`, `AxisHelp.tsx`) — just need to be added to games | 2 hours |
| Song-to-Spectrum direct link | "View full analysis →" link from game result screens to the song detail page | Every game knows the songId; linking to `/library/songs/:id` requires one line | 1 hour |
| Daily Puzzle Hub page | A `/daily` page listing today's Crossword + Word Search + a featured analysis of the day | Crossword already has `isDaily` flag and `dailyDate`. One aggregator page. | 4 hours |
| "What's being analyzed?" explanation panel | Collapsible panel on SongSpectrumPanel explaining the difference between all 5 score sources | No data work — purely a content/UI addition | 3 hours |
| Per-game high score display | Show "Your best: X" and "Global best: X" on game idle screens | Score data already in DB; needs two API calls | 2 hours |

## High Impact / Medium Effort

| Feature | What It Is | Why It Fits | Effort |
|---|---|---|---|
| Onboarding flow | 3-step modal after first sign-in: (1) what BSM is, (2) choose your activity (rate songs / play games / explore), (3) a quick rating to get them started | User context already exists; modal can be gated by `createdAt < 24h` | 1–2 days |
| Band comparison radar on Band Detail page | Side-by-side radar showing how one band's average spectrum compares to another | RadarChart already supports multiple datasets; band averages already computed | 1 day |
| Mobile-optimized game pages | Several games (Band 2048, Record Catcher, Platformer) are desktop-only with keyboard controls | Game-by-game responsive/touch adaptation | 2–5 days total |
| "Song of the Day" feature | A daily featured song with full analysis — shareable social card | Analysis already exists; `SiteConfig` can store daily pick; `/share/songs/:id` card already works | 1 day |
| Game leaderboard on game completion screen | After a game ends, show "You ranked #X on the leaderboard" with top 5 players | Score already saved; API already returns rank; just surface it in the gameover screen | 4 hours per game |
| Search across library (public) | Allow non-admin users on the Explore page or Games page to search for specific songs/bands | Backend search endpoints already exist (`/api/songs/search`); need a search input in public header | 1 day |

## High Impact / High Effort

| Feature | What It Is | Why It Fits | Effort |
|---|---|---|---|
| Public Artist Pages with analysis | Open artist pages (e.g. `/artist/tool`) showing spectrum + genre + themes for non-admin visitors | Viewer pages already exist (`/view/:bandSlug`) — need to add analysis display | 3–5 days |
| Multiplayer Lyric Duel (real-time) | Two users compete simultaneously, each picking their song, both see the AI judge in real-time | WebSocket infrastructure needed; Lyric Duel logic already exists | 1–2 weeks |
| Auto-suggest tags from AI themes | When `SongThemeScore` is generated, propose the top-scoring themes as tags for admin one-click approval | Tag system exists; `SongThemeScore` exists; bridge logic between the two systems | 2 days |
| Artist "Signature Sound" report | Auto-generated report per band showing their unique vocabulary, dominant axes, lyrical fingerprint | PatternLab + AI Spectrum + BandContextAnalysis data all exist | 3–5 days |
| Community Challenges (weekly) | A weekly prompt ("Rate 10 songs this week", "Play Spectrum Guesser 5 times") with shared leaderboard | Users and scores already in DB; needs challenge definition system + leaderboard query | 1 week |

---

# PART 9 — GAME POTENTIAL

## 9.1 Existing Games (Already Built — 17 Total)

All 17 games are already implemented. The opportunity is in:
- **Improving existing games** (better UX, mobile support, social sharing)
- **Daily/weekly challenge modes**
- **Cross-game leaderboards**

---

## 9.2 Potential New Games From Existing Systems

### Daily Spectrum Challenge
**Concept:** Every day, one song's radar is shown anonymously. Guess the song (not the band). Score based on accuracy and speed.
**Reuse:** Existing SongSpectrumPanel data, existing daily puzzle infrastructure from Crossword
**Social sharing:** "I scored 850 on today's Spectrum Challenge!" sharable card (use existing trivia canvas export system)
**Mobile:** Excellent — just radio buttons and a radar chart
**Difficulty:** Low

---

### Lyric Battle Royale (Tournament)
**Concept:** 8-band single-elimination tournament. Each round is a Lyric Duel. Users vote on who they think won (separate from AI judge). At the end, compare AI verdict vs public vote.
**Reuse:** Lyric Duel system entirely; Album Bracket UI as tournament bracket
**Social sharing:** Very high — "My band made it to the finals!" with bracket screenshot
**Mobile:** Medium (needs bracket visualization)
**Difficulty:** Medium

---

### Axis Builder
**Concept:** Given a lyric snippet, the user must manually place it on the 6-axis spectrum. Compare their rating to the community average and AI score. Points for accuracy.
**Reuse:** All spectrum data; 6-axis slider UI already exists (in UserRatePage)
**Social sharing:** High — "I scored 94% accuracy matching the community!"
**Mobile:** Excellent — sliders work on touch
**Difficulty:** Low

---

### Spectrum Race
**Concept:** Two songs' radars appear. Which one scored higher on [randomized axis]? Answer fast. Streak bonuses.
**Reuse:** SongAiSpectrum data; RadarChart
**Social sharing:** Medium
**Mobile:** Excellent
**Difficulty:** Very Low

---

### Lyric DNA Comparison
**Concept:** Two lyric excerpts side by side — which one is [more complex / more psychedelic / more emotional]? User chooses; compare to AI scores.
**Reuse:** SongAiSpectrum; Lyric text
**Social sharing:** Medium
**Mobile:** Excellent
**Difficulty:** Low

---

### Cinema Tour Mode (Game)
**Concept:** A guided "tour" through the cinema 3D graph. The camera flies to a random node; user must name the song/band within 15 seconds. Points based on speed.
**Reuse:** Cinema module; graph data; album artwork
**Social sharing:** High (screenshot of graph position + score)
**Mobile:** Poor (requires 3D navigation)
**Difficulty:** Medium

---

### Pattern Matching Game
**Concept:** Show a word frequency bar chart or word cloud of an album. Identify which album it belongs to, from 4 choices.
**Reuse:** PatternLab API; word frequency data
**Social sharing:** Medium
**Mobile:** Good
**Difficulty:** Medium

---

# PART 10 — SCREENSHOT GUIDE

*Note: Screenshots cannot be generated without browser access. The following describes exactly what each screenshot should capture and what it would show.*

| # | Page / Feature | What to Capture | Key Elements to Label |
|---|---|---|---|
| 1 | `/landing` | Full landing page above fold | Logo, nav links, CTA button, explore tiles |
| 2 | `/landing` | Features section | 6 feature cards with icons |
| 3 | `/games` | Full games directory | All 17 game cards in grid layout |
| 4 | `/explore` | Explore graph | Force-directed graph with multiple node types, sidebar controls |
| 5 | `/cinema` | Cinema default view | 3D graph, camera controls, scene selector panel |
| 6 | `/cinema/lyrics` | Lyrics Universe | Floating lyrics in 3D space |
| 7 | `/dashboard` | Dashboard overview | Stats cards, tool grid, band list |
| 8 | `/library` | Library page | Band list with search |
| 9 | `/library/bands/:id` | Band detail page | Albums list, quick-add form, Wikipedia section |
| 10 | `/library/songs/:id` | Song detail | Lyric editor, AI analysis panel, spectrum widget |
| 11 | `/spectrum` | Spectrum page | Radar chart with multiple datasets, mode toggles |
| 12 | `/song-spectrum` | Song Spectrum Analyzer | Waveform, spectrogram, section timeline, score breakdown |
| 13 | `/song-spectrum` | Rhythm Lab results | RhythmRadarCanvas in all 5 modes |
| 14 | `/analysis` | Lyrics Analysis | Word cloud, word frequency table, bipartite graph |
| 15 | `/pattern-lab` | Pattern Lab | 5 tabs visible, band selector, export buttons |
| 16 | `/social` | Social Post Generator | Platform toggles, post type selector, generated output |
| 17 | `/admin/hub` | Admin Hub — Overview tab | Coverage scan, tool shortcuts, pending contributions |
| 18 | `/admin/hub` | Admin Hub — Quick Score tab | Inline 6-axis sliders per song |
| 19 | `/admin/ai-batch` | AI Batch Runner | Progress table, job type selectors, band filter |
| 20 | `/admin/platformer` | Platformer Admin | Sprites, skins, members tabs |
| 21 | `/admin/platformer-levels` | Level Designer | Column-based grid editor |
| 22 | `/admin/data-health` | Data Health page | 9-column health grid per song |
| 23 | `/play` | Album Art Quiz | Active game with artwork, countdown timer, answer choices, lives |
| 24 | `/play/lyric-duel` | Lyric Duel setup | Mode selection, band grid, difficulty selector |
| 25 | `/play/lyric-duel` | Lyric Duel battle | VS banner, round scoring, commentary |
| 26 | `/play/platformer` | Vinyl Runner game | Canvas game with hero, platforms, records, enemies |
| 27 | `/play/minesweeper` | Flop Sweeper | 16×16 grid in progress, flag counter, timer |
| 28 | `/play/2048` | Band 2048 | 4×4 grid with album art tiles |
| 29 | `/play/word-hunt` | Word Hunt | Cytoscape graph with hint highlight |
| 30 | `/play/crossword` | Crossword | Active puzzle grid with clues |
| 31 | `/my/rate` | User Rating Surface | Song list with 6-axis sliders |
| 32 | `/my/contribute` | Contribution form | Artist name / MusicBrainz ID input |
| 33 | SongSpectrumPanel | Song Spectrum Panel | All 5 source tabs: Core/Community/Lyric Score/Mine/Music Score |
| 34 | SongSpectrumPanel | Radar + bars side by side | View mode toggle (Radar/Bars/Pillars) |
| 35 | HeadshotEditor | Headshot Editor overlay | Canvas editor with brush/eraser tools |

---

# PART 11 — EXECUTIVE REVIEW

## 11.1 As Product Manager

### Top 10 Strengths
1. **Extraordinary depth of analysis.** Nine AI analysis types per song plus audio analysis is genuinely rare — no competitor does this.
2. **Persistent data.** Everything is stored and regenerable. The library grows in value over time.
3. **17 distinct games** from a single data source. Most similar platforms have 1–2 games.
4. **Community scoring system.** Parallel to AI analysis — direct comparison of human vs AI perception.
5. **Batch AI runner** with checkpoint resume, retry logic, and band filtering. Production-grade infrastructure.
6. **Lyric provenance tracking.** Source type and label stored on every lyric — legally defensible.
7. **Vinyl Runner platformer** — a full side-scrolling game from a library platform. Unexpected and impressive.
8. **Social content engine** — Trivia PNG export, post generator, planner, metrics. Ready for sustained content production.
9. **Cinema visualization** — genuinely cinematic. Would make an outstanding live performance tool.
10. **Transparent audio scoring** — pure DSP heuristics, no neural network, fully auditable scoring logic.

### Top 10 Weaknesses
1. **No clear product identity.** The platform does everything — analysis, games, visualization, social, music player — without a single clear positioning statement.
2. **Admin-only access to the best features.** Cinema, Pattern Lab, Spectrum Studio, Social tools — all locked to admin. Only games are accessible to regular users.
3. **No onboarding.** New users land with no tutorial, no guided tour, no explanation of what the 6 axes mean.
4. **Feature sprawl.** 17 games + 4 Cinema modes + 5 visualization tools + 9 AI analysis types + social CMS = too many features with no hierarchy.
5. **The Explore/Cinema/Lyrics Universe/Lyrics Flow routes are duplicated** with no clear differentiation for new users.
6. **Mobile experience is inconsistent.** Vinyl Runner, Band 2048, Record Catcher are keyboard-only. Cinema requires mouse+keyboard.
7. **"Regular user" role is underserved.** Non-admin users can rate songs and play games. The platform gives them almost nothing else.
8. **Discovery is poor.** Users have to navigate via URL or nav links — no recommendation engine, no "try this next" prompts.
9. **No social proof or community.** Despite a community rating system, there's no way for users to see other people's ratings, comments, or top-rated songs.
10. **Leaderboard is the only community surface.** Competition without conversation — no sharing, no discussion, no discovery of other users' analyses.

### Top 10 Improvements
1. Write one sentence that explains what BSM is. Put it everywhere: landing, header, help page, every game pre-game screen.
2. Build a 3-step guided onboarding modal for first-time users.
3. Create a public "Discovery" page — the landing page equivalent for the library — showing top-rated songs, most played games, featured analyses.
4. Open the Spectrum page (or a read-only version) to all logged-in users, not just admins.
5. Add mobile touch support to the top 3 most popular games.
6. Add "Song of the Day" with shareable card — drives daily return visits.
7. Merge Social Generator into Social Planner as a tab.
8. Merge `/word-cloud` and `/lyric-lab` into the Lyrics Analysis page as view modes.
9. Add axis explainer tooltips to every game that uses spectrum data.
10. Add a "Your Analysis vs AI" comparison — show the user their rating next to the AI score for songs they've rated.

---

## 11.2 As UX Designer

### Top 10 Strengths
1. **Clean admin UI.** Light theme, consistent card/panel patterns, very readable.
2. **SongSpectrumPanel** — excellent multi-mode analysis widget. Tab-switchers, source toggles, three view types. Genuinely thoughtful design.
3. **Game card design on `/games`** — rules, subtitle, CTA, color coding. Sets expectations well before playing.
4. **Lyric editor with revision history** — professional, non-destructive, complete.
5. **Admin Hub quick-score** — inline sliders without leaving the page. Reduces friction for repetitive scoring.
6. **Score Breakdown cards** — expandable, with confidence indicators. Progressive disclosure done right.
7. **Dark theme consistency** on all game/public pages; light theme on admin. Clear territory separation.
8. **Lyric Duel pregame** — theme + rules + announcer intro speech. Builds anticipation well.
9. **Leaderboard with avatar, streak, and rank** — complete scoreboard experience.
10. **Trivia canvas export** — the 1080×1080 output is immediately usable for Instagram Stories.

### Top 10 Weaknesses
1. **No visual hierarchy for feature importance.** The admin sidebar has 30+ links with no grouping, no prioritization.
2. **SongSpectrumPanel's source toggle bar is too small.** Five sources ("Core / Community / Lyric Score / Mine / Music Score") as tiny buttons — users won't notice the options.
3. **The 6 axes are never explained inline.** Every page that shows them assumes the user already knows what they mean.
4. **Cinema mode has zero UX affordances for new users.** No instructions, no tutorial, no legend.
5. **Admin sidebar navigation is overwhelming.** ~30 links with minimal grouping. Grouped nav with collapsible sections needed.
6. **Game timer countdown is critical info but small.** On Lyric Dissection and Spectrum Guesser, the timer should be much more prominent.
7. **Error states in games** (e.g. "Not enough songs with lyrics") are plain text, not styled error cards.
8. **The contribution flow gives users no feedback** on when/if their submission will be reviewed.
9. **No empty state messages** when a band has no songs, or analysis hasn't been run yet. Users see blank space.
10. **Score breakdown in audio analysis uses raw numbers** (e.g. "RMS: 0.12") without units or context.

### Top 10 Improvements
1. Group admin sidebar into sections: Library → Analysis → Tools → Games → System.
2. Make the SongSpectrumPanel source tabs bigger and add a brief description under the selected tab ("AI analysis of lyrics" / "Audio DSP analysis").
3. Add persistent axis legend on all pages showing the 6 axes with a 3-word description.
4. Add a Cinema "First Visit" overlay: "Drag to rotate · Scroll to zoom · Click a node to focus".
5. Add a progress indicator to all batch operations (AI batch, lyrics batch) with per-song status.
6. Make the countdown timer on games at least 2× the current size. It's the most urgent UI element.
7. Add empty state panels: "No songs yet — add songs in Library", "Analysis not run — click Generate in AI Batch".
8. Add contribution submission confirmation: "Your submission will be reviewed within 48 hours."
9. Replace raw audio numbers in ScoreBreakdown with plain English: instead of "RMS: 0.12", show "Low energy recording — quiet, intimate feel".
10. Build a unified notification/alert system: show when AI jobs finish, when contributions are approved, when a game score makes the top 10.

---

## 11.3 As Information Architect

### Top 10 Strengths
1. **Clear 3-tier access model** (public/user/admin) — well-defined territory for each level.
2. **Library hierarchy** (Band → Album → Song → Lyric) is logical and intuitive.
3. **Consistent API pattern** across all routes — REST-style, Prisma-backed, typed.
4. **Provenance tracking** for lyrics (sourceType, sourceLabel) and AI analysis (model, contextInferred).
5. **Separate models for each analysis type** — no giant "analysis" blob; each concern has its own table.
6. **`SiteConfig` key/value store** for feature flags without migrations.
7. **`AdminKnowledgeEntry` with scope** (global/band/song) — elegant context injection system.
8. **Versioned lyric revisions** — non-destructive editing architecture.
9. **Prisma as schema source of truth** — migrations are tracked, rollbacks are possible.
10. **Modular game route files** — each game is self-contained in its own route file.

### Top 10 Weaknesses
1. **No public vs private content model.** The entire library is either all-admin or shared by URL. There's no concept of public songs, private songs, or shared collections.
2. **Two separate graph pages** (Explore / SongNodes) with unclear distinction in the IA.
3. **Song Spectrum Analyzer is disconnected from the library.** A user uploads a song, gets audio analysis, but linking it to a library song requires a separate manual step.
4. **No recommendation or discovery layer.** The architecture has all the ingredients (scores, tags, themes, community ratings) but no "here's what to explore next" system.
5. **Game scores and library songs are weakly connected.** When a game uses songId, there's no easy way for users to navigate from "I just played that song" to "show me its full analysis."
6. **Social Planner and Social Generator are separate concerns with separate routes** but should be one unified content pipeline.
7. **`GuessSongPage` exists at `/guess-the-song` but is not in the GAMES array** — invisible to most users.
8. **Cinema data (presets, keyframes, node overrides) is in a single large `UserCinemaData` JSON blob** — difficult to version, diff, or partially restore.
9. **`PlatformerLevel` and `PlatformerConfig` are separate from the main library models** — good, but levels can't reference specific bands' albums directly in the schema.
10. **No internationalization structure.** All text is hardcoded in English. No i18n system.

### Top 10 Improvements
1. Define a clear sitemap hierarchy in the nav: Create → Analyze → Visualize → Share → Play.
2. Make "Link to library song" automatic when uploading audio to Song Spectrum (suggest matches by title/artist).
3. Add a "Discover" section accessible to regular users: top-rated songs, trending analysis, featured band.
4. Create a proper "Related Songs" query using shared themes/axes — surfaces as "People who rated X also loved Y."
5. Merge `/word-cloud` and `/lyric-lab` into the Analysis page as view tabs.
6. Add `/guess-the-song` to the GAMES array with proper id/card.
7. Split `UserCinemaData` JSON blobs into proper relational tables for presets, snapshots, keyframes.
8. Create a unified "Game Hub" concept at `/play` that shows all 17 games, current leaderboard rankings, and daily challenges — rather than sending users to `/games` (public) for browsing and `/play` for playing.
9. Create a public "Song Profile" page (`/song/:id`) that shows spectrum + genre + themes without admin access.
10. Add explicit versioning or `updatedAt` tracking to AI analysis models so users can see when analysis was last run.

---

## 11.4 As Community Manager

### Top 10 Strengths
1. **Community rating system exists** — the architecture for crowd-sourced analysis is built.
2. **Song comments** — users can leave notes per song.
3. **Tag proposal + voting system** — community can propose and vote on thematic tags.
4. **Contribution workflow** — users can submit full discographies for admin review.
5. **User profiles** (`/my/profile`) exist.
6. **`isCommunityExcluded` flag** — bad actors can be silenced without deletion.
7. **Leaderboard with avatars** — gives community members visibility.
8. **Multiple game leaderboards** — competition drives return visits.
9. **Trivia + social export tools** — ready-to-use content for sharing findings with the outside world.
10. **"Lookout Tokens" system** (`User.lookupTokens`) — a rate-limiting/reward mechanism already in the schema.

### Top 10 Weaknesses
1. **Users can't see each other's ratings.** The community dimension is invisible — you rate in isolation, never see how your take compares to others in a public way.
2. **No activity feed.** No way to see "UserX just rated this song" or "AdminY added a new band."
3. **Contribution approval is a black box.** Users submit a discography and receive no status update.
4. **No social sharing built into games.** No "Share my score" button. No pre-formatted social cards for game results.
5. **Comments are not prominently surfaced.** Song comments exist but there's no "most commented songs" surface.
6. **Leaderboard is the only discovery tool.** There's no "most analyzed band" or "highest rated album" public page.
7. **"Lookout Tokens" are in the schema but their UX is invisible.** Users don't know they have tokens, what they're for, or how to earn more.
8. **No notifications.** No way for users to know their contribution was approved, their comment was replied to, or they were beaten on the leaderboard.
9. **No "fan of" feature.** Users can't mark favorite bands, follow favorite songs, or build a public music taste profile.
10. **Community exclusion is one-way admin control.** No appeals process, no transparency.

### Top 10 Improvements
1. Show a public "Top Raters" section on the leaderboard — recognize consistent contributors.
2. Add "How your rating compares" to the rating surface: "You rated Aggression 8 — community average is 6.2."
3. Build a "Share Your Analysis" button on the SongSpectrumPanel that generates a shareable card combining the radar + AI rationale.
4. Add contribution status tracking: "Your submission for Tool is under review."
5. Create a "Community Spotlight" section on the landing page — top-rated song of the week by community scores.
6. Send an in-app notification when contributions are approved.
7. Surface the Lookout Tokens as a visible reward: "You have 3 tokens — redeem for a special analysis."
8. Add a "Comment of the Week" feature drawn from song comments.
9. Show "rated by X community members" prominently on every song, not buried in the source toggle.
10. Create a "My Impact" page showing how a user's ratings have influenced the community average.

---

## 11.5 As Growth Strategist

### Top 10 Strengths
1. **Unique positioning:** No other platform maps music across 6 psychological axes with both AI and audio analysis.
2. **Viral-ready game results:** Leaderboard scores + game completion screens are one "Share" button away from social content.
3. **Ready-made social content tools:** The trivia, post generator, and social planner are already built.
4. **17 games = 17 engagement loops.** Daily returning players through different games is realistic.
5. **Cinema mode = content gold.** A 30-second Cinema flythrough exported as video would perform well on YouTube/TikTok.
6. **Deep library = evergreen content.** Once a library is built, analysis never goes stale.
7. **Public explore page** — no login barrier for the "wow moment" (the 3D graph).
8. **Community data is genuinely valuable.** A large enough community rating database becomes publishable research.
9. **Educational potential:** Music theory education angle ("why is this song complex but not aggressive?") is underexplored but high-value.
10. **Platform-agnostic core:** The 6-axis scoring system can extend to any music, not just one person's collection.

### Top 10 Weaknesses
1. **Private library = limited audience.** The platform only works well for the specific band collection it contains. New users whose favorite bands aren't in the library see empty content.
2. **No viral loop built in.** No game has a built-in "Challenge a Friend" flow. No social sharing prompts.
3. **No SEO surface.** Almost everything requires authentication. Search engines can't index song analyses, game results, or library content.
4. **No email.** No notifications, no newsletters, no "new game added" announcements.
5. **No mobile app.** Mobile experience is inconsistent; a PWA exists (favicon/icons configured) but likely not published.
6. **Admin bottleneck.** All content (bands, lyrics, analysis) flows through admin. No path to community-generated content at scale.
7. **No monetization path visible.** No subscription, no data API, no licensing — unclear business model.
8. **No growth analytics.** No tracking of which games get played most, which analysis pages get viewed, which features drive return visits.
9. **The "wow moment" requires admin access.** Cinema, Pattern Lab, and Spectrum Studio — the most impressive features — are locked.
10. **No public API.** Third-party apps can't access the analysis data. A developer ecosystem is impossible.

### Top 10 Improvements
1. Build a "Challenge a Friend" flow on Lyric Duel — share a battle setup via URL, friend joins and plays the same match.
2. Add OpenGraph meta tags to all song and band pages — Facebook/Twitter card preview when URL is shared.
3. Build "Share my Spectrum" — one-click card generator using the same canvas technique as trivia cards.
4. Add a public "Today's Featured Analysis" page (no login) with one fully analyzed song per day.
5. Open the Spectrum Guesser to non-logged-in users as a demo — best "wow" entry point with minimal friction.
6. Build a "Discover Band" path: from `/landing` → pick a genre → see bands scored highest on related axes → play a game about them.
7. Create a YouTube channel companion workflow: generate analysis card → export spectrogram clip → one-click YouTube description draft with Social Generator.
8. Add push notifications (or email digest) for weekly leaderboard updates.
9. Launch a "Song of the Week" publicly — one song, full public analysis, shareable. Builds an SEO footprint.
10. Explore a public Data API tier — allow developers to query band/song spectrum scores via API key. Builds ecosystem and positions BSM as the authority on psychological music mapping.

---

# APPENDIX — QUICK REFERENCE

## The 6 Psychological Spectrum Axes
| # | Axis | Color | Lo (0) | Hi (10) |
|---|---|---|---|---|
| 1 | Aggression | Red #E5484D | Calm, peaceful, gentle | Intense, abrasive, violent |
| 2 | Complexity | Violet #8B5CF6 | Simple, repetitive, accessible | Dense, layered, intricate |
| 3 | Atmosphere | Cyan #06B6D4 | Dry, direct, stripped | Immersive, ambient, cinematic |
| 4 | Emotion | Amber #F59E0B | Detached, cold, clinical | Raw, vulnerable, intensely felt |
| 5 | Psychedelic | Green #22C55E | Grounded, literal, concrete | Surreal, hallucinatory, mind-bending |
| 6 | Concept | Orange #F97316 | Personal, narrative, concrete | Philosophical, abstract, conceptual |

## The 6 Musical Structure Axes (separate from above)
| # | Axis | Description |
|---|---|---|
| 1 | Rhythmic Complexity | Syncopation, polyrhythm, pattern density |
| 2 | Harmonic Depth | Chord complexity, key changes, tension/resolution |
| 3 | Structural Complexity | Song form, section variety, transitions |
| 4 | Sonic Density | Layering, instrumentation density, saturation |
| 5 | Tempo Energy | BPM and perceived energy |
| 6 | Tonal Darkness | Major/minor, dissonance, tonal mood |

## The 6 Genre Perspective Axes
Metal · Rock · Pop · Hip-Hop · Electronic · Folk/Indie
*(All 0–10 — represent how much appeal/resonance a song has for fans of each genre, not whether it IS that genre)*

## Score Sources (per song)
1. **Core Score** — Human-curated by admin. Most authoritative for well-known songs.
2. **Lyric Score (AI)** — GPT-4o-mini analysis of lyrics. Fast, consistent, but lyric-dependent.
3. **Music Score (Audio)** — Python/librosa DSP analysis. Requires audio upload. Reflects sound, not lyrics.
4. **Community Score** — Average of all non-excluded user ratings. Crowd wisdom.
5. **My Score** — The logged-in user's own rating.

## Tech Stack Summary
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + React Query + React Router
- **Backend:** Node.js + Express + TypeScript + Prisma ORM
- **Database:** PostgreSQL (Railway)
- **AI:** OpenAI GPT-4o-mini (all text analysis)
- **Audio Worker:** Python + FastAPI + librosa (separate Railway service)
- **Auth:** Google OAuth 2.0 (Passport.js sessions)
- **Visualizations:** Recharts, Cytoscape.js, react-force-graph-3d (Three.js), HTML5 Canvas
- **Sprite generation:** Pollinations.ai (free, no key required)
- **Music data:** MusicBrainz (import), YouTube Data API v3 (metadata only)

---

*End of document. Total features audited: 55+ database models, 24 API client modules, 100+ API endpoints, 82 frontend page files, 30+ component files, 17 games, 13 visualization types, 3 access tiers, 9 AI analysis types.*

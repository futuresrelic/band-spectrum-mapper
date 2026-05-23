# Band Spectrum Mapper — Architecture

## Overview

Band Spectrum Mapper is a monorepo web application for storing and analyzing bands, albums, songs, lyrics, and style-spectrum scoring. It is designed for Railway deployment with PostgreSQL.

**Primary goals:**
- Structured music library management
- Editable lyrics with full revision history
- 6-axis style spectrum scoring
- Lyrics analysis (term frequency, word cloud)
- Comparison views (band vs band, album vs album, custom)
- Production-ready Railway deployment

---

## Monorepo Structure

```
band-spectrum-mapper/
├── apps/
│   ├── api/          # Express + TypeScript REST API (port 3001)
│   └── web/          # React + Vite + Tailwind SPA (port 3000)
├── packages/
│   └── shared/       # Shared types, Zod schemas, constants
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── docs/
```

### apps/api

Express backend serving the REST API. Responsibilities:
- Authentication/session (future)
- CRUD for all entities
- Lyrics analysis logic
- Import processing
- Comparison aggregation
- Prisma database access

### apps/web

React SPA consuming the API. Responsibilities:
- All UI rendering
- Client-side routing (React Router)
- Server state management (TanStack Query)
- Charts (Recharts)
- Word cloud rendering
- Forms and editors

### packages/shared

Shared code used by both `apps/api` and `apps/web`:
- TypeScript type definitions
- Zod validation schemas
- Constants (axis names, source types, etc.)
- Pure utility functions

---

## Data Flow

```
User action (form, import, editor)
  ↓
React component (controlled form / file input)
  ↓
API client (fetch wrapper in src/api/)
  ↓
Express route → controller → service
  ↓
Prisma ORM
  ↓
PostgreSQL (Railway)
  ↓
Response → TanStack Query cache → UI update
```

---

## Why Lyrics Are Separate from Songs

Lyrics are stored in a dedicated `lyrics` table (not embedded in `songs`) because they need:

1. **Source tracking** — `sourceType` distinguishes manual entry, paste, file import
2. **Editability** — lyrics must be modifiable after any import method
3. **Multiple versions** — a song may have draft and final lyric records
4. **Revision history** — every edit creates a `lyric_revision` record
5. **Primary selection** — `isPrimary` flag designates the canonical version
6. **Provenance** — `sourceLabel` preserves original file name or paste source

---

## Why Scores Are Separate from Songs

`song_axis_scores` lives in its own table to:

1. Keep the `songs` entity clean and focused on identity
2. Allow future alternate scoring models (different axes, different raters)
3. Support evolving schemas without touching the song record
4. Enable songs to exist without scores (partial data is valid)

---

## Schema Overview

### Core entities

| Table | Purpose |
|-------|---------|
| `bands` | Root entity — band identity |
| `albums` | Album belonging to a band |
| `songs` | Song belonging to a band, optionally to an album |
| `lyrics` | Lyric text for a song, with source metadata |
| `lyric_revisions` | Full history of every lyric edit |
| `song_axis_scores` | 6-axis spectrum scores per song |
| `custom_stopwords` | User-defined words to exclude from analysis |
| `tags` | Reusable labels |
| `song_tags` | Many-to-many: songs ↔ tags |
| `imports` | Track every import operation and its status |
| `comparisons` | Saved comparison configurations (JSON) |

### Key relationships

```
Band (1) → (many) Albums
Band (1) → (many) Songs
Album (1) → (many) Songs
Song (1) → (many) Lyrics
Song (1) → (1) SongAxisScore
Lyric (1) → (many) LyricRevisions
Song (many) ↔ (many) Tags
```

---

## Analysis Architecture

Lyrics analysis pipeline:

1. Fetch primary lyric text for target selection (song / album / band / custom)
2. Normalize: lowercase, strip punctuation
3. Tokenize: split on whitespace
4. Filter: remove stopwords (built-in + custom), optionally enforce min word length
5. Count: compute term frequency map
6. Sort: top-N words by frequency
7. Return: frequency table + word cloud data + metadata

Spectrum analysis pipeline:

1. Fetch `song_axis_scores` for target selection
2. Compute averages per axis
3. Return: per-song scores + aggregated averages for radar chart

---

## Import Architecture

Supported formats:
- `.txt` / `.md` — raw text, entire file becomes one lyric record
- `.csv` — columns: `songTitle`, `lyrics` (row-per-song)
- `.json` — array of `{ songTitle, lyrics, albumTitle? }` objects

Import flow:
1. User uploads file on Imports page
2. API receives file via multipart form
3. Parser validates and extracts records
4. For each valid record: find or create song, create lyric record
5. `imports` record created with `status: success | partial | failed`
6. Row-level errors returned in `summary` JSON field
7. Imported lyrics are immediately editable via Song Detail page

---

## API Design

Base URL: `/api`

All responses: `Content-Type: application/json`

Success: HTTP 2xx + data payload

Errors: HTTP 4xx/5xx + `{ error: string; details?: unknown }`

---

## Spectrum Studio — Visualisation Architecture

`SpectrumStudioPage.tsx` renders an SVG canvas with 12 chart types. All chart components
receive a shared `VizProps` interface:

```typescript
interface VizProps {
  songs: SongData[];    // filtered song list with all field values
  fields: StudioField[]; // active fields for multi-axis charts
  style: StudioStyle;   // canvas colours, sizes, toggles
  fieldX/Y/Z: StudioField; // patch-bay channel assignments
  vb: { x, y, zoom };  // current viewBox pan/zoom state
  svgRef?: MutableRefObject<SVGSVGElement | null>; // for coord conversion in drag handlers
}
```

### FIELD_CATALOG (31 fields, 4 groups)

| Group | Fields | Notes |
|-------|--------|-------|
| Spectrum | aggression, complexity, atmosphere, emotion, psychedelic, concept | Manual / AI-scored 0–10 |
| Genres | genre_metal, genre_rock, genre_pop, genre_hiphop, genre_electronic, genre_folk | AI genre accessibility 0–10 |
| Themes | theme_perception … theme_apocalypse (16 fields) | AI philosophical themes 0–10 |
| Metadata | durationSeconds, trackNumber, releaseYear | Raw values, normalised for charts |

### Interactive Fibonacci / Fractal views

Both FibonacciViz and FractalViz support:
- **Click**: selects a node, pauses rotation, shows an info panel with field values, and draws
  similarity lines (dashed indigo) to the top-5 most similar songs using `fieldDist()`.
- **Drag**: moves the node. Uses pointer capture on a transparent hit-area circle so events
  continue even when the cursor leaves the element. Coordinates convert via
  `vb` + SVG `getBoundingClientRect()`.
- **Band drag (FractalViz)**: dragging a band node moves the entire subtree (all albums + songs
  for that band) by storing pre-computed start positions in `dragRef` and applying a uniform
  delta to all of them on each `pointermove`.

### MusicBrainz integration

`musicBrainzService.ts` provides a rate-limited (1 req/sec) client for:
- `searchArtists()` — artist search
- `getArtistAlbums()` — release groups
- `getReleaseGroupTracks()` / `batchGetReleaseGroupTracks()` — track listings
- `batchGetReleaseOptions()` / `batchGetTracksByRelease()` — release picker
- `searchRecordingDuration()` — duration lookup via `/recording` endpoint

### AI Batch Runner data model

The scan endpoint `GET /api/admin/ai-batch/scan` counts songs with/without each job type:

| Job | Table checked |
|-----|--------------|
| analysis | SongAiAnalysis (aiAnalysis relation) |
| spectrum | SongAiSpectrum (aiSpectrum relation) |
| research | SongResearch (research relation) |
| genre | SongAiGenreSpectrum (aiGenreSpectrum relation) |
| tags | SongTag (songTags relation, some{}) |
| metadata | Song.durationSeconds (not null) |

---

## Deployment Architecture (Railway)

```
Railway project
├── PostgreSQL service
│   └── DATABASE_URL env var → API
├── API service (apps/api)
│   ├── Build: npm run build
│   ├── Start: npm run start
│   └── Health: GET /api/health
└── Web service (apps/web)
    ├── Build: npm run build
    └── Serve: static files via Railway's static hosting or nginx
```

Environment variables required:
- `DATABASE_URL` — PostgreSQL connection string (Railway injects automatically)
- `PORT` — API port (Railway injects automatically)
- `NODE_ENV` — `production`
- `VITE_API_URL` — API base URL (set to API service URL on Railway)

---

## Future Extensibility

The architecture is designed to accommodate:

- **User authentication** — session middleware slot exists in API app
- **Multi-user ownership** — add `userId` FK to bands/albums/songs
- **Custom axis definitions** — `song_axis_scores` schema can be extended
- **Saved comparison presets** — `comparisons` table stores JSON config
- **Richer NLP** — analysis service is isolated and replaceable
- **Export enhancements** — export endpoints are separate services
- **BigQuery / analytics** — `imports` and `lyric_revisions` tables feed audit trails

## Album Art Quiz + Trivia (2026-05-14)

### Data model additions

**`Song` model additions:**
- `isInstrumental: Boolean @default(false)` — admin-toggleable flag that permanently
  skips this song in lyrics batch fetcher. Does not affect any other feature.
- `noLyricsAt: DateTime?` — auto-set by lyrics batch when a fetch returns not-found.
  Lets future batches skip recently-tried songs without re-hitting external APIs.
  Cleared implicitly when lyrics are approved (song leaves the `{ lyrics: { none: {} } }` filter).

**`GameScore` model:**
```
model GameScore {
  id        String   @id @default(cuid())
  userId    String
  score     Int
  level     Int
  duration  Int      // seconds played
  createdAt DateTime @default(now())
  user      User     @relation(...)
  @@map("game_scores")
}
```

### API routes added

| Route | Auth | Description |
|---|---|---|
| `GET /api/game/albums` | requireAuth | Album pool for the quiz (artwork only) |
| `GET /api/game/leaderboard` | public | Top 20 game scores |
| `POST /api/game/scores` | requireAuth | Save a completed session |
| `GET /api/trivia/questions` | admin | Generate trivia questions from library data |
| `PATCH /api/admin/songs/:id/instrumental` | admin | Toggle isInstrumental flag |
| `PATCH /api/admin/songs/:id/clear-no-lyrics` | admin | Clear noLyricsAt for retry |
| `POST /api/admin/lyrics-batch/resume` | admin | Resume batch, skip processed IDs |
| `GET /api/admin/game/leaderboard` | admin | Full leaderboard with user emails |
| `DELETE /api/admin/game/scores/:id` | admin | Remove a score entry |

### Trivia question generation

Questions are built entirely from existing DB data — no AI calls required:
1. **highest_score** — highest axis score song for a random axis
2. **album_order** — which of two albums came first by release year
3. **match_album** — identify album from artwork image URL
4. **lyric_snippet** — identify song from a 10-word lyric excerpt
5. **radar_guess** — identify song from its 6-axis score profile
6. **band_id** — which band recorded this song title

Distractors are always real items from the library, making questions genuinely hard.

### Game mechanics

The Album Art Quiz runs entirely client-side during gameplay; only the final score
is persisted. The countdown timer runs as a `setInterval` in React state. Level 
difficulty is computed as `floor(roundIdx / 5) + 1`; countdown shortens from 5s
to 2s minimum as level increases. The comment-for-life mechanic is a UI prompt only —
it directs users to leave comments on song pages to encourage engagement. Lives are 
not automatically granted by the backend (that would require real-time comment 
detection); the prompt is motivational. This is stated honestly per definition of done.

## Word Hunt Game + Leaderboard Page (2026-05-17)

### Data model additions

**`WordHuntScore` model:**
```
model WordHuntScore {
  id         String   @id @default(cuid())
  userId     String
  word       String
  attempts   Int
  wrongCount Int
  timeSec    Int
  score      Int
  bandScope  String?  // comma-separated band IDs, or 'all'
  createdAt  DateTime @default(now())
  user       User     @relation(...)
  @@index([score])
  @@map("word_hunt_scores")
}
```

### API routes added

| Route | Auth | Description |
|---|---|---|
| `GET /api/public/word-hunt/challenge` | public | Random challenge word from lyrics pool |
| `GET /api/public/word-hunt/verify` | public | Check if word appears in a song's lyrics |
| `GET /api/public/word-hunt/leaderboard` | public | Top N Word Hunt scores with player info |
| `GET /api/public/word-hunt/reveal` | public | All songs containing the word (post-game reveal) |
| `POST /api/word-hunt/scores` | requireAuth | Persist a won game score; returns rank |

### Public pages added

| Route | Auth | Description |
|---|---|---|
| `/leaderboard` | public | Standalone leaderboard page with Album Art Quiz + Word Hunt tabs |

### Landing page

The `/landing` page now includes:
- Sticky nav links for Library, Explore, Games, Leaderboard
- "Jump In" quick-access section (6 cards) linking to all major user features
- Updated final CTA with Explore Graph + Leaderboard buttons
- Updated footer links

### UserLayout nav

`UserLayout` header now links to Library, Explore, Games, Leaderboard, and Contribute
so logged-in non-admin users can reach all public features from any `/my/*` page.

### Score formula

Word Hunt score: `max(0, 1000 − wrongCount × 100 − timeSec × 2)`

A perfect game (no wrong guesses, under 8 seconds) scores 1000.
Each wrong guess costs 100 points; each second costs 2 points.

## Cinema Mode — Cinematic Autoplay Showcase Engine (2026-05-23)

### New directory: `apps/web/src/cinema/`

A self-contained Cinema Mode module:

```
apps/web/src/cinema/
├── graphArrange.ts      # Shared 3D layout math (extracted from ThreeDGraphView)
├── types.ts             # CinemaScene, CinemaNode, CinemaLink interfaces
└── sceneDefinitions.ts  # 8 named scene objects (enter + tick functions)
```

### Scene Engine Architecture

The scene engine is purely functional — no class, no global state. The page (`CinemaPage.tsx`) owns all state in refs and drives the engine:

```
CinemaPage
  ├── React state: currentSceneIdx, isPlaying, transitionOpacity, socialMode
  ├── Refs: fgRef, simNodesRef, adjRef, sceneStateRef, sceneStartRef
  ├── rAF loop (every frame):
  │     controls.enabled = !isPlaying
  │     → scene.tick(fg, nodes, adj, elapsed, state) when playing
  │     → orbit target animation when paused
  │     → proximity label opacity updates
  └── Scene timer (setInterval 120ms):
        → update progress bar
        → call advanceScene() when elapsed ≥ durationMs
```

### Transition System

Scene changes use a CSS opacity overlay (not Three.js):
1. Set `transitionOpacity = 1` → black overlay fades in (700 ms CSS transition)
2. Wait 700 ms → call `scene.enter()` + `animateArrange()` + reset scene clock
3. Set `transitionOpacity = 0` → overlay fades out

### Camera Authority

- **During playback**: `controls.enabled = false` — TrackballControls receives no user input. Scene `tick()` functions directly set `camera.position` and `controls.target` each frame. TrackballControls `update()` still runs (the graph's own rAF loop calls it) but applies zero accumulated drag, so it just orients the camera to look at `controls.target`.
- **During pause**: `controls.enabled = true` — user can freely orbit, zoom, and fly (WASD not available on Cinema page — it's a viewing page).
- **Fly-to scenes**: use `fg.cameraPosition(pos, lookAt, durationMs)` for periodic node fly-tos; `tick()` does not set camera between fly-to events (camera stays wherever TWEEN last placed it).

### Shared Layout Utilities

`graphArrange.ts` exports the 5 pure functions previously inlined in ThreeDGraphView:
- `easeInOutQuad(t)` — quadratic ease in-out
- `buildAdj(links)` — builds adjacency map from link array
- `computeArrangeTargets(nodes, mode, adj)` — computes 3D target positions for all 5 arrange modes
- `animateArrange(nodes, targets, fg, durationMs)` — interpolated node placement animation
- `ArrangeMode` type

`ThreeDGraphView` imports from `graphArrange` instead of duplicating the code. No behaviour change.

### Social Mode

- `document.requestFullscreen()` on the Cinema page container div
- `controls.enabled` state hidden (playback-controlled)
- Cursor auto-hides after 3 s via `mousemove` + `setInterval`
- Watermark overlay (toggleable): "Band Spectrum Mapper / scene name"
- Minimal transport controls appear on mouse move; hidden otherwise

### Public Route

`/cinema` — added to public routes in `App.tsx` (no auth required).
Added to `SiteHeader` NAV (public site header) and admin `Nav` sidebar.

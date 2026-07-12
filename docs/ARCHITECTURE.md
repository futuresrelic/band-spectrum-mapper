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
Song (many) ↔ (many) Tags          (via SongTag)
Song (1) → (many) TagProposals
TagProposal (1) → (many) TagVotes
User (1) → (many) TagProposals
User (1) → (many) TagVotes
```

### Community tag models

**`TagProposal`** — user-submitted tag candidates:
```
id, songId, tagName, slug, userId, status ('pending'|'approved'|'rejected')
@@unique([songId, slug])   # one pending proposal per tag per song
@@map("tag_proposals")
```

**`TagVote`** — one vote per (user, proposal):
```
id, proposalId, userId, vote (+1|-1)
@@unique([proposalId, userId])
@@map("tag_votes")
```

Auto-promotion rule: when a proposal's net vote sum reaches `PROMOTE_THRESHOLD` (2), the
API upserts a `Tag` record, creates a `SongTag` link, and sets `proposal.status = 'approved'`.
Rejected proposals cannot be voted on.

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
| context | SongContextAnalysis (contextAnalysis relation) |

### AI tag enrichment pipeline (Tier 1/2/3)

Tags for a song are generated by `aiTagService` and benefit from three enrichment layers:

- **Tier 1** — `aiTagService` fetches `SongContextAnalysis` (if available) and the 10 most
  recent `SongComment` entries. Title significance, lyrical interpretation, and historical
  context are injected into the prompt so the AI generates tags that reflect documented meaning
  rather than surface imagery alone.

- **Tier 2** — `songContextService` uses `gpt-4o` (upgraded from `gpt-4o-mini`) and instructs
  the AI to draw on training knowledge: published interpretations, artist interviews, and
  cultural/philosophical references the artist is known to use.

- **Tier 3** — Community `TagProposal` system. Users submit candidates; net +2 votes auto-promote
  a proposal to an official `SongTag`. The same tag table powers the Tag Constellation graph layout.

The recommended batch order for maximum tag quality: Research → Context → Tags.

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

### Depth of Field (DoF) — CSS Bokeh Overlay

The DoF effect is a `backdrop-filter: blur(Npx)` div with a radial `maskImage` gradient, layered over the WebGL canvas (`z-index: 5`). The browser composites the WebGL output before applying the filter, so it works correctly on 3D content without touching Three.js post-processing.

When DoF is enabled via the Controls panel:
- Blur amount: 2–40 px (default 14)
- Focal zone width: 10–80% of canvas width (default 44%)
- The radial gradient produces a soft vignette: centre is sharp, edges are blurred

The existing per-theme `bokehOverlay` still works; DoF overrides the blur and radius values when enabled but uses the same overlay element.

### Final Cut Timeline

`FinalCutClip` (type in `cinema/types.ts`) stores an assembled animation clip. Clip types:
- `'director'` — CinemaKeyframe array from Director Mode
- `'sequence'` — TourStep array from Node Sequence / Tour planner
- `'scene'` — a named CinemaScene id
- `'tour'` — (reserved for setlist-generated tours)

Clips are added via "🎞 Add to Final Cut" buttons in Director Mode and Node Sequence panels, or by adding the current scene from inside the Final Cut panel. State is persisted to `localStorage` (`cinema-final-cut`). The panel supports: reorder, duration edit (per clip), remove individual, clear all, and displays total runtime.

---

## Cinema Access Control

Cinema Mode applies a two-tier access model based on the `isAdmin` flag in the authenticated user's JWT token.

### Admin tier
Full access to all Cinema features: scene editing, camera Director Mode, AI Director, Tour Planner (building sequences), Path mode, Setlist panel, Config panel (themes, controls, node visibility, visual node mode, artwork spheres), Social Mode, and per-node colour/size overrides.

### Regular user tier
Read-only showcase experience:
- Browse nodes (click for info, orbit, zoom)
- Filter by band (band picker)
- Watch scenes in Scenes mode (autoplay)
- Play camera rails (Rail mode)
- Play curated sequences published by admin (Playbacks mode)
- A persistent "Band Spectrum Mapper" watermark is shown at all times

### Public sequences (`UserNodeSequence.isPublic`)
Admins can mark any saved tour sequence as **public** (🌐 toggle in Tour Planner → Saved Sequences). Public sequences are returned by `GET /api/node-sequences` for all authenticated users (not just the owner). This is the mechanism for curating showcase tours that regular users can play back.

### Enforcement points
| Layer | Mechanism |
|---|---|
| API routes | `requireAdmin` middleware on `POST/PUT/DELETE /api/node-sequences`, `PATCH /api/node-sequences/:id/toggle-public`, all `/api/cinema/*` endpoints |
| Frontend | `user?.isAdmin === true` check in CinemaPage; admin-only buttons conditionally rendered |
| Sequences read | `GET /api/node-sequences` branches on `req.user.isAdmin`: admin sees own sequences, non-admin sees `isPublic=true` sequences |

---

## Cinema Server Persistence (`UserCinemaData`)

All Cinema user customisation data for the admin account is stored server-side in the `user_cinema_data` table (one row per user, JSON blobs per data type). This makes settings available across all devices.

| Column | Content |
|---|---|
| `presetsJson` | `UserPreset[]` — visual presets (colour overrides, sky sphere, artist profiles) |
| `snapshotsJson` | `ConfigSnapshot[]` — camera/arrangement config snapshots |
| `directorKfsJson` | `CinemaKeyframe[]` — Director Mode global sequence |
| `sceneKfsJson` | `Record<string, CinemaKeyframe[]>` — per-scene looping keyframes |
| `nodeOverridesJson` | `Record<string, NodeOverride>` — per-node colour/size overrides |

**Sync strategy:** On mount, the frontend fetches `GET /api/cinema/data`. Server data is authoritative — if the server has data it is applied to state and written to localStorage as a cache. If the server row is empty (first use of this feature), local data is pushed up. After each user edit, a 2-second debounced PUT request saves the changed data type to the server. All server calls fail silently — localStorage always works as an offline fallback.

---

## Band RPG — World Systems & Puzzle Framework (Phase Z.3)

### New DB Models

| Model | Purpose |
|---|---|
| `BandRpgDoor` | Tile-blocking door entity with lock condition and type |
| `BandRpgSwitch` | Interactive switch entity with activation effect |
| `BandRpgPuzzle` | Trigger → Condition → Action chain authored by creators |

All three models belong to a `BandRpgLevel` via `levelId` foreign key.

**`BandRpgDoor`** — `BandRpgDoorType`: `key_door`, `quest_door`, `story_door`, `switch_door`, `free`
- `lockCondition Json` — WorldCondition evaluated to decide if the door is passable
- `openedByDefault Boolean` — pre-opened doors (decorative or story-revealed)

**`BandRpgSwitch`** — `BandRpgSwitchType`: `switch`, `lever`, `button`, `pressure_plate`
- `effect Json` — PuzzleAction executed immediately on activation

**`BandRpgPuzzle`** — ordered sequence per level
- `trigger Json` — PuzzleTrigger specifying the event and optional target entity
- `condition Json` — WorldCondition guard (must pass before action fires)
- `action Json` — PuzzleAction to execute

**Extended `BandRpgNpc`:** `visibilityCondition Json?` — evaluated per frame to show/hide NPC

**Extended `BandRpgPlayerProgress`:** `openedDoors Json`, `activatedSwitches Json`, `worldState Json` — persisted world interaction state

### WorldEngine Module

`apps/web/src/components/bandRpgRuntime/WorldEngine.ts` is a pure-function module with zero React dependencies:

```
WorldSnapshot  ──► evaluateCondition(condition, snap)  ──► boolean
WorldSnapshot  ──► isDoorOpen(door, snap)               ──► boolean
WorldSnapshot  ──► canOpenDoor(door, snap)              ──► boolean
PuzzleEvent    ──► findTriggeredPuzzles(event, puzzles, snap) ──► RuntimePuzzle[]
PuzzleAction   ──► evaluatePuzzleAction(action)         ──► PuzzleActionResult
RuntimeNpc     ──► isNpcVisible(npc, snap)              ──► boolean
RuntimeItem    ──► isItemSpawned(item, snap)            ──► boolean
RuntimeExit    ──► isExitVisible(exit, snap)            ──► boolean
```

`WorldSnapshot` is a minimal projection of `GameState` containing only the fields needed for condition evaluation — it prevents closure capture of the full mutable reducer state in pure functions.

### Puzzle Evaluation Flow

```
GameState change (move, collect, quest, etc.)
  ↓
applyPuzzleTrigger(state, { type, targetId }, level)
  ↓
findTriggeredPuzzles(event, level.puzzles, worldSnapshot)
  ↓ (for each matched puzzle)
evaluatePuzzleAction(puzzle.action)  →  PuzzleActionResult
  ↓
dispatch(APPLY_PUZZLE_ACTION, result)
  ↓
Reducer: open door / activate beat / reveal exit / set world state / grant item
```

### Admin Editor Routes

`worldEditorRouter` mounted at `/api/band-rpg/editor/world`:

| Method | Path | Action |
|---|---|---|
| GET | `/levels/:id/doors` | List doors for level |
| POST | `/levels/:id/doors` | Create door |
| PUT | `/levels/:id/doors/:doorId` | Update door |
| DELETE | `/levels/:id/doors/:doorId` | Delete door |
| GET/POST/PUT/DELETE | `/levels/:id/switches` | CRUD for switches |
| GET/POST/PUT/DELETE | `/levels/:id/puzzles` | CRUD for puzzles |

### Conditional Entity Filtering

All filtering happens in `BandRpgGamePage.tsx` before entities reach the renderer:

```typescript
const worldSnap = getWorldSnapshot();
const visibleNpcs  = level.npcs.filter(n => isNpcVisible(n, worldSnap));
const visibleItems = level.items.filter(i => isItemSpawned(i, worldSnap));
const visibleExits = level.exits.filter(e => isExitVisible(e, worldSnap));
```

NPC conditions are stored on the `BandRpgNpc` DB row (`visibilityCondition`). Item and exit conditions are stored in the MapEntity JSON blob (`condition` field) because items and exits are placed via the map data rather than having global definitions with placement-independent conditions.

---

## Phase Z.5 — Campaign Builder & Adventure Browser

### Adventure as a Content Container

`BandRpgAdventure` groups levels, quests, arcs, and items under a single publishable unit. The grouping is optional — existing content without an `adventureId` continues to work.

**Extended fields (Z.5):** `featured Bool`, `coverImageUrl String?`, `authorName String?`, `difficulty String?`, `estimatedPlaytime Int?`, `tags Json`.

### Adventure Progress Tracking

`BandRpgAdventureProgress` is a per-user per-adventure record (`@@unique([userId, adventureId])`). It is created lazily on first visit via `upsert` with empty `create` defaults. It is never deleted on adventure update/replace — only on explicit restart or user cascade.

`completionPct` is calculated server-side as:
```
(questsCompleted / totalQuests) * 50 + (levelsDiscovered.length / totalLevels) * 50
```

### Adventure Progress API (`/api/band-rpg/adventure-progress`)

| Route | Auth | Purpose |
|---|---|---|
| `GET /browse` | None | Published adventures + optional userId progress overlay |
| `GET /my` | Required | User's started adventures ordered by lastPlayedAt |
| `GET /:adventureId` | Required | Get-or-create progress; returns `firstLevelSlug` |
| `POST /:adventureId/sync` | Required | Game engine calls this on every save |
| `POST /:adventureId/restart` | Required | Delete + recreate fresh progress |
| `GET /:adventureId/health` | None | 6-check content health score (0–100) |

### Campaign Browser Flow

```
/play/band-rpg/adventures        (BandRpgCampaignPage — browse + my adventures)
  ↓ click adventure card
/play/band-rpg/adventures/:id    (BandRpgAdventureDetailPage — start/continue/restart)
  ↓ click Start/Continue (navigates with ?adventureId=xxx)
/play/band-rpg/game/:levelSlug?adventureId=xxx  (BandRpgGamePage — gameplay)
  ↓ on save
POST /api/band-rpg/adventure-progress/:id/sync
  ↓ if isCompleted
CompletionReport overlay (full-screen modal with stats)
```

### Health Check

`GET /:adventureId/health` checks 6 criteria:

| Check | Weight |
|---|---|
| Has at least one level | 20 |
| All levels have a spawn point in mapData.entities | 20 |
| Quest giver NPCs live in levels owned by this adventure | 20 |
| All timeline events reference valid levels/quests | 20 |
| Adventure has name + description | 10 |
| Adventure has coverImageUrl + authorName | 10 |

Score 0–100; shown inline in the admin Adventures tab via the `🏥 Health` button.


## Song Spectrum Analyzer — Audio Pipeline (Phase Z.7, 2026-06-27)

### Service topology

```
Browser (SongSpectrumPage)
  ↓ POST /api/audio/analyze-youtube-full
Node.js API (songSpectrum.ts route)
  ↓ AUDIO_WORKER_URL/analyze-youtube-full
Python worker (apps/audio-worker/main.py)
  ↓ subprocess: yt-dlp → mp3
  ↓ librosa: analyze_audio()
  ↓ scorer: compute_scores()
  ↑ { analysis, scores, rhythm }
Node.js API → SongSpectrumAnalysis (DB) → browser
```

### Feature gate

Both the Node.js API and Python worker must have `ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true`.
This is defense-in-depth: the Node.js gate rejects before touching the worker, and the
Python gate rejects if someone calls the worker directly.

### Caching layer (Phase Z.7)

`analyzeAudioFromYouTube()` in `songSpectrumService.ts` checks the DB for an existing
`SongSpectrumAnalysis` row with the same `youtubeUrl` and a populated `audioAnalysis` field,
within a 30-day TTL. On cache hit:
1. The `audioAnalysis` (waveform, BPM, key, FFT, spectral features) is returned from DB.
2. `POST /score` on the Python worker re-scores with the current `lyricsContext`.
3. The yt-dlp download and librosa analysis are skipped entirely.

The original audio file is never permanently stored — it is written to a tmpfs directory and
deleted after analysis.

### Diagnostics

`GET /api/audio/diagnostics` (admin-only) proxies to `GET /diagnostics` on the Python worker
and returns a JSON object with:
- `ytDlpInstalled`, `ytDlpVersion`, `ytDlpPath`
- `ffmpegInstalled`, `ffmpegVersion`, `ffmpegPath`
- `tempDirectoryWritable`, `cookiesConfigured`, `youtubeEnabled`
- `workerUrl`, `workerReachable`, `nodeYoutubeAudioEnabled`

Use this endpoint to verify Railway configuration before debugging yt-dlp failures.

### Error classification

`_classify_ytdlp_error()` in the Python worker maps yt-dlp stderr patterns to HTTP status codes:

| Pattern | Status | Meaning |
|---|---|---|
| HTTP 429 / "too many requests" | 429 | Rate-limited; try later or add cookies |
| HTTP 403 / "sign in" / "bot" | 403 | Bot-detected; requires YTDLP_COOKIES_CONTENT |
| "Video unavailable" / "private" | 404 | Video removed or private |
| "not available in your country" | 451 | Geographic restriction |
| "copyright" / "takedown" | 451 | DMCA blocked |
| Everything else | 422 | Generic yt-dlp failure |

All YouTube errors return 422 to the Node.js layer (not 502), preventing the cold-start
retry in `workerFetch()` from hammering YouTube's rate-limit on yt-dlp failures.

### Cinema Mode audio handoff

After analysis, the user can click "Cinema Mode" in the results header. This:
1. Creates a `CinemaAudioContext` (BPM, key, duration, loudness, spectral features).
2. Pushes it to `CinemaHandoff` in localStorage alongside `bandIds: []`.
3. Navigates to `/cinema`.

CinemaPage reads the handoff on mount, applies `speedMultiplier = BPM / 120` (clamped
to 0.3–2.0), and shows an audio context row in the handoff banner.

### Legal boundary

The Song Spectrum YouTube analysis section displays a disclaimer:
> Only analyze audio you have the right to use. BSM extracts and stores analysis data
> (tempo, key, spectral features) — not the original audio file.

The downloaded audio is deleted from the Python worker's temp directory after analysis
regardless of success or failure (guaranteed by `tempfile.TemporaryDirectory` context
manager).


## Song Spectrum on the Song Card (Phase Z.17, 2026-07-03)

### Which model is canonical

BSM has several song-scoring models; only one is the player-facing "Song Spectrum":

| Model | Purpose | Surfaced on Song Card? |
|---|---|---|
| `SongAxisScore` | **Canonical.** 6-axis Core/Curator score (aggression, complexity, atmosphere, emotion, psychedelic, concept), 0–10, one row per song. | Yes — primary module |
| `SongMusicScore` | Parallel "musical structure" spectrum (rhythm/harmony/structure), 0–10. | Yes — as "Rhythm Lab" |
| `SongAiSpectrum`, `SongThemeScore`, `SongAiGenreSpectrum`, community/personal ratings | AI-only opinion, philosophical themes, genre appeal, crowd/individual ratings. | No — admin-facing only, via `SongSpectrumPanel.tsx` / `CoreSpectrumWidget.tsx` on the Library editor |

`SongAxisScore.source` (`'ai' | 'manual' | 'import' | 'audio' | null`) tracks provenance —
added in Z.17 since the row is written from four different pipelines
(`aiAnalysisService`, `compoundAiService`, `discographyImportService` /
`scoreImportService`, `songSpectrum.ts`'s audio-DSP path) with no prior way to tell
which one produced a given score. `null` means the row predates this column.

### Song Card rendering

`WikiSongPage.tsx`'s `SpectrumModule`:
- Outline-only radar (`RadarChart` with `dark outline` props — near-zero fill so it
  never becomes an unreadable filled blob) + per-axis bars using the existing
  `AXIS_INFO` lo/hi descriptions from `packages/shared`.
- A deterministic one-sentence interpretation (`buildSpectrumInterpretation`) built
  only from real axis values — never AI-generated commentary.
- Confidence badge derived from `source` via `apps/web/src/lib/spectrumConfidence.ts`.
- Admin-only: "Generate Song Spectrum" / "Regenerate via AI" (calls the existing
  `POST /api/analysis/ai/:songId/core-score/generate`) and an inline manual-edit form
  (calls the existing `PUT /api/songs/:songId/score`, now `requireAuth`+`requireAdmin`
  after a Z.17 security fix — it previously had no auth middleware at all).
- `RhythmLabPanel` shows `SongMusicScore` read-only (`findUnique`, no AI call on page
  view) with an admin "Analyze Rhythm" button calling the existing
  `POST /api/analysis/ai/:songId/music-score/regenerate`.

### Rollups

`scoreService.averagesByBand` / `averagesByAlbum` (pre-existing) back the Band and
Album page spectrum sections. Album-level "strongest axis" / "most complex track" /
"most atmospheric track" and Band-level "albums by complexity" / extreme tracks are
computed server-side in `wiki.ts` from data already loaded for those pages — no new
per-request cost beyond one extra indexed query on the Band page.

### "Similar by Spectrum"

Song endpoint computes Euclidean distance across the 6 axes against other scored
songs in the same band, server-side, and only includes results when at least 3
comparable songs exist — otherwise the field is an empty array and the section
doesn't render.

### ModuleDataStatus — superseded by the server-side registry (Z.17.5)

The client-side `buildModuleStatuses()` described above (added in Z.17) was
replaced in Phase Z.17.5 by a server-computed registry — see the next section.
`ModuleDataStatus` now lives in `packages/shared/src/types.ts`, not a local
web-only file, and the frontend never re-implements "does this song have X."


## Analysis Pipeline & Database Health (Phase Z.17.5, 2026-07-03)

### The module registry

`apps/api/src/services/songHealthService.ts` is the single source of truth
for "does this song have module X." 11 modules, each declared once with a
score weight (0 = tracked/shown but excluded from the percentage — e.g.
Trivia has no persisted per-song state, Media has no backing system yet)
and, for 6 of them, a position in the auto-generate pipeline:

```
Lyrics → Spectrum → Rhythm → Theme → Genre → AI Summary
```

Metadata, Live Data, Community, Trivia, and Media are tracked but not
pipeline-eligible (Metadata/Live Data require a human or a different
existing tool; Community is user-authored; Trivia/Media have no
generate path at all).

Two entry points, both used by the Wiki routes:
- `computeSongHealth(input)` — single song. Callers pass in whatever
  they've already loaded (`wiki.ts`'s song endpoint already has
  score/lyrics/bandRpgProfile/musicScore); this only fetches the pieces
  nothing else needed yet (theme count, genre row, research row, comment
  count — 4 small queries).
- `computeAggregateHealth(songIds)` — Album/Band rollups. Batched
  existence checks (`groupBy`/`findMany` across the whole ID set), so a
  70-song discography costs the same handful of queries as one song, not
  70× as many.

`generateModule(moduleKey, songId)` is the single dispatch point every
pipeline-eligible module's generation goes through — both the "Analyze
Song" pipeline and any future caller use this one function, which simply
calls the pre-existing service (`aiAnalysisService.generateCoreScore`,
`songMusicScoreService.getOrCreate`, `themeAnalysisService.getOrCreate`,
`genreSpectrumService.getOrCreate`, `songResearchService.getOrCreate`,
`aiLyricService.recallAndStore`). No module's generation logic is
duplicated between the per-module admin button and the pipeline.

### Job queue

`apps/api/src/services/analysisJobService.ts` + the `AnalysisJob` model —
single-process, DB-backed. `enqueue(scope, targetId, requestedBy)`
resolves the song set (one song, or every song in an album/band), writes
a `waiting` row, and returns it immediately; `process()` continues
in-process without blocking the HTTP response, walking `runSongPipeline()`
per song and updating `completedSteps`/`currentStep`/`resultJson` as it
goes. Cancellation is cooperative: the runner checks `job.status` before
every pipeline stage of every song, so "Cancel" takes effect at the next
stage/song boundary, not instantly.

This is intentionally not a distributed worker — there's no Redis/BullMQ,
no separate worker process. The `analysis_jobs` table is the seam: a
future phase can point a real worker at `waiting` rows without changing
`enqueue`/`retry`/`cancel`/`list`'s public shape. Known limitation: a
server restart mid-job leaves it stuck in `running` until manually
retried — acceptable for the current single-instance deployment, and
explicitly deferred rather than solved with ad hoc reconnection logic.

### Where each surface reads from this

| Surface | Reads | Endpoint |
|---|---|---|
| Song Card health section | `SongHealth` | embedded in `GET /api/wiki/songs/:id` |
| Album page health section | `AggregateHealth` | embedded in `GET /api/wiki/albums/:bandSlug/:albumSlug` |
| Band page health section | `AggregateHealth` | embedded in `GET /api/wiki/bands/:slug` |
| Admin Data Health scanner (`DataHealthPage.tsx`) | flat per-song boolean table (different shape, same underlying Prisma relations) | `GET /api/admin/data-health` |
| Admin Analysis Jobs panel | `AnalysisJob[]` | `GET /api/admin/analysis-jobs` |
| "Analyze Song/Album/Band" | enqueues, then polls | `POST /api/admin/analysis-jobs/:scope/:targetId/run` |

The admin Data Health scanner and the Song Health registry deliberately
stay as two shapes over shared truth rather than one forced-common shape:
the scanner is a sortable/filterable table across the whole catalog (bulk
audit use case), while `SongHealth` is a rich single-song breakdown with
inline actions (in-context repair use case). Both agree on what "has data"
means per module because both ultimately check the same Prisma relations
— reconciling their differing shapes into one generic structure was judged
not worth the complexity it would add to a working page.


## Permissions & Song Card Media (Phase Z.17.6, 2026-07-03)

### The three-tier model

Every route in the app maps to exactly one tier:

- **PUBLIC** — no auth. Browsing the Wiki, Song Cards, Band/Album pages,
  viewing Spectrum/Live Frequency/collection progress, reading stories.
- **PLAYER** — `requireAuth`. May create/edit/delete only rows they own:
  ratings, comments, playlists, setlists, collection, curator profile, tag
  proposals/votes, discography contributions.
- **ADMIN** — `requireAuth, requireAdmin`. The only tier that may touch
  canonical data: Band/Album/Song/Lyric, all analysis scores, Song Media,
  live-data fetch/alias matching, bulk import, moderation, the analysis
  pipeline and job queue.

`apps/api/src/middleware/permissions.ts` documents this as a `Capability`
union (`canView`/`canRate`/`canComment`/`canEditOwn`/`canModerate`/
`canEditCanonical`/`canGenerate`/`canRepair`/`canFetch`/`canDelete`) mapped
to its tier, and re-exports `requireAuth`/`requireAdmin`/`optionalAuth` so
route files have one import path for both the enforcement middleware and
the capability vocabulary. It does not replace Express middleware as the
enforcement mechanism — it documents intent and adds one new piece:
`requireOwner(getOwnerId)`, a reusable ownership guard for PLAYER-tier
(`canEditOwn`) routes, used by `playlist.ts`'s delete route as the
reference example for future player-owned-resource routes.

A full endpoint audit (Z.17.6) found the entire canonical catalog CRUD
(`songs.ts`, `albums.ts`, `bands.ts`, `lyrics.ts`) had no auth middleware
at all, plus gaps in `discography.ts`, `imports.ts`, and the AI tag route
in `analysis.ts` — all fixed. See `docs/CHANGELOG.md`'s Z.17.6 entry for
the full list and a real ownership-check bug found in `playlist.ts`
(`req.user.id` vs the JWT payload's actual `req.user.userId` field).

### Song Media (YouTube)

`SongMedia` (one row per song, `songId` unique): `youtubeVideoId`,
`sourceUrl`, `title`, `status` (`available | needs_review | broken |
private | removed`), `addedBy`. `normalizeYouTubeUrl()`
(`packages/shared/src/youtube.ts`) is the single validation point —
accepts `youtube.com/watch`, `youtu.be`, `/embed/`, `/shorts/` URLs only,
rejects arbitrary hosts/iframes, reduces to the 11-character video ID.
`status = 'removed'` is a soft delete (row kept, not deleted) so "an admin
removed it" stays distinct from "never had one" in Song Health and the
admin Data Health scanner.

Routes (`songs.ts`, all admin-only): `PUT /:songId/media` (add/replace,
same upsert), `PATCH /:songId/media` (flag/relabel without replacing),
`DELETE /:songId/media` (soft delete). Embedded into the existing
`GET /api/wiki/songs/:songId` response (`song.media`) rather than a
separate fetch — same pattern as `score`/`musicScore`.

Media now has a nonzero weight (0.5) in `songHealthService.ts`'s registry
— only `status = 'available'` counts as complete data; the other statuses
represent something needing admin attention. Included in both per-song
`SongHealth` and Album/Band `AggregateHealth` rollups automatically (the
rollup UI maps over `moduleCoverage` generically — no per-page changes
were needed to surface the new module).


## Wiki routing + reserved modules (Phase Z.17.7, 2026-07-03)

### Routing

`App.tsx`'s `<Routes>` had no catch-all — an unmatched path (like the
`/wiki/bands` browse route, which was never registered) rendered nothing
at all, not even an error. `<Route path="*" element={<NotFoundPage />} />`
is now the last route in the tree; `/wiki/bands`, `/wiki/albums`,
`/wiki/songs`, `/wiki/artists` are now real registered routes backed by
`WikiBandsBrowsePage.tsx` / `WikiAlbumsBrowsePage.tsx` /
`WikiSongsBrowsePage.tsx` / `WikiArtistsBrowsePage.tsx` — each a
client-filtered grid/list over a full list endpoint
(`GET /api/bands` for bands, new `GET /api/wiki/{albums,songs,artists}`
for the rest), sharing `components/wiki/WikiBrowseSearch.tsx` for the
search-box + result-count header.

### Reserved module graduation pattern

Song Spectrum and Rhythm Lab (Z.17), Media (Z.17.6), and now Full Timeline
and Community (Z.17.7) all followed the same path: a
`WikiModulePlaceholder` tile in a generic array became a live section with
its own component, reading real data the Wiki already had. Trivia, Lyrics
DNA, and Song Node (Z.17.7) took a middle path instead — each needed
bespoke per-song logic (does this song have lyrics? is the caller admin?)
that a generic `{icon, title, description}` array entry couldn't express,
so they became small dedicated panel components
(`TriviaPrepPanel`/`LyricsDnaPrepPanel`/`SongNodePrepPanel` in
`WikiSongPage.tsx`) instead of graduating to full sections. The generic
`FUTURE_MODULES` array is gone — every remaining "not built yet" tile now
has a reason, in code, for why it isn't further along (admin-only +
band-scoped trivia tool that doesn't fit a per-song ask; no Lyrics DNA
generator exists at all; the Song Node graph is admin-only and too heavy
to embed).

`WikiModulePlaceholder` gained an optional `action?: ReactNode` slot
(additive) specifically so these panels could offer a real link (never a
button that 404s) without a new placeholder component per module.

### Community ratings

`CommunityRatingPanel` (`WikiSongPage.tsx`) adds zero new backend — it's
a Song Card surface over the pre-existing `UserSongRating` +
`/api/ratings` system (already used elsewhere via `SongSpectrumPanel.tsx`
/ `CoreSpectrumWidget.tsx` on the admin Library editor). Community average
fetches via the public batch endpoint (`ratingsApi.getCommunityRatings`)
so it's visible without login; a player's own rating and the ability to
submit/update it require `requireAuth` and are scoped server-side by
`req.user.userId` — never a client-supplied id, so this can't touch
another player's row or the canonical `SongAxisScore`. `SongComment` is
real and correct on the backend but still has no frontend client at all —
a real next step, not attempted this phase.

## Headliner — standalone concert-building game (Phase Z.17.9, 2026-07-10)

A deliberately separate game from Band RPG and every other `/play/*` mode —
no shared tables, no shared progression, no imports between the two
feature areas beyond the one intentional, honest cross-link between Band
RPG's Collection page and Headliner's (architecture-only) Campaign card.
Full reuse audit in `docs/proposals/HEADLINER_DATA_FLOW.md`; full design in
`docs/proposals/CONCERT_ARCHITECT.md`.

### Layering

```
apps/api/src/services/concertEngine.ts       — pure simulation, zero IO
apps/api/src/services/concertDataService.ts  — the ONLY place this feature touches Prisma
apps/api/src/services/campaignEligibilityService.ts — reads BandRpgCollectedSong only
apps/api/src/routes/headliner.ts             — requireAuth + requireOwner throughout
apps/web/src/api/headliner.ts                — thin fetch client
apps/web/src/pages/HeadlinerPage.tsx          — mode-select → setup → live → report
```

`concertEngine.ts` is intentionally the only file with no Prisma import in
the whole feature: it's a pure function of `(seed, state, pick) → state'`,
so `concertEngine.test.ts` can exercise the entire simulation with in-memory
fixtures and no database. This is what makes "same seed + same choices =
same result" a property that's actually tested, not just asserted in a
comment.

### Snapshot boundary

`concertDataService.buildShowBundle(bandId, venueId)` runs exactly once, at
`POST /api/headliner/runs`. Its output — every song's spectrum/audience/live
data, already resolved — is embedded whole in `ConcertRun.stateJson`. Every
later `pick`/`finish` call reads only that frozen snapshot; the engine never
re-queries the database mid-run. This is deliberate: without it, an admin
regenerating a song's AI analysis mid-show could make the same seed produce
a different result depending on timing, breaking the determinism guarantee.

### Why `audienceProfileService` is never imported here

`audienceProfileService.getOrCreate` calls OpenAI synchronously on a cache
miss. Importing it into `concertDataService.ts` would mean gameplay could,
depending on which songs happen to be unscored, silently trigger a live AI
call with unpredictable latency and non-deterministic potential — the
opposite of what a seeded, replayable engine requires. `concertDataService`
reads `prisma.songAudienceProfile` directly instead and falls back to a
neutral (all-50) profile in memory, never writing anything or triggering
generation. Full reasoning in `HEADLINER_DATA_FLOW.md` §3.

### Live Frequency now lives in `packages/shared`

`deriveLiveFrequency` and its tier constants moved from
`apps/web/src/lib/liveFrequency.ts` to `packages/shared/src/liveFrequency.ts`
so this server-side engine and the existing client-side badges derive tiers
identically instead of maintaining two copies. The web path re-exports from
shared; nothing else changed.

### Deferred beyond Phase 1 (named, not silently dropped)

- **Daily Challenge** is still a UI-visible "coming soon" card on the
  `/play/headliner` mode-select screen with no fake playability behind it.
- **Campaign** was Phase 1's other deferred item — it shipped in Phase
  Z.17.10 (below).
- **Opener/closer/encore role stats** and **song co-occurrence hints**,
  from real historical setlists — the schema blocker was removed in Phase
  Z.17.10 (`BandRpgRawSetlistEntry` now has `setNumber`/`position`/
  `isEncore`), but the derivation logic itself (`setlistRoleStats.ts`) is
  still not built — Phase 3.
- **Cross-run leaderboard** — `ConcertRun.overallScore` and its
  `[bandId, overallScore]` index exist specifically so this can be added
  without a schema change later.

## Headliner Campaign (Phase Z.17.10, 2026-07-10)

Connects Headliner to Band RPG without merging the two games. The
relationship is one-directional and structural, not a shared table:

```
Band RPG Collection (BandRpgCollectedSong)
        │  read-only, always live
        ▼
campaignEligibilityService.ts  →  concertDataService.buildCampaignShowBundle
        │                                   │
        ▼                                   ▼
campaignStages.ts (config)  →   concertEngine.ts (same pure engine as Quick Show)
        │
        ▼
campaignService.ts  →  HeadlinerCampaignProgress / HeadlinerCampaignShowResult
```

### The engine still isn't forked

Phase 1's `concertEngine.ts` hardcoded a few constants (`TUNING.minSongsBeforeEndAllowed`,
`TUNING.maxMainSetSongs`, `FACTIONS[].shareOfCrowd`, `TUNING.encoreCrowdEnergyThreshold`).
Campaign needs different values per stage (a 3-song Rehearsal Room vs. a
13-song Major Theatre; a forgiving tutorial crowd vs. a demanding festival
crowd). Rather than branch the engine on `mode`, those four constants moved
onto a `ShowRules` object carried by every `ShowBundle`. `DEFAULT_SHOW_RULES`
reproduces Phase 1's exact values for Quick Show; `campaignStages.ts`
supplies a per-stage override. `isMainSetComplete`, `resolveEncoreEligibility`,
and `weightedCrowdEnergy` all read from `state.bundle.rules` now instead of
the global constants — the only engine change this phase, and it's mode-blind:
the engine has no idea whether it's running a Quick Show or a Campaign stage,
only what rules it was handed.

### Why the identity target isn't recomputed from the recovered subset

A tempting shortcut would be: compute the Campaign spectrum target from only
the songs the player has recovered, so a small collection is never
"punished." That's the wrong difficulty curve — the design brief is
explicit that "Campaign difficulty should come from catalog limitations and
crowd demands, not hidden information." So `buildCampaignShowBundle` reuses
the exact same `scoreService.averagesByBand(bandId)` call Quick Show uses —
the band's real, full-catalog identity — and only restricts which songs are
*playable*. A player with 3 recovered songs is aiming at the same target as
a player with the full discography; they just have far fewer ways to get
close. That's the actual game.

### Objective feasibility vs. objective success

Every stage past Rehearsal Room has 2-4 objectives (e.g. "play a
Rare-or-rarer song"). If a player's recovered catalog literally cannot
satisfy one — say, they have zero Rare+ songs — that objective is excluded
from the 3-star requirement for that run (`isObjectiveFeasible`, checked at
run start against the recovered catalog) rather than silently making a
perfect run impossible. Objectives that *are* feasible still have to be
*met* (`evaluateObjective`, checked at finish against what was actually
played) — feasibility is a floor, not a free pass.

### Star/objective evaluation reads raw EngineState, not a report extension

`concertEngine.ts`'s `ConcertReport` shape (10 metrics + overall score) is
shared with Quick Show and was not extended with Campaign-only fields.
Objective checks that need raw facts the report doesn't carry — unique
albums actually played, whether a Rare+ tier song was actually played —
recompute them directly from `EngineState.playedSongIds` +
`EngineState.bundle.songs`, which is already fully available server-side at
finish time (it's the same object that gets snapshotted into
`ConcertRun.stateJson`). This keeps the shared engine artifact free of
Campaign-specific concerns, per the instruction to extend through
"mode-specific components or config," not by growing the shared report.

## Headliner Daily Challenge (Phase Z.17.11, 2026-07-11)

One shared, server-verified concert puzzle per UTC calendar date. The
hardest constraint this phase had to satisfy: every player must see the
*identical* starting show, and the server — never the browser — must be
the sole authority on the final score.

```
UTC challenge date
        │  pure hash, no Math.random()/Date.now() inside the engine
        ▼
dailyChallengeService.selectDailyCombo()  →  band + venue + crowd context
        │
        ▼
concertDataService.buildShowBundle()  (same full-catalog assembly as Quick Show)
        │
        ▼
HeadlinerDailyChallenge.bundleSnapshotJson  (frozen — never re-derived)
        │  every player's run reads this ONE row, not a fresh DB query
        ▼
concertEngine.ts  (same pure engine, same as Quick Show/Campaign)
        │
        ▼
HeadlinerDailyResult  (first completed run per user = official; rest = Practice)
```

### Same engine, one more configuration axis

Daily didn't need a single engine change beyond the candidate-validation
fix below — it reuses `ShowRules`/`ShowBundle` exactly as Campaign does.
The three crowd "contexts" (Standard/Hardcore Crowd/Newcomer Night) are
just `factionShare` overrides, the same mechanism `campaignStages.ts`
already uses for its five stages. Nothing about "this is a Daily run" ever
reaches inside `concertEngine.ts` — the engine has no `mode` concept at
all, only rules it was handed.

### The one shared engine improvement: candidate-hand validation

Building Daily surfaced a real gap in the Phase 1/2 engine: `applyPick`
only checked that a `songId` existed and hadn't been played yet — nothing
stopped a client from picking any remaining song, not just one from the
hand it was actually shown. That's harmless-looking in Quick Show (it just
lets a player dodge the "avoid the obviously best pick" design) but
becomes a real integrity problem the moment scores are leaderboard-ranked
and server-verified. `EngineState` gained `currentCandidateIds`, populated
by `generateCandidates`/`generateEncoreCandidates` and checked by
`applyPick`/`applyEncorePick`. This is why the spec's "safe shared
improvements" carve-out exists — the fix belongs in the shared engine, not
duplicated per-mode, and every existing Quick Show/Campaign determinism
test still passes against it unchanged.

### Why the client never sends a seed, a rule, or a score

Every other Headliner mode already worked this way (the pick route always
recomputes state server-side from `ConcertRun.stateJson`), so Daily's
"never trust a client-submitted score" requirement was mostly already
satisfied by the existing architecture — verified, not re-invented. The
one gap was candidate-hand validation (above). Concretely: `startRunSchema`
has no `seed` field at all; the seed for a Daily run is always
`HeadlinerDailyChallenge.seed`, read server-side. Rules come from the
frozen `bundleSnapshotJson`. The score is always `buildReport(state)`'s
output, computed after the server replays the pick — a client cannot
submit `overallScore` because no route ever reads one from `req.body`.

### Official vs. Practice — a unique constraint, not a status flag

`HeadlinerDailyResult` has `@@unique([challengeId, userId])`. The *first*
successful `create()` for a given challenge+user is the official result;
every later completed run for that same challenge simply finds the
existing row and returns "Practice" without touching it. A concurrent
double-submit (two tabs finishing within the same request window) is
handled by letting the loser's `create()` fail on the unique constraint
and re-reading the winner's row — the guarantee comes from the database,
not from a `status` field or a pre-check that could itself race. This was
chosen over an explicit "Submit Official Run" button specifically because
the spec asked for "the simpler, harder-to-exploit version."

### Snapshot boundary, one level up from Campaign

Quick Show and Campaign already snapshot a `ShowBundle` once per *run*.
Daily adds one more snapshot layer above that: the bundle is frozen once
per *challenge* (shared across every player's run), and each individual
run still snapshots that same frozen bundle into its own
`ConcertRun.stateJson` at creation, exactly like every other mode. A
canonical data change tomorrow can affect tomorrow's challenge; it can
never reach back into today's.

### Deterministic rotation, not a cron job

There's no scheduled job that "generates tomorrow's challenge." The first
request for a given UTC date — from any player, any time zone — is what
creates that date's `HeadlinerDailyChallenge` row, via
`getOrCreateDailyChallenge`. Since the band/venue/context selection is a
pure function of the date string alone, it doesn't matter who triggers
creation or when within that date; the result is identical either way. A
concurrent first-request race is handled the same way as the official-
result race above: the loser's `create()` fails the unique constraint on
`(challengeDate, version)` and re-fetches the winner's row.

## Headliner Creative Bible implementation, Part 1 (Phase Z.17.13, 2026-07-12)

`docs/proposals/HEADLINER_CREATIVE_BIBLE.md` (Phase Z.17.12) is the
permanent creative specification; this phase implements its "Ready Now"
items only, per the Bible's own Section 16 readiness map.

### `headlinerReviewTemplates.ts` — the review system's centralized home

The post-show review (Bible §7) used to be two small inline functions in
`concertEngine.ts` (`buildHighlights`/`buildReviewText`, a handful of
if/else-if sentences). It's now a dedicated module: ~70 `ReviewTemplate`
records across six slots (opening/identity/crowd/pacing/encore/closing),
each with an explicit array of metric conditions, matched against a
`ReviewContext` built from the same `ConcertReport` metrics that already
exist. Selection is "most-specific-template-wins, then fixed array order"
— deterministic by construction, no seed needed for *this* property (the
Bible's own §16.B flags true multi-variant *rotation* — picking a
different one of several same-tier variants across different runs — as
a separate, not-yet-implemented concern; several slots intentionally carry
more than one template at the identical threshold for that future work to
pick between).

`concertEngine.ts` imports one function, `buildConcertNarrative`, from
this module; `headlinerReviewTemplates.ts` imports only *types*
(`EngineState`, `ScoreMetric`) back from `concertEngine.ts`, so there's no
runtime circular dependency — type-only imports are erased at compile
time.

### Contradiction guards are conditions, not a separate filter pass

Bible §7.8 lists specific sentence pairs that must never appear together
(e.g., a "no guesswork" identity line next to a "too narrow a catalog"
closing line). Rather than build a second post-selection filtering pass,
each guard is encoded as an extra `MetricCondition` on the template that
needed constraining — e.g. `CLOSE-08` gained a `spectrumMatch < 85`
condition it didn't have in the Bible's raw table, `ENC-01`/`ENC-02`
gained `audienceRetention >= 40`, `PACE-01`/`PACE-02` gained
`overallScore >= 200`. This keeps the whole system single-pass and
declarative — a template's eligibility is entirely self-contained in its
own condition list, nothing to reconcile across slots afterward.

### Locked Campaign stages now explain themselves

A real, shipping violation of the project's own "never a bare Locked"
rule got fixed in passing: `StageCardTile` showed a "Locked" pill with no
further text for any stage the player hadn't reached yet. Bible §11 item
12 requires an explanation; the fix needed `unlockRequiresStars` (already
present in `CampaignStageConfig`, just not exposed on the `StageCard` API
shape) so the UI can say *why* — "[Stage] books on reputation: it opens
when you've earned N star(s) at [previous stage] — you have [current]."

---

## Headliner Creative Bible implementation, Part 2 (Phase Z.17.14, 2026-07-12)

Continues Part 1 with the three remaining workstreams the owner scoped:
**Part A** (Campaign stage copy, Bible §6), **Part B** (small, safe engine
exposure for narrative systems, Bible §16.B), and **Part C** (Concert
Pulse, Live Reaction Log, Concert Viewport, editable crowd config, and the
compact faction display Part 1 flagged as debt). Nine focused commits,
each independently reviewable; zero score/momentum/pacing formula changes
anywhere — verified by the full pre-existing test suite passing unchanged
before every new addition on top.

### Part B — `SongHistoryEntry`: per-song exposure, not new math

`concertEngine.ts`'s `EngineState` gained `history: SongHistoryEntry[]`,
appended by `applyPick` alongside its existing mutations. Every field is
either a direct copy of a value `applyPick` already computed that session
(`factionReactionScores`, `pacingPenalty`) or the *same* formula run one
song earlier than it used to be: `computeMetricsSnapshot()` was extracted
out of `buildReport` (previously the only place the 10 metrics were
computed, at the very end of a show) so it can run after every pick
instead. Nothing about how a metric is calculated changed — verified by
extracting it byte-for-byte and confirming the full pre-existing test
suite still passed unchanged immediately after the extraction, before any
new field was added.

Per song, `SongHistoryEntry` carries: index and encore flag; faction
momentum before/after/delta for all five factions; the song's own best
single-faction reaction (pre-dampening); crowd energy before/after/delta;
the pacing penalty for that transition; the full 10-metric snapshot as of
that point in the show; and whether this song set a new running high or
low for crowd energy. `concertShowHistory.ts` (a new, separate file — kept
out of `concertEngine.ts` to stay small and focused) derives further,
purely retrospective facts from that array: `computeShowPositions` (index,
total, 0-1 normalized position, opening/middle/closing/encore phase) and
`findPeakSongId`/`peakHappenedDuringEncore`, which return `null`/`false`
whenever `state.crowdPeak <= 0` — the engine never fakes a peak it can't
support.

### Part B — deterministic narrative seeding, and ENC-09 goes live

`narrativeSeed.ts` is a small, dependency-free FNV-1a hash
(`stableTemplateHash`) plus `pickBySeededHash(items, ...seedParts)` — never
`Math.random()`, nothing time-based. `headlinerReviewTemplates.ts`'s
`selectTemplate` used to break ties among equally-specific templates by
always taking the first array entry (e.g. between the two intentional
"≥800" opening-line variants); it now resolves ties via
`pickBySeededHash(tied, narrativeSeed, slotName)`, where the seed is
`${state.seed}:${state.playedSongIds.join(',')}` — built once in
`buildConcertNarrative`. Reopening the same completed show always
re-derives the same seed and therefore the same review text; a different
show (different seed or different setlist) can land on a different tied
variant. All existing contradiction guards and the "most-specific-wins"
rule are unchanged — the seeded pick only ever chooses among templates
that were *already* tied for first place.

ENC-09 ("the encore was the show's true summit") was dormant since Part 1
for exactly the reason its Bible footnote states: it needs to know the
show's peak happened *during* the encore, which needed per-song position
data. That data now exists (`peakHappenedDuringEncore`), so ENC-09 is
live: `requiresPeakDuringEncore: true` is a new template-matching axis
(alongside the existing `requiresEncorePlayed`), and its extra
specificity is weighted so it outranks `ENC-01`/`ENC-02` whenever both are
metrically eligible — a real, honestly-confirmed peak-in-encore claim is
more specific than a generic strong-encore claim.

### Part A — `campaignStageCopy.ts`: centralized, not scattered

All five Campaign stages' Bible §6 copy (title tagline, intro, venue
fantasy, audience feeling, why-it-matters, player-learns, victory text,
1★/2★/3★ text, unlock text, failure text) lives in one data file,
transcribed from the Bible. `campaignService.ts`'s `getLadder` attaches
each stage's copy plus a computed `lockedExplanation` (Bible §11 #12,
built from real progress data — the *previous* stage's
`unlockRequiresStars` and the player's best stars there, never the locked
stage's own field, which would be the wrong number). `finalizeCampaignRun`
attaches `resultText` (victory text + the star-appropriate line, or the
stage's own failure text at 0 stars — falling back to the Bible §11 #7
generic wrapper only for Rehearsal Room, which has no failure text because
it cannot meaningfully fail) and `unlockText` (the just-cleared stage's
own description of what opens next, only when a next stage actually
unlocked). `HeadlinerPage.tsx`'s stage cards and post-show result panel now
render these server-provided strings instead of building copy inline —
the locked-stage message and the "🔓 Unlocked: stagekey" line (previously
a raw un-humanized slug) are gone.

### Part C — `liveReactionLog.ts`: Bible §8's 18 categories as predicates

Each of the Bible's 18 reaction categories is a pure predicate over
`SongHistoryEntry` (plus, for a few, the current/previous song's
`EngineSong` audience/tempo data) — never a metric number in the text.
`LOG_TUNING` holds the small set of "how large is large" thresholds that
exist *only* to decide which line fires (a tempo gap that counts as
"contrast," a reaction-score spread that counts as "split room," etc.);
where a boundary already existed in the shipped engine (`explainReaction`'s
45/-45 reaction bands, the Bible §7.0 metric bands), it's reused rather
than invented twice. At most two lines fire per song, chosen by the
Bible's stated priority order (walkout-risk > faction spikes > pacing >
spectrum) when more than two trigger. Variants rotate via the same
`pickBySeededHash` mechanism as the review templates, seeded by the run's
seed plus the song's id plus the category — so a reopened show reads
identically, and Mythic's extra "never played live" variant is only ever
eligible for a Mythic song. `routes/headliner.ts`'s `/pick` response now
carries `reactionLog: ReactionLogEntry[]`; the web page accumulates every
song's lines into a reviewable, expandable "Reaction Log" panel instead of
discarding them after the next pick (Bible §15: nothing important stays
ephemeral).

### Part C — `concertPulse.ts`: a presentation layer, not a new formula

`computeConcertPulse(state, reactionLog)` distills the engine state into
one small snapshot the UI renders: momentum direction/intensity, new
show high/low, a "recovery" flag (rising after 2+ declining songs), a
"split room" flag (wide reaction spread across factions this song),
`walkoutRisk` (any faction at/below the walkout momentum band), the
current show phase, the top Live Reaction Log line, and
`rankFactionsByRelevance` — a deterministic ranking (crowd share + this-
song delta + deviation from neutral, with a faction at walkout risk
always forced to rank first so a real warning can never be pushed out of
a capped display) used to show only the 3 most relevant factions
persistently (Bible §14: "no more than three always-visible meters"),
with the full five one tap away in the new `CrowdRead` component. Per-song
attendance/satisfaction are deliberately absent from this state — the
engine has no per-song figure for either (only the running
`audienceRetention` metric, or, for Daily, an end-of-show total) — and
"faction explicitly targeted by venue/context" (one of the relevance
factors named in the original ask) isn't implemented either, since
`ShowBundle` carries no such signal today. Both are documented gaps, not
silent fabrications.

### Part C — `ConcertViewport.tsx` and the editable crowd config

A lightweight, CSS-only audience: a wrapped row of small dots (or
configured sprite images) grouped into the five factions, sized by each
faction's real `crowdShare` (a genuine `ShowRules.factionShare` value, now
also exposed on `FactionPulseSummary`) rather than split evenly. No 3D, no
per-spectator simulation. A faction at walkout risk renders its dots as
empty slots rather than a fabricated shrinking headcount, since the
engine has no literal per-song attendance figure to animate toward.
Motion respects `motion-reduce:`; the viewport is `aria-hidden` since
everything it depicts is already stated in text by `ConcertPulse`.

Visual configuration (`crowdVisualConfig.ts`) reuses the existing
`SiteConfig` key-value admin pattern — no new table. Every field defaults
to `null`/a plain-CSS-friendly value so the viewport needs zero uploaded
assets to work: viewport background, four per-spectator-state sprites
(standing/active/low-energy/walkout), an optional stage foreground,
animation intensity and a master on/off switch, spectator density/size,
viewport opacity, and a faction-clustering toggle. Asset URL fields accept
an http(s) URL or a `data:image/` URI under the same 5MB limit
`routes/platformer.ts` already enforces for uploaded sprite data — no new
validation convention invented. `GET /api/settings/headliner-crowd-visual-
config` is public (any player's viewport needs to load it); `PUT` is
admin-only via the same `requireAuth` + `req.user?.isAdmin` +
`validateBody` pattern every other settings endpoint uses. The admin
editor lives at `/admin/headliner-crowd-visual-config`, following
`AdminGamesPage`'s load/dirty-state/save structure.

### Achievement evaluation helpers — pure, unwired

`achievementEvaluators.ts` adds pure predicates for the 20 of the Bible's
30 achievements that are determinable from a single completed show. No
persistence layer or achievement table exists in the project, and
building one was explicitly out of scope this phase — these functions
exist so a future persistence layer can call `evaluateSingleShowAchievements
(state, report, context)` without recalculating or scraping UI state.
`#8` (The Turnaround) and `#27` (Friend of the Floor) are newly evaluable
specifically because of this phase's `SongHistoryEntry`/per-faction-final
exposure. Not implemented, and documented as such in the file: `#2`,
`#10`, `#14`, `#19`, `#22` (need a counter across *multiple* shows),
`#12`, `#17`, `#24` (streak counters), `#25` (needs a persisted previous-
best score to compare against — state this phase doesn't have access to
from a single show alone), and `#30` (requires the aspirational venue
archetypes from Bible §4, which don't exist yet — left dormant rather than
approximated).

### Known limitations / explicitly out of scope this phase

- No achievement is actually awarded or persisted anywhere — see above.
- Per-song attendance and satisfaction remain unavailable; nothing in
  Concert Pulse, the Live Reaction Log, or the viewport fabricates them.
- "Faction explicitly targeted by venue/context" (a named relevance
  factor for the compact faction display) isn't implemented — `ShowBundle`
  has no such signal today.
- The Concert Viewport is CSS/DOM only, not Canvas — chosen because it's
  simpler to keep accessible (the meaningful information is already
  stated in text by `ConcertPulse`) and avoids a new rendering dependency.
- This project has no web-side test runner (confirmed again this phase);
  reduced-motion and visual behavior for the new components were verified
  by consistent use of the existing `motion-reduce:` Tailwind convention
  and manual review, not automated browser tests.

---

## Track Classification (Phase Z.17.15, 2026-07-12)

A lightweight classification layer on `Song`, separating **what a track
is** from **where it may be selected** — so gameplay/content systems can
distinguish a normal song from an interlude, spoken-word piece, cover, or
oddity without a complicated admin interface.

### Schema

`Song` gains two kinds of new columns, both with safe defaults so every
existing row (and every existing song-creation path — manual admin
creation, MusicBrainz/discography import, bootleg import — none of which
set these fields explicitly) picks them up for free:

- **`trackType`** (`TrackType` enum, `@default(Song)`): `Song`,
  `Interlude`, `Spoken`, `Cover`, `Special` — exactly these five, no more.
  Purely descriptive; nothing reads it to make a decision today (the
  eligibility flags below do that instead) — it exists so an admin or a
  future feature can ask "what kind of track is this" directly, without
  inferring it from title text or `isInstrumental`.
- **Five independent `Boolean` eligibility flags**, all `@default(true)`:
  `eligibleHeadliner`, `eligibleDailyChallenge`, `eligibleTrivia`,
  `eligibleAiSetlists`, `eligibleDiscovery`. Each is editable on its own —
  a track can be Trivia-eligible but Headliner-ineligible (the Bible's own
  worked example: a spoken-word answering-machine message is fun trivia
  fodder but shouldn't turn up as a playable "song" in a concert).

Migration `20260712000000_add_track_classification` follows this repo's
existing hand-written-migration convention for a new enum column
(`CREATE TYPE ... AS ENUM`, then `ALTER TABLE songs ADD COLUMN`, mirroring
`20260528000000_add_album_type`'s `AlbumType` precedent). Verified
end-to-end against a real, throwaway local Postgres instance rather than
just reasoned about: built the `songs` table from the pre-migration
schema, inserted a row with none of the new columns set, ran the
migration SQL directly, and confirmed the row came back with
`trackType='Song'` and all five `eligible*=true` — then ran `prisma db
push` with the post-migration schema against that same database and got
"already in sync," confirming the hand-written SQL is byte-for-byte what
Prisma's own schema expects.

`packages/shared` mirrors the existing `SONG_RARITIES`/`ALBUM_TYPES`
pattern: `TRACK_TYPES` (+ `TRACK_TYPE_LABELS`/`_DESCRIPTIONS`) and
`TRACK_ELIGIBILITY_FIELDS` (+ `TRACK_ELIGIBILITY_LABELS`) are the single
source of truth the admin editor and any future consumer read from,
rather than each surface hardcoding its own list.

### Headliner: prefer, never remove

Per the design brief's explicit instruction ("do NOT remove tracks from
the database... prefer tracks using eligibility"), Quick Show and
Campaign never exclude a headliner-ineligible song from the query or the
candidate pool. Instead, `concertEngine.ts`'s `EngineSong` carries
`eligibleHeadliner`, and `candidateValue` (the function that ranks which
songs make it into a candidate hand) applies a large new ranking penalty
(`TUNING.headlinerIneligiblePenalty`) when it's false — large enough that
a healthy catalog almost never offers the ineligible song, but a catalog
where it's the only song left can still fall back to it. This is a
ranking preference, not a scoring/report-metric change: `buildReport`'s
10 metrics and their weights are untouched. Campaign inherits this
automatically — it runs through the same engine and the same
`candidateValue`, so no separate filter was added to
`buildCampaignShowBundle`.

### Daily Challenge: hard filter

Daily Challenge's instruction is stricter ("should only consider tracks
eligible for Daily Challenge"), so it's a real query-level exclusion, not
a preference. `concertDataService.ts`'s `buildShowBundle` gained a
`mode: 'headliner' | 'daily'` parameter; `dailyChallengeService.ts` now
calls it with `'daily'`, which adds `eligibleDailyChallenge: true` to the
`prisma.song.findMany` `where` clause. No score formula or gameplay
rebalance — this only changes which songs are ever offered.

### Trivia

All four Trivia question types that read from the `Song` table
(highest-axis-score, lyric-snippet, radar-profile-guess,
band-identification) now require `eligibleTrivia: true` via a shared
`songFilter` built from the route's existing `bandFilter`. The two
question types that never touched `Song` (album-release-order,
album-art-identification) are unchanged.

### AI Setlists and Random Discovery — flags defined, no consumer yet

Honestly documented gap: this codebase has no existing "AI Setlist
generation" feature (the only OpenAI-backed generator found,
`campaignGeneratorRoutes.ts`, produces Band RPG adventure content, not a
setlist) and no dedicated "Random Discovery" feature either.
`eligibleAiSetlists` and `eligibleDiscovery` are defined on the schema,
exposed in the admin editor, and ready for whichever future feature reads
them — but nothing filters by them today, since there's nothing yet to
filter. This is stated here rather than left to be discovered later.

### Admin editor

`SongDetailPage.tsx`'s existing inline "Edit Song" form — the project's
only song-metadata editor — gained a Track Type `<select>` next to the
existing Rarity dropdown, and a compact 2-column grid of the 5
eligibility checkboxes, styled like the existing "This is a remix"
checkbox. The read-only bulk Data Grid (`AdminDataGridPage.tsx`) was left
alone: it has no edit capability for any field today, so there was no
existing mutation path to wire new columns into.

---

## Track Classification expansion + Headliner Live Concert Viewport (Phase Z.17.16/Z.17.17, 2026-07-13)

Two connected pieces, done together because one affects what Headliner
can select and the other visualizes the concert itself.

### Track Type: 5 -> 15 discography types

`TrackType` expanded from `Song/Interlude/Spoken/Cover/Special` to a
full 15-value discography classification: `Song`, `Instrumental`,
`Interlude`, `SpokenWord`, `SoundCollage`, `Intro`, `Outro`,
`Transition`, `Cover`, `Live`, `Demo`, `Remix`, `BonusTrack`,
`SuiteMovement`, `Special`. Eligibility (`eligibleHeadliner`/
`eligibleDailyChallenge`/`eligibleTrivia`/`eligibleAiSetlists`/
`eligibleDiscovery`) is completely unchanged — Track Type still only
describes what a recording *is*, never where it may appear, and one
canonical primary type stays per song (the schema/UI don't assume
multi-classification, but nothing about them rules it out either — a
future phase could add secondary types like "Live + Cover" as an
additional optional field without touching this one's meaning).

Migration `20260713000000_expand_track_type` widens the column to
`TEXT`, renames the one value that actually changed (`Spoken` ->
`SpokenWord`), recreates the enum with the full 15-value set, and casts
back — Postgres can't rename a value and `ADD VALUE` several new ones in
one `ALTER TYPE`, so this is the standard safe pattern for a rename +
expansion together. Verified against a real throwaway Postgres instance
exactly like the previous Track Classification migration: built the
5-value schema, inserted one row per old value (including `Spoken`),
applied the migration, confirmed every row landed on the correct new
value and a fresh insert using a brand-new value (`SuiteMovement`)
worked immediately, then confirmed `prisma db push` on the new schema
sees zero drift.

`RECOMMENDED_TRACK_ELIGIBILITY` (packages/shared) gives every type a
suggested starting point for the 5 eligibility flags — applied only via
an explicit "Apply recommended eligibility" button in the admin editor,
which fills the checkboxes for review before Save. It never runs
automatically on type change and never overwrites an admin's existing
choices on its own.

### Headliner Live Concert Viewport

A pure presentation layer — nothing in it touches scoring, momentum,
pacing, candidate generation, Campaign progression, or Daily Challenge
verification. The whole system is one small server-side data exposure
plus a chain of pure, unit-tested client-side derivation modules feeding
CSS/Canvas renderers.

**Data flow:**
```
Headliner engine state (server, unchanged)
  -> PickResponse: result, pulse, reactionLog, metricsSnapshot   (existing + one new field)
  -> ConcertVisualState adapter (apps/web/.../concertVisualState.ts, pure)
  -> Crowd Memory / Concert Pulse ribbon / lighting derivations (pure, unit-tested)
  -> ConcertViewport / ConcertPulseRibbon / ConcertStage renderers (CSS + Canvas)
```

**New server-side exposure** (concertShowHistory.ts's `latestMetricsSnapshot()`,
returned as `metricsSnapshot` in `/pick`'s response): the most recently
played song's existing 10-metric snapshot (Part B's per-song
`SongHistoryEntry.metricsSnapshot`, already computed, just not
previously sent to the client). This lets the viewport reflect
satisfaction/authenticity/pacing/energy *during* the show instead of
only in the final report. `EngineSong` also now carries `trackType`
(presentation-only in the engine) and the client-facing
`CandidateSong`/`PickResult.song` types gained `trackType` and `axis` —
both were already computed server-side and already present in the JSON
response; they just weren't declared on the client type before.

**`ConcertVisualState`** (`concertVisualState.ts`) is the single adapter
every renderer reads from. It documents its one honest approximation:
"satisfaction" is the `audienceRetention` metric, because the engine has
no separate per-song satisfaction figure (only Daily's end-of-show
total, which isn't per-song). Every other field is a direct pass-through
of `ConcertPulseState`/the metrics snapshot/the last pick result —
nothing is invented.

**Crowd Memory** (`crowdMemory.ts`) is a slowly decaying per-faction
"warmth" value — a pure `stepCrowdMemory(previous, factions, elapsedMs,
tuning)` step function, called once per new pulse reading with the real
elapsed wall-clock time since the last one. It nudges toward (never
teleports to) a target derived from the faction's current direction/
intensity/walkout-risk, and decays back toward neutral on an admin-
configurable half-life. Deterministic given the same inputs; the only
non-deterministic input is the wall clock, exactly as the spec allows
("visual smoothing may use elapsed animation time").

**Concert Pulse ribbon** (`concertPulseRibbon.ts` derivation +
`ConcertPulseRibbon.tsx` Canvas renderer): turns `ConcertVisualState`
into amplitude/coherence/brightness/segment-count. A healthy show (good
pacing, no split room, no walkout risk) reads as one smooth, bright
segment; awkward pacing, a split room, or walkout risk fragments it into
more segments at lower coherence; `isRecovery` nudges coherence back up
before the underlying metric fully catches up, so a reconnecting moment
visibly reads as reconnecting. The renderer lerps toward these targets
every frame (never jumps), is devicePixelRatio-safe, pauses drawing when
the tab is hidden, and falls back to a mostly-static gradient line under
reduced motion.

**Stage lighting** (`concertLighting.ts`): derives fog opacity, a cool-
to-warm color blend, glow intensity, pattern intensity, and a capped
animation-speed multiplier from the *current song's real 6-axis Song
Spectrum* (the same six canonical axes — aggression, complexity,
atmosphere, emotion, psychedelic, concept — used everywhere else in
BSM; no invented spectrum). Speed is deliberately capped (0.6-1.2x) well
below anything that could read as flashing or strobing.

**Concert Stage** (`ConcertStage.tsx`): generic CSS silhouette
performers (vocalist/guitarist/bassist/drummer/keyboardist) with
restrained looping idle animations (sway, strum, drum-hit) — never a
likeness of a real musician. Any slot can be replaced with an admin-
configured sprite image, or omitted from the stage entirely (a band
without a keyboardist just doesn't render one).

**Crowd rendering** (`ConcertViewport.tsx`): four modes (dots,
silhouettes, pixel, minimal) sharing the same underlying per-faction
data — only the spectator shape/fallback differs. **Crowd Neighborhoods**
assign each of the five factions one fixed, documented visual zone
(`casual` -> Rear Floor, `hardcore` -> Pit, `deepCut` -> Left Floor,
`progHeads` -> Right Floor, `firstTimers` -> Balcony — see
`FACTION_NEIGHBORHOOD` in `ConcertViewport.tsx`), since the engine only
exposes faction-*level* reactions, never per-section data; this is a
predictable, tested distribution of real data into visual space, not
invented section-level metrics. A small `sr-only` legend lists the
faction/neighborhood pairing for screen readers; per-dot labels were
deliberately not added (the spec asks for players to "slowly learn"
where each group sits).

**Venue presets** (club/arena/festival/historic) only change the
backdrop gradient — never a gameplay difference, matching the instruction
that venue presentation stay purely presentational.

**Camera**: a single, slow (18s cycle) CSS `scale`/`translateY` loop on
the whole stage+crowd wrapper — no shake, no cuts, disableable by the
admin default or the player's own setting.

**Editable everywhere, safe by default**: `crowdVisualConfig.ts`
(API + web, same `SiteConfig` pattern as before, no new table) now
covers performer sprites + active slots, stage backdrop, crowd render
mode, venue preset, lighting/fog/particle/camera toggles, Concert Pulse
palette, and Crowd Memory enabled/decay rate, on top of the existing
crowd-sprite/density/opacity fields from Part C. Every field defaults to
`null`/a plain-CSS-friendly value — the viewport needs zero uploaded
assets to render. The admin editor (`AdminCrowdVisualConfigPage.tsx`)
exposes all of it through plain inputs/selects/checkboxes/color pickers
— no JSON editing anywhere. "Particle overlay" is an honestly-labeled
reserved toggle with no renderer yet.

**Player display settings** (`headlinerDisplaySettings.ts`,
`HeadlinerDisplaySettingsPanel.tsx`): crowd mode override, animation
quality, Concert Pulse intensity, Crowd Memory on/subtle/normal, camera
motion, and a viewport enabled/disabled switch — persisted in
`localStorage`, never sent to the server, never canonical state. A
player can only ever change how their *own* client renders an
already-determined, server-authoritative show. Respects the system's
`prefers-reduced-motion` by default and listens for live OS-level
changes to it.

### Testing

apps/web gained its first pure-logic test suite — `npx tsx --test`, the
exact runner apps/api's `node:test` suite already uses (zero new
dependency; `tsx` was already a monorepo devDependency). 37 tests across
`concertVisualState`, `crowdMemory`, `concertPulseRibbon`,
`concertLighting`, `headlinerDisplaySettings`, and the fixed faction ->
neighborhood mapping. This does not cover React rendering or browser
behavior — there is still no component/browser test runner in this
project; every test here is of a pure function or data table.

### Known gaps / deferred to a future visual pass

- No pixel-crowd sprite *sheet* (frame-based) support — the "pixel" mode
  currently reuses the same single-sprite-per-state system as dots/
  silhouettes with `image-rendering: pixelated`, not a true sprite sheet.
- No drag-and-drop performer-position or neighborhood editor — positions
  are fixed by slot order, not yet individually adjustable.
- No particle-effect renderer (the admin toggle exists, reserved).
- No automatic quality downgrade based on detected device capability —
  quality is a manual player/admin setting, not auto-detected.
- Concert Pulse's "attendance ratio" and "satisfaction" both derive from
  `audienceRetention`, the closest existing metric — a genuinely separate
  per-song attendance figure still doesn't exist in the engine (same
  honest gap Part B/C already documented) and isn't fabricated here.

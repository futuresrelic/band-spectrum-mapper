# Changelog

All meaningful changes to Band Spectrum Mapper are documented here.

---

## Cinema: Scene cam playback fix, chain selection, progressive lyrics, free cam (2026-05-24)

### Fixed

- **Scene cam "Preview loop" not working** — the sceneKfPlayRef block was nested inside the `isPlayingRef` guard, so clicking "Preview loop" (which stops scene playback first) never drove the camera. The block now runs independently at the top of the rAF tick, identical to how the global Director sequence works. Scene cam now previews correctly whether the scene is playing or stopped.

### Added

- **Copy path to Sequence** — in the 🎬 Scene cam tab, a "↗ Copy path to Sequence" button appears when the current scene has keyframes. Clicking it appends those shots to the global Director sequence, letting you chain multiple scenes' paths into one long one-shot sequence.

- **Node chain selection** — clicking a node starts a selection chain; clicking an adjacent node extends it; clicking a node already in the chain truncates back to it; clicking the background clears. Visual feedback: chain nodes glow white/sky-blue, edges between consecutive chain nodes are bright white, potential next-hop edges from the last node show dim cyan as navigation guides. Everything else dims.

- **Progressive lyrics reveal** — a new mode in the Lyrical DNA controls (⚙ → Lyrics → Progressive reveal). When on, lyrics appear line by line as the camera lingers near a node, with a pace slider (0.5s–8s per line). Moving away from a node resets its timer so the reveal starts fresh next time you approach.

- **Free cam toggle** (`🕹 Free` button, appears during scene playback) — disables the scene's built-in camera program so you can navigate freely with mouse/touch without the camera being pulled back to the programmed path. The button turns amber when active. Automatically resets to locked when you change scenes.

---

## Cinema Mode — Genre Radar layout, Director Mode, genre nodes (2026-05-24)

### Added

- **Genre Radar arrangement + Scene 17 🎼** — new `genre-radar` ArrangeMode places the 6 genre nodes at the vertices of a large hexagon. Songs are positioned at the weighted centroid of their genre poles based on actual genre scores, so songs with a strong single-genre identity cluster near their pole while multi-genre songs land naturally between poles. Songs with no genre data form a compact scatter near the center. Albums float above the centroid of their songs. Scene 17 "Genre Radar" uses a slow orbital sweep at 35° elevation.

- **Director Mode** (`📽️` toolbar button) — build a fully custom camera sequence with keyframes:
  - **Capture** — saves the current camera position and look-at target as a named shot.
  - **Label editing** — click any shot name to rename it inline.
  - **Duration** — per-shot duration selector (1s → 20s).
  - **Reorder / Delete / Go-to** — ↑ ↓ to reorder shots, ✕ to remove, ⟶ to fly the camera to that position for preview.
  - **▶ Play sequence** — plays all shots in order using smooth easeInOut interpolation; stops scene playback while active.
  - **Persistent** — keyframes are saved to localStorage and survive page reload.

---

## Cinema Mode — AI genre nodes, AI Director, new themes, label controls, camera polish (2026-05-23)

### Added

- **AI Genre Spectrum nodes** — songs that have been scored by the AI genre analyser now appear in the Cinema / Song Nodes graph as orange `🎼 Genre` nodes (Metal, Rock, Pop, Hip-Hop, Electronic, Folk). Each genre node is linked to every song that scores ≥ 0.1 on that axis. The node size reflects relative weight; the type-toggle appears in the legend so genres can be shown/hidden independently.

- **Genre data source selector** (in ⚙ settings panel → Genre data source):
  - `🔀 Auto (community → AI)` — default; uses the community average rating for each perspective when any ratings exist, falls back to AI score per-perspective when no community data is available.
  - `👥 Community` — uses only the aggregated `SongGenreRating` data from all users.
  - `🤖 AI` — uses only the `SongAiGenreSpectrum` AI-generated scores (previous behaviour).
  - Switching source automatically reloads the graph data.

- **AI Director** (`🤖 AI` button in Cinema toolbar):
  - Natural-language sandbox: type what you want to see ("psychedelic cosmic trip", "organic tree, earthy tones", "emotional landscape mandala") and GPT-4o-mini picks the arrangement, theme, orbit speed, node visibility, and camera preset.
  - Backend endpoint `POST /api/public/cinema-ai` returns structured JSON settings.
  - Results applied live: theme changes, re-arrange animates, camera repositions to preset.
  - Graceful degradation if `OPENAI_API_KEY` is absent (503 with clear message).

- **New Cinema themes** (now 16 total):
  - `🕰️ Dalí Dream` — warm amber/rust sepia palette with hue-rotated saturation boost, surrealist feeling.
  - `♾️ Escher` — high-contrast grayscale on off-white, heavy black links, impossible-geometry feel.

- **New Cinema scene** (now 16 total):
  - `🌻 Fibonacci Spiral` — golden-angle sunflower disk; camera descends from top-down overhead to sweeping side view over 24 s.

- **Label styling controls** (in ⚙ panel → Label Style):
  - Toggle label backgrounds on/off.
  - Background opacity slider (0–100%).
  - "Show through nodes" toggle — sets `material.depthTest = false` on SpriteText so labels always render in front of geometry.
  - Text colour picker.

- **Selection dim slider** — 0% keeps full theme colours for dimmed nodes, 100% is fully dark. Intermediate values blend via hex interpolation.

### Fixed

- **Arrangement respects hidden node types** — `reArrange` and `activateScene` now filter to visible nodes only before computing targets. Hiding tags/themes no longer leaves ghost positions; sphere view works with just songs/albums/artists.
- **`reArrange` button accepts an override mode** — AI Director can trigger a re-arrange with any mode without switching the active scene.

### Improved

- **Camera polish** for all 6 new scenes:
  - Fibonacci Torus: enters at 35° elevation showing the full donut; tilt oscillates between face-on and edge-on.
  - Fractal Tree: enters near root level, eased rise from roots to canopy over 22 s.
  - Mandala: pure top-down entry; breathes between overhead and 40° oblique.
  - Wave Rider: low-angle entry skimming the wave surface.
  - Lissajous Trip: off-axis entry showing 3D depth; two independent rotation speeds.
  - Crystal Cave: true isometric entry (equal projection from all 3 axes); descends into lattice over 15 s.
  - Fibonacci Spiral: starts directly overhead for the sunflower reveal.

---

## Cinema Mode — orbit camera, tour script, lyrics universe, mobile fix (2026-05-23)

### Added

- **Orbit-approach camera** (new `apps/web/src/cinema/orbitCamera.ts`):
  - `initOrbitState()` — computes fly-in start from the current camera bearing, ensuring the approach always comes from the right direction.
  - `updateOrbitCamera()` — two-phase: lerp fly-in (1800 ms eased) then continuous orbit.  Returns `'flying' | 'orbiting' | 'done'` so callers know when to advance.
  - Scenes 4 (Solar System Tour) and 5 (Node Flythrough) now orbit each visited node instead of one-shot TWEEN fly-tos.  Camera always keeps the target in view.

- **CinemaControls** (live camera control panel):
  - New `CinemaControls` interface + `DEFAULT_CINEMA_CONTROLS` in `types.ts`.
  - Exposes: **orbitSpeed** (angular velocity multiplier), **approachDist** (orbit radius), **elevationOffset** (camera Y above target), **speedMultiplier** (global scene timer speed).
  - Live ⚙ panel with range sliders — changes take effect in the rAF loop immediately, no re-mount needed.
  - All scene `tick()` functions accept `controls` as a 6th parameter and multiply orbit angles by `controls.orbitSpeed`.

- **Tour / Script Writer** (`apps/web/src/cinema/TourPlanner.tsx`):
  - New `TourStep` type: `{ nodeId, nodeLabel, nodeType, dwellMs }`.
  - `TourPlanner` component: searchable/filterable node picker, step list, per-step dwell selector (4s–20s presets), Play/Stop/Clear.
  - Cinema page has a **Scenes / Tour** toggle.  In Tour mode the rAF loop drives the orbit camera through each authored step in order.
  - Tour stops automatically after the last step.

- **Lyrics Universe** (`/cinema/lyrics`):
  - Albums arranged in a ring (radius 600), songs in sub-rings (radius 180), lyric lines stacked in a gentle upward spiral above each song node.
  - `ForceGraph3D` with `warmupTicks=0` / `cooldownTicks=0` — physics disabled, all nodes pinned.  SpriteText renders every lyric line as floating 3D text (Georgia serif, per-song header in purple, album header in gold).
  - **Auto fly-through** mode: camera orbits each album cluster for 12 s then advances; orbit speed controlled by slider.
  - Social Mode, cursor auto-hide, fullscreen — same pattern as main Cinema Mode.
  - New API endpoint `GET /api/public/lyrics-universe?bandIds=` — returns up to 8 albums × 12 songs with primary lyrics (no auth required).
  - New nav link **Lyrics Universe** added to admin sidebar.
  - Route `/cinema/lyrics` added to App.tsx.

- **Mobile sidebar scroll fix**:
  - Added `overflow-hidden` to the `<nav>` container and `overflow-y-auto` to the `<ul>` in `Nav.tsx`.
  - The admin sidebar now scrolls independently on mobile without requiring landscape orientation.

### New files
- `apps/web/src/cinema/orbitCamera.ts` — orbit-approach camera helpers
- `apps/web/src/cinema/TourPlanner.tsx` — tour script builder component
- `apps/web/src/pages/LyricsUniversePage.tsx` — Lyrics Universe page

### Modified files
- `apps/web/src/cinema/types.ts` — `CinemaControls`, `TourStep`, updated `tick` signature
- `apps/web/src/cinema/sceneDefinitions.ts` — scenes 4+5 orbit-rewrite; all ticks accept controls
- `apps/web/src/pages/CinemaPage.tsx` — controls panel, tour mode, tour state management
- `apps/web/src/components/layout/Nav.tsx` — mobile scroll fix + Lyrics Universe link
- `apps/web/src/App.tsx` — `/cinema/lyrics` route
- `apps/api/src/routes/public.ts` — `/api/public/lyrics-universe` endpoint

---

## LyricsFlow — performance rewrite: forward path, visibility culling, expanded controls (2026-05-23)

### Changed

- **Architecture rewrite** (`apps/web/src/pages/LyricsFlowPage.tsx`):
  - ForceGraph3D now renders an **empty graph** (zero nodes/links) — used only for its Three.js renderer. Eliminates all physics, force simulation, and node-object overhead for the 1 000+ lyric lines.
  - SpriteText objects are added **directly to `fg.scene()`** (bypassing ForceGraph3D's node system), so positions update in-place without triggering re-renders.
  - **Forward S-curve path** replaces helix layout: primary axis is Z (`z = i * stepZ`), X oscillates with `sin(i * 0.07) * wobble`. Eliminates the wrap-around overlap where adjacent helix turns rendered in front of each other.
  - **Visibility culling**: sprites beyond `visibleRange` units have `.visible = false` — Three.js skips them entirely. Camera sees at most ~30–50 sprites per frame regardless of total count (1 000+).
  - **Squared-distance check**: `dSq = dx²+dy²+dz²`, compared to `rangeSq` before any `Math.sqrt()`. `sqrt` called only for visible sprites to compute fade alpha.

- **7-slider settings panel** (`FlowConfig` interface):
  - `textSize` — lyric line font size
  - `titleSize` — song title card font size
  - `stepZ` — Z-axis spacing between entries
  - `wobble` — X-axis oscillation amplitude
  - `visibleRange` — culling radius around camera
  - `lookBehind` — how many lines behind camera to keep active
  - `lookAhead` — how many lines ahead camera aims toward
  - Position-only config changes (`stepZ`, `wobble`) update sprite positions in-place; no scene rebuild needed.

### Modified files
- `apps/web/src/pages/LyricsFlowPage.tsx` — full architecture rewrite

---

## Cinema Mode Phase 2 — smooth transitions, link highlighting, type visibility (2026-05-23)

### Fixed / Improved

- **Smooth camera transitions between tour stops** (`orbitCamera.ts`, `sceneDefinitions.ts`, `CinemaPage.tsx`):
  - `OrbitCameraState` now carries `prevLookAtX/Y/Z` — the look-at target of the previous stop.
  - During the 1800 ms fly-in phase, `camera.lookAt()` is lerped from the old target to the new one using the same `easeInOutQuad` factor as the position lerp — no more orientation snap.
  - `tourPrevTargetRef` in `CinemaPage` stores the departing node's position and passes it to the next `initOrbitState()` call, chaining smoothly across the whole tour.

- **Tour step link highlighting** (`CinemaPage.tsx`):
  - `tourNodeIds` useMemo builds a Set of all authored tour-step node IDs.
  - `linkColor` returns bright white (`rgba(255,255,255,0.75)`) for the currently-visited node's edges, indigo (`rgba(165,180,252,0.55)`) for any edge connecting two tour nodes, and the default grey otherwise — lets the viewer trace the tour route at a glance.
  - `linkWidth` mirrors the same three tiers (2 / 1 / 0.4).

- **Node type visibility toggles** (`CinemaPage.tsx`):
  - `hiddenTypes: Set<string>` state; toggled via type pills in the ⚙ controls panel with a colour dot per type.
  - `visibleGraphData` useMemo filters both nodes and links when any types are hidden.
  - `warmupTicks={simReady ? 0 : 80}` prevents the physics simulation from re-running on every toggle.
  - **Show all** shortcut resets to the full graph instantly.

- **TourPlanner node list scroll** (`TourPlanner.tsx`):
  - Changed node list container from `flex-1 overflow-y-auto min-h-0` to explicit `style={{ minHeight: '80px', maxHeight: '260px' }}` — the list now scrolls reliably regardless of parent flex context.
  - Browsable node limit raised from 60 → 120.

### Modified files
- `apps/web/src/cinema/orbitCamera.ts` — prevLookAt lerp in fly-in phase
- `apps/web/src/cinema/sceneDefinitions.ts` — prevTarget tracking for scenes 4 & 5
- `apps/web/src/cinema/TourPlanner.tsx` — explicit maxHeight scroll fix, node limit 120
- `apps/web/src/pages/CinemaPage.tsx` — link highlighting, type toggles, smooth tour chaining

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

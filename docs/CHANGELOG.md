# Changelog

All meaningful changes to Band Spectrum Mapper are documented here.

---

## Phase Z.6 (continued) — Tool Adventure: The Lost Archive (2026-06-21)

### Added

**Importable Adventure — "Tool — The Lost Archive":**
- `docs/tool-lost-archive.json` — complete 30-minute intermediate adventure
- Slug: `tool-lost-archive`, difficulty: intermediate, featured: true
- 4 levels: The Archive Entrance, The Undertow Vault, The Ænima Chamber, The Spiral Gate
- 9 items: `tla-archive-key`, `tla-rusty-reel`, `tla-undertow-seal`, `tla-recovered-vinyl-undertow`, `tla-chamber-fuse`, `tla-flooded-tape`, `tla-recovered-vinyl-aenima`, `tla-aenima-seal`, `tla-spiral-seal`
- 4 quests (one per level), each with a unique fictional NPC quest giver: The Curator, Vault Keeper, Chamber Witness, The Archivist
- 2 narrative arcs: "The Descent" and "The Recovery"
- 3 key-door progressions (archive-key → undertow-vault, undertow-seal → aenima-chamber, aenima-seal → spiral-gate)
- 1 alternative lever mechanism in Undertow Vault (can bypass the key door)
- 9 world-state puzzles, 10 conditional story beats
- 8-entry timeline covering all 4 levels and 4 quests
- All cross-references validated: zero orphan items, zero broken exits, all quest givers resolve to correct levels
- No copyrighted lyrics — Tool albums referenced by title only; all NPC dialogue is original fictional content
- All fictional NPCs — no real Tool members depicted
- Health score 100/100 (9/9 checks pass): levels ✓, spawns ✓, quest givers valid ✓, timeline refs valid ✓, exits internal ✓, item refs valid ✓, quests actionable ✓, name+desc ✓, cover+author ✓
- Import via Admin → Band RPG → Adventures → Import tab

---

## Phase Z.6 — Polish, Onboarding & First Adventure (2026-06-21)

### Added

**New Player Onboarding (Part 1):**
- `OnboardingModal` — 5-slide carousel explaining Band RPG, Adventures, Song Recovery, Curator, Events
- Auto-shows on first visit to Adventure Hub; dismissal stored in `localStorage` (`bsm_rpg_onboarded_v1`)
- "?" help button in campaign hub title bar reopens the tour at any time
- Skippable at any slide

**Contextual Help (Part 2):**
- `HelpTooltip` component — `?` button with hover/click tooltip, 4 placement options
- Reusable across the entire app; used wherever a concept needs quick explanation
- RecommendationsPanel shows when "My Adventures" is empty

**Starter Adventure — "The Sound Archive" (Part 3):**
- `docs/starter-adventure.json` — complete 20-minute beginner adventure
- 3 levels: Lobby (NPC dialogue + quest), Stacks (item collection + key door + lever puzzle), Vault (album recovery + story completion)
- 2 items (`archive-key`, `lost-album`), 2 quests, 2 arcs, 3 NPCs, 6 story beats, 1 door, 1 switch, 3 puzzles
- Teaches: movement, NPC interaction, item collection, door mechanics, lever puzzles, quest progression, story beats
- Import via Admin → Adventures → Import tab

**Adventure Recommendations (Part 4):**
- `RecommendationsPanel` — shown on "My Adventures" tab when user has no active adventures
- Highlights "The Sound Archive" as the starter pick with a prominent CTA
- Shows additional featured adventures as secondary options

**Creator Quick Start Wizard (Part 8):**
- `AdventureWizard` — 4-step modal wizard in admin Adventures tab ("✨ Quick Start" button)
- Step 1: Adventure metadata (name, slug, author, difficulty, description)
- Step 2: First level (name, description — generates a basic 10×8 floor-plan)
- Step 3: Guide NPC (name, opening dialogue)
- Step 4: First quest (name, description, XP reward)
- Generates and imports full adventure package JSON in one click

**v1.0 Readiness Dashboard (Part 10):**
- `ReadinessDashboard` component — "🚀 v1 Launch" tab in admin Band RPG
- 8-point launch checklist (published adventure, featured adventure, 3+ levels, 2+ quests, etc.)
- Per-adventure health score bars with failed check details
- Stats grid: adventures, levels, quests, NPCs, items, players, average health
- Issues list: auto-detected problems blocking a solid launch
- `GET /api/band-rpg/readiness` — aggregate stats endpoint (admin only)

**Expanded Health Checks (Part 9):**
- Health endpoint expanded from 6 to 9 checks:
  - New: Level exits link to levels inside this adventure (catches broken cross-references)
  - New: Map item entities reference known items (catches missing item slugs)
  - New: All quests have a giver NPC or the adventure has objectives (catches orphan quests)
- Weights rebalanced to sum to 100

### Files added
- `docs/starter-adventure.json` — importable starter campaign
- `apps/web/src/components/bandRpg/OnboardingModal.tsx`
- `apps/web/src/components/bandRpg/HelpTooltip.tsx`
- `apps/web/src/components/bandRpg/RecommendationsPanel.tsx`
- `apps/web/src/components/bandRpgEditor/AdventureWizard.tsx`
- `apps/web/src/components/bandRpgEditor/ReadinessDashboard.tsx`
- `apps/api/src/routes/readinessRoutes.ts`

### Limitations (stated honestly)
- Parts 5 (UI Cleanup) and 6 (Performance): No sweeping changes made — the existing UI is already clean and queries are appropriately scoped. Future passes can address these as usage data reveals real bottlenecks.
- Part 7 (Error Handling): Game-level and import error messages are already surfaced; incremental improvements live in existing components.
- Starter adventure requires manual import via the admin Import tab.

---

## Phase Z.5 — Campaign Builder & Adventure Browser (2026-06-21)

### Added

**Adventure Metadata expansion:**
- `BandRpgAdventure` model extended: `featured`, `coverImageUrl`, `authorName`, `difficulty`, `estimatedPlaytime`, `tags`
- Difficulty levels: `beginner`, `intermediate`, `advanced`, `expert`
- `estimatedPlaytime` stored in minutes

**Adventure Progress (`BandRpgAdventureProgress`):**
- New model: `userId`, `adventureId`, `startedAt`, `completedAt`, `lastPlayedAt`, `completionPct`, `questsCompleted`, `itemsCollected`, `levelsDiscovered`, `isCompleted`
- `@@unique([userId, adventureId])` — one progress record per player per adventure
- `User.bandRpgAdventureProgress` back-relation added

**Adventure Progress API (`/api/band-rpg/adventure-progress`):**
- `GET /browse` — public; published adventures with optional per-user progress overlay; filters: `userId`, `featured`, `difficulty`
- `GET /my` — auth required; all adventures the user has started, ordered by `lastPlayedAt`
- `GET /:adventureId` — auth required; get-or-create progress record; returns adventure + `firstLevelSlug`
- `POST /:adventureId/sync` — auth required; update progress from game engine; auto-calculates `completionPct`
- `POST /:adventureId/restart` — auth required; resets progress to zero
- `GET /:adventureId/health` — public; 6-check content health score (0–100)

**Adventure Browser (`/play/band-rpg/adventures`):**
- `BandRpgCampaignPage` — player-facing hub with two tabs: Browse Adventures / My Adventures
- Browse: featured row, difficulty filter chips, adventure cards with cover image + progress bar
- My Adventures: Active (in-progress) and Completed sections
- Responsive 2-column grid layout; dark theme

**Adventure Detail Page (`/play/band-rpg/adventures/:id`):**
- `BandRpgAdventureDetailPage` — full adventure detail: cover, metadata, stats, tags, progress
- Start / Continue / Revisit / Restart actions
- Restart confirmation modal (prevents accidental progress loss)
- Back-navigation to Campaign Hub

**Completion Report (`CompletionReport.tsx`):**
- Full-screen overlay shown when an adventure is completed
- Displays: completion %, quests/levels/items counts, play time
- Animated progress bar; links to Adventure Hub or "Keep Exploring"

**Game page adventure integration (`BandRpgGamePage.tsx`):**
- Reads `?adventureId=xxx` from URL search params
- Syncs adventure progress on every save (levelsDiscovered, questsCompleted, itemsCollected)
- Shows CompletionReport overlay when server marks adventure complete
- Back button navigates to adventure detail page (not hub) when in adventure context

**Admin Adventures tab expanded (`AdventureEditor.tsx`):**
- Edit form expanded: name, author, description, cover image URL, difficulty, playtime, tags, published, featured
- Adventure cards show: cover thumbnail, author/playtime, featured/difficulty badges, player count
- Health check button (`🏥 Health`) shows 6-check score panel inline per adventure
- `_count.progress` shows player count on each adventure card

### Routes added
- `/play/band-rpg/adventures` → `BandRpgCampaignPage`
- `/play/band-rpg/adventures/:id` → `BandRpgAdventureDetailPage`

---

## Phase Z.4 — Engine Audit + Adventure Import/Export (2026-06-21)

### Added

**Adventure Scoping (`BandRpgAdventure` model):**
- New `BandRpgAdventure` model: `slug`, `name`, `description`, `version`, `isPublished`
- `adventureId String?` added to `BandRpgLevel`, `BandRpgQuest`, `BandRpgStoryArc`, `BandRpgItem`
- Adventures are optional grouping containers — existing content is unaffected until tagged

**Adventure Export (Part C):**
- `GET /api/band-rpg/adventures/:id/export` — exports full adventure package as JSON
- Serializes: levels (with nested objectives, NPCs, beats, doors, switches, puzzles), quests, arcs, items, timeline
- Human-readable cross-references: `targetSlug` for items/quests, `targetName` for level-scoped doors/switches
- Triggers download of `{slug}-adventure.json` from the admin UI

**Adventure Import (Parts D–F):**
- `POST /api/band-rpg/adventures/validate` — dry run: validates JSON without writing to DB
- `POST /api/band-rpg/adventures/import` — validates then imports in three modes:
  - **create** — strict; fails if any slug exists
  - **update** — upserts by slug; merges with existing
  - **replace** — deletes existing adventure content, recreates fresh (player progress preserved)
- Validates: required fields, slug format, duplicate slugs within package, cross-reference integrity, DB conflicts
- Dry-run preview shows entity counts before confirmation
- Cross-reference resolution: `targetSlug` → DB item/quest ID; `targetName` → DB door/switch/NPC ID

**Admin UI — Adventures tab (Part C–H):**
- New `Adventures` tab in `/admin/band-rpg`
- Adventure list with count badges (levels/quests/arcs/items)
- Create/edit/delete adventures
- One-click export to JSON file
- Import tab: JSON paste or file upload, mode selector, Validate button, Import button with preview
- Validation error display with path-specific messages

**Playtest Checklist (Part B):**
- New `Playtest` tab in `/admin/band-rpg`
- 28 manual test items across 7 categories: Core, NPCs, Quests, Items, World, Exits, Save, Story
- Click badge to cycle status: — untested → ✓ pass → ✗ fail → ⊘ skip
- Summary panel: total/tested/pass/fail counts; fail list for quick review
- Expandable hints per item; per-item notes field
- State is session-local (intentionally not persisted — fresh each test session)

**Mobile Controls (Part A — Engine Audit):**
- On-screen D-pad overlay added to game viewport (bottom-left)
- Arrow buttons (▲▼◀▶) dispatch `handleMove` directly without keyboard events
- [E] button dispatches `handleInteract` (talk, open door, activate switch, advance dialogue)
- Works on all touch devices; also usable on desktop

**Engine fixes (Part A — Audit):**
- Added `handleMove(dx, dy)` and `handleInteract()` to `GameEngineControls` — programmatic movement API
- Fixed exit-trigger-when-blocked bug: level transition now only fires when destination tile is walkable and not blocked by a closed door
- `isAdjacent` already exported via `export { isAdjacent }` at module end (verified)

**Sample Adventure Template (Part I):**
- `docs/sample-adventure.json` — complete reference adventure: 2 levels, 1 item, 1 quest, 1 arc, 1 NPC per level, 1 door, 1 switch, 2 puzzles, 3 timeline events

**Adventure Format Documentation (Part J):**
- `docs/ADVENTURE_FORMAT.md` — full schema reference for human and AI adventure authors
- Covers all fields, types, cross-reference conventions, import modes, validation rules, AI tips, limitations

### Technical notes
- `BandRpgAdventure` relations use named `@relation("AdventureItems")` on `BandRpgItem` to avoid collision with existing `@relation("LevelItems")`
- Export resolves condition/action `targetId` → `targetSlug`/`targetName` before serializing
- Import resolves in dependency order: arcs → items → levels → objectives → NPCs → beats → doors → switches → puzzles → quests → timeline
- NPC `giverId` patched to DB ID after NPCs are created in the same transaction pass
- `createManyAndReturn` used for objectives to get IDs for prerequisite chaining
- All Prisma mutations use `UncheckedCreateInput`/`UncheckedUpdateInput`; JSON fields use `as Prisma.InputJsonValue`

---

## Phase Z.3 — World Systems & Puzzle Framework (2026-06-21)

### Added

**Key/Door System:**
- `BandRpgDoor` model with types: `key_door`, `quest_door`, `story_door`, `switch_door`, `free`
- Doors placed at tile coordinates block movement when locked; E key to attempt interaction
- `lockCondition` (WorldCondition JSON) evaluated against live WorldSnapshot each frame
- Visual indicators: red emoji + [E] Try hint (locked); blue emoji (open); per-type door icon

**Switch System:**
- `BandRpgSwitch` model with types: `switch`, `lever`, `button`, `pressure_plate`
- Adjacent E interaction activates switch, fires `effect` (PuzzleAction JSON) and puzzle trigger chain
- Per-type visual icons; amber (inactive) vs green (activated) rendering in TileRenderer

**Puzzle/Trigger Framework:**
- `BandRpgPuzzle` model: ordered Trigger → Condition → Action chains per level
- Trigger types: `item_collected`, `quest_complete`, `quest_start`, `story_beat_seen`, `switch_activated`, `npc_talked`, `level_enter`
- Condition types: `item_owned`, `quest_active`, `quest_complete`, `story_beat_seen`, `switch_activated`, `door_open`, `world_state`, `always`, `never`
- Action types: `open_door`, `close_door`, `trigger_beat`, `reveal_exit`, `set_world_state`, `grant_item`
- `findTriggeredPuzzles` pure function evaluates all puzzles on every relevant state change

**World State persistence:**
- `openedDoors`, `activatedSwitches`, `worldState` added to `BandRpgPlayerProgress` (DB) and `SaveState` (runtime)
- Loaded on level start, persisted on every auto-save tick

**Conditional Entities:**
- NPCs: `visibilityCondition Json?` DB field — evaluated via `isNpcVisible(npc, snap)` in game page
- Items: `spawnCondition` in MapEntity JSON — evaluated via `isItemSpawned(item, snap)`
- Exits: `condition` in MapEntity JSON — evaluated via `isExitVisible(exit, snap)`
- All conditions evaluated against `WorldSnapshot` (inventory, quests, beats, switches, doors, world state keys)

**WorldEngine.ts** — new pure-function module (zero React, fully testable):
- `evaluateCondition`, `isDoorOpen`, `canOpenDoor`, `doorBlockedMessage`
- `matchesPuzzleTrigger`, `findTriggeredPuzzles`, `evaluatePuzzleAction`
- `isNpcVisible`, `isItemSpawned`, `isExitVisible`
- `FutureWorldFoundation` type stubs: enemies, bosses, companions, abilities, stealth, combat

**WorldEditor admin tab** (`/admin/band-rpg` → World tab):
- Level selector + sub-tabs: Doors / Switches / Puzzles
- CRUD for all three entity types with structured JSON editors
- `ConditionEditor` sub-component: type dropdown + targetId + key/value for `world_state`
- `ActionEditor` sub-component: type dropdown + targetId + key/value for `set_world_state`
- Full CRUD API: `GET/POST /editor/world/levels/:id/doors`, `/switches`, `/puzzles` + PUT/DELETE per entity

**Visual Debug & Cheat:**
- DebugPanel: door count / open count, switch count / activated count, puzzle count, world state key count; activated switch list; world state key-value dump
- CheatPanel: Open button per locked door; Fire button per inactive switch; state summary row for doors/switches

**API routes:** `worldEditorRouter` mounted at `/api/band-rpg/editor/world` (requireAuth + requireAdmin)

### Technical notes
- `BandRpgDoor`, `BandRpgSwitch`, `BandRpgPuzzle` use `@@map` table names via Prisma; migration auto-applies on Railway via `db push`
- `WorldSnapshot` is a minimal read-only projection of `GameState` — prevents closure capture of full mutable state in pure evaluators
- `applyPuzzleTrigger` is a helper that calls `findTriggeredPuzzles` and returns updated GameState after applying each matched puzzle's action
- Strict TypeScript: all Prisma mutations use `UncheckedCreateInput`/`UncheckedUpdateInput`; JSON fields cast as `Prisma.InputJsonValue`; route params use non-null assertion `req.params['key']!`
- `isNpcVisible` / `isItemSpawned` / `isExitVisible` exported from WorldEngine and used in `BandRpgGamePage.tsx` (not inside the reducer) to avoid filtering inside TileRenderer

---

## Phase Y.3 — Community Appreciation + Avatar System 2.0 (2026-06-20)

### Added

**Community Appreciation system:**
- **2 new DB tables**: `band_rpg_favorites` (favorites/saves on curators/festivals/tours) and `band_rpg_curator_follows` (follower/following relationships between curators). Migration: `20260620090000_phase_y3_appreciation_avatar`.
- **5 Appreciation API endpoints** (`/api/band-rpg/appreciation/*`, all require auth):
  - `POST /toggle` — toggle favorite or saved on any entity (curator/festival/tour); returns `{ active, count }`
  - `POST /follow/:followeeId` — toggle follow on a curator; returns `{ following, followerCount }`
  - `GET /status?entityType=&entityId=` — batch-fetch appreciation status (favorited/saved/following) for one or more entities for the logged-in user
  - `GET /my-saved` — enriched list of all saved items with entity-specific metadata (concert/stop counts, visibility, isDream)
  - `GET /following` — list of followed curator profiles
- **Community distinction badges** — algorithmic labels computed and returned on public pages: "Community Favorite" (≥3 favorites), "Most Saved" (≥3 saves on festivals/tours), "Most Followed" (≥5 followers on curators), "Festival Collector" (curator has ≥5 favorited festivals), "Tour Explorer" (curator has ≥5 favorited tours), "Archive Legend" (≥20 followers AND level ≥25)
- **Favorite / Save / Follow buttons** on all 3 public pages (curator, festival, tour). Buttons are hidden when viewing own profile. Require login — a hint is shown to logged-out visitors.
- **Community counts** displayed publicly on all 3 pages: favorites, saved, and followers where applicable
- **Showcase section** on curator public page: links to most popular festival and tour (by community favorites)
- **3 new leaderboard types** in `/api/band-rpg/community/leaderboard`: `most-followed` (by follower count), `most-saved-festivals` (by saved festival count), `most-saved-tours` (by saved tour count). Corresponding tabs added to the Leaderboards UI.
- **"Saved" tab** in The Archive collection page (`/my/band-rpg/collection`) — browse and unsave bookmarked festivals, tours, and curators in one place, grouped by type

**Avatar System 2.0:**
- **2 new BandMember fields**: `referenceImageDataUrl` (base64 photo data URL, stored in DB) and `visualNotes` (freeform appearance notes appended to the prompt)
- **Reference image upload**: `PUT /api/platformer/skins/member/:memberId/reference` — stores a photo; resets cached avatar prompt so next generation re-extracts appearance from the new reference via GPT-4o-mini vision
- **Reference image clear**: `DELETE /api/platformer/skins/member/:memberId/reference` — clears reference and resets prompt
- **GPT-4o-mini vision extraction**: when a member has a `referenceImageDataUrl` and no cached prompt, the `generate-prompt` endpoint passes the image to GPT-4o-mini with a vision message to extract appearance description instead of guessing from band context
- **Visual Notes field** in Avatar Prompt Editor: freeform text appended to the prompt (e.g. "Bald, Goatee")
- **Reference Image panel** in Avatar Prompt Editor: thumbnail of uploaded reference, Replace and Clear buttons, dashed upload zone when empty, "Regen prompt?" offer after upload
- **Prompt Inspector** in Avatar Prompt Editor: collapsible panel showing the full assembled prompt (prefix + description + visual notes + suffix + negative) — exactly what gets sent to OpenAI
- **4-variation layout update**: when a reference image is set, the picking step shows the reference on the left and the 2×2 variation grid on the right for direct visual comparison

### Technical notes
- `BandRpgFavorite` uses a composite unique index `[userId, kind, entityType, entityId]` — the same row is toggled on/off, no duplicates
- `BandRpgCuratorFollow` uses `[followerId, followeeId]` unique index
- Both tables use `@@map` to clean table names (`band_rpg_favorites`, `band_rpg_curator_follows`)
- Appreciation status query batches multiple entity IDs in a single `findMany` call — no N+1
- Saved items enrichment runs concurrent `findUnique` per item (acceptable for typical collection sizes)
- `appreciationRouter` mounted at `/api/band-rpg/appreciation` with `requireAuth` on all endpoints
- Public endpoints (curator/festival/tour) run counts in parallel with existing queries via `Promise.all`
- `visualNotes` is passed through `buildAvatarImagePrompt(desc, negative, visualNotes)` — appended to description before the BSM style suffix
- Reference images validated at upload: must be a data URL, max 5MB (backend) / 4MB (frontend file-size check)

---

## Phase Y.2 — Community Discovery (2026-06-20)

### Added

- **`/community` page** — public community hub with three tabs: Overview, Leaderboards, and Discover. No auth required.
- **5 community API endpoints** (`/api/band-rpg/community/*`, all public, no auth):
  - `GET /hub` — featured curator/festival/tour (all-time top), spotlight of the week (most active in last 7 days), community stats, and a random "discovery" pick.
  - `GET /stats` — 7 aggregate counts: public curators, festivals, tours, total songs recovered, albums completed, challenges completed, dream festivals.
  - `GET /leaderboard?type=&period=` — 6 leaderboard types × 3 time periods. Types: `curators` (by XP), `collectors` (by songs), `festivals` (by festival count), `tours` (by tour count), `challenges` (by completed challenges), `archivists` (by rare/legendary/mythic song count). Periods: `alltime | month | week`. All entries restricted to users with public curator profiles.
  - `GET /discover?type=&page=&limit=&isDream=` — paginated discovery browser. Types: `curator | festival | tour`. Festivals support a `isDream=true` filter. Max 24 items per page.
  - `GET /surprise` — returns a weighted random public entity (festival, tour, or curator) for the Surprise Me button.
- **Overview tab**: community stats hero (5 counters), Spotlight of the Week (3 cards: curator/festival/tour), Top of the Archive (3 all-time featured cards), Surprise Me button (random navigation).
- **Leaderboards tab**: 6 type filter tabs + 3 period filter tabs. Ranked list with gold/silver/bronze rank colouring. Each row links to the curator's public profile.
- **Discover tab**: 3 type tabs (Festivals / Tours / Curators), Dream-only filter for festivals, paginated 2-column card grid with Prev/Next navigation and total count.
- **3 discovery card components** (inline in CommunityPage): `CuratorMiniCard` (indigo theme, level badge, labels), `FestivalMiniCard` (amber theme, dream crown, concert count), `TourMiniCard` (teal theme, stop count).
- **Privacy compliance**: all community endpoints only surface entities where `visibility = 'public'`. Unlisted and private items are never included in any leaderboard or discovery feed.
- **Community statistics** — 5 live aggregate stats displayed in the hub. All queries use indexed fields.
- **Surprise Me button** — weighted random selection proportional to counts of public festivals, tours, and curators. Navigates directly to the public page of the chosen entity.
- **Auto-generated labels**: curators (`Newcomer / Archive Regular / Rising Star / Badge Master / Elite Curator / Mythic Archivist`), festivals (`Emerging Festival / Festival / Major Festival / Grand Festival / Dream Festival`), tours (`Intimate Run / Tour / Regional Tour / Major Tour / World Tour`).
- **Y.3 foundation**: visibility field + discovery infrastructure is sufficient to later add likes/bookmarks/following without schema changes to the core entities.

### Technical notes
- `communityRouter` mounted at `/api/band-rpg/community` in `app.ts` (no auth middleware).
- All leaderboard queries begin by fetching the set of public `userId` values, then filter all subsequent groupBy/findMany to that set — ensures privacy.
- `groupBy` with `_count` used for collectors, challenges, archivists, festivals, and tours leaderboards. Direct XP sort used for curators (already in profile table).
- Curator leaderboard time filter (week/month): uses `lastActiveDate >= since` before re-sorting by XP.
- Hub "spotlight of the week" uses `lastActiveDate >= weekAgo` for curators and `createdAt >= monthAgo` for festivals/tours.
- Discovery endpoint uses Prisma `skip`/`take` pagination with a parallel `count()` query for total.
- `isDream` filter passed as `?isDream=true` query param — backend uses `where: { isDream: true }` when present.
- All community API types exported from `apps/web/src/api/bandRpg.ts`: `CommunityCuratorCard`, `CommunityFestivalCard`, `CommunityTourCard`, `CommunityHub`, `LeaderboardEntry`, `LeaderboardResponse`, `DiscoverCuratorItem`, `DiscoverFestivalItem`, `DiscoverTourItem`, `DiscoverResponse`, `SurpriseResponse`.

---

## Phase Y.1 — Sharing & Showcase (2026-06-20)

### Added

- **`visibility` field** on `BandRpgCuratorProfile` (default: `'public'`), `BandRpgFestival` (default: `'private'`), and `BandRpgTour` (default: `'private'`). Values: `public | unlisted | private`. Migration: `20260620080000_add_visibility_fields`.
- **3 Privacy update endpoints** (authenticated):
  - `PUT /api/band-rpg/curator/visibility`
  - `PUT /api/band-rpg/festivals/:id/visibility`
  - `PUT /api/band-rpg/tours/:id/visibility`
- **3 Public API endpoints** (no auth — `GET /api/band-rpg/public/*`):
  - `/curator/:userId` — curated profile: level, XP bar, stats, unlocked badges, recent activity. Respects visibility.
  - `/festival/:id` — festival name, isDream, personality, story, concert/band/song counts, rare track count, band lineup. Respects visibility.
  - `/tour/:id` — full tour analysis: momentum, variety, historical score, personality, story, achievements, stops list. Respects visibility.
- **3 Public pages** (no auth required — any visitor can access these URLs):
  - `/band-rpg/curator/:userId` — Curator profile page. Level badge, XP progress bar, legacy stats grid, unlocked badges with tooltips, recent activity feed. Deep indigo theme.
  - `/band-rpg/festival/:id` — Festival showcase. Dream festival crown, personality label, stats (concerts/bands/songs/rare tracks), character indicators (deep cut %, fan service %), festival story, band lineup, copy link button. Dark theme.
  - `/band-rpg/tour/:id` — Tour showcase. Personality icon, momentum/variety score bars, historical score, tour story, unlocked achievements, full stops list with cities and song counts. Teal theme.
- **Share controls** in The Archive (authenticated pages):
  - Curator tab: visibility selector (Public/Unlisted/Private) + Copy Link + View Public Page buttons, only shown when not private.
  - Festivals tab: ShareRow below each festival card — visibility selector + Copy Link + View buttons.
  - Tours tab: ShareRow below each tour card — visibility selector + Copy Link + View buttons.
- **Community Spotlight architecture**: `visibility = 'public'` enables future rankings/leaderboard queries without additional schema changes. No tables needed — just filter by visibility.
- **Mobile-first design**: all three public pages are max-width 2xl containers with fluid stat grids and responsive layouts.

### Schema
- Added `visibility` (String, NOT NULL) to `band_rpg_curator_profiles`, `band_rpg_festivals`, `band_rpg_tours`

### Technical notes
- Public endpoints mounted at `/api/band-rpg/public/*` with no `requireAuth` middleware — truly public.
- `analyseStops` exported from `tourRoutes.ts` (was private) — public tour endpoint reuses exact same computation as private tour detail. Tour public page shows the same real momentum/variety/personality scores.
- Festival public endpoint uses a simplified personality heuristic (fan service % + deep cut % from song rarities) — sufficient for the public showcase. Full chemistry/prestige analysis remains on the private Archive page.
- `buildCuratorProfile` from `curatorService.ts` reused in public curator endpoint — public page shows a curated subset (no internal IDs, no title lists, no character IDs).
- `visibility` field returned in all private festival and tour list/detail responses so the frontend can show/edit it without extra requests.

---

## Phase X.5 — Curator Progression (2026-06-20)

### Added

- **`BandRpgCuratorProfile` model** — persistent identity record per user: XP total, current title, titlesUnlocked (String[]), badgesUnlocked (String[]), selectedCharacterId, selectedCharacterName, firstRecoveryDate, lastActiveDate.
- **XP System** — every action earns XP: Song Recovered +10, Correct Guess +5, Album Completed +50, Setlist Created +25, Concert Created +50, Festival Created +100, Tour Created +150. Challenge rewards: Easy +50, Medium +100, Hard +200, Legendary +500.
- **Level Progression (1–100+)** — 6-tier XP curve (Newcomer slope → Grand Archivist plateau). Each level has a named tier title:
  - Archive Newcomer (1+), Archive Assistant (5+), Archivist (10+), Collection Keeper (15+), Music Historian (20+), Setlist Scholar (25+), Festival Architect (30+), Tour Director (35+), Master Curator (40+), Elite Archivist (50+), Legend Keeper (60+), Mythic Archivist (75+), Grand Archivist (100+)
- **15 Curator Badges** with unlock conditions and progress tracking: First Recovery, Vinyl Collector, Silver Hunter, Gold Chaser, Platinum Seeker, Bronze Brawler, Rare Hunter, Legend Hunter, Myth Hunter, Archive Veteran, Setlist Maestro, Festival Founder, Tour Commander, Discophile, Prolific Curator.
- **Curator Stats** (12 live DB queries): songs recovered, albums completed, setlists/concerts/festivals/dream-festivals/tours created, challenges completed, rare/legendary/mythic songs found, correct guess count, total guesses, correct guess %.
- **3 Curator API endpoints**:
  - `GET /api/band-rpg/curator` — full profile (level, XP bar, stats, badges with progress, recent activity, all available titles). Automatically evaluates and persists newly unlocked badges.
  - `PUT /api/band-rpg/curator/title` — set active title (validates against all available titles)
  - `PUT /api/band-rpg/curator/character` — link selected character avatar
- **Recent Activity feed** — merged from 6 tables (songs, setlists, concerts, festivals, tours, challenge attempts), sorted by date, top 20 items. Each item has type, icon, label, and ISO date.
- **👤 Curator tab** in Band RPG → The Archive:
  - Level badge + XP bar (% filled, xpIntoLevel / xpForNextLevel)
  - Active title display with "Change Title" button
  - Stats grid (8 metrics: songs recovered, albums, setlists, concerts, festivals, tours, challenges, correct guess %)
  - Badge Hall with tooltip overlay + progress bars for in-progress badges
  - Recent Activity list (icon + label + date)
  - "Export Curator Card" button — 900×1200 canvas: deep indigo/silver theme, level, XP bar, title, stats, badge count, distinct from other card styles
- **XP hooks wired into all existing actions** (fire-and-forget, never blocks the main response):
  - `POST /api/band-rpg/collect` — song recovery + optional correct-guess XP; album completion bonus
  - `POST /api/band-rpg/setlists` — setlist created XP
  - `POST /api/band-rpg/concerts` — concert created XP
  - `POST /api/band-rpg/festivals` — festival created XP
  - `POST /api/band-rpg/tours` — tour created XP
  - `POST /api/band-rpg/challenges/:id/attempt` — challenge difficulty XP + title persist on achievement

### Schema
- Added `BandRpgCuratorProfile` model — migration: `20260620060000_add_curator_profile`
- Back-relation `bandRpgCuratorProfile` added to `User` model

### Technical notes
- `curatorService.ts` — standalone service: `grantXP()`, `buildCuratorProfile()`, `computeStats()`, `evaluateBadges()`, `computeRecentActivity()`, `persistChallengeTitles()`, `levelTitle()`, `computeLevel()`, `xpToReachLevel()`. All badge evaluation is pure logic — no AI, no external calls.
- `curatorRoutes.ts` — mounted at `/api/band-rpg/curator`, separate focused file.
- `grantXP()` uses Prisma upsert with `increment` — safe under concurrent requests; `firstRecoveryDate` is set only if not already present (two-query guard).
- Badge evaluation runs on every `GET /curator` — if new badges unlock, they are persisted before the response. This avoids checking on every individual action.
- XP grants use fire-and-forget pattern (`void fn().catch(() => undefined)`) — never blocks or fails the triggering endpoint.
- Curator Card canvas uses deep indigo (#1e1b4b) background with silver accent (#c0c0c0) — visually distinct from the crimson Challenge card and teal/purple Tour/Festival cards.

---

## Phase X — Rival Events & Challenges (2026-06-20)

### Added

- **`BandRpgChallenge` model** — a challenge definition with type, difficulty, rival entity, reward title/badge, and up to 10 numeric thresholds (chemistry, variety, momentum, prestige, diversity, deepCut, fanService, rareSongs, albums, stopCount). Global challenges (userId = null) are seeded on first API call; user-generated challenges belong to a user.
- **`BandRpgChallengeAttempt` model** — records every attempt: entityType, entityId, entityName, achieved (boolean), metricScore, tier (bronze/silver/gold/platinum).
- **12 Global Challenges** (stable `gc-` prefix IDs, always visible to all users):
  - Easy: The First Note (rare songs ≥ 1), New Arrival (albums ≥ 1), First Connection (chemistry ≥ 50), Hit the Road (tour stops ≥ 3)
  - Medium: Festival Chemist (chemistry ≥ 75), The Collector (rare songs ≥ 10), The Road Warrior (momentum ≥ 65 + variety ≥ 60 + stops ≥ 5), Crowd Pleaser (chemistry ≥ 70 + fanService ≥ 60)
  - Hard: The Deep Archive (chemistry ≥ 82 + deepCut ≥ 60), The Progressive Summit (chemistry ≥ 80, target: Progressive Pilgrims), Momentum Machine (momentum ≥ 80 + variety ≥ 70)
  - Legendary: The Mythic Gathering (chemistry ≥ 90 + prestige ≥ 80)
- **6 Rival Entities** — AI-free, template-generated: The Crowd Alchemist, The Stadium Circuit, The Archivist's Dream, The Progressive Summit, The Deep Cut Convention, The Mythic Circuit.
- **Tier Scoring** (margin above minimum threshold): Bronze (+0), Silver (+7/10), Gold (+14/20), Platinum (+21/30) — thresholds tighten with difficulty (easy → legendary).
- **Challenge Generator** — "⚔ Generate New Challenge" button. Picks from 16 generated templates weighted 40% easy / 35% medium / 20% hard / 5% legendary. Avoids re-generating challenges the user already has.
- **5 Challenge API endpoints**:
  - `GET /api/band-rpg/challenges` — all challenges (global + user-generated) with best attempt per user
  - `GET /api/band-rpg/challenges/history` — last 50 attempt records
  - `GET /api/band-rpg/challenges/stats` — aggregate stats + live collection counts
  - `POST /api/band-rpg/challenges/generate` — create a new generated challenge
  - `POST /api/band-rpg/challenges/:id/attempt` — submit attempt, returns tier + message
- **Collection challenge evaluation** — backend computes rare-song count (`Rare`, `Legendary`, `Mythic`) and completed album count directly from DB. Client cannot inflate these.
- **Festival/tour/concert/setlist challenges** — client submits metric values; server verifies entity ownership before recording the attempt.
- **⚔ Challenges tab** in Band RPG → The Archive. Includes:
  - Stats row: completed, best tier, rare songs, albums done
  - Titles unlocked ribbon (gold badges)
  - Generate New Challenge button
  - Challenges grid grouped by difficulty (Easy → Legendary)
  - Each card shows: name, difficulty badge, description, rival name, objective tags (metric thresholds), best tier, reward title/badge, and Attempt button
  - AttemptModal: entity picker (festival / tour / concert / setlist dropdown), metrics preview with pass/fail coloring, result display with tier badge
  - Victory Export Card — dark crimson-gold 900×1200 canvas: tier, challenge name, entity, score, rival defeated, title unlocked, difficulty label
- **Challenge history list** — last 12 attempts shown at the bottom of the Challenges tab.

### Schema
- Added `BandRpgChallenge` and `BandRpgChallengeAttempt` models — migration: `20260620050000_add_challenges`
- Back-relations added to `User` model

### Technical notes
- `challengeService.ts` — standalone service with GLOBAL_CHALLENGES constant, GEN_TEMPLATES pool (16 templates), `evaluateChallenge()`, `computeTier()`, `computeCollectionMetrics()`, `generateChallengeForUser()`, `seedGlobalChallenges()`.
- `challengeRoutes.ts` — mounted at `/api/band-rpg/challenges`, separate from the large `bandRpg.ts`.
- Global challenges are seeded lazily on first `GET /challenges` call (idempotent upsert with stable IDs).
- `EvalInput` interface accepts `number | null` fields — compatible with Prisma's nullable model fields under `exactOptionalPropertyTypes: true`.
- All evaluation is pure logic: no AI, no external calls.
- Victory card uses same canvas export pattern as Tour and Festival cards (dark red-gold theme distinct from teal/purple).

---

## Phase W — Tour Builder (2026-06-20)

### Added

- **`BandRpgTour` model** — tour entity owned by a user: id, userId, name, description.
- **`BandRpgTourStop` model** — ordered stop within a tour: position, concertId, venueId (optional override), cityName, countryName.
- **6 Tour API endpoints** — `GET /tours`, `POST /tours`, `GET /tours/:id`, `PUT /tours/:id`, `DELETE /tours/:id`, `PUT /tours/:id/stops`. All require auth, stops endpoint validates concert ownership and replaces atomically.
- **Tour Momentum Score (0-100)** — compares first-half vs second-half concert powers (rarity value of setlist songs). Peak-concert position bonus: last third = +20, first third = -15.
- **Tour Variety Score (0-100)** — ratio of unique songs to total song slots (×70), with penalties for overplayed songs and bonuses for one-night specials and rare song appearances.
- **Historical Tour Score (0-100)** — average concert realism across stops. Null when <30% of stops have live data. Label: True to Life / Realistic / Plausible / Ambitious / Fan Fiction / Dream Only.
- **12 Tour Personalities** — derived automatically from stop count, fan service ratio, deep cut ratio, average setlist power, and variety: The Deep Archive Tour / The Fan Celebration Tour / The Stadium Tour / The Epic Journey / The Comeback Tour / The Variety Show / The Intimate Affair / The Progressive Odyssey / The Atmosphere Journey / The Psychedelic Caravan / The Concept Pilgrimage / The Heavy Assault.
- **Tour Story** — template-driven 5-sentence narrative: opening city, momentum arc, setlist variety description, size description, closing city.
- **8 Tour Achievements** — 🎸 First Tour / 🗺️ Five Stops / 🌍 World Tour / ⚡ Perfect Momentum / 🔍 Deep Cut Tour / 🎪 Closing Night (best concert saved for last) / 🌟 Legendary Tour / 🔥 Mythic Tour.
- **🗺️ Tours tab** in Band RPG → The Archive collection page. Create tours, add/reorder concerts, enter city & country per stop, view momentum/variety/historical score bars, tour story, achievement grid, and export card.
- **Tour Export Card** — teal-themed 900×1200 canvas: tour name, personality, score bars, stop list (up to 8 shown), achievements row, footer.
- **Tour detail modal** — inline name editing, stop reorder (up/down), city/country input per stop, add from concert dropdown, save/delete.

### Schema
- Added `BandRpgTour` and `BandRpgTourStop` models — migration: `20260620040000_add_tours`
- Back-relations added to `User`, `BandRpgConcert`, `BandRpgVenue`

### Technical notes
- Tour router (`tourRoutes.ts`) is a dedicated file mounted at `/api/band-rpg/tours`, separate from the large `bandRpg.ts`.
- `analyseStops()` helper fetches live profiles in one batch query and computes all metrics in a single pass over stops.
- `STOP_INCLUDE` defined with `satisfies Prisma.BandRpgTourStopInclude` for full type inference.
- Personality list scores 12 candidates and picks the winner — same architecture as audience archetypes.
- All computation is pure functions: no AI, no extra DB queries beyond the initial load.

---

## Phase V — Real World Intelligence (2026-06-20)

### Added

- **Setlist.fm Integration** — `setlistIntelligenceService.ts` fetches real performance history for any band via the Setlist.fm API. Searches by artist name, stores MusicBrainz MBID match, then downloads up to 1,500 setlists (75 pages × 20 shows) with 600ms rate-limit delay between pages.
- **Song Live History Profile** — every `BandRpgSongProfile` record now carries: `totalPerformances`, `performancePct` (% of shows where the song appeared), `firstPerformanceDate`, `lastPerformanceDate`, `yearsSincePlayed`, `distinctYears`, `rarityIndex` (0–100), `liveStatus`, `liveValue`, `lastLiveDataFetchedAt`.
- **Live Status** (6 tiers) — `Never Played` / `Extremely Rare` (<2% of shows) / `Rare` (<5%) / `Occasional` (<15%) / `Common` (<40%) / `Staple` (≥40%). `Unknown` when no data fetched.
- **Rarity Index** (0–100) — higher = rarer. Never Played = 100, Staple → progressively lower.
- **Live Value Score** (0–100) — excitement score for discovering a song live. Never Played starts at 90, rarer statuses start higher, bonus added for each year since last performed.
- **Concert Realism Score** — `computeConcertRealism()` returns null when <30% of songs have live data; otherwise calculates penalties for Never Played (×30 pts) and Extremely Rare (×15 pts) songs. Labels: True to Life / Realistic / Plausible / Ambitious / Fan Fiction / Dream Only.
- **Festival Realism Score** — `computeFestivalRealism()` applies the same logic across all concerts in a festival.
- **Historical Highlights** — `computeHistoricalHighlights()` generates up to 5 template-driven highlight sentences per festival (e.g. "One song in this lineup has never been played live", "A song not performed in over 10 years appears").
- **`BandLiveDataCache` model** — per-band Setlist.fm fetch state: `fetchStatus` (never / in_progress / complete / failed), `totalShows`, `fetchedShows`, `setlistFmMbid`, `setlistFmName`, `lastFetchedAt`, `errorMessage`.
- **Live Data Admin Tab** — new "🌐 Live Data" tab in Admin → Band RPG. Select a band, search Setlist.fm for the artist, link the correct MBID, then trigger a full data fetch. Shows current cache status (profile count, shows analyzed, last fetch time).
- **Collection: Live Status badges** — each recovered song in the Songs tab now shows a coloured live status pill (cyan for Never Played, violet for Extremely Rare, indigo for Rare, etc.) when Setlist.fm data has been fetched.
- **Concert detail: Realism bar** — Concert Intelligence panel now includes a sky-blue "Realism" bar showing the realism score and label.
- **Festival detail: Real World section** — below prestige/dream controls, shows realism bar + historical highlight bullets when live data is available.
- **Discovery bonuses** — `liveValueDiscoveryBonus()` computes score bonus points for rare songs found in play sessions (Never Played = +20, Extremely Rare = +12, Rare = +6).
- **5 new API endpoints**: `GET /live-profiles`, `GET /admin/live-data-status`, `POST /admin/search-setlistfm`, `POST /admin/set-setlistfm-artist`, `POST /admin/fetch-live-data`.
- **Live data in collection endpoint** — `GET /collection` now includes `liveData: { liveStatus, liveValue, rarityIndex, totalPerformances, performancePct, yearsSincePlayed, lastPerformanceDate, firstPerformanceDate } | null` per song.

### Schema
- Extended `BandRpgSongProfile` with 10 live intelligence fields — migration: `20260620030000_add_live_intelligence`
- Added `BandLiveDataCache` table — per-band Setlist.fm fetch state — same migration
- `Band` model gains `liveDataCache BandLiveDataCache?` relation

### Technical notes
- Live data is optional enrichment — null gracefully when no data fetched. Realism returns null when <30% song coverage. Nothing blocks gameplay.
- Title matching uses `normTitle()` fuzzy normalisation: strips parenthetical/bracketed notes, collapses punctuation, case-insensitive.
- Setlist.fm dates are `DD-MM-YYYY` format; `parseSlDate()` converts correctly.
- `SETLISTFM_API_KEY` environment variable required (see env vars table in README/CLAUDE.md).

---

## Phase U — Dream Festivals (2026-06-20)

### Added

- **Festival Prestige Score (0-100)** — weighted composite of 9 inputs: chemistry (28%), headliner strength (15%), concert total (13%), audience diversity (12%), venue fit (10%), fan service balance (7%), deep cut balance (7%), band count (5%), concert count (3%).
- **6 Prestige Tiers** — Local Gathering / Regional Event / Cult Festival / Legendary Event / World Class Festival / Mythic Festival. Tier displayed on `FestivalCard` and in the detail modal.
- **Festival Legacy Report** — template-driven multi-sentence report generated from prestige tier, personality, chemistry, primary audience, and achievements unlocked.
- **10 Festival Achievements** — 🧪 Perfectly Curated (chemistry ≥ 90), ⭐ Headliner Excellence, 🌍 Universal Crowd, 🔍 Deep Archive, ❤️ Fan Favourite, 🏟️ Venue Harmony, 🤝 Grand Coalition (4+ bands), 🎪 Marathon Event (4+ concerts), 📈 Rising Headliner, 🌟 Mythic Status (prestige ≥ 90). Shown as an icon grid in the festival detail, unlocked ones highlighted gold.
- **Dream Festival Designation** — any festival can be marked as the user's Dream Festival. Only one active Dream Festival per user at a time (enforced server-side via transaction). Gold border + ★ badge on the card; amber-tinted header in the detail modal.
- **Dream Festival Export Card** — premium gold canvas (900×1400) with gold border, achievements section, prestige bar, legacy report, gold-gradient score bars, and a distinct footer. Activated via ★ Dream Card button in the detail modal.
- **Festival Hall of Fame** — appears in the Festivals tab when any festival reaches Cult Festival tier or higher. Shows top 5 festivals by prestige score with gold rank numbers.
- **2 New Personal Records** — Highest Prestige (prestige score + tier) and Most Legendary (achievements unlocked count).
- **Dream Festival pinned** at the top of the Festivals list with its own header label.
- **`PATCH /api/band-rpg/festivals/:id/dream`** endpoint — toggles `isDream` on/off. Setting to true clears any existing dream festival for the user first.

### Schema
- `BandRpgFestival.isDream Boolean @default(false)` — migration: `20260620010000_add_festival_is_dream`

### Technical notes
- `computeFestivalPrestige()` runs after the full pipeline (chemistry → lineup → audience) and feeds into `generateLegacyReport()` + `computeFestivalAchievements()`. No extra DB queries.
- Prestige is fully derived from existing computed data — no new DB fields beyond `isDream`.
- Prisma client regenerated after schema change.

---

## Phase T — Audience Archetypes (2026-06-20)

### Added

- **10 Audience Archetypes** — every festival now knows who attends and why. Archetypes scored 0-100 from band audience profiles + festival data:
  - 🎭 Progressive Pilgrims (high progressive + technical)
  - 🔍 Deep Cut Hunters (high deep cuts, low fan service)
  - 🌌 Atmosphere Seekers (high atmospheric + emotional)
  - 🔥 Heavy Devotees (high heavy + aggressive)
  - 🎸 Technical Musicians (high technical + improvisational)
  - 🌀 Psychedelic Travelers (high psychedelic + atmospheric)
  - 💡 Concept Explorers (high experimental + progressive)
  - 🎪 Festival Casuals (high accessible + fan service)
  - 🎵 Album Purists (high emotional + fan service)
  - 📦 Collector Class (high deep cuts, low accessible)
- **Primary & Secondary Audience** — every festival identifies its strongest and second-strongest archetype. Displayed on both `FestivalCard` and `FestivalDetailModal`.
- **Audience Diversity Score** — 0-100 measure of how many archetypes score ≥ 50. Labels: Niche → Focused → Balanced → Broad Audience → Universal Appeal.
- **Audience Report** — readable template-based paragraph explaining who attends and why, with secondary addendum when applicable.
- **Archetype Score Bars** — top 5 archetypes shown as scored bars in the festival detail, each with a tooltip explanation (e.g. "High progressive (72) and technical (68) scores pull in fans who seek compositional depth").
- **5 New Personal Records** — Most Diverse Audience, Most Progressive, Most Underground, Most Accessible, Most Psychedelic.
- **Festival Card** — now displays primary archetype badge + secondary badge + diversity label.
- **drawFestivalCard** canvas — audience archetype line added above the lineup section.

### Technical notes

- `computeAudienceArchetypes()` — pure function, no DB queries, no AI. Uses band audience profiles + festival-level scores already present in the festival pipeline.
- `AudienceArchetype` / `FestivalAudienceProfile` interfaces added to both API route and frontend API types.
- Festival personality bonus applies to compatible archetypes (+12 points) for explainability.
- All archetype scores are fully deterministic and explainable — each has a hand-written explanation template that references the actual metric values.

## Phase S — Avatar Prompt Editor (2026-06-20)

### Added

- **`AvatarPromptEditor` modal** — admin now sees and edits the avatar prompt before any image is generated. The black-box "AI Sprite" button is replaced with a three-step collaborative flow: View prompt → Edit prompt → Generate.
- **Prompt preview & edit** — large monospaced textarea showing the character description auto-generated by GPT-4o-mini, fully editable before the image is created.
- **Preset trait chips** — 15 one-click trait buttons (Bald, Beard, Long Hair, Glasses, Stage Makeup, Theatrical, Aggressive, Psychedelic, etc.) that append text to the description.
- **Negative prompt field** — optional, collapsible. Appended to the image prompt as "Avoid: …" to steer away from unwanted results (e.g. "generic pop singer, baseball cap").
- **Style lock toggle** — enabled by default; the BSM pixel art style frame (prefix + suffix) wraps the character description. Expandable to show the exact style instructions. Disabling lets the admin write a fully custom prompt.
- **Reset to original** — one-click revert to the auto-generated description, even after manual edits.
- **Generate 4 Variations** — generates four images in one OpenAI call and displays them in a 2×2 picker grid. Admin clicks to select one; only the chosen image is saved to the database.
- **Prompt source viewer** — shows member name, role, band, and description provenance inside the editor.
- **Regenerate Prompt** — re-calls GPT-4o-mini to produce a fresh appearance description without generating an image.
- **Persistent prompt storage** — `BandMember` now stores `originalAvatarPrompt`, `lastAvatarPrompt`, `lastAvatarNegativePrompt`. Re-opening the editor reuses saved values without a redundant GPT call.

### Changed

- `POST /api/platformer/skins/ai-generate` — now accepts `characterDescription`, `negativePrompt`, `count` (1–4). Count=1 saves immediately; count>1 returns variation dataUrls without saving.
- `POST /api/platformer/skins/generate-prompt` (new) — Step 1 only: generates or returns saved character description.
- `POST /api/platformer/skins/save-variation` (new) — saves a chosen variation dataUrl as an approved skin.
- BSM style constants extracted to `BSM_STYLE_PREFIX` / `BSM_STYLE_SUFFIX` for consistent reuse.

## Cinema: admin/user access split, public playbacks, watermark, docs (2026-06-06)

### Added

- **Cinema access tiers** — Cinema Mode now serves both admin and regular users, with the UI trimmed to match each tier:

  | Feature | Admin | Regular user |
  |---|---|---|
  | Browse nodes, click info | ✓ | ✓ |
  | Filter by band | ✓ | ✓ |
  | Scene autoplay (Scenes mode) | ✓ | ✓ |
  | Camera rails (Rail mode) | ✓ | ✓ |
  | Curated Playbacks (pre-built tours) | ✓ | ✓ |
  | ⚙ Config panel (themes, controls, visibility) | ✓ | — |
  | 📽️ Director Mode | ✓ | — |
  | 🤖 AI Director | ✓ | — |
  | 🗺 Tour Planner (build sequences) | ✓ | — |
  | 🛤 Path mode | ✓ | — |
  | 🎤 Setlist panel | ✓ | — |
  | 🎬 Social Mode | ✓ | — |
  | ✦ Arrange | ✓ | — |
  | Visual Node Mode / Artwork Spheres | ✓ | — |

- **Public / Curated Playbacks** — Admin can mark any saved tour sequence as "public" via the 🌐 globe button in the Tour Planner's Saved Sequences list. Public sequences appear in a "✨ Curated Playbacks" panel for all logged-in users — they can pick one and press ▶ to watch the pre-built camera tour without building it themselves.

- **Non-admin watermark** — Regular users always see a subtle "Band Spectrum Mapper" watermark in the bottom-right corner of Cinema Mode, giving the platform credit when viewers are watching the visualizer.

- **Backend**: `isPublic Boolean @default(false)` added to `UserNodeSequence` schema. `GET /api/node-sequences` now returns public sequences for non-admins and the user's own sequences for admins. New `PATCH /api/node-sequences/:id/toggle-public` endpoint (admin only).

- **User Guide** (`docs/USER_GUIDE.md`) — New plain-English guide for non-admin users covering: browsing Cinema, filtering bands, using rails, playing curated tours, and contributing via the library.

### Changed

- `POST /api/node-sequences`, `PUT`, `DELETE` — restricted to admin users only (regular users can only read public sequences, not create or delete them).

---

## Cinema: mobile touch fixes (2026-06-06)

### Fixed

- **Two-finger spinning** — `TrackballControls.staticMoving` now set to `true` after graph loads, so the camera stops the instant fingers lift instead of spinning with momentum. `rotateSpeed` reduced from `1.0` to `0.5`, `panSpeed` to `0.5` for calmer phone navigation.
- **Node jumping to tap position** — Added `enableNodeDrag={false}` to the main `ForceGraph3D`. Nodes are fixed-position in Cinema; the default `true` caused the nearest node to teleport to a tap point when touched.

---

## Cinema: server-side persistence for admin account (2026-06-06)

### Added

- **`UserCinemaData` Prisma model** — One row per admin user storing all Cinema session data as JSON blobs (presets, config snapshots, director keyframes, per-scene keyframes, node overrides). Applied via `prisma db push` on Railway restart.

- **REST API** at `/api/cinema/` (admin-only):
  - `GET /data` — returns all Cinema data in one payload
  - `PUT /presets` — replaces stored visual presets list
  - `PUT /snapshots` — replaces stored config snapshots list
  - `PUT /director-keyframes` — replaces director keyframe sequence
  - `PUT /scene-keyframes` — replaces per-scene keyframe map
  - `PUT /node-overrides` — replaces per-node colour/size overrides

- **Frontend sync** (`apps/web/src/cinema/cinemaPersistence.ts`) — On Cinema mount the app fetches server data and hydrates state (server is authoritative). If server is empty on first use, local data is pushed up automatically. Every edit triggers a 2-second debounced save to the server; localStorage continues to work as offline fallback.

---

## Cinema: vinyl records with per-album tint + artwork labels + duration scaling (2026-06-05)

### Added / Changed

- **Vinyl records** — In Visual Node Mode, song nodes render as textured vinyl disks instead of plain spheres.
- **Per-album tint** — Each album deterministically maps to one of 12 palette colours (hash of albumId → palette index) so every album is visually distinct and stable across sessions.
- **Album artwork label** — A circular crop of the album artwork appears in the vinyl's centre label area, correctly oriented with the disk (no longer a camera-facing billboard that cuts through tilted records).
- **Duration scaling** — Disk radius scales proportionally to `sqrt(durationSeconds / 210)` (reference: 3:30 = 1×), clamped 0.65× – 2.0×.

---

## Cinema: Lyric Path Mode (2026-06-05)

### Added

- **Lyric Path Mode** (`apps/web/src/cinema/LyricPathPanel.tsx`) — Full-screen 3D overlay that renders a song's lyrics as a word-sequence helix graph. Each word is a node; consecutive words are linked. An auto-play tour flies the camera word by word. Controls: play/pause, step prev/next, speed (0.2–5×), orbit distance (15–220). Opened from the "Lyric Path ∿" button in the Cinema node info panel.

---

## Cinema: Send-to-Cinema handoff from Word Cloud & Pattern Lab (2026-06-05)

### Added

- **Cinema Handoff** (`apps/web/src/cinema/cinemaHandoff.ts`) — `pushCinemaHandoff(bandIds, label)` saves a band filter to localStorage; `popCinemaHandoff()` consumes it (5-minute TTL). Word Cloud and Pattern Lab both gained a "🎬 Cinema" button that uses this to send the active band selection straight to Cinema Mode, where a banner lets the admin apply it instantly.

---

## Song Source Linker — bulk-link live/bootleg/demo recordings to studio originals (2026-06-03)

### Added

- **Song Source Linker** — New admin tool at `/admin/song-links` (also linked from Admin Hub).

  **What it does:** Lets you link any live, bootleg, demo, EP, or single recording to the studio original song it's derived from. Once linked, lyrics can be inherited in bulk — the derived song gets its own editable copy so you can tweak it later.

  **How the auto-detection works:**
  - Loads all songs from selected bands in one fetch
  - Splits into "source candidates" (studio album songs) and "derivations" (live/bootleg/demo/EP/single albums)
  - Title normalisation strips suffixes like `(Live)`, `[Bootleg]`, `- Demo Version` before comparing
  - Levenshtein distance gives a 0–100% confidence score
  - ≥ 90% = near-exact match (green), 70–89% = likely (yellow), < 70% = needs review (red)

  **UX flow:**
  1. Pick one or more bands → click **Load & Auto-detect**
  2. Grid shows every derivation with: Song + album, type badge, suggested studio match (dropdown), confidence bar, "Copy lyrics" checkbox, status
  3. The source dropdown lists all studio songs sorted by match % — override any wrong guess instantly
  4. Click **Link N high-confidence** to bulk-apply everything above your chosen threshold (70/80/90/95%)
  5. Optionally inherit lyrics for songs that don't have any yet — creates an editable copy labelled "Inherited from: {title}"

- **Schema**: Added `sourceSongId` column to `songs` table with a `SongDerivations` self-referential relation (separate from `remixOfSongId` which remains for actual artistic remixes).

- **API endpoints** at `/api/song-links/`:
  - `GET /candidates` — fetch all songs with album and lyric status
  - `PATCH /:songId` — set or clear a source link
  - `POST /:songId/inherit-lyrics` — copy lyrics from source to this song
  - `POST /bulk` — link many songs at once, with optional lyrics inheritance

---

## Cinema: adaptive rail speeds, star-polygon pendulum, song limit control (2026-06-03)

### Changed / Fixed

- **Rail speeds now adaptive** — Each rail type targets a sensible dwell time per waypoint regardless of graph size (Album Circuit: 8 s/album, Nonagon: 10 s/stop, Warp Jumps: 5 s/album, Slow Drift: 4 s/node, spiral/corkscrew: 2 s/point, Pendulum: 6 s/point). A 30-album KGLW circuit runs ~4 minutes at 1× instead of 43 seconds. The speed multiplier now applies live in the RAF loop so the slider responds immediately while a rail is playing.
- **Speed slider minimum lowered to 0.05×** — Allows ultra-slow cinema movement, down from 0.2×.

### Changed

- **Pendulum redesigned as star-polygon** — Instead of a repetitive left-right cosine sweep, Pendulum now finds the N outermost album nodes (up to 9), sorts them by angle, and visits them in a star-polygon skip-k pattern (where gcd(k,N)=1). The camera traces a genuine star shape across the galaxy, visiting different "corners" on each pass.

### Added

- **Song limit control** — New "Song limit" input in the Cinema band picker (default 600, max 3 000). Raise it to load full discographies for large bands like KGLW with hundreds of bootlegs. The `nodeLimit` parameter flows through the public graph API and `buildArtistUniverse` with a hard cap of 3 000 to prevent browser memory issues.

---

## Cinema camera rails, 12 new themes, opacity-during-playback fix (2026-06-02)

### Added

- **Camera Rail system** — New `🛤 Rail` mode in the bottom toolbar (alongside Scenes / Tour). Camera follows a continuous smooth spline path through the graph; eight distinct rail types selectable from a panel:
  - **🎞 Album Circuit** — visits every album in release-year order along a smooth curve
  - **⬡ Nonagon** — 9-vertex looping polygon around the outer ring; perfect for KGLW's circular discography
  - **🌀 Spiral In** — grand 2.5-turn descent from high orbit down to the core
  - **🔭 Perimeter Scout** — walks the outer boundary of the galaxy, always gazing inward
  - **⚡ Warp Jumps** — launches from far-field, decelerates at each album — cinematic hyperjumps
  - **🌌 Slow Drift** — ambient unhurried drift through the full node cloud (loops forever)
  - **🔩 Corkscrew** — helical rise up through the galaxy from below
  - **⏱ Pendulum** — wide side-to-side sweep across the full width of the graph
  - Rail speed slider (0.2× – 4×) in both the rail panel and the config Layout tab
  - **Free-aim look-around**: drag the canvas while the rail is running to pan the camera aim; release and it eases back toward the next auto-target over ~1 second
  - Rail progress shown in top-centre HUD (type emoji + current node label + hint text)
  - Album nodes now carry `year` in their graph data so Album Circuit sorts by release year

- **12 new visual themes** (added to the existing 30): Solarized Light, Dracula, Tokyo Night, Catppuccin, Gruvbox, Nord Ice, Monokai, Synthwave, Sakura, Lava Lamp (with bokeh), Twilight, Watercolor

### Fixed

- **Selection opacity during playback** — Node dimming, size emphasis, and link highlighting no longer disappear when any playback mode (Path, Scene) is running; they were incorrectly gated on `!isPlayingRef.current` which blocked all dimming during any playback. Now gated on `!tourModeRef.current` so Tour mode keeps its own highlighting while all other playback modes respect the selection dim strength.

---

## Cinema enhancements — label fix, album type colours, artwork spheres, tabbed config (2026-06-02)

### Added

- **Artwork Sphere mode** — New checkbox in the Nodes config tab. When enabled (and Visual Node Mode is off), album and artist nodes render as spheres with their artwork texture mapped onto the surface (Lambert shading). Regular song nodes and nodes without artwork fall back to colour-coded spheres. Artwork Sphere mode and Visual Node Mode are mutually exclusive.

- **Per-album-type colour overrides** — Album type rows in the Nodes config tab now include colour picker inputs so each type (Studio, Live, Bootleg, EP, Compilation, Single, Demo) can be individually tinted. Defaults: Bootleg = orange (`#f97316`), Live = blue (`#0ea5e9`), all others inherit the current theme. These overrides are also applied inside Galactic Cinema mode.

- **Tabbed config panel** — The single long-scroll config drawer is replaced by a five-tab layout, dramatically reducing the need to scroll:
  - **⊞ Layout** — Arrangement mode grid + Camera (orbit speed, auto-rotate, FoV, near/far clip)
  - **● Nodes** — Visual Node Mode, Artwork Spheres, node opacity, selection dim, per-type visibility, album-type colour pickers, visual theme
  - **A Labels** — Show distances, vertical offset, word wrap, text sizes, label appearance, label states
  - **♫ Lyrics** — Proximity trigger, lyric overlay font/animation/timing settings
  - **◈ FX** — Genre source, genre cloud zones, depth-of-field controls

### Fixed

- **Label screen-space anchoring** — Label sprites are now offset in camera screen-space rather than world Y. The camera's up vector is extracted from `camera.matrixWorld.elements[4,5,6]` each frame and used to place labels consistently below the artwork/node regardless of camera pitch or roll. In Visual Node Mode the label is placed below the bottom edge of the artwork sprite; in standard mode the vertical offset slider now moves labels along the true screen-up axis instead of just world-Y.

---

## Remix data model + Galactic Cinema mode + AI Batch song selection (2026-06-02)

### Added

- **Remix data model** — Songs can now be marked as remixes with a pointer to the original song.
  - New DB fields on `songs`: `isRemix BOOLEAN NOT NULL DEFAULT false`, `remixOfSongId TEXT` (self-referential FK with `SET NULL` on delete).
  - Prisma schema updated with `remixOf`/`remixes` self-relation (`SongRemixes`).
  - Song edit form (Song Detail page) now has a "This is a remix" checkbox. When checked, a search field appears to find and link the original song.
  - Song Detail page shows a "Remix" badge (with a link to the original song) when `isRemix = true`.
  - Cinema graph includes `remix_of` edges between remix songs and their originals.
  - Migration: `prisma/migrations/20260602000000_add_song_remix/migration.sql` — applied automatically on Railway deploy.

- **Galactic Cinema mode** (`🪐 Galactic`) — New arrangement mode in Cinema that organises the graph as a cosmic hierarchy:
  - **Black hole** (artist node) at the origin — deep indigo, large.
  - **Stars** (album nodes) spiral outward from the black hole on a golden-angle pattern — amber/gold.
  - **Planets** (regular song nodes) orbit their parent album in rings — blue.
  - **Moons** (remix song nodes) orbit their original song planet — grey, smaller.
  - Camera auto-repositions to an elevated view after the 1.4 s animation so the disc structure is immediately legible.
  - Tag/keyword nodes placed in an outer asteroid belt.

- **AI Batch Runner song selection** — Individual rows in the song table can now be checked to limit a run to selected songs only.
  - Checkbox column in the song table; header checkbox selects/deselects all (with indeterminate state).
  - When songs are selected, the Run button reads "Run on N selected songs" and only those rows are processed.
  - Progress bar, job counts, and checkpoint detection all respect the active selection.
  - Selection resets when songs are reloaded or the batch is reset.

---

## AI Batch Runner — Compound mode (2026-06-02)

### Added

- **Compound AI mode** — New `⚡ Compound (all AI jobs — 2 calls)` job type in the AI Batch Runner that replaces 7–8 sequential individual OpenAI calls per song with just **2 compound calls per song**, achieving roughly a **4× reduction in total API calls** and a **~3× speedup per song**.
  - **Phase 1** (1 OpenAI call): Research summary + music style + Spectrum (6 axes) + Music Structure Score (6 axes) + Lyric Analysis (tags, register, depth, craft) + Genre Accessibility (6 genres).
  - **Phase 2** (1 OpenAI call): Core Score (emotional fan perspective) + Context Analysis (5 narrative fields) — uses Phase 1 output as context.
  - Wikipedia articles (song/album/band) are still fetched in parallel (fast HTTP, no extra OpenAI cost) before Phase 1, so research quality is preserved.
  - Results are written to **the same DB tables** as the individual jobs — all downstream features (Spectrum page, Song page, Cinema, etc.) work without changes.
  - **Mutual exclusivity**: selecting Compound automatically deselects the 7 individual AI jobs it covers; selecting any individual job deselects Compound. Track Duration (MusicBrainz) still runs independently.
  - Compound mode is now the **default selection** when opening the batch runner, since it's the recommended approach for large runs.
  - For KG's 20,340-job queue (~3,708 songs × ~8 jobs): compound mode reduces this to ~7,416 calls (2 per song).

- **New service**: `apps/api/src/services/compoundAiService.ts` — pure service, no route coupling, smart caching (skips phases where all outputs already exist unless `force=true`).
- **New route**: `POST /api/admin/ai-batch/compound/:songId` with `{ force?: boolean }` body.
- **New API method**: `analysisApi.runCompoundAnalysis(songId, force)`.

---

## Bootleg artwork in Cinema nodes (2026-06-02)

### Fixed

- **Bootleg album artwork not loading in Cinema 3D nodes** — THREE.js `TextureLoader` sends `crossOrigin: 'anonymous'`, so the image server must return `Access-Control-Allow-Origin` headers. Apple Music CDN (`mzstatic.com`) does this; Archive.org thumbnail URLs and scraped band-website images (e.g. `kglw.net`) often do not, causing WebGL textures to fail silently while `<img>` tags still display the image fine.
  - Added `GET /api/public/proxy-image?url=ENCODED_URL` — a server-side image proxy that fetches allowed-domain images and forwards them with `Access-Control-Allow-Origin: *` + 7-day cache.
  - Added `toProxiedImageUrl()` helper in CinemaPage that routes non-Apple-Music artwork through the proxy before passing to `getCachedTexture`. Apple Music CDN URLs are passed through directly (already CORS-compliant).
  - Allowlisted domains: `archive.org`, `kglw.net`, `pearljam.com`, `deadandcompany.com`, `phish.net`, `coverartarchive.org`.

---

## Star + Nonagon Infinity arrangements (2026-06-01)

### Added

- **Star arrangement modes** (`star-3` through `star-8`) — New graph layouts that distribute albums in fan clusters at each tip of an N-pointed star. Artists anchor the center, songs orbit their parent album in small rings, other node types fill an outer belt. Works for any collection size: albums overflow to additional angular rings when there are more albums than star points.
- **Nonagon Infinity arrangement** (`nonagon-infinity`) — A 9-sided regular polygon layout inspired by King Gizzard and the Lizard Wizard's *Nonagon Infinity*. Albums cycle through the nine vertices; additional albums extend to outer rings with a slight angular jitter for depth; songs orbit their albums.
- **Seven new Cinema scenes** (scenes 17–23): Triangle of Power (3-pt), Four Pillars (4-pt), Five-Pointed Star (5-pt), Star of David (6-pt), Seven-Pointed Star (7-pt), Octagram Gate (8-pt), Nonagon Infinity. Each opens with a top-down reveal of the polygon shape then descends into an oblique orbital sweep.
- **Quick Arrange buttons** — All seven new modes appear as quick-select buttons in the Cinema Controls arrange panel alongside existing modes.

### Fixed

- **Star/Nonagon arrangements reverted to radial after apply** — Two root causes fixed:
  1. React Query's default `staleTime: 0` + `refetchOnWindowFocus: true` triggered a background refetch whenever the user clicked away from and back to the Cinema window. The refetch rebuilt all graph nodes without pinned positions, causing the force simulation to re-run and overwrite the star layout. Fixed by setting `staleTime: Infinity, refetchOnWindowFocus: false` on the cinema-graph query.
  2. The star layout was flat (all tips at Y≈0), making it look identical to a radial ring from any non-overhead camera angle. Fixed by giving each star tip a distinct Y height (`±110 units` following a sine wave), so the star shape is visible from any camera position. Camera is also repositioned to an overhead view `(0, 720, 60)` after the arrange animation completes.
- **Word Cloud ignore-words filter** — New textarea in the Word Cloud sidebar accepts any number of words (comma- or space-separated, case-insensitive) to hide from the cloud. Filtered words are excluded client-side from the layout without changing the API. Shows a live count of how many words are currently hidden.

### Changed

- `ArrangeMode` union type extended with `star-3 | star-4 | star-5 | star-6 | star-7 | star-8 | nonagon-infinity`.
- Two pure-math helpers added to `graphArrange.ts`: `computeStarLayout` (shared for all star modes) and `computeNonagonLayout`.

---

## Bootleg Importer + Cinema album type filter (2026-05-31)

### Added

- **Bootleg Importer** (`/admin/bootlegs`) — New admin page for importing official live bootlegs from Archive.org (e.g. King Gizzard's bootlegger collection, Pearl Jam vault, etc.).
  - Search Archive.org's public API by band name or any free-text query
  - Auto-fills search query for any band from your library
  - Expand any result to preview the full tracklist before importing
  - One-click import creates an Album (type: `bootleg`) with all tracks as Songs
  - Idempotent: re-importing an already-imported show is a no-op (detected via `notes` field)
  - Linked from nav under Admin tools and wired into the React router

- **Cinema album type filter** — New "Album types" section in the Cinema Controls (⚙) panel. Select any combination of studio / EP / live / compilation / bootleg / single / demo to include only those album types in the graph. Empty selection shows all types. Bootleg nodes shown in amber, live in sky blue, all others in indigo. Changing the selection re-fetches the graph instantly.

- **`albumTypes` filter on public graph endpoint** (`GET /api/public/graph`) — Accepts optional `?albumTypes=studio,bootleg` comma-separated list and passes it through to `buildGraph`. Cinema, Explore, and other public-facing graph consumers can now filter by album type without an API key.

- **`albumTypes` filter on admin song-nodes endpoint** (`GET /api/song-nodes`) — Already wired via the prior session; confirmed passing correctly.

### Changed

- **`songNodesService.fetchSongs`** now selects `albumType` from the album relation and filters on it when `albumTypes` is specified. Album nodes in the graph carry the `albumType` property.
- **Nav** — Added "Bootleg Importer" link to the Admin section.

---

## Cinema: sequence persistence, path mode fix, Final Cut playback, lyrics start line (2026-05-30)

### Fixed

- **Node Sequence save/load**: Sequences now persist reliably across page refreshes. Server-saved sequences are mirrored to localStorage immediately on success. On-mount load merges server sequences with any local-only ones (instead of replacing them), so nothing is lost when the server responds.
- **Path mode — any node is now clickable**: Removed the adjacency-only constraint. Clicking any node adds it to the path; clicking it again removes it. No longer limited to graph-adjacent hops.
- **Path mode background click**: Clicking empty space in path mode now clears the selected-node chip without wiping the path (previously did nothing at all).

### Added

- **Final Cut playback**: "▶ Play Final Cut" button in the Final Cut panel plays all clips in order using their stored durations. Scene clips call `transitionTo`, director clips load keyframes and start playback, sequence/tour clips load steps and start the tour. The active clip highlights in red. "⏹ Stop" cancels playback and resets the index.
- **Lyrics start line**: New "Start at line" slider under the Scroll mode lyrics controls. Drag to skip an intro or start mid-song; applies immediately to all visible nodes. Reset button returns all nodes to line 0.

---

## Cinema: image depth fix, collapsible node panel, Depth of Field, Final Cut timeline (2026-05-30)

### Fixed

- **Album/band images now respect 3D depth** — Removed `depthTest: false` from the `SpriteMaterial` used for album artwork and band logo sprites in Visual Node Mode. Images behind closer vinyl disk song nodes no longer render on top of them.

### Added

- **Collapsible node info panel** — The selected-node detail panel now defaults to a small chip in the corner (icon + name + expand ↑ button). Click ↑ to expand the full details panel; click ⌄ to collapse back. Collapses automatically on each new node selection. Much cleaner on mobile/phone.

- **Depth of Field (DoF) controls** — New "Depth of Field (DoF)" toggle in the Controls panel (⚙). When enabled, replaces the theme's static bokeh with fully configurable controls: blur amount (2–40 px) and focal zone width (10–80% of canvas width). Works independently of theme bokeh.

- **Final Cut timeline editor** — New 🎞 button in the Cinema toolbar opens the Final Cut panel. Assemble an animation by adding clips from:
  - Director Mode: "🎞 Add to Final Cut" button appears when keyframes exist
  - Node Sequence: "🎞 Add to Final Cut" button appears when steps exist
  - From inside the Final Cut panel: "+ Add current scene" button
  - Clips show type, count, and duration; duration is directly editable
  - Reorder clips with ▲/▼ arrows; remove individual clips or clear all
  - Total runtime shown at the bottom
  - Persisted to `localStorage` as `cinema-final-cut`
  - New `FinalCutClip` and `FinalCutClipType` types added to `cinema/types.ts`

---

## Cinema lyrics stacking fix, Saturn ring word-wrapping, Setlist path mode, Core Score batch job (2026-05-27)

### Fixed

- **Lyrics stacking when camera flies near multiple nodes** — New "Max nodes showing lyrics" slider (default: 1) in the lyrics config. A per-frame pre-pass computes the closest N nodes to the camera and hides all other nodes' lyrics, preventing text pile-ups when flying through a dense cluster in Breathing or Tour mode.

- **Saturn ring text now flows word-by-word** — Ring mode rebuilds lyric sprites as one sprite per WORD (instead of one per line). Words are spaced evenly around the orbital arc, so the text genuinely wraps around the ring. Toggling ring mode on/off rebuilds the sprite pool at the appropriate granularity.

### Added

- **Setlist → Path mode** — The setlist panel now shows two buttons per concert: "▶ Tour" (plays the camera sequence) and "🛤 Path" (loads the song order as a clickable path with connecting lines). Path mode is shown immediately after loading.

- **Core Score batch job** — New "Core Score (fix zeros)" job type in the AI Batch Runner. When selected, a "Load Core Score targets only" button appears that fetches only songs with missing or all-zero spectrum scores (via `/api/admin/ai-batch/spectrum-targets`). Running this job always calls `regenerateAiSpectrum` — no need to enable Force Regenerate.

---

## Cinema themes, Core Score fix, Setlist.fm Cinema tours (2026-05-27)

### Added

- **11 new Cinema color themes** — Infrared, Deep Ocean, Obsidian, Golden Hour, Void, Acid, Rose Gold, Arctic, Jungle, Vintage Noir — high-contrast palettes tuned for IG/FB sharing. Total theme count is now 31.

- **Setlist.fm → Cinema Tour** — New 🎤 button in the Cinema toolbar opens a concert setlist browser. Enter an artist name, search setlist.fm (requires `SETLISTFM_API_KEY` env var), pick a concert, and load it as a Cinema Tour — the camera flies through each song in graph order. Song titles are fuzzy-matched against the loaded Cinema graph. Backend proxy at `/api/setlists/` (auth required).

- **AI Batch scan: all-zero spectrum detection** — The "Data Coverage Scan" in `/admin/ai-batch` now detects songs where an `aiSpectrum` record exists but all 6 axes equal zero (these were previously counted as "scored" but are effectively unscored). The scan card for AI Spectrum Scoring now shows an additional "⚠ X all-zero (unscored)" warning. The `missing` count for spectrum is now based on real non-zero scores.

### Changed

- **`/api/admin/ai-batch/scan` response** — adds `extra.spectrumZero` count and corrects `has.spectrum` / `missing.spectrum` to exclude all-zero records.

---

## Tag enrichment, Cinema sequences, Community tag proposals (2026-05-26)

### Added

- **Community tag proposals** — any signed-in user can propose tags for any song on its share page. Proposals display with their net vote score; upvote/downvote is available to all logged-in users. A proposal reaching net +2 votes is automatically promoted to an official `SongTag`.

- **`TagProposal` + `TagVote` Prisma models** — `tag_proposals` and `tag_votes` tables with cascade deletes. `POST/PUT/DELETE /api/songs/:songId/tag-proposals` router (auth required). Public `GET /api/public/songs/:songId/tags` and `.../tag-proposals`.

- **`CommunityTagsSection` on ShareSongPage** — shows AI tags (cyan), approved community tags (indigo), pending proposals with live upvote/downvote buttons, and a "Propose a tag" form for signed-in users.

- **Context Analysis job in AI Batch Runner** — "Context Analysis" is now selectable as a standalone AI job in `/admin/ai-batch`. Uses `getSongContext` / `regenerateSongContext`.

- **Cinema Mode — server-side node sequences** — `UserNodeSequence` Prisma model stores authored tour paths per user. Sequences saved to the API are accessible from any device. Falls back to localStorage for unauthenticated users.

- **Cinema Mode — arrive flags** — each tour step now supports `selectOnArrive` and `stareLyricsOnArrive` checkboxes. Applied automatically when the camera arrives at that step.

### Changed

- **Tag Constellation (renamed from Theme Constellation)** — renamed throughout frontend and backend. Now uses the `SongTag` table (community + AI tags) instead of `aiAnalysis.themes`. Node type `'tag'`, edge type `'shared_tag'`.

- **Tier 1 — AI tag generation is now context-aware** — `aiTagService` fetches `SongContextAnalysis` and recent listener comments, injecting `titleSignificance`, `lyricalInterpretation`, and `historicalContext` so tags reflect documented meaning rather than surface-level imagery.

- **Tier 1 — Spectrum scoring is now context-aware** — `aiAnalysisService` appends `titleSignificance`, `lyricalInterpretation`, and `historicalContext` from `SongContextAnalysis` to the spectrum scoring prompt.

- **Tier 2 — Context analysis upgraded to gpt-4o** — `songContextService` upgraded from `gpt-4o-mini` to `gpt-4o`; prompt explicitly instructs the AI to draw on training knowledge (published interpretations, artist interviews, cultural references).

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

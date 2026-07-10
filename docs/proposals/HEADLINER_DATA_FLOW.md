# Headliner — Data Flow Blueprint

Companion to `CONCERT_ARCHITECT.md` (Phase Z.17.8 proposal, approved). That doc named the game
and sketched the architecture; this doc is the pre-implementation audit required before any
Headliner code is written. It answers, for every data source the game touches: what the
canonical table/service is, who owns the data, how it loads, whether it's cached, what happens
when it's missing or stale, whether an admin can repair it, and whether it's safe to use in a
scored/leaderboard-eligible run.

**Rule applied throughout:** if a source is `estimated`/`fallback`, a Headliner run built from it
is still playable but is marked `usedFallbackData: true` in its report and is excluded from any
future cross-run leaderboard comparison (Phase 2) until the canonical data exists. Nothing in
Headliner ever blocks play for missing data — see Part B ("full-catalog playability") in the
approved spec.

---

## 1. Song 6-axis spectrum

| | |
|---|---|
| **Model/service** | `SongAxisScore` (Prisma) — `aggression, complexity, atmosphere, emotion, psychedelic, concept`, each `Float` on a 0–10 scale. Read via `scoreService.getBySong` / `scoreService.averagesByBand`. |
| **Canonical?** | Yes — canonical catalog data, admin-owned (`canEditCanonical`/`canGenerate`). |
| **Load mechanism** | One row per song, `@unique` on `songId`. `averagesByBand(bandId)` loads all rows for a band and averages per axis in-process (no DB-side aggregation). |
| **Cache** | The row itself IS the cache — no TTL, persists until regenerated. |
| **Missing-data risk** | A song with no `SongAxisScore` row is simply absent from `averagesByBand`'s average (not treated as zero). Headliner must do the same — never coerce a missing score to 0, which would silently drag every axis average down. |
| **Staleness risk** | None tracked (no `source`-based expiry); `source` field (`ai`\|`manual`\|`import`\|`audio`) is provenance only, not a freshness signal. |
| **Admin repair** | Existing admin `/spectrum` and song-edit UI can re-score any song at any time; Headliner reads live, so a repair is visible on the very next run. |
| **Fallback** | If a song has no score, it's excluded from the identity-target average (source #1) and, in candidate weighting, treated as spectrum-neutral (no bonus/penalty either direction) rather than guessed. |
| **Scoring-safety** | Safe — deterministic, admin-controlled, no AI call inside gameplay. |
| **Leaderboard-eligibility** | Full eligibility. This is the one source Headliner is built around; a band with too few scored songs (below `TUNING.minScoredSongsForBand`) should show a "needs more spectrum data" notice on the band-select screen rather than starting a run. |

## 2. Musical structure spectrum

| | |
|---|---|
| **Model/service** | `SongMusicScore` — `rhythmicComplexity, harmonicDepth, structuralComplexity, sonicDensity, tempoEnergy, tonalDarkness`, 0–10 scale, one row per song (`@unique songId`). |
| **Canonical?** | Yes, admin-owned. |
| **Load mechanism** | Direct `findUnique`/`findMany` by songId/bandId — no dedicated averaging helper exists (unlike axis scores), so Headliner's data service computes its own per-band averages in-process, the same way `averagesByBand` does for axis scores. This is new *aggregation* code, not new *scoring* logic — no duplication. |
| **Cache** | Row is the cache. |
| **Missing-data risk** | Same pattern as #1 — a song without a row is excluded from averages, not zeroed. |
| **Staleness risk** | None tracked. |
| **Admin repair** | Regenerated via existing AI batch runner (`/admin/ai-batch`). |
| **Fallback** | Used only for pacing (tempo runs, energy curve) and candidate variety, never for the crowd-reaction or scoring formulas directly — those read Audience Profile (#3) and Axis Score (#1). A song missing `SongMusicScore` just contributes no pacing signal (treated as "unknown tempo," not "medium tempo"). |
| **Scoring-safety** | Safe. |
| **Leaderboard-eligibility** | Doesn't gate eligibility — it's a secondary signal, not the identity target. |

## 3. Audience / identity profile (10 dimensions)

| | |
|---|---|
| **Model/service** | `SongAudienceProfile` (song-level), `AlbumAudienceProfile`/`BandAudienceProfile` (pure aggregates). Service: `audienceProfileService`. |
| **Canonical?** | Yes, admin-owned. |
| **Load mechanism** | `getOrCreate(songId)` — **on a cache miss it calls OpenAI (`gpt-4o-mini`) synchronously** and writes the row. `regenerate(songId)` always calls OpenAI. Album/band variants are pure averages over cached song rows, no AI call. |
| **Cache** | Row-level cache, no TTL. |
| **Missing-data risk** | **This is the one genuine scoring-safety hazard in the whole audit.** Headliner's crowd-faction reactions are explicitly specified to read this data (Part D/O of the approved spec) and the whole engine must be a pure, deterministic function with no AI calls inside gameplay. `audienceProfileService.getOrCreate` violates that if called mid-game (unpredictable latency, a live OpenAI dependency, and non-determinism if the model's output ever differs run-to-run for an unscored song). **Decision: Headliner's data service calls `prisma.songAudienceProfile.findUnique` directly — never `getOrCreate`/`regenerate` — and never triggers generation.** A song with no profile row gets a neutral fallback profile (all 10 dimensions = 50, i.e. "no signal either way") purely in-memory; nothing is written to the DB by Headliner. |
| **Staleness risk** | None tracked beyond `updatedAt`. |
| **Admin repair** | Admin can regenerate via existing analysis routes/batch runner; Headliner picks up the new row on the next run it starts (mid-run state is snapshotted at run-start, see §"Snapshot boundary" below). |
| **Fallback** | Neutral 50/50 in-memory profile, as above. Bands whose songs are mostly missing profiles will have flatter, less differentiated crowd reactions — surfaced honestly, not hidden. |
| **Scoring-safety** | Safe **only** because Headliner is barred from calling `getOrCreate`/`regenerate`. This constraint is the single most important rule in the engine and is enforced by never importing `audienceProfileService` into `concertEngine.ts` or `concertDataService.ts` — the data service imports `prisma` directly for this one table. |
| **Leaderboard-eligibility** | Runs using fallback-profile songs are still eligible (Phase 1 has no cross-user leaderboard yet), but the per-run report should note how many songs used the neutral fallback so a later leaderboard phase can decide whether to filter on it. |

## 4. Live Frequency (real-world performance rarity)

| | |
|---|---|
| **Model/service** | `BandRpgSongProfile` — `totalPerformances, performancePct, liveStatus, liveValue (0–100), rarityIndex, yearsSincePlayed, lastPerformanceDate`. Canonical tier derivation: `deriveLiveFrequency()` in `apps/web/src/lib/liveFrequency.ts` (being relocated to `packages/shared`, see below). |
| **Canonical?** | Yes — sourced from Setlist.fm, admin-fetched (`canFetch`), one row per song. |
| **Load mechanism** | Row already computed and cached by `setlistIntelligenceService.fetchBandLiveData`/`reanalyzeLiveData` — Headliner never calls Setlist.fm itself, only reads the cached row. |
| **Cache** | Row is the cache; `lastLiveDataFetchedAt` records freshness but nothing auto-expires it. |
| **Missing-data risk** | A band never linked to Setlist.fm has no rows at all → every song falls back to `tierFromRarity(Song.rarity)` with `source: 'estimated'`, exactly as the existing `deriveLiveFrequency` already does for the Wiki UI. Headliner reuses this fallback verbatim — no new fallback logic. |
| **Staleness risk** | Possible (a band's live catalog changes as they tour) but out of scope for Headliner to detect — same staleness the rest of the app already tolerates. |
| **Admin repair** | Existing "Refresh Live Data" admin action. |
| **Fallback** | `tierFromRarity` — already-existing, reused as-is. |
| **Scoring-safety** | Safe — pure read, no external call during gameplay. |
| **Leaderboard-eligibility** | Full eligibility either way; the report distinguishes `source: 'live'` vs `'estimated'` excitement so a discerning player can tell how "real" their rarity moments were. |

**Relocation note:** `deriveLiveFrequency`/`tierFromLiveStatus`/`tierFromRarity`/tier constants
currently live only in `apps/web/src/lib/liveFrequency.ts`, a pure, dependency-free module. The
Headliner engine runs server-side and needs the identical derivation the UI uses (per CLAUDE.md:
"avoid duplicated logic — extract to `packages/shared`"). This phase moves the implementation to
`packages/shared/src/liveFrequency.ts` and turns the web path into a one-line re-export, so all six
existing importers are unaffected and the server-side engine imports the same canonical function
instead of a second copy.

## 5. Real historical setlists (raw)

| | |
|---|---|
| **Model** | `BandRpgRawSetlistEntry` — `bandId, setlistFmId, eventDate ("DD-MM-YYYY"), setlistFmTitle, isTape, matchedSongId`. Indexed on `[bandId]` and `[bandId, setlistFmTitle]`. |
| **Canonical?** | Yes, admin-fetched, read-only from Headliner's perspective. |
| **Load mechanism** | Bulk-inserted by `fetchBandLiveData`, re-derivable locally via `reanalyzeLiveData` without re-hitting Setlist.fm. |
| **What it does NOT contain** | **Audit finding:** the row has no set-index, no set-name, no encore flag, and no within-show ordinal position — the upstream Setlist.fm API response (`SlSet.encore`, set ordering) is read during fetch but never persisted. `setlistFmId` does group entries into "the same show," so real song **co-occurrence** (which songs appeared in the same show together) is derivable today. Real **opener/closer/encore-position** statistics are **not** derivable from the current schema without an additional migration (new `setIndex`/`isEncore` columns). |
| **Consequence for Phase 1** | The Z.17.8 proposal's `setlistRoleStats.ts` (opener/closer/encore probability) is **not built in Phase 1** — it would require a schema change, which is out of scope for "a narrow, playable vertical slice." Phase 1 uses only Live Frequency (#4) as its "real-world" signal for candidate weighting and rarity excitement. Co-occurrence-based candidate hints and true opener/closer role stats are named explicitly as **Phase 2** work, gated on a small additive migration to `BandRpgRawSetlistEntry`. |
| **Scoring-safety** | N/A this phase (not read by the engine). |
| **Leaderboard-eligibility** | N/A this phase. |

## 6. Setlist Intelligence realism formulas

| | |
|---|---|
| **Service** | `setlistIntelligenceService.ts` — `computeConcertRealism(songStatuses)`, `computeFestivalRealism(...)`, `computeHistoricalHighlights(...)`, all pure functions of already-loaded `liveStatus` strings. |
| **Canonical?** | These are Band RPG's own scoring formulas, built for Band RPG's concert/festival/tour feature. |
| **Reuse decision** | **Not reused directly.** These functions are tuned for Band RPG's specific "did the player build a realistic setlist" framing and read a flat `string[]` of `liveStatus` values with Band-RPG-specific thresholds (e.g. `85 - neverPlayed*30`). Headliner's rarity-excitement mechanic (Part I) is intentionally different: it rewards rarity as *audience excitement*, not *realism-vs-unrealism*, and needs per-song, per-pick granularity rather than a single end-of-show realism score. Copying the formula would be duplicating tuned game-specific constants under a different game's rules — the CLAUDE.md instruction to "extract to shared when applicable" is about deduplicating identical logic, not about forcing two different games to share one balance curve. Headliner's own rarity-excitement function lives in `concertEngine.ts`'s `TUNING` block and is built from Live Frequency (#4) directly. |
| **What IS reused** | The general pattern (deterministic, pure functions over pre-loaded status strings, no DB calls inside the formula) is followed for all of Headliner's own scoring functions. |

## 7. Venues

| | |
|---|---|
| **Model** | `BandRpgVenue` — `name, description, capacity, atmosphereAffinity, aggressionAffinity, complexityAffinity, emotionAffinity, psychedelicAffinity, conceptAffinity, rarityBonus`. Already speaks the 6-axis language. |
| **Canonical?** | Yes — a small fixed admin-curated table (relations to `BandRpgConcert`/`BandRpgTourStop`). |
| **Load mechanism** | Direct `findMany`/`findUnique`. |
| **Reuse decision** | Reused as-is for Phase 1's single venue and for the venue-affinity modifier on crowd reactions (Part B, "show-context modifiers"). Headliner does **not** create a parallel venue table — `ConcertRun.venueId` references `BandRpgVenue` directly. |
| **Missing-data risk** | None for Phase 1 (one venue is hand-picked for the vertical slice). If a venue is later deleted, `ConcertRun.venueId` is nullable with `onDelete: SetNull` so historical runs aren't destroyed. |
| **Scoring-safety** | Safe — static admin data. |
| **Leaderboard-eligibility** | Full. |

## 8. Community ratings

| | |
|---|---|
| **Model** | `UserSongRating` — per-user `aggression, complexity, atmosphere, emotion, psychedelic, concept` (Int), one row per `[userId, songId]`. |
| **Canonical?** | Player-owned rows, but the *aggregate* (crowd sentiment) is effectively canonical community signal. |
| **Reuse decision** | **Not used in Phase 1.** Aggregating community ratings per song requires a `groupBy` query per candidate hand shown — acceptable cost, but the approved spec's "5 crowd factions reading SongAudienceProfile" (Part D) already fully defines faction preference; layering community ratings on top is new weighting logic without a documented requirement. Flagged as a Phase 2 enhancement ("does the crowd's own past ratings sharpen faction reactions") rather than invented now. |
| **Scoring-safety** | N/A this phase. |

## 9. AI genre spectrum

| | |
|---|---|
| **Model** | `SongAiGenreSpectrum` — `metal, rock, pop, hiphop, electronic, folk` (Float), one row per song. |
| **Canonical?** | Yes, admin-owned/AI-generated. |
| **Reuse decision** | **Not used in Phase 1.** Genre appeal was named in the original Concert Architect brainstorm as a "reuse candidate," but none of the approved Phase 1 mechanics (candidate selection, crowd factions, pacing, scoring) reference genre directly — Audience Profile's `accessible`/`experimental`/`progressive` dimensions already cover "how mainstream does this land" more precisely for this game's needs. Not wired in, to avoid an unused/unjustified dependency. |

## 10. Song similarity

| | |
|---|---|
| **Service** | `themeAnalysisService.getSimilar(songId, bandId?)`; `relatedBySpectrum` (ad hoc distance calc in `wiki.ts`, not a reusable exported function). |
| **Reuse decision** | **Not used in Phase 1.** Candidate-hand generation (Part E) needs variety/coverage/spectrum-gap signals, which are computed directly from Axis Score (#1) and the running set-so-far — not from a similarity graph. Similarity is a good Phase 2 idea for "the crowd wants something like the last song" special events, not required for the core loop. |

## 11. Song duration

| | |
|---|---|
| **Field** | `Song.durationSeconds` (nullable Int). |
| **Canonical?** | Yes, admin-entered. |
| **Missing-data risk** | Nullable — a song with no duration is assigned `TUNING.defaultSongSeconds` (a fixed fallback, e.g. 240s) purely for the show-length budget calculation; never blocks selection. |
| **Scoring-safety** | Safe. |
| **Leaderboard-eligibility** | Full — a fallback duration doesn't affect crowd/scoring formulas, only pacing math. |

## 12. Album metadata

| | |
|---|---|
| **Fields** | `Album.title, year, albumType`. |
| **Reuse decision** | Used read-only for album-clumping pacing checks ("don't play 4 songs from the same album in a row") and for the final report's "spanned N albums across M years" flavor line — same data already surfaced on Wiki album pages. |

## 13. Rarity fallback enum

| | |
|---|---|
| **Field** | `Song.rarity` (`SongRarity`: Common/Uncommon/Rare/Legendary/Mythic). |
| **Reuse decision** | Used exactly as `deriveLiveFrequency` already uses it — the `source: 'estimated'` fallback path for #4, nothing new. |

## 14–15. Opener/closer/encore role stats & song co-occurrence

Covered under §5 above. **Confirmed not to exist anywhere in the codebase** — Band RPG's
`OPENER_RARITY_SCORE`/`openerLabel`/`closerLabel`/`computeOpenerStrength` (in `apps/api/src/routes/bandRpg.ts`)
are heuristics over a *player-authored* setlist's rarity+axis values, not statistics derived from
real historical show data. Building the real thing requires the schema addition noted in §5 —
correctly scoped to Phase 2, not duplicated, not half-built.

## 16. Listening count / popularity metric

**Confirmed absent.** No `playCount`, `listenCount`, or `popularity` field exists anywhere in
`schema.prisma`. Headliner does not invent one — "popularity" in the crowd-reaction sense is
carried entirely by Audience Profile (#3) + Live Frequency (#4), which is what the approved spec's
Part D already specifies.

## 17. Player recovery status (Collection)

| | |
|---|---|
| **Model** | `BandRpgCollectedSong` — `userId, songId, songTitle, bandId, bandName, guessedCorrectly, scoreEarned, rarity, recoveredAt`, `@unique([userId, songId])`. |
| **Canonical?** | Player-owned (one row per user per recovered song); this *is* the sole source of truth for "has this player unlocked this song in Band RPG." |
| **Reuse decision** | This is the **only** table Headliner's Campaign eligibility service reads. Per the approved spec: "no second unlock inventory." `campaignEligibilityService.getRecoveredSongIds(userId, bandId)` is a thin `findMany({ where: { userId, bandId } }).map(r => r.songId)` — no new table, no caching layer, no duplication. The one explicit exception named in the spec (guest/rehearsal/promotional single) is modeled as a per-song boolean flag decided at Campaign-implementation time (Phase 2, architecture only this phase) — never as a second inventory table. |
| **Missing-data risk** | A user with zero recovered songs for a band simply has an empty Campaign-eligible pool for that band — surfaced as "recover songs in Band RPG first," never silently backfilled with unrecovered songs. |
| **Scoring-safety** | Safe — player-owned, `requireOwner`-gated read. |
| **Leaderboard-eligibility** | Campaign runs are architecture-only in Phase 1 (no scoring yet). |

## 18. Song data health

| | |
|---|---|
| **Service** | `songHealthService` — `computeSongHealth`/`computeAggregateHealth`, weighted module registry (`spectrum`, `liveData`, `theme`, etc.). |
| **Reuse decision** | Not read by the engine itself, but the band-select screen for Quick Show should surface a lightweight completeness signal (e.g. "12/40 songs have full identity data") drawn from `computeAggregateHealth`, batched once per band-select render — same pattern the admin dashboard already uses, no new health computation invented. |

## 19. Permissions

Headliner is entirely `PLAYER`-tier (Z.17.6 model): every route uses `requireAuth`, and
`ConcertRun` rows are guarded with `requireOwner(async (req) => { const run = await prisma.concertRun.findUnique({ where: { id: req.params['id'] } }); return run?.userId ?? null; })`
— the exact factory pattern already used elsewhere, no new ownership-check code invented.

## 20. UI language / design system

Reuses `RadarChart`, existing badge/tier color tokens (including the relocated
`LIVE_FREQUENCY_COLOR`/`_BG`/`_EMOJI` constants), and the dark-theme (`bg-gray-950`) convention for
public/game pages per `CLAUDE.md`.

---

## Canonical-source conflicts resolved

| Conflict | Resolution |
|---|---|
| Band RPG's "opener/closer" heuristics vs. the proposal's planned real-history-derived role stats | The real-history version does not exist and cannot be built without a schema change (§5). Band RPG's heuristic is **not** reused (it answers a different question — "is this player-built setlist plausible," not "what does history say"). Headliner Phase 1 ships without opener/closer role modeling at all rather than reusing the wrong formula. |
| `audienceProfileService.getOrCreate` (lazy AI generation) vs. the requirement for a pure, deterministic, AI-free engine | Headliner never calls the service — it reads `SongAudienceProfile` rows directly via `prisma`, with an explicit neutral fallback for unscored songs (§3). |
| Setlist Intelligence's `computeConcertRealism` vs. Headliner needing its own rarity-excitement curve | Kept separate — different game, different formula, both legitimate; not merged, not copied. |
| `deriveLiveFrequency` existing only in `apps/web` vs. the server-side engine needing the identical derivation | Relocated to `packages/shared`; web path becomes a re-export so nothing else changes (§4). |

## Snapshot boundary (a determinism note)

Every source above can change between when a `ConcertRun` starts and when it finishes (an admin
could re-run AI analysis mid-show). To keep "same seed + same choices = same result" true,
`concertDataService.buildShowBundle(bandId, venueId)` is called once at `POST /runs` (run start)
and its full output is embedded in `ConcertRun.stateJson`. Every subsequent `pick`/`finish` call
reads from that stored snapshot, never re-queries the DB for song data — only the pure engine
runs on it. This is what makes replay-safety possible without needing to freeze the underlying
catalog tables themselves.

# HEADLINER — a Concert Architect game for Band Spectrum Mapper

**Status: PROPOSAL ONLY — nothing in this document is implemented.**
No code, schema, or routes were changed for this phase. This is architecture
and design, produced so implementation can begin as its own phase with clear
scope and no surprises.

---

## 1. Name

Working title was *Concert Architect*. Proposed name: **Headliner**.

- One word, instantly evocative of the fantasy (you're running the show).
- Reads well in the Games grid next to Band RPG, Vinyl Runner, Band 2048.
- "Concert Architect" describes the mechanic; "Headliner" describes the
  *feeling* — and BSM's games are named for feelings (Word Hunt, Lyric Chain).

Alternatives considered: *Curtain Call* (better for an encore-focused mode),
*Soundcheck* (too preparatory), *The Setlist* (collides with Band RPG's
existing setlist feature — actively harmful). Final call is the owner's;
everything below uses **Headliner**.

---

## 2. The pitch

You are building tonight's show, one song at a time, in front of a live
crowd. Each round deals you a hand of candidate songs from the band's real
catalog. Every choice moves real meters — crowd energy, emotional arc,
spectrum identity, pacing — and five audience factions react in real time.
The goal is not to play your favorites. The goal is to build a concert that
feels authentically like *this band* on a great night: the casuals sing
along, the deep-cut hunters lose their minds at a bustout, the energy curve
lands its climax, and the encore sends everyone home changed.

**Why it's a flagship:** it is the first game where nearly every BSM system
plays at once — Song Spectrum, Rhythm/Music scores, Live Frequency, real
Setlist.fm history, audience profiles, genre appeal, venues, durations, and
album structure all feed one loop. It is a *consumer* of the knowledge
platform: the better the database health, the richer the game. That is the
same virtuous loop the Song Card created, pointed at play instead of study.

---

## 3. Positioning vs. Band RPG's existing Concerts (explicit non-overlap)

BSM already has a setlist → concert → festival → tour feature inside the
Band RPG collection: the player composes a full setlist *up front*, books it
into a venue, and receives a static after-the-fact score (rarity value,
diversity bonus, flow/opener/closer scores, realism).

Headliner is a different genre of game over the same data spine:

| | Band RPG Concerts | Headliner |
|---|---|---|
| Song selection | All at once, from your recovered collection | One at a time, from the band's full catalog, dealt as a hand |
| State | None — scored once at the end | Live simulation: energy, mood, faction satisfaction evolve per pick |
| Constraint | Only songs you've recovered | Full catalog (it's the band's show, not your archive) |
| Session shape | Builder/editor | 15–25 minute run with events, tension, and an ending |
| Fantasy | Collector curating a fantasy setlist | Being on the side of the stage calling the next song |

**Nothing in Band RPG is modified.** Headliner reuses Band RPG's *data*
(venues, live profiles, raw setlists) strictly read-only, and reuses its
*pure scoring functions* by import. Where the two games would compute the
same thing (realism from live statuses), Headliner calls the existing
function rather than re-deriving it.

---

## 4. Reuse audit — what already exists and how Headliner uses it

Everything below was verified against the live schema and services this
session, not assumed.

| Existing system | Model / service | What it provides | How Headliner uses it |
|---|---|---|---|
| Song Spectrum | `SongAxisScore` (+ `source` provenance) | 6 axes, 0–10, per song | The core identity currency. Running concert spectrum vs. band target |
| Band target spectrum | `scoreService.averagesByBand()` | Per-axis catalog average | The "authenticity target" — already computed for the Wiki band page |
| Musical structure | `SongMusicScore` | `tempoEnergy`, `rhythmicComplexity`, `sonicDensity`, `tonalDarkness`… | Energy engine: tempo drives crowd arousal; density/complexity drive fatigue |
| Live Frequency | `BandRpgSongProfile` + `lib/liveFrequency.ts` | Essential→Mythic tiers, `performancePct`, `yearsSincePlayed`, `rarityIndex` | Rarity excitement, bustout detection, faction reactions |
| **Real historical setlists** | `BandRpgRawSetlistEntry` (`setlistFmId`, `eventDate`, `matchedSongId`) | Every fetched show, reconstructable song-by-song | **The sleeper hit of this audit.** Opener/closer/encore probabilities per song, song co-occurrence, real transition patterns — authenticity grounded in how the band actually builds shows |
| Setlist intelligence | `computeConcertRealism()`, `computeHistoricalHighlights()` | Realism 0–100 from live statuses; bustout/never-played highlight strings | Reused as-is for the end-of-show Authenticity panel and event flavor text |
| Venues | `BandRpgVenue` | `capacity`, `rarityBonus`, **per-axis affinities** (`atmosphereAffinity`, `aggressionAffinity`, …) | Venues already speak the 6-axis language. Venue choice = crowd mix + axis biases, zero new data needed |
| Audience profile | `SongAudienceProfile` | 10 dimensions/song: `accessible`, `technical`, `progressive`, `heavy`, `emotional`, `improvisational`… | Per-faction reaction weights — the crowd model reads this, it doesn't invent taste |
| Genre appeal | `SongAiGenreSpectrum` | metal/rock/pop/hiphop/electronic/folk fan appeal per song | Optional faction flavoring at festival shows (mixed-genre crowds) |
| Community ratings | `UserSongRating` aggregates (`getCommunityRatings`) | Crowd-sourced 6-axis + count | Rating *count* proxies "how known is this song" for casual-fan recognition |
| Duration | `Song.durationSeconds` | Real lengths | Show clock, pacing weight, long-song fatigue |
| Album data | `Album.year`, track lists | Era, anniversaries | Album-anniversary event; album-repetition pacing penalty |
| Similarity | `relatedBySpectrum` (Euclidean, in `wiki.ts`), `themeAnalysisService.getSimilar` | Nearest songs by feel/theme | "Flows well from the last song" candidate weighting |
| Data health | `songHealthService` | Per-band module coverage | Playability gate: a band needs enough scored songs to host a show |
| Permissions | Z.17.6 three-tier model, `requireAuth`, `requireOwner` | Enforcement + vocabulary | Runs are player-owned rows; zero canonical writes anywhere in the game |
| UI language | `RadarChart` (dark/outline), Live Frequency badges, `KnowledgeConfidenceBadge`, DESIGN_SYSTEM.md dark tokens | Established visual system | The whole game UI composes from existing pieces |

**Genuinely new surface area (kept deliberately small):**

1. One Prisma model: `ConcertRun` (player-owned run state + final report).
2. One pure simulation module: `concertEngine.ts` (no DB, no side effects).
3. One derived-stats builder: per-song historical roles (opener/closer/encore
   probabilities) computed from `BandRpgRawSetlistEntry` — cacheable per band.
4. One route file + one game page + a leaderboard tab.

Nothing else. No new analysis systems, no new scoring vocabularies, no new
rarity concepts, no crowd "AI."

---

## 5. Core gameplay loop

```
START SHOW
  pick band → pick venue (unlocked ladder) → difficulty
  engine computes: band target spectrum, crowd mix (from venue),
  show length budget (from venue capacity tier, ~75–105 min)
        │
        ▼
┌─────────────────────────── ROUND (×10–16) ───────────────────────────┐
│ 1. DEAL     Engine deals 4 candidates from unplayed catalog:         │
│             ≥1 crowd-pleaser (Essential/Frequent), ≥1 rarity         │
│             (Rare+), 1 "flows well" pick (spectrum-near the last     │
│             song), 1 wildcard. Hard constraints filtered out.        │
│ 2. READ     Player reads the room: faction moods, energy curve,      │
│             show clock, difficulty-gated spectrum feedback.          │
│ 3. PICK     Player chooses. Engine resolves deterministically:       │
│             energy delta, faction deltas, spectrum drift, pacing     │
│             flags, event triggers.                                   │
│ 4. REACT    Crowd strip animates. One-line flavor from real data     │
│             ("First time played since 2009!").                       │
└──────────────────────────────────────────────────────────────────────┘
        │  (event cards interleave at fixed slots — see §9)
        ▼
MAIN SET ENDS (clock or player calls it)
        │
        ▼
ENCORE DECISION
  crowd demands encore if satisfaction ≥ threshold
  1–3 encore slots; encore picks score differently (see §10)
        │
        ▼
END-OF-SHOW REPORT (§10) → run saved → leaderboard
```

A run is **10–16 picks plus encore** — a 15–25 minute session. Short enough
to replay immediately, long enough for an arc.

### Determinism and the seed

Every run gets a seed at start. Candidate deals, event draws, and all
resolution math are pure functions of `(seed, picks so far)`. This gives us:
replayable runs, a verifiable server-side re-score at submit (leaderboard
integrity), and a **Daily Show** mode (same seed for everyone) for free.

---

## 6. The crowd — five factions, zero invented taste

No individual simulation. The crowd is five clusters, each a weighted reader
of data that already exists per song. Each faction has a **satisfaction
meter (0–100)** and a mood face on the crowd strip.

| Faction | Wants (data source) | Turned off by |
|---|---|---|
| **Casual fans** | `accessible` (AudienceProfile), Essential/Frequent tiers, high community-rating count ("songs they know") | Three rarities in a row; 10-minute prog suites back-to-back |
| **Hardcore fans** | Rare/Legendary tiers, low `performancePct`, `emotional` depth | A set of nothing but the greatest hits |
| **Deep-cut hunters** | Mythic tier, `yearsSincePlayed ≥ 10` (bustouts — `computeHistoricalHighlights` already names these), never-played studio tracks | Predictability; the historical "usual opener" as opener |
| **Prog heads** | `technical` + `progressive` (AudienceProfile), `structuralComplexity` + `rhythmicComplexity` (MusicScore) | Short, simple songs stacked together |
| **First-timers** | `accessible` + `emotional`, moderate `tempoEnergy` | Long songs early; harsh `tonalDarkness` openers; anything confusing before they're warmed up |

**Crowd mix comes from the venue** (no new data): a small theatre skews
hardcore + deep-cut hunters; an arena skews casual + first-timers; a
festival slot adds genre-mixed casuals (this is where `SongAiGenreSpectrum`
flavors reactions). Venue per-axis affinities additionally bias *all*
factions — the room itself loves atmosphere or aggression, exactly as
`BandRpgVenue` already encodes.

**Overall Satisfaction** is the crowd-mix-weighted mean of faction meters.
The design tension is that factions genuinely conflict — the spec's
requirement ("too many rare songs confuse casuals; too many common songs
disappoint hardcores") falls straight out of the table above without any
special-case code.

---

## 7. Spectrum identity — the authenticity game

- **Target**: the band's catalog average across the 6 axes
  (`scoreService.averagesByBand` — already exists, already on the Wiki).
- **Current**: duration-weighted mean of the played songs' `SongAxisScore`s,
  updated per pick.
- **Spectrum Match**: `100 − k · euclidean(current, target)` at show's end —
  the same distance math already used by "Similar by Spectrum."

The insight that makes this fun: a band's *catalog* average isn't its *hits*
average. Playing only crowd-pleasers typically drifts the spectrum away from
the band's true identity — so Authenticity and casual satisfaction pull
against each other, and the great setlist threads both.

**Difficulty gates the feedback, exactly per spec:**

| Mode | Spectrum feedback per candidate |
|---|---|
| Easy | Full predicted post-pick radar overlaid on the target (reuses `RadarChart` dark/outline from Z.17) |
| Normal | Directional arrows only: ▲▼ per axis, toward/away from target |
| Hard | Nothing. Read the crowd, know the band |

Hard mode is quietly the *music-knowledge* mode: if you actually know the
band, you can feel which song the show needs. That's the BSM ethos in game
form.

---

## 8. Pacing engine

Tracked continuously; violations create soft penalties (energy bleed,
faction grumbles), never hard blocks — the player may *choose* to break
pacing for a reason:

- **Tempo runs** — 3+ consecutive high `tempoEnergy` songs → crowd fatigue
  (energy gains halve); 2+ consecutive ballads → energy bleed.
- **Axis saturation** — 3 songs in a row within a tight aggression or
  atmosphere band → "sameness" penalty for casuals and first-timers.
- **Album clumping** — 3+ consecutive songs from one album → grumble
  (*suppressed and inverted into a bonus during an Album Anniversary event*).
- **Length budget** — venue sets a show-minute budget from real
  `durationSeconds`; overtime drains first-timers, undertime caps retention.
- **The dip** — the ideal energy curve is rise → sustain → deliberate
  mid-show breather → climb → climax. The report's Energy Curve score (§10)
  compares against this arc, so a well-placed ballad is *strategy*, not
  filler.

---

## 9. Special events

Events draw from a seeded deck at fixed slots (after pick 3, mid-show,
pre-encore) plus condition-triggered interrupts. Every event is grounded in
data we hold:

| Event | Trigger | Effect | Data source |
|---|---|---|---|
| **Deep-Cut Request** | Deck | A sign in the crowd names a real Rare/Mythic song. Play it within 3 picks → hunters +big, casuals −small; ignore → hunters −medium | Live Frequency tiers |
| **Crowd Chant** | Satisfaction ≥ 75 | Crowd chants a song with high historical closer/encore probability. Play now for instant energy, or bank it for the encore at higher value | Raw-setlist role stats |
| **Album Anniversary** | `Album.year` vs. show date (±25/30/40yr) | That album's songs +bonus all night; album-clumping penalty inverted | `Album.year` |
| **Rain Delay** (festival) | Deck, festival only | Energy decays during the gap; next pick must be high `tempoEnergy` or retention drops | MusicScore |
| **Band Fatigue** | >60 show-minutes elapsed | High-tempo/high-`sonicDensity` picks cost extra energy for 3 songs | duration + MusicScore |
| **Technical Issue** | Deck (rare) | Current hand discarded and redealt; small energy dip. (Pure hand-management spice) | — |
| **Birthday Show** | Deck (rare) | One random faction meter +15 and that faction's weight up all night — tonight the superfans came | — |
| **Encore Demand** | End of main set, satisfaction-gated | 1–3 encore slots unlock; crowd's expected songs hinted by historical encore probability | Raw-setlist role stats |
| **Small Theatre / Arena / Festival** | Not events — *venue types* in the run setup | Crowd mix, axis affinities, rarity bonus, length budget | `BandRpgVenue` |

---

## 10. End-of-show report

One screen, museum-placard tone (Song Card language), each line carrying a
`KnowledgeConfidenceBadge` where the underlying data warrants it:

| Score | Computed from |
|---|---|
| **Overall Satisfaction** | Crowd-mix-weighted mean of final faction meters |
| **Authenticity** | Blend: Spectrum Match (§7) + `computeConcertRealism()` over the picked songs' live statuses — "sounds like the band" *and* "looks like a set they'd actually play" |
| **Energy Curve** | Fit of the realized energy line against the ideal arc (§8) |
| **Emotional Journey** | Variance + trajectory of the `emotion` axis across the set — did it *go* somewhere |
| **Spectrum Match** | Raw 6-axis distance, shown as target-vs-final radar overlay |
| **Audience Retention** | % of crowd remaining (walkouts happen when any faction bottoms out or overtime drags) |
| **Encore Quality** | Encore-slot picks weighted by historical encore probability + rarity payoff + final energy |
| **Band Identity Score** | Authenticity × catalog coverage breadth (eras/albums represented) |
| **Setlist Diversity** | Album spread, tier spread, axis range — kin to Band RPG's `computeDiversityBonus`, recomputed for this context |

Composite → letter grade → reputation stars (§13). Below the scores, a
**highlights reel** built from real data via `computeHistoricalHighlights`
("You played *Sober* for the first time since 2011 — the hunters will talk
about this for years").

Replay hooks: the report always shows *one* concrete counterfactual ("Your
mid-show dip came two songs late") — a reason to run it again immediately.

---

## 11. Architecture

### Server (all new code isolated; zero changes to existing routes/services)

```
apps/api/src/
  services/
    concertEngine.ts          ← PURE. No DB, no I/O. (seed, state, pick) → state'
    concertDataService.ts     ← Assembles the per-band "show bundle" (one query pass):
                                 songs + SongAxisScore + SongMusicScore +
                                 BandRpgSongProfile + AudienceProfile + durations
                                 + venue rows + derived historical roles
    setlistRoleStats.ts       ← From BandRpgRawSetlistEntry: per-song P(opener),
                                 P(closer), P(encore), co-occurrence. Computed once
                                 per band, cached (table or in-memory w/ TTL) —
                                 refreshed when live data is re-fetched
  routes/
    concertArchitect.ts
      POST /api/concert/runs                    requireAuth — start (band, venue,
                                                difficulty) → seed + state + hand
      POST /api/concert/runs/:id/pick           requireAuth + owner — resolve pick
      POST /api/concert/runs/:id/finish         requireAuth + owner — encore + report
      GET  /api/concert/runs/:id                owner — resume/inspect
      GET  /api/concert/leaderboard?bandId=&venueId=   public read
      GET  /api/concert/daily                   public — today's seed/band/venue
```

Server-authoritative resolution (client animates optimistically): keeps the
leaderboard honest, keeps heavy math out of the browser (per the
Z.17.5 precedent), and the pure engine + seed makes every run re-verifiable.

### One new model

```prisma
model ConcertRun {
  id           String   @id @default(cuid())
  userId       String
  bandId       String
  venueId      String
  difficulty   String                    // easy | normal | hard
  seed         String
  status       String   @default("active") // active | completed | abandoned
  picksJson    Json     @default("[]")   // ordered songIds + event resolutions
  stateJson    Json     @default("{}")   // engine state snapshot (resume support)
  reportJson   Json?                     // final scores, null until finished
  overallScore Int?                      // denormalized for leaderboard sort
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([userId])
  @@index([bandId, overallScore])
}
```

Player-owned per the Z.17.6 tier model (`requireAuth` + `requireOwner` on
mutation; the game writes nothing canonical, ever).

### Data flow

```
BandRpgRawSetlistEntry ─┐
SongAxisScore ──────────┤
SongMusicScore ─────────┤     concertDataService        concertEngine (pure)
BandRpgSongProfile ─────┼──►  "show bundle" (1 pass) ──► deal / resolve / score
SongAudienceProfile ────┤            │                        │
BandRpgVenue ───────────┘            ▼                        ▼
                              cached per band          ConcertRun row (player-owned)
                                                              │
                                                              ▼
                                                   report + leaderboard + daily
```

### Client

```
apps/web/src/pages/ConcertArchitectPage.tsx   (route: /play/headliner)
apps/web/src/components/concert/
  CrowdStrip.tsx        five faction faces + meters (CSS transitions, calm motion)
  EnergyCurve.tsx       sparkline of the show so far vs. ideal arc
  CandidateCard.tsx     title · duration · Live Frequency badge · historical-role
                        hint · difficulty-gated spectrum preview
  ShowReport.tsx        report screen (RadarChart overlay, badges, highlights)
```

Composes existing pieces throughout: `RadarChart` (dark/outline), Live
Frequency badge styles, `KnowledgeConfidenceBadge`, dark-theme tokens from
DESIGN_SYSTEM.md. Public/game page → dark theme, per UI rules.

---

## 12. UI sketch (mobile-first, per DESIGN_SYSTEM.md)

```
┌──────────────────────────────┐
│  TOOL · The Fillmore   52:10 │  ← band · venue · show clock
│  ████████████░░░ Energy  71  │
│                              │
│  😐casual 🤘hard 🤯deep      │  ← crowd strip: faces animate per pick,
│  🧠prog  🙂new               │     meters underneath each face
│                              │
│  ▁▂▄▅▆▅▄▅▆▇  energy curve    │  ← realized line; ideal arc ghosted (easy/normal)
│                              │
│  NOW: Jambi   (◆ Rare)       │  ← last pick + one-line crowd flavor:
│  "First time since 2019!"    │     grounded in real data
│─────── choose the next song ──────│
│ ┌──────────────────────────┐ │
│ │ The Pot        6:21  ◎Freq│ │  ← candidate card:
│ │ often a closer · ▲agg ▼atm│ │     historical role + Normal-mode arrows
│ ├──────────────────────────┤ │
│ │ Right in Two   8:55  ◈Rare│ │
│ │ deep cut · hunters ready  │ │
│ ├──────────────────────────┤ │
│ │ …two more candidates…     │ │
│ └──────────────────────────┘ │
│  [ setlist so far ▾ ]  [ end set ]
└──────────────────────────────┘
```

Report screen: target-vs-final radar overlay up top (the money shot), nine
scores as stat cards, highlights reel in serif placard voice, grade + stars,
"Run it back" / "Daily Show" / share buttons.

---

## 13. Progression & replayability

- **Venue ladder** — Club → Theatre → Arena → Festival Headline. Grades earn
  reputation stars; stars unlock bigger rooms. Bigger rooms = more casuals +
  tighter pacing demands = genuinely different puzzles, driven entirely by
  the crowd-mix + affinity data venues already carry.
- **Per-band mastery** — every band is effectively a distinct level: its own
  target spectrum, catalog depth, live history richness. A band with deep
  Setlist.fm data plays "true"; mastery badges per band per difficulty.
- **Daily Show** — one seeded band+venue+event-deck for all players; one
  attempt; shared leaderboard. Cheap to build (the seed architecture gives
  it away free) and the single strongest retention hook.
- **Hard mode as knowledge test** — no meters, no arrows; the leaderboard
  splits by difficulty so hard-mode scores carry prestige.
- **v2 candidates (explicitly out of MVP):** Tour mode (3 shows, fatigue
  carries over — reusing `BandRpgTourStop` venue data read-only), a
  "Promoter" economy layer, spectral "weather" mutators.

**Playability gate:** a band needs a minimum bundle (≈15+ songs with
spectrum scores; live data strongly recommended). Below threshold the band
card reads "Not enough analysis to host a show yet" and deep-links admins to
Database Health — the game literally motivates completing the database.

---

## 14. Balancing levers (all tunable, all in one config)

`concertEngine.ts` exposes one `TUNING` object — every constant in one
place: faction weight matrices, energy gain/decay rates, pacing thresholds,
rarity excitement curve, event deck weights, score blend ratios, walkout
thresholds. Balance patches are one-file diffs.

Known starting risks to watch in playtesting:

1. **Dominant strategy risk** — if rarity is over-rewarded, every set
   becomes a bustout parade. Counter: casuals + first-timers are the
   majority weight at most venues; hunters are the *seasoning*.
2. **Missing-data bands** — songs lacking `SongMusicScore` fall back to
   deriving tempo/density proxies from `SongAxisScore` (aggression ≈ energy)
   with an `estimated` badge; lacking `AudienceProfile` falls back to axis
   heuristics. Same fallback philosophy as `liveFrequency.ts` — never
   invent, always label.
3. **Solved openings** — the seeded 4-card deal plus wildcard slot prevents
   a single "correct" opener from dominating; historical opener probability
   *rewards* but never *requires* convention.
4. **Session length creep** — hard cap of 16 main-set picks; the show clock
   is a design constraint, not just flavor.

---

## 15. Suggested build phasing (when implementation is approved)

- **Phase 1 — Engine + one venue + Normal difficulty.** `concertEngine.ts`
  with tests (pure functions — the most testable code in BSM),
  `concertDataService`, `setlistRoleStats`, run/pick/finish routes, minimal
  UI, report screen. No events except Encore. *Playable end-to-end.*
- **Phase 2 — Crowd depth + events.** Full faction UI, event deck, venue
  ladder, Easy/Hard modes.
- **Phase 3 — Meta.** Daily Show, leaderboards, mastery badges, highlights
  sharing (reusing the collection page's existing canvas-export pattern).

---

## 16. Open questions for the owner

1. **Name** — Headliner? Or keep Concert Architect?
2. **Catalog scope** — full band catalog (proposed: it's the band's show),
   or should recovered-collection players get a small familiarity bonus as a
   Band RPG cross-link (light touch, no dependency)?
3. **Guest play** — MVP proposes `requireAuth` for all runs (persistence +
   leaderboard). Allow ephemeral guest runs later?
4. **Where it lives** — `/play/headliner` alongside the other games, plus a
   card on the Games page. Agreed?

---

*Prepared as Phase Z.17.8 (proposal). Zero code changes. All model and
service names verified against the repository as of this writing.*

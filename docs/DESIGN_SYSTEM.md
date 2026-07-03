# DESIGN_SYSTEM.md — Band Spectrum Mapper

This document exists so the app keeps feeling like one product as new pages
get added. It was written during **Phase Z.16.5 (Cohesion)**, a pass focused
entirely on consistency rather than new features — read `docs/CHANGELOG.md`
for what changed and why.

If you're about to build a new player-facing page: read the "Reference
implementation" section, copy its patterns, and don't invent a new one.

---

## Product identity

Band Spectrum Mapper is a **museum, not an app**. The tone across every
player-facing surface should feel like:

- **Archive** — things are catalogued, dated, sourced. Numbers have provenance.
- **Collection** — players build something real over time; recovery matters.
- **Research** — data confidence is always visible (see Knowledge Badges below);
  we never present a guess as a fact.
- **Music appreciation** — the subject (songs, bands, albums) is always the
  star. UI chrome stays quiet so the artifact can be the loud part.

Not corporate, not gamified-cute. No exclamation-point marketing voice, no
mascot, no confetti. Confidence and craft, not hype.

---

## Reference implementation

The Music Wiki / Song Card family is the gold standard other pages should
converge toward:

- `apps/web/src/pages/wiki/WikiSongPage.tsx` — the Song Card (Phase Z.16)
- `apps/web/src/pages/wiki/WikiAlbumPage.tsx`, `WikiBandPage.tsx`
- `apps/web/src/components/wiki/WikiLayout.tsx`
- `apps/web/src/components/wiki/KnowledgeConfidenceBadge.tsx`
- `apps/web/src/components/wiki/WikiModulePlaceholder.tsx`
- `apps/web/src/lib/liveFrequency.ts` — the pattern for "one derived concept,
  one shared util, no page reimplements the mapping"

When in doubt about spacing, card treatment, or copy tone, open
`WikiSongPage.tsx` and match it.

---

## Two themes, deliberately

- **Admin pages** — light theme. `bg-white` / `bg-surface-*` tokens (see
  `tailwind.config.js`'s `surface` scale and `index.css`'s `@layer components`
  — `.btn-primary`, `.card`, `.page-header`, `.badge-*`, `.input`). Wording can
  stay technical. This system already existed before Z.16.5 and is unchanged.
- **Player-facing pages** — dark theme. No shared CSS layer exists yet for
  this side (see "Known gaps" below) — the closest thing to a standard is the
  Wiki family's literal Tailwind classes. Until a formal dark component layer
  exists, match those classes directly rather than inventing new ones.

Never mix the two within a page. Never use `surface-*` tokens on a
player-facing dark page or raw `gray-9xx` grays on an admin page.

---

## Dark-theme tokens (player-facing)

| Purpose | Value | Notes |
|---|---|---|
| Page background | `bg-[#070a0f]` | Wiki's canonical dark. `bg-gray-950` (`#030712`) is used on most other player pages and is visually almost identical — not worth a mass find-replace, but **use `bg-[#070a0f]` for all new pages.** |
| Card background | `bg-gray-900/70` | Wiki standard. Older pages use inconsistent opacities (`/30`, `/50`, `/60`, solid) — leave existing instances, use `/70` going forward. |
| Card border | `border-[#1a2332]` | Wiki standard, a hair warmer than plain `border-gray-800`. |
| Card radius | `rounded-xl` | The dominant radius across the app; a few older pages use `rounded-lg` or `rounded-2xl` — not worth chasing down individually, but new cards should be `rounded-xl`. |
| Section header | `text-sm font-bold text-gray-300 uppercase tracking-widest` + a `flex-1 h-px bg-[#1a2332]` divider line | See `WikiSongPage.tsx`'s `Section()` helper. |
| Narrative/story copy | `font-family: Georgia, "Times New Roman", serif` | Reserved for curated, sentence-level narrative text (Song Story, provenance descriptions) — never for UI labels, numbers, or buttons. Using serif everywhere would dilute it; it should read as a deliberate shift in register. |
| Stat numbers | `tabular-nums` | Always, anywhere numbers appear in a grid or list — prevents digit jitter. |
| Focus ring | site-wide `:focus-visible` outline (`index.css`, `@layer base`) | Automatic — you don't need to add anything for basic keyboard focus visibility. Components with a tight visual fit (pills, icon buttons) may still add their own `focus-visible:ring-*` for a closer ring. |

---

## Terminology (player-facing vocabulary)

One verb per action. This was the single biggest source of "different teams
built this" friction found in the Z.16.5 audit — three different pages used
three different words for the identical action of adding a song to your
archive.

| Concept | Canonical word | Notes |
|---|---|---|
| Adding a song to your archive via Band RPG | **Recover** / **Recovered** | The verb. Applies to songs, fragments, and vinyl. `BandRpgCollectedSong` stays as the DB/API name — internal names don't need to match player copy. |
| The resulting set of recovered songs | **Collection** | The noun. "Your Collection", "Build your collection" — fine to keep alongside "Recover" as the verb. Don't say "collect songs" as a verb for the core loop. |
| Finding new bands, albums, community content | **Discover** | A genuinely different action from Recover — browsing/encountering something that exists, not the archive-building mechanic. Keep separate; do not merge into Recover. |
| Progression gates (badges, levels, adventures) | **Unlock** | Reserved for permission/gating language ("unlocks new adventures"), not for the song-archive action. |
| Vinyl Runner (Platformer mini-game) collectibles | **Collect** | This is a different, literal arcade mechanic (grabbing glowing records mid-run) in a different game. It is fine for it to say "collect" — don't force Band RPG's vocabulary onto an unrelated minigame. |
| Live-performance rarity | **Live Frequency** (Essential / Frequent / Occasional / Rare / Legendary / Mythic) | Established in Phase Z.15d. `Song.rarity` is the internal/fallback field; never shown to players as a separate concept from Live Frequency. See `apps/web/src/lib/liveFrequency.ts`. |

If you're writing new player-facing copy for the Band RPG → Wiki loop, ask:
"is this the archive action, or something else?" If it's the archive action,
say Recover.

---

## Knowledge Confidence Badges

Every piece of derived or uncertain data should carry a confidence badge so
players never mistake an estimate for a fact.

`apps/web/src/components/wiki/KnowledgeConfidenceBadge.tsx` — five levels:

| Level | Meaning |
|---|---|
| 🟢 Verified | Official/primary source (label, artist) |
| 🔵 Calculated | Computed by BSM from real data (e.g. Setlist.fm performance counts) |
| 🟣 Community | Contributed by players, reviewed but not independently confirmed |
| 🟠 AI | Generated by AI analysis — treat with healthy skepticism |
| ⚪ Estimated | Inferred until better data arrives, not confirmed by a primary source |

As of Z.16.5 the badge is **tappable** — it opens a small popover explaining
what the level means, since `title` tooltips don't exist on touch devices and
mobile is the primary target for player-facing pages. Use this component
anywhere a number or claim on a dark-theme page needs a confidence label;
don't invent a new badge style.

---

## Empty states

Every empty state should answer: why is it empty, what will appear, how do I
change that. A blank box or a bare "No data" reads as broken.

- **Standalone tile / reserved wall space** (a whole module has no data yet):
  `apps/web/src/components/wiki/WikiModulePlaceholder.tsx`. Icon well, faint
  corner glow, optional "In preparation" tag. Used across the Song Card's
  future-module registry.
- **Row inside an existing list/card** (a specific list has no entries, but
  the surrounding card/page has other content): the new
  `apps/web/src/components/ui/DarkEmptyRow.tsx`, added in Z.16.5 and applied
  to `LeaderboardPage.tsx`'s five leaderboard tabs. Message + optional CTA link.
- **Loading, same context**:
  `apps/web/src/components/ui/DarkLoadingRow.tsx` — small spinner + label,
  replaces plain "Loading…" text.

Use `DarkEmptyRow`/`DarkLoadingRow` for compact in-card states; use
`WikiModulePlaceholder` when the empty thing is itself a whole visual module
on the page (a full section, not a row inside a list).

---

## Motion

Calm, not flashy. Every animation in the reference implementation
(`WikiSongPage.tsx`) is:

- Short (300–700ms)
- Used for arrival, not attention-seeking (artwork fade-in, section stagger,
  progress-bar fill) — never a bounce, shake, or repeating loop on static content
- Fully disabled under `prefers-reduced-motion: reduce` — check every new
  `@keyframes` block or `animate-*` utility against this; see the `RiseStyles()`
  helper in `WikiSongPage.tsx` and the `motion-reduce:` variants on
  `DarkLoadingRow` for the pattern

If an animation doesn't clearly serve legibility or the museum-arrival feeling,
cut it.

---

## Navigation

Every page should answer "where am I, where did I come from, where can I go
next" without the player having to think about it.

- `apps/web/src/components/layout/SiteHeader.tsx` is the canonical top nav
  for all player-facing pages. Always pass the correct `active` value —
  Z.16.5 fixed a real bug where `CommunityPage` passed `active="games"`
  (the `'community'` value didn't even exist in the type union, so it
  silently failed to highlight anything). If you add a new player-facing
  route, add it to `SiteHeader`'s `NAV` array — `/community` existed as a
  fully-built page with zero nav entry point before this phase; don't let
  that happen again.
- `apps/web/src/components/wiki/WikiLayout.tsx`'s `WikiBreadcrumb` is the
  breadcrumb pattern for hierarchical content (Band → Album → Song). Reuse
  it for any new hierarchical page rather than hand-rolling a new one.
- `CinemaPage.tsx` currently has no `SiteHeader` at all — this is a known,
  deliberate-looking gap for an immersive fullscreen page, left alone in this
  phase (see "Known gaps" — it's high risk to touch without live QA in a
  WebGL scene).

---

## Icons

**Emoji is the established icon language across the entire player-facing
app** — every audited page (Landing, Discover, Games, Leaderboard, Community,
Band RPG, Wiki placeholders) uses emoji glyphs, not an SVG icon library. This
is already consistent; don't introduce a second icon system. The one
inconsistency found was `ExplorePage.tsx`, which uses bare Unicode glyphs
(✕ ▲ ▼ ✦) instead of emoji in a few spots — low priority, noted below as
deferred debt.

---

## Buttons

There is currently no shared dark-theme button component — every
player-facing page hardcodes its own color/radius/padding combination. This
audit found 4–6 distinct button treatments *per page* in several files
(`GamesPage.tsx`, `LeaderboardPage.tsx`, `CommunityPage.tsx`). Building a
proper `<Button>` component is real work and was deliberately **not** done in
this phase — see "Deferred to a future phase" — because retrofitting it
everywhere is exactly the "large rewrite" this phase was told to avoid.

Until that component exists, when writing a new button:
- `rounded-lg` for standard CTAs, `rounded-xl` only for larger tap-target
  buttons (mobile-first primary actions)
- `transition-colors` always
- A single accent color per page context (don't invent a 5th color if the
  page already has 4)

---

## What changed in Phase Z.16.5

See `docs/CHANGELOG.md` for the full entry. Summary: fixed the `SiteHeader`
`active` type + `CommunityPage` bug, added `/community` to the main nav,
normalized Recover/Collect/Catalog/Acquire language across
`BandRpgGame.tsx`, `BandRpgCollectionPage.tsx`, `CommunityPage.tsx`, and
`OnboardingModal.tsx`, added `DarkLoadingRow`/`DarkEmptyRow` and applied them
to all five `LeaderboardPage` tabs, added a site-wide `:focus-visible` outline,
and wrote this document.

---

## Known gaps — deferred to a future phase

Documented honestly rather than silently left inconsistent. None of these
were touched in Z.16.5 because fixing them properly requires either a real
component-extraction effort (against this phase's "no large rewrites" charter)
or live visual QA this session can't perform safely:

1. **No shared dark-theme `<Button>`, `<Card>`, or `<SectionHeader>`
   components exist.** Every player-facing page hand-rolls its own button
   colors and card treatment. This is the single biggest remaining source of
   "feels like different pages" — worth a dedicated phase once Song Spectrum
   (Z.17) stabilizes, so the new component gets designed against a settled
   feature set rather than a moving one.
2. **`CinemaPage.tsx` is 6,655 lines in one file** with no `SiteHeader`, no
   page-level heading, and highly inconsistent per-panel card styling
   (5+ background-opacity variants, 4+ border-color families, no shared
   radius). It needs decomposition into per-panel components before a design
   pass can safely touch it — doing so blind, without the ability to visually
   verify a WebGL/3D scene in this environment, risks real breakage.
3. **`ExplorePage.tsx` is 1,888 lines**, uses the smallest radius in the app
   (`rounded` / 4px vs. the rest of the app's `rounded-lg`/`rounded-xl`), has
   a "double header" (SiteHeader + a bespoke sub-header bar not used
   elsewhere), and uses bare Unicode glyphs instead of emoji in a few spots.
   Lower urgency than Cinema since it's internally consistent, just
   divergent from the rest of the app.
4. **Card background-opacity drift** on `CommunityPage.tsx` (`/30`, `/50`,
   `/60`, and solid `gray-900` all appear as "the card treatment" in one
   file) and similar drift on `GamesPage.tsx`/`BandRpgPage.tsx`. Left as-is
   this phase — fixing it page-by-page without a shared `<Card>` component
   would just be swapping one hardcoded value for another, not a structural
   improvement.
5. **`LandingPage.tsx` doesn't use `SiteHeader`** — it has its own bespoke
   light-theme header, which is the one page in the entire player-facing app
   that isn't dark-theme-first. This may be intentional (a marketing landing
   page rendering before login), but it's worth a deliberate decision in a
   future phase rather than a silent carry-over.
6. **A full accessibility audit** (contrast ratios, ARIA labels on icon-only
   buttons, touch target sizing, screen-reader pass) was not performed across
   all 80+ pages — this phase added a site-wide `:focus-visible` baseline and
   tap-friendly popovers on `KnowledgeConfidenceBadge`, but a proper pass
   needs its own phase with real assistive-tech testing, not a text-only audit.
7. **Bundle size**: the web build's main JS chunk is ~7.2 MB (1.49 MB
   gzipped) with no code-splitting. Not a Z.16.5 scope item (it's a
   performance/build concern, not a cohesion one) but worth flagging —
   `apps/web/vite.config.ts` has no `manualChunks` configuration.

None of the above block Phase Z.17 (Song Spectrum). They're listed so the
next contributor doesn't have to rediscover them from scratch.

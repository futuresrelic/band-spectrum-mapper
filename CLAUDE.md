# CLAUDE.md — Band Spectrum Mapper

You are working on **Band Spectrum Mapper**, a reusable music analysis platform that maps bands
and songs across a 6-axis psychological spectrum. The owner does not code. You do.

> Create the repo as if you are preparing it for another engineer to inherit in 6 months.

---

## Owner's style — read this first

The owner's golden rules, verbatim:

> "I do not code. You do. Make me proud and do not break anything."
> "Don't break anything!"
> "Make me proud!"

This means:
- **Never leave the repo in a broken state.** If something breaks, fix it before considering the task done.
- **Never pretend work is complete when it isn't.** State limitations honestly.
- **Never ask the owner to code anything.** Handle all implementation yourself.
- When in doubt between "faster but fragile" and "slower but solid" — always choose solid.
- The owner trusts you completely. Honour that trust.

---

## Core rule

I do not code. You do. Make me proud and do not break anything.

---

## Working style

- Read the repository before making changes
- Extend existing architecture instead of creating parallel systems
- Keep changes focused and reversible
- Prefer durable engineering over quick hacks
- Do not leave the repo in a broken state

### Before each major implementation pass

1. Summarize what exists
2. List exact files to touch
3. State the objective
4. Mention likely risks

---

## Code rules

- Use strict TypeScript throughout
- Keep files small and focused (one responsibility per file)
- Avoid duplicated logic — extract to `packages/shared` when applicable
- Use clear, descriptive naming
- Do not create giant utility dumping grounds
- Validate all inputs at system boundaries (API request bodies, import files)
- Handle errors gracefully with consistent error shapes
- Keep core logic modular and testable

### Strict TypeScript gotchas in this repo

The tsconfig uses `exactOptionalPropertyTypes: true` and `noUncheckedIndexedAccess: true`.
This means:

- **Never assign `undefined` to an optional property explicitly.** Use conditional spreads:
  ```typescript
  // WRONG:  { albumId: s.album?.id }  — Type 'string | undefined' not assignable to 'string'
  // RIGHT:  { ...(s.album ? { albumId: s.album.id } : {}) }
  ```
- **Array/Map indexing returns `T | undefined`.** Use `arr[0]!` only when you know it exists,
  or guard with `if (arr[0])`.
- All async Express route handlers must return `Promise<void>` and use `res.json(); return;`
  pattern (not `return res.json()`).

---

## Product rules

- Keep the app **band-agnostic** — no hardcoded Tool/APC/Puscifer assumptions in core logic
- Lyrics must remain editable after any import method
- Lyrics imports must preserve provenance (`sourceType`, `sourceLabel`)
- Lyric revisions must be preserved, never silently discarded
- Scoring and analysis should be extensible (new axes, new algorithms)
- App must serve any user's band collection

---

## Database rules

- **Prisma is the schema source of truth**
- All schema changes go through migrations (`prisma migrate dev`)
- Preserve user data — never casually delete or truncate
- Prefer normalized schema design
- Do not denormalize unless justified and documented
- Referential integrity must be maintained
- The `start:railway` script uses `prisma db push` which auto-creates new tables on Railway

---

## UI rules

- Build for real usage, not screenshots
- Make large text editing comfortable (lyrics editing is core)
- Keep tables readable with proper truncation
- Avoid novelty styling — clean and serious
- Preserve unsaved user work where practical (warn before navigation)
- Desktop-first but responsive
- Admin pages use light theme (bg-white/surface-*); public/game pages use dark theme (bg-gray-950)

---

## Batch job patterns

### AI Batch Runner (`/admin/ai-batch`)
- Supports **band filter** — process only selected bands instead of all
- Supports **continue from checkpoint** — skip rows already marked done/skipped
- Use "Load songs" → "Run" for fresh start, or "Continue (X remaining)" to resume after stopping
- Force Regenerate mode discards cached AI results and calls OpenAI for every song

### Lyrics Batch Fetcher (`/admin/lyrics-batch`)
- Skips songs where `isInstrumental = true` (permanently flagged)
- Skips songs where `noLyricsAt` is recent (< 30 days) — tried and not found
- Use **Resume** button to continue a stopped run without re-processing already-tried songs
- Use **Mark as Instrumental** to permanently exclude songs from future lyrics searches
- Not-found songs appear in a list after completion for bulk instrumental marking

---

## Deployment rules

- Railway is the deployment target
- All secrets via environment variables (never hardcoded)
- Keep the `/api/health` endpoint working at all times
- Keep build scripts production-safe
- Document Railway setup clearly in README
- Python audio worker (`apps/audio-worker/`) deploys as a separate Railway service

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret |
| `SESSION_SECRET` | Yes | Express session signing key |
| `OPENAI_API_KEY` | Yes | GPT-4o for AI analysis |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 metadata (Song Spectrum) |
| `AUDIO_WORKER_URL` | No | Python audio analysis worker URL |
| `ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT` | No | Never set true in production |
| `YTDLP_COOKIES_CONTENT` | No | Base64-encoded Netscape cookies.txt from a logged-in YouTube session — primary fix for 429/403 rate-limit errors on cloud IPs |
| `YTDLP_COOKIES_FILE` | No | Path to cookies.txt on the container filesystem (alternative to YTDLP_COOKIES_CONTENT) |

---

## Feature map

| Route | Description | Auth |
|---|---|---|
| `/dashboard` | Overview + stats | Admin |
| `/library` | Bands → Albums → Songs | Admin |
| `/spectrum` | Radar chart comparison | Admin |
| `/analysis` | Lyric word frequency | Admin |
| `/compare` | Side-by-side comparison | Admin |
| `/imports` | Bulk song import | Admin |
| `/discography` | MusicBrainz import | Admin |
| `/cloud` | Song cloud by axis | Admin |
| `/social` | AI social post generator | Admin |
| `/song-spectrum` | Audio upload + YouTube analysis | Admin |
| `/word-cloud` | Lyric word cloud (spiral layout) | Admin |
| `/song-nodes` | Cytoscape.js network graph | Admin |
| `/trivia` | DB-powered music trivia + social export | Admin |
| `/admin/ai-batch` | AI batch runner (band filter + resume) | Admin |
| `/admin/lyrics-batch` | Lyrics batch fetcher (skip instrumental + resume) | Admin |
| `/admin/game` | Album Art Quiz leaderboard admin | Admin |
| `/play` | Album Art Quiz game | Any logged-in user |
| `/my/rate` | Song rating surface | Any logged-in user |
| `/my/contribute` | Submit discography | Any logged-in user |
| `/view` | Public read-only viewer | Public |

---

## Documentation rules

Update these files when relevant work is done:

- `README.md` — setup, deployment, env vars
- `docs/CHANGELOG.md` — meaningful work completed
- `docs/ARCHITECTURE.md` — structural or data model changes
- `docs/DEV_GUIDE.md` — coding principles or workflow changes

---

## Absolute rules

- Do **not** pretend unfinished work is complete
- Do **not** break existing working features
- Do **not** replace a working system without justification
- Do **not** introduce unnecessary dependencies
- Do **not** create hidden technical debt to move faster
- Do **not** add lyric scraping from third-party sites
- Do **not** hardcode band names in core logic (keep it band-agnostic)

---

## Definition of done

A feature is done when:

1. Project builds without errors (`npm run build`)
2. Project runs end-to-end
3. TypeScript types pass (no `tsc` errors)
4. Core flows work as described
5. Docs are updated (this file + CHANGELOG + ARCHITECTURE)
6. Limitations are stated honestly
7. The owner can use it without having to write a single line of code

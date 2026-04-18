# CLAUDE.md — Band Spectrum Mapper

You are working on **Band Spectrum Mapper**, a reusable music analysis platform.

> Create the repo as if you are preparing it for another engineer to inherit in 6 months.

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

---

## UI rules

- Build for real usage, not screenshots
- Make large text editing comfortable (lyrics editing is core)
- Keep tables readable with proper truncation
- Avoid novelty styling — clean and serious
- Preserve unsaved user work where practical (warn before navigation)
- Desktop-first but responsive

---

## Deployment rules

- Railway is the deployment target
- All secrets via environment variables (never hardcoded)
- Keep the `/api/health` endpoint working at all times
- Keep build scripts production-safe
- Document Railway setup clearly in README

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

---

## Definition of done

A feature is done when:

1. Project builds without errors
2. Project runs end-to-end
3. TypeScript types pass
4. Core flows work as described
5. Docs are updated
6. Limitations are stated honestly

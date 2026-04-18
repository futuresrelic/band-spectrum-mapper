# Band Spectrum Mapper — Development Guide

## Purpose

Band Spectrum Mapper is a reusable music analysis app for storing and comparing bands, albums, songs, lyrics, and style-spectrum scoring. It must support personal use first and broader multi-band analysis later.

---

## Principles

1. Build real features — no fragile demos or fake placeholders
2. Prefer clarity over cleverness
3. Keep business logic separate from UI and route definitions
4. Keep the schema normalized
5. Preserve user data at all costs
6. Make imports traceable and recoverable
7. Keep lyrics editable and versioned
8. Build for another engineer to inherit in 6 months

---

## Project Structure

```
band-spectrum-mapper/
├── apps/
│   ├── api/          # Express + TypeScript backend
│   └── web/          # React + TypeScript + Tailwind frontend
├── packages/
│   └── shared/       # Shared types, Zod schemas, constants, helpers
├── prisma/
│   ├── schema.prisma # Single source of truth for DB schema
│   ├── migrations/   # All schema migrations
│   └── seed.ts       # Seed data script
├── docs/             # Architecture, dev guide, changelog
├── CLAUDE.md         # Persistent AI engineering rules
└── README.md         # Setup and deployment docs
```

---

## Data Ownership

- **Bands** conceptually own albums and songs
- **Songs** may exist without albums (singles, unreleased)
- **Lyrics** are separate from songs so they can be edited, versioned, imported, and switched
- **Song axis scores** are separate so scoring can evolve without changing song records

---

## Editing Rules

When changing existing code:

1. Read the surrounding code and interfaces first
2. Preserve existing interfaces unless intentionally refactoring
3. Update all affected call sites before committing
4. Avoid creating duplicate abstractions for the same concept

---

## Database Rules

- Prisma is the schema source of truth — never edit the DB directly
- All schema changes go through `prisma migrate dev --name <descriptive-name>`
- Avoid denormalized shortcuts unless justified in a comment
- Preserve referential integrity — use Prisma's `onDelete` carefully
- Never truncate or casually drop user data in migrations

---

## API Rules

- Validate all request bodies with Zod schemas from `packages/shared`
- Use consistent error shapes: `{ error: string; details?: unknown }`
- Isolate responsibilities: routes → controllers → services → Prisma
- Keep business logic out of route definitions
- Services should be testable in isolation
- All IDs are `cuid` strings (Prisma default)

### Route structure

```
GET    /api/bands
POST   /api/bands
GET    /api/bands/:id
PATCH  /api/bands/:id
DELETE /api/bands/:id

GET    /api/bands/:bandId/albums
POST   /api/bands/:bandId/albums
...etc
```

---

## Frontend Rules

- Organize by feature where sensible (pages map 1:1 to app features)
- Keep page files readable — extract sub-components when a page exceeds ~200 lines
- Extract reusable chart components into `src/components/charts/`
- Extract reusable form components into `src/components/forms/`
- Use controlled forms for all important data (lyrics, scores)
- Warn users before navigating away from unsaved changes
- Use React Query (TanStack Query) for all server state

---

## Analysis Rules

- Analysis must work for any band — no hardcoded assumptions
- Stopword handling must be configurable via the Settings page
- Imported lyric text must become editable `lyrics` records immediately
- Charts must reflect stored data accurately — no fake or approximated values
- Term frequency counts must be based on normalized, tokenized text

---

## Import Rules

- Imports must be traceable via the `imports` table (`filename`, `mimeType`, `status`)
- Malformed imports must fail gracefully with row-level error reporting
- Partial success is acceptable — report which rows failed and why
- Imported content must be fixable in the UI after import
- Supported formats: `.txt`, `.md`, `.csv`, `.json`
- No lyric scraping from third-party sites — ever

---

## Deployment Rules

- Railway is the deployment target for both API and web
- Use environment variables for all secrets and config
- Keep the `/api/health` endpoint returning `200 OK` at all times
- Build scripts must be safe to run in production
- Document all required env vars in `.env.example` files

---

## Documentation Rules

Update the following when work is meaningful:

| File | When to update |
|------|---------------|
| `README.md` | Setup steps, env vars, deployment changes |
| `docs/CHANGELOG.md` | Any feature addition, fix, or notable change |
| `docs/ARCHITECTURE.md` | Schema changes, new services, structural decisions |
| `docs/DEV_GUIDE.md` | New coding rules, workflow changes |

---

## What Not To Do

- Do not hardcode band-specific assumptions into core systems
- Do not add lyric scraping from external sites
- Do not create giant utility files (`utils.ts` with 50 functions)
- Do not bury TODOs in random comments — document them in CHANGELOG under Known Limitations
- Do not mark unbuilt features as done in docs or UI
- Do not introduce a new dependency without checking if existing deps cover the need

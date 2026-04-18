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

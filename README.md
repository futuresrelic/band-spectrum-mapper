# Band Spectrum Mapper

A production-minded web application for managing bands, albums, songs, and lyrics — with style-spectrum scoring, lyrics analysis, word clouds, and band comparison tools.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL (Railway) |
| ORM | Prisma |
| Charts | Recharts |
| Word Cloud | react-wordcloud |
| Validation | Zod |
| Monorepo | npm workspaces |
| Deployment | Railway |

---

## Project Structure

```
band-spectrum-mapper/
├── apps/
│   ├── api/          # Express REST API
│   └── web/          # React SPA
├── packages/
│   └── shared/       # Shared types + Zod schemas
├── prisma/           # Schema, migrations, seed
├── docs/             # Architecture, dev guide, changelog
├── CLAUDE.md         # AI engineering rules
└── railway.json      # Railway deployment config
```

---

## Local Setup

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- PostgreSQL running locally (or use Railway's dev environment)

### 1. Clone and install

```bash
git clone https://github.com/futuresrelic/band-spectrum-mapper.git
cd band-spectrum-mapper
npm install
```

### 2. Configure environment variables

```bash
# Root
cp .env.example .env

# API
cp apps/api/.env.example apps/api/.env

# Frontend
cp apps/web/.env.example apps/web/.env
```

Edit each `.env` file with your local values.

### 3. Set up the database

```bash
# Run migrations
npx prisma migrate dev --schema=prisma/schema.prisma

# Seed starter data
npx prisma db seed --schema=prisma/schema.prisma
```

### 4. Run in development

```bash
npm run dev
```

- API: http://localhost:3001
- Frontend: http://localhost:3000
- API health: http://localhost:3001/api/health

---

## Environment Variables

### apps/api/.env

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `PORT` | API listen port (default: 3001) | No |
| `NODE_ENV` | `development` or `production` | Yes |
| `OPENAI_API_KEY` | OpenAI key for AI analysis features | For AI features |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | For auth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | For auth |
| `SESSION_SECRET` | Express session signing key — use a long random string | Yes |
| `AUDIO_WORKER_URL` | URL of Python audio worker (e.g. `http://localhost:8001`) | For Song Spectrum Analyzer |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key — metadata import only | For YouTube metadata fetch |
| `SETLISTFM_API_KEY` | setlist.fm API key — enables Concert Setlist → Cinema Tour feature | For Cinema setlists |
| `ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT` | Set `true` to allow yt-dlp audio download (dev only) | Never in production |

### apps/web/.env

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | API base URL | Yes |

---

## Prisma Commands

```bash
# Generate client after schema changes
npx prisma generate --schema=prisma/schema.prisma

# Create a new migration
npx prisma migrate dev --name <name> --schema=prisma/schema.prisma

# Apply migrations in production
npx prisma migrate deploy --schema=prisma/schema.prisma

# Open Prisma Studio
npm run db:studio

# Run seed
npm run db:seed
```

---

## Railway Deployment

### Initial setup

1. Create a new Railway project
2. Add a **PostgreSQL** service — Railway auto-injects `DATABASE_URL`
3. Add an **API** service pointing to this repo
   - Build command: `npm run build --workspace=apps/api`
   - Start command: `npm run start --workspace=apps/api`
   - Set env vars: `NODE_ENV=production`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
4. (Optional) Add an **Audio Worker** service pointing to `apps/audio-worker/`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Copy the internal Railway URL into the API service's `AUDIO_WORKER_URL` env var
   - See `apps/audio-worker/README.md` for full setup instructions
4. Add a **Web** service pointing to this repo
   - Build command: `npm run build --workspace=apps/web`
   - Set env var: `VITE_API_URL=<your-api-railway-url>`
   - Serve `apps/web/dist/` as static files

### First deploy

After services are running, run migrations:

```bash
# From Railway CLI or terminal in API service
npx prisma migrate deploy --schema=prisma/schema.prisma
npx prisma db seed --schema=prisma/schema.prisma
```

---

## Feature List

### Library & Scoring
- [x] Band, album, song library with full CRUD
- [x] Browse hierarchy (band → album → song) — publicly accessible, no login needed
- [x] Lyrics management: manual entry, paste, file import (.txt, .md, .csv, .json)
- [x] Lyrics revision history with ability to review previous versions
- [x] Song spectrum scoring across 6 axes (Aggression, Complexity, Atmosphere, Emotion, Psychedelic, Concept)
- [x] Three score layers: Core (admin), Community (user average), AI (GPT-generated)
- [x] Radar chart per song showing all three layers simultaneously
- [x] User song ratings — any signed-in user can rate songs

### AI Analysis
- [x] Three-layer AI per song: Lyric Analysis, Song Research, Deep Synthesis
- [x] Wikipedia-sourced research: song, album, and artist pages summarised
- [x] Deep synthesis: Title Significance, Historical Context, Lyrical Interpretation, Thematic Synthesis, Overall Narrative
- [x] AI genre accessibility scoring (Metal, Rock, Pop, Hip-Hop, Electronic, Folk)
- [x] AI thematic scores across 16 philosophical dimensions
- [x] Context analysis (gpt-4o): draws on training knowledge, artist interviews, and documented interpretations
- [x] Community tag proposals: AI tags enriched by context analysis; users can propose tags, +2 votes promotes to official

### Visualization
- [x] Explore Graph (Cytoscape.js 2D + Three.js 3D): Artist Universe, Album Cluster, Tag Constellation, Emotional Similarity, Lyrical DNA, and more
- [x] Cinema Mode: cinematic 3D autoplay showcase with 16+ scenes, Social Mode, Director Mode, AI Director, progressive lyrics, Lyrics Universe
- [x] Spectrum Studio: 12 chart types across 31 data fields
- [x] Word cloud (lyric frequency + AI theme weighting)
- [x] Song Nodes admin view

### Community & Games
- [x] Comment sections with AI integration (AI reads discussion when regenerating analysis)
- [x] Community tag proposals with voting — auto-promotes to official at +2 net votes
- [x] Album Art Quiz game with leaderboard
- [x] Word Hunt game with leaderboard
- [x] 3D Graph Hunt game
- [x] Standalone leaderboard page
- [x] User contributions (submit discographies for admin review)

### Admin & Operations
- [x] AI Batch Runner: band filter, resume from checkpoint, 7 job types
- [x] Lyrics Batch Fetcher: skip instrumentals, resume, not-found tracking
- [x] MusicBrainz discography import
- [x] Social Post Generator + Social Media Planner
- [x] Song Spectrum Analyzer (Python audio worker, optional)
- [x] Import tracking with status and row-level error reporting
- [x] Health check endpoint

---

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEV_GUIDE.md)
- [Changelog](docs/CHANGELOG.md)

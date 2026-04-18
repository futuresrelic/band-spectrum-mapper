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
   - Set env vars: `NODE_ENV=production`
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

## MVP Feature List

- [x] Band, album, song library with full CRUD
- [x] Searchable library with browse hierarchy (band → album → song)
- [x] Lyrics management: manual entry, paste, file import (.txt, .md, .csv, .json)
- [x] Lyrics revision history with ability to review previous versions
- [x] Song spectrum scoring across 6 axes (Aggression, Complexity, Atmosphere, Emotion, Psychedelic, Concept)
- [x] Radar chart per song
- [x] Axis score averages by band and album
- [x] Lyrics analysis: normalization, tokenization, stopword removal, term frequency
- [x] Word cloud visualization
- [x] Comparison view (band vs band, album vs album, custom selections)
- [x] Import tracking with status and row-level error reporting
- [x] Custom stopwords management
- [x] Health check endpoint

---

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEV_GUIDE.md)
- [Changelog](docs/CHANGELOG.md)

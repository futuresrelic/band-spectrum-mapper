# Changelog

All meaningful changes to Band Spectrum Mapper are documented here.

---

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

## Known Limitations (Initial Build)

- Authentication/authorization not implemented (single-user local deployment)
- NLP features are basic (unigram frequency; bigrams optional future work)
- Export polish may come after core flows are stable
- Word cloud library requires client-side rendering
- Railway deployment requires manual PostgreSQL provisioning on first setup

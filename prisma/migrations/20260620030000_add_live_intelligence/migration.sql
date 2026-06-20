-- Phase V: Real World Intelligence
-- Extends BandRpgSongProfile with live performance data fields.
-- Adds BandLiveDataCache for per-band Setlist.fm fetch state.

ALTER TABLE "band_rpg_song_profiles"
  ADD COLUMN "totalPerformances"     INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN "performancePct"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "firstPerformanceDate"  TIMESTAMP(3),
  ADD COLUMN "lastPerformanceDate"   TIMESTAMP(3),
  ADD COLUMN "yearsSincePlayed"      DOUBLE PRECISION,
  ADD COLUMN "distinctYears"         INTEGER          NOT NULL DEFAULT 0,
  ADD COLUMN "rarityIndex"           DOUBLE PRECISION NOT NULL DEFAULT 50,
  ADD COLUMN "liveStatus"            TEXT             NOT NULL DEFAULT 'Unknown',
  ADD COLUMN "liveValue"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "lastLiveDataFetchedAt" TIMESTAMP(3);

CREATE TABLE "band_live_data_caches" (
  "id"              TEXT             NOT NULL,
  "bandId"          TEXT             NOT NULL,
  "setlistFmMbid"   TEXT,
  "setlistFmName"   TEXT,
  "totalShows"      INTEGER          NOT NULL DEFAULT 0,
  "fetchedShows"    INTEGER          NOT NULL DEFAULT 0,
  "lastFetchedAt"   TIMESTAMP(3),
  "fetchStatus"     TEXT             NOT NULL DEFAULT 'never',
  "errorMessage"    TEXT,
  CONSTRAINT "band_live_data_caches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "band_live_data_caches_bandId_key"
  ON "band_live_data_caches"("bandId");

ALTER TABLE "band_live_data_caches"
  ADD CONSTRAINT "band_live_data_caches_bandId_fkey"
  FOREIGN KEY ("bandId") REFERENCES "bands"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase Z.17.9: Headliner — player-owned concert-building game.
-- Deliberately standalone: no FK to any Band RPG progression table, only to
-- the pre-existing Band/User/BandRpgVenue tables it reads for show data.

CREATE TABLE "headliner_concert_runs" (
    "id"           TEXT             NOT NULL,
    "userId"       TEXT             NOT NULL,
    "mode"         TEXT             NOT NULL,
    "bandId"       TEXT             NOT NULL,
    "venueId"      TEXT,
    "difficulty"   TEXT             NOT NULL DEFAULT 'normal',
    "seed"         TEXT             NOT NULL,
    "status"       TEXT             NOT NULL DEFAULT 'in_progress',
    "picksJson"    JSONB            NOT NULL DEFAULT '[]',
    "stateJson"    JSONB            NOT NULL,
    "reportJson"   JSONB,
    "overallScore" DOUBLE PRECISION,
    "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "headliner_concert_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "headliner_concert_runs_userId_idx" ON "headliner_concert_runs"("userId");
CREATE INDEX "headliner_concert_runs_bandId_overallScore_idx" ON "headliner_concert_runs"("bandId", "overallScore");

ALTER TABLE "headliner_concert_runs"
  ADD CONSTRAINT "headliner_concert_runs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "headliner_concert_runs"
  ADD CONSTRAINT "headliner_concert_runs_bandId_fkey"
  FOREIGN KEY ("bandId") REFERENCES "bands"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "headliner_concert_runs"
  ADD CONSTRAINT "headliner_concert_runs_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "band_rpg_venues"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

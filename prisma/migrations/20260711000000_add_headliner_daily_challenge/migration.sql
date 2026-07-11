-- Phase Z.17.11: Headliner Daily Challenge — one shared, frozen concert
-- puzzle per UTC calendar date, plus engine/mode-attribution columns on
-- the existing headliner_concert_runs table.

ALTER TABLE "headliner_concert_runs" ADD COLUMN "dailyChallengeId" TEXT;
ALTER TABLE "headliner_concert_runs" ADD COLUMN "engineVersion" TEXT NOT NULL DEFAULT 'HEADLINER_ENGINE_V1';

CREATE TABLE "headliner_daily_challenges" (
    "id"                 TEXT         NOT NULL,
    "challengeDate"      TEXT         NOT NULL,
    "version"            INTEGER      NOT NULL DEFAULT 1,
    "seed"               TEXT         NOT NULL,
    "bandId"             TEXT         NOT NULL,
    "bandName"           TEXT         NOT NULL,
    "venueId"            TEXT,
    "contextKey"         TEXT         NOT NULL,
    "difficulty"         TEXT         NOT NULL DEFAULT 'normal',
    "engineVersion"      TEXT         NOT NULL,
    "bundleSnapshotJson" JSONB        NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "headliner_daily_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "headliner_daily_challenges_challengeDate_version_key"
  ON "headliner_daily_challenges"("challengeDate", "version");

ALTER TABLE "headliner_daily_challenges"
  ADD CONSTRAINT "headliner_daily_challenges_bandId_fkey"
  FOREIGN KEY ("bandId") REFERENCES "bands"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "headliner_daily_challenges"
  ADD CONSTRAINT "headliner_daily_challenges_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "band_rpg_venues"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "headliner_concert_runs"
  ADD CONSTRAINT "headliner_concert_runs_dailyChallengeId_fkey"
  FOREIGN KEY ("dailyChallengeId") REFERENCES "headliner_daily_challenges"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "headliner_concert_runs_dailyChallengeId_idx" ON "headliner_concert_runs"("dailyChallengeId");

CREATE TABLE "headliner_daily_results" (
    "id"              TEXT             NOT NULL,
    "challengeId"     TEXT             NOT NULL,
    "userId"          TEXT             NOT NULL,
    "concertRunId"    TEXT             NOT NULL,
    "score"           INTEGER          NOT NULL,
    "finalAttendance" DOUBLE PRECISION NOT NULL,
    "satisfaction"    DOUBLE PRECISION NOT NULL,
    "authenticity"    DOUBLE PRECISION NOT NULL,
    "spectrumMatch"   DOUBLE PRECISION NOT NULL,
    "pacing"          DOUBLE PRECISION NOT NULL,
    "encoreQuality"   DOUBLE PRECISION NOT NULL,
    "completedAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "headliner_daily_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "headliner_daily_results_concertRunId_key" ON "headliner_daily_results"("concertRunId");
CREATE UNIQUE INDEX "headliner_daily_results_challengeId_userId_key" ON "headliner_daily_results"("challengeId", "userId");
CREATE INDEX "headliner_daily_results_challengeId_score_idx" ON "headliner_daily_results"("challengeId", "score");

ALTER TABLE "headliner_daily_results"
  ADD CONSTRAINT "headliner_daily_results_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "headliner_daily_challenges"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "headliner_daily_results"
  ADD CONSTRAINT "headliner_daily_results_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "headliner_daily_results"
  ADD CONSTRAINT "headliner_daily_results_concertRunId_fkey"
  FOREIGN KEY ("concertRunId") REFERENCES "headliner_concert_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase Z.17.10: Headliner Campaign — player-owned stage-ladder progression.
-- Candidate songs for every Campaign run come only from the existing
-- band_rpg_collected_songs table (Band RPG's Collection) — no new inventory.

CREATE TABLE "headliner_campaign_progress" (
    "id"                   TEXT         NOT NULL,
    "userId"               TEXT         NOT NULL,
    "bandId"               TEXT         NOT NULL,
    "currentStage"         TEXT         NOT NULL DEFAULT 'rehearsal_room',
    "unlockedStage"        TEXT         NOT NULL DEFAULT 'rehearsal_room',
    "totalShowsCompleted"  INTEGER      NOT NULL DEFAULT 0,
    "bestScore"            INTEGER,
    "totalAudienceReached" INTEGER      NOT NULL DEFAULT 0,
    "starsEarned"          INTEGER      NOT NULL DEFAULT 0,
    "tutorialCompleted"    BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "headliner_campaign_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "headliner_campaign_progress_userId_bandId_key"
  ON "headliner_campaign_progress"("userId", "bandId");

ALTER TABLE "headliner_campaign_progress"
  ADD CONSTRAINT "headliner_campaign_progress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "headliner_campaign_progress"
  ADD CONSTRAINT "headliner_campaign_progress_bandId_fkey"
  FOREIGN KEY ("bandId") REFERENCES "bands"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "headliner_campaign_show_results" (
    "id"           TEXT         NOT NULL,
    "progressId"   TEXT         NOT NULL,
    "stageKey"     TEXT         NOT NULL,
    "concertRunId" TEXT         NOT NULL,
    "score"        INTEGER      NOT NULL,
    "stars"        INTEGER      NOT NULL,
    "firstClear"   BOOLEAN      NOT NULL DEFAULT false,
    "completedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "headliner_campaign_show_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "headliner_campaign_show_results_concertRunId_key"
  ON "headliner_campaign_show_results"("concertRunId");

CREATE INDEX "headliner_campaign_show_results_progressId_stageKey_idx"
  ON "headliner_campaign_show_results"("progressId", "stageKey");

ALTER TABLE "headliner_campaign_show_results"
  ADD CONSTRAINT "headliner_campaign_show_results_progressId_fkey"
  FOREIGN KEY ("progressId") REFERENCES "headliner_campaign_progress"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "headliner_campaign_show_results"
  ADD CONSTRAINT "headliner_campaign_show_results_concertRunId_fkey"
  FOREIGN KEY ("concertRunId") REFERENCES "headliner_concert_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

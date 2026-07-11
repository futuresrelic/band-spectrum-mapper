-- Phase Z.17.10: tag Campaign ConcertRun rows with the stage they were played for.
-- Nullable and additive — existing Quick Show rows are unaffected (stay NULL).

ALTER TABLE "headliner_concert_runs" ADD COLUMN "campaignStageKey" TEXT;

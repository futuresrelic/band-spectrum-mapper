-- Phase Z.17.5: Analysis Pipeline & Database Health
-- Single-process, DB-backed job queue for "Analyze Song/Album/Band" — no
-- distributed worker, just a durable row so the queue survives page reloads
-- and the state can be inspected from an admin dashboard.

CREATE TABLE "analysis_jobs" (
    "id"             TEXT NOT NULL,
    "scope"          TEXT NOT NULL,
    "targetId"       TEXT NOT NULL,
    "targetLabel"    TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'waiting',
    "totalSteps"     INTEGER NOT NULL DEFAULT 1,
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "currentStep"    TEXT,
    "resultJson"     JSONB,
    "errorMessage"   TEXT,
    "requestedBy"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analysis_jobs_status_idx" ON "analysis_jobs"("status");
CREATE INDEX "analysis_jobs_scope_targetId_idx" ON "analysis_jobs"("scope", "targetId");

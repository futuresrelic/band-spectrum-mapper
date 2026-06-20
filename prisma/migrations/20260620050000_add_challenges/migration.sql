-- Phase X: Rival Events & Challenges
-- Adds BandRpgChallenge (global + user-generated) and BandRpgChallengeAttempt tables.

CREATE TABLE "band_rpg_challenges" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT,
    "name"           TEXT NOT NULL,
    "description"    TEXT NOT NULL,
    "type"           TEXT NOT NULL,
    "difficulty"     TEXT NOT NULL,
    "rivalName"      TEXT,
    "rivalDesc"      TEXT,
    "targetAudience" TEXT,
    "rewardTitle"    TEXT,
    "rewardBadge"    TEXT,
    "minChemistry"   DOUBLE PRECISION,
    "minVariety"     DOUBLE PRECISION,
    "minMomentum"    DOUBLE PRECISION,
    "minPrestige"    DOUBLE PRECISION,
    "minDiversity"   DOUBLE PRECISION,
    "minDeepCut"     DOUBLE PRECISION,
    "minFanService"  DOUBLE PRECISION,
    "minRareSongs"   INTEGER,
    "minAlbums"      INTEGER,
    "minStopCount"   INTEGER,
    "isGenerated"    BOOLEAN NOT NULL DEFAULT false,
    "expiresAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "band_rpg_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "band_rpg_challenge_attempts" (
    "id"          TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "entityType"  TEXT NOT NULL,
    "entityId"    TEXT NOT NULL DEFAULT '',
    "entityName"  TEXT NOT NULL,
    "achieved"    BOOLEAN NOT NULL DEFAULT false,
    "metricScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tier"        TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "band_rpg_challenge_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "band_rpg_challenges_userId_idx" ON "band_rpg_challenges"("userId");
CREATE INDEX "band_rpg_challenge_attempts_challengeId_idx" ON "band_rpg_challenge_attempts"("challengeId");
CREATE INDEX "band_rpg_challenge_attempts_userId_idx" ON "band_rpg_challenge_attempts"("userId");

ALTER TABLE "band_rpg_challenges"
    ADD CONSTRAINT "band_rpg_challenges_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "band_rpg_challenge_attempts"
    ADD CONSTRAINT "band_rpg_challenge_attempts_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "band_rpg_challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "band_rpg_challenge_attempts"
    ADD CONSTRAINT "band_rpg_challenge_attempts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

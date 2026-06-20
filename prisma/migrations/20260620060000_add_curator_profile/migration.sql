-- Phase X.5: Curator Progression
-- Adds BandRpgCuratorProfile for persistent curator identity, XP, level, titles, and badges.

CREATE TABLE "band_rpg_curator_profiles" (
    "id"                    TEXT NOT NULL,
    "userId"                TEXT NOT NULL,
    "xp"                    INTEGER NOT NULL DEFAULT 0,
    "currentTitle"          TEXT,
    "titlesUnlocked"        TEXT[] NOT NULL DEFAULT '{}',
    "badgesUnlocked"        TEXT[] NOT NULL DEFAULT '{}',
    "selectedCharacterId"   TEXT,
    "selectedCharacterName" TEXT,
    "firstRecoveryDate"     TIMESTAMP(3),
    "lastActiveDate"        TIMESTAMP(3),
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "band_rpg_curator_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "band_rpg_curator_profiles_userId_key" ON "band_rpg_curator_profiles"("userId");

ALTER TABLE "band_rpg_curator_profiles"
    ADD CONSTRAINT "band_rpg_curator_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

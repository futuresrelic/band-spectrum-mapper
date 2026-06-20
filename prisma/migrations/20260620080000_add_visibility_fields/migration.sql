-- Phase Y.1: add visibility to curator profiles, festivals, and tours

ALTER TABLE "band_rpg_curator_profiles" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "band_rpg_festivals"         ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';
ALTER TABLE "band_rpg_tours"             ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';

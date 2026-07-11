-- Phase Z.17.10: schema prep for a future opener/closer/encore/co-occurrence
-- derivation from real historical setlists. Nullable and additive — existing
-- rows stay NULL (never backfilled/inferred). Going forward, every fresh
-- Setlist.fm fetch populates these from data already returned by the API.

ALTER TABLE "band_rpg_raw_setlist_entries" ADD COLUMN "setNumber" INTEGER;
ALTER TABLE "band_rpg_raw_setlist_entries" ADD COLUMN "position"  INTEGER;
ALTER TABLE "band_rpg_raw_setlist_entries" ADD COLUMN "isEncore"  BOOLEAN;

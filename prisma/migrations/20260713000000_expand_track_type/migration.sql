-- Track Classification expansion (Phase Z.17.16): 5 TrackType values -> 15.
-- Mapping (no song is lost, every existing value maps to an equivalent
-- new value): Song->Song, Interlude->Interlude, Spoken->SpokenWord,
-- Cover->Cover, Special->Special.
--
-- Postgres can't rename an enum value and add several new ones in a
-- single ALTER TYPE (ADD VALUE can't be used in the same transaction
-- that adds it), so this widens the column to TEXT, renames the one
-- value that changed, recreates the enum with the full set, and casts
-- the column back — the standard safe pattern for an enum rename +
-- expansion in one migration.

ALTER TABLE "songs" ALTER COLUMN "trackType" DROP DEFAULT;
ALTER TABLE "songs" ALTER COLUMN "trackType" TYPE TEXT USING "trackType"::TEXT;
UPDATE "songs" SET "trackType" = 'SpokenWord' WHERE "trackType" = 'Spoken';

ALTER TYPE "TrackType" RENAME TO "TrackType_old";
CREATE TYPE "TrackType" AS ENUM (
  'Song', 'Instrumental', 'Interlude', 'SpokenWord', 'SoundCollage',
  'Intro', 'Outro', 'Transition', 'Cover', 'Live', 'Demo', 'Remix',
  'BonusTrack', 'SuiteMovement', 'Special'
);

ALTER TABLE "songs" ALTER COLUMN "trackType" TYPE "TrackType" USING "trackType"::"TrackType";
ALTER TABLE "songs" ALTER COLUMN "trackType" SET DEFAULT 'Song';
DROP TYPE "TrackType_old";

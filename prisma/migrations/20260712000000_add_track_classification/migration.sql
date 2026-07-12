-- Track Classification (Phase Z.17.15): what a track IS (trackType) vs
-- where it may be selected (eligible* flags). Every existing row gets the
-- safe default — Song, eligible everywhere — via the column DEFAULTs below;
-- no data is migrated by hand, no track is removed.

-- CreateEnum
CREATE TYPE "TrackType" AS ENUM ('Song', 'Interlude', 'Spoken', 'Cover', 'Special');

-- AlterTable
ALTER TABLE "songs" ADD COLUMN "trackType" "TrackType" NOT NULL DEFAULT 'Song';
ALTER TABLE "songs" ADD COLUMN "eligibleHeadliner" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "songs" ADD COLUMN "eligibleDailyChallenge" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "songs" ADD COLUMN "eligibleTrivia" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "songs" ADD COLUMN "eligibleAiSetlists" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "songs" ADD COLUMN "eligibleDiscovery" BOOLEAN NOT NULL DEFAULT true;

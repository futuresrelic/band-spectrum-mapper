-- AlterTable: add avatar prompt storage fields to band_members
ALTER TABLE "band_members" ADD COLUMN "originalAvatarPrompt" TEXT;
ALTER TABLE "band_members" ADD COLUMN "lastAvatarPrompt" TEXT;
ALTER TABLE "band_members" ADD COLUMN "lastAvatarNegativePrompt" TEXT;

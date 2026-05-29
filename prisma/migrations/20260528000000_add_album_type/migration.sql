-- CreateEnum
CREATE TYPE "AlbumType" AS ENUM ('studio', 'ep', 'live', 'compilation', 'bootleg', 'single', 'demo');

-- AlterTable
ALTER TABLE "albums" ADD COLUMN "albumType" "AlbumType";

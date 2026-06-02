-- Add remix support to songs table
ALTER TABLE "songs" ADD COLUMN "isRemix" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "songs" ADD COLUMN "remixOfSongId" TEXT;

-- Add self-referential foreign key with SetNull on delete
ALTER TABLE "songs" ADD CONSTRAINT "songs_remixOfSongId_fkey"
  FOREIGN KEY ("remixOfSongId") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

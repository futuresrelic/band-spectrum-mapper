-- Link live/bootleg/demo recordings to their studio source song.
-- sourceSongId is intentionally separate from remixOfSongId so the two
-- relationships are semantically distinct: remixOf = artistic remix,
-- sourceSong = same song in a different recording context (live, bootleg, demo).

ALTER TABLE "songs" ADD COLUMN "sourceSongId" TEXT;

ALTER TABLE "songs" ADD CONSTRAINT "songs_sourceSongId_fkey"
  FOREIGN KEY ("sourceSongId") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

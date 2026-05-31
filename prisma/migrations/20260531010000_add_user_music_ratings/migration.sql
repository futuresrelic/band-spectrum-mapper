-- Create UserMusicRating table (Musical Structure community ratings)
-- Parallel to user_song_ratings but for musical characteristics, not lyrics.
CREATE TABLE "user_music_ratings" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "songId"               TEXT NOT NULL,
  "rhythmicComplexity"   INTEGER NOT NULL DEFAULT 5,
  "harmonicDepth"        INTEGER NOT NULL DEFAULT 5,
  "structuralComplexity" INTEGER NOT NULL DEFAULT 5,
  "sonicDensity"         INTEGER NOT NULL DEFAULT 5,
  "tempoEnergy"          INTEGER NOT NULL DEFAULT 5,
  "tonalDarkness"        INTEGER NOT NULL DEFAULT 5,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_music_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_music_ratings_userId_songId_key"
  ON "user_music_ratings"("userId", "songId");

ALTER TABLE "user_music_ratings"
  ADD CONSTRAINT "user_music_ratings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_music_ratings"
  ADD CONSTRAINT "user_music_ratings_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

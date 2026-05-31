-- Add contextInferred flag to song_ai_spectra
ALTER TABLE "song_ai_spectra" ADD COLUMN "contextInferred" BOOLEAN NOT NULL DEFAULT false;

-- Create SongMusicScore table (Musical Structure Spectrum)
CREATE TABLE "song_music_scores" (
  "id"                   TEXT NOT NULL,
  "songId"               TEXT NOT NULL,
  "model"                TEXT NOT NULL,
  "rhythmicComplexity"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "harmonicDepth"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "structuralComplexity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sonicDensity"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tempoEnergy"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "tonalDarkness"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rationale"            TEXT NOT NULL,
  "contextJson"          TEXT NOT NULL DEFAULT '{}',
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "song_music_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "song_music_scores_songId_key" ON "song_music_scores"("songId");

ALTER TABLE "song_music_scores"
  ADD CONSTRAINT "song_music_scores_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase Z.17.6: Song Card media — the official YouTube video for a song.
-- Admin-curated only; status='removed' is a soft delete so "removed
-- deliberately" stays distinct from "never had one."

CREATE TABLE "song_media" (
    "id"             TEXT NOT NULL,
    "songId"         TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "sourceUrl"      TEXT NOT NULL,
    "title"          TEXT,
    "status"         TEXT NOT NULL DEFAULT 'available',
    "addedBy"        TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "song_media_songId_key" ON "song_media"("songId");

ALTER TABLE "song_media"
    ADD CONSTRAINT "song_media_songId_fkey"
    FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

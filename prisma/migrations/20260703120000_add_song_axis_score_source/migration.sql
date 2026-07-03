-- Track provenance of Song Spectrum (SongAxisScore) values so the Song Card
-- can show an honest confidence badge instead of presenting every score as
-- equally authoritative. Nullable — existing rows predate this column and
-- are treated as legacy/unknown-source in the application layer.

ALTER TABLE "song_axis_scores" ADD COLUMN "source" TEXT;

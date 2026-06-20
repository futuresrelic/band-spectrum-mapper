-- Phase W: Tour Builder
-- Adds BandRpgTour (tour entity) and BandRpgTourStop (ordered concert stops).

CREATE TABLE "band_rpg_tours" (
  "id"          TEXT         NOT NULL,
  "userId"      TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "band_rpg_tours_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "band_rpg_tours_userId_idx" ON "band_rpg_tours"("userId");

ALTER TABLE "band_rpg_tours"
  ADD CONSTRAINT "band_rpg_tours_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "band_rpg_tour_stops" (
  "id"          TEXT    NOT NULL,
  "tourId"      TEXT    NOT NULL,
  "position"    INTEGER NOT NULL,
  "concertId"   TEXT    NOT NULL,
  "venueId"     TEXT,
  "cityName"    TEXT,
  "countryName" TEXT,
  CONSTRAINT "band_rpg_tour_stops_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "band_rpg_tour_stops_tourId_position_key"
  ON "band_rpg_tour_stops"("tourId", "position");

ALTER TABLE "band_rpg_tour_stops"
  ADD CONSTRAINT "band_rpg_tour_stops_tourId_fkey"
  FOREIGN KEY ("tourId") REFERENCES "band_rpg_tours"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "band_rpg_tour_stops"
  ADD CONSTRAINT "band_rpg_tour_stops_concertId_fkey"
  FOREIGN KEY ("concertId") REFERENCES "band_rpg_concerts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "band_rpg_tour_stops"
  ADD CONSTRAINT "band_rpg_tour_stops_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "band_rpg_venues"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

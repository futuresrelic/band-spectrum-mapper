-- Phase Y.3: Community Appreciation + Avatar System 2.0

CREATE TABLE "band_rpg_favorites" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "kind"       TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId"   TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "band_rpg_favorites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "band_rpg_favorites_userId_kind_entityType_entityId_key" ON "band_rpg_favorites"("userId","kind","entityType","entityId");
CREATE INDEX "band_rpg_favorites_entityType_entityId_idx" ON "band_rpg_favorites"("entityType","entityId");
ALTER TABLE "band_rpg_favorites" ADD CONSTRAINT "band_rpg_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "band_rpg_curator_follows" (
    "id"         TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "band_rpg_curator_follows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "band_rpg_curator_follows_followerId_followeeId_key" ON "band_rpg_curator_follows"("followerId","followeeId");
CREATE INDEX "band_rpg_curator_follows_followeeId_idx" ON "band_rpg_curator_follows"("followeeId");
ALTER TABLE "band_rpg_curator_follows" ADD CONSTRAINT "band_rpg_curator_follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "band_rpg_curator_follows" ADD CONSTRAINT "band_rpg_curator_follows_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "band_members" ADD COLUMN "referenceImageDataUrl" TEXT;
ALTER TABLE "band_members" ADD COLUMN "visualNotes" TEXT;

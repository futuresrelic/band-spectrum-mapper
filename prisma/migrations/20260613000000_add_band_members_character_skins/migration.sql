-- Vinyl Runner — band members and community character skins
-- Adds BandMember and PlatformerCharacterSkin tables, and updates Band/User
-- with the corresponding relation fields (no schema column changes needed there).

CREATE TABLE "band_members" (
    "id"        TEXT NOT NULL,
    "bandId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "role"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "band_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platformer_character_skins" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "dataUrl"       TEXT NOT NULL,
    "bandId"        TEXT,
    "memberId"      TEXT,
    "submittedById" TEXT,
    "isApproved"    BOOLEAN NOT NULL DEFAULT false,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platformer_character_skins_pkey" PRIMARY KEY ("id")
);

-- Foreign key: band_members → bands
ALTER TABLE "band_members" ADD CONSTRAINT "band_members_bandId_fkey"
    FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: platformer_character_skins → bands, band_members, users
ALTER TABLE "platformer_character_skins" ADD CONSTRAINT "platformer_character_skins_bandId_fkey"
    FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platformer_character_skins" ADD CONSTRAINT "platformer_character_skins_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "band_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platformer_character_skins" ADD CONSTRAINT "platformer_character_skins_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

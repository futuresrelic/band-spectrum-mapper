-- CreateEnum
CREATE TYPE "source_type" AS ENUM ('manual', 'paste', 'file_import', 'licensed', 'user_provided', 'ai_recall');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('pending', 'processing', 'success', 'partial', 'failed');

-- CreateTable
CREATE TABLE "bands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "year" INTEGER,
    "releaseDate" TIMESTAMP(3),
    "artworkUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "albumId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "trackNumber" INTEGER,
    "durationSeconds" INTEGER,
    "notes" TEXT,
    "isInstrumental" BOOLEAN NOT NULL DEFAULT false,
    "noLyricsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lyrics" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "sourceType" "source_type" NOT NULL,
    "sourceLabel" TEXT,
    "text" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lyrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lyric_revisions" (
    "id" TEXT NOT NULL,
    "lyricId" TEXT NOT NULL,
    "previousText" TEXT NOT NULL,
    "newText" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lyric_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_axis_scores" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "aggression" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complexity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atmosphere" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "emotion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "psychedelic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "concept" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_axis_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_tags" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "song_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_stopwords" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_stopwords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imports" (
    "id" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'pending',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comparisons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_ai_spectra" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "aggression" DOUBLE PRECISION NOT NULL,
    "complexity" DOUBLE PRECISION NOT NULL,
    "atmosphere" DOUBLE PRECISION NOT NULL,
    "emotion" DOUBLE PRECISION NOT NULL,
    "psychedelic" DOUBLE PRECISION NOT NULL,
    "concept" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_ai_spectra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_ai_analyses" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "themes" JSONB NOT NULL,
    "emotionalRegister" TEXT NOT NULL,
    "conceptualDepth" TEXT NOT NULL,
    "notableElements" JSONB NOT NULL,
    "rawResponse" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_research" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "musicStyle" TEXT,
    "sources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_context_analyses" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "titleSignificance" TEXT NOT NULL,
    "historicalContext" TEXT NOT NULL,
    "lyricalInterpretation" TEXT NOT NULL,
    "thematicSynthesis" TEXT NOT NULL,
    "overallNarrative" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_context_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_context_analyses" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "overallNarrative" TEXT NOT NULL,
    "thematicSynthesis" TEXT NOT NULL,
    "artisticContext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "album_context_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "band_context_analyses" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "overallNarrative" TEXT NOT NULL,
    "thematicSynthesis" TEXT NOT NULL,
    "artisticEvolution" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "band_context_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isCommunityExcluded" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lookupTokens" INTEGER NOT NULL DEFAULT 3,
    "tokensLastRefreshed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_song_ratings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "aggression" INTEGER NOT NULL DEFAULT 0,
    "complexity" INTEGER NOT NULL DEFAULT 0,
    "atmosphere" INTEGER NOT NULL DEFAULT 0,
    "emotion" INTEGER NOT NULL DEFAULT 0,
    "psychedelic" INTEGER NOT NULL DEFAULT 0,
    "concept" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_song_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_comments" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_icons" (
    "id" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_icons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_genre_ratings" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "perspective" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_genre_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_analysis_ratings" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_analysis_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_ai_genre_spectrums" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "metal" DOUBLE PRECISION NOT NULL,
    "rock" DOUBLE PRECISION NOT NULL,
    "pop" DOUBLE PRECISION NOT NULL,
    "hiphop" DOUBLE PRECISION NOT NULL,
    "electronic" DOUBLE PRECISION NOT NULL,
    "folk" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_ai_genre_spectrums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_theme_scores" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "themeSlug" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "evidence" TEXT,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "song_theme_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_knowledge_entries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "scopeId" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "images" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song_spectrum_analyses" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "songTitle" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "youtubeUrl" TEXT,
    "ytMetadata" JSONB,
    "audioFileName" TEXT,
    "audioAnalysis" JSONB,
    "scores" JSONB NOT NULL DEFAULT '{}',
    "scoreBreakdown" JSONB NOT NULL DEFAULT '{}',
    "songId" TEXT,

    CONSTRAINT "song_spectrum_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_contributions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "artistMbId" TEXT NOT NULL,
    "albumCount" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "pending_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bands_slug_key" ON "bands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "albums_bandId_slug_key" ON "albums"("bandId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "songs_bandId_slug_key" ON "songs"("bandId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "song_axis_scores_songId_key" ON "song_axis_scores"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "song_tags_songId_tagId_key" ON "song_tags"("songId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_stopwords_word_key" ON "custom_stopwords"("word");

-- CreateIndex
CREATE UNIQUE INDEX "song_ai_spectra_songId_key" ON "song_ai_spectra"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "song_ai_analyses_songId_key" ON "song_ai_analyses"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "song_research_songId_key" ON "song_research"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "song_context_analyses_songId_key" ON "song_context_analyses"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "album_context_analyses_albumId_key" ON "album_context_analyses"("albumId");

-- CreateIndex
CREATE UNIQUE INDEX "band_context_analyses_bandId_key" ON "band_context_analyses"("bandId");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_song_ratings_userId_songId_key" ON "user_song_ratings"("userId", "songId");

-- CreateIndex
CREATE UNIQUE INDEX "app_icons_size_key" ON "app_icons"("size");

-- CreateIndex
CREATE UNIQUE INDEX "song_genre_ratings_userId_songId_perspective_key" ON "song_genre_ratings"("userId", "songId", "perspective");

-- CreateIndex
CREATE UNIQUE INDEX "song_analysis_ratings_userId_songId_key" ON "song_analysis_ratings"("userId", "songId");

-- CreateIndex
CREATE UNIQUE INDEX "song_ai_genre_spectrums_songId_key" ON "song_ai_genre_spectrums"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "song_theme_scores_songId_themeSlug_key" ON "song_theme_scores"("songId", "themeSlug");

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lyrics" ADD CONSTRAINT "lyrics_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lyric_revisions" ADD CONSTRAINT "lyric_revisions_lyricId_fkey" FOREIGN KEY ("lyricId") REFERENCES "lyrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_axis_scores" ADD CONSTRAINT "song_axis_scores_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_axis_scores" ADD CONSTRAINT "song_axis_scores_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_tags" ADD CONSTRAINT "song_tags_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_tags" ADD CONSTRAINT "song_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_ai_spectra" ADD CONSTRAINT "song_ai_spectra_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_ai_analyses" ADD CONSTRAINT "song_ai_analyses_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_research" ADD CONSTRAINT "song_research_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_context_analyses" ADD CONSTRAINT "song_context_analyses_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album_context_analyses" ADD CONSTRAINT "album_context_analyses_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "band_context_analyses" ADD CONSTRAINT "band_context_analyses_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_song_ratings" ADD CONSTRAINT "user_song_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_song_ratings" ADD CONSTRAINT "user_song_ratings_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_comments" ADD CONSTRAINT "song_comments_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_comments" ADD CONSTRAINT "song_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_genre_ratings" ADD CONSTRAINT "song_genre_ratings_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_genre_ratings" ADD CONSTRAINT "song_genre_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_analysis_ratings" ADD CONSTRAINT "song_analysis_ratings_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_analysis_ratings" ADD CONSTRAINT "song_analysis_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_ai_genre_spectrums" ADD CONSTRAINT "song_ai_genre_spectrums_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_theme_scores" ADD CONSTRAINT "song_theme_scores_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_spectrum_analyses" ADD CONSTRAINT "song_spectrum_analyses_songId_fkey" FOREIGN KEY ("songId") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_contributions" ADD CONSTRAINT "pending_contributions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_contributions" ADD CONSTRAINT "pending_contributions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_scores" ADD CONSTRAINT "game_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

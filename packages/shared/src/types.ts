import type { ScoreAxis, SourceType, ImportStatus } from './constants.js';

// ---------------------------------------------------------------------------
// Core entity types (mirror Prisma models, safe for frontend use)
// ---------------------------------------------------------------------------

export interface Band {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Album {
  id: string;
  bandId: string;
  title: string;
  slug: string;
  year: number | null;
  releaseDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Song {
  id: string;
  bandId: string;
  albumId: string | null;
  title: string;
  slug: string;
  trackNumber: number | null;
  durationSeconds: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lyric {
  id: string;
  songId: string;
  sourceType: SourceType;
  sourceLabel: string | null;
  text: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LyricRevision {
  id: string;
  lyricId: string;
  previousText: string;
  newText: string;
  changeNote: string | null;
  createdAt: string;
}

export interface SongAxisScore {
  id: string;
  songId: string;
  bandId: string;
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomStopword {
  id: string;
  word: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface Import {
  id: string;
  importType: string;
  filename: string;
  mimeType: string;
  status: ImportStatus;
  summary: ImportSummary | null;
  createdAt: string;
}

export interface ImportSummary {
  totalRows: number;
  successRows: number;
  failedRows: number;
  errors: ImportRowError[];
}

export interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

export interface Comparison {
  id: string;
  name: string;
  configJson: ComparisonConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ComparisonConfig {
  type: 'band' | 'album' | 'custom';
  selectionA: ComparisonSelection;
  selectionB: ComparisonSelection;
}

export interface ComparisonSelection {
  label: string;
  bandIds?: string[];
  albumIds?: string[];
  songIds?: string[];
}

// ---------------------------------------------------------------------------
// Aggregated / computed types
// ---------------------------------------------------------------------------

export interface BandWithCounts extends Band {
  _count: {
    albums: number;
    songs: number;
  };
}

export interface AlbumWithSongs extends Album {
  songs: Song[];
}

export interface SongWithLyrics extends Song {
  lyrics: Lyric[];
  score: SongAxisScore | null;
  band?: Pick<Band, 'id' | 'name' | 'slug'>;
  album?: Pick<Album, 'id' | 'title' | 'slug'> | null;
  songTags?: Array<{ tag: Tag }>;
}

export interface AxisScoreMap {
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
}

// ---------------------------------------------------------------------------
// Analysis types
// ---------------------------------------------------------------------------

export interface WordFrequency {
  word: string;
  count: number;
  percentage: number;
}

export interface WordSongLink {
  word: string;
  totalCount: number;
  songs: Array<{
    songId: string;
    title: string;
    count: number;
    bandId?: string;
    bandName?: string;
    albumId?: string | null;
    albumTitle?: string | null;
  }>;
}

export interface LyricsAnalysisResult {
  songId?: string;
  albumId?: string;
  bandId?: string;
  totalWords: number;
  uniqueWords: number;
  topWords: WordFrequency[];
  wordCloudData: WordCloudEntry[];
  topPhrases?: WordFrequency[];
  wordSongLinks?: WordSongLink[];
  phraseSongLinks?: WordSongLink[];
}

export interface WordCloudEntry {
  text: string;
  value: number;
}

export interface SongAiAnalysis {
  id: string;
  songId: string;
  model: string;
  themes: string[];
  emotionalRegister: string;
  conceptualDepth: string;
  notableElements: string[];
  rawResponse: string;
  createdAt: string;
  updatedAt: string;
}

export interface SongAiSpectrum {
  id: string;
  songId: string;
  model: string;
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
  rationale: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenreScoreMap {
  metal: number;
  rock: number;
  pop: number;
  hiphop: number;
  electronic: number;
  folk: number;
}

export interface SongAiGenreSpectrum {
  id: string;
  songId: string;
  model: string;
  metal: number;
  rock: number;
  pop: number;
  hiphop: number;
  electronic: number;
  folk: number;
  rationale: string;
  generatedAt: string; // ISO
  updatedAt: string;   // ISO
}

export interface SongResearchSource {
  type: 'song' | 'album' | 'band';
  title: string;
  url: string;
  found: boolean;
  excerpt: string;
}

export interface SongResearch {
  id: string;
  songId: string;
  model: string;
  summary: string;
  musicStyle: string | null;
  sources: SongResearchSource[];
  createdAt: string;
  updatedAt: string;
}

export interface SongComment {
  id: string;
  songId: string;
  userId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  user: {
    name: string | null;
    avatarUrl: string | null;
  };
}

export interface SongContextAnalysis {
  id: string;
  songId: string;
  model: string;
  titleSignificance: string;
  historicalContext: string;
  lyricalInterpretation: string;
  thematicSynthesis: string;
  overallNarrative: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComparisonSelection {
  label: string;
  scores: AxisScoreMap;
  analysis: LyricsAnalysisResult;
}

export interface ComparisonResult {
  selectionA: ComparisonSelection;
  selectionB: ComparisonSelection;
  selectionC?: ComparisonSelection;
  sharedTopWords: WordFrequency[];
  uniqueToA: WordFrequency[];
  uniqueToB: WordFrequency[];
  uniqueToC?: WordFrequency[];
}

// ---------------------------------------------------------------------------
// API response wrappers
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Auth / user types
// ---------------------------------------------------------------------------

export interface AuthUser {
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isCommunityExcluded: boolean;
  isActive: boolean;
  createdAt: string;
  _count: { ratings: number };
}

export interface AdminUserDetail extends AdminUser {
  ratings: Array<{
    id: string;
    songId: string;
    aggression: number;
    complexity: number;
    atmosphere: number;
    emotion: number;
    psychedelic: number;
    concept: number;
    updatedAt: string;
    song: {
      id: string;
      title: string;
      band: { name: string } | null;
      album: { title: string } | null;
    };
  }>;
}

export interface UserSongRating {
  id: string;
  userId: string;
  songId: string;
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityScore {
  count: number;
  scores: AxisScoreMap;
}

export interface AlbumContextAnalysis {
  id: string;
  albumId: string;
  model: string;
  overallNarrative: string;
  thematicSynthesis: string;
  artisticContext: string;
  createdAt: string;
  updatedAt: string;
}

export interface BandContextAnalysis {
  id: string;
  bandId: string;
  model: string;
  overallNarrative: string;
  thematicSynthesis: string;
  artisticEvolution: string;
  createdAt: string;
  updatedAt: string;
}

export interface SongThemeScore {
  id: string;
  songId: string;
  themeSlug: string;       // ThemeCategorySlug
  score: number;           // 0.0 – 1.0
  evidence: string | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeSimilarSong {
  songId: string;
  title: string;
  bandName: string;
  bandSlug: string;
  albumTitle: string | null;
  similarity: number;      // 0.0 – 1.0 cosine similarity
}

// Re-export axis type for convenience
export type { ScoreAxis, SourceType, ImportStatus };

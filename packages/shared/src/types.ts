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

export interface LyricsAnalysisResult {
  songId?: string;
  albumId?: string;
  bandId?: string;
  totalWords: number;
  uniqueWords: number;
  topWords: WordFrequency[];
  wordCloudData: WordCloudEntry[];
}

export interface WordCloudEntry {
  text: string;
  value: number;
}

export interface ComparisonResult {
  selectionA: {
    label: string;
    scores: AxisScoreMap;
    analysis: LyricsAnalysisResult;
  };
  selectionB: {
    label: string;
    scores: AxisScoreMap;
    analysis: LyricsAnalysisResult;
  };
  sharedTopWords: WordFrequency[];
  uniqueToA: WordFrequency[];
  uniqueToB: WordFrequency[];
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

// Re-export axis type for convenience
export type { ScoreAxis, SourceType, ImportStatus };

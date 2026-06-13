import type { ScoreAxis, SourceType, ImportStatus } from './constants.js';

// ---------------------------------------------------------------------------
// Core entity types (mirror Prisma models, safe for frontend use)
// ---------------------------------------------------------------------------

export interface Band {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AlbumType = 'studio' | 'ep' | 'live' | 'compilation' | 'bootleg' | 'single' | 'demo';

export interface Album {
  id: string;
  bandId: string;
  title: string;
  slug: string;
  year: number | null;
  releaseDate: string | null;
  artworkUrl: string | null;
  notes: string | null;
  albumType: AlbumType | null;
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
  isRemix: boolean;
  remixOfSongId: string | null;
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
  band: Pick<Band, 'id' | 'name' | 'slug'>;
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
  contextInferred: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Musical Structure Spectrum — 6 axes describing HOW the music is built */
export interface SongMusicScore {
  id: string;
  songId: string;
  model: string;
  rhythmicComplexity: number;
  harmonicDepth: number;
  structuralComplexity: number;
  sonicDensity: number;
  tempoEnergy: number;
  tonalDarkness: number;
  rationale: string;
  contextJson: string;
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
  username?: string;
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

export interface MusicScoreMap {
  rhythmicComplexity: number;
  harmonicDepth: number;
  structuralComplexity: number;
  sonicDensity: number;
  tempoEnergy: number;
  tonalDarkness: number;
}

export interface CommunityMusicScore {
  count: number;
  scores: MusicScoreMap;
}

export interface UserMusicRating {
  id: string;
  userId: string;
  songId: string;
  rhythmicComplexity: number;
  harmonicDepth: number;
  structuralComplexity: number;
  sonicDensity: number;
  tempoEnergy: number;
  tonalDarkness: number;
  createdAt: string;
  updatedAt: string;
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

export interface KnowledgeImage {
  url: string;
  caption: string;
  creditWho: string;
  creditPlatform: string;
}

export interface AdminKnowledgeEntry {
  id:          string;
  title:       string;
  content:     string;
  scope:       'global' | 'band' | 'song';
  scopeId:     string | null;
  tags:        string[];
  images:      KnowledgeImage[];
  isActive:    boolean;
  entryType:   'knowledge' | 'social_influence';
  sourceLabel: string | null;  // where the community signal came from
  sourceUrl:   string | null;  // optional link to original source
  createdAt:   string;
  updatedAt:   string;
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

// ---------------------------------------------------------------------------
// Song Spectrum Analyzer — audio analysis types
// ---------------------------------------------------------------------------

export interface YouTubeMetadata {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  duration: string | null;     // ISO 8601 (e.g. "PT4M33S")
  durationSeconds: number | null;
  tags: string[];
  categoryId: string | null;
}

export interface AudioLoudness {
  meanDb: number;
  peakDb: number;
  dynamicRange: number;
  rmsEnvelope: number[];       // ~200 points, 0-1 normalised
}

export interface AudioSpectrogram {
  data: number[][];            // [timeFrame][freqBin] — dB values, reduced resolution
  times: number[];             // seconds
  freqs: number[];             // Hz
}

export interface AudioSection {
  start: number;               // seconds
  end: number;                 // seconds
  label: string;               // "A", "B", "C", …
  timeSignature?: string;      // e.g. "7/8" — detected for this section
}

export interface AudioFeatures {
  spectralCentroid: number;    // mean Hz
  spectralRolloff: number;     // mean Hz
  spectralFlux: number;        // mean frame-to-frame change
  spectralContrast: number;    // mean dB contrast
  zeroCrossingRate: number;    // mean ratio
  rhythmicDensity: number;     // onsets per second
  transientDensity: number;    // hard transients per second
  chromaProfile: number[];     // 12 chroma classes, normalised
  mfcc: number[];              // first 13 MFCCs (means)
}

export interface MusicBrainzSongData {
  recordingId: string | null;
  genres: string[];
  tags: string[];
  disambiguation: string | null;
  releaseTitle: string | null;
  releaseDate: string | null;
}

export interface RhythmResearch {
  timeSignatures: string[];   // e.g. ["9/8", "8/8", "7/8", "5/4"]
  polyrhythmic: boolean;
  bpmRange: string | null;    // e.g. "≈ 85 quarter-note BPM"
  notes: string | null;       // brief GPT explanation
  model: string;
}

export interface AudioAnalysisResult {
  duration: number;            // seconds
  sampleRate: number;
  bpm: number;
  bpmConfidence: number;       // 0–1
  key: string;                 // e.g. "A minor"
  keyConfidence: number;       // 0–1
  timeSignature: string;       // e.g. "4/4", "7/8", "9/8"
  polyrhythmic: boolean;       // true when complex/mixed meter detected
  loudness: AudioLoudness;
  waveform: number[];          // ~1000 amplitude points, –1 to 1
  spectrogram: AudioSpectrogram;
  sections: AudioSection[];
  features: AudioFeatures;
  // Optional fields added by the Node API layer (not from Python worker)
  userNotes?: string;
  musicBrainzData?: MusicBrainzSongData;
  rhythmResearch?: RhythmResearch;
}

export interface ScoreAxisDetail {
  score: number;               // 0–100
  confidence: number;          // 0–1
  audioFeatures: string[];     // human-readable contributing factors
  lyricsFeatures: string[];    // lyrics/context factors (may be empty)
  explanation: string;
}

export type SpectrumScores = Record<string, number>;  // axis → 0-100

export interface SongSpectrumAnalysis {
  id: string;
  createdAt: string;
  updatedAt: string;
  songTitle: string;
  artistName: string;
  youtubeUrl: string | null;
  ytMetadata: YouTubeMetadata | null;
  audioFileName: string | null;
  audioAnalysis: AudioAnalysisResult | null;
  scores: SpectrumScores;
  scoreBreakdown: Record<string, ScoreAxisDetail>;
  songId: string | null;
}

// ---------------------------------------------------------------------------
// Rhythm Lab — frequency-band percussion analysis types
// ---------------------------------------------------------------------------

export interface RhythmBand {
  label: string;
  minHz: number;
  maxHz: number;
}

export interface BarLengthCandidate {
  beats: number;       // bar length in quarter-note beats
  lengthSec: number;   // bar length in seconds at detected BPM
  confidence: number;  // 0–1 autocorrelation score
}

export interface CrossRhythm {
  bandA: string;
  bandB: string;
  ratio: string;       // e.g. "3:2"
  confidence: number;  // 0–1
}

export interface RhythmBandResult {
  label: string;
  minHz: number;
  maxHz: number;
  onsetTimes: number[];        // onset timestamps in seconds
  onsetCount: number;
  envelope: number[];          // normalised onset envelope, ~400 points, 0–1
  bandBpm: number;             // inferred BPM from IBI of onsets in this band
  ibiCv: number;               // inter-beat-interval coefficient of variation
  barCandidates: BarLengthCandidate[];
}

export interface RhythmAnalysisResult {
  globalBpm: number;
  globalBeatTimes: number[];   // beat positions in seconds (from full mix)
  envelopeLength: number;
  duration: number;
  bands: RhythmBandResult[];
  crossRhythms: CrossRhythm[];
  polyrhythmScore: number;     // 0–1, higher = more polyrhythmic content
  globalBarCandidates: BarLengthCandidate[];
}

// ---------------------------------------------------------------------------
// Lyric Lab — bulk word cloud analysis
// ---------------------------------------------------------------------------

export interface LyricLabWord {
  text: string;
  count: number;
  rank: number;
}

export interface LyricLabSongResult {
  songId: string;
  songTitle: string;
  albumId: string;
  albumTitle: string;
  bandId: string;
  bandName: string;
  words: LyricLabWord[];
  totalTokens: number;
  uniqueWords: number;
}

export interface LyricLabAlbumAggregate {
  albumId: string;
  albumTitle: string;
  words: LyricLabWord[];
  totalTokens: number;
  uniqueWords: number;
  sharedWords: string[];
  songCount: number;
}

export interface LyricLabGlobalAggregate {
  words: LyricLabWord[];
  totalTokens: number;
  uniqueWords: number;
  songCount: number;
}

export type LyricLabScope = 'discography' | 'album' | 'song';

export interface LyricLabResult {
  bandId: string;
  bandName: string;
  scope: LyricLabScope;
  songs: LyricLabSongResult[];
  albumAggregates: LyricLabAlbumAggregate[];
  globalAggregate: LyricLabGlobalAggregate | null;
  songsWithLyrics: number;
  songsTotal: number;
}

// Re-export axis type for convenience
export type { ScoreAxis, SourceType, ImportStatus };

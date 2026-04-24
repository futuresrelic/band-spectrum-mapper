export const SCORE_AXES = [
  'aggression',
  'complexity',
  'atmosphere',
  'emotion',
  'psychedelic',
  'concept',
] as const;

export type ScoreAxis = (typeof SCORE_AXES)[number];

export const AXIS_COLORS: Record<ScoreAxis, string> = {
  aggression:  '#ef4444',
  complexity:  '#8b5cf6',
  atmosphere:  '#06b6d4',
  emotion:     '#ec4899',
  psychedelic: '#10b981',
  concept:     '#f59e0b',
};

export const AXIS_LABELS: Record<ScoreAxis, string> = {
  aggression:  'Aggression',
  complexity:  'Complexity',
  atmosphere:  'Atmosphere',
  emotion:     'Emotion',
  psychedelic: 'Psychedelic',
  concept:     'Concept',
};

export const AXIS_INFO: Record<ScoreAxis, { lo: string; hi: string }> = {
  aggression:  { lo: 'Calm, peaceful, gentle',          hi: 'Intense, abrasive, violent' },
  complexity:  { lo: 'Simple, repetitive, accessible',  hi: 'Dense, layered, intricate' },
  atmosphere:  { lo: 'Dry, direct, stripped',           hi: 'Immersive, ambient, cinematic' },
  emotion:     { lo: 'Detached, cold, clinical',        hi: 'Raw, vulnerable, intensely felt' },
  psychedelic: { lo: 'Grounded, literal, concrete',     hi: 'Surreal, hallucinatory, mind-bending' },
  concept:     { lo: 'Personal, narrative, concrete',   hi: 'Philosophical, abstract, conceptual' },
};

export const SCORE_MIN = 0;
export const SCORE_MAX = 10;

export const GENRE_PERSPECTIVES = [
  { id: 'metal',      label: 'Metal fan',       emoji: '🤘' },
  { id: 'rock',       label: 'Rock fan',         emoji: '🎸' },
  { id: 'pop',        label: 'Pop fan',          emoji: '🎤' },
  { id: 'hiphop',     label: 'Hip-hop fan',      emoji: '🎧' },
  { id: 'electronic', label: 'Electronic fan',   emoji: '🎛️' },
  { id: 'folk',       label: 'Folk / indie fan', emoji: '🪕' },
] as const;

export type GenrePerspective = (typeof GENRE_PERSPECTIVES)[number]['id'];

export const SOURCE_TYPES = [
  'manual',
  'paste',
  'file_import',
  'licensed',
  'user_provided',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const IMPORT_STATUSES = [
  'pending',
  'processing',
  'success',
  'partial',
  'failed',
] as const;

export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const SUPPORTED_IMPORT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
] as const;

export const SUPPORTED_IMPORT_EXTENSIONS = ['.txt', '.md', '.csv', '.json'] as const;

// Default stopwords — common English words unlikely to be meaningful in lyric analysis
export const DEFAULT_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'that', 'this',
  'these', 'those', 'it', 'its', "it's", 'i', 'my', 'me', 'we', 'our',
  'you', 'your', 'he', 'she', 'they', 'them', 'their', 'not', 'no',
  'so', 'as', 'if', 'then', 'than', 'what', 'which', 'who', 'when',
  'where', 'how', 'all', 'each', 'every', 'both', 'more', 'most',
  'other', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
  'further', 'just', 'because', 'while', 'about', 'against', 'between',
]);

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
  aggression:  '#E5484D',
  complexity:  '#8B5CF6',
  atmosphere:  '#06B6D4',
  emotion:     '#F59E0B',
  psychedelic: '#22C55E',
  concept:     '#F97316',
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

// Genre colors — distinct from axis colors; thematically matched to each genre
export const GENRE_COLORS: Record<GenrePerspective, string> = {
  metal:      '#64748B', // slate-500 — steel/chrome
  rock:       '#FB923C', // orange-400 — raw warm energy
  pop:        '#F472B6', // pink-400 — bright candy
  hiphop:     '#818CF8', // indigo-400 — smooth urban
  electronic: '#22D3EE', // cyan-300 — digital/synthetic
  folk:       '#A3E635', // lime-400 — organic meadow
};

export const GENRE_LABELS: Record<GenrePerspective, string> = {
  metal:      'Metal',
  rock:       'Rock',
  pop:        'Pop',
  hiphop:     'Hip-hop',
  electronic: 'Electronic',
  folk:       'Folk / Indie',
};// ---------------------------------------------------------------------------
// Philosophical / thematic analysis — taxonomy of meaning categories
// ---------------------------------------------------------------------------

export const THEME_GROUPS = [
  'consciousness',
  'psychological',
  'spiritual',
  'transformation',
  'relational',
  'social',
  'existential',
  'emotional',
] as const;

export type ThemeGroup = (typeof THEME_GROUPS)[number];

export const THEME_GROUP_COLORS: Record<ThemeGroup, string> = {
  consciousness: '#34c8e8',
  psychological: '#bf5af2',
  spiritual:     '#ff375f',
  transformation:'#ff9500',
  relational:    '#30d158',
  social:        '#ff3a3a',
  existential:   '#94a3b8',
  emotional:     '#fbbf24',
};

export const THEME_CATEGORIES = [
  {
    slug: 'perception',
    label: 'Perception',
    group: 'consciousness' as ThemeGroup,
    description: 'Altered or expanded awareness; seeing beyond illusion or consensus reality',
  },
  {
    slug: 'ego-death',
    label: 'Ego Death',
    group: 'psychological' as ThemeGroup,
    description: 'Dissolution of self, loss of personal identity, transcending the ego-construct',
  },
  {
    slug: 'introspection',
    label: 'Introspection',
    group: 'psychological' as ThemeGroup,
    description: 'Self-examination, inner journeys, confronting uncomfortable personal truth',
  },
  {
    slug: 'shadow-self',
    label: 'Shadow Self',
    group: 'psychological' as ThemeGroup,
    description: 'Confronting inner darkness; hidden aspects of personality; Jungian shadow work',
  },
  {
    slug: 'acceptance',
    label: 'Acceptance',
    group: 'psychological' as ThemeGroup,
    description: 'Surrender, embracing what is, releasing resistance to pain or reality',
  },
  {
    slug: 'transcendence',
    label: 'Transcendence',
    group: 'spiritual' as ThemeGroup,
    description: 'Rising above the material plane; attaining a higher state of existence',
  },
  {
    slug: 'spirituality',
    label: 'Spirituality',
    group: 'spiritual' as ThemeGroup,
    description: 'Sacred experience, mysticism, connection to something greater than the self',
  },
  {
    slug: 'evolution',
    label: 'Evolution',
    group: 'transformation' as ThemeGroup,
    description: 'Growth and becoming; biological, psychological, or spiritual advancement',
  },
  {
    slug: 'rebirth',
    label: 'Rebirth',
    group: 'transformation' as ThemeGroup,
    description: 'Resurrection, starting over, cyclical renewal after destruction',
  },
  {
    slug: 'catharsis',
    label: 'Catharsis',
    group: 'emotional' as ThemeGroup,
    description: 'Emotional release; purging grief or rage; healing through intensity',
  },
  {
    slug: 'communication',
    label: 'Communication',
    group: 'relational' as ThemeGroup,
    description: 'Connection, breakdown of dialogue, language as power or barrier between people',
  },
  {
    slug: 'unity',
    label: 'Unity',
    group: 'relational' as ThemeGroup,
    description: 'Collective consciousness, shared humanity, breaking down divisions between selves',
  },
  {
    slug: 'warning',
    label: 'Warning / Caution',
    group: 'social' as ThemeGroup,
    description: 'Cautionary messages; self-destructive patterns; danger signals in society or self',
  },
  {
    slug: 'satire',
    label: 'Satire',
    group: 'social' as ThemeGroup,
    description: 'Social critique through irony, dark humor, or subversive cultural commentary',
  },
  {
    slug: 'mortality',
    label: 'Mortality',
    group: 'existential' as ThemeGroup,
    description: 'Death, impermanence, the finite and irreversible nature of human experience',
  },
  {
    slug: 'apocalypse',
    label: 'Apocalypse',
    group: 'existential' as ThemeGroup,
    description: 'End times, civilizational collapse, survival amid catastrophe or revelation',
  },
] as const;

export type ThemeCategorySlug = (typeof THEME_CATEGORIES)[number]['slug'];

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

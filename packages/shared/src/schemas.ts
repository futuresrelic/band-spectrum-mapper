import { z } from 'zod';
import { SCORE_MIN, SCORE_MAX, SOURCE_TYPES } from './constants.js';

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens');

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Band schemas
// ---------------------------------------------------------------------------

export const createBandSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional().nullable(),
  logoUrl: z.string().url().max(2000).optional().nullable(),
});

export const updateBandSchema = createBandSchema.partial();

export type CreateBandInput = z.infer<typeof createBandSchema>;
export type UpdateBandInput = z.infer<typeof updateBandSchema>;

// ---------------------------------------------------------------------------
// Album schemas
// ---------------------------------------------------------------------------

export const ALBUM_TYPES = [
  'studio', 'ep', 'live', 'compilation', 'bootleg', 'single', 'demo',
  'lp', 'remix', 'mixtape', 'boxset', 'soundtrack', 'acoustic', 'instrumental',
] as const;

export const ALBUM_TYPE_LABELS: Record<typeof ALBUM_TYPES[number], string> = {
  studio: 'Studio Album',
  ep: 'EP',
  live: 'Live Album',
  compilation: 'Compilation',
  bootleg: 'Bootleg',
  single: 'Single',
  demo: 'Demo',
  lp: 'LP',
  remix: 'Remix Album',
  mixtape: 'Mixtape',
  boxset: 'Box Set',
  soundtrack: 'Soundtrack',
  acoustic: 'Acoustic / Unplugged',
  instrumental: 'Instrumental',
};
export type AlbumTypeValue = typeof ALBUM_TYPES[number];

export const createAlbumSchema = z.object({
  title: z.string().min(1).max(300),
  slug: slugSchema.optional(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  releaseDate: z.string().datetime().optional().nullable(),
  artworkUrl: z.string().url().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  albumType: z.enum(ALBUM_TYPES).optional().nullable(),
});

export const updateAlbumSchema = createAlbumSchema.partial();

export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;

// ---------------------------------------------------------------------------
// Song schemas
// ---------------------------------------------------------------------------

export const SONG_RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'] as const;
export type SongRarity = typeof SONG_RARITIES[number];

// ---------------------------------------------------------------------------
// Track Classification (Phase Z.17.15) — what a track IS (trackType) vs
// where it may be selected (the eligible* flags). New imports default to
// Song, eligible everywhere; only unusual tracks need manual adjustment.
// ---------------------------------------------------------------------------

export const TRACK_TYPES = ['Song', 'Interlude', 'Spoken', 'Cover', 'Special'] as const;
export type TrackType = typeof TRACK_TYPES[number];

export const TRACK_TYPE_LABELS: Record<TrackType, string> = {
  Song: 'Song',
  Interlude: 'Interlude',
  Spoken: 'Spoken',
  Cover: 'Cover',
  Special: 'Special',
};

export const TRACK_TYPE_DESCRIPTIONS: Record<TrackType, string> = {
  Song: 'Normal musical track.',
  Interlude: 'Intro, outro, transition, ambience, soundscape.',
  Spoken: 'Spoken word, comedy, narration, skits, poems.',
  Cover: 'Song written by another artist.',
  Special: 'Hidden tracks, bonus tracks, demos, alternate versions.',
};

export const TRACK_ELIGIBILITY_FIELDS = [
  'eligibleHeadliner', 'eligibleDailyChallenge', 'eligibleTrivia', 'eligibleAiSetlists', 'eligibleDiscovery',
] as const;
export type TrackEligibilityField = typeof TRACK_ELIGIBILITY_FIELDS[number];

export const TRACK_ELIGIBILITY_LABELS: Record<TrackEligibilityField, string> = {
  eligibleHeadliner: 'Headliner',
  eligibleDailyChallenge: 'Daily Challenge',
  eligibleTrivia: 'Trivia',
  eligibleAiSetlists: 'AI Setlists',
  eligibleDiscovery: 'Random Discovery',
};

export const createSongSchema = z.object({
  title: z.string().min(1).max(300),
  slug: slugSchema.optional(),
  albumId: z.string().cuid().optional().nullable(),
  trackNumber: z.number().int().min(1).optional().nullable(),
  durationSeconds: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  isRemix: z.boolean().optional(),
  remixOfSongId: z.string().cuid().nullable().optional(),
  rarity: z.enum(SONG_RARITIES).optional(),
  trackType: z.enum(TRACK_TYPES).optional(),
  eligibleHeadliner: z.boolean().optional(),
  eligibleDailyChallenge: z.boolean().optional(),
  eligibleTrivia: z.boolean().optional(),
  eligibleAiSetlists: z.boolean().optional(),
  eligibleDiscovery: z.boolean().optional(),
});

export const updateSongSchema = createSongSchema.partial();

export type CreateSongInput = z.infer<typeof createSongSchema>;
export type UpdateSongInput = z.infer<typeof updateSongSchema>;

// ---------------------------------------------------------------------------
// Lyric schemas
// ---------------------------------------------------------------------------

export const sourceTypeSchema = z.enum(SOURCE_TYPES);

export const createLyricSchema = z.object({
  text: z.string().min(1),
  sourceType: sourceTypeSchema.default('manual'),
  sourceLabel: z.string().max(500).optional().nullable(),
  isPrimary: z.boolean().default(false),
});

export const updateLyricSchema = z.object({
  text: z.string().min(1).optional(),
  sourceType: sourceTypeSchema.optional(),
  sourceLabel: z.string().max(500).optional().nullable(),
  isPrimary: z.boolean().optional(),
  changeNote: z.string().max(500).optional().nullable(),
});

export type CreateLyricInput = z.infer<typeof createLyricSchema>;
export type UpdateLyricInput = z.infer<typeof updateLyricSchema>;

// ---------------------------------------------------------------------------
// Score schemas
// ---------------------------------------------------------------------------

const axisScore = z.number().min(SCORE_MIN).max(SCORE_MAX);

export const upsertScoreSchema = z.object({
  aggression: axisScore.optional().default(0),
  complexity: axisScore.optional().default(0),
  atmosphere: axisScore.optional().default(0),
  emotion: axisScore.optional().default(0),
  psychedelic: axisScore.optional().default(0),
  concept: axisScore.optional().default(0),
  notes: z.string().max(2000).optional().nullable(),
  // Optional so existing callers of this schema/route keep compiling.
  // scoreService.upsert defaults it to 'manual' when omitted — the only
  // HTTP client of this route is the admin manual-edit form; bulk AI/import/
  // audio pipelines write SongAxisScore directly via Prisma with their own source.
  source: z.literal('manual').optional(),
});

export type UpsertScoreInput = z.infer<typeof upsertScoreSchema>;

// ---------------------------------------------------------------------------
// Analysis query schemas
// ---------------------------------------------------------------------------

export const analysisQuerySchema = z.object({
  songId: z.string().cuid().optional(),
  albumId: z.string().cuid().optional(),
  bandId: z.string().cuid().optional(),
  songIds: z.array(z.string().cuid()).optional(),
  topN: z.coerce.number().int().min(1).max(2000).default(50),
  minWordLength: z.coerce.number().int().min(1).max(20).default(2),
  minCount: z.coerce.number().int().min(0).default(0),
  includeCustomStopwords: z.coerce.boolean().default(true),
  includeNgrams: z.coerce.boolean().default(false),
  ngramN: z.coerce.number().int().min(2).max(4).default(2),
  includeWordSongLinks: z.coerce.boolean().default(false),
});

export type AnalysisQueryInput = z.infer<typeof analysisQuerySchema>;

// ---------------------------------------------------------------------------
// Compare schemas
// ---------------------------------------------------------------------------

export const comparisonSelectionSchema = z.object({
  label: z.string().min(1).max(200),
  bandIds: z.array(z.string().cuid()).optional(),
  albumIds: z.array(z.string().cuid()).optional(),
  songIds: z.array(z.string().cuid()).optional(),
});

export const compareQuerySchema = z.object({
  selectionA: comparisonSelectionSchema,
  selectionB: comparisonSelectionSchema,
  selectionC: comparisonSelectionSchema.optional(),
  topN: z.coerce.number().int().min(1).max(500).default(30),
  minWordLength: z.coerce.number().int().min(1).max(20).default(2),
});

export type CompareQueryInput = z.infer<typeof compareQuerySchema>;

// ---------------------------------------------------------------------------
// Settings schemas
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// User rating schema — integers only, 0-10
// ---------------------------------------------------------------------------

const intAxis = z.number().int().min(SCORE_MIN).max(SCORE_MAX);

export const upsertUserRatingSchema = z.object({
  aggression:  intAxis,
  complexity:  intAxis,
  atmosphere:  intAxis,
  emotion:     intAxis,
  psychedelic: intAxis,
  concept:     intAxis,
});

export type UpsertUserRatingInput = z.infer<typeof upsertUserRatingSchema>;

export const upsertUserMusicRatingSchema = z.object({
  rhythmicComplexity:   intAxis,
  harmonicDepth:        intAxis,
  structuralComplexity: intAxis,
  sonicDensity:         intAxis,
  tempoEnergy:          intAxis,
  tonalDarkness:        intAxis,
});

export type UpsertUserMusicRatingInput = z.infer<typeof upsertUserMusicRatingSchema>;

// ---------------------------------------------------------------------------
// Settings schemas
// ---------------------------------------------------------------------------

export const addStopwordSchema = z.object({
  word: z.string().min(1).max(100).toLowerCase(),
});

export const removeStopwordSchema = z.object({
  word: z.string().min(1).max(100),
});

// ---------------------------------------------------------------------------
// Song media (YouTube) schemas — Phase Z.17.6
// ---------------------------------------------------------------------------

export const upsertSongMediaSchema = z.object({
  url: z.string().min(1).max(2000),
  title: z.string().max(200).optional().nullable(),
});
export type UpsertSongMediaInput = z.infer<typeof upsertSongMediaSchema>;

export const SONG_MEDIA_REVIEW_STATUSES = ['needs_review', 'broken', 'private'] as const;
export const patchSongMediaSchema = z.object({
  status: z.enum(SONG_MEDIA_REVIEW_STATUSES).optional(),
  title: z.string().max(200).optional().nullable(),
});
export type PatchSongMediaInput = z.infer<typeof patchSongMediaSchema>;

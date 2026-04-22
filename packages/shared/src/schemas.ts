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
});

export const updateBandSchema = createBandSchema.partial();

export type CreateBandInput = z.infer<typeof createBandSchema>;
export type UpdateBandInput = z.infer<typeof updateBandSchema>;

// ---------------------------------------------------------------------------
// Album schemas
// ---------------------------------------------------------------------------

export const createAlbumSchema = z.object({
  title: z.string().min(1).max(300),
  slug: slugSchema.optional(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  releaseDate: z.string().datetime().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const updateAlbumSchema = createAlbumSchema.partial();

export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;

// ---------------------------------------------------------------------------
// Song schemas
// ---------------------------------------------------------------------------

export const createSongSchema = z.object({
  title: z.string().min(1).max(300),
  slug: slugSchema.optional(),
  albumId: z.string().cuid().optional().nullable(),
  trackNumber: z.number().int().min(1).optional().nullable(),
  durationSeconds: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
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
  topN: z.coerce.number().int().min(1).max(500).default(50),
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
  topN: z.coerce.number().int().min(1).max(200).default(30),
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

// ---------------------------------------------------------------------------
// Settings schemas
// ---------------------------------------------------------------------------

export const addStopwordSchema = z.object({
  word: z.string().min(1).max(100).toLowerCase(),
});

export const removeStopwordSchema = z.object({
  word: z.string().min(1).max(100),
});

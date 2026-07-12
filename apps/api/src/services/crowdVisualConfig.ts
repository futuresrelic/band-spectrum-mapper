/**
 * Headliner — Crowd Visual Config (Creative Bible §14/§16.C, Phase Z.17.14
 * Part C; extended Phase Z.17.17 for the full Concert Viewport — stage,
 * performers, lighting, camera, Concert Pulse, Crowd Memory).
 *
 * Minimal typed configuration for the Concert Viewport's presentation,
 * stored via the existing SiteConfig key-value admin pattern (no new
 * table). Every field has a safe default that renders with plain CSS
 * shapes — no uploaded asset is ever required. Asset URL fields accept
 * either a real http(s) URL or a data:image/ URI under the same 5MB limit
 * routes/platformer.ts already enforces for uploaded sprite data.
 *
 * This is presentation configuration only — nothing here is read by
 * concertEngine.ts, concertDataService.ts, campaignService.ts, or
 * dailyChallengeService.ts. Changing it can never affect a score, a
 * candidate hand, or a deterministic replay.
 */

import { z } from 'zod';

export const HEADLINER_CROWD_VISUAL_CONFIG_KEY = 'headliner_crowd_visual_config';

const MAX_ASSET_DATA_URL_BYTES = 5 * 1024 * 1024; // matches routes/platformer.ts's MAX_DATA_URL_BYTES

function isValidAssetUrl(value: string): boolean {
  if (value.startsWith('data:image/')) {
    return Buffer.byteLength(value) <= MAX_ASSET_DATA_URL_BYTES;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const assetUrlSchema = z.string().max(7_000_000)
  .refine(isValidAssetUrl, { message: 'Must be an http(s) URL or a data:image/ URI under 5MB' })
  .nullable();

export const CROWD_RENDER_MODES = ['dots', 'silhouettes', 'pixel', 'minimal'] as const;
export type CrowdRenderMode = typeof CROWD_RENDER_MODES[number];

export const PERFORMER_SLOTS = ['vocalist', 'guitarist', 'bassist', 'drummer', 'keyboardist'] as const;
export type PerformerSlot = typeof PERFORMER_SLOTS[number];

export const VENUE_PRESETS = ['club', 'arena', 'festival', 'historic'] as const;
export type VenuePreset = typeof VENUE_PRESETS[number];

const performerSpritesSchema = z.object({
  vocalist: assetUrlSchema,
  guitarist: assetUrlSchema,
  bassist: assetUrlSchema,
  drummer: assetUrlSchema,
  keyboardist: assetUrlSchema,
});

export const crowdVisualConfigSchema = z.object({
  /** Viewport background — falls back to a plain dark panel when null. */
  viewportBackgroundUrl: assetUrlSchema,
  /** Sprite for a faction member with a flat (neither positive nor negative) reaction. */
  standingSpriteUrl: assetUrlSchema,
  /** Sprite for a faction member reacting positively. */
  activeSpriteUrl: assetUrlSchema,
  /** Sprite for a faction member reacting negatively. */
  lowEnergySpriteUrl: assetUrlSchema,
  /** Sprite for a faction currently at walkout risk — falls back to an empty slot, never a fabricated headcount. */
  walkoutSpriteUrl: assetUrlSchema,
  /** Optional stage-foreground image rendered under the crowd. */
  stageForegroundUrl: assetUrlSchema,
  animationIntensity: z.enum(['off', 'subtle', 'normal', 'lively']),
  spectatorDensity: z.number().int().min(5).max(300),
  spectatorSize: z.number().int().min(4).max(40),
  viewportOpacity: z.number().min(0.1).max(1),
  showFactionClusters: z.boolean(),
  animationsEnabled: z.boolean(),

  // --- Phase Z.17.17: stage, performers, lighting, camera, pulse, memory ---
  /** Default crowd rendering mode — players may override this locally (a display preference, not canonical state). */
  crowdRenderMode: z.enum(CROWD_RENDER_MODES),
  /** Per-slot performer sprite overrides — null falls back to a generic CSS silhouette. */
  performerSprites: performerSpritesSchema,
  /** Optional stage backdrop image, rendered behind the performers. */
  stageBackdropUrl: assetUrlSchema,
  /** Which of the 5 performer slots actually appear on stage — lets a band without a keyboardist omit it. */
  activePerformerSlots: z.array(z.enum(PERFORMER_SLOTS)).min(1).max(5),
  /** Default venue presentation preset — club/arena/festival/historic differ only in backdrop/depth/density, never in gameplay. */
  venuePreset: z.enum(VENUE_PRESETS),
  lightingEnabled: z.boolean(),
  fogEnabled: z.boolean(),
  particlesEnabled: z.boolean(),
  cameraMotionEnabled: z.boolean(),
  pulsePaletteStart: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #rrggbb color'),
  pulsePaletteEnd: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #rrggbb color'),
  crowdMemoryEnabled: z.boolean(),
  /** Milliseconds for a faction's Crowd Memory warmth to decay halfway back to neutral. */
  crowdMemoryDecayMs: z.number().int().min(1000).max(60_000),
  /** 0-1 multiplier on idle sway/breathing motion. */
  idleMotionIntensity: z.number().min(0).max(1),
  /** 0-1 multiplier on reaction-driven motion (surges, recoils). */
  reactionMotionIntensity: z.number().min(0).max(1),
});

export type CrowdVisualConfig = z.infer<typeof crowdVisualConfigSchema>;

export const DEFAULT_CROWD_VISUAL_CONFIG: CrowdVisualConfig = {
  viewportBackgroundUrl: null,
  standingSpriteUrl: null,
  activeSpriteUrl: null,
  lowEnergySpriteUrl: null,
  walkoutSpriteUrl: null,
  stageForegroundUrl: null,
  animationIntensity: 'normal',
  spectatorDensity: 60,
  spectatorSize: 10,
  viewportOpacity: 1,
  showFactionClusters: true,
  animationsEnabled: true,

  crowdRenderMode: 'dots',
  performerSprites: { vocalist: null, guitarist: null, bassist: null, drummer: null, keyboardist: null },
  stageBackdropUrl: null,
  activePerformerSlots: ['vocalist', 'guitarist', 'bassist', 'drummer'],
  venuePreset: 'club',
  lightingEnabled: true,
  fogEnabled: false,
  particlesEnabled: false,
  cameraMotionEnabled: true,
  pulsePaletteStart: '#38bdf8',
  pulsePaletteEnd: '#a78bfa',
  crowdMemoryEnabled: true,
  crowdMemoryDecayMs: 9000,
  idleMotionIntensity: 0.5,
  reactionMotionIntensity: 0.7,
};

/**
 * Merges a stored (possibly partial, possibly stale-shape) config value
 * with the defaults — so an invalid or missing SiteConfig row never
 * breaks the viewport, it just renders with safe defaults for whatever
 * fields aren't valid.
 */
export function mergeCrowdVisualConfig(stored: unknown): CrowdVisualConfig {
  if (stored === null || typeof stored !== 'object') return DEFAULT_CROWD_VISUAL_CONFIG;
  const parsed = crowdVisualConfigSchema.partial().safeParse(stored);
  if (!parsed.success) return DEFAULT_CROWD_VISUAL_CONFIG;
  const merged: Record<string, unknown> = { ...DEFAULT_CROWD_VISUAL_CONFIG };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as CrowdVisualConfig;
}

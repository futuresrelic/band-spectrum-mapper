/**
 * Headliner — Crowd Visual Config (Creative Bible §14/§16.C, Phase Z.17.14 Part C)
 *
 * Minimal typed configuration for the Concert Viewport's audience visuals,
 * stored via the existing SiteConfig key-value admin pattern (no new
 * table). Every field has a safe default that renders with plain CSS
 * shapes — no uploaded asset is ever required. Asset URL fields accept
 * either a real http(s) URL or a data:image/ URI under the same 5MB limit
 * routes/platformer.ts already enforces for uploaded sprite data.
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

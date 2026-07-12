/**
 * Headliner Crowd Visual Config (Creative Bible §14/§16.C) — tests via
 * node:test. Only the pure schema/merge logic is covered here; the
 * SiteConfig read/write itself is exercised through the same route
 * pattern as game-visibility/cinema-default, which this sandbox has no
 * live database to test against (see campaignService.test.ts's header
 * for the same documented limitation).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crowdVisualConfigSchema, DEFAULT_CROWD_VISUAL_CONFIG, mergeCrowdVisualConfig,
} from './crowdVisualConfig.js';

test('the default config parses as valid on its own', () => {
  const result = crowdVisualConfigSchema.safeParse(DEFAULT_CROWD_VISUAL_CONFIG);
  assert.equal(result.success, true);
});

test('the default config requires no uploaded assets — every sprite/background URL is null', () => {
  assert.equal(DEFAULT_CROWD_VISUAL_CONFIG.viewportBackgroundUrl, null);
  assert.equal(DEFAULT_CROWD_VISUAL_CONFIG.standingSpriteUrl, null);
  assert.equal(DEFAULT_CROWD_VISUAL_CONFIG.activeSpriteUrl, null);
  assert.equal(DEFAULT_CROWD_VISUAL_CONFIG.lowEnergySpriteUrl, null);
  assert.equal(DEFAULT_CROWD_VISUAL_CONFIG.walkoutSpriteUrl, null);
  assert.equal(DEFAULT_CROWD_VISUAL_CONFIG.stageForegroundUrl, null);
});

test('a valid https asset URL is accepted', () => {
  const result = crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, standingSpriteUrl: 'https://example.com/sprite.png' });
  assert.equal(result.success, true);
});

test('a small data:image/ URI is accepted', () => {
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const result = crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, activeSpriteUrl: tinyPng });
  assert.equal(result.success, true);
});

test('a non-http(s), non-data:image URL is rejected', () => {
  const result = crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, standingSpriteUrl: 'javascript:alert(1)' });
  assert.equal(result.success, false);
});

test('an oversized data:image/ URI is rejected', () => {
  const hugeBase64 = 'A'.repeat(8 * 1024 * 1024);
  const result = crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, lowEnergySpriteUrl: `data:image/png;base64,${hugeBase64}` });
  assert.equal(result.success, false);
});

test('spectatorDensity, spectatorSize, and viewportOpacity are bounded', () => {
  assert.equal(crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, spectatorDensity: 1 }).success, false);
  assert.equal(crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, spectatorDensity: 301 }).success, false);
  assert.equal(crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, spectatorSize: 0 }).success, false);
  assert.equal(crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, viewportOpacity: 0 }).success, false);
  assert.equal(crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, viewportOpacity: 1.5 }).success, false);
});

test('animationIntensity only accepts the four documented levels', () => {
  assert.equal(crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, animationIntensity: 'extreme' }).success, false);
  for (const level of ['off', 'subtle', 'normal', 'lively']) {
    assert.equal(crowdVisualConfigSchema.safeParse({ ...DEFAULT_CROWD_VISUAL_CONFIG, animationIntensity: level }).success, true);
  }
});

test('mergeCrowdVisualConfig falls back to full defaults for null, non-object, or invalid stored values', () => {
  assert.deepEqual(mergeCrowdVisualConfig(null), DEFAULT_CROWD_VISUAL_CONFIG);
  assert.deepEqual(mergeCrowdVisualConfig('not an object'), DEFAULT_CROWD_VISUAL_CONFIG);
  assert.deepEqual(mergeCrowdVisualConfig({ spectatorDensity: 99999 }), DEFAULT_CROWD_VISUAL_CONFIG);
});

test('mergeCrowdVisualConfig layers a valid partial stored value over the defaults', () => {
  const merged = mergeCrowdVisualConfig({ spectatorDensity: 120, showFactionClusters: false });
  assert.equal(merged.spectatorDensity, 120);
  assert.equal(merged.showFactionClusters, false);
  assert.equal(merged.animationIntensity, DEFAULT_CROWD_VISUAL_CONFIG.animationIntensity);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDisplaySettings, DEFAULT_DISPLAY_SETTINGS } from './headlinerDisplaySettings.js';

test('mergeDisplaySettings falls back to full defaults for null, non-object, or empty stored values', () => {
  assert.deepEqual(mergeDisplaySettings(null), DEFAULT_DISPLAY_SETTINGS);
  assert.deepEqual(mergeDisplaySettings('nonsense'), DEFAULT_DISPLAY_SETTINGS);
  assert.deepEqual(mergeDisplaySettings({}), DEFAULT_DISPLAY_SETTINGS);
});

test('mergeDisplaySettings accepts a valid partial value and layers it over the defaults', () => {
  const merged = mergeDisplaySettings({ crowdMode: 'silhouettes', cameraMotion: false });
  assert.equal(merged.crowdMode, 'silhouettes');
  assert.equal(merged.cameraMotion, false);
  assert.equal(merged.animationQuality, DEFAULT_DISPLAY_SETTINGS.animationQuality);
});

test('mergeDisplaySettings ignores invalid enum values and keeps the default for that field', () => {
  const merged = mergeDisplaySettings({ crowdMode: 'wireframe', pulseIntensity: 'extreme' });
  assert.equal(merged.crowdMode, DEFAULT_DISPLAY_SETTINGS.crowdMode);
  assert.equal(merged.pulseIntensity, DEFAULT_DISPLAY_SETTINGS.pulseIntensity);
});

test('mergeDisplaySettings ignores non-boolean values for boolean fields', () => {
  const merged = mergeDisplaySettings({ cameraMotion: 'yes', viewportEnabled: 1 });
  assert.equal(merged.cameraMotion, DEFAULT_DISPLAY_SETTINGS.cameraMotion);
  assert.equal(merged.viewportEnabled, DEFAULT_DISPLAY_SETTINGS.viewportEnabled);
});

test('viewportEnabled defaults to true and can be turned off — the game must remain usable either way', () => {
  assert.equal(DEFAULT_DISPLAY_SETTINGS.viewportEnabled, true);
  const merged = mergeDisplaySettings({ viewportEnabled: false });
  assert.equal(merged.viewportEnabled, false);
});

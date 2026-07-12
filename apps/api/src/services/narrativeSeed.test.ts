import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stableTemplateHash, pickBySeededHash } from './narrativeSeed.js';

test('stableTemplateHash is deterministic for identical inputs', () => {
  assert.equal(stableTemplateHash('a', 'b', 'c'), stableTemplateHash('a', 'b', 'c'));
});

test('stableTemplateHash treats different inputs as (almost always) different', () => {
  assert.notEqual(stableTemplateHash('seed-1', 'opening'), stableTemplateHash('seed-2', 'opening'));
});

test('pickBySeededHash returns the only item for a singleton list without hashing', () => {
  assert.equal(pickBySeededHash(['only'], 'anything'), 'only');
});

test('pickBySeededHash is deterministic: same items + same seed parts always pick the same entry', () => {
  const items = ['a', 'b', 'c', 'd'];
  const first = pickBySeededHash(items, 'show-1', 'opening');
  const second = pickBySeededHash(items, 'show-1', 'opening');
  assert.equal(first, second);
});

test('pickBySeededHash can select every item across enough distinct seeds', () => {
  const items = ['a', 'b', 'c'];
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) seen.add(pickBySeededHash(items, `seed-${i}`));
  assert.equal(seen.size, items.length);
});

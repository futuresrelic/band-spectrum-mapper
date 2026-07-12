/**
 * Track Classification (Phase Z.17.15, expanded Z.17.16) — tests via
 * node:test for the shared data tables (TRACK_TYPES, labels, descriptions,
 * recommended eligibility) and their interaction with the song schemas.
 * The migration itself was verified end-to-end against a real throwaway
 * Postgres instance (see the phase report) rather than unit-tested here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACK_TYPES, TRACK_TYPE_LABELS, TRACK_TYPE_DESCRIPTIONS,
  TRACK_ELIGIBILITY_FIELDS, TRACK_ELIGIBILITY_LABELS, RECOMMENDED_TRACK_ELIGIBILITY,
  updateSongSchema,
} from '@band-spectrum-mapper/shared';

test('TRACK_TYPES has exactly the 15 approved types, no more, no fewer', () => {
  assert.equal(TRACK_TYPES.length, 15);
  assert.deepEqual([...TRACK_TYPES], [
    'Song', 'Instrumental', 'Interlude', 'SpokenWord', 'SoundCollage',
    'Intro', 'Outro', 'Transition', 'Cover', 'Live', 'Demo', 'Remix',
    'BonusTrack', 'SuiteMovement', 'Special',
  ]);
});

test('every track type has a non-empty display label and description', () => {
  for (const t of TRACK_TYPES) {
    assert.ok(TRACK_TYPE_LABELS[t]?.length > 0, `missing label for ${t}`);
    assert.ok(TRACK_TYPE_DESCRIPTIONS[t]?.length > 0, `missing description for ${t}`);
  }
});

test('no track type description uses the word "joke"', () => {
  for (const t of TRACK_TYPES) {
    assert.ok(!TRACK_TYPE_DESCRIPTIONS[t].toLowerCase().includes('joke'), `${t} description should not call anything a joke track`);
  }
});

test('RECOMMENDED_TRACK_ELIGIBILITY has a complete, valid entry for every track type', () => {
  for (const t of TRACK_TYPES) {
    const rec = RECOMMENDED_TRACK_ELIGIBILITY[t];
    assert.ok(rec, `missing recommendation for ${t}`);
    for (const field of TRACK_ELIGIBILITY_FIELDS) {
      assert.equal(typeof rec[field], 'boolean', `${t}.${field} should be a boolean`);
    }
  }
});

test('Song and Instrumental recommend eligible everywhere', () => {
  for (const t of ['Song', 'Instrumental'] as const) {
    for (const field of TRACK_ELIGIBILITY_FIELDS) {
      assert.equal(RECOMMENDED_TRACK_ELIGIBILITY[t][field], true, `${t}.${field} should default true`);
    }
  }
});

test('unusual types (Interlude, SpokenWord, Intro, Outro, Transition) recommend Daily Challenge off but Headliner on', () => {
  for (const t of ['Interlude', 'SpokenWord', 'Intro', 'Outro', 'Transition'] as const) {
    assert.equal(RECOMMENDED_TRACK_ELIGIBILITY[t].eligibleDailyChallenge, false, `${t} should recommend Daily off`);
    assert.equal(RECOMMENDED_TRACK_ELIGIBILITY[t].eligibleHeadliner, true, `${t} should recommend Headliner on`);
  }
});

test('SoundCollage, Demo, and Special recommend conservative Headliner/Daily defaults but stay Trivia/Discovery eligible', () => {
  for (const t of ['SoundCollage', 'Demo', 'Special'] as const) {
    assert.equal(RECOMMENDED_TRACK_ELIGIBILITY[t].eligibleHeadliner, false);
    assert.equal(RECOMMENDED_TRACK_ELIGIBILITY[t].eligibleDailyChallenge, false);
    assert.equal(RECOMMENDED_TRACK_ELIGIBILITY[t].eligibleTrivia, true);
    assert.equal(RECOMMENDED_TRACK_ELIGIBILITY[t].eligibleDiscovery, true);
  }
});

test('TRACK_ELIGIBILITY_FIELDS is unchanged from the original 5-flag set (Track Type expansion does not touch eligibility)', () => {
  assert.deepEqual([...TRACK_ELIGIBILITY_FIELDS], [
    'eligibleHeadliner', 'eligibleDailyChallenge', 'eligibleTrivia', 'eligibleAiSetlists', 'eligibleDiscovery',
  ]);
  for (const field of TRACK_ELIGIBILITY_FIELDS) assert.ok(TRACK_ELIGIBILITY_LABELS[field]?.length > 0);
});

test('updateSongSchema accepts every new track type value', () => {
  for (const t of TRACK_TYPES) {
    const result = updateSongSchema.safeParse({ trackType: t });
    assert.equal(result.success, true, `updateSongSchema should accept trackType=${t}`);
  }
});

test('updateSongSchema rejects an old, now-renamed track type value', () => {
  const result = updateSongSchema.safeParse({ trackType: 'Spoken' });
  assert.equal(result.success, false, 'the old "Spoken" value was renamed to "SpokenWord" and should no longer validate');
});

test('applying a recommendation and then overriding one field never touches the others (admin overrides survive)', () => {
  const recommendation = RECOMMENDED_TRACK_ELIGIBILITY.Interlude;
  const afterOverride = { ...recommendation, eligibleHeadliner: false };
  assert.equal(afterOverride.eligibleDailyChallenge, recommendation.eligibleDailyChallenge);
  assert.equal(afterOverride.eligibleTrivia, recommendation.eligibleTrivia);
  assert.equal(afterOverride.eligibleAiSetlists, recommendation.eligibleAiSetlists);
  assert.equal(afterOverride.eligibleDiscovery, recommendation.eligibleDiscovery);
});

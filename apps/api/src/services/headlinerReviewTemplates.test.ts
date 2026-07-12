/**
 * Headliner Concert Review System (Creative Bible §7) — tests via node:test.
 *
 * Covers determinism, the contradiction-prevention guards from Bible §7.8,
 * encore honesty, and the mandatory fallback disclosure. All pure —
 * buildConcertReview/buildConcertHighlights take plain metric objects, no
 * database or engine state required.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConcertReview, buildConcertHighlights } from './headlinerReviewTemplates.js';
import type { ScoreMetric } from './concertEngine.js';

function metrics(overrides: Partial<Record<ScoreMetric, number>> = {}): Record<ScoreMetric, number> {
  return {
    spectrumMatch: 60, energyCurveFit: 60, emotionalJourney: 60, audienceRetention: 60,
    rarityExcitement: 60, diversity: 60, authenticity: 60, encoreQuality: 0,
    paceDiscipline: 60, crowdPeak: 60,
    ...overrides,
  };
}

test('same inputs always produce the same review (deterministic template selection)', () => {
  const m = metrics({ spectrumMatch: 90, audienceRetention: 90 });
  const a = buildConcertReview('Test Band', m, 850, true, 0);
  const b = buildConcertReview('Test Band', m, 850, true, 0);
  assert.equal(a, b);
});

test('band name is always interpolated, never leaves a literal placeholder', () => {
  const review = buildConcertReview('The Fixtures', metrics(), 500, false, 0);
  assert.ok(!review.includes('[Band Name]'));
});

test('a low overallScore selects the Poor-band opening and closing lines', () => {
  const review = buildConcertReview('Test Band', metrics(), 150, false, 0);
  assert.ok(review.includes('very little landed'));
  assert.ok(review.toLowerCase().includes('pretending otherwise would insult'));
});

test('OPEN-01 (>=900) is selected over OPEN-02/03 (800-899) at a truly exceptional score', () => {
  const review = buildConcertReview('Test Band', metrics(), 950, false, 0);
  assert.ok(review.includes("didn't play a show so much as make an argument"));
});

test('a tied 800-899 score selects one of the two intentional flavor variants (OPEN-02 or OPEN-03), never OPEN-01', () => {
  const review = buildConcertReview('Test Band', metrics(), 899, false, 0, 'seed-a');
  assert.ok(!review.includes("didn't play a show so much as make an argument"));
  assert.ok(review.includes('A legendary night') || review.includes('clicks shut like a lock'));
});

test('different seeds can select different tied opening variants (seeded rotation, Bible §16.B)', () => {
  const variants = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const review = buildConcertReview('Test Band', metrics(), 899, false, 0, `rotation-seed-${i}`);
    variants.add(review.includes('A legendary night') ? 'OPEN-02' : 'OPEN-03');
  }
  assert.equal(variants.size, 2, `expected both OPEN-02 and OPEN-03 to appear across seeds, got: ${[...variants].join(', ')}`);
});

test('the same seed always selects the same tied variant (a reopened show reads identically)', () => {
  const a = buildConcertReview('Test Band', metrics(), 899, false, 0, 'stable-seed-x');
  const b = buildConcertReview('Test Band', metrics(), 899, false, 0, 'stable-seed-x');
  assert.equal(a, b);
});

test('IDEN-02 (spectrumMatch>=85 AND authenticity>=85) wins over IDEN-01 (spectrumMatch>=85 alone) when both hold', () => {
  const review = buildConcertReview('Test Band', metrics({ spectrumMatch: 90, authenticity: 90 }), 700, false, 0);
  assert.ok(review.includes('built almost entirely on the real thing'));
});

test('IDEN-01 alone is selected when spectrumMatch is high but authenticity is not', () => {
  const review = buildConcertReview('Test Band', metrics({ spectrumMatch: 90, authenticity: 60 }), 700, false, 0);
  assert.ok(review.includes('sworn in as testimony'));
  assert.ok(!review.includes('built almost entirely on the real thing'));
});

test('contradiction guard: CLOSE-08 never fires when spectrumMatch>=85, even with low diversity', () => {
  const review = buildConcertReview('Test Band', metrics({ spectrumMatch: 90, diversity: 10 }), 500, false, 0);
  assert.ok(!review.includes('kept the night smaller than the band is'));
});

test('CLOSE-08 does fire when diversity is low, overallScore is Solid, AND spectrumMatch is not high', () => {
  const review = buildConcertReview('Test Band', metrics({ spectrumMatch: 50, diversity: 10 }), 500, false, 0);
  assert.ok(review.includes('kept the night smaller than the band is'));
});

test('contradiction guard: ENC-01/02 never fire when audienceRetention is below 40, even with a huge encoreQuality', () => {
  const review = buildConcertReview('Test Band', metrics({ encoreQuality: 95, audienceRetention: 20 }), 500, true, 0);
  assert.ok(!review.includes("re-priced the whole evening"));
  assert.ok(!review.includes('a genuine ending, not an appendix'));
});

test('ENC-01 does fire when encoreQuality is huge and audienceRetention clears the guard', () => {
  const review = buildConcertReview('Test Band', metrics({ encoreQuality: 95, audienceRetention: 60 }), 700, true, 0);
  assert.ok(review.includes('re-priced the whole evening'));
});

test('encore honesty: only ENC-06/07/08 are eligible when no encore was played, regardless of metrics', () => {
  const review = buildConcertReview('Test Band', metrics({ encoreQuality: 0, audienceRetention: 90 }), 700, false, 0);
  // ENC-06 requires audienceRetention >= 70 with encorePlayed = false
  assert.ok(review.includes("never quite crossed into demanding more"));
  assert.ok(!review.includes('the crowd earned an encore'));
  assert.ok(!review.includes('re-priced the whole evening'));
});

test('ENC-09 fires only when the engine has honestly confirmed the peak happened during the encore', () => {
  const m = metrics({ encoreQuality: 80, crowdPeak: 90, audienceRetention: 60 });
  const withPeak = buildConcertReview('Test Band', m, 700, true, 0, '', true);
  const withoutPeak = buildConcertReview('Test Band', m, 700, true, 0, '', false);
  assert.ok(withPeak.includes("the encore was the show's true summit"));
  assert.ok(!withoutPeak.includes("the encore was the show's true summit"));
});

test('ENC-09 outranks ENC-01 when both are metrically eligible, since the peak-during-encore claim is more specific', () => {
  const review = buildConcertReview(
    'Test Band', metrics({ encoreQuality: 90, crowdPeak: 90, audienceRetention: 60 }), 700, true, 0, '', true,
  );
  assert.ok(review.includes("the encore was the show's true summit"));
  assert.ok(!review.includes('re-priced the whole evening'));
});

test('ENC-09 never fires without an encore, even if peakDuringEncore is somehow true', () => {
  const review = buildConcertReview('Test Band', metrics({ encoreQuality: 90, crowdPeak: 90 }), 700, false, 0, '', true);
  assert.ok(!review.includes("the encore was the show's true summit"));
});

test('fallback disclosure is appended when fallbackSongCount > 0, and is absent otherwise', () => {
  const withFallback = buildConcertReview('Test Band', metrics(), 500, false, 3);
  const withoutFallback = buildConcertReview('Test Band', metrics(), 500, false, 0);
  assert.ok(withFallback.includes("3 songs in this set still don't have full identity data"));
  assert.ok(!withoutFallback.includes('full identity data'));
});

test('fallback disclosure always appears last in the review', () => {
  const review = buildConcertReview('Test Band', metrics(), 500, false, 1);
  const idx = review.indexOf('1 song in this set still');
  assert.ok(idx > 0);
  assert.equal(review.slice(idx).includes('.'), true); // it's the trailing sentence
  assert.ok(idx > review.length / 2, 'fallback disclosure should be near/at the end of the review');
});

test('buildConcertHighlights preserves prior trigger behavior (rarity count, spectrum bands, encore, diversity)', () => {
  const h1 = buildConcertHighlights(1, metrics({ spectrumMatch: 90, diversity: 85 }), true, true);
  assert.ok(h1.includes('One certified rarity made it into the set.'));
  assert.ok(h1.includes("The setlist landed squarely on the band's true identity."));
  assert.ok(h1.includes('The crowd earned an encore.'));
  assert.ok(h1.includes('Songs were pulled from across the whole discography.'));

  const h2 = buildConcertHighlights(0, metrics({ spectrumMatch: 20 }), false, true);
  assert.ok(h2.includes('The setlist drifted far from what defines this band.'));
  assert.ok(h2.includes("No encore tonight — the crowd wasn't won over enough."));
});

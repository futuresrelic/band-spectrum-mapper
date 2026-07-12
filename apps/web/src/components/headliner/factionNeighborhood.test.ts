/**
 * Crowd Neighborhoods (Phase Z.17.17) — the fixed, documented mapping
 * from each faction to a visual zone, since the engine only exposes
 * faction-level reactions (not per-section data). Verified here so the
 * mapping can't silently drift or lose a faction.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTION_NEIGHBORHOOD } from './ConcertViewport.js';
import type { FactionId } from '../../api/headliner';

const ALL_FACTIONS: readonly FactionId[] = ['casual', 'hardcore', 'deepCut', 'progHeads', 'firstTimers'];

test('every faction has exactly one assigned neighborhood', () => {
  for (const f of ALL_FACTIONS) {
    assert.ok(FACTION_NEIGHBORHOOD[f], `missing neighborhood for ${f}`);
  }
});

test('every faction maps to a distinct neighborhood — no two factions share a visual zone', () => {
  const zones = ALL_FACTIONS.map((f) => FACTION_NEIGHBORHOOD[f]);
  assert.equal(new Set(zones).size, zones.length);
});

test('the mapping is fixed and matches the documented assignment', () => {
  assert.deepEqual(FACTION_NEIGHBORHOOD, {
    hardcore: 'Pit', casual: 'Rear Floor', deepCut: 'Left Floor', progHeads: 'Right Floor', firstTimers: 'Balcony',
  });
});

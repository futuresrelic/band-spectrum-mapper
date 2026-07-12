/**
 * Headliner Campaign stage copy (Creative Bible §6) — tests via node:test.
 *
 * Covers: every stage has complete copy, the locked-stage explanation never
 * reads as a bare "Locked" and pluralizes correctly, result-text selection
 * picks the right star line (and the honest fallback for a stage that can't
 * fail), and the unlock line matches the stage that was actually cleared.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_ORDER, CAMPAIGN_STAGES } from './campaignStages.js';
import {
  getStageCopy, buildLockedStageExplanation, buildCampaignResultText, buildUnlockCopy,
} from './campaignStageCopy.js';

test('every Campaign stage has complete, non-empty Bible §6 copy', () => {
  for (const key of STAGE_ORDER) {
    const copy = getStageCopy(key);
    assert.equal(copy.stageKey, key);
    for (const field of [copy.titleTagline, copy.intro, copy.venueFantasy, copy.audienceFeeling, copy.whyItMatters, copy.playerLearns, copy.victoryText, copy.unlockText]) {
      assert.ok(field.length > 0, `${key}: expected non-empty copy field`);
    }
    for (const line of [copy.starText.one, copy.starText.two, copy.starText.three]) {
      assert.ok(line.length > 0, `${key}: expected non-empty star text`);
    }
  }
});

test('only Rehearsal Room (which cannot meaningfully fail) has no authored failure text', () => {
  for (const key of STAGE_ORDER) {
    const copy = getStageCopy(key);
    if (key === 'rehearsal_room') assert.equal(copy.failureText, null);
    else assert.ok(copy.failureText && copy.failureText.length > 0, `${key}: expected authored failure text`);
  }
});

test('buildLockedStageExplanation never reads as a bare "Locked" and names the real numbers', () => {
  const local = CAMPAIGN_STAGES.local_bar;
  const text = buildLockedStageExplanation(local, { name: 'Rehearsal Room', bestStars: 0, unlockRequiresStars: 1 });
  assert.ok(!/^Locked$/i.test(text));
  assert.ok(text.includes('Local Bar'));
  assert.ok(text.includes('Rehearsal Room'));
  assert.ok(text.includes('1 star'));
  assert.ok(!text.includes('1 stars'));
});

test('buildLockedStageExplanation pluralizes "stars" when more than one is required', () => {
  const theatre = CAMPAIGN_STAGES.small_theatre;
  const text = buildLockedStageExplanation(theatre, { name: 'Local Bar', bestStars: 1, unlockRequiresStars: 2 });
  assert.ok(text.includes('2 stars'));
});

test('buildCampaignResultText at 0 stars uses the stage\'s own failure text', () => {
  const text = buildCampaignResultText('local_bar', 0);
  assert.equal(text, getStageCopy('local_bar').failureText);
});

test('buildCampaignResultText at 0 stars falls back to the generic wrapper for Rehearsal Room', () => {
  const text = buildCampaignResultText('rehearsal_room', 0);
  assert.ok(text.includes('Stage Not Cleared'));
  assert.ok(text.includes('Show Report'));
});

test('buildCampaignResultText at 1/2/3 stars appends the matching star line to the victory text', () => {
  const copy = getStageCopy('festival_side_stage');
  assert.equal(buildCampaignResultText('festival_side_stage', 1), `${copy.victoryText} ${copy.starText.one}`);
  assert.equal(buildCampaignResultText('festival_side_stage', 2), `${copy.victoryText} ${copy.starText.two}`);
  assert.equal(buildCampaignResultText('festival_side_stage', 3), `${copy.victoryText} ${copy.starText.three}`);
});

test('buildUnlockCopy returns the cleared stage\'s own description of what opens next', () => {
  assert.equal(buildUnlockCopy('rehearsal_room'), getStageCopy('rehearsal_room').unlockText);
  assert.equal(buildUnlockCopy('major_theatre'), getStageCopy('major_theatre').unlockText);
});

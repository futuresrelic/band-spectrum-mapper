/**
 * Headliner — Campaign Stage Ladder (Phase Z.17.10)
 *
 * The single source of truth for every Campaign stage's requirements,
 * show rules, and star/objective thresholds. No stage logic is scattered
 * through routes or UI components — everything reads this config.
 *
 * These are narrative Campaign venues, NOT rows in `BandRpgVenue` (that
 * table is Band RPG's real, admin-curated venue list used by Quick Show).
 * Inventing fake "Rehearsal Room"/"Local Bar" rows there would pollute
 * canonical admin data with fictional Campaign flavor — so Campaign runs
 * leave `ConcertRun.venueId` null and carry venue flavor here instead.
 */

import type { FactionId, LiveFrequencyTier, ScoreMetric, ShowRules } from './concertEngine.js';
import { DEFAULT_SHOW_RULES } from './concertEngine.js';

export type StageKey =
  | 'rehearsal_room' | 'local_bar' | 'small_theatre' | 'festival_side_stage' | 'major_theatre';

export const STAGE_ORDER: StageKey[] = [
  'rehearsal_room', 'local_bar', 'small_theatre', 'festival_side_stage', 'major_theatre',
];

export type StageObjective =
  | { key: string; type: 'minAudienceRetention'; threshold: number; label: string }
  | { key: string; type: 'minAuthenticity'; threshold: number; label: string }
  | { key: string; type: 'minAlbumsRepresented'; count: number; label: string }
  | { key: string; type: 'playRareOrBelow'; label: string }
  | { key: string; type: 'minSpectrumMatch'; threshold: number; label: string }
  | { key: string; type: 'strongEncore'; threshold: number; label: string };

export interface StarThresholds {
  oneStar: number;
  twoStar: number;
  threeStar: number;
}

export interface TwoStarGate {
  metric: Extract<ScoreMetric, 'audienceRetention' | 'authenticity'>;
  threshold: number;
}

export interface CampaignStageConfig {
  key: StageKey;
  order: number;
  name: string;
  description: string;
  contextLabel: string;
  capacity: number;
  requiredRecoveredSongs: number;
  requiredMinDurationSeconds: number;
  showLengthMinutes: number;
  rulesOverride: Pick<ShowRules, 'minSongs' | 'maxSongs' | 'factionShare' | 'encoreEnergyThreshold'>;
  starThresholds: StarThresholds;
  twoStarGates: TwoStarGate[]; // any ONE satisfied, alongside the score threshold
  objectives: StageObjective[]; // only required for the 3rd star
  unlockRequiresStars: number; // stars needed on THIS stage to unlock the next one
  tutorial: boolean;
}

function factionShare(overrides: Partial<Record<FactionId, number>>): Record<FactionId, number> {
  return { ...DEFAULT_SHOW_RULES.factionShare, ...overrides };
}

export const CAMPAIGN_STAGES: Record<StageKey, CampaignStageConfig> = {
  rehearsal_room: {
    key: 'rehearsal_room',
    order: 1,
    name: 'Rehearsal Room',
    description: 'Just the band and a few friends. Learn the basics — no way to fail here.',
    contextLabel: 'An empty room, a few folding chairs, and the songs you actually know.',
    capacity: 15,
    requiredRecoveredSongs: 3,
    requiredMinDurationSeconds: 0,
    showLengthMinutes: 20,
    rulesOverride: {
      minSongs: 3,
      maxSongs: 3,
      factionShare: factionShare({ casual: 0.30, hardcore: 0.10, deepCut: 0.05, progHeads: 0.05, firstTimers: 0.50 }),
      encoreEnergyThreshold: 0,
    },
    starThresholds: { oneStar: 100, twoStar: 300, threeStar: 500 },
    twoStarGates: [{ metric: 'audienceRetention', threshold: 40 }],
    objectives: [],
    unlockRequiresStars: 1,
    tutorial: true,
  },
  local_bar: {
    key: 'local_bar',
    order: 2,
    name: 'Local Bar',
    description: 'A modest crowd that actually paid to be here. Retention starts to matter.',
    contextLabel: 'A small stage in the corner, a PA that\'s seen better days, and a crowd that showed up on purpose.',
    capacity: 60,
    requiredRecoveredSongs: 5,
    requiredMinDurationSeconds: 15 * 60,
    showLengthMinutes: 20,
    rulesOverride: {
      minSongs: 4,
      maxSongs: 5,
      factionShare: factionShare({ casual: 0.40, hardcore: 0.20, deepCut: 0.10, progHeads: 0.10, firstTimers: 0.20 }),
      encoreEnergyThreshold: 10,
    },
    starThresholds: { oneStar: 150, twoStar: 400, threeStar: 650 },
    twoStarGates: [{ metric: 'audienceRetention', threshold: 55 }, { metric: 'authenticity', threshold: 70 }],
    objectives: [
      { key: 'retention', type: 'minAudienceRetention', threshold: 55, label: 'Keep the crowd engaged (audience retention 55+)' },
      { key: 'albums-2', type: 'minAlbumsRepresented', count: 2, label: 'Play songs from at least 2 albums' },
    ],
    unlockRequiresStars: 1,
    tutorial: false,
  },
  small_theatre: {
    key: 'small_theatre',
    order: 3,
    name: 'Small Theatre',
    description: 'A longer show, a more demanding crowd, and real expectations about authenticity.',
    contextLabel: 'Real seats, real lighting, and a crowd that knows the difference between a real setlist and a lazy one.',
    capacity: 250,
    requiredRecoveredSongs: 8,
    requiredMinDurationSeconds: 28 * 60,
    showLengthMinutes: 32,
    rulesOverride: {
      minSongs: 6,
      maxSongs: 8,
      factionShare: factionShare({ casual: 0.30, hardcore: 0.25, deepCut: 0.15, progHeads: 0.15, firstTimers: 0.15 }),
      encoreEnergyThreshold: 15,
    },
    starThresholds: { oneStar: 200, twoStar: 500, threeStar: 750 },
    twoStarGates: [{ metric: 'authenticity', threshold: 75 }],
    objectives: [
      { key: 'spectrum-60', type: 'minSpectrumMatch', threshold: 60, label: 'Land close to the band\'s true identity (spectrum match 60+)' },
      { key: 'albums-3', type: 'minAlbumsRepresented', count: 3, label: 'Play songs from at least 3 albums' },
      { key: 'rarity', type: 'playRareOrBelow', label: 'Include at least one rarely-played song' },
    ],
    unlockRequiresStars: 2,
    tutorial: false,
  },
  festival_side_stage: {
    key: 'festival_side_stage',
    order: 4,
    name: 'Festival Side Stage',
    description: 'A bigger, more restless crowd — deep-cut hunters and hardcore fans came looking for something specific.',
    contextLabel: 'A festival crowd drifting in from other stages, half of them already fans, half of them deciding right now.',
    capacity: 1200,
    requiredRecoveredSongs: 10,
    requiredMinDurationSeconds: 35 * 60,
    showLengthMinutes: 40,
    rulesOverride: {
      minSongs: 8,
      maxSongs: 10,
      factionShare: factionShare({ casual: 0.25, hardcore: 0.25, deepCut: 0.20, progHeads: 0.15, firstTimers: 0.15 }),
      encoreEnergyThreshold: 20,
    },
    starThresholds: { oneStar: 250, twoStar: 550, threeStar: 800 },
    twoStarGates: [{ metric: 'audienceRetention', threshold: 60 }],
    objectives: [
      { key: 'rarity', type: 'playRareOrBelow', label: 'Include at least one rarely-played song' },
      { key: 'albums-4', type: 'minAlbumsRepresented', count: 4, label: 'Play songs from at least 4 albums' },
      { key: 'encore', type: 'strongEncore', threshold: 60, label: 'Deliver a strong encore (encore quality 60+)' },
    ],
    unlockRequiresStars: 2,
    tutorial: false,
  },
  major_theatre: {
    key: 'major_theatre',
    order: 5,
    name: 'Major Theatre',
    description: 'The top of this ladder. Every faction is watching, and every choice counts.',
    contextLabel: 'A sold-out room that knows every rumor about this band — tonight decides which ones are true.',
    capacity: 3000,
    requiredRecoveredSongs: 12,
    requiredMinDurationSeconds: 45 * 60,
    showLengthMinutes: 55,
    rulesOverride: {
      minSongs: 10,
      maxSongs: 13,
      factionShare: factionShare({ casual: 0.20, hardcore: 0.25, deepCut: 0.20, progHeads: 0.20, firstTimers: 0.15 }),
      encoreEnergyThreshold: 25,
    },
    starThresholds: { oneStar: 300, twoStar: 600, threeStar: 850 },
    twoStarGates: [{ metric: 'authenticity', threshold: 80 }, { metric: 'audienceRetention', threshold: 65 }],
    objectives: [
      { key: 'spectrum-70', type: 'minSpectrumMatch', threshold: 70, label: 'Land close to the band\'s true identity (spectrum match 70+)' },
      { key: 'albums-5', type: 'minAlbumsRepresented', count: 5, label: 'Play songs from at least 5 albums' },
      { key: 'rarity', type: 'playRareOrBelow', label: 'Include at least one rarely-played song' },
      { key: 'encore', type: 'strongEncore', threshold: 65, label: 'Deliver a strong encore (encore quality 65+)' },
    ],
    unlockRequiresStars: 0, // final stage — nothing further to unlock
    tutorial: false,
  },
};

export function getStage(key: StageKey): CampaignStageConfig {
  return CAMPAIGN_STAGES[key];
}

export function nextStageKey(key: StageKey): StageKey | null {
  const idx = STAGE_ORDER.indexOf(key);
  return idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1]! : null;
}

/** Rare-or-rarer tiers, used by the `playRareOrBelow` objective ("Rare-or-lower-frequency" per the design spec — i.e. Rare/Legendary/Mythic). */
export const RARE_OR_BELOW_TIERS: readonly LiveFrequencyTier[] = ['Rare', 'Legendary', 'Mythic'];

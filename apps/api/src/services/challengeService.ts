import { prisma } from '../lib/prisma.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard' | 'legendary';
export type ChallengeType =
  | 'festival' | 'tour' | 'concert' | 'setlist' | 'collection' | 'dream_festival';

export interface ChallengeDefinition {
  id: string;
  name: string;
  description: string;
  type: ChallengeType;
  difficulty: ChallengeDifficulty;
  rivalName?: string;
  rivalDesc?: string;
  targetAudience?: string;
  rewardTitle?: string;
  rewardBadge?: string;
  minChemistry?: number;
  minVariety?: number;
  minMomentum?: number;
  minPrestige?: number;
  minDiversity?: number;
  minDeepCut?: number;
  minFanService?: number;
  minRareSongs?: number;
  minAlbums?: number;
  minStopCount?: number;
}

export interface ChallengeMetrics {
  chemistry?:  number;
  variety?:    number;
  momentum?:   number;
  prestige?:   number;
  diversity?:  number;
  deepCut?:    number;
  fanService?: number;
  rareSongs?:  number;
  albums?:     number;
  stopCount?:  number;
}

// ── 12 global challenges (stable gc- prefix IDs) ──────────────────────────────

export const GLOBAL_CHALLENGES: ChallengeDefinition[] = [
  // ── Easy ────────────────────────────────────────────────────────────────────
  {
    id:          'gc-first-note',
    name:        'The First Note',
    description: 'Your journey begins. Recover at least 1 Rare or Extremely Rare song.',
    type:        'collection',
    difficulty:  'easy',
    minRareSongs: 1,
    rewardTitle: 'The Collector',
    rewardBadge: '🎵',
  },
  {
    id:          'gc-new-arrival',
    name:        'New Arrival',
    description: 'Complete your first album recovery in the Archive.',
    type:        'collection',
    difficulty:  'easy',
    minAlbums:   1,
    rewardTitle: 'Album Archivist',
    rewardBadge: '💿',
  },
  {
    id:          'gc-first-connection',
    name:        'First Connection',
    description: 'Build a festival with chemistry of at least 50.',
    type:        'festival',
    difficulty:  'easy',
    minChemistry: 50,
    rewardTitle: 'Festival Starter',
    rewardBadge: '🎪',
  },
  {
    id:          'gc-hit-the-road',
    name:        'Hit the Road',
    description: 'Plan a tour with at least 3 stops.',
    type:        'tour',
    difficulty:  'easy',
    minStopCount: 3,
    rewardTitle: 'Road Warrior',
    rewardBadge: '🚌',
  },
  // ── Medium ───────────────────────────────────────────────────────────────────
  {
    id:          'gc-festival-chemist',
    name:        'Festival Chemist',
    description: 'Build a festival achieving chemistry of at least 75. The Crowd Alchemist awaits.',
    type:        'festival',
    difficulty:  'medium',
    minChemistry: 75,
    rivalName:   'The Crowd Alchemist',
    rivalDesc:   'A legendary curator known for perfect festival chemistry. Can you match their craft?',
    rewardTitle: 'The Alchemist',
    rewardBadge: '⚗️',
  },
  {
    id:          'gc-collector',
    name:        'The Collector',
    description: 'Recover at least 10 Rare or Extremely Rare songs from the archive.',
    type:        'collection',
    difficulty:  'medium',
    minRareSongs: 10,
    rewardTitle: 'Master Collector',
    rewardBadge: '🏛️',
  },
  {
    id:          'gc-road-warrior',
    name:        'The Road Warrior',
    description: 'Complete a tour with momentum ≥ 65, variety ≥ 60, and at least 5 stops.',
    type:        'tour',
    difficulty:  'medium',
    minMomentum: 65,
    minVariety:  60,
    minStopCount: 5,
    rivalName:   'The Underground Expedition',
    rivalDesc:   'A relentless touring circuit that never plays the same setlist twice.',
    rewardTitle: 'Touring Legend',
    rewardBadge: '🗺️',
  },
  {
    id:          'gc-crowd-pleaser',
    name:        'Crowd Pleaser',
    description: 'Build a festival with chemistry ≥ 70 and fan service ≥ 60.',
    type:        'festival',
    difficulty:  'medium',
    minChemistry: 70,
    minFanService: 60,
    rivalName:   'The Stadium Circuit',
    rivalDesc:   'The biggest mainstream festival machine. Commercial perfection.',
    rewardTitle: "People's Champion",
    rewardBadge: '🏟️',
  },
  // ── Hard ────────────────────────────────────────────────────────────────────
  {
    id:          'gc-deep-archive',
    name:        'The Deep Archive',
    description: "Curate a festival with chemistry ≥ 82 and deep cuts ≥ 60. Beat the Archivist's Dream.",
    type:        'festival',
    difficulty:  'hard',
    minChemistry: 82,
    minDeepCut:  60,
    rivalName:   "The Archivist's Dream",
    rivalDesc:   "An obsessive curator who prizes forgotten tracks above all else. Their festivals never play a single hit.",
    rewardTitle: 'The Archivist',
    rewardBadge: '📜',
  },
  {
    id:          'gc-progressive-summit',
    name:        'The Progressive Summit',
    description: 'Build a festival for Progressive Pilgrims with chemistry ≥ 80.',
    type:        'festival',
    difficulty:  'hard',
    minChemistry:   80,
    targetAudience: 'Progressive Pilgrims',
    rivalName:   'The Progressive Summit',
    rivalDesc:   'A legendary gathering of progressive music fans. Only the most complex and ambitious sets qualify.',
    rewardTitle: 'Progressive Pilgrim',
    rewardBadge: '🎸',
  },
  {
    id:          'gc-momentum-machine',
    name:        'Momentum Machine',
    description: 'Build a tour with momentum ≥ 80 and variety ≥ 70.',
    type:        'tour',
    difficulty:  'hard',
    minMomentum: 80,
    minVariety:  70,
    rivalName:   'The Deep Cut Convention',
    rivalDesc:   'A touring collective that maintains legendary momentum across 30+ cities without repeating a song.',
    rewardTitle: 'Momentum Master',
    rewardBadge: '⚡',
  },
  // ── Legendary ────────────────────────────────────────────────────────────────
  {
    id:          'gc-mythic-gathering',
    name:        'The Mythic Gathering',
    description: 'Create a festival with chemistry ≥ 90 and prestige ≥ 80. Challenge the Mythic Circuit.',
    type:        'festival',
    difficulty:  'legendary',
    minChemistry: 90,
    minPrestige:  80,
    rivalName:   'The Mythic Circuit',
    rivalDesc:   "A festival so elite it only happens once a decade. Chemistry below 90 isn't considered. Build something worthy.",
    rewardTitle: 'Mythic Curator',
    rewardBadge: '👑',
  },
];

// ── Tier computation ──────────────────────────────────────────────────────────

const DIFFICULTY_THRESHOLDS: Record<ChallengeDifficulty, [number, number, number, number]> = {
  easy:      [0, 10, 20, 30],
  medium:    [0,  7, 14, 21],
  hard:      [0,  5, 10, 15],
  legendary: [0,  3,  7, 12],
};

export function computeTier(averageMargin: number, difficulty: ChallengeDifficulty): string {
  const [, silver, gold, platinum] = DIFFICULTY_THRESHOLDS[difficulty];
  if (averageMargin >= platinum) return 'platinum';
  if (averageMargin >= gold)     return 'gold';
  if (averageMargin >= silver)   return 'silver';
  return 'bronze';
}

export interface EvalInput {
  minChemistry?:  number | null;
  minVariety?:    number | null;
  minMomentum?:   number | null;
  minPrestige?:   number | null;
  minDiversity?:  number | null;
  minDeepCut?:    number | null;
  minFanService?: number | null;
  minRareSongs?:  number | null;
  minAlbums?:     number | null;
  minStopCount?:  number | null;
  difficulty:     string;
}

export function evaluateChallenge(
  ch: EvalInput,
  metrics: ChallengeMetrics,
): { achieved: boolean; margin: number; primaryScore: number; tier: string | null } {
  const checks: { min: number; actual: number }[] = [];

  if (ch.minChemistry  != null) checks.push({ min: ch.minChemistry,  actual: metrics.chemistry  ?? 0 });
  if (ch.minVariety    != null) checks.push({ min: ch.minVariety,    actual: metrics.variety    ?? 0 });
  if (ch.minMomentum   != null) checks.push({ min: ch.minMomentum,   actual: metrics.momentum   ?? 0 });
  if (ch.minPrestige   != null) checks.push({ min: ch.minPrestige,   actual: metrics.prestige   ?? 0 });
  if (ch.minDiversity  != null) checks.push({ min: ch.minDiversity,  actual: metrics.diversity  ?? 0 });
  if (ch.minDeepCut    != null) checks.push({ min: ch.minDeepCut,    actual: metrics.deepCut    ?? 0 });
  if (ch.minFanService != null) checks.push({ min: ch.minFanService, actual: metrics.fanService ?? 0 });
  if (ch.minRareSongs  != null) checks.push({ min: ch.minRareSongs,  actual: metrics.rareSongs  ?? 0 });
  if (ch.minAlbums     != null) checks.push({ min: ch.minAlbums,     actual: metrics.albums     ?? 0 });
  if (ch.minStopCount  != null) checks.push({ min: ch.minStopCount,  actual: metrics.stopCount  ?? 0 });

  if (checks.length === 0) return { achieved: false, margin: 0, primaryScore: 0, tier: null };

  const achieved = checks.every(c => c.actual >= c.min);
  if (!achieved)  return { achieved: false, margin: 0, primaryScore: checks[0]?.actual ?? 0, tier: null };

  const margins       = checks.map(c => c.actual - c.min);
  const averageMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
  const difficulty    = (ch.difficulty as ChallengeDifficulty) in DIFFICULTY_THRESHOLDS
    ? ch.difficulty as ChallengeDifficulty
    : 'easy' as ChallengeDifficulty;
  const tier          = computeTier(averageMargin, difficulty);
  const primaryScore  = checks[0]?.actual ?? 0;

  return { achieved: true, margin: averageMargin, primaryScore, tier };
}

// ── Collection metrics computed from DB ───────────────────────────────────────

export async function computeCollectionMetrics(userId: string): Promise<{
  rareSongs: number;
  albums: number;
}> {
  const [rareSongs, albums] = await Promise.all([
    prisma.bandRpgCollectedSong.count({
      where: {
        userId,
        rarity: { in: ['Rare', 'Legendary', 'Mythic'] },
      },
    }),
    prisma.bandRpgCompletedAlbum.count({ where: { userId } }),
  ]);
  return { rareSongs, albums };
}

// ── Seed global challenges (idempotent upsert) ────────────────────────────────

export async function seedGlobalChallenges(): Promise<void> {
  for (const ch of GLOBAL_CHALLENGES) {
    await prisma.bandRpgChallenge.upsert({
      where: { id: ch.id },
      create: {
        id:         ch.id,
        name:       ch.name,
        description: ch.description,
        type:       ch.type,
        difficulty: ch.difficulty,
        isGenerated: false,
        ...(ch.rivalName      != null ? { rivalName:      ch.rivalName }      : {}),
        ...(ch.rivalDesc      != null ? { rivalDesc:      ch.rivalDesc }      : {}),
        ...(ch.targetAudience != null ? { targetAudience: ch.targetAudience } : {}),
        ...(ch.rewardTitle    != null ? { rewardTitle:    ch.rewardTitle }    : {}),
        ...(ch.rewardBadge    != null ? { rewardBadge:    ch.rewardBadge }    : {}),
        ...(ch.minChemistry   != null ? { minChemistry:   ch.minChemistry }   : {}),
        ...(ch.minVariety     != null ? { minVariety:     ch.minVariety }     : {}),
        ...(ch.minMomentum    != null ? { minMomentum:    ch.minMomentum }    : {}),
        ...(ch.minPrestige    != null ? { minPrestige:    ch.minPrestige }    : {}),
        ...(ch.minDiversity   != null ? { minDiversity:   ch.minDiversity }   : {}),
        ...(ch.minDeepCut     != null ? { minDeepCut:     ch.minDeepCut }     : {}),
        ...(ch.minFanService  != null ? { minFanService:  ch.minFanService }  : {}),
        ...(ch.minRareSongs   != null ? { minRareSongs:   ch.minRareSongs }   : {}),
        ...(ch.minAlbums      != null ? { minAlbums:      ch.minAlbums }      : {}),
        ...(ch.minStopCount   != null ? { minStopCount:   ch.minStopCount }   : {}),
      },
      update: {
        name:          ch.name,
        description:   ch.description,
        type:          ch.type,
        difficulty:    ch.difficulty,
        rivalName:     ch.rivalName      ?? null,
        rivalDesc:     ch.rivalDesc      ?? null,
        targetAudience: ch.targetAudience ?? null,
        rewardTitle:   ch.rewardTitle    ?? null,
        rewardBadge:   ch.rewardBadge    ?? null,
        minChemistry:  ch.minChemistry   ?? null,
        minVariety:    ch.minVariety     ?? null,
        minMomentum:   ch.minMomentum    ?? null,
        minPrestige:   ch.minPrestige    ?? null,
        minDiversity:  ch.minDiversity   ?? null,
        minDeepCut:    ch.minDeepCut     ?? null,
        minFanService: ch.minFanService  ?? null,
        minRareSongs:  ch.minRareSongs   ?? null,
        minAlbums:     ch.minAlbums      ?? null,
        minStopCount:  ch.minStopCount   ?? null,
      },
    });
  }
}

// ── Challenge generator ───────────────────────────────────────────────────────

type GeneratedTemplate = Omit<ChallengeDefinition, 'id'>;

const GEN_TEMPLATES: GeneratedTemplate[] = [
  // Easy
  { name: 'Opening Night',      description: 'Book a festival with at least 2 concerts.', type: 'festival', difficulty: 'easy', minChemistry: 45, minStopCount: 2, rewardTitle: 'Promoter', rewardBadge: '🎟️' },
  { name: 'The Warm-Up',        description: 'Build a tour opener with at least 2 stops.', type: 'tour', difficulty: 'easy', minStopCount: 2, rewardTitle: 'Tour Starter', rewardBadge: '🎤' },
  { name: 'Five Recovered',     description: 'Recover 5 rare songs for your collection.', type: 'collection', difficulty: 'easy', minRareSongs: 5, rewardTitle: 'Song Hunter', rewardBadge: '🔍' },
  { name: 'Double Album',       description: 'Complete 2 albums in the Archive.', type: 'collection', difficulty: 'easy', minAlbums: 2, rewardTitle: 'Completionist', rewardBadge: '📀' },
  // Medium
  { name: 'The Chemistry Club', description: 'Build a festival where chemistry exceeds 68.', type: 'festival', difficulty: 'medium', minChemistry: 68, rivalName: 'The Deep Cut Convention', rivalDesc: 'They say chemistry is overrated. Prove them wrong.', rewardTitle: 'Chemist', rewardBadge: '🧪' },
  { name: 'The Variety Pack',   description: 'Build a tour with variety ≥ 65 and at least 4 stops.', type: 'tour', difficulty: 'medium', minVariety: 65, minStopCount: 4, rewardTitle: 'Setlist Architect', rewardBadge: '🎼' },
  { name: 'Fifteen Rare',       description: 'Recover 15 rare songs from across the Archive.', type: 'collection', difficulty: 'medium', minRareSongs: 15, rivalName: 'The Archivist\'s Dream', rivalDesc: 'The Archivist has catalogued over 200 rare recordings. Can you compete?', rewardTitle: 'Deep Digger', rewardBadge: '💎' },
  { name: 'Prestige Builder',   description: 'Host a festival with prestige ≥ 65.', type: 'festival', difficulty: 'medium', minPrestige: 65, rivalName: 'The Progressive Summit', rivalDesc: 'Prestige is earned, not bought.', rewardTitle: 'Legacy Builder', rewardBadge: '🏆' },
  { name: 'Fan Favourite',      description: 'A festival the crowd will never forget. Fan service ≥ 65.', type: 'festival', difficulty: 'medium', minFanService: 65, rivalName: 'The Stadium Circuit', rivalDesc: 'The Circuit fills stadiums for a reason. Show them why you belong.', rewardTitle: 'Crowd Favourite', rewardBadge: '❤️' },
  { name: 'Four Complete',      description: 'Complete 4 albums in the Archive.', type: 'collection', difficulty: 'medium', minAlbums: 4, rewardTitle: 'Discophile', rewardBadge: '🎶' },
  // Hard
  { name: 'The Tour de Force',  description: 'Build a tour with momentum ≥ 75, variety ≥ 65, and ≥ 6 stops.', type: 'tour', difficulty: 'hard', minMomentum: 75, minVariety: 65, minStopCount: 6, rivalName: 'The Underground Expedition', rivalDesc: 'Six cities. No repeated songs. No compromises.', rewardTitle: 'Tour Commander', rewardBadge: '🏅' },
  { name: 'The Prestige Circuit', description: 'Festival with prestige ≥ 75 and chemistry ≥ 76.', type: 'festival', difficulty: 'hard', minPrestige: 75, minChemistry: 76, rivalName: 'The Mythic Circuit', rivalDesc: 'A circuit so selective that most festivals never qualify.', rewardTitle: 'Prestige Curator', rewardBadge: '✨' },
  { name: 'Twenty Rare',        description: 'Recover 20 rare songs from the Archive depths.', type: 'collection', difficulty: 'hard', minRareSongs: 20, rivalName: "The Archivist's Dream", rivalDesc: 'The Archivist guards 500 rare recordings. You are not the first to try.', rewardTitle: 'Archive Master', rewardBadge: '🗄️' },
  { name: 'The Full Season',    description: 'Complete a six-album full-season collection.', type: 'collection', difficulty: 'hard', minAlbums: 6, rivalName: 'The Deep Cut Convention', rivalDesc: 'They have every studio album covered. Do you?', rewardTitle: 'Full Season', rewardBadge: '🎵' },
  // Legendary
  { name: 'The Summit',         description: 'Chemistry ≥ 88, prestige ≥ 75 — only the elite qualify.', type: 'festival', difficulty: 'legendary', minChemistry: 88, minPrestige: 75, rivalName: 'The Mythic Circuit', rivalDesc: "The Mythic Circuit has never lost a summit. Today might be different.", rewardTitle: 'Summit Champion', rewardBadge: '🌟' },
  { name: 'Odyssey Tour',       description: 'Complete a tour with momentum ≥ 85, variety ≥ 75, and ≥ 8 stops.', type: 'tour', difficulty: 'legendary', minMomentum: 85, minVariety: 75, minStopCount: 8, rivalName: 'The Underground Expedition', rivalDesc: 'Eight cities. Perfect momentum. Flawless variety. They said it could not be done.', rewardTitle: 'Tour Odyssey', rewardBadge: '🌍' },
];

const DIFFICULTY_WEIGHTS: ChallengeDifficulty[] = [
  'easy', 'easy', 'easy', 'easy',
  'medium', 'medium', 'medium',
  'hard', 'hard',
  'legendary',
];

export async function generateChallengeForUser(userId: string): Promise<string> {
  // Count existing generated challenges for this user so we can diversify
  const existingGenerated = await prisma.bandRpgChallenge.findMany({
    where: { userId, isGenerated: true },
    select: { name: true },
  });
  const existingNames = new Set(existingGenerated.map(c => c.name));

  // Pick random difficulty
  const idx        = Math.floor(Math.random() * DIFFICULTY_WEIGHTS.length);
  const difficulty = DIFFICULTY_WEIGHTS[idx] ?? 'easy';

  // Filter to templates matching difficulty, preferring ones not yet generated
  let pool = GEN_TEMPLATES.filter(t => t.difficulty === difficulty && !existingNames.has(t.name));
  if (pool.length === 0) {
    pool = GEN_TEMPLATES.filter(t => t.difficulty === difficulty);
  }
  if (pool.length === 0) {
    pool = GEN_TEMPLATES;
  }

  const template = pool[Math.floor(Math.random() * pool.length)]!;

  const created = await prisma.bandRpgChallenge.create({
    data: {
      userId,
      name:        template.name,
      description: template.description,
      type:        template.type,
      difficulty:  template.difficulty,
      isGenerated: true,
      ...(template.rivalName      != null ? { rivalName:      template.rivalName }      : {}),
      ...(template.rivalDesc      != null ? { rivalDesc:      template.rivalDesc }      : {}),
      ...(template.targetAudience != null ? { targetAudience: template.targetAudience } : {}),
      ...(template.rewardTitle    != null ? { rewardTitle:    template.rewardTitle }    : {}),
      ...(template.rewardBadge    != null ? { rewardBadge:    template.rewardBadge }    : {}),
      ...(template.minChemistry   != null ? { minChemistry:   template.minChemistry }   : {}),
      ...(template.minVariety     != null ? { minVariety:     template.minVariety }     : {}),
      ...(template.minMomentum    != null ? { minMomentum:    template.minMomentum }    : {}),
      ...(template.minPrestige    != null ? { minPrestige:    template.minPrestige }     : {}),
      ...(template.minDiversity   != null ? { minDiversity:   template.minDiversity }   : {}),
      ...(template.minDeepCut     != null ? { minDeepCut:     template.minDeepCut }     : {}),
      ...(template.minFanService  != null ? { minFanService:  template.minFanService }  : {}),
      ...(template.minRareSongs   != null ? { minRareSongs:   template.minRareSongs }   : {}),
      ...(template.minAlbums      != null ? { minAlbums:      template.minAlbums }      : {}),
      ...(template.minStopCount   != null ? { minStopCount:   template.minStopCount }   : {}),
    },
  });

  return created.id;
}

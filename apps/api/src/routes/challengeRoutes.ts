import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import type { EvalInput, ChallengeMetrics } from '../services/challengeService.js';
import {
  seedGlobalChallenges,
  evaluateChallenge,
  computeCollectionMetrics,
  generateChallengeForUser,
} from '../services/challengeService.js';

export const challengeRouter = Router();

// Seed global challenges once per process (idempotent upsert)
let seeded = false;
async function ensureSeeded(): Promise<void> {
  if (!seeded) {
    await seedGlobalChallenges();
    seeded = true;
  }
}

// ── GET / — list all challenges (global + user-generated) with best attempt ──

challengeRouter.get('/', requireAuth, async (req, res, next): Promise<void> => {
  try {
    await ensureSeeded();
    const userId = req.user!.userId;

    const challenges = await prisma.bandRpgChallenge.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: [{ difficulty: 'asc' }, { createdAt: 'asc' }],
      include: {
        attempts: {
          where: { userId },
          orderBy: { completedAt: 'desc' },
        },
      },
    });

    const result = challenges.map((ch) => {
      const achieved = ch.attempts.filter(a => a.achieved);
      const best =
        achieved.length > 0
          ? achieved.reduce((a, b) => {
              const TIER_RANK: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };
              return (TIER_RANK[a.tier ?? ''] ?? 0) >= (TIER_RANK[b.tier ?? ''] ?? 0) ? a : b;
            })
          : null;

      return {
        id:            ch.id,
        name:          ch.name,
        description:   ch.description,
        type:          ch.type,
        difficulty:    ch.difficulty,
        rivalName:     ch.rivalName,
        rivalDesc:     ch.rivalDesc,
        targetAudience: ch.targetAudience,
        rewardTitle:   ch.rewardTitle,
        rewardBadge:   ch.rewardBadge,
        minChemistry:  ch.minChemistry,
        minVariety:    ch.minVariety,
        minMomentum:   ch.minMomentum,
        minPrestige:   ch.minPrestige,
        minDiversity:  ch.minDiversity,
        minDeepCut:    ch.minDeepCut,
        minFanService: ch.minFanService,
        minRareSongs:  ch.minRareSongs,
        minAlbums:     ch.minAlbums,
        minStopCount:  ch.minStopCount,
        isGenerated:   ch.isGenerated,
        totalAttempts: ch.attempts.length,
        bestAttempt:   best
          ? {
              tier:        best.tier,
              metricScore: best.metricScore,
              achieved:    best.achieved,
              entityName:  best.entityName,
              completedAt: best.completedAt.toISOString(),
            }
          : null,
      };
    });

    res.json(result); return;
  } catch (err) { next(err); }
});

// ── GET /history — last 50 attempts ──────────────────────────────────────────

challengeRouter.get('/history', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const attempts = await prisma.bandRpgChallengeAttempt.findMany({
      where:   { userId },
      orderBy: { completedAt: 'desc' },
      take:    50,
      include: { challenge: { select: { name: true, difficulty: true, rewardBadge: true } } },
    });

    const result = attempts.map(a => ({
      id:            a.id,
      challengeId:   a.challengeId,
      challengeName: a.challenge.name,
      difficulty:    a.challenge.difficulty,
      rewardBadge:   a.challenge.rewardBadge,
      entityType:    a.entityType,
      entityName:    a.entityName,
      achieved:      a.achieved,
      metricScore:   a.metricScore,
      tier:          a.tier,
      completedAt:   a.completedAt.toISOString(),
    }));

    res.json(result); return;
  } catch (err) { next(err); }
});

// ── GET /stats — aggregate challenge stats ────────────────────────────────────

challengeRouter.get('/stats', requireAuth, async (req, res, next): Promise<void> => {
  try {
    await ensureSeeded();
    const userId = req.user!.userId;

    const [attempts, collMetrics] = await Promise.all([
      prisma.bandRpgChallengeAttempt.findMany({
        where:   { userId },
        include: { challenge: { select: { rewardTitle: true } } },
      }),
      computeCollectionMetrics(userId),
    ]);

    const achievedAttempts  = attempts.filter(a => a.achieved);
    const completedIds      = new Set(achievedAttempts.map(a => a.challengeId));
    const titlesUnlocked    = [...new Set(
      achievedAttempts
        .map(a => a.challenge.rewardTitle)
        .filter((t): t is string => t != null),
    )];

    const TIER_RANK: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };
    let bestTierRank = 0;
    let bestTier: string | null = null;
    for (const a of achievedAttempts) {
      const rank = TIER_RANK[a.tier ?? ''] ?? 0;
      if (rank > bestTierRank) { bestTierRank = rank; bestTier = a.tier; }
    }

    res.json({
      totalAttempts:      attempts.length,
      achievedAttempts:   achievedAttempts.length,
      bestTier,
      titlesUnlocked,
      challengesCompleted: completedIds.size,
      rareSongsCount:     collMetrics.rareSongs,
      albumsCompleted:    collMetrics.albums,
    }); return;
  } catch (err) { next(err); }
});

// ── POST /generate — create a new generated challenge ────────────────────────

challengeRouter.post('/generate', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const id     = await generateChallengeForUser(userId);
    res.json({ ok: true, id }); return;
  } catch (err) { next(err); }
});

// ── POST /:id/attempt — submit a challenge attempt ────────────────────────────

challengeRouter.post('/:id/attempt', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId      = req.user!.userId;
    const challengeId = req.params['id']!;

    const challenge = await prisma.bandRpgChallenge.findFirst({
      where: { id: challengeId, OR: [{ userId: null }, { userId }] },
    });

    if (!challenge) {
      res.status(404).json({ error: 'Challenge not found' }); return;
    }

    const {
      entityType = '',
      entityId   = '',
      entityName = '',
      chemistry,
      variety,
      momentum,
      prestige,
      diversity,
      deepCut,
      fanService,
      stopCount,
    } = req.body as {
      entityType?: string;
      entityId?:   string;
      entityName?: string;
      chemistry?:  number;
      variety?:    number;
      momentum?:   number;
      prestige?:   number;
      diversity?:  number;
      deepCut?:    number;
      fanService?: number;
      stopCount?:  number;
    };

    // Verify entity ownership for non-collection challenges
    if (entityType !== 'collection' && entityId) {
      let owned = false;
      if (entityType === 'festival' || entityType === 'dream_festival') {
        const f = await prisma.bandRpgFestival.findFirst({ where: { id: entityId, userId } });
        owned = f != null;
      } else if (entityType === 'tour') {
        const t = await prisma.bandRpgTour.findFirst({ where: { id: entityId, userId } });
        owned = t != null;
      } else if (entityType === 'concert') {
        const c = await prisma.bandRpgConcert.findFirst({ where: { id: entityId, userId } });
        owned = c != null;
      } else if (entityType === 'setlist') {
        const s = await prisma.bandRpgSetlist.findFirst({ where: { id: entityId, userId } });
        owned = s != null;
      }
      if (!owned) {
        res.status(403).json({ error: 'Entity not owned by user' }); return;
      }
    }

    // Build metrics from client-submitted values (conditional spreads required by exactOptionalPropertyTypes)
    const baseMetrics: ChallengeMetrics = {
      ...(chemistry  != null ? { chemistry }  : {}),
      ...(variety    != null ? { variety }    : {}),
      ...(momentum   != null ? { momentum }   : {}),
      ...(prestige   != null ? { prestige }   : {}),
      ...(diversity  != null ? { diversity }  : {}),
      ...(deepCut    != null ? { deepCut }    : {}),
      ...(fanService != null ? { fanService } : {}),
      ...(stopCount  != null ? { stopCount }  : {}),
    };

    // For collection challenges: compute metrics server-side
    let metrics: ChallengeMetrics = baseMetrics;
    if (challenge.type === 'collection') {
      const coll = await computeCollectionMetrics(userId);
      metrics = { ...baseMetrics, rareSongs: coll.rareSongs, albums: coll.albums };
    }

    const evalInput: EvalInput = {
      minChemistry:  challenge.minChemistry,
      minVariety:    challenge.minVariety,
      minMomentum:   challenge.minMomentum,
      minPrestige:   challenge.minPrestige,
      minDiversity:  challenge.minDiversity,
      minDeepCut:    challenge.minDeepCut,
      minFanService: challenge.minFanService,
      minRareSongs:  challenge.minRareSongs,
      minAlbums:     challenge.minAlbums,
      minStopCount:  challenge.minStopCount,
      difficulty:    challenge.difficulty,
    };
    const result = evaluateChallenge(evalInput, metrics);

    await prisma.bandRpgChallengeAttempt.create({
      data: {
        challengeId,
        userId,
        entityType,
        entityId,
        entityName,
        achieved:    result.achieved,
        metricScore: result.primaryScore,
        ...(result.tier != null ? { tier: result.tier } : {}),
      },
    });

    const message = result.achieved
      ? `${result.tier === 'platinum' ? '🏆 PLATINUM!' : result.tier === 'gold' ? '🥇 Gold!' : result.tier === 'silver' ? '🥈 Silver!' : '🥉 Bronze!'} Challenge complete. Reward: ${challenge.rewardTitle ?? 'Challenger'}.`
      : `Not yet. Keep building. You need to improve your scores to beat this challenge.`;

    res.json({
      achieved:    result.achieved,
      tier:        result.tier,
      metricScore: result.primaryScore,
      margin:      result.margin,
      message,
    }); return;
  } catch (err) { next(err); }
});

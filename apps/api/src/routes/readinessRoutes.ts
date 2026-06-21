import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const readinessRouter = Router();
readinessRouter.use(requireAuth, requireAdmin);

// ── GET / — v1.0 readiness snapshot ──────────────────────────────────────────

readinessRouter.get('/', async (_req, res, next): Promise<void> => {
  try {
    const [
      adventures, publishedAdventures, featuredAdventures,
      levels, publishedLevels, quests, npcs, items, playerProgress,
      uniquePlayers,
    ] = await Promise.all([
      prisma.bandRpgAdventure.count(),
      prisma.bandRpgAdventure.count({ where: { isPublished: true } }),
      prisma.bandRpgAdventure.count({ where: { featured: true } }),
      prisma.bandRpgLevel.count(),
      prisma.bandRpgLevel.count({ where: { isPublished: true } }),
      prisma.bandRpgQuest.count(),
      prisma.bandRpgNpc.count(),
      prisma.bandRpgItem.count(),
      prisma.bandRpgAdventureProgress.count(),
      prisma.bandRpgAdventureProgress.groupBy({ by: ['userId'] }).then(r => r.length),
    ]);

    // Per-adventure health scores
    const allAdventures = await prisma.bandRpgAdventure.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isPublished: true,
        featured: true,
        coverImageUrl: true,
        authorName: true,
        description: true,
        levels: {
          select: {
            id: true,
            slug: true,
            mapData: true,
            npcs: { select: { id: true, name: true } },
            objectives: { select: { id: true } },
          },
        },
        quests: {
          select: {
            id: true,
            giverId: true,
          },
        },
        _count: { select: { levels: true, quests: true, items: true, arcs: true } },
      },
    });

    const adventureHealthScores = allAdventures.map(adv => {
      let score = 0;
      const checks: { name: string; passed: boolean }[] = [];

      const hasLevels = adv._count.levels > 0;
      checks.push({ name: 'Has at least one level', passed: hasLevels });
      if (hasLevels) score += 15;

      const levelSpawns = adv.levels.every(lv => {
        const md = lv.mapData as { entities?: { type: string }[] } | null;
        return (md?.entities ?? []).some(e => e.type === 'spawn');
      });
      checks.push({ name: 'All levels have a spawn point', passed: levelSpawns });
      if (levelSpawns) score += 15;

      const hasQuests = adv._count.quests > 0;
      checks.push({ name: 'Has at least one quest', passed: hasQuests });
      if (hasQuests) score += 10;

      const npcIds = adv.levels.flatMap(l => l.npcs.map(n => n.id));
      const questGiversValid = adv.quests.filter(q => q.giverId).every(q => npcIds.includes(q.giverId!));
      checks.push({ name: 'Quest givers are valid NPCs in this adventure', passed: questGiversValid });
      if (questGiversValid) score += 15;

      const hasObjectives = adv.levels.some(l => l.objectives.length > 0);
      checks.push({ name: 'Has at least one objective', passed: hasObjectives });
      if (hasObjectives) score += 10;

      const hasNameAndDesc = !!(adv.name && adv.description);
      checks.push({ name: 'Has name and description', passed: hasNameAndDesc });
      if (hasNameAndDesc) score += 10;

      const hasCoverAndAuthor = !!(adv.coverImageUrl && adv.authorName);
      checks.push({ name: 'Has cover image and author', passed: hasCoverAndAuthor });
      if (hasCoverAndAuthor) score += 10;

      const isPublished = adv.isPublished;
      checks.push({ name: 'Is published', passed: isPublished });
      if (isPublished) score += 10;

      const isFeatured = adv.featured;
      checks.push({ name: 'Is featured', passed: isFeatured });
      if (isFeatured) score += 5;

      return { id: adv.id, name: adv.name, slug: adv.slug, score, checks };
    });

    const avgHealth = adventureHealthScores.length > 0
      ? Math.round(adventureHealthScores.reduce((s, a) => s + a.score, 0) / adventureHealthScores.length)
      : 0;

    // Readiness checklist
    const readinessChecks = [
      { item: 'At least one adventure exists', passed: adventures > 0 },
      { item: 'At least one adventure is published', passed: publishedAdventures > 0 },
      { item: 'A featured starter adventure exists', passed: featuredAdventures > 0 },
      { item: 'At least 3 levels exist', passed: levels >= 3 },
      { item: 'At least 2 quests exist', passed: quests >= 2 },
      { item: 'At least 1 NPC exists', passed: npcs >= 1 },
      { item: 'Average adventure health score ≥ 70', passed: avgHealth >= 70 },
      { item: 'At least 1 player has started an adventure', passed: uniquePlayers >= 1 },
    ];

    const readinessPct = Math.round(
      (readinessChecks.filter(c => c.passed).length / readinessChecks.length) * 100,
    );

    const issues: string[] = [];
    if (publishedAdventures === 0) issues.push('No published adventures — players cannot browse any content');
    if (featuredAdventures === 0) issues.push('No featured adventure — no recommendation shown to new players');
    const lowHealth = adventureHealthScores.filter(a => a.score < 50);
    if (lowHealth.length > 0) issues.push(`${lowHealth.length} adventure(s) with health score below 50`);
    if (quests === 0) issues.push('No quests defined — players have no objectives');
    if (npcs === 0) issues.push('No NPCs defined — levels will feel empty');

    res.json({
      summary: {
        adventures: { total: adventures, published: publishedAdventures, featured: featuredAdventures },
        levels: { total: levels, published: publishedLevels },
        quests: { total: quests },
        npcs: { total: npcs },
        items: { total: items },
        players: { total: uniquePlayers, progressRecords: playerProgress },
        averageHealthScore: avgHealth,
        readinessPct,
      },
      readinessChecks,
      adventureHealth: adventureHealthScores,
      issues,
    }); return;
  } catch (err) { next(err); return; }
});

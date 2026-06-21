import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const adventureProgressRouter = Router();

// ── GET /browse — published adventures with optional per-user progress overlay ─

adventureProgressRouter.get('/browse', async (req, res, next): Promise<void> => {
  try {
    const { userId, featured, difficulty } = req.query as {
      userId?: string;
      featured?: string;
      difficulty?: string;
    };

    const where: Prisma.BandRpgAdventureWhereInput = { isPublished: true };
    if (featured === 'true') where.featured = true;
    if (difficulty) where.difficulty = difficulty;

    const [adventures, totalInDb, totalPublished] = await Promise.all([
      prisma.bandRpgAdventure.findMany({
        where,
        orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
        include: { _count: { select: { levels: true, quests: true } } },
      }),
      prisma.bandRpgAdventure.count(),
      prisma.bandRpgAdventure.count({ where: { isPublished: true } }),
    ]);
    console.log(`[browse] db_total=${totalInDb} published=${totalPublished} returned=${adventures.length}`);

    // Optionally overlay progress for a specific user
    let progressMap = new Map<string, {
      completionPct: number;
      isCompleted: boolean;
      startedAt: Date;
      lastPlayedAt: Date;
    }>();

    if (userId) {
      const adventureIds = adventures.map(a => a.id);
      const progressRows = await prisma.bandRpgAdventureProgress.findMany({
        where: { userId, adventureId: { in: adventureIds } },
        select: {
          adventureId: true,
          completionPct: true,
          isCompleted: true,
          startedAt: true,
          lastPlayedAt: true,
        },
      });
      progressMap = new Map(progressRows.map(p => [p.adventureId, {
        completionPct: p.completionPct,
        isCompleted: p.isCompleted,
        startedAt: p.startedAt,
        lastPlayedAt: p.lastPlayedAt,
      }]));
    }

    const result = adventures.map(a => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description ?? null,
      coverImageUrl: a.coverImageUrl ?? null,
      authorName: a.authorName ?? null,
      difficulty: a.difficulty ?? null,
      estimatedPlaytime: a.estimatedPlaytime ?? null,
      tags: a.tags,
      featured: a.featured,
      version: a.version,
      _count: a._count,
      progress: userId ? (progressMap.get(a.id) ?? null) : null,
    }));

    res.json({ adventures: result }); return;
  } catch (err) { next(err); return; }
});

// ── GET /my — all adventures the current user has progress on ─────────────────

adventureProgressRouter.get('/my', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const rows = await prisma.bandRpgAdventureProgress.findMany({
      where: { userId },
      orderBy: { lastPlayedAt: 'desc' },
      include: {
        adventure: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            coverImageUrl: true,
            authorName: true,
            difficulty: true,
            estimatedPlaytime: true,
            tags: true,
            featured: true,
            version: true,
          },
        },
      },
    });

    const adventures = rows.map(r => ({
      adventure: r.adventure,
      progress: {
        id: r.id,
        startedAt: r.startedAt,
        completedAt: r.completedAt ?? null,
        lastPlayedAt: r.lastPlayedAt,
        completionPct: r.completionPct,
        questsCompleted: r.questsCompleted,
        itemsCollected: r.itemsCollected,
        levelsDiscovered: r.levelsDiscovered,
        isCompleted: r.isCompleted,
      },
    }));

    res.json({ adventures }); return;
  } catch (err) { next(err); return; }
});

// ── GET /:adventureId — get or create progress for current user ───────────────

adventureProgressRouter.get('/:adventureId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const adventureId = req.params['adventureId']!;

    const adventure = await prisma.bandRpgAdventure.findUnique({
      where: { id: adventureId },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        coverImageUrl: true,
        authorName: true,
        difficulty: true,
        estimatedPlaytime: true,
        tags: true,
        featured: true,
        version: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { levels: true, quests: true, arcs: true, items: true } },
        levels: { select: { slug: true, order: true }, orderBy: { order: 'asc' }, take: 1 },
      },
    });

    if (!adventure) {
      res.status(404).json({ error: 'Adventure not found' }); return;
    }

    const firstLevelSlug = adventure.levels[0]?.slug ?? null;

    const now = new Date();

    const progress = await prisma.bandRpgAdventureProgress.upsert({
      where: { userId_adventureId: { userId, adventureId } },
      update: {},
      create: {
        userId,
        adventureId,
        startedAt: now,
        lastPlayedAt: now,
        completionPct: 0,
        questsCompleted: 0,
        itemsCollected: 0,
        levelsDiscovered: [],
        isCompleted: false,
      },
    });

    // Exclude the `levels` relation array from the response (only used for firstLevelSlug)
    const { levels: _levels, ...adventureData } = adventure;
    void _levels;

    res.json({
      adventure: adventureData,
      firstLevelSlug,
      progress: {
        id: progress.id,
        userId,
        adventureId,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt ?? null,
        lastPlayedAt: progress.lastPlayedAt,
        completionPct: progress.completionPct,
        questsCompleted: progress.questsCompleted,
        itemsCollected: progress.itemsCollected,
        levelsDiscovered: progress.levelsDiscovered,
        isCompleted: progress.isCompleted,
      },
    }); return;
  } catch (err) { next(err); return; }
});

// ── POST /:adventureId/sync — update progress from game engine ────────────────

adventureProgressRouter.post('/:adventureId/sync', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const adventureId = req.params['adventureId']!;

    const {
      levelsDiscovered,
      questsCompleted,
      itemsCollected,
      isCompleted,
    } = req.body as {
      levelsDiscovered?: string[];
      questsCompleted?: number;
      itemsCollected?: number;
      isCompleted?: boolean;
    };

    // Load current progress to determine if isCompleted is newly toggled
    const existing = await prisma.bandRpgAdventureProgress.findUnique({
      where: { userId_adventureId: { userId, adventureId } },
    });

    if (!existing) {
      res.status(404).json({ error: 'Progress record not found. Call GET /:adventureId first to initialise.' }); return;
    }

    // Load adventure totals for completionPct calculation
    const counts = await prisma.bandRpgAdventure.findUnique({
      where: { id: adventureId },
      select: { _count: { select: { quests: true, levels: true } } },
    });

    const totalQuests = counts?._count.quests ?? 0;
    const totalLevels = counts?._count.levels ?? 0;

    const resolvedQuestsCompleted = questsCompleted ?? existing.questsCompleted;
    const resolvedLevelsDiscovered = levelsDiscovered ?? (existing.levelsDiscovered as string[]);
    const resolvedItemsCollected = itemsCollected ?? existing.itemsCollected;
    const resolvedIsCompleted = isCompleted ?? existing.isCompleted;

    // Completion percentage: 50% quest share + 50% levels share, capped at 100
    const questShare = totalQuests > 0 ? (resolvedQuestsCompleted / totalQuests) * 50 : 0;
    const levelShare = totalLevels > 0 ? (resolvedLevelsDiscovered.length / totalLevels) * 50 : 0;
    const completionPct = Math.min(100, questShare + levelShare);

    const now = new Date();

    // Set completedAt only when transitioning to completed for the first time
    const completedAt = resolvedIsCompleted && !existing.isCompleted
      ? now
      : existing.completedAt ?? undefined;

    const updateData: Prisma.BandRpgAdventureProgressUpdateInput = {
      questsCompleted: resolvedQuestsCompleted,
      itemsCollected: resolvedItemsCollected,
      levelsDiscovered: resolvedLevelsDiscovered as Prisma.InputJsonValue,
      isCompleted: resolvedIsCompleted,
      completionPct,
      lastPlayedAt: now,
      ...(completedAt !== undefined ? { completedAt } : {}),
    };

    const updated = await prisma.bandRpgAdventureProgress.update({
      where: { userId_adventureId: { userId, adventureId } },
      data: updateData,
    });

    res.json({
      progress: {
        id: updated.id,
        startedAt: updated.startedAt,
        completedAt: updated.completedAt ?? null,
        lastPlayedAt: updated.lastPlayedAt,
        completionPct: updated.completionPct,
        questsCompleted: updated.questsCompleted,
        itemsCollected: updated.itemsCollected,
        levelsDiscovered: updated.levelsDiscovered,
        isCompleted: updated.isCompleted,
      },
    }); return;
  } catch (err) { next(err); return; }
});

// ── POST /:adventureId/restart — reset progress to zero ──────────────────────

adventureProgressRouter.post('/:adventureId/restart', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const adventureId = req.params['adventureId']!;

    // Verify the adventure exists
    const adventure = await prisma.bandRpgAdventure.findUnique({
      where: { id: adventureId },
      select: { id: true },
    });
    if (!adventure) {
      res.status(404).json({ error: 'Adventure not found' }); return;
    }

    // Delete existing progress then recreate fresh
    await prisma.bandRpgAdventureProgress.deleteMany({
      where: { userId, adventureId },
    });

    const now = new Date();

    const fresh = await prisma.bandRpgAdventureProgress.create({
      data: {
        userId,
        adventureId,
        startedAt: now,
        lastPlayedAt: now,
        completionPct: 0,
        questsCompleted: 0,
        itemsCollected: 0,
        levelsDiscovered: [],
        isCompleted: false,
      },
    });

    res.json({
      progress: {
        id: fresh.id,
        startedAt: fresh.startedAt,
        completedAt: fresh.completedAt ?? null,
        lastPlayedAt: fresh.lastPlayedAt,
        completionPct: fresh.completionPct,
        questsCompleted: fresh.questsCompleted,
        itemsCollected: fresh.itemsCollected,
        levelsDiscovered: fresh.levelsDiscovered,
        isCompleted: fresh.isCompleted,
      },
    }); return;
  } catch (err) { next(err); return; }
});

// ── GET /:adventureId/health — expanded 9-check health score (no auth) ────────

adventureProgressRouter.get('/:adventureId/health', async (req, res, next): Promise<void> => {
  try {
    const adventureId = req.params['adventureId']!;

    const adventure = await prisma.bandRpgAdventure.findUnique({
      where: { id: adventureId },
      include: {
        levels: {
          include: {
            objectives: true,
            npcs: true,
            doors: true,
            switches: true,
            puzzles: true,
          },
        },
        quests: true,
        items: true,
        _count: { select: { levels: true, quests: true, items: true } },
      },
    });

    if (!adventure) {
      res.status(404).json({ error: 'Adventure not found' }); return;
    }

    const adventureLevelIds = new Set(adventure.levels.map(l => l.id));
    const adventureQuestIds = new Set(adventure.quests.map(q => q.id));
    const adventureItemSlugs = new Set(adventure.items.map(i => i.slug));

    interface MapEntity { type: string; x?: number; y?: number; refId?: string; targetLevelSlug?: string; }
    interface MapData { entities?: MapEntity[]; }

    // ── 1: Has at least one level (15) ───────────────────────────────────────
    const hasLevels = adventure._count.levels > 0;

    // ── 2: All levels have a spawn point (15) ────────────────────────────────
    const allLevelsHaveSpawn = adventure.levels.length > 0 && adventure.levels.every(l => {
      const md = l.mapData as unknown as MapData | null;
      return (md?.entities ?? []).some(e => e.type === 'spawn');
    });

    // ── 3: Quest giver NPCs are in this adventure's levels (10) ─────────────
    const adventureNpcIds = new Set(adventure.levels.flatMap(l => l.npcs.map(n => n.id)));
    const questsWithGiver = adventure.quests.filter(q => q.giverId !== null);
    const allQuestGiversValid = questsWithGiver.every(q => !q.giverId || adventureNpcIds.has(q.giverId));

    // ── 4: All timeline entries reference valid adventure content (10) ───────
    const allTimeline = await prisma.bandRpgTimelineEvent.findMany();
    const relevantTimeline = allTimeline.filter(t =>
      t.refId !== null && (adventureLevelIds.has(t.refId) || adventureQuestIds.has(t.refId))
    );
    const allTimelineRefsValid = relevantTimeline.every(t =>
      !t.refId || adventureLevelIds.has(t.refId) || adventureQuestIds.has(t.refId)
    );

    // ── 5: Level exits link to levels that exist in this adventure (10) ──────
    const levelSlugs = new Set(adventure.levels.map(l => l.slug));
    const exitsValid = adventure.levels.every(l => {
      const md = l.mapData as unknown as MapData | null;
      const exits = (md?.entities ?? []).filter(e => e.type === 'exit');
      return exits.every(ex => !ex.targetLevelSlug || levelSlugs.has(ex.targetLevelSlug));
    });

    // ── 6: No item entities reference slugs not in adventure items (10) ──────
    const itemEntitySlugsValid = adventure.levels.every(l => {
      const md = l.mapData as unknown as MapData | null;
      const itemEntities = (md?.entities ?? []).filter(e => e.type === 'item');
      return itemEntities.every(ie => !ie.refId || adventureItemSlugs.has(ie.refId));
    });

    // ── 7: All quests have a giver NPC OR the adventure has level objectives (10)
    const hasAnyObjectives = adventure.levels.some(l => l.objectives.length > 0);
    const allQuestsActionable = adventure.quests.every(q => q.giverId !== null) || hasAnyObjectives;

    // ── 8: Adventure has a name and description (10) ──────────────────────────
    const hasNameAndDescription = Boolean(adventure.name?.trim()) && Boolean(adventure.description?.trim());

    // ── 9: Adventure has cover image and author name (10) ────────────────────
    const hasCoverAndAuthor = Boolean(adventure.coverImageUrl?.trim()) && Boolean(adventure.authorName?.trim());

    const checks: Array<{ name: string; passed: boolean; weight: number }> = [
      { name: 'Has at least one level',                                           passed: hasLevels,                weight: 15 },
      { name: 'All levels have a spawn point',                                    passed: allLevelsHaveSpawn,       weight: 15 },
      { name: 'Quest giver NPCs belong to levels in this adventure',              passed: allQuestGiversValid,      weight: 10 },
      { name: 'Timeline entries reference valid adventure content',               passed: allTimelineRefsValid,     weight: 10 },
      { name: 'Level exits link to levels inside this adventure',                 passed: exitsValid,               weight: 10 },
      { name: 'Map item entities reference known items',                          passed: itemEntitySlugsValid,     weight: 10 },
      { name: 'All quests have objectives or a giver NPC',                       passed: allQuestsActionable,      weight: 10 },
      { name: 'Adventure has a name and description',                             passed: hasNameAndDescription,    weight: 10 },
      { name: 'Adventure has a cover image and author name',                      passed: hasCoverAndAuthor,        weight: 10 },
    ];

    const score = checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);

    res.json({ score, checks }); return;
  } catch (err) { next(err); return; }
});

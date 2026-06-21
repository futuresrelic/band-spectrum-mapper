import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const runtimeRouter = Router();

// ── Local types (mirror frontend MapData contract) ────────────────────────────

interface MapEntity {
  id: string;
  type: 'spawn' | 'exit' | 'npc' | 'item';
  x: number;
  y: number;
  refId?: string;
  targetLevelSlug?: string;
  label?: string;
  condition?: Record<string, unknown>; // Phase Z.3 — WorldCondition for exits/items
}

interface MapData {
  width: number;
  height: number;
  tiles: number[][];
  entities: MapEntity[];
}

interface DialogueLine {
  text: string;
  speakerName?: string;
  portraitUrl?: string;
}

// ── GET /level/:slug — load full playable level ───────────────────────────────

runtimeRouter.get('/level/:slug', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const slug = req.params['slug']!;
    const level = await prisma.bandRpgLevel.findUnique({
      where: { slug },
      include: {
        npcs: true,
        objectives: { orderBy: { order: 'asc' } },
        doors:    { orderBy: [{ tileY: 'asc' }, { tileX: 'asc' }] },
        switches: { orderBy: [{ tileY: 'asc' }, { tileX: 'asc' }] },
        puzzles:  { orderBy: { order: 'asc' } },
      },
    });
    if (!level) { res.status(404).json({ error: 'Level not found' }); return; }

    const mapData = (level.mapData as unknown as MapData | null) ?? {
      width: 20, height: 15, tiles: [], entities: [],
    };
    const entities: MapEntity[] = mapData.entities ?? [];

    // ── Resolve NPC entity placements ────────────────────────────────────────
    const npcById = new Map(level.npcs.map(n => [n.id, n]));
    const runtimeNpcs: object[] = [];
    const placedNpcIds = new Set<string>();

    for (const e of entities) {
      if (e.type !== 'npc' || !e.refId) continue;
      const npc = npcById.get(e.refId);
      if (!npc) continue;
      placedNpcIds.add(npc.id);
      runtimeNpcs.push({
        id: npc.id, name: npc.name, role: npc.role,
        portraitUrl: npc.portraitUrl,
        dialogue: (npc.defaultDialogue as unknown as DialogueLine[]) ?? [],
        tileX: e.x, tileY: e.y,
        visibilityCondition: npc.visibilityCondition ?? null,
      });
    }

    // NPCs without a map entity use their stored positionX/Y
    for (const npc of level.npcs) {
      if (placedNpcIds.has(npc.id)) continue;
      runtimeNpcs.push({
        id: npc.id, name: npc.name, role: npc.role,
        portraitUrl: npc.portraitUrl,
        dialogue: (npc.defaultDialogue as unknown as DialogueLine[]) ?? [],
        tileX: npc.positionX, tileY: npc.positionY,
        visibilityCondition: npc.visibilityCondition ?? null,
      });
    }

    // ── Resolve item entity placements ───────────────────────────────────────
    const itemRefIds = entities
      .filter(e => e.type === 'item' && e.refId)
      .map(e => e.refId as string);

    const itemsDb = itemRefIds.length > 0
      ? await prisma.bandRpgItem.findMany({ where: { id: { in: itemRefIds } } })
      : [];
    const itemById = new Map(itemsDb.map(i => [i.id, i]));

    const runtimeItems: object[] = [];
    for (const e of entities) {
      if (e.type !== 'item' || !e.refId) continue;
      const item = itemById.get(e.refId);
      if (!item) continue;
      runtimeItems.push({
        id: item.id, entityId: e.id,
        name: item.name, description: item.description,
        rarity: item.rarity, scoreValue: item.scoreValue,
        iconUrl: item.iconUrl, tileX: e.x, tileY: e.y,
        spawnCondition: e.condition ?? null,  // Phase Z.3 — from map entity
      });
    }

    // ── Resolve exits ────────────────────────────────────────────────────────
    const runtimeExits = entities
      .filter(e => e.type === 'exit' && e.targetLevelSlug)
      .map(e => ({
        tileX: e.x, tileY: e.y,
        targetLevelSlug: e.targetLevelSlug!,
        label: e.label,
        condition: e.condition ?? null,  // Phase Z.3 — hide until condition met
      }));

    // ── Spawn position ───────────────────────────────────────────────────────
    const spawnEntity = entities.find(e => e.type === 'spawn');
    const spawnX = spawnEntity?.x ?? level.spawnX;
    const spawnY = spawnEntity?.y ?? level.spawnY;

    // ── Quests linked to this level's NPCs ───────────────────────────────────
    const npcIds = level.npcs.map(n => n.id);
    const quests = npcIds.length > 0
      ? await prisma.bandRpgQuest.findMany({
          where: { giverId: { in: npcIds } },
          orderBy: { order: 'asc' },
        })
      : [];

    // ── Story beats attached to this level ───────────────────────────────────
    const beats = await prisma.bandRpgStoryBeat.findMany({
      where: { levelId: level.id },
      orderBy: { order: 'asc' },
    });

    res.json({
      id: level.id, slug: level.slug, name: level.name,
      background: level.background,
      mapData, spawnX, spawnY,
      npcs: runtimeNpcs,
      items: runtimeItems,
      exits: runtimeExits,
      quests, beats,
      objectives: level.objectives,
      doors: level.doors,
      switches: level.switches,
      puzzles: level.puzzles,
    });
    return;
  } catch (err) { next(err); return; }
});

// ── GET /save — load player progress ─────────────────────────────────────────

runtimeRouter.get('/save', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const progress = await prisma.bandRpgPlayerProgress.findUnique({ where: { userId } });

    if (!progress) {
      res.json({
        currentLevelSlug: null,
        completedObjectives: [],
        completedQuests: [],
        inventory: [],
        unlockedStoryBeats: [],
        activeQuestIds: [],
        objectiveProgress: {},
        unlockedLevelSlugs: [],
        openedDoors: [],
        activatedSwitches: [],
        worldState: {},
      });
      return;
    }

    let currentLevelSlug: string | null = null;
    if (progress.currentLevelId) {
      const lv = await prisma.bandRpgLevel.findUnique({
        where: { id: progress.currentLevelId },
        select: { slug: true },
      });
      currentLevelSlug = lv?.slug ?? null;
    }

    res.json({
      currentLevelSlug,
      completedObjectives: (progress.completedObjectives as string[]) ?? [],
      completedQuests: (progress.completedQuests as string[]) ?? [],
      inventory: (progress.inventory as object[]) ?? [],
      unlockedStoryBeats: (progress.unlockedStoryBeats as string[]) ?? [],
      activeQuestIds: (progress.activeQuestIds as string[]) ?? [],
      objectiveProgress: (progress.objectiveProgress as Record<string, number>) ?? {},
      unlockedLevelSlugs: (progress.unlockedLevelSlugs as string[]) ?? [],
      openedDoors: (progress.openedDoors as string[]) ?? [],
      activatedSwitches: (progress.activatedSwitches as string[]) ?? [],
      worldState: (progress.worldState as Record<string, unknown>) ?? {},
    });
    return;
  } catch (err) { next(err); return; }
});

// ── POST /save — persist player progress ─────────────────────────────────────

runtimeRouter.post('/save', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const {
      currentLevelSlug, completedObjectives, completedQuests,
      inventory, unlockedStoryBeats,
      activeQuestIds, objectiveProgress, unlockedLevelSlugs,
      openedDoors, activatedSwitches, worldState,
    } = req.body as {
      currentLevelSlug?: string | null;
      completedObjectives?: string[];
      completedQuests?: string[];
      inventory?: Array<{ itemId: string; quantity: number }>;
      unlockedStoryBeats?: string[];
      activeQuestIds?: string[];
      objectiveProgress?: Record<string, number>;
      unlockedLevelSlugs?: string[];
      openedDoors?: string[];
      activatedSwitches?: string[];
      worldState?: Record<string, unknown>;
    };

    // Resolve level slug → id
    let currentLevelId: string | null | undefined = undefined;
    if (currentLevelSlug !== undefined) {
      if (currentLevelSlug === null) {
        currentLevelId = null;
      } else {
        const lv = await prisma.bandRpgLevel.findUnique({
          where: { slug: currentLevelSlug },
          select: { id: true },
        });
        currentLevelId = lv?.id ?? null;
      }
    }

    const updateData: Prisma.BandRpgPlayerProgressUncheckedUpdateInput = {
      lastPlayedAt: new Date(),
    };
    if (currentLevelId !== undefined) updateData.currentLevelId = currentLevelId;
    if (completedObjectives !== undefined) updateData.completedObjectives = completedObjectives as Prisma.InputJsonValue;
    if (completedQuests !== undefined) updateData.completedQuests = completedQuests as Prisma.InputJsonValue;
    if (inventory !== undefined) updateData.inventory = inventory as Prisma.InputJsonValue;
    if (unlockedStoryBeats !== undefined) updateData.unlockedStoryBeats = unlockedStoryBeats as Prisma.InputJsonValue;
    if (activeQuestIds !== undefined) updateData.activeQuestIds = activeQuestIds as Prisma.InputJsonValue;
    if (objectiveProgress !== undefined) updateData.objectiveProgress = objectiveProgress as Prisma.InputJsonValue;
    if (unlockedLevelSlugs !== undefined) updateData.unlockedLevelSlugs = unlockedLevelSlugs as Prisma.InputJsonValue;
    if (openedDoors !== undefined) updateData.openedDoors = openedDoors as Prisma.InputJsonValue;
    if (activatedSwitches !== undefined) updateData.activatedSwitches = activatedSwitches as Prisma.InputJsonValue;
    if (worldState !== undefined) updateData.worldState = worldState as Prisma.InputJsonValue;

    const createData: Prisma.BandRpgPlayerProgressUncheckedCreateInput = {
      userId,
      lastPlayedAt: new Date(),
    };
    if (currentLevelId !== undefined) createData.currentLevelId = currentLevelId;
    if (completedObjectives !== undefined) createData.completedObjectives = completedObjectives as Prisma.InputJsonValue;
    if (completedQuests !== undefined) createData.completedQuests = completedQuests as Prisma.InputJsonValue;
    if (inventory !== undefined) createData.inventory = inventory as Prisma.InputJsonValue;
    if (unlockedStoryBeats !== undefined) createData.unlockedStoryBeats = unlockedStoryBeats as Prisma.InputJsonValue;
    if (activeQuestIds !== undefined) createData.activeQuestIds = activeQuestIds as Prisma.InputJsonValue;
    if (objectiveProgress !== undefined) createData.objectiveProgress = objectiveProgress as Prisma.InputJsonValue;
    if (unlockedLevelSlugs !== undefined) createData.unlockedLevelSlugs = unlockedLevelSlugs as Prisma.InputJsonValue;
    if (openedDoors !== undefined) createData.openedDoors = openedDoors as Prisma.InputJsonValue;
    if (activatedSwitches !== undefined) createData.activatedSwitches = activatedSwitches as Prisma.InputJsonValue;
    if (worldState !== undefined) createData.worldState = worldState as Prisma.InputJsonValue;

    await prisma.bandRpgPlayerProgress.upsert({
      where: { userId },
      update: updateData,
      create: createData,
    });

    res.json({ ok: true });
    return;
  } catch (err) { next(err); return; }
});

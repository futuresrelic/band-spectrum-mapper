import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { BandRpgObjectiveType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const levelEditorRouter = Router();

// ── Levels ────────────────────────────────────────────────────────────────────

levelEditorRouter.get('/', requireAuth, requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const levels = await prisma.bandRpgLevel.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true, slug: true, name: true, description: true, order: true,
        bandId: true, albumId: true, songId: true, background: true,
        spawnX: true, spawnY: true, isPublished: true, createdAt: true, updatedAt: true,
        mapData: true,
        _count: { select: { objectives: true, npcs: true } },
      },
    });
    res.json(levels); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.post('/', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const {
      slug, name, description, order, bandId, albumId, songId,
      background, spawnX, spawnY, isPublished,
    } = req.body as {
      slug: string; name: string; description?: string; order?: number;
      bandId?: string; albumId?: string; songId?: string;
      background?: string; spawnX?: number; spawnY?: number; isPublished?: boolean;
    };
    const level = await prisma.bandRpgLevel.create({
      data: {
        slug, name,
        ...(description !== undefined ? { description } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(bandId !== undefined ? { bandId } : {}),
        ...(albumId !== undefined ? { albumId } : {}),
        ...(songId !== undefined ? { songId } : {}),
        ...(background !== undefined ? { background } : {}),
        ...(spawnX !== undefined ? { spawnX } : {}),
        ...(spawnY !== undefined ? { spawnY } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
      },
    });
    res.status(201).json(level); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.get('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const level = await prisma.bandRpgLevel.findUnique({
      where: { id },
      include: {
        objectives: { orderBy: { order: 'asc' } },
        npcs: { orderBy: { name: 'asc' } },
      },
    });
    if (!level) { res.status(404).json({ error: 'Level not found' }); return; }
    res.json(level); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.put('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const {
      slug, name, description, order, bandId, albumId, songId,
      background, spawnX, spawnY, isPublished,
    } = req.body as {
      slug?: string; name?: string; description?: string; order?: number;
      bandId?: string | null; albumId?: string | null; songId?: string | null;
      background?: string | null; spawnX?: number; spawnY?: number; isPublished?: boolean;
    };
    const data: Prisma.BandRpgLevelUpdateInput = {};
    if (slug !== undefined) data.slug = slug;
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (order !== undefined) data.order = order;
    if (bandId !== undefined) data.bandId = bandId;
    if (albumId !== undefined) data.albumId = albumId;
    if (songId !== undefined) data.songId = songId;
    if (background !== undefined) data.background = background;
    if (spawnX !== undefined) data.spawnX = spawnX;
    if (spawnY !== undefined) data.spawnY = spawnY;
    if (isPublished !== undefined) data.isPublished = isPublished;
    const level = await prisma.bandRpgLevel.update({ where: { id }, data });
    res.json(level); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.delete('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    await prisma.bandRpgLevel.delete({ where: { id } });
    res.status(204).end(); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.put('/:id/map', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const { mapData } = req.body as { mapData: unknown };
    const level = await prisma.bandRpgLevel.update({
      where: { id },
      data: { mapData: mapData as Prisma.InputJsonValue },
    });
    res.json(level); return;
  } catch (err) { next(err); return; }
});

// ── Objectives ────────────────────────────────────────────────────────────────

levelEditorRouter.get('/:id/objectives', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['id']!;
    const objectives = await prisma.bandRpgObjective.findMany({
      where: { levelId },
      orderBy: { order: 'asc' },
    });
    res.json(objectives); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.post('/:id/objectives', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['id']!;
    const {
      name, type, description, target, condition, reward,
      dialogueText, prerequisiteId, isOptional, order,
    } = req.body as {
      name: string;
      type: string;
      description?: string;
      target?: string;
      condition?: unknown;
      reward?: unknown;
      dialogueText?: string;
      prerequisiteId?: string;
      isOptional?: boolean;
      order?: number;
    };
    const objective = await prisma.bandRpgObjective.create({
      data: {
        levelId,
        name,
        type: type as BandRpgObjectiveType,
        ...(description !== undefined ? { description } : {}),
        ...(target !== undefined ? { target } : {}),
        ...(condition !== undefined ? { condition: condition as Prisma.InputJsonValue } : {}),
        ...(reward !== undefined ? { reward: reward as Prisma.InputJsonValue } : {}),
        ...(dialogueText !== undefined ? { dialogueText } : {}),
        ...(prerequisiteId !== undefined ? { prerequisiteId } : {}),
        ...(isOptional !== undefined ? { isOptional } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });
    res.status(201).json(objective); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.put('/:id/objectives/:objId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const objId = req.params['objId']!;
    const {
      name, type, description, target, condition, reward,
      dialogueText, prerequisiteId, isOptional, order,
    } = req.body as {
      name?: string; type?: string; description?: string; target?: string;
      condition?: unknown; reward?: unknown; dialogueText?: string;
      prerequisiteId?: string | null; isOptional?: boolean; order?: number;
    };
    const data: Prisma.BandRpgObjectiveUncheckedUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type as BandRpgObjectiveType;
    if (description !== undefined) data.description = description;
    if (target !== undefined) data.target = target;
    if (condition !== undefined) data.condition = condition as Prisma.InputJsonValue;
    if (reward !== undefined) data.reward = reward as Prisma.InputJsonValue;
    if (dialogueText !== undefined) data.dialogueText = dialogueText;
    if (prerequisiteId !== undefined) data.prerequisiteId = prerequisiteId;
    if (isOptional !== undefined) data.isOptional = isOptional;
    if (order !== undefined) data.order = order;
    const objective = await prisma.bandRpgObjective.update({ where: { id: objId }, data });
    res.json(objective); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.delete('/:id/objectives/:objId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const objId = req.params['objId']!;
    await prisma.bandRpgObjective.delete({ where: { id: objId } });
    res.status(204).end(); return;
  } catch (err) { next(err); return; }
});

// ── NPCs ──────────────────────────────────────────────────────────────────────

levelEditorRouter.get('/:id/npcs', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['id']!;
    const npcs = await prisma.bandRpgNpc.findMany({
      where: { levelId },
      orderBy: { name: 'asc' },
    });
    res.json(npcs); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.post('/:id/npcs', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['id']!;
    const {
      name, role, faction, portraitUrl, characterSkinId,
      defaultDialogue, positionX, positionY, bandMemberId,
    } = req.body as {
      name: string; role?: string; faction?: string; portraitUrl?: string;
      characterSkinId?: string; defaultDialogue?: unknown;
      positionX?: number; positionY?: number; bandMemberId?: string;
    };
    const npc = await prisma.bandRpgNpc.create({
      data: {
        levelId,
        name,
        ...(role !== undefined ? { role } : {}),
        ...(faction !== undefined ? { faction } : {}),
        ...(portraitUrl !== undefined ? { portraitUrl } : {}),
        ...(characterSkinId !== undefined ? { characterSkinId } : {}),
        ...(defaultDialogue !== undefined ? { defaultDialogue: defaultDialogue as Prisma.InputJsonValue } : {}),
        ...(positionX !== undefined ? { positionX } : {}),
        ...(positionY !== undefined ? { positionY } : {}),
        ...(bandMemberId !== undefined ? { bandMemberId } : {}),
      },
    });
    res.status(201).json(npc); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.put('/:id/npcs/:npcId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const npcId = req.params['npcId']!;
    const {
      name, role, faction, portraitUrl, characterSkinId,
      defaultDialogue, positionX, positionY, bandMemberId,
    } = req.body as {
      name?: string; role?: string | null; faction?: string | null;
      portraitUrl?: string | null; characterSkinId?: string | null;
      defaultDialogue?: unknown; positionX?: number; positionY?: number;
      bandMemberId?: string | null;
    };
    const data: Prisma.BandRpgNpcUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (faction !== undefined) data.faction = faction;
    if (portraitUrl !== undefined) data.portraitUrl = portraitUrl;
    if (characterSkinId !== undefined) data.characterSkinId = characterSkinId;
    if (defaultDialogue !== undefined) data.defaultDialogue = defaultDialogue as Prisma.InputJsonValue;
    if (positionX !== undefined) data.positionX = positionX;
    if (positionY !== undefined) data.positionY = positionY;
    if (bandMemberId !== undefined) data.bandMemberId = bandMemberId;
    const npc = await prisma.bandRpgNpc.update({ where: { id: npcId }, data });
    res.json(npc); return;
  } catch (err) { next(err); return; }
});

levelEditorRouter.delete('/:id/npcs/:npcId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const npcId = req.params['npcId']!;
    await prisma.bandRpgNpc.delete({ where: { id: npcId } });
    res.status(204).end(); return;
  } catch (err) { next(err); return; }
});

import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const questEditorRouter = Router();

questEditorRouter.get('/', requireAuth, requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const quests = await prisma.bandRpgQuest.findMany({ orderBy: { order: 'asc' } });
    res.json(quests); return;
  } catch (err) { next(err); return; }
});

questEditorRouter.post('/', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const {
      slug, name, description, giverId, objectiveIds, branchPaths, reward,
      unlocksQuestId, unlocksLevelId, storyBeatId, isOptional, order,
    } = req.body as {
      slug: string; name: string; description?: string; giverId?: string;
      objectiveIds?: unknown; branchPaths?: unknown; reward?: unknown;
      unlocksQuestId?: string; unlocksLevelId?: string; storyBeatId?: string;
      isOptional?: boolean; order?: number;
    };
    const quest = await prisma.bandRpgQuest.create({
      data: {
        slug, name,
        ...(description !== undefined ? { description } : {}),
        ...(giverId !== undefined ? { giverId } : {}),
        ...(objectiveIds !== undefined ? { objectiveIds: objectiveIds as Prisma.InputJsonValue } : {}),
        ...(branchPaths !== undefined ? { branchPaths: branchPaths as Prisma.InputJsonValue } : {}),
        ...(reward !== undefined ? { reward: reward as Prisma.InputJsonValue } : {}),
        ...(unlocksQuestId !== undefined ? { unlocksQuestId } : {}),
        ...(unlocksLevelId !== undefined ? { unlocksLevelId } : {}),
        ...(storyBeatId !== undefined ? { storyBeatId } : {}),
        ...(isOptional !== undefined ? { isOptional } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });
    res.status(201).json(quest); return;
  } catch (err) { next(err); return; }
});

questEditorRouter.get('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const quest = await prisma.bandRpgQuest.findUnique({ where: { id } });
    if (!quest) { res.status(404).json({ error: 'Quest not found' }); return; }
    res.json(quest); return;
  } catch (err) { next(err); return; }
});

questEditorRouter.put('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const {
      slug, name, description, giverId, objectiveIds, branchPaths, reward,
      unlocksQuestId, unlocksLevelId, storyBeatId, isOptional, order,
    } = req.body as {
      slug?: string; name?: string; description?: string; giverId?: string | null;
      objectiveIds?: unknown; branchPaths?: unknown; reward?: unknown;
      unlocksQuestId?: string | null; unlocksLevelId?: string | null;
      storyBeatId?: string | null; isOptional?: boolean; order?: number;
    };
    const data: Prisma.BandRpgQuestUpdateInput = {};
    if (slug !== undefined) data.slug = slug;
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (giverId !== undefined) data.giverId = giverId;
    if (objectiveIds !== undefined) data.objectiveIds = objectiveIds as Prisma.InputJsonValue;
    if (branchPaths !== undefined) data.branchPaths = branchPaths as Prisma.InputJsonValue;
    if (reward !== undefined) data.reward = reward as Prisma.InputJsonValue;
    if (unlocksQuestId !== undefined) data.unlocksQuestId = unlocksQuestId;
    if (unlocksLevelId !== undefined) data.unlocksLevelId = unlocksLevelId;
    if (storyBeatId !== undefined) data.storyBeatId = storyBeatId;
    if (isOptional !== undefined) data.isOptional = isOptional;
    if (order !== undefined) data.order = order;
    const quest = await prisma.bandRpgQuest.update({ where: { id }, data });
    res.json(quest); return;
  } catch (err) { next(err); return; }
});

questEditorRouter.delete('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    await prisma.bandRpgQuest.delete({ where: { id } });
    res.status(204).end(); return;
  } catch (err) { next(err); return; }
});

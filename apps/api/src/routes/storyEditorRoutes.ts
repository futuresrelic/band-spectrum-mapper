import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { BandRpgBeatType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const storyEditorRouter = Router();

// ── Story Arcs ────────────────────────────────────────────────────────────────

storyEditorRouter.get('/arcs', requireAuth, requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const arcs = await prisma.bandRpgStoryArc.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { beats: true } } },
    });
    res.json(arcs); return;
  } catch (err) { next(err); return; }
});

storyEditorRouter.post('/arcs', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { slug, title, description, order } = req.body as {
      slug: string; title: string; description?: string; order?: number;
    };
    const arc = await prisma.bandRpgStoryArc.create({
      data: {
        slug, title,
        ...(description !== undefined ? { description } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });
    res.status(201).json(arc); return;
  } catch (err) { next(err); return; }
});

storyEditorRouter.get('/arcs/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const arc = await prisma.bandRpgStoryArc.findUnique({ where: { id } });
    if (!arc) { res.status(404).json({ error: 'Story arc not found' }); return; }
    res.json(arc); return;
  } catch (err) { next(err); return; }
});

storyEditorRouter.put('/arcs/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const { slug, title, description, order } = req.body as {
      slug?: string; title?: string; description?: string; order?: number;
    };
    const data: Prisma.BandRpgStoryArcUpdateInput = {};
    if (slug !== undefined) data.slug = slug;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (order !== undefined) data.order = order;
    const arc = await prisma.bandRpgStoryArc.update({ where: { id }, data });
    res.json(arc); return;
  } catch (err) { next(err); return; }
});

storyEditorRouter.delete('/arcs/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    await prisma.bandRpgStoryArc.delete({ where: { id } });
    res.status(204).end(); return;
  } catch (err) { next(err); return; }
});

// ── Story Beats (arc-scoped) ──────────────────────────────────────────────────

storyEditorRouter.get('/arcs/:id/beats', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const arcId = req.params['id']!;
    const beats = await prisma.bandRpgStoryBeat.findMany({
      where: { arcId },
      orderBy: { order: 'asc' },
    });
    res.json(beats); return;
  } catch (err) { next(err); return; }
});

storyEditorRouter.post('/arcs/:id/beats', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const arcId = req.params['id']!;
    const { type, content, unlockCondition, order, levelId } = req.body as {
      type: string; content?: unknown; unlockCondition?: unknown; order?: number; levelId?: string;
    };
    const beat = await prisma.bandRpgStoryBeat.create({
      data: {
        arcId,
        type: type as BandRpgBeatType,
        ...(content !== undefined ? { content: content as Prisma.InputJsonValue } : {}),
        ...(unlockCondition !== undefined ? { unlockCondition: unlockCondition as Prisma.InputJsonValue } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(levelId !== undefined ? { levelId } : {}),
      },
    });
    res.status(201).json(beat); return;
  } catch (err) { next(err); return; }
});

// PUT /arcs/:id/beats/reorder must come BEFORE /:beatId to avoid route collision
storyEditorRouter.put('/arcs/:id/beats/reorder', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    await Promise.all(
      orderedIds.map((beatId, idx) =>
        prisma.bandRpgStoryBeat.update({ where: { id: beatId }, data: { order: idx } })
      )
    );
    res.json({ ok: true }); return;
  } catch (err) { next(err); return; }
});

storyEditorRouter.put('/arcs/:id/beats/:beatId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const beatId = req.params['beatId']!;
    const { type, content, unlockCondition, order, levelId } = req.body as {
      type?: string; content?: unknown; unlockCondition?: unknown; order?: number; levelId?: string | null;
    };
    const data: Prisma.BandRpgStoryBeatUncheckedUpdateInput = {};
    if (type !== undefined) data.type = type as BandRpgBeatType;
    if (content !== undefined) data.content = content as Prisma.InputJsonValue;
    if (unlockCondition !== undefined) data.unlockCondition = unlockCondition as Prisma.InputJsonValue;
    if (order !== undefined) data.order = order;
    if (levelId !== undefined) data.levelId = levelId;
    const beat = await prisma.bandRpgStoryBeat.update({ where: { id: beatId }, data });
    res.json(beat); return;
  } catch (err) { next(err); return; }
});

storyEditorRouter.delete('/arcs/:id/beats/:beatId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const beatId = req.params['beatId']!;
    await prisma.bandRpgStoryBeat.delete({ where: { id: beatId } });
    res.status(204).end(); return;
  } catch (err) { next(err); return; }
});

// ── Standalone beats (no arc) ─────────────────────────────────────────────────

storyEditorRouter.get('/beats/standalone', requireAuth, requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const beats = await prisma.bandRpgStoryBeat.findMany({
      where: { arcId: null },
      orderBy: { order: 'asc' },
    });
    res.json(beats); return;
  } catch (err) { next(err); return; }
});

storyEditorRouter.post('/beats/standalone', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { type, content, unlockCondition, order, levelId } = req.body as {
      type: string; content?: unknown; unlockCondition?: unknown; order?: number; levelId?: string;
    };
    const beat = await prisma.bandRpgStoryBeat.create({
      data: {
        type: type as BandRpgBeatType,
        ...(content !== undefined ? { content: content as Prisma.InputJsonValue } : {}),
        ...(unlockCondition !== undefined ? { unlockCondition: unlockCondition as Prisma.InputJsonValue } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(levelId !== undefined ? { levelId } : {}),
      },
    });
    res.status(201).json(beat); return;
  } catch (err) { next(err); return; }
});

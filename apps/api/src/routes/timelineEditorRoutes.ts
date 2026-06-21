import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const timelineEditorRouter = Router();

// PUT /reorder must come BEFORE /:id to avoid Express matching "reorder" as an ID
timelineEditorRouter.put('/reorder', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    await Promise.all(
      orderedIds.map((id, idx) =>
        prisma.bandRpgTimelineEvent.update({ where: { id }, data: { order: idx } })
      )
    );
    res.json({ ok: true }); return;
  } catch (err) { next(err); return; }
});

timelineEditorRouter.get('/', requireAuth, requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const events = await prisma.bandRpgTimelineEvent.findMany({ orderBy: { order: 'asc' } });
    res.json(events); return;
  } catch (err) { next(err); return; }
});

timelineEditorRouter.post('/', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { title, type, refId, isRequired, order } = req.body as {
      title: string; type: string; refId?: string; isRequired?: boolean; order?: number;
    };
    const event = await prisma.bandRpgTimelineEvent.create({
      data: {
        title, type,
        ...(refId !== undefined ? { refId } : {}),
        ...(isRequired !== undefined ? { isRequired } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });
    res.status(201).json(event); return;
  } catch (err) { next(err); return; }
});

timelineEditorRouter.get('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const event = await prisma.bandRpgTimelineEvent.findUnique({ where: { id } });
    if (!event) { res.status(404).json({ error: 'Timeline event not found' }); return; }
    res.json(event); return;
  } catch (err) { next(err); return; }
});

timelineEditorRouter.put('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const { title, type, refId, isRequired, order } = req.body as {
      title?: string; type?: string; refId?: string | null; isRequired?: boolean; order?: number;
    };
    const data: Prisma.BandRpgTimelineEventUpdateInput = {};
    if (title !== undefined) data.title = title;
    if (type !== undefined) data.type = type;
    if (refId !== undefined) data.refId = refId;
    if (isRequired !== undefined) data.isRequired = isRequired;
    if (order !== undefined) data.order = order;
    const event = await prisma.bandRpgTimelineEvent.update({ where: { id }, data });
    res.json(event); return;
  } catch (err) { next(err); return; }
});

timelineEditorRouter.delete('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    await prisma.bandRpgTimelineEvent.delete({ where: { id } });
    res.status(204).end(); return;
  } catch (err) { next(err); return; }
});

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const nodeSequencesRouter = Router();
nodeSequencesRouter.use(requireAuth);

function formatSeq(s: {
  id: string; name: string; stepsJson: string; isPublic: boolean; updatedAt: Date;
}) {
  return {
    id:       s.id,
    name:     s.name,
    steps:    JSON.parse(s.stepsJson) as unknown[],
    isPublic: s.isPublic,
    savedAt:  s.updatedAt.toISOString(),
  };
}

// GET /api/node-sequences
// Admins: their own sequences.
// Regular users: only sequences that an admin has marked public.
nodeSequencesRouter.get('/', async (req, res): Promise<void> => {
  const userId  = req.user!.userId;
  const isAdmin = req.user!.isAdmin === true;

  if (isAdmin) {
    const seqs = await prisma.userNodeSequence.findMany({
      where:   { userId },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(seqs.map(formatSeq)); return;
  }

  // Non-admin: public sequences only (created by anyone with isPublic=true)
  const seqs = await prisma.userNodeSequence.findMany({
    where:   { isPublic: true },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(seqs.map(formatSeq)); return;
});

// POST /api/node-sequences  (admin only — regular users cannot create sequences)
nodeSequencesRouter.post('/', requireAdmin, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { name, steps } = req.body as { name: string; steps: unknown[] };
  if (!name || !Array.isArray(steps)) {
    res.status(400).json({ error: 'name and steps required' }); return;
  }
  const seq = await prisma.userNodeSequence.create({
    data: { userId, name: name.trim(), stepsJson: JSON.stringify(steps) },
  });
  res.status(201).json(formatSeq(seq)); return;
});

// PUT /api/node-sequences/:id  (admin only)
nodeSequencesRouter.put('/:id', requireAdmin, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const seqId  = req.params['id'] ?? '';
  const { name, steps } = req.body as { name?: string; steps?: unknown[] };
  const result = await prisma.userNodeSequence.updateMany({
    where: { id: seqId, userId },
    data: {
      ...(name  ? { name: name.trim() }               : {}),
      ...(steps ? { stepsJson: JSON.stringify(steps) } : {}),
    },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.status(204).end(); return;
});

// PATCH /api/node-sequences/:id/toggle-public  (admin only)
// Toggles isPublic on the sequence; returns the new value.
nodeSequencesRouter.patch('/:id/toggle-public', requireAdmin, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const seqId  = req.params['id'] ?? '';
  const seq = await prisma.userNodeSequence.findFirst({ where: { id: seqId, userId } });
  if (!seq) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.userNodeSequence.update({
    where: { id: seq.id },
    data:  { isPublic: !seq.isPublic },
  });
  res.json({ isPublic: updated.isPublic }); return;
});

// DELETE /api/node-sequences/:id  (admin only)
nodeSequencesRouter.delete('/:id', requireAdmin, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const seqId  = req.params['id'] ?? '';
  await prisma.userNodeSequence.deleteMany({ where: { id: seqId, userId } });
  res.status(204).end(); return;
});

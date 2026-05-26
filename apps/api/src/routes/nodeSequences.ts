import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const nodeSequencesRouter = Router();
nodeSequencesRouter.use(requireAuth);

function formatSeq(s: { id: string; name: string; stepsJson: string; updatedAt: Date }) {
  return {
    id: s.id,
    name: s.name,
    steps: JSON.parse(s.stepsJson) as unknown[],
    savedAt: s.updatedAt.toISOString(),
  };
}

// GET /api/node-sequences
nodeSequencesRouter.get('/', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const seqs = await prisma.userNodeSequence.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(seqs.map(formatSeq)); return;
});

// POST /api/node-sequences
nodeSequencesRouter.post('/', async (req, res): Promise<void> => {
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

// PUT /api/node-sequences/:id
nodeSequencesRouter.put('/:id', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { name, steps } = req.body as { name?: string; steps?: unknown[] };
  const result = await prisma.userNodeSequence.updateMany({
    where: { id: req.params['id'], userId },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(steps ? { stepsJson: JSON.stringify(steps) } : {}),
    },
  });
  if (result.count === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.status(204).end(); return;
});

// DELETE /api/node-sequences/:id
nodeSequencesRouter.delete('/:id', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  await prisma.userNodeSequence.deleteMany({
    where: { id: req.params['id'], userId },
  });
  res.status(204).end(); return;
});

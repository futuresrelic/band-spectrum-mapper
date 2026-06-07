import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const cinemaPersistenceRouter = Router();
cinemaPersistenceRouter.use(requireAuth);
cinemaPersistenceRouter.use(requireAdmin);

// Ensure a row exists for this user and return it
async function getOrCreateRow(userId: string) {
  const existing = await prisma.userCinemaData.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.userCinemaData.create({ data: { userId } });
}

// GET /api/cinema/data — return all Cinema persistence data for the admin user
cinemaPersistenceRouter.get('/data', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const row = await getOrCreateRow(userId);
  res.json({
    presets:          JSON.parse(row.presetsJson)       as unknown[],
    snapshots:        JSON.parse(row.snapshotsJson)     as unknown[],
    directorKeyframes: JSON.parse(row.directorKfsJson)  as unknown[],
    sceneKeyframes:   JSON.parse(row.sceneKfsJson)      as unknown,
    nodeOverrides:    JSON.parse(row.nodeOverridesJson)  as unknown,
    updatedAt:        row.updatedAt.toISOString(),
  });
  return;
});

// PUT /api/cinema/presets — replace the stored preset list
cinemaPersistenceRouter.put('/presets', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { presets } = req.body as { presets: unknown };
  if (!Array.isArray(presets)) {
    res.status(400).json({ error: 'presets must be an array' }); return;
  }
  await prisma.userCinemaData.upsert({
    where:  { userId },
    update: { presetsJson: JSON.stringify(presets) },
    create: { userId, presetsJson: JSON.stringify(presets) },
  });
  res.status(204).end(); return;
});

// PUT /api/cinema/snapshots — replace the stored config snapshot list
cinemaPersistenceRouter.put('/snapshots', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { snapshots } = req.body as { snapshots: unknown };
  if (!Array.isArray(snapshots)) {
    res.status(400).json({ error: 'snapshots must be an array' }); return;
  }
  await prisma.userCinemaData.upsert({
    where:  { userId },
    update: { snapshotsJson: JSON.stringify(snapshots) },
    create: { userId, snapshotsJson: JSON.stringify(snapshots) },
  });
  res.status(204).end(); return;
});

// PUT /api/cinema/director-keyframes — replace the stored director keyframe list
cinemaPersistenceRouter.put('/director-keyframes', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { keyframes } = req.body as { keyframes: unknown };
  if (!Array.isArray(keyframes)) {
    res.status(400).json({ error: 'keyframes must be an array' }); return;
  }
  await prisma.userCinemaData.upsert({
    where:  { userId },
    update: { directorKfsJson: JSON.stringify(keyframes) },
    create: { userId, directorKfsJson: JSON.stringify(keyframes) },
  });
  res.status(204).end(); return;
});

// PUT /api/cinema/scene-keyframes — replace the per-scene keyframe map
cinemaPersistenceRouter.put('/scene-keyframes', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { sceneKeyframes } = req.body as { sceneKeyframes: unknown };
  if (
    !sceneKeyframes ||
    typeof sceneKeyframes !== 'object' ||
    Array.isArray(sceneKeyframes)
  ) {
    res.status(400).json({ error: 'sceneKeyframes must be an object' }); return;
  }
  await prisma.userCinemaData.upsert({
    where:  { userId },
    update: { sceneKfsJson: JSON.stringify(sceneKeyframes) },
    create: { userId, sceneKfsJson: JSON.stringify(sceneKeyframes) },
  });
  res.status(204).end(); return;
});

// PUT /api/cinema/node-overrides — replace the per-node visual override map
cinemaPersistenceRouter.put('/node-overrides', async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { nodeOverrides } = req.body as { nodeOverrides: unknown };
  if (
    !nodeOverrides ||
    typeof nodeOverrides !== 'object' ||
    Array.isArray(nodeOverrides)
  ) {
    res.status(400).json({ error: 'nodeOverrides must be an object' }); return;
  }
  await prisma.userCinemaData.upsert({
    where:  { userId },
    update: { nodeOverridesJson: JSON.stringify(nodeOverrides) },
    create: { userId, nodeOverridesJson: JSON.stringify(nodeOverrides) },
  });
  res.status(204).end(); return;
});

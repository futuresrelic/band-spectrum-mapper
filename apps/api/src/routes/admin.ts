import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { adminKnowledgeService } from '../services/adminKnowledgeService.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireAdmin);

// List all users with rating counts and moderation state
adminRouter.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      isAdmin: true,
      isCommunityExcluded: true,
      isActive: true,
      createdAt: true,
      _count: { select: { ratings: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

// Get a user's full detail including all their ratings
adminRouter.get('/users/:userId', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params['userId'] },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      isAdmin: true,
      isCommunityExcluded: true,
      isActive: true,
      createdAt: true,
      _count: { select: { ratings: true } },
      ratings: {
        select: {
          id: true,
          songId: true,
          aggression: true,
          complexity: true,
          atmosphere: true,
          emotion: true,
          psychedelic: true,
          concept: true,
          updatedAt: true,
          song: {
            select: {
              id: true,
              title: true,
              band: { select: { name: true } },
              album: { select: { title: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// ---------------------------------------------------------------------------
// Knowledge entries — admin-authored context injected into AI analysis
// ---------------------------------------------------------------------------

adminRouter.get('/knowledge', async (_req, res, next) => {
  try { res.json(await adminKnowledgeService.list()); } catch (e) { next(e); }
});

adminRouter.post('/knowledge', async (req, res, next) => {
  try {
    const { title, content, scope, scopeId, tags, isActive } = req.body as {
      title: string; content: string; scope?: string;
      scopeId?: string | null; tags?: string[]; isActive?: boolean;
    };
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'title and content are required' }); return;
    }
    res.status(201).json(await adminKnowledgeService.create({
      title, content, scope: scope ?? 'global',
      ...(scopeId !== undefined && { scopeId }),
      ...(tags    !== undefined && { tags }),
      ...(isActive !== undefined && { isActive }),
    }));
  } catch (e) { next(e); }
});

adminRouter.put('/knowledge/:id', async (req, res, next) => {
  try {
    res.json(await adminKnowledgeService.update(req.params['id']!, req.body as Parameters<typeof adminKnowledgeService.update>[1]));
  } catch (e) { next(e); }
});

adminRouter.delete('/knowledge/:id', async (req, res, next) => {
  try { await adminKnowledgeService.delete(req.params['id']!); res.json({ ok: true }); } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Update a user's moderation flags
adminRouter.patch('/users/:userId', async (req, res) => {
  const { isCommunityExcluded, isActive, isAdmin } = req.body as {
    isCommunityExcluded?: boolean;
    isActive?: boolean;
    isAdmin?: boolean;
  };

  const user = await prisma.user.update({
    where: { id: req.params['userId'] },
    data: {
      ...(isCommunityExcluded !== undefined && { isCommunityExcluded }),
      ...(isActive !== undefined && { isActive }),
      ...(isAdmin !== undefined && { isAdmin }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isCommunityExcluded: true,
      isActive: true,
    },
  });
  res.json(user);
});

// ---------------------------------------------------------------------------
// Database schema migrations — apply pending schema changes without CLI access
// ---------------------------------------------------------------------------

type MigrationStatus = { key: string; description: string; applied: boolean };

async function checkMigrations(): Promise<MigrationStatus[]> {
  const [artworkRows, aiRecallRows] = await Promise.all([
    prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'albums' AND column_name = 'artworkUrl'
    `,
    prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'source_type' AND e.enumlabel = 'ai_recall'
    `,
  ]);
  return [
    {
      key: 'albums_artworkUrl',
      description: 'Add artworkUrl column to albums table (enables album art storage)',
      applied: artworkRows.length > 0,
    },
    {
      key: 'source_type_ai_recall',
      description: 'Add ai_recall value to source_type enum (enables AI lyrics recall)',
      applied: aiRecallRows.length > 0,
    },
  ];
}

adminRouter.get('/db-status', async (_req, res, next) => {
  try {
    res.json(await checkMigrations());
  } catch (e) { next(e); }
});

adminRouter.post('/db-migrate', async (_req, res, next) => {
  try {
    const before = await checkMigrations();
    const results: { key: string; description: string; status: 'applied' | 'already_applied' | 'error'; error?: string }[] = [];

    for (const m of before) {
      if (m.applied) {
        results.push({ key: m.key, description: m.description, status: 'already_applied' });
        continue;
      }
      try {
        if (m.key === 'albums_artworkUrl') {
          await prisma.$executeRaw`ALTER TABLE "albums" ADD COLUMN IF NOT EXISTS "artworkUrl" TEXT`;
        } else if (m.key === 'source_type_ai_recall') {
          await prisma.$executeRaw`ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'ai_recall'`;
        }
        results.push({ key: m.key, description: m.description, status: 'applied' });
      } catch (err) {
        results.push({ key: m.key, description: m.description, status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    }

    res.json({ results });
  } catch (e) { next(e); }
});

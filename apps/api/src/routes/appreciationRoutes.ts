import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const appreciationRouter = Router();

// ── POST /toggle ──────────────────────────────────────────────────────────────
// Toggle a favorite or saved mark on an entity.
// Body: { kind: 'favorite'|'saved', entityType: 'curator'|'festival'|'tour', entityId: string }
// Returns: { active: boolean, count: number }

appreciationRouter.post('/toggle', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { kind, entityType, entityId } = req.body as {
      kind: string; entityType: string; entityId: string;
    };

    if (!kind || !entityType || !entityId) {
      res.status(400).json({ error: 'kind, entityType, and entityId are required' }); return;
    }
    if (!['favorite', 'saved'].includes(kind)) {
      res.status(400).json({ error: 'kind must be favorite or saved' }); return;
    }
    if (!['curator', 'festival', 'tour'].includes(entityType)) {
      res.status(400).json({ error: 'entityType must be curator, festival, or tour' }); return;
    }

    const existing = await prisma.bandRpgFavorite.findUnique({
      where: { userId_kind_entityType_entityId: { userId, kind, entityType, entityId } },
    });

    if (existing) {
      await prisma.bandRpgFavorite.delete({ where: { id: existing.id } });
    } else {
      await prisma.bandRpgFavorite.create({ data: { userId, kind, entityType, entityId } });
    }

    const count = await prisma.bandRpgFavorite.count({
      where: { kind, entityType, entityId },
    });

    res.json({ active: !existing, count }); return;
  } catch (err) { next(err); }
});

// ── POST /follow/:followeeId ───────────────────────────────────────────────────
// Toggle follow on a curator. Returns { following: boolean, followerCount: number }

appreciationRouter.post('/follow/:followeeId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const followerId = req.user!.userId;
    const { followeeId } = req.params;
    if (!followeeId) { res.status(400).json({ error: 'followeeId is required' }); return; }
    if (followerId === followeeId) { res.status(400).json({ error: 'Cannot follow yourself' }); return; }

    const existing = await prisma.bandRpgCuratorFollow.findUnique({
      where: { followerId_followeeId: { followerId, followeeId } },
    });

    if (existing) {
      await prisma.bandRpgCuratorFollow.delete({ where: { id: existing.id } });
    } else {
      await prisma.bandRpgCuratorFollow.create({ data: { followerId, followeeId } });
    }

    const followerCount = await prisma.bandRpgCuratorFollow.count({ where: { followeeId } });

    res.json({ following: !existing, followerCount }); return;
  } catch (err) { next(err); }
});

// ── GET /status ───────────────────────────────────────────────────────────────
// Query: entityType, entityId (can be repeated)
// Returns: Record<entityId, { favorited: boolean; saved: boolean; following?: boolean }>

appreciationRouter.get('/status', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId     = req.user!.userId;
    const entityType = req.query['entityType'] as string | undefined;
    const entityIdRaw = req.query['entityId'];
    const entityIds: string[] = Array.isArray(entityIdRaw)
      ? (entityIdRaw as string[])
      : entityIdRaw ? [entityIdRaw as string] : [];

    if (!entityType || entityIds.length === 0) {
      res.json({}); return;
    }

    const [favorites, follows] = await Promise.all([
      prisma.bandRpgFavorite.findMany({
        where: { userId, entityType, entityId: { in: entityIds } },
        select: { kind: true, entityId: true },
      }),
      entityType === 'curator'
        ? prisma.bandRpgCuratorFollow.findMany({
            where: { followerId: userId, followeeId: { in: entityIds } },
            select: { followeeId: true },
          })
        : Promise.resolve([]),
    ]);

    const favSet  = new Set(favorites.filter((f) => f.kind === 'favorite').map((f) => f.entityId));
    const savedSet = new Set(favorites.filter((f) => f.kind === 'saved').map((f) => f.entityId));
    const followSet = new Set(follows.map((f) => f.followeeId));

    const result: Record<string, { favorited: boolean; saved: boolean; following?: boolean }> = {};
    for (const id of entityIds) {
      result[id] = {
        favorited: favSet.has(id),
        saved:     savedSet.has(id),
        ...(entityType === 'curator' ? { following: followSet.has(id) } : {}),
      };
    }

    res.json(result); return;
  } catch (err) { next(err); }
});

// ── GET /my-saved ─────────────────────────────────────────────────────────────
// Returns enriched array of saved items for the current user.
// Query: optional type filter (curator | festival | tour)

appreciationRouter.get('/my-saved', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const typeFilter = req.query['type'] as string | undefined;

    const where = {
      userId,
      kind: 'saved',
      ...(typeFilter ? { entityType: typeFilter } : {}),
    };

    const saved = await prisma.bandRpgFavorite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Enrich each saved item
    const results = await Promise.all(saved.map(async (s) => {
      const base = {
        savedId:    s.id,
        entityType: s.entityType,
        entityId:   s.entityId,
        savedAt:    s.createdAt.toISOString(),
      };

      if (s.entityType === 'festival') {
        const f = await prisma.bandRpgFestival.findUnique({
          where:   { id: s.entityId },
          select:  { name: true, visibility: true, isDream: true, _count: { select: { concerts: true } } },
        });
        if (!f) return null;
        return {
          ...base,
          name:         f.name,
          visibility:   f.visibility,
          isDream:      f.isDream,
          concertCount: f._count.concerts,
        };
      }

      if (s.entityType === 'tour') {
        const t = await prisma.bandRpgTour.findUnique({
          where:  { id: s.entityId },
          select: { name: true, visibility: true, _count: { select: { stops: true } } },
        });
        if (!t) return null;
        return {
          ...base,
          name:      t.name,
          visibility: t.visibility,
          stopCount:  t._count.stops,
        };
      }

      if (s.entityType === 'curator') {
        const p = await prisma.bandRpgCuratorProfile.findUnique({
          where:  { userId: s.entityId },
          select: { selectedCharacterName: true, currentTitle: true, visibility: true },
        });
        if (!p) return null;
        return {
          ...base,
          name:       p.selectedCharacterName ?? 'Curator',
          visibility: p.visibility,
          title:      p.currentTitle ?? null,
        };
      }

      return null;
    }));

    res.json(results.filter((r): r is NonNullable<typeof r> => r !== null)); return;
  } catch (err) { next(err); }
});

// ── GET /following ────────────────────────────────────────────────────────────
// Returns array of followed curator profiles for the current user.

appreciationRouter.get('/following', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const follows = await prisma.bandRpgCuratorFollow.findMany({
      where:   { followerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (follows.length === 0) { res.json([]); return; }

    const followeeIds = follows.map((f) => f.followeeId);
    const profiles = await prisma.bandRpgCuratorProfile.findMany({
      where:  { userId: { in: followeeIds } },
      select: { userId: true, selectedCharacterName: true, currentTitle: true, visibility: true },
    });

    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    const result = follows.map((f) => {
      const p = profileMap.get(f.followeeId);
      if (!p) return null;
      return {
        followeeId:  f.followeeId,
        followedAt:  f.createdAt.toISOString(),
        displayName: p.selectedCharacterName ?? 'Curator',
        title:       p.currentTitle ?? '',
        visibility:  p.visibility,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    res.json(result); return;
  } catch (err) { next(err); }
});

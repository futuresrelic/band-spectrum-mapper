import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const platformerRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_CONFIG_KEYS = new Set([
  'gravity',
  'jumpForce',
  'playerSpeed',
  'recordsPerLevel',
  'enemySpeed',
]);

const MAX_DATA_URL_BYTES = 5 * 1024 * 1024; // 5 MB

function parseLimitParam(raw: unknown, defaultVal: number, max: number): number {
  const parsed = parseInt(typeof raw === 'string' ? raw : String(defaultVal), 10);
  return Math.min(max, Math.max(1, isNaN(parsed) ? defaultVal : parsed));
}

// ---------------------------------------------------------------------------
// GET /scores — public leaderboard
// ---------------------------------------------------------------------------

platformerRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = parseLimitParam(req.query['limit'], 15, 50);

    const scores = await prisma.platformerScore.findMany({
      orderBy: { score: 'desc' },
      take: limit,
      select: {
        id: true,
        score: true,
        level: true,
        recordsCollected: true,
        distancePx: true,
        bandScope: true,
        createdAt: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    });

    // Collect all unique bandIds referenced across all rows
    const allBandIds = [
      ...new Set(
        scores.flatMap((s) =>
          s.bandScope ? s.bandScope.split(',').filter(Boolean) : [],
        ),
      ),
    ];

    const bandNameMap = new Map<string, string>();
    if (allBandIds.length > 0) {
      const bands = await prisma.band.findMany({
        where: { id: { in: allBandIds } },
        select: { id: true, name: true },
      });
      for (const b of bands) bandNameMap.set(b.id, b.name);
    }

    const result = scores.map((s, i) => ({
      rank: i + 1,
      playerName: s.user?.name ?? 'Anonymous',
      avatarUrl: s.user?.avatarUrl ?? null,
      score: s.score,
      level: s.level,
      recordsCollected: s.recordsCollected,
      distancePx: s.distancePx,
      bandScopeNames: s.bandScope
        ? s.bandScope
            .split(',')
            .filter(Boolean)
            .map((id) => bandNameMap.get(id) ?? id)
            .join(', ')
        : null,
      createdAt: s.createdAt,
    }));

    res.json(result);
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// POST /scores — save score, requireAuth
// ---------------------------------------------------------------------------

platformerRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { score, level, recordsCollected, distancePx, bandIds } = req.body as {
      score?: unknown;
      level?: unknown;
      recordsCollected?: unknown;
      distancePx?: unknown;
      bandIds?: unknown;
    };

    if (typeof score !== 'number' || score < 0) {
      res.status(400).json({ error: 'score must be a non-negative number' });
      return;
    }
    if (typeof level !== 'number' || level < 1) {
      res.status(400).json({ error: 'level must be a positive number' });
      return;
    }
    if (typeof recordsCollected !== 'number' || recordsCollected < 0) {
      res.status(400).json({ error: 'recordsCollected must be a non-negative number' });
      return;
    }
    if (typeof distancePx !== 'number' || distancePx < 0) {
      res.status(400).json({ error: 'distancePx must be a non-negative number' });
      return;
    }

    const safeBandScope =
      Array.isArray(bandIds) && bandIds.length > 0
        ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
        : null;

    const saved = await prisma.platformerScore.create({
      data: {
        userId,
        score: Math.floor(score),
        level: Math.floor(level),
        recordsCollected: Math.floor(recordsCollected),
        distancePx: Math.floor(distancePx),
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });

    const higherCount = await prisma.platformerScore.count({
      where: { score: { gt: saved.score } },
    });

    res.status(201).json({ ok: true, score: saved.score, rank: higherCount + 1 });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// GET /assets — get all assets (public)
// ---------------------------------------------------------------------------

platformerRouter.get('/assets', async (_req, res, next): Promise<void> => {
  try {
    const assets = await prisma.platformerAsset.findMany({
      orderBy: { assetType: 'asc' },
    });
    res.json(assets);
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// GET /assets/:type — get single asset by type (public)
// ---------------------------------------------------------------------------

platformerRouter.get('/assets/:type', async (req, res, next): Promise<void> => {
  try {
    const assetType = req.params['type'];
    if (!assetType) {
      res.status(400).json({ error: 'Asset type is required' });
      return;
    }

    const asset = await prisma.platformerAsset.findUnique({
      where: { assetType },
    });

    if (!asset) {
      res.status(404).json({ error: `Asset type '${assetType}' not found` });
      return;
    }

    res.json(asset);
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// PUT /assets/:type — upsert asset, requireAdmin
// ---------------------------------------------------------------------------

platformerRouter.put(
  '/assets/:type',
  requireAuth,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const assetType = req.params['type'];
      if (!assetType) {
        res.status(400).json({ error: 'Asset type is required' });
        return;
      }

      const { name, dataUrl, metadata } = req.body as {
        name?: unknown;
        dataUrl?: unknown;
        metadata?: unknown;
      };

      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        res.status(400).json({ error: "dataUrl must start with 'data:'" });
        return;
      }
      // Approximate byte size: base64 encodes 3 bytes as 4 chars
      const approximateBytes = Math.ceil((dataUrl.length * 3) / 4);
      if (approximateBytes > MAX_DATA_URL_BYTES) {
        res.status(400).json({ error: 'dataUrl exceeds 5 MB limit' });
        return;
      }

      const now = new Date();
      const existing = await prisma.platformerAsset.findUnique({
        where: { assetType },
      });

      let saved;
      if (existing) {
        saved = await prisma.platformerAsset.update({
          where: { assetType },
          data: {
            name: name.trim(),
            dataUrl,
            ...(metadata !== undefined ? { metadata: metadata as object } : {}),
            updatedAt: now,
          },
        });
      } else {
        saved = await prisma.platformerAsset.create({
          data: {
            assetType,
            name: name.trim(),
            dataUrl,
            ...(metadata !== undefined ? { metadata: metadata as object } : {}),
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      res.json(saved);
    } catch (e) {
      next(e);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /assets/:type — delete asset, requireAdmin
// ---------------------------------------------------------------------------

platformerRouter.delete(
  '/assets/:type',
  requireAuth,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const assetType = req.params['type'];
      if (!assetType) {
        res.status(400).json({ error: 'Asset type is required' });
        return;
      }

      const existing = await prisma.platformerAsset.findUnique({
        where: { assetType },
        select: { assetType: true },
      });

      if (!existing) {
        res.status(404).json({ error: `Asset type '${assetType}' not found` });
        return;
      }

      await prisma.platformerAsset.delete({ where: { assetType } });
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /config — get all config as flat object (public)
// ---------------------------------------------------------------------------

platformerRouter.get('/config', async (_req, res, next): Promise<void> => {
  try {
    const rows = await prisma.platformerConfig.findMany();
    const config: Record<string, string> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }
    res.json(config);
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// PUT /config — save config, requireAdmin
// ---------------------------------------------------------------------------

platformerRouter.put(
  '/config',
  requireAuth,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const body = req.body as Record<string, unknown>;

      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        res.status(400).json({ error: 'Body must be a JSON object' });
        return;
      }

      const now = new Date();
      const upserts: Promise<unknown>[] = [];

      for (const [key, value] of Object.entries(body)) {
        if (!ALLOWED_CONFIG_KEYS.has(key)) {
          res.status(400).json({
            error: `Unknown config key '${key}'. Allowed: ${[...ALLOWED_CONFIG_KEYS].join(', ')}`,
          });
          return;
        }
        if (typeof value !== 'string') {
          res.status(400).json({ error: `Value for key '${key}' must be a string` });
          return;
        }
        upserts.push(
          prisma.platformerConfig.upsert({
            where: { key },
            update: { value, updatedAt: now },
            create: { key, value, updatedAt: now },
          }),
        );
      }

      await Promise.all(upserts);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /albums — album art for collectibles (public)
// Query: ?bandIds=id1,id2
// ---------------------------------------------------------------------------

platformerRouter.get('/albums', async (req, res, next): Promise<void> => {
  try {
    const rawBandIds =
      typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = rawBandIds ? rawBandIds.split(',').filter(Boolean) : [];

    const whereClause =
      bandIds.length > 0
        ? { bandId: { in: bandIds }, artworkUrl: { not: null } }
        : { artworkUrl: { not: null } };

    const albums = await prisma.album.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        artworkUrl: true,
        band: { select: { name: true } },
      },
      take: 200,
    });

    // Shuffle and cap at 50
    const shuffled = [...albums].sort(() => Math.random() - 0.5).slice(0, 50);

    const result = shuffled.map((a) => ({
      id: a.id,
      title: a.title,
      artworkUrl: a.artworkUrl,
      bandName: a.band.name,
    }));

    res.json(result);
  } catch (e) {
    next(e);
  }
});

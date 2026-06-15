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
        user: { select: { name: true, username: true, avatarUrl: true } },
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
      playerName: s.user?.username ?? s.user?.name ?? 'Anonymous',
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

// ---------------------------------------------------------------------------
// GET /members — list band members by bandId(s) (public)
// Query: ?bandIds=id1,id2
// ---------------------------------------------------------------------------

platformerRouter.get('/members', async (req, res, next): Promise<void> => {
  try {
    const rawBandIds =
      typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = rawBandIds ? rawBandIds.split(',').filter(Boolean) : [];

    const members = await prisma.bandMember.findMany({
      where: bandIds.length > 0 ? { bandId: { in: bandIds } } : {},
      select: { id: true, name: true, role: true, bandId: true },
      orderBy: [{ bandId: 'asc' }, { name: 'asc' }],
    });

    res.json(members);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /members — add band member (admin only)
// ---------------------------------------------------------------------------

platformerRouter.post('/members', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { bandId, name, role } = req.body as { bandId?: unknown; name?: unknown; role?: unknown };
    if (typeof bandId !== 'string' || !bandId.trim()) {
      res.status(400).json({ error: 'bandId is required' }); return;
    }
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' }); return;
    }
    const member = await prisma.bandMember.create({
      data: {
        bandId: bandId.trim(),
        name: name.trim(),
        ...(typeof role === 'string' && role.trim() ? { role: role.trim() } : {}),
      },
    });
    res.status(201).json(member);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// DELETE /members/:id — remove band member (admin only)
// ---------------------------------------------------------------------------

platformerRouter.delete('/members/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) { res.status(400).json({ error: 'id is required' }); return; }
    await prisma.bandMember.delete({ where: { id } }).catch(() => null);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /members/suggest — AI-suggest members for a band (admin only)
// Uses Band.description + BandContextAnalysis + AdminKnowledgeEntry for context
// ---------------------------------------------------------------------------

platformerRouter.post('/members/suggest', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { bandId } = req.body as { bandId?: unknown };
    if (typeof bandId !== 'string' || !bandId.trim()) {
      res.status(400).json({ error: 'bandId is required' }); return;
    }

    const band = await prisma.band.findUnique({
      where: { id: bandId.trim() },
      select: {
        name: true,
        description: true,
        contextAnalysis: { select: { overallNarrative: true } },
      },
    });
    if (!band) { res.status(404).json({ error: 'Band not found' }); return; }

    const knowledgeEntries = await prisma.adminKnowledgeEntry.findMany({
      where: { scope: 'band', scopeId: bandId.trim(), isActive: true },
      select: { content: true },
      take: 3,
    });

    const contextParts: string[] = [];
    if (band.description) contextParts.push(`About: ${band.description.slice(0, 600)}`);
    if (band.contextAnalysis?.overallNarrative) {
      contextParts.push(`Analysis: ${band.contextAnalysis.overallNarrative.slice(0, 600)}`);
    }
    for (const k of knowledgeEntries) contextParts.push(k.content.slice(0, 400));

    const openAiKey = process.env['OPENAI_API_KEY'];
    if (!openAiKey) { res.status(503).json({ error: 'OPENAI_API_KEY not configured' }); return; }

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openAiKey });

    const contextBlock = contextParts.length > 0
      ? `\n\nContext about this band:\n${contextParts.join('\n\n')}`
      : '';

    const aiRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `List the known members of the band "${band.name}" with their primary musical roles.${contextBlock}\n\nRespond ONLY with JSON:\n{ "members": [{ "name": "Full Name", "role": "role" }] }\n\nUse concise role labels: vocals, guitar, bass, drums, keyboard, violin, cello, percussion, synthesizer, samples. List only musicians — not managers or producers. Maximum 12 members.`,
      }],
    });

    const raw = aiRes.choices[0]?.message?.content ?? '{}';
    let parsed: { members?: unknown } = {};
    try { parsed = JSON.parse(raw) as typeof parsed; } catch { /* empty */ }

    const suggestions = Array.isArray(parsed.members)
      ? (parsed.members as unknown[])
          .filter((m): m is { name: string; role?: unknown } =>
            typeof (m as Record<string, unknown>)['name'] === 'string')
          .map((m) => ({
            name: (m.name as string).trim(),
            role: typeof m.role === 'string' ? m.role.trim() : '',
          }))
          .filter((m) => m.name.length > 0)
          .slice(0, 12)
      : [];

    res.json({ suggestions }); return;
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /skins — list approved character skins (public)
// Query: ?bandIds=id1,id2&excludeBandIds=id3
// ---------------------------------------------------------------------------

platformerRouter.get('/skins', async (req, res, next): Promise<void> => {
  try {
    const rawBandIds = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const rawExclude = typeof req.query['excludeBandIds'] === 'string' ? req.query['excludeBandIds'] : '';
    const bandIds = rawBandIds ? rawBandIds.split(',').filter(Boolean) : [];
    const excludeIds = rawExclude ? rawExclude.split(',').filter(Boolean) : [];

    const skins = await prisma.platformerCharacterSkin.findMany({
      where: {
        isApproved: true,
        ...(bandIds.length > 0 ? { bandId: { in: bandIds } } : {}),
        ...(excludeIds.length > 0 ? { bandId: { notIn: excludeIds } } : {}),
      },
      select: {
        id: true, name: true, dataUrl: true, bandId: true, memberId: true,
        isAiGenerated: true,
        member: { select: { name: true, role: true } },
        band: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    res.json(skins);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /skins — submit a character skin (auth required)
// ---------------------------------------------------------------------------

platformerRouter.post('/skins', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { name, dataUrl, bandId, memberId } = req.body as {
      name?: unknown; dataUrl?: unknown; bandId?: unknown; memberId?: unknown;
    };

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' }); return;
    }
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      res.status(400).json({ error: 'dataUrl must be a valid data URL' }); return;
    }
    const approxBytes = Math.ceil((dataUrl.length * 3) / 4);
    if (approxBytes > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'dataUrl exceeds 5 MB' }); return;
    }

    const skin = await prisma.platformerCharacterSkin.create({
      data: {
        name: name.trim(),
        dataUrl,
        submittedById: userId,
        isApproved: false,
        ...(typeof bandId === 'string' && bandId ? { bandId } : {}),
        ...(typeof memberId === 'string' && memberId ? { memberId } : {}),
      },
    });

    res.status(201).json(skin);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /skins/pending — pending skins for admin review (admin only)
// ---------------------------------------------------------------------------

platformerRouter.get('/skins/pending', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const skins = await prisma.platformerCharacterSkin.findMany({
      where: { isApproved: false },
      select: {
        id: true, name: true, dataUrl: true, bandId: true, memberId: true,
        isAiGenerated: true, createdAt: true,
        member: { select: { name: true } },
        band: { select: { name: true } },
        submittedBy: { select: { name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(skins);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// PUT /skins/:id/approve — approve a skin (admin only)
// ---------------------------------------------------------------------------

platformerRouter.put('/skins/:id/approve', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) { res.status(400).json({ error: 'id is required' }); return; }
    const skin = await prisma.platformerCharacterSkin.update({
      where: { id },
      data: { isApproved: true },
    });
    res.json(skin);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// PUT /skins/:id/assign — reassign a skin to a different member / band (admin only)
// ---------------------------------------------------------------------------

platformerRouter.put('/skins/:id/assign', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) { res.status(400).json({ error: 'id is required' }); return; }

    const { memberId, bandId } = req.body as { memberId?: unknown; bandId?: unknown };

    const updateData: { memberId?: string | null; bandId?: string | null } = {};

    if (memberId === null || typeof memberId === 'string') {
      updateData.memberId = memberId === null ? null : memberId || null;
    }
    if (bandId === null || typeof bandId === 'string') {
      updateData.bandId = bandId === null ? null : bandId || null;
    }

    // If a memberId is given, auto-resolve bandId from the member record
    if (updateData.memberId) {
      const member = await prisma.bandMember.findUnique({
        where: { id: updateData.memberId },
        select: { bandId: true },
      });
      if (!member) { res.status(404).json({ error: 'Member not found' }); return; }
      updateData.bandId = member.bandId;
    }

    const skin = await prisma.platformerCharacterSkin.update({
      where: { id },
      data: updateData,
      include: {
        member: { select: { name: true, role: true } },
        band:   { select: { name: true } },
      },
    });
    res.json(skin); return;
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// DELETE /skins/:id — delete a skin (admin only)
// ---------------------------------------------------------------------------

platformerRouter.delete('/skins/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id) { res.status(400).json({ error: 'id is required' }); return; }
    await prisma.platformerCharacterSkin.delete({ where: { id } }).catch(() => null);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /skins/ai-generate — AI pixel art generation for a band member (admin only)
// Body: { memberId: string, memberName: string, bandName: string }
// ---------------------------------------------------------------------------

platformerRouter.post('/skins/ai-generate', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { memberId, memberName, memberRole, bandName } = req.body as {
      memberId?: unknown; memberName?: unknown; memberRole?: unknown; bandName?: unknown;
    };

    if (typeof memberName !== 'string' || !memberName.trim()) {
      res.status(400).json({ error: 'memberName is required' }); return;
    }
    if (typeof bandName !== 'string' || !bandName.trim()) {
      res.status(400).json({ error: 'bandName is required' }); return;
    }

    const nameStr = memberName.trim();
    const bandStr = bandName.trim();
    const role = typeof memberRole === 'string' && memberRole ? memberRole.trim() : null;
    const roleDesc = role ? `${role} player` : 'musician';

    // Resolve bandId: prefer passed memberId lookup, then passed bandId field
    const passedBandId = typeof (req.body as Record<string, unknown>)['bandId'] === 'string'
      ? ((req.body as Record<string, unknown>)['bandId'] as string)
      : null;

    // Step 1: Ask GPT-4o-mini to describe the member's appearance for a more accurate sprite.
    // We avoid naming the real person in the image prompt to stay within content policy.
    // We include any band description / analysis context to guide the description.
    let appearanceHint = '';
    const openAiKey = process.env['OPENAI_API_KEY'];
    if (openAiKey) {
      try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: openAiKey });

        // Fetch band context to improve appearance descriptions
        let bandContextLine = '';
        const lookupBandId = passedBandId ?? (typeof memberId === 'string' && memberId ? memberId : null);
        if (lookupBandId) {
          const bandRecord = await prisma.band.findFirst({
            where: typeof memberId === 'string' && memberId
              ? { members: { some: { id: memberId } } }
              : { id: lookupBandId },
            select: {
              description: true,
              contextAnalysis: { select: { overallNarrative: true } },
            },
          });
          const parts: string[] = [];
          if (bandRecord?.description) parts.push(bandRecord.description.slice(0, 300));
          if (bandRecord?.contextAnalysis?.overallNarrative) {
            parts.push(bandRecord.contextAnalysis.overallNarrative.slice(0, 300));
          }
          if (parts.length > 0) bandContextLine = `Band context: ${parts.join(' ')} `;
        }

        const descRes = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content:
              `Describe the distinctive facial and hair appearance of ${nameStr}, the ${roleDesc} from the band ${bandStr}, ` +
              `in one short sentence for a pixel art face portrait. ` +
              `${bandContextLine}` +
              `Focus on hair color, hair length/style (including if it is long), skin tone, notable facial features, and any facial hair or signature accessories. ` +
              `Output the description only — no name, no explanation.`,
          }],
          max_tokens: 80,
        });
        const hint = descRes.choices[0]?.message?.content?.trim();
        if (hint) appearanceHint = `${hint} `;
      } catch {
        // Non-fatal: continue with generic prompt if GPT fails
      }
    }

    // Step 2: Build the face-portrait prompt.
    // We generate the head/face only with a transparent background so it can be
    // composited onto the game character's animated body at runtime.
    // Three-quarter angle so the face looks natural when the character runs sideways.
    const prompt =
      `Pixel art face portrait for a retro side-scrolling platformer video game character. ` +
      `Rock musician (${roleDesc}, ${bandStr} band). ` +
      appearanceHint +
      `Three-quarter angle view — face turned slightly to the right so the character ` +
      `appears to be looking forward while running left-to-right. ` +
      `Head and hair only — no body, no shoulders. ` +
      `If the character has long hair, let it flow naturally downward. ` +
      `Expressive pixelated face, bold pixel art style, transparent background, ` +
      `centered in a square canvas, no text, no border, clean crisp pixel art.`;

    // Step 3: Generate pixel art sprite via OpenAI gpt-image-1
    // Requires image generation to be enabled on the project at platform.openai.com
    if (!openAiKey) {
      res.status(503).json({ error: 'OPENAI_API_KEY is not configured.' }); return;
    }

    const { default: OpenAI } = await import('openai');
    const openaiForImage = new OpenAI({ apiKey: openAiKey });

    const imageResponse = await openaiForImage.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'low',
      background: 'transparent',
    });

    const b64 = imageResponse.data?.[0]?.b64_json;
    if (!b64) {
      res.status(502).json({ error: 'No image data returned from OpenAI.' }); return;
    }
    const dataUrl = `data:image/png;base64,${b64}`;

    // Step 4: Persist the skin record
    const skinData: {
      name: string;
      dataUrl: string;
      isApproved: boolean;
      isAiGenerated: boolean;
      bandId?: string;
      memberId?: string;
    } = {
      name: `${nameStr} (AI)`,
      dataUrl,
      isApproved: true,
      isAiGenerated: true,
    };

    if (typeof memberId === 'string' && memberId) skinData.memberId = memberId;

    if (typeof memberId === 'string' && memberId) {
      const member = await prisma.bandMember.findUnique({ where: { id: memberId }, select: { bandId: true } });
      if (member) skinData.bandId = member.bandId;
    }

    const skin = await prisma.platformerCharacterSkin.create({ data: skinData });
    res.status(201).json(skin);
  } catch (e: unknown) {
    // Surface the raw OpenAI error so we can see exactly what's failing
    let msg = 'Unknown error';
    let status = 502;
    if (e instanceof Error) {
      msg = e.message;
      const apiErr = e as Error & { status?: number; code?: string; error?: unknown };
      if (apiErr.status) status = apiErr.status;
      // Append any extra detail from the error body
      if (apiErr.code) msg += ` [code: ${apiErr.code}]`;
      if (apiErr.error) msg += ` [detail: ${JSON.stringify(apiErr.error)}]`;
    }
    console.error('[ai-generate] OpenAI error:', msg);
    res.status(status < 400 ? 502 : status).json({ error: `Sprite generation failed: ${msg}` });
  }
});

// ---------------------------------------------------------------------------
// Body skins
// ---------------------------------------------------------------------------

// GET /body-skins — public list
platformerRouter.get('/body-skins', async (_req, res, next): Promise<void> => {
  try {
    const skins = await prisma.platformerBodySkin.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json(skins); return;
  } catch (e) { next(e); }
});

// POST /body-skins — create
platformerRouter.post('/body-skins', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { name, role, dataUrl, torsoUrl, armUrl, legUrl, isDefault } = req.body as {
      name?: unknown; role?: unknown; dataUrl?: unknown;
      torsoUrl?: unknown; armUrl?: unknown; legUrl?: unknown; isDefault?: unknown;
    };
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' }); return;
    }
    const validRoles = new Set(['vocals', 'guitar', 'bass', 'drums', 'piano', 'violin']);
    const roleVal = typeof role === 'string' && validRoles.has(role) ? role : null;

    function validatePart(val: unknown, field: string): string | null {
      if (val === undefined || val === null) return null;
      if (typeof val !== 'string' || !val.startsWith('data:image/')) {
        throw new Error(`${field} must be a valid image data URL`);
      }
      if (Buffer.byteLength(val) > MAX_DATA_URL_BYTES) throw new Error(`${field} too large (max 5 MB)`);
      return val;
    }
    let torsoVal: string | null, armVal: string | null, legVal: string | null, dataUrlVal: string | null;
    try {
      torsoVal = validatePart(torsoUrl, 'torsoUrl');
      armVal = validatePart(armUrl, 'armUrl');
      legVal = validatePart(legUrl, 'legUrl');
      dataUrlVal = validatePart(dataUrl, 'dataUrl');
    } catch (err) {
      res.status(400).json({ error: (err as Error).message }); return;
    }

    const skin = await prisma.platformerBodySkin.create({
      data: {
        name: name.trim(),
        ...(roleVal !== null ? { role: roleVal } : {}),
        ...(dataUrlVal !== null ? { dataUrl: dataUrlVal } : {}),
        ...(torsoVal !== null ? { torsoUrl: torsoVal } : {}),
        ...(armVal !== null ? { armUrl: armVal } : {}),
        ...(legVal !== null ? { legUrl: legVal } : {}),
        ...(isDefault === true ? { isDefault: true } : {}),
      },
    });
    res.status(201).json(skin); return;
  } catch (e) { next(e); }
});

// PUT /body-skins/:id — update
platformerRouter.put('/body-skins/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { name, role, dataUrl, torsoUrl, armUrl, legUrl, isDefault } = req.body as {
      name?: unknown; role?: unknown; dataUrl?: unknown;
      torsoUrl?: unknown; armUrl?: unknown; legUrl?: unknown; isDefault?: unknown;
    };

    const existing = await prisma.platformerBodySkin.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Body skin not found' }); return; }

    const validRoles = new Set(['vocals', 'guitar', 'bass', 'drums', 'piano', 'violin']);

    const updateData: {
      name?: string; role?: string | null; isDefault?: boolean;
      dataUrl?: string | null; torsoUrl?: string | null; armUrl?: string | null; legUrl?: string | null;
    } = {};

    if (typeof name === 'string' && name.trim()) updateData.name = name.trim();
    if (role === null || (typeof role === 'string' && validRoles.has(role))) {
      updateData.role = role === null ? null : role;
    }
    if (typeof isDefault === 'boolean') updateData.isDefault = isDefault;

    function validateAndSet(val: unknown, key: 'dataUrl' | 'torsoUrl' | 'armUrl' | 'legUrl') {
      if (val === undefined) return;
      if (val === null) { (updateData as Record<string, unknown>)[key] = null; return; }
      if (typeof val !== 'string' || !val.startsWith('data:image/')) throw new Error(`${key} must be a valid image data URL`);
      if (Buffer.byteLength(val) > MAX_DATA_URL_BYTES) throw new Error(`${key} too large (max 5 MB)`);
      (updateData as Record<string, unknown>)[key] = val;
    }
    try {
      validateAndSet(dataUrl, 'dataUrl');
      validateAndSet(torsoUrl, 'torsoUrl');
      validateAndSet(armUrl, 'armUrl');
      validateAndSet(legUrl, 'legUrl');
    } catch (err) {
      res.status(400).json({ error: (err as Error).message }); return;
    }

    const skin = await prisma.platformerBodySkin.update({ where: { id }, data: updateData });
    res.json(skin); return;
  } catch (e) { next(e); }
});

// DELETE /body-skins/:id — delete
platformerRouter.delete('/body-skins/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.platformerBodySkin.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Body skin not found' }); return; }
    await prisma.platformerBodySkin.delete({ where: { id } });
    res.json({ ok: true }); return;
  } catch (e) { next(e); }
});

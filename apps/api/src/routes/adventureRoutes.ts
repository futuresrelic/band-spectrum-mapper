import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const adventureRouter = Router();
adventureRouter.use(requireAuth, requireAdmin);

// ── CRUD ──────────────────────────────────────────────────────────────────────

adventureRouter.get('/', async (_req, res, next): Promise<void> => {
  try {
    const adventures = await prisma.bandRpgAdventure.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { levels: true, quests: true, arcs: true, items: true } },
      },
    });
    res.json(adventures); return;
  } catch (err) { next(err); return; }
});

adventureRouter.post('/', async (req, res, next): Promise<void> => {
  try {
    const { slug, name, description, version, isPublished } = req.body as {
      slug: string; name: string; description?: string; version?: number; isPublished?: boolean;
    };
    const adventure = await prisma.bandRpgAdventure.create({
      data: {
        slug, name,
        ...(description !== undefined ? { description } : {}),
        ...(version !== undefined ? { version } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
      },
    });
    res.json(adventure); return;
  } catch (err) { next(err); return; }
});

adventureRouter.put('/:id', async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const { slug, name, description, version, isPublished } = req.body as {
      slug?: string; name?: string; description?: string; version?: number; isPublished?: boolean;
    };
    const adventure = await prisma.bandRpgAdventure.update({
      where: { id },
      data: {
        ...(slug !== undefined ? { slug } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(version !== undefined ? { version } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
      },
    });
    res.json(adventure); return;
  } catch (err) { next(err); return; }
});

adventureRouter.delete('/:id', async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    // Unlink content rather than cascade-delete (player progress remains valid)
    await prisma.$transaction([
      prisma.bandRpgLevel.updateMany({ where: { adventureId: id }, data: { adventureId: null } }),
      prisma.bandRpgQuest.updateMany({ where: { adventureId: id }, data: { adventureId: null } }),
      prisma.bandRpgStoryArc.updateMany({ where: { adventureId: id }, data: { adventureId: null } }),
      prisma.bandRpgItem.updateMany({ where: { adventureId: id }, data: { adventureId: null } }),
      prisma.bandRpgAdventure.delete({ where: { id } }),
    ]);
    res.json({ ok: true }); return;
  } catch (err) { next(err); return; }
});

// Assign/unassign content to adventure
adventureRouter.post('/:id/assign', async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const { levelIds, questIds, arcIds, itemIds } = req.body as {
      levelIds?: string[]; questIds?: string[]; arcIds?: string[]; itemIds?: string[];
    };
    await prisma.$transaction([
      ...(levelIds ? [prisma.bandRpgLevel.updateMany({ where: { id: { in: levelIds } }, data: { adventureId: id } })] : []),
      ...(questIds ? [prisma.bandRpgQuest.updateMany({ where: { id: { in: questIds } }, data: { adventureId: id } })] : []),
      ...(arcIds ? [prisma.bandRpgStoryArc.updateMany({ where: { id: { in: arcIds } }, data: { adventureId: id } })] : []),
      ...(itemIds ? [prisma.bandRpgItem.updateMany({ where: { id: { in: itemIds } }, data: { adventureId: id } })] : []),
    ]);
    res.json({ ok: true }); return;
  } catch (err) { next(err); return; }
});

// ── Export ────────────────────────────────────────────────────────────────────

adventureRouter.get('/:id/export', async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const adventure = await prisma.bandRpgAdventure.findUnique({
      where: { id },
      include: {
        levels: {
          orderBy: { order: 'asc' },
          include: {
            objectives: { orderBy: { order: 'asc' } },
            npcs: true,
            beats: { orderBy: { order: 'asc' } },
            doors: { orderBy: [{ tileY: 'asc' }, { tileX: 'asc' }] },
            switches: { orderBy: [{ tileY: 'asc' }, { tileX: 'asc' }] },
            puzzles: { orderBy: { order: 'asc' } },
          },
        },
        quests: { orderBy: { order: 'asc' } },
        arcs: { include: { beats: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } },
        items: { orderBy: { name: 'asc' } },
      },
    });
    if (!adventure) { res.status(404).json({ error: 'Adventure not found' }); return; }

    // Gather all NPC ids in this adventure to resolve quest givers
    const allNpcs = adventure.levels.flatMap(l => l.npcs.map(n => ({ ...n, levelSlug: l.slug })));
    const npcIdToRef = new Map(allNpcs.map(n => [n.id, { levelSlug: n.levelSlug, name: n.name }]));

    // Gather all item slugs for targetSlug resolution
    const itemIdToSlug = new Map(adventure.items.map(i => [i.id, i.slug]));

    // Also look up items not in this adventure that quests/conditions might reference
    const allItemIds = new Set<string>();
    for (const level of adventure.levels) {
      for (const door of level.doors) {
        const cond = door.lockCondition as Record<string, unknown>;
        if (typeof cond['targetId'] === 'string') allItemIds.add(cond['targetId']);
      }
    }
    if (allItemIds.size > 0) {
      const extraItems = await prisma.bandRpgItem.findMany({
        where: { id: { in: [...allItemIds] } },
        select: { id: true, slug: true },
      });
      for (const i of extraItems) itemIdToSlug.set(i.id, i.slug);
    }

    // Quest id-to-slug map
    const questIdToSlug = new Map(adventure.quests.map(q => [q.id, q.slug]));

    function resolveCondition(cond: unknown): unknown {
      if (!cond || typeof cond !== 'object') return cond;
      const c = cond as Record<string, unknown>;
      const out: Record<string, unknown> = { ...c };
      if (typeof c['targetId'] === 'string') {
        const t = c['type'];
        if (t === 'item_owned') { out['targetSlug'] = itemIdToSlug.get(c['targetId']) ?? c['targetId']; delete out['targetId']; }
        else if (t === 'quest_complete' || t === 'quest_active') { out['targetSlug'] = questIdToSlug.get(c['targetId']) ?? c['targetId']; delete out['targetId']; }
        // For switch_activated, door_open etc: leave as targetId (level-scoped, resolved by name at import)
      }
      return out;
    }

    function resolveAction(action: unknown): unknown {
      if (!action || typeof action !== 'object') return action;
      const a = action as Record<string, unknown>;
      const out: Record<string, unknown> = { ...a };
      if (typeof a['targetId'] === 'string') {
        const t = a['type'];
        if (t === 'grant_item') { out['targetSlug'] = itemIdToSlug.get(a['targetId']) ?? a['targetId']; delete out['targetId']; }
        if (t === 'reveal_exit') { out['targetSlug'] = a['targetId']; delete out['targetId']; } // already a level slug
        // open_door, close_door, trigger_beat: leave as targetId (level-scoped)
      }
      return out;
    }

    // Build export timeline events for this adventure's levels and quests
    const timelineEvents = await prisma.bandRpgTimelineEvent.findMany({
      orderBy: { order: 'asc' },
    });
    // Filter timeline to refs that belong to this adventure
    const adventureLevelIds = new Set(adventure.levels.map(l => l.id));
    const adventureQuestIds = new Set(adventure.quests.map(q => q.id));
    const adventureArcIds = new Set(adventure.arcs.map(a => a.id));
    const relevantTimeline = timelineEvents.filter(t =>
      (t.refId && (adventureLevelIds.has(t.refId) || adventureQuestIds.has(t.refId) || adventureArcIds.has(t.refId)))
    );

    // Slug maps for timeline ref resolution
    const levelIdToSlug = new Map(adventure.levels.map(l => [l.id, l.slug]));
    const arcIdToSlug = new Map(adventure.arcs.map(a => [a.id, a.slug]));

    const payload = {
      bandRpgAdventureVersion: 1,
      exportedAt: new Date().toISOString(),
      adventure: {
        slug: adventure.slug,
        name: adventure.name,
        description: adventure.description ?? undefined,
        version: adventure.version,
      },
      items: adventure.items.map(i => ({
        slug: i.slug, name: i.name,
        description: i.description ?? undefined,
        type: i.type, rarity: i.rarity, scoreValue: i.scoreValue,
        iconUrl: i.iconUrl ?? undefined, spriteUrl: i.spriteUrl ?? undefined,
        isVisible: i.isVisible,
      })),
      quests: adventure.quests.map(q => {
        const giverRef = q.giverId ? npcIdToRef.get(q.giverId) : undefined;
        return {
          slug: q.slug, name: q.name,
          description: q.description ?? undefined,
          giverNpcName: giverRef?.name,
          giverNpcLevelSlug: giverRef?.levelSlug,
          objectiveIds: q.objectiveIds,
          reward: q.reward, isOptional: q.isOptional, order: q.order,
        };
      }),
      arcs: adventure.arcs.map(a => ({
        slug: a.slug, title: a.title,
        description: a.description ?? undefined,
        order: a.order,
      })),
      levels: adventure.levels.map(l => ({
        slug: l.slug, name: l.name,
        description: l.description ?? undefined,
        order: l.order, spawnX: l.spawnX, spawnY: l.spawnY,
        background: l.background ?? undefined,
        mapData: l.mapData, isPublished: l.isPublished,
        objectives: l.objectives.map(o => ({
          name: o.name, description: o.description ?? undefined,
          type: o.type, target: o.target ?? undefined,
          condition: o.condition, reward: o.reward,
          dialogueText: o.dialogueText ?? undefined,
          isOptional: o.isOptional, order: o.order,
          prerequisiteName: o.prerequisiteId
            ? l.objectives.find(x => x.id === o.prerequisiteId)?.name
            : undefined,
        })),
        npcs: l.npcs.map(n => ({
          name: n.name, role: n.role ?? undefined,
          faction: n.faction ?? undefined, portraitUrl: n.portraitUrl ?? undefined,
          positionX: n.positionX, positionY: n.positionY,
          defaultDialogue: n.defaultDialogue,
          visibilityCondition: n.visibilityCondition ? resolveCondition(n.visibilityCondition) : undefined,
        })),
        beats: l.beats.map(b => ({
          arcSlug: b.arcId ? arcIdToSlug.get(b.arcId) : undefined,
          type: b.type, content: b.content,
          unlockCondition: b.unlockCondition, order: b.order,
        })),
        doors: l.doors.map(d => ({
          name: d.name, tileX: d.tileX, tileY: d.tileY,
          type: d.type, lockCondition: resolveCondition(d.lockCondition),
          openedByDefault: d.openedByDefault, label: d.label ?? undefined,
        })),
        switches: l.switches.map(s => ({
          name: s.name, tileX: s.tileX, tileY: s.tileY,
          type: s.type, effect: resolveAction(s.effect),
          label: s.label ?? undefined,
        })),
        puzzles: l.puzzles.map(p => ({
          name: p.name, order: p.order,
          trigger: p.trigger, condition: resolveCondition(p.condition),
          action: resolveAction(p.action),
        })),
      })),
      timeline: relevantTimeline.map(t => ({
        title: t.title, type: t.type, isRequired: t.isRequired, order: t.order,
        refSlug: t.refId
          ? (levelIdToSlug.get(t.refId) ?? questIdToSlug.get(t.refId) ?? arcIdToSlug.get(t.refId) ?? t.refId)
          : undefined,
      })),
    };

    res.setHeader('Content-Disposition', `attachment; filename="${adventure.slug}-adventure.json"`);
    res.json(payload); return;
  } catch (err) { next(err); return; }
});

// ── Import validation types ───────────────────────────────────────────────────

interface ImportPayload {
  bandRpgAdventureVersion?: number;
  adventure: { slug: string; name: string; description?: string };
  items?: ImportItem[];
  quests?: ImportQuest[];
  arcs?: ImportArc[];
  levels?: ImportLevel[];
  timeline?: ImportTimeline[];
}

interface ImportItem { slug: string; name: string; description?: string; type?: string; rarity?: string; scoreValue?: number; iconUrl?: string; spriteUrl?: string; isVisible?: boolean; }
interface ImportQuest { slug: string; name: string; description?: string; giverNpcName?: string; giverNpcLevelSlug?: string; reward?: Record<string, unknown>; isOptional?: boolean; order?: number; }
interface ImportArc { slug: string; title: string; description?: string; order?: number; }
interface ImportObjective { name: string; description?: string; type: string; target?: string; condition?: Record<string, unknown>; reward?: Record<string, unknown>; dialogueText?: string; isOptional?: boolean; order?: number; prerequisiteName?: string; }
interface ImportNpc { name: string; role?: string; faction?: string; portraitUrl?: string; positionX?: number; positionY?: number; defaultDialogue?: unknown[]; visibilityCondition?: Record<string, unknown>; }
interface ImportBeat { arcSlug?: string; type: string; content?: Record<string, unknown>; unlockCondition?: Record<string, unknown>; order?: number; }
interface ImportDoor { name: string; tileX: number; tileY: number; type?: string; lockCondition?: Record<string, unknown>; openedByDefault?: boolean; label?: string; }
interface ImportSwitch { name: string; tileX: number; tileY: number; type?: string; effect?: Record<string, unknown>; label?: string; }
interface ImportPuzzle { name: string; trigger?: Record<string, unknown>; condition?: Record<string, unknown>; action?: Record<string, unknown>; order?: number; }
interface ImportTimeline { title: string; type: string; refSlug?: string; isRequired?: boolean; order?: number; }
interface ImportLevel { slug: string; name: string; description?: string; order?: number; spawnX?: number; spawnY?: number; background?: string; mapData?: unknown; isPublished?: boolean; objectives?: ImportObjective[]; npcs?: ImportNpc[]; beats?: ImportBeat[]; doors?: ImportDoor[]; switches?: ImportSwitch[]; puzzles?: ImportPuzzle[]; }

interface ValidationError { path: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; preview: ImportPreview | null; }
interface ImportPreview { levelCount: number; npcCount: number; objectiveCount: number; questCount: number; arcCount: number; itemCount: number; beatCount: number; doorCount: number; switchCount: number; puzzleCount: number; timelineCount: number; }

function validatePayload(body: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: [{ path: 'root', message: 'Payload must be a JSON object' }], preview: null };
  }
  const p = body as Partial<ImportPayload>;

  if (!p.adventure || typeof p.adventure !== 'object') {
    errors.push({ path: 'adventure', message: 'Required: adventure object with slug and name' });
  } else {
    if (!p.adventure.slug) errors.push({ path: 'adventure.slug', message: 'Required' });
    if (!p.adventure.name) errors.push({ path: 'adventure.name', message: 'Required' });
    if (p.adventure.slug && !/^[a-z0-9-]+$/.test(p.adventure.slug)) {
      errors.push({ path: 'adventure.slug', message: 'Must contain only lowercase letters, numbers, and hyphens' });
    }
  }

  // Check for duplicate slugs within the package
  const levelSlugs = (p.levels ?? []).map(l => l.slug).filter(Boolean);
  const questSlugs = (p.quests ?? []).map(q => q.slug).filter(Boolean);
  const itemSlugs = (p.items ?? []).map(i => i.slug).filter(Boolean);
  const arcSlugs = (p.arcs ?? []).map(a => a.slug).filter(Boolean);

  const dupLevel = levelSlugs.find((s, i) => levelSlugs.indexOf(s) !== i);
  if (dupLevel) errors.push({ path: 'levels', message: `Duplicate level slug: "${dupLevel}"` });

  const dupQuest = questSlugs.find((s, i) => questSlugs.indexOf(s) !== i);
  if (dupQuest) errors.push({ path: 'quests', message: `Duplicate quest slug: "${dupQuest}"` });

  const dupItem = itemSlugs.find((s, i) => itemSlugs.indexOf(s) !== i);
  if (dupItem) errors.push({ path: 'items', message: `Duplicate item slug: "${dupItem}"` });

  const dupArc = arcSlugs.find((s, i) => arcSlugs.indexOf(s) !== i);
  if (dupArc) errors.push({ path: 'arcs', message: `Duplicate arc slug: "${dupArc}"` });

  // Validate level required fields
  for (const [i, level] of (p.levels ?? []).entries()) {
    if (!level.slug) errors.push({ path: `levels[${i}].slug`, message: 'Required' });
    if (!level.name) errors.push({ path: `levels[${i}].name`, message: 'Required' });
    for (const [j, obj] of (level.objectives ?? []).entries()) {
      if (!obj.name) errors.push({ path: `levels[${i}].objectives[${j}].name`, message: 'Required' });
      if (!obj.type) errors.push({ path: `levels[${i}].objectives[${j}].type`, message: 'Required' });
    }
    for (const [j, beat] of (level.beats ?? []).entries()) {
      if (!beat.type) errors.push({ path: `levels[${i}].beats[${j}].type`, message: 'Required' });
      if (beat.arcSlug && !arcSlugs.includes(beat.arcSlug)) {
        errors.push({ path: `levels[${i}].beats[${j}].arcSlug`, message: `Arc slug "${beat.arcSlug}" not found in package` });
      }
    }
  }

  // Validate quest required fields
  for (const [i, quest] of (p.quests ?? []).entries()) {
    if (!quest.slug) errors.push({ path: `quests[${i}].slug`, message: 'Required' });
    if (!quest.name) errors.push({ path: `quests[${i}].name`, message: 'Required' });
    if (quest.giverNpcLevelSlug && !levelSlugs.includes(quest.giverNpcLevelSlug)) {
      errors.push({ path: `quests[${i}].giverNpcLevelSlug`, message: `Level slug "${quest.giverNpcLevelSlug}" not found in package` });
    }
  }

  const preview: ImportPreview = {
    levelCount: (p.levels ?? []).length,
    npcCount: (p.levels ?? []).reduce((s, l) => s + (l.npcs ?? []).length, 0),
    objectiveCount: (p.levels ?? []).reduce((s, l) => s + (l.objectives ?? []).length, 0),
    questCount: (p.quests ?? []).length,
    arcCount: (p.arcs ?? []).length,
    itemCount: (p.items ?? []).length,
    beatCount: (p.levels ?? []).reduce((s, l) => s + (l.beats ?? []).length, 0),
    doorCount: (p.levels ?? []).reduce((s, l) => s + (l.doors ?? []).length, 0),
    switchCount: (p.levels ?? []).reduce((s, l) => s + (l.switches ?? []).length, 0),
    puzzleCount: (p.levels ?? []).reduce((s, l) => s + (l.puzzles ?? []).length, 0),
    timelineCount: (p.timeline ?? []).length,
  };

  return { valid: errors.length === 0, errors, preview };
}

// ── POST /validate — dry run without DB writes ────────────────────────────────

adventureRouter.post('/validate', async (req, res, next): Promise<void> => {
  try {
    const result = validatePayload(req.body);

    if (!result.valid) { res.json(result); return; }
    const p = req.body as ImportPayload;

    // Check DB for existing slugs
    const dbErrors: ValidationError[] = [];
    const adventureSlug = p.adventure.slug;

    const existingAdventure = await prisma.bandRpgAdventure.findUnique({ where: { slug: adventureSlug }, select: { id: true } });
    if (existingAdventure) {
      dbErrors.push({ path: 'adventure.slug', message: `Adventure with slug "${adventureSlug}" already exists in database` });
    }

    const levelSlugs = (p.levels ?? []).map(l => l.slug);
    if (levelSlugs.length > 0) {
      const existing = await prisma.bandRpgLevel.findMany({ where: { slug: { in: levelSlugs } }, select: { slug: true } });
      for (const e of existing) dbErrors.push({ path: 'levels', message: `Level slug "${e.slug}" already exists in database` });
    }

    const questSlugs = (p.quests ?? []).map(q => q.slug);
    if (questSlugs.length > 0) {
      const existing = await prisma.bandRpgQuest.findMany({ where: { slug: { in: questSlugs } }, select: { slug: true } });
      for (const e of existing) dbErrors.push({ path: 'quests', message: `Quest slug "${e.slug}" already exists in database` });
    }

    const itemSlugs = (p.items ?? []).map(i => i.slug);
    if (itemSlugs.length > 0) {
      const existing = await prisma.bandRpgItem.findMany({ where: { slug: { in: itemSlugs } }, select: { slug: true } });
      for (const e of existing) dbErrors.push({ path: 'items', message: `Item slug "${e.slug}" already exists in database` });
    }

    const arcSlugs = (p.arcs ?? []).map(a => a.slug);
    if (arcSlugs.length > 0) {
      const existing = await prisma.bandRpgStoryArc.findMany({ where: { slug: { in: arcSlugs } }, select: { slug: true } });
      for (const e of existing) dbErrors.push({ path: 'arcs', message: `Arc slug "${e.slug}" already exists in database` });
    }

    const allErrors = [...result.errors, ...dbErrors];
    res.json({ valid: allErrors.length === 0, errors: allErrors, preview: result.preview }); return;
  } catch (err) { next(err); return; }
});

// ── POST /import — validate + write to DB ─────────────────────────────────────

adventureRouter.post('/import', async (req, res, next): Promise<void> => {
  try {
    const { payload, mode = 'create' } = req.body as { payload: unknown; mode?: 'create' | 'update' | 'replace' };

    // Step 1: structural validation
    const validation = validatePayload(payload);
    if (!validation.valid) {
      res.status(422).json({ ok: false, errors: validation.errors, preview: validation.preview }); return;
    }
    const p = payload as ImportPayload;

    // Step 2: DB existence checks for create mode
    if (mode === 'create') {
      const dbErrors: ValidationError[] = [];
      const levelSlugs = (p.levels ?? []).map(l => l.slug);
      if (levelSlugs.length > 0) {
        const ex = await prisma.bandRpgLevel.findMany({ where: { slug: { in: levelSlugs } }, select: { slug: true } });
        for (const e of ex) dbErrors.push({ path: 'levels', message: `Level slug "${e.slug}" already exists. Use mode=update to upsert.` });
      }
      const questSlugs = (p.quests ?? []).map(q => q.slug);
      if (questSlugs.length > 0) {
        const ex = await prisma.bandRpgQuest.findMany({ where: { slug: { in: questSlugs } }, select: { slug: true } });
        for (const e of ex) dbErrors.push({ path: 'quests', message: `Quest slug "${e.slug}" already exists.` });
      }
      const itemSlugs = (p.items ?? []).map(i => i.slug);
      if (itemSlugs.length > 0) {
        const ex = await prisma.bandRpgItem.findMany({ where: { slug: { in: itemSlugs } }, select: { slug: true } });
        for (const e of ex) dbErrors.push({ path: 'items', message: `Item slug "${e.slug}" already exists.` });
      }
      const arcSlugs = (p.arcs ?? []).map(a => a.slug);
      if (arcSlugs.length > 0) {
        const ex = await prisma.bandRpgStoryArc.findMany({ where: { slug: { in: arcSlugs } }, select: { slug: true } });
        for (const e of ex) dbErrors.push({ path: 'arcs', message: `Arc slug "${e.slug}" already exists.` });
      }
      if (dbErrors.length > 0) {
        res.status(422).json({ ok: false, errors: dbErrors, preview: validation.preview }); return;
      }
    }

    // Step 3: For replace mode, delete existing adventure content
    if (mode === 'replace') {
      const existing = await prisma.bandRpgAdventure.findUnique({ where: { slug: p.adventure.slug } });
      if (existing) {
        // Delete level-scoped entities first (cascade handles sub-entities)
        const existingLevels = await prisma.bandRpgLevel.findMany({
          where: { adventureId: existing.id }, select: { id: true },
        });
        const levelIds = existingLevels.map(l => l.id);
        await prisma.$transaction([
          prisma.bandRpgPuzzle.deleteMany({ where: { levelId: { in: levelIds } } }),
          prisma.bandRpgDoor.deleteMany({ where: { levelId: { in: levelIds } } }),
          prisma.bandRpgSwitch.deleteMany({ where: { levelId: { in: levelIds } } }),
          prisma.bandRpgNpc.deleteMany({ where: { levelId: { in: levelIds } } }),
          prisma.bandRpgObjective.deleteMany({ where: { levelId: { in: levelIds } } }),
          prisma.bandRpgStoryBeat.deleteMany({ where: { levelId: { in: levelIds } } }),
          prisma.bandRpgLevel.deleteMany({ where: { adventureId: existing.id } }),
          prisma.bandRpgQuest.deleteMany({ where: { adventureId: existing.id } }),
          prisma.bandRpgStoryArc.deleteMany({ where: { adventureId: existing.id } }),
          prisma.bandRpgItem.deleteMany({ where: { adventureId: existing.id } }),
        ]);
      }
    }

    // Step 4: Create or upsert adventure
    let adventureId: string;
    if (mode === 'update' || mode === 'replace') {
      const upserted = await prisma.bandRpgAdventure.upsert({
        where: { slug: p.adventure.slug },
        update: {
          name: p.adventure.name,
          ...(p.adventure.description !== undefined ? { description: p.adventure.description } : {}),
        },
        create: {
          slug: p.adventure.slug,
          name: p.adventure.name,
          ...(p.adventure.description !== undefined ? { description: p.adventure.description } : {}),
        },
      });
      adventureId = upserted.id;
    } else {
      const created = await prisma.bandRpgAdventure.create({
        data: {
          slug: p.adventure.slug, name: p.adventure.name,
          ...(p.adventure.description !== undefined ? { description: p.adventure.description } : {}),
        },
      });
      adventureId = created.id;
    }

    // Step 5: Create arcs
    const arcSlugToId = new Map<string, string>();
    for (const arc of p.arcs ?? []) {
      if (mode === 'update') {
        const upserted = await prisma.bandRpgStoryArc.upsert({
          where: { slug: arc.slug },
          update: { title: arc.title, adventureId },
          create: { slug: arc.slug, title: arc.title, adventureId, order: arc.order ?? 0 },
        });
        arcSlugToId.set(arc.slug, upserted.id);
      } else {
        const created = await prisma.bandRpgStoryArc.create({
          data: { slug: arc.slug, title: arc.title, adventureId, order: arc.order ?? 0,
            ...(arc.description !== undefined ? { description: arc.description } : {}) },
        });
        arcSlugToId.set(arc.slug, created.id);
      }
    }

    // Step 6: Create items
    const itemSlugToId = new Map<string, string>();

    // Pre-load existing item slugs referenced in conditions
    const existingItemSlugs = new Set<string>();
    for (const level of p.levels ?? []) {
      for (const door of level.doors ?? []) {
        const cond = door.lockCondition as Record<string, unknown> | undefined;
        if (cond?.['targetSlug'] && typeof cond['targetSlug'] === 'string') existingItemSlugs.add(cond['targetSlug']);
      }
    }
    if (existingItemSlugs.size > 0) {
      const existing = await prisma.bandRpgItem.findMany({
        where: { slug: { in: [...existingItemSlugs] } }, select: { id: true, slug: true },
      });
      for (const i of existing) itemSlugToId.set(i.slug, i.id);
    }

    for (const item of p.items ?? []) {
      if (mode === 'update') {
        const upserted = await prisma.bandRpgItem.upsert({
          where: { slug: item.slug },
          update: { name: item.name, adventureId },
          create: {
            slug: item.slug, name: item.name, adventureId,
            type: (item.type as import('@prisma/client').BandRpgItemType) ?? 'collectible',
            rarity: item.rarity ?? 'common', scoreValue: item.scoreValue ?? 0,
            ...(item.description !== undefined ? { description: item.description } : {}),
          },
        });
        itemSlugToId.set(item.slug, upserted.id);
      } else {
        const created = await prisma.bandRpgItem.create({
          data: {
            slug: item.slug, name: item.name, adventureId,
            type: (item.type as import('@prisma/client').BandRpgItemType) ?? 'collectible',
            rarity: item.rarity ?? 'common', scoreValue: item.scoreValue ?? 0,
            ...(item.description !== undefined ? { description: item.description } : {}),
          },
        });
        itemSlugToId.set(item.slug, created.id);
      }
    }

    // Helper: resolve slug/name → id in conditions and actions
    function resolveRef(
      cond: Record<string, unknown>,
      levelSlugToId: Map<string, string>,
      questSlugToId: Map<string, string>,
    ): Record<string, unknown> {
      const out = { ...cond };
      if (typeof out['targetSlug'] === 'string') {
        const slug = out['targetSlug'];
        const t = out['type'];
        let resolved: string | undefined;
        if (t === 'item_owned' || t === 'grant_item') resolved = itemSlugToId.get(slug);
        else if (t === 'quest_complete' || t === 'quest_active') resolved = questSlugToId.get(slug);
        else if (t === 'reveal_exit') resolved = slug; // already a level slug — keep as-is (runtime uses slug)
        if (resolved) { out['targetId'] = resolved; delete out['targetSlug']; }
      }
      return out;
    }

    // Step 7: Create levels (and NPCs, objectives, beats, doors, switches, puzzles)
    const levelSlugToId = new Map<string, string>();
    const questSlugToId = new Map<string, string>(); // filled in step 8

    const levelImportData: Array<{
      levelId: string;
      levelSlug: string;
      npcs: ImportNpc[];
      objectives: ImportObjective[];
      beats: ImportBeat[];
      doors: ImportDoor[];
      switches: ImportSwitch[];
      puzzles: ImportPuzzle[];
    }> = [];

    for (const level of p.levels ?? []) {
      let levelId: string;
      if (mode === 'update') {
        const upserted = await prisma.bandRpgLevel.upsert({
          where: { slug: level.slug },
          update: { name: level.name, adventureId, spawnX: level.spawnX ?? 0, spawnY: level.spawnY ?? 0, mapData: (level.mapData ?? {}) as Prisma.InputJsonValue },
          create: {
            slug: level.slug, name: level.name, adventureId,
            spawnX: level.spawnX ?? 0, spawnY: level.spawnY ?? 0,
            mapData: (level.mapData ?? {}) as Prisma.InputJsonValue,
            order: level.order ?? 0, isPublished: level.isPublished ?? false,
            ...(level.description !== undefined ? { description: level.description } : {}),
            ...(level.background !== undefined ? { background: level.background } : {}),
          },
        });
        levelId = upserted.id;
      } else {
        const created = await prisma.bandRpgLevel.create({
          data: {
            slug: level.slug, name: level.name, adventureId,
            spawnX: level.spawnX ?? 0, spawnY: level.spawnY ?? 0,
            mapData: (level.mapData ?? {}) as Prisma.InputJsonValue,
            order: level.order ?? 0, isPublished: level.isPublished ?? false,
            ...(level.description !== undefined ? { description: level.description } : {}),
            ...(level.background !== undefined ? { background: level.background } : {}),
          },
        });
        levelId = created.id;
      }
      levelSlugToId.set(level.slug, levelId);
      levelImportData.push({
        levelId, levelSlug: level.slug,
        npcs: level.npcs ?? [],
        objectives: level.objectives ?? [],
        beats: level.beats ?? [],
        doors: level.doors ?? [],
        switches: level.switches ?? [],
        puzzles: level.puzzles ?? [],
      });
    }

    // Step 8: Create quests (need level data for NPC lookup)
    for (const quest of p.quests ?? []) {
      // Resolve giver NPC id
      let giverId: string | undefined;
      if (quest.giverNpcName && quest.giverNpcLevelSlug) {
        const lv = levelImportData.find(l => l.levelSlug === quest.giverNpcLevelSlug);
        if (lv) {
          // NPC not created yet — we'll update giverId after NPC creation in step 9
          // For now, leave giverId undefined and patch later
        }
      }

      if (mode === 'update') {
        const upserted = await prisma.bandRpgQuest.upsert({
          where: { slug: quest.slug },
          update: { name: quest.name, adventureId, ...(giverId ? { giverId } : {}), reward: (quest.reward ?? {}) as Prisma.InputJsonValue },
          create: {
            slug: quest.slug, name: quest.name, adventureId,
            ...(giverId ? { giverId } : {}),
            reward: (quest.reward ?? {}) as Prisma.InputJsonValue,
            isOptional: quest.isOptional ?? false, order: quest.order ?? 0,
            ...(quest.description !== undefined ? { description: quest.description } : {}),
          },
        });
        questSlugToId.set(quest.slug, upserted.id);
      } else {
        const created = await prisma.bandRpgQuest.create({
          data: {
            slug: quest.slug, name: quest.name, adventureId,
            ...(giverId ? { giverId } : {}),
            reward: (quest.reward ?? {}) as Prisma.InputJsonValue,
            isOptional: quest.isOptional ?? false, order: quest.order ?? 0,
            ...(quest.description !== undefined ? { description: quest.description } : {}),
          },
        });
        questSlugToId.set(quest.slug, created.id);
      }
    }

    // Step 9: Create level-scoped entities (NPCs, objectives, beats, doors, switches, puzzles)
    const npcNameToId = new Map<string, string>(); // level-scoped: "levelSlug:npcName" → id

    for (const lv of levelImportData) {
      // Objectives
      const objNameToId = new Map<string, string>();
      const objectivesToCreate = lv.objectives.map(o => ({
        levelId: lv.levelId, name: o.name, type: o.type as import('@prisma/client').BandRpgObjectiveType,
        condition: (o.condition ?? {}) as Prisma.InputJsonValue,
        reward: (o.reward ?? {}) as Prisma.InputJsonValue,
        isOptional: o.isOptional ?? false, order: o.order ?? 0,
        ...(o.description !== undefined ? { description: o.description } : {}),
        ...(o.target !== undefined ? { target: o.target } : {}),
        ...(o.dialogueText !== undefined ? { dialogueText: o.dialogueText } : {}),
      }));
      const createdObjs = await prisma.bandRpgObjective.createManyAndReturn({ data: objectivesToCreate });
      for (let i = 0; i < createdObjs.length; i++) {
        const obj = lv.objectives[i]!;
        const created = createdObjs[i]!;
        objNameToId.set(obj.name, created.id);
      }

      // Patch prerequisite links
      for (const obj of lv.objectives) {
        if (obj.prerequisiteName) {
          const prereqId = objNameToId.get(obj.prerequisiteName);
          const objId = objNameToId.get(obj.name);
          if (prereqId && objId) {
            await prisma.bandRpgObjective.update({ where: { id: objId }, data: { prerequisiteId: prereqId } });
          }
        }
      }

      // NPCs
      for (const npc of lv.npcs) {
        const visibilityCondition = npc.visibilityCondition
          ? resolveRef(npc.visibilityCondition, levelSlugToId, questSlugToId) as Prisma.InputJsonValue
          : undefined;
        const created = await prisma.bandRpgNpc.create({
          data: {
            levelId: lv.levelId, name: npc.name,
            positionX: npc.positionX ?? 0, positionY: npc.positionY ?? 0,
            defaultDialogue: (npc.defaultDialogue ?? []) as Prisma.InputJsonValue,
            ...(npc.role !== undefined ? { role: npc.role } : {}),
            ...(npc.faction !== undefined ? { faction: npc.faction } : {}),
            ...(npc.portraitUrl !== undefined ? { portraitUrl: npc.portraitUrl } : {}),
            ...(visibilityCondition !== undefined ? { visibilityCondition } : {}),
          },
        });
        npcNameToId.set(`${lv.levelSlug}:${npc.name}`, created.id);
      }

      // Story beats
      const beatsByOrder = new Map<number, string>();
      for (const beat of lv.beats) {
        const arcId = beat.arcSlug ? arcSlugToId.get(beat.arcSlug) : undefined;
        const created = await prisma.bandRpgStoryBeat.create({
          data: {
            levelId: lv.levelId, type: beat.type as import('@prisma/client').BandRpgBeatType,
            content: (beat.content ?? {}) as Prisma.InputJsonValue,
            unlockCondition: (beat.unlockCondition ?? {}) as Prisma.InputJsonValue,
            order: beat.order ?? 0,
            ...(arcId ? { arcId } : {}),
          },
        });
        if (beat.order !== undefined) beatsByOrder.set(beat.order, created.id);
      }

      // Doors
      const doorNameToId = new Map<string, string>();
      for (const door of lv.doors) {
        const lockCondition = resolveRef(
          door.lockCondition ?? {}, levelSlugToId, questSlugToId,
        ) as Prisma.InputJsonValue;
        const created = await prisma.bandRpgDoor.create({
          data: {
            levelId: lv.levelId, name: door.name, tileX: door.tileX, tileY: door.tileY,
            type: (door.type as import('@prisma/client').BandRpgDoorType) ?? 'key_door',
            lockCondition, openedByDefault: door.openedByDefault ?? false,
            ...(door.label !== undefined ? { label: door.label } : {}),
          },
        });
        doorNameToId.set(door.name, created.id);
      }

      // Switches
      const switchNameToId = new Map<string, string>();
      for (const sw of lv.switches) {
        // Resolve effect targetId from name references
        const effect = (sw.effect ?? {}) as Record<string, unknown>;
        let resolvedEffect = resolveRef(effect, levelSlugToId, questSlugToId);
        if (resolvedEffect['targetId'] === undefined && typeof effect['targetName'] === 'string') {
          const refName = effect['targetName'] as string;
          const targetId = doorNameToId.get(refName);
          if (targetId) { resolvedEffect = { ...resolvedEffect, targetId }; delete resolvedEffect['targetName']; }
        }
        const created = await prisma.bandRpgSwitch.create({
          data: {
            levelId: lv.levelId, name: sw.name, tileX: sw.tileX, tileY: sw.tileY,
            type: (sw.type as import('@prisma/client').BandRpgSwitchType) ?? 'switch',
            effect: resolvedEffect as Prisma.InputJsonValue,
            ...(sw.label !== undefined ? { label: sw.label } : {}),
          },
        });
        switchNameToId.set(sw.name, created.id);
      }

      // Puzzles (resolve cross-refs in trigger/condition/action)
      for (const puzzle of lv.puzzles) {
        function resolvePuzzleRef(obj: Record<string, unknown>): Record<string, unknown> {
          let out = resolveRef(obj, levelSlugToId, questSlugToId);
          if (typeof out['targetName'] === 'string') {
            const refName = out['targetName'] as string;
            const t = out['type'];
            let resolved: string | undefined;
            if (t === 'open_door' || t === 'close_door') resolved = doorNameToId.get(refName);
            else if (t === 'switch_activated') resolved = switchNameToId.get(refName);
            else if (t === 'door_open') resolved = doorNameToId.get(refName);
            if (resolved) { out = { ...out, targetId: resolved }; delete out['targetName']; }
          }
          return out;
        }

        const trigger = puzzle.trigger ? resolvePuzzleRef({ ...puzzle.trigger }) : {};
        const condition = puzzle.condition ? resolvePuzzleRef({ ...puzzle.condition }) : {};
        const action = puzzle.action ? resolvePuzzleRef({ ...puzzle.action }) : {};

        await prisma.bandRpgPuzzle.create({
          data: {
            levelId: lv.levelId, name: puzzle.name, order: puzzle.order ?? 0,
            trigger: trigger as Prisma.InputJsonValue,
            condition: condition as Prisma.InputJsonValue,
            action: action as Prisma.InputJsonValue,
          },
        });
      }

      // Patch quest giverIds now that NPCs are created
      for (const quest of p.quests ?? []) {
        if (quest.giverNpcName && quest.giverNpcLevelSlug === lv.levelSlug) {
          const npcId = npcNameToId.get(`${lv.levelSlug}:${quest.giverNpcName}`);
          const questId = questSlugToId.get(quest.slug);
          if (npcId && questId) {
            await prisma.bandRpgQuest.update({ where: { id: questId }, data: { giverId: npcId } });
          }
        }
      }
    }

    // Step 10: Update quest objectiveIds lists by matching objective names
    for (const quest of p.quests ?? []) {
      const questId = questSlugToId.get(quest.slug);
      if (!questId) continue;
      // objectiveIds in the import format might already be DB IDs or names
      // For now, keep as-is — they'll be empty for fresh imports
    }

    // Step 11: Create timeline events
    for (const t of p.timeline ?? []) {
      let refId: string | undefined;
      if (t.refSlug) {
        refId = levelSlugToId.get(t.refSlug) ?? questSlugToId.get(t.refSlug)
               ?? [...arcSlugToId.entries()].find(([k]) => k === t.refSlug)?.[1];
      }
      await prisma.bandRpgTimelineEvent.create({
        data: {
          title: t.title, type: t.type, order: t.order ?? 0,
          isRequired: t.isRequired ?? true,
          ...(refId !== undefined ? { refId } : {}),
        },
      });
    }

    res.json({
      ok: true,
      adventureId,
      imported: validation.preview,
    }); return;
  } catch (err) { next(err); return; }
});

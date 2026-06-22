import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { validateReachability } from '../services/reachabilityValidator.js';

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

// Get single adventure with full metadata (admin)
adventureRouter.get('/:id/meta', async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const adventure = await prisma.bandRpgAdventure.findUnique({
      where: { id },
      include: {
        _count: { select: { levels: true, quests: true, arcs: true, items: true, progress: true } },
      },
    });
    if (!adventure) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(adventure); return;
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
    const {
      slug, name, description, version, isPublished,
      featured, coverImageUrl, authorName, difficulty, estimatedPlaytime, tags,
    } = req.body as {
      slug?: string; name?: string; description?: string; version?: number;
      isPublished?: boolean; featured?: boolean; coverImageUrl?: string;
      authorName?: string; difficulty?: string; estimatedPlaytime?: number;
      tags?: string[];
    };
    const adventure = await prisma.bandRpgAdventure.update({
      where: { id },
      data: {
        ...(slug !== undefined ? { slug } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(version !== undefined ? { version } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
        ...(featured !== undefined ? { featured } : {}),
        ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
        ...(authorName !== undefined ? { authorName } : {}),
        ...(difficulty !== undefined ? { difficulty } : {}),
        ...(estimatedPlaytime !== undefined ? { estimatedPlaytime } : {}),
        ...(tags !== undefined ? { tags: tags as Prisma.InputJsonValue } : {}),
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
  adventure: {
    slug: string;
    name: string;
    description?: string;
    isPublished?: boolean;
    featured?: boolean;
    authorName?: string;
    coverImageUrl?: string;
    difficulty?: string;
    estimatedPlaytime?: number;
    tags?: string[];
  };
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

// Valid enum values — must stay in sync with prisma/schema.prisma BandRpgItemType
const VALID_ITEM_TYPES = [
  'collectible', 'key_item', 'quest_item', 'power_up',
  'lore_item', 'album_artifact', 'song_artifact', 'cosmetic',
] as const;

// Documented rarity values — rarity is a plain String field but validated for consistency
const VALID_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

// ── estimatedPlaytime normalization ───────────────────────────────────────────
// GPT sometimes outputs "2-3 hours" or "45 minutes" instead of a bare integer.
// Normalize to an integer number of minutes before validation so the repair loop
// is not wasted on a trivially fixable type mismatch.

export function normalizeEstimatedPlaytime(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return raw as null | undefined;
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : Math.round(raw);
  if (typeof raw !== 'string') return undefined; // unparseable — let validation flag it

  const s = raw.trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10);

  const minsMatch = s.match(/^(\d+)\s*(?:minutes?|mins?)$/);
  if (minsMatch) return parseInt(minsMatch[1]!, 10);

  const hoursMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)$/);
  if (hoursMatch) return Math.round(parseFloat(hoursMatch[1]!) * 60);

  // "2-3 hours" or "2–3 hours" → average → minutes
  const rangeHoursMatch = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)$/);
  if (rangeHoursMatch) {
    const avg = (parseFloat(rangeHoursMatch[1]!) + parseFloat(rangeHoursMatch[2]!)) / 2;
    return Math.round(avg * 60);
  }

  // "30-45 minutes" or "30–45 min" → average
  const rangeMinsMatch = s.match(/^(\d+)\s*[-–]\s*(\d+)\s*(?:minutes?|mins?)$/);
  if (rangeMinsMatch) {
    const avg = (parseInt(rangeMinsMatch[1]!, 10) + parseInt(rangeMinsMatch[2]!, 10)) / 2;
    return Math.round(avg);
  }

  return undefined; // not parseable — validation will produce a clear error
}

// Normalize the top-level adventure.estimatedPlaytime field of an arbitrary payload.
// Returns a new object — does not mutate the original.
function normalizePayload(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const p = body as Record<string, unknown>;
  const adv = p['adventure'];
  if (!adv || typeof adv !== 'object') return body;
  const a = adv as Record<string, unknown>;
  if (!('estimatedPlaytime' in a)) return body;
  const normalized = normalizeEstimatedPlaytime(a['estimatedPlaytime']);
  return {
    ...p,
    adventure: { ...a, estimatedPlaytime: normalized },
  };
}

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
    const rawEpt = (p.adventure as Record<string, unknown>)['estimatedPlaytime'];
    if (rawEpt !== undefined && rawEpt !== null) {
      if (typeof rawEpt !== 'number' || !Number.isInteger(rawEpt) || rawEpt <= 0) {
        errors.push({
          path: 'adventure.estimatedPlaytime',
          message: `estimatedPlaytime must be an integer number of minutes (e.g. 30, 45, 120). Got: ${JSON.stringify(rawEpt)}`,
        });
      }
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

  // Validate item required fields and enum values
  for (const [i, item] of (p.items ?? []).entries()) {
    if (!item.slug) errors.push({ path: `items[${i}].slug`, message: 'Required' });
    if (!item.name) errors.push({ path: `items[${i}].name`, message: 'Required' });
    if (item.type && !(VALID_ITEM_TYPES as readonly string[]).includes(item.type)) {
      errors.push({
        path: `items[${i}].type`,
        message: `Invalid item type "${item.type}" for item "${item.slug ?? i}". Expected one of: ${VALID_ITEM_TYPES.join(', ')}`,
      });
    }
    if (item.rarity && !(VALID_RARITIES as readonly string[]).includes(item.rarity)) {
      errors.push({
        path: `items[${i}].rarity`,
        message: `Invalid item rarity "${item.rarity}" for item "${item.slug ?? i}". Expected one of: ${VALID_RARITIES.join(', ')}`,
      });
    }
  }

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

  // Reachability validation — BFS flood-fill from each level's spawn.
  // Runs after structural checks so map dimensions and spawn are already confirmed.
  for (const e of validateReachability(body)) errors.push(e);

  return { valid: errors.length === 0, errors, preview };
}

// ── POST /validate — dry run without DB writes ────────────────────────────────

adventureRouter.post('/validate', async (req, res, next): Promise<void> => {
  try {
    const result = validatePayload(normalizePayload(req.body));

    if (!result.valid) { res.json(result); return; }
    const p = req.body as ImportPayload;

    // Check DB for globally-unique slug conflicts.
    // Adventure slugs and Level slugs are globally unique (adventures are identified by slug,
    // levels are URL-navigable). Quest/arc/item slugs are per-adventure (@@unique([adventureId, slug]))
    // so they cannot conflict across adventures and are not checked here.
    const dbErrors: ValidationError[] = [];
    const adventureSlug = p.adventure.slug;

    const existingAdventure = await prisma.bandRpgAdventure.findUnique({ where: { slug: adventureSlug }, select: { id: true } });
    if (existingAdventure) {
      dbErrors.push({ path: 'adventure.slug', message: `Adventure with slug "${adventureSlug}" already exists in database. Use mode=update or mode=replace to overwrite.` });
    }

    const levelSlugs = (p.levels ?? []).map(l => l.slug);
    if (levelSlugs.length > 0) {
      const existing = await prisma.bandRpgLevel.findMany({ where: { slug: { in: levelSlugs } }, select: { slug: true } });
      for (const e of existing) dbErrors.push({ path: 'levels', message: `Level slug "${e.slug}" already exists in database` });
    }

    const allErrors = [...result.errors, ...dbErrors];
    res.json({ valid: allErrors.length === 0, errors: allErrors, preview: result.preview }); return;
  } catch (err) { next(err); return; }
});

// ── POST /import — validate + write to DB (fully atomic transaction) ──────────

adventureRouter.post('/import', async (req, res, next): Promise<void> => {
  try {
    const { payload: rawPayload, mode = 'create' } = req.body as { payload: unknown; mode?: 'create' | 'update' | 'replace' };
    const payload = normalizePayload(rawPayload);

    // Step 1: structural + enum validation (no DB writes)
    const validation = validatePayload(payload);
    if (!validation.valid) {
      res.status(422).json({ ok: false, error: 'Adventure validation failed', errors: validation.errors, preview: validation.preview }); return;
    }
    const p = payload as ImportPayload;

    // Step 2: DB existence checks for create mode (globally-unique fields only).
    // Quest/arc/item slugs are per-adventure (@@unique([adventureId, slug])) and cannot
    // conflict across adventures, so only adventure.slug and level slugs are checked here.
    if (mode === 'create') {
      const dbErrors: ValidationError[] = [];
      const existingAdv = await prisma.bandRpgAdventure.findUnique({ where: { slug: p.adventure.slug } });
      if (existingAdv) {
        dbErrors.push({ path: 'adventure.slug', message: `Adventure with slug "${p.adventure.slug}" already exists. Use mode=update or mode=replace.` });
      }
      const levelSlugs = (p.levels ?? []).map(l => l.slug);
      if (levelSlugs.length > 0) {
        const ex = await prisma.bandRpgLevel.findMany({ where: { slug: { in: levelSlugs } }, select: { slug: true } });
        for (const e of ex) dbErrors.push({ path: 'levels', message: `Level slug "${e.slug}" already exists. Choose a different slug or use mode=replace.` });
      }
      if (dbErrors.length > 0) {
        res.status(422).json({ ok: false, error: 'Adventure validation failed', errors: dbErrors, preview: validation.preview }); return;
      }
    }

    // Steps 3–11: all DB writes in a single atomic transaction.
    // If anything throws, the entire import is rolled back — no partial data left behind.
    const adventureId = await prisma.$transaction(async (tx) => {

      // Step 3a: Clean up orphaned content (adventureId = null) matching incoming slugs.
      // Handles remnants from failed imports that predate atomic transaction support.
      // Level slugs are globally unique so orphaned levels must be removed before creating new ones.
      const incomingLevelSlugs = (p.levels ?? []).map(l => l.slug);
      if (incomingLevelSlugs.length > 0) {
        const orphanLevels = await tx.bandRpgLevel.findMany({
          where: { slug: { in: incomingLevelSlugs }, adventureId: null },
          select: { id: true },
        });
        if (orphanLevels.length > 0) {
          const orphanIds = orphanLevels.map(l => l.id);
          await tx.bandRpgPuzzle.deleteMany({ where: { levelId: { in: orphanIds } } });
          await tx.bandRpgDoor.deleteMany({ where: { levelId: { in: orphanIds } } });
          await tx.bandRpgSwitch.deleteMany({ where: { levelId: { in: orphanIds } } });
          await tx.bandRpgNpc.deleteMany({ where: { levelId: { in: orphanIds } } });
          await tx.bandRpgObjective.deleteMany({ where: { levelId: { in: orphanIds } } });
          await tx.bandRpgStoryBeat.deleteMany({ where: { levelId: { in: orphanIds } } });
          await tx.bandRpgLevel.deleteMany({ where: { id: { in: orphanIds } } });
        }
      }
      // Arc/item/quest slugs are now per-adventure (@@unique([adventureId, slug])) so orphaned
      // rows (adventureId = null) don't cause unique conflicts anymore. Clean them up anyway
      // for data hygiene.
      const incomingArcSlugs = (p.arcs ?? []).map(a => a.slug);
      if (incomingArcSlugs.length > 0) {
        await tx.bandRpgStoryArc.deleteMany({ where: { slug: { in: incomingArcSlugs }, adventureId: null } });
      }
      const incomingItemSlugs = (p.items ?? []).map(i => i.slug);
      if (incomingItemSlugs.length > 0) {
        await tx.bandRpgItem.deleteMany({ where: { slug: { in: incomingItemSlugs }, adventureId: null } });
      }
      const incomingQuestSlugs = (p.quests ?? []).map(q => q.slug);
      if (incomingQuestSlugs.length > 0) {
        await tx.bandRpgQuest.deleteMany({ where: { slug: { in: incomingQuestSlugs }, adventureId: null } });
      }

      // Step 3b: For replace mode, delete all existing adventure content first
      if (mode === 'replace') {
        const existing = await tx.bandRpgAdventure.findUnique({ where: { slug: p.adventure.slug } });
        if (existing) {
          const existingLevels = await tx.bandRpgLevel.findMany({
            where: { adventureId: existing.id }, select: { id: true },
          });
          const levelIds = existingLevels.map(l => l.id);
          await tx.bandRpgPuzzle.deleteMany({ where: { levelId: { in: levelIds } } });
          await tx.bandRpgDoor.deleteMany({ where: { levelId: { in: levelIds } } });
          await tx.bandRpgSwitch.deleteMany({ where: { levelId: { in: levelIds } } });
          await tx.bandRpgNpc.deleteMany({ where: { levelId: { in: levelIds } } });
          await tx.bandRpgObjective.deleteMany({ where: { levelId: { in: levelIds } } });
          await tx.bandRpgStoryBeat.deleteMany({ where: { levelId: { in: levelIds } } });
          await tx.bandRpgLevel.deleteMany({ where: { adventureId: existing.id } });
          await tx.bandRpgQuest.deleteMany({ where: { adventureId: existing.id } });
          await tx.bandRpgStoryArc.deleteMany({ where: { adventureId: existing.id } });
          await tx.bandRpgItem.deleteMany({ where: { adventureId: existing.id } });
        }
      }

      // Step 4: Create or upsert adventure — apply all metadata fields from the JSON.
      // isPublished defaults to true on import so adventures appear in the browse endpoint immediately.
      const adventureMeta = {
        name: p.adventure.name,
        isPublished: p.adventure.isPublished ?? true,
        ...(p.adventure.description !== undefined ? { description: p.adventure.description } : {}),
        ...(p.adventure.featured !== undefined ? { featured: p.adventure.featured } : {}),
        ...(p.adventure.authorName !== undefined ? { authorName: p.adventure.authorName } : {}),
        ...(p.adventure.coverImageUrl !== undefined ? { coverImageUrl: p.adventure.coverImageUrl } : {}),
        ...(p.adventure.difficulty !== undefined ? { difficulty: p.adventure.difficulty } : {}),
        ...(p.adventure.estimatedPlaytime !== undefined ? { estimatedPlaytime: p.adventure.estimatedPlaytime } : {}),
        ...(p.adventure.tags !== undefined ? { tags: p.adventure.tags as Prisma.InputJsonValue } : {}),
      };

      let advId: string;
      if (mode === 'update' || mode === 'replace') {
        const upserted = await tx.bandRpgAdventure.upsert({
          where: { slug: p.adventure.slug },
          update: adventureMeta,
          create: { slug: p.adventure.slug, ...adventureMeta },
        });
        advId = upserted.id;
      } else {
        const created = await tx.bandRpgAdventure.create({
          data: { slug: p.adventure.slug, ...adventureMeta },
        });
        advId = created.id;
      }

      // Step 5: Create arcs
      const arcSlugToId = new Map<string, string>();
      for (const arc of p.arcs ?? []) {
        if (mode === 'update') {
          const upserted = await tx.bandRpgStoryArc.upsert({
            where: { adventureId_slug: { adventureId: advId, slug: arc.slug } },
            update: { title: arc.title, adventureId: advId },
            create: {
              slug: arc.slug, title: arc.title, adventureId: advId, order: arc.order ?? 0,
              ...(arc.description !== undefined ? { description: arc.description } : {}),
            },
          });
          arcSlugToId.set(arc.slug, upserted.id);
        } else {
          const created = await tx.bandRpgStoryArc.create({
            data: {
              slug: arc.slug, title: arc.title, adventureId: advId, order: arc.order ?? 0,
              ...(arc.description !== undefined ? { description: arc.description } : {}),
            },
          });
          arcSlugToId.set(arc.slug, created.id);
        }
      }

      // Step 6: Create items
      const itemSlugToId = new Map<string, string>();

      // Pre-load IDs for item slugs already in DB that conditions may reference
      const referencedItemSlugs = new Set<string>();
      for (const level of p.levels ?? []) {
        for (const door of level.doors ?? []) {
          const cond = door.lockCondition as Record<string, unknown> | undefined;
          if (typeof cond?.['targetSlug'] === 'string') referencedItemSlugs.add(cond['targetSlug']);
        }
      }
      if (referencedItemSlugs.size > 0) {
        const existing = await tx.bandRpgItem.findMany({
          where: { slug: { in: [...referencedItemSlugs] } }, select: { id: true, slug: true },
        });
        for (const i of existing) itemSlugToId.set(i.slug, i.id);
      }

      for (const item of p.items ?? []) {
        const itemType = (item.type as import('@prisma/client').BandRpgItemType | undefined) ?? 'collectible';
        if (mode === 'update') {
          const upserted = await tx.bandRpgItem.upsert({
            where: { adventureId_slug: { adventureId: advId, slug: item.slug } },
            update: { name: item.name, adventureId: advId },
            create: {
              slug: item.slug, name: item.name, adventureId: advId,
              type: itemType, rarity: item.rarity ?? 'common',
              scoreValue: item.scoreValue ?? 0, isVisible: item.isVisible ?? true,
              ...(item.description !== undefined ? { description: item.description } : {}),
              ...(item.iconUrl !== undefined ? { iconUrl: item.iconUrl } : {}),
              ...(item.spriteUrl !== undefined ? { spriteUrl: item.spriteUrl } : {}),
            },
          });
          itemSlugToId.set(item.slug, upserted.id);
        } else {
          const created = await tx.bandRpgItem.create({
            data: {
              slug: item.slug, name: item.name, adventureId: advId,
              type: itemType, rarity: item.rarity ?? 'common',
              scoreValue: item.scoreValue ?? 0, isVisible: item.isVisible ?? true,
              ...(item.description !== undefined ? { description: item.description } : {}),
              ...(item.iconUrl !== undefined ? { iconUrl: item.iconUrl } : {}),
              ...(item.spriteUrl !== undefined ? { spriteUrl: item.spriteUrl } : {}),
            },
          });
          itemSlugToId.set(item.slug, created.id);
        }
      }

      // Helper: resolve targetSlug → targetId in conditions/actions.
      // IMPORTANT: item conditions (item_owned, grant_item) keep targetSlug intact —
      // the runtime uses item slug as canonical id (not DB CUID).
      // Quest conditions resolve slug → CUID because runtime stores quest progress as CUIDs.
      function resolveRef(
        cond: Record<string, unknown>,
        levelSlugToId: Map<string, string>,
        questSlugToId: Map<string, string>,
      ): Record<string, unknown> {
        const out = { ...cond };
        if (typeof out['targetSlug'] === 'string') {
          const slug = out['targetSlug'];
          const t = out['type'];
          if (t === 'quest_complete' || t === 'quest_active') {
            const resolved = questSlugToId.get(slug);
            if (resolved) { out['targetId'] = resolved; delete out['targetSlug']; }
          }
          // item_owned, grant_item, reveal_exit, switch_activated, door_open, story_beat_seen:
          // leave targetSlug intact — runtime resolves via targetId ?? targetSlug
        }
        return out;
      }

      // Step 7: Create levels
      const levelSlugToId = new Map<string, string>();
      const questSlugToId = new Map<string, string>(); // populated in step 8

      const levelImportData: Array<{
        levelId: string; levelSlug: string;
        npcs: ImportNpc[]; objectives: ImportObjective[];
        beats: ImportBeat[]; doors: ImportDoor[];
        switches: ImportSwitch[]; puzzles: ImportPuzzle[];
      }> = [];

      for (const level of p.levels ?? []) {
        let levelId: string;
        if (mode === 'update') {
          const upserted = await tx.bandRpgLevel.upsert({
            where: { slug: level.slug },
            update: {
              name: level.name, adventureId: advId,
              spawnX: level.spawnX ?? 0, spawnY: level.spawnY ?? 0,
              mapData: (level.mapData ?? {}) as Prisma.InputJsonValue,
            },
            create: {
              slug: level.slug, name: level.name, adventureId: advId,
              spawnX: level.spawnX ?? 0, spawnY: level.spawnY ?? 0,
              mapData: (level.mapData ?? {}) as Prisma.InputJsonValue,
              order: level.order ?? 0, isPublished: level.isPublished ?? false,
              ...(level.description !== undefined ? { description: level.description } : {}),
              ...(level.background !== undefined ? { background: level.background } : {}),
            },
          });
          levelId = upserted.id;
        } else {
          const created = await tx.bandRpgLevel.create({
            data: {
              slug: level.slug, name: level.name, adventureId: advId,
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
          npcs: level.npcs ?? [], objectives: level.objectives ?? [],
          beats: level.beats ?? [], doors: level.doors ?? [],
          switches: level.switches ?? [], puzzles: level.puzzles ?? [],
        });
      }

      // Step 8: Create quests (giver IDs patched in step 9 after NPCs exist)
      for (const quest of p.quests ?? []) {
        if (mode === 'update') {
          const upserted = await tx.bandRpgQuest.upsert({
            where: { adventureId_slug: { adventureId: advId, slug: quest.slug } },
            update: { name: quest.name, adventureId: advId, reward: (quest.reward ?? {}) as Prisma.InputJsonValue },
            create: {
              slug: quest.slug, name: quest.name, adventureId: advId,
              reward: (quest.reward ?? {}) as Prisma.InputJsonValue,
              isOptional: quest.isOptional ?? false, order: quest.order ?? 0,
              ...(quest.description !== undefined ? { description: quest.description } : {}),
            },
          });
          questSlugToId.set(quest.slug, upserted.id);
        } else {
          const created = await tx.bandRpgQuest.create({
            data: {
              slug: quest.slug, name: quest.name, adventureId: advId,
              reward: (quest.reward ?? {}) as Prisma.InputJsonValue,
              isOptional: quest.isOptional ?? false, order: quest.order ?? 0,
              ...(quest.description !== undefined ? { description: quest.description } : {}),
            },
          });
          questSlugToId.set(quest.slug, created.id);
        }
      }

      // Step 9: Create level-scoped entities (objectives, NPCs, beats, doors, switches, puzzles)
      const npcNameToId = new Map<string, string>(); // "levelSlug:npcName" → id

      for (const lv of levelImportData) {
        // Objectives
        const objNameToId = new Map<string, string>();
        const objectivesToCreate = lv.objectives.map(o => ({
          levelId: lv.levelId, name: o.name,
          type: o.type as import('@prisma/client').BandRpgObjectiveType,
          condition: (o.condition ?? {}) as Prisma.InputJsonValue,
          reward: (o.reward ?? {}) as Prisma.InputJsonValue,
          isOptional: o.isOptional ?? false, order: o.order ?? 0,
          ...(o.description !== undefined ? { description: o.description } : {}),
          ...(o.target !== undefined ? { target: o.target } : {}),
          ...(o.dialogueText !== undefined ? { dialogueText: o.dialogueText } : {}),
        }));
        const createdObjs = await tx.bandRpgObjective.createManyAndReturn({ data: objectivesToCreate });
        for (let i = 0; i < createdObjs.length; i++) {
          objNameToId.set(lv.objectives[i]!.name, createdObjs[i]!.id);
        }
        for (const obj of lv.objectives) {
          if (obj.prerequisiteName) {
            const prereqId = objNameToId.get(obj.prerequisiteName);
            const objId = objNameToId.get(obj.name);
            if (prereqId && objId) {
              await tx.bandRpgObjective.update({ where: { id: objId }, data: { prerequisiteId: prereqId } });
            }
          }
        }

        // NPCs
        for (const npc of lv.npcs) {
          const visibilityCondition = npc.visibilityCondition
            ? resolveRef(npc.visibilityCondition, levelSlugToId, questSlugToId) as Prisma.InputJsonValue
            : undefined;
          const created = await tx.bandRpgNpc.create({
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
        for (const beat of lv.beats) {
          const arcId = beat.arcSlug ? arcSlugToId.get(beat.arcSlug) : undefined;
          await tx.bandRpgStoryBeat.create({
            data: {
              levelId: lv.levelId, type: beat.type as import('@prisma/client').BandRpgBeatType,
              content: (beat.content ?? {}) as Prisma.InputJsonValue,
              unlockCondition: (beat.unlockCondition ?? {}) as Prisma.InputJsonValue,
              order: beat.order ?? 0,
              ...(arcId ? { arcId } : {}),
            },
          });
        }

        // Doors (must come before switches so doorNameToId is populated for switch effects)
        const doorNameToId = new Map<string, string>();
        for (const door of lv.doors) {
          const lockCondition = resolveRef(
            door.lockCondition ?? {}, levelSlugToId, questSlugToId,
          ) as Prisma.InputJsonValue;
          const created = await tx.bandRpgDoor.create({
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
          const effect = (sw.effect ?? {}) as Record<string, unknown>;
          let resolvedEffect = resolveRef(effect, levelSlugToId, questSlugToId);
          if (resolvedEffect['targetId'] === undefined && typeof effect['targetName'] === 'string') {
            const targetId = doorNameToId.get(effect['targetName'] as string);
            if (targetId) { resolvedEffect = { ...resolvedEffect, targetId }; delete resolvedEffect['targetName']; }
          }
          const created = await tx.bandRpgSwitch.create({
            data: {
              levelId: lv.levelId, name: sw.name, tileX: sw.tileX, tileY: sw.tileY,
              type: (sw.type as import('@prisma/client').BandRpgSwitchType) ?? 'switch',
              effect: resolvedEffect as Prisma.InputJsonValue,
              ...(sw.label !== undefined ? { label: sw.label } : {}),
            },
          });
          switchNameToId.set(sw.name, created.id);
        }

        // Puzzles — resolve all cross-refs in trigger/condition/action
        const resolvePuzzleRef = (obj: Record<string, unknown>): Record<string, unknown> => {
          let out = resolveRef(obj, levelSlugToId, questSlugToId);
          if (typeof out['targetName'] === 'string') {
            const refName = out['targetName'] as string;
            const t = out['type'];
            let resolved: string | undefined;
            if (t === 'open_door' || t === 'close_door' || t === 'door_open') resolved = doorNameToId.get(refName);
            else if (t === 'switch_activated') resolved = switchNameToId.get(refName);
            if (resolved) { out = { ...out, targetId: resolved }; delete out['targetName']; }
          }
          return out;
        };

        for (const puzzle of lv.puzzles) {
          await tx.bandRpgPuzzle.create({
            data: {
              levelId: lv.levelId, name: puzzle.name, order: puzzle.order ?? 0,
              trigger: (puzzle.trigger ? resolvePuzzleRef({ ...puzzle.trigger }) : {}) as Prisma.InputJsonValue,
              condition: (puzzle.condition ? resolvePuzzleRef({ ...puzzle.condition }) : {}) as Prisma.InputJsonValue,
              action: (puzzle.action ? resolvePuzzleRef({ ...puzzle.action }) : {}) as Prisma.InputJsonValue,
            },
          });
        }

        // Patch quest giverIds now that NPCs for this level are created
        for (const quest of p.quests ?? []) {
          if (quest.giverNpcName && quest.giverNpcLevelSlug === lv.levelSlug) {
            const npcId = npcNameToId.get(`${lv.levelSlug}:${quest.giverNpcName}`);
            const questId = questSlugToId.get(quest.slug);
            if (npcId && questId) {
              await tx.bandRpgQuest.update({ where: { id: questId }, data: { giverId: npcId } });
            }
          }
        }
      }

      // Step 10: Create timeline events
      for (const t of p.timeline ?? []) {
        let refId: string | undefined;
        if (t.refSlug) {
          refId = levelSlugToId.get(t.refSlug)
            ?? questSlugToId.get(t.refSlug)
            ?? [...arcSlugToId.entries()].find(([k]) => k === t.refSlug)?.[1];
        }
        await tx.bandRpgTimelineEvent.create({
          data: {
            title: t.title, type: t.type, order: t.order ?? 0,
            isRequired: t.isRequired ?? true,
            ...(refId !== undefined ? { refId } : {}),
          },
        });
      }

      return advId;
    }, { timeout: 30_000 }); // 30s for large adventures

    res.json({ ok: true, adventureId, imported: validation.preview }); return;
  } catch (err) { next(err); return; }
});

// ── POST /cleanup-orphans — delete all adventure content not linked to any adventure ─────────────

adventureRouter.post('/cleanup-orphans', async (_req, res, next): Promise<void> => {
  try {
    // Find all orphaned levels (adventureId = null)
    const orphanLevels = await prisma.bandRpgLevel.findMany({
      where: { adventureId: null },
      select: { id: true },
    });
    const orphanLevelIds = orphanLevels.map(l => l.id);

    const deleted: Record<string, number> = {
      puzzles: 0, doors: 0, switches: 0, npcs: 0, objectives: 0,
      beats: 0, levels: 0, quests: 0, arcs: 0, items: 0,
    };

    if (orphanLevelIds.length > 0) {
      deleted['puzzles']    = (await prisma.bandRpgPuzzle.deleteMany({ where: { levelId: { in: orphanLevelIds } } })).count;
      deleted['doors']      = (await prisma.bandRpgDoor.deleteMany({ where: { levelId: { in: orphanLevelIds } } })).count;
      deleted['switches']   = (await prisma.bandRpgSwitch.deleteMany({ where: { levelId: { in: orphanLevelIds } } })).count;
      deleted['npcs']       = (await prisma.bandRpgNpc.deleteMany({ where: { levelId: { in: orphanLevelIds } } })).count;
      deleted['objectives'] = (await prisma.bandRpgObjective.deleteMany({ where: { levelId: { in: orphanLevelIds } } })).count;
      deleted['beats']      = (await prisma.bandRpgStoryBeat.deleteMany({ where: { levelId: { in: orphanLevelIds } } })).count;
      deleted['levels']     = (await prisma.bandRpgLevel.deleteMany({ where: { adventureId: null } })).count;
    }

    deleted['quests'] = (await prisma.bandRpgQuest.deleteMany({ where: { adventureId: null } })).count;
    deleted['arcs']   = (await prisma.bandRpgStoryArc.deleteMany({ where: { adventureId: null } })).count;
    deleted['items']  = (await prisma.bandRpgItem.deleteMany({ where: { adventureId: null } })).count;

    const total = Object.values(deleted).reduce((s, n) => s + n, 0);
    res.json({ ok: true, total, deleted }); return;
  } catch (err) { next(err); return; }
});

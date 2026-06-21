import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { BandRpgDoorType, BandRpgSwitchType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const worldEditorRouter = Router();

// ── Doors ─────────────────────────────────────────────────────────────────────

worldEditorRouter.get('/levels/:levelId/doors', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['levelId']!;
    const doors = await prisma.bandRpgDoor.findMany({
      where: { levelId },
      orderBy: [{ tileY: 'asc' }, { tileX: 'asc' }],
    });
    res.json(doors); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.post('/levels/:levelId/doors', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['levelId']!;
    const { name, tileX, tileY, type, lockCondition, openedByDefault, label } = req.body as {
      name: string; tileX: number; tileY: number; type?: BandRpgDoorType;
      lockCondition?: Record<string, unknown>; openedByDefault?: boolean; label?: string;
    };
    const createData: Prisma.BandRpgDoorUncheckedCreateInput = {
      levelId, name, tileX, tileY,
      ...(type !== undefined ? { type } : {}),
      ...(lockCondition !== undefined ? { lockCondition: lockCondition as Prisma.InputJsonValue } : {}),
      ...(openedByDefault !== undefined ? { openedByDefault } : {}),
      ...(label !== undefined ? { label } : {}),
    };
    const door = await prisma.bandRpgDoor.create({ data: createData });
    res.json(door); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.put('/levels/:levelId/doors/:doorId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const doorId = req.params['doorId']!;
    const { name, tileX, tileY, type, lockCondition, openedByDefault, label } = req.body as {
      name?: string; tileX?: number; tileY?: number; type?: BandRpgDoorType;
      lockCondition?: Record<string, unknown>; openedByDefault?: boolean; label?: string;
    };
    const updateData: Prisma.BandRpgDoorUncheckedUpdateInput = {
      ...(name !== undefined ? { name } : {}),
      ...(tileX !== undefined ? { tileX } : {}),
      ...(tileY !== undefined ? { tileY } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(lockCondition !== undefined ? { lockCondition: lockCondition as Prisma.InputJsonValue } : {}),
      ...(openedByDefault !== undefined ? { openedByDefault } : {}),
      ...(label !== undefined ? { label } : {}),
    };
    const door = await prisma.bandRpgDoor.update({ where: { id: doorId }, data: updateData });
    res.json(door); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.delete('/levels/:levelId/doors/:doorId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    await prisma.bandRpgDoor.delete({ where: { id: req.params['doorId']! } });
    res.json({ ok: true }); return;
  } catch (err) { next(err); return; }
});

// ── Switches ──────────────────────────────────────────────────────────────────

worldEditorRouter.get('/levels/:levelId/switches', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['levelId']!;
    const switches = await prisma.bandRpgSwitch.findMany({
      where: { levelId },
      orderBy: [{ tileY: 'asc' }, { tileX: 'asc' }],
    });
    res.json(switches); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.post('/levels/:levelId/switches', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['levelId']!;
    const { name, tileX, tileY, type, effect, label } = req.body as {
      name: string; tileX: number; tileY: number; type?: BandRpgSwitchType;
      effect?: Record<string, unknown>; label?: string;
    };
    const createData: Prisma.BandRpgSwitchUncheckedCreateInput = {
      levelId, name, tileX, tileY,
      ...(type !== undefined ? { type } : {}),
      ...(effect !== undefined ? { effect: effect as Prisma.InputJsonValue } : {}),
      ...(label !== undefined ? { label } : {}),
    };
    const sw = await prisma.bandRpgSwitch.create({ data: createData });
    res.json(sw); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.put('/levels/:levelId/switches/:switchId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const switchId = req.params['switchId']!;
    const { name, tileX, tileY, type, effect, label } = req.body as {
      name?: string; tileX?: number; tileY?: number; type?: BandRpgSwitchType;
      effect?: Record<string, unknown>; label?: string;
    };
    const updateData: Prisma.BandRpgSwitchUncheckedUpdateInput = {
      ...(name !== undefined ? { name } : {}),
      ...(tileX !== undefined ? { tileX } : {}),
      ...(tileY !== undefined ? { tileY } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(effect !== undefined ? { effect: effect as Prisma.InputJsonValue } : {}),
      ...(label !== undefined ? { label } : {}),
    };
    const sw = await prisma.bandRpgSwitch.update({ where: { id: switchId }, data: updateData });
    res.json(sw); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.delete('/levels/:levelId/switches/:switchId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    await prisma.bandRpgSwitch.delete({ where: { id: req.params['switchId']! } });
    res.json({ ok: true }); return;
  } catch (err) { next(err); return; }
});

// ── Puzzles ───────────────────────────────────────────────────────────────────

worldEditorRouter.get('/levels/:levelId/puzzles', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['levelId']!;
    const puzzles = await prisma.bandRpgPuzzle.findMany({
      where: { levelId },
      orderBy: { order: 'asc' },
    });
    res.json(puzzles); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.post('/levels/:levelId/puzzles', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const levelId = req.params['levelId']!;
    const { name, trigger, condition, action, order } = req.body as {
      name: string; trigger: Record<string, unknown>;
      condition?: Record<string, unknown>; action: Record<string, unknown>; order?: number;
    };
    const createData: Prisma.BandRpgPuzzleUncheckedCreateInput = {
      levelId, name,
      trigger: trigger as Prisma.InputJsonValue,
      action: action as Prisma.InputJsonValue,
      ...(condition !== undefined ? { condition: condition as Prisma.InputJsonValue } : {}),
      ...(order !== undefined ? { order } : {}),
    };
    const puzzle = await prisma.bandRpgPuzzle.create({ data: createData });
    res.json(puzzle); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.put('/levels/:levelId/puzzles/:puzzleId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const puzzleId = req.params['puzzleId']!;
    const { name, trigger, condition, action, order } = req.body as {
      name?: string; trigger?: Record<string, unknown>;
      condition?: Record<string, unknown>; action?: Record<string, unknown>; order?: number;
    };
    const updateData: Prisma.BandRpgPuzzleUncheckedUpdateInput = {
      ...(name !== undefined ? { name } : {}),
      ...(trigger !== undefined ? { trigger: trigger as Prisma.InputJsonValue } : {}),
      ...(condition !== undefined ? { condition: condition as Prisma.InputJsonValue } : {}),
      ...(action !== undefined ? { action: action as Prisma.InputJsonValue } : {}),
      ...(order !== undefined ? { order } : {}),
    };
    const puzzle = await prisma.bandRpgPuzzle.update({ where: { id: puzzleId }, data: updateData });
    res.json(puzzle); return;
  } catch (err) { next(err); return; }
});

worldEditorRouter.delete('/levels/:levelId/puzzles/:puzzleId', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    await prisma.bandRpgPuzzle.delete({ where: { id: req.params['puzzleId']! } });
    res.json({ ok: true }); return;
  } catch (err) { next(err); return; }
});

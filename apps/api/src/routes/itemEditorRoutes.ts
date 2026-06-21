import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { BandRpgItemType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const itemEditorRouter = Router();

itemEditorRouter.get('/', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const typeFilter = req.query['type'] as string | undefined;
    const items = await prisma.bandRpgItem.findMany({
      ...(typeFilter ? { where: { type: typeFilter as BandRpgItemType } } : {}),
      orderBy: { name: 'asc' },
    });
    res.json(items); return;
  } catch (err) { next(err); return; }
});

itemEditorRouter.post('/', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const {
      slug, name, type, description, iconUrl, spriteUrl,
      rarity, scoreValue, bandId, albumId, songId, isVisible,
    } = req.body as {
      slug: string; name: string; type: string; description?: string;
      iconUrl?: string; spriteUrl?: string; rarity?: string; scoreValue?: number;
      bandId?: string; albumId?: string; songId?: string; isVisible?: boolean;
    };
    const item = await prisma.bandRpgItem.create({
      data: {
        slug, name,
        type: type as BandRpgItemType,
        ...(description !== undefined ? { description } : {}),
        ...(iconUrl !== undefined ? { iconUrl } : {}),
        ...(spriteUrl !== undefined ? { spriteUrl } : {}),
        ...(rarity !== undefined ? { rarity } : {}),
        ...(scoreValue !== undefined ? { scoreValue } : {}),
        ...(bandId !== undefined ? { bandId } : {}),
        ...(albumId !== undefined ? { albumId } : {}),
        ...(songId !== undefined ? { songId } : {}),
        ...(isVisible !== undefined ? { isVisible } : {}),
      },
    });
    res.status(201).json(item); return;
  } catch (err) { next(err); return; }
});

itemEditorRouter.get('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const item = await prisma.bandRpgItem.findUnique({ where: { id } });
    if (!item) { res.status(404).json({ error: 'Item not found' }); return; }
    res.json(item); return;
  } catch (err) { next(err); return; }
});

itemEditorRouter.put('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    const {
      slug, name, type, description, iconUrl, spriteUrl,
      rarity, scoreValue, bandId, albumId, songId, isVisible,
    } = req.body as {
      slug?: string; name?: string; type?: string; description?: string;
      iconUrl?: string | null; spriteUrl?: string | null; rarity?: string;
      scoreValue?: number; bandId?: string | null; albumId?: string | null;
      songId?: string | null; isVisible?: boolean;
    };
    const data: Prisma.BandRpgItemUpdateInput = {};
    if (slug !== undefined) data.slug = slug;
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type as BandRpgItemType;
    if (description !== undefined) data.description = description;
    if (iconUrl !== undefined) data.iconUrl = iconUrl;
    if (spriteUrl !== undefined) data.spriteUrl = spriteUrl;
    if (rarity !== undefined) data.rarity = rarity;
    if (scoreValue !== undefined) data.scoreValue = scoreValue;
    if (bandId !== undefined) data.bandId = bandId;
    if (albumId !== undefined) data.albumId = albumId;
    if (songId !== undefined) data.songId = songId;
    if (isVisible !== undefined) data.isVisible = isVisible;
    const item = await prisma.bandRpgItem.update({ where: { id }, data });
    res.json(item); return;
  } catch (err) { next(err); return; }
});

itemEditorRouter.delete('/:id', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = req.params['id']!;
    await prisma.bandRpgItem.delete({ where: { id } });
    res.status(204).end(); return;
  } catch (err) { next(err); return; }
});

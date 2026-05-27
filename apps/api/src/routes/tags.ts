import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const tagsRouter = Router();

tagsRouter.get('/:slug/songs', async (req, res, next) => {
  try {
    const tag = await prisma.tag.findUnique({ where: { slug: req.params['slug']! } });
    if (!tag) { res.status(404).json({ error: 'Tag not found' }); return; }

    const songTags = await prisma.songTag.findMany({
      where: { tagId: tag.id },
      include: {
        song: {
          include: {
            band: { select: { id: true, name: true, slug: true } },
            album: { select: { id: true, title: true, slug: true } },
          },
        },
      },
      orderBy: { song: { title: 'asc' } },
    });

    res.json({ tag, songs: songTags.map((st) => st.song) });
  } catch (e) { next(e); }
});

// PATCH /api/tags/:songId/:tagId/description — admin updates per-song tag description
tagsRouter.patch('/:songId/:tagId/description', requireAdmin, async (req, res, next) => {
  try {
    const { songId, tagId } = req.params as { songId: string; tagId: string };
    const { description } = req.body as { description?: string };
    const songTag = await prisma.songTag.findUnique({
      where: { songId_tagId: { songId, tagId } },
    });
    if (!songTag) { res.status(404).json({ error: 'Tag link not found' }); return; }
    const updated = await prisma.songTag.update({
      where: { songId_tagId: { songId, tagId } },
      data: { description: description ?? null },
    });
    res.json(updated);
  } catch (e) { next(e); }
});

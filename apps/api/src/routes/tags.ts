import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

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

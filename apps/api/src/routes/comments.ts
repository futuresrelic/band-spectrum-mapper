import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

// Mounted at /api/songs/:songId/comments with mergeParams so :songId is visible
export const commentsRouter = Router({ mergeParams: true });

// GET — public, no auth
commentsRouter.get('/', async (req, res, next) => {
  try {
    const { songId } = req.params as { songId: string };
    const comments = await prisma.songComment.findMany({
      where: { songId },
      include: { user: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (e) {
    next(e);
  }
});

// POST — any authenticated user
commentsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { songId } = req.params as { songId: string };
    const { text } = req.body as { text?: string };

    if (!text?.trim()) {
      res.status(400).json({ error: 'Comment text is required' });
      return;
    }
    if (text.trim().length > 2000) {
      res.status(400).json({ error: 'Comment must be 2000 characters or fewer' });
      return;
    }

    const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
    if (!song) throw new HttpError(404, 'Song not found');

    const comment = await prisma.songComment.create({
      data: { songId, userId: req.user!.userId, text: text.trim() },
      include: { user: { select: { name: true, avatarUrl: true } } },
    });

    // Invalidate cached context so next view regenerates with the new comment woven in
    await prisma.songContextAnalysis.deleteMany({ where: { songId } });

    res.status(201).json(comment);
  } catch (e) {
    next(e);
  }
});

// DELETE — own comment or admin
commentsRouter.delete('/:commentId', requireAuth, async (req, res, next) => {
  try {
    const { commentId } = req.params as { commentId: string };
    const comment = await prisma.songComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new HttpError(404, 'Comment not found');

    if (comment.userId !== req.user!.userId && !req.user!.isAdmin) {
      throw new HttpError(403, 'Not authorised to delete this comment');
    }

    await prisma.songComment.delete({ where: { id: commentId } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

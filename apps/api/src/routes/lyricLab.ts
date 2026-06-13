import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { buildLyricLab } from '../services/lyricLabService.js';
import type { LyricLabScope } from '@band-spectrum-mapper/shared';

export const lyricLabRouter = Router();

lyricLabRouter.use(requireAuth);
lyricLabRouter.use(requireAdmin);

const VALID_SCOPES: LyricLabScope[] = ['discography', 'album', 'song'];

// GET /api/lyric-lab/batch?scope=discography|album|song&bandId=&albumId=&songId=&maxWords=80
lyricLabRouter.get('/batch', async (req, res, next): Promise<void> => {
  try {
    const scope = (req.query['scope'] as string) ?? 'discography';
    const bandId = (req.query['bandId'] as string) || undefined;
    const albumId = (req.query['albumId'] as string) || undefined;
    const songId = (req.query['songId'] as string) || undefined;
    const maxWordsRaw = parseInt((req.query['maxWords'] as string) ?? '80', 10);
    const maxWords = isNaN(maxWordsRaw) ? 80 : Math.min(150, Math.max(10, maxWordsRaw));

    if (!VALID_SCOPES.includes(scope as LyricLabScope)) {
      res.status(400).json({ error: `scope must be one of: ${VALID_SCOPES.join(', ')}` });
      return;
    }

    if (scope === 'song' && !songId) {
      res.status(400).json({ error: 'songId is required for song scope' });
      return;
    }

    if (scope === 'album' && !albumId) {
      res.status(400).json({ error: 'albumId is required for album scope' });
      return;
    }

    if (scope === 'discography' && !bandId) {
      res.status(400).json({ error: 'bandId is required for discography scope' });
      return;
    }

    const result = await buildLyricLab({
      scope: scope as LyricLabScope,
      ...(bandId ? { bandId } : {}),
      ...(albumId ? { albumId } : {}),
      ...(songId ? { songId } : {}),
      maxWords,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const spectrumStudioRouter = Router();
spectrumStudioRouter.use(requireAuth, requireAdmin);

// GET /api/spectrum-studio?bandIds=id1,id2
// Returns scored songs for the requested bands.
spectrumStudioRouter.get('/', async (req, res, next): Promise<void> => {
  try {
    const raw = req.query['bandIds'] as string | undefined;
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];

    const songs = await prisma.song.findMany({
      where: bandIds.length ? { bandId: { in: bandIds } } : {},
      include: {
        band:  { select: { id: true, name: true } },
        album: { select: { title: true } },
        score: true,
      },
      orderBy: [{ band: { name: 'asc' } }, { title: 'asc' }],
      take: 600,
    });

    res.json(
      songs.map((s) => ({
        id:         s.id,
        title:      s.title,
        bandId:     s.band.id,
        bandName:   s.band.name,
        albumTitle: s.album?.title ?? null,
        scores: s.score
          ? {
              aggression:  s.score.aggression,
              complexity:  s.score.complexity,
              atmosphere:  s.score.atmosphere,
              emotion:     s.score.emotion,
              psychedelic: s.score.psychedelic,
              concept:     s.score.concept,
            }
          : null,
      })),
    );
  } catch (e) {
    next(e);
  }
});

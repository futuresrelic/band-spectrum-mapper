import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const timelineRouter = Router();

// GET /api/timeline/round?bandIds=id1,id2&count=5
// Returns `count` random albums (with known release dates) in shuffled order.
// The client must sort them chronologically to score.
timelineRouter.get('/round', async (req, res, next): Promise<void> => {
  try {
    const raw = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];
    const count = Math.min(8, Math.max(3,
      parseInt(typeof req.query['count'] === 'string' ? req.query['count'] : '5', 10) || 5,
    ));

    if (bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' }); return;
    }

    const albums = await prisma.album.findMany({
      where: {
        bandId: { in: bandIds },
        year:   { not: null },
      },
      select: {
        id: true, title: true, year: true, artworkUrl: true,
        band: { select: { name: true } },
      },
    });

    if (albums.length < count) {
      res.status(400).json({ error: 'Not enough albums with release years for these bands' }); return;
    }

    const shuffled = [...albums].sort(() => Math.random() - 0.5);
    const picked   = shuffled.slice(0, count);

    // Return in a freshly shuffled order — client must not know correct order
    res.json({
      items: picked
        .map((a) => ({
          id:         a.id,
          title:      a.title,
          bandName:   a.band.name,
          artworkUrl: a.artworkUrl,
          year:       a.year!,
        }))
        .sort(() => Math.random() - 0.5),
    });
  } catch (e) { next(e); }
});

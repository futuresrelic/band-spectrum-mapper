import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const spectrumStudioRouter = Router();
spectrumStudioRouter.use(requireAuth, requireAdmin);

// GET /api/spectrum-studio?bandIds=id1,id2
// Returns songs with all numeric dimensions in a flat `fields` map.
// Spectrum scores 0-10, theme scores scaled from 0-1 to 0-10, metadata raw.
spectrumStudioRouter.get('/', async (req, res, next): Promise<void> => {
  try {
    const raw     = req.query['bandIds'] as string | undefined;
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];

    const songs = await prisma.song.findMany({
      where: bandIds.length ? { bandId: { in: bandIds } } : {},
      include: {
        band:            { select: { id: true, name: true } },
        album:           { select: { title: true, year: true } },
        score:           true,
        aiGenreSpectrum: true,
        themeScores:     true,
      },
      orderBy: [{ band: { name: 'asc' } }, { title: 'asc' }],
      take: 600,
    });

    res.json(
      songs.map((s) => {
        const fields: Record<string, number | null> = {};

        // Spectrum scores (0–10)
        if (s.score) {
          fields['aggression']  = s.score.aggression;
          fields['complexity']  = s.score.complexity;
          fields['atmosphere']  = s.score.atmosphere;
          fields['emotion']     = s.score.emotion;
          fields['psychedelic'] = s.score.psychedelic;
          fields['concept']     = s.score.concept;
        }

        // AI genre accessibility (0–10)
        if (s.aiGenreSpectrum) {
          fields['genre_metal']      = s.aiGenreSpectrum.metal;
          fields['genre_rock']       = s.aiGenreSpectrum.rock;
          fields['genre_pop']        = s.aiGenreSpectrum.pop;
          fields['genre_hiphop']     = s.aiGenreSpectrum.hiphop;
          fields['genre_electronic'] = s.aiGenreSpectrum.electronic;
          fields['genre_folk']       = s.aiGenreSpectrum.folk;
        }

        // Theme scores — stored 0–1, scaled to 0–10 for uniform chart axis
        for (const ts of s.themeScores) {
          const key = `theme_${ts.themeSlug.replace(/-/g, '_')}`;
          fields[key] = ts.score * 10;
        }

        // Song metadata (raw; frontend normalises against declared min/max)
        fields['durationSeconds'] = s.durationSeconds;
        fields['trackNumber']     = s.trackNumber;
        fields['releaseYear']     = s.album?.year ?? null;

        return {
          id:         s.id,
          title:      s.title,
          bandId:     s.band.id,
          bandName:   s.band.name,
          albumTitle: s.album?.title ?? null,
          hasScore:   !!s.score,
          fields,
        };
      }),
    );
  } catch (e) {
    next(e);
  }
});

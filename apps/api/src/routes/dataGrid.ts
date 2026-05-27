import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const dataGridRouter = Router();

const AXES = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
type Axis = (typeof AXES)[number];
type AxisMap = Record<Axis, number>;

const SCORE_SELECT = { aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true } as const;

async function querySongs(bandIds: string[]) {
  if (bandIds.length > 0) {
    return prisma.song.findMany({
      where: { bandId: { in: bandIds } },
      select: {
        id: true, title: true, trackNumber: true, durationSeconds: true, isInstrumental: true, bandId: true,
        band:            { select: { id: true, name: true } },
        album:           { select: { id: true, title: true } },
        score:           { select: SCORE_SELECT },
        aiSpectrum:      { select: SCORE_SELECT },
        aiGenreSpectrum: { select: { metal: true, rock: true, pop: true, hiphop: true, electronic: true, folk: true } },
        songTags:        { select: { tag: { select: { name: true } } } },
        lyrics:          { where: { isPrimary: true }, select: { id: true }, take: 1 },
        research:        { select: { id: true } },
        aiAnalysis:      { select: { id: true } },
        contextAnalysis: { select: { id: true } },
      },
      orderBy: [
        { band: { name: 'asc' } },
        { album: { title: 'asc' } },
        { trackNumber: 'asc' },
        { title: 'asc' },
      ],
    });
  }
  return prisma.song.findMany({
    select: {
      id: true, title: true, trackNumber: true, durationSeconds: true, isInstrumental: true, bandId: true,
      band:            { select: { id: true, name: true } },
      album:           { select: { id: true, title: true } },
      score:           { select: SCORE_SELECT },
      aiSpectrum:      { select: SCORE_SELECT },
      aiGenreSpectrum: { select: { metal: true, rock: true, pop: true, hiphop: true, electronic: true, folk: true } },
      songTags:        { select: { tag: { select: { name: true } } } },
      lyrics:          { where: { isPrimary: true }, select: { id: true }, take: 1 },
      research:        { select: { id: true } },
      aiAnalysis:      { select: { id: true } },
      contextAnalysis: { select: { id: true } },
    },
    orderBy: [
      { band: { name: 'asc' } },
      { album: { title: 'asc' } },
      { trackNumber: 'asc' },
      { title: 'asc' },
    ],
  });
}

// GET /api/admin/data-grid — full song matrix with all scored data for admin review
dataGridRouter.get('/', requireAuth, async (req, res, next): Promise<void> => {
  try {
    if (!req.user?.isAdmin) throw new HttpError(403, 'Admin only');

    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').filter(Boolean) : [];

    const songs = await querySongs(bandIds);

    if (!songs.length) { res.json([]); return; }

    const songIds = songs.map((s) => s.id);

    // Community spectrum averages (efficient aggregation)
    const communityRows = await prisma.userSongRating.groupBy({
      by: ['songId'],
      where: { songId: { in: songIds } },
      _avg: { aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true },
      _count: { id: true },
    });
    const communityMap = new Map(communityRows.map((r) => [r.songId, r]));

    // Comment counts
    const commentRows = await prisma.songComment.groupBy({
      by: ['songId'],
      where: { songId: { in: songIds } },
      _count: { id: true },
    });
    const commentMap = new Map(commentRows.map((r) => [r.songId, r._count.id]));

    const result = songs.map((s) => {
      const comm = communityMap.get(s.id);

      const communityScore: AxisMap | null = comm
        ? ({
            aggression: Math.round((comm._avg.aggression ?? 0) * 10) / 10,
            complexity:  Math.round((comm._avg.complexity  ?? 0) * 10) / 10,
            atmosphere:  Math.round((comm._avg.atmosphere  ?? 0) * 10) / 10,
            emotion:     Math.round((comm._avg.emotion     ?? 0) * 10) / 10,
            psychedelic: Math.round((comm._avg.psychedelic ?? 0) * 10) / 10,
            concept:     Math.round((comm._avg.concept     ?? 0) * 10) / 10,
          } satisfies AxisMap)
        : null;

      return {
        id: s.id,
        title: s.title,
        bandId: s.band.id,
        bandName: s.band.name,
        albumTitle: s.album?.title ?? null,
        trackNumber: s.trackNumber,
        durationSeconds: s.durationSeconds,
        isInstrumental: s.isInstrumental,

        hasLyrics: s.lyrics.length > 0,
        hasResearch: !!s.research,
        hasAiAnalysis: !!s.aiAnalysis,
        hasContext: !!s.contextAnalysis,
        tagCount: s.songTags.length,
        commentCount: commentMap.get(s.id) ?? 0,

        coreScore: s.score
          ? ({
              aggression: s.score.aggression, complexity: s.score.complexity,
              atmosphere: s.score.atmosphere, emotion: s.score.emotion,
              psychedelic: s.score.psychedelic, concept: s.score.concept,
            } satisfies AxisMap)
          : null,
        aiScore: s.aiSpectrum
          ? ({
              aggression: s.aiSpectrum.aggression, complexity: s.aiSpectrum.complexity,
              atmosphere: s.aiSpectrum.atmosphere, emotion: s.aiSpectrum.emotion,
              psychedelic: s.aiSpectrum.psychedelic, concept: s.aiSpectrum.concept,
            } satisfies AxisMap)
          : null,
        communityScore,
        communityCount: comm?._count.id ?? 0,

        aiGenre: s.aiGenreSpectrum
          ? {
              metal: s.aiGenreSpectrum.metal, rock: s.aiGenreSpectrum.rock,
              pop: s.aiGenreSpectrum.pop, hiphop: s.aiGenreSpectrum.hiphop,
              electronic: s.aiGenreSpectrum.electronic, folk: s.aiGenreSpectrum.folk,
            }
          : null,

        tags: s.songTags.map((st) => st.tag.name).sort(),
      };
    });

    res.json(result); return;
  } catch (e) { next(e); }
});

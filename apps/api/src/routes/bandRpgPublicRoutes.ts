import { Router } from 'express';
import { prisma }  from '../lib/prisma.js';
import { buildCuratorProfile } from '../services/curatorService.js';
import { STOP_INCLUDE, analyseStops } from './tourRoutes.js';
import type { StopWithData } from './tourRoutes.js';

export const bandRpgPublicRouter = Router();

// ── GET /curator/:userId ───────────────────────────────────────────────────────
// Public curator profile — returns curated subset; respects visibility.

bandRpgPublicRouter.get('/curator/:userId', async (req, res, next): Promise<void> => {
  try {
    const { userId } = req.params;
    if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }

    const row = await prisma.bandRpgCuratorProfile.findUnique({
      where:  { userId },
      select: { visibility: true },
    });

    if (!row) { res.status(404).json({ error: 'Curator not found' }); return; }
    if (row.visibility === 'private') {
      res.status(403).json({ error: 'This curator profile is private' }); return;
    }

    const [full, favoriteCount, followerCount, festivalFavCount, tourFavCount, popularFestRaw, popularTourRaw] = await Promise.all([
      buildCuratorProfile(userId),
      prisma.bandRpgFavorite.count({ where: { entityType: 'curator', entityId: userId, kind: 'favorite' } }),
      prisma.bandRpgCuratorFollow.count({ where: { followeeId: userId } }),
      prisma.bandRpgFavorite.count({ where: { userId, entityType: 'festival' } }),
      prisma.bandRpgFavorite.count({ where: { userId, entityType: 'tour' } }),
      // Most popular festival (most favorites)
      prisma.bandRpgFavorite.groupBy({
        by: ['entityId'],
        where: { entityType: 'festival' },
        _count: { _all: true },
        orderBy: { _count: { entityId: 'desc' } },
        take: 1,
      }),
      // Most popular tour (most favorites)
      prisma.bandRpgFavorite.groupBy({
        by: ['entityId'],
        where: { entityType: 'tour' },
        _count: { _all: true },
        orderBy: { _count: { entityId: 'desc' } },
        take: 1,
      }),
    ]);

    // Compute distinctions
    const distinctions: string[] = [];
    if (favoriteCount >= 3)  distinctions.push('Community Favorite');
    if (followerCount >= 5)  distinctions.push('Most Followed');
    if (followerCount >= 20 && full.level >= 25) distinctions.push('Archive Legend');
    if (festivalFavCount >= 5) distinctions.push('Festival Collector');
    if (tourFavCount >= 5)   distinctions.push('Tour Explorer');

    // Showcase: mostPopularFestival
    let mostPopularFestival: { id: string; name: string } | null = null;
    const topFestId = popularFestRaw[0]?.entityId;
    if (topFestId) {
      const f = await prisma.bandRpgFestival.findUnique({ where: { id: topFestId }, select: { id: true, name: true } });
      if (f) mostPopularFestival = { id: f.id, name: f.name };
    }

    let mostPopularTour: { id: string; name: string } | null = null;
    const topTourId = popularTourRaw[0]?.entityId;
    if (topTourId) {
      const t = await prisma.bandRpgTour.findUnique({ where: { id: topTourId }, select: { id: true, name: true } });
      if (t) mostPopularTour = { id: t.id, name: t.name };
    }

    res.json({
      userId,
      level:              full.level,
      xpProgressPct:      full.xpProgressPct,
      levelTitle:         full.levelTitle,
      currentTitle:       full.currentTitle,
      selectedCharacterName: full.selectedCharacterName,
      stats:              full.stats,
      badges:             full.badges.filter((b) => b.unlocked),
      badgeCount:         full.badges.filter((b) => b.unlocked).length,
      recentActivity:     full.recentActivity,
      firstRecoveryDate:  full.firstRecoveryDate,
      visibility:         row.visibility,
      favoriteCount,
      followerCount,
      distinctions,
      mostPopularFestival,
      mostPopularTour,
    }); return;
  } catch (err) { next(err); }
});

// ── Helpers for festival public endpoint ──────────────────────────────────────

const RARITY_VALS: Record<string, number> = {
  Common: 1, Uncommon: 2, Rare: 4, Legendary: 8, Mythic: 15,
};

function publicFestivalPersonality(avgFanService: number, avgDeepCut: number, concertCount: number): string {
  if (concertCount === 0) return 'Archive Gathering';
  if (avgDeepCut >= 65)   return 'Deep Cut Convention';
  if (avgFanService >= 70) return 'Legendary Archive Festival';
  if (avgDeepCut >= 45 && avgFanService < 55) return 'Discovery Festival';
  if (avgFanService >= 55 && avgDeepCut < 35) return 'Spectrum Showcase';
  return 'Spectrum Showcase';
}

const FESTIVAL_STORIES: Record<string, (b: number, s: number, c: number) => string> = {
  'Heavy Music Celebration':    (b, s, c) => `A festival built for impact — ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, and ${s} songs that hit hard from first note to last.`,
  'Atmospheric Summit':         (b, s, c) => `${c} performance${c !== 1 ? 's' : ''} across ${b} band${b !== 1 ? 's' : ''}, united by atmosphere and immersion. ${s} songs that breathe, build, and dissolve.`,
  'Emotional Journey Festival': (b, s, c) => `${b} band${b !== 1 ? 's' : ''}, ${c} concert${c !== 1 ? 's' : ''}, ${s} songs — and every one of them means something.`,
  'Progressive Gathering':      (b, s, c) => `A gathering for those who listen carefully. ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, and ${s} songs built on complexity and patience.`,
  'Psychedelic Communion':      (b, s, c) => `${c} ritual${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, ${s} songs. This festival does not ask for passive listening — it asks for surrender.`,
  'Conceptual Assembly':        (b, s, c) => `${b} band${b !== 1 ? 's' : ''} with something to say — assembled across ${c} concert${c !== 1 ? 's' : ''} and ${s} songs.`,
  'Spectrum Showcase':          (b, s, c) => `A festival of range: ${b} band${b !== 1 ? 's' : ''}, ${c} concert${c !== 1 ? 's' : ''}, ${s} songs, and no singular direction.`,
  'Discovery Festival':         (b, s, c) => `The journey is the point. ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, and ${s} songs arranged for exploration.`,
  'Deep Cut Convention':        (b, s, c) => `This festival rewards the patient fan. ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, and ${s} songs — leaning heavily on rare material that casual audiences have never encountered.`,
  'Legendary Archive Festival': (b, s, c) => `A celebration for the devoted. ${c} concert${c !== 1 ? 's' : ''}, ${b} band${b !== 1 ? 's' : ''}, ${s} songs — curated to deliver the songs fans know and love, elevated to something extraordinary.`,
  'Archive Gathering':          (b, s, c) => `${c} concert${c !== 1 ? 's' : ''} assembled from ${b} band${b !== 1 ? 's' : ''} across ${s} songs. A festival taking shape — its identity still revealing itself.`,
};

function festivalStory(personality: string, bandCount: number, songCount: number, concertCount: number): string {
  const fn = FESTIVAL_STORIES[personality] ?? FESTIVAL_STORIES['Archive Gathering']!;
  return fn(bandCount, songCount, concertCount);
}

// ── GET /festival/:id ─────────────────────────────────────────────────────────
// Public festival page — personality + story + counts; respects visibility.

bandRpgPublicRouter.get('/festival/:id', async (req, res, next): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) { res.status(400).json({ error: 'id is required' }); return; }

    const festival = await prisma.bandRpgFestival.findUnique({
      where: { id },
      include: {
        concerts: {
          orderBy: { position: 'asc' },
          include: {
            concert: {
              include: {
                setlist: {
                  include: {
                    songs: {
                      select: { rarity: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!festival) { res.status(404).json({ error: 'Festival not found' }); return; }
    if (festival.visibility === 'private') {
      res.status(403).json({ error: 'This festival is private' }); return;
    }

    const [favoriteCount, savedCount] = await Promise.all([
      prisma.bandRpgFavorite.count({ where: { entityType: 'festival', entityId: id, kind: 'favorite' } }),
      prisma.bandRpgFavorite.count({ where: { entityType: 'festival', entityId: id, kind: 'saved' } }),
    ]);

    const distinctions: string[] = [];
    if (favoriteCount >= 3) distinctions.push('Community Favorite');
    if (savedCount >= 3)    distinctions.push('Most Saved');

    const bandNames = [...new Map(
      festival.concerts.map((fc) => [fc.concert.bandId, fc.concert.bandName]),
    ).values()];

    const concertCount = festival.concerts.length;
    const bandCount    = bandNames.length;

    let totalSongs   = 0;
    let rareSongs    = 0;
    let fanSvcTotal  = 0;
    let deepCutTotal = 0;

    for (const fc of festival.concerts) {
      const songs = fc.concert.setlist?.songs ?? [];
      totalSongs += songs.length;
      const rare = songs.filter((s) => (RARITY_VALS[s.rarity] ?? 1) >= 4).length;
      rareSongs += rare;
      if (songs.length > 0) {
        const fanSvc  = songs.filter((s) => s.rarity === 'Common' || s.rarity === 'Uncommon').length;
        const deepCut = songs.filter((s) => (RARITY_VALS[s.rarity] ?? 1) >= 4).length;
        fanSvcTotal  += Math.round((fanSvc  / songs.length) * 100);
        deepCutTotal += Math.round((deepCut / songs.length) * 100);
      }
    }

    const avgFanService = concertCount > 0 ? Math.round(fanSvcTotal  / concertCount) : 0;
    const avgDeepCut    = concertCount > 0 ? Math.round(deepCutTotal / concertCount) : 0;
    const personality   = publicFestivalPersonality(avgFanService, avgDeepCut, concertCount);
    const story         = festivalStory(personality, bandCount, totalSongs, concertCount);

    res.json({
      id:           festival.id,
      name:         festival.name,
      description:  festival.description ?? null,
      isDream:      festival.isDream,
      visibility:   festival.visibility,
      concertCount,
      bandCount,
      totalSongs,
      rareSongs,
      avgFanService,
      avgDeepCut,
      personality,
      story,
      bands:        bandNames,
      createdAt:    festival.createdAt.toISOString(),
      favoriteCount,
      savedCount,
      distinctions,
    }); return;
  } catch (err) { next(err); }
});

// ── GET /tour/:id ─────────────────────────────────────────────────────────────
// Public tour page — full analysis (momentum, variety, personality, story); respects visibility.

bandRpgPublicRouter.get('/tour/:id', async (req, res, next): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) { res.status(400).json({ error: 'id is required' }); return; }

    const tour = await prisma.bandRpgTour.findUnique({
      where: { id },
      include: {
        stops: {
          orderBy: { position: 'asc' },
          include: STOP_INCLUDE,
        },
      },
    });

    if (!tour) { res.status(404).json({ error: 'Tour not found' }); return; }
    if (tour.visibility === 'private') {
      res.status(403).json({ error: 'This tour is private' }); return;
    }

    const [favoriteCount, savedCount, { stops: enrichedStops, analysis }] = await Promise.all([
      prisma.bandRpgFavorite.count({ where: { entityType: 'tour', entityId: id, kind: 'favorite' } }),
      prisma.bandRpgFavorite.count({ where: { entityType: 'tour', entityId: id, kind: 'saved' } }),
      analyseStops(tour.stops as StopWithData[]),
    ]);

    const distinctions: string[] = [];
    if (favoriteCount >= 3) distinctions.push('Community Favorite');
    if (savedCount >= 3)    distinctions.push('Most Saved');

    const bands: string[] = [];
    const seenBands = new Set<string>();
    for (const s of enrichedStops) {
      if (!seenBands.has(s.bandId)) { seenBands.add(s.bandId); bands.push(s.bandName); }
    }

    res.json({
      id:              tour.id,
      name:            tour.name,
      description:     tour.description ?? null,
      visibility:      tour.visibility,
      stopCount:       enrichedStops.length,
      bands,
      firstCity:       enrichedStops[0]?.cityName     ?? null,
      lastCity:        enrichedStops[enrichedStops.length - 1]?.cityName ?? null,
      momentum:        analysis.momentum,
      variety:         analysis.variety,
      historicalScore: analysis.historicalScore,
      historicalLabel: analysis.historicalLabel,
      personality:     analysis.personality,
      personalityIcon: analysis.personalityIcon,
      story:           analysis.story,
      achievements:    analysis.achievements,
      stops:           enrichedStops.map((s) => ({
        position:    s.position,
        cityName:    s.cityName,
        countryName: s.countryName,
        concertName: s.concertName,
        bandName:    s.bandName,
        songCount:   s.songCount,
      })),
      createdAt:       tour.createdAt.toISOString(),
      favoriteCount,
      savedCount,
      distinctions,
    }); return;
  } catch (err) { next(err); }
});

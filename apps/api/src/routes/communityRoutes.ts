import { Router }    from 'express';
import { prisma }    from '../lib/prisma.js';
import { computeLevel, levelTitle } from '../services/curatorService.js';

export const communityRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

type Period = 'alltime' | 'month' | 'week';

function periodStart(period: Period): Date | null {
  if (period === 'week')  return new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
  if (period === 'month') return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

function autoLevelLabel(level: number, badgeCount: number): string {
  if (level >= 75) return 'Mythic Archivist';
  if (level >= 50) return 'Elite Curator';
  if (badgeCount >= 10) return 'Badge Master';
  if (level >= 25) return 'Rising Star';
  if (level >= 10) return 'Archive Regular';
  return 'Newcomer';
}

function autoFestivalLabel(concertCount: number, isDream: boolean): string {
  if (isDream)             return 'Dream Festival';
  if (concertCount >= 6)   return 'Grand Festival';
  if (concertCount >= 4)   return 'Major Festival';
  if (concertCount >= 2)   return 'Festival';
  return 'Emerging Festival';
}

function autoTourLabel(stopCount: number): string {
  if (stopCount >= 10) return 'World Tour';
  if (stopCount >= 6)  return 'Major Tour';
  if (stopCount >= 4)  return 'Regional Tour';
  if (stopCount <= 2)  return 'Intimate Run';
  return 'Tour';
}

interface CuratorDisplay {
  displayName: string;
  title:       string;
  level:       number;
  xp:          number;
  badgeCount:  number;
}

async function getCuratorDisplays(userIds: string[]): Promise<Map<string, CuratorDisplay>> {
  if (userIds.length === 0) return new Map();
  const profiles = await prisma.bandRpgCuratorProfile.findMany({
    where:  { userId: { in: userIds } },
    select: { userId: true, xp: true, currentTitle: true, selectedCharacterName: true, badgesUnlocked: true },
  });
  const map = new Map<string, CuratorDisplay>();
  for (const p of profiles) {
    const { level } = computeLevel(p.xp);
    map.set(p.userId, {
      displayName: p.selectedCharacterName ?? 'Curator',
      title:       p.currentTitle ?? levelTitle(level),
      level,
      xp:          p.xp,
      badgeCount:  p.badgesUnlocked.length,
    });
  }
  return map;
}

// ── GET /hub ──────────────────────────────────────────────────────────────────
// Featured items + community stats + weekly spotlights. Public, no auth.

communityRouter.get('/hub', async (_req, res, next): Promise<void> => {
  try {
    const weekAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      publicCuratorCount,
      publicFestivalCount,
      publicTourCount,
      totalSongsRecovered,
      totalChallengesCompleted,
      featuredCuratorRaw,
      featuredFestivalRaw,
      featuredTourRaw,
      weekCuratorRaw,
      weekFestivalRaw,
      weekTourRaw,
    ] = await Promise.all([
      prisma.bandRpgCuratorProfile.count({ where: { visibility: 'public' } }),
      prisma.bandRpgFestival.count({ where: { visibility: 'public' } }),
      prisma.bandRpgTour.count({ where: { visibility: 'public' } }),
      prisma.bandRpgCollectedSong.count(),
      prisma.bandRpgChallengeAttempt.count({ where: { achieved: true } }),

      // Featured curator: highest XP with public profile
      prisma.bandRpgCuratorProfile.findFirst({
        where:   { visibility: 'public' },
        orderBy: { xp: 'desc' },
        select:  { userId: true, xp: true, currentTitle: true, selectedCharacterName: true, badgesUnlocked: true },
      }),

      // Featured festival: public, most concerts
      prisma.bandRpgFestival.findFirst({
        where:   { visibility: 'public' },
        orderBy: { concerts: { _count: 'desc' } },
        include: { _count: { select: { concerts: true } } },
      }),

      // Featured tour: public, most stops
      prisma.bandRpgTour.findFirst({
        where:   { visibility: 'public' },
        orderBy: { stops: { _count: 'desc' } },
        include: { _count: { select: { stops: true } } },
      }),

      // Spotlight curator of the week: most recently active public curator
      prisma.bandRpgCuratorProfile.findFirst({
        where:   { visibility: 'public', lastActiveDate: { gte: weekAgo } },
        orderBy: { xp: 'desc' },
        select:  { userId: true, xp: true, currentTitle: true, selectedCharacterName: true, badgesUnlocked: true },
      }),

      // Spotlight festival of the week: newest public festival with most concerts
      prisma.bandRpgFestival.findFirst({
        where:   { visibility: 'public', createdAt: { gte: monthAgo } },
        orderBy: { concerts: { _count: 'desc' } },
        include: { _count: { select: { concerts: true } } },
      }),

      // Spotlight tour of the week: newest public tour with most stops
      prisma.bandRpgTour.findFirst({
        where:   { visibility: 'public', createdAt: { gte: monthAgo } },
        orderBy: { stops: { _count: 'desc' } },
        include: { _count: { select: { stops: true } } },
      }),
    ]);

    // Discovery: pick a random public entity across all types
    const totalPublic = publicFestivalCount + publicTourCount + publicCuratorCount;
    let discovery: { type: string; id: string; name: string; url: string } | null = null;
    if (totalPublic > 0) {
      const roll = Math.random();
      const festFrac = publicFestivalCount / totalPublic;
      const tourFrac = publicTourCount    / totalPublic;
      if (roll < festFrac && publicFestivalCount > 0) {
        const skip = Math.floor(Math.random() * publicFestivalCount);
        const f    = await prisma.bandRpgFestival.findFirst({ where: { visibility: 'public' }, skip });
        if (f) discovery = { type: 'festival', id: f.id, name: f.name, url: `/band-rpg/festival/${f.id}` };
      } else if (roll < festFrac + tourFrac && publicTourCount > 0) {
        const skip = Math.floor(Math.random() * publicTourCount);
        const t    = await prisma.bandRpgTour.findFirst({ where: { visibility: 'public' }, skip });
        if (t) discovery = { type: 'tour', id: t.id, name: t.name, url: `/band-rpg/tour/${t.id}` };
      } else if (publicCuratorCount > 0) {
        const skip = Math.floor(Math.random() * publicCuratorCount);
        const c    = await prisma.bandRpgCuratorProfile.findFirst({ where: { visibility: 'public' }, skip });
        if (c) discovery = { type: 'curator', id: c.userId, name: c.selectedCharacterName ?? 'Curator', url: `/band-rpg/curator/${c.userId}` };
      }
    }

    const buildCuratorCard = (p: typeof featuredCuratorRaw) => {
      if (!p) return null;
      const { level } = computeLevel(p.xp);
      return {
        userId:      p.userId,
        displayName: p.selectedCharacterName ?? 'Curator',
        title:       p.currentTitle ?? levelTitle(level),
        level,
        xp:          p.xp,
        badgeCount:  p.badgesUnlocked.length,
        label:       autoLevelLabel(level, p.badgesUnlocked.length),
      };
    };

    const buildFestivalCard = (f: typeof featuredFestivalRaw) => {
      if (!f) return null;
      const cc = f._count.concerts;
      return {
        id:           f.id,
        name:         f.name,
        isDream:      f.isDream,
        concertCount: cc,
        label:        autoFestivalLabel(cc, f.isDream),
        createdAt:    f.createdAt.toISOString(),
      };
    };

    const buildTourCard = (t: typeof featuredTourRaw) => {
      if (!t) return null;
      const sc = t._count.stops;
      return {
        id:        t.id,
        name:      t.name,
        stopCount: sc,
        label:     autoTourLabel(sc),
        createdAt: t.createdAt.toISOString(),
      };
    };

    res.json({
      stats: {
        publicCurators:         publicCuratorCount,
        publicFestivals:        publicFestivalCount,
        publicTours:            publicTourCount,
        totalSongsRecovered,
        totalChallengesCompleted,
      },
      featured: {
        curator:   buildCuratorCard(featuredCuratorRaw),
        festival:  buildFestivalCard(featuredFestivalRaw),
        tour:      buildTourCard(featuredTourRaw),
        discovery,
      },
      spotlights: {
        curatorOfWeek:  buildCuratorCard(weekCuratorRaw),
        festivalOfWeek: buildFestivalCard(weekFestivalRaw),
        tourOfWeek:     buildTourCard(weekTourRaw),
      },
    }); return;
  } catch (err) { next(err); }
});

// ── GET /stats ────────────────────────────────────────────────────────────────

communityRouter.get('/stats', async (_req, res, next): Promise<void> => {
  try {
    const [
      curators, festivals, tours,
      songs, albums, challenges,
      dreamFestivals,
    ] = await Promise.all([
      prisma.bandRpgCuratorProfile.count({ where: { visibility: 'public' } }),
      prisma.bandRpgFestival.count({ where: { visibility: 'public' } }),
      prisma.bandRpgTour.count({ where: { visibility: 'public' } }),
      prisma.bandRpgCollectedSong.count(),
      prisma.bandRpgCompletedAlbum.count(),
      prisma.bandRpgChallengeAttempt.count({ where: { achieved: true } }),
      prisma.bandRpgFestival.count({ where: { visibility: 'public', isDream: true } }),
    ]);

    res.json({
      publicCurators:          curators,
      publicFestivals:         festivals,
      publicTours:             tours,
      totalSongsRecovered:     songs,
      totalAlbumsCompleted:    albums,
      totalChallengesCompleted: challenges,
      dreamFestivals,
    }); return;
  } catch (err) { next(err); }
});

// ── GET /leaderboard ──────────────────────────────────────────────────────────
// type: curators | collectors | festivals | tours | challenges | archivists
// period: alltime | month | week

communityRouter.get('/leaderboard', async (req, res, next): Promise<void> => {
  try {
    const type   = (req.query['type']   as string) || 'curators';
    const period = ((req.query['period'] as string) || 'alltime') as Period;
    const since  = periodStart(period);

    // Always filter leaderboard entries to users with public curator profiles
    const publicProfiles = await prisma.bandRpgCuratorProfile.findMany({
      where:  { visibility: 'public' },
      select: { userId: true, xp: true, currentTitle: true, selectedCharacterName: true, badgesUnlocked: true },
    });
    const publicIds = new Set(publicProfiles.map((p) => p.userId));
    const displayMap = new Map(publicProfiles.map((p) => {
      const { level } = computeLevel(p.xp);
      return [p.userId, {
        displayName: p.selectedCharacterName ?? 'Curator',
        title:       p.currentTitle ?? levelTitle(level),
        level,
        xp:          p.xp,
        badgeCount:  p.badgesUnlocked.length,
      }];
    }));

    type Entry = { rank: number; userId: string; displayName: string; title: string; level: number; score: number; scoreLabel: string; label: string };

    let ranked: Entry[] = [];

    if (type === 'curators') {
      // Rank by XP
      let rows = [...publicProfiles].sort((a, b) => b.xp - a.xp);
      if (since) {
        // Time filter: only curators with lastActiveDate >= since
        const activeIds = await prisma.bandRpgCuratorProfile.findMany({
          where:  { visibility: 'public', lastActiveDate: { gte: since } },
          select: { userId: true },
        });
        const activeSet = new Set(activeIds.map((r) => r.userId));
        rows = rows.filter((r) => activeSet.has(r.userId));
      }
      ranked = rows.slice(0, 20).map((r, i) => {
        const d = displayMap.get(r.userId)!;
        return { rank: i + 1, userId: r.userId, displayName: d.displayName, title: d.title, level: d.level, score: r.xp, scoreLabel: 'XP', label: autoLevelLabel(d.level, d.badgeCount) };
      });

    } else if (type === 'collectors') {
      const songGroups = await prisma.bandRpgCollectedSong.groupBy({
        by:      ['userId'],
        where:   {
          userId: { in: [...publicIds] },
          ...(since ? { recoveredAt: { gte: since } } : {}),
        },
        _count:  { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take:    20,
      });
      ranked = songGroups.map((g, i) => {
        const d = displayMap.get(g.userId);
        if (!d) return null;
        return { rank: i + 1, userId: g.userId, displayName: d.displayName, title: d.title, level: d.level, score: g._count._all, scoreLabel: 'Songs', label: autoLevelLabel(d.level, d.badgeCount) };
      }).filter((e): e is Entry => e !== null);

    } else if (type === 'challenges') {
      const chalGroups = await prisma.bandRpgChallengeAttempt.groupBy({
        by:      ['userId'],
        where:   {
          userId:   { in: [...publicIds] },
          achieved: true,
          ...(since ? { completedAt: { gte: since } } : {}),
        },
        _count:  { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take:    20,
      });
      ranked = chalGroups.map((g, i) => {
        const d = displayMap.get(g.userId);
        if (!d) return null;
        return { rank: i + 1, userId: g.userId, displayName: d.displayName, title: d.title, level: d.level, score: g._count._all, scoreLabel: 'Completed', label: autoLevelLabel(d.level, d.badgeCount) };
      }).filter((e): e is Entry => e !== null);

    } else if (type === 'archivists') {
      // Rank by rare/legendary/mythic songs found
      const rareGroups = await prisma.bandRpgCollectedSong.groupBy({
        by:      ['userId'],
        where:   {
          userId: { in: [...publicIds] },
          rarity: { in: ['Rare', 'Legendary', 'Mythic'] },
          ...(since ? { recoveredAt: { gte: since } } : {}),
        },
        _count:  { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take:    20,
      });
      ranked = rareGroups.map((g, i) => {
        const d = displayMap.get(g.userId);
        if (!d) return null;
        return { rank: i + 1, userId: g.userId, displayName: d.displayName, title: d.title, level: d.level, score: g._count._all, scoreLabel: 'Rare Songs', label: autoLevelLabel(d.level, d.badgeCount) };
      }).filter((e): e is Entry => e !== null);

    } else if (type === 'festivals') {
      const festGroups = await prisma.bandRpgFestival.groupBy({
        by:      ['userId'],
        where:   {
          userId:     { in: [...publicIds] },
          visibility: 'public',
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        _count:  { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take:    20,
      });
      ranked = festGroups.map((g, i) => {
        const d = displayMap.get(g.userId);
        if (!d) return null;
        return { rank: i + 1, userId: g.userId, displayName: d.displayName, title: d.title, level: d.level, score: g._count._all, scoreLabel: 'Festivals', label: autoLevelLabel(d.level, d.badgeCount) };
      }).filter((e): e is Entry => e !== null);

    } else if (type === 'tours') {
      const tourGroups = await prisma.bandRpgTour.groupBy({
        by:      ['userId'],
        where:   {
          userId:     { in: [...publicIds] },
          visibility: 'public',
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        _count:  { _all: true },
        orderBy: { _count: { userId: 'desc' } },
        take:    20,
      });
      ranked = tourGroups.map((g, i) => {
        const d = displayMap.get(g.userId);
        if (!d) return null;
        return { rank: i + 1, userId: g.userId, displayName: d.displayName, title: d.title, level: d.level, score: g._count._all, scoreLabel: 'Tours', label: autoLevelLabel(d.level, d.badgeCount) };
      }).filter((e): e is Entry => e !== null);
    }

    res.json({ type, period, entries: ranked }); return;
  } catch (err) { next(err); }
});

// ── GET /discover ─────────────────────────────────────────────────────────────
// type: curator | festival | tour
// page: 1-based, limit: max 24

communityRouter.get('/discover', async (req, res, next): Promise<void> => {
  try {
    const type  = (req.query['type'] as string)  || 'festival';
    const page  = Math.max(1, parseInt((req.query['page']  as string) || '1', 10));
    const limit = Math.min(24, Math.max(1, parseInt((req.query['limit'] as string) || '12', 10)));
    const skip  = (page - 1) * limit;
    const isDream = req.query['isDream'] === 'true' ? true : req.query['isDream'] === 'false' ? false : undefined;

    if (type === 'curator') {
      const [total, items] = await Promise.all([
        prisma.bandRpgCuratorProfile.count({ where: { visibility: 'public' } }),
        prisma.bandRpgCuratorProfile.findMany({
          where:   { visibility: 'public' },
          orderBy: { xp: 'desc' },
          skip,
          take:    limit,
          select:  { userId: true, xp: true, currentTitle: true, selectedCharacterName: true, badgesUnlocked: true, firstRecoveryDate: true },
        }),
      ]);
      const result = items.map((p) => {
        const { level } = computeLevel(p.xp);
        return {
          userId:      p.userId,
          displayName: p.selectedCharacterName ?? 'Curator',
          title:       p.currentTitle ?? levelTitle(level),
          level,
          xp:          p.xp,
          badgeCount:  p.badgesUnlocked.length,
          label:       autoLevelLabel(level, p.badgesUnlocked.length),
          since:       p.firstRecoveryDate?.toISOString() ?? null,
          url:         `/band-rpg/curator/${p.userId}`,
        };
      });
      res.json({ type, total, page, limit, items: result }); return;

    } else if (type === 'festival') {
      const where = { visibility: 'public', ...(isDream !== undefined ? { isDream } : {}) } as const;
      const [total, items] = await Promise.all([
        prisma.bandRpgFestival.count({ where }),
        prisma.bandRpgFestival.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take:    limit,
          include: { _count: { select: { concerts: true } } },
        }),
      ]);
      const result = items.map((f) => ({
        id:           f.id,
        name:         f.name,
        isDream:      f.isDream,
        concertCount: f._count.concerts,
        label:        autoFestivalLabel(f._count.concerts, f.isDream),
        createdAt:    f.createdAt.toISOString(),
        url:          `/band-rpg/festival/${f.id}`,
      }));
      res.json({ type, total, page, limit, items: result }); return;

    } else {
      // tours
      const [total, items] = await Promise.all([
        prisma.bandRpgTour.count({ where: { visibility: 'public' } }),
        prisma.bandRpgTour.findMany({
          where:   { visibility: 'public' },
          orderBy: { createdAt: 'desc' },
          skip,
          take:    limit,
          include: { _count: { select: { stops: true } } },
        }),
      ]);
      const result = items.map((t) => ({
        id:        t.id,
        name:      t.name,
        stopCount: t._count.stops,
        label:     autoTourLabel(t._count.stops),
        createdAt: t.createdAt.toISOString(),
        url:       `/band-rpg/tour/${t.id}`,
      }));
      res.json({ type, total, page, limit, items: result }); return;
    }
  } catch (err) { next(err); }
});

// ── GET /surprise ─────────────────────────────────────────────────────────────
// Returns a random public entity (festival, tour, or curator)

communityRouter.get('/surprise', async (_req, res, next): Promise<void> => {
  try {
    const [fc, tc, cc] = await Promise.all([
      prisma.bandRpgFestival.count({ where: { visibility: 'public' } }),
      prisma.bandRpgTour.count({ where: { visibility: 'public' } }),
      prisma.bandRpgCuratorProfile.count({ where: { visibility: 'public' } }),
    ]);

    const total = fc + tc + cc;
    if (total === 0) { res.json({ type: null, id: null, url: null, name: null }); return; }

    const roll = Math.floor(Math.random() * total);

    if (roll < fc) {
      const skip = Math.floor(Math.random() * fc);
      const f    = await prisma.bandRpgFestival.findFirst({ where: { visibility: 'public' }, skip });
      if (f) { res.json({ type: 'festival', id: f.id, name: f.name, url: `/band-rpg/festival/${f.id}` }); return; }
    } else if (roll < fc + tc) {
      const skip = Math.floor(Math.random() * tc);
      const t    = await prisma.bandRpgTour.findFirst({ where: { visibility: 'public' }, skip });
      if (t) { res.json({ type: 'tour', id: t.id, name: t.name, url: `/band-rpg/tour/${t.id}` }); return; }
    } else {
      const skip = Math.floor(Math.random() * cc);
      const c    = await prisma.bandRpgCuratorProfile.findFirst({ where: { visibility: 'public' }, skip });
      if (c) { res.json({ type: 'curator', id: c.userId, name: c.selectedCharacterName ?? 'Curator', url: `/band-rpg/curator/${c.userId}` }); return; }
    }

    res.json({ type: null, id: null, url: null, name: null }); return;
  } catch (err) { next(err); }
});

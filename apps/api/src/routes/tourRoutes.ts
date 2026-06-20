import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { computeConcertRealism } from '../services/setlistIntelligenceService.js';

export const tourRouter = Router();

// ── Shared include shape ───────────────────────────────────────────────────────

const STOP_INCLUDE = {
  concert: {
    include: {
      setlist: { include: { songs: true } },
      venue: { select: { id: true, name: true, capacity: true } },
    },
  },
  venue: { select: { id: true, name: true, capacity: true } },
} satisfies Prisma.BandRpgTourStopInclude;

type StopWithData = Prisma.BandRpgTourStopGetPayload<{ include: typeof STOP_INCLUDE }>;

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface TourAchievement {
  key:         string;
  name:        string;
  icon:        string;
  description: string;
  unlocked:    boolean;
}

// ── Pure computation helpers ───────────────────────────────────────────────────

const RARITY_VAL: Record<string, number> = {
  Common: 1, Uncommon: 2, Rare: 4, Legendary: 8, Mythic: 15,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function songPower(rarity: string): number {
  return RARITY_VAL[rarity] ?? 1;
}

function fanServiceProxy(songs: Array<{ rarity: string }>): number {
  if (songs.length === 0) return 50;
  const count = songs.filter((s) => s.rarity === 'Common' || s.rarity === 'Uncommon').length;
  return Math.round((count / songs.length) * 100);
}

function deepCutProxy(songs: Array<{ rarity: string }>): number {
  if (songs.length === 0) return 0;
  const count = songs.filter(
    (s) => s.rarity === 'Legendary' || s.rarity === 'Mythic' || s.rarity === 'Rare',
  ).length;
  return Math.round((count / songs.length) * 100);
}

function computeMomentum(powers: number[]): number {
  const n = powers.length;
  if (n <= 1) return 50;
  const mid       = Math.floor(n / 2);
  const first     = powers.slice(0, mid);
  const second    = powers.slice(mid);
  const avgFirst  = first.reduce((s, v) => s + v, 0) / first.length;
  const avgSecond = second.reduce((s, v) => s + v, 0) / second.length;
  const halfGap   = avgSecond - avgFirst;
  const slope     = clamp((halfGap / 150) * 50, -50, 50);
  const maxPow    = Math.max(...powers);
  const peakIdx   = powers.lastIndexOf(maxPow);
  const third     = n / 3;
  const peak      = peakIdx >= n - third ? 20 : peakIdx >= third ? 5 : -15;
  return clamp(Math.round(50 + slope + peak), 0, 100);
}

function computeVariety(
  stopSongs: Array<Array<{ songId: string; rarity: string }>>,
): number {
  if (stopSongs.length === 0) return 0;
  const all       = stopSongs.flat();
  const total     = all.length;
  if (total === 0) return 0;
  const stopCount = stopSongs.length;

  const counts = new Map<string, number>();
  for (const { songId } of all) counts.set(songId, (counts.get(songId) ?? 0) + 1);
  const unique = counts.size;

  const uniqScore = (unique / total) * 70;

  let overCount = 0;
  for (const c of counts.values()) if (c / stopCount > 0.6) overCount++;
  const overPen = Math.min(20, overCount * 5);

  const specials  = [...counts.values()].filter((c) => c === 1).length;
  const specBonus = unique > 0 ? Math.min(15, (specials / unique) * 20) : 0;

  const deepCount = all.filter(
    (s) => s.rarity === 'Legendary' || s.rarity === 'Mythic' || s.rarity === 'Rare',
  ).length;
  const deepBonus = Math.min(15, (deepCount / total) * 30);

  return clamp(Math.round(uniqScore - overPen + specBonus + deepBonus), 0, 100);
}

function histLabel(score: number): string {
  if (score >= 85) return 'True to Life';
  if (score >= 70) return 'Realistic';
  if (score >= 55) return 'Plausible';
  if (score >= 35) return 'Ambitious';
  if (score >= 15) return 'Fan Fiction';
  return 'Dream Only';
}

function computePersonality(
  stopCount:     number,
  avgFanService: number,
  avgDeepCut:    number,
  avgPower:      number,
  variety:       number,
): { label: string; icon: string } {
  const opts: Array<{ label: string; icon: string; score: number }> = [
    { label: 'The Deep Archive Tour',    icon: '🔍', score: (avgDeepCut > 60 ? 50 : avgDeepCut > 40 ? 25 : 0) - (avgFanService > 60 ? 20 : 0) + (variety > 70 ? 15 : 0) },
    { label: 'The Fan Celebration Tour', icon: '❤️',  score: (avgFanService > 65 ? 50 : avgFanService > 50 ? 25 : 0) - (avgDeepCut > 60 ? 20 : 0) },
    { label: 'The Stadium Tour',         icon: '🏟️', score: (avgPower > 150 ? 40 : avgPower > 100 ? 20 : 0) + (avgFanService > 50 ? 15 : 0) + (stopCount >= 8 ? 10 : 0) },
    { label: 'The Epic Journey',         icon: '🗺️', score: (stopCount >= 10 ? 60 : stopCount >= 7 ? 40 : stopCount >= 5 ? 20 : 0) + (variety > 60 ? 10 : 0) },
    { label: 'The Comeback Tour',        icon: '⭐',  score: stopCount <= 2 ? 80 : stopCount === 3 ? 40 : 0 },
    { label: 'The Variety Show',         icon: '🎪', score: variety > 80 ? 50 : variety > 65 ? 30 : 0 },
    { label: 'The Intimate Affair',      icon: '🕯️', score: (avgPower < 60 ? 30 : 0) + (stopCount <= 4 ? 20 : 0) },
    { label: 'The Progressive Odyssey',  icon: '🎭', score: variety > 70 && avgDeepCut > 50 ? 35 : 0 },
    { label: 'The Atmosphere Journey',   icon: '🌌', score: avgFanService < 40 && variety > 60 ? 30 : 0 },
    { label: 'The Psychedelic Caravan',  icon: '🌀', score: variety > 75 && avgPower < 80 ? 25 : 0 },
    { label: 'The Concept Pilgrimage',   icon: '💡', score: avgDeepCut > 55 && variety > 65 ? 28 : 0 },
    { label: 'The Heavy Assault',        icon: '🔥', score: avgDeepCut > 70 && avgFanService < 30 ? 32 : 0 },
  ];
  opts.sort((a, b) => b.score - a.score);
  const w = opts[0];
  return { label: w?.label ?? 'The Open Road Tour', icon: w?.icon ?? '🎸' };
}

function buildStory(p: {
  stopCount:        number;
  firstCity:        string | null;
  lastCity:         string | null;
  firstConcertName: string;
  momentum:         number;
  variety:          number;
  personality:      string;
  bands:            string[];
}): string {
  const bandStr   = p.bands.length > 1 ? `${p.bands[0] ?? 'the band'} and company` : (p.bands[0] ?? 'the band');
  const openCity  = p.firstCity  ? `in ${p.firstCity}`  : 'on the road';
  const closeCity = p.lastCity   ? `In ${p.lastCity}`   : 'On the final night';

  const momentLine =
    p.momentum >= 80 ? `With each stop, ${bandStr} raised the intensity — building toward an unforgettable finale.`
    : p.momentum >= 60 ? `The tour found its rhythm early and kept every crowd guessing.`
    : p.momentum >= 40 ? `A measured run — some peaks, some quieter nights, consistent energy throughout.`
    : `Opening night delivered their finest hour; the rest of the tour was a more reflective descent.`;

  const varLine =
    p.variety >= 80 ? `Rotating setlists and rare deep cuts made every night genuinely unique.`
    : p.variety >= 60 ? `Setlists evolved as the tour progressed, keeping dedicated fans engaged.`
    : `Fans could count on the classics — this tour was built for celebration.`;

  const sizeL =
    p.stopCount >= 10 ? `Spanning ${p.stopCount} cities, this was a full-scale world tour.`
    : p.stopCount >= 5 ? `Covering ${p.stopCount} cities across the run.`
    : `An intimate ${p.stopCount}-stop run that left a lasting impression.`;

  return [
    `The tour opened ${openCity} with ${p.firstConcertName}.`,
    momentLine,
    varLine,
    sizeL,
    `${closeCity} brought the curtain down on ${p.personality.toLowerCase()}.`,
  ].join(' ');
}

function buildAchievements(p: {
  stopCount:       number;
  momentum:        number;
  variety:         number;
  historicalScore: number | null;
  powers:          number[];
}): TourAchievement[] {
  const maxPow  = p.powers.length > 0 ? Math.max(...p.powers) : 0;
  const lastPow = p.powers.length > 0 ? (p.powers[p.powers.length - 1] ?? 0) : 0;
  const closing = p.powers.length >= 2 && lastPow === maxPow && maxPow > 0;
  return [
    { key: 'first_tour',       name: 'First Tour',       icon: '🎸', description: 'Created your first Band RPG tour.',            unlocked: true },
    { key: 'five_stops',       name: 'Five Stops',       icon: '🗺️', description: 'A tour with 5 or more stops.',                 unlocked: p.stopCount >= 5 },
    { key: 'world_tour',       name: 'World Tour',       icon: '🌍', description: 'A full tour spanning 10 or more cities.',      unlocked: p.stopCount >= 10 },
    { key: 'perfect_momentum', name: 'Perfect Momentum', icon: '⚡', description: 'Tour momentum score of 90 or higher.',         unlocked: p.momentum >= 90 },
    { key: 'deep_cut_tour',    name: 'Deep Cut Tour',    icon: '🔍', description: 'Tour variety score of 80 or higher.',          unlocked: p.variety >= 80 },
    { key: 'closing_night',    name: 'Closing Night',    icon: '🎪', description: 'Best concert saved for the final stop.',       unlocked: closing },
    { key: 'legendary_tour',   name: 'Legendary Tour',   icon: '🌟', description: 'Historical tour score of 80 or higher.',      unlocked: (p.historicalScore ?? 0) >= 80 },
    { key: 'mythic_tour',      name: 'Mythic Tour',      icon: '🔥', description: 'Momentum, Variety, and Historical all ≥ 80.', unlocked: p.momentum >= 80 && p.variety >= 80 && (p.historicalScore ?? 0) >= 80 },
  ];
}

// ── Core analysis ──────────────────────────────────────────────────────────────

async function analyseStops(stops: StopWithData[]): Promise<{
  stops: Array<{
    id:           string;
    position:     number;
    cityName:     string | null;
    countryName:  string | null;
    concertId:    string;
    concertName:  string;
    bandId:       string;
    bandName:     string;
    songCount:    number;
    concertPower: number;
    fanService:   number;
    deepCut:      number;
    venueName:    string | null;
    realismScore: number | null;
    realismLabel: string | null;
  }>;
  analysis: {
    momentum:        number;
    variety:         number;
    historicalScore: number | null;
    historicalLabel: string | null;
    personality:     string;
    personalityIcon: string;
    story:           string;
    achievements:    TourAchievement[];
  };
}> {
  if (stops.length === 0) {
    return {
      stops: [],
      analysis: {
        momentum: 50, variety: 0,
        historicalScore: null, historicalLabel: null,
        personality: 'The Open Road Tour', personalityIcon: '🎸',
        story: 'Add concerts to begin your tour story.',
        achievements: buildAchievements({ stopCount: 0, momentum: 50, variety: 0, historicalScore: null, powers: [] }),
      },
    };
  }

  // Fetch live profiles for all songs
  const allSongIds = [
    ...new Set(stops.flatMap((s) => s.concert.setlist.songs.map((ss) => ss.songId))),
  ];
  const liveProfiles = await prisma.bandRpgSongProfile.findMany({
    where:  { songId: { in: allSongIds } },
    select: { songId: true, liveStatus: true },
  });
  const liveMap = new Map(liveProfiles.map((p) => [p.songId, p.liveStatus]));

  // Per-stop computation
  const powers:       number[] = [];
  const stopSongSets: Array<Array<{ songId: string; rarity: string }>> = [];
  const realisms:     Array<number | null> = [];
  const fanServices:  number[] = [];
  const deepCuts:     number[] = [];
  const bands:        string[] = [];
  const seenBands     = new Set<string>();

  const enrichedStops = stops.map((stop) => {
    const songs    = stop.concert.setlist.songs;
    const power    = songs.reduce((s, ss) => s + songPower(ss.rarity), 0);
    const fs       = fanServiceProxy(songs);
    const dc       = deepCutProxy(songs);
    const statuses = songs.map((ss) => liveMap.get(ss.songId) ?? 'Unknown');
    const realism  = computeConcertRealism(statuses);

    // Prefer stop-level venue override, fall back to concert's venue
    const venueName = (stop.venue ?? stop.concert.venue)?.name ?? null;

    powers.push(power);
    stopSongSets.push(songs.map((ss) => ({ songId: ss.songId, rarity: ss.rarity })));
    realisms.push(realism?.realismScore ?? null);
    fanServices.push(fs);
    deepCuts.push(dc);
    if (!seenBands.has(stop.concert.bandId)) {
      seenBands.add(stop.concert.bandId);
      bands.push(stop.concert.bandName);
    }

    return {
      id:           stop.id,
      position:     stop.position,
      cityName:     stop.cityName,
      countryName:  stop.countryName,
      concertId:    stop.concert.id,
      concertName:  stop.concert.concertName,
      bandId:       stop.concert.bandId,
      bandName:     stop.concert.bandName,
      songCount:    songs.length,
      concertPower: power,
      fanService:   fs,
      deepCut:      dc,
      venueName,
      realismScore: realism?.realismScore ?? null,
      realismLabel: realism?.realismLabel ?? null,
    };
  });

  const momentum = computeMomentum(powers);
  const variety  = computeVariety(stopSongSets);

  const validRealisms = realisms.filter((r): r is number => r !== null);
  const histScore =
    validRealisms.length > 0 && validRealisms.length / realisms.length >= 0.3
      ? Math.round(validRealisms.reduce((s, v) => s + v, 0) / validRealisms.length)
      : null;

  const avgFanService = fanServices.length > 0 ? fanServices.reduce((s, v) => s + v, 0) / fanServices.length : 50;
  const avgDeepCut    = deepCuts.length > 0 ? deepCuts.reduce((s, v) => s + v, 0) / deepCuts.length : 0;
  const avgPower      = powers.length > 0 ? powers.reduce((s, v) => s + v, 0) / powers.length : 0;

  const { label: personality, icon: personalityIcon } =
    computePersonality(stops.length, avgFanService, avgDeepCut, avgPower, variety);

  const firstStop = stops[0];
  const lastStop  = stops[stops.length - 1];

  const story = buildStory({
    stopCount:        stops.length,
    firstCity:        firstStop?.cityName ?? null,
    lastCity:         lastStop?.cityName ?? null,
    firstConcertName: firstStop?.concert.concertName ?? 'the opening night',
    momentum,
    variety,
    personality,
    bands,
  });

  const achievements = buildAchievements({
    stopCount:       stops.length,
    momentum,
    variety,
    historicalScore: histScore,
    powers,
  });

  return {
    stops: enrichedStops,
    analysis: {
      momentum,
      variety,
      historicalScore: histScore,
      historicalLabel: histScore !== null ? histLabel(histScore) : null,
      personality,
      personalityIcon,
      story,
      achievements,
    },
  };
}

// ── Helper: build summary bands list and first/last city from loaded stops ─────

function stopsMeta(stops: StopWithData[]): {
  bands:     string[];
  firstCity: string | null;
  lastCity:  string | null;
} {
  const bands: string[] = [];
  const seen  = new Set<string>();
  for (const s of stops) {
    if (!seen.has(s.concert.bandId)) {
      seen.add(s.concert.bandId);
      bands.push(s.concert.bandName);
    }
  }
  return {
    bands,
    firstCity: stops[0]?.cityName ?? null,
    lastCity:  stops[stops.length - 1]?.cityName ?? null,
  };
}

// ── CRUD routes ────────────────────────────────────────────────────────────────

// GET /tours — list all tours for the logged-in user with summary analysis
tourRouter.get('/', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const tours  = await prisma.bandRpgTour.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        stops: {
          orderBy: { position: 'asc' },
          include: STOP_INCLUDE,
        },
      },
    });

    const results = await Promise.all(
      tours.map(async (tour) => {
        const { stops: enrichedStops, analysis } = await analyseStops(tour.stops);
        const meta = stopsMeta(tour.stops);
        return {
          id:              tour.id,
          name:            tour.name,
          description:     tour.description,
          stopCount:       tour.stops.length,
          bands:           meta.bands,
          firstCity:       meta.firstCity,
          lastCity:        meta.lastCity,
          momentum:        analysis.momentum,
          variety:         analysis.variety,
          historicalScore: analysis.historicalScore,
          historicalLabel: analysis.historicalLabel,
          personality:     analysis.personality,
          personalityIcon: analysis.personalityIcon,
          achievements:    analysis.achievements,
          stops:           enrichedStops,
          createdAt:       tour.createdAt,
          updatedAt:       tour.updatedAt,
        };
      }),
    );

    res.json(results); return;
  } catch (err) { next(err); }
});

// POST /tours — create a new tour
tourRouter.post('/', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { name, description } = req.body as { name?: string; description?: string };

    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' }); return;
    }

    const tour = await prisma.bandRpgTour.create({
      data: {
        userId,
        name: name.trim(),
        ...(description?.trim() ? { description: description.trim() } : {}),
      },
    });

    res.json({ ok: true, id: tour.id }); return;
  } catch (err) { next(err); }
});

// GET /tours/:tourId — detail with full analysis including story
tourRouter.get('/:tourId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId   = req.user!.userId;
    const { tourId } = req.params as { tourId: string };

    const tour = await prisma.bandRpgTour.findFirst({
      where:   { id: tourId, userId },
      include: {
        stops: {
          orderBy: { position: 'asc' },
          include: STOP_INCLUDE,
        },
      },
    });

    if (!tour) { res.status(404).json({ error: 'Tour not found' }); return; }

    const { stops: enrichedStops, analysis } = await analyseStops(tour.stops);
    const meta = stopsMeta(tour.stops);

    res.json({
      id:              tour.id,
      name:            tour.name,
      ...(tour.description != null ? { description: tour.description } : {}),
      stopCount:       tour.stops.length,
      bands:           meta.bands,
      firstCity:       meta.firstCity,
      lastCity:        meta.lastCity,
      momentum:        analysis.momentum,
      variety:         analysis.variety,
      historicalScore: analysis.historicalScore,
      historicalLabel: analysis.historicalLabel,
      personality:     analysis.personality,
      personalityIcon: analysis.personalityIcon,
      story:           analysis.story,
      achievements:    analysis.achievements,
      stops:           enrichedStops,
      createdAt:       tour.createdAt,
      updatedAt:       tour.updatedAt,
    });
    return;
  } catch (err) { next(err); }
});

// PUT /tours/:tourId — update name and/or description
tourRouter.put('/:tourId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId   = req.user!.userId;
    const { tourId } = req.params as { tourId: string };
    const { name, description } = req.body as { name?: string; description?: string };

    const existing = await prisma.bandRpgTour.findFirst({ where: { id: tourId, userId } });
    if (!existing) { res.status(404).json({ error: 'Tour not found' }); return; }

    await prisma.bandRpgTour.update({
      where: { id: tourId },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(description !== undefined
          ? { description: description.trim() || null }
          : {}),
      },
    });

    res.json({ ok: true }); return;
  } catch (err) { next(err); }
});

// DELETE /tours/:tourId
tourRouter.delete('/:tourId', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId   = req.user!.userId;
    const { tourId } = req.params as { tourId: string };

    const existing = await prisma.bandRpgTour.findFirst({ where: { id: tourId, userId } });
    if (!existing) { res.status(404).json({ error: 'Tour not found' }); return; }

    await prisma.bandRpgTour.delete({ where: { id: tourId } });
    res.json({ ok: true }); return;
  } catch (err) { next(err); }
});

// PUT /tours/:tourId/stops — replace the full ordered stop list atomically
tourRouter.put('/:tourId/stops', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId   = req.user!.userId;
    const { tourId } = req.params as { tourId: string };
    const { stops } = req.body as {
      stops: Array<{
        concertId:   string;
        cityName?:   string;
        countryName?: string;
        venueId?:    string;
      }>;
    };

    if (!Array.isArray(stops)) {
      res.status(400).json({ error: 'stops must be an array' }); return;
    }

    const tour = await prisma.bandRpgTour.findFirst({ where: { id: tourId, userId } });
    if (!tour) { res.status(404).json({ error: 'Tour not found' }); return; }

    // Verify all concerts exist and belong to this user
    const concertIds = stops.map((s) => s.concertId);
    const concerts   = await prisma.bandRpgConcert.findMany({
      where:  { id: { in: concertIds }, userId },
      select: { id: true },
    });
    if (concerts.length !== new Set(concertIds).size) {
      res.status(400).json({ error: 'One or more concerts not found or not owned by you' }); return;
    }

    await prisma.$transaction([
      prisma.bandRpgTourStop.deleteMany({ where: { tourId } }),
      prisma.bandRpgTourStop.createMany({
        data: stops.map((s, idx) => ({
          tourId,
          position:  idx,
          concertId: s.concertId,
          ...(s.cityName?.trim()    ? { cityName:    s.cityName.trim()    } : {}),
          ...(s.countryName?.trim() ? { countryName: s.countryName.trim() } : {}),
          ...(s.venueId?.trim()     ? { venueId:     s.venueId.trim()     } : {}),
        })),
      }),
    ]);

    res.json({ ok: true, stopCount: stops.length }); return;
  } catch (err) { next(err); }
});

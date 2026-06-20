import { prisma } from '../lib/prisma.js';

// ── XP grants ─────────────────────────────────────────────────────────────────

export const XP_GRANTS = {
  SONG_RECOVERED:      10,
  CORRECT_GUESS:        5,
  ALBUM_COMPLETED:     50,
  SETLIST_CREATED:     25,
  CONCERT_CREATED:     50,
  FESTIVAL_CREATED:   100,
  TOUR_CREATED:       150,
  CHALLENGE_EASY:      50,
  CHALLENGE_MEDIUM:   100,
  CHALLENGE_HARD:     200,
  CHALLENGE_LEGENDARY: 500,
} as const;

// ── Level progression ─────────────────────────────────────────────────────────
// Cumulative XP to reach each level.

export function xpToReachLevel(level: number): number {
  if (level <= 1)   return 0;
  if (level <= 10)  return 200 * (level - 1);
  if (level <= 25)  return 1800 + 350 * (level - 10);
  if (level <= 50)  return 7050 + 700 * (level - 25);
  if (level <= 75)  return 24550 + 1400 * (level - 50);
  if (level <= 100) return 59550 + 2800 * (level - 75);
  return 129550 + 5000 * (level - 100);
}

export function computeLevel(xp: number): {
  level:          number;
  xpIntoLevel:    number;
  xpForNextLevel: number;
  pct:            number;
} {
  let level = 1;
  while (xpToReachLevel(level + 1) <= xp) level++;
  const currentFloor  = xpToReachLevel(level);
  const nextFloor     = xpToReachLevel(level + 1);
  const xpIntoLevel   = xp - currentFloor;
  const xpForNextLevel = nextFloor - currentFloor;
  const pct = Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100));
  return { level, xpIntoLevel, xpForNextLevel, pct };
}

// ── Level titles ──────────────────────────────────────────────────────────────

const LEVEL_TITLE_THRESHOLDS = [
  { minLevel: 100, title: 'Grand Archivist'   },
  { minLevel: 75,  title: 'Mythic Archivist'  },
  { minLevel: 60,  title: 'Legend Keeper'     },
  { minLevel: 50,  title: 'Elite Archivist'   },
  { minLevel: 40,  title: 'Master Curator'    },
  { minLevel: 35,  title: 'Tour Director'     },
  { minLevel: 30,  title: 'Festival Architect' },
  { minLevel: 25,  title: 'Setlist Scholar'   },
  { minLevel: 20,  title: 'Music Historian'   },
  { minLevel: 15,  title: 'Collection Keeper' },
  { minLevel: 10,  title: 'Archivist'         },
  { minLevel: 5,   title: 'Archive Assistant' },
  { minLevel: 1,   title: 'Archive Newcomer'  },
];

export function levelTitle(level: number): string {
  for (const t of LEVEL_TITLE_THRESHOLDS) {
    if (level >= t.minLevel) return t.title;
  }
  return 'Archive Newcomer';
}

export function allAvailableTitles(level: number, challengeTitles: string[]): string[] {
  const lvlTitles = LEVEL_TITLE_THRESHOLDS
    .filter(t => level >= t.minLevel)
    .map(t => t.title);
  return [...new Set([...lvlTitles, ...challengeTitles])];
}

// ── Badge definitions ─────────────────────────────────────────────────────────

export interface CuratorStats {
  songsRecovered:       number;
  albumsCompleted:      number;
  setlistsCreated:      number;
  concertsCreated:      number;
  festivalsCreated:     number;
  dreamFestivalsCreated: number;
  toursCreated:         number;
  challengesCompleted:  number;
  rareSongsFound:       number;
  legendarySongsFound:  number;
  mythicSongsFound:     number;
  correctGuessCount:    number;
  totalGuesses:         number;
  correctGuessPct:      number;
}

export interface BadgeDefinition {
  key:         string;
  icon:        string;
  name:        string;
  description: string;
  check:       (stats: CuratorStats) => boolean;
  progress?:   (stats: CuratorStats) => { current: number; target: number } | null;
}

export const BADGES: BadgeDefinition[] = [
  {
    key: 'first-recovery',
    icon: '🎵', name: 'First Recovery',
    description: 'Recover your first song from the Archive',
    check: (s) => s.songsRecovered >= 1,
    progress: (s) => ({ current: Math.min(s.songsRecovered, 1), target: 1 }),
  },
  {
    key: 'album-restorer',
    icon: '💿', name: 'Album Restorer',
    description: 'Complete your first album',
    check: (s) => s.albumsCompleted >= 1,
    progress: (s) => ({ current: Math.min(s.albumsCompleted, 1), target: 1 }),
  },
  {
    key: 'setlist-architect',
    icon: '📋', name: 'Setlist Architect',
    description: 'Create your first setlist',
    check: (s) => s.setlistsCreated >= 1,
    progress: (s) => ({ current: Math.min(s.setlistsCreated, 1), target: 1 }),
  },
  {
    key: 'concert-builder',
    icon: '🎤', name: 'Concert Builder',
    description: 'Book your first concert',
    check: (s) => s.concertsCreated >= 1,
    progress: (s) => ({ current: Math.min(s.concertsCreated, 1), target: 1 }),
  },
  {
    key: 'festival-founder',
    icon: '🎪', name: 'Festival Founder',
    description: 'Host your first festival',
    check: (s) => s.festivalsCreated >= 1,
    progress: (s) => ({ current: Math.min(s.festivalsCreated, 1), target: 1 }),
  },
  {
    key: 'tour-creator',
    icon: '🗺️', name: 'Tour Creator',
    description: 'Plan your first tour',
    check: (s) => s.toursCreated >= 1,
    progress: (s) => ({ current: Math.min(s.toursCreated, 1), target: 1 }),
  },
  {
    key: 'challenger',
    icon: '⚔', name: 'Challenger',
    description: 'Complete your first challenge',
    check: (s) => s.challengesCompleted >= 1,
    progress: (s) => ({ current: Math.min(s.challengesCompleted, 1), target: 1 }),
  },
  {
    key: 'rare-hunter',
    icon: '🔵', name: 'Rare Hunter',
    description: 'Recover 10 Rare, Legendary, or Mythic songs',
    check: (s) => s.rareSongsFound >= 10,
    progress: (s) => ({ current: Math.min(s.rareSongsFound, 10), target: 10 }),
  },
  {
    key: 'legend-hunter',
    icon: '🟣', name: 'Legend Hunter',
    description: 'Recover 5 Legendary songs',
    check: (s) => s.legendarySongsFound >= 5,
    progress: (s) => ({ current: Math.min(s.legendarySongsFound, 5), target: 5 }),
  },
  {
    key: 'mythic-collector',
    icon: '🟠', name: 'Mythic Collector',
    description: 'Recover your first Mythic song',
    check: (s) => s.mythicSongsFound >= 1,
    progress: (s) => ({ current: Math.min(s.mythicSongsFound, 1), target: 1 }),
  },
  {
    key: 'myth-hunter',
    icon: '👑', name: 'Myth Hunter',
    description: 'Recover 5 Mythic songs',
    check: (s) => s.mythicSongsFound >= 5,
    progress: (s) => ({ current: Math.min(s.mythicSongsFound, 5), target: 5 }),
  },
  {
    key: 'archive-veteran',
    icon: '📚', name: 'Archive Veteran',
    description: 'Recover 100 songs',
    check: (s) => s.songsRecovered >= 100,
    progress: (s) => ({ current: Math.min(s.songsRecovered, 100), target: 100 }),
  },
  {
    key: 'discophile',
    icon: '🎶', name: 'Discophile',
    description: 'Complete 5 albums',
    check: (s) => s.albumsCompleted >= 5,
    progress: (s) => ({ current: Math.min(s.albumsCompleted, 5), target: 5 }),
  },
  {
    key: 'dream-builder',
    icon: '💭', name: 'Dream Builder',
    description: 'Create a Dream Festival',
    check: (s) => s.dreamFestivalsCreated >= 1,
    progress: (s) => ({ current: Math.min(s.dreamFestivalsCreated, 1), target: 1 }),
  },
  {
    key: 'prolific-curator',
    icon: '🏆', name: 'Prolific Curator',
    description: 'Create 10 concerts',
    check: (s) => s.concertsCreated >= 10,
    progress: (s) => ({ current: Math.min(s.concertsCreated, 10), target: 10 }),
  },
];

// ── Stats computation ─────────────────────────────────────────────────────────

export async function computeStats(userId: string): Promise<CuratorStats> {
  const [
    songsRecovered,
    albumsCompleted,
    setlistsCreated,
    concertsCreated,
    festivalsCreated,
    dreamFestivalsCreated,
    toursCreated,
    challengesCompleted,
    rareSongsFound,
    legendarySongsFound,
    mythicSongsFound,
    correctGuessCount,
  ] = await Promise.all([
    prisma.bandRpgCollectedSong.count({ where: { userId } }),
    prisma.bandRpgCompletedAlbum.count({ where: { userId } }),
    prisma.bandRpgSetlist.count({ where: { userId } }),
    prisma.bandRpgConcert.count({ where: { userId } }),
    prisma.bandRpgFestival.count({ where: { userId } }),
    prisma.bandRpgFestival.count({ where: { userId, isDream: true } }),
    prisma.bandRpgTour.count({ where: { userId } }),
    prisma.bandRpgChallengeAttempt.count({ where: { userId, achieved: true } }),
    prisma.bandRpgCollectedSong.count({ where: { userId, rarity: { in: ['Rare', 'Legendary', 'Mythic'] } } }),
    prisma.bandRpgCollectedSong.count({ where: { userId, rarity: 'Legendary' } }),
    prisma.bandRpgCollectedSong.count({ where: { userId, rarity: 'Mythic' } }),
    prisma.bandRpgCollectedSong.count({ where: { userId, guessedCorrectly: true } }),
  ]);

  const totalGuesses   = songsRecovered;
  const correctGuessPct = totalGuesses > 0
    ? Math.round((correctGuessCount / totalGuesses) * 100)
    : 0;

  return {
    songsRecovered, albumsCompleted, setlistsCreated, concertsCreated,
    festivalsCreated, dreamFestivalsCreated, toursCreated, challengesCompleted,
    rareSongsFound, legendarySongsFound, mythicSongsFound,
    correctGuessCount, totalGuesses, correctGuessPct,
  };
}

// ── Badge unlock check ────────────────────────────────────────────────────────

export function evaluateBadges(
  stats: CuratorStats,
  currentBadges: string[],
): string[] {
  const newBadges: string[] = [];
  for (const badge of BADGES) {
    if (!currentBadges.includes(badge.key) && badge.check(stats)) {
      newBadges.push(badge.key);
    }
  }
  return newBadges;
}

// ── Recent activity ───────────────────────────────────────────────────────────

export interface ActivityItem {
  type:  string;
  icon:  string;
  label: string;
  date:  Date;
}

export async function computeRecentActivity(userId: string): Promise<ActivityItem[]> {
  const [songs, albums, concerts, festivals, tours, challenges] = await Promise.all([
    prisma.bandRpgCollectedSong.findMany({
      where: { userId }, orderBy: { recoveredAt: 'desc' }, take: 5,
      select: { songTitle: true, rarity: true, recoveredAt: true },
    }),
    prisma.bandRpgCompletedAlbum.findMany({
      where: { userId }, orderBy: { completedAt: 'desc' }, take: 3,
      select: { albumTitle: true, completedAt: true },
    }),
    prisma.bandRpgConcert.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 3,
      select: { concertName: true, createdAt: true },
    }),
    prisma.bandRpgFestival.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 3,
      select: { name: true, createdAt: true },
    }),
    prisma.bandRpgTour.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 3,
      select: { name: true, createdAt: true },
    }),
    prisma.bandRpgChallengeAttempt.findMany({
      where: { userId, achieved: true }, orderBy: { completedAt: 'desc' }, take: 4,
      include: { challenge: { select: { name: true, rewardBadge: true } } },
    }),
  ]);

  const items: ActivityItem[] = [
    ...songs.map(s => ({
      type: 'song', date: s.recoveredAt,
      icon: s.rarity === 'Mythic' ? '🟠' : s.rarity === 'Legendary' ? '🟣' : s.rarity === 'Rare' ? '🔵' : '🎵',
      label: `Recovered "${s.songTitle}"`,
    })),
    ...albums.map(a => ({ type: 'album', icon: '💿', label: `Completed album "${a.albumTitle}"`, date: a.completedAt })),
    ...concerts.map(c => ({ type: 'concert', icon: '🎤', label: `Booked concert "${c.concertName}"`, date: c.createdAt })),
    ...festivals.map(f => ({ type: 'festival', icon: '🎪', label: `Created festival "${f.name}"`, date: f.createdAt })),
    ...tours.map(t => ({ type: 'tour', icon: '🗺️', label: `Built tour "${t.name}"`, date: t.createdAt })),
    ...challenges.map(c => ({
      type: 'challenge', date: c.completedAt,
      icon: c.challenge.rewardBadge ?? '⚔',
      label: `Beat challenge "${c.challenge.name}"`,
    })),
  ];

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items.slice(0, 20);
}

// ── XP grant (non-throwing) ───────────────────────────────────────────────────

export async function grantXP(
  userId:          string,
  amount:          number,
  opts?: { setFirstRecovery?: boolean },
): Promise<void> {
  if (amount <= 0) return;

  const existing = await prisma.bandRpgCuratorProfile.findUnique({
    where:  { userId },
    select: { xp: true, firstRecoveryDate: true },
  });

  const setFirstRecovery = (opts?.setFirstRecovery === true) && !existing?.firstRecoveryDate;

  await prisma.bandRpgCuratorProfile.upsert({
    where: { userId },
    create: {
      userId,
      xp:            amount,
      lastActiveDate: new Date(),
      ...(opts?.setFirstRecovery ? { firstRecoveryDate: new Date() } : {}),
    },
    update: {
      xp:            { increment: amount },
      lastActiveDate: new Date(),
      ...(setFirstRecovery ? { firstRecoveryDate: new Date() } : {}),
    },
  });
}

// ── Challenge titles — persist newly earned titles from challenges ─────────────

export async function persistChallengeTitles(userId: string, rewardTitle: string | null): Promise<void> {
  if (!rewardTitle) return;
  const profile = await prisma.bandRpgCuratorProfile.findUnique({
    where: { userId }, select: { titlesUnlocked: true },
  });
  if (profile?.titlesUnlocked.includes(rewardTitle)) return;
  await prisma.bandRpgCuratorProfile.upsert({
    where:  { userId },
    create: { userId, titlesUnlocked: [rewardTitle] },
    update: { titlesUnlocked: { push: rewardTitle } },
  });
}

// ── Full profile build (used by GET /curator) ─────────────────────────────────

export async function buildCuratorProfile(userId: string): Promise<{
  level:               number;
  xp:                  number;
  xpIntoLevel:         number;
  xpForNextLevel:      number;
  xpProgressPct:       number;
  levelTitle:          string;
  currentTitle:        string | null;
  titlesUnlocked:      string[];
  allTitles:           string[];
  badgesUnlocked:      string[];
  firstRecoveryDate:   string | null;
  lastActiveDate:      string | null;
  selectedCharacterId:   string | null;
  selectedCharacterName: string | null;
  stats:    CuratorStats;
  badges:   Array<{
    key: string; icon: string; name: string; description: string;
    unlocked: boolean;
    progress: { current: number; target: number } | null;
  }>;
  recentActivity: Array<{ type: string; icon: string; label: string; date: string }>;
}> {
  const [profile, stats, activity] = await Promise.all([
    prisma.bandRpgCuratorProfile.findUnique({ where: { userId } }),
    computeStats(userId),
    computeRecentActivity(userId),
  ]);

  const xp = profile?.xp ?? 0;
  const { level, xpIntoLevel, xpForNextLevel, pct } = computeLevel(xp);
  const ltitle = levelTitle(level);

  // Check for newly unlocked badges
  const existing  = profile?.badgesUnlocked ?? [];
  const newBadges = evaluateBadges(stats, existing);
  if (newBadges.length > 0) {
    await prisma.bandRpgCuratorProfile.upsert({
      where:  { userId },
      create: { userId, badgesUnlocked: newBadges },
      update: { badgesUnlocked: [...existing, ...newBadges] },
    });
  }
  const allBadges = [...existing, ...newBadges];

  const titlesUnlocked = profile?.titlesUnlocked ?? [];
  const atitles = allAvailableTitles(level, titlesUnlocked);

  const currentTitle = (() => {
    const ct = profile?.currentTitle;
    if (ct && atitles.includes(ct)) return ct;
    return ltitle;
  })();

  const badgesForResponse = BADGES.map(b => ({
    key:         b.key,
    icon:        b.icon,
    name:        b.name,
    description: b.description,
    unlocked:    allBadges.includes(b.key),
    progress:    b.progress ? (b.progress(stats) ?? null) : null,
  }));

  return {
    level,
    xp,
    xpIntoLevel,
    xpForNextLevel,
    xpProgressPct:       pct,
    levelTitle:          ltitle,
    currentTitle,
    titlesUnlocked,
    allTitles:           atitles,
    badgesUnlocked:      allBadges,
    firstRecoveryDate:   profile?.firstRecoveryDate?.toISOString() ?? null,
    lastActiveDate:      profile?.lastActiveDate?.toISOString() ?? null,
    selectedCharacterId:   profile?.selectedCharacterId ?? null,
    selectedCharacterName: profile?.selectedCharacterName ?? null,
    stats,
    badges:              badgesForResponse,
    recentActivity:      activity.map(a => ({ ...a, date: a.date.toISOString() })),
  };
}

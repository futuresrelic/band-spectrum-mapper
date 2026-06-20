/**
 * Setlist Intelligence Service — Phase V: Real World Intelligence
 *
 * Fetches live performance data from Setlist.fm and computes per-song
 * live profiles (liveStatus, liveValue, rarityIndex, etc.).
 *
 * Data is cached aggressively in the DB. Gameplay never depends on live API calls.
 * All computations run from the cached DB data once fetched.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SETLIST_BASE  = 'https://api.setlist.fm/rest/1.0';
const RATE_LIMIT_MS = 600;   // ms between Setlist.fm API pages
const MAX_PAGES     = 75;    // cap per fetch call (~1500 shows)

// ── Setlist.fm API types ──────────────────────────────────────────────────────

interface SlArtist {
  mbid: string;
  name: string;
  sortName: string;
}

interface SlSong {
  name: string;
  tape?: boolean; // true = recorded/background track, not performed
}

interface SlSet {
  name?: string;
  encore?: number;
  song: SlSong[];
}

interface SlSetlist {
  id: string;
  eventDate: string; // "DD-MM-YYYY"
  sets: { set: SlSet[] };
}

interface SlArtistSearchResponse {
  artist: SlArtist[];
  total: number;
  itemsPerPage: number;
}

interface SlSetlistResponse {
  setlist: SlSetlist[];
  total: number;
  itemsPerPage: number;
  page: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function apiKey(): string {
  const k = process.env['SETLISTFM_API_KEY'];
  if (!k) throw new Error('SETLISTFM_API_KEY not configured');
  return k;
}

async function slFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${SETLIST_BASE}${path}`, {
    headers: { 'x-api-key': apiKey(), 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`setlist.fm ${res.status}: ${body}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parse Setlist.fm date format "DD-MM-YYYY" → Date */
function parseSlDate(dateStr: string): Date | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Normalize a song title for fuzzy matching against our DB */
function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')    // strip (parenthetical)
    .replace(/\s*\[[^\]]*\]/g, '')   // strip [bracketed]
    .replace(/[^\w\s]/g, ' ')        // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Core live-profile formulas ────────────────────────────────────────────────

export function computeLiveStatus(totalPerformances: number, pct: number): string {
  if (totalPerformances === 0) return 'Never Played';
  if (pct >= 50) return 'Staple';
  if (pct >= 20) return 'Common';
  if (pct >= 5)  return 'Occasional';
  if (pct >= 1)  return 'Rare';
  return 'Extremely Rare';
}

export function computeRarityIndex(totalPerformances: number, pct: number): number {
  if (totalPerformances === 0) return 100;
  return Math.max(0, Math.min(100, Math.round(100 - pct)));
}

export function computeLiveValue(liveStatus: string, yearsSincePlayed: number | null): number {
  const absence     = yearsSincePlayed ?? 0;
  const absenceBonus = Math.round(Math.min(absence / 10, 1) * 15);
  switch (liveStatus) {
    case 'Never Played':   return 90;
    case 'Extremely Rare': return Math.min(80 + absenceBonus, 100);
    case 'Rare':           return Math.min(65 + absenceBonus, 95);
    case 'Occasional':     return Math.min(45 + absenceBonus, 80);
    case 'Common':         return Math.min(30 + absenceBonus, 60);
    case 'Staple':         return 25;
    default:               return 50;
  }
}

/** Live value modifier for discovery bonus calculation (used in score system) */
export function liveValueDiscoveryBonus(liveValue: number): number {
  // Extra points for recovering high-live-value songs (beyond base score)
  if (liveValue >= 85) return 50;
  if (liveValue >= 70) return 30;
  if (liveValue >= 55) return 15;
  if (liveValue >= 40) return 5;
  return 0;
}

// ── Concert / Festival realism ────────────────────────────────────────────────

export interface RealismResult {
  realismScore: number;
  realismLabel: string;
}

export function computeConcertRealism(
  songStatuses: string[],
): RealismResult | null {
  if (songStatuses.length === 0) return null;
  const known = songStatuses.filter((s) => s !== 'Unknown');
  if (known.length < songStatuses.length * 0.3) return null; // <30% coverage

  const neverPlayed    = known.filter((s) => s === 'Never Played').length;
  const extremelyRare  = known.filter((s) => s === 'Extremely Rare').length;
  const rare           = known.filter((s) => s === 'Rare').length;

  const score = Math.max(0, Math.min(100,
    85
    - neverPlayed   * 30
    - Math.max(0, extremelyRare - 1) * 15
    - Math.max(0, rare           - 3) * 5,
  ));

  return { realismScore: score, realismLabel: realismLabel(score) };
}

export function computeFestivalRealism(
  allSongStatuses: string[],
): RealismResult | null {
  if (allSongStatuses.length === 0) return null;
  const known = allSongStatuses.filter((s) => s !== 'Unknown');
  if (known.length < allSongStatuses.length * 0.3) return null;

  const neverPlayed   = known.filter((s) => s === 'Never Played').length;
  const extremelyRare = known.filter((s) => s === 'Extremely Rare').length;

  const score = Math.max(0, Math.min(100,
    80
    - neverPlayed   * 20
    - Math.max(0, extremelyRare - 3) * 8,
  ));

  return { realismScore: score, realismLabel: realismLabel(score) };
}

function realismLabel(score: number): string {
  if (score >= 85) return 'True to Life';
  if (score >= 70) return 'Realistic';
  if (score >= 55) return 'Plausible';
  if (score >= 35) return 'Ambitious';
  if (score >= 15) return 'Fan Fiction';
  return 'Dream Only';
}

// ── Festival Historical Highlights ────────────────────────────────────────────

export interface SongHistoricalSummary {
  liveStatus: string;
  yearsSincePlayed: number | null;
  firstPerformanceDate: Date | null;
}

export function computeHistoricalHighlights(songs: SongHistoricalSummary[]): string[] {
  const known = songs.filter((s) => s.liveStatus !== 'Unknown');
  if (known.length === 0) return [];

  const highlights: string[] = [];

  const neverPlayed   = known.filter((s) => s.liveStatus === 'Never Played').length;
  const absent20plus  = known.filter((s) => (s.yearsSincePlayed ?? 0) >= 20).length;
  const absent10plus  = known.filter((s) => (s.yearsSincePlayed ?? 0) >= 10 && (s.yearsSincePlayed ?? 0) < 20).length;
  const extremelyRare = known.filter((s) => s.liveStatus === 'Extremely Rare').length;

  const firstYears = known
    .filter((s) => s.firstPerformanceDate !== null)
    .map((s) => s.firstPerformanceDate!.getFullYear());
  const oldestYear = firstYears.length > 0 ? Math.min(...firstYears) : null;
  const spanYears  = oldestYear ? new Date().getFullYear() - oldestYear : null;

  if (neverPlayed === 1)  highlights.push('Contains one world premiere — a song never before performed live.');
  if (neverPlayed > 1)    highlights.push(`Contains ${neverPlayed} world premieres — songs never before performed live.`);
  if (absent20plus === 1) highlights.push('Features one song not heard live in over two decades.');
  if (absent20plus > 1)   highlights.push(`Features ${absent20plus} songs not performed in over 20 years.`);
  if (absent10plus > 0)   highlights.push(`Includes ${absent10plus} song${absent10plus > 1 ? 's' : ''} not performed in a decade or more.`);
  if (extremelyRare >= 3) highlights.push(`Features ${extremelyRare} extremely rare deep cuts.`);
  if (spanYears && spanYears >= 25) highlights.push(`Draws from over ${spanYears} years of live musical history.`);

  return highlights;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function searchArtistOnSetlistFm(
  artistName: string,
): Promise<SlArtist[]> {
  const data = await slFetch<SlArtistSearchResponse>(
    `/search/artists?artistName=${encodeURIComponent(artistName)}&p=1&sort=relevance`,
  );
  return data.artist ?? [];
}

export async function storeBandArtistMatch(
  bandId: string,
  mbid: string,
  name: string,
): Promise<void> {
  await prisma.bandLiveDataCache.upsert({
    where:  { bandId },
    create: { bandId, setlistFmMbid: mbid, setlistFmName: name, fetchStatus: 'never' },
    update: { setlistFmMbid: mbid, setlistFmName: name, fetchStatus: 'never', errorMessage: null, fetchedShows: 0, totalShows: 0 },
  });
}

export interface FetchResult {
  totalShows: number;
  processedShows: number;
  updatedSongs: number;
  error?: string;
}

/**
 * Main entry point. Fetches all setlist.fm data for a band and computes
 * live profiles for every song. Capped at MAX_PAGES per call.
 * Re-running is safe: will re-fetch from the beginning and recompute.
 */
export async function fetchBandLiveData(bandId: string): Promise<FetchResult> {
  const cache = await prisma.bandLiveDataCache.findUnique({ where: { bandId } });
  if (!cache?.setlistFmMbid) {
    throw new Error('No Setlist.fm artist ID stored for this band. Use "Find on Setlist.fm" first.');
  }

  const mbid = cache.setlistFmMbid;

  // Mark as in-progress
  await prisma.bandLiveDataCache.update({
    where: { bandId },
    data:  { fetchStatus: 'in_progress', errorMessage: null },
  });

  // --- Load DB songs for this band ---
  const dbSongs = await prisma.song.findMany({
    where:  { bandId },
    select: { id: true, title: true },
  });

  // Build normalized title → songId map (multiple titles may collapse to same norm)
  const titleMap = new Map<string, string>();
  for (const s of dbSongs) {
    const norm = normTitle(s.title);
    if (norm && !titleMap.has(norm)) titleMap.set(norm, s.id);
  }

  // --- Fetch setlists page by page ---
  const appearances  = new Map<string, number>();   // songId → count
  const yearSets     = new Map<string, Set<number>>(); // songId → years
  const firstDates   = new Map<string, Date>();     // songId → earliest date
  const lastDates    = new Map<string, Date>();     // songId → latest date
  let totalShows     = 0;
  let processedShows = 0;

  try {
    // Fetch first page to get total
    const firstPage = await slFetch<SlSetlistResponse>(`/artist/${mbid}/setlists?p=1`);
    totalShows = firstPage.total;
    const pages = Math.min(Math.ceil(totalShows / (firstPage.itemsPerPage || 20)), MAX_PAGES);

    // Update total in cache
    await prisma.bandLiveDataCache.update({
      where: { bandId },
      data:  { totalShows },
    });

    // Process first page
    processedShows += processSetlistPage(firstPage.setlist, titleMap, appearances, yearSets, firstDates, lastDates);

    // Fetch remaining pages
    for (let p = 2; p <= pages; p++) {
      await delay(RATE_LIMIT_MS);
      const page = await slFetch<SlSetlistResponse>(`/artist/${mbid}/setlists?p=${p}`);
      processedShows += processSetlistPage(page.setlist, titleMap, appearances, yearSets, firstDates, lastDates);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.bandLiveDataCache.update({
      where: { bandId },
      data:  { fetchStatus: 'failed', errorMessage: msg, fetchedShows: processedShows },
    });
    return { totalShows, processedShows, updatedSongs: 0, error: msg };
  }

  // --- Compute + upsert song profiles ---
  const effectiveTotalShows = processedShows > 0 ? processedShows : Math.max(totalShows, 1);
  const now      = new Date();
  const yearNow  = now.getFullYear();
  let updatedSongs = 0;

  for (const dbSong of dbSongs) {
    const count        = appearances.get(dbSong.id) ?? 0;
    const pct          = Math.round((count / effectiveTotalShows) * 1000) / 10; // 1 decimal
    const liveStatus   = computeLiveStatus(count, pct);
    const rarityIndex  = computeRarityIndex(count, pct);
    const lastDate     = lastDates.get(dbSong.id) ?? null;
    const firstDate    = firstDates.get(dbSong.id) ?? null;
    const yearsSince   = lastDate ? parseFloat(((yearNow - lastDate.getFullYear()) + ((now.getMonth() - lastDate.getMonth()) / 12)).toFixed(1)) : null;
    const distinctYrs  = yearSets.get(dbSong.id)?.size ?? 0;
    const liveValue    = computeLiveValue(liveStatus, yearsSince);

    await prisma.bandRpgSongProfile.upsert({
      where:  { songId: dbSong.id },
      create: {
        songId:               dbSong.id,
        totalPerformances:    count,
        performancePct:       pct,
        ...(firstDate ? { firstPerformanceDate: firstDate } : {}),
        ...(lastDate  ? { lastPerformanceDate:  lastDate  } : {}),
        ...(yearsSince !== null ? { yearsSincePlayed: yearsSince } : {}),
        distinctYears:        distinctYrs,
        rarityIndex,
        liveStatus,
        liveValue,
        lastLiveDataFetchedAt: now,
      },
      update: {
        totalPerformances:    count,
        performancePct:       pct,
        ...(firstDate ? { firstPerformanceDate: firstDate } : {}),
        ...(lastDate  ? { lastPerformanceDate:  lastDate  } : {}),
        ...(yearsSince !== null ? { yearsSincePlayed: yearsSince } : {}),
        distinctYears:        distinctYrs,
        rarityIndex,
        liveStatus,
        liveValue,
        lastLiveDataFetchedAt: now,
      },
    });
    updatedSongs++;
  }

  // --- Mark complete ---
  await prisma.bandLiveDataCache.update({
    where: { bandId },
    data:  { fetchStatus: 'complete', fetchedShows: processedShows, lastFetchedAt: now },
  });

  return { totalShows, processedShows, updatedSongs };
}

/** Process one page of setlists into the accumulation maps. Returns show count. */
function processSetlistPage(
  setlists: SlSetlist[],
  titleMap: Map<string, string>,
  appearances:  Map<string, number>,
  yearSets:     Map<string, Set<number>>,
  firstDates:   Map<string, Date>,
  lastDates:    Map<string, Date>,
): number {
  for (const sl of setlists) {
    const showDate = parseSlDate(sl.eventDate);
    const showYear = showDate?.getFullYear();

    for (const set of sl.sets.set) {
      for (const song of set.song) {
        if (song.tape) continue; // skip recorded/background tracks
        const norm   = normTitle(song.name);
        const songId = titleMap.get(norm);
        if (!songId) continue;

        appearances.set(songId, (appearances.get(songId) ?? 0) + 1);

        if (showYear) {
          if (!yearSets.has(songId)) yearSets.set(songId, new Set());
          yearSets.get(songId)!.add(showYear);
        }

        if (showDate) {
          const existing = firstDates.get(songId);
          if (!existing || showDate < existing) firstDates.set(songId, showDate);
          const existingLast = lastDates.get(songId);
          if (!existingLast || showDate > existingLast) lastDates.set(songId, showDate);
        }
      }
    }
  }
  return setlists.length;
}

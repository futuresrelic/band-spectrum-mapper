/**
 * Setlist Intelligence Service — Phase V: Real World Intelligence
 *
 * Fetches live performance data from Setlist.fm and computes per-song
 * live profiles (liveStatus, liveValue, rarityIndex, etc.).
 *
 * Data is cached aggressively in the DB. Gameplay never depends on live API calls.
 * All computations run from the cached DB data once fetched.
 *
 * Raw setlist appearances are stored in BandRpgRawSetlistEntry so that admins
 * can fix song matching (via aliases) and re-run analysis locally without calling
 * the Setlist.fm API again.
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

// ── Raw entry accumulated during a fetch pass ─────────────────────────────────

interface RawEntry {
  setlistFmId:    string;
  eventDate:      string;
  setlistFmTitle: string;
  isTape:         boolean;
  matchedSongId:  string | null;
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

/**
 * Normalize a song title for matching against our DB.
 * Handles common Setlist.fm vs BSM title mismatches:
 * - "Cold & Ugly" ↔ "Cold and Ugly"
 * - "Cold + Ugly" ↔ "Cold and Ugly"
 * - Parenthetical / bracketed suffixes stripped
 * - Punctuation collapsed to spaces
 */
export function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')    // strip (parenthetical)
    .replace(/\s*\[[^\]]*\]/g, '')   // strip [bracketed]
    .replace(/&/g, ' and ')          // & → and  (must be before punctuation strip)
    .replace(/\+/g, ' and ')         // + → and
    .replace(/[^\w\s]/g, ' ')        // remaining punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple token-based Jaccard similarity for fuzzy matching suggestions.
 * Returns 0–1; 1 = identical token sets.
 */
export function tokenSimilarity(a: string, b: string): number {
  const tokA = new Set(a.split(' ').filter((w) => w.length > 1));
  const tokB = new Set(b.split(' ').filter((w) => w.length > 1));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let inter = 0;
  for (const w of tokA) { if (tokB.has(w)) inter++; }
  const union = new Set([...tokA, ...tokB]).size;
  return inter / union;
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
  const absence      = yearsSincePlayed ?? 0;
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
  if (known.length < songStatuses.length * 0.3) return null;

  const neverPlayed   = known.filter((s) => s === 'Never Played').length;
  const extremelyRare = known.filter((s) => s === 'Extremely Rare').length;
  const rare          = known.filter((s) => s === 'Rare').length;

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

/**
 * Link a band to a Setlist.fm artist MBID.
 * If the MBID changes, the existing fetch state is cleared so stale data
 * isn't attributed to the wrong artist.
 * If the MBID is the same (re-confirming the link), fetch state is preserved.
 */
export async function storeBandArtistMatch(
  bandId: string,
  mbid: string,
  name: string,
): Promise<void> {
  const existing = await prisma.bandLiveDataCache.findUnique({ where: { bandId } });
  const mbidChanged = existing ? existing.setlistFmMbid !== mbid : false;

  await prisma.bandLiveDataCache.upsert({
    where:  { bandId },
    create: { bandId, setlistFmMbid: mbid, setlistFmName: name, fetchStatus: 'never' },
    update: {
      setlistFmMbid: mbid,
      setlistFmName: name,
      // Only reset fetch state when linking to a DIFFERENT artist
      ...(mbidChanged ? {
        fetchStatus:   'never',
        errorMessage:  null,
        fetchedShows:  0,
        totalShows:    0,
        lastFetchedAt: null,
      } : {}),
    },
  });

  // If MBID changed, delete stale raw entries (they belonged to the old artist)
  if (mbidChanged) {
    await prisma.bandRpgRawSetlistEntry.deleteMany({ where: { bandId } });
  }
}

export interface FetchResult {
  totalShows:     number;
  processedShows: number;
  updatedSongs:   number;
  error?:         string;
}

/**
 * Main entry point. Fetches all setlist.fm data for a band and computes
 * live profiles for every song. Capped at MAX_PAGES per call.
 *
 * Raw setlist appearances are stored in BandRpgRawSetlistEntry so that
 * re-analysis can be done locally after fixing song aliases.
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

  // Load DB songs for this band
  const dbSongs = await prisma.song.findMany({
    where:  { bandId },
    select: { id: true, title: true },
  });

  // Build normalized title → songId map
  const titleMap = new Map<string, string>();
  for (const s of dbSongs) {
    const norm = normTitle(s.title);
    if (norm && !titleMap.has(norm)) titleMap.set(norm, s.id);
  }

  // Load admin-defined aliases for this band
  const aliasRows = await prisma.bandRpgSongAlias.findMany({
    where:  { bandId },
    select: { setlistFmTitle: true, songId: true },
  });
  const aliasMap = new Map<string, string | null>();
  for (const a of aliasRows) {
    aliasMap.set(normTitle(a.setlistFmTitle), a.songId ?? null);
  }

  // Clear stale raw entries — will be rebuilt this pass
  await prisma.bandRpgRawSetlistEntry.deleteMany({ where: { bandId } });

  // Fetch setlists page by page
  const appearances  = new Map<string, number>();
  const yearSets     = new Map<string, Set<number>>();
  const firstDates   = new Map<string, Date>();
  const lastDates    = new Map<string, Date>();
  const rawEntries:  RawEntry[] = [];
  let totalShows     = 0;
  let processedShows = 0;

  try {
    const firstPage = await slFetch<SlSetlistResponse>(`/artist/${mbid}/setlists?p=1`);
    totalShows = firstPage.total;
    const pages = Math.min(Math.ceil(totalShows / (firstPage.itemsPerPage || 20)), MAX_PAGES);

    await prisma.bandLiveDataCache.update({
      where: { bandId },
      data:  { totalShows },
    });

    processedShows += processSetlistPage(
      firstPage.setlist, titleMap, aliasMap,
      appearances, yearSets, firstDates, lastDates, rawEntries,
    );

    for (let p = 2; p <= pages; p++) {
      await delay(RATE_LIMIT_MS);
      const page = await slFetch<SlSetlistResponse>(`/artist/${mbid}/setlists?p=${p}`);
      processedShows += processSetlistPage(
        page.setlist, titleMap, aliasMap,
        appearances, yearSets, firstDates, lastDates, rawEntries,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.bandLiveDataCache.update({
      where: { bandId },
      data:  { fetchStatus: 'failed', errorMessage: msg, fetchedShows: processedShows },
    });
    // Persist partial raw entries even on failure — useful for audit
    await bulkInsertRawEntries(bandId, rawEntries);
    return { totalShows, processedShows, updatedSongs: 0, error: msg };
  }

  // Persist raw entries
  await bulkInsertRawEntries(bandId, rawEntries);

  // Compute + upsert song profiles
  await upsertSongProfiles(dbSongs, appearances, yearSets, firstDates, lastDates, processedShows);

  // Mark complete
  const now = new Date();
  await prisma.bandLiveDataCache.update({
    where: { bandId },
    data:  { fetchStatus: 'complete', fetchedShows: processedShows, lastFetchedAt: now },
  });

  return { totalShows, processedShows, updatedSongs: dbSongs.length };
}

/**
 * Re-analyze live data using already-fetched raw setlist entries.
 * Applies current song titles and aliases without calling Setlist.fm.
 * Returns updated song count.
 */
export async function reanalyzeLiveData(
  bandId: string,
): Promise<{ updatedSongs: number; rawEntries: number }> {
  // Load current aliases
  const aliasRows = await prisma.bandRpgSongAlias.findMany({
    where:  { bandId },
    select: { setlistFmTitle: true, songId: true },
  });
  const aliasMap = new Map<string, string | null>();
  for (const a of aliasRows) {
    aliasMap.set(normTitle(a.setlistFmTitle), a.songId ?? null);
  }

  // Load DB songs
  const dbSongs = await prisma.song.findMany({
    where:  { bandId },
    select: { id: true, title: true },
  });
  const titleMap = new Map<string, string>();
  for (const s of dbSongs) {
    const norm = normTitle(s.title);
    if (norm && !titleMap.has(norm)) titleMap.set(norm, s.id);
  }

  // Load raw entries (non-tape only)
  const rawRows = await prisma.bandRpgRawSetlistEntry.findMany({
    where:  { bandId, isTape: false },
    select: { setlistFmId: true, eventDate: true, setlistFmTitle: true },
  });

  if (rawRows.length === 0) {
    return { updatedSongs: 0, rawEntries: 0 };
  }

  // Recompute appearances using current titleMap + aliasMap
  const appearances = new Map<string, number>();
  const yearSets    = new Map<string, Set<number>>();
  const firstDates  = new Map<string, Date>();
  const lastDates   = new Map<string, Date>();

  // Count unique shows for denominator
  const uniqueSetlistIds = new Set<string>();

  for (const entry of rawRows) {
    uniqueSetlistIds.add(entry.setlistFmId);
    const norm = normTitle(entry.setlistFmTitle);

    let songId: string | null | undefined;
    if (aliasMap.has(norm)) {
      songId = aliasMap.get(norm); // null = ignore
    } else {
      songId = titleMap.get(norm) ?? undefined;
    }
    if (!songId) continue;

    appearances.set(songId, (appearances.get(songId) ?? 0) + 1);

    const showDate = parseSlDate(entry.eventDate);
    const showYear = showDate?.getFullYear();
    if (showYear) {
      if (!yearSets.has(songId)) yearSets.set(songId, new Set());
      yearSets.get(songId)!.add(showYear);
    }
    if (showDate) {
      const ef = firstDates.get(songId);
      if (!ef || showDate < ef) firstDates.set(songId, showDate);
      const el = lastDates.get(songId);
      if (!el || showDate > el) lastDates.set(songId, showDate);
    }
  }

  const totalShows = Math.max(uniqueSetlistIds.size, 1);
  await upsertSongProfiles(dbSongs, appearances, yearSets, firstDates, lastDates, totalShows);

  // Update matchedSongId in raw entries to reflect current alias resolution
  // (do this in background batches; not critical path)
  for (const entry of rawRows) {
    const norm = normTitle(entry.setlistFmTitle);
    let songId: string | null | undefined;
    if (aliasMap.has(norm)) {
      songId = aliasMap.get(norm);
    } else {
      songId = titleMap.get(norm) ?? undefined;
    }
    const resolvedId = songId ?? null;
    // Only update if changed
    if (resolvedId !== undefined) {
      await prisma.bandRpgRawSetlistEntry.updateMany({
        where: { bandId, setlistFmTitle: entry.setlistFmTitle },
        data:  { matchedSongId: resolvedId },
      });
    }
  }

  return { updatedSongs: dbSongs.length, rawEntries: rawRows.length };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function bulkInsertRawEntries(bandId: string, entries: RawEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const BATCH = 500;
  for (let i = 0; i < entries.length; i += BATCH) {
    await prisma.bandRpgRawSetlistEntry.createMany({
      data: entries.slice(i, i + BATCH).map((e) => ({ bandId, ...e })),
    });
  }
}

async function upsertSongProfiles(
  dbSongs:     Array<{ id: string; title: string }>,
  appearances: Map<string, number>,
  yearSets:    Map<string, Set<number>>,
  firstDates:  Map<string, Date>,
  lastDates:   Map<string, Date>,
  totalShows:  number,
): Promise<void> {
  const now      = new Date();
  const yearNow  = now.getFullYear();
  const effective = Math.max(totalShows, 1);

  for (const dbSong of dbSongs) {
    const count       = appearances.get(dbSong.id) ?? 0;
    const pct         = Math.round((count / effective) * 1000) / 10;
    const liveStatus  = computeLiveStatus(count, pct);
    const rarityIndex = computeRarityIndex(count, pct);
    const lastDate    = lastDates.get(dbSong.id)  ?? null;
    const firstDate   = firstDates.get(dbSong.id) ?? null;
    const yearsSince  = lastDate
      ? parseFloat(((yearNow - lastDate.getFullYear()) + ((now.getMonth() - lastDate.getMonth()) / 12)).toFixed(1))
      : null;
    const distinctYrs = yearSets.get(dbSong.id)?.size ?? 0;
    const liveValue   = computeLiveValue(liveStatus, yearsSince);

    await prisma.bandRpgSongProfile.upsert({
      where:  { songId: dbSong.id },
      create: {
        songId:               dbSong.id,
        totalPerformances:    count,
        performancePct:       pct,
        ...(firstDate   ? { firstPerformanceDate: firstDate } : {}),
        ...(lastDate    ? { lastPerformanceDate:  lastDate  } : {}),
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
        ...(firstDate   ? { firstPerformanceDate: firstDate } : {}),
        ...(lastDate    ? { lastPerformanceDate:  lastDate  } : {}),
        ...(yearsSince !== null ? { yearsSincePlayed: yearsSince } : {}),
        distinctYears:        distinctYrs,
        rarityIndex,
        liveStatus,
        liveValue,
        lastLiveDataFetchedAt: now,
      },
    });
  }
}

/** Process one page of setlists into accumulation maps. Returns show count. */
function processSetlistPage(
  setlists:    SlSetlist[],
  titleMap:    Map<string, string>,
  aliasMap:    Map<string, string | null>,
  appearances: Map<string, number>,
  yearSets:    Map<string, Set<number>>,
  firstDates:  Map<string, Date>,
  lastDates:   Map<string, Date>,
  rawEntries:  RawEntry[],
): number {
  for (const sl of setlists) {
    const showDate = parseSlDate(sl.eventDate);
    const showYear = showDate?.getFullYear();

    for (const set of sl.sets.set) {
      for (const song of set.song) {
        const norm = normTitle(song.name);

        // Alias map takes precedence over auto-matching
        let songId: string | null | undefined;
        if (aliasMap.has(norm)) {
          songId = aliasMap.get(norm); // null = explicitly ignored
        } else {
          songId = titleMap.get(norm) ?? undefined;
        }

        // Record raw entry for every non-tape appearance (matched or not)
        if (!song.tape) {
          rawEntries.push({
            setlistFmId:    sl.id,
            eventDate:      sl.eventDate,
            setlistFmTitle: song.name,
            isTape:         false,
            matchedSongId:  songId ?? null,
          });
        }

        // Update appearance counts only for matched songs
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

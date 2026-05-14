// Module-level batch job state — persists for the server process lifetime.
// One job runs at a time; results queue for admin approval before saving.
import { prisma } from '../lib/prisma.js';

export type BatchItemStatus = 'found' | 'approved' | 'rejected';

export interface BatchItem {
  id: string;
  songId: string;
  songTitle: string;
  bandName: string;
  albumTitle: string | null;
  text: string;
  source: string;
  status: BatchItemStatus;
  foundAt: string;
}

export interface BatchJobState {
  status: 'idle' | 'running' | 'done' | 'error';
  startedAt: string | null;
  finishedAt: string | null;
  totalSongs: number;
  processedSongs: number;
  foundCount: number;
  notFoundCount: number;
  skippedInstrumentalCount: number;
  currentSong: string | null;
  items: BatchItem[];
  error: string | null;
  processedSongIds: string[];
  notFoundSongIds: string[];
}

const state: BatchJobState = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  totalSongs: 0,
  processedSongs: 0,
  foundCount: 0,
  notFoundCount: 0,
  skippedInstrumentalCount: 0,
  currentSong: null,
  items: [],
  error: null,
  processedSongIds: [],
  notFoundSongIds: [],
};

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function fetchLyrics(artist: string, title: string): Promise<{ text: string; source: string } | null> {
  // Source 1: Lyrics.ovh
  try {
    const r = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (r.ok) {
      const d = await r.json() as { lyrics?: string };
      if (d.lyrics?.trim()) return { text: d.lyrics.trim(), source: 'lyrics.ovh' };
    }
  } catch { /* try next source */ }

  // Source 2: lrclib.net — better indie/alternative coverage
  try {
    const r = await fetch(
      `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`,
      { signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': 'BandSpectrumMapper/1.0' } }
    );
    if (r.ok) {
      const hits = await r.json() as { plainLyrics?: string | null; syncedLyrics?: string | null }[];
      if (Array.isArray(hits) && hits.length > 0) {
        const hit = hits[0]!;
        const plain = hit.plainLyrics?.trim() ||
          hit.syncedLyrics?.replace(/^\[[\d:.]+\] ?/gm, '').trim();
        if (plain) return { text: plain, source: 'lrclib.net' };
      }
    }
  } catch { /* not found */ }

  return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Songs that were tried and not found within the last 30 days are skipped by default.
const NOT_FOUND_SKIP_DAYS = 30;

export async function startBatchJob(opts?: { resume?: boolean; forceAll?: boolean }): Promise<void> {
  if (state.status === 'running') return;

  const isResume = opts?.resume === true;
  const forceAll = opts?.forceAll === true;

  // On fresh start, reset everything. On resume, keep existing IDs and items.
  if (!isResume) {
    state.startedAt = new Date().toISOString();
    state.finishedAt = null;
    state.totalSongs = 0;
    state.processedSongs = 0;
    state.foundCount = 0;
    state.notFoundCount = 0;
    state.skippedInstrumentalCount = 0;
    state.currentSong = null;
    state.items = [];
    state.error = null;
    state.processedSongIds = [];
    state.notFoundSongIds = [];
  } else {
    // Resume: clear error, update start time
    state.startedAt = state.startedAt ?? new Date().toISOString();
    state.finishedAt = null;
    state.error = null;
  }

  state.status = 'running';

  try {
    const cutoff = forceAll ? null : new Date(Date.now() - NOT_FOUND_SKIP_DAYS * 24 * 60 * 60 * 1000);

    const songs = await prisma.song.findMany({
      where: {
        lyrics: { none: {} },
        isInstrumental: false,
        ...(cutoff ? {
          OR: [
            { noLyricsAt: null },
            { noLyricsAt: { lt: cutoff } },
          ],
        } : {}),
      },
      select: {
        id: true,
        title: true,
        band: { select: { name: true } },
        album: { select: { title: true } },
      },
      orderBy: [{ band: { name: 'asc' } }, { title: 'asc' }],
    });

    // Filter out already-processed IDs when resuming
    const skipIds = new Set(state.processedSongIds);
    const toProcess = isResume ? songs.filter((s) => !skipIds.has(s.id)) : songs;

    state.totalSongs = (isResume ? state.processedSongs : 0) + toProcess.length;

    for (const song of toProcess) {
      if (state.status !== 'running') break;

      state.currentSong = `${song.band.name} — ${song.title}`;
      const result = await fetchLyrics(song.band.name, song.title);
      state.processedSongs++;
      state.processedSongIds.push(song.id);

      if (result) {
        state.foundCount++;
        state.items.push({
          id: makeId(),
          songId: song.id,
          songTitle: song.title,
          bandName: song.band.name,
          albumTitle: song.album?.title ?? null,
          text: result.text,
          source: result.source,
          status: 'found',
          foundAt: new Date().toISOString(),
        });
      } else {
        state.notFoundCount++;
        state.notFoundSongIds.push(song.id);
        // Mark song so future batches skip it by default
        await prisma.song.update({
          where: { id: song.id },
          data: { noLyricsAt: new Date() },
        }).catch(() => { /* non-fatal */ });
      }

      await sleep(300);
    }

    state.status = 'done';
    state.currentSong = null;
    state.finishedAt = new Date().toISOString();
  } catch (err) {
    state.status = 'error';
    state.error = err instanceof Error ? err.message : String(err);
    state.finishedAt = new Date().toISOString();
  }
}

export function getJobState(): BatchJobState {
  return { ...state, items: state.items.slice(), processedSongIds: state.processedSongIds.slice(), notFoundSongIds: state.notFoundSongIds.slice() };
}

export function stopJob(): void {
  if (state.status === 'running') {
    state.status = 'done';
    state.currentSong = null;
    state.finishedAt = new Date().toISOString();
  }
}

export function approveItem(itemId: string): BatchItem | null {
  const item = state.items.find((i) => i.id === itemId && i.status === 'found');
  if (item) { item.status = 'approved'; return item; }
  return null;
}

export function rejectItem(itemId: string): void {
  const item = state.items.find((i) => i.id === itemId);
  if (item) item.status = 'rejected';
}

export function clearJob(): void {
  Object.assign(state, {
    status: 'idle', startedAt: null, finishedAt: null,
    totalSongs: 0, processedSongs: 0, foundCount: 0, notFoundCount: 0,
    skippedInstrumentalCount: 0,
    currentSong: null, items: [], error: null,
    processedSongIds: [], notFoundSongIds: [],
  });
}

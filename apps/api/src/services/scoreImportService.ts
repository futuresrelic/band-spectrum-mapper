import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

interface AxisFields {
  Aggression?: number; aggression?: number;
  Complexity?: number; complexity?: number;
  Atmosphere?: number; atmosphere?: number;
  Emotion?: number;   emotion?: number;
  Psychedelic?: number; psychedelic?: number;
  Concept?: number;   concept?: number;
}

interface FlatScoreRow extends AxisFields {
  song?: string;
  song_title?: string;
  albumTitle?: string;
  album_title?: string;
}

interface NestedTrack extends AxisFields {
  song_title?: string;
  song?: string;
  track_number?: number;
}

interface NestedAlbum {
  album_title?: string;
  year?: number;
  tracks?: unknown[];
}

interface NestedDiscography {
  artist?: string;
  albums?: unknown[];
}

export interface ScoreImportResult {
  total: number;
  matched: number;
  notFound: string[];
  updated: string[];
}

// Normalised work item — album context is optional but used for precise matching
interface WorkItem {
  songTitle: string;
  albumTitle: string | undefined;
  axes: AxisFields;
  label: string; // display label for notFound/updated
}

function coerceAxis(value: unknown): number {
  const n = Number(value);
  if (isNaN(n)) return 0;
  return Math.min(10, Math.max(0, n));
}

function extractAxes(row: AxisFields) {
  return {
    aggression: coerceAxis(row.Aggression ?? row.aggression ?? 0),
    complexity: coerceAxis(row.Complexity ?? row.complexity ?? 0),
    atmosphere: coerceAxis(row.Atmosphere ?? row.atmosphere ?? 0),
    emotion: coerceAxis(row.Emotion ?? row.emotion ?? 0),
    psychedelic: coerceAxis(row.Psychedelic ?? row.psychedelic ?? 0),
    concept: coerceAxis(row.Concept ?? row.concept ?? 0),
  };
}

function flattenInput(raw: unknown): WorkItem[] {
  // Nested discography object: { artist, albums: [{ album_title, tracks: [...] }] }
  if (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    'albums' in (raw as NestedDiscography)
  ) {
    const disc = raw as NestedDiscography;
    const items: WorkItem[] = [];
    for (const rawAlbum of disc.albums ?? []) {
      if (typeof rawAlbum !== 'object' || rawAlbum === null) continue;
      const album = rawAlbum as NestedAlbum;
      const albumTitle = typeof album.album_title === 'string' ? album.album_title.trim() : undefined;
      for (const rawTrack of album.tracks ?? []) {
        if (typeof rawTrack !== 'object' || rawTrack === null) continue;
        const track = rawTrack as NestedTrack;
        const songTitle = (track.song_title ?? track.song ?? '').trim();
        if (!songTitle) continue;
        const label = albumTitle ? `${albumTitle} / ${songTitle}` : songTitle;
        items.push({ songTitle, albumTitle, axes: track, label });
      }
    }
    return items;
  }

  // Flat array: [{ song | song_title, albumTitle?, ...axes }]
  if (Array.isArray(raw)) {
    const items: WorkItem[] = [];
    for (const rawRow of raw) {
      if (typeof rawRow !== 'object' || rawRow === null) continue;
      const row = rawRow as FlatScoreRow;
      const songTitle = (row.song ?? row.song_title ?? '').trim();
      if (!songTitle) continue;
      const albumTitle = (row.albumTitle ?? row.album_title ?? '').trim() || undefined;
      const label = albumTitle ? `${albumTitle} / ${songTitle}` : songTitle;
      items.push({ songTitle, albumTitle, axes: row, label });
    }
    return items;
  }

  return [];
}

export const scoreImportService = {
  async importScores(bandId: string, payload: unknown): Promise<ScoreImportResult> {
    const band = await prisma.band.findUnique({ where: { id: bandId } });
    if (!band) throw new HttpError(404, 'Band not found');

    const items = flattenInput(payload);

    const result: ScoreImportResult = {
      total: items.length,
      matched: 0,
      notFound: [],
      updated: [],
    };

    for (const item of items) {
      // Prefer album-scoped match when album title is provided
      let song = item.albumTitle
        ? await prisma.song.findFirst({
            where: {
              bandId,
              title: { equals: item.songTitle, mode: 'insensitive' },
              album: { title: { equals: item.albumTitle, mode: 'insensitive' } },
            },
          })
        : null;

      // Fall back to band-scoped title match
      if (!song) {
        song = await prisma.song.findFirst({
          where: {
            bandId,
            title: { equals: item.songTitle, mode: 'insensitive' },
          },
        });
      }

      if (!song) {
        result.notFound.push(item.label);
        continue;
      }

      const scores = extractAxes(item.axes);

      await prisma.songAxisScore.upsert({
        where: { songId: song.id },
        create: { songId: song.id, bandId, ...scores },
        update: scores,
      });

      result.matched++;
      result.updated.push(item.label);
    }

    return result;
  },
};

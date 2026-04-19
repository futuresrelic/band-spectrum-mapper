import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

interface ScoreRow {
  song: string;
  Aggression?: number;
  Complexity?: number;
  Atmosphere?: number;
  Emotion?: number;
  Psychedelic?: number;
  Concept?: number;
  // also accept lowercase variants
  aggression?: number;
  complexity?: number;
  atmosphere?: number;
  emotion?: number;
  psychedelic?: number;
  concept?: number;
}

export interface ScoreImportResult {
  total: number;
  matched: number;
  notFound: string[];
  updated: string[];
}

function coerceAxis(value: unknown): number {
  const n = Number(value);
  if (isNaN(n)) return 0;
  return Math.min(10, Math.max(0, n));
}

function extractScores(row: ScoreRow) {
  return {
    aggression: coerceAxis(row.Aggression ?? row.aggression ?? 0),
    complexity: coerceAxis(row.Complexity ?? row.complexity ?? 0),
    atmosphere: coerceAxis(row.Atmosphere ?? row.atmosphere ?? 0),
    emotion: coerceAxis(row.Emotion ?? row.emotion ?? 0),
    psychedelic: coerceAxis(row.Psychedelic ?? row.psychedelic ?? 0),
    concept: coerceAxis(row.Concept ?? row.concept ?? 0),
  };
}

export const scoreImportService = {
  async importScores(bandId: string, rows: unknown[]): Promise<ScoreImportResult> {
    const band = await prisma.band.findUnique({ where: { id: bandId } });
    if (!band) throw new HttpError(404, 'Band not found');

    const result: ScoreImportResult = {
      total: rows.length,
      matched: 0,
      notFound: [],
      updated: [],
    };

    for (const rawRow of rows) {
      if (typeof rawRow !== 'object' || rawRow === null) continue;
      const row = rawRow as ScoreRow;

      const songTitle = (row.song ?? '').trim();
      if (!songTitle) continue;

      // Case-insensitive match within this band
      const song = await prisma.song.findFirst({
        where: {
          bandId,
          title: { equals: songTitle, mode: 'insensitive' },
        },
      });

      if (!song) {
        result.notFound.push(songTitle);
        continue;
      }

      const scores = extractScores(row);

      await prisma.songAxisScore.upsert({
        where: { songId: song.id },
        create: { songId: song.id, bandId, ...scores },
        update: scores,
      });

      result.matched++;
      result.updated.push(song.title);
    }

    return result;
  },
};

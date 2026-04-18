import { prisma } from '../lib/prisma.js';
import { toSlug } from '@band-spectrum-mapper/shared';
import type { ImportSummary, ImportRowError } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

interface ParsedLyricRow {
  songTitle: string;
  lyrics: string;
  albumTitle?: string;
  bandId: string;
}

// ---------------------------------------------------------------------------
// Format parsers
// ---------------------------------------------------------------------------

function parseTxtOrMd(content: string, bandId: string, filename: string): ParsedLyricRow[] {
  // Whole file = one lyric record. Song title = filename without extension.
  const songTitle = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  return [{ songTitle, lyrics: content.trim(), bandId }];
}

function parseCsv(content: string, bandId: string): ParsedLyricRow[] {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const songIdx = header.indexOf('songtitle');
  const lyricsIdx = header.indexOf('lyrics');
  const albumIdx = header.indexOf('albumtitle');

  if (songIdx === -1 || lyricsIdx === -1) {
    throw new HttpError(400, 'CSV must have "songTitle" and "lyrics" columns');
  }

  return lines.slice(1).map((line) => {
    // Simple CSV parse — handles quoted fields containing commas
    const cols = parseCsvLine(line);
    return {
      songTitle: cols[songIdx] ?? '',
      lyrics: cols[lyricsIdx] ?? '',
      albumTitle: albumIdx !== -1 ? cols[albumIdx] : undefined,
      bandId,
    };
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseJson(content: string, bandId: string): ParsedLyricRow[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new HttpError(400, 'Invalid JSON file');
  }

  if (!Array.isArray(data)) throw new HttpError(400, 'JSON file must contain an array');

  return (data as unknown[]).map((item, i) => {
    if (typeof item !== 'object' || item === null) {
      throw new HttpError(400, `Row ${i + 1}: expected an object`);
    }
    const row = item as Record<string, unknown>;
    if (typeof row['songTitle'] !== 'string' || typeof row['lyrics'] !== 'string') {
      throw new HttpError(400, `Row ${i + 1}: requires "songTitle" and "lyrics" string fields`);
    }
    return {
      songTitle: row['songTitle'],
      lyrics: row['lyrics'],
      albumTitle: typeof row['albumTitle'] === 'string' ? row['albumTitle'] : undefined,
      bandId,
    };
  });
}

// ---------------------------------------------------------------------------
// Import processing
// ---------------------------------------------------------------------------

export const importService = {
  async list() {
    return prisma.import.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async processImport(params: {
    bandId: string;
    filename: string;
    mimeType: string;
    content: string;
  }) {
    const { bandId, filename, mimeType, content } = params;

    const band = await prisma.band.findUnique({ where: { id: bandId } });
    if (!band) throw new HttpError(404, 'Band not found');

    // Determine import type from filename extension
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const importType = ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : 'text';

    // Create import record
    const importRecord = await prisma.import.create({
      data: {
        importType,
        filename,
        mimeType,
        status: 'processing',
      },
    });

    const errors: ImportRowError[] = [];
    let successRows = 0;
    let rows: ParsedLyricRow[] = [];

    try {
      if (ext === 'csv') {
        rows = parseCsv(content, bandId);
      } else if (ext === 'json') {
        rows = parseJson(content, bandId);
      } else {
        rows = parseTxtOrMd(content, bandId, filename);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Parse error';
      await prisma.import.update({
        where: { id: importRecord.id },
        data: {
          status: 'failed',
          summary: { totalRows: 0, successRows: 0, failedRows: 1, errors: [{ row: 0, message }] },
        },
      });
      throw e;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        if (!row.songTitle.trim()) {
          errors.push({ row: i + 1, field: 'songTitle', message: 'Song title is required' });
          continue;
        }
        if (!row.lyrics.trim()) {
          errors.push({ row: i + 1, field: 'lyrics', message: 'Lyrics text is required' });
          continue;
        }

        // Find or create album if specified
        let albumId: string | null = null;
        if (row.albumTitle) {
          const albumSlug = toSlug(row.albumTitle);
          const album = await prisma.album.upsert({
            where: { bandId_slug: { bandId, slug: albumSlug } },
            update: {},
            create: { bandId, title: row.albumTitle, slug: albumSlug },
          });
          albumId = album.id;
        }

        // Find or create song
        const songSlug = toSlug(row.songTitle);
        const song = await prisma.song.upsert({
          where: { bandId_slug: { bandId, slug: songSlug } },
          update: {},
          create: { bandId, albumId, title: row.songTitle, slug: songSlug },
        });

        // Deactivate existing primary lyrics
        await prisma.lyric.updateMany({
          where: { songId: song.id, isPrimary: true },
          data: { isPrimary: false },
        });

        // Create lyric record
        await prisma.lyric.create({
          data: {
            songId: song.id,
            sourceType: 'file_import',
            sourceLabel: filename,
            text: row.lyrics,
            isPrimary: true,
          },
        });

        successRows++;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        errors.push({ row: i + 1, message });
      }
    }

    const status = errors.length === 0 ? 'success' : successRows > 0 ? 'partial' : 'failed';
    const summary: ImportSummary = {
      totalRows: rows.length,
      successRows,
      failedRows: errors.length,
      errors,
    };

    return prisma.import.update({
      where: { id: importRecord.id },
      data: { status, summary: summary as object },
    });
  },
};

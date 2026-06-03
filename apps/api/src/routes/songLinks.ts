/**
 * Song Source Links — admin tool for linking live/bootleg/demo recordings
 * to their studio original so lyrics can be inherited in bulk.
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const songLinksRouter = Router();
songLinksRouter.use(requireAuth);
songLinksRouter.use(requireAdmin);

// ---------------------------------------------------------------------------
// GET /api/song-links/candidates?bandIds=id1,id2
// Returns all songs from those bands with album + lyric presence info.
// ---------------------------------------------------------------------------

songLinksRouter.get('/candidates', async (req, res, next): Promise<void> => {
  try {
    const bandIdsRaw = (req.query['bandIds'] as string) ?? '';
    const bandIds = bandIdsRaw ? bandIdsRaw.split(',').filter(Boolean) : [];

    const songs = await prisma.song.findMany({
      where: bandIds.length ? { bandId: { in: bandIds } } : {},
      select: {
        id: true,
        title: true,
        bandId: true,
        sourceSongId: true,
        band: { select: { name: true } },
        album: { select: { id: true, title: true, albumType: true, year: true } },
        lyrics: { where: { isPrimary: true }, select: { id: true }, take: 1 },
      },
      orderBy: [{ band: { name: 'asc' } }, { title: 'asc' }],
    });

    const result = songs.map(s => ({
      id: s.id,
      title: s.title,
      bandId: s.bandId,
      bandName: s.band.name,
      albumId: s.album?.id ?? null,
      albumTitle: s.album?.title ?? null,
      albumType: s.album?.albumType ?? null,
      albumYear: s.album?.year ?? null,
      sourceSongId: s.sourceSongId,
      hasLyrics: s.lyrics.length > 0,
    }));

    res.json({ songs: result });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// PATCH /api/song-links/:songId
// Body: { sourceSongId: string | null }
// ---------------------------------------------------------------------------

songLinksRouter.patch('/:songId', async (req, res, next): Promise<void> => {
  try {
    const { songId } = req.params;
    const sourceSongId = (req.body as { sourceSongId?: string | null }).sourceSongId ?? null;

    if (sourceSongId === songId) {
      res.status(400).json({ error: 'A song cannot be its own source' });
      return;
    }

    const updated = await prisma.song.update({
      where: { id: songId },
      data: { sourceSongId },
      select: { id: true, sourceSongId: true },
    });

    res.json(updated);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/song-links/:songId/inherit-lyrics
// Copies the primary lyrics from sourceSong to this song.
// Creates a new Lyric record — the derived song gets its own editable copy.
// ---------------------------------------------------------------------------

songLinksRouter.post('/:songId/inherit-lyrics', async (req, res, next): Promise<void> => {
  try {
    const { songId } = req.params;

    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        id: true,
        title: true,
        sourceSongId: true,
        sourceSong: { select: { id: true, title: true } },
        lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
      },
    });

    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }
    if (!song.sourceSongId) { res.status(400).json({ error: 'Song has no source link' }); return; }

    // Fetch source lyrics
    const sourceLyrics = await prisma.lyric.findFirst({
      where: { songId: song.sourceSongId, isPrimary: true },
      select: { text: true },
    });

    if (!sourceLyrics) {
      res.status(404).json({ error: 'Source song has no primary lyrics to inherit' });
      return;
    }

    // Demote any existing primary lyric on this song
    await prisma.lyric.updateMany({
      where: { songId, isPrimary: true },
      data: { isPrimary: false },
    });

    const sourceTitle = song.sourceSong?.title ?? 'studio recording';
    const lyric = await prisma.lyric.create({
      data: {
        songId,
        sourceType: 'manual',
        sourceLabel: `Inherited from: ${sourceTitle}`,
        text: sourceLyrics.text,
        isPrimary: true,
      },
    });

    // Clear noLyricsAt so the batch fetcher doesn't skip this song
    await prisma.song.update({
      where: { id: songId },
      data: { noLyricsAt: null },
    });

    res.json({ lyricId: lyric.id, text: lyric.text.slice(0, 120) + '…' });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/song-links/bulk
// Body: { links: { songId: string; sourceSongId: string; copyLyrics?: boolean }[] }
// ---------------------------------------------------------------------------

songLinksRouter.post('/bulk', async (req, res, next): Promise<void> => {
  type LinkInput = { songId: string; sourceSongId: string; copyLyrics?: boolean };
  const links = ((req.body as { links?: LinkInput[] }).links ?? []).filter(
    l => l.songId && l.sourceSongId && l.songId !== l.sourceSongId,
  );

  if (!links.length) { res.status(400).json({ error: 'No valid links supplied' }); return; }

  try {
    let linked = 0;
    let lyricsInherited = 0;
    const errors: { songId: string; error: string }[] = [];

    for (const link of links) {
      try {
        // Set the source link
        await prisma.song.update({
          where: { id: link.songId },
          data: { sourceSongId: link.sourceSongId },
        });
        linked++;

        // Optionally copy lyrics
        if (link.copyLyrics) {
          const sourceLyric = await prisma.lyric.findFirst({
            where: { songId: link.sourceSongId, isPrimary: true },
            select: { text: true, id: true },
          });

          if (sourceLyric) {
            const existingPrimary = await prisma.lyric.findFirst({
              where: { songId: link.songId, isPrimary: true },
              select: { id: true },
            });

            if (!existingPrimary) {
              const sourceTitle = await prisma.song.findUnique({
                where: { id: link.sourceSongId },
                select: { title: true },
              });
              await prisma.lyric.create({
                data: {
                  songId: link.songId,
                  sourceType: 'manual',
                  sourceLabel: `Inherited from: ${sourceTitle?.title ?? 'studio recording'}`,
                  text: sourceLyric.text,
                  isPrimary: true,
                },
              });
              await prisma.song.update({
                where: { id: link.songId },
                data: { noLyricsAt: null },
              });
              lyricsInherited++;
            }
          }
        }
      } catch (err) {
        errors.push({ songId: link.songId, error: String(err) });
      }
    }

    res.json({ linked, lyricsInherited, errors });
  } catch (e) { next(e); }
});

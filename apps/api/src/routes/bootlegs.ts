/**
 * Bootlegs router — Archive.org proxy + import endpoint.
 * Allows importing live concert recordings from the Internet Archive
 * as bootleg albums into any band in the database.
 *
 * No Archive.org API key required — the API is public.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { prisma } from '../lib/prisma.js';
import { toSlug } from '@band-spectrum-mapper/shared';

export const bootlegsRouter = Router();
bootlegsRouter.use(requireAuth);
bootlegsRouter.use(requireAdmin);

const ARCHIVE_BASE = 'https://archive.org';

async function archiveFetch(url: string): Promise<unknown> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'BandSpectrumMapper/1.0 (music analysis platform)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw Object.assign(new Error(`Archive.org ${resp.status}: ${body.slice(0, 200)}`), { statusCode: resp.status });
  }
  return resp.json();
}

/**
 * GET /api/admin/bootlegs/search?q=...&rows=50&page=1
 * Searches Archive.org for live audio recordings matching the query.
 * Returns Archive.org advancedsearch response (response.docs array).
 */
bootlegsRouter.get('/search', async (req, res, next): Promise<void> => {
  try {
    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
    if (!q) { res.status(400).json({ error: 'q query param required' }); return; }
    const rows = Math.min(200, Math.max(1, parseInt(typeof req.query['rows'] === 'string' ? req.query['rows'] : '50') || 50));
    const page = Math.max(1, parseInt(typeof req.query['page'] === 'string' ? req.query['page'] : '1') || 1);

    const params = new URLSearchParams({
      q: `(${q}) AND mediatype:audio`,
      'fl[]': 'identifier,title,date,coverage,creator,downloads,subject',
      sort: 'date asc',
      rows: String(rows),
      page: String(page),
      output: 'json',
    });
    const data = await archiveFetch(`${ARCHIVE_BASE}/advancedsearch.php?${params}`);
    res.json(data);
  } catch (e) { next(e); }
});

/**
 * GET /api/admin/bootlegs/item/:identifier
 * Returns Archive.org item metadata including files list.
 * The files list contains track names which we use for the setlist.
 */
bootlegsRouter.get('/item/:identifier', async (req, res, next): Promise<void> => {
  try {
    const id = req.params['identifier'];
    if (!id) { res.status(400).json({ error: 'identifier required' }); return; }
    const data = await archiveFetch(`${ARCHIVE_BASE}/metadata/${encodeURIComponent(id)}`);
    res.json(data);
  } catch (e) { next(e); }
});

/**
 * POST /api/admin/bootlegs/import
 * Imports an Archive.org show as a bootleg album + songs for the given band.
 * Body: { bandId, identifier, title, date?, venue?, city?, tracks: [{title, trackNumber?}] }
 */
bootlegsRouter.post('/import', async (req, res, next): Promise<void> => {
  try {
    const { bandId, identifier, title, date, venue, city, artworkUrl, tracks } = req.body as {
      bandId: string;
      identifier: string;
      title: string;
      date?: string;
      venue?: string;
      city?: string;
      artworkUrl?: string;
      tracks?: { title: string; trackNumber?: number }[];
    };

    if (!bandId || !identifier || !title?.trim()) {
      res.status(400).json({ error: 'bandId, identifier, and title are required' }); return;
    }

    const band = await prisma.band.findUnique({ where: { id: bandId } });
    if (!band) { res.status(404).json({ error: 'Band not found' }); return; }

    // Idempotency: skip if this identifier was already imported for this band
    const alreadyImported = await prisma.album.findFirst({
      where: { bandId, notes: { contains: `archive:${identifier}` } },
    });
    if (alreadyImported) {
      res.status(409).json({ error: 'Already imported', albumId: alreadyImported.id }); return;
    }

    // Derive year from date string (YYYY-MM-DD or YYYY)
    const year = date ? (() => { const y = parseInt(date.slice(0, 4)); return isNaN(y) ? null : y; })() : null;

    // Build provenance note (archive identifier is the key for idempotency)
    const notes = [
      `archive:${identifier}`,
      venue ? `Venue: ${venue}` : '',
      city ? `City: ${city}` : '',
      date ? `Date: ${date}` : '',
    ].filter(Boolean).join('\n');

    // Ensure unique album slug within the band
    const baseSlug = toSlug(identifier).slice(0, 190);
    let albumSlug = baseSlug;
    let slugSuffix = 1;
    while (await prisma.album.findFirst({ where: { bandId, slug: albumSlug } })) {
      albumSlug = `${baseSlug}-${slugSuffix++}`;
    }

    const album = await prisma.album.create({
      data: {
        bandId, title: title.trim(), slug: albumSlug, year, albumType: 'bootleg', notes,
        ...(artworkUrl ? { artworkUrl } : {}),
      },
    });

    // Import tracks as songs
    const created: { id: string; title: string }[] = [];
    const cleaned = (tracks ?? []).filter(t => t.title.trim().length > 0);
    for (let i = 0; i < cleaned.length; i++) {
      const track = cleaned[i]!;
      const trackNum = track.trackNumber ?? i + 1;
      // Unique song slug: archive id + track number avoids same-title conflicts across shows
      const songSlug = toSlug(`${identifier} t${trackNum}`).slice(0, 190);
      try {
        const song = await prisma.song.create({
          data: {
            bandId, albumId: album.id,
            title: track.title.trim(),
            slug: songSlug,
            trackNumber: trackNum,
          },
        });
        created.push({ id: song.id, title: song.title });
      } catch {
        // Slug conflict fallback — append random suffix
        try {
          const song = await prisma.song.create({
            data: {
              bandId, albumId: album.id,
              title: track.title.trim(),
              slug: `${songSlug}-${Date.now()}`.slice(0, 200),
              trackNumber: trackNum,
            },
          });
          created.push({ id: song.id, title: song.title });
        } catch { /* skip */ }
      }
    }

    res.status(201).json({ album, songs: created, songCount: created.length }); return;
  } catch (e) { next(e); }
});

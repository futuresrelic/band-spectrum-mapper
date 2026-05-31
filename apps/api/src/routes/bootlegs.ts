/**
 * Bootlegs router — Archive.org proxy + band bootleg page scraper + import endpoint.
 * Allows importing live concert recordings from the Internet Archive
 * as bootleg albums into any band in the database.
 *
 * No Archive.org API key required — the API is public.
 * Scraper fetches any band's bootleg page (KGLW, Pearl Jam, etc.) with browser headers
 * and extracts show data + Archive.org identifiers automatically.
 */
import { Router } from 'express';
import { parse as parseHtml } from 'node-html-parser';
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

// ---------------------------------------------------------------------------
// Page scraper helpers
// ---------------------------------------------------------------------------

/** Full browser-like headers to bypass bot-protection on band websites */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

function resolveUrl(src: string, base: string): string {
  if (!src || src.startsWith('data:')) return '';
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return 'https:' + src;
  try { return new URL(src, base).href; } catch { return src; }
}

/** Extract an Archive.org identifier from a URL string */
function extractArchiveId(url: string): string {
  const m = url.match(/archive\.org\/(?:details|download|embed)\/([^/?#\s"']+)/);
  return m?.[1]?.trim() ?? '';
}

export interface ScrapedShow {
  identifier: string;     // Archive.org identifier (empty if not found)
  archiveUrl: string;     // full archive.org URL
  artworkUrl: string;     // image URL from the band's page
  title: string;
  date: string;
  venue: string;
  sourceUrl: string;      // original link from the band's page
  rawText: string;        // raw text snippet for display
}

/**
 * Scrape a band's bootleg page and extract show data.
 * Strategy:
 * 1. Find all archive.org links on the page → each is a show
 * 2. Walk up from the link to the nearest "card" ancestor, extract image + text
 * 3. If no archive.org links, fall back to finding show-card-like elements by
 *    common class name patterns and extracting whatever data is available
 */
function scrapeBootlegPage(html: string, pageUrl: string): ScrapedShow[] {
  const root = parseHtml(html, { blockTextElements: { script: false, style: false } });
  const shows: ScrapedShow[] = [];
  const seenIds = new Set<string>();

  // ── Pass 1: find anchor tags pointing to archive.org ──────────────────────
  const archiveLinks = root.querySelectorAll('a[href*="archive.org"]');
  for (const link of archiveLinks) {
    const href = link.getAttribute('href') ?? '';
    const id = extractArchiveId(href);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    // Walk up max 5 levels to find a "card" container
    let container: typeof link | null = link;
    for (let i = 0; i < 5; i++) {
      const parent = container?.parentNode;
      if (!parent || parent.nodeType !== 1) break;
      // Stop if we've hit a big layout container
      const cls = (parent as typeof link).getAttribute?.('class') ?? '';
      if (/\b(body|main|section|nav|footer|header)\b/i.test(cls)) break;
      // Keep going if the parent is small enough (likely a card)
      container = parent as typeof link;
    }

    // Extract image from the card container
    const img = container?.querySelector('img');
    const rawImgSrc = img?.getAttribute('src') ?? img?.getAttribute('data-src') ?? img?.getAttribute('data-lazy-src') ?? '';
    const artworkUrl = resolveUrl(rawImgSrc, pageUrl);

    // Extract all text from the card
    const rawText = (container?.text ?? link.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

    // Try to extract a date (YYYY-MM-DD or MM/DD/YYYY patterns)
    const dateMatch = rawText.match(/(\d{4}[-./]\d{2}[-./]\d{2})|(\d{1,2}[-./]\d{1,2}[-./]\d{4})/);
    const date = dateMatch?.[0]?.replace(/[./]/g, '-') ?? '';

    shows.push({
      identifier: id,
      archiveUrl: `https://archive.org/details/${id}`,
      artworkUrl,
      title: rawText.split('\n')[0]?.trim() ?? id,
      date,
      venue: '',
      sourceUrl: resolveUrl(href, pageUrl),
      rawText,
    });
  }

  // ── Pass 2: if no archive.org links found, look for show cards ────────────
  if (shows.length === 0) {
    const CARD_PATTERNS = [
      '[class*="bootleg"]', '[class*="show"]', '[class*="concert"]',
      '[class*="release"]', '[class*="tour"]', '[class*="gig"]',
      'article', '.card', '.item', '.post',
    ];
    for (const selector of CARD_PATTERNS) {
      const cards = root.querySelectorAll(selector);
      if (cards.length < 2 || cards.length > 500) continue;
      for (const card of cards) {
        const text = card.text.replace(/\s+/g, ' ').trim();
        if (text.length < 8) continue;
        const img = card.querySelector('img');
        const rawSrc = img?.getAttribute('src') ?? img?.getAttribute('data-src') ?? '';
        const artworkUrl = resolveUrl(rawSrc, pageUrl);
        const link = card.querySelector('a');
        const href = link?.getAttribute('href') ?? '';
        const id = extractArchiveId(href);
        if (id && seenIds.has(id)) continue;
        if (id) seenIds.add(id);
        const dateMatch = text.match(/(\d{4}[-./]\d{2}[-./]\d{2})|(\d{1,2}[-./]\d{1,2}[-./]\d{4})/);
        shows.push({
          identifier: id,
          archiveUrl: id ? `https://archive.org/details/${id}` : '',
          artworkUrl,
          title: text.slice(0, 100),
          date: dateMatch?.[0]?.replace(/[./]/g, '-') ?? '',
          venue: '',
          sourceUrl: resolveUrl(href, pageUrl),
          rawText: text.slice(0, 300),
        });
      }
      if (shows.length > 0) break;
    }
  }

  return shows;
}

// ---------------------------------------------------------------------------
// GET /api/admin/bootlegs/scrape?url=...
// Fetches a band's bootleg page and returns extracted show data.
// ---------------------------------------------------------------------------
bootlegsRouter.get('/scrape', async (req, res, next): Promise<void> => {
  try {
    const urlParam = typeof req.query['url'] === 'string' ? req.query['url'].trim() : '';
    if (!urlParam) { res.status(400).json({ error: 'url query param required' }); return; }

    let targetUrl: URL;
    try { targetUrl = new URL(urlParam); } catch {
      res.status(400).json({ error: 'Invalid URL' }); return;
    }
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      res.status(400).json({ error: 'Only http/https URLs are supported' }); return;
    }

    const resp = await fetch(targetUrl.href, {
      headers: { ...BROWSER_HEADERS, 'Referer': targetUrl.origin + '/' },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });

    if (!resp.ok) {
      res.status(502).json({
        error: `The page returned HTTP ${resp.status}. The site may block automated requests.`,
        statusCode: resp.status,
        shows: [],
      });
      return;
    }

    const contentType = resp.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      res.status(502).json({ error: `Expected HTML but got ${contentType}`, shows: [] });
      return;
    }

    const html = await resp.text();
    // Detect if the page is a JS-only shell (minimal visible content)
    const bodyText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const requiresJs = bodyText.length < 500 && html.includes('<script');

    const shows = scrapeBootlegPage(html, targetUrl.href);

    res.json({
      url: targetUrl.href,
      shows,
      requiresJs,
      showCount: shows.length,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      res.status(504).json({ error: 'Request timed out (20s). The site may be slow or blocking requests.', shows: [] });
      return;
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
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

import { type RequestHandler } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';

// Derive the absolute URL for a given request (respects Railway's X-Forwarded-* headers)
function baseUrl(req: Parameters<RequestHandler>[0]): string {
  const appUrl = process.env['APP_URL'];
  if (appUrl) return appUrl.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'https';
  const host  = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers['host'] ?? 'localhost';
  return `${proto}://${host}`;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function injectOgTags(html: string, tags: Record<string, string>): string {
  const metaTags = Object.entries(tags)
    .map(([k, v]) => {
      if (k.startsWith('og:') || k.startsWith('music:'))  return `<meta property="${k}" content="${escAttr(v)}"/>`;
      if (k.startsWith('twitter:')) return `<meta name="${k}" content="${escAttr(v)}"/>`;
      if (k === 'title') return `<title>${escAttr(v)}</title>`;
      return `<meta name="${k}" content="${escAttr(v)}"/>`;
    })
    .join('\n    ');

  // Replace the existing <title> and inject after it; fall back to </head>
  return html
    .replace(/<title>[^<]*<\/title>/, '')
    .replace('</head>', `    ${metaTags}\n  </head>`);
}

// Cache the index.html content in memory
let cachedHtml: string | null = null;
let cachedHtmlPath: string | null = null;

function readIndexHtml(webDist: string): string {
  const p = path.join(webDist, 'index.html');
  if (cachedHtmlPath === p && cachedHtml) return cachedHtml;
  cachedHtml = fs.readFileSync(p, 'utf-8');
  cachedHtmlPath = p;
  return cachedHtml;
}

// ---------------------------------------------------------------------------
// Song share page OG middleware
// ---------------------------------------------------------------------------

export function songOgMiddleware(webDist: string): RequestHandler {
  return async (req, res, next) => {
    if (!req.path.match(/^\/share\/songs\/[^/]+$/)) { next(); return; }

    const songId = req.path.split('/').pop()!;

    try {
      const [song, context] = await Promise.all([
        prisma.song.findUnique({
          where: { id: songId },
          include: {
            band:  { select: { name: true } },
            album: { select: { title: true, year: true } },
          },
        }),
        prisma.songContextAnalysis.findUnique({ where: { songId }, select: { overallNarrative: true } }),
      ]);

      if (!song) { next(); return; }

      const base    = baseUrl(req);
      const pageUrl = `${base}/share/songs/${songId}`;
      const imgUrl  = `${base}/api/og/songs/${songId}`;

      const songLabel  = `"${song.title}" by ${song.band.name}`;
      const albumLabel = song.album
        ? `${song.album.title}${song.album.year ? ` (${song.album.year})` : ''}`
        : '';
      const description = context?.overallNarrative
        ? truncate(context.overallNarrative, 200)
        : `${songLabel}${albumLabel ? ` · ${albumLabel}` : ''} — lyrics &amp; spectrum analysis on Band Spectrum Mapper`;

      const tags: Record<string, string> = {
        title:                `${song.title} — ${song.band.name} · Band Spectrum Mapper`,
        description,
        'og:type':            'music.song',
        'og:url':             pageUrl,
        'og:title':           `${song.title} — ${song.band.name}`,
        'og:description':     truncate(description, 200),
        'og:image':           imgUrl,
        'og:image:width':     '1200',
        'og:image:height':    '630',
        'og:image:type':      'image/png',
        'og:site_name':       'Band Spectrum Mapper',
        'twitter:card':       'summary_large_image',
        'twitter:title':      `${song.title} — ${song.band.name}`,
        'twitter:description': truncate(description, 200),
        'twitter:image':      imgUrl,
      };
      if (albumLabel) tags['og:description'] = truncate(`${albumLabel} · ${description}`, 200);

      const html = injectOgTags(readIndexHtml(webDist), tags);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch {
      next(); // fall through to SPA on error
    }
  };
}

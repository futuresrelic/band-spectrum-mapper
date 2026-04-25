import { Router } from 'express';
import { Resvg } from '@resvg/resvg-js';
import { prisma } from '../lib/prisma.js';

export const ogRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

const GENRE_COLORS: Record<string, string> = {
  metal:      '#ef4444',
  rock:       '#f97316',
  pop:        '#ec4899',
  hiphop:     '#a855f7',
  electronic: '#06b6d4',
  folk:       '#22c55e',
};
const GENRE_LABELS: Record<string, string> = {
  metal: 'Metal', rock: 'Rock', pop: 'Pop', hiphop: 'Hip-Hop', electronic: 'Electronic', folk: 'Folk/Indie',
};
const GENRE_ORDER = ['metal', 'rock', 'pop', 'hiphop', 'electronic', 'folk'] as const;
const AXES = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
const AXIS_LABELS: Record<string, string> = {
  aggression: 'Aggr', complexity: 'Comp', atmosphere: 'Atmo', emotion: 'Emot', psychedelic: 'Psyc', concept: 'Conc',
};
const AXIS_COLORS: Record<string, string> = {
  aggression: '#ef4444', complexity: '#f97316', atmosphere: '#06b6d4',
  emotion: '#ec4899', psychedelic: '#a855f7', concept: '#22c55e',
};

// ---------------------------------------------------------------------------
// SVG card generator
// ---------------------------------------------------------------------------

function buildSongOgSvg(opts: {
  title: string;
  bandName: string;
  albumTitle: string | null;
  year: number | null;
  narrative: string | null;
  genreScores: Record<string, number> | null;
  spectrumScores: Record<string, number> | null;
}): string {
  const { title, bandName, albumTitle, year, narrative, genreScores, spectrumScores } = opts;

  const W = 1200;
  const H = 630;

  // Left panel width
  const leftW = genreScores ? 640 : 1100;
  const rightX = 680;

  const titleText  = truncate(title, 34);
  const bandText   = truncate(bandName, 40);
  const albumText  = albumTitle
    ? truncate(`${albumTitle}${year ? ` · ${year}` : ''}`, 44)
    : year ? String(year) : '';
  const narrativeText = narrative ? truncate(narrative, 280) : null;

  // Word-wrap narrative into ~55-char lines
  const narrativeLines: string[] = [];
  if (narrativeText) {
    const words = narrativeText.split(' ');
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 52) {
        if (line) narrativeLines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
      if (narrativeLines.length >= 5) { narrativeLines.push('…'); break; }
    }
    if (line && narrativeLines.length < 6) narrativeLines.push(line);
  }

  const genreBars = genreScores
    ? GENRE_ORDER.map((key, i) => {
        const score = genreScores[key] ?? 0;
        const barMax = 440;
        const barW = Math.round((score / 10) * barMax);
        const y = 120 + i * 74;
        const color = GENRE_COLORS[key]!;
        return `
          <text x="${rightX}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#94a3b8">${esc(GENRE_LABELS[key]!)}</text>
          <rect x="${rightX}" y="${y + 8}" width="${barMax}" height="10" rx="5" fill="#1e293b"/>
          <rect x="${rightX}" y="${y + 8}" width="${barW}" height="10" rx="5" fill="${color}"/>
          <text x="${rightX + barMax + 12}" y="${y + 17}" font-family="Arial, Helvetica, monospace" font-size="15" fill="${color}" font-weight="700">${score.toFixed(1)}</text>`;
      }).join('')
    : '';

  const spectrumRow = spectrumScores
    ? AXES.map((axis, i) => {
        const score = Number(spectrumScores[axis] ?? 0);
        const cx = 80 + i * 170;
        const cy = genreScores ? 540 : 490;
        const color = AXIS_COLORS[axis]!;
        return `
          <text x="${cx}" y="${cy}" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#64748b">${esc(AXIS_LABELS[axis]!)}</text>
          <text x="${cx}" y="${cy + 24}" font-family="Arial, Helvetica, monospace" font-size="22" fill="${color}" font-weight="700">${score.toFixed(1)}</text>`;
      }).join('')
    : '';

  const narrativeSvg = narrativeLines.map((line, i) => `
    <text x="80" y="${(genreScores ? 360 : 320) + i * 26}" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#94a3b8">${esc(line)}</text>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Left divider line (when genre panel present) -->
  ${genreScores ? `<line x1="652" y1="60" x2="652" y2="570" stroke="#1e293b" stroke-width="1"/>` : ''}

  <!-- Band name -->
  <text x="80" y="100" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#6366f1" font-weight="600" letter-spacing="1">${esc(bandText.toUpperCase())}</text>

  <!-- Song title -->
  <text x="80" y="185" font-family="Arial, Helvetica, sans-serif" font-size="${titleText.length > 22 ? 46 : 56}" fill="#f8fafc" font-weight="700" letter-spacing="-1">${esc(titleText)}</text>

  <!-- Album info -->
  ${albumText ? `<text x="80" y="225" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#475569">${esc(albumText)}</text>` : ''}

  <!-- Separator -->
  <line x1="80" y1="${narrative ? 265 : 260}" x2="${leftW}" y2="${narrative ? 265 : 260}" stroke="#1e293b" stroke-width="1"/>

  <!-- Narrative -->
  ${narrativeSvg}

  <!-- Spectrum scores -->
  ${spectrumRow}

  <!-- Genre bars -->
  ${genreBars}

  <!-- Spectrum label -->
  ${spectrumScores ? `<text x="80" y="${(genreScores ? 540 : 490) - 18}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="#334155" letter-spacing="2">CORE SPECTRUM</text>` : ''}

  <!-- Branding footer -->
  <text x="80" y="610" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#334155">BAND SPECTRUM MAPPER · lyrics &amp; publicly available information analysis · not the music itself</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Route: GET /api/og/songs/:songId  — returns PNG
// ---------------------------------------------------------------------------

ogRouter.get('/songs/:songId', async (req, res, next) => {
  try {
    const { songId } = req.params as { songId: string };

    const [song, aiSpectrum, aiGenre, context] = await Promise.all([
      prisma.song.findUnique({
        where: { id: songId },
        include: {
          band:  { select: { name: true } },
          album: { select: { title: true, year: true } },
        },
      }),
      prisma.songAiSpectrum.findUnique({ where: { songId } }),
      prisma.songAiGenreSpectrum.findUnique({ where: { songId } }),
      prisma.songContextAnalysis.findUnique({ where: { songId } }),
    ]);

    if (!song) {
      res.status(404).json({ error: 'Song not found' });
      return;
    }

    const genreScores: Record<string, number> | null = aiGenre
      ? {
          metal: Number(aiGenre.metal), rock: Number(aiGenre.rock), pop: Number(aiGenre.pop),
          hiphop: Number(aiGenre.hiphop), electronic: Number(aiGenre.electronic), folk: Number(aiGenre.folk),
        }
      : null;

    const spectrumScores: Record<string, number> | null = aiSpectrum
      ? {
          aggression: Number(aiSpectrum.aggression), complexity: Number(aiSpectrum.complexity),
          atmosphere: Number(aiSpectrum.atmosphere), emotion: Number(aiSpectrum.emotion),
          psychedelic: Number(aiSpectrum.psychedelic), concept: Number(aiSpectrum.concept),
        }
      : null;

    const svg = buildSongOgSvg({
      title:          song.title,
      bandName:       song.band.name,
      albumTitle:     song.album?.title ?? null,
      year:           song.album?.year ?? null,
      narrative:      context?.overallNarrative ?? null,
      genreScores,
      spectrumScores,
    });

    const resvg = new Resvg(svg, {
      font: { loadSystemFonts: true },
      fitTo: { mode: 'width', value: 1200 },
    });
    const png = resvg.render().asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.end(png);
  } catch (e) { next(e); }
});

import { Router } from 'express';
import { Resvg } from '@resvg/resvg-js';
import { prisma } from '../lib/prisma.js';

export const ogRouter = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENRE_COLORS: Record<string, string> = {
  metal: '#ff3a3a', rock: '#ff9500', pop: '#ff375f',
  hiphop: '#bf5af2', electronic: '#34c8e8', folk: '#30d158',
};
const GENRE_LABELS: Record<string, string> = {
  metal: 'Metal', rock: 'Rock', pop: 'Pop', hiphop: 'Hip-Hop', electronic: 'Electronic', folk: 'Folk / Indie',
};
const GENRE_ORDER = ['metal', 'rock', 'pop', 'hiphop', 'electronic', 'folk'] as const;

// Vivid versions of axis colors — optimised for dark backgrounds
const AXIS_COLORS: Record<string, string> = {
  aggression: '#ff3a3a',
  complexity: '#ff9500',
  atmosphere: '#34c8e8',
  emotion:    '#ff375f',
  psychedelic:'#bf5af2',
  concept:    '#30d158',
};
const AXIS_SHORT: Record<string, string> = {
  aggression: 'AGGR', complexity: 'COMP', atmosphere: 'ATMO',
  emotion: 'EMOT', psychedelic: 'PSYC', concept: 'CONC',
};
const AXES = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
function n2(v: number): string { return v.toFixed(2); }

// ---------------------------------------------------------------------------
// Radar chart SVG builder
// ---------------------------------------------------------------------------

function radarSvg(opts: {
  scores: Record<string, number>;
  cx: number; cy: number; R: number;
}): string {
  const { scores, cx, cy, R } = opts;
  const N = 6;

  // angle[i] = axis angle in radians, starting at top (−90°), clockwise
  const angle = (i: number) => (-Math.PI / 2) + i * (Math.PI / (N / 2));

  // Point on an axis at fraction f
  const px = (i: number, f: number) => cx + f * R * Math.cos(angle(i));
  const py = (i: number, f: number) => cy + f * R * Math.sin(angle(i));

  // Build sector polygon points (approximated arc — avoids SVG arc direction bugs)
  function sectorPoints(i: number, extraR: number): string {
    const pts: string[] = [`${n2(cx)},${n2(cy)}`];
    const startDeg = (angle(i) - Math.PI / 6) * (180 / Math.PI) - 1;
    const endDeg   = (angle(i) + Math.PI / 6) * (180 / Math.PI) + 1;
    for (let d = startDeg; d <= endDeg; d += 4) {
      const r = d * Math.PI / 180;
      pts.push(`${n2(cx + (R + extraR) * Math.cos(r))},${n2(cy + (R + extraR) * Math.sin(r))}`);
    }
    return pts.join(' ');
  }

  // Hex grid path at fraction f
  function hexPath(f: number): string {
    const pts = Array.from({ length: N }, (_, i) => `${n2(px(i, f))},${n2(py(i, f))}`);
    return `M ${pts.join(' L ')} Z`;
  }

  // Score polygon path
  const scorePolyPts = AXES.map((ax, i) => `${n2(px(i, (scores[ax] ?? 0) / 10))},${n2(py(i, (scores[ax] ?? 0) / 10))}`);
  const scorePolyPath = `M ${scorePolyPts.join(' L ')} Z`;

  // Build the defs: one radialGradient + one clipPath per axis
  const defs = AXES.map((ax, i) => {
    const s = Math.max(0.01, (scores[ax] ?? 0) / 10); // 0–1
    const col = AXIS_COLORS[ax]!;
    const peakPct  = Math.round(s * 100);
    const fadePct  = Math.min(peakPct + 14, 100);
    const innerPct = Math.max(0, Math.round(s * 55));
    return `
    <radialGradient id="rg${i}" gradientUnits="userSpaceOnUse" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(R * 1.08)}">
      <stop offset="0%"          stop-color="${col}" stop-opacity="0"/>
      <stop offset="${innerPct}%" stop-color="${col}" stop-opacity="${n2(s * 0.25)}"/>
      <stop offset="${peakPct}%"  stop-color="${col}" stop-opacity="${n2(s * 0.88)}"/>
      <stop offset="${fadePct}%"  stop-color="${col}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="cp${i}">
      <polygon points="${sectorPoints(i, 40)}"/>
    </clipPath>`;
  }).join('');

  // Center glow
  const centerGlow = `
    <radialGradient id="cglow" gradientUnits="userSpaceOnUse" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(R * 0.18)}">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>`;

  // Grid lines
  const grid = [0.2, 0.4, 0.6, 0.8, 1.0].map(f =>
    `<path d="${hexPath(f)}" fill="none" stroke="white" stroke-width="0.6" stroke-opacity="${f === 1.0 ? 0.18 : 0.1}"/>`
  ).join('');

  // Axis spokes
  const spokes = AXES.map((_, i) =>
    `<line x1="${n2(cx)}" y1="${n2(cy)}" x2="${n2(px(i, 1))}" y2="${n2(py(i, 1))}" stroke="white" stroke-width="0.7" stroke-opacity="0.15"/>`
  ).join('');

  // Gradient sector fills
  const sectors = AXES.map((_, i) =>
    `<rect x="${n2(cx - R - 40)}" y="${n2(cy - R - 40)}" width="${n2((R + 40) * 2)}" height="${n2((R + 40) * 2)}" fill="url(#rg${i})" clip-path="url(#cp${i})"/>`
  ).join('');

  // Score polygon
  const scorePoly = `<path d="${scorePolyPath}" fill="white" fill-opacity="0.06" stroke="white" stroke-width="1.8" stroke-opacity="0.7" stroke-linejoin="round"/>`;

  // Vertex dots
  const dots = AXES.map((ax, i) => {
    const s = (scores[ax] ?? 0) / 10;
    const col = AXIS_COLORS[ax]!;
    return `<circle cx="${n2(px(i, s))}" cy="${n2(py(i, s))}" r="${n2(4 + s * 3)}" fill="${col}" stroke="white" stroke-width="1.2" stroke-opacity="0.7"/>`;
  }).join('');

  // Labels outside the chart (axis name + score)
  const LABEL_R = R + 32;
  const labels = AXES.map((ax, i) => {
    const lx = cx + LABEL_R * Math.cos(angle(i));
    const ly = cy + LABEL_R * Math.sin(angle(i));
    const col = AXIS_COLORS[ax]!;
    const score = (scores[ax] ?? 0).toFixed(1);
    const short = AXIS_SHORT[ax]!;
    // Text anchor based on angle quadrant
    const deg = angle(i) * 180 / Math.PI;
    const anchor = deg < -60 || deg > 60 || (deg > -30 && deg < 30) ? 'middle'
      : deg > 0 ? (deg < 120 ? 'start' : 'end') : (deg > -120 ? 'start' : 'end');
    // Vertical offset: move label outward in y so it doesn't overlap the dot
    const yOff = Math.abs(Math.sin(angle(i))) > 0.7 ? (Math.sin(angle(i)) > 0 ? 14 : -6) : 0;
    return `
    <text x="${n2(lx)}" y="${n2(ly + yOff)}" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="${col}" text-anchor="${anchor}" letter-spacing="1">${esc(short)}</text>
    <text x="${n2(lx)}" y="${n2(ly + yOff + 16)}" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="${col}" text-anchor="${anchor}">${score}</text>`;
  }).join('');

  return `<defs>${defs}${centerGlow}</defs>
  ${sectors}
  ${grid}
  ${spokes}
  ${scorePoly}
  ${dots}
  <circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(R * 0.18)}" fill="url(#cglow)"/>
  ${labels}`;
}

// ---------------------------------------------------------------------------
// Full OG card SVG (1200 × 630)
// ---------------------------------------------------------------------------

function buildSongOgSvg(opts: {
  title: string; bandName: string;
  albumTitle: string | null; year: number | null;
  narrative: string | null;
  genreScores: Record<string, number> | null;
  spectrumScores: Record<string, number> | null;
}): string {
  const { title, bandName, albumTitle, year, narrative, genreScores, spectrumScores } = opts;

  const W = 1200, H = 630;

  // Radar chart (left panel hero)
  const CX = 310, CY = 310, R = 188;
  const hasSpectrum = !!spectrumScores;
  const defaultScores = { aggression: 0, complexity: 0, atmosphere: 0, emotion: 0, psychedelic: 0, concept: 0 };
  const radarScores = hasSpectrum ? spectrumScores! : defaultScores;

  // Right panel metrics
  const RX = 658; // right panel x-start
  const titleText = truncate(title, 28);
  const bandText  = truncate(bandName, 36);
  const albumText = albumTitle ? truncate(`${albumTitle}${year ? ` · ${year}` : ''}`, 40) : '';

  // Narrative (word-wrap ~48 chars, max 4 lines)
  const narrativeLines: string[] = [];
  if (narrative) {
    const words = truncate(narrative, 240).split(' ');
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 46) {
        if (line) narrativeLines.push(line);
        line = w;
        if (narrativeLines.length >= 3) { narrativeLines.push('…'); break; }
      } else {
        line = line ? `${line} ${w}` : w;
      }
    }
    if (line && narrativeLines.length < 4) narrativeLines.push(line);
  }

  // Genre bars
  const genreBarsY = 270;
  const barAreaW   = 490;
  const genreBars  = genreScores
    ? GENRE_ORDER.map((key, i) => {
        const score = genreScores[key] ?? 0;
        const barW  = Math.round((score / 10) * barAreaW);
        const y     = genreBarsY + i * 47;
        const col   = GENRE_COLORS[key]!;
        return `
      <text x="${RX}" y="${y}" font-family="Arial,sans-serif" font-size="14" fill="#94a3b8">${esc(GENRE_LABELS[key]!)}</text>
      <rect x="${RX}" y="${y + 7}" width="${barAreaW}" height="8" rx="4" fill="#1e293b"/>
      <rect x="${RX}" y="${y + 7}" width="${barW}" height="8" rx="4" fill="${col}" opacity="0.9"/>
      <text x="${RX + barAreaW + 10}" y="${y + 15}" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="${col}" text-anchor="start">${score.toFixed(1)}</text>`;
      }).join('')
    : '';

  const narrativeSvg = narrativeLines.map((line, i) =>
    `<text x="${RX}" y="${(genreScores ? 565 : 400) + i * 24}" font-family="Arial,sans-serif" font-size="16" fill="#64748b">${esc(line)}</text>`
  ).join('');

  const emptyChartNote = !hasSpectrum
    ? `<text x="${n2(CX)}" y="${n2(CY + 8)}" font-family="Arial,sans-serif" font-size="16" fill="#334155" text-anchor="middle">No spectrum data yet</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%" stop-color="#06091a"/>
    <stop offset="100%" stop-color="#0d1424"/>
  </linearGradient>
</defs>

<!-- Background -->
<rect width="${W}" height="${H}" fill="url(#bg)"/>

<!-- Divider -->
<line x1="635" y1="50" x2="635" y2="580" stroke="#1e2d45" stroke-width="1"/>

<!-- ── Left panel: radar chart ── -->
${radarSvg({ scores: radarScores, cx: CX, cy: CY, R })}
${emptyChartNote}

<!-- ── Right panel: song info ── -->

<!-- Band name -->
<text x="${RX}" y="75" font-family="Arial,sans-serif" font-size="18" font-weight="600" fill="#6366f1" letter-spacing="2">${esc(bandText.toUpperCase())}</text>

<!-- Song title -->
<text x="${RX}" y="${titleText.length > 20 ? 145 : 155}" font-family="Arial,sans-serif" font-size="${titleText.length > 20 ? 44 : 52}" font-weight="700" fill="#f1f5f9" letter-spacing="-1">${esc(titleText)}</text>

<!-- Album -->
${albumText ? `<text x="${RX}" y="195" font-family="Arial,sans-serif" font-size="18" fill="#475569">${esc(albumText)}</text>` : ''}

<!-- Divider -->
<line x1="${RX}" y1="220" x2="1160" y2="220" stroke="#1e2d45" stroke-width="1"/>

${genreScores
  ? `<text x="${RX}" y="252" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#334155" letter-spacing="2">GENRE APPEAL</text>
${genreBars}`
  : narrativeSvg}

<!-- Footer -->
<text x="40" y="612" font-family="Arial,sans-serif" font-size="13" fill="#1e3a5f" letter-spacing="1">BAND SPECTRUM MAPPER</text>
<text x="1160" y="612" font-family="Arial,sans-serif" font-size="12" fill="#1e3a5f" text-anchor="end">lyrics &amp; public information · not the music itself</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Route: GET /api/og/songs/:songId  → PNG
// ---------------------------------------------------------------------------

ogRouter.get('/songs/:songId', async (req, res, next) => {
  try {
    const { songId } = req.params as { songId: string };

    const [song, aiSpectrum, aiGenre, context] = await Promise.all([
      prisma.song.findUnique({
        where: { id: songId },
        include: { band: { select: { name: true } }, album: { select: { title: true, year: true } } },
      }),
      prisma.songAiSpectrum.findUnique({ where: { songId } }),
      prisma.songAiGenreSpectrum.findUnique({ where: { songId } }),
      prisma.songContextAnalysis.findUnique({ where: { songId } }),
    ]);

    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }

    const genreScores: Record<string, number> | null = aiGenre
      ? { metal: +aiGenre.metal, rock: +aiGenre.rock, pop: +aiGenre.pop, hiphop: +aiGenre.hiphop, electronic: +aiGenre.electronic, folk: +aiGenre.folk }
      : null;
    const spectrumScores: Record<string, number> | null = aiSpectrum
      ? { aggression: +aiSpectrum.aggression, complexity: +aiSpectrum.complexity, atmosphere: +aiSpectrum.atmosphere, emotion: +aiSpectrum.emotion, psychedelic: +aiSpectrum.psychedelic, concept: +aiSpectrum.concept }
      : null;

    const svg = buildSongOgSvg({
      title: song.title, bandName: song.band.name,
      albumTitle: song.album?.title ?? null, year: song.album?.year ?? null,
      narrative: context?.overallNarrative ?? null,
      genreScores, spectrumScores,
    });

    const resvg = new Resvg(svg, { font: { loadSystemFonts: true }, fitTo: { mode: 'width', value: 1200 } });
    const png = resvg.render().asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.end(png);
  } catch (e) { next(e); }
});

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
// Route: GET /api/og/songs/:songId  → PNG (landscape OG image)
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

// ---------------------------------------------------------------------------
// Export: GET /api/og/songs/:songId/export?format=square|story&theme=dark|minimal|manuscript|neon
// Social-optimized export formats — not cached (content changes with theme/format)
// ---------------------------------------------------------------------------

type ExportTheme = 'dark' | 'minimal' | 'manuscript' | 'neon';
type ExportFormat = 'square' | 'story';

interface ExportSvgInput {
  title: string;
  bandName: string;
  albumTitle: string | null;
  year: number | null;
  spectrumScores: Record<string, number> | null;
  genreScores: Record<string, number> | null;
  theme: ExportTheme;
  format: ExportFormat;
}

function buildExportSvg(input: ExportSvgInput): string {
  const { title, bandName, albumTitle, year, spectrumScores, genreScores, theme, format } = input;
  const W = 1080;
  const H = format === 'story' ? 1920 : 1080;

  const radarCx = W / 2;
  const radarCy = format === 'story' ? 680 : H / 2 - 40;
  const radarR  = format === 'story' ? 280 : 220;

  const hasScores = spectrumScores && Object.values(spectrumScores).some((v) => v > 0);

  // ── Theme palettes ──────────────────────────────────────────────────────────

  const themes: Record<ExportTheme, {
    bg: string; bg2: string; textPrimary: string; textSecondary: string;
    textMuted: string; accent: string; gridColor: string; lineColor: string;
    axisColors: Record<string, string>;
  }> = {
    dark: {
      bg: '#0d1b2e', bg2: '#0a0f1e',
      textPrimary: '#f1f5f9', textSecondary: '#94a3b8', textMuted: '#334155',
      accent: '#6366f1',
      gridColor: '#1e2d45', lineColor: '#1e3a5f',
      axisColors: { aggression: '#ff3a3a', complexity: '#ff9500', atmosphere: '#34c8e8', emotion: '#ff375f', psychedelic: '#bf5af2', concept: '#30d158' },
    },
    minimal: {
      bg: '#ffffff', bg2: '#f8f9fa',
      textPrimary: '#111827', textSecondary: '#6b7280', textMuted: '#d1d5db',
      accent: '#4f46e5',
      gridColor: '#e5e7eb', lineColor: '#d1d5db',
      axisColors: { aggression: '#ef4444', complexity: '#f97316', atmosphere: '#06b6d4', emotion: '#f59e0b', psychedelic: '#8b5cf6', concept: '#22c55e' },
    },
    manuscript: {
      bg: '#0a0a0a', bg2: '#0f0f0f',
      textPrimary: '#e8e0d0', textSecondary: '#a09070', textMuted: '#403828',
      accent: '#c8a86b',
      gridColor: '#1a1710', lineColor: '#2a2418',
      axisColors: { aggression: '#c84040', complexity: '#c87820', atmosphere: '#2080a0', emotion: '#c05060', psychedelic: '#8040b0', concept: '#408040' },
    },
    neon: {
      bg: '#030308', bg2: '#05050f',
      textPrimary: '#ffffff', textSecondary: '#a0a0c0', textMuted: '#202030',
      accent: '#00ff88',
      gridColor: '#0f0f20', lineColor: '#1a1a35',
      axisColors: { aggression: '#ff1a1a', complexity: '#ff8800', atmosphere: '#00e5ff', emotion: '#ff0066', psychedelic: '#cc00ff', concept: '#00ff44' },
    },
  };

  const pal = themes[theme];

  // ── Score polygon ───────────────────────────────────────────────────────────

  function radarAngle(i: number) { return (-Math.PI / 2) + i * (Math.PI / 3); }
  function rPx(i: number, f: number) { return radarCx + f * radarR * Math.cos(radarAngle(i)); }
  function rPy(i: number, f: number) { return radarCy + f * radarR * Math.sin(radarAngle(i)); }

  function hexPath(f: number) {
    const pts = AXES.map((_, i) => `${rPx(i, f).toFixed(1)},${rPy(i, f).toFixed(1)}`);
    return `M ${pts.join(' L ')} Z`;
  }

  function scorePolygon() {
    if (!hasScores || !spectrumScores) return '';
    const pts = AXES.map((ax, i) => {
      const f = (spectrumScores[ax] ?? 0) / 10;
      return `${rPx(i, f).toFixed(1)},${rPy(i, f).toFixed(1)}`;
    });
    const fillOpacity = theme === 'minimal' ? '0.08' : '0.15';
    const strokeColor = theme === 'minimal' ? pal.accent : '#ffffff';
    return `<polygon points="${pts.join(' ')}" fill="${strokeColor}" fill-opacity="${fillOpacity}" stroke="${strokeColor}" stroke-width="2.5" stroke-opacity="0.9"/>`;
  }

  function axisGradients() {
    return AXES.map((ax, i) => {
      const color = pal.axisColors[ax] ?? '#ffffff';
      const tip = { x: rPx(i, 1.15).toFixed(1), y: rPy(i, 1.15).toFixed(1) };
      const id = `axg_${ax}`;
      return `<linearGradient id="${id}" x1="${radarCx}" y1="${radarCy}" x2="${tip.x}" y2="${tip.y}" gradientUnits="userSpaceOnUse">
  <stop offset="0%" stop-color="${color}" stop-opacity="0"/>
  <stop offset="100%" stop-color="${color}" stop-opacity="0.7"/>
</linearGradient>
<polygon points="${[`${radarCx},${radarCy}`].concat(
        (() => {
          const pts: string[] = [];
          const startDeg = (radarAngle(i) - Math.PI / 6) * (180 / Math.PI) - 1;
          const endDeg   = (radarAngle(i) + Math.PI / 6) * (180 / Math.PI) + 1;
          for (let d = startDeg; d <= endDeg; d += 3) {
            const r = d * Math.PI / 180;
            pts.push(`${(radarCx + (radarR + 15) * Math.cos(r)).toFixed(1)},${(radarCy + (radarR + 15) * Math.sin(r)).toFixed(1)}`);
          }
          return pts;
        })()
      ).join(' ')}" fill="url(#${id})"/>`;
    }).join('\n');
  }

  function gridLines() {
    const fractions = [0.25, 0.5, 0.75, 1.0];
    return fractions.map((f) => `<path d="${hexPath(f)}" fill="none" stroke="${pal.gridColor}" stroke-width="${f === 1 ? 1.5 : 0.8}"/>`).join('\n');
  }

  function axisLines() {
    return AXES.map((_, i) =>
      `<line x1="${radarCx}" y1="${radarCy}" x2="${rPx(i, 1).toFixed(1)}" y2="${rPy(i, 1).toFixed(1)}" stroke="${pal.gridColor}" stroke-width="1"/>`
    ).join('\n');
  }

  const AXIS_LABELS: Record<string, string> = {
    aggression: 'Aggr', complexity: 'Cmplx', atmosphere: 'Atmo', emotion: 'Emot', psychedelic: 'Psyc', concept: 'Conc',
  };

  function axisLabels() {
    return AXES.map((ax, i) => {
      const labelR = radarR + (format === 'story' ? 44 : 38);
      const x = radarCx + labelR * Math.cos(radarAngle(i));
      const y = radarCy + labelR * Math.sin(radarAngle(i));
      const scoreVal = hasScores && spectrumScores ? (spectrumScores[ax] ?? 0).toFixed(1) : '—';
      const color = pal.axisColors[ax] ?? pal.textSecondary;
      const fs = format === 'story' ? 24 : 20;
      return `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fs}" font-weight="700" fill="${color}" opacity="0.9">${AXIS_LABELS[ax]}</text>
<text x="${x.toFixed(1)}" y="${(y + fs * 0.9).toFixed(1)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.floor(fs * 0.85)}" fill="${pal.textSecondary}">${scoreVal}</text>`;
    }).join('\n');
  }

  // ── Genre bars (compact) ────────────────────────────────────────────────────

  function genreBarsSvg(startY: number, barWidth: number, barX: number): string {
    if (!genreScores) return '';
    const barH = format === 'story' ? 14 : 11;
    const gap  = format === 'story' ? 38 : 30;
    return GENRE_ORDER.map((g, i) => {
      const score = genreScores[g] ?? 0;
      const pct = (score / 10) * barWidth;
      const y = startY + i * gap;
      const color = GENRE_COLORS[g];
      return `<text x="${barX}" y="${y}" font-family="Arial,sans-serif" font-size="${barH + 1}" fill="${pal.textSecondary}">${GENRE_LABELS[g]}</text>
<rect x="${barX}" y="${y + 5}" width="${barWidth}" height="${barH}" rx="3" fill="${pal.gridColor}"/>
<rect x="${barX}" y="${y + 5}" width="${pct.toFixed(1)}" height="${barH}" rx="3" fill="${color}" opacity="0.9"/>
<text x="${barX + barWidth + 10}" y="${y + barH}" font-family="Arial,sans-serif" font-size="${barH}" fill="${color}" font-weight="700">${score.toFixed(1)}</text>`;
    }).join('\n');
  }

  // ── Square layout ───────────────────────────────────────────────────────────

  if (format === 'square') {
    const titleFs = title.length > 22 ? 52 : title.length > 15 ? 62 : 72;
    const titleY  = 180;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sqbg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%" stop-color="${pal.bg}"/>
    <stop offset="100%" stop-color="${pal.bg2}"/>
  </linearGradient>
</defs>

<!-- Background -->
<rect width="${W}" height="${H}" fill="url(#sqbg)"/>

<!-- Top accent line -->
<rect x="80" y="60" width="80" height="4" rx="2" fill="${pal.accent}"/>

<!-- Band name -->
<text x="80" y="110" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="4" fill="${pal.accent}">${esc(bandName.toUpperCase())}</text>

<!-- Song title -->
<text x="80" y="${titleY}" font-family="Arial,sans-serif" font-size="${titleFs}" font-weight="700" letter-spacing="-1" fill="${pal.textPrimary}">${esc(truncate(title, 24))}</text>

<!-- Album -->
${albumTitle ? `<text x="80" y="${titleY + 42}" font-family="Arial,sans-serif" font-size="20" fill="${pal.textSecondary}">${esc(albumTitle)}${year ? ` · ${year}` : ''}</text>` : ''}

<!-- Radar -->
${gridLines()}
${axisLines()}
${axisGradients()}
${scorePolygon()}
${axisLabels()}

<!-- Genre bars (compact, bottom-right) -->
${genreScores ? genreBarsSvg(H - 280, 200, W - 340) : ''}

<!-- Divider line -->
<line x1="80" y1="${H - 90}" x2="${W - 80}" y2="${H - 90}" stroke="${pal.lineColor}" stroke-width="1"/>

<!-- Footer branding -->
<text x="80" y="${H - 54}" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="3" fill="${pal.textMuted}">BAND SPECTRUM MAPPER</text>
<text x="80" y="${H - 30}" font-family="Arial,sans-serif" font-size="14" fill="${pal.textMuted}">bandspectrummapper.com · music as psychology</text>
</svg>`;
  }

  // ── Story layout (1080×1920) ────────────────────────────────────────────────

  const titleFs = title.length > 20 ? 72 : 86;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="stbg" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
    <stop offset="0%" stop-color="${pal.bg}"/>
    <stop offset="60%" stop-color="${pal.bg2}"/>
    <stop offset="100%" stop-color="${pal.bg}"/>
  </linearGradient>
</defs>

<!-- Background -->
<rect width="${W}" height="${H}" fill="url(#stbg)"/>

<!-- Top bar -->
<rect x="0" y="0" width="${W}" height="8" fill="${pal.accent}"/>

<!-- Header -->
<text x="540" y="110" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" letter-spacing="6" fill="${pal.textMuted}">BAND SPECTRUM MAPPER</text>
<line x1="160" y1="140" x2="920" y2="140" stroke="${pal.gridColor}" stroke-width="1"/>

<!-- Band name -->
<text x="540" y="220" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="4" fill="${pal.accent}">${esc(bandName.toUpperCase())}</text>

<!-- Song title -->
<text x="540" y="${220 + titleFs + 16}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${titleFs}" font-weight="700" letter-spacing="-2" fill="${pal.textPrimary}">${esc(truncate(title, 20))}</text>

<!-- Album -->
${albumTitle ? `<text x="540" y="${220 + titleFs + 72}" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" fill="${pal.textSecondary}">${esc(albumTitle)}${year ? ` · ${year}` : ''}</text>` : ''}

<!-- Divider -->
<line x1="160" y1="440" x2="920" y2="440" stroke="${pal.gridColor}" stroke-width="1"/>

<!-- Radar (centered, large) -->
${gridLines()}
${axisLines()}
${axisGradients()}
${scorePolygon()}
${axisLabels()}

<!-- Genre section -->
<text x="540" y="1040" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="4" fill="${pal.textMuted}">GENRE APPEAL</text>
<line x1="160" y1="1060" x2="920" y2="1060" stroke="${pal.gridColor}" stroke-width="1"/>

${genreScores ? genreBarsSvg(1090, 360, 160) : `<text x="540" y="1120" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="${pal.textMuted}">No genre data yet</text>`}

<!-- Bottom branding -->
<line x1="160" y1="${H - 120}" x2="920" y2="${H - 120}" stroke="${pal.gridColor}" stroke-width="1"/>
<text x="540" y="${H - 70}" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" letter-spacing="4" fill="${pal.textMuted}">BAND SPECTRUM MAPPER</text>
<text x="540" y="${H - 38}" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="${pal.textMuted}">music as psychology</text>
</svg>`;
}

ogRouter.get('/songs/:songId/export', async (req, res, next) => {
  try {
    const { songId } = req.params as { songId: string };
    const format  = (req.query['format']  as ExportFormat)  || 'square';
    const theme   = (req.query['theme']   as ExportTheme)   || 'dark';

    const validFormats: ExportFormat[]  = ['square', 'story'];
    const validThemes:  ExportTheme[]   = ['dark', 'minimal', 'manuscript', 'neon'];
    if (!validFormats.includes(format)) { res.status(400).json({ error: 'Invalid format' }); return; }
    if (!validThemes.includes(theme))   { res.status(400).json({ error: 'Invalid theme' }); return; }

    const [song, aiSpectrum, aiGenre] = await Promise.all([
      prisma.song.findUnique({
        where: { id: songId },
        include: { band: { select: { name: true } }, album: { select: { title: true, year: true } } },
      }),
      prisma.songAiSpectrum.findUnique({ where: { songId } }),
      prisma.songAiGenreSpectrum.findUnique({ where: { songId } }),
    ]);

    if (!song) { res.status(404).json({ error: 'Song not found' }); return; }

    const spectrumScores: Record<string, number> | null = aiSpectrum
      ? { aggression: +aiSpectrum.aggression, complexity: +aiSpectrum.complexity, atmosphere: +aiSpectrum.atmosphere, emotion: +aiSpectrum.emotion, psychedelic: +aiSpectrum.psychedelic, concept: +aiSpectrum.concept }
      : null;
    const genreScores: Record<string, number> | null = aiGenre
      ? { metal: +aiGenre.metal, rock: +aiGenre.rock, pop: +aiGenre.pop, hiphop: +aiGenre.hiphop, electronic: +aiGenre.electronic, folk: +aiGenre.folk }
      : null;

    const svg = buildExportSvg({
      title: song.title, bandName: song.band.name,
      albumTitle: song.album?.title ?? null, year: song.album?.year ?? null,
      spectrumScores, genreScores, theme, format,
    });

    const W = 1080;
    const H = format === 'story' ? 1920 : 1080;
    const resvg = new Resvg(svg, { font: { loadSystemFonts: true }, fitTo: { mode: 'width', value: W } });
    const png = resvg.render().asPng();

    const filename = `${song.band.name.replace(/[^a-z0-9]/gi, '-')}-${song.title.replace(/[^a-z0-9]/gi, '-')}-${format}-${theme}.png`.toLowerCase();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Image-Width', String(W));
    res.setHeader('X-Image-Height', String(H));
    res.end(png);
  } catch (e) { next(e); }
});

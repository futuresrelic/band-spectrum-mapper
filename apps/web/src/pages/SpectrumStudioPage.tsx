/**
 * Spectrum Studio — admin data visualisation lab.
 * 10 chart types · universal field system (spectrum + genres + themes + metadata)
 * Per-field colours · live style panel · PNG export · patch-bay field mapper.
 */
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ─── Canvas dimensions ────────────────────────────────────────────────────────

const VW = 900;
const VH = 560;

// ─── Field catalog ────────────────────────────────────────────────────────────
// Every numeric dimension that can be mapped to a chart axis.
// min/max define the natural scale for normalisation to 0-10 on radar-style charts.

interface StudioField {
  id:    string;
  label: string;
  short: string;   // ≤ 10 chars — used inside chart cells / labels
  group: string;
  color: string;
  min:   number;
  max:   number;
}

const FIELD_CATALOG: StudioField[] = [
  // ── Spectrum (psychological scores, 0–10)
  { id: 'aggression',  label: 'Aggression',    short: 'Aggr',     group: 'Spectrum', color: '#E5484D', min: 0, max: 10 },
  { id: 'complexity',  label: 'Complexity',    short: 'Cmpx',     group: 'Spectrum', color: '#8B5CF6', min: 0, max: 10 },
  { id: 'atmosphere',  label: 'Atmosphere',    short: 'Atmo',     group: 'Spectrum', color: '#06B6D4', min: 0, max: 10 },
  { id: 'emotion',     label: 'Emotion',       short: 'Emot',     group: 'Spectrum', color: '#F59E0B', min: 0, max: 10 },
  { id: 'psychedelic', label: 'Psychedelic',   short: 'Psych',    group: 'Spectrum', color: '#22C55E', min: 0, max: 10 },
  { id: 'concept',     label: 'Concept',       short: 'Conc',     group: 'Spectrum', color: '#F97316', min: 0, max: 10 },

  // ── AI Genre Accessibility (0–10)
  { id: 'genre_metal',      label: 'Metal (AI)',      short: 'Metal',  group: 'AI Genres', color: '#64748B', min: 0, max: 10 },
  { id: 'genre_rock',       label: 'Rock (AI)',       short: 'Rock',   group: 'AI Genres', color: '#FB923C', min: 0, max: 10 },
  { id: 'genre_pop',        label: 'Pop (AI)',        short: 'Pop',    group: 'AI Genres', color: '#F472B6', min: 0, max: 10 },
  { id: 'genre_hiphop',     label: 'Hip-hop (AI)',    short: 'HipHop', group: 'AI Genres', color: '#818CF8', min: 0, max: 10 },
  { id: 'genre_electronic', label: 'Electronic (AI)', short: 'Elec',   group: 'AI Genres', color: '#22D3EE', min: 0, max: 10 },
  { id: 'genre_folk',       label: 'Folk/Indie (AI)', short: 'Folk',   group: 'AI Genres', color: '#A3E635', min: 0, max: 10 },

  // ── Philosophical Themes (0–10, scaled from AI score 0–1)
  { id: 'theme_perception',    label: 'Perception',     short: 'Percep',  group: 'Themes', color: '#34c8e8', min: 0, max: 10 },
  { id: 'theme_ego_death',     label: 'Ego Death',      short: 'EgoDth',  group: 'Themes', color: '#bf5af2', min: 0, max: 10 },
  { id: 'theme_introspection', label: 'Introspection',  short: 'Intro',   group: 'Themes', color: '#bf5af2', min: 0, max: 10 },
  { id: 'theme_shadow_self',   label: 'Shadow Self',    short: 'Shadow',  group: 'Themes', color: '#bf5af2', min: 0, max: 10 },
  { id: 'theme_acceptance',    label: 'Acceptance',     short: 'Accept',  group: 'Themes', color: '#bf5af2', min: 0, max: 10 },
  { id: 'theme_transcendence', label: 'Transcendence',  short: 'Trans',   group: 'Themes', color: '#ff375f', min: 0, max: 10 },
  { id: 'theme_spirituality',  label: 'Spirituality',   short: 'Spirit',  group: 'Themes', color: '#ff375f', min: 0, max: 10 },
  { id: 'theme_evolution',     label: 'Evolution',      short: 'Evolve',  group: 'Themes', color: '#ff9500', min: 0, max: 10 },
  { id: 'theme_rebirth',       label: 'Rebirth',        short: 'Rebirth', group: 'Themes', color: '#ff9500', min: 0, max: 10 },
  { id: 'theme_catharsis',     label: 'Catharsis',      short: 'Cathar',  group: 'Themes', color: '#fbbf24', min: 0, max: 10 },
  { id: 'theme_communication', label: 'Communication',  short: 'Commun',  group: 'Themes', color: '#30d158', min: 0, max: 10 },
  { id: 'theme_unity',         label: 'Unity',          short: 'Unity',   group: 'Themes', color: '#30d158', min: 0, max: 10 },
  { id: 'theme_warning',       label: 'Warning/Caution',short: 'Warning', group: 'Themes', color: '#ff3a3a', min: 0, max: 10 },
  { id: 'theme_satire',        label: 'Satire',         short: 'Satire',  group: 'Themes', color: '#ff3a3a', min: 0, max: 10 },
  { id: 'theme_mortality',     label: 'Mortality',      short: 'Mortal',  group: 'Themes', color: '#94a3b8', min: 0, max: 10 },
  { id: 'theme_apocalypse',    label: 'Apocalypse',     short: 'Apoc',    group: 'Themes', color: '#94a3b8', min: 0, max: 10 },

  // ── Song Metadata (raw values, normalised against min/max for radar-style charts)
  { id: 'durationSeconds', label: 'Duration (s)',   short: 'Duration', group: 'Metadata', color: '#94a3b8', min: 0,    max: 600  },
  { id: 'trackNumber',     label: 'Track Number',   short: 'Track #',  group: 'Metadata', color: '#64748b', min: 1,    max: 25   },
  { id: 'releaseYear',     label: 'Release Year',   short: 'Year',     group: 'Metadata', color: '#78716c', min: 1965, max: 2030 },
];

const FIELD_MAP = new Map<string, StudioField>(FIELD_CATALOG.map((f) => [f.id, f]));

// Field groups for the browser UI (order matters)
const FIELD_GROUPS = ['Spectrum', 'AI Genres', 'Themes', 'Metadata'];

// Default active fields = all Spectrum fields
const DEFAULT_ACTIVE = FIELD_CATALOG.filter((f) => f.group === 'Spectrum').map((f) => f.id);

// ─── Viz types ────────────────────────────────────────────────────────────────

const VIZ_TYPES = [
  { id: 'radar',        label: 'Radar',       icon: '⬡', desc: 'Spider chart — one polygon per song' },
  { id: 'columns',      label: 'Columns',     icon: '▉', desc: 'Grouped vertical bars per song' },
  { id: 'bars',         label: 'Bars',        icon: '▬', desc: 'Horizontal bars — good for many songs' },
  { id: 'waveform',     label: 'Waveform',    icon: '∿', desc: 'Smooth area waves across songs' },
  { id: 'oscilloscope', label: 'Oscilloscope',icon: '◎', desc: 'Lissajous — two fields as X/Y trace' },
  { id: 'vectorscope',  label: 'Vectorscope', icon: '◯', desc: 'Polar scatter — broadcast-style scope' },
  { id: 'heatmap',      label: 'Heatmap',     icon: '⊞', desc: 'Colour-coded grid of scores' },
  { id: 'scatter',      label: 'Scatter',     icon: '⁘', desc: 'Two fields as X/Y, coloured by band' },
  { id: 'pie',          label: 'Pie/Donut',   icon: '◔', desc: 'Average distribution of active fields' },
  { id: 'bubble',       label: 'Bubble',      icon: '⊙', desc: 'Scatter with third field as bubble size' },
  { id: 'fibonacci',    label: 'Fibonacci',   icon: '🌀', desc: 'Golden angle phyllotaxis — songs spiral outward like sunflower seeds' },
  { id: 'fractal',      label: 'Fractal',     icon: '🌿', desc: 'Recursive golden-ratio tree — band → album → song branches' },
] as const;

type VizType = typeof VIZ_TYPES[number]['id'];

// ─── Style ────────────────────────────────────────────────────────────────────

interface StudioStyle {
  bg:         string;
  fg:         string;
  gridColor:  string;
  showGrid:   boolean;
  showLabels: boolean;
  showLegend: boolean;
  showTitle:  boolean;
  titleText:  string;
  fillAlpha:  number;
  lineWidth:  number;
  dotRadius:  number;
}

const DEFAULT_STYLE: StudioStyle = {
  bg:         '#060d1a',
  fg:         '#e2e8f0',
  gridColor:  '#ffffff',
  showGrid:   true,
  showLabels: true,
  showLegend: true,
  showTitle:  true,
  titleText:  'Band Spectrum Analysis',
  fillAlpha:  0.18,
  lineWidth:  2,
  dotRadius:  5,
};

const STYLE_KEY = 'bsm-studio-v2';

function loadStyle(): StudioStyle {
  try {
    const s = localStorage.getItem(STYLE_KEY);
    if (s) return { ...DEFAULT_STYLE, ...JSON.parse(s) as Partial<StudioStyle> };
  } catch { /* ignore */ }
  return DEFAULT_STYLE;
}

// ─── API types ────────────────────────────────────────────────────────────────

interface SongData {
  id:         string;
  title:      string;
  bandId:     string;
  bandName:   string;
  albumTitle: string | null;
  hasScore:   boolean;
  fields:     Record<string, number | null>;
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function hex2rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function fieldColor(field: StudioField): string {
  return field.color;
}

// Normalise a raw field value to 0–10 using the field's declared min/max.
function norm(song: SongData, field: StudioField): number {
  const raw = song.fields[field.id];
  if (raw === null || raw === undefined) return 0;
  const range = field.max - field.min;
  if (range === 0) return 5;
  return Math.min(10, Math.max(0, ((raw - field.min) / range) * 10));
}

const BAND_PALETTE = [
  '#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6',
  '#e67e22','#1abc9c','#e91e63','#00bcd4','#ff5722',
];

function buildBandColors(songs: SongData[]): Map<string, string> {
  const m = new Map<string, string>();
  let i = 0;
  for (const s of songs) {
    if (!m.has(s.bandId)) {
      m.set(s.bandId, BAND_PALETTE[i % BAND_PALETTE.length] ?? '#888');
      i++;
    }
  }
  return m;
}

/** Maps a 0–10 score to a perceptual heatmap: indigo → cyan → lime → amber → red */
function scoreToGradient(v: number): string {
  const t = Math.min(1, Math.max(0, v / 10));
  const stops: [number, number, number][] = [
    [ 79,  70, 229],  // 0.00 — indigo
    [  6, 182, 212],  // 0.25 — cyan
    [132, 204,  22],  // 0.55 — lime
    [245, 158,  11],  // 0.75 — amber
    [239,  68,  68],  // 1.00 — red
  ];
  const segs = stops.length - 1;
  const seg  = Math.min(segs - 1, Math.floor(t * segs));
  const lo   = stops[seg]!;
  const hi   = stops[seg + 1]!;
  const f    = t * segs - seg;
  return `rgb(${Math.round(lo[0] + (hi[0] - lo[0]) * f)},${Math.round(lo[1] + (hi[1] - lo[1]) * f)},${Math.round(lo[2] + (hi[2] - lo[2]) * f)})`;
}

// ─── Shared viz props ─────────────────────────────────────────────────────────

interface VizProps {
  songs:   SongData[];
  fields:  StudioField[];  // active fields for multi-axis charts
  style:   StudioStyle;
  fieldX:  StudioField;
  fieldY:  StudioField;
  fieldZ:  StudioField;
}

function EmptyMsg({ msg }: { msg: string }) {
  return (
    <text x={VW / 2} y={VH / 2} textAnchor="middle" dominantBaseline="middle"
      fill="#ffffff" fillOpacity={0.25} fontSize={13} fontFamily="Inter, system-ui">
      {msg}
    </text>
  );
}

// ─── 1 · Radar ────────────────────────────────────────────────────────────────

function RadarViz({ songs, fields, style }: VizProps) {
  if (!songs.length || fields.length < 3) return <EmptyMsg msg="Select ≥ 3 fields and at least one song" />;
  const cx = VW / 2, cy = VH / 2 + 12;
  const R  = Math.min(VW, VH) * 0.29;
  const n  = fields.length;

  const pt = (i: number, r: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const polygon = (s: SongData) =>
    fields.map((f, i) => { const p = pt(i, (norm(s, f) / 10) * R); return `${p.x},${p.y}`; }).join(' ');

  const bcm   = buildBandColors(songs);
  const shown = songs.slice(0, 12);
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <g>
      {style.showGrid && rings.map((v) => (
        <polygon key={v}
          points={fields.map((_, i) => { const p = pt(i, v * R); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke={style.gridColor} strokeOpacity={0.09} strokeWidth={1} />
      ))}
      {fields.map((_, i) => { const tip = pt(i, R); return (
        <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y}
          stroke={style.gridColor} strokeOpacity={0.14} strokeWidth={1} />
      ); })}
      {style.showGrid && style.showLabels && rings.map((v) => {
        const p = pt(1, v * R);
        return (
          <text key={v} x={p.x + 4} y={p.y - 3} fill={style.fg} opacity={0.25}
            fontSize={9} fontFamily="Inter, system-ui">{v * 10}</text>
        );
      })}
      {style.showLabels && fields.map((f, i) => {
        const p = pt(i, R + 22);
        return (
          <text key={f.id} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill={fieldColor(f)} fontSize={11} fontWeight="700" fontFamily="Inter, system-ui">
            {f.short}
          </text>
        );
      })}
      {shown.map((s) => {
        const color = bcm.get(s.bandId) ?? '#888';
        return (
          <polygon key={s.id} points={polygon(s)}
            fill={hex2rgba(color, style.fillAlpha)} stroke={color}
            strokeWidth={style.lineWidth} strokeOpacity={0.88} />
        );
      })}
    </g>
  );
}

// ─── 2 · Columns (vertical grouped bars) ─────────────────────────────────────

function ColumnsViz({ songs, fields, style }: VizProps) {
  if (!songs.length || !fields.length) return <EmptyMsg msg="Select artists and fields" />;
  const shown = songs.slice(0, 20);
  const pad   = { t: 55, b: 70, l: 36, r: 16 };
  const cw    = VW - pad.l - pad.r;
  const ch    = VH - pad.t - pad.b;
  const nS    = shown.length;
  const nF    = fields.length;
  const gW    = cw / nS;
  const barW  = Math.max(3, (gW * 0.82) / nF);
  const gap   = Math.max(0, (gW * 0.82 - barW * nF) / Math.max(1, nF - 1));
  const gPad  = gW * 0.09;

  return (
    <g transform={`translate(${pad.l},${pad.t})`}>
      {style.showGrid && [2, 4, 6, 8, 10].map((v) => {
        const y = ch - (v / 10) * ch;
        return (
          <g key={v}>
            <line x1={0} y1={y} x2={cw} y2={y} stroke={style.gridColor} strokeOpacity={0.07} />
            {style.showLabels && (
              <text x={-5} y={y} textAnchor="end" dominantBaseline="middle"
                fill={style.fg} opacity={0.35} fontSize={9} fontFamily="Inter, system-ui">{v}</text>
            )}
          </g>
        );
      })}
      <line x1={0} y1={ch} x2={cw} y2={ch} stroke={style.gridColor} strokeOpacity={0.2} />
      {shown.map((song, si) => {
        const gx = si * gW + gPad;
        return (
          <g key={song.id}>
            {fields.map((f, fi) => {
              const val = norm(song, f);
              const bh  = (val / 10) * ch;
              const bx  = gx + fi * (barW + gap);
              return (
                <g key={f.id}>
                  <rect x={bx} y={ch - bh} width={barW} height={Math.max(1, bh)}
                    fill={fieldColor(f)} opacity={0.85} rx={2} />
                  {style.showLabels && bh > 16 && (
                    <text x={bx + barW / 2} y={ch - bh + 10} textAnchor="middle"
                      fill="#fff" opacity={0.75} fontSize={8} fontFamily="Inter, system-ui">
                      {val.toFixed(1)}
                    </text>
                  )}
                </g>
              );
            })}
            {style.showLabels && (
              <text x={gx + (gW * 0.82) / 2} y={ch + 14} textAnchor="middle"
                fill={style.fg} opacity={0.5} fontSize={8} fontFamily="Inter, system-ui">
                {song.title.length > 11 ? song.title.slice(0, 10) + '…' : song.title}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ─── 3 · Bars (horizontal) ────────────────────────────────────────────────────

function BarsViz({ songs, fields, style }: VizProps) {
  if (!songs.length || !fields.length) return <EmptyMsg msg="Select artists and fields" />;
  const shown = songs.slice(0, 18);
  const labW  = 108;
  const pad   = { t: 48, b: 28, l: labW + 8, r: 24 };
  const cw    = VW - pad.l - pad.r;
  const ch    = VH - pad.t - pad.b;
  const nS    = shown.length;
  const nF    = fields.length;
  const gH    = ch / nS;
  const barH  = Math.max(3, (gH * 0.82) / nF);
  const gap   = Math.max(0, (gH * 0.82 - barH * nF) / Math.max(1, nF - 1));
  const gPad  = gH * 0.09;

  return (
    <g transform={`translate(${pad.l},${pad.t})`}>
      {style.showGrid && [2, 4, 6, 8, 10].map((v) => {
        const x = (v / 10) * cw;
        return (
          <g key={v}>
            <line x1={x} y1={0} x2={x} y2={ch} stroke={style.gridColor} strokeOpacity={0.07} />
            {style.showLabels && (
              <text x={x} y={ch + 13} textAnchor="middle"
                fill={style.fg} opacity={0.35} fontSize={9} fontFamily="Inter, system-ui">{v}</text>
            )}
          </g>
        );
      })}
      <line x1={0} y1={0} x2={0} y2={ch} stroke={style.gridColor} strokeOpacity={0.2} />
      {shown.map((song, si) => {
        const gy = si * gH + gPad;
        return (
          <g key={song.id}>
            {style.showLabels && (
              <text x={-6} y={gy + (gH * 0.82) / 2} textAnchor="end" dominantBaseline="middle"
                fill={style.fg} opacity={0.55} fontSize={9} fontFamily="Inter, system-ui">
                {song.title.length > 14 ? song.title.slice(0, 13) + '…' : song.title}
              </text>
            )}
            {fields.map((f, fi) => {
              const val = norm(song, f);
              const bw  = (val / 10) * cw;
              const by  = gy + fi * (barH + gap);
              return (
                <g key={f.id}>
                  <rect x={0} y={by} width={Math.max(1, bw)} height={barH}
                    fill={fieldColor(f)} opacity={0.85} rx={2} />
                  {style.showLabels && bw > 20 && (
                    <text x={bw - 4} y={by + barH / 2} textAnchor="end" dominantBaseline="middle"
                      fill="#fff" opacity={0.75} fontSize={8} fontFamily="Inter, system-ui">
                      {val.toFixed(1)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// ─── 4 · Waveform ─────────────────────────────────────────────────────────────

function WaveformViz({ songs, fields, style }: VizProps) {
  if (songs.length < 2 || !fields.length) return <EmptyMsg msg="Select ≥ 2 songs and at least one field" />;
  const pad  = { t: 52, b: 52, l: 32, r: 18 };
  const cw   = VW - pad.l - pad.r;
  const ch   = VH - pad.t - pad.b;
  const step = cw / (songs.length - 1);

  const pts = (f: StudioField) => songs.map((s, i) => ({
    x: i * step,
    y: ch - (norm(s, f) / 10) * ch,
  }));

  return (
    <g transform={`translate(${pad.l},${pad.t})`}>
      {style.showGrid && [2, 4, 6, 8, 10].map((v) => {
        const y = ch - (v / 10) * ch;
        return (
          <g key={v}>
            <line x1={0} y1={y} x2={cw} y2={y} stroke={style.gridColor} strokeOpacity={0.07} />
            {style.showLabels && (
              <text x={-5} y={y} textAnchor="end" dominantBaseline="middle"
                fill={style.fg} opacity={0.3} fontSize={9} fontFamily="Inter, system-ui">{v}</text>
            )}
          </g>
        );
      })}
      <line x1={0} y1={ch} x2={cw} y2={ch} stroke={style.gridColor} strokeOpacity={0.18} />
      {fields.map((f) => {
        const points = pts(f);
        const col    = fieldColor(f);
        const linePath = points.map((p, i) => {
          if (i === 0) return `M ${p.x},${p.y}`;
          const prev = points[i - 1]!;
          const cpx  = (prev.x + p.x) / 2;
          return `C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
        }).join(' ');
        const first = points[0]!, last = points[points.length - 1]!;
        const areaPath = `${linePath} L ${last.x},${ch} L ${first.x},${ch} Z`;
        return (
          <g key={f.id}>
            <path d={areaPath} fill={hex2rgba(col, style.fillAlpha)} />
            <path d={linePath} fill="none" stroke={col} strokeWidth={style.lineWidth} strokeOpacity={0.9} />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={style.dotRadius * 0.55}
                fill={col} opacity={0.75} />
            ))}
          </g>
        );
      })}
      {style.showLabels && songs.map((s, i) => (
        <text key={s.id} x={i * step} y={ch + 14} textAnchor="middle"
          fill={style.fg} opacity={0.4} fontSize={8} fontFamily="Inter, system-ui"
          transform={songs.length > 10 ? `rotate(-45,${i * step},${ch + 14})` : undefined}>
          {s.title.length > 9 ? s.title.slice(0, 8) + '…' : s.title}
        </text>
      ))}
    </g>
  );
}

// ─── 5 · Oscilloscope (Lissajous) ────────────────────────────────────────────

function OscilloscopeViz({ songs, style, fieldX, fieldY }: VizProps) {
  if (songs.length < 2) return <EmptyMsg msg="Select ≥ 2 songs for oscilloscope" />;
  const cx = VW / 2, cy = VH / 2;
  const R  = Math.min(VW, VH) * 0.38;
  const phColor = '#00ff88';

  const points = songs.map((s) => ({
    x: cx + ((norm(s, fieldX) - 5) / 5) * R,
    y: cy - ((norm(s, fieldY) - 5) / 5) * R,
  }));

  const linePath = points.map((p, i) => {
    if (i === 0) return `M ${p.x},${p.y}`;
    const prev = points[i - 1]!;
    const cpx  = (prev.x + p.x) / 2;
    return `C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
  }).join(' ');

  return (
    <g>
      <defs>
        <filter id="scopeGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {style.showGrid && [0.25, 0.5, 0.75, 1.0].map((v) => (
        <circle key={v} cx={cx} cy={cy} r={R * v}
          fill="none" stroke={phColor} strokeOpacity={0.08} strokeWidth={1} />
      ))}
      {style.showGrid && [0, 45, 90, 135].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <line key={deg}
            x1={cx - R * Math.cos(a)} y1={cy - R * Math.sin(a)}
            x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)}
            stroke={phColor} strokeOpacity={0.07} strokeWidth={1} />
        );
      })}
      <path d={linePath} fill="none" stroke={phColor} strokeWidth={style.lineWidth * 4} opacity={0.12} />
      <path d={linePath} fill="none" stroke={phColor}
        strokeWidth={style.lineWidth} opacity={0.92} filter="url(#scopeGlow)" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={style.dotRadius * 0.7}
          fill={phColor} opacity={0.65} filter="url(#scopeGlow)" />
      ))}
      {style.showLabels && (
        <>
          <text x={cx + R + 6} y={cy + 4} dominantBaseline="middle"
            fill={phColor} opacity={0.5} fontSize={11} fontFamily="Inter, system-ui">
            {fieldX.short} →
          </text>
          <text x={cx} y={cy - R - 10} textAnchor="middle"
            fill={phColor} opacity={0.5} fontSize={11} fontFamily="Inter, system-ui">
            ↑ {fieldY.short}
          </text>
        </>
      )}
    </g>
  );
}

// ─── 6 · Vectorscope (polar) ─────────────────────────────────────────────────

function VectorscopeViz({ songs, style, fieldX, fieldY }: VizProps) {
  const cx = VW / 2, cy = VH / 2;
  const R  = Math.min(VW, VH) * 0.36;
  const dotColor = '#00ccff';

  return (
    <g>
      <defs>
        <filter id="vscopeGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>
      </defs>
      {style.showGrid && [0.25, 0.5, 0.75, 1.0].map((v) => (
        <circle key={v} cx={cx} cy={cy} r={R * v}
          fill="none" stroke={dotColor} strokeOpacity={0.1} strokeWidth={1} />
      ))}
      {style.showGrid && [0, 30, 60, 90, 120, 150].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return (
          <line key={deg}
            x1={cx - R * Math.cos(a)} y1={cy - R * Math.sin(a)}
            x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)}
            stroke={dotColor} strokeOpacity={0.07} strokeWidth={1} />
        );
      })}
      <circle cx={cx} cy={cy} r={R}
        fill="none" stroke={dotColor} strokeOpacity={0.2} strokeWidth={1.5} />
      {songs.map((s) => {
        const xV  = norm(s, fieldX);
        const yV  = norm(s, fieldY);
        const mag = Math.sqrt((xV - 5) ** 2 + (yV - 5) ** 2) / 7.07;
        const ang = Math.atan2(-(yV - 5), xV - 5);
        const px  = cx + mag * R * Math.cos(ang);
        const py  = cy + mag * R * Math.sin(ang);
        return (
          <g key={s.id}>
            <circle cx={px} cy={py} r={style.dotRadius * 2.4} fill={dotColor} opacity={0.1} />
            <circle cx={px} cy={py} r={style.dotRadius}       fill={dotColor} opacity={0.75} filter="url(#vscopeGlow)" />
          </g>
        );
      })}
      {style.showLabels && (
        <>
          <text x={cx + R + 6} y={cy + 4} dominantBaseline="middle"
            fill={dotColor} opacity={0.45} fontSize={11} fontFamily="Inter, system-ui">
            {fieldX.short} →
          </text>
          <text x={cx} y={cy - R - 10} textAnchor="middle"
            fill={dotColor} opacity={0.45} fontSize={11} fontFamily="Inter, system-ui">
            ↑ {fieldY.short}
          </text>
        </>
      )}
    </g>
  );
}

// ─── 7 · Heatmap ─────────────────────────────────────────────────────────────

function HeatmapViz({ songs, fields, style }: VizProps) {
  if (!songs.length || !fields.length) return <EmptyMsg msg="Select artists and fields" />;
  const shown  = songs.slice(0, 30);
  const labW   = 112;
  const pad    = { t: 52, b: 16, l: labW, r: 16 };
  const cw     = VW - pad.l - pad.r;
  const ch     = VH - pad.t - pad.b;
  const cellW  = cw / fields.length;
  const cellH  = Math.min(28, ch / shown.length);

  return (
    <g transform={`translate(${pad.l},${pad.t})`}>
      {fields.map((f, i) => (
        <text key={f.id} x={i * cellW + cellW / 2} y={-9} textAnchor="middle"
          fill={fieldColor(f)} fontSize={10} fontWeight="700" fontFamily="Inter, system-ui">
          {f.short}
        </text>
      ))}
      {shown.map((song, si) => (
        <g key={song.id}>
          {style.showLabels && (
            <text x={-6} y={si * cellH + cellH / 2} textAnchor="end" dominantBaseline="middle"
              fill={style.fg} opacity={0.5} fontSize={9} fontFamily="Inter, system-ui">
              {song.title.length > 16 ? song.title.slice(0, 15) + '…' : song.title}
            </text>
          )}
          {fields.map((f, fi) => {
            const val       = norm(song, f);
            const intensity = val / 10;
            return (
              <g key={f.id}>
                <rect x={fi * cellW + 1} y={si * cellH + 1}
                  width={cellW - 2} height={cellH - 2}
                  fill={hex2rgba(fieldColor(f), intensity * 0.88 + 0.04)} rx={2} />
                {style.showLabels && cellH >= 14 && (
                  <text x={fi * cellW + cellW / 2} y={si * cellH + cellH / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="#fff" opacity={intensity > 0.35 ? 0.9 : 0.35}
                    fontSize={9} fontFamily="Inter, system-ui, monospace">
                    {val.toFixed(1)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

// ─── 8 · Scatter ─────────────────────────────────────────────────────────────

function ScatterViz({ songs, style, fieldX, fieldY }: VizProps) {
  const pad = { t: 48, b: 58, l: 58, r: 28 };
  const cw  = VW - pad.l - pad.r;
  const ch  = VH - pad.t - pad.b;
  const bcm = buildBandColors(songs);
  const px  = (v: number) => (v / 10) * cw;
  const py  = (v: number) => ch - (v / 10) * ch;

  return (
    <g transform={`translate(${pad.l},${pad.t})`}>
      {style.showGrid && [2, 4, 6, 8, 10].map((v) => (
        <g key={v}>
          <line x1={px(v)} y1={0} x2={px(v)} y2={ch} stroke={style.gridColor} strokeOpacity={0.06} />
          <line x1={0} y1={py(v)} x2={cw}    y2={py(v)} stroke={style.gridColor} strokeOpacity={0.06} />
          {style.showLabels && (
            <>
              <text x={px(v)} y={ch + 14} textAnchor="middle"
                fill={style.fg} opacity={0.3} fontSize={9} fontFamily="Inter, system-ui">{v}</text>
              <text x={-5} y={py(v)} textAnchor="end" dominantBaseline="middle"
                fill={style.fg} opacity={0.3} fontSize={9} fontFamily="Inter, system-ui">{v}</text>
            </>
          )}
        </g>
      ))}
      <line x1={0} y1={ch} x2={cw} y2={ch} stroke={style.gridColor} strokeOpacity={0.2} />
      <line x1={0} y1={0} x2={0}   y2={ch} stroke={style.gridColor} strokeOpacity={0.2} />
      {songs.map((s) => {
        const x   = px(norm(s, fieldX));
        const y   = py(norm(s, fieldY));
        const col = bcm.get(s.bandId) ?? '#888';
        return (
          <g key={s.id}>
            <circle cx={x} cy={y} r={style.dotRadius * 2.2} fill={col} opacity={0.1} />
            <circle cx={x} cy={y} r={style.dotRadius}       fill={col} opacity={0.82} />
          </g>
        );
      })}
      {style.showLabels && (
        <>
          <text x={cw / 2} y={ch + 33} textAnchor="middle"
            fill={fieldColor(fieldX)} fontSize={12} fontWeight="600" fontFamily="Inter, system-ui">
            {fieldX.label}
          </text>
          <text x={-38} y={ch / 2} textAnchor="middle" dominantBaseline="middle"
            fill={fieldColor(fieldY)} fontSize={12} fontWeight="600" fontFamily="Inter, system-ui"
            transform={`rotate(-90,-38,${ch / 2})`}>
            {fieldY.label}
          </text>
        </>
      )}
    </g>
  );
}

// ─── 9 · Pie / Donut ─────────────────────────────────────────────────────────

function PieViz({ songs, fields, style }: VizProps) {
  if (!songs.length || !fields.length) return <EmptyMsg msg="Select artists and fields" />;
  const cx     = VW / 2, cy = VH / 2;
  const outerR = Math.min(VW, VH) * 0.33;
  const innerR = outerR * 0.48;

  const avgs  = fields.map((f) => ({
    f,
    val: songs.reduce((s, song) => s + norm(song, f), 0) / songs.length,
  }));
  const total = avgs.reduce((s, { val }) => s + val, 0);
  if (total === 0) return <EmptyMsg msg="No data available" />;

  let angle = -Math.PI / 2;
  const slices = avgs.map(({ f, val }) => {
    const sweep = (val / total) * 2 * Math.PI;
    const s = angle;
    angle += sweep;
    return { f, val, start: s, end: angle, sweep };
  });

  const arc = (s: number, e: number, oR: number, iR: number) => {
    const x1 = cx + oR * Math.cos(s), y1 = cy + oR * Math.sin(s);
    const x2 = cx + oR * Math.cos(e), y2 = cy + oR * Math.sin(e);
    const x3 = cx + iR * Math.cos(e), y3 = cy + iR * Math.sin(e);
    const x4 = cx + iR * Math.cos(s), y4 = cy + iR * Math.sin(s);
    const lg  = e - s > Math.PI ? 1 : 0;
    return `M ${x1},${y1} A ${oR},${oR} 0 ${lg} 1 ${x2},${y2} L ${x3},${y3} A ${iR},${iR} 0 ${lg} 0 ${x4},${y4} Z`;
  };

  return (
    <g>
      {slices.map(({ f, val, start, end, sweep }) => {
        const col = fieldColor(f);
        const mid = start + sweep / 2;
        const lR  = outerR + 22;
        const lx  = cx + lR * Math.cos(mid);
        const ly  = cy + lR * Math.sin(mid);
        const pct = Math.round((val / total) * 100);
        return (
          <g key={f.id}>
            <path d={arc(start, end, outerR, innerR)}
              fill={col} opacity={0.88} stroke={style.bg} strokeWidth={2} />
            {style.showLabels && sweep > 0.28 && (
              <text x={lx} y={ly}
                textAnchor={Math.cos(mid) > 0 ? 'start' : 'end'}
                dominantBaseline="middle"
                fill={col} fontSize={11} fontWeight="600" fontFamily="Inter, system-ui">
                {f.short} {pct}%
              </text>
            )}
          </g>
        );
      })}
      <text x={cx} y={cy - 7} textAnchor="middle"
        fill={style.fg} opacity={0.65} fontSize={13} fontWeight="600" fontFamily="Inter, system-ui">Avg</text>
      <text x={cx} y={cy + 12} textAnchor="middle"
        fill={style.fg} opacity={0.4} fontSize={11} fontFamily="Inter, system-ui">
        {songs.length} song{songs.length !== 1 ? 's' : ''}
      </text>
    </g>
  );
}

// ─── 10 · Bubble ─────────────────────────────────────────────────────────────

function BubbleViz({ songs, style, fieldX, fieldY, fieldZ }: VizProps) {
  const pad   = { t: 48, b: 58, l: 58, r: 28 };
  const cw    = VW - pad.l - pad.r;
  const ch    = VH - pad.t - pad.b;
  const bcm   = buildBandColors(songs);
  const MAX_R = 38, MIN_R = 4;
  const px    = (v: number) => (v / 10) * cw;
  const py    = (v: number) => ch - (v / 10) * ch;
  const pr    = (v: number) => MIN_R + (v / 10) * (MAX_R - MIN_R);

  return (
    <g transform={`translate(${pad.l},${pad.t})`}>
      {style.showGrid && [2, 4, 6, 8, 10].map((v) => (
        <g key={v}>
          <line x1={px(v)} y1={0} x2={px(v)} y2={ch} stroke={style.gridColor} strokeOpacity={0.06} />
          <line x1={0} y1={py(v)} x2={cw} y2={py(v)} stroke={style.gridColor} strokeOpacity={0.06} />
        </g>
      ))}
      <line x1={0} y1={ch} x2={cw} y2={ch} stroke={style.gridColor} strokeOpacity={0.2} />
      <line x1={0} y1={0} x2={0}   y2={ch} stroke={style.gridColor} strokeOpacity={0.2} />
      {songs.map((s) => {
        const x   = px(norm(s, fieldX));
        const y   = py(norm(s, fieldY));
        const r   = pr(norm(s, fieldZ));
        const col = bcm.get(s.bandId) ?? '#888';
        return (
          <circle key={s.id} cx={x} cy={y} r={r}
            fill={hex2rgba(col, style.fillAlpha + 0.28)}
            stroke={col} strokeWidth={1.5} strokeOpacity={0.82} />
        );
      })}
      {style.showLabels && (
        <>
          <text x={cw / 2} y={ch + 33} textAnchor="middle"
            fill={fieldColor(fieldX)} fontSize={12} fontWeight="600" fontFamily="Inter, system-ui">
            {fieldX.label}
          </text>
          <text x={-38} y={ch / 2} textAnchor="middle" dominantBaseline="middle"
            fill={fieldColor(fieldY)} fontSize={12} fontWeight="600" fontFamily="Inter, system-ui"
            transform={`rotate(-90,-38,${ch / 2})`}>
            {fieldY.label}
          </text>
          <text x={cw - 4} y={12} textAnchor="end"
            fill={fieldColor(fieldZ)} opacity={0.5} fontSize={10} fontFamily="Inter, system-ui">
            size: {fieldZ.label}
          </text>
        </>
      )}
    </g>
  );
}

// ─── 11 · Fibonacci Spiral ───────────────────────────────────────────────────

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399 rad (137.5°)
const FIB_SCALE = 14;

function FibonacciViz({ songs, style, fieldX, fieldY, fieldZ }: VizProps) {
  if (!songs.length) return <EmptyMsg msg="Select artists to begin" />;
  const cx = VW / 2, cy = VH / 2;
  const bcm = buildBandColors(songs);

  // RAF-driven rotation — dots rotate, labels stay horizontal
  const [rotDeg, setRotDeg] = useState(0);
  useEffect(() => {
    let raf: number;
    const t0 = performance.now();
    function tick(t: number) {
      setRotDeg(((t - t0) / 300_000) * 360 % 360);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rotRad = (rotDeg * Math.PI) / 180;

  // Sort ascending by X so highest-scoring songs spiral outward (most prominent)
  const sorted = [...songs].sort((a, b) => norm(a, fieldX) - norm(b, fieldX));
  const shown  = sorted.slice(0, 300);
  const maxR   = FIB_SCALE * Math.sqrt(shown.length);

  const fibRings = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
    .map((n) => FIB_SCALE * Math.sqrt(n))
    .filter((r) => r <= maxR);

  return (
    <g>
      <defs>
        <filter id="fibGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <linearGradient id="fibLegGrad" x1="0" x2="1">
          <stop offset="0%"   stopColor="#4f46e5" />
          <stop offset="25%"  stopColor="#06b6d4" />
          <stop offset="55%"  stopColor="#84cc16" />
          <stop offset="75%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      <g transform={`translate(${cx},${cy})`}>
        {/* Fibonacci guide rings */}
        {style.showGrid && fibRings.map((r) => (
          <circle key={r} cx={0} cy={0} r={r}
            fill="none" stroke={style.gridColor} strokeOpacity={0.06} strokeWidth={0.5} />
        ))}

        {/* Rotating dots only — no animateTransform */}
        <g transform={`rotate(${rotDeg})`}>
          {shown.map((s, i) => {
            const r      = FIB_SCALE * Math.sqrt(i + 1);
            const theta  = i * GOLDEN_ANGLE;
            const x      = r * Math.cos(theta);
            const y      = r * Math.sin(theta);
            const xVal   = norm(s, fieldX);
            const yVal   = norm(s, fieldY);
            const zVal   = norm(s, fieldZ);
            const sz     = (style.dotRadius * 0.5) + (xVal / 10) * (style.dotRadius * 2);
            const fillC  = scoreToGradient(yVal);
            const op     = 0.35 + (zVal / 10) * 0.6;
            const bandC  = bcm.get(s.bandId) ?? '#888';
            const isLarge = sz >= 9;
            return (
              <g key={s.id}>
                <circle cx={x} cy={y} r={sz + 3}
                  fill="none" stroke={bandC} strokeWidth={1.2} strokeOpacity={0.4} />
                <circle cx={x} cy={y} r={sz} fill={fillC} opacity={op}
                  filter={isLarge ? 'url(#fibGlow)' : undefined}>
                  <title>{`${s.title}\n${fieldX.label}: ${xVal.toFixed(1)}\n${fieldY.label}: ${yVal.toFixed(1)}\n${fieldZ.label}: ${zVal.toFixed(1)}`}</title>
                </circle>
              </g>
            );
          })}
        </g>

        {/* Sibling <g> for labels — no rotation, labels track dot positions via rotRad */}
        {style.showLabels && (
          <g>
            {shown.map((s, i) => {
              const r      = FIB_SCALE * Math.sqrt(i + 1);
              const theta  = i * GOLDEN_ANGLE + rotRad;
              const lx     = r * Math.cos(theta);
              const ly     = r * Math.sin(theta);
              const xVal   = norm(s, fieldX);
              const sz     = (style.dotRadius * 0.5) + (xVal / 10) * (style.dotRadius * 2);
              const isLarge = sz >= 9;
              if (!isLarge) return null;
              return (
                <text key={s.id} x={lx} y={ly + sz + 10} textAnchor="middle"
                  fill={style.fg} opacity={0.65} fontSize={7.5} fontFamily="Inter, system-ui">
                  {s.title.length > 11 ? `${s.title.slice(0, 10)}…` : s.title}
                </text>
              );
            })}
          </g>
        )}

        <circle cx={0} cy={0} r={3.5} fill={style.fg} opacity={0.15} />
      </g>

      {/* Channel key */}
      {style.showLegend && (
        <g transform={`translate(12,${VH - 68})`}>
          <rect x={-6} y={-8} width={220} height={62} rx={5} fill="#000" fillOpacity={0.55} />
          {[`SIZE     — ${fieldX.label}`, `COLOR  — ${fieldY.label}`, `OPACITY — ${fieldZ.label}`, `RING     — band`].map((label, i) => (
            <text key={i} x={0} y={i * 13 + 4}
              fill={style.fg} fillOpacity={0.5} fontSize={9} fontFamily="Inter, system-ui">
              {label}
            </text>
          ))}
          {/* Colour bar for fieldY */}
          <rect x={110} y={14} width={96} height={6} rx={3} fill="url(#fibLegGrad)" opacity={0.8} />
        </g>
      )}

      {style.showLabels && (
        <text x={VW / 2} y={VH - 10} textAnchor="middle"
          fill={style.fg} opacity={0.2} fontSize={9} fontFamily="Inter, system-ui">
          φ = 1.618 · golden angle 137.5° · {songs.length} songs
        </text>
      )}
    </g>
  );
}

// ─── 12 · Fractal Tree ────────────────────────────────────────────────────────

function FractalViz({ songs, style, fieldX, fieldY, fieldZ }: VizProps) {
  if (!songs.length) return <EmptyMsg msg="Select artists to begin" />;

  // RAF-driven rotation — dots/branches rotate, labels stay horizontal
  const [rotDeg, setRotDeg] = useState(0);
  useEffect(() => {
    let raf: number;
    const t0 = performance.now();
    function tick(t: number) {
      setRotDeg(((t - t0) / 600_000) * 360 % 360);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rotRad = (rotDeg * Math.PI) / 180;

  function rotatePoint(x: number, y: number): { x: number; y: number } {
    const c = Math.cos(rotRad), s = Math.sin(rotRad);
    return { x: c * x - s * y, y: s * x + c * y };
  }

  const PHI    = (1 + Math.sqrt(5)) / 2;
  const TWO_PI = Math.PI * 2;
  const cx = VW / 2, cy = VH / 2;
  const bcm = buildBandColors(songs);

  const bandAlbums  = new Map<string, string[]>();
  const albumSongs  = new Map<string, SongData[]>();
  const bandNames   = new Map<string, string>();

  songs.forEach((s) => {
    const albumKey = s.albumTitle ?? '__direct__';
    bandNames.set(s.bandId, s.bandName);
    if (!bandAlbums.has(s.bandId)) bandAlbums.set(s.bandId, []);
    const albs = bandAlbums.get(s.bandId)!;
    if (!albs.includes(albumKey)) albs.push(albumKey);
    const ak = `${s.bandId}::${albumKey}`;
    if (!albumSongs.has(ak)) albumSongs.set(ak, []);
    albumSongs.get(ak)!.push(s);
  });

  const bands  = Array.from(bandAlbums.keys());
  const nBands = bands.length;
  const TRUNK_LEN  = 180;
  const BRANCH_LEN = TRUNK_LEN / PHI;
  const LEAF_LEN   = BRANCH_LEN / PHI;
  const elements: React.ReactElement[] = [];

  // Collect label positions to render separately (no rotation)
  interface LabelEntry {
    key: string; x: number; y: number; text: string;
    fill: string; opacity: number; fontSize: number; fontWeight?: string;
  }
  const labelEntries: LabelEntry[] = [];

  bands.forEach((bandId, bi) => {
    const trunkAngle = nBands > 1 ? (bi / nBands) * TWO_PI - Math.PI / 2 : -Math.PI / 2;
    const bxRaw  = nBands > 1 ? TRUNK_LEN * 0.6 * Math.cos(trunkAngle) : 0;
    const byRaw  = nBands > 1 ? TRUNK_LEN * 0.6 * Math.sin(trunkAngle) : 0;
    const bandCol = bcm.get(bandId) ?? '#888';

    const bRot = rotatePoint(bxRaw, byRaw);

    elements.push(
      <line key={`trunk-${bandId}`} x1={0} y1={0} x2={bRot.x} y2={bRot.y}
        stroke={bandCol} strokeWidth={3} strokeOpacity={0.3} />
    );
    elements.push(
      <circle key={`band-${bandId}`} cx={bRot.x} cy={bRot.y} r={12} fill={bandCol} opacity={0.9} />
    );
    // Band label — rendered in sibling <g> (horizontal, tracks rotated position)
    labelEntries.push({
      key: `band-lbl-${bandId}`,
      x: bRot.x, y: bRot.y - 17,
      text: bandNames.get(bandId) ?? '',
      fill: bandCol, opacity: 1, fontSize: 10, fontWeight: '700',
    });

    const albums  = bandAlbums.get(bandId) ?? [];
    const nAlbums = albums.length;

    albums.forEach((albumKey, ai) => {
      const branchSpread = Math.PI / PHI;
      const albumAngle   = nAlbums > 1
        ? trunkAngle + ((ai / (nAlbums - 1)) - 0.5) * branchSpread
        : trunkAngle;

      const axRaw = bxRaw + BRANCH_LEN * Math.cos(albumAngle);
      const ayRaw = byRaw + BRANCH_LEN * Math.sin(albumAngle);
      const aRot  = rotatePoint(axRaw, ayRaw);

      const songList  = albumSongs.get(`${bandId}::${albumKey}`) ?? [];
      const albumAvgX = songList.reduce((s, sg) => s + norm(sg, fieldX), 0) / Math.max(1, songList.length);
      const albumAvgY = songList.reduce((s, sg) => s + norm(sg, fieldY), 0) / Math.max(1, songList.length);
      const branchW   = style.lineWidth * (0.5 + (albumAvgX / 10) * 1.5); // thicker branch = higher fieldX avg
      const albumFill = scoreToGradient(albumAvgY);

      elements.push(
        <line key={`branch-${bandId}-${ai}`} x1={bRot.x} y1={bRot.y} x2={aRot.x} y2={aRot.y}
          stroke={bandCol} strokeWidth={branchW} strokeOpacity={0.3} strokeDasharray="4 3" />
      );
      elements.push(
        <circle key={`alb-${bandId}-${ai}`} cx={aRot.x} cy={aRot.y} r={6}
          fill={albumFill} opacity={0.85} stroke={bandCol} strokeWidth={1.5} strokeOpacity={0.5} />
      );
      // Album label — collected for horizontal sibling render
      const shortAlbum = albumKey === '__direct__' ? '' : (albumKey.length > 13 ? `${albumKey.slice(0, 12)}…` : albumKey);
      if (shortAlbum) {
        labelEntries.push({
          key: `alb-lbl-${bandId}-${ai}`,
          x: aRot.x, y: aRot.y - 11,
          text: shortAlbum,
          fill: style.fg, opacity: 0.5, fontSize: 8,
        });
      }

      const nSongs     = songList.length;
      const leafSpread = Math.PI / (PHI * PHI);

      songList.forEach((s, si) => {
        const songAngle = nSongs > 1
          ? albumAngle + ((si / (nSongs - 1)) - 0.5) * leafSpread
          : albumAngle;

        const sxRaw = axRaw + LEAF_LEN * Math.cos(songAngle);
        const syRaw = ayRaw + LEAF_LEN * Math.sin(songAngle);
        const sRot  = rotatePoint(sxRaw, syRaw);
        const xVal  = norm(s, fieldX);
        const yVal  = norm(s, fieldY);
        const zVal  = norm(s, fieldZ);
        const sz    = 2.5 + (xVal / 10) * 9;        // 2.5–11.5 px
        const fillC = scoreToGradient(yVal);
        const op    = 0.4 + (zVal / 10) * 0.55;     // 0.4–0.95

        elements.push(
          <line key={`leaf-${s.id}`} x1={aRot.x} y1={aRot.y} x2={sRot.x} y2={sRot.y}
            stroke={bandCol} strokeWidth={0.8} strokeOpacity={0.2} />
        );
        elements.push(
          <circle key={`song-${s.id}`} cx={sRot.x} cy={sRot.y} r={sz}
            fill={fillC} opacity={op} stroke={bandCol} strokeWidth={1} strokeOpacity={0.4}>
            <title>{`${s.title}\n${fieldX.label}: ${xVal.toFixed(1)}\n${fieldY.label}: ${yVal.toFixed(1)}\n${fieldZ.label}: ${zVal.toFixed(1)}`}</title>
          </circle>
        );
        // Song name for larger leaves — collected for horizontal sibling render
        if (style.showLabels && sz >= 7) {
          labelEntries.push({
            key: `song-lbl-${s.id}`,
            x: sRot.x, y: sRot.y + sz + 9,
            text: s.title.length > 10 ? `${s.title.slice(0, 9)}…` : s.title,
            fill: style.fg, opacity: 0.6, fontSize: 7.5,
          });
        }
      });
    });
  });

  return (
    <g>
      <defs>
        <linearGradient id="fractalLegGrad" x1="0" x2="1">
          <stop offset="0%"   stopColor="#4f46e5" />
          <stop offset="25%"  stopColor="#06b6d4" />
          <stop offset="55%"  stopColor="#84cc16" />
          <stop offset="75%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      <g transform={`translate(${cx},${cy})`}>
        {/* Rotating geometry — no animateTransform, rotation via RAF state */}
        <g>{elements}</g>

        {/* Sibling <g> for labels — no rotation, horizontal text */}
        {style.showLabels && (
          <g>
            {labelEntries.map((lbl) => (
              <text key={lbl.key} x={lbl.x} y={lbl.y} textAnchor="middle"
                fill={lbl.fill} opacity={lbl.opacity} fontSize={lbl.fontSize}
                fontWeight={lbl.fontWeight} fontFamily="Inter, system-ui">
                {lbl.text}
              </text>
            ))}
          </g>
        )}
      </g>

      {/* Channel key */}
      {style.showLegend && (
        <g transform={`translate(12,${VH - 68})`}>
          <rect x={-6} y={-8} width={220} height={62} rx={5} fill="#000" fillOpacity={0.55} />
          {[`SIZE     — ${fieldX.label}`, `COLOR  — ${fieldY.label}`, `OPACITY — ${fieldZ.label}`, `BRANCH WIDTH — ${fieldX.label} avg`].map((label, i) => (
            <text key={i} x={0} y={i * 13 + 4}
              fill={style.fg} fillOpacity={0.5} fontSize={9} fontFamily="Inter, system-ui">
              {label}
            </text>
          ))}
          <rect x={130} y={14} width={76} height={6} rx={3} fill="url(#fractalLegGrad)" opacity={0.8} />
        </g>
      )}

      {style.showLabels && (
        <text x={VW / 2} y={VH - 10} textAnchor="middle"
          fill={style.fg} opacity={0.2} fontSize={9} fontFamily="Inter, system-ui">
          Golden ratio branching · φ = 1.618 · {songs.length} songs · {nBands} band{nBands !== 1 ? 's' : ''}
        </text>
      )}
    </g>
  );
}

// ─── Style control sub-components ────────────────────────────────────────────

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/50 text-xs truncate">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent shrink-0" />
    </div>
  );
}

function SliderRow({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-white/50 text-xs">{label}</span>
        <span className="text-white/30 text-xs font-mono tabular-nums">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-indigo-400 bg-white/10" />
    </div>
  );
}

// ─── Field Browser (left sidebar section) ────────────────────────────────────

function FieldBrowser({
  activeFieldIds, onToggle, onSelectGroup,
}: {
  activeFieldIds: string[];
  onToggle: (id: string) => void;
  onSelectGroup: (group: string) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['Spectrum']));

  const toggle = (g: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">Fields</span>
        <span className="text-white/20 text-[10px]">{activeFieldIds.length} active</span>
      </div>

      {FIELD_GROUPS.map((group) => {
        const groupFields = FIELD_CATALOG.filter((f) => f.group === group);
        const isOpen      = openGroups.has(group);
        const activeCount = groupFields.filter((f) => activeFieldIds.includes(f.id)).length;

        return (
          <div key={group} className="mb-1">
            {/* Group header */}
            <div className="flex items-center justify-between py-1 cursor-pointer select-none"
              onClick={() => toggle(group)}>
              <div className="flex items-center gap-1.5">
                <span className="text-white/20 text-[10px] w-3">{isOpen ? '▾' : '▸'}</span>
                <span className="text-white/60 text-[11px] font-medium">{group}</span>
                {activeCount > 0 && (
                  <span className="text-indigo-400 text-[9px] font-mono">({activeCount})</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onSelectGroup(group); }}
                className="text-[9px] text-white/25 hover:text-indigo-400 transition-colors px-1"
                title="Toggle all in group">
                all
              </button>
            </div>

            {/* Fields list */}
            {isOpen && (
              <div className="pl-4 space-y-0.5">
                {groupFields.map((f) => {
                  const on = activeFieldIds.includes(f.id);
                  return (
                    <label key={f.id} className="flex items-center gap-2 cursor-pointer group py-0.5">
                      <input type="checkbox" className="accent-indigo-500 shrink-0"
                        checked={on} onChange={() => onToggle(f.id)} />
                      <span className="w-2 h-2 rounded-full shrink-0 inline-block"
                        style={{ background: f.color, opacity: on ? 1 : 0.25 }} />
                      <span className={`text-[11px] truncate transition-colors
                        ${on ? 'text-white/80' : 'text-white/30 group-hover:text-white/55'}`}>
                        {f.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ─── Visual Patch Bay ────────────────────────────────────────────────────────

const PATCH_CHANNELS: Record<string, Array<{ id: 'x' | 'y' | 'z'; label: string; hint: string }>> = {
  fibonacci: [
    { id: 'x', label: 'SIZE',    hint: 'dot radius' },
    { id: 'y', label: 'COLOR',   hint: 'heatmap fill' },
    { id: 'z', label: 'OPACITY', hint: 'transparency' },
  ],
  fractal: [
    { id: 'x', label: 'SIZE',    hint: 'leaf radius' },
    { id: 'y', label: 'COLOR',   hint: 'heatmap fill' },
    { id: 'z', label: 'OPACITY', hint: 'transparency' },
  ],
  scatter: [
    { id: 'x', label: 'X-AXIS', hint: 'horizontal' },
    { id: 'y', label: 'Y-AXIS', hint: 'vertical' },
  ],
  vectorscope: [
    { id: 'x', label: 'X-AXIS', hint: 'horizontal' },
    { id: 'y', label: 'Y-AXIS', hint: 'vertical' },
  ],
  bubble: [
    { id: 'x', label: 'X-AXIS',  hint: 'horizontal' },
    { id: 'y', label: 'Y-AXIS',  hint: 'vertical' },
    { id: 'z', label: 'RADIUS',  hint: 'bubble size' },
  ],
  oscilloscope: [
    { id: 'x', label: 'X-AXIS', hint: 'horizontal' },
    { id: 'y', label: 'Y-AXIS', hint: 'vertical' },
  ],
};

function PatchBay({
  vizType, fieldX, fieldY, fieldZ, setFieldX, setFieldY, setFieldZ,
}: {
  vizType: string;
  fieldX: StudioField; fieldY: StudioField; fieldZ: StudioField;
  setFieldX: (f: StudioField) => void;
  setFieldY: (f: StudioField) => void;
  setFieldZ: (f: StudioField) => void;
}) {
  const channels = PATCH_CHANNELS[vizType] ?? [];
  if (!channels.length) return null;

  const containerRef = useRef<HTMLDivElement>(null);
  const jackRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [cables, setCables] = useState<Array<{ from: { x: number; y: number }; to: { x: number; y: number }; color: string }>>([]);

  const patches: Record<string, string> = { x: fieldX.id, y: fieldY.id, z: fieldZ.id };

  function setField(destId: 'x' | 'y' | 'z', f: StudioField) {
    if (destId === 'x') setFieldX(f);
    else if (destId === 'y') setFieldY(f);
    else setFieldZ(f);
  }

  function recomputeCables() {
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const result: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; color: string }> = [];
    for (const ch of channels) {
      const srcId = patches[ch.id];
      if (!srcId) continue;
      const srcEl = jackRefs.current.get(`src-${srcId}`);
      const dstEl = jackRefs.current.get(`dst-${ch.id}`);
      if (!srcEl || !dstEl) continue;
      const sr = srcEl.getBoundingClientRect();
      const dr = dstEl.getBoundingClientRect();
      const color = FIELD_CATALOG.find(f => f.id === srcId)?.color ?? '#888';
      result.push({
        from: { x: sr.right - cr.left, y: sr.top + sr.height / 2 - cr.top },
        to:   { x: dr.left - cr.left,  y: dr.top + dr.height / 2 - cr.top },
        color,
      });
    }
    setCables(result);
  }

  useEffect(() => {
    const t = setTimeout(recomputeCables, 30);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldX.id, fieldY.id, fieldZ.id, vizType]);

  function handleSrcClick(fieldId: string) {
    setSelected(prev => prev === fieldId ? null : fieldId);
  }

  function handleDstClick(ch: { id: 'x' | 'y' | 'z' }) {
    if (!selected) return;
    const f = FIELD_CATALOG.find(ff => ff.id === selected);
    if (f) { setField(ch.id, f); setSelected(null); }
  }

  return (
    <section className="px-3 py-2 border-t border-white/8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono tracking-widest text-white/30 uppercase">Patch Bay</span>
        {selected ? (
          <span className="text-[10px] text-indigo-300 animate-pulse">→ pick a channel</span>
        ) : (
          <span className="text-[10px] text-white/15">tap field then channel</span>
        )}
      </div>

      <div ref={containerRef} className="relative">
        {/* SVG cable overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
          {cables.map((c, i) => {
            const mx = (c.from.x + c.to.x) / 2;
            const sag = Math.min(40, Math.abs(c.to.y - c.from.y) * 0.4 + 8);
            return (
              <path key={i}
                d={`M${c.from.x},${c.from.y} C${mx},${c.from.y + sag} ${mx},${c.to.y + sag} ${c.to.x},${c.to.y}`}
                fill="none" stroke={c.color} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
            );
          })}
        </svg>

        <div className="flex gap-2 items-start">
          {/* Sources: all fields, scrollable */}
          <div className="flex-1 min-w-0 space-y-0.5 max-h-52 overflow-y-auto pr-1"
            onScroll={recomputeCables}>
            {FIELD_CATALOG.map((f) => {
              const isPatched = Object.values(patches).includes(f.id);
              const isSel = selected === f.id;
              return (
                <div key={f.id} className="flex items-center justify-between gap-1 min-w-0">
                  <span
                    className={`text-[10px] truncate flex items-center gap-1.5 min-w-0 ${isSel ? 'text-white' : isPatched ? '' : 'text-white/40'}`}
                    style={isPatched && !isSel ? { color: f.color } : undefined}>
                    <span className="w-2 h-2 rounded-full shrink-0 inline-block"
                      style={{ background: f.color, opacity: isPatched || isSel ? 1 : 0.35 }} />
                    {f.label}
                  </span>
                  <button
                    ref={(el) => { if (el) jackRefs.current.set(`src-${f.id}`, el); }}
                    onClick={() => handleSrcClick(f.id)}
                    className={[
                      'w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-all',
                      isSel    ? 'scale-125 border-white bg-white' :
                      isPatched ? 'border-white/60 bg-white/25' :
                                  'border-white/20 hover:border-white/50',
                    ].join(' ')}
                  />
                </div>
              );
            })}
          </div>

          {/* Destinations */}
          <div className="flex flex-col gap-3 shrink-0 py-1" style={{ minWidth: 88 }}>
            {channels.map((ch) => {
              const pf = FIELD_CATALOG.find(f => f.id === patches[ch.id]);
              return (
                <div key={ch.id} className="flex items-center gap-1.5">
                  <button
                    ref={(el) => { if (el) jackRefs.current.set(`dst-${ch.id}`, el as HTMLButtonElement); }}
                    onClick={() => handleDstClick(ch)}
                    className={[
                      'w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-all',
                      selected ? 'border-indigo-400 bg-indigo-400/30 animate-pulse scale-110' :
                      pf       ? 'border-white/60' : 'border-white/20',
                    ].join(' ')}
                    style={pf && !selected ? { borderColor: pf.color } : undefined}
                  />
                  <div>
                    <div className="text-[9px] font-mono text-white/30 leading-none uppercase">{ch.label}</div>
                    {pf ? (
                      <div className="text-[9px] leading-none mt-0.5 font-medium"
                        style={{ color: pf.color }}>{pf.short}</div>
                    ) : (
                      <div className="text-[9px] leading-none mt-0.5 text-white/15">{ch.hint}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SpectrumStudioPage() {
  const { user, isLoading: authLoading } = useAuth();
  const svgRef = useRef<SVGSVGElement>(null);

  const [vizType,        setVizType]        = useState<VizType>('radar');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  // null = all songs; [] = none; string[] = explicit subset
  const [songFilter,     setSongFilter]     = useState<string[] | null>(null);
  const [activeFieldIds, setActiveFieldIds] = useState<string[]>(DEFAULT_ACTIVE);
  const [fieldX,         setFieldX]         = useState<StudioField>(FIELD_CATALOG[0]!);
  const [fieldY,         setFieldY]         = useState<StudioField>(FIELD_CATALOG[1]!);
  const [fieldZ,         setFieldZ]         = useState<StudioField>(FIELD_CATALOG[2]!);
  const [style,          setStyle]          = useState<StudioStyle>(loadStyle);
  const [showStylePanel, setShowStylePanel] = useState(true);
  const [exportMsg,      setExportMsg]      = useState('');

  // Viewport state for zoom/pan
  const [vb, setVb] = useState({ x: 0, y: 0, zoom: 1 });
  const vbRef = useRef({ x: 0, y: 0, zoom: 1 });
  vbRef.current = vb;
  const svgDragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => { localStorage.setItem(STYLE_KEY, JSON.stringify(style)); }, [style]);

  // Non-passive wheel handler for zoom-toward-cursor
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y, zoom } = vbRef.current;
      const rect = el.getBoundingClientRect();
      const mx = x + (e.clientX - rect.left) / rect.width  * (VW / zoom);
      const my = y + (e.clientY - rect.top)  / rect.height * (VH / zoom);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.min(10, Math.max(0.15, zoom * factor));
      const newW = VW / newZoom, newH = VH / newZoom;
      setVb({
        x: mx - (e.clientX - rect.left) / rect.width  * newW,
        y: my - (e.clientY - rect.top)  / rect.height * newH,
        zoom: newZoom,
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — uses vbRef

  if (!authLoading && (!user || !user.isAdmin)) return <Navigate to="/landing" replace />;

  const { data: bandsData } = useQuery({
    queryKey: ['studio-bands'],
    queryFn:  () => api.get<{ id: string; name: string }[]>('/api/bands'),
    enabled:  !!user?.isAdmin,
  });

  const { data: songsRaw, isFetching: fetchingSongs } = useQuery({
    queryKey: ['studio-songs', selectedBandIds.join(',')],
    queryFn:  () => api.get<SongData[]>(`/api/spectrum-studio?bandIds=${selectedBandIds.join(',')}`),
    enabled:  !!user?.isAdmin && selectedBandIds.length > 0,
  });

  // Keep songFilter in sync when a new band is loaded — default to 'all'
  const prevBandKey = useRef('');
  const bandKey     = selectedBandIds.join(',');
  useEffect(() => {
    if (bandKey !== prevBandKey.current) {
      setSongFilter(null);
      prevBandKey.current = bandKey;
    }
  }, [bandKey]);

  const allSongs = useMemo(() => songsRaw ?? [], [songsRaw]);

  const filteredSongs = useMemo(() => {
    if (songFilter === null) return allSongs;
    return allSongs.filter((s) => songFilter.includes(s.id));
  }, [allSongs, songFilter]);

  // The active fields as full objects for chart rendering
  const activeFields = useMemo(
    () => activeFieldIds.map((id) => FIELD_MAP.get(id)).filter((f): f is StudioField => !!f),
    [activeFieldIds],
  );

  const needsXY = ['oscilloscope', 'vectorscope', 'scatter', 'bubble', 'fibonacci', 'fractal'].includes(vizType);

  const vizProps: VizProps = {
    songs: filteredSongs, fields: activeFields, style, fieldX, fieldY, fieldZ,
  };

  function renderViz() {
    switch (vizType) {
      case 'radar':        return <RadarViz         {...vizProps} />;
      case 'columns':      return <ColumnsViz       {...vizProps} />;
      case 'bars':         return <BarsViz          {...vizProps} />;
      case 'waveform':     return <WaveformViz      {...vizProps} />;
      case 'oscilloscope': return <OscilloscopeViz  {...vizProps} />;
      case 'vectorscope':  return <VectorscopeViz   {...vizProps} />;
      case 'heatmap':      return <HeatmapViz       {...vizProps} />;
      case 'scatter':      return <ScatterViz       {...vizProps} />;
      case 'pie':          return <PieViz           {...vizProps} />;
      case 'bubble':       return <BubbleViz        {...vizProps} />;
      case 'fibonacci':    return <FibonacciViz     {...vizProps} />;
      case 'fractal':      return <FractalViz        {...vizProps} />;
    }
  }

  async function exportPng(w: number, h: number, label: string) {
    const svg = svgRef.current;
    if (!svg) return;
    setExportMsg('Rendering…');
    try {
      const xml  = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload  = () => resolve();
        img.onerror = reject;
        img.src     = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href     = URL.createObjectURL(b);
        a.download = `spectrum-${vizType}-${label}-${Date.now()}.png`;
        a.click();
        setExportMsg('Saved ✓');
        setTimeout(() => setExportMsg(''), 2500);
      }, 'image/png');
    } catch { setExportMsg('Export failed'); }
  }

  const toggleBand = useCallback((id: string) => {
    setSelectedBandIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }, []);

  const toggleField = useCallback((id: string) => {
    setActiveFieldIds((p) =>
      p.includes(id)
        ? p.length > 1 ? p.filter((x) => x !== id) : p   // always keep ≥1
        : [...p, id]);
  }, []);

  const toggleFieldGroup = useCallback((group: string) => {
    const groupIds = FIELD_CATALOG.filter((f) => f.group === group).map((f) => f.id);
    setActiveFieldIds((prev) => {
      const allOn = groupIds.every((id) => prev.includes(id));
      if (allOn) {
        // Turn off all in group, but ensure at least one field remains
        const remaining = prev.filter((id) => !groupIds.includes(id));
        return remaining.length ? remaining : prev;
      }
      const next = [...prev];
      for (const id of groupIds) if (!next.includes(id)) next.push(id);
      return next;
    });
  }, []);

  // Songs section helpers
  const toggleSong = useCallback((id: string) => {
    setSongFilter((prev) => {
      if (prev === null) {
        // Switch from "all" to explicit: include everything except this one
        return allSongs.filter((s) => s.id !== id).map((s) => s.id);
      }
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, [allSongs]);

  const showLegendInSvg =
    style.showLegend &&
    !['oscilloscope','vectorscope','scatter','bubble','pie','heatmap'].includes(vizType) &&
    activeFields.length > 0;

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-gray-900 border-b border-white/10 flex items-center gap-2 px-4 py-2 min-w-0">
        <Link to="/dashboard" className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0">
          ← Dashboard
        </Link>
        <span className="text-white/15 shrink-0">|</span>
        <span className="text-sm font-bold text-white/80 shrink-0">Spectrum Studio</span>

        {/* Viz type pills */}
        <div className="flex-1 overflow-x-auto flex gap-1 px-2 min-w-0">
          {VIZ_TYPES.map((vt) => (
            <button key={vt.id}
              title={vt.desc}
              onClick={() => setVizType(vt.id as VizType)}
              className={`shrink-0 px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1
                ${vizType === vt.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/6 text-white/50 hover:bg-white/12 hover:text-white'}`}
            >
              <span className="opacity-80">{vt.icon}</span>
              <span>{vt.label}</span>
            </button>
          ))}
        </div>

        {/* Export + style toggle */}
        <div className="shrink-0 flex items-center gap-2">
          {exportMsg && <span className="text-xs text-green-400 animate-pulse">{exportMsg}</span>}
          <span className="text-white/20 text-xs">Export:</span>
          <button onClick={() => exportPng(1080, 1080, '1x1')}
            className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-xs rounded transition-colors">1:1</button>
          <button onClick={() => exportPng(1920, 1080, '16x9')}
            className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-xs rounded transition-colors">16:9</button>
          <button onClick={() => exportPng(1080, 1920, '9x16')}
            className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-600 text-xs rounded transition-colors">9:16</button>
          <button onClick={() => setShowStylePanel((v) => !v)}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-xs rounded transition-colors">
            Style {showStylePanel ? '◁' : '▷'}
          </button>
        </div>
      </header>

      {/* ── Main row ───────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* ── Left sidebar: data selection ───────────────────────── */}
        <aside className="w-64 shrink-0 bg-gray-900/50 border-r border-white/10 overflow-y-auto">
          <div className="p-4 space-y-5 text-xs">

            {/* Artists */}
            <section>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Artists</div>
              {bandsData ? (
                <>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {bandsData.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" className="accent-indigo-500"
                          checked={selectedBandIds.includes(b.id)}
                          onChange={() => toggleBand(b.id)} />
                        <span className={selectedBandIds.includes(b.id) ? 'text-white' : 'text-white/40 group-hover:text-white/70'}>
                          {b.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <button onClick={() => setSelectedBandIds(bandsData.map((b) => b.id))}
                      className="text-indigo-400 hover:text-indigo-200 text-[11px]">All</button>
                    <span className="text-white/20">·</span>
                    <button onClick={() => setSelectedBandIds([])}
                      className="text-white/40 hover:text-white/70 text-[11px]">None</button>
                  </div>
                </>
              ) : <p className="text-white/25">Loading…</p>}
            </section>

            {/* Songs */}
            {allSongs.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                    Songs
                  </div>
                  <span className="text-[10px] text-white/20">
                    {filteredSongs.length}/{allSongs.length}
                  </span>
                </div>

                {/* Selection mode buttons */}
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setSongFilter(null)}
                    className={`text-[11px] transition-colors ${songFilter === null ? 'text-indigo-400 font-semibold' : 'text-white/40 hover:text-white/70'}`}>
                    All
                  </button>
                  <span className="text-white/20">·</span>
                  <button
                    onClick={() => setSongFilter([])}
                    className={`text-[11px] transition-colors ${Array.isArray(songFilter) && songFilter.length === 0 ? 'text-white/70 font-semibold' : 'text-white/40 hover:text-white/70'}`}>
                    None
                  </button>
                  <span className="text-white/20">·</span>
                  <button
                    onClick={() => setSongFilter(allSongs.map((s) => s.id))}
                    className="text-[11px] text-white/40 hover:text-white/70">
                    Select all
                  </button>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
                  {allSongs.map((s) => {
                    const on = songFilter === null || songFilter.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" className="accent-indigo-500" checked={on}
                          onChange={() => toggleSong(s.id)} />
                        <span className={`truncate text-[11px] transition-colors
                          ${on ? 'text-white/70' : 'text-white/25 group-hover:text-white/50'}`}>
                          {s.title}
                        </span>
                        {!s.hasScore && (
                          <span className="text-white/20 text-[9px] shrink-0">–</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Field browser */}
            <FieldBrowser
              activeFieldIds={activeFieldIds}
              onToggle={toggleField}
              onSelectGroup={toggleFieldGroup}
            />

            {/* Visual patch bay — maps data fields to visual channels */}
            {needsXY && (
              <PatchBay
                vizType={vizType}
                fieldX={fieldX} fieldY={fieldY} fieldZ={fieldZ}
                setFieldX={setFieldX} setFieldY={setFieldY} setFieldZ={setFieldZ}
              />
            )}

          </div>
        </aside>

        {/* ── Chart canvas ───────────────────────────────────────── */}
        <main className="relative flex-1 flex items-center justify-center p-5 min-w-0 overflow-hidden"
          style={{ background: style.bg }}>
          {!selectedBandIds.length ? (
            <div className="text-center text-white/25 select-none">
              <div className="text-6xl mb-5 opacity-15">◈</div>
              <p className="text-sm">Select artists from the left panel to begin</p>
            </div>
          ) : fetchingSongs ? (
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          ) : !filteredSongs.length ? (
            <div className="text-center text-white/25 select-none">
              <p className="text-sm">No songs selected — use the Songs panel to pick some</p>
            </div>
          ) : (
            <>
              <svg
                ref={svgRef}
                viewBox={`${vb.x} ${vb.y} ${VW / vb.zoom} ${VH / vb.zoom}`}
                className="w-full h-full"
                style={{ maxWidth: VW, maxHeight: VH, cursor: svgDragRef.current ? 'grabbing' : 'grab' }}
                xmlns="http://www.w3.org/2000/svg"
                fontFamily="Inter, system-ui, sans-serif"
                onMouseDown={(e) => {
                  if ((e.target as Element).tagName === 'circle' || (e.target as Element).tagName === 'text') return;
                  svgDragRef.current = { sx: e.clientX, sy: e.clientY, ox: vb.x, oy: vb.y };
                }}
                onMouseMove={(e) => {
                  if (!svgDragRef.current) return;
                  const rect = svgRef.current!.getBoundingClientRect();
                  setVb(v => ({
                    ...v,
                    x: svgDragRef.current!.ox - (e.clientX - svgDragRef.current!.sx) * (VW / v.zoom) / rect.width,
                    y: svgDragRef.current!.oy - (e.clientY - svgDragRef.current!.sy) * (VH / v.zoom) / rect.height,
                  }));
                }}
                onMouseUp={() => { svgDragRef.current = null; }}
                onMouseLeave={() => { svgDragRef.current = null; }}
                onDoubleClick={() => setVb({ x: 0, y: 0, zoom: 1 })}
              >
                <rect width={VW} height={VH} fill={style.bg} rx={6} />

                {style.showTitle && (
                  <text x={VW / 2} y={26} textAnchor="middle"
                    fill={style.fg} fontSize={15} fontWeight="700"
                    fontFamily="Inter, system-ui, sans-serif" opacity={0.8}>
                    {style.titleText}
                  </text>
                )}

                {renderViz()}

                {/* Legend strip */}
                {showLegendInSvg && (
                  <g transform={`translate(${(VW - Math.min(activeFields.length, 8) * 90) / 2},${VH - 18})`}>
                    {activeFields.slice(0, 8).map((f, i) => (
                      <g key={f.id} transform={`translate(${i * 90},0)`}>
                        <rect x={0} y={-6} width={10} height={10} rx={2} fill={f.color} />
                        <text x={14} y={4} fill={style.fg} opacity={0.55}
                          fontSize={10} fontFamily="Inter, system-ui">
                          {f.short}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* Watermark */}
                <text x={VW - 7} y={VH - 5} textAnchor="end"
                  fill={style.fg} opacity={0.12} fontSize={8} fontFamily="Inter, system-ui">
                  Band Spectrum Mapper
                </text>
              </svg>

              {/* Zoom indicator */}
              {vb.zoom !== 1 && (
                <div className="absolute top-2 right-2 flex items-center gap-2 text-[10px] text-white/40 select-none">
                  <span>{vb.zoom.toFixed(1)}×</span>
                  <button onClick={() => setVb({ x: 0, y: 0, zoom: 1 })}
                    className="hover:text-white/70 underline">reset</button>
                </div>
              )}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] text-white/15 select-none pointer-events-none">
                scroll to zoom · drag to pan · dbl-click to reset
              </div>
            </>
          )}
        </main>

        {/* ── Right panel: style controls ────────────────────────── */}
        {showStylePanel && (
          <aside className="w-52 shrink-0 bg-gray-900/50 border-l border-white/10 overflow-y-auto">
            <div className="p-4 space-y-5 text-xs">

              <section>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Chart Title</div>
                <label className="flex items-center gap-2 mb-2">
                  <input type="checkbox" className="accent-indigo-500"
                    checked={style.showTitle}
                    onChange={(e) => setStyle((s) => ({ ...s, showTitle: e.target.checked }))} />
                  <span className="text-white/55">Show title</span>
                </label>
                <input value={style.titleText}
                  onChange={(e) => setStyle((s) => ({ ...s, titleText: e.target.value }))}
                  className="w-full bg-white/8 border border-white/10 rounded px-2 py-1 text-white text-xs" />
              </section>

              <section>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Canvas Colors</div>
                <div className="space-y-2">
                  <ColorRow label="Background" value={style.bg}
                    onChange={(v) => setStyle((s) => ({ ...s, bg: v }))} />
                  <ColorRow label="Text / Labels" value={style.fg}
                    onChange={(v) => setStyle((s) => ({ ...s, fg: v }))} />
                  <ColorRow label="Grid lines" value={style.gridColor}
                    onChange={(v) => setStyle((s) => ({ ...s, gridColor: v }))} />
                </div>
              </section>

              {/* Per-field colours — only active fields */}
              {activeFields.length > 0 && (
                <section>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">
                    Field Colors
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {activeFields.map((f) => (
                      <ColorRow key={f.id} label={f.short}
                        value={f.color}
                        onChange={(v) => {
                          // Update the field's color in the catalog (mutation is fine here;
                          // FIELD_CATALOG is module-scoped, not frozen)
                          const entry = FIELD_MAP.get(f.id);
                          if (entry) entry.color = v;
                          // Force re-render by touching activeFieldIds
                          setActiveFieldIds((p) => [...p]);
                        }} />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-3">Style Controls</div>
                <div className="space-y-4">
                  <SliderRow label="Fill opacity" value={style.fillAlpha} min={0} max={1} step={0.02}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => setStyle((s) => ({ ...s, fillAlpha: v }))} />
                  <SliderRow label="Line width" value={style.lineWidth} min={0.5} max={6} step={0.5}
                    format={(v) => `${v}px`}
                    onChange={(v) => setStyle((s) => ({ ...s, lineWidth: v }))} />
                  <SliderRow label="Dot size" value={style.dotRadius} min={2} max={16} step={1}
                    format={(v) => `${v}px`}
                    onChange={(v) => setStyle((s) => ({ ...s, dotRadius: v }))} />
                </div>
              </section>

              <section>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Display</div>
                <div className="space-y-2">
                  {([
                    ['showGrid',   'Grid lines'],
                    ['showLabels', 'Labels'],
                    ['showLegend', 'Legend'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-indigo-500"
                        checked={style[key] as boolean}
                        onChange={(e) => setStyle((s) => ({ ...s, [key]: e.target.checked }))} />
                      <span className="text-white/55">{label}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Presets</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    ['Dark',   { bg: '#060d1a', fg: '#e2e8f0', gridColor: '#ffffff' }],
                    ['Light',  { bg: '#f8f9fa', fg: '#1a1a2e', gridColor: '#000000' }],
                    ['Slate',  { bg: '#0f172a', fg: '#cbd5e1', gridColor: '#94a3b8' }],
                    ['Warm',   { bg: '#1c1008', fg: '#fde68a', gridColor: '#f59e0b' }],
                  ] as const).map(([name, vals]) => (
                    <button key={name}
                      onClick={() => setStyle((s) => ({ ...s, ...vals }))}
                      className="py-1.5 bg-white/6 hover:bg-white/14 rounded text-white/50 hover:text-white transition-colors text-[11px]">
                      {name}
                    </button>
                  ))}
                </div>
              </section>

              <button onClick={() => setStyle(DEFAULT_STYLE)}
                className="w-full py-1.5 bg-white/5 hover:bg-white/10 rounded text-white/35 hover:text-white/65 transition-colors text-[11px]">
                Reset all defaults
              </button>

            </div>
          </aside>
        )}

      </div>
    </div>
  );
}

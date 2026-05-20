/**
 * Spectrum Studio — admin-only data visualisation lab.
 * 10 chart types · per-axis selection · live style panel · PNG export.
 */
import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ─── Dimensions ──────────────────────────────────────────────────────────────

const VW = 900;
const VH = 560;

// ─── Axes ────────────────────────────────────────────────────────────────────

const AXES = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
type Axis = typeof AXES[number];

const AXIS_LABEL: Record<Axis, string> = {
  aggression:  'Aggression',
  complexity:  'Complexity',
  atmosphere:  'Atmosphere',
  emotion:     'Emotion',
  psychedelic: 'Psychedelic',
  concept:     'Concept',
};

const BASE_AXIS_COLORS: Record<string, string> = {
  aggression:  '#E5484D',
  complexity:  '#8B5CF6',
  atmosphere:  '#06B6D4',
  emotion:     '#F59E0B',
  psychedelic: '#22C55E',
  concept:     '#F97316',
};

// ─── Band palette for multi-song differentiation ─────────────────────────────

const BAND_PALETTE = [
  '#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6',
  '#e67e22','#1abc9c','#e91e63','#00bcd4','#ff5722',
];

// ─── Viz types ────────────────────────────────────────────────────────────────

const VIZ_TYPES = [
  { id: 'radar',         label: 'Radar',         icon: '⬡', desc: 'Spider chart — one polygon per song' },
  { id: 'columns',       label: 'Columns',        icon: '▉', desc: 'Grouped vertical bars per song' },
  { id: 'bars',          label: 'Bars',           icon: '▬', desc: 'Horizontal bars — good for many songs' },
  { id: 'waveform',      label: 'Waveform',       icon: '∿', desc: 'Smooth area waves across songs' },
  { id: 'oscilloscope',  label: 'Oscilloscope',   icon: '◎', desc: 'Lissajous — two axes as X/Y trace' },
  { id: 'vectorscope',   label: 'Vectorscope',    icon: '◯', desc: 'Polar scatter — broadcast-style scope' },
  { id: 'heatmap',       label: 'Heatmap',        icon: '⊞', desc: 'Colour-coded grid of scores' },
  { id: 'scatter',       label: 'Scatter',        icon: '⁘', desc: 'Two axes as X/Y, coloured by band' },
  { id: 'pie',           label: 'Pie / Donut',    icon: '◔', desc: 'Average axis distribution as slices' },
  { id: 'bubble',        label: 'Bubble',         icon: '⊙', desc: 'Scatter with third axis as bubble size' },
] as const;

type VizType = typeof VIZ_TYPES[number]['id'];

// ─── Style ────────────────────────────────────────────────────────────────────

interface StudioStyle {
  bg:          string;
  fg:          string;
  gridColor:   string;
  showGrid:    boolean;
  showLabels:  boolean;
  showLegend:  boolean;
  showTitle:   boolean;
  titleText:   string;
  axisColors:  Record<string, string>;
  fillAlpha:   number;
  lineWidth:   number;
  dotRadius:   number;
}

const DEFAULT_STYLE: StudioStyle = {
  bg:          '#060d1a',
  fg:          '#e2e8f0',
  gridColor:   '#ffffff',
  showGrid:    true,
  showLabels:  true,
  showLegend:  true,
  showTitle:   true,
  titleText:   'Band Spectrum Analysis',
  axisColors:  { ...BASE_AXIS_COLORS },
  fillAlpha:   0.18,
  lineWidth:   2,
  dotRadius:   5,
};

const STYLE_KEY = 'bsm-studio-v1';

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
  scores:     Record<string, number> | null;
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function hex2rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function axColor(style: StudioStyle, ax: string): string {
  return style.axisColors[ax] ?? BASE_AXIS_COLORS[ax] ?? '#888';
}

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

// ─── Shared viz props ─────────────────────────────────────────────────────────

interface VizProps {
  songs:  SongData[];
  axes:   Axis[];
  style:  StudioStyle;
  axisX:  Axis;
  axisY:  Axis;
  axisZ:  Axis;
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

function RadarViz({ songs, axes, style }: VizProps) {
  if (!songs.length || axes.length < 3) return <EmptyMsg msg="Select ≥ 3 axes and at least one song" />;
  const cx = VW / 2, cy = VH / 2 + 12;
  const R  = Math.min(VW, VH) * 0.29;
  const n  = axes.length;

  const pt = (i: number, r: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };

  const polygon = (s: SongData) =>
    axes.map((ax, i) => { const p = pt(i, ((s.scores?.[ax] ?? 0) / 10) * R); return `${p.x},${p.y}`; }).join(' ');

  const bcm   = buildBandColors(songs);
  const shown = songs.slice(0, 12);
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <g>
      {style.showGrid && rings.map((v) => (
        <polygon key={v}
          points={axes.map((_, i) => { const p = pt(i, v * R); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke={style.gridColor} strokeOpacity={0.09} strokeWidth={1} />
      ))}
      {axes.map((_, i) => { const tip = pt(i, R); return (
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
      {style.showLabels && axes.map((ax, i) => {
        const p = pt(i, R + 22);
        return (
          <text key={ax} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fill={axColor(style, ax)} fontSize={11} fontWeight="700" fontFamily="Inter, system-ui">
            {AXIS_LABEL[ax]}
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

// ─── 2 · Columns (vertical) ───────────────────────────────────────────────────

function ColumnsViz({ songs, axes, style }: VizProps) {
  if (!songs.length || !axes.length) return <EmptyMsg msg="Select artists and axes" />;
  const shown = songs.slice(0, 20);
  const pad   = { t: 55, b: 70, l: 36, r: 16 };
  const cw    = VW - pad.l - pad.r;
  const ch    = VH - pad.t - pad.b;
  const nS    = shown.length;
  const nA    = axes.length;
  const gW    = cw / nS;
  const barW  = Math.max(3, (gW * 0.82) / nA);
  const gap   = Math.max(0, (gW * 0.82 - barW * nA) / Math.max(1, nA - 1));
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
            {axes.map((ax, ai) => {
              const val = song.scores?.[ax] ?? 0;
              const bh  = (val / 10) * ch;
              const bx  = gx + ai * (barW + gap);
              const col = axColor(style, ax);
              return (
                <g key={ax}>
                  <rect x={bx} y={ch - bh} width={barW} height={Math.max(1, bh)}
                    fill={col} opacity={0.85} rx={2} />
                  {style.showLabels && bh > 16 && (
                    <text x={bx + barW / 2} y={ch - bh + 10} textAnchor="middle"
                      fill="#fff" opacity={0.75} fontSize={8} fontFamily="Inter, system-ui">{val}</text>
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

function BarsViz({ songs, axes, style }: VizProps) {
  if (!songs.length || !axes.length) return <EmptyMsg msg="Select artists and axes" />;
  const shown = songs.slice(0, 18);
  const labW  = 108;
  const pad   = { t: 48, b: 28, l: labW + 8, r: 24 };
  const cw    = VW - pad.l - pad.r;
  const ch    = VH - pad.t - pad.b;
  const nS    = shown.length;
  const nA    = axes.length;
  const gH    = ch / nS;
  const barH  = Math.max(3, (gH * 0.82) / nA);
  const gap   = Math.max(0, (gH * 0.82 - barH * nA) / Math.max(1, nA - 1));
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
            {axes.map((ax, ai) => {
              const val = song.scores?.[ax] ?? 0;
              const bw  = (val / 10) * cw;
              const by  = gy + ai * (barH + gap);
              const col = axColor(style, ax);
              return (
                <g key={ax}>
                  <rect x={0} y={by} width={Math.max(1, bw)} height={barH}
                    fill={col} opacity={0.85} rx={2} />
                  {style.showLabels && bw > 20 && (
                    <text x={bw - 4} y={by + barH / 2} textAnchor="end" dominantBaseline="middle"
                      fill="#fff" opacity={0.75} fontSize={8} fontFamily="Inter, system-ui">{val}</text>
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

// ─── 4 · Waveform (multi-axis area chart) ────────────────────────────────────

function WaveformViz({ songs, axes, style }: VizProps) {
  if (songs.length < 2 || !axes.length) return <EmptyMsg msg="Select ≥ 2 songs and at least one axis" />;
  const pad  = { t: 52, b: 52, l: 32, r: 18 };
  const cw   = VW - pad.l - pad.r;
  const ch   = VH - pad.t - pad.b;
  const step = cw / (songs.length - 1);

  const pts = (ax: Axis) => songs.map((s, i) => ({
    x: i * step,
    y: ch - ((s.scores?.[ax] ?? 0) / 10) * ch,
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
      {axes.map((ax) => {
        const points = pts(ax);
        const col    = axColor(style, ax);
        const linePath = points.map((p, i) => {
          if (i === 0) return `M ${p.x},${p.y}`;
          const prev = points[i - 1]!;
          const cpx  = (prev.x + p.x) / 2;
          return `C ${cpx},${prev.y} ${cpx},${p.y} ${p.x},${p.y}`;
        }).join(' ');
        const first = points[0]!, last = points[points.length - 1]!;
        const areaPath = `${linePath} L ${last.x},${ch} L ${first.x},${ch} Z`;
        return (
          <g key={ax}>
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

function OscilloscopeViz({ songs, style, axisX, axisY }: VizProps) {
  if (songs.length < 2) return <EmptyMsg msg="Select ≥ 2 songs for oscilloscope" />;
  const cx = VW / 2, cy = VH / 2;
  const R  = Math.min(VW, VH) * 0.38;
  const phColor = '#00ff88';

  const points = songs.map((s) => ({
    x: cx + (((s.scores?.[axisX] ?? 5) - 5) / 5) * R,
    y: cy - (((s.scores?.[axisY] ?? 5) - 5) / 5) * R,
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
      {/* Wide glow layer */}
      <path d={linePath} fill="none" stroke={phColor} strokeWidth={style.lineWidth * 4} opacity={0.12} />
      {/* Sharp trace */}
      <path d={linePath} fill="none" stroke={phColor}
        strokeWidth={style.lineWidth} opacity={0.92} filter="url(#scopeGlow)" />
      {/* Data dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={style.dotRadius * 0.7}
          fill={phColor} opacity={0.65} filter="url(#scopeGlow)" />
      ))}
      {style.showLabels && (
        <>
          <text x={cx + R + 6} y={cy + 4} dominantBaseline="middle"
            fill={phColor} opacity={0.5} fontSize={11} fontFamily="Inter, system-ui">
            {AXIS_LABEL[axisX]} →
          </text>
          <text x={cx} y={cy - R - 10} textAnchor="middle"
            fill={phColor} opacity={0.5} fontSize={11} fontFamily="Inter, system-ui">
            ↑ {AXIS_LABEL[axisY]}
          </text>
        </>
      )}
    </g>
  );
}

// ─── 6 · Vectorscope (polar) ─────────────────────────────────────────────────

function VectorscopeViz({ songs, style, axisX, axisY }: VizProps) {
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
        const xV  = s.scores?.[axisX] ?? 5;
        const yV  = s.scores?.[axisY] ?? 5;
        const mag = Math.sqrt((xV - 5) ** 2 + (yV - 5) ** 2) / 7.07;
        const ang = Math.atan2(-(yV - 5), xV - 5);
        const px  = cx + mag * R * Math.cos(ang);
        const py  = cy + mag * R * Math.sin(ang);
        return (
          <g key={s.id}>
            <circle cx={px} cy={py} r={style.dotRadius * 2.4}
              fill={dotColor} opacity={0.1} />
            <circle cx={px} cy={py} r={style.dotRadius}
              fill={dotColor} opacity={0.75} filter="url(#vscopeGlow)" />
          </g>
        );
      })}
      {style.showLabels && (
        <>
          <text x={cx + R + 6} y={cy + 4} dominantBaseline="middle"
            fill={dotColor} opacity={0.45} fontSize={11} fontFamily="Inter, system-ui">
            {AXIS_LABEL[axisX]} →
          </text>
          <text x={cx} y={cy - R - 10} textAnchor="middle"
            fill={dotColor} opacity={0.45} fontSize={11} fontFamily="Inter, system-ui">
            ↑ {AXIS_LABEL[axisY]}
          </text>
        </>
      )}
    </g>
  );
}

// ─── 7 · Heatmap ─────────────────────────────────────────────────────────────

function HeatmapViz({ songs, axes, style }: VizProps) {
  if (!songs.length || !axes.length) return <EmptyMsg msg="Select artists and axes" />;
  const shown  = songs.slice(0, 30);
  const labW   = 112;
  const pad    = { t: 52, b: 16, l: labW, r: 16 };
  const cw     = VW - pad.l - pad.r;
  const ch     = VH - pad.t - pad.b;
  const cellW  = cw / axes.length;
  const cellH  = Math.min(28, ch / shown.length);

  return (
    <g transform={`translate(${pad.l},${pad.t})`}>
      {axes.map((ax, i) => (
        <text key={ax} x={i * cellW + cellW / 2} y={-9} textAnchor="middle"
          fill={axColor(style, ax)} fontSize={10} fontWeight="700" fontFamily="Inter, system-ui">
          {AXIS_LABEL[ax]}
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
          {axes.map((ax, ai) => {
            const val       = song.scores?.[ax] ?? 0;
            const intensity = val / 10;
            const col       = axColor(style, ax);
            return (
              <g key={ax}>
                <rect x={ai * cellW + 1} y={si * cellH + 1}
                  width={cellW - 2} height={cellH - 2}
                  fill={hex2rgba(col, intensity * 0.88 + 0.04)} rx={2} />
                {style.showLabels && cellH >= 14 && (
                  <text x={ai * cellW + cellW / 2} y={si * cellH + cellH / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    fill="#fff" opacity={intensity > 0.35 ? 0.9 : 0.35}
                    fontSize={9} fontFamily="Inter, system-ui, monospace">
                    {val}
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

function ScatterViz({ songs, style, axisX, axisY }: VizProps) {
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
          <line x1={px(v)} y1={0} x2={px(v)} y2={ch}
            stroke={style.gridColor} strokeOpacity={0.06} />
          <line x1={0} y1={py(v)} x2={cw} y2={py(v)}
            stroke={style.gridColor} strokeOpacity={0.06} />
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
      <line x1={0} y1={0} x2={0}  y2={ch}  stroke={style.gridColor} strokeOpacity={0.2} />
      {songs.map((s) => {
        const x   = px(s.scores?.[axisX] ?? 0);
        const y   = py(s.scores?.[axisY] ?? 0);
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
            fill={axColor(style, axisX)} fontSize={12} fontWeight="600" fontFamily="Inter, system-ui">
            {AXIS_LABEL[axisX]}
          </text>
          <text x={-38} y={ch / 2} textAnchor="middle" dominantBaseline="middle"
            fill={axColor(style, axisY)} fontSize={12} fontWeight="600" fontFamily="Inter, system-ui"
            transform={`rotate(-90,-38,${ch / 2})`}>
            {AXIS_LABEL[axisY]}
          </text>
        </>
      )}
    </g>
  );
}

// ─── 9 · Pie / Donut ─────────────────────────────────────────────────────────

function PieViz({ songs, axes, style }: VizProps) {
  if (!songs.length || !axes.length) return <EmptyMsg msg="Select artists and axes" />;
  const cx     = VW / 2, cy = VH / 2;
  const outerR = Math.min(VW, VH) * 0.33;
  const innerR = outerR * 0.48;

  const avgs  = axes.map((ax) => ({
    ax,
    val: songs.reduce((s, song) => s + (song.scores?.[ax] ?? 0), 0) / songs.length,
  }));
  const total = avgs.reduce((s, { val }) => s + val, 0);
  if (total === 0) return <EmptyMsg msg="No scores available" />;

  let angle = -Math.PI / 2;
  const slices = avgs.map(({ ax, val }) => {
    const sweep = (val / total) * 2 * Math.PI;
    const s = angle;
    angle += sweep;
    return { ax, val, start: s, end: angle, sweep };
  });

  const arc = (s: number, e: number, oR: number, iR: number) => {
    const x1 = cx + oR * Math.cos(s), y1 = cy + oR * Math.sin(s);
    const x2 = cx + oR * Math.cos(e), y2 = cy + oR * Math.sin(e);
    const x3 = cx + iR * Math.cos(e), y3 = cy + iR * Math.sin(e);
    const x4 = cx + iR * Math.cos(s), y4 = cy + iR * Math.sin(s);
    const lg = e - s > Math.PI ? 1 : 0;
    return `M ${x1},${y1} A ${oR},${oR} 0 ${lg} 1 ${x2},${y2} L ${x3},${y3} A ${iR},${iR} 0 ${lg} 0 ${x4},${y4} Z`;
  };

  return (
    <g>
      {slices.map(({ ax, val, start, end, sweep }) => {
        const col = axColor(style, ax);
        const mid = start + sweep / 2;
        const lR  = outerR + 22;
        const lx  = cx + lR * Math.cos(mid);
        const ly  = cy + lR * Math.sin(mid);
        const pct = Math.round((val / total) * 100);
        return (
          <g key={ax}>
            <path d={arc(start, end, outerR, innerR)}
              fill={col} opacity={0.88} stroke={style.bg} strokeWidth={2} />
            {style.showLabels && sweep > 0.28 && (
              <text x={lx} y={ly}
                textAnchor={Math.cos(mid) > 0 ? 'start' : 'end'}
                dominantBaseline="middle"
                fill={col} fontSize={11} fontWeight="600" fontFamily="Inter, system-ui">
                {AXIS_LABEL[ax]} {pct}%
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

function BubbleViz({ songs, style, axisX, axisY, axisZ }: VizProps) {
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
          <line x1={px(v)} y1={0} x2={px(v)} y2={ch}
            stroke={style.gridColor} strokeOpacity={0.06} />
          <line x1={0} y1={py(v)} x2={cw} y2={py(v)}
            stroke={style.gridColor} strokeOpacity={0.06} />
        </g>
      ))}
      <line x1={0} y1={ch} x2={cw} y2={ch} stroke={style.gridColor} strokeOpacity={0.2} />
      <line x1={0} y1={0} x2={0}  y2={ch}  stroke={style.gridColor} strokeOpacity={0.2} />
      {songs.map((s) => {
        const x   = px(s.scores?.[axisX] ?? 0);
        const y   = py(s.scores?.[axisY] ?? 0);
        const r   = pr(s.scores?.[axisZ] ?? 0);
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
            fill={axColor(style, axisX)} fontSize={12} fontWeight="600" fontFamily="Inter, system-ui">
            {AXIS_LABEL[axisX]}
          </text>
          <text x={-38} y={ch / 2} textAnchor="middle" dominantBaseline="middle"
            fill={axColor(style, axisY)} fontSize={12} fontWeight="600" fontFamily="Inter, system-ui"
            transform={`rotate(-90,-38,${ch / 2})`}>
            {AXIS_LABEL[axisY]}
          </text>
          <text x={cw - 4} y={12} textAnchor="end"
            fill={axColor(style, axisZ)} opacity={0.5} fontSize={10} fontFamily="Inter, system-ui">
            size: {AXIS_LABEL[axisZ]}
          </text>
        </>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SpectrumStudioPage() {
  const { user, isLoading: authLoading } = useAuth();
  const svgRef = useRef<SVGSVGElement>(null);

  const [vizType,        setVizType]        = useState<VizType>('radar');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [selectedAxes,   setSelectedAxes]   = useState<Axis[]>([...AXES]);
  const [axisX,          setAxisX]          = useState<Axis>('aggression');
  const [axisY,          setAxisY]          = useState<Axis>('complexity');
  const [axisZ,          setAxisZ]          = useState<Axis>('atmosphere');
  const [style,          setStyle]          = useState<StudioStyle>(loadStyle);
  const [showStylePanel, setShowStylePanel] = useState(true);
  const [exportMsg,      setExportMsg]      = useState('');

  useEffect(() => { localStorage.setItem(STYLE_KEY, JSON.stringify(style)); }, [style]);

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

  const scoredSongs = useMemo(() => (songsRaw ?? []).filter((s) => s.scores), [songsRaw]);

  const filteredSongs = useMemo(() => {
    if (!selectedSongIds.length) return scoredSongs;
    return scoredSongs.filter((s) => selectedSongIds.includes(s.id));
  }, [scoredSongs, selectedSongIds]);

  const needsXY = ['oscilloscope', 'vectorscope', 'scatter', 'bubble'].includes(vizType);
  const needsZ  = vizType === 'bubble';

  const vizProps: VizProps = { songs: filteredSongs, axes: selectedAxes, style, axisX, axisY, axisZ };

  function renderViz() {
    switch (vizType) {
      case 'radar':        return <RadarViz         {...vizProps} />;
      case 'columns':      return <ColumnsViz       {...vizProps} />;
      case 'bars':         return <BarsViz          {...vizProps} />;
      case 'waveform':     return <WaveformViz      {...vizProps} />;
      case 'oscilloscope': return <OscilloscopeViz  {...vizProps} />;
      case 'vectorscope':  return <VectorscopeViz   {...vizProps} />;
      case 'heatmap':      return <HeatmapViz       {...vizProps} />;
      case 'scatter':      return <ScatterViz        {...vizProps} />;
      case 'pie':          return <PieViz            {...vizProps} />;
      case 'bubble':       return <BubbleViz         {...vizProps} />;
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
    setSelectedSongIds([]);
  }, []);

  const toggleAxis = useCallback((ax: Axis) => {
    setSelectedAxes((p) => p.includes(ax)
      ? (p.length > 1 ? p.filter((x) => x !== ax) : p)
      : [...p, ax]);
  }, []);

  const showLegendInSvg =
    style.showLegend &&
    !['oscilloscope','vectorscope','scatter','bubble','pie','heatmap'].includes(vizType);

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
        <aside className="w-60 shrink-0 bg-gray-900/50 border-r border-white/10 overflow-y-auto">
          <div className="p-4 space-y-5 text-xs">

            {/* Artists */}
            <section>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Artists</div>
              {bandsData ? (
                <>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
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
                    <button onClick={() => { setSelectedBandIds(bandsData.map((b) => b.id)); setSelectedSongIds([]); }}
                      className="text-indigo-400 hover:text-indigo-200">All</button>
                    <span className="text-white/20">·</span>
                    <button onClick={() => { setSelectedBandIds([]); setSelectedSongIds([]); }}
                      className="text-white/40 hover:text-white/70">None</button>
                  </div>
                </>
              ) : <p className="text-white/25">Loading…</p>}
            </section>

            {/* Songs */}
            {scoredSongs.length > 0 && (
              <section>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">
                  Songs <span className="text-white/20 font-normal">({filteredSongs.length} / {scoredSongs.length} scored)</span>
                </div>
                <div className="flex gap-2 mb-1.5">
                  <button onClick={() => setSelectedSongIds([])}
                    className={`transition-colors ${!selectedSongIds.length ? 'text-indigo-400 font-semibold' : 'text-white/40 hover:text-white/70'}`}>
                    All
                  </button>
                  <span className="text-white/20">·</span>
                  <button onClick={() => setSelectedSongIds(scoredSongs.map((s) => s.id))}
                    className="text-white/40 hover:text-white/70">Select all</button>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
                  {scoredSongs.map((s) => {
                    const on = !selectedSongIds.length || selectedSongIds.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" className="accent-indigo-500" checked={on}
                          onChange={() => {
                            if (!selectedSongIds.length) {
                              setSelectedSongIds(scoredSongs.filter((x) => x.id !== s.id).map((x) => x.id));
                            } else {
                              setSelectedSongIds((p) =>
                                p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]);
                            }
                          }} />
                        <span className={`truncate ${on ? 'text-white/70' : 'text-white/25 group-hover:text-white/50'}`}>
                          {s.title}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Axes */}
            <section>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Axes</div>
              <div className="space-y-1.5">
                {AXES.map((ax) => (
                  <label key={ax} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="accent-indigo-500"
                      checked={selectedAxes.includes(ax)}
                      onChange={() => toggleAxis(ax)} />
                    <span className="font-semibold" style={{ color: axColor(style, ax) }}>
                      {AXIS_LABEL[ax]}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {/* X / Y / Z pickers for relevant viz types */}
            {needsXY && (
              <section>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">
                  Plot Axes
                </div>
                <div className="space-y-2">
                  {(['X','Y'] as const).map((lbl) => {
                    const val = lbl === 'X' ? axisX : axisY;
                    const set = lbl === 'X' ? setAxisX : setAxisY;
                    return (
                      <div key={lbl} className="flex items-center gap-2">
                        <span className="text-white/40 w-4 shrink-0">{lbl}</span>
                        <select value={val} onChange={(e) => set(e.target.value as Axis)}
                          className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-white text-xs">
                          {AXES.map((ax) => <option key={ax} value={ax}>{AXIS_LABEL[ax]}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  {needsZ && (
                    <div className="flex items-center gap-2">
                      <span className="text-white/40 w-4 shrink-0">S</span>
                      <select value={axisZ} onChange={(e) => setAxisZ(e.target.value as Axis)}
                        className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-white text-xs">
                        {AXES.map((ax) => <option key={ax} value={ax}>{AXIS_LABEL[ax]}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </section>
            )}

          </div>
        </aside>

        {/* ── Chart canvas ───────────────────────────────────────── */}
        <main className="flex-1 flex items-center justify-center p-5 min-w-0 overflow-hidden"
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
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VW} ${VH}`}
              className="w-full h-full"
              style={{ maxWidth: VW, maxHeight: VH }}
              xmlns="http://www.w3.org/2000/svg"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {/* Background */}
              <rect width={VW} height={VH} fill={style.bg} rx={6} />

              {/* Title */}
              {style.showTitle && (
                <text x={VW / 2} y={26} textAnchor="middle"
                  fill={style.fg} fontSize={15} fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif" opacity={0.8}>
                  {style.titleText}
                </text>
              )}

              {/* Visualisation */}
              {renderViz()}

              {/* Legend strip */}
              {showLegendInSvg && (
                <g transform={`translate(${(VW - Math.min(selectedAxes.length, 6) * 108) / 2},${VH - 18})`}>
                  {selectedAxes.slice(0, 6).map((ax, i) => (
                    <g key={ax} transform={`translate(${i * 108},0)`}>
                      <rect x={0} y={-6} width={10} height={10} rx={2}
                        fill={axColor(style, ax)} />
                      <text x={14} y={4} fill={style.fg} opacity={0.55}
                        fontSize={10} fontFamily="Inter, system-ui">
                        {AXIS_LABEL[ax]}
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
          )}
        </main>

        {/* ── Right panel: style controls ────────────────────────── */}
        {showStylePanel && (
          <aside className="w-52 shrink-0 bg-gray-900/50 border-l border-white/10 overflow-y-auto">
            <div className="p-4 space-y-5 text-xs">

              {/* Title */}
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

              {/* Canvas colors */}
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

              {/* Axis colors */}
              <section>
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-2">Axis Colors</div>
                <div className="space-y-2">
                  {AXES.map((ax) => (
                    <ColorRow key={ax} label={AXIS_LABEL[ax]}
                      value={style.axisColors[ax] ?? BASE_AXIS_COLORS[ax] ?? '#888'}
                      onChange={(v) => setStyle((s) => ({
                        ...s, axisColors: { ...s.axisColors, [ax]: v },
                      }))} />
                  ))}
                </div>
              </section>

              {/* Numeric sliders */}
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

              {/* Display toggles */}
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

              {/* Quick presets */}
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
                      className="py-1.5 bg-white/6 hover:bg-white/14 rounded text-white/50 hover:text-white transition-colors">
                      {name}
                    </button>
                  ))}
                </div>
              </section>

              <button onClick={() => setStyle(DEFAULT_STYLE)}
                className="w-full py-1.5 bg-white/5 hover:bg-white/10 rounded text-white/35 hover:text-white/65 transition-colors">
                Reset all defaults
              </button>

            </div>
          </aside>
        )}

      </div>
    </div>
  );
}

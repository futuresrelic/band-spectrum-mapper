import { useEffect, useRef, useState, useMemo } from 'react';
import type { RhythmAnalysisResult } from '@band-spectrum-mapper/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RadarMode = 'radar' | 'constellation' | 'orbit' | 'polyrhythm';

interface PhaseNode {
  angle:  number;   // 0–2π, position within a bar
  weight: number;   // 0–1 density (1 = hit every bar)
}

interface Props {
  result:       RhythmAnalysisResult;
  beatBpm:      number;
  timeSigBeats: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAND_COLORS = [
  '#ef4444', // red     — Kick
  '#f59e0b', // amber   — Snare Body
  '#10b981', // emerald — Snare Crack / Hi-hat
  '#3b82f6', // blue    — Hi-hat / Cymbal
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
] as const;

const CANVAS_SIZE = 340;

// ---------------------------------------------------------------------------
// Phase-node computation
// Clusters onset times into angular positions within one bar.
// O(n log n): sort angles, then linear scan + wrap-around merge.
// ---------------------------------------------------------------------------

function computePhaseNodes(
  onsetTimes: number[],
  barLength: number,
): PhaseNode[] {
  if (!onsetTimes.length || barLength <= 0) return [];

  const angles = onsetTimes
    .map((t) => ((t % barLength) / barLength) * 2 * Math.PI)
    .sort((a, b) => a - b);

  const CLUSTER_RAD = 0.1; // ~5.7° — nearby hits treated as one position
  const nodes: PhaseNode[] = [];
  let i = 0;

  while (i < angles.length) {
    let sum = angles[i]!;
    let count = 1;
    let j = i + 1;
    while (j < angles.length && (angles[j]! - angles[i]!) < CLUSTER_RAD) {
      sum += angles[j]!;
      count++;
      j++;
    }
    nodes.push({ angle: sum / count, weight: Math.min(count / 8, 1) });
    i = j;
  }

  // Wrap-around merge: first and last clusters may straddle 0/2π boundary
  if (nodes.length > 1) {
    const first = nodes[0]!;
    const last  = nodes[nodes.length - 1]!;
    const gap   = 2 * Math.PI - last.angle + first.angle;
    if (gap < CLUSTER_RAD) {
      const cA = Math.round(first.weight * 8);
      const cB = Math.round(last.weight * 8);
      first.angle  = (first.angle * cA + last.angle * cB) / (cA + cB);
      first.weight = Math.min((cA + cB) / 8, 1);
      nodes.pop();
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Shared draw helpers
// ---------------------------------------------------------------------------

function bandColor(i: number): string {
  return BAND_COLORS[i % BAND_COLORS.length] ?? '#ffffff';
}

function ringLayout(bandCount: number) {
  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;
  const maxR  = cx - 16;
  const innerR = 26;
  const step  = bandCount > 0 ? (maxR - innerR) / bandCount : 30;
  return { cx, cy, maxR, innerR, step };
}

function fillBg(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, maxR: number,
) {
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 1.1);
  grad.addColorStop(0, 'rgba(99,102,241,0.06)');
  grad.addColorStop(1, 'rgba(15,23,42,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 1.1, 0, 2 * Math.PI);
  ctx.fill();
}

function drawBeatSpokes(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, maxR: number, beats: number,
) {
  for (let b = 0; b < beats; b++) {
    const a = (b / beats) * 2 * Math.PI - Math.PI / 2;
    ctx.strokeStyle = b === 0 ? 'rgba(99,102,241,0.28)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = b === 0 ? 1 : 0.5;
    ctx.setLineDash(b === 0 ? [] : [3, 6]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a));
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawRingCircles(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, count: number, innerR: number, step: number,
) {
  for (let i = 0; i <= count; i++) {
    const r = innerR + i * step;
    ctx.strokeStyle = i === 0
      ? 'rgba(255,255,255,0.10)'
      : `${bandColor(i - 1)}18`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

function sweepProximity(nodeAngle: number, sweepAngle: number): number {
  const n = ((nodeAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const s = ((sweepAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const d = Math.min(Math.abs(n - s), 2 * Math.PI - Math.abs(n - s));
  return Math.max(0, 1 - d / 0.25);
}

function drawSweep(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, maxR: number, sweep: number,
) {
  const a  = sweep - Math.PI / 2;
  const ex = cx + maxR * Math.cos(a);
  const ey = cy + maxR * Math.sin(a);

  // trailing fan
  ctx.strokeStyle = 'rgba(99,102,241,0.07)';
  ctx.lineWidth   = 28;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * 0.5, a - 0.45, a);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // main line
  const lg = ctx.createLinearGradient(cx, cy, ex, ey);
  lg.addColorStop(0,   'rgba(99,102,241,0)');
  lg.addColorStop(0.4, 'rgba(99,102,241,0.25)');
  lg.addColorStop(1,   'rgba(139,92,246,0.90)');
  ctx.strokeStyle = lg;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // tip
  ctx.fillStyle = 'rgba(139,92,246,0.65)';
  ctx.beginPath();
  ctx.arc(ex, ey, 3, 0, 2 * Math.PI);
  ctx.fill();
}

function drawCenterDot(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.fillStyle = 'rgba(99,102,241,0.60)';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Mode: Radar — sweep + pulsing onset nodes per ring
// ---------------------------------------------------------------------------

function drawRadarMode(
  ctx:   CanvasRenderingContext2D,
  result: RhythmAnalysisResult,
  nodes:  PhaseNode[][],
  sweep:  number,
  visible: Set<number>,
  beats:  number,
) {
  const { cx, cy, maxR, innerR, step } = ringLayout(result.bands.length);
  fillBg(ctx, cx, cy, maxR);
  drawBeatSpokes(ctx, cx, cy, maxR, beats);
  drawRingCircles(ctx, cx, cy, result.bands.length, innerR, step);

  for (let i = 0; i < result.bands.length; i++) {
    if (!visible.has(i)) continue;
    const col  = bandColor(i);
    const r    = innerR + (i + 0.5) * step;
    const ring = nodes[i] ?? [];

    for (const nd of ring) {
      const a   = nd.angle - Math.PI / 2;
      const nx  = cx + r * Math.cos(a);
      const ny  = cy + r * Math.sin(a);
      const prx = sweepProximity(nd.angle, sweep);
      const nr  = 2.5 + nd.weight * 3 + prx * 5;

      // outer glow
      if (prx > 0.05 || nd.weight > 0.35) {
        const gr = nr * (2.5 + prx * 2);
        const gl = ctx.createRadialGradient(nx, ny, 0, nx, ny, gr);
        const a1 = Math.round(Math.min(1, 0.25 + prx * 0.45) * 255).toString(16).padStart(2, '0');
        gl.addColorStop(0, col + a1);
        gl.addColorStop(1, col + '00');
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(nx, ny, gr, 0, 2 * Math.PI);
        ctx.fill();
      }

      // core
      const alpha = Math.min(1, 0.5 + nd.weight * 0.4 + prx * 0.5);
      const hex   = Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.fillStyle = col + hex;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  drawSweep(ctx, cx, cy, maxR, sweep);
  drawCenterDot(ctx, cx, cy);
}

// ---------------------------------------------------------------------------
// Mode: Constellation — static star-map with connecting lines
// ---------------------------------------------------------------------------

function drawConstellationMode(
  ctx:     CanvasRenderingContext2D,
  result:  RhythmAnalysisResult,
  nodes:   PhaseNode[][],
  visible: Set<number>,
  beats:   number,
) {
  const { cx, cy, maxR, innerR, step } = ringLayout(result.bands.length);
  fillBg(ctx, cx, cy, maxR);
  drawBeatSpokes(ctx, cx, cy, maxR, beats);
  drawRingCircles(ctx, cx, cy, result.bands.length, innerR, step);

  for (let i = 0; i < result.bands.length; i++) {
    if (!visible.has(i)) continue;
    const col    = bandColor(i);
    const r      = innerR + (i + 0.5) * step;
    const sorted = [...(nodes[i] ?? [])].sort((a, b) => a.angle - b.angle);

    // Constellation lines between nearby nodes
    for (let j = 0; j < sorted.length; j++) {
      const curr = sorted[j]!;
      const next = sorted[(j + 1) % sorted.length]!;
      const diff = Math.min(
        Math.abs(curr.angle - next.angle),
        2 * Math.PI - Math.abs(curr.angle - next.angle),
      );
      if (diff < Math.PI / 2.5 && sorted.length > 1) {
        ctx.strokeStyle = `${col}28`;
        ctx.lineWidth   = 0.7;
        ctx.beginPath();
        ctx.moveTo(cx + r * Math.cos(curr.angle - Math.PI / 2), cy + r * Math.sin(curr.angle - Math.PI / 2));
        ctx.lineTo(cx + r * Math.cos(next.angle - Math.PI / 2), cy + r * Math.sin(next.angle - Math.PI / 2));
        ctx.stroke();
      }
    }

    // Stars
    for (const nd of sorted) {
      const a  = nd.angle - Math.PI / 2;
      const nx = cx + r * Math.cos(a);
      const ny = cy + r * Math.sin(a);
      const nr = 1.5 + nd.weight * 3.5;

      // 4-point star flare for bright nodes
      if (nd.weight > 0.45) {
        ctx.strokeStyle = `${col}38`;
        ctx.lineWidth   = 0.5;
        for (let sp = 0; sp < 4; sp++) {
          const sa = a + (sp * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(nx + Math.cos(sa) * nr, ny + Math.sin(sa) * nr);
          ctx.lineTo(nx + Math.cos(sa) * nr * 3.5, ny + Math.sin(sa) * nr * 3.5);
          ctx.stroke();
        }
      }

      ctx.fillStyle  = col;
      ctx.globalAlpha = 0.45 + nd.weight * 0.55;
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Mode: Orbit — bands as planets orbiting at their own BPM
// ---------------------------------------------------------------------------

function drawOrbitMode(
  ctx:     CanvasRenderingContext2D,
  result:  RhythmAnalysisResult,
  nodes:   PhaseNode[][],
  sweep:   number,
  visible: Set<number>,
  beatBpm: number,
) {
  const { cx, cy, maxR, innerR, step } = ringLayout(result.bands.length);
  fillBg(ctx, cx, cy, maxR);

  // Orbit rings
  for (let i = 0; i < result.bands.length; i++) {
    const r   = innerR + (i + 0.5) * step;
    const col = bandColor(i);
    ctx.strokeStyle = visible.has(i) ? `${col}18` : 'rgba(255,255,255,0.03)';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Sun
  const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
  sg.addColorStop(0, 'rgba(253,224,71,0.85)');
  sg.addColorStop(0.5, 'rgba(251,191,36,0.35)');
  sg.addColorStop(1, 'rgba(245,158,11,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
  ctx.fill();

  // Planets
  for (let i = 0; i < result.bands.length; i++) {
    if (!visible.has(i)) continue;
    const band  = result.bands[i]!;
    const col   = bandColor(i);
    const r     = innerR + (i + 0.5) * step;
    const ratio = band.bandBpm > 0 ? band.bandBpm / Math.max(beatBpm, 1) : 1;
    const pa    = sweep * ratio - Math.PI / 2;
    const px    = cx + r * Math.cos(pa);
    const py    = cy + r * Math.sin(pa);

    // Trail arc
    ctx.strokeStyle = `${col}28`;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, pa - 0.7, pa);
    ctx.stroke();

    // Planet gradient body
    const planetSize = 7 + (nodes[i]?.length ?? 0) * 0.3;
    const pg = ctx.createRadialGradient(px - 2, py - 2, 0, px, py, planetSize);
    pg.addColorStop(0, col);
    pg.addColorStop(1, `${col}00`);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, planetSize, 0, 2 * Math.PI);
    ctx.fill();

    // Onset moons (up to 12)
    const ring = nodes[i] ?? [];
    for (const nd of ring.slice(0, 12)) {
      const moonAngle = nd.angle * 4;
      const moonDist  = planetSize + 5 + nd.weight * 3;
      ctx.fillStyle  = `${col}55`;
      ctx.beginPath();
      ctx.arc(
        px + moonDist * Math.cos(moonAngle),
        py + moonDist * Math.sin(moonAngle),
        1.5, 0, 2 * Math.PI,
      );
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// Mode: Polyrhythm — highlights cross-rhythm relationships between bands
// ---------------------------------------------------------------------------

function drawPolyrhythmMode(
  ctx:     CanvasRenderingContext2D,
  result:  RhythmAnalysisResult,
  nodes:   PhaseNode[][],
  sweep:   number,
  visible: Set<number>,
  beats:   number,
) {
  const { cx, cy, maxR, innerR, step } = ringLayout(result.bands.length);
  fillBg(ctx, cx, cy, maxR);
  drawBeatSpokes(ctx, cx, cy, maxR, beats);
  drawRingCircles(ctx, cx, cy, result.bands.length, innerR, step);

  // Draw cross-rhythm connections
  for (const cr of result.crossRhythms) {
    const ai = result.bands.findIndex((b) => b.label === cr.bandA);
    const bi = result.bands.findIndex((b) => b.label === cr.bandB);
    if (ai < 0 || bi < 0 || !visible.has(ai) || !visible.has(bi)) continue;

    const rA   = innerR + (ai + 0.5) * step;
    const rB   = innerR + (bi + 0.5) * step;
    const nodesA = nodes[ai] ?? [];
    const nodesB = nodes[bi] ?? [];

    ctx.strokeStyle = `rgba(251,191,36,${cr.confidence * 0.18})`;
    ctx.lineWidth   = 0.6;

    for (const na of nodesA.slice(0, 10)) {
      let closest: PhaseNode | null = null;
      let minGap = Infinity;
      for (const nb of nodesB) {
        const d = Math.min(
          Math.abs(na.angle - nb.angle),
          2 * Math.PI - Math.abs(na.angle - nb.angle),
        );
        if (d < minGap) { minGap = d; closest = nb; }
      }
      if (closest && minGap < Math.PI / 2) {
        const aa = na.angle - Math.PI / 2;
        const ba = closest.angle - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx + rA * Math.cos(aa), cy + rA * Math.sin(aa));
        ctx.lineTo(cx + rB * Math.cos(ba), cy + rB * Math.sin(ba));
        ctx.stroke();
      }
    }
  }

  // Render all visible bands
  for (let i = 0; i < result.bands.length; i++) {
    if (!visible.has(i)) continue;
    const col  = bandColor(i);
    const r    = innerR + (i + 0.5) * step;
    const ring = nodes[i] ?? [];

    const inCrossRhythm = result.crossRhythms.some(
      (cr) => cr.bandA === result.bands[i]?.label || cr.bandB === result.bands[i]?.label,
    );

    for (const nd of ring) {
      const a   = nd.angle - Math.PI / 2;
      const nx  = cx + r * Math.cos(a);
      const ny  = cy + r * Math.sin(a);
      const prx = sweepProximity(nd.angle, sweep);
      const nr  = 2.5 + nd.weight * 2.5 + prx * 4;
      const base = inCrossRhythm ? 0.7 : 0.35;
      const alpha = Math.min(1, base + prx * 0.4);
      ctx.fillStyle = col + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.beginPath();
      ctx.arc(nx, ny, nr, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  drawSweep(ctx, cx, cy, maxR, sweep);
  drawCenterDot(ctx, cx, cy);

  // Polyrhythm score in bottom-center
  const pct = (result.polyrhythmScore * 100).toFixed(0);
  ctx.fillStyle   = result.polyrhythmScore > 0.3
    ? `rgba(251,191,36,${0.4 + result.polyrhythmScore * 0.6})`
    : 'rgba(255,255,255,0.18)';
  ctx.font        = 'bold 10px ui-monospace, monospace';
  ctx.textAlign   = 'center';
  ctx.fillText(`Polyrhythm ${pct}%`, CANVAS_SIZE / 2, CANVAS_SIZE - 8);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RhythmRadarCanvas({ result, beatBpm, timeSigBeats }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const timerRef  = useRef({ accumulated: 0, lastTs: 0, running: true });

  const [mode, setMode]           = useState<RadarMode>('radar');
  const [animating, setAnimating] = useState(true);
  const [visibleBands, setVisibleBands] = useState<Set<number>>(
    () => new Set(result.bands.map((_, i) => i)),
  );

  const phaseNodes = useMemo<PhaseNode[][]>(() => {
    const barLen = (60 / Math.max(beatBpm, 1)) * Math.max(timeSigBeats, 1);
    return result.bands.map((b) => computePhaseNodes(b.onsetTimes, barLen));
  }, [result, beatBpm, timeSigBeats]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    canvas.style.width  = `${CANVAS_SIZE}px`;
    canvas.style.height = `${CANVAS_SIZE}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const barMs = (60_000 / Math.max(beatBpm, 1)) * Math.max(timeSigBeats, 1);

    // Snapshot mutable refs to avoid stale closures across re-renders
    const timer = timerRef.current;

    let cancelled = false;

    function frame(ts: number) {
      if (cancelled) return;

      if (timer.running) {
        if (timer.lastTs > 0) timer.accumulated += ts - timer.lastTs;
        timer.lastTs = ts;
      } else {
        timer.lastTs = 0;
      }

      const sweepAngle = (timer.accumulated / barMs) * 2 * Math.PI;

      switch (mode) {
        case 'radar':
          drawRadarMode(ctx!, result, phaseNodes, sweepAngle, visibleBands, timeSigBeats);
          break;
        case 'constellation':
          drawConstellationMode(ctx!, result, phaseNodes, visibleBands, timeSigBeats);
          break;
        case 'orbit':
          drawOrbitMode(ctx!, result, phaseNodes, sweepAngle, visibleBands, beatBpm);
          break;
        case 'polyrhythm':
          drawPolyrhythmMode(ctx!, result, phaseNodes, sweepAngle, visibleBands, timeSigBeats);
          break;
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [result, phaseNodes, beatBpm, timeSigBeats, mode, visibleBands, animating]);

  function togglePlay() {
    const t = timerRef.current;
    if (t.running) {
      t.running = false;
    } else {
      t.running = true;
      t.lastTs  = 0;
    }
    setAnimating((a) => !a);
  }

  function toggleBand(i: number) {
    setVisibleBands((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  const barLenSec = (60 / Math.max(beatBpm, 1)) * timeSigBeats;

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-surface-400 shrink-0">Mode:</span>
        {(['radar', 'constellation', 'orbit', 'polyrhythm'] as RadarMode[]).map((m) => (
          <button
            key={m}
            className={`text-xs px-2.5 py-0.5 rounded transition-colors capitalize ${
              mode === m
                ? 'bg-indigo-600 text-white'
                : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
            }`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
        <button
          className={`ml-auto text-xs px-2.5 py-0.5 rounded transition-colors ${
            animating
              ? 'bg-purple-900/50 text-purple-300 border border-purple-700/40'
              : 'bg-surface-700 text-surface-400'
          }`}
          onClick={togglePlay}
        >
          {animating ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>

      {/* Canvas + legend */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <canvas
          ref={canvasRef}
          className="rounded-xl border border-surface-700/40 shrink-0 block"
        />

        {/* Band legend / toggles */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="text-xs text-surface-500 font-mono mb-2">
            {barLenSec.toFixed(2)}s / bar · {result.bands.length} bands
          </div>

          {result.bands.map((band, i) => {
            const col     = bandColor(i);
            const ringNodes = phaseNodes[i] ?? [];
            return (
              <button
                key={i}
                onClick={() => toggleBand(i)}
                className={`flex items-center gap-2 text-xs w-full text-left rounded px-2 py-1.5 transition-all ${
                  visibleBands.has(i)
                    ? 'bg-surface-800/60 hover:bg-surface-800'
                    : 'bg-surface-900/20 opacity-35 hover:opacity-60'
                }`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: col }}
                />
                <span className="text-surface-200 font-medium truncate">
                  {band.label}
                </span>
                <span className="text-surface-600 font-mono ml-auto text-[10px] shrink-0">
                  {ringNodes.length}n
                  {band.bandBpm > 0 ? ` · ${band.bandBpm.toFixed(0)}bpm` : ''}
                  {band.ibiCv > 0 ? ` · cv${band.ibiCv.toFixed(2)}` : ''}
                </span>
              </button>
            );
          })}

          {/* Cross-rhythms summary */}
          {result.crossRhythms.length > 0 && (
            <div className="pt-2 mt-1 border-t border-surface-700/30 space-y-1">
              <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                Cross-rhythms
              </div>
              {result.crossRhythms.map((cr, i) => (
                <div key={i} className="text-[10px] font-mono text-amber-300/70">
                  {cr.bandA} : {cr.bandB} = <strong className="text-amber-300">{cr.ratio}</strong>
                  <span className="text-amber-700 ml-1">
                    ({(cr.confidence * 100).toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Mode descriptions */}
          <div className="pt-2 text-[10px] text-surface-600 leading-relaxed">
            {mode === 'radar' &&
              'Each dot = an onset. Position = timing within the bar. Sweep = current bar position.'}
            {mode === 'constellation' &&
              'Static map. Lines connect nearby hits. Star brightness = how often hit occurs.'}
            {mode === 'orbit' &&
              'Each band orbits at its own detected BPM. Orbit speed shows rhythmic relationship.'}
            {mode === 'polyrhythm' &&
              'Golden lines connect cross-rhythmic hit pairs. Highlighted when cross-rhythms detected.'}
          </div>
        </div>
      </div>
    </div>
  );
}

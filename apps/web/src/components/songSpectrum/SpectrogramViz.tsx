import { useEffect, useRef } from 'react';

interface Props {
  data: number[][];    // [freqBin][timeFrame] 0–1 normalised energy
  times: number[];
  freqs: number[];
  height?: number;
  className?: string;
}

// Colour map: 0 → dark navy, 0.5 → cyan, 1 → bright yellow
function spectralColor(v: number): [number, number, number] {
  if (v < 0.25) {
    // 0 → navy (#0d1b2e) to blue (#1e40af)
    const t = v / 0.25;
    return [Math.round(13 + t * (30 - 13)), Math.round(27 + t * (64 - 27)), Math.round(46 + t * (175 - 46))];
  } else if (v < 0.5) {
    // blue → cyan (#06b6d4)
    const t = (v - 0.25) / 0.25;
    return [Math.round(30 + t * (6 - 30)), Math.round(64 + t * (182 - 64)), Math.round(175 + t * (212 - 175))];
  } else if (v < 0.75) {
    // cyan → green (#22c55e)
    const t = (v - 0.5) / 0.25;
    return [Math.round(6 + t * (34 - 6)), Math.round(182 + t * (197 - 182)), Math.round(212 + t * (94 - 212))];
  } else {
    // green → yellow (#fbbf24)
    const t = (v - 0.75) / 0.25;
    return [Math.round(34 + t * (251 - 34)), Math.round(197 + t * (191 - 197)), Math.round(94 + t * (36 - 94))];
  }
}

export default function SpectrogramViz({ data, times, freqs, height = 160, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nFreq = data.length;
    const nTime = data[0]?.length ?? 0;
    if (!nTime) return;

    const W = canvas.width;
    const H = canvas.height;
    const cellW = W / nTime;
    const cellH = H / nFreq;

    ctx.clearRect(0, 0, W, H);

    for (let f = 0; f < nFreq; f++) {
      for (let t = 0; t < nTime; t++) {
        const v = Math.min(1, Math.max(0, data[f]?.[t] ?? 0));
        const [r, g, b] = spectralColor(v);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        // Flip Y: low freq at bottom, high freq at top
        ctx.fillRect(
          Math.round(t * cellW),
          Math.round((nFreq - 1 - f) * cellH),
          Math.ceil(cellW),
          Math.ceil(cellH),
        );
      }
    }

    // Frequency axis labels (left side)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px monospace';
    const labelFreqs = [200, 1000, 4000, 10000];
    for (const hz of labelFreqs) {
      const closestIdx = freqs.reduce(
        (best, f, i) => (Math.abs(f - hz) < Math.abs(freqs[best]! - hz) ? i : best),
        0,
      );
      const y = H - ((closestIdx / nFreq) * H);
      ctx.fillText(`${hz >= 1000 ? (hz / 1000).toFixed(hz >= 10000 ? 0 : 1) + 'k' : hz}`, 4, Math.max(12, y));
    }

    // Time axis labels (bottom)
    const dur = times[times.length - 1] ?? 0;
    const labelCount = 5;
    for (let i = 0; i <= labelCount; i++) {
      const sec = (dur * i) / labelCount;
      const x = (i / labelCount) * W;
      const label = sec >= 60
        ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
        : `${Math.round(sec)}s`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(label, Math.max(2, x - 10), H - 4);
    }
  }, [data, times, freqs, height]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        className="w-full rounded"
        style={{ height }}
      />
    </div>
  );
}

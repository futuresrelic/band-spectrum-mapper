import { useEffect, useRef } from 'react';

interface Props {
  waveform: number[];       // ~1000 amplitude points 0–1
  color?: string;
  height?: number;
  className?: string;
}

export default function WaveformViz({ waveform, color = '#6366f1', height = 80, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const mid = H / 2;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Centre line
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(W, mid);
    ctx.stroke();

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + 'cc');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, color + 'cc');

    const step = W / waveform.length;

    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < waveform.length; i++) {
      const amp = Math.min(1, Math.max(0, waveform[i]!));
      const x = i * step;
      ctx.lineTo(x, mid - amp * mid * 0.9);
    }
    // Mirror bottom
    for (let i = waveform.length - 1; i >= 0; i--) {
      const amp = Math.min(1, Math.max(0, waveform[i]!));
      const x = i * step;
      ctx.lineTo(x, mid + amp * mid * 0.9);
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }, [waveform, color, height]);

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={height}
      className={`w-full rounded ${className ?? ''}`}
      style={{ height }}
    />
  );
}

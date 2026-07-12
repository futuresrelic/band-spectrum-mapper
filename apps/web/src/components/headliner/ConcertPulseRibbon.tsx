/**
 * Headliner — Concert Pulse ribbon renderer (Phase Z.17.17)
 *
 * A Canvas-drawn abstract waveform above the crowd, driven entirely by
 * computePulseRibbonParams (pure math, unit-tested separately). Never
 * flashes — amplitude/coherence/brightness/segments change gradually
 * frame to frame via simple lerping. Respects prefers-reduced-motion
 * (falls back to a mostly-static gradient line) and pauses rendering
 * when the tab is hidden. devicePixelRatio-safe sizing.
 */
import { useEffect, useRef } from 'react';
import { computePulseRibbonParams, type PulseRibbonParams } from './concertPulseRibbon';
import type { ConcertVisualState } from './concertVisualState';

export type PulseIntensitySetting = 'off' | 'low' | 'normal' | 'high';

const INTENSITY_SCALE: Record<PulseIntensitySetting, number> = { off: 0, low: 0.5, normal: 1, high: 1.4 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function ConcertPulseRibbon({
  visualState, palette, intensitySetting, reducedMotion,
}: {
  visualState: ConcertVisualState;
  palette: readonly [string, string];
  intensitySetting: PulseIntensitySetting;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentRef = useRef<PulseRibbonParams>({ amplitude: 0.3, coherence: 1, brightness: 0.5, segmentCount: 1 });
  const targetRef = useRef<PulseRibbonParams>(currentRef.current);
  const timeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    targetRef.current = computePulseRibbonParams(visualState);
  }, [visualState]);

  useEffect(() => {
    if (intensitySetting === 'off') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let visible = !document.hidden;
    const onVisibility = () => { visible = !document.hidden; };
    document.addEventListener('visibilitychange', onVisibility);

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    }
    resize();
    window.addEventListener('resize', resize);

    function draw() {
      if (!ctx || !canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const cur = currentRef.current;
      const target = targetRef.current;
      const smoothing = reducedMotion ? 0.02 : 0.06;
      const next: PulseRibbonParams = {
        amplitude: lerp(cur.amplitude, target.amplitude, smoothing),
        coherence: lerp(cur.coherence, target.coherence, smoothing),
        brightness: lerp(cur.brightness, target.brightness, smoothing),
        segmentCount: target.segmentCount,
      };
      currentRef.current = next;

      const intensityScale = INTENSITY_SCALE[intensitySetting];
      const midY = h / 2;
      const amplitudePx = next.amplitude * (h * 0.35) * intensityScale;
      timeRef.current += reducedMotion ? 0.002 : 0.02;

      const gap = (1 - next.coherence) * (w / next.segmentCount) * 0.25;
      const segmentWidth = w / next.segmentCount;

      for (let seg = 0; seg < next.segmentCount; seg++) {
        const startX = seg * segmentWidth + gap / 2;
        const endX = (seg + 1) * segmentWidth - gap / 2;
        const gradient = ctx.createLinearGradient(startX, 0, endX, 0);
        gradient.addColorStop(0, palette[0]);
        gradient.addColorStop(1, palette[1]);
        ctx.strokeStyle = gradient;
        ctx.globalAlpha = Math.max(0.15, next.brightness);
        ctx.lineWidth = 2 * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const points = 40;
        for (let i = 0; i <= points; i++) {
          const x = startX + ((endX - startX) * i) / points;
          const phase = (i / points) * Math.PI * 2 * 2 + timeRef.current + seg * 1.3;
          const y = reducedMotion
            ? midY
            : midY + Math.sin(phase) * amplitudePx * (0.5 + 0.5 * Math.sin(timeRef.current * 0.3 + seg));
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (visible) rafRef.current = requestAnimationFrame(draw);
      else rafRef.current = window.setTimeout(() => { if (!document.hidden) rafRef.current = requestAnimationFrame(draw); }, 500) as unknown as number;
    }
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intensitySetting, reducedMotion, palette]);

  if (intensitySetting === 'off') {
    return (
      <p className="text-xs text-gray-500 italic px-2">
        Concert Pulse is off. {visualState.momentumDirection === 'rising' ? 'Momentum rising.' : visualState.momentumDirection === 'falling' ? 'Momentum falling.' : 'Momentum steady.'}
      </p>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="w-full h-12 block"
      style={{ width: '100%', height: '48px' }}
    />
  );
}

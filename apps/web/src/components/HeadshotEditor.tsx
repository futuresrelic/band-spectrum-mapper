/**
 * HeadshotEditor — smooth-brush image editor for AI-generated character portraits.
 *
 * Unlike SpritePixelEditor (designed for tiny pixel art), this editor works on
 * full-resolution portrait images (typically 1024×1024). It is used to touch up
 * details in AI-generated headshots — fix hair colour, adjust eyes, remove artefacts.
 *
 * Tools: Brush (paint with chosen colour) · Eraser (restore original pixels)
 * Features: adjustable brush size, colour picker, undo (Ctrl+Z, up to 20 steps),
 *           download PNG, cancel / save-to-server.
 */

import { useState, useRef, useEffect } from 'react';

// Working canvas resolution — original is downsampled to this on load.
const W = 512;
const H = 512;

interface Props {
  label: string;
  initialDataUrl: string;
  onSave: (dataUrl: string) => Promise<void>;
  onClose: () => void;
}

export default function HeadshotEditor({ label, initialDataUrl, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const origRef   = useRef<ImageData | null>(null);     // frozen copy of loaded image
  const stackRef  = useRef<ImageData[]>([]);            // undo snapshots
  const drawingRef = useRef(false);
  const lastRef    = useRef<{ x: number; y: number } | null>(null);

  const [tool,      setTool]      = useState<'brush' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState(12);
  const [color,     setColor]     = useState('#000000');
  const [saving,    setSaving]    = useState(false);
  const [undoLen,   setUndoLen]   = useState(0);
  const [loaded,    setLoaded]    = useState(false);
  const [loadError, setLoadError] = useState(false);

  // ── Load initial image ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      origRef.current = ctx.getImageData(0, 0, W, H);
      setLoaded(true);
    };
    img.onerror = () => setLoadError(true);
    img.src = initialDataUrl;
  }, [initialDataUrl]);

  // ── Keyboard undo ─────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        applyUndo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Undo helpers ──────────────────────────────────────────────────────────

  function snapshot() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, W, H);
    stackRef.current = [...stackRef.current.slice(-19), data];
    setUndoLen(stackRef.current.length);
  }

  function applyUndo() {
    const stack = stackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1]!;
    stackRef.current = stack.slice(0, -1);
    setUndoLen(stackRef.current.length);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(prev, 0, 0);
  }

  // ── Coordinate mapping ────────────────────────────────────────────────────

  function getPos(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width)  * W,
      y: ((e.clientY - rect.top)  / rect.height) * H,
    };
  }

  // ── Paint helpers ─────────────────────────────────────────────────────────

  function paintAt(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }) {
    if (tool === 'eraser' && origRef.current) {
      restoreCircle(ctx, pos);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  function paintStroke(
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to:   { x: number; y: number },
  ) {
    if (tool === 'eraser' && origRef.current) {
      // Interpolate along the stroke for smooth erasing
      const dx   = to.x - from.x;
      const dy   = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const step = Math.max(1, brushSize / 4);
      const n    = Math.ceil(dist / step);
      for (let i = 0; i <= n; i++) {
        restoreCircle(ctx, { x: from.x + dx * (i / n), y: from.y + dy * (i / n) });
      }
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = color;
      ctx.lineWidth   = brushSize;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }
  }

  // Restore a circular region from the frozen original
  function restoreCircle(ctx: CanvasRenderingContext2D, center: { x: number; y: number }) {
    if (!origRef.current) return;
    const r  = brushSize / 2;
    const x0 = Math.max(0, Math.floor(center.x - r));
    const y0 = Math.max(0, Math.floor(center.y - r));
    const x1 = Math.min(W, Math.ceil(center.x + r));
    const y1 = Math.min(H, Math.ceil(center.y + r));
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return;

    const working = ctx.getImageData(x0, y0, rw, rh);
    const orig    = origRef.current.data;
    const rr      = r * r;

    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < rw; px++) {
        const dx = (x0 + px) - center.x;
        const dy = (y0 + py) - center.y;
        if (dx * dx + dy * dy <= rr) {
          const si = ((y0 + py) * W + (x0 + px)) * 4;
          const di = (py * rw + px) * 4;
          working.data[di]     = orig[si]!;
          working.data[di + 1] = orig[si + 1]!;
          working.data[di + 2] = orig[si + 2]!;
          working.data[di + 3] = orig[si + 3]!;
        }
      }
    }
    ctx.putImageData(working, x0, y0);
  }

  // ── Mouse events ──────────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    drawingRef.current = true;
    const pos = getPos(e);
    lastRef.current = pos;
    snapshot();
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) paintAt(ctx, pos);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && lastRef.current) paintStroke(ctx, lastRef.current, pos);
    lastRef.current = pos;
  }

  function handleMouseUp() {
    drawingRef.current = false;
    lastRef.current = null;
  }

  // ── Save / download ───────────────────────────────────────────────────────

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      await onSave(canvas.toDataURL('image/png'));
    } finally {
      setSaving(false);
    }
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a       = document.createElement('a');
    a.href        = canvas.toDataURL('image/png');
    a.download    = `${label.toLowerCase().replace(/\s+/g, '-')}-edited.png`;
    a.click();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: 660, width: '100%', maxHeight: '95vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200 shrink-0">
          <div>
            <p className="text-sm font-bold text-surface-900">Edit: {label}</p>
            <p className="text-xs text-surface-400 mt-0.5">
              Brush = paint · Eraser = restore original · Ctrl+Z = undo
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-700 text-xl leading-none px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-b border-surface-100 bg-surface-50 shrink-0">
          {/* Tool */}
          <div className="flex gap-1">
            {(['brush', 'eraser'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  tool === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-surface-200 text-surface-700 hover:bg-surface-100'
                }`}
              >
                {t === 'brush' ? '✏️ Brush' : '◻ Eraser'}
              </button>
            ))}
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-surface-500 shrink-0">Size</span>
            <input
              type="range" min={2} max={60} value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-24 accent-indigo-600"
            />
            <span className="text-xs font-mono text-surface-700 w-6 text-right">{brushSize}</span>
          </div>

          {/* Colour — only shown for brush */}
          {tool === 'brush' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500 shrink-0">Colour</span>
              <input
                type="color" value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-7 rounded border border-surface-200 cursor-pointer p-0.5"
              />
            </div>
          )}

          {/* Undo */}
          <button
            onClick={applyUndo}
            disabled={undoLen === 0}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-white border border-surface-200 text-surface-700 hover:bg-surface-100 disabled:opacity-40 transition-colors ml-auto"
          >
            ↩ Undo
          </button>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center bg-surface-800 overflow-hidden min-h-0 p-3">
          {loadError ? (
            <p className="text-red-400 text-sm">Failed to load image.</p>
          ) : !loaded ? (
            <p className="text-surface-400 text-sm">Loading…</p>
          ) : null}
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className={`rounded-xl border border-surface-600 ${loaded ? 'cursor-crosshair' : 'opacity-0'}`}
            style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'auto' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-surface-200 bg-surface-50 shrink-0">
          <button
            onClick={handleDownload}
            disabled={!loaded}
            className="text-xs px-4 py-2 rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-100 disabled:opacity-40 transition-colors"
          >
            Download PNG
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg border border-surface-300 text-surface-700 hover:bg-surface-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { void handleSave(); }}
              disabled={saving || !loaded}
              className="text-sm px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

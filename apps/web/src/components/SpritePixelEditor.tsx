/**
 * SpritePixelEditor — full-screen modal pixel editor for platformer sprite assets.
 *
 * Tools: pencil, eraser, flood fill, eyedropper
 * Features: undo/redo (Ctrl+Z/Y), zoom 1–20×, grid overlay, checkerboard
 *           transparency, 1:1 live preview, save-to-server, download PNG,
 *           reset to built-in default template
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper';

export interface SpritePixelEditorProps {
  assetType: string;
  label: string;
  spriteW: number;
  spriteH: number;
  initialDataUrl: string | null;
  onSave: (dataUrl: string) => Promise<void>;
  onClose: () => void;
}

// ── Sprite dimensions per asset type ─────────────────────────────────────────

export const SPRITE_SIZES: Record<string, [number, number]> = {
  hero:        [32, 48],
  enemy:       [34, 34],
  collectible: [40, 40],
  bg1:         [200, 90],
  bg2:         [200, 90],
  bg3:         [200, 90],
};

function defaultZoom(w: number, h: number): number {
  const maxDim = Math.max(w, h);
  if (maxDim <= 40) return 12;
  if (maxDim <= 50) return 10;
  if (maxDim <= 100) return 6;
  return 4;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    alpha,
  ];
}

function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number, cellSize: number) {
  const LIGHT = '#d4d4d8';
  const DARK  = '#a1a1aa';
  for (let row = 0; row < Math.ceil(h / cellSize); row++) {
    for (let col = 0; col < Math.ceil(w / cellSize); col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? LIGHT : DARK;
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, cols: number, rows: number, zoom: number) {
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * zoom, 0);
    ctx.lineTo(x * zoom, rows * zoom);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * zoom);
    ctx.lineTo(cols * zoom, y * zoom);
    ctx.stroke();
  }
}

// ── Default template drawing ──────────────────────────────────────────────────

function drawHeroTemplate(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = Math.floor(w / 2);
  // Shoes
  ctx.fillStyle = '#2e1065';
  ctx.beginPath(); roundRect(ctx, cx - 11, h - 8, 9, 7, 2); ctx.fill();
  ctx.beginPath(); roundRect(ctx, cx + 2,  h - 8, 9, 7, 2); ctx.fill();
  // Legs
  ctx.fillStyle = '#4c1d95';
  ctx.fillRect(cx - 9, h - 18, 7, 10);
  ctx.fillRect(cx + 2, h - 18, 7, 10);
  // Body
  ctx.fillStyle = '#6d28d9';
  ctx.beginPath(); roundRect(ctx, cx - 11, h - 36, 22, 18, 3); ctx.fill();
  // Arms
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(cx - 16, h - 35, 5, 13);
  ctx.fillRect(cx + 11, h - 35, 5, 13);
  // Hands
  ctx.fillStyle = '#d97706';
  ctx.beginPath(); ctx.arc(cx - 14, h - 23, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 14, h - 23, 3, 0, Math.PI * 2); ctx.fill();
  // Neck
  ctx.fillStyle = '#d97706';
  ctx.fillRect(cx - 3, h - 41, 6, 5);
  // Head
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.ellipse(cx, h - 47, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
  // Hair
  ctx.fillStyle = '#1c1917';
  ctx.beginPath(); ctx.ellipse(cx, h - 53, 11, 7, 0, Math.PI, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 7, h - 50, 4, 3);
  ctx.fillRect(cx + 3,  h - 50, 4, 3);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(cx - 6, h - 50, 2, 2);
  ctx.fillRect(cx + 4,  h - 50, 2, 2);
  // Mouth
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 2, h - 44, 4, 1);
}

function drawEnemyTemplate(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Body
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); roundRect(ctx, 2, 4, w - 4, h - 6, 4); ctx.fill();
  // Noise lines
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let y = 8; y < h - 4; y += 4) {
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.lineTo(w - 4, y);
    ctx.stroke();
  }
  // Antenna
  const cx = Math.floor(w / 2);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, 4); ctx.lineTo(cx, 0); ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.arc(cx, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  // Eyes
  const eyeY = Math.floor(h * 0.35);
  ctx.fillStyle = '#dc2626';
  ctx.beginPath(); ctx.arc(cx - 7, eyeY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 7, eyeY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx - 6, eyeY - 1, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 8, eyeY - 1, 1.5, 0, Math.PI * 2); ctx.fill();
  // Mouth
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(cx - 6, Math.floor(h * 0.65), 12, 2);
  // Legs stubs
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(cx - 9, h - 2, 6, 2);
  ctx.fillRect(cx + 3,  h - 2, 6, 2);
}

function drawCollectibleTemplate(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 1;
  // Outer disc
  ctx.fillStyle = '#16162a';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // Groove rings
  for (let i = 0; i < 7; i++) {
    const gr = r * (0.4 + i * 0.085);
    ctx.strokeStyle = `rgba(255,255,255,${0.07 + (i % 2) * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI * 2); ctx.stroke();
  }
  // Label circle
  const lr = r * 0.32;
  ctx.fillStyle = '#4c1d95';
  ctx.beginPath(); ctx.arc(cx, cy, lr, 0, Math.PI * 2); ctx.fill();
  // Label text lines
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(cx - lr * 0.55, cy - 2, lr * 1.1, 1);
  ctx.fillRect(cx - lr * 0.4,  cy + 2, lr * 0.8,  1);
  // Spindle hole
  ctx.fillStyle = '#0f0f1a';
  ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
  // Gloss
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.2, cy - r * 0.3, r * 0.5, r * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBgTemplate(ctx: CanvasRenderingContext2D, w: number, h: number, layer: number) {
  if (layer === 1) {
    // Far: dark sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0d0d2b'); g.addColorStop(1, '#1a1a3e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const stars = [[10,5],[30,2],[55,8],[80,3],[100,6],[130,2],[155,7],[180,4],
                   [20,15],[45,12],[70,18],[95,10],[120,15],[145,11],[170,16]];
    for (const [sx, sy] of stars) {
      ctx.beginPath(); ctx.arc(sx!, sy!, 0.8, 0, Math.PI * 2); ctx.fill();
    }
  } else if (layer === 2) {
    // Mid: mountain silhouettes
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#16213e';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.55);
    ctx.lineTo(w * 0.1, h * 0.25);
    ctx.lineTo(w * 0.2, h * 0.48);
    ctx.lineTo(w * 0.32, h * 0.15);
    ctx.lineTo(w * 0.44, h * 0.42);
    ctx.lineTo(w * 0.58, h * 0.22);
    ctx.lineTo(w * 0.7, h * 0.45);
    ctx.lineTo(w * 0.82, h * 0.28);
    ctx.lineTo(w * 0.92, h * 0.5);
    ctx.lineTo(w, h * 0.4);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  } else {
    // Near: dark ground silhouette
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d1117';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.6);
    ctx.bezierCurveTo(w * 0.25, h * 0.45, w * 0.5, h * 0.7, w * 0.75, h * 0.5);
    ctx.lineTo(w, h * 0.55);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

// Polyfill for roundRect in older contexts
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

export function drawDefaultTemplate(ctx: CanvasRenderingContext2D, assetType: string, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  if (assetType === 'hero') drawHeroTemplate(ctx, w, h);
  else if (assetType === 'enemy') drawEnemyTemplate(ctx, w, h);
  else if (assetType === 'collectible') drawCollectibleTemplate(ctx, w, h);
  else if (assetType === 'bg1') drawBgTemplate(ctx, w, h, 1);
  else if (assetType === 'bg2') drawBgTemplate(ctx, w, h, 2);
  else if (assetType === 'bg3') drawBgTemplate(ctx, w, h, 3);
}

// ── Preset palette ────────────────────────────────────────────────────────────

const PALETTE = [
  '#000000','#ffffff','#6d28d9','#7c3aed','#4c1d95','#2e1065',
  '#ef4444','#f97316','#fbbf24','#22c55e','#06b6d4','#3b82f6',
  '#ec4899','#d97706','#92400e','#1c1917','#1a1a2e','#16162a',
];

const MAX_UNDO = 30;

// ── Component ─────────────────────────────────────────────────────────────────

export function SpritePixelEditor({
  assetType,
  label,
  spriteW,
  spriteH,
  initialDataUrl,
  onSave,
  onClose,
}: SpritePixelEditorProps) {
  const [tool, setTool]           = useState<Tool>('pencil');
  const [color, setColor]         = useState('#6d28d9');
  const [alpha, setAlpha]         = useState(255);
  const [zoom, setZoom]           = useState(() => defaultZoom(spriteW, spriteH));
  const [showGrid, setShowGrid]   = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState<string | null>(null);
  const [recentColors, setRecentColors] = useState<string[]>([]);

  const editorRef   = useRef<HTMLCanvasElement>(null);
  const previewRef  = useRef<HTMLCanvasElement>(null);
  // Offscreen canvas used to hold current pixel data at 1:1 scale
  const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelData   = useRef(new Uint8ClampedArray(spriteW * spriteH * 4));
  const undoStack   = useRef<Uint8ClampedArray<ArrayBuffer>[]>([]);
  const redoStack   = useRef<Uint8ClampedArray<ArrayBuffer>[]>([]);
  const isPainting  = useRef(false);
  const lastPx      = useRef<[number, number] | null>(null);
  // Keep paint args in a ref to avoid stale closure issues in handlers
  const paintArgs   = useRef({ tool, color, alpha });
  paintArgs.current = { tool, color, alpha };
  const zoomRef     = useRef(zoom);
  zoomRef.current   = zoom;
  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;

  // ── Pixel helpers ───────────────────────────────────────────────────────────

  const setPixel = useCallback((px: number, py: number, r: number, g: number, b: number, a: number) => {
    if (px < 0 || py < 0 || px >= spriteW || py >= spriteH) return;
    const i = (py * spriteW + px) * 4;
    pixelData.current[i]!     = r;
    pixelData.current[i + 1]! = g;
    pixelData.current[i + 2]! = b;
    pixelData.current[i + 3]! = a;
  }, [spriteW, spriteH]);

  const getPixel = useCallback((px: number, py: number): [number, number, number, number] => {
    if (px < 0 || py < 0 || px >= spriteW || py >= spriteH) return [0, 0, 0, 0];
    const i = (py * spriteW + px) * 4;
    return [pixelData.current[i]!, pixelData.current[i + 1]!, pixelData.current[i + 2]!, pixelData.current[i + 3]!];
  }, [spriteW, spriteH]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const renderAll = useCallback(() => {
    const imgCanvas = imgCanvasRef.current;
    if (!imgCanvas) return;

    // Update offscreen canvas from pixel data
    const imgCtx = imgCanvas.getContext('2d')!;
    imgCtx.putImageData(new ImageData(new Uint8ClampedArray(pixelData.current), spriteW, spriteH), 0, 0);

    const z = zoomRef.current;

    // Editor canvas
    const edCanvas = editorRef.current;
    if (edCanvas) {
      const ctx = edCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, edCanvas.width, edCanvas.height);
      drawCheckerboard(ctx, spriteW * z, spriteH * z, Math.max(4, z));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imgCanvas, 0, 0, spriteW * z, spriteH * z);
      if (showGridRef.current && z >= 4) drawGrid(ctx, spriteW, spriteH, z);
    }

    // Preview canvas (1:1)
    const pvCanvas = previewRef.current;
    if (pvCanvas) {
      const ctx = pvCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, pvCanvas.width, pvCanvas.height);
      drawCheckerboard(ctx, spriteW, spriteH, 4);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imgCanvas, 0, 0, spriteW, spriteH);
    }
  }, [spriteW, spriteH]);

  // ── Undo / Redo ─────────────────────────────────────────────────────────────

  const pushUndo = useCallback(() => {
    undoStack.current.push(new Uint8ClampedArray(pixelData.current));
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const handleUndo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(new Uint8ClampedArray(pixelData.current));
    pixelData.current = prev;
    renderAll();
  }, [renderAll]);

  const handleRedo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(new Uint8ClampedArray(pixelData.current));
    pixelData.current = next;
    renderAll();
  }, [renderAll]);

  // ── Flood fill ──────────────────────────────────────────────────────────────

  const floodFill = useCallback((startX: number, startY: number, nr: number, ng: number, nb: number, na: number) => {
    const [tr, tg, tb, ta] = getPixel(startX, startY);
    if (tr === nr && tg === ng && tb === nb && ta === na) return;

    const queue: [number, number][] = [[startX, startY]];
    const visited = new Uint8Array(spriteW * spriteH);

    while (queue.length > 0) {
      const item = queue.shift()!;
      const [x, y] = item;
      const key = y * spriteW + x;
      if (visited[key]) continue;
      visited[key] = 1;
      const [r, g, b, a] = getPixel(x, y);
      if (r !== tr || g !== tg || b !== tb || a !== ta) continue;
      setPixel(x, y, nr, ng, nb, na);
      if (x > 0)           queue.push([x - 1, y]);
      if (x < spriteW - 1) queue.push([x + 1, y]);
      if (y > 0)           queue.push([x, y - 1]);
      if (y < spriteH - 1) queue.push([x, y + 1]);
    }
  }, [spriteW, spriteH, getPixel, setPixel]);

  // ── Bresenham line ──────────────────────────────────────────────────────────

  const drawBresenham = useCallback((x0: number, y0: number, x1: number, y1: number,
    r: number, g: number, b: number, a: number) => {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      setPixel(x0, y0, r, g, b, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
  }, [setPixel]);

  // ── Coord helper ────────────────────────────────────────────────────────────

  function getPixelCoords(clientX: number, clientY: number): [number, number] {
    const canvas = editorRef.current;
    if (!canvas) return [-1, -1];
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor((clientX - rect.left) / rect.width  * spriteW);
    const py = Math.floor((clientY - rect.top)  / rect.height * spriteH);
    return [px, py];
  }

  // ── Apply tool ──────────────────────────────────────────────────────────────

  const applyTool = useCallback((px: number, py: number, isFirst: boolean) => {
    const { tool: t, color: c, alpha: a } = paintArgs.current;
    if (px < 0 || py < 0 || px >= spriteW || py >= spriteH) return;

    if (t === 'eyedropper') {
      const [r, g, b, ea] = getPixel(px, py);
      setColor(rgbaToHex(r, g, b));
      setAlpha(ea);
      return;
    }

    const [r, g, b] = hexToRgba(c, a);

    if (t === 'fill') {
      floodFill(px, py, r, g, b, a);
      renderAll();
      return;
    }

    const a8 = t === 'eraser' ? 0 : a;
    const fr = t === 'eraser' ? 0 : r;
    const fg = t === 'eraser' ? 0 : g;
    const fb = t === 'eraser' ? 0 : b;

    if (isFirst || !lastPx.current) {
      setPixel(px, py, fr, fg, fb, a8);
    } else {
      drawBresenham(lastPx.current[0], lastPx.current[1], px, py, fr, fg, fb, a8);
    }
    lastPx.current = [px, py];
    renderAll();
  }, [spriteW, spriteH, getPixel, setPixel, floodFill, drawBresenham, renderAll]);

  // ── Recent colours ──────────────────────────────────────────────────────────

  function addRecentColor(c: string) {
    setRecentColors((prev) => {
      const next = [c, ...prev.filter((x) => x !== c)].slice(0, 8);
      return next;
    });
  }

  // ── Mouse / touch events ────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (paintArgs.current.tool !== 'eyedropper') {
      pushUndo();
      addRecentColor(paintArgs.current.color);
    }
    isPainting.current = true;
    lastPx.current = null;
    const [px, py] = getPixelCoords(e.clientX, e.clientY);
    applyTool(px, py, true);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isPainting.current) return;
    const [px, py] = getPixelCoords(e.clientX, e.clientY);
    applyTool(px, py, false);
  }

  function handleMouseUp() {
    isPainting.current = false;
    lastPx.current = null;
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (paintArgs.current.tool !== 'eyedropper') {
      pushUndo();
      addRecentColor(paintArgs.current.color);
    }
    isPainting.current = true;
    lastPx.current = null;
    const t = e.touches[0];
    if (!t) return;
    const [px, py] = getPixelCoords(t.clientX, t.clientY);
    applyTool(px, py, true);
  }

  function handleTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!isPainting.current) return;
    const t = e.touches[0];
    if (!t) return;
    const [px, py] = getPixelCoords(t.clientX, t.clientY);
    applyTool(px, py, false);
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  // ── Initialise pixel data from asset or default ──────────────────────────────

  useEffect(() => {
    const offscreen = document.createElement('canvas');
    offscreen.width = spriteW;
    offscreen.height = spriteH;
    imgCanvasRef.current = offscreen;
    const ctx = offscreen.getContext('2d')!;

    function loadDone() {
      const imgData = ctx.getImageData(0, 0, spriteW, spriteH);
      pixelData.current = new Uint8ClampedArray(imgData.data);
      renderAll();
    }

    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, spriteW, spriteH);
        ctx.drawImage(img, 0, 0, spriteW, spriteH);
        loadDone();
      };
      img.onerror = () => {
        drawDefaultTemplate(ctx, assetType, spriteW, spriteH);
        loadDone();
      };
      img.src = initialDataUrl;
    } else {
      drawDefaultTemplate(ctx, assetType, spriteW, spriteH);
      loadDone();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update editor canvas dimensions when zoom changes
  useEffect(() => {
    renderAll();
  }, [zoom, showGrid, renderAll]);

  // ── Reset / Clear ────────────────────────────────────────────────────────────

  function handleResetToDefault() {
    pushUndo();
    const offscreen = imgCanvasRef.current!;
    const ctx = offscreen.getContext('2d')!;
    drawDefaultTemplate(ctx, assetType, spriteW, spriteH);
    const imgData = ctx.getImageData(0, 0, spriteW, spriteH);
    pixelData.current = new Uint8ClampedArray(imgData.data);
    renderAll();
  }

  function handleClear() {
    pushUndo();
    pixelData.current = new Uint8ClampedArray(spriteW * spriteH * 4);
    renderAll();
  }

  // ── Save / Download ──────────────────────────────────────────────────────────

  function getExportDataUrl(): string {
    const out = document.createElement('canvas');
    out.width = spriteW;
    out.height = spriteH;
    const ctx = out.getContext('2d')!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixelData.current), spriteW, spriteH), 0, 0);
    return out.toDataURL('image/png');
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await onSave(getExportDataUrl());
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch {
      setSaveMsg('Save failed — try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleDownload() {
    const url = getExportDataUrl();
    const a = document.createElement('a');
    a.href = url;
    a.download = `${assetType}-${spriteW}x${spriteH}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const canvasCursor =
    tool === 'pencil'     ? 'crosshair' :
    tool === 'eraser'     ? 'cell' :
    tool === 'fill'       ? 'copy' :
    /* eyedropper */        'zoom-in';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onMouseUp={handleMouseUp}>
      {/* ── Top toolbar ── */}
      <div className="bg-white border-b border-surface-200 px-3 py-2 flex items-center gap-3 flex-wrap shrink-0">
        {/* Label */}
        <div className="shrink-0">
          <p className="text-xs font-bold text-surface-800 leading-tight">{label}</p>
          <p className="text-[10px] text-surface-400 font-mono">{spriteW}×{spriteH}px</p>
        </div>

        <div className="w-px h-8 bg-surface-200 shrink-0" />

        {/* Tools */}
        <div className="flex gap-1 shrink-0">
          {([ ['pencil', '✏️', 'Pencil (draw)'], ['eraser', '⌫', 'Eraser'], ['fill', '🪣', 'Flood fill'], ['eyedropper', '💉', 'Eyedropper (pick color)'] ] as const).map(([t, icon, title]) => (
            <button
              key={t}
              title={title}
              onClick={() => setTool(t)}
              className={`w-8 h-8 rounded text-sm flex items-center justify-center transition-colors
                ${tool === t ? 'bg-indigo-100 border border-indigo-400 text-indigo-700' : 'bg-surface-100 hover:bg-surface-200 text-surface-600 border border-transparent'}`}
            >
              {icon}
            </button>
          ))}
        </div>

        <div className="w-px h-8 bg-surface-200 shrink-0" />

        {/* Color picker */}
        <div className="flex items-center gap-2 shrink-0">
          <label className="relative cursor-pointer" title="Pick color">
            <div
              className="w-8 h-8 rounded border-2 border-surface-300"
              style={{ background: color }}
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </label>
          <button
            title="Transparent"
            onClick={() => setAlpha(0)}
            className={`w-8 h-8 rounded border text-xs font-bold transition-colors
              ${alpha === 0 ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-surface-300 text-surface-500 hover:bg-surface-100'}`}
            style={{ background: alpha === 0 ? undefined : 'repeating-conic-gradient(#d4d4d8 0% 25%, #ffffff 0% 50%) 0 0 / 8px 8px' }}
          >
            {alpha === 0 ? '∅' : ''}
          </button>
        </div>

        {/* Opacity */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-surface-500 font-mono w-6">α</span>
          <input
            type="range" min={0} max={255} value={alpha}
            onChange={(e) => setAlpha(parseInt(e.target.value))}
            className="w-20 accent-indigo-600"
          />
          <span className="text-[10px] text-surface-500 font-mono w-8">{Math.round(alpha / 2.55)}%</span>
        </div>

        <div className="w-px h-8 bg-surface-200 shrink-0" />

        {/* Recent colors */}
        {recentColors.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {recentColors.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => { setColor(c); setAlpha(255); }}
                className="w-5 h-5 rounded border border-surface-300 hover:scale-110 transition-transform"
                style={{ background: c }}
              />
            ))}
          </div>
        )}

        {/* Palette */}
        <div className="flex gap-1 flex-wrap max-w-[160px] shrink-0">
          {PALETTE.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => { setColor(c); setAlpha(255); }}
              className="w-4 h-4 rounded-sm border border-surface-200 hover:scale-110 transition-transform"
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="w-px h-8 bg-surface-200 shrink-0" />

        {/* Zoom */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setZoom((z) => Math.max(1, z - 1))} className="w-7 h-7 rounded bg-surface-100 hover:bg-surface-200 text-surface-600 font-bold text-sm">−</button>
          <span className="text-xs font-mono text-surface-600 w-8 text-center">{zoom}×</span>
          <button onClick={() => setZoom((z) => Math.min(20, z + 1))} className="w-7 h-7 rounded bg-surface-100 hover:bg-surface-200 text-surface-600 font-bold text-sm">+</button>
        </div>

        {/* Grid toggle */}
        <button
          onClick={() => setShowGrid((v) => !v)}
          title="Toggle grid"
          className={`text-xs px-2 py-1 rounded border transition-colors shrink-0
            ${showGrid ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-surface-300 text-surface-500 hover:bg-surface-100'}`}
        >
          Grid
        </button>

        <div className="w-px h-8 bg-surface-200 shrink-0" />

        {/* Undo / Redo */}
        <div className="flex gap-1 shrink-0">
          <button onClick={handleUndo} title="Undo (Ctrl+Z)" className="w-8 h-8 rounded bg-surface-100 hover:bg-surface-200 text-surface-600 text-sm">↩</button>
          <button onClick={handleRedo} title="Redo (Ctrl+Y)" className="w-8 h-8 rounded bg-surface-100 hover:bg-surface-200 text-surface-600 text-sm">↪</button>
        </div>

        <div className="w-px h-8 bg-surface-200 shrink-0" />

        {/* Reset / Clear */}
        <button onClick={handleResetToDefault} className="text-xs px-2 py-1 rounded border border-surface-300 text-surface-600 hover:bg-surface-50 shrink-0" title="Reset to built-in default graphic">
          Reset
        </button>
        <button onClick={handleClear} className="text-xs px-2 py-1 rounded border border-surface-300 text-surface-600 hover:bg-surface-50 shrink-0" title="Clear to transparent">
          Clear
        </button>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {saveMsg && (
            <span className={`text-xs font-medium ${saveMsg.includes('fail') ? 'text-red-600' : 'text-emerald-600'}`}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save Sprite'}
          </button>
          <button
            onClick={handleDownload}
            className="border border-surface-300 hover:bg-surface-50 text-surface-700 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Download PNG
          </button>
          <button onClick={onClose} className="border border-surface-300 hover:bg-surface-50 text-surface-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors">
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Editor canvas — scrollable */}
        <div className="flex-1 overflow-auto bg-surface-100 flex items-start justify-start p-6">
          <canvas
            ref={editorRef}
            width={spriteW * zoom}
            height={spriteH * zoom}
            style={{ cursor: canvasCursor, imageRendering: 'pixelated', display: 'block' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
          />
        </div>

        {/* Right panel: preview + info */}
        <div className="w-56 bg-white border-l border-surface-200 flex flex-col p-4 gap-5 overflow-y-auto shrink-0">
          <div>
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Preview (1:1)</p>
            <div className="inline-block border border-surface-200 rounded">
              <canvas
                ref={previewRef}
                width={spriteW}
                height={spriteH}
                style={{ imageRendering: 'pixelated', display: 'block' }}
              />
            </div>
            <p className="text-[10px] text-surface-400 mt-1 font-mono">{spriteW}×{spriteH} px</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Color Palette</p>
            <div className="grid grid-cols-6 gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setAlpha(255); }}
                  title={c}
                  className={`w-6 h-6 rounded border hover:scale-110 transition-transform
                    ${color === c ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-surface-300'}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Current</p>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded border border-surface-300"
                style={{ background: alpha === 0 ? 'transparent' : color,
                         backgroundImage: alpha === 0 ? 'repeating-conic-gradient(#d4d4d8 0% 25%, #fff 0% 50%) 0 0 / 8px 8px' : undefined }}
              />
              <div>
                <p className="text-[10px] font-mono text-surface-600">{color}</p>
                <p className="text-[10px] font-mono text-surface-400">α {Math.round(alpha / 2.55)}%</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Tips</p>
            <ul className="text-[10px] text-surface-500 space-y-1.5 leading-relaxed">
              <li>• Ctrl+Z undo, Ctrl+Y redo</li>
              <li>• Drag to draw lines</li>
              <li>• Fill tool for solid areas</li>
              <li>• Eyedropper picks any pixel's colour</li>
              <li>• Transparent α=0% shows checkerboard</li>
              <li>• Download PNG to edit in Photoshop/GIMP then re-upload</li>
              <li>• "Reset" restores the built-in template</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

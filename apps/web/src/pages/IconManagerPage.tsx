import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

const SAVE_SIZES = [32, 180, 192, 512];
const PREVIEW_SIZES = [16, 32, 64, 128, 192, 512];

type SavedIcon = { id: string; size: number; dataUrl: string; updatedAt: string };

type IconOpts = {
  zoom: number; offsetX: number; offsetY: number;
  brightness: number; contrast: number; saturation: number;
  hueRotate: number; opacity: number;
  rotation: number; bgColor: string; transparent: boolean; padding: number;
};

function generateCanvas(img: HTMLImageElement, size: number, opts: IconOpts): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (!opts.transparent) {
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, size, size);
  }

  const paddingPx = (size * opts.padding) / 100;
  const available = size - paddingPx * 2;
  const baseScale = available / Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
  const scale = baseScale * opts.zoom;
  const sf = size / 512;

  ctx.save();
  ctx.filter = [
    `brightness(${opts.brightness}%)`,
    `contrast(${opts.contrast}%)`,
    `saturate(${opts.saturation}%)`,
    `hue-rotate(${opts.hueRotate}deg)`,
    `opacity(${opts.opacity / 100})`,
  ].join(' ');
  ctx.translate(size / 2 + opts.offsetX * sf, size / 2 + opts.offsetY * sf);
  ctx.rotate((opts.rotation * Math.PI) / 180);
  ctx.drawImage(
    img,
    (-img.naturalWidth * scale) / 2,
    (-img.naturalHeight * scale) / 2,
    img.naturalWidth * scale,
    img.naturalHeight * scale
  );
  ctx.restore();
  return canvas;
}

export default function IconManagerPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [hueRotate, setHueRotate] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [transparent, setTransparent] = useState(true);
  const [padding, setPadding] = useState(10);

  const displayRef = useRef<HTMLCanvasElement>(null);
  const previewRefs = useRef<Partial<Record<number, HTMLCanvasElement>>>({});
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const opts: IconOpts = { zoom, offsetX, offsetY, brightness, contrast, saturation, hueRotate, opacity, rotation, bgColor, transparent, padding };

  const { data: savedIcons } = useQuery({
    queryKey: ['app-icons'],
    queryFn: () => api.get<SavedIcon[]>('/api/settings/icons'),
  });

  const saveMutation = useMutation({
    mutationFn: (icons: { size: number; dataUrl: string }[]) =>
      api.post<{ saved: number }>('/api/settings/icons', { icons }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-icons'] }),
  });

  // Load image element when src changes
  useEffect(() => {
    if (!imageSrc) { setImgEl(null); return; }
    const img = new Image();
    img.onload = () => setImgEl(img);
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw canvases when image or any adjustment changes
  useEffect(() => {
    if (!imgEl || !displayRef.current) return;
    const DISPLAY = 256;
    const main = generateCanvas(imgEl, 512, opts);
    const dctx = displayRef.current.getContext('2d')!;
    dctx.clearRect(0, 0, DISPLAY, DISPLAY);
    dctx.drawImage(main, 0, 0, DISPLAY, DISPLAY);
    PREVIEW_SIZES.forEach((size) => {
      const pc = previewRefs.current[size];
      if (!pc) return;
      const pv = generateCanvas(imgEl, size, opts);
      const pctx = pc.getContext('2d')!;
      pctx.clearRect(0, 0, size, size);
      pctx.drawImage(pv, 0, 0);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgEl, zoom, offsetX, offsetY, brightness, contrast, saturation, hueRotate, opacity, rotation, bgColor, transparent, padding]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setImageSrc(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!imgEl) return;
    const icons = SAVE_SIZES.map((size) => ({
      size,
      dataUrl: generateCanvas(imgEl, size, opts).toDataURL('image/png'),
    }));
    saveMutation.mutate(icons);
  };

  const resetAll = () => {
    setZoom(1); setOffsetX(0); setOffsetY(0);
    setBrightness(100); setContrast(100); setSaturation(100);
    setHueRotate(0); setOpacity(100); setRotation(0);
    setBgColor('#ffffff'); setTransparent(true); setPadding(10);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const scale = 512 / 256;
    setOffsetX(dragStart.current.ox + (e.clientX - dragStart.current.x) * scale);
    setOffsetY(dragStart.current.oy + (e.clientY - dragStart.current.y) * scale);
  };
  const stopDrag = () => { dragging.current = false; };

  if (!user?.isAdmin) return null;

  return (
    <div>
      <h2 className="text-lg font-bold mb-1">App Icons</h2>
      <p className="text-sm text-surface-600 mb-6">
        Design your favicon and PWA icons. Drag the preview to reposition, scroll to zoom.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: upload + live canvas */}
        <div className="space-y-3">
          {!imgEl ? (
            <div
              onDrop={(e) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => document.getElementById('icon-file-input')?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-surface-300 hover:border-surface-500'}`}
            >
              <div className="text-4xl mb-2">🖼</div>
              <p className="font-medium text-surface-900">Upload PNG / JPG / SVG</p>
              <p className="text-xs text-surface-500 mt-1">Click or drag and drop</p>
              <p className="text-xs text-surface-400 mt-1">Recommended: square, 1024×1024 or larger</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className="border border-surface-200 rounded overflow-hidden"
                style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 0 0 / 16px 16px' }}
              >
                <canvas
                  ref={displayRef}
                  width={256}
                  height={256}
                  className="block w-full cursor-grab active:cursor-grabbing"
                  style={{ imageRendering: 'pixelated' }}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={stopDrag}
                  onMouseLeave={stopDrag}
                  onWheel={(e) => {
                    e.preventDefault();
                    setZoom((z) => Math.max(0.1, Math.min(5, z - e.deltaY * 0.001)));
                  }}
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-surface-500 shrink-0">Zoom: {zoom.toFixed(2)}×</span>
                <input type="range" min={10} max={500} value={Math.round(zoom * 100)}
                  onChange={(e) => setZoom(Number(e.target.value) / 100)}
                  className="flex-1"
                />
                <button className="text-indigo-600 hover:underline shrink-0" onClick={() => { setZoom(1); setOffsetX(0); setOffsetY(0); }}>Reset ↺</button>
              </div>
              <button className="text-xs text-surface-500 hover:text-surface-900 underline" onClick={() => { setImageSrc(null); }}>
                Change image
              </button>
            </div>
          )}
          <input
            id="icon-file-input"
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </div>

        {/* Middle: adjustments */}
        <div className="card space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-3">Image Adjustments</p>
            {([
              { label: 'Brightness', value: brightness, set: setBrightness, min: 0, max: 200, unit: '%', def: 100 },
              { label: 'Contrast',   value: contrast,   set: setContrast,   min: 0, max: 200, unit: '%', def: 100 },
              { label: 'Saturation', value: saturation, set: setSaturation, min: 0, max: 200, unit: '%', def: 100 },
              { label: 'Hue Rotate', value: hueRotate,  set: setHueRotate,  min: 0, max: 360, unit: '°', def: 0 },
              { label: 'Opacity',    value: opacity,    set: setOpacity,    min: 0, max: 100, unit: '%', def: 100 },
            ] as const).map(({ label, value, set, min, max, unit, def }) => (
              <div key={label} className="mb-3">
                <div className="flex justify-between items-baseline text-xs mb-1">
                  <span className="text-surface-600">{label}</span>
                  <span className="text-surface-500 font-mono flex items-center gap-1">
                    {value}{unit}
                    <button className="text-surface-400 hover:text-surface-700 text-xs" onClick={() => (set as (v: number) => void)(def)}>↺</button>
                  </span>
                </div>
                <input type="range" min={min} max={max} value={value}
                  onChange={(e) => (set as (v: number) => void)(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-2">Rotation</p>
            <div className="flex gap-1">
              {[0, 90, 180, 270].map((r) => (
                <button
                  key={r}
                  onClick={() => setRotation(r)}
                  className={`flex-1 text-xs py-1.5 rounded border transition-colors ${rotation === r ? 'bg-surface-900 text-white border-surface-900' : 'border-surface-300 text-surface-700 hover:border-surface-500'}`}
                >
                  {r}°
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-2">Background</p>
            <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
              <input type="checkbox" checked={!transparent} onChange={(e) => setTransparent(!e.target.checked)} />
              Add background colour
            </label>
            {!transparent && (
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-full h-8 rounded cursor-pointer border border-surface-200" />
            )}
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-surface-600">Padding / safe zone</span>
              <span className="text-surface-500 font-mono flex items-center gap-1">
                {padding}%
                <button className="text-surface-400 hover:text-surface-700 text-xs" onClick={() => setPadding(10)}>↺</button>
              </span>
            </div>
            <input type="range" min={0} max={30} value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-surface-400 mt-1">10% recommended for maskable PWA icons.</p>
          </div>

          <button className="btn-ghost text-xs w-full" onClick={resetAll}>Reset all adjustments</button>
        </div>

        {/* Right: previews + save */}
        <div className="space-y-4">
          <div className="card">
            <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-3">Live Previews</p>
            <div className="grid grid-cols-2 gap-3">
              {PREVIEW_SIZES.map((size) => {
                const display = Math.min(size, 64);
                return (
                  <div key={size} className="flex flex-col items-center gap-1">
                    <div
                      className="border border-surface-200 rounded flex items-center justify-center"
                      style={{
                        width: display,
                        height: display,
                        background: 'repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 0 0 / 8px 8px',
                      }}
                    >
                      <canvas
                        ref={(el) => { previewRefs.current[size] = el ?? undefined; }}
                        width={size}
                        height={size}
                        style={{ width: display, height: display, imageRendering: 'pixelated', display: 'block' }}
                      />
                    </div>
                    <span className="text-xs text-surface-500">{size}×{size}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {savedIcons && savedIcons.length > 0 && (
            <div className="card">
              <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-3">Current saved icons</p>
              <div className="flex flex-wrap gap-3">
                {savedIcons.map((icon) => (
                  <div key={icon.size} className="text-center">
                    <img
                      src={icon.dataUrl}
                      alt={`${icon.size}px`}
                      style={{ width: 40, height: 40, imageRendering: 'pixelated' }}
                      className="border border-surface-200 rounded"
                    />
                    <p className="text-xs text-surface-500 mt-1">{icon.size}px</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn-primary w-full"
            disabled={!imgEl || saveMutation.isPending}
            onClick={handleSave}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save all icon sizes'}
          </button>
          <p className="text-xs text-surface-500">
            Saves favicon (32px), Apple touch (180px), 192px, and 512px to the database. Refresh to see the updated favicon.
          </p>
          {saveMutation.isSuccess && (
            <p className="text-xs text-green-600 font-medium">Saved. Refresh the page to see the updated favicon.</p>
          )}
          {saveMutation.isError && (
            <p className="text-xs text-red-600">Failed to save icons. Try again.</p>
          )}
        </div>
      </div>
    </div>
  );
}

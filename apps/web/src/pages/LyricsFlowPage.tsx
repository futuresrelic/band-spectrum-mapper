/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LyricsFlowPage — camera glides through lyrics on a 3D forward-path.
 *
 * Architecture:
 *  - ForceGraph3D renders an EMPTY graph — used only for its Three.js renderer,
 *    camera, and TrackballControls. Zero node/physics overhead.
 *  - SpriteText objects are added DIRECTLY to fg.scene() so positions update
 *    in-place without triggering ForceGraph3D re-renders.
 *  - Visibility culling: sprites beyond visibleRange have .visible=false →
 *    Three.js doesn't render them (major perf win).
 *  - Squared-distance check for culling — sqrt only for visible sprites.
 *  - Forward S-curve path (Z-axis primary) eliminates helix wrap-around overlap.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { api } from '../lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface LyricAlbum {
  id: string;
  title: string;
  year: number | null;
  bandName: string;
  songs: LyricSong[];
}

interface LyricSong {
  id: string;
  title: string;
  lyricText: string;
}

interface UniverseData { albums: LyricAlbum[] }
interface ScopeData    { bands: { id: string; name: string }[] }

interface FlowEntry {
  id:   string;
  type: 'title' | 'lyric' | 'gap';
  text: string;
}

type FlowDirection = 'z-forward' | 'y-tower';

interface FlowConfig {
  textSize:     number;  // lyric line textHeight
  titleSize:    number;  // song title card textHeight
  stepZ:        number;  // units between consecutive lines (primary axis spacing)
  wobble:       number;  // horizontal oscillation amplitude
  visibleRange: number;  // sprites beyond this distance are culled
  lookBehind:   number;  // lines camera position trails behind current index
  lookAhead:    number;  // lines camera looks ahead of current index
  songGap:      number;  // extra blank steps inserted between songs
  maxLineLen:   number;  // truncate lines longer than this (characters)
  direction:    FlowDirection;
}

const DEFAULT_CONFIG: FlowConfig = {
  textSize: 3.5, titleSize: 5.5,
  stepZ: 24, wobble: 55,
  visibleRange: 420,
  lookBehind: 5, lookAhead: 4,
  songGap: 4,
  maxLineLen: 80,
  direction: 'z-forward',
};

const MAX_LINES_PER_SONG = 15;
const WOBBLE_FREQ        = 0.07;  // radians per step (fixed, controls path curvature)

// ── Path math ──────────────────────────────────────────────────────────────────

/** Raw (uncentred) position for step i. Direction determines primary axis. */
function rawPos(i: number, cfg: FlowConfig) {
  if (cfg.direction === 'y-tower') {
    return {
      x: Math.sin(i * WOBBLE_FREQ) * cfg.wobble,
      y: i * cfg.stepZ,
      z: Math.cos(i * WOBBLE_FREQ * 0.6) * 8,
    };
  }
  return {
    x: Math.sin(i * WOBBLE_FREQ) * cfg.wobble,
    y: Math.cos(i * WOBBLE_FREQ * 0.6) * 8,
    z: i * cfg.stepZ,
  };
}

/** Centred world position: primary axis midpoint is at 0. */
function worldPos(i: number, total: number, cfg: FlowConfig) {
  const r  = rawPos(i, cfg);
  const half = (total / 2) * cfg.stepZ;
  if (cfg.direction === 'y-tower') {
    return { x: r.x, y: r.y - half, z: r.z };
  }
  return { x: r.x, y: r.y, z: r.z - half };
}

// ── API ────────────────────────────────────────────────────────────────────────

function fetchScopes(): Promise<ScopeData> {
  return api.get('/api/public/graph/scopes');
}

function fetchUniverse(bandIds: string[]): Promise<UniverseData> {
  const qs = new URLSearchParams();
  if (bandIds.length) qs.set('bandIds', bandIds.join(','));
  const q = qs.toString();
  return api.get(`/api/public/lyrics-universe${q ? `?${q}` : ''}`);
}

// ── Data processing ───────────────────────────────────────────────────────────

function buildEntries(albums: LyricAlbum[], cfg: FlowConfig): FlowEntry[] {
  const out: FlowEntry[] = [];
  let songIdx = 0;
  for (const album of albums) {
    for (const song of album.songs) {
      if (!song.lyricText) continue;
      const lines = song.lyricText.split('\n')
        .map(l => l.trim()).filter(l => l.length >= 3)
        .slice(0, MAX_LINES_PER_SONG);
      if (!lines.length) continue;

      // Insert gap before every song except the first
      if (songIdx > 0) {
        const gapCount = Math.max(1, Math.round(cfg.songGap));
        for (let g = 0; g < gapCount; g++) {
          out.push({ id: `gap:${song.id}:${g}`, type: 'gap', text: '' });
        }
      }

      const yr = album.year ? ` (${album.year})` : '';
      out.push({ id: `title:${song.id}`, type: 'title', text: `♪  ${song.title}  —  ${album.title}${yr}` });
      lines.forEach((line, li) => {
        const txt = cfg.maxLineLen > 0 && line.length > cfg.maxLineLen
          ? line.slice(0, cfg.maxLineLen) + '…'
          : line;
        out.push({ id: `lyric:${song.id}:${li}`, type: 'lyric', text: txt });
      });
      songIdx++;
    }
  }
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LyricsFlowPage() {
  // ── State ─────────────────────────────────────────────────────────────────────
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [showBandPicker, setShowBandPicker]   = useState(false);
  const [showSettings, setShowSettings]       = useState(false);
  const [isPlaying, setIsPlaying]             = useState(false);
  const [loopEnabled, setLoopEnabled]         = useState(true);
  const [speed, setSpeed]                     = useState(0.8);
  const [config, setConfig]                   = useState<FlowConfig>(DEFAULT_CONFIG);
  const [socialMode, setSocialMode]           = useState(false);
  const [cursorHidden, setCursorHidden]       = useState(false);
  const [progress, setProgress]              = useState(0);

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const fgRef        = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const camTRef      = useRef(0);
  const isPlayRef    = useRef(false);
  const speedRef     = useRef(0.8);
  const loopRef      = useRef(true);
  const configRef    = useRef<FlowConfig>(DEFAULT_CONFIG);
  const lastNowRef   = useRef<number | null>(null);
  const lastMoveRef  = useRef(Date.now());
  const totalRef     = useRef(0);
  const entriesRef   = useRef<FlowEntry[]>([]);

  // Sprite map: entry.id → SpriteText instance
  const spriteMapRef  = useRef<Map<string, any>>(new Map());
  // World positions cache: entry.id → {x,y,z}
  const positionsRef  = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());

  // Sync refs
  useEffect(() => { isPlayRef.current   = isPlaying;   }, [isPlaying]);
  useEffect(() => { speedRef.current    = speed;       }, [speed]);
  useEffect(() => { loopRef.current     = loopEnabled; }, [loopEnabled]);
  useEffect(() => { configRef.current   = config;      }, [config]);

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: scopes }       = useQuery<ScopeData>({ queryKey: ['cinema-scopes'], queryFn: fetchScopes });
  const { data, isFetching }   = useQuery<UniverseData>({
    queryKey: ['lyrics-flow', selectedBandIds.join(',')],
    queryFn: () => fetchUniverse(selectedBandIds),
  });

  const entries = useMemo(
    () => data ? buildEntries(data.albums, config) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, config.songGap, config.maxLineLen],
  );

  // ForceGraph3D graphData — always empty; we add sprites directly to the scene
  const emptyGraph = useMemo(() => ({ nodes: [] as object[], links: [] as object[] }), []);

  // ── Sprite management ─────────────────────────────────────────────────────────

  /** Remove all sprites from the Three.js scene and clear refs. */
  function clearSprites() {
    const scene = fgRef.current?.scene?.();
    spriteMapRef.current.forEach(s => scene?.remove(s));
    spriteMapRef.current.clear();
    positionsRef.current.clear();
  }

  /** Build sprites in fg.scene() for a given entries array + config. */
  function buildSprites(ents: FlowEntry[], cfg: FlowConfig) {
    const scene = fgRef.current?.scene?.();
    if (!scene) return false;

    // Clear existing
    spriteMapRef.current.forEach(s => scene.remove(s));
    spriteMapRef.current.clear();
    positionsRef.current.clear();

    const total = ents.length;
    totalRef.current   = total;
    entriesRef.current = ents;

    ents.forEach((entry, i) => {
      const pos = worldPos(i, total, cfg);
      positionsRef.current.set(entry.id, pos);

      // Gap entries occupy index space but have no visible sprite
      if (entry.type === 'gap') return;

      const sp  = new SpriteText(entry.text.slice(0, 80));
      sp.fontFace       = 'Georgia, serif';
      sp.backgroundColor = 'rgba(0,0,0,0)';
      (sp as any).visible = false;
      sp.color          = entry.type === 'title' ? '#fbbf2400' : '#e2e8f000';
      sp.textHeight     = entry.type === 'title' ? cfg.titleSize : cfg.textSize;
      if (entry.type === 'title') sp.fontWeight = '700';

      (sp as any).position.set(pos.x, pos.y, pos.z);
      scene.add(sp);
      spriteMapRef.current.set(entry.id, sp);
    });
    return true;
  }

  // Build sprites once ForceGraph3D's scene is ready
  useEffect(() => {
    if (!entries.length) return;
    camTRef.current = 0;
    setProgress(0);

    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const attempt = () => {
      if (buildSprites(entries, configRef.current)) return;
      if (++attempts < 10) timer = setTimeout(attempt, 200);
    };
    timer = setTimeout(attempt, 300);

    return () => {
      clearTimeout(timer);
      clearSprites();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // Update sprite positions in-place when layout config changes (no scene rebuild)
  useEffect(() => {
    const ents  = entriesRef.current;
    const total = ents.length;
    if (!total) return;
    positionsRef.current.clear();
    ents.forEach((entry, i) => {
      const pos = worldPos(i, total, config);
      positionsRef.current.set(entry.id, pos);
      const sp = spriteMapRef.current.get(entry.id);
      if (sp) (sp as any).position.set(pos.x, pos.y, pos.z);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.stepZ, config.wobble, config.direction]);

  // Update text sizes without repositioning
  useEffect(() => {
    spriteMapRef.current.forEach((sp, id) => {
      sp.textHeight = id.startsWith('title:') ? config.titleSize : config.textSize;
    });
  }, [config.textSize, config.titleSize]);

  // ── rAF: camera animation + spotlight ─────────────────────────────────────────

  useEffect(() => {
    let rafId: number;

    const tick = (now: number) => {
      const fg = fgRef.current;

      if (fg && isPlayRef.current) {
        const dt    = lastNowRef.current !== null ? (now - lastNowRef.current) / 1000 : 0;
        lastNowRef.current = now;

        const total = totalRef.current;
        if (total > 0) {
          camTRef.current += dt * speedRef.current;

          if (camTRef.current >= total - 4) {
            if (loopRef.current) camTRef.current = 0;
            else { camTRef.current = Math.max(0, total - 4); setIsPlaying(false); }
          }

          setProgress(total > 0 ? camTRef.current / total : 0);

          const camera = fg.camera?.();
          const ctrl   = fg.controls?.();
          if (camera && ctrl) {
            ctrl.enabled = false;
            const cfg  = configRef.current;
            const t    = camTRef.current;
            const tot  = total;
            const cPos = worldPos(t - cfg.lookBehind, tot, cfg);
            camera.position.set(cPos.x, cPos.y, cPos.z);
            const lPos = worldPos(t + cfg.lookAhead, tot, cfg);
            camera.lookAt(lPos.x, lPos.y, lPos.z);
          }
        }
      } else {
        lastNowRef.current = null;
        const ctrl = fg?.controls?.();
        if (ctrl) ctrl.enabled = true;
      }

      // Sprite visibility culling + spotlight colouring
      const camera = fg?.camera?.();
      if (camera) {
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
        const rangeSq = configRef.current.visibleRange ** 2;

        spriteMapRef.current.forEach((sp, id) => {
          const pos = positionsRef.current.get(id);
          if (!pos) { sp.visible = false; return; }

          const dx = pos.x - cx, dy = pos.y - cy, dz = pos.z - cz;
          const dSq = dx * dx + dy * dy + dz * dz;

          if (dSq > rangeSq) { sp.visible = false; return; }

          sp.visible    = true;
          const d       = Math.sqrt(dSq);
          const isTitle = id.startsWith('title:');

          if (isTitle) {
            sp.color = d < 80 ? '#fbbf24' : d < 220 ? '#fbbf2499' : '#fbbf2433';
          } else if (d < 60) {
            sp.color = '#ffffff';
          } else if (d < 150) {
            const t2 = (d - 60) / 90;
            const a = Math.round((1 - t2 * 0.18) * 255).toString(16).padStart(2, '0');
            sp.color = `#ffffff${a}`;
          } else {
            const t2 = Math.min(1, (d - 150) / Math.max(1, configRef.current.visibleRange - 150));
            const a = Math.round((1 - t2) * 0xcc).toString(16).padStart(2, '0');
            sp.color = `#e2e8f0${a}`;
          }
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []); // intentionally empty — all mutable state via refs

  // ── Cursor auto-hide (social mode) ───────────────────────────────────────────

  useEffect(() => {
    if (!socialMode) { setCursorHidden(false); return; }
    const onMove = () => { lastMoveRef.current = Date.now(); setCursorHidden(false); };
    window.addEventListener('mousemove', onMove);
    const iv = setInterval(() => {
      if (Date.now() - lastMoveRef.current > 3000) setCursorHidden(true);
    }, 500);
    return () => { window.removeEventListener('mousemove', onMove); clearInterval(iv); };
  }, [socialMode]);

  const toggleSocialMode = useCallback(() => {
    if (!socialMode) {
      containerRef.current?.requestFullscreen?.().catch(() => null);
      setSocialMode(true);
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => null);
      setSocialMode(false);
    }
  }, [socialMode]);

  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setSocialMode(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); setIsPlaying(v => !v); }
      if (e.key === 'f' || e.key === 'F') toggleSocialMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSocialMode]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function updateConfig<K extends keyof FlowConfig>(key: K, val: FlowConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: val }));
  }

  const totalEntries = totalRef.current || entries.length;
  const isEmpty      = !isFetching && entries.length === 0;

  const SLIDERS: { key: keyof FlowConfig; label: string; min: number; max: number; step: number }[] = [
    { key: 'textSize',     label: 'Lyric text size',     min: 1.5, max: 8,   step: 0.5 },
    { key: 'titleSize',    label: 'Title size',          min: 3,   max: 12,  step: 0.5 },
    { key: 'stepZ',        label: 'Line spacing',        min: 8,   max: 60,  step: 2   },
    { key: 'wobble',       label: 'Path wobble',         min: 0,   max: 200, step: 5   },
    { key: 'songGap',      label: 'Song gap (steps)',    min: 0,   max: 16,  step: 1   },
    { key: 'maxLineLen',   label: 'Max line length',     min: 20,  max: 120, step: 5   },
    { key: 'visibleRange', label: 'Visible range',       min: 100, max: 900, step: 25  },
    { key: 'lookBehind',   label: 'Camera lag (lines)',  min: 1,   max: 16,  step: 1   },
    { key: 'lookAhead',    label: 'Look-ahead (lines)',  min: 1,   max: 16,  step: 1   },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gray-950 overflow-hidden"
      style={{ height: '100dvh', cursor: cursorHidden ? 'none' : 'default' }}
    >
      {/* Empty Three.js canvas — sprites added directly to scene */}
      <ForceGraph3D
        ref={fgRef}
        graphData={emptyGraph}
        nodeId="id"
        nodeLabel=""
        backgroundColor="#020408"
        showNavInfo={false}
        warmupTicks={0}
        cooldownTicks={0}
        width={window.innerWidth}
        height={window.innerHeight}
      />

      {isFetching && (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
          <div className="text-gray-600 text-sm tracking-widest uppercase">Loading lyrics…</div>
        </div>
      )}

      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 gap-3">
          <p className="text-gray-500 text-sm">No lyrics found. Add lyrics in the Library.</p>
          <Link to="/library" className="text-indigo-400 text-xs hover:underline">Go to Library</Link>
        </div>
      )}

      {/* ══ UI CHROME ═══════════════════════════════════════════════════════════ */}
      {!socialMode && (
        <>
          {/* Top bar */}
          <div className="absolute top-4 left-5 z-30 flex items-center gap-3">
            <Link to="/cinema" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← Back</Link>
            <span className="text-xs font-bold text-gray-500 tracking-wide">Lyrics Flow</span>
          </div>

          {/* Top-right */}
          <div className="absolute top-4 right-4 z-30 flex gap-2">
            <button
              onClick={() => { setShowSettings(v => !v); setShowBandPicker(false); }}
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                showSettings
                  ? 'bg-indigo-900/60 border-indigo-700 text-indigo-300'
                  : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >⚙</button>
            <button
              onClick={() => { setShowBandPicker(v => !v); setShowSettings(false); }}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              Bands{selectedBandIds.length > 0 ? ` (${selectedBandIds.length})` : ''}
            </button>
            <button onClick={toggleSocialMode}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors">
              🎬
            </button>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur-sm w-64 shadow-2xl space-y-3 overflow-y-auto"
              style={{ maxHeight: 'calc(100dvh - 80px)' }}>
              {/* Flow direction */}
              <div>
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Flow direction</div>
                <div className="grid grid-cols-2 gap-1">
                  {(['z-forward', 'y-tower'] as FlowDirection[]).map(d => (
                    <button
                      key={d}
                      onClick={() => updateConfig('direction', d)}
                      className={`py-1.5 rounded text-[10px] font-medium transition-colors ${
                        config.direction === d
                          ? 'bg-indigo-900/70 border border-indigo-600 text-indigo-300'
                          : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-white'
                      }`}
                    >
                      {d === 'z-forward' ? '→ Forward' : '↑ Tower'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Display &amp; Layout</div>
              {SLIDERS.map(({ key, label, min, max, step }) => (
                <label key={key} className="block space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>{label}</span>
                    <span>{(config as any)[key]}</span>
                  </div>
                  <input type="range" min={min} max={max} step={step}
                    value={(config as any)[key]}
                    onChange={e => updateConfig(key, Number(e.target.value) as FlowConfig[typeof key])}
                    className="w-full accent-indigo-500" />
                </label>
              ))}
              <button onClick={() => setConfig(DEFAULT_CONFIG)}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors pt-1">
                Reset to defaults
              </button>
            </div>
          )}

          {/* Band picker */}
          {showBandPicker && scopes && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-3 backdrop-blur-sm w-56 shadow-2xl max-h-72 overflow-y-auto">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Filter by band</div>
              <button
                onClick={() => { setSelectedBandIds([]); setShowBandPicker(false); }}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg mb-1 transition-colors ${
                  selectedBandIds.length === 0 ? 'bg-indigo-900/60 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >All bands</button>
              {scopes.bands.map(b => (
                <button key={b.id}
                  onClick={() => setSelectedBandIds(prev =>
                    prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                  )}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                    selectedBandIds.includes(b.id) ? 'bg-indigo-900/60 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >{b.name}</button>
              ))}
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 z-30">
            <div className="flex items-center gap-4 px-5 py-4 bg-gradient-to-t from-gray-950/95 to-transparent backdrop-blur-sm">
              {/* Play/Pause */}
              <button
                onClick={() => setIsPlaying(v => !v)}
                disabled={entries.length === 0}
                className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-colors shrink-0 ${
                  entries.length > 0 ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white/5 text-gray-700 cursor-not-allowed'
                }`}
                title="Play / Pause (Space)"
              >{isPlaying ? '⏸' : '▶'}</button>

              {/* Speed */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-gray-500">Speed</span>
                <input type="range" min={0.1} max={4} step={0.1} value={speed}
                  onChange={e => setSpeed(Number(e.target.value))}
                  className="w-24 accent-indigo-500" />
                <span className="text-[10px] text-gray-600 w-8">{speed.toFixed(1)}×</span>
              </div>

              {/* Progress bar (clickable to seek) */}
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <div
                  className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden cursor-pointer"
                  onClick={e => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    camTRef.current = frac * totalEntries;
                    setProgress(frac);
                  }}
                >
                  <div className="h-full bg-indigo-500 rounded-full transition-none"
                    style={{ width: `${(Math.min(1, progress) * 100).toFixed(1)}%` }} />
                </div>
                <span className="text-[10px] text-gray-600 whitespace-nowrap shrink-0">
                  {totalEntries > 0 ? `${Math.floor(camTRef.current + 1)} / ${totalEntries}` : '—'}
                </span>
              </div>

              {/* Loop toggle */}
              <button
                onClick={() => setLoopEnabled(v => !v)}
                title="Loop"
                className={`text-xs px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors shrink-0 ${
                  loopEnabled ? 'bg-indigo-900/60 border-indigo-700 text-indigo-300' : 'bg-gray-900/80 border-gray-700 text-gray-500 hover:text-gray-300'
                }`}
              >↺</button>
            </div>
          </div>
        </>
      )}

      {/* Social mode minimal controls */}
      {socialMode && !cursorHidden && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
          <button onClick={() => setIsPlaying(v => !v)} className="text-white text-base">{isPlaying ? '⏸' : '▶'}</button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button onClick={toggleSocialMode} className="text-[10px] text-gray-500 hover:text-gray-300">Exit</button>
        </div>
      )}
      {socialMode && (
        <div className="absolute bottom-6 right-6 z-30 pointer-events-none">
          <div className="text-xs text-white/15 text-right">
            <div className="font-semibold tracking-wide">Band Spectrum Mapper</div>
            <div className="text-[10px] mt-0.5">Lyrics Flow</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LyricsFlowPage — camera smoothly flows through all lyrics arranged in a 3D helix.
 *
 * All lyric lines from every album/song are laid out along a continuous helix path.
 * The camera rides the helix like karaoke in 3D space. Sprites near the camera are
 * bright; those far away fade to near-invisible.
 *
 * Physics is fully disabled (warmupTicks=0, cooldownTicks=0) and every node is pinned
 * to its pre-computed helix position (fx/fy/fz).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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

interface UniverseData {
  albums: LyricAlbum[];
}

interface ScopeData {
  bands: { id: string; name: string }[];
}

interface FlowEntry {
  id: string;
  type: 'title' | 'lyric';
  text: string;
}

interface FlowNode {
  id: string;
  type: 'title' | 'lyric';
  label: string;
  fx: number;
  fy: number;
  fz: number;
}

// ── Helix math ─────────────────────────────────────────────────────────────────

const ANG    = 0.14;  // radians per step — very gentle turn
const RADIUS = 180;
const STEP_Y = 16;    // units between lines
const MAX_LINES_PER_SONG = 25;

function helixPos(i: number): { x: number; y: number; z: number } {
  const angle = i * ANG;
  return {
    x: Math.sin(angle) * RADIUS,
    y: i * STEP_Y,
    z: Math.cos(angle) * RADIUS,
  };
}

// ── API fetchers ───────────────────────────────────────────────────────────────

function fetchScopes(): Promise<ScopeData> {
  return api.get('/api/public/graph/scopes');
}

function fetchUniverse(bandIds: string[]): Promise<UniverseData> {
  const qs = new URLSearchParams();
  if (bandIds.length) qs.set('bandIds', bandIds.join(','));
  const q = qs.toString();
  return api.get(`/api/public/lyrics-universe${q ? `?${q}` : ''}`);
}

// ── Process albums → flat entry list ──────────────────────────────────────────

function buildEntries(albums: LyricAlbum[]): FlowEntry[] {
  const entries: FlowEntry[] = [];
  for (const album of albums) {
    for (const song of album.songs) {
      if (!song.lyricText) continue;
      const lines = song.lyricText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length >= 3)
        .slice(0, MAX_LINES_PER_SONG);
      if (lines.length === 0) continue;

      // Title card before each song's lyrics
      const yearStr = album.year ? ` (${album.year})` : '';
      entries.push({
        id:   `title:${song.id}`,
        type: 'title',
        text: `\u{1F3B5} ${song.title} — ${album.title}${yearStr}`,
      });

      lines.forEach((line, li) => {
        entries.push({
          id:   `lyric:${song.id}:${li}`,
          type: 'lyric',
          text: line,
        });
      });
    }
  }
  return entries;
}

// ── Build pinned graph nodes from entries ─────────────────────────────────────

function buildNodes(entries: FlowEntry[]): FlowNode[] {
  const total = entries.length;
  const halfY = (total / 2) * STEP_Y;

  return entries.map((entry, i) => {
    const pos = helixPos(i);
    return {
      id:    entry.id,
      type:  entry.type,
      label: entry.text,
      fx:    pos.x,
      fy:    pos.y - halfY,
      fz:    pos.z,
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LyricsFlowPage() {
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [showBandPicker, setShowBandPicker]   = useState(false);
  const [isPlaying, setIsPlaying]             = useState(false);
  const [loopEnabled, setLoopEnabled]         = useState(true);
  const [speed, setSpeed]                     = useState(0.8);
  const [socialMode, setSocialMode]           = useState(false);
  const [cursorHidden, setCursorHidden]       = useState(false);
  const [progress, setProgress]              = useState(0);

  const fgRef         = useRef<any>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const camTRef       = useRef(0);
  const isPlayingRef  = useRef(false);
  const speedRef      = useRef(0.8);
  const loopRef       = useRef(true);
  const lastNowRef    = useRef<number | null>(null);
  const lastMoveRef   = useRef(Date.now());
  const totalRef      = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { isPlayingRef.current = isPlaying; },  [isPlaying]);
  useEffect(() => { speedRef.current     = speed; },      [speed]);
  useEffect(() => { loopRef.current      = loopEnabled; }, [loopEnabled]);

  // Sprite map: nodeId → SpriteText instance
  const spriteMapRef   = useRef<Map<string, any>>(new Map());
  // Helix positions: nodeId → {x,y,z}
  const positionsRef   = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());
  // Centred helix position by index
  const halfYRef       = useRef(0);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: scopes } = useQuery<ScopeData>({
    queryKey: ['cinema-scopes'],
    queryFn:  fetchScopes,
  });

  const { data, isFetching } = useQuery<UniverseData>({
    queryKey: ['lyrics-flow', selectedBandIds.join(',')],
    queryFn:  () => fetchUniverse(selectedBandIds),
  });

  // ── Build entries & nodes ──────────────────────────────────────────────────

  const entries = data ? buildEntries(data.albums) : [];
  const nodes   = buildNodes(entries);

  // Pre-compute position map and halfY whenever nodes change
  useEffect(() => {
    const total = nodes.length;
    totalRef.current = total;
    halfYRef.current = (total / 2) * STEP_Y;

    const posMap = new Map<string, { x: number; y: number; z: number }>();
    nodes.forEach(n => posMap.set(n.id, { x: n.fx, y: n.fy, z: n.fz }));
    positionsRef.current = posMap;

    // Reset playhead when data changes
    camTRef.current = 0;
    setProgress(0);
    spriteMapRef.current.clear();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  // ── rAF: camera animation + sprite spotlight ──────────────────────────────

  useEffect(() => {
    if (nodes.length === 0) return;
    let rafId: number;

    const tick = (now: number) => {
      const fg = fgRef.current;

      if (fg && isPlayingRef.current) {
        // Delta time in seconds
        const dt = lastNowRef.current !== null ? (now - lastNowRef.current) / 1000 : 0;
        lastNowRef.current = now;

        const total = totalRef.current;
        camTRef.current += dt * speedRef.current;

        // Loop or stop at end
        if (camTRef.current >= total - 5) {
          if (loopRef.current) {
            camTRef.current = 0;
          } else {
            camTRef.current = Math.max(0, total - 5);
            setIsPlaying(false);
          }
        }

        setProgress(total > 0 ? camTRef.current / total : 0);

        const camera = fg.camera?.();
        const ctrl   = fg.controls?.();

        if (camera && ctrl) {
          ctrl.enabled = false;

          const t    = camTRef.current;
          const half = halfYRef.current;

          // Camera position: look from slightly behind
          const camPos = helixPos(t - 4);
          camera.position.set(camPos.x, camPos.y - half, camPos.z);

          // Look-at: a bit ahead
          const lookPos = helixPos(t + 6);
          camera.lookAt(lookPos.x, lookPos.y - half, lookPos.z);
        }
      } else {
        lastNowRef.current = null;
        // Re-enable controls when paused
        const ctrl = fgRef.current?.controls?.();
        if (ctrl) ctrl.enabled = true;
      }

      // ── Sprite spotlight ──────────────────────────────────────────────────
      const camera = fg?.camera?.();
      if (camera) {
        const cx = camera.position.x;
        const cy = camera.position.y;
        const cz = camera.position.z;

        spriteMapRef.current.forEach((sprite, nodeId) => {
          const pos = positionsRef.current.get(nodeId);
          if (!pos) return;

          const dx   = pos.x - cx;
          const dy   = pos.y - cy;
          const dz   = pos.z - cz;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          // Determine if this is a title card
          const isTitle = nodeId.startsWith('title:');

          if (isTitle) {
            if (dist < 80) {
              sprite.color = '#fbbf24';
            } else if (dist < 200) {
              sprite.color = '#fbbf2466';
            } else {
              sprite.color = '#fbbf2426';
            }
          } else {
            if (dist < 50) {
              sprite.color = '#ffffff';
            } else if (dist < 120) {
              // Interpolate white → cream
              const t = (dist - 50) / 70; // 0..1
              const r = Math.round(255);
              const g = Math.round(255 - t * (255 - 232));
              const b = Math.round(255 - t * (255 - 240));
              const a = Math.round(255 - t * (255 - 204));
              sprite.color = `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;
            } else if (dist < 300) {
              sprite.color = '#e2e8f0cc';
            } else {
              sprite.color = '#e2e8f026';
            }
          }
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

  // ── Cursor auto-hide (social mode) ──────────────────────────────────────────

  useEffect(() => {
    if (!socialMode) { setCursorHidden(false); return; }
    const onMove = () => { lastMoveRef.current = Date.now(); setCursorHidden(false); };
    window.addEventListener('mousemove', onMove);
    const iv = setInterval(() => {
      if (Date.now() - lastMoveRef.current > 3000) setCursorHidden(true);
    }, 500);
    return () => { window.removeEventListener('mousemove', onMove); clearInterval(iv); };
  }, [socialMode]);

  // ── Social mode (fullscreen) ─────────────────────────────────────────────────

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
    const onFsChange = () => { if (!document.fullscreenElement) setSocialMode(false); };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        setIsPlaying(v => !v);
      }
      if (e.key === 'f' || e.key === 'F') toggleSocialMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSocialMode]);

  // ── ForceGraph3D callbacks ───────────────────────────────────────────────────

  const nodeThreeObject = useCallback((node: object) => {
    const n = node as FlowNode;
    const sprite = new SpriteText(n.label);
    sprite.backgroundColor = 'rgba(0,0,0,0)';

    if (n.type === 'title') {
      sprite.textHeight  = 6;
      sprite.color       = '#fbbf2426'; // start dim, rAF brightens when near
      sprite.fontFace    = 'Georgia, serif';
      sprite.fontWeight  = '700';
    } else {
      sprite.textHeight  = 4;
      sprite.color       = '#e2e8f026'; // start dim, rAF brightens when near
      sprite.fontFace    = 'Georgia, serif';
    }

    spriteMapRef.current.set(n.id, sprite);
    return sprite;
  }, []);

  const graphData = { nodes: nodes as object[], links: [] };

  const isEmpty = !isFetching && nodes.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gray-950 overflow-hidden"
      style={{ height: '100dvh', cursor: cursorHidden ? 'none' : 'default' }}
    >
      {/* 3D graph */}
      {nodes.length > 0 && (
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          nodeId="id"
          nodeLabel=""
          nodeColor={() => '#00000000'}
          nodeOpacity={0}
          nodeVal={() => 0}
          nodeRelSize={0}
          nodeThreeObjectExtend={false}
          nodeThreeObject={nodeThreeObject}
          backgroundColor="#020408"
          showNavInfo={false}
          warmupTicks={0}
          cooldownTicks={0}
          width={window.innerWidth}
          height={window.innerHeight}
        />
      )}

      {/* Loading */}
      {isFetching && (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
          <div className="text-gray-600 text-sm tracking-widest uppercase">Loading lyrics…</div>
        </div>
      )}

      {/* Empty */}
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 gap-3">
          <p className="text-gray-500 text-sm">No lyrics found. Add lyrics in the Library to use this view.</p>
          <Link to="/library" className="text-indigo-400 text-xs hover:underline">Go to Library</Link>
        </div>
      )}

      {/* ══ UI CHROME ═══════════════════════════════════════════════════════════ */}
      {!socialMode && (
        <>
          {/* Top bar */}
          <div className="absolute top-4 left-5 z-30 flex items-center gap-3">
            <Link to="/cinema" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              ← Back
            </Link>
            <span className="text-xs font-bold text-gray-500 tracking-wide">Lyrics Flow</span>
          </div>

          {/* Top-right: band picker + social mode */}
          <div className="absolute top-4 right-4 z-30 flex gap-2">
            <button
              onClick={() => setShowBandPicker(v => !v)}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              Bands{selectedBandIds.length > 0 ? ` (${selectedBandIds.length})` : ''}
            </button>
            <button
              onClick={toggleSocialMode}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              🎬
            </button>
          </div>

          {/* Band picker dropdown */}
          {showBandPicker && scopes && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-3 backdrop-blur-sm w-56 shadow-2xl max-h-72 overflow-y-auto">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Filter by band</div>
              <button
                onClick={() => { setSelectedBandIds([]); setShowBandPicker(false); }}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg mb-1 transition-colors ${
                  selectedBandIds.length === 0 ? 'bg-indigo-900/60 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                All bands
              </button>
              {scopes.bands.map(b => (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelectedBandIds(prev =>
                      prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                    );
                  }}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                    selectedBandIds.includes(b.id) ? 'bg-indigo-900/60 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {/* Bottom controls bar */}
          <div className="absolute bottom-0 left-0 right-0 z-30">
            <div className="flex items-center gap-4 px-5 py-4 bg-gradient-to-t from-gray-950/95 to-transparent backdrop-blur-sm">
              {/* Play/Pause */}
              <button
                onClick={() => setIsPlaying(v => !v)}
                disabled={nodes.length === 0}
                className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-colors shrink-0 ${
                  nodes.length > 0
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'bg-white/5 text-gray-700 cursor-not-allowed'
                }`}
                title="Play / Pause (Space)"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              {/* Speed */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-gray-500 whitespace-nowrap">Speed</span>
                <input
                  type="range"
                  min={0.2}
                  max={3}
                  step={0.1}
                  value={speed}
                  onChange={e => setSpeed(Number(e.target.value))}
                  className="w-24 accent-indigo-500"
                />
                <span className="text-[10px] text-gray-600 w-8">{speed.toFixed(1)}×</span>
              </div>

              {/* Progress bar */}
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-none"
                    style={{ width: `${Math.min(100, progress * 100).toFixed(1)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-600 whitespace-nowrap shrink-0">
                  {nodes.length > 0
                    ? `${Math.floor(camTRef.current + 1)} / ${nodes.length}`
                    : '—'}
                </span>
              </div>

              {/* Loop toggle */}
              <button
                onClick={() => setLoopEnabled(v => !v)}
                className={`text-xs px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors shrink-0 ${
                  loopEnabled
                    ? 'bg-indigo-900/60 border-indigo-700 text-indigo-300'
                    : 'bg-gray-900/80 border-gray-700 text-gray-500 hover:text-gray-300'
                }`}
                title="Loop"
              >
                ↺
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══ SOCIAL MODE ══════════════════════════════════════════════════════════ */}
      {socialMode && !cursorHidden && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
          <button
            onClick={() => setIsPlaying(v => !v)}
            className="text-white text-base"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button onClick={toggleSocialMode} className="text-[10px] text-gray-500 hover:text-gray-300">
            Exit
          </button>
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

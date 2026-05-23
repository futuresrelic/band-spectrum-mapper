/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LyricsUniversePage — a 3D immersive view where lyrics float in space.
 *
 * Albums are arranged in a ring.  Each album has songs in a smaller ring.
 * Each song's lyrics are split into lines and stacked in a gentle spiral above
 * their song node.  The camera can fly through the text for social media reels.
 *
 * Uses ForceGraph3D with all nodes pinned (warmupTicks=0, cooldownTicks=0) so
 * physics is disabled and we have full control over layout.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { api } from '../lib/api';
import { easeInOutQuad } from '../cinema/graphArrange';

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

interface LyricNode {
  id: string;
  label: string;
  kind: 'album' | 'song' | 'lyric';
  fx: number; fy: number; fz: number;
}

// ── Layout constants ──────────────────────────────────────────────────────────

const ALBUM_RING_R  = 600;   // radius of album ring in XZ
const SONG_RING_R   = 180;   // radius of songs around their album
const LINE_STEP_Y   = 20;    // vertical spacing between lyric lines
const LINE_SPIRAL_R = 0.35;  // spiral radius per line
const LINE_SPIRAL_A = 0.22;  // angle step per line (radians)
const MAX_LINES     = 40;    // lyric lines shown per song

// ── Color / size ──────────────────────────────────────────────────────────────

function kindColor(kind: LyricNode['kind']): string {
  if (kind === 'album') return '#f59e0b';
  if (kind === 'song')  return '#8b5cf6';
  return '#1e293b'; // lyric nodes are invisible spheres — text is the SpriteText
}

function kindSize(kind: LyricNode['kind']): number {
  if (kind === 'album') return 6;
  if (kind === 'song')  return 3;
  return 0.1; // lyric lines: near-invisible sphere, SpriteText carries the label
}

// ── API ───────────────────────────────────────────────────────────────────────

interface UniverseData { albums: LyricAlbum[] }

function fetchScopes(): Promise<{ bands: { id: string; name: string }[] }> {
  return api.get('/api/public/graph/scopes');
}
function fetchUniverse(bandIds: string[]): Promise<UniverseData> {
  const qs = new URLSearchParams();
  if (bandIds.length) qs.set('bandIds', bandIds.join(','));
  const q = qs.toString();
  return api.get(`/api/public/lyrics-universe${q ? `?${q}` : ''}`);
}

// ── Build 3D layout ───────────────────────────────────────────────────────────

function buildNodes(albums: LyricAlbum[]): LyricNode[] {
  const nodes: LyricNode[] = [];

  albums.forEach((album, ai) => {
    const albumAngle = (ai / Math.max(1, albums.length)) * 2 * Math.PI;
    const ax = ALBUM_RING_R * Math.cos(albumAngle);
    const az = ALBUM_RING_R * Math.sin(albumAngle);
    const ay = 0;

    nodes.push({ id: `album:${album.id}`, label: `${album.title}${album.year ? ` (${album.year})` : ''}`, kind: 'album', fx: ax, fy: ay, fz: az });

    album.songs.forEach((song, si) => {
      const songAngle = (si / Math.max(1, album.songs.length)) * 2 * Math.PI;
      const sx = ax + SONG_RING_R * Math.cos(songAngle);
      const sz = az + SONG_RING_R * Math.sin(songAngle);
      const sy = 0;

      nodes.push({ id: `song:${song.id}`, label: song.title, kind: 'song', fx: sx, fy: sy, fz: sz });

      if (!song.lyricText) return;
      const lines = song.lyricText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 1 && !l.startsWith('['))
        .slice(0, MAX_LINES);

      lines.forEach((line, li) => {
        const k   = li + 1;
        const lx  = sx + Math.sin(k * LINE_SPIRAL_A) * k * LINE_SPIRAL_R;
        const ly  = sy + k * LINE_STEP_Y;
        const lz  = sz + Math.cos(k * LINE_SPIRAL_A) * k * LINE_SPIRAL_R;
        nodes.push({
          id:    `lyric:${song.id}:${li}`,
          label: line,
          kind:  'lyric',
          fx: lx, fy: ly, fz: lz,
        });
      });
    });
  });

  return nodes;
}

// ── Fly-through state ─────────────────────────────────────────────────────────

interface FlyTarget {
  x: number; y: number; z: number;
  label: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LyricsUniversePage() {
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [showBandPicker, setShowBandPicker]   = useState(false);
  const [socialMode, setSocialMode]           = useState(false);
  const [isFlying, setIsFlying]               = useState(false);
  const [cursorHidden, setCursorHidden]       = useState(false);
  const [orbitSpeed, setOrbitSpeed]           = useState(1);
  const [showControls, setShowControls]       = useState(false);
  const [flyLabel, setFlyLabel]               = useState('');

  const fgRef        = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFlying_    = useRef(false);
  const flyTargets   = useRef<FlyTarget[]>([]);
  const flyIdx       = useRef(0);
  const flyOrbit     = useRef<{ startAngle: number; startTime: number; targetX: number; targetY: number; targetZ: number } | null>(null);
  const orbitSpeedR  = useRef(1);
  const lastMoveRef  = useRef(Date.now());

  useEffect(() => { isFlying_.current  = isFlying; },   [isFlying]);
  useEffect(() => { orbitSpeedR.current = orbitSpeed; }, [orbitSpeed]);

  const { data: scopes } = useQuery({ queryKey: ['lyric-scopes'], queryFn: fetchScopes });

  const { data, isFetching } = useQuery({
    queryKey: ['lyrics-universe', selectedBandIds.join(',')],
    queryFn:  () => fetchUniverse(selectedBandIds),
  });

  const nodes = data ? buildNodes(data.albums) : [];

  // Build fly targets from album positions
  useEffect(() => {
    if (!data?.albums.length) return;
    const targets: FlyTarget[] = data.albums.map((album, ai) => {
      const angle = (ai / Math.max(1, data.albums.length)) * 2 * Math.PI;
      return {
        x: ALBUM_RING_R * Math.cos(angle),
        y: 40,
        z: ALBUM_RING_R * Math.sin(angle),
        label: album.title,
      };
    });
    flyTargets.current = targets;
  }, [data]);

  // ── rAF: fly-through orbit loop ─────────────────────────────────────────────

  useEffect(() => {
    if (!nodes.length) return;
    let rafId: number;
    let lastAdvance = performance.now();

    const tick = (now: number) => {
      const fg = fgRef.current;
      if (fg && isFlying_.current) {
        const camera  = fg.camera?.();
        const ctrl    = fg.controls?.();
        if (camera && ctrl) {
          if (!flyOrbit.current) {
            // Pick next target
            const targets = flyTargets.current;
            if (!targets.length) { rafId = requestAnimationFrame(tick); return; }
            const t     = targets[flyIdx.current % targets.length]!;
            const angle = Math.atan2(camera.position.x - t.x, camera.position.z - t.z);
            flyOrbit.current = { startAngle: angle, startTime: now, targetX: t.x, targetY: t.y, targetZ: t.z };
            setFlyLabel(t.label);
            lastAdvance = now;
          }

          const fo    = flyOrbit.current;
          const speed = orbitSpeedR.current;
          const dist  = 220;
          const elapsed = now - fo.startTime;

          // Fly in for first 2s, then orbit
          const flyRaw = Math.min(1, elapsed / 2000);
          const flyT   = easeInOutQuad(flyRaw);
          const orbitAngle = fo.startAngle + (elapsed - 2000) * 0.001 * speed;
          const orbitX     = fo.targetX + Math.sin(orbitAngle) * dist;
          const orbitZ     = fo.targetZ + Math.cos(orbitAngle) * dist;
          const orbitY     = fo.targetY + Math.sin(elapsed * 0.0004) * 30;

          if (flyRaw < 1) {
            const destX = fo.targetX + Math.sin(fo.startAngle) * dist;
            const destZ = fo.targetZ + Math.cos(fo.startAngle) * dist;
            camera.position.x = camera.position.x + (destX - camera.position.x) * flyT * 0.05;
            camera.position.y = camera.position.y + (orbitY   - camera.position.y) * flyT * 0.05;
            camera.position.z = camera.position.z + (destZ - camera.position.z) * flyT * 0.05;
          } else {
            camera.position.x = orbitX;
            camera.position.y = orbitY;
            camera.position.z = orbitZ;
          }

          ctrl.target.x = fo.targetX;
          ctrl.target.y = fo.targetY - 20;
          ctrl.target.z = fo.targetZ;

          // Advance to next album every 12s
          if (now - lastAdvance > 12000) {
            flyIdx.current = (flyIdx.current + 1) % Math.max(1, flyTargets.current.length);
            flyOrbit.current = null;
            lastAdvance = now;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);

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

  // ── Social mode ───────────────────────────────────────────────────────────────

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

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        setIsFlying(v => {
          if (v) { flyOrbit.current = null; }
          return !v;
        });
      }
      if (e.key === 'f' || e.key === 'F') toggleSocialMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSocialMode]);

  // ── ForceGraph3D callbacks ────────────────────────────────────────────────────

  const nodeColor = useCallback((node: object) => kindColor((node as LyricNode).kind), []);
  const nodeVal   = useCallback((node: object) => kindSize((node as LyricNode).kind), []);

  const nodeThreeObject = useCallback((node: object) => {
    const n = node as LyricNode;
    if (n.kind === 'lyric') {
      const sprite = new SpriteText(n.label);
      sprite.color = '#e2e8f0cc';
      sprite.textHeight = 4;
      sprite.fontFace  = 'Georgia, serif';
      sprite.backgroundColor = 'transparent';
      return sprite;
    }
    if (n.kind === 'song') {
      const sprite = new SpriteText(n.label);
      sprite.color = '#c4b5fd';
      sprite.textHeight = 6;
      sprite.fontWeight = '700';
      sprite.backgroundColor = 'rgba(3,7,18,0.6)';
      sprite.padding = 2;
      sprite.borderRadius = 3;
      return sprite;
    }
    // album
    const sprite = new SpriteText(n.label);
    sprite.color = '#fbbf24';
    sprite.textHeight = 9;
    sprite.fontWeight = '800';
    sprite.backgroundColor = 'rgba(3,7,18,0.7)';
    sprite.padding = 3;
    sprite.borderRadius = 4;
    return sprite;
  }, []);

  const isEmpty = !isFetching && nodes.length === 0;

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
          graphData={{ nodes: nodes as object[], links: [] }}
          nodeId="id"
          nodeLabel=""
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeRelSize={1}
          nodeOpacity={1}
          nodeResolution={4}
          nodeThreeObjectExtend={false}
          nodeThreeObject={nodeThreeObject}
          backgroundColor="#030712"
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
          <p className="text-gray-500 text-sm">No lyrics found.</p>
          <p className="text-gray-600 text-xs">Add primary lyrics to songs in the Library, then return here.</p>
          <Link to="/library" className="text-indigo-400 text-xs hover:underline">Go to Library</Link>
        </div>
      )}

      {/* ══ UI CHROME ═══════════════════════════════════════════════════════════ */}
      {!socialMode && (
        <>
          {/* Top-left: nav */}
          <div className="absolute top-4 left-5 z-30 flex items-center gap-3">
            <Link to="/cinema" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              ← Cinema
            </Link>
            <span className="text-xs font-bold text-gray-500 tracking-wide">Lyrics Universe</span>
          </div>

          {/* Flying label */}
          {isFlying && flyLabel && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center">
              <div className="text-xs text-yellow-400/70 font-semibold">{flyLabel}</div>
            </div>
          )}

          {/* Top-right: buttons */}
          <div className="absolute top-4 right-4 z-30 flex gap-2">
            <button
              onClick={() => { setShowBandPicker(v => !v); setShowControls(false); }}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              Bands{selectedBandIds.length > 0 ? ` (${selectedBandIds.length})` : ''}
            </button>
            <button
              onClick={() => { setShowControls(v => !v); setShowBandPicker(false); }}
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                showControls
                  ? 'bg-indigo-900/60 border-indigo-700 text-indigo-300'
                  : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              ⚙
            </button>
            <button
              onClick={toggleSocialMode}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              🎬
            </button>
          </div>

          {/* Band picker */}
          {showBandPicker && scopes && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-3 backdrop-blur-sm w-56 shadow-2xl max-h-72 overflow-y-auto">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Filter by band</div>
              <button
                onClick={() => setSelectedBandIds([])}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg mb-1 transition-colors ${
                  selectedBandIds.length === 0 ? 'bg-indigo-900/60 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                All bands
              </button>
              {scopes.bands.map(b => (
                <button key={b.id}
                  onClick={() => setSelectedBandIds(prev =>
                    prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                  )}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                    selectedBandIds.includes(b.id) ? 'bg-indigo-900/60 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {/* Controls panel */}
          {showControls && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur-sm w-56 shadow-2xl space-y-3">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Fly Controls</div>
              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Orbit speed</span>
                  <span>{orbitSpeed.toFixed(1)}×</span>
                </div>
                <input type="range" min="0.1" max="5" step="0.1"
                  value={orbitSpeed}
                  onChange={e => setOrbitSpeed(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </label>
            </div>
          )}
        </>
      )}

      {/* ══ PLAYBACK CONTROLS ════════════════════════════════════════════════════ */}
      {!socialMode && (
        <div className="absolute bottom-0 left-0 right-0 z-30">
          <div className="flex items-center justify-between px-4 py-3 gap-3 bg-gradient-to-t from-gray-950/90 to-transparent backdrop-blur-sm">
            <div className="text-xs text-gray-600">
              {data ? `${data.albums.length} albums · ${nodes.length.toLocaleString()} nodes` : 'Lyrics Universe'}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setIsFlying(v => { if (v) flyOrbit.current = null; return !v; });
                }}
                disabled={nodes.length === 0}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors ${
                  nodes.length > 0
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'bg-white/5 text-gray-700 cursor-not-allowed'
                }`}
                title="Fly through (Space)"
              >
                {isFlying ? '⏸' : '▶'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[10px] text-gray-700">Space · F</span>
              <button onClick={toggleSocialMode} className="text-xs text-gray-600 hover:text-gray-300 transition-colors">🎬</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SOCIAL MODE ══════════════════════════════════════════════════════════ */}
      {socialMode && !cursorHidden && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
          <button
            onClick={() => { setIsFlying(v => { if (v) flyOrbit.current = null; return !v; }); }}
            className="text-white text-base"
          >
            {isFlying ? '⏸' : '▶'}
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button onClick={toggleSocialMode} className="text-[10px] text-gray-500 hover:text-gray-300">Exit</button>
        </div>
      )}

      {socialMode && (
        <div className="absolute bottom-6 right-6 z-30 pointer-events-none">
          <div className="text-xs text-white/15 text-right">
            <div className="font-semibold tracking-wide">Band Spectrum Mapper</div>
            <div className="text-[10px] mt-0.5">Lyrics Universe</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LyricPathPanel — full-screen Cinema overlay that renders a song's lyrics as
 * a 3-D word-sequence graph.
 *
 * Each word is a node pinned to a helix position; consecutive words are linked.
 *
 * Two playback modes (📍/🛤 toggle in the controls bar):
 *   Step — camera jumps to each word on a timer (original behaviour)
 *   Rail — camera flows continuously along a CatmullRom spline; no stopping
 *
 * Controls bar is two-row so it fits in portrait phone layout.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { api } from '../lib/api';

// ── Helix geometry ────────────────────────────────────────────────────────────

const HELIX_RADIUS     = 28;
const HELIX_ANGLE_STEP = 0.52;
const HELIX_Y_STEP     = 3.8;

// Seconds per word at speed × 1 (same scale for both modes)
const SECS_PER_WORD = 1.3;

// ── Colour gradient: indigo → cyan ───────────────────────────────────────────

function wordColor(i: number, total: number): string {
  if (total <= 1) return '#6366f1';
  const t = i / (total - 1);
  const r = Math.round(0x63 + (0x22 - 0x63) * t);
  const g = Math.round(0x66 + (0xd3 - 0x66) * t);
  const b = Math.round(0xf1 + (0xee - 0xf1) * t);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LyricWord {
  id: string; label: string;
  wordIndex: number; total: number;
  fx: number; fy: number; fz: number;
  theta: number;
}
interface LyricLink { source: string; target: string; }
interface Props { songId: string; songLabel: string; onClose: () => void; }

// ── Component ─────────────────────────────────────────────────────────────────

export default function LyricPathPanel({ songId, songLabel, onClose }: Props) {
  const fgRef = useRef<any>(null);

  const [graphData, setGraphData] = useState<{ nodes: LyricWord[]; links: LyricLink[] }>({ nodes: [], links: [] });
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState('');

  const [currentIdx, setCurrentIdx] = useState(0);
  const currentIdxRef               = useRef(0);
  const [isPlaying, setIsPlaying]   = useState(false);
  const isPlayingRef                = useRef(false);
  const tourTimerRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [speed, setSpeed]         = useState(1.0);
  const speedRef                  = useRef(1.0);
  const [orbitDist, setOrbitDist] = useState(55);
  const orbitDistRef              = useRef(55);
  const nodesRef                  = useRef<LyricWord[]>([]);

  const [smoothRail, setSmoothRail] = useState(false);
  const smoothRailRef               = useRef(false);

  // Smooth rail state
  const railTRef        = useRef(0);
  const railRafRef      = useRef<number | null>(null);
  const railLastTimeRef = useRef(0);
  const railPosCurve    = useRef<THREE.CatmullRomCurve3 | null>(null);
  const railLookCurve   = useRef<THREE.CatmullRomCurve3 | null>(null);

  useEffect(() => { speedRef.current      = speed;      }, [speed]);
  useEffect(() => { orbitDistRef.current  = orbitDist;  }, [orbitDist]);
  useEffect(() => { isPlayingRef.current  = isPlaying;  }, [isPlaying]);
  useEffect(() => { smoothRailRef.current = smoothRail; }, [smoothRail]);

  // ── Load lyrics ───────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true); setLoadError('');
    setCurrentIdx(0); currentIdxRef.current = 0;
    railTRef.current = 0;
    setIsPlaying(false); isPlayingRef.current = false;
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    if (railRafRef.current)   cancelAnimationFrame(railRafRef.current);
    railRafRef.current = null;

    api.get<{ id: string; text: string; isPrimary: boolean }[]>(`/api/songs/${songId}/lyrics`)
      .then(lyrics => {
        const primary = lyrics.find(l => l.isPrimary) ?? lyrics[0];
        if (!primary) { setLoadError('No lyrics found.'); setLoading(false); return; }
        const words = primary.text
          .split(/[\r\n]+/)
          .flatMap(line => line.trim().split(/\s+/).filter(w => w.length > 0))
          .slice(0, 600);
        if (!words.length) { setLoadError('Lyrics appear to be empty.'); setLoading(false); return; }

        const total = words.length;
        const totalY = (total - 1) * HELIX_Y_STEP;
        const nodes: LyricWord[] = words.map((word, i) => {
          const theta = i * HELIX_ANGLE_STEP;
          return { id: `lw-${i}`, label: word, wordIndex: i, total,
            fx: HELIX_RADIUS * Math.cos(theta),
            fy: i * HELIX_Y_STEP - totalY / 2,
            fz: HELIX_RADIUS * Math.sin(theta), theta };
        });
        const links: LyricLink[] = nodes.slice(0, -1).map((_, i) => ({ source: `lw-${i}`, target: `lw-${i + 1}` }));
        nodesRef.current = nodes;
        setGraphData({ nodes, links });
        setLoading(false);
      })
      .catch(() => { setLoadError('Failed to load lyrics.'); setLoading(false); });
  }, [songId]);

  // ── Build rail curves whenever nodes or distance changes ──────────────────

  const buildCurves = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes.length < 2) { railPosCurve.current = null; railLookCurve.current = null; return; }
    const dist = orbitDistRef.current;
    // Add duplicate endpoints so the curve doesn't snap at the very start/end
    const posVecs  = nodes.map(n => new THREE.Vector3(
      n.fx + Math.cos(n.theta) * dist,
      n.fy + dist * 0.22,
      n.fz + Math.sin(n.theta) * dist,
    ));
    const lookVecs = nodes.map(n => new THREE.Vector3(n.fx, n.fy, n.fz));
    // Duplicate first and last so t=0 and t=1 sample the actual endpoints cleanly
    railPosCurve.current  = new THREE.CatmullRomCurve3([posVecs[0]!,  ...posVecs,  posVecs[posVecs.length - 1]!],  false, 'catmullrom', 0.5);
    railLookCurve.current = new THREE.CatmullRomCurve3([lookVecs[0]!, ...lookVecs, lookVecs[lookVecs.length - 1]!], false, 'catmullrom', 0.5);
  }, []);

  useEffect(() => { buildCurves(); }, [graphData, orbitDist, buildCurves]);

  // ── Engine-stop: kill TrackballControls momentum so rail has full control ──

  const onEngineStop = useCallback(() => {
    const ctrl = fgRef.current?.controls?.() as Record<string, any> | undefined;
    if (ctrl) ctrl['staticMoving'] = true;
  }, []);

  // ── Camera fly-to (step mode) ─────────────────────────────────────────────

  const flyToWord = useCallback((idx: number, durationMs?: number) => {
    const node = nodesRef.current[idx];
    if (!node || !fgRef.current) return;
    const dist = orbitDistRef.current;
    fgRef.current.cameraPosition(
      { x: node.fx + Math.cos(node.theta) * dist, y: node.fy + dist * 0.22, z: node.fz + Math.sin(node.theta) * dist },
      { x: node.fx, y: node.fy, z: node.fz },
      durationMs ?? (1100 / speedRef.current),
    );
  }, []);

  // Initial fly-in on load
  useEffect(() => {
    if (!loading && graphData.nodes.length > 0) {
      railTRef.current = 0;
      const t = setTimeout(() => flyToWord(0, 1400), 350);
      return () => clearTimeout(t);
    }
  }, [loading, graphData, flyToWord]);

  // Refresh sprites only in step mode (rail mode skips this to stay frame-smooth)
  useEffect(() => {
    if (!smoothRailRef.current) fgRef.current?.refresh();
  }, [currentIdx]);

  // ── Smooth rail RAF loop ──────────────────────────────────────────────────

  const railTick = useCallback((now: number) => {
    if (!isPlayingRef.current || !smoothRailRef.current) return;

    const dtSec = railLastTimeRef.current > 0
      ? Math.min((now - railLastTimeRef.current) / 1000, 0.05) // cap at 50 ms
      : 1 / 60;
    railLastTimeRef.current = now;

    const totalSecs = (nodesRef.current.length * SECS_PER_WORD) / speedRef.current;
    railTRef.current = Math.min(1, railTRef.current + dtSec / totalSecs);

    const camera = fgRef.current?.camera?.() as THREE.Camera | undefined;
    const ctrl   = fgRef.current?.controls?.() as Record<string, any> | undefined;
    if (camera && railPosCurve.current && railLookCurve.current) {
      const pos  = railPosCurve.current.getPoint(railTRef.current);
      const look = railLookCurve.current.getPoint(railTRef.current);
      camera.position.copy(pos);
      if (ctrl?.target) {
        (ctrl.target as THREE.Vector3).copy(look);
        // Sync controls so they don't fight the next frame
        if (typeof ctrl.update === 'function') ctrl.update();
      } else {
        camera.lookAt(look);
      }
    }

    // Update word ticker (React state) — no refresh() to keep frames smooth
    const n      = nodesRef.current.length;
    const newIdx = Math.min(n - 1, Math.floor(railTRef.current * n));
    if (newIdx !== currentIdxRef.current) {
      currentIdxRef.current = newIdx;
      setCurrentIdx(newIdx);
      // Do NOT call fgRef.current?.refresh() here — it rebuilds all sprites
      // and causes a visible hitch every ~1 s on mobile.
    }

    if (railTRef.current < 1) {
      railRafRef.current = requestAnimationFrame(railTick);
    } else {
      isPlayingRef.current = false;
      setIsPlaying(false);
      railRafRef.current = null;
    }
  }, []);

  const startSmoothRail = useCallback(() => {
    if (railRafRef.current) cancelAnimationFrame(railRafRef.current);
    if (railTRef.current >= 1) { railTRef.current = 0; currentIdxRef.current = 0; setCurrentIdx(0); }
    railLastTimeRef.current = 0;
    isPlayingRef.current = true;
    setIsPlaying(true);
    railRafRef.current = requestAnimationFrame(railTick);
  }, [railTick]);

  const stopSmoothRail = useCallback(() => {
    if (railRafRef.current) cancelAnimationFrame(railRafRef.current);
    railRafRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  // ── Step-mode playback ────────────────────────────────────────────────────

  const scheduleTick = useCallback(() => {
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    if (!isPlayingRef.current) return;
    tourTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current) return;
      const total = nodesRef.current.length;
      if (!total) return;
      const next = (currentIdxRef.current + 1) % total;
      currentIdxRef.current = next;
      railTRef.current = total > 1 ? next / (total - 1) : 0;
      setCurrentIdx(next);
      flyToWord(next);
      scheduleTick();
    }, (1300 / speedRef.current));
  }, [flyToWord]);

  useEffect(() => {
    if (smoothRailRef.current) {
      if (isPlaying) {
        if (!railRafRef.current) { railLastTimeRef.current = 0; railRafRef.current = requestAnimationFrame(railTick); }
      } else {
        if (railRafRef.current) { cancelAnimationFrame(railRafRef.current); railRafRef.current = null; }
      }
    } else {
      if (isPlaying) scheduleTick();
      else if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    }
    return () => { if (tourTimerRef.current) clearTimeout(tourTimerRef.current); };
  }, [isPlaying, scheduleTick, railTick]);

  useEffect(() => () => {
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    if (railRafRef.current)   cancelAnimationFrame(railRafRef.current);
  }, []);

  // ── Mode switch ───────────────────────────────────────────────────────────

  const switchMode = useCallback((toRail: boolean) => {
    if (isPlayingRef.current) {
      if (railRafRef.current) { cancelAnimationFrame(railRafRef.current); railRafRef.current = null; }
      if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
    smoothRailRef.current = toRail;
    setSmoothRail(toRail);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (smoothRailRef.current) {
      if (isPlayingRef.current) stopSmoothRail(); else startSmoothRail();
    } else {
      setIsPlaying(v => !v);
    }
  }, [startSmoothRail, stopSmoothRail]);

  // ── Step controls ─────────────────────────────────────────────────────────

  const stepTo = useCallback((idx: number, dur = 400) => {
    const clamped = Math.max(0, Math.min(nodesRef.current.length - 1, idx));
    currentIdxRef.current = clamped;
    railTRef.current = nodesRef.current.length > 1 ? clamped / (nodesRef.current.length - 1) : 0;
    setCurrentIdx(clamped);
    flyToWord(clamped, dur);
  }, [flyToWord]);

  const currentWord = graphData.nodes[currentIdx];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-hidden select-none">

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 pt-4 pb-8 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <div className="text-white font-semibold text-sm leading-tight">{songLabel}</div>
          {!loading && !loadError && (
            <div className="text-gray-600 text-[10px] uppercase tracking-widest mt-0.5">
              Lyric Path · {graphData.nodes.length} words
            </div>
          )}
        </div>
        <button onClick={onClose}
          className="pointer-events-auto text-gray-400 hover:text-white text-xs bg-gray-900/80 border border-gray-700/70 rounded-lg px-3 py-1.5 transition-colors">
          ← Cinema
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1.5">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-red-400 text-sm">{loadError}</p>
            <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-3 py-1.5">← Back to Cinema</button>
          </div>
        </div>
      )}

      {/* 3D Graph */}
      {!loading && !loadError && (
        <>
          <ForceGraph3D
            ref={fgRef}
            graphData={graphData as any}
            backgroundColor="#000000"
            showNavInfo={false}
            enableNodeDrag={false}
            onEngineStop={onEngineStop}
            nodeThreeObject={(node: any) => {
              const n = node as LyricWord;
              const isActive = n.wordIndex === currentIdxRef.current;
              const sp = new SpriteText(n.label);
              sp.color      = isActive ? '#ffffff' : wordColor(n.wordIndex, n.total);
              sp.textHeight = isActive ? 6.5 : 3.5;
              sp.fontFace   = 'Inter, system-ui, sans-serif';
              sp.backgroundColor = isActive ? 'rgba(88,80,220,0.38)' : 'rgba(0,0,0,0)';
              sp.padding         = isActive ? 3 : 1;
              if (isActive) sp.borderRadius = 3;
              return sp;
            }}
            nodeThreeObjectExtend={false}
            linkColor={() => 'rgba(99,102,241,0.32)'}
            linkWidth={0.7}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => 'rgba(139,92,246,0.65)'}
            d3AlphaDecay={1}
            d3VelocityDecay={1}
            cooldownTicks={0}
            onNodeClick={(node: any) => stepTo((node as LyricWord).wordIndex, 500)}
          />

          {/* Current-word ticker */}
          {currentWord && (
            <div className="absolute top-1/2 right-5 -translate-y-1/2 z-10 text-right pointer-events-none max-w-[12rem]">
              <div className="text-white/85 text-xl font-light tracking-widest break-words leading-tight">{currentWord.label}</div>
              <div className="text-gray-700 text-[10px] mt-1.5">{currentIdx + 1} / {graphData.nodes.length}</div>
            </div>
          )}

          {/* ── Controls bar — two rows so it fits portrait phone ── */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10
            w-[calc(100vw-32px)] max-w-md
            bg-gray-900/92 border border-gray-700/60 rounded-xl px-4 py-3
            flex flex-col gap-2.5 backdrop-blur-sm shadow-2xl">

            {/* Row 1: playback · mode · counter */}
            <div className="flex items-center gap-2">
              {/* Prev / Play / Next */}
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => stepTo(currentIdxRef.current - 1)}
                  className="text-gray-400 hover:text-white text-sm transition-colors" title="Previous word">⏮</button>
                <button onClick={handlePlayPause}
                  className="w-8 h-8 rounded-full bg-indigo-600/60 hover:bg-indigo-600/80 text-white text-base flex items-center justify-center transition-colors">
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button onClick={() => stepTo(currentIdxRef.current + 1)}
                  className="text-gray-400 hover:text-white text-sm transition-colors" title="Next word">⏭</button>
              </div>

              {/* Mode toggle */}
              <div className="flex items-center gap-0.5 bg-gray-800/70 rounded-lg p-0.5 mx-auto shrink-0">
                <button onClick={() => switchMode(false)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${!smoothRail ? 'bg-indigo-700/80 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                  title="Step mode">📍</button>
                <button onClick={() => switchMode(true)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${smoothRail ? 'bg-indigo-700/80 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                  title="Rail mode — smooth continuous flow">🛤</button>
              </div>

              {/* Counter */}
              <span className="text-[10px] text-gray-600 tabular-nums shrink-0 ml-auto">
                {currentIdx + 1}/{graphData.nodes.length}
              </span>
            </div>

            {/* Row 2: Speed · Distance */}
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-[10px] shrink-0">Speed</span>
              <input type="range" min={0.2} max={5} step={0.1} value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                className="flex-1 min-w-0 accent-indigo-500" />
              <span className="text-gray-400 text-[10px] w-7 text-right shrink-0">{speed.toFixed(1)}×</span>

              <div className="w-px h-4 bg-gray-700 shrink-0" />

              <span className="text-gray-500 text-[10px] shrink-0">Dist</span>
              <input type="range" min={15} max={220} step={5} value={orbitDist}
                onChange={e => {
                  setOrbitDist(Number(e.target.value));
                  if (!smoothRailRef.current) flyToWord(currentIdxRef.current, 250);
                }}
                className="flex-1 min-w-0 accent-indigo-500" />
              <span className="text-gray-400 text-[10px] w-7 text-right shrink-0">{orbitDist}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LyricPathPanel — full-screen Cinema overlay that renders a song's lyrics as
 * a 3-D word-sequence graph.
 *
 * Each word is pinned to a helix position; consecutive words are linked.
 *
 * Camera modes (📍/🛤 toggle):
 *   Step — jumps to each word on a timer
 *   Rail — flows continuously along a CatmullRom spline
 *
 * Rail styles (visible when Rail is active):
 *   🌀 Spiral   — follows the helix surface outward, looking at each word
 *   🎯 Core     — center-axis descent, rotating to face each word
 *   🕳 Tunnel   — center-axis descent looking forward; words spiral past the edges
 *   φ  Golden   — radius expands by golden ratio φ per revolution
 *   🌊 Wave     — compound-sine radius + elevation oscillation
 *   🌻 Flora    — golden-angle (137.5°) step per word — sunflower phyllotaxis
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { api } from '../lib/api';

// ── Helix geometry ────────────────────────────────────────────────────────────

const HELIX_RADIUS     = 28;
const HELIX_ANGLE_STEP = 0.52;   // radians per word (≈ 12 words per full turn)
const HELIX_Y_STEP     = 3.8;

const SECS_PER_WORD = 1.3; // at speed ×1

// ── Colour gradient: indigo → cyan ───────────────────────────────────────────

function wordColor(i: number, total: number): string {
  if (total <= 1) return '#6366f1';
  const t = i / (total - 1);
  const r = Math.round(0x63 + (0x22 - 0x63) * t);
  const g = Math.round(0x66 + (0xd3 - 0x66) * t);
  const b = Math.round(0xf1 + (0xee - 0xf1) * t);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ── Rail-style types ──────────────────────────────────────────────────────────

type LyricRailStyle = 'spiral' | 'core' | 'tunnel' | 'golden' | 'wave' | 'flora';

const LYRIC_RAIL_STYLES: { id: LyricRailStyle; emoji: string; label: string; desc: string }[] = [
  { id: 'spiral', emoji: '🌀', label: 'Spiral',
    desc: 'Follows the helix surface — camera rides the outer edge of the spiral looking inward at each word.' },
  { id: 'core',   emoji: '🎯', label: 'Core',
    desc: 'Descends the center axis, turning to face each word. The spiral wraps around you as you drop.' },
  { id: 'tunnel', emoji: '🕳', label: 'Tunnel',
    desc: 'Center axis, looking forward down the tube. Words spiral past the edges — pure warp-speed lyric tunnel.' },
  { id: 'golden', emoji: 'φ',  label: 'Golden',
    desc: 'Camera radius grows by golden ratio φ ≈ 1.618 each revolution — a logarithmic outward spiral.' },
  { id: 'wave',   emoji: '🌊', label: 'Wave',
    desc: 'Radius and elevation oscillate with two different sine frequencies. Swooping, organic motion.' },
  { id: 'flora',  emoji: '🌻', label: 'Flora',
    desc: 'Each step rotates the camera by the golden angle ≈ 137.5° (2π/φ²) — the sunflower seed pattern.' },
];

// ── Curve builder (one function, all styles) ──────────────────────────────────

function buildLyricRailCurves(
  nodes: LyricWord[],
  dist: number,
  style: LyricRailStyle,
): { pos: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3 } {
  const R   = HELIX_RADIUS;
  const PHI = 1.6180339887;
  // Golden angle: 2π/φ² ≈ 2.399 rad ≈ 137.5° — the angle used by sunflower seeds
  const GA  = 2 * Math.PI / (PHI * PHI);

  let posVecs:  THREE.Vector3[];
  let lookVecs: THREE.Vector3[];

  switch (style) {

    // ── Core: center axis, face each word ─────────────────────────────────────
    case 'core': {
      posVecs  = nodes.map(n => new THREE.Vector3(0, n.fy, 0));
      lookVecs = nodes.map(n => new THREE.Vector3(n.fx, n.fy, n.fz));
      break;
    }

    // ── Tunnel: center axis, look forward down the helix tube ─────────────────
    case 'tunnel': {
      // Look ~14 words ahead so the forward motion reads as flying through a tunnel
      const lookaheadY = HELIX_Y_STEP * 14;
      posVecs  = nodes.map(n => new THREE.Vector3(0, n.fy, 0));
      // At the very end, clamp the look-at so we don't invert direction
      lookVecs = nodes.map((n, i) => {
        const ahead = nodes[Math.min(i + 14, nodes.length - 1)]!;
        // If at the final words, keep the last forward direction
        const lookY = i < nodes.length - 8 ? n.fy + lookaheadY : n.fy + lookaheadY * 0.5;
        return new THREE.Vector3(ahead.fx * 0.15, lookY, ahead.fz * 0.15);
      });
      break;
    }

    // ── Golden: radius expands by φ per revolution ────────────────────────────
    case 'golden': {
      posVecs = nodes.map((n, i) => {
        const revolutions = (i * HELIX_ANGLE_STEP) / (2 * Math.PI);
        // Radius grows by φ per revolution, capped at R + dist * 3.5
        const r = Math.min(R + dist * 3.5, R + dist * Math.pow(PHI, revolutions * 0.55));
        // Camera lags 60° behind the word's position on the helix
        const camTheta = n.theta - Math.PI / 3;
        return new THREE.Vector3(Math.cos(camTheta) * r, n.fy + dist * 0.18, Math.sin(camTheta) * r);
      });
      lookVecs = nodes.map(n => new THREE.Vector3(n.fx, n.fy, n.fz));
      break;
    }

    // ── Wave: compound sine oscillations ─────────────────────────────────────
    case 'wave': {
      posVecs = nodes.map((n, i) => {
        const t = i / Math.max(nodes.length - 1, 1);
        // Two different frequencies for irregular, organic feel
        const rOsc   = R + dist * (0.6 + 0.38 * Math.sin(t * Math.PI * 5.3));
        const yOsc   = dist * 0.28 * Math.cos(t * Math.PI * 8.7 + 1.1);
        // Camera stays on the opposite side of the helix (π offset) for face-on view
        const camTheta = n.theta + Math.PI + 0.4 * Math.sin(t * Math.PI * 3.1);
        return new THREE.Vector3(Math.cos(camTheta) * rOsc, n.fy + yOsc, Math.sin(camTheta) * rOsc);
      });
      lookVecs = nodes.map(n => new THREE.Vector3(n.fx, n.fy, n.fz));
      break;
    }

    // ── Flora: golden-angle rotation (phyllotaxis / sunflower) ───────────────
    case 'flora': {
      // Accumulate golden angle per word — creates the same pattern as sunflower seeds.
      // The irrational angle means the camera NEVER visits the same direction twice.
      posVecs = nodes.map((n, i) => {
        const camTheta = i * GA; // pure accumulation — no relation to helix angle
        const r = R + dist;
        return new THREE.Vector3(Math.cos(camTheta) * r, n.fy + dist * 0.12, Math.sin(camTheta) * r);
      });
      lookVecs = nodes.map(n => new THREE.Vector3(n.fx, n.fy, n.fz));
      break;
    }

    // ── Spiral (default): outward from each word, look inward ────────────────
    default: { // 'spiral'
      posVecs = nodes.map(n => new THREE.Vector3(
        n.fx + Math.cos(n.theta) * dist,
        n.fy + dist * 0.22,
        n.fz + Math.sin(n.theta) * dist,
      ));
      lookVecs = nodes.map(n => new THREE.Vector3(n.fx, n.fy, n.fz));
    }
  }

  // Pad with duplicate endpoints so t=0 and t=1 land exactly on the first/last word
  const pad = (arr: THREE.Vector3[]) =>
    [arr[0]!.clone(), ...arr, arr[arr.length - 1]!.clone()];

  return {
    pos:  new THREE.CatmullRomCurve3(pad(posVecs),  false, 'catmullrom', 0.5),
    look: new THREE.CatmullRomCurve3(pad(lookVecs), false, 'catmullrom', 0.5),
  };
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

  const [speed, setSpeed]           = useState(1.0);
  const speedRef                    = useRef(1.0);
  const [orbitDist, setOrbitDist]   = useState(55);
  const orbitDistRef                = useRef(55);
  const nodesRef                    = useRef<LyricWord[]>([]);

  const [smoothRail, setSmoothRail]     = useState(false);
  const smoothRailRef                   = useRef(false);
  const [railStyle, setRailStyle]       = useState<LyricRailStyle>('spiral');

  // Smooth rail internals
  const railTRef        = useRef(0);
  const railRafRef      = useRef<number | null>(null);
  const railLastTimeRef = useRef(0);
  const railPosCurve    = useRef<THREE.CatmullRomCurve3 | null>(null);
  const railLookCurve   = useRef<THREE.CatmullRomCurve3 | null>(null);

  useEffect(() => { speedRef.current     = speed;     }, [speed]);
  useEffect(() => { orbitDistRef.current = orbitDist; }, [orbitDist]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { smoothRailRef.current = smoothRail; }, [smoothRail]);

  // ── Load lyrics ───────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true); setLoadError('');
    setCurrentIdx(0); currentIdxRef.current = 0;
    railTRef.current = 0;
    setIsPlaying(false); isPlayingRef.current = false;
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    if (railRafRef.current)   { cancelAnimationFrame(railRafRef.current); railRafRef.current = null; }

    api.get<{ id: string; text: string; isPrimary: boolean }[]>(`/api/songs/${songId}/lyrics`)
      .then(lyrics => {
        const primary = lyrics.find(l => l.isPrimary) ?? lyrics[0];
        if (!primary) { setLoadError('No lyrics found.'); setLoading(false); return; }
        const words = primary.text
          .split(/[\r\n]+/)
          .flatMap(line => line.trim().split(/\s+/).filter(w => w.length > 0))
          .slice(0, 600);
        if (!words.length) { setLoadError('Lyrics appear to be empty.'); setLoading(false); return; }

        const total  = words.length;
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

  // ── Rebuild rail curves when nodes, distance, or style changes ────────────

  useEffect(() => {
    const nodes = nodesRef.current;
    if (nodes.length < 2) { railPosCurve.current = null; railLookCurve.current = null; return; }
    const { pos, look } = buildLyricRailCurves(nodes, orbitDist, railStyle);
    railPosCurve.current  = pos;
    railLookCurve.current = look;
    // Running rail will pick up the new curves on the next frame automatically
  }, [graphData, orbitDist, railStyle]);

  // ── Engine-stop: disable TrackballControls momentum ──────────────────────

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

  // Refresh sprites in step mode only (rail skips this to stay frame-smooth)
  useEffect(() => {
    if (!smoothRailRef.current) fgRef.current?.refresh();
  }, [currentIdx]);

  // ── Smooth rail RAF loop ──────────────────────────────────────────────────

  const railTick = useCallback((now: number) => {
    if (!isPlayingRef.current || !smoothRailRef.current) return;

    const dtSec = railLastTimeRef.current > 0
      ? Math.min((now - railLastTimeRef.current) / 1000, 0.05)
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
        if (typeof ctrl.update === 'function') ctrl.update();
      } else {
        camera.lookAt(look);
      }
    }

    // Update word ticker without refresh() — keeps frames smooth
    const n      = nodesRef.current.length;
    const newIdx = Math.min(n - 1, Math.floor(railTRef.current * n));
    if (newIdx !== currentIdxRef.current) {
      currentIdxRef.current = newIdx;
      setCurrentIdx(newIdx);
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
    if (railRafRef.current) { cancelAnimationFrame(railRafRef.current); railRafRef.current = null; }
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
    }, 1300 / speedRef.current);
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
  const currentStyle = LYRIC_RAIL_STYLES.find(s => s.id === railStyle)!;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-hidden select-none">

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 pt-4 pb-8
        bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <div className="text-white font-semibold text-sm leading-tight">{songLabel}</div>
          {!loading && !loadError && (
            <div className="text-gray-600 text-[10px] uppercase tracking-widest mt-0.5">
              Lyric Path · {graphData.nodes.length} words
              {smoothRail && <span className="ml-2 text-indigo-500">{currentStyle.emoji} {currentStyle.label}</span>}
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
              sp.color           = isActive ? '#ffffff' : wordColor(n.wordIndex, n.total);
              sp.textHeight      = isActive ? 6.5 : 3.5;
              sp.fontFace        = 'Inter, system-ui, sans-serif';
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

          {/* ── Controls bar ── */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10
            w-[calc(100vw-32px)] max-w-md
            bg-gray-900/92 border border-gray-700/60 rounded-xl px-4 py-3
            flex flex-col gap-2.5 backdrop-blur-sm shadow-2xl">

            {/* Row 1: ⏮ ▶ ⏭ · 📍/🛤 toggle · counter */}
            <div className="flex items-center gap-2">
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

              <div className="flex items-center gap-0.5 bg-gray-800/70 rounded-lg p-0.5 mx-auto shrink-0">
                <button onClick={() => switchMode(false)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${!smoothRail ? 'bg-indigo-700/80 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                  title="Step mode — jump to each word">📍</button>
                <button onClick={() => switchMode(true)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${smoothRail ? 'bg-indigo-700/80 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                  title="Rail mode — smooth continuous fly-through">🛤</button>
              </div>

              <span className="text-[10px] text-gray-600 tabular-nums shrink-0 ml-auto">
                {currentIdx + 1}/{graphData.nodes.length}
              </span>
            </div>

            {/* Row 2: Speed · Dist */}
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

            {/* Row 3: Rail style picker — only visible in Rail mode */}
            {smoothRail && (
              <>
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
                  {LYRIC_RAIL_STYLES.map(s => (
                    <button key={s.id}
                      onClick={() => setRailStyle(s.id)}
                      title={s.desc}
                      className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-colors ${
                        railStyle === s.id
                          ? 'bg-indigo-700 text-white'
                          : 'bg-gray-800/70 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <span>{s.emoji}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
                <div className="text-[9px] text-gray-600 leading-snug -mt-1">
                  {currentStyle.desc}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

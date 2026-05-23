/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CinemaPage — cinematic autoplay showcase for the Band Spectrum Mapper.
 *
 * Features:
 *  - 8 named scenes with continuous camera motion
 *  - Orbit-to-node camera pattern for scenes 4 & 5
 *  - Smooth fade-to-black transitions
 *  - Play / Pause / Prev / Next controls
 *  - Scene progress bar + scene selector
 *  - Camera controls panel (orbit speed, approach dist, elevation, speed)
 *  - Tour/Script mode: author a custom node-by-node orbit sequence
 *  - Social Mode: fullscreen, watermark, cursor auto-hide
 *  - Band filter
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { api } from '../lib/api';
import type { GraphData } from '../api/songNodes';
import { buildAdj, computeArrangeTargets, animateArrange, easeInOutQuad } from '../cinema/graphArrange';
import { CINEMA_SCENES } from '../cinema/sceneDefinitions';
import { initOrbitState, updateOrbitCamera, type OrbitCameraState } from '../cinema/orbitCamera';
import type { CinemaNode, CinemaLink, CinemaControls, TourStep } from '../cinema/types';
import { DEFAULT_CINEMA_CONTROLS } from '../cinema/types';
import TourPlanner from '../cinema/TourPlanner';

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  song: '#6366f1', keyword: '#374151',
  album: '#8b5cf6', artist: '#f59e0b',
  theme: '#10b981', tag: '#06b6d4', emotion: '#ec4899',
};

const BASE_NODE_REL = 4;
function nodeValFor(type: string): number {
  switch (type) {
    case 'artist': return 7;
    case 'album':  return 4;
    case 'keyword':return 3;
    default:       return 2;
  }
}
function sphereR(val: number) { return BASE_NODE_REL * Math.cbrt(val); }

const TRANSITION_MS   = 700;
const DEFAULT_LABEL_SHOW = 450;
const DEFAULT_LABEL_FULL = 160;

// ── Orbit animation (pause-mode pivot when clicking nodes) ────────────────────

interface OrbitAnim {
  sx: number; sy: number; sz: number;
  tx: number; ty: number; tz: number;
  t0: number; dur: number;
}

// ── API helpers ────────────────────────────────────────────────────────────────

function fetchCinemaGraph(bandIds: string[]): Promise<GraphData> {
  const qs = new URLSearchParams({ preset: 'artist-universe' });
  if (bandIds.length) qs.set('bandIds', bandIds.join(','));
  return api.get(`/api/public/graph?${qs}`);
}

function fetchScopes(): Promise<{ bands: { id: string; name: string }[] }> {
  return api.get('/api/public/graph/scopes');
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CinemaPage() {
  // ── Data ─────────────────────────────────────────────────────────────────────
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [simNodes, setSimNodes]               = useState<CinemaNode[]>([]);
  const [simLinks, setSimLinks]               = useState<CinemaLink[]>([]);

  // ── Cinema state ─────────────────────────────────────────────────────────────
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [isPlaying, setIsPlaying]             = useState(false);
  const [transitionOpacity, setTransitionOpacity] = useState(0);
  const [sceneProgress, setSceneProgress]     = useState(0);
  const [socialMode, setSocialMode]           = useState(false);
  const [showPlaylist, setShowPlaylist]       = useState(false);
  const [showBandPicker, setShowBandPicker]   = useState(false);
  const [showWatermark, setShowWatermark]     = useState(true);
  const [simReady, setSimReady]               = useState(false);

  // ── Controls panel ────────────────────────────────────────────────────────────
  const [showControls, setShowControls]       = useState(false);
  const [cinemaControls, setCinemaControls]   = useState<CinemaControls>(DEFAULT_CINEMA_CONTROLS);
  const cinemaControlsRef = useRef<CinemaControls>(DEFAULT_CINEMA_CONTROLS);
  useEffect(() => { cinemaControlsRef.current = cinemaControls; }, [cinemaControls]);

  // ── Tour mode ─────────────────────────────────────────────────────────────────
  const [tourMode, setTourMode]               = useState(false);
  const [showTourPlanner, setShowTourPlanner] = useState(false);
  const [tourSteps, setTourSteps]             = useState<TourStep[]>([]);
  const [tourStepIdx, setTourStepIdx]         = useState(0);
  const tourStepsRef    = useRef<TourStep[]>([]);
  const tourStepIdxRef  = useRef(0);
  const tourOrbitRef    = useRef<OrbitCameraState | null>(null);
  useEffect(() => { tourStepsRef.current = tourSteps; }, [tourSteps]);
  useEffect(() => { tourStepIdxRef.current = tourStepIdx; }, [tourStepIdx]);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const fgRef           = useRef<any>(null);
  const adjRef          = useRef<Map<string, Set<string>>>(new Map());
  const orbitAnimRef    = useRef<OrbitAnim | null>(null);
  const sceneStateRef   = useRef<unknown>(null);
  const sceneStartRef   = useRef<number>(0);
  const currentIdxRef   = useRef(0);
  const isPlayingRef    = useRef(false);
  const tourModeRef     = useRef(false);
  const isTransRef      = useRef(false);
  const simNodesRef     = useRef<CinemaNode[]>([]);
  const labelMapRef     = useRef<Map<string, any>>(new Map());
  const labelShowRef    = useRef(DEFAULT_LABEL_SHOW);
  const labelFullRef    = useRef(DEFAULT_LABEL_FULL);
  const didFitRef       = useRef(false);
  const containerRef    = useRef<HTMLDivElement>(null);
  const lastMoveRef     = useRef(Date.now());
  const [cursorHidden, setCursorHidden] = useState(false);

  // Sync refs ↔ state
  useEffect(() => { isPlayingRef.current  = isPlaying; },  [isPlaying]);
  useEffect(() => { currentIdxRef.current = currentSceneIdx; }, [currentSceneIdx]);
  useEffect(() => { simNodesRef.current   = simNodes; },  [simNodes]);
  useEffect(() => { tourModeRef.current   = tourMode; },  [tourMode]);

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: scopes } = useQuery({ queryKey: ['cinema-scopes'], queryFn: fetchScopes });

  const { data: graphData, isFetching } = useQuery({
    queryKey: ['cinema-graph', selectedBandIds.join(',')],
    queryFn: () => fetchCinemaGraph(selectedBandIds),
  });

  // Build sim data whenever graph data changes
  useEffect(() => {
    if (!graphData) return;
    setSimReady(false);
    didFitRef.current = false;
    labelMapRef.current.clear();

    const nodes: CinemaNode[] = graphData.nodes.map(n => ({ ...n }));
    const nodeSet = new Set(nodes.map(n => n.id));
    const links: CinemaLink[] = graphData.edges
      .filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
      .map(e => ({ source: e.source, target: e.target, type: e.type, weight: e.weight }));

    setSimNodes(nodes);
    setSimLinks(links);
    adjRef.current = buildAdj(links);
  }, [graphData]);

  // ── Scene activation ──────────────────────────────────────────────────────────

  const activateScene = useCallback((idx: number) => {
    const scene = CINEMA_SCENES[idx];
    if (!scene || !fgRef.current) return;
    const fg    = fgRef.current;
    const nodes = simNodesRef.current;
    const adj   = adjRef.current;

    if (scene.arrangeMode === 'natural') {
      nodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });
      didFitRef.current = false;
      fg.d3ReheatSimulation?.();
    } else {
      const targets = computeArrangeTargets(nodes, scene.arrangeMode, adj);
      animateArrange(nodes, targets, fg);
    }

    sceneStateRef.current = scene.enter(fg, nodes, adj);
    sceneStartRef.current = performance.now();
    currentIdxRef.current = idx;
    setCurrentSceneIdx(idx);
    setSceneProgress(0);
  }, []);

  // ── Transition with fade ──────────────────────────────────────────────────────

  const transitionTo = useCallback((idx: number) => {
    if (isTransRef.current) return;
    isTransRef.current = true;
    setTransitionOpacity(1);
    setTimeout(() => {
      activateScene(idx);
      setTransitionOpacity(0);
      setTimeout(() => { isTransRef.current = false; }, TRANSITION_MS);
    }, TRANSITION_MS);
  }, [activateScene]);

  const advanceScene = useCallback(() => {
    const nextIdx = (currentIdxRef.current + 1) % CINEMA_SCENES.length;
    transitionTo(nextIdx);
  }, [transitionTo]);

  const retreatScene = useCallback(() => {
    const prevIdx = (currentIdxRef.current - 1 + CINEMA_SCENES.length) % CINEMA_SCENES.length;
    transitionTo(prevIdx);
  }, [transitionTo]);

  // ── Start/stop playback ───────────────────────────────────────────────────────

  const startPlayback = useCallback(() => {
    if (!simNodesRef.current.length) return;
    setIsPlaying(true);
    if (!tourModeRef.current) {
      if (sceneStartRef.current === 0) activateScene(0);
      else sceneStartRef.current = performance.now();
    }
  }, [activateScene]);

  // ── Tour helpers ──────────────────────────────────────────────────────────────

  const startTour = useCallback(() => {
    const steps = tourStepsRef.current;
    if (!steps.length) return;
    setTourStepIdx(0);
    tourStepIdxRef.current = 0;
    tourOrbitRef.current = null;
    setIsPlaying(true);
  }, []);

  const stopTour = useCallback(() => {
    setIsPlaying(false);
    tourOrbitRef.current = null;
  }, []);

  // ── Scene timer (scene mode only) ─────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying || tourMode) return;
    const interval = setInterval(() => {
      if (isTransRef.current) return;
      const scene = CINEMA_SCENES[currentIdxRef.current];
      if (!scene) return;
      const elapsed  = performance.now() - sceneStartRef.current;
      const progress = Math.min(1, elapsed / (scene.durationMs / cinemaControlsRef.current.speedMultiplier));
      setSceneProgress(progress);
      if (progress >= 1) advanceScene();
    }, 120);
    return () => clearInterval(interval);
  }, [isPlaying, tourMode, advanceScene]);

  // ── rAF loop ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!simNodes.length) return;
    let rafId: number;

    const tick = () => {
      const fg = fgRef.current;
      if (fg) {
        const ctrl   = fg.controls?.();
        const camera = fg.camera?.();

        // Hand camera authority to cinema code while playing
        if (ctrl) ctrl.enabled = !isPlayingRef.current;

        if (isPlayingRef.current && camera && ctrl) {
          const elapsed  = performance.now() - sceneStartRef.current;
          const controls = cinemaControlsRef.current;

          if (tourModeRef.current) {
            // ── Tour mode: orbit each step's node in sequence ──
            const steps   = tourStepsRef.current;
            const stepIdx = tourStepIdxRef.current;
            const step    = steps[stepIdx];

            if (step) {
              const node = simNodesRef.current.find(n => n.id === step.nodeId);
              if (node && node.x != null) {
                // Init orbit state on first frame of this step
                if (!tourOrbitRef.current) {
                  tourOrbitRef.current = initOrbitState(
                    node.x, node.y ?? 0, node.z ?? 0,
                    camera.position.x, camera.position.y, camera.position.z,
                    elapsed,
                    Math.round(step.dwellMs / controls.speedMultiplier),
                  );
                }
                const result = updateOrbitCamera(fg, tourOrbitRef.current, elapsed, controls);
                if (result === 'done') {
                  const nextIdx = stepIdx + 1;
                  if (nextIdx >= steps.length) {
                    // Tour finished
                    setIsPlaying(false);
                    tourOrbitRef.current = null;
                  } else {
                    setTourStepIdx(nextIdx);
                    tourStepIdxRef.current = nextIdx;
                    tourOrbitRef.current = null;
                  }
                }
              }
            }
          } else {
            // ── Scene mode ──
            const scene = CINEMA_SCENES[currentIdxRef.current];
            scene?.tick?.(fg, simNodesRef.current, adjRef.current, elapsed, sceneStateRef.current, controls);
          }
        }

        // Pause-mode orbit pivot animation
        const oa = orbitAnimRef.current;
        if (oa && ctrl && !isPlayingRef.current) {
          const raw = Math.min(1, (performance.now() - oa.t0) / oa.dur);
          const et  = easeInOutQuad(raw);
          ctrl.target.x = oa.sx + (oa.tx - oa.sx) * et;
          ctrl.target.y = oa.sy + (oa.ty - oa.sy) * et;
          ctrl.target.z = oa.sz + (oa.tz - oa.sz) * et;
          if (raw >= 1) orbitAnimRef.current = null;
        }

        // Proximity label opacity
        if (camera) {
          const cx       = camera.position.x;
          const cy       = camera.position.y;
          const cz       = camera.position.z;
          const showDist = labelShowRef.current;
          const fullDist = labelFullRef.current;

          for (const n of simNodes) {
            const sprite = labelMapRef.current.get(n.id);
            if (!sprite) continue;
            if (n.x == null) { sprite.visible = false; continue; }
            const dx   = (n.x ?? 0) - cx;
            const dy   = (n.y ?? 0) - cy;
            const dz   = (n.z ?? 0) - cz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist >= showDist) {
              sprite.visible = false;
            } else {
              sprite.visible = true;
              const range   = Math.max(1, showDist - fullDist);
              const opacity = Math.max(0, Math.min(1, 1 - (dist - fullDist) / range));
              const a = Math.round(opacity * 255).toString(16).padStart(2, '0');
              sprite.color = `#e2e8f0${a}`;
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [simNodes]);

  // ── Cursor auto-hide (social mode) ───────────────────────────────────────────

  useEffect(() => {
    if (!socialMode) { setCursorHidden(false); return; }
    const onMove = () => { lastMoveRef.current = Date.now(); setCursorHidden(false); };
    window.addEventListener('mousemove', onMove);
    const interval = setInterval(() => {
      if (Date.now() - lastMoveRef.current > 3000) setCursorHidden(true);
    }, 500);
    return () => { window.removeEventListener('mousemove', onMove); clearInterval(interval); };
  }, [socialMode]);

  // ── Social mode fullscreen ────────────────────────────────────────────────────

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
    const onFsChange = () => {
      if (!document.fullscreenElement) setSocialMode(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        if (isPlayingRef.current) {
          if (tourModeRef.current) stopTour();
          else setIsPlaying(false);
        } else {
          if (tourModeRef.current) startTour();
          else startPlayback();
        }
      }
      if (!tourModeRef.current) {
        if (e.key === 'ArrowRight' || e.key === 'l') advanceScene();
        if (e.key === 'ArrowLeft'  || e.key === 'j') retreatScene();
      }
      if (e.key === 'f' || e.key === 'F') toggleSocialMode();
      if (e.key === 'Escape' && socialMode) setSocialMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startPlayback, startTour, stopTour, advanceScene, retreatScene, toggleSocialMode, socialMode]);

  // ── ForceGraph3D callbacks ────────────────────────────────────────────────────

  const nodeColor = useCallback((node: object) => {
    return TYPE_COLOR[(node as CinemaNode).type] ?? '#4b5563';
  }, []);

  const nodeVal = useCallback((node: object) => nodeValFor((node as CinemaNode).type), []);

  const nodeThreeObject = useCallback((node: object) => {
    const n      = node as CinemaNode;
    const sprite = new SpriteText(n.label);
    sprite.color = '#e2e8f000';
    sprite.textHeight = n.type === 'artist' ? 5 : n.type === 'keyword' ? 4 : 3.5;
    sprite.fontWeight = '600';
    sprite.backgroundColor = 'rgba(3,7,18,0.7)';
    sprite.padding = 1.5;
    sprite.borderRadius = 2;
    const s = sprite as any;
    const r = sphereR(nodeValFor(n.type));
    s.position.y = r + sprite.textHeight * 0.6 + 3;
    s.visible = false;
    labelMapRef.current.set(n.id, sprite);
    return sprite;
  }, []);

  const linkColor = useCallback(() => 'rgba(100,116,139,0.25)', []);
  const linkWidth = useCallback(() => 0.4, []);

  const onEngineStop = useCallback(() => {
    simNodes.forEach(n => {
      if (n.x != null) { n.fx = n.x; n.fy = n.y; n.fz = n.z; }
    });
    if (!didFitRef.current) {
      didFitRef.current = true;
      fgRef.current?.zoomToFit(800, 80);
    }
    setSimReady(true);
  }, [simNodes]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const currentScene = CINEMA_SCENES[currentSceneIdx];
  const isLoading    = isFetching || !simReady;

  function updateControl<K extends keyof CinemaControls>(key: K, val: CinemaControls[K]) {
    setCinemaControls(prev => ({ ...prev, [key]: val }));
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gray-950 overflow-hidden"
      style={{ height: '100dvh', cursor: cursorHidden ? 'none' : 'default' }}
    >
      {/* 3D graph */}
      {simNodes.length > 0 && (
        <ForceGraph3D
          ref={fgRef}
          graphData={{ nodes: simNodes as object[], links: simLinks as object[] }}
          nodeId="id"
          nodeLabel=""
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeRelSize={BASE_NODE_REL}
          nodeOpacity={0.92}
          nodeResolution={8}
          nodeThreeObjectExtend
          nodeThreeObject={nodeThreeObject}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkOpacity={0.4}
          backgroundColor="#030712"
          showNavInfo={false}
          warmupTicks={80}
          cooldownTicks={120}
          d3VelocityDecay={0.4}
          onEngineStop={onEngineStop}
          width={window.innerWidth}
          height={window.innerHeight}
        />
      )}

      {/* Fade overlay */}
      <div
        className="pointer-events-none absolute inset-0 bg-black z-50"
        style={{ opacity: transitionOpacity, transition: `opacity ${TRANSITION_MS}ms ease` }}
      />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-40 pointer-events-none">
          <div className="text-gray-600 text-sm tracking-widest uppercase">
            {isFetching ? 'Loading graph data…' : 'Initialising 3D graph…'}
          </div>
        </div>
      )}

      {/* Empty */}
      {!isFetching && simNodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-30 gap-4">
          <p className="text-gray-500 text-sm">No graph data available.</p>
          <p className="text-gray-600 text-xs">Add bands and songs in the Library, then return here.</p>
        </div>
      )}

      {/* ══ UI CHROME ═══════════════════════════════════════════════════════════ */}
      {!socialMode && (
        <>
          {/* Top-left: logo */}
          <div className="absolute top-4 left-5 z-30">
            <Link to="/landing" className="text-xs font-bold text-gray-600 hover:text-gray-400 tracking-wide transition-colors">
              Band Spectrum Mapper
            </Link>
          </div>

          {/* Top-center: scene name (scene mode only) */}
          {isPlaying && !tourMode && currentScene && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 text-center pointer-events-none">
              <div className="text-xl">{currentScene.emoji}</div>
              <div className="text-sm font-semibold text-white/80 mt-0.5">{currentScene.name}</div>
              <div className="text-xs text-gray-600 mt-0.5 max-w-[220px]">{currentScene.description}</div>
            </div>
          )}

          {/* Top-center: tour step label */}
          {isPlaying && tourMode && tourSteps[tourStepIdx] && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 text-center pointer-events-none">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Tour</div>
              <div className="text-sm font-semibold text-white/80 mt-0.5">{tourSteps[tourStepIdx]?.nodeLabel}</div>
              <div className="text-xs text-gray-600 mt-0.5">{tourStepIdx + 1} / {tourSteps.length}</div>
            </div>
          )}

          {/* Top-right: buttons */}
          <div className="absolute top-4 right-4 z-30 flex gap-2">
            <button
              onClick={() => { setShowBandPicker(v => !v); setShowPlaylist(false); setShowControls(false); setShowTourPlanner(false); }}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              Bands{selectedBandIds.length > 0 ? ` (${selectedBandIds.length})` : ''}
            </button>
            <button
              onClick={() => { setShowControls(v => !v); setShowBandPicker(false); setShowPlaylist(false); setShowTourPlanner(false); }}
              title="Camera controls"
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
              title="Social Mode — fullscreen (F)"
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
                  selectedBandIds.length === 0
                    ? 'bg-indigo-900/60 text-indigo-300'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                All bands
              </button>
              {scopes.bands.map(b => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBandIds(prev =>
                    prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                  )}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                    selectedBandIds.includes(b.id)
                      ? 'bg-indigo-900/60 text-indigo-300'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {/* ── Controls panel ── */}
          {showControls && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur-sm w-64 shadow-2xl space-y-3">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Camera Controls</div>

              {/* Orbit speed */}
              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Orbit speed</span>
                  <span>{cinemaControls.orbitSpeed.toFixed(1)}×</span>
                </div>
                <input type="range" min="0.1" max="5" step="0.1"
                  value={cinemaControls.orbitSpeed}
                  onChange={e => updateControl('orbitSpeed', Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </label>

              {/* Approach dist */}
              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Approach dist</span>
                  <span>{cinemaControls.approachDist}</span>
                </div>
                <input type="range" min="30" max="400" step="5"
                  value={cinemaControls.approachDist}
                  onChange={e => updateControl('approachDist', Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </label>

              {/* Elevation */}
              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Elevation</span>
                  <span>{cinemaControls.elevationOffset}</span>
                </div>
                <input type="range" min="-100" max="300" step="5"
                  value={cinemaControls.elevationOffset}
                  onChange={e => updateControl('elevationOffset', Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </label>

              {/* Speed multiplier */}
              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Playback speed</span>
                  <span>{cinemaControls.speedMultiplier.toFixed(1)}×</span>
                </div>
                <input type="range" min="0.25" max="4" step="0.25"
                  value={cinemaControls.speedMultiplier}
                  onChange={e => updateControl('speedMultiplier', Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </label>

              <button
                onClick={() => setCinemaControls(DEFAULT_CINEMA_CONTROLS)}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </>
      )}

      {/* ══ PLAYBACK CONTROLS ════════════════════════════════════════════════════ */}
      {!socialMode && (
        <div className="absolute bottom-0 left-0 right-0 z-30">
          {/* Progress bar */}
          <div className="mx-auto px-4 pb-0 pt-2 max-w-2xl">
            <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500/60 rounded-full transition-all duration-100"
                style={{ width: `${sceneProgress * 100}%` }}
              />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between px-4 py-3 gap-3 bg-gradient-to-t from-gray-950/90 to-transparent backdrop-blur-sm">
            {/* Left: scene/tour selector */}
            <div className="flex items-center gap-2">
              {/* Mode toggle */}
              <div className="flex bg-gray-800/60 rounded-lg p-0.5 text-[10px]">
                <button
                  onClick={() => setTourMode(false)}
                  className={`px-2 py-1 rounded transition-colors ${!tourMode ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Scenes
                </button>
                <button
                  onClick={() => setTourMode(true)}
                  className={`px-2 py-1 rounded transition-colors ${tourMode ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Tour
                </button>
              </div>

              {!tourMode && (
                <button
                  onClick={() => { setShowPlaylist(v => !v); setShowBandPicker(false); setShowControls(false); setShowTourPlanner(false); }}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5"
                >
                  <span>{currentScene?.emoji ?? '🎬'}</span>
                  <span className="hidden sm:inline text-gray-400">{currentScene?.name ?? 'Cinema Mode'}</span>
                  <span className="text-gray-600">▾</span>
                </button>
              )}

              {tourMode && (
                <button
                  onClick={() => { setShowTourPlanner(v => !v); setShowPlaylist(false); setShowBandPicker(false); setShowControls(false); }}
                  className={`text-xs transition-colors flex items-center gap-1.5 ${showTourPlanner ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <span>📋</span>
                  <span className="hidden sm:inline">{tourSteps.length ? `${tourSteps.length} steps` : 'Plan tour'}</span>
                  <span className="text-gray-600">▾</span>
                </button>
              )}
            </div>

            {/* Center: transport */}
            <div className="flex items-center gap-3">
              {!tourMode && (
                <button onClick={retreatScene} className="text-gray-500 hover:text-white transition-colors text-lg" title="Previous scene (J / ←)">
                  ⏮
                </button>
              )}
              <button
                onClick={() => {
                  if (isPlaying) {
                    if (tourMode) stopTour();
                    else setIsPlaying(false);
                  } else {
                    if (tourMode) startTour();
                    else startPlayback();
                  }
                }}
                disabled={!simReady || (tourMode && tourSteps.length === 0)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors ${
                  simReady && (!tourMode || tourSteps.length > 0)
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'bg-white/5 text-gray-700 cursor-not-allowed'
                }`}
                title="Play / Pause (Space)"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              {!tourMode && (
                <button onClick={advanceScene} className="text-gray-500 hover:text-white transition-colors text-lg" title="Next scene (L / →)">
                  ⏭
                </button>
              )}
            </div>

            {/* Right */}
            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[10px] text-gray-700">Space · F · ⚙</span>
              <button onClick={toggleSocialMode} title="Social Mode (F)" className="text-xs text-gray-600 hover:text-gray-300 transition-colors">
                🎬
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scene playlist popup ── */}
      {showPlaylist && !socialMode && !tourMode && (
        <div className="absolute bottom-20 left-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-2 backdrop-blur-sm w-64 shadow-2xl">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-2 pb-1">Scenes</div>
          {CINEMA_SCENES.map((scene, idx) => (
            <button
              key={scene.id}
              onClick={() => { transitionTo(idx); setShowPlaylist(false); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                idx === currentSceneIdx
                  ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/40'
                  : 'hover:bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <span>{scene.emoji}</span>
              <div>
                <div className="font-semibold">{scene.name}</div>
                <div className="text-[10px] text-gray-600 mt-0.5">{Math.round(scene.durationMs / 1000)}s</div>
              </div>
              {idx === currentSceneIdx && isPlaying && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Tour planner popup ── */}
      {showTourPlanner && !socialMode && tourMode && (
        <div className="absolute bottom-20 left-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-3 backdrop-blur-sm w-72 shadow-2xl"
          style={{ maxHeight: 'calc(100dvh - 140px)' }}
        >
          <TourPlanner
            nodes={simNodes}
            steps={tourSteps}
            isPlaying={isPlaying && tourMode}
            currentStepIdx={tourStepIdx}
            onAddStep={step => setTourSteps(prev => [...prev, step])}
            onRemoveStep={id => setTourSteps(prev => prev.filter(s => s.id !== id))}
            onDwellChange={(id, ms) => setTourSteps(prev => prev.map(s => s.id === id ? { ...s, dwellMs: ms } : s))}
            onPlay={startTour}
            onStop={stopTour}
            onClear={() => { setTourSteps([]); setIsPlaying(false); }}
          />
        </div>
      )}

      {/* ══ SOCIAL MODE ══════════════════════════════════════════════════════════ */}
      {socialMode && (
        <>
          {showWatermark && (
            <div className="absolute bottom-6 right-6 z-30 pointer-events-none">
              <div className="text-xs text-white/20 text-right">
                <div className="font-semibold tracking-wide">Band Spectrum Mapper</div>
                {currentScene && !tourMode && <div className="text-[10px] mt-0.5">{currentScene.emoji} {currentScene.name}</div>}
                {tourMode && tourSteps[tourStepIdx] && (
                  <div className="text-[10px] mt-0.5">Tour · {tourSteps[tourStepIdx]?.nodeLabel}</div>
                )}
              </div>
            </div>
          )}

          {!cursorHidden && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
              {!tourMode && <button onClick={retreatScene} className="text-gray-400 hover:text-white text-base">⏮</button>}
              <button
                onClick={() => {
                  if (isPlaying) { if (tourMode) stopTour(); else setIsPlaying(false); }
                  else           { if (tourMode) startTour(); else startPlayback(); }
                }}
                className="text-white text-base"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              {!tourMode && <button onClick={advanceScene} className="text-gray-400 hover:text-white text-base">⏭</button>}
              <div className="w-px h-4 bg-gray-700 mx-1" />
              <button onClick={() => setShowWatermark(v => !v)} className="text-[10px] text-gray-500 hover:text-gray-300">
                {showWatermark ? 'Hide mark' : 'Show mark'}
              </button>
              <button onClick={toggleSocialMode} className="text-[10px] text-gray-500 hover:text-gray-300">
                Exit
              </button>
            </div>
          )}
        </>
      )}

      {/* Safe-zone guide */}
      {socialMode && (
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.04)' }}
        />
      )}
    </div>
  );
}

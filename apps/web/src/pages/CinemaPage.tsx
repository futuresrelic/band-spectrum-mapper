/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CinemaPage — cinematic autoplay showcase for the Band Spectrum Mapper.
 *
 * Features:
 *  - 8 named scenes with continuous camera motion (all call camera.lookAt)
 *  - Orbit-to-node camera with smooth fly-in (look-at lerped, no rotation snap)
 *  - Smooth fade-to-black scene transitions
 *  - Play / Pause / Prev / Next + scene selector
 *  - ⚙ Camera controls: orbit mode, speed, approach dist, elevation, playback speed
 *  - ⚙ Node type visibility toggles (hide/show tags, themes, keywords, etc.)
 *  - Tour/Script mode: user-authored node-by-node camera sequence
 *    → active node turns bright white; edges to tour nodes highlight indigo
 *  - Social Mode: fullscreen, watermark, cursor auto-hide
 *  - Band filter
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { CINEMA_THEMES, getTheme, DEFAULT_THEME_ID, type CinemaTheme } from '../cinema/themes';
import TourPlanner from '../cinema/TourPlanner';

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  song: '#6366f1', keyword: '#374151',
  album: '#8b5cf6', artist: '#f59e0b',
  theme: '#10b981', tag: '#06b6d4', emotion: '#ec4899',
};
const TYPE_LABELS: Record<string, string> = {
  artist: '🎸 Artist', album: '💿 Album', song: '🎵 Song',
  keyword: '🔑 Keyword', theme: '🌿 Theme', tag: '🏷 Tag', emotion: '💜 Emotion',
};
const TYPE_ICONS: Record<string, string> = {
  artist: '🎸', album: '💿', song: '🎵',
  keyword: '🔑', theme: '🌿', tag: '🏷', emotion: '💜',
};
const ALL_TYPES = ['artist', 'album', 'song', 'keyword', 'theme', 'tag', 'emotion'];

const HIGHLIGHT_COLOR = '#ffffff';

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

const TRANSITION_MS      = 700;
const DEFAULT_LABEL_DISTANCES = { artist: 650, album: 420, song: 280, other: 180 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function blendHex(from: string, to: string, t: number): string {
  if (!from.startsWith('#') || from.length < 7) return t > 0.5 ? to : from;
  const r0 = parseInt(from.slice(1,3),16), g0 = parseInt(from.slice(3,5),16), b0 = parseInt(from.slice(5,7),16);
  const r1 = parseInt(to.slice(1,3),16),   g1 = parseInt(to.slice(3,5),16),   b1 = parseInt(to.slice(5,7),16);
  const r  = Math.round(r0+(r1-r0)*t), g = Math.round(g0+(g1-g0)*t), b = Math.round(b0+(b1-b0)*t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ── Pause-mode orbit pivot ────────────────────────────────────────────────────

interface OrbitAnim {
  sx: number; sy: number; sz: number;
  tx: number; ty: number; tz: number;
  t0: number; dur: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

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
  const [selectedNode, setSelectedNode]       = useState<CinemaNode | null>(null);
  const [simNodes, setSimNodes]               = useState<CinemaNode[]>([]);
  const [simLinks, setSimLinks]               = useState<CinemaLink[]>([]);

  // ── Cinema state ─────────────────────────────────────────────────────────────
  const [currentSceneIdx, setCurrentSceneIdx]     = useState(0);
  const [isPlaying, setIsPlaying]                 = useState(false);
  const [transitionOpacity, setTransitionOpacity] = useState(0);
  const [sceneProgress, setSceneProgress]         = useState(0);
  const [socialMode, setSocialMode]               = useState(false);
  const [showPlaylist, setShowPlaylist]           = useState(false);
  const [showBandPicker, setShowBandPicker]       = useState(false);
  const [showWatermark, setShowWatermark]         = useState(true);
  const [simReady, setSimReady]                   = useState(false);

  // ── Visual theme ─────────────────────────────────────────────────────────────
  const [selectedThemeId, setSelectedThemeId] = useState(DEFAULT_THEME_ID);
  const currentTheme  = useMemo(() => getTheme(selectedThemeId), [selectedThemeId]);
  const currentThemeRef = useRef<CinemaTheme>(getTheme(DEFAULT_THEME_ID));
  useEffect(() => { currentThemeRef.current = currentTheme; }, [currentTheme]);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const [showControls, setShowControls]     = useState(false);
  const [cinemaControls, setCinemaControls] = useState<CinemaControls>(DEFAULT_CINEMA_CONTROLS);
  const cinemaControlsRef = useRef<CinemaControls>(DEFAULT_CINEMA_CONTROLS);
  useEffect(() => { cinemaControlsRef.current = cinemaControls; }, [cinemaControls]);

  const [labelDistances, setLabelDistances] = useState(DEFAULT_LABEL_DISTANCES);
  useEffect(() => { labelDistancesRef.current = labelDistances; }, [labelDistances]);

  // Hidden node types (show/hide in graph)
  const [hiddenTypes, setHiddenTypes]   = useState<Set<string>>(new Set());
  const hiddenTypesRef                  = useRef<Set<string>>(new Set());
  useEffect(() => { hiddenTypesRef.current = hiddenTypes; }, [hiddenTypes]);

  // ── Lyrics overlay ───────────────────────────────────────────────────────────
  const [showLyrics, setShowLyrics]         = useState(true);
  const showLyricsRef                       = useRef(true);
  useEffect(() => { showLyricsRef.current = showLyrics; }, [showLyrics]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lyricsSpritesRef                    = useRef<any[]>([]);
  const lyricsDataCacheRef                  = useRef<Record<string, string[]> | null>(null);

  // Lyrics visibility distance (same family as label show distances)
  const [lyricsShowDist, setLyricsShowDist] = useState(200);
  const lyricsShowDistRef                   = useRef(200);
  useEffect(() => { lyricsShowDistRef.current = lyricsShowDist; }, [lyricsShowDist]);

  // Lyrics scroll-window mode
  const [lyricsScrollMode, setLyricsScrollMode]   = useState(false);
  const [lyricsWindowSize, setLyricsWindowSize]   = useState(4);
  const [lyricsScrollSpeed, setLyricsScrollSpeed] = useState(3);
  const lyricsScrollModeRef  = useRef(false);
  const lyricsWindowSizeRef  = useRef(4);
  const lyricsScrollSpeedRef = useRef(3);
  useEffect(() => { lyricsScrollModeRef.current  = lyricsScrollMode;  }, [lyricsScrollMode]);
  useEffect(() => { lyricsWindowSizeRef.current  = lyricsWindowSize;  }, [lyricsWindowSize]);
  useEffect(() => { lyricsScrollSpeedRef.current = lyricsScrollSpeed; }, [lyricsScrollSpeed]);

  // Per-song scroll state (populated when sprites are created)
  const lyricsScrollOffsetRef = useRef<Map<string, number>>(new Map());
  const lyricsTotalLinesRef   = useRef<Map<string, number>>(new Map());
  const lyricsScrollLastRef   = useRef(0);

  // Label styling
  const [labelShowBg, setLabelShowBg]           = useState(true);
  const [labelBgOpacity, setLabelBgOpacity]     = useState(0.7);
  const [labelTextColor, setLabelTextColor]     = useState('#e2e8f0');
  const [labelAlwaysOnTop, setLabelAlwaysOnTop] = useState(false);
  const labelShowBgRef      = useRef(true);
  const labelBgOpacityRef   = useRef(0.7);
  const labelTextColorRef   = useRef('#e2e8f0');
  const labelAlwaysOnTopRef = useRef(false);

  // Selection dim strength (0 = keep theme colour, 1 = fully dark)
  const [selectionDim, setSelectionDim] = useState(1.0);
  const selectionDimRef = useRef(1.0);

  // AI Director
  const [showAiDirector, setShowAiDirector]   = useState(false);
  const [aiPromptInput, setAiPromptInput]     = useState('');
  const [isAiThinking, setIsAiThinking]       = useState(false);
  const [aiLastResult, setAiLastResult]       = useState<string | null>(null);

  // ── Tour mode ─────────────────────────────────────────────────────────────────
  const [tourMode, setTourMode]               = useState(false);
  const [showTourPlanner, setShowTourPlanner] = useState(false);
  const [tourSteps, setTourSteps]             = useState<TourStep[]>([]);
  const [tourStepIdx, setTourStepIdx]         = useState(0);

  // Highlighted node — current tour stop; turns white + oversized
  const [tourHighlightedId, setTourHighlightedId] = useState<string | null>(null);
  const tourHighlightedIdRef = useRef<string | null>(null);

  const tourStepsRef    = useRef<TourStep[]>([]);
  const tourStepIdxRef  = useRef(0);
  const tourOrbitRef    = useRef<OrbitCameraState | null>(null);
  // Previous orbit target — used to smoothly lerp look-at during fly-in
  const tourPrevTargetRef = useRef<{ x: number; y: number; z: number } | null>(null);

  useEffect(() => { tourStepsRef.current   = tourSteps;   }, [tourSteps]);
  useEffect(() => { tourStepIdxRef.current = tourStepIdx; }, [tourStepIdx]);

  // Clear highlight when leaving tour mode
  useEffect(() => {
    if (!tourMode) {
      tourHighlightedIdRef.current = null;
      setTourHighlightedId(null);
    }
  }, [tourMode]);

  // Stable highlight setter (deduped — only calls setState when value changes)
  const applyHighlightRef = useRef((id: string | null) => {
    if (id !== tourHighlightedIdRef.current) {
      tourHighlightedIdRef.current = id;
      setTourHighlightedId(id);
    }
  });

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const fgRef           = useRef<any>(null);
  const selectedNodeRef = useRef<CinemaNode | null>(null);
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
  const labelDistancesRef = useRef(DEFAULT_LABEL_DISTANCES);
  const didFitRef       = useRef(false);
  const containerRef    = useRef<HTMLDivElement>(null);
  const lastMoveRef     = useRef(Date.now());
  const [cursorHidden, setCursorHidden] = useState(false);

  // Sync refs ↔ state
  useEffect(() => { isPlayingRef.current  = isPlaying;       }, [isPlaying]);
  useEffect(() => { currentIdxRef.current = currentSceneIdx; }, [currentSceneIdx]);
  useEffect(() => { simNodesRef.current   = simNodes;        }, [simNodes]);
  useEffect(() => { tourModeRef.current   = tourMode;        }, [tourMode]);

  useEffect(() => { labelShowBgRef.current      = labelShowBg;      }, [labelShowBg]);
  useEffect(() => { labelBgOpacityRef.current   = labelBgOpacity;   }, [labelBgOpacity]);
  useEffect(() => { labelTextColorRef.current   = labelTextColor;   }, [labelTextColor]);
  useEffect(() => { labelAlwaysOnTopRef.current = labelAlwaysOnTop; }, [labelAlwaysOnTop]);
  useEffect(() => {
    selectionDimRef.current = selectionDim;
    if (selectedNodeRef.current) fgRef.current?.refresh();
  }, [selectionDim]);

  // ── Derived: tour node IDs + visible graph data ───────────────────────────────

  const tourNodeIds = useMemo(() => new Set(tourSteps.map(s => s.nodeId)), [tourSteps]);

  // Filter out hidden node types without re-fetching graph data
  const visibleGraphData = useMemo(() => {
    if (hiddenTypes.size === 0) {
      return { nodes: simNodes as object[], links: simLinks as object[] };
    }
    const visSet = new Set(simNodes.filter(n => !hiddenTypes.has(n.type)).map(n => n.id));
    const visNodes = simNodes.filter(n => visSet.has(n.id)) as object[];
    const visLinks = simLinks.filter(l => {
      const srcId = typeof l.source === 'string' ? l.source : (l.source as CinemaNode).id;
      const tgtId = typeof l.target === 'string' ? l.target : (l.target as CinemaNode).id;
      return visSet.has(srcId) && visSet.has(tgtId);
    }) as object[];
    return { nodes: visNodes, links: visLinks };
  }, [simNodes, simLinks, hiddenTypes]);

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: scopes } = useQuery({ queryKey: ['cinema-scopes'], queryFn: fetchScopes });

  const { data: graphData, isFetching } = useQuery({
    queryKey: ['cinema-graph', selectedBandIds.join(',')],
    queryFn: () => fetchCinemaGraph(selectedBandIds),
  });

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

    const visNodes = nodes.filter(n => !hiddenTypesRef.current.has(n.type));
    if (scene.arrangeMode === 'natural') {
      visNodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });
      didFitRef.current = false;
      fg.d3ReheatSimulation?.();
    } else {
      animateArrange(visNodes, computeArrangeTargets(visNodes, scene.arrangeMode, adj), fg);
    }

    sceneStateRef.current = scene.enter(fg, nodes, adj);
    sceneStartRef.current = performance.now();
    currentIdxRef.current = idx;
    setCurrentSceneIdx(idx);
    setSceneProgress(0);
  }, []);

  // ── Transitions ───────────────────────────────────────────────────────────────

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
    transitionTo((currentIdxRef.current + 1) % CINEMA_SCENES.length);
  }, [transitionTo]);

  const retreatScene = useCallback(() => {
    transitionTo((currentIdxRef.current - 1 + CINEMA_SCENES.length) % CINEMA_SCENES.length);
  }, [transitionTo]);

  // ── Playback ──────────────────────────────────────────────────────────────────

  const startPlayback = useCallback(() => {
    if (!simNodesRef.current.length) return;
    setIsPlaying(true);
    if (!tourModeRef.current) {
      if (sceneStartRef.current === 0) activateScene(0);
      else sceneStartRef.current = performance.now();
    }
  }, [activateScene]);

  const startTour = useCallback(() => {
    const steps = tourStepsRef.current;
    if (!steps.length) return;
    // Capture current camera look-at so the first fly-in rotates from here
    const ctrl = fgRef.current?.controls?.();
    tourPrevTargetRef.current = ctrl
      ? { x: ctrl.target.x, y: ctrl.target.y, z: ctrl.target.z }
      : { x: 0, y: 0, z: 0 };
    setTourStepIdx(0);
    tourStepIdxRef.current  = 0;
    tourOrbitRef.current    = null;
    applyHighlightRef.current(steps[0]?.nodeId ?? null);
    setIsPlaying(true);
  }, []);

  const stopTour = useCallback(() => {
    setIsPlaying(false);
    tourOrbitRef.current = null;
    applyHighlightRef.current(null);
  }, []);

  // ── Scene timer ───────────────────────────────────────────────────────────────

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

        if (ctrl) ctrl.enabled = !isPlayingRef.current;

        if (isPlayingRef.current && camera && ctrl) {
          const elapsed  = performance.now() - sceneStartRef.current;
          const controls = cinemaControlsRef.current;

          if (tourModeRef.current) {
            const steps   = tourStepsRef.current;
            const stepIdx = tourStepIdxRef.current;
            const step    = steps[stepIdx];

            if (step) {
              const node = simNodesRef.current.find(n => n.id === step.nodeId);
              if (node && node.x != null) {
                if (!tourOrbitRef.current) {
                  const prevLookAt = tourPrevTargetRef.current ?? { x: 0, y: 0, z: 0 };
                  const dwellMs    = Math.round(step.dwellMs / controls.speedMultiplier);
                  tourOrbitRef.current = initOrbitState(
                    node.x, node.y ?? 0, node.z ?? 0,
                    camera.position.x, camera.position.y, camera.position.z,
                    elapsed, dwellMs,
                    prevLookAt.x, prevLookAt.y, prevLookAt.z,
                  );
                  applyHighlightRef.current(step.nodeId);
                }

                const result = updateOrbitCamera(fg, tourOrbitRef.current, elapsed, controls);
                if (result === 'done') {
                  // Store the departing node's position for the next fly-in's look-at lerp
                  tourPrevTargetRef.current = {
                    x: tourOrbitRef.current.targetX,
                    y: tourOrbitRef.current.targetY,
                    z: tourOrbitRef.current.targetZ,
                  };
                  tourOrbitRef.current = null;

                  const nextIdx = stepIdx + 1;
                  if (nextIdx >= steps.length) {
                    setIsPlaying(false);
                    applyHighlightRef.current(null);
                  } else {
                    setTourStepIdx(nextIdx);
                    tourStepIdxRef.current = nextIdx;
                    // Highlight next node now so viewer sees where camera is heading
                    applyHighlightRef.current(steps[nextIdx]?.nodeId ?? null);
                  }
                }
              }
            }
          } else {
            const scene = CINEMA_SCENES[currentIdxRef.current];
            scene?.tick?.(fg, simNodesRef.current, adjRef.current, elapsed, sceneStateRef.current, controls);
          }
        }

        // Pause-mode orbit pivot
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
          const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
          const ld = labelDistancesRef.current;
          for (const n of simNodesRef.current) {
            const sprite = labelMapRef.current.get(n.id);
            if (!sprite) continue;
            // Hide labels for hidden node types
            if (hiddenTypesRef.current.has(n.type)) { sprite.visible = false; continue; }
            if (n.x == null) { sprite.visible = false; continue; }
            const dx = (n.x ?? 0) - cx, dy = (n.y ?? 0) - cy, dz = (n.z ?? 0) - cz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const showDist = n.type === 'artist' ? ld.artist
              : n.type === 'album' ? ld.album
              : n.type === 'song' ? ld.song : ld.other;
            const fullDist = Math.round(showDist * 0.32);
            if (dist >= showDist) {
              sprite.visible = false;
            } else {
              sprite.visible = true;
              const range   = Math.max(1, showDist - fullDist);
              const opacity = Math.max(0, Math.min(1, 1 - (dist - fullDist) / range));
              const a = Math.round(opacity * 255).toString(16).padStart(2, '0');
              sprite.color = `${labelTextColorRef.current}${a}`;
              (sprite as any).backgroundColor = labelShowBgRef.current
                ? `rgba(3,7,18,${(labelBgOpacityRef.current * opacity).toFixed(2)})`
                : false;
              const mat = (sprite as any).material;
              if (mat) mat.depthTest = !labelAlwaysOnTopRef.current;
            }
          }

          // Lyrics sprite: distance culling + scroll-window auto-advance
          if (lyricsSpritesRef.current.length > 0) {
            const lyricDistSq = lyricsShowDistRef.current ** 2;
            const scrollMode  = lyricsScrollModeRef.current;
            const winSize     = lyricsWindowSizeRef.current;
            const now         = performance.now();
            if (scrollMode && now - lyricsScrollLastRef.current > lyricsScrollSpeedRef.current * 1000) {
              lyricsScrollLastRef.current = now;
              lyricsTotalLinesRef.current.forEach((total, songId) => {
                const cur = lyricsScrollOffsetRef.current.get(songId) ?? 0;
                lyricsScrollOffsetRef.current.set(songId, (cur + 1) % Math.max(1, total));
              });
            }
            for (const sp of lyricsSpritesRef.current) {
              const pos = sp.position;
              if (!pos) { sp.visible = false; continue; }
              const ldx = pos.x - cx, ldy = pos.y - cy, ldz = pos.z - cz;
              if (ldx * ldx + ldy * ldy + ldz * ldz > lyricDistSq) { sp.visible = false; continue; }
              if (scrollMode) {
                const offset = lyricsScrollOffsetRef.current.get(sp._songId as string) ?? 0;
                sp.visible = (sp._lineIdx as number) >= offset && (sp._lineIdx as number) < offset + winSize;
              } else {
                sp.visible = true;
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [simNodes]);

  // ── Cursor auto-hide ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socialMode) { setCursorHidden(false); return; }
    const onMove = () => { lastMoveRef.current = Date.now(); setCursorHidden(false); };
    window.addEventListener('mousemove', onMove);
    const iv = setInterval(() => {
      if (Date.now() - lastMoveRef.current > 3000) setCursorHidden(true);
    }, 500);
    return () => { window.removeEventListener('mousemove', onMove); clearInterval(iv); };
  }, [socialMode]);

  // ── Lyrics sprites for Lyrical DNA scene ─────────────────────────────────────

  useEffect(() => {
    const scene = CINEMA_SCENES[currentSceneIdx];
    if (!scene || scene.id !== 'lyrical-dna' || !showLyrics) {
      cleanupLyricsSprites();
      return;
    }
    if (!simNodes.length) return;

    const addSprites = async () => {
      try {
        let lyricMap = lyricsDataCacheRef.current;
        if (!lyricMap) {
          const qs = selectedBandIds.length ? `?bandIds=${selectedBandIds.join(',')}` : '';
          const data: { albums: Array<{ songs: Array<{ id: string; lyricText: string }> }> } =
            await api.get(`/api/public/lyrics-universe${qs}`);
          lyricMap = {};
          for (const alb of data.albums) {
            for (const s of alb.songs) {
              const lines = s.lyricText
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0)
                .slice(0, 5);
              lyricMap[`song:${s.id}`] = lines;
            }
          }
          lyricsDataCacheRef.current = lyricMap;
        }

        cleanupLyricsSprites();
        const threeScene = fgRef.current?.scene?.();
        if (!threeScene) return;

        const newSprites: any[] = [];
        for (const [nodeId, lines] of Object.entries(lyricMap)) {
          const node = simNodes.find(n => n.id === nodeId);
          if (!node || node.x == null) continue;
          let visIdx = 0;
          lines.forEach((line, li) => {
            if (!line.trim()) return;
            const sp = new SpriteText(line.slice(0, 60));
            sp.color = 'rgba(199,210,254,0.65)';
            sp.textHeight = 2.8;
            sp.fontFace = 'Georgia, serif';
            sp.backgroundColor = 'rgba(3,7,18,0.5)';
            sp.padding = 1;
            const angle = li * 0.9 + nodeId.charCodeAt(5) * 0.1;
            (sp as any).position.set(
              (node.x ?? 0) + Math.sin(angle) * 18,
              (node.y ?? 0) + 14 + li * 7,
              (node.z ?? 0) + Math.cos(angle) * 18,
            );
            (sp as any)._songId  = nodeId;
            (sp as any)._lineIdx = visIdx++;
            threeScene.add(sp as any);
            newSprites.push(sp as any);
          });
          lyricsTotalLinesRef.current.set(nodeId, visIdx);
          lyricsScrollOffsetRef.current.set(nodeId, 0);
        }
        lyricsSpritesRef.current = newSprites;
      } catch (_e) {
        // Lyrics not available — scene still works without them
      }
    };

    const timer = setTimeout(addSprites, 1800);
    return () => {
      clearTimeout(timer);
      cleanupLyricsSprites();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSceneIdx, showLyrics, simNodes]);

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

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        if (isPlayingRef.current) { if (tourModeRef.current) stopTour(); else setIsPlaying(false); }
        else                      { if (tourModeRef.current) startTour(); else startPlayback(); }
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
    const n = node as CinemaNode;
    if (tourMode && n.id === tourHighlightedId) return HIGHLIGHT_COLOR;
    const sel = selectedNodeRef.current;
    if (sel && !isPlayingRef.current) {
      if (n.id === sel.id) return '#ffffff';
      if (adjRef.current.get(sel.id)?.has(n.id)) return '#22d3ee';
      const themeColor = currentTheme.nodeColors[n.type] ?? '#4b5563';
      return blendHex(themeColor, '#0d1117', selectionDimRef.current);
    }
    return currentTheme.nodeColors[n.type] ?? '#4b5563';
  }, [tourMode, tourHighlightedId, currentTheme]);

  const nodeVal = useCallback((node: object) => {
    const n = node as CinemaNode;
    if (tourMode && n.id === tourHighlightedId) return 12;
    const sel = selectedNodeRef.current;
    if (sel && !isPlayingRef.current && n.id === sel.id) return nodeValFor(n.type) * 1.6;
    return nodeValFor(n.type) * currentTheme.nodeValMultiplier;
  }, [tourMode, tourHighlightedId, currentTheme]);

  // Link highlighting: bright white for active node's edges, indigo for all tour-node edges
  const linkColor = useCallback((link: object) => {
    const l     = link as { source: string | { id: string }; target: string | { id: string } };
    const srcId = typeof l.source === 'string' ? l.source : (l.source as any).id as string;
    const tgtId = typeof l.target === 'string' ? l.target : (l.target as any).id as string;
    if (tourMode) {
      if (tourHighlightedId && (srcId === tourHighlightedId || tgtId === tourHighlightedId)) {
        return 'rgba(255,255,255,0.75)';
      }
      if (tourNodeIds.size > 0 && (tourNodeIds.has(srcId) || tourNodeIds.has(tgtId))) {
        return 'rgba(165,180,252,0.55)';
      }
    }
    const sel = selectedNodeRef.current;
    if (sel && !isPlayingRef.current) {
      if (srcId === sel.id || tgtId === sel.id) return '#22d3ee';
      return 'rgba(15,15,30,0.08)';
    }
    return currentThemeRef.current.linkColor;
  }, [tourMode, tourHighlightedId, tourNodeIds, currentTheme]);

  const linkWidth = useCallback((link: object) => {
    const l     = link as { source: string | { id: string }; target: string | { id: string } };
    const srcId = typeof l.source === 'string' ? l.source : (l.source as any).id as string;
    const tgtId = typeof l.target === 'string' ? l.target : (l.target as any).id as string;
    if (tourMode) {
      if (tourHighlightedId && (srcId === tourHighlightedId || tgtId === tourHighlightedId)) return 2;
      if (tourNodeIds.size > 0 && (tourNodeIds.has(srcId) || tourNodeIds.has(tgtId))) return 1;
    }
    const sel = selectedNodeRef.current;
    if (sel && !isPlayingRef.current) {
      if (srcId === sel.id || tgtId === sel.id) return 2;
      return 0.12;
    }
    return 0.4 * currentThemeRef.current.linkWidthMultiplier;
  }, [tourMode, tourHighlightedId, tourNodeIds, currentTheme]);

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
    s.position.y = sphereR(nodeValFor(n.type)) + sprite.textHeight * 0.6 + 3;
    s.visible = false;
    labelMapRef.current.set(n.id, sprite);
    return sprite;
  }, []);

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

  const reArrange = useCallback((overrideMode?: string) => {
    const scene = CINEMA_SCENES[currentIdxRef.current];
    if (!fgRef.current) return;
    const mode     = (overrideMode ?? scene?.arrangeMode) as import('../cinema/graphArrange').ArrangeMode | undefined;
    if (!mode) return;
    const visNodes = simNodesRef.current.filter(n => !hiddenTypesRef.current.has(n.type));
    const adj      = adjRef.current;
    if (mode === 'natural') {
      visNodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });
      didFitRef.current = false;
      fgRef.current.d3ReheatSimulation?.();
    } else {
      animateArrange(visNodes, computeArrangeTargets(visNodes, mode, adj), fgRef.current);
    }
  }, []);

  const applyAiSettings = useCallback(async () => {
    const prompt = aiPromptInput.trim();
    if (!prompt || isAiThinking) return;
    setIsAiThinking(true);
    setAiLastResult(null);
    try {
      const qs = selectedBandIds.length ? `?bandIds=${selectedBandIds.join(',')}` : '';
      const result: {
        ok: boolean;
        settings: {
          arrangeMode?: string;
          themeId?: string;
          orbitSpeed?: number;
          hiddenTypes?: string[];
          description?: string;
          cameraPreset?: string;
        };
      } = await api.post(`/api/public/cinema-ai${qs}`, { prompt });

      if (!result.ok || !result.settings) throw new Error('No settings');
      const s = result.settings;

      if (s.themeId)    setSelectedThemeId(s.themeId);
      if (s.hiddenTypes) setHiddenTypes(new Set(s.hiddenTypes));
      if (s.orbitSpeed != null) setCinemaControls(prev => ({ ...prev, orbitSpeed: s.orbitSpeed! }));
      if (s.arrangeMode) {
        // Small delay so theme renders first
        setTimeout(() => reArrange(s.arrangeMode), 120);
      }
      if (s.cameraPreset && fgRef.current) {
        const camera = fgRef.current.camera?.();
        const ctrl   = fgRef.current.controls?.();
        if (camera && ctrl) {
          const presets: Record<string, [number,number,number]> = {
            top:       [0, 700, 30],
            side:      [650, 80, 0],
            isometric: [380, 380, 380],
            dramatic:  [60, 80, 480],
            close:     [120, 60, 200],
          };
          const pos = presets[s.cameraPreset] ?? presets['isometric']!;
          camera.position.set(pos[0], pos[1], pos[2]);
          ctrl.target.set(0, 0, 0);
          camera.lookAt(0, 0, 0);
        }
      }
      setAiLastResult(s.description ?? 'Done.');
    } catch {
      setAiLastResult('Could not connect to AI. Check your OPENAI_API_KEY.');
    } finally {
      setIsAiThinking(false);
    }
  }, [aiPromptInput, isAiThinking, selectedBandIds, reArrange]);

  const onNodeClick = useCallback((node: object) => {
    const n = node as CinemaNode;
    const sel = selectedNodeRef.current;
    // While paused and a node is already selected, ignore clicks on non-adjacent nodes (matching Explore behaviour)
    if (!isPlayingRef.current && sel && sel.id !== n.id && !adjRef.current.get(sel.id)?.has(n.id)) return;
    const newSel = sel?.id === n.id ? null : n;
    selectedNodeRef.current = newSel;
    setSelectedNode(newSel);
    fgRef.current?.refresh();
    if (!isPlayingRef.current && newSel) {
      const ctrl = fgRef.current?.controls?.();
      if (ctrl && newSel.x != null) {
        orbitAnimRef.current = {
          sx: ctrl.target.x, sy: ctrl.target.y, sz: ctrl.target.z,
          tx: newSel.x, ty: newSel.y ?? 0, tz: newSel.z ?? 0,
          t0: performance.now(), dur: 600,
        };
      }
    }
  }, []);

  function cleanupLyricsSprites() {
    const scene = fgRef.current?.scene?.();
    for (const s of lyricsSpritesRef.current) {
      scene?.remove(s);
    }
    lyricsSpritesRef.current = [];
    lyricsScrollOffsetRef.current.clear();
    lyricsTotalLinesRef.current.clear();
    lyricsScrollLastRef.current = 0;
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const currentScene = CINEMA_SCENES[currentSceneIdx];
  const isLoading    = isFetching || !simReady;

  function updateControl<K extends keyof CinemaControls>(key: K, val: CinemaControls[K]) {
    setCinemaControls(prev => ({ ...prev, [key]: val }));
  }

  function toggleHiddenType(type: string) {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
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
        <div style={{ filter: currentTheme.cssFilter || undefined }}>
        <ForceGraph3D
          ref={fgRef}
          graphData={visibleGraphData}
          nodeId="id"
          nodeLabel=""
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeRelSize={BASE_NODE_REL}
          nodeOpacity={currentTheme.nodeOpacity}
          nodeResolution={8}
          nodeThreeObjectExtend
          nodeThreeObject={nodeThreeObject}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkOpacity={0.85}
          backgroundColor={currentTheme.backgroundColor}
          showNavInfo={false}
          warmupTicks={simReady ? 0 : 80}
          cooldownTicks={simReady ? 0 : 120}
          d3VelocityDecay={0.4}
          onEngineStop={onEngineStop}
          onNodeClick={onNodeClick}
          width={window.innerWidth}
          height={window.innerHeight}
        />
        </div>
      )}

      {/* Bokeh depth-of-field overlay — radial backdrop-blur, edges blurred centre sharp */}
      {currentTheme.bokehOverlay && simNodes.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            maskImage: 'radial-gradient(ellipse 44% 50% at center, transparent 36%, rgba(0,0,0,0.28) 54%, black 74%)',
            WebkitMaskImage: 'radial-gradient(ellipse 44% 50% at center, transparent 36%, rgba(0,0,0,0.28) 54%, black 74%)',
          } as React.CSSProperties}
        />
      )}

      {/* Halftone dot-screen overlay — repeating radial dots in screen blend mode */}
      {currentTheme.dotOverlay && simNodes.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            backgroundImage: 'radial-gradient(circle 1.8px at 1.8px 1.8px, rgba(255,255,255,0.52) 100%, transparent 100%)',
            backgroundSize: '6px 6px',
            mixBlendMode: 'screen',
          }}
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

          {/* Top-center: scene/tour label */}
          {isPlaying && !tourMode && currentScene && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 text-center pointer-events-none">
              <div className="text-xl">{currentScene.emoji}</div>
              <div className="text-sm font-semibold text-white/80 mt-0.5">{currentScene.name}</div>
              <div className="text-xs text-gray-600 mt-0.5 max-w-[220px]">{currentScene.description}</div>
            </div>
          )}
          {tourMode && tourSteps[tourStepIdx] && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 text-center pointer-events-none">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Tour</div>
              <div className="text-sm font-semibold text-white/80 mt-0.5">{tourSteps[tourStepIdx]?.nodeLabel}</div>
              <div className="text-xs text-gray-600 mt-0.5">
                {tourStepIdx + 1} / {tourSteps.length}
                {isPlaying && tourOrbitRef.current && (
                  <span className="ml-2">
                    {tourOrbitRef.current.dwellStart < 0 ? '✈ flying…' : '◉ orbiting'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Top-right */}
          <div className="absolute top-4 right-4 z-30 flex gap-2">
            <button
              onClick={() => reArrange()}
              disabled={!simReady}
              title={`Re-apply ${currentScene?.name ?? ''} arrangement`}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ✦ Arrange
            </button>
            <button
              onClick={() => { setShowAiDirector(v => !v); setShowBandPicker(false); setShowControls(false); setShowPlaylist(false); setShowTourPlanner(false); }}
              title="AI Director — describe the view you want"
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                showAiDirector ? 'bg-purple-900/60 border-purple-700 text-purple-300' : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              🤖 AI
            </button>
            <button
              onClick={() => { setShowBandPicker(v => !v); setShowControls(false); setShowPlaylist(false); setShowTourPlanner(false); setShowAiDirector(false); }}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              Bands{selectedBandIds.length > 0 ? ` (${selectedBandIds.length})` : ''}
            </button>
            <button
              onClick={() => { setShowControls(v => !v); setShowBandPicker(false); setShowPlaylist(false); setShowTourPlanner(false); setShowAiDirector(false); }}
              title="Camera controls & node visibility"
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                showControls || hiddenTypes.size > 0
                  ? 'bg-indigo-900/60 border-indigo-700 text-indigo-300'
                  : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              ⚙{hiddenTypes.size > 0 ? ` −${hiddenTypes.size}` : ''}
            </button>
            <button
              onClick={toggleSocialMode}
              title="Social Mode (F)"
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              🎬
            </button>
          </div>

          {/* AI Director panel */}
          {showAiDirector && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/97 border border-purple-800/60 rounded-xl p-4 backdrop-blur-sm w-72 shadow-2xl space-y-3">
              <div className="text-[10px] font-semibold text-purple-400 uppercase tracking-wide">🤖 AI Director</div>
              <div className="text-[11px] text-gray-400 leading-relaxed">
                Describe the view you want. The AI will choose an arrangement, theme, and camera to match.
              </div>
              <textarea
                value={aiPromptInput}
                onChange={e => setAiPromptInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void applyAiSettings(); } }}
                placeholder={'e.g. "psychedelic cosmic trip with neon colours" or "organic tree of my music, earthy tones" or "show me the emotional landscape, top-down mandala"'}
                rows={3}
                className="w-full bg-gray-800/80 border border-gray-700 rounded-lg text-[11px] text-gray-200 placeholder-gray-600 px-3 py-2 resize-none focus:outline-none focus:border-purple-600"
              />
              <button
                onClick={() => void applyAiSettings()}
                disabled={isAiThinking || !aiPromptInput.trim()}
                className={`w-full text-xs py-2 rounded-lg font-medium transition-colors ${
                  isAiThinking || !aiPromptInput.trim()
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-purple-700 hover:bg-purple-600 text-white'
                }`}
              >
                {isAiThinking ? '✦ Thinking…' : '✦ Direct the scene'}
              </button>
              {aiLastResult && (
                <div className="text-[11px] text-purple-300/80 italic leading-relaxed border-t border-gray-800 pt-2">
                  {aiLastResult}
                </div>
              )}
              <div className="text-[10px] text-gray-700">⌘ Enter to submit</div>
            </div>
          )}

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

          {/* ── Controls panel ── */}
          {showControls && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur-sm w-64 shadow-2xl space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 80px)' }}>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Camera Controls</div>

              {/* Camera motion mode */}
              <div className="space-y-1.5">
                <div className="text-[10px] text-gray-400">Camera motion</div>
                <div className="flex bg-gray-800/60 rounded-lg p-0.5">
                  {(['orbit', 'breathe'] as const).map(mode => (
                    <button key={mode}
                      onClick={() => updateControl('orbitMode', mode)}
                      className={`flex-1 text-[10px] py-1.5 rounded transition-colors ${
                        cinemaControls.orbitMode === mode ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {mode === 'orbit' ? '🔄 Orbit' : '🌬 Breathe'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed */}
              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>{cinemaControls.orbitMode === 'breathe' ? 'Breathe rate' : 'Orbit speed'}</span>
                  <span>{cinemaControls.orbitSpeed.toFixed(1)}×</span>
                </div>
                <input type="range" min="0.1" max="5" step="0.1" value={cinemaControls.orbitSpeed}
                  onChange={e => updateControl('orbitSpeed', Number(e.target.value))}
                  className="w-full accent-indigo-500" />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Approach dist</span><span>{cinemaControls.approachDist}</span>
                </div>
                <input type="range" min="30" max="400" step="5" value={cinemaControls.approachDist}
                  onChange={e => updateControl('approachDist', Number(e.target.value))}
                  className="w-full accent-indigo-500" />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Elevation</span><span>{cinemaControls.elevationOffset}</span>
                </div>
                <input type="range" min="-100" max="300" step="5" value={cinemaControls.elevationOffset}
                  onChange={e => updateControl('elevationOffset', Number(e.target.value))}
                  className="w-full accent-indigo-500" />
              </label>

              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Playback speed</span><span>{cinemaControls.speedMultiplier.toFixed(1)}×</span>
                </div>
                <input type="range" min="0.25" max="4" step="0.25" value={cinemaControls.speedMultiplier}
                  onChange={e => updateControl('speedMultiplier', Number(e.target.value))}
                  className="w-full accent-indigo-500" />
              </label>

              <button onClick={() => setCinemaControls(DEFAULT_CINEMA_CONTROLS)}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                Reset to defaults
              </button>

              {/* Label distances */}
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Label Show Distance</div>
                {(['artist', 'album', 'song', 'other'] as const).map(t => (
                  <label key={t} className="block space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span className="capitalize">{t === 'other' ? 'Tag / Theme' : t}</span>
                      <span>{labelDistances[t]}</span>
                    </div>
                    <input type="range" min="50" max="1200" step="10"
                      value={labelDistances[t]}
                      onChange={e => setLabelDistances(prev => ({ ...prev, [t]: Number(e.target.value) }))}
                      className="w-full accent-indigo-500" />
                  </label>
                ))}
                <label className="block space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Lyrics</span>
                    <span>{lyricsShowDist}</span>
                  </div>
                  <input type="range" min={50} max={600} step={10} value={lyricsShowDist}
                    onChange={e => setLyricsShowDist(Number(e.target.value))}
                    className="w-full accent-indigo-500" />
                </label>
              </div>

              {/* Node type visibility */}
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Show node types</div>
                  {hiddenTypes.size > 0 && (
                    <button onClick={() => setHiddenTypes(new Set())}
                      className="text-[10px] text-indigo-500 hover:text-indigo-300 transition-colors">
                      Show all
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {ALL_TYPES.map(type => {
                    const hidden = hiddenTypes.has(type);
                    return (
                      <button key={type}
                        onClick={() => toggleHiddenType(type)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                          hidden
                            ? 'text-gray-700 hover:text-gray-500'
                            : 'text-gray-300 hover:bg-gray-800'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${hidden ? 'bg-gray-700' : ''}`}
                          style={hidden ? {} : { backgroundColor: TYPE_COLOR[type] ?? '#4b5563' }}
                        />
                        <span className={hidden ? 'line-through' : ''}>{TYPE_LABELS[type] ?? type}</span>
                        <span className="ml-auto text-[10px] text-gray-700">{hidden ? 'hidden' : '✓'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lyrics overlay (Lyrical DNA scene) */}
              <div className="border-t border-gray-800 pt-3">
                <button
                  onClick={() => setShowLyrics(v => !v)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                    showLyrics ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:text-gray-500'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${showLyrics ? 'bg-indigo-500' : 'bg-gray-700'}`} />
                  <span className={showLyrics ? '' : 'line-through'}>Lyric text overlay</span>
                  <span className="ml-auto text-[10px] text-gray-700">{showLyrics ? '✓' : 'hidden'}</span>
                </button>

                {showLyrics && (
                  <>
                    {/* Scroll mode toggle */}
                    <button
                      onClick={() => setLyricsScrollMode(v => !v)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                        lyricsScrollMode ? 'text-indigo-300 bg-indigo-900/30' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${lyricsScrollMode ? 'bg-indigo-400' : 'bg-gray-700'}`} />
                      <span>Scroll mode</span>
                      <span className="ml-auto text-[10px] text-gray-600">{lyricsScrollMode ? 'on' : 'off'}</span>
                    </button>

                    {lyricsScrollMode && (
                      <>
                        <label className="block space-y-1">
                          <div className="flex justify-between text-[10px] text-gray-400">
                            <span>Lines visible</span>
                            <span>{lyricsWindowSize}</span>
                          </div>
                          <input type="range" min={1} max={8} step={1} value={lyricsWindowSize}
                            onChange={e => setLyricsWindowSize(Number(e.target.value))}
                            className="w-full accent-indigo-500" />
                        </label>
                        <label className="block space-y-1">
                          <div className="flex justify-between text-[10px] text-gray-400">
                            <span>Advance every</span>
                            <span>{lyricsScrollSpeed}s</span>
                          </div>
                          <input type="range" min={0.5} max={8} step={0.5} value={lyricsScrollSpeed}
                            onChange={e => setLyricsScrollSpeed(Number(e.target.value))}
                            className="w-full accent-indigo-500" />
                        </label>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Label styling */}
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Label Style</div>
                <button
                  onClick={() => setLabelShowBg(v => !v)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                    labelShowBg ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700 hover:text-gray-500'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${labelShowBg ? 'bg-indigo-500' : 'bg-gray-700'}`} />
                  <span className={labelShowBg ? '' : 'line-through'}>Label backgrounds</span>
                  <span className="ml-auto text-[10px] text-gray-700">{labelShowBg ? 'on' : 'off'}</span>
                </button>
                {labelShowBg && (
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Bg opacity</span><span>{Math.round(labelBgOpacity * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.05} value={labelBgOpacity}
                      onChange={e => setLabelBgOpacity(Number(e.target.value))}
                      className="w-full accent-indigo-500" />
                  </label>
                )}
                <button
                  onClick={() => setLabelAlwaysOnTop(v => !v)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                    labelAlwaysOnTop ? 'text-cyan-300 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${labelAlwaysOnTop ? 'bg-cyan-400' : 'bg-gray-700'}`} />
                  <span>Show through nodes</span>
                  <span className="ml-auto text-[10px] text-gray-600">{labelAlwaysOnTop ? 'on' : 'off'}</span>
                </button>
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] text-gray-400 flex-1">Text colour</span>
                  <input type="color" value={labelTextColor}
                    onChange={e => setLabelTextColor(e.target.value)}
                    className="w-8 h-5 rounded cursor-pointer border-0 bg-transparent" />
                </div>
              </div>

              {/* Selection dim */}
              <div className="border-t border-gray-800 pt-3">
                <label className="block space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Selection dim</span><span>{Math.round(selectionDim * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={selectionDim}
                    onChange={e => setSelectionDim(Number(e.target.value))}
                    className="w-full accent-indigo-500" />
                  <div className="text-[10px] text-gray-600">0 = colours · 1 = fully dark</div>
                </label>
              </div>

              {/* Visual theme */}
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Visual Theme</div>
                <div className="grid grid-cols-2 gap-1">
                  {CINEMA_THEMES.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => setSelectedThemeId(theme.id)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                        selectedThemeId === theme.id
                          ? 'bg-indigo-900/60 border border-indigo-700/40 text-indigo-300'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <span>{theme.emoji}</span>
                      <span className="truncate">{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Selected node info ── */}
          {selectedNode && (
            <div className="absolute bottom-20 left-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-3 backdrop-blur-sm w-60 shadow-2xl max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0">{TYPE_ICONS[selectedNode.type] ?? '•'}</span>
                  <span className="text-xs font-semibold text-white truncate">{selectedNode.label}</span>
                </div>
                <button onClick={() => { selectedNodeRef.current = null; setSelectedNode(null); fgRef.current?.refresh(); }} className="shrink-0 text-gray-600 hover:text-gray-400 ml-2">✕</button>
              </div>
              <div className="text-[10px] text-gray-500 mb-2">{TYPE_LABELS[selectedNode.type] ?? selectedNode.type}</div>

              {/* Spectrum scores */}
              {!!selectedNode.data?.scores && (
                <div className="space-y-1 mb-3 border-t border-gray-800 pt-2">
                  <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Spectrum</div>
                  {Object.entries(selectedNode.data.scores as Record<string, number>).map(([axis, val]) => (
                    <div key={axis} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-18 capitalize shrink-0">{axis}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-1">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, val * 10)}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 w-4 text-right">{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Connections */}
              <div className="border-t border-gray-800 pt-2">
                <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">
                  Connected ({adjRef.current.get(selectedNode.id)?.size ?? 0})
                </div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {[...(adjRef.current.get(selectedNode.id) ?? [])].slice(0, 12).map(connId => {
                    const connNode = simNodes.find(n => n.id === connId);
                    if (!connNode) return null;
                    return (
                      <button key={connId}
                        onClick={() => { selectedNodeRef.current = connNode; setSelectedNode(connNode); fgRef.current?.refresh(); }}
                        className="w-full text-left text-[11px] text-gray-400 flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-gray-800 hover:text-white transition-colors">
                        <span className="shrink-0">{TYPE_ICONS[connNode.type] ?? '•'}</span>
                        <span className="truncate">{connNode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ PLAYBACK CONTROLS ════════════════════════════════════════════════════ */}
      {!socialMode && (
        <div className="absolute bottom-0 left-0 right-0 z-30">
          {!tourMode && (
            <div className="mx-auto px-4 pb-0 pt-2 max-w-2xl">
              <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500/60 rounded-full transition-all duration-100"
                  style={{ width: `${sceneProgress * 100}%` }} />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3 gap-3 bg-gradient-to-t from-gray-950/90 to-transparent backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-800/60 rounded-lg p-0.5 text-[10px]">
                <button onClick={() => setTourMode(false)}
                  className={`px-2 py-1 rounded transition-colors ${!tourMode ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  Scenes
                </button>
                <button onClick={() => setTourMode(true)}
                  className={`px-2 py-1 rounded transition-colors ${tourMode ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
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

            <div className="flex items-center gap-3">
              {!tourMode && (
                <button onClick={retreatScene} className="text-gray-500 hover:text-white transition-colors text-lg" title="Previous (J / ←)">⏮</button>
              )}
              <button
                onClick={() => {
                  if (isPlaying) { if (tourMode) stopTour(); else setIsPlaying(false); }
                  else           { if (tourMode) startTour(); else startPlayback(); }
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
                <button onClick={advanceScene} className="text-gray-500 hover:text-white transition-colors text-lg" title="Next (L / →)">⏭</button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden md:inline text-[10px] text-gray-700">Space · F · ⚙</span>
              <button onClick={toggleSocialMode} title="Social Mode (F)" className="text-xs text-gray-600 hover:text-gray-300 transition-colors">🎬</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scene playlist ── */}
      {showPlaylist && !socialMode && !tourMode && (
        <div className="absolute bottom-20 left-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-2 backdrop-blur-sm w-64 shadow-2xl">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-2 pb-1">Scenes</div>
          {CINEMA_SCENES.map((scene, idx) => (
            <button key={scene.id}
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

      {/* ── Tour planner ── */}
      {showTourPlanner && !socialMode && tourMode && (
        <div
          className="absolute bottom-20 left-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-3 backdrop-blur-sm w-72 shadow-2xl flex flex-col overflow-hidden"
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
            onClear={() => { setTourSteps([]); stopTour(); }}
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
                {!tourMode && currentScene && <div className="text-[10px] mt-0.5">{currentScene.emoji} {currentScene.name}</div>}
                {tourMode && tourSteps[tourStepIdx] && <div className="text-[10px] mt-0.5">Tour · {tourSteps[tourStepIdx]?.nodeLabel}</div>}
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
              <button onClick={toggleSocialMode} className="text-[10px] text-gray-500 hover:text-gray-300">Exit</button>
            </div>
          )}
        </>
      )}
      {socialMode && (
        <div className="absolute inset-0 pointer-events-none z-20"
          style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.04)' }} />
      )}
    </div>
  );
}

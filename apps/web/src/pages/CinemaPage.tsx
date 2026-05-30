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
import * as THREE from 'three';
import { api } from '../lib/api';
import type { GraphData } from '../api/songNodes';
import { buildAdj, computeArrangeTargets, animateArrange, easeInOutQuad } from '../cinema/graphArrange';
import { CINEMA_SCENES } from '../cinema/sceneDefinitions';
import { initOrbitState, updateOrbitCamera, type OrbitCameraState } from '../cinema/orbitCamera';
import type { CinemaNode, CinemaLink, CinemaControls, TourStep, CinemaKeyframe, NodeSequence } from '../cinema/types';
import { DEFAULT_CINEMA_CONTROLS } from '../cinema/types';
import { CINEMA_THEMES, getTheme, DEFAULT_THEME_ID, type CinemaTheme } from '../cinema/themes';
import TourPlanner from '../cinema/TourPlanner';
import CameraDirector from '../cinema/CameraDirector';

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  song: '#6366f1', keyword: '#374151',
  album: '#8b5cf6', artist: '#f59e0b',
  theme: '#10b981', tag: '#06b6d4', emotion: '#ec4899',
  genre: '#f97316',
};
const TYPE_LABELS: Record<string, string> = {
  artist: '🎸 Artist', album: '💿 Album', song: '🎵 Song',
  keyword: '🔑 Keyword', theme: '🌿 Theme', tag: '🏷 Tag', emotion: '💜 Emotion',
  genre: '🎼 Genre',
};
const TYPE_ICONS: Record<string, string> = {
  artist: '🎸', album: '💿', song: '🎵',
  keyword: '🔑', theme: '🌿', tag: '🏷', emotion: '💜',
  genre: '🎼',
};
const ALL_TYPES = ['artist', 'album', 'song', 'keyword', 'theme', 'tag', 'emotion', 'genre'];

const HIGHLIGHT_COLOR = '#ffffff';

const QUICK_ARRANGE_MODES = [
  { mode: 'sphere',           emoji: '🌐', label: 'Sphere'   },
  { mode: 'galaxy',           emoji: '🌌', label: 'Galaxy'   },
  { mode: 'helix',            emoji: '🧬', label: 'Helix'    },
  { mode: 'wave',             emoji: '🌊', label: 'Wave'     },
  { mode: 'mandala',          emoji: '🔵', label: 'Mandala'  },
  { mode: 'crystal',          emoji: '💎', label: 'Crystal'  },
  { mode: 'radial',           emoji: '🎯', label: 'Radial'   },
  { mode: 'fibonacci-spiral', emoji: '🌀', label: 'Spiral'   },
  { mode: 'natural',          emoji: '🌿', label: 'Natural'  },
] as const;

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

const DWELL_PRESETS       = [2000, 4000, 6000, 8000, 10000, 15000, 20000, 30000, 60000];
const FLY_IN_PRESETS      = [600, 1000, 1800, 2800, 4000, 6000, 10000];
const DEFAULT_PATH_DWELL_MS  = 8000;
const DEFAULT_PATH_FLY_IN_MS = 1800;

// ── Setlist.fm types ──────────────────────────────────────────────────────────

interface SetlistSong { name: string; }
interface SetlistSet  { song?: SetlistSong[]; }
interface SetlistEntry {
  id: string;
  eventDate: string;
  venue: { name: string; city: { name: string; country: { name: string } } };
  sets: { set: SetlistSet[] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function blendHex(from: string, to: string, t: number): string {
  if (!from.startsWith('#') || from.length < 7) return t > 0.5 ? to : from;
  const r0 = parseInt(from.slice(1,3),16), g0 = parseInt(from.slice(3,5),16), b0 = parseInt(from.slice(5,7),16);
  const r1 = parseInt(to.slice(1,3),16),   g1 = parseInt(to.slice(3,5),16),   b1 = parseInt(to.slice(5,7),16);
  const r  = Math.round(r0+(r1-r0)*t), g = Math.round(g0+(g1-g0)*t), b = Math.round(b0+(b1-b0)*t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// ── Genre cloud poles (must match graphArrange.ts GENRE_POLES) ───────────────

const POLE_R = 360;
const GENRE_CLOUD_POLES = [
  { id: 'metal',      color: '#64748B', x: POLE_R,          y: 35,  z: 0 },
  { id: 'rock',       color: '#FB923C', x: POLE_R * 0.5,    y: -15, z: POLE_R * 0.866 },
  { id: 'pop',        color: '#F472B6', x: -POLE_R * 0.5,   y: 35,  z: POLE_R * 0.866 },
  { id: 'hiphop',     color: '#818CF8', x: -POLE_R,         y: -15, z: 0 },
  { id: 'electronic', color: '#22D3EE', x: -POLE_R * 0.5,   y: 35,  z: -POLE_R * 0.866 },
  { id: 'folk',       color: '#A3E635', x: POLE_R * 0.5,    y: -15, z: -POLE_R * 0.866 },
] as const;

type GenreCloudId = typeof GENRE_CLOUD_POLES[number]['id'];

// ── Pause-mode orbit pivot ────────────────────────────────────────────────────

interface OrbitAnim {
  sx: number; sy: number; sz: number;
  tx: number; ty: number; tz: number;
  t0: number; dur: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

type GenreSource = 'ai' | 'community' | 'priority';
const GENRE_SOURCE_LABELS: Record<GenreSource, string> = {
  priority:  '🔀 Auto (community → AI)',
  community: '👥 Community',
  ai:        '🤖 AI',
};

function fetchCinemaGraph(bandIds: string[], genreSource: GenreSource = 'priority'): Promise<GraphData> {
  const qs = new URLSearchParams({ preset: 'artist-universe', genreSource });
  if (bandIds.length) qs.set('bandIds', bandIds.join(','));
  return api.get(`/api/public/graph?${qs}`);
}
function fetchScopes(): Promise<{ bands: { id: string; name: string }[] }> {
  return api.get('/api/public/graph/scopes');
}

// ── Component ──────────────────────────────────────────────────────────────────

/** Per-type label text sizes (point units for SpriteText.textHeight). */
type LabelTextSizes = {
  artist: number; album: number; song: number;
  keyword: number; theme: number; tag: number; emotion: number; genre: number;
};
const DEFAULT_LABEL_TEXT_SIZES: LabelTextSizes = {
  artist: 5.0, album: 3.5, song: 3.5,
  keyword: 2.5, theme: 2.5, tag: 2.5, emotion: 2.5, genre: 2.5,
};
/** Ordered config for the Label Style UI — main then network types. */
const LABEL_SIZE_ROWS = [
  { key: 'artist'  as const, emoji: '🎸', name: 'Artist / Band', min: 1, max: 16 },
  { key: 'album'   as const, emoji: '💿', name: 'Album',          min: 1, max: 12 },
  { key: 'song'    as const, emoji: '🎵', name: 'Song',           min: 1, max: 12 },
  null, // ── divider ──
  { key: 'tag'     as const, emoji: '🏷', name: 'Tag',            min: 0.5, max: 8 },
  { key: 'theme'   as const, emoji: '🌿', name: 'Theme',          min: 0.5, max: 8 },
  { key: 'keyword' as const, emoji: '🔑', name: 'Keyword',        min: 0.5, max: 8 },
  { key: 'emotion' as const, emoji: '💜', name: 'Emotion',        min: 0.5, max: 8 },
  { key: 'genre'   as const, emoji: '🎼', name: 'Genre',          min: 0.5, max: 8 },
];

/**
 * When stare-at-lyrics is enabled, blend the camera lookAt target toward the
 * nearest lyric sprite. Blend strength decays with distance so the effect is
 * strong when lyrics are visible and gentle when the camera is further away.
 * No hard cutoff — always pulls toward the nearest sprite when enabled.
 */
function stareLookAt(
  camX: number, camY: number, camZ: number,
  tx: number, ty: number, tz: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sprites: any[],
  enabled: boolean,
  refDist: number,   // lyricsShowDist — used as the "full strength" reference distance
): [number, number, number] {
  if (!enabled || sprites.length === 0) return [tx, ty, tz];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nearest: any = null;
  let nearestDSq = Infinity;
  for (const sp of sprites) {
    const dx = sp.position.x - camX;
    const dy = sp.position.y - camY;
    const dz = sp.position.z - camZ;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq < nearestDSq) { nearestDSq = dSq; nearest = sp; }
  }
  if (!nearest) return [tx, ty, tz];
  // Blend: up to 0.45 when at refDist or closer; decays as 1/(1 + dist/refDist)
  const dist  = Math.sqrt(nearestDSq);
  const blend = Math.min(0.45, 0.45 / (1 + dist / refDist));
  return [
    tx + (nearest.position.x - tx) * blend,
    ty + (nearest.position.y - ty) * blend,
    tz + (nearest.position.z - tz) * blend,
  ];
}

export default function CinemaPage() {
  // ── Data ─────────────────────────────────────────────────────────────────────
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [selectedNode, setSelectedNode]       = useState<CinemaNode | null>(null);
  const [selectedNodeTags, setSelectedNodeTags] = useState<{ name: string; description: string }[]>([]);
  const [simNodes, setSimNodes]               = useState<CinemaNode[]>([]);
  const [simLinks, setSimLinks]               = useState<CinemaLink[]>([]);

  // Fetch tags with descriptions when a song node is selected
  useEffect(() => {
    if (!selectedNode || !selectedNode.id.startsWith('song:')) {
      setSelectedNodeTags([]);
      return;
    }
    const songId = selectedNode.id.slice('song:'.length);
    api.get<{ tags: { name: string; description: string }[] }>(`/api/analysis/ai/${songId}/tags`)
      .then((res) => setSelectedNodeTags(res.tags))
      .catch(() => setSelectedNodeTags([]));
  }, [selectedNode]);

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
  const [hiddenTypes, setHiddenTypes]   = useState<Set<string>>(new Set(['genre', 'emotion', 'theme']));
  const hiddenTypesRef                  = useRef<Set<string>>(new Set(['genre', 'emotion', 'theme']));
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

  // Show lyrics only for the currently selected chain node(s)
  const [lyricsSelectedOnly, setLyricsSelectedOnly]       = useState(false);
  const lyricsSelectedOnlyRef                             = useRef(false);
  useEffect(() => { lyricsSelectedOnlyRef.current = lyricsSelectedOnly; }, [lyricsSelectedOnly]);

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

  // Label state config: separate appearance for selected vs unselected nodes
  const [unselectedLabelScale, setUnselectedLabelScale]               = useState(1.0);
  const [unselectedLabelOpacity, setUnselectedLabelOpacity]           = useState(1.0);
  const [unselectedLabelColorOverride, setUnselectedLabelColorOverride] = useState('');
  const [selectedLabelScale, setSelectedLabelScale]                   = useState(1.4);
  const [selectedLabelColorOverride, setSelectedLabelColorOverride]   = useState('#ffffff');
  const [selectedLabelAlwaysVisible, setSelectedLabelAlwaysVisible]   = useState(true);
  const unselectedLabelScaleRef           = useRef(1.0);
  const unselectedLabelOpacityRef         = useRef(1.0);
  const unselectedLabelColorOverrideRef   = useRef('');
  const selectedLabelScaleRef             = useRef(1.4);
  const selectedLabelColorOverrideRef     = useRef('#ffffff');
  const selectedLabelAlwaysVisibleRef     = useRef(true);

  // Saturn ring lyrics: arrange lyric sprites in an orbital ring around each song node
  const [ringLyricsMode, setRingLyricsMode]       = useState(false);
  const [ringRadius, setRingRadius]               = useState(60);
  const [ringInclination, setRingInclination]     = useState(25);
  const [ringAzimuth, setRingAzimuth]             = useState(0);
  const [ringArcCoverage, setRingArcCoverage]     = useState(320);
  const [ringRotSpeed, setRingRotSpeed]           = useState(0.08);
  const [ringTextSize, setRingTextSize]           = useState(2.0);
  const [ringSelectedOnly, setRingSelectedOnly]   = useState(false);
  const ringLyricsModeRef   = useRef(false);
  const ringRadiusRef       = useRef(60);
  const ringInclinationRef  = useRef(25);
  const ringAzimuthRef      = useRef(0);
  const ringArcCoverageRef  = useRef(320);
  const ringRotSpeedRef     = useRef(0.08);
  const ringTextSizeRef     = useRef(2.0);
  const ringSelectedOnlyRef = useRef(false);
  const ringStartTimeRef    = useRef(performance.now());

  // Node sphere opacity override (user-adjustable, reset to theme default when theme changes)
  const [nodeOpacityUser, setNodeOpacityUser] = useState(() => 0.92);
  useEffect(() => { setNodeOpacityUser(currentTheme.nodeOpacity); }, [currentTheme]);

  // Per-type label text sizes — full set of node types
  const [labelTextSizes, setLabelTextSizes] = useState<LabelTextSizes>({ ...DEFAULT_LABEL_TEXT_SIZES });
  const labelTextSizesRef = useRef<LabelTextSizes>({ ...DEFAULT_LABEL_TEXT_SIZES });
  useEffect(() => { labelTextSizesRef.current = labelTextSizes; }, [labelTextSizes]);

  // Active arrangement mode (tracked so the quick-switcher can highlight the active one)
  const [activeArrangeMode, setActiveArrangeMode] = useState<string>(CINEMA_SCENES[0]?.arrangeMode ?? 'sphere');

  // Lyric sprite text size
  const [lyricsTextSize, setLyricsTextSize] = useState(2.8);
  const lyricsTextSizeRef = useRef(2.8);
  useEffect(() => { lyricsTextSizeRef.current = lyricsTextSize; }, [lyricsTextSize]);

  // Maximum lyric lines shown per node (5 = first verse feel; 20+ = full song)
  const [lyricsMaxLines, setLyricsMaxLines] = useState(5);
  const lyricsMaxLinesRef = useRef(5);
  useEffect(() => { lyricsMaxLinesRef.current = lyricsMaxLines; }, [lyricsMaxLines]);

  // Max number of simultaneous nodes showing lyrics — limits stacking when camera is near multiple nodes
  const [lyricsMaxNodes, setLyricsMaxNodes] = useState(1);
  const lyricsMaxNodesRef = useRef(1);
  useEffect(() => { lyricsMaxNodesRef.current = lyricsMaxNodes; }, [lyricsMaxNodes]);

  // During Director / scene-cam playback, blend lookAt toward nearest lyric sprite
  const [stareLyrics, setStareLyrics] = useState(false);
  const stareLyricsRef = useRef(false);
  useEffect(() => { stareLyricsRef.current = stareLyrics; }, [stareLyrics]);

  // Per-node visual overrides: custom color + size multiplier, persisted in localStorage
  const [nodeOverrides, setNodeOverridesRaw] = useState<Record<string, { color?: string; sizeMultiplier?: number }>>(() => {
    try {
      const stored = localStorage.getItem('cinema-node-overrides');
      return stored ? (JSON.parse(stored) as Record<string, { color?: string; sizeMultiplier?: number }>) : {};
    } catch { return {}; }
  });
  const nodeOverridesRef = useRef<Record<string, { color?: string; sizeMultiplier?: number }>>({});
  const setNodeOverrides = useCallback((overrides: Record<string, { color?: string; sizeMultiplier?: number }>) => {
    nodeOverridesRef.current = overrides;
    setNodeOverridesRaw(overrides);
    try { localStorage.setItem('cinema-node-overrides', JSON.stringify(overrides)); } catch { /* ignore */ }
  }, []);

  // Genre source selector
  const [genreSource, setGenreSource] = useState<GenreSource>('priority');

  // Director mode — global sequence
  const [showDirector, setShowDirector] = useState(false);
  const [directorPlaying, setDirectorPlaying] = useState(false);
  const [directorKeyframes, setDirectorKeyframesRaw] = useState<CinemaKeyframe[]>(() => {
    try {
      const stored = localStorage.getItem('cinema-director-keyframes');
      return stored ? (JSON.parse(stored) as CinemaKeyframe[]) : [];
    } catch { return []; }
  });
  const setDirectorKeyframes = useCallback((kfs: CinemaKeyframe[]) => {
    setDirectorKeyframesRaw(kfs);
    try { localStorage.setItem('cinema-director-keyframes', JSON.stringify(kfs)); } catch { /* ignore */ }
  }, []);

  // Per-scene camera keyframes (looping, override scene tick when set)
  const [sceneKeyframesMap, setSceneKeyframesMapRaw] = useState<Record<string, CinemaKeyframe[]>>(() => {
    try {
      const stored = localStorage.getItem('cinema-scene-keyframes');
      return stored ? (JSON.parse(stored) as Record<string, CinemaKeyframe[]>) : {};
    } catch { return {}; }
  });
  const setSceneKeyframesMap = useCallback((map: Record<string, CinemaKeyframe[]>) => {
    setSceneKeyframesMapRaw(map);
    try { localStorage.setItem('cinema-scene-keyframes', JSON.stringify(map)); } catch { /* ignore */ }
  }, []);
  const [sceneKfPlaying, setSceneKfPlaying] = useState(false);

  // Genre cloud zones (Three.js spheres, independent of node graph)
  const [genreCloudsEnabled, setGenreCloudsEnabled] = useState(false);
  const [genreCloudOpacity, setGenreCloudOpacity]   = useState(0.14);
  const [genreCloudSize, setGenreCloudSize]         = useState(145);
  const [hiddenGenreClouds, setHiddenGenreClouds]   = useState<Set<string>>(new Set());

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
  const [tourAddMode, setTourAddMode]         = useState(false);
  const tourAddModeRef                        = useRef(false);

  // Named saved sequences (persisted in localStorage)
  const [savedSequences, setSavedSequencesRaw] = useState<NodeSequence[]>(() => {
    try {
      const stored = localStorage.getItem('cinema-node-sequences');
      return stored ? (JSON.parse(stored) as NodeSequence[]) : [];
    } catch { return []; }
  });
  // Load sequences from the server on mount; replaces localStorage cache when logged in
  useEffect(() => {
    api.get<NodeSequence[]>('/api/node-sequences')
      .then(serverSeqs => { setSavedSequencesRaw(serverSeqs); })
      .catch(() => { /* not logged in or API unavailable — keep localStorage sequences */ });
  }, []);

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

  // Clear highlight + add-mode when leaving tour mode
  useEffect(() => {
    if (!tourMode) {
      tourHighlightedIdRef.current = null;
      setTourHighlightedId(null);
      setTourAddMode(false);
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
  // O(1) node lookup for rAF loops (updated whenever simNodes changes)
  const nodeMapRef      = useRef<Map<string, CinemaNode>>(new Map());
  const labelMapRef     = useRef<Map<string, any>>(new Map());
  const labelDistancesRef = useRef(DEFAULT_LABEL_DISTANCES);
  const didFitRef       = useRef(false);
  const containerRef    = useRef<HTMLDivElement>(null);
  const lastMoveRef     = useRef(Date.now());
  const simLinksRef     = useRef<CinemaLink[]>([]);
  const directorPlayRef = useRef<{
    keyframes: CinemaKeyframe[];
    idx: number;
    startMs: number;
    fromPos: { x: number; y: number; z: number };
    fromTarget: { x: number; y: number; z: number };
  } | null>(null);

  // Applies a node-chain selection by ID array — used by Director keyframe playback
  const applyKfSelectionRef = useRef((_ids: string[] | undefined) => { /* filled in effect below */ });

  // Per-scene looping keyframe playback
  const sceneKeyframesMapRef = useRef<Record<string, CinemaKeyframe[]>>({});
  const sceneKfPlayRef = useRef<{
    keyframes: CinemaKeyframe[];
    idx: number;
    startMs: number;
    fromPos: { x: number; y: number; z: number };
    fromTarget: { x: number; y: number; z: number };
  } | null>(null);

  // Genre cloud meshes managed by Three.js
  const genreCloudMeshesRef = useRef<THREE.Mesh[]>([]);

  // Node chain selection
  const selectedChainRef = useRef<CinemaNode[]>([]);

  // Free cam — disables scene.tick() so user can navigate freely during playback
  const [freeCam, setFreeCam] = useState(false);
  const freeCamRef = useRef(false);

  // Path mode — click nodes to build a labeled path; labels only on path nodes
  const [pathMode, setPathMode]         = useState(false);
  const [showPathPanel, setShowPathPanel] = useState(false);
  const [pathNodes, setPathNodes]       = useState<{id: string; label: string; type: string; dwellMs: number; flyInMs: number}[]>([]);

  // Setlist.fm concert setlist → Cinema tour
  const [showSetlistPanel, setShowSetlistPanel]       = useState(false);
  const [setlistArtistQuery, setSetlistArtistQuery]   = useState('');
  const [setlistSearching, setSetlistSearching]       = useState(false);
  const [setlistArtists, setSetlistArtists]           = useState<{mbid: string; name: string; sortName: string}[]>([]);
  const [setlistSelectedArtist, setSetlistSelectedArtist] = useState<{mbid: string; name: string} | null>(null);
  const [setlistLoading, setSetlistLoading]           = useState(false);
  const [setlistResults, setSetlistResults]           = useState<SetlistEntry[]>([]);
  const [setlistLoadingTour, setSetlistLoadingTour]   = useState<string | null>(null);
  const pathModeRef    = useRef(false);
  const pathNodesRef   = useRef<{id: string; label: string; type: string; dwellMs: number; flyInMs: number}[]>([]);
  const pathNodeSetRef = useRef<Set<string>>(new Set());

  // Lyrics progressive reveal
  const [lyricsProgressiveMode, setLyricsProgressiveMode] = useState(false);
  const [lyricsRevealPace, setLyricsRevealPace]           = useState(2);
  const lyricsProgressiveModeRef = useRef(false);
  const lyricsRevealPaceRef      = useRef(2);
  const lyricsProximitySinceRef  = useRef<Map<string, number>>(new Map());

  const [cursorHidden, setCursorHidden] = useState(false);

  // Sync refs ↔ state
  useEffect(() => { isPlayingRef.current  = isPlaying;       }, [isPlaying]);
  useEffect(() => { currentIdxRef.current = currentSceneIdx; }, [currentSceneIdx]);
  useEffect(() => {
    simNodesRef.current = simNodes;
    nodeMapRef.current  = new Map(simNodes.map(n => [n.id, n]));
  }, [simNodes]);
  useEffect(() => { tourModeRef.current   = tourMode;        }, [tourMode]);
  useEffect(() => { tourAddModeRef.current = tourAddMode;    }, [tourAddMode]);

  useEffect(() => { sceneKeyframesMapRef.current = sceneKeyframesMap; }, [sceneKeyframesMap]);

  useEffect(() => { labelShowBgRef.current      = labelShowBg;      }, [labelShowBg]);
  useEffect(() => { labelBgOpacityRef.current   = labelBgOpacity;   }, [labelBgOpacity]);
  useEffect(() => { labelTextColorRef.current   = labelTextColor;   }, [labelTextColor]);
  useEffect(() => { labelAlwaysOnTopRef.current = labelAlwaysOnTop; }, [labelAlwaysOnTop]);
  useEffect(() => { freeCamRef.current              = freeCam;              }, [freeCam]);
  useEffect(() => { pathModeRef.current = pathMode; }, [pathMode]);
  useEffect(() => {
    pathNodesRef.current   = pathNodes;
    pathNodeSetRef.current = new Set(pathNodes.map(p => p.id));
    fgRef.current?.refresh();
  }, [pathNodes]);
  useEffect(() => { lyricsProgressiveModeRef.current = lyricsProgressiveMode; }, [lyricsProgressiveMode]);
  useEffect(() => { lyricsRevealPaceRef.current      = lyricsRevealPace;      }, [lyricsRevealPace]);

  useEffect(() => { unselectedLabelScaleRef.current           = unselectedLabelScale;           }, [unselectedLabelScale]);
  useEffect(() => { unselectedLabelOpacityRef.current         = unselectedLabelOpacity;         }, [unselectedLabelOpacity]);
  useEffect(() => { unselectedLabelColorOverrideRef.current   = unselectedLabelColorOverride;   }, [unselectedLabelColorOverride]);
  useEffect(() => { selectedLabelScaleRef.current             = selectedLabelScale;             }, [selectedLabelScale]);
  useEffect(() => { selectedLabelColorOverrideRef.current     = selectedLabelColorOverride;     }, [selectedLabelColorOverride]);
  useEffect(() => { selectedLabelAlwaysVisibleRef.current     = selectedLabelAlwaysVisible;     }, [selectedLabelAlwaysVisible]);
  useEffect(() => {
    ringLyricsModeRef.current = ringLyricsMode;
    if (ringLyricsMode) ringStartTimeRef.current = performance.now();
  }, [ringLyricsMode]);
  useEffect(() => { ringRadiusRef.current       = ringRadius;       }, [ringRadius]);
  useEffect(() => { ringInclinationRef.current  = ringInclination;  }, [ringInclination]);
  useEffect(() => { ringAzimuthRef.current      = ringAzimuth;      }, [ringAzimuth]);
  useEffect(() => { ringArcCoverageRef.current  = ringArcCoverage;  }, [ringArcCoverage]);
  useEffect(() => { ringRotSpeedRef.current     = ringRotSpeed;     }, [ringRotSpeed]);
  useEffect(() => { ringTextSizeRef.current     = ringTextSize;     }, [ringTextSize]);
  useEffect(() => { ringSelectedOnlyRef.current = ringSelectedOnly; }, [ringSelectedOnly]);

  useEffect(() => {
    applyKfSelectionRef.current = (ids: string[] | undefined) => {
      if (!ids || ids.length === 0) {
        selectedChainRef.current = [];
        selectedNodeRef.current  = null;
        setSelectedNode(null);
        fgRef.current?.refresh();
        return;
      }
      const chain = ids
        .map(id => simNodesRef.current.find(n => n.id === id))
        .filter((n): n is CinemaNode => n !== undefined);
      selectedChainRef.current = chain;
      const last = chain[chain.length - 1] ?? null;
      selectedNodeRef.current  = last;
      setSelectedNode(last);
      fgRef.current?.refresh();
    };
  }, [setSelectedNode]);
  useEffect(() => {
    selectionDimRef.current = selectionDim;
    if (selectedNodeRef.current) fgRef.current?.refresh();
  }, [selectionDim]);

  // Update existing label sprites when per-type sizes or label-state scales change
  useEffect(() => {
    for (const [nodeId, sprite] of labelMapRef.current) {
      const node = simNodesRef.current.find(n => n.id === nodeId);
      if (!node) continue;
      const sz = labelTextSizesRef.current;
      const baseSize = (sz as Record<string, number>)[node.type] ?? sz.tag;
      const isSelected = selectedChainRef.current.some(c => c.id === nodeId);
      const scale = isSelected ? selectedLabelScaleRef.current : unselectedLabelScaleRef.current;
      const size  = baseSize * scale;
      (sprite as any).textHeight = size;
      (sprite as any)._lastTH    = size;
    }
    fgRef.current?.refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelTextSizes, selectedLabelScale, unselectedLabelScale]);

  // Update lyric sprites when text size changes
  useEffect(() => {
    for (const sp of lyricsSpritesRef.current) {
      (sp as any).textHeight = lyricsTextSize;
    }
    fgRef.current?.refresh();
  }, [lyricsTextSize]);

  // Refresh graph when per-node overrides change
  useEffect(() => {
    nodeOverridesRef.current = nodeOverrides;
    fgRef.current?.refresh();
  }, [nodeOverrides]);

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
    queryKey: ['cinema-graph', selectedBandIds.join(','), genreSource],
    queryFn: () => fetchCinemaGraph(selectedBandIds, genreSource),
  });

  useEffect(() => {
    if (!graphData) return;
    setSimReady(false);
    didFitRef.current = false;
    labelMapRef.current.clear();
    lyricsDataCacheRef.current = null; // invalidate so sprites rebuild with fresh positions

    const nodes: CinemaNode[] = graphData.nodes.map(n => ({ ...n }));
    const nodeSet = new Set(nodes.map(n => n.id));
    const links: CinemaLink[] = graphData.edges
      .filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
      .map(e => ({ source: e.source, target: e.target, type: e.type, weight: e.weight }));

    setSimNodes(nodes);
    setSimLinks(links);
    simLinksRef.current = links;
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
      animateArrange(visNodes, computeArrangeTargets(visNodes, scene.arrangeMode, adj, simLinksRef.current), fg);
    }

    sceneStateRef.current = scene.enter(fg, nodes, adj);
    sceneStartRef.current = performance.now();
    currentIdxRef.current = idx;
    setCurrentSceneIdx(idx);
    setSceneProgress(0);
    setFreeCam(false); // reset free cam on scene change

    // If this scene has user-defined keyframes, start looping them
    const kfs = sceneKeyframesMapRef.current[scene.id] ?? [];
    if (kfs.length > 0) {
      const camera = fg.camera?.();
      const ctrl2  = fg.controls?.();
      sceneKfPlayRef.current = {
        keyframes: kfs,
        idx: 0,
        startMs: Date.now(),
        fromPos: camera ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : { x: 0, y: 600, z: 0 },
        fromTarget: ctrl2?.target ? { x: ctrl2.target.x, y: ctrl2.target.y, z: ctrl2.target.z } : { x: 0, y: 0, z: 0 },
      };
      setSceneKfPlaying(true);
    } else {
      sceneKfPlayRef.current = null;
      setSceneKfPlaying(false);
    }
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
    // Apply step-0 arrive flags immediately so the first node is ready on play
    const firstStep = steps[0];
    if (firstStep?.selectOnArrive === true) {
      const node = nodeMapRef.current.get(firstStep.nodeId);
      if (node) {
        selectedChainRef.current = [node];
        selectedNodeRef.current  = node;
        setSelectedNode(node);
      }
    }
    if (firstStep?.stareLyricsOnArrive === true) {
      stareLyricsRef.current = true;
      setStareLyrics(true);
    }
    setIsPlaying(true);
  }, [setSelectedNode, setStareLyrics]);

  const stopTour = useCallback(() => {
    setIsPlaying(false);
    tourOrbitRef.current = null;
    applyHighlightRef.current(null);
  }, []);

  const playPath = useCallback(() => {
    if (!pathNodesRef.current.length) return;
    const steps: TourStep[] = pathNodesRef.current.map((p, i) => ({
      id: `path-step-${i}-${p.id}`,
      nodeId: p.id,
      nodeLabel: p.label,
      nodeType: p.type,
      dwellMs: p.dwellMs,
      flyInMs: p.flyInMs,
    }));
    setTourSteps(steps);
    tourStepsRef.current = steps;
    setTourMode(true);
    tourModeRef.current = true;
    startTour();
  }, [startTour]);

  // ── Setlist.fm helpers ────────────────────────────────────────────────────────

  const searchSetlistArtists = useCallback(async (name: string) => {
    if (!name.trim()) return;
    setSetlistSearching(true);
    setSetlistArtists([]);
    setSetlistSelectedArtist(null);
    setSetlistResults([]);
    try {
      const data = await api.get<{ artist?: {mbid: string; name: string; sortName: string}[] }>(
        `/api/setlists/search/artists?name=${encodeURIComponent(name)}`,
      );
      setSetlistArtists(data.artist ?? []);
    } catch { /* ignore — may not have API key */ }
    finally { setSetlistSearching(false); }
  }, []);

  const loadSetlistsForArtist = useCallback(async (mbid: string, name: string) => {
    setSetlistSelectedArtist({ mbid, name });
    setSetlistLoading(true);
    setSetlistResults([]);
    try {
      const data = await api.get<{ setlist?: SetlistEntry[] }>(
        `/api/setlists/artist/${mbid}/setlists?p=1`,
      );
      setSetlistResults(data.setlist ?? []);
    } catch { /* ignore */ }
    finally { setSetlistLoading(false); }
  }, []);

  // Shared helper: match a setlist's song titles to Cinema graph nodes
  const matchSetlistToNodes = useCallback((setlist: SetlistEntry): CinemaNode[] => {
    const songTitles: string[] = [];
    for (const s of setlist.sets.set) {
      for (const song of s.song ?? []) { if (song.name) songTitles.push(song.name); }
    }
    const songNodes = simNodesRef.current.filter(n => n.type === 'song');
    const matched: CinemaNode[] = [];
    for (const title of songTitles) {
      const lower = title.toLowerCase();
      const found = songNodes.find(n => n.label.toLowerCase() === lower)
        ?? songNodes.find(n => n.label.toLowerCase().includes(lower))
        ?? songNodes.find(n => lower.includes(n.label.toLowerCase()));
      if (found && !matched.find(m => m.id === found.id)) matched.push(found);
    }
    return matched;
  }, []);

  const loadSetlistAsTour = useCallback((setlist: SetlistEntry) => {
    setSetlistLoadingTour(setlist.id);
    const matched = matchSetlistToNodes(setlist);
    if (matched.length === 0) { setSetlistLoadingTour(null); return; }
    const steps: TourStep[] = matched.map((n, i) => ({
      id: `setlist-${i}-${n.id}`,
      nodeId: n.id, nodeLabel: n.label, nodeType: n.type,
      dwellMs: DEFAULT_PATH_DWELL_MS, flyInMs: DEFAULT_PATH_FLY_IN_MS,
    }));
    setTourSteps(steps);
    tourStepsRef.current = steps;
    setTourMode(true);
    tourModeRef.current = true;
    setShowSetlistPanel(false);
    setShowTourPlanner(true);
    startTour();
    setSetlistLoadingTour(null);
  }, [startTour, matchSetlistToNodes]);

  const loadSetlistAsPath = useCallback((setlist: SetlistEntry) => {
    setSetlistLoadingTour(setlist.id);
    const matched = matchSetlistToNodes(setlist);
    if (matched.length === 0) { setSetlistLoadingTour(null); return; }
    const nextPath = matched.map(n => ({
      id: n.id, label: n.label, type: n.type,
      dwellMs: DEFAULT_PATH_DWELL_MS, flyInMs: DEFAULT_PATH_FLY_IN_MS,
    }));
    selectedChainRef.current      = matched;
    selectedNodeRef.current       = matched[matched.length - 1] ?? null;
    setSelectedNode(matched[matched.length - 1] ?? null);
    pathNodesRef.current          = nextPath;
    pathNodeSetRef.current        = new Set(nextPath.map(p => p.id));
    setPathNodes(nextPath);
    setPathMode(true);
    pathModeRef.current = true;
    setShowSetlistPanel(false);
    setShowPathPanel(true);
    fgRef.current?.refresh();
    setSetlistLoadingTour(null);
  }, [matchSetlistToNodes]);

  // Tour step mutations
  const handleStepChange = useCallback((id: string, patch: Partial<TourStep>) => {
    setTourSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const handleMoveStep = useCallback((id: string, dir: -1 | 1) => {
    setTourSteps(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      const tmp = arr[idx]!; arr[idx] = arr[next]!; arr[next] = tmp;
      return arr;
    });
  }, []);

  // Save/load sequence handlers
  const handleSaveSequence = useCallback((name: string) => {
    const steps = tourStepsRef.current;
    api.post<NodeSequence>('/api/node-sequences', { name, steps })
      .then(saved => { setSavedSequencesRaw(prev => [...prev, saved]); })
      .catch(() => {
        // Not logged in or API down — persist locally only
        const seq: NodeSequence = {
          id: `local-${Date.now()}`,
          name,
          steps,
          savedAt: new Date().toISOString(),
        };
        setSavedSequencesRaw(prev => {
          const updated = [...prev, seq];
          try { localStorage.setItem('cinema-node-sequences', JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
      });
  }, []);

  const handleLoadSequence = useCallback((seq: NodeSequence) => {
    setTourSteps(seq.steps);
    stopTour();
  }, [stopTour]);

  const handleDeleteSequence = useCallback((id: string) => {
    api.delete(`/api/node-sequences/${id}`)
      .then(() => { setSavedSequencesRaw(prev => prev.filter(s => s.id !== id)); })
      .catch(() => {
        setSavedSequencesRaw(prev => {
          const updated = prev.filter(s => s.id !== id);
          try { localStorage.setItem('cinema-node-sequences', JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
      });
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

        // Director playback takes precedence over everything
        if (directorPlayRef.current && camera) {
          const dp = directorPlayRef.current;
          const kf = dp.keyframes[dp.idx];
          if (ctrl) ctrl.enabled = false;
          if (!kf) {
            directorPlayRef.current = null;
            setDirectorPlaying(false);
          } else {
            const elapsed = Date.now() - dp.startMs;
            const t = easeInOutQuad(Math.min(1, elapsed / kf.durationMs));
            camera.position.set(
              dp.fromPos.x + (kf.position.x - dp.fromPos.x) * t,
              dp.fromPos.y + (kf.position.y - dp.fromPos.y) * t,
              dp.fromPos.z + (kf.position.z - dp.fromPos.z) * t,
            );
            const tx = dp.fromTarget.x + (kf.target.x - dp.fromTarget.x) * t;
            const ty = dp.fromTarget.y + (kf.target.y - dp.fromTarget.y) * t;
            const tz = dp.fromTarget.z + (kf.target.z - dp.fromTarget.z) * t;
            if (ctrl) ctrl.target.set(tx, ty, tz);
            const [dlx, dly, dlz] = stareLookAt(
              camera.position.x, camera.position.y, camera.position.z,
              tx, ty, tz,
              lyricsSpritesRef.current, stareLyricsRef.current, lyricsShowDistRef.current,
            );
            camera.lookAt(dlx, dly, dlz);
            if (t >= 1) {
              if (dp.idx + 1 < dp.keyframes.length) {
                const nextKf = dp.keyframes[dp.idx + 1];
                dp.startMs = Date.now();
                dp.fromPos = { ...kf.position };
                dp.fromTarget = { ...kf.target };
                dp.idx += 1;
                // Apply the incoming keyframe's node selection
                if (nextKf?.selectedChain !== undefined) {
                  applyKfSelectionRef.current(nextKf.selectedChain);
                }
              } else {
                directorPlayRef.current = null;
                setDirectorPlaying(false);
              }
            }
          }
        }

        // Scene-KF loop — runs independently so "Preview loop" works when scene is not playing
        if (sceneKfPlayRef.current && camera && ctrl && !directorPlayRef.current) {
          const skf = sceneKfPlayRef.current;
          const kf  = skf.keyframes[skf.idx];
          ctrl.enabled = false;
          if (kf) {
            const t = easeInOutQuad(Math.min(1, (Date.now() - skf.startMs) / kf.durationMs));
            camera.position.set(
              skf.fromPos.x + (kf.position.x - skf.fromPos.x) * t,
              skf.fromPos.y + (kf.position.y - skf.fromPos.y) * t,
              skf.fromPos.z + (kf.position.z - skf.fromPos.z) * t,
            );
            const tx = skf.fromTarget.x + (kf.target.x - skf.fromTarget.x) * t;
            const ty = skf.fromTarget.y + (kf.target.y - skf.fromTarget.y) * t;
            const tz = skf.fromTarget.z + (kf.target.z - skf.fromTarget.z) * t;
            ctrl.target.set(tx, ty, tz);
            const [slx, sly, slz] = stareLookAt(
              camera.position.x, camera.position.y, camera.position.z,
              tx, ty, tz,
              lyricsSpritesRef.current, stareLyricsRef.current, lyricsShowDistRef.current,
            );
            camera.lookAt(slx, sly, slz);
            if (t >= 1) {
              const nextIdx = (skf.idx + 1) % skf.keyframes.length;
              skf.startMs = Date.now();
              skf.fromPos = { ...kf.position };
              skf.fromTarget = { ...kf.target };
              skf.idx = nextIdx;
            }
          }
        }

        if (ctrl) ctrl.enabled = (!isPlayingRef.current || freeCamRef.current) && directorPlayRef.current === null && sceneKfPlayRef.current === null;

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
                // Blend per-step overrides into global controls for this shot
                const stepControls: CinemaControls = {
                  ...controls,
                  ...(step.orbitSpeed   !== undefined ? { orbitSpeed:      step.orbitSpeed   } : {}),
                  ...(step.approachDist !== undefined ? { approachDist:    step.approachDist } : {}),
                  ...(step.elevation    !== undefined ? { elevationOffset: step.elevation    } : {}),
                  ...(step.orbitMode    !== undefined ? { orbitMode:       step.orbitMode    } : {}),
                };
                if (!tourOrbitRef.current) {
                  const prevLookAt = tourPrevTargetRef.current ?? { x: 0, y: 0, z: 0 };
                  const dwellMs    = Math.round(step.dwellMs / stepControls.speedMultiplier);
                  tourOrbitRef.current = initOrbitState(
                    node.x, node.y ?? 0, node.z ?? 0,
                    camera.position.x, camera.position.y, camera.position.z,
                    elapsed, dwellMs,
                    prevLookAt.x, prevLookAt.y, prevLookAt.z,
                    step.flyInMs ?? 1800,
                  );
                  applyHighlightRef.current(step.nodeId);
                }

                const result = updateOrbitCamera(fg, tourOrbitRef.current, elapsed, stepControls);
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
                    // Apply per-step arrive flags
                    const nextStep = steps[nextIdx];
                    if (nextStep?.selectOnArrive === true) {
                      const arrNode = nodeMapRef.current.get(nextStep.nodeId);
                      if (arrNode) {
                        selectedChainRef.current = [arrNode];
                        selectedNodeRef.current  = arrNode;
                        setSelectedNode(arrNode);
                      }
                    }
                    if (nextStep?.stareLyricsOnArrive === true) {
                      stareLyricsRef.current = true;
                      setStareLyrics(true);
                    }
                  }
                }
              }
            }
          } else {
            // Scene KF loop or free cam disables built-in scene tick
            if (!sceneKfPlayRef.current && !freeCamRef.current) {
              const scene = CINEMA_SCENES[currentIdxRef.current];
              scene?.tick?.(fg, simNodesRef.current, adjRef.current, elapsed, sceneStateRef.current, controls);
            }
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
          // Build O(1) lookup for selected chain nodes (shared by label + lyrics sections)
          const selectedChainSet = new Set(selectedChainRef.current.map(c => c.id));
          for (const n of simNodesRef.current) {
            const sprite = labelMapRef.current.get(n.id);
            if (!sprite) continue;
            if (hiddenTypesRef.current.has(n.type)) { sprite.visible = false; continue; }
            if (n.x == null) { sprite.visible = false; continue; }

            const isSelected = selectedChainSet.has(n.id);
            const showDist = n.type === 'artist' ? ld.artist
              : n.type === 'album' ? ld.album
              : n.type === 'song'  ? ld.song : ld.other;
            const fullDist = Math.round(showDist * 0.32);
            const dx = (n.x ?? 0) - cx, dy = (n.y ?? 0) - cy, dz = (n.z ?? 0) - cz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Visibility gate
            if (isSelected && selectedLabelAlwaysVisibleRef.current) {
              sprite.visible = true;
            } else if (isSelected) {
              sprite.visible = dist < showDist;
            } else {
              sprite.visible = unselectedLabelScaleRef.current > 0 && dist < showDist;
            }
            if (!sprite.visible) continue;

            // Text size (cached to avoid per-frame canvas regeneration)
            const sz = labelTextSizesRef.current;
            const baseSize  = (sz as Record<string, number>)[n.type] ?? sz.tag;
            const scale     = isSelected ? selectedLabelScaleRef.current : unselectedLabelScaleRef.current;
            const desiredTH = baseSize * Math.max(0.01, scale);
            if ((sprite as any)._lastTH !== desiredTH) {
              (sprite as any).textHeight = desiredTH;
              (sprite as any)._lastTH    = desiredTH;
            }

            // Opacity + colour
            let opacity: number;
            if (isSelected && selectedLabelAlwaysVisibleRef.current) {
              opacity = 1.0;
            } else {
              const range = Math.max(1, showDist - fullDist);
              opacity = Math.max(0, Math.min(1, 1 - (dist - fullDist) / range));
              if (!isSelected) opacity *= unselectedLabelOpacityRef.current;
            }
            const a         = Math.round(opacity * 255).toString(16).padStart(2, '0');
            const baseColor = isSelected
              ? (selectedLabelColorOverrideRef.current   || labelTextColorRef.current)
              : (unselectedLabelColorOverrideRef.current || labelTextColorRef.current);
            sprite.color = `${baseColor}${a}`;
            (sprite as any).backgroundColor = labelShowBgRef.current
              ? `rgba(3,7,18,${(labelBgOpacityRef.current * opacity).toFixed(2)})` : false;
            const mat = (sprite as any).material;
            if (mat) mat.depthTest = !labelAlwaysOnTopRef.current;

            // Position label on camera-facing side of node (never occluded by sphere)
            const nx = n.x ?? 0, ny = n.y ?? 0, nz = n.z ?? 0;
            const tcx = cx - nx, tcy = cy - ny, tcz = cz - nz;
            const camLen = Math.sqrt(tcx * tcx + tcy * tcy + tcz * tcz);
            if (camLen > 0) {
              const r      = sphereR(nodeValFor(n.type));
              const offset = r + desiredTH * 0.6 + 3;
              (sprite as any).position.set(
                (tcx / camLen) * offset,
                (tcy / camLen) * offset,
                (tcz / camLen) * offset,
              );
            }
          }

          // Lyrics sprite: distance culling + scroll/progressive reveal
          if (lyricsSpritesRef.current.length > 0) {
            // Pre-compute Saturn ring basis vectors once per frame (all sprites share one plane)
            const isRingMode = ringLyricsModeRef.current;
            let ringU: [number, number, number] = [1, 0, 0];
            let ringV: [number, number, number] = [0, 0, 1];
            let ringAngle = 0;
            if (isRingMode) {
              const incRad = ringInclinationRef.current * Math.PI / 180;
              const azRad  = ringAzimuthRef.current    * Math.PI / 180;
              const rnX = Math.sin(incRad) * Math.cos(azRad);
              const rnY = Math.cos(incRad);
              const rnZ = Math.sin(incRad) * Math.sin(azRad);
              let uX: number, uY: number, uZ: number;
              if (Math.abs(rnY) > 0.9) {
                // Normal nearly vertical — use Z as reference to avoid degenerate cross product
                const len = Math.sqrt(rnX * rnX + rnZ * rnZ);
                if (len > 0.001) { uX = rnZ / len; uY = 0; uZ = -rnX / len; }
                else             { uX = 1; uY = 0; uZ = 0; }
              } else {
                const len = Math.sqrt(rnX * rnX + rnZ * rnZ);
                uX = -rnZ / len; uY = 0; uZ = rnX / len;
              }
              ringU = [uX, uY, uZ];
              ringV = [
                rnY * uZ - rnZ * uY,
                rnZ * uX - rnX * uZ,
                rnX * uY - rnY * uX,
              ];
              ringAngle = (performance.now() - ringStartTimeRef.current) / 1000 * ringRotSpeedRef.current;
            }

            const lyricDistSq       = lyricsShowDistRef.current ** 2;
            const scrollMode        = lyricsScrollModeRef.current;
            const progressiveMode   = lyricsProgressiveModeRef.current;
            const revealPaceMs      = lyricsRevealPaceRef.current * 1000;
            const winSize           = lyricsWindowSizeRef.current;
            const now               = performance.now();
            if (scrollMode && !progressiveMode && now - lyricsScrollLastRef.current > lyricsScrollSpeedRef.current * 1000) {
              lyricsScrollLastRef.current = now;
              lyricsTotalLinesRef.current.forEach((total, songId) => {
                const cur = lyricsScrollOffsetRef.current.get(songId) ?? 0;
                lyricsScrollOffsetRef.current.set(songId, (cur + 1) % Math.max(1, total));
              });
            }
            const selectedOnly  = lyricsSelectedOnlyRef.current;
            const maxLyricNodes = lyricsMaxNodesRef.current;
            const inProximity   = new Set<string>();

            // Pre-pass: find the N node IDs whose owner nodes are closest to camera
            // (prevents stacking when the camera flies through a dense cluster)
            let eligibleLyricSet: Set<string> | null = null;
            if (maxLyricNodes < 999) {
              const inRange: { id: string; dSq: number }[] = [];
              const seenIds = new Set<string>();
              for (const sp of lyricsSpritesRef.current) {
                const id = sp._songId as string;
                if (seenIds.has(id)) continue;
                seenIds.add(id);
                const ownerNode = nodeMapRef.current.get(id);
                if (!ownerNode || ownerNode.x == null) continue;
                const dx = (ownerNode.x ?? 0) - cx, dy = (ownerNode.y ?? 0) - cy, dz = (ownerNode.z ?? 0) - cz;
                const dSq = dx * dx + dy * dy + dz * dz;
                if (dSq <= lyricDistSq) inRange.push({ id, dSq });
              }
              inRange.sort((a, b) => a.dSq - b.dSq);
              eligibleLyricSet = new Set(inRange.slice(0, maxLyricNodes).map(n => n.id));
            }

            for (const sp of lyricsSpritesRef.current) {
              const ownerNode = nodeMapRef.current.get(sp._songId as string);
              if (ownerNode && ownerNode.x != null) {
                if (isRingMode) {
                  // Saturn ring — word sprites flow around the orbital ring
                  const wordIdx  = (sp as any)._wordIdx  !== undefined ? (sp as any)._wordIdx  as number : sp._lineIdx as number;
                  const totalWds = (sp as any)._totalWords !== undefined ? (sp as any)._totalWords as number : (lyricsTotalLinesRef.current.get(sp._songId as string) ?? 1);
                  const θ = (wordIdx / Math.max(1, totalWds))
                    * 2 * Math.PI * (ringArcCoverageRef.current / 360) + ringAngle;
                  const r = ringRadiusRef.current;
                  sp.position.set(
                    (ownerNode.x ?? 0) + r * (Math.cos(θ) * ringU[0] + Math.sin(θ) * ringV[0]),
                    (ownerNode.y ?? 0) + r * (Math.cos(θ) * ringU[1] + Math.sin(θ) * ringV[1]),
                    (ownerNode.z ?? 0) + r * (Math.cos(θ) * ringU[2] + Math.sin(θ) * ringV[2]),
                  );
                  const rth = ringTextSizeRef.current;
                  if ((sp as any)._lastLyricTH !== rth) {
                    (sp as any).textHeight    = rth;
                    (sp as any)._lastLyricTH  = rth;
                  }
                } else {
                  // Normal mode: scattered cloud above the node
                  const lyricAngle = sp._lyricAngle as number;
                  const lyricLi   = sp._lyricLi   as number;
                  sp.position.set(
                    (ownerNode.x ?? 0) + Math.sin(lyricAngle) * 18,
                    (ownerNode.y ?? 0) + 14 + lyricLi * 7,
                    (ownerNode.z ?? 0) + Math.cos(lyricAngle) * 18,
                  );
                  const cth = lyricsTextSizeRef.current;
                  if ((sp as any)._lastLyricTH !== cth) {
                    (sp as any).textHeight   = cth;
                    (sp as any)._lastLyricTH = cth;
                  }
                }
              }

              const pos = sp.position;
              // Gate on node distance — NOT sprite offset position.
              // Using sp.position causes the sprite to fail the range check
              // when the camera is on the far side of the node (the offset
              // adds distance), making lyrics flash in/out as the camera orbits.
              if (!ownerNode || ownerNode.x == null) { sp.visible = false; continue; }
              const ndx = (ownerNode.x ?? 0) - cx;
              const ndy = (ownerNode.y ?? 0) - cy;
              const ndz = (ownerNode.z ?? 0) - cz;
              if (ndx * ndx + ndy * ndy + ndz * ndz > lyricDistSq) {
                sp.visible = false;
                continue;
              }
              void pos; // position still used by Three.js for rendering
              const songId = sp._songId as string;
              // Nearest-N node limiter (prevents stacking when near multiple nodes)
              if (eligibleLyricSet && !eligibleLyricSet.has(songId)) { sp.visible = false; continue; }
              // Per-mode selected-only filter (uses shared selectedChainSet)
              if (isRingMode  && ringSelectedOnlyRef.current && !selectedChainSet.has(songId)) { sp.visible = false; continue; }
              if (!isRingMode && selectedOnly                && !selectedChainSet.has(songId)) { sp.visible = false; continue; }
              inProximity.add(songId);
              if (isRingMode) {
                // Ring rotation provides the "reveal" effect — always show all words
                sp.visible = true;
              } else if (progressiveMode) {
                if (!lyricsProximitySinceRef.current.has(songId)) {
                  lyricsProximitySinceRef.current.set(songId, now);
                }
                const timeNear = now - (lyricsProximitySinceRef.current.get(songId) ?? now);
                const linesRevealed = Math.floor(timeNear / revealPaceMs) + 1;
                sp.visible = (sp._lineIdx as number) < linesRevealed;
              } else if (scrollMode) {
                const offset = lyricsScrollOffsetRef.current.get(songId) ?? 0;
                sp.visible = (sp._lineIdx as number) >= offset && (sp._lineIdx as number) < offset + winSize;
              } else {
                sp.visible = true;
              }
            }
            // Clear proximity timers for songs that left the range
            if (progressiveMode) {
              for (const songId of lyricsProximitySinceRef.current.keys()) {
                if (!inProximity.has(songId)) lyricsProximitySinceRef.current.delete(songId);
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

  // ── Genre cloud spheres (Three.js overlay) ───────────────────────────────────

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !simReady) return;
    const scene3d = fg.scene?.() as THREE.Scene | undefined;
    if (!scene3d) return;

    // Dispose old meshes
    for (const m of genreCloudMeshesRef.current) {
      scene3d.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    genreCloudMeshesRef.current = [];

    if (!genreCloudsEnabled) return;

    const newMeshes: THREE.Mesh[] = [];
    for (const pole of GENRE_CLOUD_POLES) {
      if (hiddenGenreClouds.has(pole.id)) continue;
      const color = new THREE.Color(pole.color);

      // Inner glow core (60% size, 2× opacity)
      const innerGeo = new THREE.SphereGeometry(genreCloudSize * 0.55, 24, 24);
      const innerMat = new THREE.MeshBasicMaterial({
        color, transparent: true,
        opacity: Math.min(1, genreCloudOpacity * 1.8),
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.set(pole.x, pole.y, pole.z);
      scene3d.add(inner);
      newMeshes.push(inner);

      // Outer diffuse shell
      const outerGeo = new THREE.SphereGeometry(genreCloudSize, 28, 28);
      const outerMat = new THREE.MeshBasicMaterial({
        color, transparent: true,
        opacity: genreCloudOpacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
      });
      const outer = new THREE.Mesh(outerGeo, outerMat);
      outer.position.set(pole.x, pole.y, pole.z);
      scene3d.add(outer);
      newMeshes.push(outer);
    }
    genreCloudMeshesRef.current = newMeshes;

    return () => {
      for (const m of newMeshes) {
        scene3d.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    };
  }, [simReady, genreCloudsEnabled, genreCloudOpacity, genreCloudSize, hiddenGenreClouds]);

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

  // ── Lyrics sprites (scene-agnostic — active in any view when showLyrics is on) ───

  useEffect(() => {
    if (!showLyrics || !simNodes.length) {
      cleanupLyricsSprites();
      return;
    }

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
              // Store ALL non-empty lines — slicing happens at sprite creation time
              // so changing lyricsMaxLines can rebuild sprites without re-fetching.
              lyricMap[`song:${s.id}`] = s.lyricText
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);
            }
          }
          lyricsDataCacheRef.current = lyricMap;
        }

        cleanupLyricsSprites();
        const threeScene = fgRef.current?.scene?.();
        if (!threeScene) return;

        const maxLines = lyricsMaxLinesRef.current;
        const isRingModeNow = ringLyricsModeRef.current;
        const newSprites: any[] = [];
        for (const [nodeId, allLines] of Object.entries(lyricMap)) {
          const node = nodeMapRef.current.get(nodeId);
          if (!node || node.x == null) continue;

          if (isRingModeNow) {
            // Ring mode: one sprite per WORD so text flows around the orbital ring
            const words = allLines.slice(0, maxLines)
              .flatMap(l => l.split(/\s+/).filter(w => w.length > 0));
            const totalWords = words.length;
            words.forEach((word, wordIdx) => {
              const sp = new SpriteText(word);
              sp.color = 'rgba(199,210,254,0.72)';
              sp.textHeight = ringTextSizeRef.current;
              sp.fontFace = 'Georgia, serif';
              sp.backgroundColor = 'rgba(3,7,18,0.4)';
              sp.padding = 1;
              if ((sp as any).material) (sp as any).material.depthTest = false;
              (sp as any).position.set(node.x ?? 0, node.y ?? 0, node.z ?? 0);
              (sp as any)._songId     = nodeId;
              (sp as any)._wordIdx    = wordIdx;
              (sp as any)._totalWords = totalWords;
              threeScene.add(sp as any);
              newSprites.push(sp as any);
            });
            lyricsTotalLinesRef.current.set(nodeId, totalWords);
          } else {
            // Normal mode: one sprite per LINE
            const lines = allLines.slice(0, maxLines);
            let visIdx = 0;
            lines.forEach((line, li) => {
              if (!line.trim()) return;
              const sp = new SpriteText(line.slice(0, 60));
              sp.color = 'rgba(199,210,254,0.65)';
              sp.textHeight = lyricsTextSizeRef.current;
              sp.fontFace = 'Georgia, serif';
              sp.backgroundColor = 'rgba(3,7,18,0.5)';
              sp.padding = 1;
              if ((sp as any).material) (sp as any).material.depthTest = false;
              const angle = li * 0.9 + nodeId.charCodeAt(5) * 0.1;
              (sp as any).position.set(
                (node.x ?? 0) + Math.sin(angle) * 18,
                (node.y ?? 0) + 14 + li * 7,
                (node.z ?? 0) + Math.cos(angle) * 18,
              );
              (sp as any)._songId     = nodeId;
              (sp as any)._lineIdx    = visIdx++;
              (sp as any)._lyricAngle = angle;
              (sp as any)._lyricLi    = li;
              threeScene.add(sp as any);
              newSprites.push(sp as any);
            });
            lyricsTotalLinesRef.current.set(nodeId, visIdx);
            lyricsScrollOffsetRef.current.set(nodeId, 0);
          }
        }
        lyricsSpritesRef.current = newSprites;
      } catch (_e) {
        // Lyrics unavailable — continue without them
      }
    };

    const timer = setTimeout(addSprites, 600);
    return () => {
      clearTimeout(timer);
      cleanupLyricsSprites();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLyrics, simNodes, lyricsMaxLines, ringLyricsMode]);

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
    const override = nodeOverridesRef.current[n.id];
    const baseColor = override?.color ?? (currentTheme.nodeColors[n.type] ?? '#4b5563');
    const chain = selectedChainRef.current;
    if (chain.length > 0 && !isPlayingRef.current) {
      const chainIdx = chain.findIndex(c => c.id === n.id);
      if (chainIdx >= 0) {
        return chainIdx === chain.length - 1 ? '#ffffff' : '#7dd3fc';
      }
      const lastId = chain[chain.length - 1]!.id;
      if (adjRef.current.get(lastId)?.has(n.id)) return '#22d3ee';
      return blendHex(baseColor, '#0d1117', selectionDimRef.current);
    }
    return baseColor;
  }, [tourMode, tourHighlightedId, currentTheme]);

  const nodeVal = useCallback((node: object) => {
    const n = node as CinemaNode;
    const sizeMult = nodeOverridesRef.current[n.id]?.sizeMultiplier ?? 1;
    if (tourMode && n.id === tourHighlightedId) return 12 * sizeMult;
    const chain = selectedChainRef.current;
    if (chain.length > 0 && !isPlayingRef.current) {
      const inChain = chain.some(c => c.id === n.id);
      if (inChain) return nodeValFor(n.type) * 1.6 * sizeMult;
    }
    return nodeValFor(n.type) * currentTheme.nodeValMultiplier * sizeMult;
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
    const chain = selectedChainRef.current;
    if (chain.length > 0 && !isPlayingRef.current) {
      // Bright white for links that are part of the chain path
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i]!.id, b = chain[i + 1]!.id;
        if ((srcId === a && tgtId === b) || (srcId === b && tgtId === a)) {
          return 'rgba(255,255,255,0.85)';
        }
      }
      // Dim cyan for links from the last chain node (possible next hops)
      const lastId = chain[chain.length - 1]!.id;
      if (srcId === lastId || tgtId === lastId) return 'rgba(34,211,238,0.4)';
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
    const chain = selectedChainRef.current;
    if (chain.length > 0 && !isPlayingRef.current) {
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i]!.id, b = chain[i + 1]!.id;
        if ((srcId === a && tgtId === b) || (srcId === b && tgtId === a)) return 2.5;
      }
      const lastId = chain[chain.length - 1]!.id;
      if (srcId === lastId || tgtId === lastId) return 1;
      return 0.12;
    }
    return 0.4 * currentThemeRef.current.linkWidthMultiplier;
  }, [tourMode, tourHighlightedId, tourNodeIds, currentTheme]);

  const nodeThreeObject = useCallback((node: object) => {
    const n      = node as CinemaNode;
    const sprite = new SpriteText(n.label);
    sprite.color = '#e2e8f000';
    const sz = labelTextSizesRef.current;
    sprite.textHeight = (sz as Record<string, number>)[n.type] ?? sz.tag;
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
    if (overrideMode) setActiveArrangeMode(overrideMode);
    else if (scene?.arrangeMode) setActiveArrangeMode(scene.arrangeMode);
    const visNodes = simNodesRef.current.filter(n => !hiddenTypesRef.current.has(n.type));
    const adj      = adjRef.current;
    if (mode === 'natural') {
      visNodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });
      didFitRef.current = false;
      fgRef.current.d3ReheatSimulation?.();
    } else {
      animateArrange(visNodes, computeArrangeTargets(visNodes, mode, adj, simLinksRef.current), fgRef.current);
    }
  }, []);

  // ── Director callbacks ────────────────────────────────────────────────────────

  const handleDirectorCapture = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const camera = fg.camera?.();
    const ctrl2  = fg.controls?.();
    if (!camera) return;
    const chainIds = selectedChainRef.current.map(n => n.id);
    const kf: CinemaKeyframe = {
      id: `kf-${Date.now()}`,
      label: `Shot ${directorKeyframes.length + 1}`,
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: ctrl2?.target
        ? { x: ctrl2.target.x, y: ctrl2.target.y, z: ctrl2.target.z }
        : { x: 0, y: 0, z: 0 },
      durationMs: 3000,
      ...(chainIds.length > 0 ? { selectedChain: chainIds } : {}),
    };
    setDirectorKeyframes([...directorKeyframes, kf]);
  }, [directorKeyframes, setDirectorKeyframes]);

  const handleDirectorGoTo = useCallback((kf: CinemaKeyframe) => {
    const fg = fgRef.current;
    if (!fg) return;
    const camera = fg.camera?.();
    const ctrl2  = fg.controls?.();
    if (!camera) return;
    directorPlayRef.current = {
      keyframes: [kf],
      idx: 0,
      startMs: Date.now(),
      fromPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      fromTarget: ctrl2?.target
        ? { x: ctrl2.target.x, y: ctrl2.target.y, z: ctrl2.target.z }
        : { x: 0, y: 0, z: 0 },
    };
  }, []);

  const handleDirectorPlay = useCallback(() => {
    if (!directorKeyframes.length) return;
    const fg = fgRef.current;
    if (!fg) return;
    const camera = fg.camera?.();
    const ctrl2  = fg.controls?.();
    if (!camera) return;
    setIsPlaying(false); // stop scene playback
    // Apply the first keyframe's node selection immediately
    applyKfSelectionRef.current(directorKeyframes[0]?.selectedChain);
    directorPlayRef.current = {
      keyframes: directorKeyframes,
      idx: 0,
      startMs: Date.now(),
      fromPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      fromTarget: ctrl2?.target
        ? { x: ctrl2.target.x, y: ctrl2.target.y, z: ctrl2.target.z }
        : { x: 0, y: 0, z: 0 },
    };
    setDirectorPlaying(true);
  }, [directorKeyframes]);

  const handleDirectorStop = useCallback(() => {
    directorPlayRef.current = null;
    setDirectorPlaying(false);
  }, []);

  // ── Scene camera keyframe callbacks ──────────────────────────────────────────

  const handleSceneCapture = useCallback(() => {
    const scene = CINEMA_SCENES[currentIdxRef.current];
    if (!scene || !fgRef.current) return;
    const camera = fgRef.current.camera?.();
    const ctrl2  = fgRef.current.controls?.();
    if (!camera) return;
    const existing = sceneKeyframesMapRef.current[scene.id] ?? [];
    const kf: CinemaKeyframe = {
      id: `skf-${Date.now()}`,
      label: `Shot ${existing.length + 1}`,
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: ctrl2?.target ? { x: ctrl2.target.x, y: ctrl2.target.y, z: ctrl2.target.z } : { x: 0, y: 0, z: 0 },
      durationMs: 3000,
    };
    const updated = { ...sceneKeyframesMapRef.current, [scene.id]: [...existing, kf] };
    setSceneKeyframesMap(updated);
  }, [setSceneKeyframesMap]);

  const handleSceneKfChange = useCallback((kfs: CinemaKeyframe[]) => {
    const scene = CINEMA_SCENES[currentIdxRef.current];
    if (!scene) return;
    const updated = { ...sceneKeyframesMapRef.current, [scene.id]: kfs };
    setSceneKeyframesMap(updated);
    // If currently playing with this scene's KFs, restart
    if (sceneKfPlayRef.current && kfs.length === 0) {
      sceneKfPlayRef.current = null;
      setSceneKfPlaying(false);
    } else if (sceneKfPlayRef.current && kfs.length > 0) {
      sceneKfPlayRef.current.keyframes = kfs;
    }
  }, [setSceneKeyframesMap]);

  const handleSceneKfPlay = useCallback(() => {
    const scene = CINEMA_SCENES[currentIdxRef.current];
    if (!scene || !fgRef.current) return;
    const kfs = sceneKeyframesMapRef.current[scene.id] ?? [];
    if (!kfs.length) return;
    const camera = fgRef.current.camera?.();
    const ctrl2  = fgRef.current.controls?.();
    if (!camera) return;
    setIsPlaying(false);
    sceneKfPlayRef.current = {
      keyframes: kfs,
      idx: 0,
      startMs: Date.now(),
      fromPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      fromTarget: ctrl2?.target ? { x: ctrl2.target.x, y: ctrl2.target.y, z: ctrl2.target.z } : { x: 0, y: 0, z: 0 },
    };
    setSceneKfPlaying(true);
  }, []);

  const handleSceneKfStop = useCallback(() => {
    sceneKfPlayRef.current = null;
    setSceneKfPlaying(false);
  }, []);

  const handleSceneKfGoTo = useCallback((kf: CinemaKeyframe) => {
    handleDirectorGoTo(kf);
  }, [handleDirectorGoTo]);

  const handleCopySceneToSequence = useCallback(() => {
    const scene = CINEMA_SCENES[currentIdxRef.current];
    if (!scene) return;
    const kfs = sceneKeyframesMapRef.current[scene.id] ?? [];
    if (!kfs.length) return;
    setDirectorKeyframes([...directorKeyframes, ...kfs]);
    setShowDirector(true);
  }, [directorKeyframes, setDirectorKeyframes]);

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

    // Tour add mode: clicking a graph node appends it as a tour step
    if (tourAddModeRef.current && tourModeRef.current) {
      const alreadyInTour = tourStepsRef.current.some(s => s.nodeId === n.id);
      if (!alreadyInTour) {
        setTourSteps(prev => [...prev, {
          id: `step-${Date.now()}-${n.id}`,
          nodeId: n.id,
          nodeLabel: n.label,
          nodeType: n.type,
          dwellMs: 8000,
        }]);
      }
      return;
    }

    // Path mode: adjacency-constrained chain building (mirrors regular chain logic)
    if (pathModeRef.current) {
      const chain = selectedChainRef.current;
      const existingIdx = chain.findIndex(c => c.id === n.id);
      let newChain: CinemaNode[];
      if (existingIdx >= 0) {
        // Truncate to this node, or pop it if it is already the last
        newChain = existingIdx === chain.length - 1
          ? chain.slice(0, -1)
          : chain.slice(0, existingIdx + 1);
      } else {
        const lastNode = chain[chain.length - 1];
        if (chain.length === 0) {
          newChain = [n];
        } else if (lastNode && adjRef.current.get(lastNode.id)?.has(n.id)) {
          newChain = [...chain, n];
        } else {
          newChain = [n]; // not adjacent — start a fresh path
        }
      }
      selectedChainRef.current = newChain;
      const lastInChain = newChain[newChain.length - 1] ?? null;
      selectedNodeRef.current  = lastInChain;
      setSelectedNode(lastInChain);
      // Sync pathNodes from chain, preserving timing for unchanged nodes
      const timingMap = new Map(pathNodesRef.current.map(p => [p.id, { dwellMs: p.dwellMs, flyInMs: p.flyInMs }]));
      const nextPath = newChain.map(cn => {
        const timing = timingMap.get(cn.id);
        return {
          id: cn.id, label: cn.label, type: cn.type,
          dwellMs: timing?.dwellMs ?? DEFAULT_PATH_DWELL_MS,
          flyInMs: timing?.flyInMs ?? DEFAULT_PATH_FLY_IN_MS,
        };
      });
      setPathNodes(nextPath);
      pathNodesRef.current   = nextPath;
      pathNodeSetRef.current = new Set(nextPath.map(p => p.id));
      fgRef.current?.refresh();
      return;
    }

    const chain = selectedChainRef.current;

    // Click on node already in chain → truncate to it (or remove if it's the last)
    const existingIdx = chain.findIndex(c => c.id === n.id);
    if (existingIdx >= 0) {
      const newChain = existingIdx === chain.length - 1
        ? chain.slice(0, -1)
        : chain.slice(0, existingIdx + 1);
      selectedChainRef.current = newChain;
      const lastInChain = newChain[newChain.length - 1] ?? null;
      selectedNodeRef.current = lastInChain;
      setSelectedNode(lastInChain);
      fgRef.current?.refresh();
      return;
    }

    // Determine new chain
    const lastNode = chain[chain.length - 1];
    let newChain: CinemaNode[];
    if (chain.length === 0) {
      newChain = [n];
    } else if (lastNode && adjRef.current.get(lastNode.id)?.has(n.id)) {
      // Adjacent to last chain node → extend
      newChain = [...chain, n];
    } else {
      // Not adjacent → start fresh chain
      newChain = [n];
    }

    selectedChainRef.current = newChain;
    selectedNodeRef.current  = n;
    setSelectedNode(n);
    fgRef.current?.refresh();

    if (!isPlayingRef.current) {
      const ctrl = fgRef.current?.controls?.();
      if (ctrl && n.x != null) {
        orbitAnimRef.current = {
          sx: ctrl.target.x, sy: ctrl.target.y, sz: ctrl.target.z,
          tx: n.x, ty: n.y ?? 0, tz: n.z ?? 0,
          t0: performance.now(), dur: 600,
        };
      }
    }
  }, []);

  const onBackgroundClick = useCallback(() => {
    if (pathModeRef.current) return; // don't clear path on background click
    if (selectedChainRef.current.length === 0 && !selectedNodeRef.current) return;
    selectedChainRef.current = [];
    selectedNodeRef.current  = null;
    setSelectedNode(null);
    fgRef.current?.refresh();
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
      // Update ref immediately (before the useEffect runs after re-render)
      // so reArrange() below reads the correct new set.
      hiddenTypesRef.current = next;
      return next;
    });
    // Re-run arrangement so visible nodes fill the space — no holes.
    reArrange();
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
          nodeOpacity={nodeOpacityUser}
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
          onBackgroundClick={onBackgroundClick}
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
              onClick={() => { setShowDirector(v => !v); setShowAiDirector(false); setShowBandPicker(false); setShowControls(false); setShowPlaylist(false); setShowTourPlanner(false); setShowSetlistPanel(false); }}
              title="Director Mode — build a custom camera sequence"
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                showDirector || directorPlaying ? 'bg-amber-900/60 border-amber-700 text-amber-300' : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              📽️{directorPlaying ? ' ●' : ''}
            </button>
            <button
              onClick={() => { setShowAiDirector(v => !v); setShowDirector(false); setShowBandPicker(false); setShowControls(false); setShowPlaylist(false); setShowTourPlanner(false); setShowSetlistPanel(false); }}
              title="AI Director — describe the view you want"
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                showAiDirector ? 'bg-purple-900/60 border-purple-700 text-purple-300' : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              🤖 AI
            </button>
            <button
              onClick={() => { setShowBandPicker(v => !v); setShowControls(false); setShowDirector(false); setShowPlaylist(false); setShowTourPlanner(false); setShowAiDirector(false); setShowSetlistPanel(false); }}
              className="text-xs bg-gray-900/80 border border-gray-700 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              Bands{selectedBandIds.length > 0 ? ` (${selectedBandIds.length})` : ''}
            </button>
            <button
              onClick={() => {
                const opening = !showTourPlanner;
                setShowTourPlanner(opening);
                if (opening) { setTourMode(true); setShowControls(false); setShowDirector(false); setShowBandPicker(false); setShowPlaylist(false); setShowAiDirector(false); setShowSetlistPanel(false); }
              }}
              title="Node Sequence — fly the camera between nodes"
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                showTourPlanner || (tourMode && tourSteps.length > 0)
                  ? 'bg-indigo-900/60 border-indigo-700 text-indigo-300'
                  : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              🗺{tourSteps.length > 0 ? ` ${tourSteps.length}` : ''}
            </button>
            <button
              onClick={() => {
                const opening = !showPathPanel;
                setShowPathPanel(opening);
                if (opening) { setPathMode(true); pathModeRef.current = true; setShowControls(false); setShowDirector(false); setShowBandPicker(false); setShowPlaylist(false); setShowTourPlanner(false); setShowAiDirector(false); setShowSetlistPanel(false); }
              }}
              title="Path mode — click nodes to build a labeled path"
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                pathMode || showPathPanel
                  ? 'bg-amber-900/60 border-amber-700 text-amber-300'
                  : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              🛤{pathNodes.length > 0 ? ` ${pathNodes.length}` : ''}
            </button>
            <button
              onClick={() => { setShowSetlistPanel(v => !v); setShowControls(false); setShowDirector(false); setShowBandPicker(false); setShowPlaylist(false); setShowTourPlanner(false); setShowAiDirector(false); setShowPathPanel(false); }}
              title="Concert setlists — generate a Cinema tour from a real setlist"
              className={`text-xs border backdrop-blur-sm transition-colors px-3 py-1.5 rounded-lg ${
                showSetlistPanel
                  ? 'bg-green-900/60 border-green-700 text-green-300'
                  : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              🎤
            </button>
            <button
              onClick={() => { setShowControls(v => !v); setShowBandPicker(false); setShowDirector(false); setShowPlaylist(false); setShowTourPlanner(false); setShowAiDirector(false); setShowSetlistPanel(false); }}
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

          {/* ── Path panel ── */}
          {showPathPanel && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-amber-700/60 rounded-xl p-4 backdrop-blur-sm w-72 shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">🛤 Path Mode</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setPathNodes([]);
                      pathNodesRef.current     = [];
                      pathNodeSetRef.current   = new Set();
                      selectedChainRef.current = [];
                      selectedNodeRef.current  = null;
                      setSelectedNode(null);
                      fgRef.current?.refresh();
                    }}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Clear
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pathMode}
                      onChange={(e) => {
                        setPathMode(e.target.checked);
                        pathModeRef.current = e.target.checked;
                        if (!e.target.checked) {
                          setPathNodes([]);
                          pathNodesRef.current     = [];
                          pathNodeSetRef.current   = new Set();
                          selectedChainRef.current = [];
                          selectedNodeRef.current  = null;
                          setSelectedNode(null);
                        }
                        fgRef.current?.refresh();
                      }}
                      className="accent-amber-500"
                    />
                    <span className="text-xs text-amber-300/70">Active</span>
                  </label>
                </div>
              </div>
              {pathNodes.length === 0 ? (
                <p className="text-gray-500 text-xs italic">
                  Click any node to start · cyan nodes are reachable next hops · click chain nodes to truncate
                </p>
              ) : (
                <ol className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {pathNodes.map(({ id, label, dwellMs, flyInMs }, i) => (
                    <li key={id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-500/50 font-mono tabular-nums text-[10px] w-4 shrink-0">{i + 1}</span>
                        <span className="text-gray-300 text-xs truncate flex-1">{label}</span>
                        <button
                          onClick={() => {
                            const next = pathNodes.filter((_, j) => j !== i);
                            setPathNodes(next);
                            pathNodesRef.current   = next;
                            pathNodeSetRef.current = new Set(next.map(p => p.id));
                            const newChain = next
                              .map(p => nodeMapRef.current.get(p.id))
                              .filter((cn): cn is CinemaNode => cn !== undefined);
                            selectedChainRef.current = newChain;
                            const lastNode = newChain[newChain.length - 1] ?? null;
                            selectedNodeRef.current  = lastNode;
                            setSelectedNode(lastNode);
                            fgRef.current?.refresh();
                          }}
                          className="text-gray-600 hover:text-red-400 text-xs shrink-0 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 pl-6">
                        <span className="text-[10px] text-gray-600 shrink-0">✈</span>
                        <select
                          value={flyInMs}
                          onChange={(e) => {
                            const next = pathNodes.map((p, j) => j === i ? { ...p, flyInMs: Number(e.target.value) } : p);
                            setPathNodes(next);
                            pathNodesRef.current = next;
                          }}
                          className="text-[10px] bg-gray-800 border border-gray-700 text-gray-300 rounded px-1 py-0.5"
                        >
                          {FLY_IN_PRESETS.map(ms => (
                            <option key={ms} value={ms}>
                              {ms < 1000 ? `${ms}ms` : `${ms % 1000 === 0 ? ms / 1000 : (ms / 1000).toFixed(1)}s`}
                            </option>
                          ))}
                        </select>
                        <span className="text-[10px] text-gray-600 shrink-0 ml-1">◉</span>
                        <select
                          value={dwellMs}
                          onChange={(e) => {
                            const next = pathNodes.map((p, j) => j === i ? { ...p, dwellMs: Number(e.target.value) } : p);
                            setPathNodes(next);
                            pathNodesRef.current = next;
                          }}
                          className="text-[10px] bg-gray-800 border border-gray-700 text-gray-300 rounded px-1 py-0.5"
                        >
                          {DWELL_PRESETS.map(ms => (
                            <option key={ms} value={ms}>
                              {ms >= 60000 ? '60s' : `${ms / 1000}s`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {pathNodes.length >= 2 && (
                <button
                  onClick={playPath}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium bg-amber-900/40 border border-amber-700/50 text-amber-300 hover:bg-amber-800/50 transition-colors"
                >
                  ▶ Play Path ({pathNodes.length} nodes)
                </button>
              )}
              <p className="text-gray-600 text-[10px] leading-tight">
                ✈ fly-in time · ◉ dwell time · Play converts path to a Tour sequence
              </p>
            </div>
          )}

          {/* ── Setlist panel ── */}
          {showSetlistPanel && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-green-800/60 rounded-xl p-4 backdrop-blur-sm w-80 shadow-2xl space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 80px)' }}>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold text-green-400 uppercase tracking-wide">🎤 Concert Setlists</div>
                <button onClick={() => setShowSetlistPanel(false)} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">
                Search setlist.fm for an artist, pick a concert, and load the setlist as a Cinema Tour — the camera will fly through each song in order.
              </p>

              {/* Artist search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={setlistArtistQuery}
                  onChange={e => setSetlistArtistQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void searchSetlistArtists(setlistArtistQuery); }}
                  placeholder="Artist name…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 px-3 py-1.5 focus:outline-none focus:border-green-600 placeholder-gray-600"
                />
                <button
                  onClick={() => void searchSetlistArtists(setlistArtistQuery)}
                  disabled={setlistSearching || !setlistArtistQuery.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-green-900/50 border border-green-700/50 text-green-300 hover:bg-green-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {setlistSearching ? '…' : 'Search'}
                </button>
              </div>

              {/* Artist results */}
              {setlistArtists.length > 0 && !setlistSelectedArtist && (
                <div className="space-y-1">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Artists</div>
                  {setlistArtists.slice(0, 8).map(a => (
                    <button
                      key={a.mbid}
                      onClick={() => void loadSetlistsForArtist(a.mbid, a.name)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Selected artist + setlist list */}
              {setlistSelectedArtist && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-green-400 font-medium">{setlistSelectedArtist.name}</div>
                    <button
                      onClick={() => { setSetlistSelectedArtist(null); setSetlistResults([]); }}
                      className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      ← Back
                    </button>
                  </div>
                  {setlistLoading && <div className="text-xs text-gray-500 py-2 text-center">Loading setlists…</div>}
                  {!setlistLoading && setlistResults.length === 0 && (
                    <div className="text-xs text-gray-600 py-2 text-center">No setlists found.</div>
                  )}
                  {setlistResults.map(sl => {
                    const songs: string[] = [];
                    for (const s of sl.sets.set) { for (const song of s.song ?? []) { if (song.name) songs.push(song.name); } }
                    const venue = `${sl.venue.name}, ${sl.venue.city.name}`;
                    const matched = songs.filter(title => {
                      const lower = title.toLowerCase();
                      return simNodesRef.current.some(n => n.type === 'song' && (
                        n.label.toLowerCase() === lower || n.label.toLowerCase().includes(lower) || lower.includes(n.label.toLowerCase())
                      ));
                    });
                    return (
                      <div key={sl.id} className="bg-gray-800/60 border border-gray-700/60 rounded-lg p-2.5 space-y-1.5">
                        <div className="text-[11px] font-medium text-gray-200">{sl.eventDate}</div>
                        <div className="text-[10px] text-gray-400 truncate">{venue}</div>
                        <div className="text-[10px] text-gray-500">{songs.length} songs · {matched.length} matched in graph</div>
                        {setlistLoadingTour === sl.id ? (
                          <div className="text-xs text-center text-gray-500 py-1">Loading…</div>
                        ) : matched.length === 0 ? (
                          <div className="text-[10px] text-gray-700 text-center py-1">No songs in graph — load a band first</div>
                        ) : (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => loadSetlistAsTour(sl)}
                              className="flex-1 text-xs py-1.5 rounded-lg bg-green-900/40 border border-green-700/50 text-green-300 hover:bg-green-800/50 transition-colors"
                            >
                              ▶ Tour ({matched.length})
                            </button>
                            <button
                              onClick={() => loadSetlistAsPath(sl)}
                              className="flex-1 text-xs py-1.5 rounded-lg bg-amber-900/40 border border-amber-700/50 text-amber-300 hover:bg-amber-800/50 transition-colors"
                            >
                              🛤 Path ({matched.length})
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[10px] text-gray-700 leading-relaxed">
                Requires SETLISTFM_API_KEY environment variable. Song names are matched against the current Cinema graph — load a band first for best results.
              </p>
            </div>
          )}

          {/* ── Controls panel ── */}
          {showControls && (
            <div className="absolute top-12 right-4 z-40 bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur-sm w-64 shadow-2xl space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 80px)' }}>

              {/* Quick arrangement switcher */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Arrangement</div>
                  <button onClick={() => reArrange()} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">Re-apply</button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {QUICK_ARRANGE_MODES.map(({ mode, emoji, label }) => (
                    <button
                      key={mode}
                      onClick={() => { setActiveArrangeMode(mode); reArrange(mode); }}
                      className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] transition-colors ${
                        activeArrangeMode === mode
                          ? 'bg-indigo-900/60 border border-indigo-700/40 text-indigo-300'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-t border-gray-800 pt-3">Camera Controls</div>

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

              <label className="block space-y-1">
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Pitch bias</span>
                  <span>{cinemaControls.pitchBias > 0 ? `+${cinemaControls.pitchBias}` : cinemaControls.pitchBias}</span>
                </div>
                <input type="range" min={-200} max={200} step={5} value={cinemaControls.pitchBias}
                  onChange={e => updateControl('pitchBias', Number(e.target.value))}
                  className="w-full accent-indigo-500" />
                <div className="text-[10px] text-gray-700">Tilts the orbit look direction — + looks lower, − looks higher</div>
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
                    <span>Lyrics show distance</span>
                    <span>{lyricsShowDist}</span>
                  </div>
                  <input type="range" min={50} max={600} step={10} value={lyricsShowDist}
                    onChange={e => setLyricsShowDist(Number(e.target.value))}
                    className="w-full accent-indigo-500" />
                </label>
                <label className="block space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Lyrics text size</span>
                    <span>{lyricsTextSize.toFixed(1)}</span>
                  </div>
                  <input type="range" min={1} max={10} step={0.2} value={lyricsTextSize}
                    onChange={e => setLyricsTextSize(Number(e.target.value))}
                    className="w-full accent-indigo-500" />
                </label>
                <label className="block space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Lines per node</span>
                    <span>{lyricsMaxLines === 1 ? '1 line' : lyricsMaxLines >= 30 ? 'full' : `${lyricsMaxLines} lines`}</span>
                  </div>
                  <input type="range" min={1} max={30} step={1} value={lyricsMaxLines}
                    onChange={e => setLyricsMaxLines(Number(e.target.value))}
                    className="w-full accent-indigo-500" />
                  <div className="text-[10px] text-gray-700">5 = first verse · 30 = full song (rebuilds sprites)</div>
                </label>
                <label className="block space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Max nodes showing lyrics</span>
                    <span>{lyricsMaxNodes >= 99 ? 'all' : lyricsMaxNodes}</span>
                  </div>
                  <input type="range" min={1} max={10} step={1} value={lyricsMaxNodes}
                    onChange={e => setLyricsMaxNodes(Number(e.target.value))}
                    className="w-full accent-indigo-500" />
                  <div className="text-[10px] text-gray-700">1 = closest node only · prevents text piling when flying near a cluster</div>
                </label>
                {/* Stare-at-lyrics: shift camera lookAt toward nearest lyric during Director / scene-cam playback */}
                <button
                  onClick={() => setStareLyrics(v => !v)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                    stareLyrics ? 'text-indigo-300 bg-indigo-900/30' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${stareLyrics ? 'bg-indigo-400' : 'bg-gray-700'}`} />
                  <span>👁 Stare at lyrics (Director / Scene cam)</span>
                  <span className="ml-auto text-[10px] text-gray-600">{stareLyrics ? 'on' : 'off'}</span>
                </button>
                <div className="text-[10px] text-gray-700 px-0.5">When on, the camera drifts to look toward the nearest lyric sprite during playback.</div>
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

              {/* Genre data source */}
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Genre data source</div>
                <div className="space-y-1">
                  {(['priority', 'community', 'ai'] as GenreSource[]).map(src => (
                    <button key={src} onClick={() => setGenreSource(src)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                        genreSource === src ? 'bg-gray-800 text-gray-200' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${genreSource === src ? 'bg-orange-500' : 'bg-gray-700'}`} />
                      <span>{GENRE_SOURCE_LABELS[src]}</span>
                      {genreSource === src && <span className="ml-auto text-[10px] text-orange-500">active</span>}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-gray-600 leading-snug px-1">
                  Changing source reloads the graph.
                </div>
              </div>

              {/* Genre cloud zones */}
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Genre zones</div>
                  <button
                    onClick={() => setGenreCloudsEnabled(v => !v)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${genreCloudsEnabled ? 'bg-indigo-900 text-indigo-300' : 'bg-gray-800 text-gray-500'}`}
                  >
                    {genreCloudsEnabled ? 'on' : 'off'}
                  </button>
                </div>
                {genreCloudsEnabled && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-14 shrink-0">Opacity</span>
                      <input type="range" min="1" max="40" value={Math.round(genreCloudOpacity * 100)}
                        onChange={e => setGenreCloudOpacity(Number(e.target.value) / 100)}
                        className="flex-1 accent-indigo-500" />
                      <span className="text-[10px] text-gray-600 w-8 text-right">{Math.round(genreCloudOpacity * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-14 shrink-0">Size</span>
                      <input type="range" min="40" max="300" value={genreCloudSize}
                        onChange={e => setGenreCloudSize(Number(e.target.value))}
                        className="flex-1 accent-indigo-500" />
                      <span className="text-[10px] text-gray-600 w-8 text-right">{genreCloudSize}</span>
                    </div>
                    <div className="text-[10px] text-gray-600 mb-1">Show / hide zones</div>
                    <div className="grid grid-cols-2 gap-1">
                      {GENRE_CLOUD_POLES.map(pole => {
                        const hidden = hiddenGenreClouds.has(pole.id as GenreCloudId);
                        return (
                          <button key={pole.id}
                            onClick={() => setHiddenGenreClouds(prev => {
                              const next = new Set(prev);
                              if (next.has(pole.id as GenreCloudId)) next.delete(pole.id as GenreCloudId); else next.add(pole.id as GenreCloudId);
                              return next;
                            })}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] transition-colors ${hidden ? 'text-gray-700' : 'text-gray-300'}`}
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={hidden ? { background: '#374151' } : { background: pole.color }} />
                            <span className={hidden ? 'line-through' : ''}>{pole.id.charAt(0).toUpperCase() + pole.id.slice(1)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-gray-600 leading-snug">
                      Use Genre Radar arrange to position songs in their genre zones.
                    </div>
                  </div>
                )}
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
                    {/* Selected node only */}
                    <button
                      onClick={() => setLyricsSelectedOnly(v => !v)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                        lyricsSelectedOnly ? 'text-green-300 bg-green-900/20' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${lyricsSelectedOnly ? 'bg-green-400' : 'bg-gray-700'}`} />
                      <span>Selected node only</span>
                      <span className="ml-auto text-[10px] text-gray-600">{lyricsSelectedOnly ? 'on' : 'off'}</span>
                    </button>

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

                    {/* Progressive reveal mode */}
                    <button
                      onClick={() => setLyricsProgressiveMode(v => !v)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                        lyricsProgressiveMode ? 'text-amber-300 bg-amber-900/20' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${lyricsProgressiveMode ? 'bg-amber-400' : 'bg-gray-700'}`} />
                      <span>Progressive reveal</span>
                      <span className="ml-auto text-[10px] text-gray-600">{lyricsProgressiveMode ? 'on' : 'off'}</span>
                    </button>
                    {lyricsProgressiveMode && (
                      <label className="block space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-400">
                          <span>Reveal pace</span>
                          <span>{lyricsRevealPace}s / line</span>
                        </div>
                        <input type="range" min={0.5} max={8} step={0.5} value={lyricsRevealPace}
                          onChange={e => setLyricsRevealPace(Number(e.target.value))}
                          className="w-full accent-amber-500" />
                        <div className="text-[10px] text-gray-700">Linger near a node — lines appear one by one</div>
                      </label>
                    )}

                    {/* Saturn ring lyrics */}
                    <div className="border-t border-gray-800/60 pt-2 space-y-1">
                      <button
                        onClick={() => setRingLyricsMode(v => !v)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                          ringLyricsMode ? 'text-cyan-300 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${ringLyricsMode ? 'bg-cyan-400' : 'bg-gray-700'}`} />
                        <span>🪐 Saturn ring lyrics</span>
                        <span className="ml-auto text-[10px] text-gray-600">{ringLyricsMode ? 'on' : 'off'}</span>
                      </button>
                      {ringLyricsMode && (
                        <div className="space-y-2 pl-1 pt-1">
                          <label className="block space-y-1">
                            <div className="flex justify-between text-[10px] text-gray-400">
                              <span>Ring radius</span><span>{ringRadius}</span>
                            </div>
                            <input type="range" min={20} max={300} step={5} value={ringRadius}
                              onChange={e => setRingRadius(Number(e.target.value))}
                              className="w-full accent-cyan-500" />
                          </label>
                          <label className="block space-y-1">
                            <div className="flex justify-between text-[10px] text-gray-400">
                              <span>Inclination</span><span>{ringInclination}°</span>
                            </div>
                            <input type="range" min={0} max={90} step={1} value={ringInclination}
                              onChange={e => setRingInclination(Number(e.target.value))}
                              className="w-full accent-cyan-500" />
                            <div className="text-[10px] text-gray-700">0° flat / equatorial · 90° vertical</div>
                          </label>
                          <label className="block space-y-1">
                            <div className="flex justify-between text-[10px] text-gray-400">
                              <span>Ring angle (azimuth)</span><span>{ringAzimuth}°</span>
                            </div>
                            <input type="range" min={0} max={360} step={5} value={ringAzimuth}
                              onChange={e => setRingAzimuth(Number(e.target.value))}
                              className="w-full accent-cyan-500" />
                          </label>
                          <label className="block space-y-1">
                            <div className="flex justify-between text-[10px] text-gray-400">
                              <span>Arc coverage</span><span>{ringArcCoverage}°</span>
                            </div>
                            <input type="range" min={30} max={360} step={10} value={ringArcCoverage}
                              onChange={e => setRingArcCoverage(Number(e.target.value))}
                              className="w-full accent-cyan-500" />
                            <div className="text-[10px] text-gray-700">360° full ring · less = open arc</div>
                          </label>
                          <label className="block space-y-1">
                            <div className="flex justify-between text-[10px] text-gray-400">
                              <span>Rotation speed</span>
                              <span>{ringRotSpeed === 0 ? 'static' : `${ringRotSpeed.toFixed(2)} r/s`}</span>
                            </div>
                            <input type="range" min={0} max={1.5} step={0.01} value={ringRotSpeed}
                              onChange={e => setRingRotSpeed(Number(e.target.value))}
                              className="w-full accent-cyan-500" />
                          </label>
                          <label className="block space-y-1">
                            <div className="flex justify-between text-[10px] text-gray-400">
                              <span>Text size</span><span>{ringTextSize.toFixed(1)}</span>
                            </div>
                            <input type="range" min={0.5} max={8} step={0.2} value={ringTextSize}
                              onChange={e => setRingTextSize(Number(e.target.value))}
                              className="w-full accent-cyan-500" />
                          </label>
                          <button
                            onClick={() => setRingSelectedOnly(v => !v)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                              ringSelectedOnly ? 'text-cyan-300 bg-cyan-900/20' : 'text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${ringSelectedOnly ? 'bg-cyan-400' : 'bg-gray-700'}`} />
                            <span>Selected nodes only</span>
                            <span className="ml-auto text-[10px] text-gray-600">{ringSelectedOnly ? 'on' : 'off'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Label styling */}
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Label Text Sizes</div>
                  <button onClick={() => setLabelTextSizes({ ...DEFAULT_LABEL_TEXT_SIZES })}
                    className="text-[10px] text-gray-700 hover:text-gray-500">reset</button>
                </div>
                <div className="space-y-1">
                  {LABEL_SIZE_ROWS.map((row, i) =>
                    row === null
                      ? <div key={`div-${i}`} className="border-t border-gray-800/60 my-0.5" />
                      : (
                        <div key={row.key} className="grid items-center gap-1" style={{ gridTemplateColumns: '5.5rem 1fr 2.5rem' }}>
                          <span className="text-[10px] text-gray-500 truncate" title={row.name}>{row.emoji} {row.name}</span>
                          <input
                            type="range" min={row.min} max={row.max} step={0.5}
                            value={labelTextSizes[row.key]}
                            onChange={e => setLabelTextSizes(prev => ({ ...prev, [row.key]: Number(e.target.value) }))}
                            className="w-full accent-indigo-500 h-0.5"
                          />
                          <span className="text-[10px] text-gray-600 text-right tabular-nums">{labelTextSizes[row.key].toFixed(1)}</span>
                        </div>
                      )
                  )}
                </div>
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

              {/* Label states: selected vs unselected appearance */}
              <div className="border-t border-gray-800 pt-3 space-y-3">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Label States</div>

                {/* Unselected nodes */}
                <div className="space-y-1.5">
                  <div className="text-[10px] text-gray-500 font-medium">Unselected nodes</div>
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Scale{unselectedLabelScale === 0 ? ' — hidden' : ''}</span>
                      <span>{unselectedLabelScale.toFixed(2)}×</span>
                    </div>
                    <input type="range" min={0} max={2} step={0.05} value={unselectedLabelScale}
                      onChange={e => setUnselectedLabelScale(Number(e.target.value))}
                      className="w-full accent-gray-500" />
                    <div className="text-[10px] text-gray-700">0 = hide all unselected labels</div>
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Opacity</span><span>{Math.round(unselectedLabelOpacity * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.05} value={unselectedLabelOpacity}
                      onChange={e => setUnselectedLabelOpacity(Number(e.target.value))}
                      className="w-full accent-gray-500" />
                  </label>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] text-gray-400 flex-1">Color</span>
                    <input type="color"
                      value={unselectedLabelColorOverride || labelTextColor}
                      onChange={e => setUnselectedLabelColorOverride(e.target.value)}
                      className="w-8 h-5 rounded cursor-pointer border-0 bg-transparent" />
                    {unselectedLabelColorOverride && (
                      <button onClick={() => setUnselectedLabelColorOverride('')}
                        className="text-[10px] text-gray-600 hover:text-gray-400">reset</button>
                    )}
                  </div>
                </div>

                {/* Selected / path nodes */}
                <div className="space-y-1.5 border-t border-gray-800/60 pt-2">
                  <div className="text-[10px] text-gray-500 font-medium">Selected / Path nodes</div>
                  <label className="block space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Scale</span><span>{selectedLabelScale.toFixed(2)}×</span>
                    </div>
                    <input type="range" min={0.5} max={3} step={0.05} value={selectedLabelScale}
                      onChange={e => setSelectedLabelScale(Number(e.target.value))}
                      className="w-full accent-amber-500" />
                  </label>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] text-gray-400 flex-1">Color</span>
                    <input type="color"
                      value={selectedLabelColorOverride || labelTextColor}
                      onChange={e => setSelectedLabelColorOverride(e.target.value)}
                      className="w-8 h-5 rounded cursor-pointer border-0 bg-transparent" />
                    {selectedLabelColorOverride && (
                      <button onClick={() => setSelectedLabelColorOverride('')}
                        className="text-[10px] text-gray-600 hover:text-gray-400">reset</button>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedLabelAlwaysVisible(v => !v)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                      selectedLabelAlwaysVisible ? 'text-amber-300 bg-amber-900/20' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${selectedLabelAlwaysVisible ? 'bg-amber-400' : 'bg-gray-700'}`} />
                    <span>Always visible</span>
                    <span className="ml-auto text-[10px] text-gray-600">{selectedLabelAlwaysVisible ? 'on' : 'off'}</span>
                  </button>
                </div>
                <div className="text-[10px] text-gray-700 leading-snug">
                  Applies when a chain or path is active. Unselected scale 0 hides all other labels.
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

              {/* Node opacity */}
              <div className="border-t border-gray-800 pt-3">
                <label className="block space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Node opacity</span><span>{Math.round(nodeOpacityUser * 100)}%</span>
                  </div>
                  <input type="range" min={0.05} max={1} step={0.05} value={nodeOpacityUser}
                    onChange={e => setNodeOpacityUser(Number(e.target.value))}
                    className="w-full accent-indigo-500" />
                  <div className="text-[10px] text-gray-600">Lower = more transparent nodes · resets with theme</div>
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

              {/* Tags with descriptions — song nodes only */}
              {selectedNode.id.startsWith('song:') && selectedNodeTags.length > 0 && (
                <div className="space-y-2 mb-3 border-t border-gray-800 pt-2">
                  <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1">Tags</div>
                  {selectedNodeTags.map((t) => (
                    <div key={t.name} className="space-y-0.5">
                      <span className="inline-block text-[10px] font-medium text-cyan-400 bg-cyan-950/60 rounded px-1.5 py-0.5">{t.name}</span>
                      {t.description && (
                        <p className="text-[9px] text-gray-500 leading-snug pl-1">{t.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Per-node visual overrides */}
              {(() => {
                const ov = nodeOverrides[selectedNode.id];
                const defaultColor = currentTheme.nodeColors[selectedNode.type] ?? '#4b5563';
                return (
                  <div className="border-t border-gray-800 pt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-gray-600 uppercase tracking-wide">Visual Override</div>
                      {ov && (
                        <button
                          onClick={() => {
                            const next = { ...nodeOverrides };
                            delete next[selectedNode.id];
                            setNodeOverrides(next);
                          }}
                          className="text-[10px] text-red-700 hover:text-red-500 transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 flex-1">Color</span>
                      <input
                        type="color"
                        value={ov?.color ?? defaultColor}
                        onChange={e => {
                          const existingOv = nodeOverrides[selectedNode.id] ?? {};
                          setNodeOverrides({ ...nodeOverrides, [selectedNode.id]: { ...existingOv, color: e.target.value } });
                        }}
                        className="w-8 h-5 rounded cursor-pointer border-0 bg-transparent"
                      />
                      {ov?.color && (
                        <button
                          onClick={() => {
                            const existingOv = nodeOverrides[selectedNode.id] ?? {};
                            const next = { ...existingOv };
                            delete next.color;
                            if (Object.keys(next).length === 0) {
                              const allOverrides = { ...nodeOverrides };
                              delete allOverrides[selectedNode.id];
                              setNodeOverrides(allOverrides);
                            } else {
                              setNodeOverrides({ ...nodeOverrides, [selectedNode.id]: next });
                            }
                          }}
                          className="text-[10px] text-gray-700 hover:text-gray-400"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Size</span>
                        <span>{(ov?.sizeMultiplier ?? 1).toFixed(1)}×</span>
                      </div>
                      <input
                        type="range" min={0.2} max={5} step={0.1}
                        value={ov?.sizeMultiplier ?? 1}
                        onChange={e => {
                          const existingOv = nodeOverrides[selectedNode.id] ?? {};
                          setNodeOverrides({ ...nodeOverrides, [selectedNode.id]: { ...existingOv, sizeMultiplier: Number(e.target.value) } });
                        }}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>
                );
              })()}

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
              {isPlaying && (
                <button
                  onClick={() => setFreeCam(v => !v)}
                  title={freeCam ? 'Free cam — click to restore scene camera' : 'Lock camera to scene path'}
                  className={`text-xs transition-colors px-2 py-1 rounded ${freeCam ? 'text-amber-300 bg-amber-900/30' : 'text-gray-600 hover:text-gray-300'}`}
                >
                  {freeCam ? '🕹 Free' : '🎥'}
                </button>
              )}
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

      {/* ── Director panel ── */}
      {showDirector && !socialMode && (
        <div
          className="absolute bottom-20 left-4 z-40 bg-gray-900/95 border border-amber-800/40 rounded-xl p-3 backdrop-blur-sm w-72 shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: 'calc(100dvh - 140px)' }}
        >
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">📽️ Director Mode</div>
            {directorPlaying && (
              <span className="text-[10px] text-red-400 animate-pulse font-medium">● Recording</span>
            )}
          </div>
          <CameraDirector
            keyframes={directorKeyframes}
            setKeyframes={setDirectorKeyframes}
            isPlaying={directorPlaying}
            onCapture={handleDirectorCapture}
            onPlay={handleDirectorPlay}
            onStop={handleDirectorStop}
            onGoTo={handleDirectorGoTo}
            currentSceneId={currentScene?.id ?? null}
            currentSceneName={currentScene ? `${currentScene.emoji} ${currentScene.name}` : null}
            sceneKeyframes={currentScene ? (sceneKeyframesMap[currentScene.id] ?? []) : []}
            isSceneKfPlaying={sceneKfPlaying}
            onSceneCapture={handleSceneCapture}
            onSceneKfPlay={handleSceneKfPlay}
            onSceneKfStop={handleSceneKfStop}
            onSceneKfGoTo={handleSceneKfGoTo}
            onSceneKeyframesChange={handleSceneKfChange}
            onCopyToSequence={handleCopySceneToSequence}
          />
        </div>
      )}

      {/* ── Sequence (Tour) planner — right-side panel accessible from top toolbar ── */}
      {showTourPlanner && !socialMode && (
        <div
          className="absolute top-12 right-4 z-40 bg-gray-900/97 border border-indigo-800/50 rounded-xl p-3 backdrop-blur-sm w-80 shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: 'calc(100dvh - 80px)' }}
        >
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide">🗺 Node Sequence</div>
            <div className="flex items-center gap-2">
              {isPlaying && tourMode && (
                <span className="text-[10px] text-red-400 animate-pulse font-medium">● Playing</span>
              )}
              <button onClick={() => setShowTourPlanner(false)} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
            </div>
          </div>
          <div className="text-[10px] text-gray-600 mb-2 shrink-0">
            Click 🖱 then click graph nodes to build a flight path. Fly-in ✈ = travel time, ◉ = time at node.
          </div>
          <TourPlanner
            nodes={simNodes}
            steps={tourSteps}
            isPlaying={isPlaying && tourMode}
            currentStepIdx={tourStepIdx}
            isAddMode={tourAddMode}
            onAddStep={step => setTourSteps(prev => [...prev, step])}
            onRemoveStep={id => setTourSteps(prev => prev.filter(s => s.id !== id))}
            onStepChange={handleStepChange}
            onMoveStep={handleMoveStep}
            onPlay={startTour}
            onStop={stopTour}
            onClear={() => { setTourSteps([]); stopTour(); }}
            onToggleAddMode={() => setTourAddMode(v => !v)}
            savedSequences={savedSequences}
            onSaveSequence={handleSaveSequence}
            onLoadSequence={handleLoadSequence}
            onDeleteSequence={handleDeleteSequence}
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

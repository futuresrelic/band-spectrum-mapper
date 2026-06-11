/**
 * GraphHuntPage — 3D lyrical word-hunt game.
 * Navigate a 3D force graph of songs and lyric keywords.
 * Start at a random song node, find the hidden target keyword — one hop at a time.
 *
 * Extra features:
 *  - Proximity labels: node names fade in when the camera is within ~120 units
 *  - Explore mode (setup phase): click any node to highlight its neighbourhood
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';
import type { GraphData } from '../api/songNodes';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HuntNode {
  id: string;
  label: string;
  type: string;
  // Mutated by d3-force simulation:
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number; fy?: number; fz?: number;
}

interface HuntLink {
  source: string | HuntNode;
  target: string | HuntNode;
  type: string;
}

interface Band { id: string; name: string }

// ── WASD flight helpers (inline math, no 'three' import needed) ───────────────

function applyQuat(
  vx: number, vy: number, vz: number,
  qx: number, qy: number, qz: number, qw: number,
): [number, number, number] {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

function normalise(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}

// ── BFS helpers ───────────────────────────────────────────────────────────────

function buildAdj(links: HuntLink[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const link of links) {
    const s = typeof link.source === 'string' ? link.source : link.source.id;
    const t = typeof link.target === 'string' ? link.target : link.target.id;
    if (!s || !t) continue;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s)!.add(t);
    adj.get(t)!.add(s);
  }
  return adj;
}

function bfsDist(adj: Map<string, Set<string>>, from: string, to: string): number {
  if (from === to) return 0;
  const visited = new Set([from]);
  const q: [string, number][] = [[from, 0]];
  while (q.length) {
    const [n, d] = q.shift()!;
    for (const nb of adj.get(n) ?? []) {
      if (nb === to) return d + 1;
      if (!visited.has(nb)) { visited.add(nb); q.push([nb, d + 1]); }
    }
  }
  return Infinity;
}

function pickTarget(
  adj: Map<string, Set<string>>,
  start: string,
  kwIds: string[],
): { id: string } | null {
  const kwSet = new Set(kwIds);
  const visited = new Set([start]);
  const q: [string, number][] = [[start, 0]];
  const candidates: string[] = [];
  while (q.length) {
    const [n, d] = q.shift()!;
    if (d > 8) continue;
    if (d >= 3 && kwSet.has(n)) candidates.push(n);
    for (const nb of adj.get(n) ?? []) {
      if (!visited.has(nb)) { visited.add(nb); q.push([nb, d + 1]); }
    }
  }
  if (!candidates.length) return null;
  return { id: candidates[Math.floor(Math.random() * candidates.length)]! };
}

function linkEndId(end: string | HuntNode): string {
  return typeof end === 'string' ? end : end.id;
}

// ── Visual helpers ────────────────────────────────────────────────────────────

const BASE_COLOR: Record<string, string> = {
  song: '#6366f1', keyword: '#374151',
  album: '#8b5cf6', artist: '#f59e0b',
  theme: '#10b981', tag: '#06b6d4', emotion: '#ec4899',
};

// Explore mode (setup phase, node selected)
// Non-connected nodes are returned near-black to simulate dimming without needing per-node opacity
function exploreNodeColor(nodeId: string, selectedId: string, adj: Map<string, Set<string>>): string {
  if (nodeId === selectedId) return '#ffffff';
  if (adj.get(selectedId)?.has(nodeId)) return '#22d3ee';
  return '#0d1117'; // near-black — visually dims without opacity prop
}

// Game mode
function gameNodeColor(
  nodeId: string,
  nodeType: string,
  currentId: string,
  targetId: string,
  adj: Map<string, Set<string>>,
  revealed: boolean,
): string {
  if (nodeId === currentId) return '#fbbf24';
  if (nodeId === targetId && revealed) return '#22c55e';
  if (currentId && adj.get(currentId)?.has(nodeId)) {
    return nodeType === 'keyword' ? '#22d3ee' : '#38bdf8';
  }
  return BASE_COLOR[nodeType] ?? '#4b5563';
}

function computeNodeVal(nodeType: string, nodeId: string, currentId: string): number {
  if (nodeId === currentId) return 8;
  switch (nodeType) {
    case 'artist': return 6;
    case 'album': return 4;
    case 'keyword': return 3;
    default: return 2;
  }
}

interface HotColdEntry {
  max: number;
  emoji: string;
  label: string;
  textCls: string;
  borderCls: string;
  bgCls: string;
}

const HOT_COLD: HotColdEntry[] = [
  { max: 1, emoji: '🔥', label: 'BURNING', textCls: 'text-red-400',    borderCls: 'border-red-500/50',    bgCls: 'bg-red-950/40' },
  { max: 2, emoji: '♨️', label: 'HOT',     textCls: 'text-orange-400', borderCls: 'border-orange-500/50', bgCls: 'bg-orange-950/40' },
  { max: 3, emoji: '☀️', label: 'WARM',    textCls: 'text-yellow-400', borderCls: 'border-yellow-500/50', bgCls: 'bg-yellow-950/40' },
  { max: 4, emoji: '🌡️', label: 'TEPID',   textCls: 'text-yellow-600', borderCls: 'border-yellow-700/50', bgCls: 'bg-yellow-950/30' },
  { max: 5, emoji: '💨', label: 'COOL',    textCls: 'text-blue-400',   borderCls: 'border-blue-500/50',   bgCls: 'bg-blue-950/40' },
  { max: Infinity, emoji: '❄️', label: 'COLD', textCls: 'text-cyan-400', borderCls: 'border-cyan-700/50', bgCls: 'bg-cyan-950/30' },
];

function getHotCold(dist: number): HotColdEntry {
  return HOT_COLD.find((h) => dist <= h.max) ?? HOT_COLD[HOT_COLD.length - 1]!;
}

// ── API ───────────────────────────────────────────────────────────────────────

function fetchScopes(): Promise<{ bands: Band[] }> {
  return api.get('/api/public/graph/scopes');
}

function fetchLyricalGraph(bandIds: string[]): Promise<GraphData> {
  const qs = new URLSearchParams({ preset: 'lyrical-dna' });
  if (bandIds.length) qs.set('bandIds', bandIds.join(','));
  return api.get(`/api/public/graph?${qs}`);
}

// ── Proximity label defaults ──────────────────────────────────────────────────

const DEFAULT_LABEL_SHOW = 400;
const DEFAULT_LABEL_FULL = 150;

// nodeRelSize is the library default (4). Sphere radius = nodeRelSize * cbrt(nodeVal).
const NODE_REL_SIZE = 4;
function sphereRadius(nodeVal: number) { return NODE_REL_SIZE * Math.cbrt(nodeVal); }

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'playing' | 'won';

export default function GraphHuntPage() {
  const { user } = useAuth();
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [targetWord, setTargetWord] = useState('');
  const [moves, setMoves] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [ghSaved, setGhSaved] = useState(false);
  const [ghRank, setGhRank] = useState<number | null>(null);
  const [distance, setDistance] = useState(Infinity);
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState('');
  const [simReady, setSimReady] = useState(false);
  const [huntNodes, setHuntNodes] = useState<HuntNode[]>([]);
  const [huntLinks, setHuntLinks] = useState<HuntLink[]>([]);
  // Explore mode: which node is selected in setup phase
  const [exploreNode, setExploreNode] = useState<HuntNode | null>(null);
  // Graph controls panel
  const [showControls, setShowControls] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [labelShowDist, setLabelShowDist] = useState(DEFAULT_LABEL_SHOW);
  const [labelFullDist, setLabelFullDist] = useState(DEFAULT_LABEL_FULL);
  const [nodeScale, setNodeScale] = useState(1);
  const [linkOpacityVal, setLinkOpacityVal] = useState(0.6);

  // Refs — read inside callbacks to avoid stale closures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const adjRef = useRef(new Map<string, Set<string>>());
  const currentRef = useRef('');
  const targetRef = useRef('');
  const revealedRef = useRef(false);
  const phaseRef = useRef<Phase>('setup');
  const exploreRef = useRef<HuntNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Map nodeId → SpriteText label for proximity updates (typed as any to access inherited Object3D fields)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelMapRef = useRef(new Map<string, any>());
  // Mirror controls state in refs so the rAF loop always reads current values
  const labelShowDistRef = useRef(DEFAULT_LABEL_SHOW);
  const labelFullDistRef = useRef(DEFAULT_LABEL_FULL);
  const showLabelsRef    = useRef(true);
  const didFitRef        = useRef(false);
  const graphDivRef      = useRef<HTMLDivElement>(null);
  const orbitAnimRef     = useRef<{
    sx: number; sy: number; sz: number;
    tx: number; ty: number; tz: number;
    t0: number; dur: number;
  } | null>(null);

  const { data: scopes } = useQuery({
    queryKey: ['explore-scopes'],
    queryFn: fetchScopes,
  });

  const { data: graphData, isFetching } = useQuery({
    queryKey: ['graph-hunt-data', selectedBandIds.join(',')],
    queryFn: () => fetchLyricalGraph(selectedBandIds),
    enabled: selectedBandIds.length > 0,
  });

  const { data: ghLb = [] } = useQuery<{ rank: number; playerName: string; score: number; moves: number }[]>({
    queryKey: ['graph-hunt-scores'],
    queryFn: () => api.get('/api/graph-hunt/scores?limit=10'),
    enabled: phase === 'won',
    staleTime: 30_000,
  });

  // Keep control refs in sync with slider state (rAF loop reads refs)
  useEffect(() => { labelShowDistRef.current = labelShowDist; }, [labelShowDist]);
  useEffect(() => { labelFullDistRef.current = labelFullDist; }, [labelFullDist]);
  useEffect(() => { showLabelsRef.current = showLabels; }, [showLabels]);

  // Build hunt graph whenever API data changes
  useEffect(() => {
    if (!graphData) return;
    setSimReady(false);
    didFitRef.current = false;
    labelMapRef.current.clear();
    const nodes: HuntNode[] = graphData.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: HuntLink[] = graphData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.type }));
    setHuntNodes(nodes);
    setHuntLinks(links);
    adjRef.current = buildAdj(links);
  }, [graphData]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [phase]);

  // rAF loop: WASD flight + proximity label opacity
  useEffect(() => {
    if (!huntNodes.length) return;
    const keys = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keys.add(e.key.toLowerCase());
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let rafId: number;

    const tick = () => {
      const fg = fgRef.current;
      if (fg) {
        const camera = fg.camera?.();
        const controls = fg.controls?.();

        // ── Orbit target animation ──
        const oa = orbitAnimRef.current;
        if (oa && controls) {
          const raw = Math.min(1, (performance.now() - oa.t0) / oa.dur);
          const et = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          controls.target.x = oa.sx + (oa.tx - oa.sx) * et;
          controls.target.y = oa.sy + (oa.ty - oa.sy) * et;
          controls.target.z = oa.sz + (oa.tz - oa.sz) * et;
          if (raw >= 1) orbitAnimRef.current = null;
        }

        // ── WASD flight ──
        if (keys.size && camera && controls) {
          const p = camera.position;
          const q = camera.quaternion;
          const speed = Math.max(3, Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) * 0.015);
          const [fx, fy, fz] = normalise(...applyQuat(0, 0, -1, q.x, q.y, q.z, q.w));
          const [rx, ry, rz] = normalise(...applyQuat(1, 0,  0, q.x, q.y, q.z, q.w));
          let dx = 0, dy = 0, dz = 0;
          if (keys.has('w') || keys.has('arrowup'))    { dx += fx * speed; dy += fy * speed; dz += fz * speed; }
          if (keys.has('s') || keys.has('arrowdown'))  { dx -= fx * speed; dy -= fy * speed; dz -= fz * speed; }
          if (keys.has('a') || keys.has('arrowleft'))  { dx -= rx * speed; dy -= ry * speed; dz -= rz * speed; }
          if (keys.has('d') || keys.has('arrowright')) { dx += rx * speed; dy += ry * speed; dz += rz * speed; }
          if (keys.has('q')) dy += speed * 0.6;
          if (keys.has('e')) dy -= speed * 0.6;
          p.x += dx; p.y += dy; p.z += dz;
          if (controls.target) { controls.target.x += dx; controls.target.y += dy; controls.target.z += dz; }
        }

        // ── Proximity labels ──
        if (camera) {
          const cx = camera.position.x;
          const cy = camera.position.y;
          const cz = camera.position.z;
          const showDist = labelShowDistRef.current;
          const fullDist = labelFullDistRef.current;
          const labelsOn = showLabelsRef.current;

          for (const n of huntNodes) {
            const sprite = labelMapRef.current.get(n.id);
            if (!sprite) continue;
            if (!labelsOn || n.x == null) { sprite.visible = false; continue; }
            const dx = (n.x ?? 0) - cx;
            const dy = (n.y ?? 0) - cy;
            const dz = (n.z ?? 0) - cz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist >= showDist) {
              sprite.visible = false;
            } else {
              sprite.visible = true;
              const range = Math.max(1, showDist - fullDist);
              const t = 1 - (dist - fullDist) / range;
              const opacity = Math.max(0, Math.min(1, t));
              const a = Math.round(opacity * 255).toString(16).padStart(2, '0');
              sprite.color = `#e2e8f0${a}`;
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [huntNodes]);

  // Zoom-to-cursor wheel handler
  useEffect(() => {
    if (!huntNodes.length) return;
    const div = graphDivRef.current;
    if (!div) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const fg = fgRef.current;
      if (!fg) return;
      const camera = fg.camera?.();
      const controls = fg.controls?.();
      if (!camera || !controls) return;

      const rect = div.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
      const ndcY = -((e.clientY - rect.top)  / rect.height) *  2 + 1;

      const q = camera.quaternion;
      const tanFov = Math.tan(((camera.fov ?? 75) * Math.PI / 180) / 2);
      const aspect = rect.width / rect.height;
      const len = Math.sqrt((ndcX * tanFov * aspect) ** 2 + (ndcY * tanFov) ** 2 + 1);
      const [wx, wy, wz] = normalise(
        ...applyQuat(ndcX * tanFov * aspect / len, ndcY * tanFov / len, -1 / len, q.x, q.y, q.z, q.w),
      );

      const p = camera.position;
      const t = controls.target;
      const dist = Math.sqrt((t.x - p.x) ** 2 + (t.y - p.y) ** 2 + (t.z - p.z) ** 2);
      const sign = e.deltaY > 0 ? 1 : -1;
      const step = Math.max(2, dist * 0.1);
      p.x += wx * sign * step; p.y += wy * sign * step; p.z += wz * sign * step;
      t.x += wx * sign * step * 0.35; t.y += wy * sign * step * 0.35; t.z += wz * sign * step * 0.35;
    };

    div.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => div.removeEventListener('wheel', onWheel, { capture: true });
  }, [huntNodes]);

  const flyTo = useCallback((node: HuntNode) => {
    if (!fgRef.current || node.x == null) return;
    const nx = node.x ?? 0, ny = node.y ?? 0, nz = node.z ?? 0;
    fgRef.current.cameraPosition(
      { x: nx + 60, y: ny + 30, z: nz + 60 },
      { x: nx, y: ny, z: nz },
      800,
    );
    // Pivot orbit centre to the node we flew to
    const controls = fgRef.current.controls?.();
    if (controls) {
      orbitAnimRef.current = {
        sx: controls.target.x, sy: controls.target.y, sz: controls.target.z,
        tx: nx, ty: ny, tz: nz,
        t0: performance.now(), dur: 800,
      };
    }
  }, []);

  const startGame = useCallback(() => {
    if (!huntNodes.length) return;

    const songNodes = huntNodes.filter((n) => n.type === 'song');
    const kwNodes = huntNodes.filter((n) => n.type === 'keyword');
    if (!songNodes.length || !kwNodes.length) {
      setFlash('Not enough lyrical data — try selecting more bands.');
      return;
    }

    const startNode = songNodes[Math.floor(Math.random() * songNodes.length)]!;
    const target = pickTarget(adjRef.current, startNode.id, kwNodes.map((n) => n.id));
    if (!target) {
      setFlash('No reachable target found — try more bands or hit Start again.');
      return;
    }

    const targetNode = huntNodes.find((n) => n.id === target.id);
    if (!targetNode) return;

    // Clear explore selection
    exploreRef.current = null;
    setExploreNode(null);

    currentRef.current = startNode.id;
    targetRef.current = target.id;
    revealedRef.current = false;
    phaseRef.current = 'playing';

    setTargetWord(targetNode.label);
    setMoves(0);
    setElapsedSec(0);
    setRevealed(false);
    setDistance(bfsDist(adjRef.current, startNode.id, target.id));
    setPhase('playing');
    setFlash(`You start at "${startNode.label}" — find the hidden lyric word!`);

    fgRef.current?.refresh();
    setTimeout(() => flyTo(startNode), 150);
  }, [huntNodes, flyTo]);

  const handleNodeClick = useCallback((node: object) => {
    const n = node as HuntNode;

    // ── Explore mode (setup phase) ──
    if (phaseRef.current === 'setup') {
      // Ignore clicks on dimmed nodes while something is selected
      const sel = exploreRef.current;
      if (sel && sel.id !== n.id && !adjRef.current.get(sel.id)?.has(n.id)) return;

      if (sel?.id === n.id) {
        exploreRef.current = null;
        setExploreNode(null);
      } else {
        exploreRef.current = n;
        setExploreNode(n);
        // Pivot orbit centre to the clicked node
        const controls = fgRef.current?.controls?.();
        if (controls && n.x != null) {
          orbitAnimRef.current = {
            sx: controls.target.x, sy: controls.target.y, sz: controls.target.z,
            tx: n.x ?? 0, ty: n.y ?? 0, tz: n.z ?? 0,
            t0: performance.now(), dur: 600,
          };
        }
      }
      fgRef.current?.refresh();
      return;
    }

    // ── Game mode ──
    const curId = currentRef.current;
    const tgtId = targetRef.current;

    if (!adjRef.current.get(curId)?.has(n.id)) {
      setFlash("Can't jump there — you can only move one hop at a time!");
      return;
    }

    const dist = bfsDist(adjRef.current, n.id, tgtId);
    const isWon = n.id === tgtId;
    const shouldReveal = dist <= 2;

    currentRef.current = n.id;
    setDistance(dist);
    setMoves((m) => m + 1);

    if (isWon) {
      phaseRef.current = 'won';
      setPhase('won');
      setFlash('');
    } else {
      if (shouldReveal && !revealedRef.current) {
        revealedRef.current = true;
        setRevealed(true);
        setFlash('Very close! The target word is now glowing green in the graph.');
      } else {
        const hc = getHotCold(dist);
        setFlash(`${hc.emoji} ${hc.label} — moved to "${n.label}"`);
      }
    }

    fgRef.current?.refresh();
    flyTo(n);
  }, [flyTo]);

  const resetGame = useCallback(() => {
    phaseRef.current = 'setup';
    currentRef.current = '';
    targetRef.current = '';
    revealedRef.current = false;
    exploreRef.current = null;
    setPhase('setup');
    setExploreNode(null);
    setTargetWord('');
    setMoves(0);
    setElapsedSec(0);
    setDistance(Infinity);
    setRevealed(false);
    setFlash('');
    fgRef.current?.refresh();
  }, []);

  const toggleBand = (id: string) => {
    setSelectedBandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    resetGame();
  };

  // ── nodeThreeObject: extend default sphere with a proximity SpriteText label ──
  const nodeThreeObject = useCallback((node: object) => {
    const n = node as HuntNode;
    const sprite = new SpriteText(n.label);
    sprite.color = '#e2e8f000'; // start transparent
    sprite.textHeight = n.type === 'artist' ? 5 : n.type === 'keyword' ? 4 : 3.5;
    sprite.fontWeight = '600';
    sprite.backgroundColor = 'rgba(3,7,18,0.6)';
    sprite.padding = 1.5;
    sprite.borderRadius = 2;
    // SpriteText extends THREE.Sprite (which has position + visible from Object3D)
    // — cast to access inherited fields that the d.ts doesn't re-declare
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = sprite as any;
    // Place label above the sphere: sphere radius + half text height + small gap
    const val = computeNodeVal(n.type, n.id, '');
    const r = sphereRadius(val);
    const textH = sprite.textHeight;
    s.position.y = r + textH * 0.6 + 3;
    s.visible = false;
    labelMapRef.current.set(n.id, sprite);
    return sprite;
  }, []);

  // ── nodeColor: covers game mode, explore mode, and plain idle ──
  const nodeColor = useCallback((node: object) => {
    const n = node as HuntNode;
    const sel = exploreRef.current;

    // Explore mode
    if (phaseRef.current === 'setup' && sel) {
      return exploreNodeColor(n.id, sel.id, adjRef.current);
    }

    // Game mode
    return gameNodeColor(
      n.id, n.type,
      currentRef.current, targetRef.current,
      adjRef.current, revealedRef.current,
    );
  }, []);

  // ── linkColor: highlight connected edges in explore mode ──
  const linkColor = useCallback((link: object) => {
    const l = link as HuntLink;
    const sel = exploreRef.current;
    if (phaseRef.current === 'setup' && sel) {
      const src = linkEndId(l.source);
      const tgt = linkEndId(l.target);
      if (src === sel.id || tgt === sel.id) return '#22d3ee';
      return 'rgba(30,35,50,0.15)';
    }
    return 'rgba(100,116,139,0.35)';
  }, []);

  // ── linkWidth: thicken connected edges in explore mode ──
  const linkWidth = useCallback((link: object) => {
    const l = link as HuntLink;
    const sel = exploreRef.current;
    if (phaseRef.current === 'setup' && sel) {
      const src = linkEndId(l.source);
      const tgt = linkEndId(l.target);
      return (src === sel.id || tgt === sel.id) ? 2.5 : 0.15;
    }
    return 0.5;
  }, []);

  const nodeVal = useCallback((node: object) => {
    const n = node as HuntNode;
    return computeNodeVal(n.type, n.id, currentRef.current);
  }, []);

  // Pin all nodes once physics stops — prevents drift without killing interactivity
  const onEngineStop = useCallback(() => {
    huntNodes.forEach((n) => {
      if (n.x != null) { n.fx = n.x; n.fy = n.y; n.fz = n.z; }
    });
    // Only do the initial fit once per graph load — never snap the camera after the user has zoomed
    if (!didFitRef.current) {
      didFitRef.current = true;
      fgRef.current?.zoomToFit(800, 80);
    }
    setSimReady(true);
  }, [huntNodes]);

  const score = Math.max(0, 1000 - moves * 25 - elapsedSec);
  const hc = distance < Infinity ? getHotCold(distance) : null;
  const bands = scopes?.bands ?? [];

  useEffect(() => {
    if (phase !== 'won' || !user || ghSaved) return;
    api.post('/api/graph-hunt/scores', { score, moves, timeSec: elapsedSec, bandIds: selectedBandIds })
      .then((r: unknown) => { const res = r as { rank?: number }; if (res.rank) setGhRank(res.rank); setGhSaved(true); })
      .catch(() => {});
  }, [phase, user, ghSaved, score, moves, elapsedSec, selectedBandIds]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SiteHeader theme="dark" active="games" />

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800 text-sm flex-wrap shrink-0">
        <Link to="/games" className="text-gray-400 hover:text-white shrink-0">
          ← Games
        </Link>
        <span className="text-gray-700">|</span>
        <span className="font-bold text-indigo-400 shrink-0">3D Graph Hunt</span>

        {phase === 'playing' && (
          <>
            <span className="ml-auto text-gray-500">
              Moves: <span className="text-white font-mono">{moves}</span>
            </span>
            <span className="text-gray-500">
              Time: <span className="text-white font-mono">{elapsedSec}s</span>
            </span>
            <span className="text-gray-500">
              Score: <span className="text-yellow-400 font-mono font-bold">{score}</span>
            </span>
            {hc && (
              <span className={`font-semibold shrink-0 ${hc.textCls}`}>
                {hc.emoji} {hc.label}
              </span>
            )}
          </>
        )}

        {phase === 'setup' && simReady && (
          <span className="ml-auto text-xs text-gray-600 italic">
            Click any node to explore its connections
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="w-72 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto">

          {/* Setup panel */}
          {phase === 'setup' && (
            <div className="p-4 flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-bold mb-1">3D Graph Hunt</h2>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Navigate a 3D network of songs and lyric keywords. Start at a random song,
                  find the hidden word — one node at a time. Use hot/cold hints to guide you.
                </p>
              </div>

              <div className="rounded-lg bg-gray-800 border border-gray-700 p-3 text-xs text-gray-400 space-y-1.5">
                <div className="font-semibold text-gray-300 mb-1">How to play</div>
                <div>• Drag to orbit · scroll to zoom</div>
                <div>• Click a <span className="text-cyan-400 font-semibold">cyan node</span> to hop there</div>
                <div>• You can only move one edge at a time</div>
                <div>• The closer you get, the hotter the hint</div>
                <div>• −25 pts per move · −1 pt per second</div>
              </div>

              <div className="rounded-lg bg-gray-800/50 border border-gray-700/50 p-3 text-xs text-gray-500 space-y-1">
                <div className="font-semibold text-gray-400">Before you start</div>
                <div>• Zoom in close to any node to read its label</div>
                <div>• Click a node to light up its connections</div>
                <div>• Click it again to deselect</div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Select Bands
                  </span>
                  {bands.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedBandIds(bands.map((b) => b.id));
                        resetGame();
                      }}
                      className="text-xs text-indigo-400 hover:text-indigo-200"
                    >
                      All
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
                  {bands.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 cursor-pointer group px-2 py-1 rounded hover:bg-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBandIds.includes(b.id)}
                        onChange={() => toggleBand(b.id)}
                        className="accent-indigo-500"
                      />
                      <span
                        className={`text-xs ${
                          selectedBandIds.includes(b.id)
                            ? 'text-white'
                            : 'text-gray-500 group-hover:text-gray-300'
                        }`}
                      >
                        {b.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={startGame}
                disabled={!simReady || isFetching}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                {isFetching
                  ? 'Loading graph…'
                  : !selectedBandIds.length
                  ? 'Select a band first'
                  : !simReady
                  ? 'Initialising…'
                  : 'Start Hunt →'}
              </button>

              {/* Explore selection panel */}
              {exploreNode && (
                <div className="rounded-lg bg-indigo-950/60 border border-indigo-700/50 p-3">
                  <div className="text-xs font-semibold text-indigo-300 mb-1 truncate">
                    {exploreNode.label}
                  </div>
                  <div className="text-[10px] text-indigo-400/70 uppercase tracking-wide mb-2">
                    {exploreNode.type}
                  </div>
                  <div className="text-xs text-gray-400">
                    {adjRef.current.get(exploreNode.id)?.size ?? 0} connection
                    {(adjRef.current.get(exploreNode.id)?.size ?? 0) === 1 ? '' : 's'}
                  </div>
                  <button
                    onClick={() => {
                      exploreRef.current = null;
                      setExploreNode(null);
                      fgRef.current?.refresh();
                    }}
                    className="mt-2 text-[10px] text-indigo-500 hover:text-indigo-300"
                  >
                    Clear selection ×
                  </button>
                </div>
              )}

              {flash && <p className="text-xs text-yellow-400">{flash}</p>}
            </div>
          )}

          {/* Playing panel */}
          {phase === 'playing' && (
            <div className="p-4 flex flex-col gap-4">
              <div className="rounded-xl bg-gray-800 border border-gray-700 p-4 text-center">
                <div className="text-xs text-gray-400 mb-2">Find the lyric word</div>
                {revealed ? (
                  <div className="text-2xl font-bold text-green-400">"{targetWord}"</div>
                ) : (
                  <div className="text-2xl font-bold text-gray-600 tracking-[0.25em]">
                    {'?'.repeat(Math.min(targetWord.length, 10))}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  {revealed
                    ? 'revealed — glowing green in the graph'
                    : `${targetWord.length} letter${targetWord.length === 1 ? '' : 's'}`}
                </div>
              </div>

              {hc && (
                <div className={`rounded-lg border p-3 text-center ${hc.borderCls} ${hc.bgCls}`}>
                  <div className="text-3xl">{hc.emoji}</div>
                  <div className={`font-bold text-sm mt-1 ${hc.textCls}`}>{hc.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {distance === Infinity
                      ? '—'
                      : `${distance} hop${distance === 1 ? '' : 's'} away`}
                  </div>
                </div>
              )}

              {flash && (
                <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-gray-300 leading-relaxed">
                  {flash}
                </div>
              )}

              <div className="text-xs space-y-1.5">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Legend
                </div>
                {[
                  { color: '#fbbf24', label: 'You (current node)' },
                  { color: '#22d3ee', label: 'Clickable next hops' },
                  { color: '#22c55e', label: 'Target (when revealed)' },
                  { color: '#6366f1', label: 'Song node' },
                  { color: '#374151', label: 'Keyword node' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-gray-400">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-600 italic">
                Zoom in close to read node labels
              </p>

              <button
                onClick={resetGame}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors text-center mt-auto pt-2"
              >
                Give up
              </button>
            </div>
          )}

          {/* Won panel */}
          {phase === 'won' && (
            <div className="p-4 flex flex-col gap-4">
              <div className="text-center">
                <div className="text-5xl mb-3">🎉</div>
                <h2 className="text-xl font-bold text-green-400">You found it!</h2>
                <div className="text-2xl font-bold mt-2">"{targetWord}"</div>
                {ghRank && <p className="text-indigo-400 text-sm font-semibold mt-1">You ranked #{ghRank}!</p>}
                {!user && <p className="text-gray-600 text-xs mt-1">Sign in to save your score.</p>}
              </div>

              <div className="rounded-xl bg-gray-800 border border-gray-700 p-4 space-y-2">
                {[
                  { label: 'Moves', value: String(moves) },
                  { label: 'Time', value: `${elapsedSec}s` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-400">{label}</span>
                    <span className="font-mono">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
                  <span className="text-gray-400">Score</span>
                  <span className="font-mono text-indigo-400 text-lg font-bold">{score}</span>
                </div>
              </div>

              {ghLb.length > 0 && (
                <div className="rounded-xl bg-gray-800 border border-gray-700 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Leaderboard</div>
                  {ghLb.map((e) => (
                    <div key={e.rank} className="flex items-center gap-2 py-1 border-b border-gray-700 last:border-0">
                      <span className="text-xs text-gray-600 w-5 text-right">#{e.rank}</span>
                      <span className="text-xs text-gray-400 flex-1 truncate">{e.playerName}</span>
                      <span className="text-xs font-bold text-indigo-400">{e.score.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => { setGhSaved(false); setGhRank(null); startGame(); }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                Play Again →
              </button>

              <Link
                to="/games"
                className="text-center text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Back to Games
              </Link>
            </div>
          )}
        </div>

        {/* ── 3D Graph ── */}
        <div ref={graphDivRef} className="flex-1 relative bg-[#030712]">
          {!selectedBandIds.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-10">
              <div className="text-6xl opacity-20">🌐</div>
              <p className="text-gray-600 text-sm max-w-xs">
                Select at least one band in the sidebar to load the lyrical network
              </p>
            </div>
          )}

          {isFetching && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-500 text-sm">Loading graph…</p>
            </div>
          )}

          {huntNodes.length > 0 && (
            <ForceGraph3D
              ref={fgRef}
              graphData={{ nodes: huntNodes as object[], links: huntLinks as object[] }}
              nodeId="id"
              nodeLabel=""
              nodeColor={nodeColor}
              nodeVal={nodeVal}
              nodeRelSize={4 * nodeScale}
              nodeOpacity={0.9}
              nodeResolution={8}
              nodeThreeObjectExtend
              nodeThreeObject={nodeThreeObject}
              linkColor={linkColor}
              linkWidth={linkWidth}
              linkOpacity={linkOpacityVal}
              backgroundColor="#030712"
              showNavInfo={false}
              warmupTicks={100}
              cooldownTicks={150}
              d3VelocityDecay={0.5}
              onNodeClick={handleNodeClick}
              onEngineStop={onEngineStop}
            />
          )}

          {/* WASD hint */}
          {simReady && (
            <div className="absolute bottom-4 left-4 z-10 text-[10px] text-gray-700 pointer-events-none space-y-0.5">
              <div>WASD · ↑↓←→ — fly &nbsp;·&nbsp; Q/E — up/down</div>
              <div>drag — orbit &nbsp;·&nbsp; scroll — zoom</div>
            </div>
          )}

          {/* ── Controls panel ── */}
          {huntNodes.length > 0 && (
            <div className="absolute bottom-4 right-4 z-10">
              <button
                onClick={() => setShowControls((v) => !v)}
                className="flex items-center gap-1.5 bg-gray-900/90 hover:bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
              >
                ⚙ {showControls ? 'Hide controls' : 'Graph controls'}
              </button>

              {showControls && (
                <div className="mt-2 bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur-sm w-64 space-y-4">
                  <div className="text-xs font-semibold text-gray-300">Graph controls</div>

                  {/* Labels toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Node labels</span>
                    <button
                      onClick={() => setShowLabels((v) => !v)}
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                        showLabels
                          ? 'bg-indigo-900/60 border-indigo-700/50 text-indigo-300'
                          : 'bg-gray-800 border-gray-700 text-gray-500'
                      }`}
                    >
                      {showLabels ? 'Visible' : 'Hidden'}
                    </button>
                  </div>

                  {/* Label appear distance */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Labels appear at</span>
                      <span className="font-mono text-white">{labelShowDist}</span>
                    </div>
                    <input
                      type="range" min={40} max={2000} step={20}
                      value={labelShowDist}
                      onChange={(e) => setLabelShowDist(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                      <span>closer</span><span>farther</span>
                    </div>
                  </div>

                  {/* Label full opacity distance */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Labels fully visible at</span>
                      <span className="font-mono text-white">{labelFullDist}</span>
                    </div>
                    <input
                      type="range" min={10} max={800} step={10}
                      value={labelFullDist}
                      onChange={(e) => setLabelFullDist(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                      <span>closer</span><span>farther</span>
                    </div>
                  </div>

                  {/* Node size */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Node size</span>
                      <span className="font-mono text-white">{nodeScale.toFixed(1)}×</span>
                    </div>
                    <input
                      type="range" min={0.4} max={2.5} step={0.1}
                      value={nodeScale}
                      onChange={(e) => setNodeScale(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                      <span>smaller</span><span>larger</span>
                    </div>
                  </div>

                  {/* Link opacity */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Link opacity</span>
                      <span className="font-mono text-white">{Math.round(linkOpacityVal * 100)}%</span>
                    </div>
                    <input
                      type="range" min={0} max={1} step={0.05}
                      value={linkOpacityVal}
                      onChange={(e) => setLinkOpacityVal(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                      <span>hidden</span><span>solid</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowLabels(true);
                      setLabelShowDist(DEFAULT_LABEL_SHOW);
                      setLabelFullDist(DEFAULT_LABEL_FULL);
                      setNodeScale(1);
                      setLinkOpacityVal(0.6);
                    }}
                    className="w-full text-[11px] text-gray-600 hover:text-gray-400 transition-colors text-center pt-1"
                  >
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ThreeDGraphView — reusable 3D force-directed graph viewer.
 *
 * Features:
 *  - WASD / arrow keys + Q/E for 3D flight navigation
 *  - Proximity-based node labels (SpriteText, fade in as camera approaches)
 *  - Click-to-explore: highlights selected node + direct neighbours
 *  - Controls panel: label distance, node size, link opacity, labels on/off
 *  - Arrange modes: Natural · Radial · Sphere · Galaxy · Solar System
 *    All except Natural animate smoothly to their target layout.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import type { GraphNode, GraphEdge } from '../api/songNodes';

// Manual quaternion-rotate so we don't need to import from 'three' (no bundled types in v0.184)
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

function normalize(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}

// ── Internal simulation types ─────────────────────────────────────────────────

// GraphNode extended with d3-force simulation fields
interface SimNode extends GraphNode {
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number; fy?: number; fz?: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  type: string;
  weight: number;
}

function linkEndId(end: string | SimNode): string {
  return typeof end === 'string' ? end : end.id;
}

// ── Node colours & sizes ──────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  song: '#6366f1', keyword: '#374151',
  album: '#8b5cf6', artist: '#f59e0b',
  theme: '#10b981', tag: '#06b6d4', emotion: '#ec4899',
};

// Library default; sphere radius = nodeRelSize * cbrt(nodeVal)
const BASE_NODE_REL = 4;
function sphereR(val: number) { return BASE_NODE_REL * Math.cbrt(val); }

function nodeValFor(type: string): number {
  switch (type) {
    case 'artist': return 7;
    case 'album':  return 4;
    case 'keyword':return 3;
    default:       return 2;
  }
}

// ── Adjacency ─────────────────────────────────────────────────────────────────

function buildAdj(links: SimLink[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const l of links) {
    const s = linkEndId(l.source);
    const t = linkEndId(l.target);
    if (!s || !t) continue;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s)!.add(t);
    adj.get(t)!.add(s);
  }
  return adj;
}

// ── Arrange modes ─────────────────────────────────────────────────────────────

type ArrangeMode = 'natural' | 'radial' | 'sphere' | 'galaxy' | 'solar-system';

const ARRANGE_OPTIONS: { id: ArrangeMode; emoji: string; label: string; desc: string }[] = [
  { id: 'natural',      emoji: '⚛️', label: 'Natural',      desc: 'Physics-based organic clustering' },
  { id: 'radial',       emoji: '🎯', label: 'Radial',        desc: 'Concentric rings by node type' },
  { id: 'sphere',       emoji: '🌐', label: 'Sphere',        desc: 'Fibonacci sphere distribution' },
  { id: 'galaxy',       emoji: '🌌', label: 'Galaxy',        desc: 'Golden-angle spiral, densest at centre' },
  { id: 'solar-system', emoji: '🪐', label: 'Solar System',  desc: 'Artists as stars · albums orbit · songs orbit albums' },
];

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function computeArrangeTargets(
  nodes: SimNode[],
  mode: ArrangeMode,
  adj: Map<string, Set<string>>,
): Map<string, { x: number; y: number; z: number }> {
  const out = new Map<string, { x: number; y: number; z: number }>();

  if (mode === 'radial') {
    const RING: Record<string, number> = {
      artist: 0, emotion: 90, album: 170, keyword: 170,
      theme: 250, song: 340, tag: 420,
    };
    const byType = new Map<string, SimNode[]>();
    for (const n of nodes) {
      if (!byType.has(n.type)) byType.set(n.type, []);
      byType.get(n.type)!.push(n);
    }
    for (const [type, group] of byType) {
      const r = RING[type] ?? 340;
      group.forEach((n, i) => {
        const a = (i / group.length) * 2 * Math.PI;
        out.set(n.id, {
          x: r === 0 ? 0 : r * Math.cos(a),
          y: Math.sin(i * 1.618 + type.charCodeAt(0)) * 28,
          z: r === 0 ? 0 : r * Math.sin(a),
        });
      });
    }

  } else if (mode === 'sphere') {
    const N = nodes.length;
    const R = Math.max(160, Math.sqrt(N) * 16);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    nodes.forEach((n, i) => {
      const y = 1 - (i / Math.max(1, N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = goldenAngle * i;
      out.set(n.id, { x: R * r * Math.cos(phi), y: R * y, z: R * r * Math.sin(phi) });
    });

  } else if (mode === 'galaxy') {
    // Sort by degree descending; most-connected nodes closest to centre
    const sorted = [...nodes].sort((a, b) =>
      (adj.get(b.id)?.size ?? 0) - (adj.get(a.id)?.size ?? 0),
    );
    const GA = 2.399; // golden angle in radians
    sorted.forEach((n, i) => {
      const r = 20 + Math.sqrt(i) * 14;
      const phi = i * GA;
      // Galactic disk with tapered Y thickness
      const diskThick = Math.max(0, 80 - r * 0.18);
      const y = Math.sin(i * 0.53) * diskThick * 0.35;
      out.set(n.id, { x: r * Math.cos(phi), y, z: r * Math.sin(phi) });
    });

  } else if (mode === 'solar-system') {
    const artists = nodes.filter(n => n.type === 'artist');
    const albums  = nodes.filter(n => n.type === 'album');
    const songs   = nodes.filter(n => n.type === 'song');
    const others  = nodes.filter(n => !['artist','album','song'].includes(n.type));

    // Stars in a ring
    const starR = Math.max(300, artists.length * 80);
    artists.forEach((a, i) => {
      const phi = (i / Math.max(1, artists.length)) * 2 * Math.PI;
      out.set(a.id, { x: starR * Math.cos(phi), y: 0, z: starR * Math.sin(phi) });
    });

    // Albums orbit their artist
    albums.forEach((alb) => {
      const pa = artists.find(a => adj.get(a.id)?.has(alb.id) || adj.get(alb.id)?.has(a.id));
      const siblings = albums.filter(b => {
        const p = artists.find(a => adj.get(a.id)?.has(b.id) || adj.get(b.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx = siblings.indexOf(alb);
      const phi = (idx / Math.max(1, siblings.length)) * 2 * Math.PI;
      const orbitR = 70 + siblings.length * 6;
      const base = pa ? (out.get(pa.id) ?? { x: starR + 160, y: 0, z: 0 }) : { x: starR + 160, y: 0, z: 0 };
      out.set(alb.id, {
        x: base.x + orbitR * Math.cos(phi),
        y: orbitR * 0.28 * Math.sin(phi * 2),
        z: base.z + orbitR * Math.sin(phi),
      });
    });

    // Songs orbit their album
    songs.forEach((song) => {
      const pa = albums.find(a => adj.get(a.id)?.has(song.id) || adj.get(song.id)?.has(a.id));
      const siblings = songs.filter(s => {
        const p = albums.find(a => adj.get(a.id)?.has(s.id) || adj.get(s.id)?.has(a.id));
        return p?.id === pa?.id;
      });
      const idx = siblings.indexOf(song);
      const phi = (idx / Math.max(1, siblings.length)) * 2 * Math.PI;
      const r = 28;
      const base = pa ? (out.get(pa.id) ?? { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 };
      out.set(song.id, {
        x: base.x + r * Math.cos(phi),
        y: base.y + r * 0.5 * Math.sin(phi * 3),
        z: base.z + r * Math.sin(phi),
      });
    });

    // Others in a wide outer belt
    const beltR = starR + 320;
    others.forEach((n, i) => {
      const phi = (i / Math.max(1, others.length)) * 2 * Math.PI;
      out.set(n.id, { x: beltR * Math.cos(phi), y: Math.sin(i * 0.618) * 45, z: beltR * Math.sin(phi) });
    });
  }

  return out;
}

function animateArrange(
  nodes: SimNode[],
  targets: Map<string, { x: number; y: number; z: number }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fgRef: React.MutableRefObject<any>,
  durationMs = 1400,
) {
  const startTime = performance.now();
  const snapshots = new Map(nodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }]));

  const step = (now: number) => {
    const raw = Math.min(1, (now - startTime) / durationMs);
    const t = easeInOutQuad(raw);
    nodes.forEach(n => {
      const snap = snapshots.get(n.id)!;
      const tgt = targets.get(n.id);
      if (!tgt) return;
      n.fx = snap.x + (tgt.x - snap.x) * t;
      n.fy = snap.y + (tgt.y - snap.y) * t;
      n.fz = snap.z + (tgt.z - snap.z) * t;
    });
    fgRef.current?.refresh();
    if (raw < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Component props ───────────────────────────────────────────────────────────

export interface ThreeDGraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_LABEL_SHOW = 400;
const DEFAULT_LABEL_FULL = 150;

export default function ThreeDGraphView({ nodes: rawNodes, edges: rawEdges, height = 680 }: ThreeDGraphViewProps) {
  const [simReady, setSimReady] = useState(false);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [showArrange, setShowArrange] = useState(false);
  const [currentArrange, setCurrentArrange] = useState<ArrangeMode>('natural');
  const [showLabels, setShowLabels] = useState(true);
  const [labelShowDist, setLabelShowDist] = useState(DEFAULT_LABEL_SHOW);
  const [labelFullDist, setLabelFullDist] = useState(DEFAULT_LABEL_FULL);
  const [nodeScale, setNodeScale] = useState(1);
  const [linkOpacityVal, setLinkOpacityVal] = useState(0.5);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef           = useRef<any>(null);
  const containerDivRef = useRef<HTMLDivElement>(null);
  const adjRef          = useRef(new Map<string, Set<string>>());
  const selectedRef     = useRef<SimNode | null>(null);
  const didFitRef       = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelMapRef     = useRef(new Map<string, any>());
  const labelShowRef    = useRef(DEFAULT_LABEL_SHOW);
  const labelFullRef    = useRef(DEFAULT_LABEL_FULL);
  const showLabelsRef   = useRef(true);
  const orbitAnimRef    = useRef<{
    sx: number; sy: number; sz: number;
    tx: number; ty: number; tz: number;
    t0: number; dur: number;
  } | null>(null);

  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);

  // Sync control refs with state so rAF always reads fresh values
  useEffect(() => { labelShowRef.current = labelShowDist; }, [labelShowDist]);
  useEffect(() => { labelFullRef.current = labelFullDist; }, [labelFullDist]);
  useEffect(() => { showLabelsRef.current = showLabels; }, [showLabels]);

  // Rebuild sim data when graph data changes
  useEffect(() => {
    setSimReady(false);
    didFitRef.current = false;
    labelMapRef.current.clear();
    selectedRef.current = null;
    setSelectedNode(null);
    setCurrentArrange('natural');

    const nodes: SimNode[] = rawNodes.map(n => ({ ...n }));
    const nodeSet = new Set(nodes.map(n => n.id));
    const links: SimLink[] = rawEdges
      .filter(e => nodeSet.has(e.source) && nodeSet.has(e.target))
      .map(e => ({ source: e.source, target: e.target, type: e.type, weight: e.weight }));

    setSimNodes(nodes);
    setSimLinks(links);
    adjRef.current = buildAdj(links);
  }, [rawNodes, rawEdges]);

  // rAF loop: WASD flight + proximity labels
  useEffect(() => {
    if (!simNodes.length) return;
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

        // ── Orbit target animation (smooth pivot-to-node) ──
        const oa = orbitAnimRef.current;
        if (oa && controls) {
          const raw = Math.min(1, (performance.now() - oa.t0) / oa.dur);
          const et = easeInOutQuad(raw);
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
          const [fx, fy, fz] = normalize(...applyQuat(0, 0, -1, q.x, q.y, q.z, q.w));
          const [rx, ry, rz] = normalize(...applyQuat(1, 0,  0, q.x, q.y, q.z, q.w));
          let dx = 0, dy = 0, dz = 0;
          if (keys.has('w') || keys.has('arrowup'))    { dx += fx * speed; dy += fy * speed; dz += fz * speed; }
          if (keys.has('s') || keys.has('arrowdown'))  { dx -= fx * speed; dy -= fy * speed; dz -= fz * speed; }
          if (keys.has('a') || keys.has('arrowleft'))  { dx -= rx * speed; dy -= ry * speed; dz -= rz * speed; }
          if (keys.has('d') || keys.has('arrowright')) { dx += rx * speed; dy += ry * speed; dz += rz * speed; }
          if (keys.has('q')) dy += speed * 0.6;
          if (keys.has('e')) dy -= speed * 0.6;
          // Translate both camera and orbit target together → pure dolly, no orbit change
          p.x += dx; p.y += dy; p.z += dz;
          if (controls.target) { controls.target.x += dx; controls.target.y += dy; controls.target.z += dz; }
        }

        // ── Proximity labels ──
        if (camera) {
          const cx = camera.position.x;
          const cy = camera.position.y;
          const cz = camera.position.z;
          const showDist = labelShowRef.current;
          const fullDist = labelFullRef.current;
          const labelsOn = showLabelsRef.current;

          for (const n of simNodes) {
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
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [simNodes]);

  // Zoom-to-cursor: intercept wheel in capture phase before THREE.TrackballControls
  useEffect(() => {
    if (!simNodes.length) return;
    const div = containerDivRef.current;
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

      // Build world-space ray direction from camera through mouse
      const q = camera.quaternion;
      const fovRad = ((camera.fov ?? 75) * Math.PI) / 180;
      const tanFov = Math.tan(fovRad / 2);
      const aspect = rect.width / rect.height;
      const [wx, wy, wz] = normalize(
        ...applyQuat(ndcX * tanFov * aspect, ndcY * tanFov, -1, q.x, q.y, q.z, q.w),
      );

      const p = camera.position;
      const t = controls.target;
      const dist = Math.sqrt((t.x - p.x) ** 2 + (t.y - p.y) ** 2 + (t.z - p.z) ** 2);
      const sign = e.deltaY > 0 ? 1 : -1; // +1 = zoom out
      const step = Math.max(2, dist * 0.1);

      // Move camera along cursor ray
      p.x += wx * sign * step;
      p.y += wy * sign * step;
      p.z += wz * sign * step;
      // Partially drift orbit target toward zoom point (C4D feel)
      t.x += wx * sign * step * 0.35;
      t.y += wy * sign * step * 0.35;
      t.z += wz * sign * step * 0.35;
    };

    div.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => div.removeEventListener('wheel', onWheel, { capture: true });
  }, [simNodes]);

  // ── Stable callbacks (read refs, never stale) ─────────────────────────────

  const handleNodeClick = useCallback((node: object) => {
    const n = node as SimNode;
    const sel = selectedRef.current;

    // While a node is selected, ignore clicks on dimmed (non-connected) nodes
    if (sel && sel.id !== n.id && !adjRef.current.get(sel.id)?.has(n.id)) return;

    if (sel?.id === n.id) {
      selectedRef.current = null;
      setSelectedNode(null);
    } else {
      selectedRef.current = n;
      setSelectedNode(n);
      // Smoothly pivot orbit center to the selected node
      const controls = fgRef.current?.controls?.();
      if (controls && n.x != null) {
        const ct = controls.target;
        orbitAnimRef.current = {
          sx: ct.x, sy: ct.y, sz: ct.z,
          tx: n.x ?? 0, ty: n.y ?? 0, tz: n.z ?? 0,
          t0: performance.now(), dur: 600,
        };
      }
    }
    fgRef.current?.refresh();
  }, []);

  const nodeColor = useCallback((node: object) => {
    const n = node as SimNode;
    const sel = selectedRef.current;
    if (sel) {
      if (n.id === sel.id) return '#ffffff';
      if (adjRef.current.get(sel.id)?.has(n.id)) return '#22d3ee';
      return '#0d1117';
    }
    return TYPE_COLOR[n.type] ?? '#4b5563';
  }, []);

  const nodeVal = useCallback((node: object) => nodeValFor((node as SimNode).type), []);

  const nodeThreeObject = useCallback((node: object) => {
    const n = node as SimNode;
    const sprite = new SpriteText(n.label);
    sprite.color = '#e2e8f000';
    sprite.textHeight = n.type === 'artist' ? 5 : n.type === 'keyword' ? 4 : 3.5;
    sprite.fontWeight = '600';
    sprite.backgroundColor = 'rgba(3,7,18,0.65)';
    sprite.padding = 1.5;
    sprite.borderRadius = 2;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = sprite as any;
    const r = sphereR(nodeValFor(n.type));
    s.position.y = r + sprite.textHeight * 0.6 + 3;
    s.visible = false;
    labelMapRef.current.set(n.id, sprite);
    return sprite;
  }, []);

  const linkColor = useCallback((link: object) => {
    const l = link as SimLink;
    const sel = selectedRef.current;
    if (sel) {
      const s = linkEndId(l.source);
      const t = linkEndId(l.target);
      return (s === sel.id || t === sel.id) ? '#22d3ee' : 'rgba(30,35,50,0.1)';
    }
    return 'rgba(100,116,139,0.3)';
  }, []);

  const linkWidth = useCallback((link: object) => {
    const l = link as SimLink;
    const sel = selectedRef.current;
    if (sel) {
      const s = linkEndId(l.source);
      const t = linkEndId(l.target);
      return (s === sel.id || t === sel.id) ? 2.5 : 0.12;
    }
    return 0.5;
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

  const doArrange = useCallback((mode: ArrangeMode) => {
    setCurrentArrange(mode);
    setShowArrange(false);
    if (mode === 'natural') {
      simNodes.forEach(n => { n.fx = undefined; n.fy = undefined; n.fz = undefined; });
      didFitRef.current = false;
      fgRef.current?.d3ReheatSimulation();
      return;
    }
    const targets = computeArrangeTargets(simNodes, mode, adjRef.current);
    animateArrange(simNodes, targets, fgRef);
  }, [simNodes]);

  const connCount = selectedNode ? (adjRef.current.get(selectedNode.id)?.size ?? 0) : 0;

  return (
    <div ref={containerDivRef} className="relative bg-[#030712] rounded-xl overflow-hidden" style={{ height }}>
      {/* Loading overlay */}
      {!simReady && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="text-gray-600 text-sm">Initialising 3D graph…</p>
        </div>
      )}

      {/* Selected node info */}
      {selectedNode && (
        <div className="absolute top-3 left-3 z-10 bg-gray-900/90 border border-gray-700 rounded-xl px-4 py-3 backdrop-blur-sm max-w-[200px]">
          <div className="font-semibold text-white text-sm truncate">{selectedNode.label}</div>
          <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">{selectedNode.type}</div>
          <div className="text-xs text-gray-400 mt-1">{connCount} connection{connCount === 1 ? '' : 's'}</div>
          <button
            onClick={() => { selectedRef.current = null; setSelectedNode(null); fgRef.current?.refresh(); }}
            className="mt-2 text-[10px] text-gray-600 hover:text-gray-400"
          >
            Clear ×
          </button>
        </div>
      )}

      {/* WASD hint */}
      {simReady && (
        <div className="absolute bottom-3 left-3 z-10 text-[10px] text-gray-700 pointer-events-none space-y-0.5">
          <div>WASD · ↑↓←→ — fly &nbsp;·&nbsp; Q/E — up/down</div>
          <div>drag — orbit &nbsp;·&nbsp; scroll — zoom to cursor &nbsp;·&nbsp; click — inspect</div>
        </div>
      )}

      {/* Bottom-right controls */}
      {simReady && (
        <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
          {/* Arrange popup */}
          {showArrange && (
            <div className="bg-gray-900/95 border border-gray-700 rounded-xl p-2 backdrop-blur-sm w-60 space-y-1">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-2 pb-1">
                Arrange nodes
              </div>
              {ARRANGE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => doArrange(opt.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    currentArrange === opt.id
                      ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/40'
                      : 'hover:bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="mr-2">{opt.emoji}</span>
                  <span className="font-semibold">{opt.label}</span>
                  <div className="text-[10px] text-gray-600 mt-0.5 pl-6">{opt.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* Controls popup */}
          {showControls && (
            <div className="bg-gray-900/95 border border-gray-700 rounded-xl p-4 backdrop-blur-sm w-64 space-y-3">
              <div className="text-xs font-semibold text-gray-300">Graph controls</div>

              {/* Labels toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Node labels</span>
                <button
                  onClick={() => setShowLabels(v => !v)}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                    showLabels
                      ? 'bg-indigo-900/60 border-indigo-700/50 text-indigo-300'
                      : 'bg-gray-800 border-gray-700 text-gray-500'
                  }`}
                >
                  {showLabels ? 'Visible' : 'Hidden'}
                </button>
              </div>

              {showLabels && (
                <>
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Appear at distance</span>
                      <span className="font-mono text-white">{labelShowDist}</span>
                    </div>
                    <input type="range" min={40} max={2000} step={20} value={labelShowDist}
                      onChange={e => setLabelShowDist(Number(e.target.value))}
                      className="w-full accent-indigo-500" />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                      <span>closer</span><span>farther</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Full opacity at</span>
                      <span className="font-mono text-white">{labelFullDist}</span>
                    </div>
                    <input type="range" min={10} max={800} step={10} value={labelFullDist}
                      onChange={e => setLabelFullDist(Number(e.target.value))}
                      className="w-full accent-indigo-500" />
                    <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
                      <span>closer</span><span>farther</span>
                    </div>
                  </div>
                </>
              )}

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Node size</span>
                  <span className="font-mono text-white">{nodeScale.toFixed(1)}×</span>
                </div>
                <input type="range" min={0.4} max={2.5} step={0.1} value={nodeScale}
                  onChange={e => setNodeScale(Number(e.target.value))}
                  className="w-full accent-indigo-500" />
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Link opacity</span>
                  <span className="font-mono text-white">{Math.round(linkOpacityVal * 100)}%</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={linkOpacityVal}
                  onChange={e => setLinkOpacityVal(Number(e.target.value))}
                  className="w-full accent-indigo-500" />
              </div>

              <button
                onClick={() => {
                  setShowLabels(true);
                  setLabelShowDist(DEFAULT_LABEL_SHOW);
                  setLabelFullDist(DEFAULT_LABEL_FULL);
                  setNodeScale(1);
                  setLinkOpacityVal(0.5);
                }}
                className="w-full text-[11px] text-gray-600 hover:text-gray-400 transition-colors text-center"
              >
                Reset to defaults
              </button>
            </div>
          )}

          {/* Sphere center/fit buttons */}
          <div className="flex gap-2">
            {currentArrange === 'sphere' && (
              <button
                onClick={() => {
                  // Place camera at the sphere centre, looking outward
                  const fg = fgRef.current;
                  if (!fg) return;
                  const controls = fg.controls?.();
                  fg.cameraPosition({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 200 }, 700);
                  if (controls) { orbitAnimRef.current = { sx: controls.target.x, sy: controls.target.y, sz: controls.target.z, tx: 0, ty: 0, tz: 200, t0: performance.now(), dur: 700 }; }
                }}
                className="bg-gray-900/90 hover:bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
              >
                ⊙ Inside
              </button>
            )}
            <button
              onClick={() => { didFitRef.current = false; fgRef.current?.zoomToFit(600, 60); }}
              className="bg-gray-900/90 hover:bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
            >
              ⌖ Fit
            </button>
          </div>

          {/* Arrange / Controls buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowArrange(v => !v); setShowControls(false); }}
              className={`flex items-center gap-1.5 border text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors ${
                showArrange
                  ? 'bg-indigo-900/60 border-indigo-700/50 text-indigo-300'
                  : 'bg-gray-900/90 hover:bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              ✦ Arrange
            </button>
            <button
              onClick={() => { setShowControls(v => !v); setShowArrange(false); }}
              className={`flex items-center gap-1.5 border text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors ${
                showControls
                  ? 'bg-indigo-900/60 border-indigo-700/50 text-indigo-300'
                  : 'bg-gray-900/90 hover:bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              ⚙ Controls
            </button>
          </div>
        </div>
      )}

      {simNodes.length > 0 && (
        <ForceGraph3D
          ref={fgRef}
          graphData={{ nodes: simNodes as object[], links: simLinks as object[] }}
          nodeId="id"
          nodeLabel=""
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeRelSize={BASE_NODE_REL * nodeScale}
          nodeOpacity={0.9}
          nodeResolution={8}
          nodeThreeObjectExtend
          nodeThreeObject={nodeThreeObject}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkOpacity={linkOpacityVal}
          backgroundColor="#030712"
          showNavInfo={false}
          warmupTicks={80}
          cooldownTicks={120}
          d3VelocityDecay={0.4}
          onNodeClick={handleNodeClick}
          onEngineStop={onEngineStop}
        />
      )}
    </div>
  );
}

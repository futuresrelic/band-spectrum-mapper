/**
 * ExplorePage — public song-node visualiser.
 * Accessible to everyone (no auth required). Uses /api/public/graph.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular, EventObject } from 'cytoscape';
import { api } from '../lib/api';
import type { GraphData, GraphNode, GraphEdge, NodeType } from '../api/songNodes';
import SiteHeader from '../components/layout/SiteHeader';
import { AXIS_LABELS } from '@band-spectrum-mapper/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<NodeType, string> = {
  song:     '#6366f1',
  album:    '#8b5cf6',
  artist:   '#f59e0b',
  theme:    '#10b981',
  tag:      '#06b6d4',
  keyword:  '#64748b',
  emotion:  '#ec4899',
};

const EDGE_COLORS: Record<string, string> = {
  same_artist:   '#f59e0b44',
  same_album:    '#8b5cf644',
  shared_tag:    '#06b6d444',
  similar_radar: '#ec489944',
  conceptual:    '#10b98144',
  shared_word:   '#64748b44',
};

function getBaseFont(type: string): number {
  if (type === 'artist') return 13;
  if (type === 'emotion') return 12;
  return 11;
}

// wrapWidth is in screen-px — we convert to graph units via zoom so wrapping stays constant on screen
function updateFontSizes(cy: Core, wrapWidth = 120): void {
  const z = cy.zoom();
  cy.nodes().forEach((node) => {
    const type = (node.data('type') as string) || 'song';
    node.style('font-size', `${getBaseFont(type) / z}px`);
    if (type === 'artist') node.style('text-max-width', `${wrapWidth / z}px`);
  });
}

// Visual style parameters — driven by sidebar sliders, persisted in localStorage
interface VisualStyle {
  edgeOpacity:    number;  // edge transparency
  edgeWidth:      number;  // base edge line width px
  labelOpacity:   number;  // 0 = hover-only; 1 = always visible (base, no selection)
  labelFalloff:   number;  // per-hop opacity drop when a node is selected
  labelWrapWidth: number;  // screen px before artist names wrap to next line
  sizeArtist:     number;  // artist node diameter
  sizeAlbum:      number;  // album node diameter
  sizeSong:       number;  // song node diameter
}
const DEFAULT_VS: VisualStyle = {
  edgeOpacity: 0.45, edgeWidth: 1.2,
  labelOpacity: 0, labelFalloff: 0.25, labelWrapWidth: 120,
  sizeArtist: 42, sizeAlbum: 32, sizeSong: 24,
};
const VS_STORAGE_KEY = 'bsm-explore-vs';

// BFS label cascade: selected node = 100%, each hop further drops by `vs.labelFalloff`.
// Stores result in node scratch '_co' so hover handlers can restore it on mouseout.
function applyLabelCascade(cy: Core, selectedId: string | null, vs: VisualStyle, showAll: boolean): void {
  if (showAll) {
    cy.nodes().forEach((n) => { n.scratch('_co', 1); n.style('text-opacity', 1); });
    return;
  }
  if (!selectedId) {
    cy.nodes().forEach((n) => { n.scratch('_co', null); n.removeStyle('text-opacity'); });
    return;
  }
  const distances = new Map<string, number>();
  const queue: Array<{ id: string; dist: number }> = [{ id: selectedId, dist: 0 }];
  distances.set(selectedId, 0);
  while (queue.length > 0) {
    const item = queue.shift()!;
    cy.getElementById(item.id).neighborhood('node').forEach((neighbor) => {
      const nid = neighbor.id();
      if (!distances.has(nid)) {
        distances.set(nid, item.dist + 1);
        queue.push({ id: nid, dist: item.dist + 1 });
      }
    });
  }
  cy.nodes().forEach((node) => {
    const dist = distances.get(node.id()) ?? Infinity;
    const opacity = dist === Infinity ? 0 : Math.max(0, 1 - dist * vs.labelFalloff);
    node.scratch('_co', opacity);
    node.style('text-opacity', opacity);
  });
}

function buildCyStyle(vs: VisualStyle = DEFAULT_VS) {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)', 'label': 'data(label)',
        'font-size': '11px', 'font-family': '"Inter", system-ui, sans-serif',
        'font-weight': '600',
        'color': '#ffffff',
        'text-opacity': vs.labelOpacity,
        'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': '4px',
        'text-outline-color': '#060d1a', 'text-outline-width': '2px',
        'width': 'data(size)', 'height': 'data(size)',
        'border-width': '1.5px', 'border-color': '#ffffff22', 'min-zoomed-font-size': 4,
      },
    },
    { selector: 'node[type = "song"]',    style: { 'width': vs.sizeSong, 'height': vs.sizeSong } },
    { selector: 'node[type = "artist"]',  style: { 'width': vs.sizeArtist, 'height': vs.sizeArtist, 'font-size': '13px', 'text-wrap': 'wrap', 'text-max-width': '200px' } },
    { selector: 'node[type = "album"]',   style: { 'width': vs.sizeAlbum, 'height': vs.sizeAlbum } },
    { selector: 'node[type = "theme"]',   style: { 'width': 28, 'height': 28, 'shape': 'diamond' } },
    { selector: 'node[type = "tag"]',     style: { 'width': 22, 'height': 22, 'shape': 'tag' } },
    { selector: 'node[type = "keyword"]', style: { 'width': 18, 'height': 18, 'shape': 'rectangle' } },
    { selector: 'node[type = "emotion"]', style: { 'width': 36, 'height': 36, 'shape': 'pentagon', 'font-size': '12px' } },
    // Selected: white ring + white label, node keeps its own colour
    { selector: 'node:selected', style: { 'border-width': '3px', 'border-color': '#fff', 'text-opacity': 1, 'color': '#ffffff', 'text-outline-width': '2.5px' } },
    // Hover: label and outline snap to full visibility
    { selector: 'node.label-hover', style: { 'text-opacity': 1, 'color': '#ffffff', 'text-outline-width': '2.5px', 'border-width': '2.5px', 'border-color': '#ffffff44' } },
    { selector: 'edge', style: { 'width': vs.edgeWidth, 'line-color': 'data(edgeColor)', 'curve-style': 'bezier', 'opacity': vs.edgeOpacity } },
    { selector: 'edge[edgeWeight > 0.8]', style: { 'width': vs.edgeWidth * 2 } },
    { selector: 'edge.edge-hover', style: { 'opacity': 1, 'width': vs.edgeWidth * 1.8 } },
    { selector: '.faded',       style: { 'opacity': 0.12 } },
    { selector: '.highlighted', style: { 'opacity': 1 } },
  ];
}

function buildElements(nodes: GraphNode[], edges: GraphEdge[]) {
  return [
    ...nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.type === 'artist' ? n.label : (n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label),
        fullLabel: n.label,
        type: n.type,
        color: n.data.color ?? NODE_COLORS[n.type],
        size: n.data.size ?? undefined,
        scores: n.data.scores,
        bandName: n.data.bandName,
        albumTitle: n.data.albumTitle,
        count: n.data.count,
      },
    })),
    ...edges.map((e) => ({
      data: {
        id: e.id, source: e.source, target: e.target,
        edgeType: e.type,
        edgeColor: EDGE_COLORS[e.type] ?? '#ffffff22',
        edgeWeight: e.weight,
      },
    })),
  ];
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

interface Scopes { bands: { id: string; name: string }[]; albums: { id: string; title: string; year: number | null; band: { id: string; name: string } }[] }

function fetchPublicGraph(params: { preset: string; bandIds: string[]; }): Promise<GraphData> {
  const qs = new URLSearchParams({ preset: params.preset });
  if (params.bandIds.length) qs.set('bandIds', params.bandIds.join(','));
  return api.get(`/api/public/graph?${qs}`);
}

function fetchPublicScopes(): Promise<Scopes> {
  return api.get('/api/public/graph/scopes');
}

// ---------------------------------------------------------------------------
// Node detail panel
// ---------------------------------------------------------------------------

function NodeDetailPanel({ node, onClose }: { node: ReturnType<Core['$']> | null; onClose: () => void }) {
  if (!node || node.length === 0) return null;
  const d = node.data() as { fullLabel: string; type: NodeType; scores?: Record<string, number>; bandName?: string; albumTitle?: string; count?: number };
  return (
    <div className="bg-white/5 rounded-lg p-3 text-xs border border-white/10">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-bold text-white text-sm">{d.fullLabel}</div>
          <div className="text-xs font-semibold uppercase tracking-wider mt-0.5" style={{ color: NODE_COLORS[d.type] }}>{d.type}</div>
        </div>
        <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
      </div>
      {d.bandName && <div className="text-white/50 mb-1">{d.bandName}{d.albumTitle ? ` / ${d.albumTitle}` : ''}</div>}
      {d.count !== undefined && <div className="text-white/50 mb-1">Used in {d.count} song{d.count !== 1 ? 's' : ''}</div>}
      {d.scores && (
        <div className="mt-2 space-y-1">
          {Object.entries(d.scores).map(([axis, val]) => (
            <div key={axis} className="flex items-center gap-2">
              <span className="text-white/40 w-20 text-right">{AXIS_LABELS[axis as keyof typeof AXIS_LABELS] ?? axis}</span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(val / 10) * 100}%`, background: NODE_COLORS.song }} />
              </div>
              <span className="text-white/60 font-mono w-5 text-right">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PUBLIC_PRESETS = [
  { id: 'artist-universe',     label: 'Artist Universe',     desc: 'Songs, albums, and tags by artist' },
  { id: 'theme-constellation', label: 'Theme Constellation', desc: 'Songs grouped by shared AI themes' },
  { id: 'emotional-similarity',label: 'Emotional Similarity',desc: 'Songs linked by matching radar' },
  { id: 'lyrical-dna',         label: 'Lyrical DNA',         desc: 'Songs bridged by shared keywords' },
  { id: 'fibonacci-spiral',    label: 'Fibonacci Spiral',    desc: 'All nodes in golden-angle phyllotaxis' },
  { id: 'fractal-tree',        label: 'Fractal Tree',        desc: 'Recursive golden-ratio branching' },
] as const;

type PublicPreset = typeof PUBLIC_PRESETS[number]['id'];

// ---------------------------------------------------------------------------
// StyleSlider — reusable range input for the visual controls panel
// ---------------------------------------------------------------------------

function StyleSlider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/50">{label}</span>
        <span className="text-xs font-mono text-white/40 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-indigo-400 bg-white/10"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ExplorePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef        = useRef<Core | null>(null);
  const animGenRef   = useRef(0);
  const orbitGenRef  = useRef(0);
  const animPulseRef = useRef(true);
  const layoutReadyRef = useRef(false); // true once runClusterLayout (or non-radial layoutstop) fires

  const [preset, setPreset]                     = useState<PublicPreset>('artist-universe');
  const [selectedBandIds, setSelectedBandIds]   = useState<string[]>([]);
  const [selectedNode, setSelectedNode]         = useState<ReturnType<Core['$']> | null>(null);
  const [graphLabel, setGraphLabel]             = useState('');
  const [animatePulse, setAnimatePulse]         = useState(true);
  const [showTags, setShowTags]                 = useState(true);
  const [showThemes, setShowThemes]             = useState(true);
  const [allTagNames, setAllTagNames]           = useState<{ id: string; label: string }[]>([]);
  const [hiddenTagIds, setHiddenTagIds]         = useState<Set<string>>(new Set());
  const [allThemeNames, setAllThemeNames]       = useState<{ id: string; label: string }[]>([]);
  const [hiddenThemeIds, setHiddenThemeIds]     = useState<Set<string>>(new Set());
  const [vStyle, setVStyle]                     = useState<VisualStyle>(() => {
    try { const s = localStorage.getItem(VS_STORAGE_KEY); if (s) return { ...DEFAULT_VS, ...JSON.parse(s) as Partial<VisualStyle> }; } catch { /* ignore */ }
    return DEFAULT_VS;
  });
  const [showStylePanel, setShowStylePanel]     = useState(false);
  const [showAllLabels, setShowAllLabels]       = useState(false);
  const [orbitSpeed, setOrbitSpeed]             = useState(0.004);
  const vStyleRef        = useRef<VisualStyle>(vStyle);
  const showAllLabelsRef = useRef(false);
  const selectedNodeIdRef = useRef<string | null>(null);
  const orbitSpeedRef    = useRef(0.004);

  useEffect(() => { animPulseRef.current = animatePulse; }, [animatePulse]);
  useEffect(() => { orbitSpeedRef.current = orbitSpeed; }, [orbitSpeed]);

  const { data: scopes } = useQuery({ queryKey: ['explore-scopes'], queryFn: fetchPublicScopes });

  const canQuery = selectedBandIds.length > 0;

  const { data: graphData, isFetching, error } = useQuery({
    queryKey: ['explore-graph', preset, selectedBandIds.join(',')],
    queryFn: () => fetchPublicGraph({ preset, bandIds: selectedBandIds }),
    enabled: canQuery,
  });

  // ---------------------------------------------------------------------------
  // Animation helpers
  // ---------------------------------------------------------------------------

  function startOrbitAnimation(cy: Core) {
    orbitGenRef.current++;
    // Snap back to bases before seeding new positions
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
        if (b) n.position(b);
      });
    });
    const gen = ++orbitGenRef.current;
    // Seed base positions for every node
    cy.nodes().forEach((n) => { n.scratch('_orbitBase', { ...n.position() }); });

    // When a user drags a node, update its orbit base so it stays where dropped
    const onFree = (evt: EventObject) => {
      const n = evt.target as NodeSingular;
      n.scratch('_orbitBase', { ...n.position() });
    };
    cy.on('free', 'node', onFree);

    let t = 0;
    const tick = () => {
      if (cy.destroyed() || orbitGenRef.current !== gen) {
        cy.off('free', 'node', onFree as (e: EventObject) => void);
        return;
      }
      t += orbitSpeedRef.current;
      cy.batch(() => {
        // Artists: broad elliptical drift — clearly visible
        cy.nodes('[type = "artist"]').forEach((n, i) => {
          if (n.grabbed() || n.locked()) return;
          const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
          if (!b) return;
          const φ = i * 2.399; // golden-angle phase offset
          n.position({ x: b.x + Math.sin(t + φ) * 14, y: b.y + Math.cos(t * 0.73 + φ) * 10 });
        });
        // Albums: medium orbit, slower period
        cy.nodes('[type = "album"]').forEach((n, i) => {
          if (n.grabbed() || n.locked()) return;
          const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
          if (!b) return;
          const φ = i * 1.618;
          n.position({ x: b.x + Math.sin(t * 0.82 + φ) * 7, y: b.y + Math.cos(t * 0.57 + φ) * 5 });
        });
        // Songs: subtle drift — makes the cloud feel alive
        cy.nodes('[type = "song"]').forEach((n, i) => {
          if (n.grabbed() || n.locked()) return;
          const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
          if (!b) return;
          const φ = i * 0.917;
          n.position({ x: b.x + Math.sin(t * 0.61 + φ) * 3, y: b.y + Math.cos(t * 0.44 + φ) * 2.2 });
        });
        // Themes / keywords / tags: very gentle shimmer
        cy.nodes('[type = "theme"],[type = "keyword"],[type = "tag"]').forEach((n, i) => {
          if (n.grabbed() || n.locked()) return;
          const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
          if (!b) return;
          const φ = i * 1.2;
          n.position({ x: b.x + Math.sin(t * 0.4 + φ) * 1.8, y: b.y + Math.cos(t * 0.3 + φ) * 1.4 });
        });
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function stopOrbit(cy: Core) {
    orbitGenRef.current++;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
        if (b) n.position(b);
      });
    });
  }

  function startPulse(cy: Core) {
    const gen = ++animGenRef.current;
    cy.nodes('[type = "artist"]').forEach((node, i) => {
      const BASE = vStyleRef.current.sizeArtist;
      const PEAK = Math.round(BASE * 1.33);
      const PERIOD = 3000 + i * 700;
      const breathe = () => {
        if (cy.destroyed() || animGenRef.current !== gen) return;
        node.animate({ style: { width: PEAK, height: PEAK } }, {
          duration: PERIOD / 2, easing: 'ease-in-out',
          complete: () => {
            if (cy.destroyed() || animGenRef.current !== gen) return;
            node.animate({ style: { width: BASE, height: BASE } }, {
              duration: PERIOD / 2, easing: 'ease-in-out', complete: breathe,
            });
          },
        });
      };
      setTimeout(() => { if (animGenRef.current === gen) breathe(); }, i * 350);
    });
    startOrbitAnimation(cy);
  }

  function stopAnimation(cy: Core) {
    animGenRef.current++;
    const sz = vStyleRef.current.sizeArtist;
    cy.nodes('[type = "artist"]').stop(true).style({ width: sz, height: sz });
    stopOrbit(cy);
    // Reset song/album/theme positions to their bases
    cy.nodes('[type = "song"],[type = "album"],[type = "theme"],[type = "keyword"],[type = "tag"]').forEach((n) => {
      const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
      if (b) n.position(b);
    });
  }

  // ---------------------------------------------------------------------------
  // Cluster (radial) layout — identical algorithm to SongNodesPage
  // ---------------------------------------------------------------------------

  function runClusterLayout(cy: Core) {
    const TWO_PI = Math.PI * 2;
    const MIN_SONG_R = 90, MIN_ALBUM_R = 200, SONG_ARC = 44, ALBUM_GAP = 70, CLUSTER_GAP = 280;

    const artistAlbums = new Map<string, string[]>();
    const albumSongs   = new Map<string, string[]>();
    const artistDirect = new Map<string, string[]>();

    cy.edges('[edgeType = "same_artist"]').forEach((edge) => {
      const srcType = edge.source().data('type') as string;
      const tgtId = edge.target().id(), srcId = edge.source().id();
      if (srcType === 'album') { const a = artistAlbums.get(tgtId) ?? []; a.push(srcId); artistAlbums.set(tgtId, a); }
      else if (srcType === 'song') { const a = artistDirect.get(tgtId) ?? []; a.push(srcId); artistDirect.set(tgtId, a); }
    });
    cy.edges('[edgeType = "same_album"]').forEach((edge) => {
      if ((edge.source().data('type') as string) !== 'song') return;
      const tgtId = edge.target().id(), srcId = edge.source().id();
      const a = albumSongs.get(tgtId) ?? []; a.push(srcId); albumSongs.set(tgtId, a);
    });

    const songRingR = (n: number) => Math.max(MIN_SONG_R, (n * SONG_ARC) / TWO_PI);

    function placeSongsArc(graph: Core, songIds: string[], ax: number, ay: number, r: number, faceAngle: number) {
      const n = songIds.length; if (n === 0) return;
      const SPREAD = (300 / 360) * TWO_PI;
      songIds.forEach((sid, si) => {
        const a = n === 1 ? faceAngle : (faceAngle - SPREAD / 2) + (si / (n - 1)) * SPREAD;
        graph.getElementById(sid).position({ x: ax + r * Math.cos(a), y: ay + r * Math.sin(a) });
      });
    }

    let xOffset = 0;
    cy.nodes('[type = "artist"]').forEach((artistNode) => {
      const albumIds = artistAlbums.get(artistNode.id()) ?? [];
      const directSongs = artistDirect.get(artistNode.id()) ?? [];
      const totalSlots = albumIds.length + (directSongs.length > 0 ? 1 : 0);
      const ringRadii = albumIds.map((aid) => songRingR((albumSongs.get(aid) ?? []).length));
      let totalArc = 0;
      ringRadii.forEach((r) => { totalArc += 2 * r + ALBUM_GAP; });
      if (directSongs.length > 0) totalArc += 2 * songRingR(directSongs.length) + ALBUM_GAP;
      const albumOrbitR = totalSlots === 0 ? 0 : Math.max(MIN_ALBUM_R, totalArc / TWO_PI);
      const maxSongR = ringRadii.length > 0 ? Math.max(...ringRadii) : (directSongs.length > 0 ? songRingR(directSongs.length) : 0);
      const clusterR = albumOrbitR > 0 ? albumOrbitR + maxSongR + 50 : maxSongR + 50;
      const cx = xOffset + clusterR;
      artistNode.position({ x: cx, y: 0 });
      albumIds.forEach((aid, ai) => {
        const angle = totalSlots > 1 ? (ai / totalSlots) * TWO_PI - Math.PI / 2 : -Math.PI / 2;
        const ax = cx + albumOrbitR * Math.cos(angle), ay = albumOrbitR * Math.sin(angle);
        cy.getElementById(aid).position({ x: ax, y: ay });
        placeSongsArc(cy, albumSongs.get(aid) ?? [], ax, ay, ringRadii[ai]!, angle);
      });
      if (directSongs.length > 0) {
        const slotAngle = totalSlots > 1 ? (albumIds.length / totalSlots) * TWO_PI - Math.PI / 2 : -Math.PI / 2;
        const dx = cx + albumOrbitR * Math.cos(slotAngle), dy = albumOrbitR * Math.sin(slotAngle);
        placeSongsArc(cy, directSongs, dx, dy, songRingR(directSongs.length), slotAngle);
      }
      xOffset += 2 * clusterR + CLUSTER_GAP;
    });

    // Improved tag positioning: place each tag radially OUTSIDE the song ring.
    // Step 1 — compute the outermost song/album radius for each artist cluster.
    const artistOuterR = new Map<string, number>();
    cy.nodes('[type = "artist"]').forEach((artistNode) => {
      const { x: ax, y: ay } = artistNode.position();
      const aid = artistNode.id();
      let maxR = 80;
      (artistAlbums.get(aid) ?? []).forEach((albId) => {
        const ap = cy.getElementById(albId).position();
        maxR = Math.max(maxR, Math.hypot(ap.x - ax, ap.y - ay));
        (albumSongs.get(albId) ?? []).forEach((sid) => {
          const sp = cy.getElementById(sid).position();
          maxR = Math.max(maxR, Math.hypot(sp.x - ax, sp.y - ay));
        });
      });
      (artistDirect.get(aid) ?? []).forEach((sid) => {
        const sp = cy.getElementById(sid).position();
        maxR = Math.max(maxR, Math.hypot(sp.x - ax, sp.y - ay));
      });
      artistOuterR.set(aid, maxR);
    });

    // Step 2 — group each tag by nearest artist and compute its angle + radius.
    const artistTagGroups = new Map<string, { tagNode: NodeSingular; angle: number; r: number }[]>();
    cy.nodes('[type = "tag"]').forEach((tagNode) => {
      const peers = tagNode.neighborhood('node[type = "song"]');
      const connected = peers.length > 0 ? peers : tagNode.neighborhood('node[type = "album"]');
      if (connected.length === 0) return;
      let sumX = 0, sumY = 0;
      connected.forEach((n) => { const p = n.position(); sumX += p.x; sumY += p.y; });
      const centX = sumX / connected.length, centY = sumY / connected.length;
      let nearId = '', nearAx = centX, nearAy = centY, nearDist = Infinity;
      cy.nodes('[type = "artist"]').forEach((a) => {
        const ap = a.position(), d = Math.hypot(ap.x - centX, ap.y - centY);
        if (d < nearDist) { nearDist = d; nearAx = ap.x; nearAy = ap.y; nearId = a.id(); }
      });
      if (!nearId) return;
      const angle = Math.atan2(centY - nearAy, centX - nearAx);
      let maxConnR = 0;
      connected.forEach((n) => {
        const p = n.position();
        maxConnR = Math.max(maxConnR, Math.hypot(p.x - nearAx, p.y - nearAy));
      });
      // Place tag just beyond its connected songs, but no further than the cluster outer ring + 70
      const r = Math.min(maxConnR + 60, (artistOuterR.get(nearId) ?? maxConnR) + 70);
      const list = artistTagGroups.get(nearId) ?? [];
      list.push({ tagNode, angle, r });
      artistTagGroups.set(nearId, list);
    });

    // Step 3 — sort tags by angle within each artist cluster, enforce minimum gap.
    const MIN_ARC = 0.16; // ~9° — enough to separate label text at typical radii
    artistTagGroups.forEach((tags, artistId) => {
      const ap = cy.getElementById(artistId).position();
      tags.sort((a, b) => a.angle - b.angle);
      for (let i = 1; i < tags.length; i++) {
        const prev = tags[i - 1]!;
        const curr = tags[i]!;
        if (curr.angle - prev.angle < MIN_ARC) curr.angle = prev.angle + MIN_ARC;
      }
      tags.forEach(({ tagNode, angle, r }) => {
        tagNode.position({ x: ap.x + r * Math.cos(angle), y: ap.y + r * Math.sin(angle) });
      });
    });

    // Theme placement — same outer-ring algorithm, placed one step further out than tags.
    const artistThemeGroups = new Map<string, { tagNode: NodeSingular; angle: number; r: number }[]>();
    cy.nodes('[type = "theme"]').forEach((themeNode) => {
      const peers = themeNode.neighborhood('node[type = "song"]');
      const connected = peers.length > 0 ? peers : themeNode.neighborhood('node[type = "album"]');
      if (connected.length === 0) return;
      let sumX = 0, sumY = 0;
      connected.forEach((n) => { const p = n.position(); sumX += p.x; sumY += p.y; });
      const centX = sumX / connected.length, centY = sumY / connected.length;
      let nearId = '', nearAx = centX, nearAy = centY, nearDist = Infinity;
      cy.nodes('[type = "artist"]').forEach((a) => {
        const ap = a.position(), d = Math.hypot(ap.x - centX, ap.y - centY);
        if (d < nearDist) { nearDist = d; nearAx = ap.x; nearAy = ap.y; nearId = a.id(); }
      });
      if (!nearId) return;
      const angle = Math.atan2(centY - nearAy, centX - nearAx);
      let maxConnR = 0;
      connected.forEach((n) => { const p = n.position(); maxConnR = Math.max(maxConnR, Math.hypot(p.x - nearAx, p.y - nearAy)); });
      // Place themes ~30px further out than tags
      const r = Math.min(maxConnR + 90, (artistOuterR.get(nearId) ?? maxConnR) + 100);
      const list = artistThemeGroups.get(nearId) ?? [];
      list.push({ tagNode: themeNode, angle, r });
      artistThemeGroups.set(nearId, list);
    });
    artistThemeGroups.forEach((themes, artistId) => {
      const ap = cy.getElementById(artistId).position();
      themes.sort((a, b) => a.angle - b.angle);
      for (let i = 1; i < themes.length; i++) {
        const prev = themes[i - 1]!; const curr = themes[i]!;
        if (curr.angle - prev.angle < MIN_ARC) curr.angle = prev.angle + MIN_ARC;
      }
      themes.forEach(({ tagNode, angle, r }) => {
        tagNode.position({ x: ap.x + r * Math.cos(angle), y: ap.y + r * Math.sin(angle) });
      });
    });

    // Pre-seed orbit bases with new radial positions so the animation restore
    // step doesn't snap artist/album nodes back to the old COSE positions.
    cy.nodes().forEach((n) => { n.scratch('_orbitBase', { ...n.position() }); });
    cy.fit(undefined, 60);
    setTimeout(() => {
      if (!cy.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
        if (animPulseRef.current) startPulse(cy);
      }
    }, 80);
  }

  // ---------------------------------------------------------------------------
  // Theme Constellation layout — each theme is a hub, songs ring around it
  // ---------------------------------------------------------------------------

  function runThemeLayout(cy: Core) {
    const TWO_PI = Math.PI * 2;
    const themeNodes = cy.nodes('[type = "theme"]');

    if (themeNodes.length === 0) {
      layoutReadyRef.current = true;
      updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
      if (animPulseRef.current) startPulse(cy);
      return;
    }

    // Sort themes by how many songs connect to them
    const themesRanked = themeNodes.toArray().map((n) => ({
      node: n,
      songCount: n.neighborhood('node[type = "song"]').length,
    })).sort((a, b) => b.songCount - a.songCount);

    const nThemes = themesRanked.length;
    const THEME_R = Math.max(220, nThemes * 55);

    // Arrange themes in a circle
    themesRanked.forEach(({ node }, i) => {
      const angle = (i / nThemes) * TWO_PI - Math.PI / 2;
      node.position({ x: THEME_R * Math.cos(angle), y: THEME_R * Math.sin(angle) });
    });

    // Place songs in rings around their primary theme (most-connected)
    const songTheme = new Map<string, string>(); // songId → themeId
    // Two passes: first count connections per song per theme, then assign
    cy.nodes('[type = "song"]').forEach((songNode) => {
      let bestTheme = '', bestCount = 0;
      cy.nodes('[type = "theme"]').forEach((t) => {
        const connected = t.neighborhood(`#${CSS.escape(songNode.id())}`).length;
        if (connected > bestCount) { bestCount = connected; bestTheme = t.id(); }
      });
      if (bestTheme) songTheme.set(songNode.id(), bestTheme);
    });

    // Group songs per theme
    const themeGroups = new Map<string, NodeSingular[]>();
    cy.nodes('[type = "song"]').forEach((n) => {
      const tid = songTheme.get(n.id());
      if (!tid) return;
      const arr = themeGroups.get(tid) ?? [];
      arr.push(n);
      themeGroups.set(tid, arr);
    });

    themeGroups.forEach((songs, themeId) => {
      const themeNode = cy.$(`#${CSS.escape(themeId)}`);
      if (!themeNode.length) return;
      const { x: tx, y: ty } = themeNode.position();
      const SONG_R = Math.max(70, (songs.length * 32) / TWO_PI);
      songs.forEach((s, si) => {
        const angle = (si / Math.max(1, songs.length)) * TWO_PI - Math.PI / 2;
        s.position({ x: tx + SONG_R * Math.cos(angle), y: ty + SONG_R * Math.sin(angle) });
      });
    });

    // Songs not assigned to any theme: cluster at origin
    let orphanIdx = 0;
    cy.nodes('[type = "song"]').forEach((n) => {
      if (!songTheme.has(n.id())) {
        const angle = (orphanIdx * 137.5 * Math.PI) / 180;
        n.position({ x: Math.cos(angle) * 50, y: Math.sin(angle) * 50 });
        orphanIdx++;
      }
    });

    cy.nodes().forEach((n) => { n.scratch('_orbitBase', { ...n.position() }); });
    cy.fit(undefined, 60);
    setTimeout(() => {
      if (!cy.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
        if (animPulseRef.current) startPulse(cy);
      }
    }, 80);
  }

  // ---------------------------------------------------------------------------
  // Emotional Similarity layout — emotion anchors as pentagon, songs cluster near dominant
  // ---------------------------------------------------------------------------

  function runEmotionalLayout(cy: Core) {
    const TWO_PI = Math.PI * 2;
    const emotionNodes = cy.nodes('[type = "emotion"]');
    const ANCHOR_R = 320;

    // Place emotion anchors in a regular polygon (pentagon for 5)
    const nEmotions = emotionNodes.length;
    emotionNodes.forEach((n, i) => {
      const angle = (i / Math.max(1, nEmotions)) * TWO_PI - Math.PI / 2;
      n.position({ x: ANCHOR_R * Math.cos(angle), y: ANCHOR_R * Math.sin(angle) });
    });

    // Group songs by their connected emotion anchor
    const emotionGroups = new Map<string, NodeSingular[]>();
    cy.nodes('[type = "song"]').forEach((songNode) => {
      // Find the emotion node this song connects to
      const anchor = songNode
        .connectedEdges('[edgeType = "similar_radar"]')
        .targets('[type = "emotion"]');
      const anchorId = anchor.length > 0 ? anchor[0]!.id() : null;
      if (anchorId) {
        const arr = emotionGroups.get(anchorId) ?? [];
        arr.push(songNode);
        emotionGroups.set(anchorId, arr);
      }
    });

    emotionGroups.forEach((songs, anchorId) => {
      const anchor = cy.$(`#${CSS.escape(anchorId)}`);
      if (!anchor.length) return;
      const { x: ax, y: ay } = anchor.position();
      const SONG_R = Math.max(80, (songs.length * 28) / TWO_PI);
      songs.forEach((s, si) => {
        const angle = (si / Math.max(1, songs.length)) * TWO_PI - Math.PI / 2;
        s.position({ x: ax + SONG_R * Math.cos(angle), y: ay + SONG_R * Math.sin(angle) });
      });
    });

    // Orphan songs (no dominant emotion) — place in center
    let orphanIdx = 0;
    cy.nodes('[type = "song"]').forEach((n) => {
      const hasAnchor = n.connectedEdges('[edgeType = "similar_radar"]').targets('[type = "emotion"]').length > 0;
      if (!hasAnchor) {
        const angle = (orphanIdx * 137.5 * Math.PI) / 180;
        n.position({ x: Math.cos(angle) * 60, y: Math.sin(angle) * 60 });
        orphanIdx++;
      }
    });

    cy.nodes().forEach((n) => { n.scratch('_orbitBase', { ...n.position() }); });
    cy.fit(undefined, 60);
    setTimeout(() => {
      if (!cy.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
        if (animPulseRef.current) startPulse(cy);
      }
    }, 80);
  }

  // ---------------------------------------------------------------------------
  // Lyrical DNA layout — keywords as hubs, songs ring around them
  // ---------------------------------------------------------------------------

  function runLyricalLayout(cy: Core) {
    const TWO_PI = Math.PI * 2;
    const kwNodes = cy.nodes('[type = "keyword"]');

    if (kwNodes.length === 0) {
      layoutReadyRef.current = true;
      if (animPulseRef.current) startPulse(cy);
      return;
    }

    const kwRanked = kwNodes.toArray().map((n) => ({
      node: n,
      songCount: n.neighborhood('node[type = "song"]').length,
    })).sort((a, b) => b.songCount - a.songCount);

    const nKw = kwRanked.length;
    const KW_R = Math.max(200, nKw * 48);

    kwRanked.forEach(({ node }, i) => {
      const angle = (i / nKw) * TWO_PI - Math.PI / 2;
      node.position({ x: KW_R * Math.cos(angle), y: KW_R * Math.sin(angle) });
    });

    // Assign each song to its most-connected keyword
    const songKw = new Map<string, string>();
    cy.nodes('[type = "song"]').forEach((songNode) => {
      let bestKw = '', bestCount = 0;
      kwNodes.forEach((k) => {
        const connected = k.neighborhood(`#${CSS.escape(songNode.id())}`).length;
        if (connected > bestCount) { bestCount = connected; bestKw = k.id(); }
      });
      if (bestKw) songKw.set(songNode.id(), bestKw);
    });

    const kwGroups = new Map<string, NodeSingular[]>();
    cy.nodes('[type = "song"]').forEach((n) => {
      const kid = songKw.get(n.id());
      if (!kid) return;
      const arr = kwGroups.get(kid) ?? [];
      arr.push(n);
      kwGroups.set(kid, arr);
    });

    kwGroups.forEach((songs, kwId) => {
      const kwNode = cy.$(`#${CSS.escape(kwId)}`);
      if (!kwNode.length) return;
      const { x: kx, y: ky } = kwNode.position();
      const SONG_R = Math.max(60, (songs.length * 28) / TWO_PI);
      songs.forEach((s, si) => {
        const angle = (si / Math.max(1, songs.length)) * TWO_PI - Math.PI / 2;
        s.position({ x: kx + SONG_R * Math.cos(angle), y: ky + SONG_R * Math.sin(angle) });
      });
    });

    let orphanIdx = 0;
    cy.nodes('[type = "song"]').forEach((n) => {
      if (!songKw.has(n.id())) {
        const angle = (orphanIdx * 137.5 * Math.PI) / 180;
        n.position({ x: Math.cos(angle) * 50, y: Math.sin(angle) * 50 });
        orphanIdx++;
      }
    });

    cy.nodes().forEach((n) => { n.scratch('_orbitBase', { ...n.position() }); });
    cy.fit(undefined, 60);
    setTimeout(() => {
      if (!cy.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
        if (animPulseRef.current) startPulse(cy);
      }
    }, 80);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fibonacci spiral layout — golden angle phyllotaxis for all visible nodes
  // ──────────────────────────────────────────────────────────────────────────

  function runFibonacciLayout(cy: Core) {
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399 rad (137.5°)
    const SCALE = 32; // px per √index unit

    // Sort: artists → albums → songs → themes → keywords/tags, then by band id for locality
    const typeRank: Record<string, number> = {
      artist: 0, album: 1, song: 2, theme: 3, keyword: 4, tag: 5, emotion: 6,
    };
    const ordered = cy.nodes().toArray().sort((a, b) => {
      const ra = typeRank[a.data('type') as string] ?? 9;
      const rb = typeRank[b.data('type') as string] ?? 9;
      if (ra !== rb) return ra - rb;
      return ((a.data('bandId') as string) ?? '').localeCompare((b.data('bandId') as string) ?? '');
    });

    ordered.forEach((node, i) => {
      const r     = SCALE * Math.sqrt(i + 1);
      const theta = i * GOLDEN_ANGLE;
      node.position({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
    });

    cy.nodes().forEach((n) => { n.scratch('_orbitBase', { ...n.position() }); });
    cy.fit(undefined, 60);
    setTimeout(() => {
      if (!cy.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
        if (animPulseRef.current) startPulse(cy);
      }
    }, 80);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Fractal tree layout — recursive golden-ratio branching, band → album → song
  // Branch length decreases by 1/φ per level; spread angle decreases by 1/φ² per level
  // ──────────────────────────────────────────────────────────────────────────

  function runFractalLayout(cy: Core) {
    const PHI        = (1 + Math.sqrt(5)) / 2;
    const TWO_PI     = Math.PI * 2;
    const TRUNK_LEN  = 220;
    const BRANCH_LEN = TRUNK_LEN / PHI;  // ≈ 136
    const LEAF_LEN   = BRANCH_LEN / PHI; // ≈ 84

    // Build hierarchy maps from edge data
    const artistAlbums = new Map<string, string[]>();
    const albumSongs   = new Map<string, string[]>();
    const artistDirect = new Map<string, string[]>();

    cy.edges('[edgeType = "same_artist"]').forEach((edge) => {
      const srcType = edge.source().data('type') as string;
      const tgtId   = edge.target().id();
      const srcId   = edge.source().id();
      if (srcType === 'album')      { const a = artistAlbums.get(tgtId) ?? []; a.push(srcId); artistAlbums.set(tgtId, a); }
      else if (srcType === 'song')  { const a = artistDirect.get(tgtId) ?? []; a.push(srcId); artistDirect.set(tgtId, a); }
    });
    cy.edges('[edgeType = "same_album"]').forEach((edge) => {
      if ((edge.source().data('type') as string) !== 'song') return;
      const tgtId = edge.target().id(), srcId = edge.source().id();
      const a = albumSongs.get(tgtId) ?? []; a.push(srcId); albumSongs.set(tgtId, a);
    });

    const artists  = cy.nodes('[type = "artist"]').toArray();
    const nArtists = artists.length;

    artists.forEach((artist, bi) => {
      // Trunk direction — each artist points radially outward
      const trunkAngle = nArtists > 1 ? (bi / nArtists) * TWO_PI - Math.PI / 2 : -Math.PI / 2;
      const ax = nArtists > 1 ? TRUNK_LEN * 0.55 * Math.cos(trunkAngle) : 0;
      const ay = nArtists > 1 ? TRUNK_LEN * 0.55 * Math.sin(trunkAngle) : 0;
      artist.position({ x: ax, y: ay });

      const albums    = artistAlbums.get(artist.id()) ?? [];
      const nAlbums   = albums.length;
      const branchSpread = Math.PI / PHI; // ≈ 111° total spread

      albums.forEach((albumId, ai) => {
        const albumAngle = nAlbums > 1
          ? trunkAngle + ((ai / (nAlbums - 1)) - 0.5) * branchSpread
          : trunkAngle;
        const bx = ax + BRANCH_LEN * Math.cos(albumAngle);
        const by = ay + BRANCH_LEN * Math.sin(albumAngle);
        cy.getElementById(albumId).position({ x: bx, y: by });

        const songs    = albumSongs.get(albumId) ?? [];
        const nSongs   = songs.length;
        const leafSpread = Math.PI / (PHI * PHI); // ≈ 68° spread

        songs.forEach((songId, si) => {
          const songAngle = nSongs > 1
            ? albumAngle + ((si / (nSongs - 1)) - 0.5) * leafSpread
            : albumAngle;
          cy.getElementById(songId).position({
            x: bx + LEAF_LEN * Math.cos(songAngle),
            y: by + LEAF_LEN * Math.sin(songAngle),
          });
        });
      });

      // Direct songs (no album) branch directly from artist
      const direct   = artistDirect.get(artist.id()) ?? [];
      const nDirect  = direct.length;
      const directSpread = Math.PI / (PHI * PHI);
      direct.forEach((songId, si) => {
        const songAngle = nDirect > 1
          ? trunkAngle + Math.PI + ((si / (nDirect - 1)) - 0.5) * directSpread
          : trunkAngle + Math.PI;
        cy.getElementById(songId).position({
          x: ax + BRANCH_LEN * Math.cos(songAngle),
          y: ay + BRANCH_LEN * Math.sin(songAngle),
        });
      });
    });

    // Themes and tags: place in a golden-angle spiral around the fractal periphery
    const peripheral = cy.nodes('[type = "theme"], [type = "tag"], [type = "keyword"]').toArray();
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
    peripheral.forEach((node, i) => {
      const r     = 60 + 22 * Math.sqrt(i + 1);
      const theta = i * GOLDEN_ANGLE;
      node.position({ x: r * Math.cos(theta), y: r * Math.sin(theta) });
    });

    cy.nodes().forEach((n) => { n.scratch('_orbitBase', { ...n.position() }); });
    cy.fit(undefined, 60);
    setTimeout(() => {
      if (!cy.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
        if (animPulseRef.current) startPulse(cy);
      }
    }, 80);
  }

  // ---------------------------------------------------------------------------
  // Mount / update Cytoscape
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current || !graphData) return;
    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const elements = buildElements(graphData.nodes, graphData.edges);
    if (!elements.length) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildCyStyle(vStyle) as unknown as cytoscape.StylesheetStyle[],
      layout: { name: 'cose', nodeRepulsion: () => 15000, edgeElasticity: () => 45, idealEdgeLength: () => 80, gravity: 0.8, animate: false, fit: true, padding: 40 } as cytoscape.LayoutOptions,
      minZoom: 0.1, maxZoom: 6,
    });

    cyRef.current = cy;
    layoutReadyRef.current = false; // reset: animation must wait for runClusterLayout
    selectedNodeIdRef.current = null;
    setGraphLabel(graphData.label);

    // Collect tag and theme names for filter panels
    const tags: { id: string; label: string }[] = [];
    const themes: { id: string; label: string }[] = [];
    graphData.nodes.forEach((n) => {
      if (n.type === 'tag')   tags.push({ id: n.id, label: n.label });
      if (n.type === 'theme') themes.push({ id: n.id, label: n.label });
    });
    setAllTagNames(tags.sort((a, b) => a.label.localeCompare(b.label)));
    setAllThemeNames(themes.sort((a, b) => a.label.localeCompare(b.label)));
    setHiddenTagIds(new Set());
    setHiddenThemeIds(new Set());

    let rafPending = false;
    cy.on('zoom', () => {
      if (rafPending) return; rafPending = true;
      requestAnimationFrame(() => { if (!cy.destroyed()) updateFontSizes(cy, vStyleRef.current.labelWrapWidth); rafPending = false; });
    });

    cy.one('layoutstop', () => {
      if (cy.destroyed()) return;
      updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
      // Each layout function sets layoutReadyRef.current = true and calls startPulse
      if (preset === 'artist-universe') {
        runClusterLayout(cy);
      } else if (preset === 'theme-constellation') {
        runThemeLayout(cy);
      } else if (preset === 'emotional-similarity') {
        runEmotionalLayout(cy);
      } else if (preset === 'lyrical-dna') {
        runLyricalLayout(cy);
      } else if (preset === 'fibonacci-spiral') {
        runFibonacciLayout(cy);
      } else if (preset === 'fractal-tree') {
        runFractalLayout(cy);
      } else {
        layoutReadyRef.current = true;
        if (animPulseRef.current) startPulse(cy);
      }
    });

    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target as NodeSingular;
      cy.elements().removeClass('highlighted faded');
      node.closedNeighborhood().addClass('highlighted');
      cy.elements().not(node.closedNeighborhood()).addClass('faded');
      selectedNodeIdRef.current = node.id();
      applyLabelCascade(cy, node.id(), vStyleRef.current, showAllLabelsRef.current);
      setSelectedNode(cy.$(`#${CSS.escape(node.id())}`));
    });
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted faded');
        selectedNodeIdRef.current = null;
        applyLabelCascade(cy, null, vStyleRef.current, showAllLabelsRef.current);
        setSelectedNode(null);
      }
    });

    // Hover: label pops to full opacity (overrides cascade bypass), restores on mouseout
    cy.on('mouseover', 'node', (evt: EventObject) => {
      const n = evt.target as NodeSingular;
      n.addClass('label-hover');
      n.style('text-opacity', 1);
      n.connectedEdges().addClass('edge-hover');
    });
    cy.on('mouseout', 'node', (evt: EventObject) => {
      const n = evt.target as NodeSingular;
      n.removeClass('label-hover');
      n.connectedEdges().removeClass('edge-hover');
      const co = n.scratch('_co') as number | null | undefined;
      if (co !== null && co !== undefined) {
        n.style('text-opacity', co);
      } else {
        n.removeStyle('text-opacity');
      }
    });

    return () => { cy.destroy(); cyRef.current = null; };
  }, [graphData]);

  // Animate toggle — guard with layoutReadyRef so we don't fire during initial COSE
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (animatePulse) {
      if (layoutReadyRef.current) startPulse(cy);
    } else {
      stopAnimation(cy);
    }
  }, [animatePulse, graphLabel]);

  // Show/hide ALL tags
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const display = showTags ? 'element' : 'none';
    cy.nodes('[type = "tag"]').style('display', display);
    cy.edges('[edgeType = "shared_tag"]').style('display', display);
  }, [showTags, graphLabel]);

  // Per-tag visibility (when showTags is on but specific tags hidden)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !showTags) return;
    cy.nodes('[type = "tag"]').forEach((n) => {
      n.style('display', hiddenTagIds.has(n.id()) ? 'none' : 'element');
    });
  }, [hiddenTagIds, showTags, graphLabel]);

  // Show/hide ALL themes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const display = showThemes ? 'element' : 'none';
    cy.nodes('[type = "theme"]').style('display', display);
    cy.edges('[edgeType = "conceptual"]').style('display', display);
  }, [showThemes, graphLabel]);

  // Per-theme visibility
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !showThemes) return;
    cy.nodes('[type = "theme"]').forEach((n) => {
      n.style('display', hiddenThemeIds.has(n.id()) ? 'none' : 'element');
    });
  }, [hiddenThemeIds, showThemes, graphLabel]);

  // Live style update when visual sliders change; reapply cascade with new falloff
  useEffect(() => {
    vStyleRef.current = vStyle;
    localStorage.setItem(VS_STORAGE_KEY, JSON.stringify(vStyle));
    const cy = cyRef.current;
    if (!cy) return;
    // Apply stylesheet first, THEN reapply per-element cascade (cascade must win over stylesheet)
    cy.style(buildCyStyle(vStyle) as unknown as cytoscape.StylesheetStyle[]).update();
    applyLabelCascade(cy, selectedNodeIdRef.current, vStyle, showAllLabelsRef.current);
    // Update font sizes + wrap width for current zoom
    updateFontSizes(cy, vStyle.labelWrapWidth);
    // Restart animation so size changes take effect immediately
    if (animPulseRef.current && layoutReadyRef.current) { stopAnimation(cy); startPulse(cy); }
  }, [vStyle]);

  // Show-all-labels toggle: immediately reapply cascade
  useEffect(() => {
    showAllLabelsRef.current = showAllLabels;
    const cy = cyRef.current;
    if (!cy) return;
    applyLabelCascade(cy, selectedNodeIdRef.current, vStyleRef.current, showAllLabels);
  }, [showAllLabels]);

  const toggleBand = useCallback((id: string) => {
    setSelectedBandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const toggleTag = useCallback((id: string) => {
    setHiddenTagIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const toggleTheme = useCallback((id: string) => {
    setHiddenThemeIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const cyReady       = !!graphLabel && !isFetching;
  const showTagPanel  = showTags   && allTagNames.length   > 0;
  const showThemePanel = showThemes && allThemeNames.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="explore" />
      <div className="border-b border-white/10 px-6 py-2.5 flex items-center gap-3">
        <h1 className="text-sm font-semibold text-white/80">Explore</h1>
        <span className="text-xs text-white/30">Interactive music network — click nodes to explore</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-5">

        {/* Sidebar */}
        <aside className="w-full lg:w-56 lg:shrink-0 space-y-5">

          {/* Layout preset */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">View</div>
            <div className="space-y-1">
              {PUBLIC_PRESETS.map((lp) => (
                <button
                  key={lp.id}
                  className={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors
                    ${preset === lp.id ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                  onClick={() => { setPreset(lp.id); setSelectedNode(null); }}
                  title={lp.desc}
                >
                  {lp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Band filter */}
          {scopes && (
            <div>
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Artists</div>
              <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
                {scopes.bands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" checked={selectedBandIds.includes(b.id)} onChange={() => toggleBand(b.id)} className="accent-indigo-500" />
                    <span className={`text-xs ${selectedBandIds.includes(b.id) ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}>{b.name}</span>
                  </label>
                ))}
              </div>
              {scopes.bands.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  <button className="text-xs text-indigo-400 hover:text-indigo-200" onClick={() => setSelectedBandIds(scopes.bands.map((b) => b.id))}>All</button>
                  <span className="text-white/20">·</span>
                  <button className="text-xs text-white/40 hover:text-white/70" onClick={() => setSelectedBandIds([])}>None</button>
                </div>
              )}
            </div>
          )}

          {/* Arrange */}
          {cyReady && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Arrange</div>
              <button
                className="w-full px-2 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-xs text-white rounded transition-colors"
                onClick={() => {
                  const cy = cyRef.current;
                  if (!cy) return;
                  if (preset === 'theme-constellation') runThemeLayout(cy);
                  else if (preset === 'emotional-similarity') runEmotionalLayout(cy);
                  else if (preset === 'lyrical-dna') runLyricalLayout(cy);
                  else if (preset === 'fibonacci-spiral') runFibonacciLayout(cy);
                  else if (preset === 'fractal-tree') runFractalLayout(cy);
                  else runClusterLayout(cy);
                }}
              >
                Cluster (radial)
              </button>
              <button
                className="w-full px-2 py-1.5 bg-white/10 hover:bg-white/20 text-xs text-white rounded transition-colors"
                onClick={() => cyRef.current?.fit(undefined, 40)}
              >
                Fit view
              </button>
            </div>
          )}

          {/* Options */}
          {cyReady && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Options</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={animatePulse} onChange={(e) => setAnimatePulse(e.target.checked)} className="accent-indigo-500" />
                <span className={`text-xs ${animatePulse ? 'text-white/70' : 'text-white/30'}`}>Animate</span>
              </label>
              {animatePulse && (
                <div className="pl-5">
                  <StyleSlider
                    label="Orbit speed"
                    value={orbitSpeed}
                    min={0.001} max={0.016} step={0.001}
                    onChange={setOrbitSpeed}
                    format={(v) => v <= 0.002 ? 'Slow' : v >= 0.012 ? 'Fast' : `${Math.round(v / 0.004 * 100)}%`}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} className="accent-cyan-500" />
                <span className={`text-xs ${showTags ? 'text-white/70' : 'text-white/30'}`}>Show tags</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showThemes} onChange={(e) => setShowThemes(e.target.checked)} className="accent-emerald-500" />
                <span className={`text-xs ${showThemes ? 'text-white/70' : 'text-white/30'}`}>Show themes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showAllLabels} onChange={(e) => setShowAllLabels(e.target.checked)} className="accent-indigo-500" />
                <span className={`text-xs ${showAllLabels ? 'text-white/70' : 'text-white/30'}`}>Show all labels</span>
              </label>
            </div>
          )}

          {/* Visual style sliders */}
          {cyReady && (
            <div>
              <button
                className="flex items-center justify-between w-full text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 hover:text-white/60 transition-colors"
                onClick={() => setShowStylePanel((v) => !v)}
              >
                <span>Visual</span>
                <span className="text-white/25">{showStylePanel ? '▲' : '▼'}</span>
              </button>
              {showStylePanel && (
                <div className="space-y-4">

                  {/* Nodes */}
                  <div>
                    <div className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">Nodes</div>
                    <div className="space-y-2">
                      <StyleSlider label="Artist size" value={vStyle.sizeArtist} min={20} max={80} step={2}
                        onChange={(v) => setVStyle((s) => ({ ...s, sizeArtist: v }))} format={(v) => `${v}px`} />
                      <StyleSlider label="Album size" value={vStyle.sizeAlbum} min={12} max={60} step={2}
                        onChange={(v) => setVStyle((s) => ({ ...s, sizeAlbum: v }))} format={(v) => `${v}px`} />
                      <StyleSlider label="Song size" value={vStyle.sizeSong} min={8} max={40} step={2}
                        onChange={(v) => setVStyle((s) => ({ ...s, sizeSong: v }))} format={(v) => `${v}px`} />
                    </div>
                  </div>

                  {/* Labels */}
                  <div>
                    <div className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">Labels</div>
                    <div className="space-y-2">
                      <StyleSlider label="Base opacity" value={vStyle.labelOpacity} min={0} max={1} step={0.05}
                        onChange={(v) => setVStyle((s) => ({ ...s, labelOpacity: v }))}
                        format={(v) => v === 0 ? 'Hover only' : `${Math.round(v * 100)}%`} />
                      <StyleSlider label="Wrap width" value={vStyle.labelWrapWidth} min={40} max={220} step={10}
                        onChange={(v) => setVStyle((s) => ({ ...s, labelWrapWidth: v }))} format={(v) => `${v}px`} />
                      <div>
                        <StyleSlider label="Falloff per hop" value={vStyle.labelFalloff} min={0.05} max={0.5} step={0.05}
                          onChange={(v) => setVStyle((s) => ({ ...s, labelFalloff: v }))}
                          format={(v) => `−${Math.round(v * 100)}%`} />
                        <p className="text-xs text-white/20 mt-1 leading-tight">
                          Click a node to activate · 1 hop={Math.max(0, Math.round((1 - vStyle.labelFalloff) * 100))}% · 2 hops={Math.max(0, Math.round((1 - 2 * vStyle.labelFalloff) * 100))}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Edges */}
                  <div>
                    <div className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">Edges</div>
                    <div className="space-y-2">
                      <StyleSlider label="Opacity" value={vStyle.edgeOpacity} min={0.05} max={1} step={0.05}
                        onChange={(v) => setVStyle((s) => ({ ...s, edgeOpacity: v }))} format={(v) => v.toFixed(2)} />
                      <StyleSlider label="Width" value={vStyle.edgeWidth} min={0.5} max={4} step={0.25}
                        onChange={(v) => setVStyle((s) => ({ ...s, edgeWidth: v }))} format={(v) => `${v}px`} />
                    </div>
                  </div>

                  <button onClick={() => setVStyle(DEFAULT_VS)}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors">
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tag selector */}
          {cyReady && showTagPanel && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Tags</div>
                <div className="flex gap-1.5">
                  <button className="text-xs text-cyan-400 hover:text-cyan-200" onClick={() => setHiddenTagIds(new Set())}>All</button>
                  <span className="text-white/20">·</span>
                  <button className="text-xs text-white/40 hover:text-white/70" onClick={() => setHiddenTagIds(new Set(allTagNames.map((t) => t.id)))}>None</button>
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
                {allTagNames.map((t) => {
                  const visible = !hiddenTagIds.has(t.id);
                  return (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={visible} onChange={() => toggleTag(t.id)} className="accent-cyan-500" />
                      <span className={`text-xs ${visible ? 'text-cyan-300/80' : 'text-white/25 group-hover:text-white/50'}`}>{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Theme selector */}
          {cyReady && showThemePanel && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Themes</div>
                <div className="flex gap-1.5">
                  <button className="text-xs text-emerald-400 hover:text-emerald-200" onClick={() => setHiddenThemeIds(new Set())}>All</button>
                  <span className="text-white/20">·</span>
                  <button className="text-xs text-white/40 hover:text-white/70" onClick={() => setHiddenThemeIds(new Set(allThemeNames.map((t) => t.id)))}>None</button>
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto space-y-0.5 pr-1">
                {allThemeNames.map((t) => {
                  const visible = !hiddenThemeIds.has(t.id);
                  return (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={visible} onChange={() => toggleTheme(t.id)} className="accent-emerald-500" />
                      <span className={`text-xs ${visible ? 'text-emerald-300/80' : 'text-white/25 group-hover:text-white/50'}`}>{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Node detail */}
          {selectedNode && selectedNode.length > 0 && (
            <NodeDetailPanel node={selectedNode} onClose={() => {
              setSelectedNode(null);
              cyRef.current?.elements().removeClass('highlighted faded');
            }} />
          )}

          {/* Legend */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Legend</div>
            {(['song','album','artist','theme','tag'] as NodeType[]).map((t) => (
              <div key={t} className="flex items-center gap-2">
                <span style={{ color: NODE_COLORS[t] }}>●</span>
                <span className="text-xs text-white/50 capitalize">{t}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Graph canvas */}
        <main className="flex-1 min-w-0">
          {graphLabel && (
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white/60">{graphLabel}</h2>
              {graphData && <span className="text-xs text-white/30">{graphData.nodes.length} nodes · {graphData.edges.length} edges</span>}
            </div>
          )}

          {!canQuery && (
            <div className="flex flex-col items-center justify-center h-[600px] rounded-xl bg-white/5 border border-white/10 text-white/40 text-sm gap-3">
              <span className="text-4xl opacity-30">✦</span>
              <span>Select one or more artists to explore the network</span>
            </div>
          )}

          {isFetching && (
            <div className="flex items-center justify-center h-[600px] rounded-xl bg-white/5 border border-white/10">
              <div className="flex gap-1.5">
                {[0,1,2].map((i) => (
                  <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-red-400 text-sm p-4">{String(error)}</div>}

          <div
            ref={containerRef}
            className={`rounded-xl overflow-hidden border border-white/10 transition-opacity duration-300
              ${isFetching ? 'opacity-0 pointer-events-none h-0' : 'opacity-100'}`}
            style={{ width: '100%', height: '680px', background: '#060d1a' }}
          />

          {!isFetching && graphData && graphData.nodes.length > 0 && (
            <p className="mt-3 text-xs text-white/30 text-center">
              Click a node to highlight connections · hover to focus label · scroll to zoom · drag to pan
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

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

function updateFontSizes(cy: Core): void {
  const z = cy.zoom();
  cy.nodes().forEach((node) => {
    const type = (node.data('type') as string) || 'song';
    node.style('font-size', `${getBaseFont(type) / z}px`);
  });
}

// Visual style parameters — driven by sidebar sliders
interface VisualStyle {
  edgeOpacity:   number;  // 0.1–1.0
  labelOpacity:  number;  // 0 = hover-only; 1 = always visible
}
const DEFAULT_VS: VisualStyle = { edgeOpacity: 0.45, labelOpacity: 0 };

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
    { selector: 'node[type = "song"]',    style: { 'width': 24, 'height': 24 } },
    { selector: 'node[type = "artist"]',  style: { 'width': 42, 'height': 42, 'font-size': '13px' } },
    { selector: 'node[type = "album"]',   style: { 'width': 32, 'height': 32 } },
    { selector: 'node[type = "theme"]',   style: { 'width': 28, 'height': 28, 'shape': 'diamond' } },
    { selector: 'node[type = "tag"]',     style: { 'width': 22, 'height': 22, 'shape': 'tag' } },
    { selector: 'node[type = "keyword"]', style: { 'width': 18, 'height': 18, 'shape': 'rectangle' } },
    { selector: 'node[type = "emotion"]', style: { 'width': 36, 'height': 36, 'shape': 'pentagon', 'font-size': '12px' } },
    // Selected: white ring + white label, node keeps its own colour
    { selector: 'node:selected', style: { 'border-width': '3px', 'border-color': '#fff', 'text-opacity': 1, 'color': '#ffffff', 'text-outline-width': '2.5px' } },
    // Hover: label and outline snap to full visibility
    { selector: 'node.label-hover', style: { 'text-opacity': 1, 'color': '#ffffff', 'text-outline-width': '2.5px', 'border-width': '2.5px', 'border-color': '#ffffff44' } },
    { selector: 'edge', style: { 'width': 1.2, 'line-color': 'data(edgeColor)', 'curve-style': 'bezier', 'opacity': vs.edgeOpacity } },
    { selector: 'edge[edgeWeight > 0.8]', style: { 'width': 2.5 } },
    { selector: 'edge.edge-hover', style: { 'opacity': 1, 'width': 2 } },
    { selector: '.faded',       style: { 'opacity': 0.12 } },
    { selector: '.highlighted', style: { 'opacity': 1 } },
  ];
}

function buildElements(nodes: GraphNode[], edges: GraphEdge[]) {
  return [
    ...nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label,
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
  { id: 'artist-universe',     label: 'Artist Universe',       desc: 'Songs, albums, and tags by artist' },
  { id: 'theme-constellation', label: 'Theme Constellation',   desc: 'Songs grouped by shared AI themes' },
  { id: 'emotional-similarity',label: 'Emotional Similarity',  desc: 'Songs linked by matching radar' },
  { id: 'lyrical-dna',         label: 'Lyrical DNA',           desc: 'Songs bridged by shared keywords' },
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
  const [vStyle, setVStyle]                     = useState<VisualStyle>(DEFAULT_VS);
  const [showStylePanel, setShowStylePanel]     = useState(false);

  useEffect(() => { animPulseRef.current = animatePulse; }, [animatePulse]);

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
    cy.batch(() => {
      cy.nodes('[type = "artist"], [type = "album"]').forEach((n) => {
        const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
        if (b) n.position(b);
      });
    });
    const gen = ++orbitGenRef.current;
    cy.nodes('[type = "artist"], [type = "album"]').forEach((n) => { n.scratch('_orbitBase', { ...n.position() }); });

    const onFree = (evt: EventObject) => {
      const n = evt.target as NodeSingular;
      if (['artist', 'album'].includes(n.data('type') as string)) n.scratch('_orbitBase', { ...n.position() });
    };
    cy.on('free', 'node', onFree);

    let t = 0;
    const tick = () => {
      if (cy.destroyed() || orbitGenRef.current !== gen) {
        cy.off('free', 'node', onFree as (e: EventObject) => void);
        return;
      }
      t += 0.004;
      cy.batch(() => {
        cy.nodes('[type = "artist"]').forEach((n, i) => {
          if (n.grabbed() || n.locked()) return;
          const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
          if (!b) return;
          const φ = i * 2.399;
          n.position({ x: b.x + Math.sin(t + φ) * 3.5, y: b.y + Math.cos(t * 0.71 + φ) * 2.5 });
        });
        cy.nodes('[type = "album"]').forEach((n, i) => {
          if (n.grabbed() || n.locked()) return;
          const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
          if (!b) return;
          const φ = i * 1.618;
          n.position({ x: b.x + Math.sin(t * 0.8 + φ) * 2, y: b.y + Math.cos(t * 0.55 + φ) * 1.5 });
        });
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function stopOrbit(cy: Core) {
    orbitGenRef.current++;
    cy.batch(() => {
      cy.nodes('[type = "artist"], [type = "album"]').forEach((n) => {
        const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
        if (b) n.position(b);
      });
    });
  }

  function startPulse(cy: Core) {
    const gen = ++animGenRef.current;
    cy.nodes('[type = "artist"]').forEach((node, i) => {
      const BASE = 42, PEAK = 56, PERIOD = 3000 + i * 700;
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
    cy.nodes('[type = "artist"]').stop(true).style({ width: 42, height: 42 });
    stopOrbit(cy);
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
    cy.nodes('[type = "artist"], [type = "album"]').forEach((n) => {
      n.scratch('_orbitBase', { ...n.position() });
    });
    cy.fit(undefined, 60);
    setTimeout(() => {
      if (!cy.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cy);
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
      layout: { name: 'cose', nodeRepulsion: () => 15000, edgeElasticity: () => 45, idealEdgeLength: () => 80, gravity: 0.8, animate: true, animationDuration: 700, fit: true, padding: 40 } as cytoscape.LayoutOptions,
      minZoom: 0.1, maxZoom: 6,
    });

    cyRef.current = cy;
    layoutReadyRef.current = false; // reset: animation must wait for runClusterLayout
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
      requestAnimationFrame(() => { if (!cy.destroyed()) updateFontSizes(cy); rafPending = false; });
    });

    cy.one('layoutstop', () => {
      if (!cy.destroyed()) {
        updateFontSizes(cy);
        if (preset === 'artist-universe') {
          runClusterLayout(cy); // sets layoutReadyRef.current = true internally
        } else {
          layoutReadyRef.current = true;
          if (animPulseRef.current) startPulse(cy);
        }
      }
    });

    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target as NodeSingular;
      cy.elements().removeClass('highlighted faded');
      node.closedNeighborhood().addClass('highlighted');
      cy.elements().not(node.closedNeighborhood()).addClass('faded');
      setSelectedNode(cy.$(`#${CSS.escape(node.id())}`));
    });
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) { cy.elements().removeClass('highlighted faded'); setSelectedNode(null); }
    });

    // Hover: label pops to white, connected edges brighten
    cy.on('mouseover', 'node', (evt: EventObject) => {
      const n = evt.target as NodeSingular;
      n.addClass('label-hover');
      n.connectedEdges().addClass('edge-hover');
    });
    cy.on('mouseout', 'node', (evt: EventObject) => {
      const n = evt.target as NodeSingular;
      n.removeClass('label-hover');
      n.connectedEdges().removeClass('edge-hover');
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

  // Live style update when sliders change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style(buildCyStyle(vStyle) as unknown as cytoscape.StylesheetStyle[]).update();
  }, [vStyle]);

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
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Explore</h1>
          <p className="text-xs text-white/40 mt-0.5">Interactive music network — click nodes to explore connections</p>
        </div>
        <a href="/landing" className="text-xs text-indigo-400 hover:text-indigo-200 transition-colors">← Back</a>
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
                onClick={() => cyRef.current && runClusterLayout(cyRef.current)}
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
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showTags} onChange={(e) => setShowTags(e.target.checked)} className="accent-cyan-500" />
                <span className={`text-xs ${showTags ? 'text-white/70' : 'text-white/30'}`}>Show tags</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showThemes} onChange={(e) => setShowThemes(e.target.checked)} className="accent-emerald-500" />
                <span className={`text-xs ${showThemes ? 'text-white/70' : 'text-white/30'}`}>Show themes</span>
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
                <div className="space-y-3">
                  <p className="text-xs text-white/30 leading-tight">
                    Labels hidden by default — hover any node to reveal its name.
                  </p>
                  <StyleSlider
                    label="Edge opacity"
                    value={vStyle.edgeOpacity}
                    min={0.1} max={1} step={0.05}
                    onChange={(v) => setVStyle((s) => ({ ...s, edgeOpacity: v }))}
                    format={(v) => v.toFixed(2)}
                  />
                  <StyleSlider
                    label="Label visibility"
                    value={vStyle.labelOpacity}
                    min={0} max={1} step={0.05}
                    onChange={(v) => setVStyle((s) => ({ ...s, labelOpacity: v }))}
                    format={(v) => v === 0 ? 'Hover only' : `${Math.round(v * 100)}%`}
                  />
                  <button
                    onClick={() => setVStyle(DEFAULT_VS)}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors"
                  >
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

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

function buildCyStyle() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)', 'label': 'data(label)',
        'font-size': '11px', 'font-family': '"Inter", system-ui, sans-serif',
        'font-weight': '600', 'color': '#e2e8f0',
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
    { selector: 'node:selected', style: { 'border-width': '3px', 'border-color': '#fff', 'background-color': '#fff', 'color': '#000' } },
    { selector: 'edge', style: { 'width': 1.2, 'line-color': 'data(edgeColor)', 'curve-style': 'bezier', 'opacity': 0.7 } },
    { selector: 'edge[edgeWeight > 0.8]', style: { 'width': 2.5 } },
    { selector: '.faded', style: { 'opacity': 0.12 } },
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
// API helpers (uses public endpoints — no auth needed)
// ---------------------------------------------------------------------------

interface Scopes { bands: { id: string; name: string }[]; albums: { id: string; title: string; year: number | null; band: { id: string; name: string } }[] }

function fetchPublicGraph(params: { preset: string; bandIds: string[]; albumId?: string }): Promise<GraphData> {
  const qs = new URLSearchParams({ preset: params.preset });
  if (params.bandIds.length) qs.set('bandIds', params.bandIds.join(','));
  if (params.albumId) qs.set('albumId', params.albumId);
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
// Main page
// ---------------------------------------------------------------------------

const PUBLIC_PRESETS = [
  { id: 'artist-universe',     label: 'Artist Universe',       desc: 'Songs, albums, and tags by artist' },
  { id: 'theme-constellation', label: 'Theme Constellation',   desc: 'Songs grouped by shared AI themes' },
  { id: 'emotional-similarity',label: 'Emotional Similarity',  desc: 'Songs linked by matching radar' },
  { id: 'lyrical-dna',         label: 'Lyrical DNA',           desc: 'Songs bridged by shared keywords' },
] as const;

type PublicPreset = typeof PUBLIC_PRESETS[number]['id'];

export default function ExplorePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef        = useRef<Core | null>(null);
  const animGenRef   = useRef(0);
  const animPulseRef = useRef(true);

  const [preset, setPreset]               = useState<PublicPreset>('artist-universe');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [selectedNode, setSelectedNode]   = useState<ReturnType<Core['$']> | null>(null);
  const [graphLabel, setGraphLabel]       = useState('');
  const [animatePulse, setAnimatePulse]   = useState(true);

  useEffect(() => { animPulseRef.current = animatePulse; }, [animatePulse]);

  const { data: scopes } = useQuery({ queryKey: ['explore-scopes'], queryFn: fetchPublicScopes });

  const canQuery = selectedBandIds.length > 0;

  const { data: graphData, isFetching, error } = useQuery({
    queryKey: ['explore-graph', preset, selectedBandIds.join(',')],
    queryFn: () => fetchPublicGraph({ preset, bandIds: selectedBandIds }),
    enabled: canQuery,
  });

  // Pulse animation — artist nodes breathe
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
  }

  function stopPulse(cy?: Core) {
    animGenRef.current++;
    (cy ?? cyRef.current)?.nodes('[type = "artist"]').stop(true).style({ width: 42, height: 42 });
  }

  // Radial cluster layout (same algorithm as SongNodesPage)
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
      // Reposition tags near their connected nodes
      cy.nodes('[type = "tag"]').forEach((tagNode) => {
        const connected = tagNode.neighborhood('node[type = "song"], node[type = "album"]');
        if (connected.length === 0) return;
        let sumX = 0, sumY = 0;
        connected.forEach((n) => { const p = n.position(); sumX += p.x; sumY += p.y; });
        const centX = sumX / connected.length, centY = sumY / connected.length;
        let nearAx = centX, nearAy = 0, nearDist = Infinity;
        cy.nodes('[type = "artist"]').forEach((a) => {
          const ap = a.position(), d = Math.hypot(ap.x - centX, ap.y - centY);
          if (d < nearDist) { nearDist = d; nearAx = ap.x; nearAy = ap.y; }
        });
        const vx = centX - nearAx, vy = centY - nearAy, vlen = Math.hypot(vx, vy) || 1;
        tagNode.position({ x: centX + (vx / vlen) * 55, y: centY + (vy / vlen) * 55 });
      });
      xOffset += 2 * clusterR + CLUSTER_GAP;
    });

    cy.fit(undefined, 60);
    setTimeout(() => {
      if (!cy.destroyed()) {
        updateFontSizes(cy);
        if (animPulseRef.current) startPulse(cy);
      }
    }, 80);
  }

  // Mount / update Cytoscape
  useEffect(() => {
    if (!containerRef.current || !graphData) return;
    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const elements = buildElements(graphData.nodes, graphData.edges);
    if (!elements.length) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildCyStyle() as unknown as cytoscape.StylesheetStyle[],
      layout: { name: 'cose', nodeRepulsion: () => 15000, edgeElasticity: () => 45, idealEdgeLength: () => 80, gravity: 0.8, animate: true, animationDuration: 700, fit: true, padding: 40 } as cytoscape.LayoutOptions,
      minZoom: 0.1, maxZoom: 6,
    });

    cyRef.current = cy;
    setGraphLabel(graphData.label);

    let rafPending = false;
    cy.on('zoom', () => {
      if (rafPending) return; rafPending = true;
      requestAnimationFrame(() => { if (!cy.destroyed()) updateFontSizes(cy); rafPending = false; });
    });

    cy.one('layoutstop', () => {
      if (!cy.destroyed()) {
        updateFontSizes(cy);
        if (animPulseRef.current) startPulse(cy);
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

    return () => { cy.destroy(); cyRef.current = null; };
  }, [graphData]);

  // Animate toggle
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (animatePulse) startPulse(cy);
    else stopPulse(cy);
  }, [animatePulse, graphLabel]);

  const toggleBand = useCallback((id: string) => {
    setSelectedBandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const cyReady = !!graphLabel && !isFetching;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Explore</h1>
          <p className="text-xs text-white/40 mt-0.5">Interactive music network — click nodes to explore connections</p>
        </div>
        <a href="/landing" className="text-xs text-indigo-400 hover:text-indigo-200 transition-colors">
          ← Back
        </a>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-5">

        {/* Sidebar */}
        <aside className="w-full lg:w-52 lg:shrink-0 space-y-5">

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
              <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
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
            <div className="space-y-2">
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

          {/* Visibility */}
          {cyReady && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Options</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={animatePulse} onChange={(e) => setAnimatePulse(e.target.checked)} className="accent-indigo-500" />
                <span className={`text-xs ${animatePulse ? 'text-white/70' : 'text-white/30'}`}>Animate</span>
              </label>
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
              Click a node to highlight its connections · scroll to zoom · drag to pan
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

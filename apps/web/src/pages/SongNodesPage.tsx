import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular, EventObject } from 'cytoscape';
import {
  songNodesApi,
  LAYOUT_PRESETS,
  type GraphLayoutPreset,
  type GraphNode,
  type GraphEdge,
  type NodeType,
} from '../api/songNodes';
import { AXIS_LABELS } from '@band-spectrum-mapper/shared';
import SocialChatPanel from '../components/social/SocialChatPanel';

// ---------------------------------------------------------------------------
// Color maps
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

// Base font sizes (px) per node type — kept in sync with buildCyStyle
function getBaseFont(type: string): number {
  if (type === 'artist') return 13;
  if (type === 'emotion') return 12;
  return 11;
}

// wrapWidth is in screen-px — convert to graph units via zoom so wrapping stays constant on screen
function updateFontSizes(cy: Core, wrapWidth = 120): void {
  const z = cy.zoom();
  cy.nodes().forEach((node) => {
    const type = (node.data('type') as string) || 'song';
    node.style('font-size', `${getBaseFont(type) / z}px`);
    if (type === 'artist') node.style('text-max-width', `${wrapWidth / z}px`);
  });
}

// ---------------------------------------------------------------------------
// Visual style system (same as ExplorePage — admin gets full control panel)
// ---------------------------------------------------------------------------

interface VisualStyle {
  edgeOpacity:    number;
  edgeWidth:      number;
  labelOpacity:   number;
  labelFalloff:   number;
  labelWrapWidth: number;
  sizeArtist:     number;
  sizeAlbum:      number;
  sizeSong:       number;
}
const DEFAULT_VS: VisualStyle = {
  edgeOpacity: 0.7, edgeWidth: 1.2,
  labelOpacity: 0, labelFalloff: 0.25, labelWrapWidth: 120,
  sizeArtist: 42, sizeAlbum: 32, sizeSong: 24,
};
const VS_STORAGE_KEY = 'bsm-snodes-vs';

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

function StyleSlider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-surface-400">{label}</span>
        <span className="text-xs font-mono text-surface-500 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-indigo-400 bg-surface-600"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cytoscape style
// ---------------------------------------------------------------------------

function buildCyStyle(vs: VisualStyle = DEFAULT_VS) {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        'label': 'data(label)',
        'font-size': '11px',
        'font-family': '"Inter", system-ui, sans-serif',
        'font-weight': '600',
        'color': '#ffffff',
        'text-opacity': vs.labelOpacity,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': '4px',
        'text-outline-color': '#060d1a',
        'text-outline-width': '2px',
        'width': 'data(size)',
        'height': 'data(size)',
        'border-width': '1.5px',
        'border-color': '#ffffff22',
        'min-zoomed-font-size': 4,
      },
    },
    { selector: 'node[type = "song"]',    style: { 'width': vs.sizeSong, 'height': vs.sizeSong } },
    { selector: 'node[type = "artist"]',  style: { 'width': vs.sizeArtist, 'height': vs.sizeArtist, 'font-size': '13px', 'text-wrap': 'wrap', 'text-max-width': '200px' } },
    { selector: 'node[type = "album"]',   style: { 'width': vs.sizeAlbum, 'height': vs.sizeAlbum } },
    { selector: 'node[type = "theme"]',   style: { 'width': 28, 'height': 28, 'shape': 'diamond' } },
    { selector: 'node[type = "tag"]',     style: { 'width': 22, 'height': 22, 'shape': 'tag' } },
    { selector: 'node[type = "keyword"]', style: { 'width': 18, 'height': 18, 'shape': 'rectangle' } },
    { selector: 'node[type = "emotion"]', style: { 'width': 36, 'height': 36, 'shape': 'pentagon', 'font-size': '12px' } },
    { selector: 'node:selected', style: { 'border-width': '3px', 'border-color': '#fff', 'text-opacity': 1, 'color': '#ffffff', 'text-outline-width': '2.5px' } },
    { selector: 'node.label-hover', style: { 'text-opacity': 1, 'color': '#ffffff', 'text-outline-width': '2.5px', 'border-width': '2.5px', 'border-color': '#ffffff44' } },
    { selector: 'edge', style: { 'width': vs.edgeWidth, 'line-color': 'data(edgeColor)', 'curve-style': 'bezier', 'opacity': vs.edgeOpacity } },
    { selector: 'edge[edgeWeight > 0.8]', style: { 'width': vs.edgeWidth * 2 } },
    { selector: 'edge.edge-hover', style: { 'opacity': 1, 'width': vs.edgeWidth * 1.8 } },
    { selector: '.faded',       style: { 'opacity': 0.12 } },
    { selector: '.highlighted', style: { 'opacity': 1 } },
    { selector: '.locked',      style: { 'border-width': '3px', 'border-color': '#ffffff', 'border-opacity': 0.7 } },
  ];
}

// ---------------------------------------------------------------------------
// Cytoscape layout configs per preset
// ---------------------------------------------------------------------------

function buildLayoutConfig(preset: GraphLayoutPreset) {
  const base = { animate: true, animationDuration: 600, fit: true, padding: 40 };
  switch (preset) {
    case 'album-cluster':
      return { ...base, name: 'concentric',
        concentric: (n: NodeSingular) => n.data('type') === 'album' ? 3
          : n.data('type') === 'song' ? 2 : 1,
        levelWidth: () => 1 };
    case 'theme-constellation':
      return { ...base, name: 'cose',
        nodeRepulsion: () => 12000, edgeElasticity: () => 50, idealEdgeLength: () => 60 };
    case 'emotional-similarity':
      return { ...base, name: 'cose',
        nodeRepulsion: () => 8000, edgeElasticity: () => 200, idealEdgeLength: () => 80, gravity: 1.2 };
    case 'lyrical-dna':
      return { ...base, name: 'cose',
        nodeRepulsion: () => 10000, edgeElasticity: () => 80, idealEdgeLength: () => 70 };
    case 'artist-universe':
    case 'maynard-universe':
    default:
      return { ...base, name: 'cose',
        nodeRepulsion: () => 15000, edgeElasticity: () => 45, idealEdgeLength: () => 80, gravity: 0.8 };
  }
}

// ---------------------------------------------------------------------------
// Build Cytoscape element array from API data
// ---------------------------------------------------------------------------

function buildElements(nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeEls = nodes.map((n) => ({
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
  }));

  const edgeEls = edges.map((e) => ({
    data: {
      id: e.id,
      source: e.source,
      target: e.target,
      edgeType: e.type,
      edgeColor: EDGE_COLORS[e.type] ?? '#ffffff22',
      edgeWeight: e.weight,
      label: e.label,
    },
  }));

  return [...nodeEls, ...edgeEls];
}

// ---------------------------------------------------------------------------
// Node detail panel
// ---------------------------------------------------------------------------

function NodeDetailPanel({
  node,
  onClose,
}: {
  node: ReturnType<Core['$']> | null;
  onClose: () => void;
}) {
  if (!node || node.length === 0) return null;

  const d = node.data() as {
    fullLabel: string;
    type: NodeType;
    scores?: Record<string, number>;
    bandName?: string;
    albumTitle?: string;
    count?: number;
  };

  return (
    <div className="bg-surface-800 rounded-lg p-3 text-xs">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-bold text-white text-sm">{d.fullLabel}</div>
          <div
            className="text-xs font-semibold uppercase tracking-wider mt-0.5"
            style={{ color: NODE_COLORS[d.type] }}
          >
            {d.type}
          </div>
        </div>
        <button onClick={onClose} className="text-surface-500 hover:text-white">✕</button>
      </div>

      {d.bandName && (
        <div className="text-surface-400 mb-1">{d.bandName}{d.albumTitle ? ` / ${d.albumTitle}` : ''}</div>
      )}
      {d.count !== undefined && (
        <div className="text-surface-400 mb-1">Used in {d.count} song{d.count !== 1 ? 's' : ''}</div>
      )}
      {d.scores && (
        <div className="mt-2 space-y-1">
          {Object.entries(d.scores).map(([axis, val]) => (
            <div key={axis} className="flex items-center gap-2">
              <span className="text-surface-500 w-20 text-right">
                {AXIS_LABELS[axis as keyof typeof AXIS_LABELS] ?? axis}
              </span>
              <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(val / 10) * 100}%`, background: NODE_COLORS.song }}
                />
              </div>
              <span className="text-surface-300 font-mono w-5 text-right">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function exportCytoscapePng(cy: Core, filename: string, width = 1080, height = 1080): void {
  const dataUrl = cy.png({
    output: 'base64uri',
    bg: '#060d1a',
    scale: Math.ceil(width / cy.width()),
    full: false,
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#060d1a';
  ctx.fillRect(0, 0, width, height);

  const img = new Image();
  img.onload = () => {
    const aspect = img.width / img.height;
    let dw = width, dh = height;
    if (aspect > 1) dh = width / aspect;
    else dw = height * aspect;
    ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
    ctx.fillStyle = '#1e3a5f99';
    ctx.font = 'bold 14px "Inter", system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('Band Spectrum Mapper', width - 16, height - 16);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    }, 'image/png');
  };
  img.src = dataUrl;
}

// ---------------------------------------------------------------------------
// Interactive legend — click to filter/highlight node or edge types
// ---------------------------------------------------------------------------

function InteractiveLegend({
  nodeFilter,
  edgeFilter,
  onNodeType,
  onEdgeType,
  onClear,
}: {
  nodeFilter: NodeType | null;
  edgeFilter: string | null;
  onNodeType: (type: NodeType) => void;
  onEdgeType: (type: string) => void;
  onClear: () => void;
}) {
  const nodeTypes: { type: NodeType; label: string; shape: string }[] = [
    { type: 'song',    label: 'Song',    shape: '●' },
    { type: 'album',   label: 'Album',   shape: '●' },
    { type: 'artist',  label: 'Artist',  shape: '●' },
    { type: 'theme',   label: 'Theme',   shape: '◆' },
    { type: 'tag',     label: 'Tag',     shape: '■' },
    { type: 'keyword', label: 'Keyword', shape: '■' },
    { type: 'emotion', label: 'Emotion', shape: '⬠' },
  ];
  const edgeTypes: { type: string; label: string }[] = [
    { type: 'same_artist',   label: 'Same artist' },
    { type: 'same_album',    label: 'Same album' },
    { type: 'shared_tag',    label: 'Shared tag' },
    { type: 'similar_radar', label: 'Similar radar' },
    { type: 'conceptual',    label: 'AI theme link' },
    { type: 'shared_word',   label: 'Shared word' },
  ];

  const hasFilter = nodeFilter !== null || edgeFilter !== null;

  return (
    <div className="bg-surface-800/60 rounded-lg p-3 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-surface-500 text-xs">Click to filter</span>
        {hasFilter && (
          <button onClick={onClear} className="text-indigo-400 hover:text-indigo-200 text-xs transition-colors">
            Clear ✕
          </button>
        )}
      </div>

      <div>
        <div className="text-surface-400 uppercase tracking-wider font-semibold mb-1.5">Nodes</div>
        <div className="space-y-0.5">
          {nodeTypes.map((t) => {
            const active = nodeFilter === t.type;
            return (
              <button
                key={t.type}
                onClick={() => onNodeType(t.type)}
                className={`w-full flex items-center gap-2 px-1.5 py-1 rounded transition-colors text-left
                  ${active ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-surface-700/60'}`}
              >
                <span style={{ color: NODE_COLORS[t.type] }}>{t.shape}</span>
                <span className={active ? 'text-white font-medium' : 'text-surface-300'}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-surface-400 uppercase tracking-wider font-semibold mb-1.5">Edges</div>
        <div className="space-y-0.5">
          {edgeTypes.map((e) => {
            const active = edgeFilter === e.type;
            return (
              <button
                key={e.type}
                onClick={() => onEdgeType(e.type)}
                className={`w-full flex items-center gap-2 px-1.5 py-1 rounded transition-colors text-left
                  ${active ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-surface-700/60'}`}
              >
                <div
                  className="w-6 h-0.5 rounded shrink-0"
                  style={{ background: EDGE_COLORS[e.type]?.replace('44', 'cc') }}
                />
                <span className={active ? 'text-white font-medium' : 'text-surface-300'}>{e.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SongNodesPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const lockedNodeIdsRef = useRef(new Set<string>());

  const [preset, setPreset] = useState<GraphLayoutPreset>('artist-universe');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [selectedNode, setSelectedNode] = useState<ReturnType<Core['$']> | null>(null);
  const [graphLabel, setGraphLabel] = useState('');
  const [lockedCount, setLockedCount] = useState(0);
  const [legendNodeFilter, setLegendNodeFilter] = useState<NodeType | null>(null);
  const [legendEdgeFilter, setLegendEdgeFilter] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<'pan' | 'select'>('pan');
  const [showTags, setShowTags] = useState(true);
  const [showThemes, setShowThemes] = useState(true);
  const [animatePulse, setAnimatePulse] = useState(true);
  const [vStyle, setVStyle] = useState<VisualStyle>(() => {
    try { const s = localStorage.getItem(VS_STORAGE_KEY); if (s) return { ...DEFAULT_VS, ...JSON.parse(s) as Partial<VisualStyle> }; } catch { /* ignore */ }
    return DEFAULT_VS;
  });
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const vStyleRef         = useRef<VisualStyle>(vStyle);
  const showAllLabelsRef  = useRef(false);
  const selectedNodeIdRef = useRef<string | null>(null);
  const animatePulseRef = useRef(true);
  const animGenRef  = useRef(0);
  const orbitGenRef = useRef(0);
  const layoutReadyRef = useRef(false); // true once radial layout (or non-radial layoutstop) fires

  const { data: scopes } = useQuery({
    queryKey: ['song-nodes-scopes'],
    queryFn: songNodesApi.getScopes,
  });

  const needsAlbum = preset === 'album-cluster';
  const isUniversal = preset === 'maynard-universe';

  const canQuery = isUniversal
    || (needsAlbum && !!selectedAlbumId)
    || (!needsAlbum && selectedBandIds.length > 0);

  const { data: graphData, isFetching, error } = useQuery({
    queryKey: ['song-nodes', preset, selectedBandIds.join(','), selectedAlbumId],
    queryFn: () => songNodesApi.getGraph({
      preset,
      bandIds: selectedBandIds,
      albumId: selectedAlbumId || undefined,
    }),
    enabled: canQuery,
  });

  // ── Mount / update Cytoscape ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    // Reset per-graph UI state
    lockedNodeIdsRef.current.clear();
    setLockedCount(0);
    setLegendNodeFilter(null);
    setLegendEdgeFilter(null);
    setSelectionMode('pan');

    const elements = buildElements(graphData.nodes, graphData.edges);
    if (!elements.length) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildCyStyle(vStyle) as unknown as cytoscape.StylesheetStyle[],
      layout: buildLayoutConfig(graphData.preset),
      minZoom: 0.1,
      maxZoom: 6,
    });

    cyRef.current = cy;
    layoutReadyRef.current = false; // reset: animation must wait for radial layout
    selectedNodeIdRef.current = null;
    setGraphLabel(graphData.label);

    // Zoom-constant text: font-size = base / zoom so it stays same screen size
    let rafPending = false;
    cy.on('zoom', () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        if (!cy.destroyed()) updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
        rafPending = false;
      });
    });

    // Set correct font sizes once the initial layout settles; auto-apply radial for universe presets
    cy.one('layoutstop', () => {
      if (!cy.destroyed()) {
        updateFontSizes(cy, vStyleRef.current.labelWrapWidth);
        if (graphData.preset === 'artist-universe' || graphData.preset === 'maynard-universe') {
          runClusterLayout(); // sets layoutReadyRef.current = true internally
        } else {
          layoutReadyRef.current = true;
          if (animatePulseRef.current) startPulseAnimation(cy);
        }
      }
    });

    // Double-tap to lock/unlock a node's position
    cy.on('dbltap', 'node', (evt: EventObject) => {
      const node = evt.target as NodeSingular;
      const id = node.id();
      if (lockedNodeIdsRef.current.has(id)) {
        lockedNodeIdsRef.current.delete(id);
        node.unlock();
        node.removeClass('locked');
      } else {
        lockedNodeIdsRef.current.add(id);
        node.lock();
        node.addClass('locked');
      }
      setLockedCount(lockedNodeIdsRef.current.size);
    });

    // Single tap → highlight neighbours, cascade labels by distance, show detail
    cy.on('tap', 'node', (evt: EventObject) => {
      const node = evt.target as NodeSingular;
      cy.elements().removeClass('highlighted faded');
      const neighbourhood = node.closedNeighborhood();
      neighbourhood.addClass('highlighted');
      cy.elements().not(neighbourhood).addClass('faded');
      selectedNodeIdRef.current = node.id();
      applyLabelCascade(cy, node.id(), vStyleRef.current, showAllLabelsRef.current);
      setSelectedNode(cy.$(`#${CSS.escape(node.id())}`));
    });

    // Background tap → clear selection and label cascade
    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted faded');
        selectedNodeIdRef.current = null;
        applyLabelCascade(cy, null, vStyleRef.current, showAllLabelsRef.current);
        setSelectedNode(null);
      }
    });

    // Hover: force label to full opacity (overrides cascade bypass), restore on mouseout
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

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graphData]);

  // Apply selection vs pan mode to existing cy instance
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.userPanningEnabled(selectionMode === 'pan');
    cy.boxSelectionEnabled(selectionMode === 'select');
  }, [selectionMode]);

  // Show/hide tag nodes and shared_tag edges
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const display = showTags ? 'element' : 'none';
    cy.nodes('[type = "tag"]').style('display', display);
    cy.edges('[edgeType = "shared_tag"]').style('display', display);
  }, [showTags, graphLabel]); // graphLabel as proxy for cy being mounted

  // Show/hide theme nodes and conceptual edges
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const display = showThemes ? 'element' : 'none';
    cy.nodes('[type = "theme"]').style('display', display);
    cy.edges('[edgeType = "conceptual"]').style('display', display);
  }, [showThemes, graphLabel]);

  // Live style updates when visual sliders change; reapply cascade with new falloff
  useEffect(() => {
    vStyleRef.current = vStyle;
    localStorage.setItem(VS_STORAGE_KEY, JSON.stringify(vStyle));
    const cy = cyRef.current;
    if (!cy) return;
    cy.style(buildCyStyle(vStyle) as unknown as cytoscape.StylesheetStyle[]).update();
    applyLabelCascade(cy, selectedNodeIdRef.current, vStyle, showAllLabelsRef.current);
    updateFontSizes(cy, vStyle.labelWrapWidth);
    if (animatePulseRef.current && layoutReadyRef.current) { stopPulseAnimation(cy); startPulseAnimation(cy); }
  }, [vStyle]);

  // Show-all-labels toggle: immediately reapply cascade
  useEffect(() => {
    showAllLabelsRef.current = showAllLabels;
    const cy = cyRef.current;
    if (!cy) return;
    applyLabelCascade(cy, selectedNodeIdRef.current, vStyleRef.current, showAllLabels);
  }, [showAllLabels]);

  // Keep the ref in sync so animation callbacks always see current value
  useEffect(() => { animatePulseRef.current = animatePulse; }, [animatePulse]);

  // Start/stop animation — guard with layoutReadyRef so we don't fire during COSE
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (animatePulse) {
      if (layoutReadyRef.current) startPulseAnimation(cy);
    } else {
      stopPulseAnimation(cy);
    }
  }, [animatePulse, graphLabel]);

  const toggleBand = useCallback((id: string) => {
    setSelectedBandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // ── Layout & arrange controls ─────────────────────────────────────────────

  function doExport(size: 1080 | 1920) {
    if (!cyRef.current || !graphData) return;
    exportCytoscapePng(
      cyRef.current,
      `song-nodes-${graphData.preset}-${size}x${size === 1920 ? 1920 : 1080}.png`,
      1080,
      size === 1920 ? 1920 : 1080,
    );
  }

  function resetLayout() {
    if (!cyRef.current || !graphData) return;
    cyRef.current.layout(buildLayoutConfig(graphData.preset) as cytoscape.LayoutOptions).run();
  }

  function fitView() {
    cyRef.current?.fit(undefined, 40);
  }

  // Radial cluster: Artist at centre → Albums orbit around it → Songs orbit around each Album
  function runClusterLayout() {
    const cy = cyRef.current;
    if (!cy) return;

    const TWO_PI      = Math.PI * 2;
    const MIN_SONG_R  = 90;   // min ring radius for songs around their album
    const MIN_ALBUM_R = 200;  // min orbit radius for albums around their artist
    const SONG_ARC    = 44;   // arc-length budget (px) per song on its ring
    const ALBUM_GAP   = 70;   // extra arc-padding between adjacent album clusters
    const CLUSTER_GAP = 280;  // horizontal gap between separate artist groups

    // Build hierarchy maps from graph edges
    const artistAlbums = new Map<string, string[]>();
    const albumSongs   = new Map<string, string[]>();
    const artistDirect = new Map<string, string[]>(); // songs with no album

    cy.edges('[edgeType = "same_artist"]').forEach((edge) => {
      const srcType = edge.source().data('type') as string;
      const tgtId   = edge.target().id();
      const srcId   = edge.source().id();
      if (srcType === 'album') {
        const a = artistAlbums.get(tgtId) ?? [];
        a.push(srcId);
        artistAlbums.set(tgtId, a);
      } else if (srcType === 'song') {
        const a = artistDirect.get(tgtId) ?? [];
        a.push(srcId);
        artistDirect.set(tgtId, a);
      }
    });
    cy.edges('[edgeType = "same_album"]').forEach((edge) => {
      if ((edge.source().data('type') as string) !== 'song') return;
      const tgtId = edge.target().id();
      const srcId = edge.source().id();
      const a = albumSongs.get(tgtId) ?? [];
      a.push(srcId);
      albumSongs.set(tgtId, a);
    });

    // Radius of the song ring around an album with n songs
    const songRingR = (n: number) => Math.max(MIN_SONG_R, (n * SONG_ARC) / TWO_PI);

    // Spread songs in a 300° arc centred on `faceAngle` at radius `r` around (ax, ay)
    function placeSongsArc(graph: Core, songIds: string[], ax: number, ay: number, r: number, faceAngle: number) {
      const n = songIds.length;
      if (n === 0) return;
      const SPREAD = (300 / 360) * TWO_PI;
      songIds.forEach((sid, si) => {
        const a = n === 1 ? faceAngle : (faceAngle - SPREAD / 2) + (si / (n - 1)) * SPREAD;
        graph.getElementById(sid).position({ x: ax + r * Math.cos(a), y: ay + r * Math.sin(a) });
      });
    }

    let xOffset = 0;

    cy.nodes('[type = "artist"]').forEach((artistNode) => {
      const albumIds    = artistAlbums.get(artistNode.id()) ?? [];
      const directSongs = artistDirect.get(artistNode.id()) ?? [];
      const totalSlots  = albumIds.length + (directSongs.length > 0 ? 1 : 0);

      // Per-album song-ring radii
      const ringRadii = albumIds.map((aid) => songRingR((albumSongs.get(aid) ?? []).length));

      // How much circumference is needed to space all album clusters around the artist?
      let totalArc = 0;
      ringRadii.forEach((r) => { totalArc += 2 * r + ALBUM_GAP; });
      if (directSongs.length > 0) totalArc += 2 * songRingR(directSongs.length) + ALBUM_GAP;

      const albumOrbitR = totalSlots === 0
        ? 0
        : Math.max(MIN_ALBUM_R, totalArc / TWO_PI);

      const maxSongR = ringRadii.length > 0
        ? Math.max(...ringRadii)
        : (directSongs.length > 0 ? songRingR(directSongs.length) : 0);
      const clusterR = albumOrbitR > 0 ? albumOrbitR + maxSongR + 50 : maxSongR + 50;

      // Artist sits at the centre of its cluster
      const cx = xOffset + clusterR;
      artistNode.position({ x: cx, y: 0 });

      // Albums evenly around the artist starting from top (−π/2)
      albumIds.forEach((aid, ai) => {
        const angle = totalSlots > 1 ? (ai / totalSlots) * TWO_PI - Math.PI / 2 : -Math.PI / 2;
        const ax = cx + albumOrbitR * Math.cos(angle);
        const ay = albumOrbitR * Math.sin(angle);
        cy.getElementById(aid).position({ x: ax, y: ay });

        const songIds = albumSongs.get(aid) ?? [];
        placeSongsArc(cy, songIds, ax, ay, ringRadii[ai]!, angle);
      });

      // Albumless songs get their own slot in the orbit
      if (directSongs.length > 0) {
        const slotAngle = totalSlots > 1
          ? (albumIds.length / totalSlots) * TWO_PI - Math.PI / 2
          : -Math.PI / 2;
        const dx = cx + albumOrbitR * Math.cos(slotAngle);
        const dy = albumOrbitR * Math.sin(slotAngle);
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

    // Theme placement — same outer-ring algorithm, one step further out than tags.
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
      if (cyRef.current && !cyRef.current.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cyRef.current, vStyleRef.current.labelWrapWidth);
        if (animatePulseRef.current) startPulseAnimation(cyRef.current);
      }
    }, 80);
  }

  // Force layout — saves locked node positions and restores them after
  function runFreeLayout() {
    const cy = cyRef.current;
    if (!cy) return;
    const locked = cy.nodes('.locked');
    const savedPos = new Map<string, { x: number; y: number }>();
    locked.forEach((n) => {
      const p = n.position();
      savedPos.set(n.id(), { x: p.x, y: p.y });
    });

    cy.one('layoutstop', () => {
      locked.forEach((n) => {
        const p = savedPos.get(n.id());
        if (p) n.position(p);
      });
    });

    cy.layout({
      name: 'cose',
      nodeRepulsion: () => 14000,
      edgeElasticity: () => 45,
      idealEdgeLength: () => 80,
      gravity: 0.8,
      animate: true,
      animationDuration: 600,
      fit: savedPos.size === 0,
      padding: 40,
    } as cytoscape.LayoutOptions).run();
  }

  // Custom column layout: artist column header → albums horizontally → songs stacked vertically
  function runNeatLayout() {
    const cy = cyRef.current;
    if (!cy) return;

    const SONG_H    = 38;    // vertical gap per song within an album column
    const ALBUM_W   = 130;   // horizontal width allocated per album column
    const ROW_H     = 200;   // vertical gap: artist → album row
    const SONG_TOP  = ROW_H + 180; // y-start for first song (below album node)
    const GROUP_PAD = 80;    // extra gap between artist groups

    // Build hierarchy maps from the graph edges
    const artistAlbums = new Map<string, string[]>();  // artistId → albumIds
    const albumSongs   = new Map<string, string[]>();  // albumId  → songIds
    const artistDirect = new Map<string, string[]>();  // artistId → albumless songIds

    cy.edges('[edgeType = "same_artist"]').forEach((edge) => {
      const srcType = edge.source().data('type') as string;
      const tgtId   = edge.target().id();
      const srcId   = edge.source().id();
      if (srcType === 'album') {
        const a = artistAlbums.get(tgtId) ?? [];
        a.push(srcId);
        artistAlbums.set(tgtId, a);
      } else if (srcType === 'song') {
        const a = artistDirect.get(tgtId) ?? [];
        a.push(srcId);
        artistDirect.set(tgtId, a);
      }
    });
    cy.edges('[edgeType = "same_album"]').forEach((edge) => {
      if ((edge.source().data('type') as string) !== 'song') return;
      const tgtId = edge.target().id();
      const srcId = edge.source().id();
      const a = albumSongs.get(tgtId) ?? [];
      a.push(srcId);
      albumSongs.set(tgtId, a);
    });

    let xCursor = 0;
    cy.nodes('[type = "artist"]').forEach((artistNode) => {
      const albumIds    = artistAlbums.get(artistNode.id()) ?? [];
      const directSongs = artistDirect.get(artistNode.id()) ?? [];

      // Each album gets ALBUM_W, direct songs share one column on the right
      const directColW = directSongs.length > 0 ? ALBUM_W : 0;
      const subtreeW   = albumIds.length * ALBUM_W + directColW;
      const groupW     = Math.max(ALBUM_W, subtreeW) + GROUP_PAD;

      // Artist name sits centred over its column group
      artistNode.position({ x: xCursor + groupW / 2, y: 0 });

      // Albums in a horizontal row below the artist, songs stacked vertically below each album
      albumIds.forEach((aid, ai) => {
        const albumX    = xCursor + ai * ALBUM_W + ALBUM_W / 2;
        const albumNode = cy.getElementById(aid);
        albumNode.position({ x: albumX, y: ROW_H });

        // Songs stacked vertically in this album's column
        const songIds = albumSongs.get(aid) ?? [];
        songIds.forEach((sid, si) => {
          cy.getElementById(sid).position({ x: albumX, y: SONG_TOP + si * SONG_H });
        });
      });

      // Albumless songs stack vertically in their own column to the right of albums
      if (directSongs.length > 0) {
        const directX = xCursor + albumIds.length * ALBUM_W + ALBUM_W / 2;
        directSongs.forEach((sid, si) => {
          cy.getElementById(sid).position({ x: directX, y: SONG_TOP + si * SONG_H });
        });
      }

      xCursor += groupW;
    });

    cy.fit(undefined, 60);
    setTimeout(() => {
      if (cyRef.current && !cyRef.current.destroyed()) {
        layoutReadyRef.current = true;
        updateFontSizes(cyRef.current, vStyleRef.current.labelWrapWidth);
        if (animatePulseRef.current) startPulseAnimation(cyRef.current);
      }
    }, 80);
  }

  function unlockAll() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes('.locked').forEach((n) => { n.unlock(); n.removeClass('locked'); });
    lockedNodeIdsRef.current.clear();
    setLockedCount(0);
  }

  // Pulse animation — artist nodes gently breathe in and out
  function startPulseAnimation(cy: Core) {
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
              duration: PERIOD / 2, easing: 'ease-in-out',
              complete: breathe,
            });
          },
        });
      };
      setTimeout(() => { if (animGenRef.current === gen) breathe(); }, i * 350);
    });
    startOrbitAnimation(cy);
  }

  function stopPulseAnimation(cy?: Core) {
    animGenRef.current++;
    const target = cy ?? cyRef.current;
    const sz = vStyleRef.current.sizeArtist;
    target?.nodes('[type = "artist"]').stop(true).style({ width: sz, height: sz });
    stopOrbitAnimation(target ?? undefined);
  }

  // Orbit animation — nodes drift on slow Lissajous paths (feels alive)
  function startOrbitAnimation(cy: Core) {
    // Cancel any running orbit and snap back first
    orbitGenRef.current++;
    cy.batch(() => {
      cy.nodes('[type = "artist"], [type = "album"]').forEach((n) => {
        const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
        if (b) n.position(b);
      });
    });

    const gen = ++orbitGenRef.current;
    // Capture layout positions as orbit centres
    cy.nodes('[type = "artist"], [type = "album"]').forEach((n) => {
      n.scratch('_orbitBase', { ...n.position() });
    });

    // Update base when user manually moves a node
    const onFree = (evt: EventObject) => {
      const n = evt.target as NodeSingular;
      if (['artist', 'album'].includes(n.data('type') as string)) {
        n.scratch('_orbitBase', { ...n.position() });
      }
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
          const φ = i * 2.399; // golden angle for phase stagger
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

  function stopOrbitAnimation(cy?: Core) {
    orbitGenRef.current++;
    const target = cy ?? cyRef.current;
    if (!target) return;
    target.batch(() => {
      target.nodes('[type = "artist"], [type = "album"]').forEach((n) => {
        const b = n.scratch('_orbitBase') as { x: number; y: number } | undefined;
        if (b) n.position(b);
      });
    });
  }

  // ── Legend filter controls ────────────────────────────────────────────────

  function handleLegendNodeType(type: NodeType) {
    const cy = cyRef.current;
    if (!cy) return;
    if (legendNodeFilter === type) {
      cy.elements().removeClass('highlighted faded');
      setLegendNodeFilter(null);
    } else {
      cy.elements().removeClass('highlighted faded');
      cy.nodes(`[type = "${type}"]`).addClass('highlighted');
      cy.nodes().not(`[type = "${type}"]`).addClass('faded');
      cy.edges().addClass('faded');
      setLegendNodeFilter(type);
      setLegendEdgeFilter(null);
    }
  }

  function handleLegendEdgeType(type: string) {
    const cy = cyRef.current;
    if (!cy) return;
    if (legendEdgeFilter === type) {
      cy.elements().removeClass('highlighted faded');
      setLegendEdgeFilter(null);
    } else {
      cy.elements().removeClass('highlighted faded');
      cy.edges(`[edgeType = "${type}"]`).addClass('highlighted');
      cy.edges().not(`[edgeType = "${type}"]`).addClass('faded');
      cy.nodes().addClass('faded');
      // Reveal the nodes that participate in this edge type
      cy.edges(`[edgeType = "${type}"]`).connectedNodes().removeClass('faded').addClass('highlighted');
      setLegendEdgeFilter(type);
      setLegendNodeFilter(null);
    }
  }

  function clearLegendFilter() {
    cyRef.current?.elements().removeClass('highlighted faded');
    setLegendNodeFilter(null);
    setLegendEdgeFilter(null);
  }

  // cyReady drives conditional sidebar sections without relying on ref in JSX
  const cyReady = !!graphLabel && !isFetching;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-5">

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-56 lg:shrink-0 space-y-5">
          <div>
            <h1 className="text-sm font-bold text-white uppercase tracking-widest">Song Nodes</h1>
            <p className="text-xs text-surface-500 mt-1">
              Interactive network of songs, themes, and connections.
            </p>
          </div>

          {/* Layout preset picker */}
          <div>
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Layout</div>
            <div className="space-y-1">
              {LAYOUT_PRESETS.map((lp) => (
                <button
                  key={lp.id}
                  className={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors
                    ${preset === lp.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-surface-800 text-surface-300 hover:bg-surface-700'}`}
                  onClick={() => { setPreset(lp.id); setSelectedAlbumId(''); setSelectedNode(null); }}
                  title={lp.description}
                >
                  {lp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Band picker */}
          {!isUniversal && !needsAlbum && scopes && (
            <div>
              <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Artists</div>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {scopes.bands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedBandIds.includes(b.id)}
                      onChange={() => toggleBand(b.id)}
                      className="accent-indigo-500"
                    />
                    <span className={`text-xs transition-colors
                      ${selectedBandIds.includes(b.id) ? 'text-white' : 'text-surface-400 group-hover:text-surface-200'}`}>
                      {b.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Album picker */}
          {needsAlbum && scopes && (
            <div>
              <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Album</div>
              <select
                className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
                value={selectedAlbumId}
                onChange={(e) => setSelectedAlbumId(e.target.value)}
              >
                <option value="">— pick album —</option>
                {scopes.albums.map((a) => (
                  <option key={a.id} value={a.id}>{a.band.name} / {a.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Arrange controls */}
          {cyReady && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Arrange</div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  className="px-2 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                  onClick={fitView}
                >
                  Fit
                </button>
                <button
                  className="px-2 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                  onClick={resetLayout}
                >
                  Re-layout
                </button>
                <button
                  className="col-span-2 px-2 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-xs text-white rounded transition-colors"
                  title="Place each artist as a column, albums below, songs below albums — neat and spaced"
                  onClick={runNeatLayout}
                >
                  Neat columns
                </button>
                <button
                  className="col-span-2 px-2 py-1.5 bg-indigo-800 hover:bg-indigo-700 text-xs text-white rounded transition-colors"
                  title="Radial clusters: Artist at centre, albums orbit around it, songs orbit around each album"
                  onClick={runClusterLayout}
                >
                  Cluster (radial)
                </button>
                <button
                  className="col-span-2 px-2 py-1.5 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                  title="Force layout — locked nodes snap back after"
                  onClick={runFreeLayout}
                >
                  Arrange free
                </button>
              </div>

              {lockedCount > 0 ? (
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-xs text-amber-400 font-medium">
                    {lockedCount} node{lockedCount !== 1 ? 's' : ''} locked
                  </span>
                  <button
                    className="text-xs text-surface-500 hover:text-white transition-colors"
                    onClick={unlockAll}
                  >
                    Unlock all
                  </button>
                </div>
              ) : (
                <p className="text-xs text-surface-600 leading-tight pt-0.5">
                  Double-click a node to lock its position
                </p>
              )}
            </div>
          )}

          {/* Visibility / interaction */}
          {cyReady && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Visibility</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTags}
                  onChange={(e) => setShowTags(e.target.checked)}
                  className="accent-cyan-500"
                />
                <span className={`text-xs transition-colors ${showTags ? 'text-surface-200' : 'text-surface-600'}`}>
                  Show tags
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showThemes}
                  onChange={(e) => setShowThemes(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span className={`text-xs transition-colors ${showThemes ? 'text-surface-200' : 'text-surface-600'}`}>
                  Show themes
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={animatePulse}
                  onChange={(e) => setAnimatePulse(e.target.checked)}
                  className="accent-indigo-500"
                />
                <span className={`text-xs transition-colors ${animatePulse ? 'text-surface-200' : 'text-surface-600'}`}>
                  Animate
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllLabels}
                  onChange={(e) => setShowAllLabels(e.target.checked)}
                  className="accent-indigo-500"
                />
                <span className={`text-xs transition-colors ${showAllLabels ? 'text-surface-200' : 'text-surface-600'}`}>
                  Show all labels
                </span>
              </label>

              <div className="pt-1">
                <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">Interact</div>
                <button
                  className={`w-full px-2 py-1.5 text-xs rounded transition-colors ${
                    selectionMode === 'select'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-surface-700 hover:bg-surface-600 text-white'
                  }`}
                  title={selectionMode === 'select'
                    ? 'Exit selection mode — back to pan/zoom'
                    : 'Drag a box to select multiple nodes, then drag any selected node to move them all'}
                  onClick={() => setSelectionMode((m) => m === 'select' ? 'pan' : 'select')}
                >
                  {selectionMode === 'select' ? '✓ Box select (active)' : 'Box select'}
                </button>
                {selectionMode === 'select' && (
                  <p className="text-xs text-amber-300/70 leading-tight mt-1">
                    Drag empty space to draw a selection box. Drag any selected node to move the group.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Visual style panel */}
          {cyReady && (
            <div>
              <button
                className="flex items-center justify-between w-full text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2 hover:text-surface-200 transition-colors"
                onClick={() => setShowStylePanel((v) => !v)}
              >
                <span>Visual</span>
                <span className="text-surface-600">{showStylePanel ? '▲' : '▼'}</span>
              </button>
              {showStylePanel && (
                <div className="space-y-4">

                  {/* Nodes */}
                  <div>
                    <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Nodes</div>
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
                    <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Labels</div>
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
                        <p className="text-xs text-surface-600 mt-1 leading-tight">
                          Click a node to activate · 1 hop={Math.max(0, Math.round((1 - vStyle.labelFalloff) * 100))}% · 2 hops={Math.max(0, Math.round((1 - 2 * vStyle.labelFalloff) * 100))}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Edges */}
                  <div>
                    <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Edges</div>
                    <div className="space-y-2">
                      <StyleSlider label="Opacity" value={vStyle.edgeOpacity} min={0.05} max={1} step={0.05}
                        onChange={(v) => setVStyle((s) => ({ ...s, edgeOpacity: v }))} format={(v) => v.toFixed(2)} />
                      <StyleSlider label="Width" value={vStyle.edgeWidth} min={0.5} max={4} step={0.25}
                        onChange={(v) => setVStyle((s) => ({ ...s, edgeWidth: v }))} format={(v) => `${v}px`} />
                    </div>
                  </div>

                  <button onClick={() => setVStyle(DEFAULT_VS)}
                    className="text-xs text-surface-600 hover:text-surface-200 transition-colors">
                    Reset to defaults
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Export */}
          {graphData && graphData.nodes.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Export</div>
              <button
                className="w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                onClick={() => doExport(1080)}
              >
                Download 1080×1080
              </button>
              <button
                className="w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                onClick={() => doExport(1920)}
              >
                Download Story 1080×1920
              </button>
            </div>
          )}

          {/* Node detail */}
          {selectedNode && selectedNode.length > 0 && (
            <NodeDetailPanel node={selectedNode} onClose={() => {
              setSelectedNode(null);
              cyRef.current?.elements().removeClass('highlighted faded');
            }} />
          )}

          <InteractiveLegend
            nodeFilter={legendNodeFilter}
            edgeFilter={legendEdgeFilter}
            onNodeType={handleLegendNodeType}
            onEdgeType={handleLegendEdgeType}
            onClear={clearLegendFilter}
          />
        </aside>

        {/* ── Graph canvas ── */}
        <main className="flex-1 min-w-0">
          {graphLabel && (
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-300">{graphLabel}</h2>
              {graphData && (
                <span className="text-xs text-surface-500">
                  {graphData.nodes.length} nodes · {graphData.edges.length} edges
                </span>
              )}
            </div>
          )}

          {!canQuery && (
            <div className="flex items-center justify-center h-[600px] rounded-xl bg-surface-900/50 border border-surface-800 text-surface-500 text-sm">
              {isUniversal
                ? 'Loading Maynard Universe…'
                : needsAlbum
                  ? 'Select an album to build the cluster.'
                  : 'Select one or more artists to build the graph.'}
            </div>
          )}

          {isFetching && (
            <div className="flex items-center justify-center h-[600px] rounded-xl bg-surface-900/50 border border-surface-800">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-red-400 text-sm p-4">{String(error)}</div>}

          {!isFetching && canQuery && graphData?.nodes.length === 0 && (
            <div className="flex items-center justify-center h-[600px] rounded-xl bg-surface-900/50 border border-surface-800 text-surface-500 text-sm">
              No graph data — try a different layout or add songs to the library.
            </div>
          )}

          <div
            ref={containerRef}
            className={`rounded-xl overflow-hidden border border-surface-800 transition-opacity duration-300
              ${isFetching ? 'opacity-0 pointer-events-none h-0' : 'opacity-100'}`}
            style={{ width: '100%', height: '680px', background: '#060d1a' }}
          />

          {!isFetching && graphData && graphData.nodes.length > 0 && (
            <p className="mt-3 text-xs text-surface-600 text-center">
              Click to highlight connections · double-click to lock position · scroll to zoom · drag to pan
            </p>
          )}
        </main>
      </div>

      <SocialChatPanel songLabel={graphData ? `Song Nodes: ${graphData.label}` : 'Song Nodes'} />
    </div>
  );
}

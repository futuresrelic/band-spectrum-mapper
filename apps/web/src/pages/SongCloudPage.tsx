import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader';
import { GENRE_PERSPECTIVES, GENRE_COLORS, GENRE_LABELS } from '@band-spectrum-mapper/shared';
import type { GenrePerspective } from '@band-spectrum-mapper/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AxisScores {
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
}

interface CloudSong {
  id: string;
  title: string;
  bandId: string;
  bandName: string;
  bandSlug: string;
  tags: { name: string; slug: string }[];
  genreScores: Record<GenrePerspective, number> | null;
  axisScores: AxisScores | null;
  ratingsCount: number;
}

interface SimNode {
  id: string;
  title: string;
  bandName: string;
  bandSlug: string;
  tags: string[];
  axisScores: AxisScores | null;
  dominantGenre: GenrePerspective | null;
  color: string;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SimEdge {
  a: number;
  b: number;
  weight: number;
}

// ---------------------------------------------------------------------------
// Axis config
// ---------------------------------------------------------------------------

const AXES: { key: keyof AxisScores; label: string; color: string }[] = [
  { key: 'aggression',  label: 'Aggression',  color: '#E5484D' },
  { key: 'complexity',  label: 'Complexity',  color: '#8B5CF6' },
  { key: 'atmosphere',  label: 'Atmosphere',  color: '#06B6D4' },
  { key: 'emotion',     label: 'Emotion',     color: '#F59E0B' },
  { key: 'psychedelic', label: 'Psychedelic', color: '#22C55E' },
  { key: 'concept',     label: 'Concept',     color: '#F97316' },
];

// ---------------------------------------------------------------------------
// Force simulation (pure JS, no d3)
// ---------------------------------------------------------------------------

const W = 900;
const H = 700;

function initNodes(songs: CloudSong[]): SimNode[] {
  return songs.map((s, i) => {
    const angle = (i / songs.length) * 2 * Math.PI;
    const r = Math.min(W, H) * 0.35;

    let dominantGenre: GenrePerspective | null = null;
    if (s.genreScores) {
      let maxScore = -1;
      for (const p of GENRE_PERSPECTIVES) {
        const score = s.genreScores[p.id] ?? 0;
        if (score > maxScore) { maxScore = score; dominantGenre = p.id; }
      }
    }

    const size = Math.max(5, Math.min(14, 5 + s.ratingsCount * 1.5));
    return {
      id: s.id,
      title: s.title,
      bandName: s.bandName,
      bandSlug: s.bandSlug,
      tags: s.tags.map((t) => t.slug),
      axisScores: s.axisScores,
      dominantGenre,
      color: dominantGenre ? GENRE_COLORS[dominantGenre] : '#64748b',
      size,
      x: W / 2 + Math.cos(angle) * r + (Math.random() - 0.5) * 60,
      y: H / 2 + Math.sin(angle) * r + (Math.random() - 0.5) * 60,
      vx: 0,
      vy: 0,
    };
  });
}

function buildEdges(nodes: SimNode[]): SimEdge[] {
  const edges: SimEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      if (a.tags.length === 0 || b.tags.length === 0) continue;
      const shared = a.tags.filter((t) => b.tags.includes(t)).length;
      if (shared > 0) edges.push({ a: i, b: j, weight: shared });
    }
  }
  return edges;
}

function runSimulation(nodes: SimNode[], edges: SimEdge[], iterations: number) {
  const repulsion = 3500;
  const attraction = 0.006;
  const gravity = 0.008;
  const damping = 0.75;
  const minDist = 20;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), minDist);
        const f = repulsion / (dist * dist);
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    for (const edge of edges) {
      const a = nodes[edge.a]!;
      const b = nodes[edge.b]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = dist * attraction * edge.weight;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    for (const node of nodes) {
      node.vx -= (node.x - W / 2) * gravity;
      node.vy -= (node.y - H / 2) * gravity;
    }
    for (const node of nodes) {
      node.vx *= damping;
      node.vy *= damping;
      node.x = Math.max(30, Math.min(W - 30, node.x + node.vx));
      node.y = Math.max(30, Math.min(H - 30, node.y + node.vy));
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ViewMode = 'graph' | 'list';

export default function SongCloudPage() {
  const { data: songs, isLoading } = useQuery({
    queryKey: ['cloud'],
    queryFn: () => api.get<CloudSong[]>('/api/public/cloud'),
    staleTime: 5 * 60_000,
  });

  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [highlightGenre, setHighlightGenre] = useState<GenrePerspective | null>(null);
  const [highlightTag, setHighlightTag] = useState('');
  const [axisThresholds, setAxisThresholds] = useState<Partial<Record<keyof AxisScores, number>>>({});
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: SimNode } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Zoom + pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const didDrag = useRef(false);

  const { nodes, edges } = useMemo(() => {
    if (!songs || songs.length === 0) return { nodes: [], edges: [] };
    const n = initNodes(songs);
    const e = buildEdges(n);
    runSimulation(n, e, 200);
    return { nodes: n, edges: e };
  }, [songs]);

  const allTags = useMemo(() => {
    if (!songs) return [];
    const set = new Set<string>();
    songs.forEach((s) => s.tags.forEach((t) => set.add(t.slug)));
    return [...set].sort();
  }, [songs]);

  const allBands = useMemo(() => {
    if (!songs) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    songs.forEach((s) => map.set(s.bandId, s.bandName));
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  const hasActiveFilters = highlightGenre !== null || highlightTag !== '' ||
    Object.values(axisThresholds).some((v) => (v ?? 0) > 0) ||
    selectedBandIds.length > 0;

  function passesAxisFilters(node: SimNode): boolean {
    const entries = Object.entries(axisThresholds).filter(([, v]) => (v ?? 0) > 0);
    if (entries.length === 0) return true;
    if (!node.axisScores) return false;
    for (const [key, min] of entries) {
      if (node.axisScores[key as keyof AxisScores] < (min ?? 0)) return false;
    }
    return true;
  }

  function isHighlighted(node: SimNode): boolean {
    if (!passesAxisFilters(node)) return false;
    if (selectedBandIds.length > 0) {
      const song = songs?.find((s) => s.id === node.id);
      if (!song || !selectedBandIds.includes(song.bandId)) return false;
    }
    if (highlightGenre) {
      const song = songs?.find((s) => s.id === node.id);
      return (song?.genreScores?.[highlightGenre] ?? 0) >= 6;
    }
    if (highlightTag) return node.tags.includes(highlightTag);
    return true;
  }

  // ── Zoom handlers ──────────────────────────────────────────────────────────

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom((z) => Math.max(0.3, Math.min(4, z + delta)));
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    didDrag.current = false;
    dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (dragging.current) {
      const dx = e.clientX - dragging.current.startX;
      const dy = e.clientY - dragging.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      setPan({ x: dragging.current.panX + dx, y: dragging.current.panY + dy });
      setHoveredId(null);
      setTooltip(null);
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = ((e.clientX - rect.left) / rect.width) * W;
    const rawY = ((e.clientY - rect.top) / rect.height) * H;
    // Inverse-transform through pan+zoom
    const scaleX = rect.width / W;
    const scaleY = rect.height / H;
    const mx = (rawX - W / 2 - pan.x / scaleX) / zoom + W / 2;
    const my = (rawY - H / 2 - pan.y / scaleY) / zoom + H / 2;

    let closest: SimNode | null = null;
    let closestDist = 25 / zoom;
    for (const node of nodes) {
      const dx = node.x - mx;
      const dy = node.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) { closestDist = dist; closest = node; }
    }

    if (closest) {
      setHoveredId(closest.id);
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, node: closest });
    } else {
      setHoveredId(null);
      setTooltip(null);
    }
  }

  function handleMouseUp() {
    dragging.current = null;
  }

  const handleSvgClick = useCallback(() => {
    if (!didDrag.current && hoveredId) {
      window.open(`/share/songs/${hoveredId}`, '_blank');
    }
  }, [hoveredId]);

  // Prevent page scroll when wheeling over SVG
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const hasEdges = edges.length > 0;
  const hasTags = allTags.length > 0;

  function resetFilters() {
    setHighlightGenre(null);
    setHighlightTag('');
    setAxisThresholds({});
    setSelectedBandIds([]);
  }

  // ── List view sort ──────────────────────────────────────────────────────────

  const [sortKey, setSortKey] = useState<'title' | 'band' | keyof AxisScores>('band');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function toggleSort(key: string) {
    const k = key as typeof sortKey;
    if (sortKey === k) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  }

  const sortedSongs = useMemo(() => {
    if (!songs) return [];
    const filtered = songs.filter((s) => {
      const node = nodes.find((n) => n.id === s.id);
      if (!node) return !hasActiveFilters;
      return isHighlighted(node);
    });
    return [...filtered].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortKey === 'title') { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
      else if (sortKey === 'band') { av = a.bandName.toLowerCase(); bv = b.bandName.toLowerCase(); }
      else { av = a.axisScores?.[sortKey] ?? -1; bv = b.axisScores?.[sortKey] ?? -1; }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, nodes, sortKey, sortDir, highlightGenre, highlightTag, axisThresholds]);

  // ── SVG transform ──────────────────────────────────────────────────────────

  const svgTransform = `translate(${W / 2 + pan.x} ${H / 2 + pan.y}) scale(${zoom}) translate(${-W / 2} ${-H / 2})`;

  const visibleCount = hasActiveFilters ? nodes.filter(isHighlighted).length : nodes.length;

  return (
    <div>
      <PageHeader
        title="Song Cloud"
        subtitle="Songs as nodes — colored by dominant genre appeal, connected by shared themes"
      />

      {isLoading && <p className="text-surface-500 text-sm">Building cloud…</p>}

      {!isLoading && nodes.length === 0 && (
        <div className="card text-center py-12 text-surface-500">
          <p>No song data yet. Run AI Genre Spectrum and Thematic Tags via the AI Batch Runner first.</p>
          <Link to="/admin/ai-batch" className="btn-primary mt-4 inline-block">Open Batch Runner →</Link>
        </div>
      )}

      {nodes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar */}
          <div className="space-y-4">
            {/* View toggle */}
            <div className="flex rounded-lg overflow-hidden border border-surface-200 text-sm">
              <button
                onClick={() => setViewMode('graph')}
                className={`flex-1 py-1.5 text-center transition-colors ${viewMode === 'graph' ? 'bg-surface-900 text-white' : 'hover:bg-surface-100 text-surface-700'}`}
              >
                Graph
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex-1 py-1.5 text-center transition-colors ${viewMode === 'list' ? 'bg-surface-900 text-white' : 'hover:bg-surface-100 text-surface-700'}`}
              >
                List
              </button>
            </div>

            {/* Band filter */}
            {allBands.length > 1 && (
              <div className="card space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-surface-400">Artist</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {allBands.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 cursor-pointer group text-sm">
                      <input
                        type="checkbox"
                        checked={selectedBandIds.includes(b.id)}
                        onChange={() =>
                          setSelectedBandIds((prev) =>
                            prev.includes(b.id) ? prev.filter((id) => id !== b.id) : [...prev, b.id],
                          )
                        }
                        className="accent-surface-900"
                      />
                      <span className={selectedBandIds.includes(b.id) ? 'font-medium' : 'text-surface-600 group-hover:text-surface-900'}>
                        {b.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Genre audience filter */}
            <div className="card space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-surface-400">Genre audience</p>
              <div className="space-y-1">
                <button
                  onClick={() => setHighlightGenre(null)}
                  className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                    highlightGenre === null ? 'bg-surface-900 text-white' : 'hover:bg-surface-100'
                  }`}
                >
                  All songs
                </button>
                {GENRE_PERSPECTIVES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setHighlightGenre(highlightGenre === p.id ? null : p.id); setHighlightTag(''); }}
                    className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-2 ${
                      highlightGenre === p.id ? 'bg-surface-900 text-white' : 'hover:bg-surface-100'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GENRE_COLORS[p.id] }} />
                    {p.emoji} {GENRE_LABELS[p.id]}
                  </button>
                ))}
              </div>
            </div>

            {/* Spectrum axis filters */}
            <div className="card space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-surface-400">Spectrum axes</p>
              <p className="text-xs text-surface-500">Set a minimum — songs below it are hidden.</p>
              {AXES.map(({ key, label, color }) => {
                const val = axisThresholds[key] ?? 0;
                return (
                  <div key={key} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span style={{ color }}>{label}</span>
                      <span className="text-surface-500">{val > 0 ? `≥ ${val}` : 'any'}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={val}
                      onChange={(e) => setAxisThresholds((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                      className="w-full h-1.5"
                      style={{ accentColor: color }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Tag filter */}
            {hasTags && (
              <div className="card space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-surface-400">Theme / tag</p>
                <select
                  className="input text-sm"
                  value={highlightTag}
                  onChange={(e) => { setHighlightTag(e.target.value); setHighlightGenre(null); }}
                >
                  <option value="">All tags</option>
                  {allTags.map((slug) => (
                    <option key={slug} value={slug}>{slug.replace(/-/g, ' ')}</option>
                  ))}
                </select>
              </div>
            )}

            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="w-full text-xs text-surface-500 hover:text-surface-300 underline text-left px-1"
              >
                Clear all filters
              </button>
            )}

            {/* Legend (graph only) */}
            {viewMode === 'graph' && (
              <div className="card space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-surface-400">Legend</p>
                <div className="space-y-1.5">
                  {GENRE_PERSPECTIVES.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-xs text-surface-600">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GENRE_COLORS[p.id] }} />
                      {GENRE_LABELS[p.id]}
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-xs text-surface-600">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-400" />
                    No genre data
                  </div>
                </div>
                {hasEdges && (
                  <p className="text-xs text-surface-400 pt-2 border-t border-surface-100">
                    Lines connect songs sharing thematic tags
                  </p>
                )}
                <p className="text-xs text-surface-400 pt-1">
                  Scroll to zoom · drag to pan · click to open
                </p>
              </div>
            )}

            <p className="text-xs text-surface-400">
              {hasActiveFilters
                ? `${visibleCount} / ${nodes.length} songs`
                : `${nodes.length} songs · ${edges.length} connections`}
            </p>
          </div>

          {/* Main view */}
          {viewMode === 'graph' ? (
            <div className="card p-2 overflow-hidden">
              {/* Zoom controls */}
              <div className="flex gap-1 mb-1 items-center">
                <button
                  onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                  className="px-2 py-0.5 text-xs border border-surface-200 rounded hover:bg-surface-100 text-surface-700"
                >+</button>
                <button
                  onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                  className="px-2 py-0.5 text-xs border border-surface-200 rounded hover:bg-surface-100 text-surface-700"
                >Reset</button>
                <button
                  onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.25).toFixed(2)))}
                  className="px-2 py-0.5 text-xs border border-surface-200 rounded hover:bg-surface-100 text-surface-700"
                >−</button>
                <span className="text-xs text-surface-400 ml-2">{Math.round(zoom * 100)}%</span>
              </div>

              <div className="relative">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full h-auto select-none"
                  style={{ maxHeight: '70vh', cursor: dragging.current ? 'grabbing' : hoveredId ? 'pointer' : 'grab' }}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => { setHoveredId(null); setTooltip(null); dragging.current = null; }}
                  onClick={handleSvgClick}
                >
                  <g transform={svgTransform}>
                    {/* Edges */}
                    {edges.map((edge, i) => {
                      const a = nodes[edge.a]!;
                      const b = nodes[edge.b]!;
                      const litA = isHighlighted(a);
                      const litB = isHighlighted(b);
                      const opacity = hasActiveFilters
                        ? (!litA && !litB ? 0.02 : (!litA || !litB) ? 0.06 : 0.15)
                        : 0.15;
                      return (
                        <line
                          key={i}
                          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke="#94a3b8"
                          strokeWidth={edge.weight > 1 ? 1.5 : 0.8}
                          strokeOpacity={opacity}
                        />
                      );
                    })}

                    {/* Nodes */}
                    {nodes.map((node) => {
                      const lit = isHighlighted(node);
                      const isHovered = hoveredId === node.id;
                      const opacity = hasActiveFilters && !lit ? 0.1 : 1;
                      const r = isHovered ? node.size + 3 : node.size;
                      return (
                        <circle
                          key={node.id}
                          cx={node.x}
                          cy={node.y}
                          r={r}
                          fill={node.color}
                          fillOpacity={opacity * 0.85}
                          stroke={isHovered ? 'white' : node.color}
                          strokeWidth={isHovered ? 2 : 0.5}
                          strokeOpacity={opacity}
                          style={{ transition: 'r 0.1s, fill-opacity 0.2s' }}
                        />
                      );
                    })}
                  </g>
                </svg>

                {/* Tooltip */}
                {tooltip && (
                  <div
                    className="absolute pointer-events-none z-10 bg-surface-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[200px]"
                    style={{
                      left: Math.min(tooltip.x + 12, 650),
                      top: Math.max(tooltip.y - 40, 0),
                    }}
                  >
                    <p className="font-medium truncate">{tooltip.node.title}</p>
                    <p className="text-surface-400 truncate">{tooltip.node.bandName}</p>
                    {tooltip.node.dominantGenre && (
                      <p className="mt-0.5" style={{ color: GENRE_COLORS[tooltip.node.dominantGenre] }}>
                        {GENRE_LABELS[tooltip.node.dominantGenre]}
                      </p>
                    )}
                    {tooltip.node.tags.length > 0 && (
                      <p className="text-surface-400 mt-0.5 truncate">
                        {tooltip.node.tags.slice(0, 3).join(' · ')}
                      </p>
                    )}
                    <p className="text-surface-500 mt-1">Click to open →</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* List view */
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50 text-xs text-surface-500 uppercase tracking-wide">
                      <SortHeader label="Song" col="title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortHeader label="Band" col="band" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      {AXES.map(({ key, label, color }) => (
                        <SortHeader
                          key={key}
                          label={label}
                          col={key}
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                          color={color}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSongs.map((song) => (
                      <tr
                        key={song.id}
                        className="border-b border-surface-100 hover:bg-surface-50 cursor-pointer transition-colors"
                        onClick={() => window.open(`/share/songs/${song.id}`, '_blank')}
                      >
                        <td className="px-4 py-2 font-medium text-surface-900 max-w-[200px]">
                          <span className="truncate block">{song.title}</span>
                        </td>
                        <td className="px-4 py-2 text-surface-600 max-w-[160px]">
                          <span className="truncate block">{song.bandName}</span>
                        </td>
                        {AXES.map(({ key, color }) => {
                          const val = song.axisScores?.[key];
                          return (
                            <td key={key} className="px-3 py-2 text-center w-20">
                              {val != null ? (
                                <span
                                  className="inline-block w-7 text-center font-mono text-xs font-semibold"
                                  style={{ color, opacity: 0.4 + (val / 14) }}
                                >
                                  {val.toFixed(0)}
                                </span>
                              ) : (
                                <span className="text-surface-300 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sortedSongs.length === 0 && (
                  <p className="text-center text-surface-400 text-sm py-12">
                    No songs match the current filters.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort header
// ---------------------------------------------------------------------------

function SortHeader({
  label, col, sortKey, sortDir, onSort, color,
}: {
  label: string;
  col: string;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  color?: string;
}) {
  const active = sortKey === col;
  return (
    <th
      className="px-4 py-2 text-left cursor-pointer hover:text-surface-700 whitespace-nowrap select-none"
      onClick={() => onSort(col)}
      style={color ? { color } : undefined}
    >
      {label}
      {active && <span className="ml-1 opacity-70">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

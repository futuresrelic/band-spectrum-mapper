import { useRef, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader';
import { GENRE_PERSPECTIVES, GENRE_COLORS, GENRE_LABELS } from '@band-spectrum-mapper/shared';
import type { GenrePerspective } from '@band-spectrum-mapper/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CloudSong {
  id: string;
  title: string;
  bandName: string;
  bandSlug: string;
  tags: { name: string; slug: string }[];
  genreScores: Record<GenrePerspective, number> | null;
  ratingsCount: number;
}

interface SimNode {
  id: string;
  title: string;
  bandName: string;
  bandSlug: string;
  tags: string[];
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
  weight: number; // shared tag count
}

// ---------------------------------------------------------------------------
// Force simulation (pure JS, no d3 dependency)
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
    // Repulsion between all nodes
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

    // Attraction along edges
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

    // Center gravity
    for (const node of nodes) {
      node.vx -= (node.x - W / 2) * gravity;
      node.vy -= (node.y - H / 2) * gravity;
    }

    // Integrate + damp + clamp
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

export default function SongCloudPage() {
  const { data: songs, isLoading } = useQuery({
    queryKey: ['cloud'],
    queryFn: () => api.get<CloudSong[]>('/api/public/cloud'),
    staleTime: 5 * 60_000,
  });

  const [highlightGenre, setHighlightGenre] = useState<GenrePerspective | null>(null);
  const [highlightTag, setHighlightTag] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: SimNode } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { nodes, edges } = useMemo(() => {
    if (!songs || songs.length === 0) return { nodes: [], edges: [] };
    const n = initNodes(songs);
    const e = buildEdges(n);
    runSimulation(n, e, 200);
    return { nodes: n, edges: e };
  }, [songs]);

  // Build unique tag list for filter
  const allTags = useMemo(() => {
    if (!songs) return [];
    const set = new Set<string>();
    songs.forEach((s) => s.tags.forEach((t) => set.add(t.slug)));
    return [...set].sort();
  }, [songs]);

  function isHighlighted(node: SimNode): boolean {
    if (highlightGenre) {
      const score = songs?.find((s) => s.id === node.id)?.genreScores?.[highlightGenre] ?? 0;
      return score >= 6;
    }
    if (highlightTag) return node.tags.includes(highlightTag);
    return true;
  }

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;

    let closest: SimNode | null = null;
    let closestDist = 20;
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

  const hasEdges = edges.length > 0;
  const hasTags = allTags.length > 0;

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
          {/* Sidebar — filters */}
          <div className="space-y-5">
            {/* Genre entry point filter */}
            <div className="card space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-surface-400">Entry point</p>
              <p className="text-xs text-surface-500">
                Highlight songs that score ≥ 6 for a specific genre audience — shows which songs bridge into other styles.
              </p>
              <div className="space-y-1.5">
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
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: GENRE_COLORS[p.id] }}
                    />
                    {p.emoji} {GENRE_LABELS[p.id]}
                  </button>
                ))}
              </div>
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

            {/* Legend */}
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
              {!hasTags && (
                <p className="text-xs text-amber-600 pt-2 border-t border-surface-100">
                  Run "Thematic Tags" in the batch runner to see connections between songs.
                </p>
              )}
            </div>

            <p className="text-xs text-surface-400">
              {nodes.length} songs · {edges.length} connections
            </p>
          </div>

          {/* Cloud SVG */}
          <div className="card p-2 overflow-hidden">
            <div className="relative">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto"
                style={{ maxHeight: '70vh', cursor: hoveredId ? 'pointer' : 'default' }}
                onMouseMove={handleSvgMouseMove}
                onMouseLeave={() => { setHoveredId(null); setTooltip(null); }}
                onClick={() => {
                  if (hoveredId) {
                    const node = nodes.find((n) => n.id === hoveredId);
                    if (node) window.open(`/share/songs/${node.id}`, '_blank');
                  }
                }}
              >
                {/* Edges */}
                {edges.map((edge, i) => {
                  const a = nodes[edge.a]!;
                  const b = nodes[edge.b]!;
                  const dimA = highlightGenre || highlightTag ? !isHighlighted(a) : false;
                  const dimB = highlightGenre || highlightTag ? !isHighlighted(b) : false;
                  const opacity = dimA && dimB ? 0.03 : dimA || dimB ? 0.08 : 0.15;
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
                  const opacity = (highlightGenre || highlightTag) && !lit ? 0.15 : 1;
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
                    <p className="text-surface-300 mt-0.5" style={{ color: GENRE_COLORS[tooltip.node.dominantGenre] }}>
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
        </div>
      )}
    </div>
  );
}

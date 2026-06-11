import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular } from 'cytoscape';
import {
  songConnectionsApi,
  type SongConnectionItem,
  type SongSearchResult,
} from '../api/songConnections';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionType = 'words' | 'themes' | 'tags' | 'album' | 'artist';

const ALL_TYPES: ConnectionType[] = ['words', 'themes', 'tags', 'album', 'artist'];

const TYPE_CONFIG: Record<ConnectionType, { label: string; color: string; bg: string; border: string }> = {
  words:  { label: 'Words',  color: '#94a3b8', bg: 'bg-slate-700',   border: 'border-slate-500' },
  themes: { label: 'Themes', color: '#34d399', bg: 'bg-emerald-700', border: 'border-emerald-500' },
  tags:   { label: 'Tags',   color: '#22d3ee', bg: 'bg-cyan-700',    border: 'border-cyan-500' },
  album:  { label: 'Album',  color: '#a78bfa', bg: 'bg-violet-700',  border: 'border-violet-500' },
  artist: { label: 'Artist', color: '#fbbf24', bg: 'bg-amber-700',   border: 'border-amber-500' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FilteredConnection {
  item: SongConnectionItem;
  filteredCount: number;
  activeTypes: ConnectionType[];
}

function filterConnections(
  connections: SongConnectionItem[],
  enabled: Set<ConnectionType>,
  minConn: number,
  maxConn: number,
): FilteredConnection[] {
  const result: FilteredConnection[] = [];
  for (const item of connections) {
    let count = 0;
    const active: ConnectionType[] = [];
    if (enabled.has('words')  && item.sharedWordCount > 0)      { count += item.sharedWordCount;      active.push('words');  }
    if (enabled.has('themes') && item.sharedThemes.length > 0)  { count += item.sharedThemes.length;  active.push('themes'); }
    if (enabled.has('tags')   && item.sharedTags.length > 0)    { count += item.sharedTags.length;    active.push('tags');   }
    if (enabled.has('album')  && item.sameAlbum)                { count += 1;                         active.push('album');  }
    if (enabled.has('artist') && item.sameArtist)               { count += 1;                         active.push('artist'); }
    if (count >= minConn && count <= maxConn && count > 0) {
      result.push({ item, filteredCount: count, activeTypes: active });
    }
  }
  result.sort((a, b) => b.filteredCount - a.filteredCount);
  return result;
}

function buildCyStyle() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': '#6366f1',
        'label': 'data(label)',
        'color': '#e2e8f0',
        'font-size': '10px',
        'text-valign': 'bottom' as const,
        'text-halign': 'center' as const,
        'text-margin-y': 4,
        'text-max-width': '90px',
        'text-wrap': 'ellipsis' as const,
        'width': 'data(size)',
        'height': 'data(size)',
        'border-width': 0,
        'text-background-color': '#0f172a',
        'text-background-opacity': 0.7,
        'text-background-padding': '2px',
        'text-background-shape': 'roundrectangle' as const,
      },
    },
    {
      selector: 'node[type = "source"]',
      style: {
        'background-color': '#818cf8',
        'border-color': '#a5b4fc',
        'border-width': 3,
        'font-size': '12px',
        'font-weight': 'bold' as const,
        'z-index': 10,
      },
    },
    {
      selector: 'node:selected',
      style: { 'border-color': '#f8fafc', 'border-width': 2 },
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier' as const,
        'opacity': 0.55,
        'target-arrow-shape': 'none' as const,
        'width': 'data(width)',
      },
    },
    { selector: 'edge[type = "words"]',  style: { 'line-color': '#94a3b8' } },
    { selector: 'edge[type = "themes"]', style: { 'line-color': '#34d399' } },
    { selector: 'edge[type = "tags"]',   style: { 'line-color': '#22d3ee' } },
    { selector: 'edge[type = "album"]',  style: { 'line-color': '#a78bfa' } },
    { selector: 'edge[type = "artist"]', style: { 'line-color': '#fbbf24' } },
  ];
}

function edgeWidth(weight: number): number {
  return Math.max(1.5, Math.min(6, 1.5 + (weight / 20) * 4.5));
}

function nodeSize(count: number, max: number): number {
  if (count === 0) return 22;
  return Math.round(22 + (count / Math.max(1, max)) * 26);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SongConnectionsPage() {
  const [selectedBandId, setSelectedBandId]   = useState('');
  const [searchQuery, setSearchQuery]         = useState('');
  const [showDropdown, setShowDropdown]       = useState(false);
  const [selectedSong, setSelectedSong]       = useState<SongSearchResult | null>(null);
  const [enabledTypes, setEnabledTypes]       = useState<Set<ConnectionType>>(new Set(ALL_TYPES));
  const [minConnections, setMinConnections]   = useState(1);
  const [maxConnections, setMaxConnections]   = useState(9999);
  const [selectedNode, setSelectedNode]       = useState<SongConnectionItem | null>(null);

  const cyRef        = useRef<Core | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Bands list for the filter dropdown
  const { data: bands = [] } = useQuery({
    queryKey: ['bands-list'],
    queryFn:  () => songConnectionsApi.getBands(),
    staleTime: Infinity,
  });

  // Song search
  const { data: rawSearchResults = [] } = useQuery<SongSearchResult[]>({
    queryKey: ['conn-search', searchQuery],
    queryFn:  () => searchQuery.length >= 2
      ? songConnectionsApi.search(searchQuery)
      : Promise.resolve([]),
    staleTime: 30_000,
  });

  // Filter search results by selected band
  const searchResults = useMemo(() =>
    selectedBandId
      ? rawSearchResults.filter(r => r.band.id === selectedBandId)
      : rawSearchResults,
    [rawSearchResults, selectedBandId],
  );

  // Connections data (all types, no server-side filtering)
  const { data: connectionsData, isFetching } = useQuery({
    queryKey: ['song-connections', selectedSong?.id],
    queryFn:  () => selectedSong ? songConnectionsApi.getConnections(selectedSong.id) : null,
    enabled:  !!selectedSong,
    staleTime: Infinity,
  });

  // Max possible connection count in the raw data
  const maxConnectionCount = useMemo(() => {
    if (!connectionsData || connectionsData.connections.length === 0) return 1;
    return connectionsData.connections[0]?.connectionCount ?? 1;
  }, [connectionsData]);

  // Reset min/max sliders when a new song's data loads
  useEffect(() => {
    if (connectionsData) {
      setMinConnections(1);
      setMaxConnections(maxConnectionCount);
    }
  }, [connectionsData, maxConnectionCount]);

  // Client-side filtered connections (band + type + min/max)
  const filtered = useMemo(() => {
    if (!connectionsData) return [];
    let conns = connectionsData.connections;
    if (selectedBandId) conns = conns.filter(c => c.bandId === selectedBandId);
    return filterConnections(conns, enabledTypes, minConnections, maxConnections);
  }, [connectionsData, selectedBandId, enabledTypes, minConnections, maxConnections]);

  // ---------------------------------------------------------------------------
  // Cytoscape graph rebuild
  // ---------------------------------------------------------------------------
  const buildGraph = useCallback(() => {
    if (!containerRef.current || !connectionsData) return;

    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

    const sourceId = connectionsData.sourceSong.id;
    const maxCount = filtered[0]?.filteredCount ?? 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elements: any[] = [{
      group: 'nodes',
      data: { id: sourceId, label: connectionsData.sourceSong.title, type: 'source', size: 52 },
    }];

    for (const { item, filteredCount, activeTypes } of filtered) {
      elements.push({
        group: 'nodes',
        data: {
          id: item.songId, label: item.title, type: 'song',
          size: nodeSize(filteredCount, maxCount),
          connectionCount: filteredCount,
        },
      });
      for (const type of activeTypes) {
        const weight =
          type === 'words'  ? item.sharedWordCount  :
          type === 'themes' ? item.sharedThemes.length :
          type === 'tags'   ? item.sharedTags.length :
          1;
        elements.push({
          group: 'edges',
          data: {
            id: `${sourceId}-${item.songId}-${type}`,
            source: sourceId, target: item.songId,
            type, width: edgeWidth(weight),
          },
        });
      }
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildCyStyle(),
      layout: {
        name: 'concentric',
        concentric: (node: NodeSingular) => {
          if (node.id() === sourceId) return 1000;
          return (node.data('connectionCount') as number) ?? 1;
        },
        levelWidth:    () => 4,
        minNodeSpacing: 50,
        animate:           true,
        animationDuration: 600,
        fit:     true,
        padding: 40,
      },
    });

    cy.on('tap', 'node', (evt) => {
      const nid = (evt.target as NodeSingular).id() as string;
      if (nid === sourceId) { setSelectedNode(null); return; }
      setSelectedNode(connectionsData.connections.find(c => c.songId === nid) ?? null);
    });
    cy.on('tap', (evt) => { if (evt.target === cy) setSelectedNode(null); });

    cyRef.current = cy;
  }, [connectionsData, filtered]);

  useEffect(() => {
    buildGraph();
    return () => { if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; } };
  }, [buildGraph]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function pickSong(song: SongSearchResult) {
    setSelectedSong(song);
    setSearchQuery(song.title);
    setShowDropdown(false);
    setSelectedNode(null);
  }

  function clearSelection() {
    setSelectedSong(null);
    setSearchQuery('');
    setSelectedNode(null);
    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
  }

  function toggleType(type: ConnectionType) {
    setEnabledTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  const sliderMax = Math.max(1, maxConnectionCount);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      {/* ── Controls bar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 space-y-2">

        {/* Row 1: Band filter + Song search */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-base font-semibold text-surface-800 whitespace-nowrap">
            Song Connection Explorer
          </h1>

          {/* Band selector */}
          <select
            value={selectedBandId}
            onChange={e => {
              setSelectedBandId(e.target.value);
              setSearchQuery('');
              setShowDropdown(false);
            }}
            className="text-sm border border-surface-300 rounded px-2 py-1.5 bg-white text-surface-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All bands</option>
            {bands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* Song search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <input
              type="text"
              className="w-full text-sm border border-surface-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
              placeholder={selectedBandId ? 'Search within band…' : 'Search for a song…'}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            />
            {showDropdown && searchResults.length > 0 && (
              <ul className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-surface-200 rounded shadow-lg max-h-60 overflow-auto text-xs">
                {searchResults.slice(0, 30).map(r => (
                  <li
                    key={r.id}
                    className="px-3 py-1.5 hover:bg-indigo-50 cursor-pointer"
                    onMouseDown={() => pickSong(r)}
                  >
                    <span className="font-medium text-surface-800">{r.title}</span>
                    <span className="ml-1.5 text-surface-400">
                      {r.band.name}{r.album ? ` — ${r.album.title}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedSong && (
            <button
              onClick={clearSelection}
              className="text-xs text-surface-500 hover:text-red-600 px-2 py-1 border border-surface-200 rounded"
            >
              Clear
            </button>
          )}

          {isFetching && <span className="text-xs text-surface-400 italic">Loading…</span>}

          {connectionsData && !isFetching && (
            <span className="text-xs text-surface-500">
              {filtered.length} / {connectionsData.totalCount} songs
            </span>
          )}
        </div>

        {/* Row 2: Type toggles */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-surface-500 font-medium">Show:</span>
          {ALL_TYPES.map(t => {
            const cfg = TYPE_CONFIG[t];
            const on  = enabledTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                  on
                    ? `${cfg.bg} ${cfg.border} text-white`
                    : 'bg-surface-100 border-surface-300 text-surface-500'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Row 3: Min / Max sliders (only visible after a song is selected) */}
        {connectionsData && (
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500 whitespace-nowrap w-28 text-right">
                Min connections:
              </span>
              <input
                type="range"
                min={1}
                max={sliderMax}
                value={minConnections}
                onChange={e => {
                  const v = Number(e.target.value);
                  setMinConnections(v);
                  if (v > maxConnections) setMaxConnections(v);
                }}
                className="w-32 accent-indigo-500"
              />
              <span className="text-xs font-mono text-surface-700 w-8 text-right">
                {minConnections}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500 whitespace-nowrap w-28 text-right">
                Max connections:
              </span>
              <input
                type="range"
                min={1}
                max={sliderMax}
                value={maxConnections}
                onChange={e => {
                  const v = Number(e.target.value);
                  setMaxConnections(v);
                  if (v < minConnections) setMinConnections(v);
                }}
                className="w-32 accent-indigo-500"
              />
              <span className="text-xs font-mono text-surface-700 w-8 text-right">
                {maxConnections >= sliderMax ? '∞' : maxConnections}
              </span>
            </div>

            {/* Range hint */}
            <span className="text-xs text-surface-400">
              {minConnections === 1 && maxConnections >= sliderMax
                ? 'showing all'
                : `${minConnections}–${maxConnections >= sliderMax ? '∞' : maxConnections} connections`}
            </span>
          </div>
        )}

        {/* Row 4: Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-surface-400">Edges:</span>
          {ALL_TYPES.map(t => (
            <span key={t} className="flex items-center gap-1 text-xs text-surface-500">
              <span className="inline-block w-6 h-1 rounded" style={{ backgroundColor: TYPE_CONFIG[t].color }} />
              {TYPE_CONFIG[t].label}
            </span>
          ))}
          <span className="text-xs text-surface-400 ml-2">— thicker = more connections</span>
        </div>
      </div>

      {/* ── Graph area ───────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        {!selectedSong && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-surface-500">
            <p className="text-lg font-semibold mb-1">Select a band, then search for a song</p>
            <p className="text-sm">The graph shows every song in the library that shares a connection with it.</p>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" style={{ background: '#0f172a' }} />

        {/* Node detail panel */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 max-w-xl mx-auto bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4 text-sm text-gray-100 shadow-xl">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-white text-base leading-tight">{selectedNode.title}</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {selectedNode.bandName}
                  {selectedNode.albumTitle && ` — ${selectedNode.albumTitle}`}
                </p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-500 hover:text-gray-300 ml-3 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {enabledTypes.has('words') && selectedNode.sharedWordCount > 0 && (
                <div className="col-span-2">
                  <span className="text-slate-400 font-medium">Words ({selectedNode.sharedWordCount}):</span>
                  <span className="ml-1 text-slate-300">
                    {selectedNode.sharedWords.slice(0, 20).join(', ')}
                    {selectedNode.sharedWordCount > 20 && ` … +${selectedNode.sharedWordCount - 20} more`}
                  </span>
                </div>
              )}
              {enabledTypes.has('themes') && selectedNode.sharedThemes.length > 0 && (
                <div>
                  <span className="text-emerald-400 font-medium">Themes:</span>
                  <span className="ml-1 text-gray-300">{selectedNode.sharedThemes.join(', ')}</span>
                </div>
              )}
              {enabledTypes.has('tags') && selectedNode.sharedTags.length > 0 && (
                <div>
                  <span className="text-cyan-400 font-medium">Tags:</span>
                  <span className="ml-1 text-gray-300">{selectedNode.sharedTags.join(', ')}</span>
                </div>
              )}
              {enabledTypes.has('album') && selectedNode.sameAlbum && (
                <div>
                  <span className="text-violet-400 font-medium">Same album</span>
                  {selectedNode.albumTitle && (
                    <span className="ml-1 text-gray-400">({selectedNode.albumTitle})</span>
                  )}
                </div>
              )}
              {enabledTypes.has('artist') && selectedNode.sameArtist && (
                <div>
                  <span className="text-amber-400 font-medium">Same artist</span>
                  <span className="ml-1 text-gray-400">({selectedNode.bandName})</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

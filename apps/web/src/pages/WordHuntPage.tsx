/**
 * WordHuntPage — game where a word is given and you find it across the library.
 * Available to any logged-in user (/play/word-hunt).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular, EventObject } from 'cytoscape';
import { api } from '../lib/api';
import type { GraphNode, GraphEdge, NodeType } from '../api/songNodes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Challenge { word: string; songCount: number }
interface VerifyResult { found: boolean; hasLyrics: boolean }
interface Attempt { songId: string; songTitle: string; found: boolean; hasLyrics: boolean }

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<NodeType, string> = {
  song:    '#6366f1', album:   '#8b5cf6', artist:  '#f59e0b',
  theme:   '#10b981', tag:     '#06b6d4', keyword: '#64748b', emotion: '#ec4899',
};
const EDGE_COLORS: Record<string, string> = {
  same_artist: '#f59e0b44', same_album: '#8b5cf644', shared_tag: '#06b6d444',
  similar_radar: '#ec489944', conceptual: '#10b98144', shared_word: '#64748b44',
};

function buildGameStyle() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)', 'label': 'data(label)',
        'font-size': '10px', 'font-family': '"Inter", system-ui, sans-serif',
        'font-weight': '600', 'color': '#e2e8f0',
        'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': '4px',
        'text-outline-color': '#060d1a', 'text-outline-width': '2px',
        'width': 'data(size)', 'height': 'data(size)',
        'border-width': '1.5px', 'border-color': '#ffffff22', 'min-zoomed-font-size': 4,
        'cursor': 'pointer',
      },
    },
    { selector: 'node[type = "song"]',    style: { 'width': 22, 'height': 22 } },
    { selector: 'node[type = "artist"]',  style: { 'width': 38, 'height': 38, 'font-size': '12px' } },
    { selector: 'node[type = "album"]',   style: { 'width': 28, 'height': 28 } },
    { selector: 'node[type = "tag"]',     style: { 'width': 20, 'height': 20, 'shape': 'tag' } },
    { selector: 'node:selected',          style: { 'border-width': '3px', 'border-color': '#fff' } },
    { selector: '.faded',                 style: { 'opacity': 0.12 } },
    { selector: '.highlighted',           style: { 'opacity': 1 } },
    { selector: '.found-yes',             style: { 'background-color': '#22c55e', 'border-color': '#4ade80', 'border-width': '3px' } },
    { selector: '.found-no',              style: { 'background-color': '#ef4444', 'border-color': '#f87171', 'border-width': '3px' } },
    { selector: '.no-lyrics',             style: { 'background-color': '#64748b', 'border-color': '#94a3b8', 'border-width': '2px' } },
    { selector: 'edge',                   style: { 'width': 1, 'line-color': 'data(edgeColor)', 'curve-style': 'bezier', 'opacity': 0.6 } },
  ];
}

function buildElements(nodes: GraphNode[], edges: GraphEdge[]) {
  return [
    ...nodes
      .filter((n) => ['song','album','artist'].includes(n.type))
      .map((n) => ({
        data: {
          id: n.id,
          label: n.label.length > 20 ? n.label.slice(0, 18) + '…' : n.label,
          fullLabel: n.label,
          type: n.type,
          color: NODE_COLORS[n.type],
          size: n.data.size ?? undefined,
          bandName: n.data.bandName,
          albumTitle: n.data.albumTitle,
        },
      })),
    ...edges
      .filter((e) => ['same_artist','same_album'].includes(e.type))
      .map((e) => ({
        data: { id: e.id, source: e.source, target: e.target, edgeColor: EDGE_COLORS[e.type] ?? '#ffffff22', edgeType: e.type },
      })),
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WordHuntPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef        = useRef<Core | null>(null);
  const animGenRef   = useRef(0);

  // Game state
  const [challenge, setChallenge]       = useState<Challenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [attempts, setAttempts]         = useState<Attempt[]>([]);
  const [won, setWon]                   = useState(false);
  const [gaveUp, setGaveUp]             = useState(false);
  const [elapsed, setElapsed]           = useState(0);
  const [running, setRunning]           = useState(false);
  const [checking, setChecking]         = useState(false);

  // Filter
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [graphLabel, setGraphLabel]            = useState('');
  const [isFetching, setIsFetching]            = useState(false);

  const qc = useQueryClient();

  // Timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Scopes
  const { data: scopes } = useQuery({
    queryKey: ['word-hunt-scopes'],
    queryFn: () => api.get<{ bands: { id: string; name: string }[] }>('/api/public/graph/scopes'),
  });

  // Load graph data
  const loadGraph = useCallback(async (bandIds: string[]) => {
    if (bandIds.length === 0 || !containerRef.current) return;
    setIsFetching(true);
    try {
      const data = await api.get<{ nodes: GraphNode[]; edges: GraphEdge[]; label: string }>(
        `/api/public/graph?preset=artist-universe&bandIds=${bandIds.join(',')}`,
      );
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }

      const elements = buildElements(data.nodes, data.edges);
      if (!elements.length || !containerRef.current) return;

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: buildGameStyle() as unknown as cytoscape.StylesheetStyle[],
        layout: { name: 'cose', nodeRepulsion: () => 15000, edgeElasticity: () => 45, idealEdgeLength: () => 80, gravity: 0.8, animate: true, animationDuration: 600, fit: true, padding: 40 } as cytoscape.LayoutOptions,
        minZoom: 0.1, maxZoom: 6,
      });
      cyRef.current = cy;
      setGraphLabel(data.label);

      // Start artist pulse
      startPulse(cy);

      cy.on('tap', 'node[type = "song"]', (evt: EventObject) => {
        const node = evt.target as NodeSingular;
        handleSongClick(node.id(), node.data('fullLabel') as string, cy);
      });
      cy.on('tap', 'node[type = "album"]', (evt: EventObject) => {
        const node = evt.target as NodeSingular;
        cy.elements().removeClass('highlighted faded');
        node.closedNeighborhood().addClass('highlighted');
        cy.elements().not(node.closedNeighborhood()).addClass('faded');
      });
      cy.on('tap', (evt: EventObject) => {
        if (evt.target === cy) cy.elements().removeClass('highlighted faded');
      });
    } finally {
      setIsFetching(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedBandIds.length > 0) loadGraph(selectedBandIds);
  }, [selectedBandIds, loadGraph]);

  function startPulse(cy: Core) {
    const gen = ++animGenRef.current;
    cy.nodes('[type = "artist"]').forEach((node, i) => {
      const BASE = 38, PEAK = 50, PERIOD = 3000 + i * 700;
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

  async function loadChallenge() {
    setLoadingChallenge(true);
    setAttempts([]);
    setWon(false);
    setGaveUp(false);
    setElapsed(0);
    setRunning(false);
    // Reset any visual feedback on nodes
    cyRef.current?.nodes().removeClass('found-yes found-no no-lyrics');
    try {
      const data = await api.get<Challenge>('/api/public/word-hunt/challenge');
      setChallenge(data);
      setRunning(true);
    } finally {
      setLoadingChallenge(false);
    }
  }

  // Invalidate query cache so next game gets a fresh word
  async function nextChallenge() {
    await qc.invalidateQueries({ queryKey: ['word-hunt-challenge'] });
    loadChallenge();
  }

  async function handleSongClick(songId: string, songTitle: string, cy: Core) {
    if (!challenge || won || gaveUp || checking) return;

    // Don't re-check same song
    if (attempts.some((a) => a.songId === songId)) return;

    setChecking(true);
    try {
      const result = await api.get<VerifyResult>(
        `/api/public/word-hunt/verify?word=${encodeURIComponent(challenge.word)}&songId=${encodeURIComponent(songId)}`,
      );

      const attempt: Attempt = { songId, songTitle, found: result.found, hasLyrics: result.hasLyrics };
      setAttempts((prev) => [attempt, ...prev]);

      // Visual feedback on the node
      const node = cy.getElementById(songId);
      if (result.found) {
        node.addClass('found-yes');
        setWon(true);
        setRunning(false);
      } else if (!result.hasLyrics) {
        node.addClass('no-lyrics');
      } else {
        node.addClass('found-no');
      }
    } finally {
      setChecking(false);
    }
  }

  const toggleBand = useCallback((id: string) => {
    setSelectedBandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const badAttempts = attempts.filter((a) => !a.found).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header bar */}
      <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-bold text-white tracking-tight">Word Hunt</h1>
          <span className="text-xs text-white/40">Find the word hidden in the library</span>
        </div>
        <a href="/landing" className="text-xs text-indigo-400 hover:text-indigo-200">← Back</a>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col lg:flex-row gap-5">

        {/* Sidebar */}
        <aside className="w-full lg:w-52 lg:shrink-0 space-y-5">

          {/* Game controls */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Challenge</div>

            {!challenge ? (
              <button
                className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
                onClick={loadChallenge}
                disabled={loadingChallenge || selectedBandIds.length === 0}
              >
                {loadingChallenge ? 'Loading…' : 'Start game'}
              </button>
            ) : (
              <button
                className="w-full px-3 py-2 bg-white/10 hover:bg-white/20 text-xs text-white rounded-lg transition-colors"
                onClick={nextChallenge}
                disabled={loadingChallenge}
              >
                New word
              </button>
            )}

            {challenge && !won && !gaveUp && (
              <button
                className="w-full px-3 py-1.5 bg-red-900/50 hover:bg-red-800/60 text-xs text-red-300 rounded-lg transition-colors"
                onClick={() => { setGaveUp(true); setRunning(false); }}
              >
                Give up
              </button>
            )}

            {selectedBandIds.length === 0 && (
              <p className="text-xs text-amber-400/70">Select artists first</p>
            )}
          </div>

          {/* Artists */}
          {scopes && (
            <div>
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Artists</div>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {scopes.bands.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" checked={selectedBandIds.includes(b.id)} onChange={() => toggleBand(b.id)} className="accent-indigo-500" />
                    <span className={`text-xs ${selectedBandIds.includes(b.id) ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`}>{b.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          {challenge && (
            <div className="space-y-1.5 text-xs">
              <div className="text-white/40 uppercase tracking-wider font-semibold">Stats</div>
              <div className="flex justify-between text-white/60"><span>Time</span><span className="font-mono">{formatTime(elapsed)}</span></div>
              <div className="flex justify-between text-white/60"><span>Attempts</span><span>{attempts.length}</span></div>
              <div className="flex justify-between text-white/60"><span>Wrong</span><span className="text-red-400">{badAttempts}</span></div>
            </div>
          )}

          {/* Attempt history */}
          {attempts.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-white/40 uppercase tracking-wider font-semibold">History</div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {attempts.map((a, i) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded flex items-center gap-2
                    ${a.found ? 'bg-green-900/40 text-green-300' : !a.hasLyrics ? 'bg-white/5 text-white/30' : 'bg-red-900/30 text-red-300'}`}>
                    <span>{a.found ? '✓' : !a.hasLyrics ? '—' : '✗'}</span>
                    <span className="truncate">{a.songTitle}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="text-xs space-y-1 text-white/40">
            <div className="font-semibold uppercase tracking-wider mb-1.5">Legend</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Found</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Not there</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-500 inline-block" />No lyrics</div>
            <p className="mt-2 leading-snug">Click <span className="text-indigo-300">song nodes</span> to check if they contain the word. Click <span className="text-purple-300">album nodes</span> to highlight their songs.</p>
          </div>
        </aside>

        {/* Main area */}
        <main className="flex-1 min-w-0 space-y-4">

          {/* Challenge word display */}
          {challenge && (
            <div className={`rounded-xl border px-6 py-4 transition-all
              ${won ? 'border-green-500/50 bg-green-900/20' : gaveUp ? 'border-red-500/30 bg-red-900/10' : 'border-indigo-500/30 bg-indigo-900/10'}`}>
              {won ? (
                <div className="text-center">
                  <div className="text-2xl font-black text-green-400 tracking-widest uppercase mb-1">{challenge.word}</div>
                  <div className="text-sm text-green-300">Found it! {attempts.length} attempt{attempts.length !== 1 ? 's' : ''} · {formatTime(elapsed)}</div>
                </div>
              ) : gaveUp ? (
                <div className="text-center">
                  <div className="text-2xl font-black text-red-400 tracking-widest uppercase mb-1">{challenge.word}</div>
                  <div className="text-sm text-red-300">Better luck next time · {attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-indigo-300 uppercase tracking-widest mb-1">Find this word</div>
                    <div className="text-3xl font-black text-white tracking-widest uppercase">{challenge.word}</div>
                    <div className="text-xs text-white/40 mt-1">Appears in {challenge.songCount} song{challenge.songCount !== 1 ? 's' : ''} in the library</div>
                  </div>
                  {checking && (
                    <div className="flex gap-1">
                      {[0,1,2].map((i) => (
                        <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!challenge && selectedBandIds.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-6 py-8 text-center text-white/40 text-sm">
              <div className="text-3xl mb-3 opacity-30">🔍</div>
              <div>Pick some artists, then hit <span className="text-white font-medium">Start game</span></div>
              <div className="text-xs mt-2">A mystery word will appear — click song nodes to find which songs contain it</div>
            </div>
          )}

          {/* Graph */}
          {graphLabel && (
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-white/40">{graphLabel}</span>
              {isFetching && <span className="text-xs text-indigo-400">Loading…</span>}
            </div>
          )}

          {selectedBandIds.length > 0 && isFetching && (
            <div className="flex items-center justify-center h-[500px] rounded-xl bg-white/5 border border-white/10">
              <div className="flex gap-1.5">
                {[0,1,2].map((i) => <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className={`rounded-xl overflow-hidden border border-white/10 transition-opacity duration-300
              ${isFetching || selectedBandIds.length === 0 ? 'opacity-0 pointer-events-none h-0' : 'opacity-100'}`}
            style={{ width: '100%', height: '520px', background: '#060d1a' }}
          />

          {!isFetching && selectedBandIds.length > 0 && !challenge && (
            <p className="text-xs text-white/30 text-center">Click album nodes to focus · start the game to activate song checking</p>
          )}
          {!isFetching && challenge && !won && !gaveUp && (
            <p className="text-xs text-white/30 text-center">Click <span className="text-indigo-300">purple song nodes</span> to check if they contain "{challenge.word}"</p>
          )}
        </main>
      </div>
    </div>
  );
}

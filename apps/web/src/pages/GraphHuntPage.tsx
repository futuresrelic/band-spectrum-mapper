/**
 * GraphHuntPage — 3D lyrical word-hunt game.
 * Navigate a 3D force graph of songs and lyric keywords.
 * Start at a random song node, find the hidden target keyword — one hop at a time.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ForceGraph3D from 'react-force-graph-3d';
import { api } from '../lib/api';
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

// ── Visual helpers ────────────────────────────────────────────────────────────

const BASE_COLOR: Record<string, string> = {
  song: '#6366f1', keyword: '#374151',
  album: '#8b5cf6', artist: '#f59e0b',
  theme: '#10b981', tag: '#06b6d4', emotion: '#ec4899',
};

function computeNodeColor(
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

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'playing' | 'won';

export default function GraphHuntPage() {
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [targetWord, setTargetWord] = useState('');
  const [moves, setMoves] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distance, setDistance] = useState(Infinity);
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState('');
  const [simReady, setSimReady] = useState(false);
  const [huntNodes, setHuntNodes] = useState<HuntNode[]>([]);
  const [huntLinks, setHuntLinks] = useState<HuntLink[]>([]);

  // Refs — read inside callbacks to avoid stale closures
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const adjRef = useRef(new Map<string, Set<string>>());
  const currentRef = useRef('');
  const targetRef = useRef('');
  const revealedRef = useRef(false);
  const phaseRef = useRef<Phase>('setup');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: scopes } = useQuery({
    queryKey: ['explore-scopes'],
    queryFn: fetchScopes,
  });

  const { data: graphData, isFetching } = useQuery({
    queryKey: ['graph-hunt-data', selectedBandIds.join(',')],
    queryFn: () => fetchLyricalGraph(selectedBandIds),
    enabled: selectedBandIds.length > 0,
  });

  // Build hunt graph whenever API data changes
  useEffect(() => {
    if (!graphData) return;
    setSimReady(false);
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

  const flyTo = useCallback((node: HuntNode) => {
    if (!fgRef.current || node.x == null) return;
    fgRef.current.cameraPosition(
      { x: (node.x ?? 0) + 60, y: (node.y ?? 0) + 30, z: (node.z ?? 0) + 60 },
      { x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 },
      800,
    );
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

    // Update refs before state (callbacks read refs)
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
    if (phaseRef.current !== 'playing') return;
    const n = node as HuntNode;
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
    setPhase('setup');
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

  // nodeColor reads from refs — safe to use as stable callback + call refresh()
  const nodeColor = useCallback((node: object) => {
    const n = node as HuntNode;
    return computeNodeColor(
      n.id, n.type,
      currentRef.current, targetRef.current,
      adjRef.current, revealedRef.current,
    );
  }, []);

  const nodeVal = useCallback((node: object) => {
    const n = node as HuntNode;
    return computeNodeVal(n.type, n.id, currentRef.current);
  }, []);

  const onEngineStop = useCallback(() => {
    setSimReady(true);
    fgRef.current?.zoomToFit(600, 60);
  }, []);

  const score = Math.max(0, 1000 - moves * 25 - elapsedSec);
  const hc = distance < Infinity ? getHotCold(distance) : null;
  const bands = scopes?.bands ?? [];

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

              {flash && <p className="text-xs text-yellow-400">{flash}</p>}
            </div>
          )}

          {/* Playing panel */}
          {phase === 'playing' && (
            <div className="p-4 flex flex-col gap-4">
              {/* Target word */}
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

              {/* Hot/cold indicator */}
              {hc && (
                <div
                  className={`rounded-lg border p-3 text-center ${hc.borderCls} ${hc.bgCls}`}
                >
                  <div className="text-3xl">{hc.emoji}</div>
                  <div className={`font-bold text-sm mt-1 ${hc.textCls}`}>{hc.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {distance === Infinity
                      ? '—'
                      : `${distance} hop${distance === 1 ? '' : 's'} away`}
                  </div>
                </div>
              )}

              {/* Flash message */}
              {flash && (
                <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-gray-300 leading-relaxed">
                  {flash}
                </div>
              )}

              {/* Legend */}
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
                Drag to orbit · scroll to zoom · click cyan nodes to move
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
            <div className="p-4 flex flex-col gap-5">
              <div className="text-center">
                <div className="text-5xl mb-3">🎉</div>
                <h2 className="text-xl font-bold text-green-400">You found it!</h2>
                <div className="text-2xl font-bold mt-2">"{targetWord}"</div>
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

              <button
                onClick={startGame}
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
        <div className="flex-1 relative bg-[#030712]">
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
              nodeLabel="label"
              nodeColor={nodeColor}
              nodeVal={nodeVal}
              nodeOpacity={0.9}
              nodeResolution={8}
              linkColor={() => 'rgba(100,116,139,0.35)'}
              linkWidth={0.5}
              linkOpacity={0.5}
              backgroundColor="#030712"
              showNavInfo={false}
              warmupTicks={80}
              onNodeClick={handleNodeClick}
              onEngineStop={onEngineStop}
            />
          )}
        </div>
      </div>
    </div>
  );
}

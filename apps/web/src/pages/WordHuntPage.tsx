/**
 * WordHuntPage — find the hidden word in the library.
 * Available to any logged-in user (/play/word-hunt).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import cytoscape from 'cytoscape';
import type { Core, NodeSingular, EventObject } from 'cytoscape';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { GraphNode, GraphEdge, NodeType } from '../api/songNodes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Challenge { word: string; songCount: number }
interface VerifyResult { found: boolean; hasLyrics: boolean }
interface Attempt { nodeId: string; songTitle: string; found: boolean; hasLyrics: boolean }
interface LeaderboardEntry {
  rank: number; playerName: string; avatarUrl?: string;
  word: string; score: number; attempts: number; wrongCount: number; timeSec: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const NODE_COLORS: Record<NodeType, string> = {
  song: '#6366f1', album: '#8b5cf6', artist: '#f59e0b',
  theme: '#10b981', tag: '#06b6d4', keyword: '#64748b', emotion: '#ec4899',
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
        'font-weight': '600',
        'color': '#526070',
        'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': '4px',
        'text-outline-color': '#060d1a', 'text-outline-width': '2px',
        'width': 'data(size)', 'height': 'data(size)',
        'border-width': '1.5px', 'border-color': '#ffffff22', 'min-zoomed-font-size': 4,
        'cursor': 'pointer',
      },
    },
    { selector: 'node[type = "song"]',   style: { 'width': 22, 'height': 22 } },
    { selector: 'node[type = "artist"]', style: { 'width': 38, 'height': 38, 'font-size': '12px', 'color': '#8da4b4', 'text-wrap': 'wrap', 'text-max-width': '90px' } },
    { selector: 'node[type = "album"]',  style: { 'width': 28, 'height': 28 } },
    { selector: 'node[type = "tag"]',    style: { 'width': 20, 'height': 20, 'shape': 'tag' } },
    { selector: 'node:selected',         style: { 'border-width': '3px', 'border-color': '#fff' } },
    { selector: 'node.label-hover',      style: { 'color': '#ffffff', 'border-width': '2.5px', 'border-color': '#ffffff44' } },
    { selector: '.faded',                style: { 'opacity': 0.12 } },
    { selector: '.highlighted',          style: { 'opacity': 1 } },
    { selector: '.found-yes',            style: { 'background-color': '#22c55e', 'border-color': '#4ade80', 'border-width': '3px' } },
    { selector: '.found-no',             style: { 'background-color': '#ef4444', 'border-color': '#f87171', 'border-width': '3px' } },
    { selector: '.no-lyrics',            style: { 'background-color': '#64748b', 'border-color': '#94a3b8', 'border-width': '2px' } },
    { selector: 'edge', style: { 'width': 1, 'line-color': 'data(edgeColor)', 'curve-style': 'bezier', 'opacity': 0.6 } },
  ];
}

function buildElements(nodes: GraphNode[], edges: GraphEdge[]) {
  return [
    ...nodes
      .filter((n) => ['song', 'album', 'artist'].includes(n.type))
      .map((n) => ({
        data: {
          id: n.id,
          label: n.type === 'artist' ? n.label : (n.label.length > 20 ? n.label.slice(0, 18) + '…' : n.label),
          fullLabel: n.label,
          type: n.type,
          color: NODE_COLORS[n.type],
          size: n.data.size ?? undefined,
          bandName: n.data.bandName,
          albumTitle: n.data.albumTitle,
        },
      })),
    ...edges
      .filter((e) => ['same_artist', 'same_album'].includes(e.type))
      .map((e) => ({
        data: { id: e.id, source: e.source, target: e.target, edgeColor: EDGE_COLORS[e.type] ?? '#ffffff22', edgeType: e.type },
      })),
  ];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Score: 1000 base − 100 per wrong − 2 per second (min 0)
function calcScore(wrongCount: number, timeSec: number): number {
  return Math.max(0, Math.round(1000 - wrongCount * 100 - timeSec * 2));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WordHuntPage() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef        = useRef<Core | null>(null);
  const orbitGenRef  = useRef(0);
  const pulseGenRef  = useRef(0);

  // Game state
  const [challenge, setChallenge]               = useState<Challenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [attempts, setAttempts]                 = useState<Attempt[]>([]);
  const [won, setWon]                           = useState(false);
  const [gaveUp, setGaveUp]                     = useState(false);
  const [elapsed, setElapsed]                   = useState(0);
  const [running, setRunning]                   = useState(false);
  const [checking, setChecking]                 = useState(false);
  const [revealed, setRevealed]                 = useState<{ id: string; title: string; bandName: string }[]>([]);
  const [revealing, setRevealing]               = useState(false);
  const [submittedScore, setSubmittedScore]     = useState<{ score: number; rank: number } | null>(null);
  const [showLeaderboard, setShowLeaderboard]   = useState(false);

  // Scope: 'selected' = filtered to selectedBandIds, 'all' = all bands
  const [scope, setScope] = useState<'selected' | 'all'>('selected');

  // Refs for stale-closure-safe tap handlers
  const challengeRef = useRef<Challenge | null>(null);
  const attemptsRef  = useRef<Attempt[]>([]);
  const wonRef       = useRef(false);
  const gaveUpRef    = useRef(false);
  const checkingRef  = useRef(false);

  useEffect(() => { challengeRef.current = challenge; },  [challenge]);
  useEffect(() => { attemptsRef.current  = attempts; },   [attempts]);
  useEffect(() => { wonRef.current       = won; },        [won]);
  useEffect(() => { gaveUpRef.current    = gaveUp; },     [gaveUp]);

  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [graphLabel, setGraphLabel]           = useState('');
  const [isFetching, setIsFetching]           = useState(false);

  // Timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const { data: scopes } = useQuery({
    queryKey: ['word-hunt-scopes'],
    queryFn: () => api.get<{ bands: { id: string; name: string }[] }>('/api/public/graph/scopes'),
  });

  const { data: leaderboard, refetch: refetchLeaderboard } = useQuery({
    queryKey: ['word-hunt-leaderboard'],
    queryFn: () => api.get<LeaderboardEntry[]>('/api/public/word-hunt/leaderboard?limit=15'),
    enabled: showLeaderboard,
  });

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  function startAnimation(cy: Core) {
    const pgen = ++pulseGenRef.current;
    cy.nodes('[type = "artist"]').forEach((node, i) => {
      const BASE = 38, PEAK = 50, PERIOD = 3000 + i * 700;
      const breathe = () => {
        if (cy.destroyed() || pulseGenRef.current !== pgen) return;
        node.animate({ style: { width: PEAK, height: PEAK } }, {
          duration: PERIOD / 2, easing: 'ease-in-out',
          complete: () => {
            if (cy.destroyed() || pulseGenRef.current !== pgen) return;
            node.animate({ style: { width: BASE, height: BASE } }, {
              duration: PERIOD / 2, easing: 'ease-in-out', complete: breathe,
            });
          },
        });
      };
      setTimeout(() => { if (pulseGenRef.current === pgen) breathe(); }, i * 350);
    });

    orbitGenRef.current++;
    cy.batch(() => {
      cy.nodes('[type = "artist"], [type = "album"]').forEach((n) => {
        const b = n.scratch('_ob') as { x: number; y: number } | undefined;
        if (b) n.position(b);
      });
    });
    const ogen = ++orbitGenRef.current;
    cy.nodes('[type = "artist"], [type = "album"]').forEach((n) => { n.scratch('_ob', { ...n.position() }); });
    const onFree = (evt: EventObject) => {
      const n = evt.target as NodeSingular;
      if (['artist', 'album'].includes(n.data('type') as string)) n.scratch('_ob', { ...n.position() });
    };
    cy.on('free', 'node', onFree);
    let t = 0;
    const tick = () => {
      if (cy.destroyed() || orbitGenRef.current !== ogen) {
        cy.off('free', 'node', onFree as (e: EventObject) => void); return;
      }
      t += 0.004;
      cy.batch(() => {
        cy.nodes('[type = "artist"]').forEach((n, i) => {
          if (n.grabbed() || n.locked()) return;
          const b = n.scratch('_ob') as { x: number; y: number } | undefined;
          if (!b) return;
          n.position({ x: b.x + Math.sin(t + i * 2.399) * 3.5, y: b.y + Math.cos(t * 0.71 + i * 2.399) * 2.5 });
        });
        cy.nodes('[type = "album"]').forEach((n, i) => {
          if (n.grabbed() || n.locked()) return;
          const b = n.scratch('_ob') as { x: number; y: number } | undefined;
          if (!b) return;
          n.position({ x: b.x + Math.sin(t * 0.8 + i * 1.618) * 2, y: b.y + Math.cos(t * 0.55 + i * 1.618) * 1.5 });
        });
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
  // Load graph
  // ---------------------------------------------------------------------------

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

      cy.one('layoutstop', () => { if (!cy.destroyed()) startAnimation(cy); });

      cy.on('mouseover', 'node', (evt: EventObject) => { (evt.target as NodeSingular).addClass('label-hover'); });
      cy.on('mouseout',  'node', (evt: EventObject) => { (evt.target as NodeSingular).removeClass('label-hover'); });

      cy.on('tap', 'node[type = "album"]', (evt: EventObject) => {
        const node = evt.target as NodeSingular;
        cy.elements().removeClass('highlighted faded');
        node.closedNeighborhood().addClass('highlighted');
        cy.elements().not(node.closedNeighborhood()).addClass('faded');
      });
      cy.on('tap', (evt: EventObject) => {
        if (evt.target === cy) cy.elements().removeClass('highlighted faded');
      });

      // Song tap — reads from refs so closure is always current
      cy.on('tap', 'node[type = "song"]', async (evt: EventObject) => {
        const node = evt.target as NodeSingular;
        const current = challengeRef.current;
        if (!current || wonRef.current || gaveUpRef.current || checkingRef.current) return;

        const nodeId    = node.id();  // e.g. 'song:abc123'
        const dbSongId  = nodeId.startsWith('song:') ? nodeId.slice(5) : nodeId; // strip prefix for DB query
        const songTitle = node.data('fullLabel') as string;
        if (attemptsRef.current.some((a) => a.nodeId === nodeId)) return;

        checkingRef.current = true;
        setChecking(true);

        try {
          const result = await api.get<VerifyResult>(
            `/api/public/word-hunt/verify?word=${encodeURIComponent(current.word)}&songId=${encodeURIComponent(dbSongId)}`,
          );
          const attempt: Attempt = { nodeId, songTitle, found: result.found, hasLyrics: result.hasLyrics };
          setAttempts((prev) => [attempt, ...prev]);

          if (result.found) {
            node.addClass('found-yes');
            wonRef.current = true;
            setWon(true);
            setRunning(false);
          } else if (!result.hasLyrics) {
            node.addClass('no-lyrics');
          } else {
            node.addClass('found-no');
          }
        } finally {
          checkingRef.current = false;
          setChecking(false);
        }
      });
    } finally {
      setIsFetching(false);
    }
  }, []); // safe: reads game state only through refs

  // Load graph when band selection or scope changes
  useEffect(() => {
    if (scope === 'all' && scopes?.bands) {
      loadGraph(scopes.bands.map((b) => b.id));
    } else if (scope === 'selected' && selectedBandIds.length > 0) {
      loadGraph(selectedBandIds);
    }
  }, [selectedBandIds, scope, scopes, loadGraph]);

  // ---------------------------------------------------------------------------
  // Score submission
  // ---------------------------------------------------------------------------

  async function submitScore(wrongCount: number, timeSec: number, word: string, bandScope: string) {
    if (!user) return;
    try {
      const result = await api.post<{ score: number; rank: number }>('/api/word-hunt/scores', {
        word, attempts: attemptsRef.current.length + 1, wrongCount, timeSec, bandScope,
      });
      setSubmittedScore(result);
      void refetchLeaderboard();
    } catch {
      // Silent fail — scoring is optional
    }
  }

  // ---------------------------------------------------------------------------
  // Challenge management
  // ---------------------------------------------------------------------------

  async function loadChallenge() {
    setLoadingChallenge(true);
    setAttempts([]);
    setWon(false);
    setGaveUp(false);
    setRevealed([]);
    setElapsed(0);
    setRunning(false);
    setSubmittedScore(null);
    wonRef.current      = false;
    gaveUpRef.current   = false;
    checkingRef.current = false;
    cyRef.current?.nodes().removeClass('found-yes found-no no-lyrics');
    try {
      const qs = scope === 'selected' && selectedBandIds.length
        ? `?bandIds=${selectedBandIds.join(',')}`
        : '';
      const data = await api.get<Challenge>(`/api/public/word-hunt/challenge${qs}`);
      setChallenge(data);
      setRunning(true);
    } finally {
      setLoadingChallenge(false);
    }
  }

  async function handleGiveUp() {
    setGaveUp(true);
    setRunning(false);
  }

  async function handleReveal() {
    if (!challenge || revealing) return;
    setRevealing(true);
    try {
      const qs = new URLSearchParams({ word: challenge.word });
      if (scope === 'selected' && selectedBandIds.length) qs.set('bandIds', selectedBandIds.join(','));
      const data = await api.get<{ songs: { id: string; title: string; bandName: string }[] }>(
        `/api/public/word-hunt/reveal?${qs}`,
      );
      setRevealed(data.songs);
      const cy = cyRef.current;
      if (cy) {
        data.songs.forEach(({ id }) => {
          const node = cy.$(`#${CSS.escape(id)}`);
          if (node.length) node.addClass('found-yes');
        });
      }
    } finally {
      setRevealing(false);
    }
  }

  // Submit score when user wins
  useEffect(() => {
    if (won && challenge && user && !submittedScore) {
      const wrongCount = attemptsRef.current.filter((a) => !a.found).length;
      const bandScope  = scope === 'selected' ? selectedBandIds.join(',') : 'all';
      void submitScore(wrongCount, elapsed, challenge.word, bandScope);
    }
  }, [won]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBand = useCallback((id: string) => {
    setSelectedBandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const badAttempts    = attempts.filter((a) => !a.found).length;
  const canPlay        = scope === 'all' ? !!scopes?.bands.length : selectedBandIds.length > 0;
  const graphBandCount = scope === 'all' ? (scopes?.bands.length ?? 0) : selectedBandIds.length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-bold text-white tracking-tight">Word Hunt</h1>
          <span className="text-xs text-white/40">Find the word hidden in the library</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            className={`text-xs transition-colors ${showLeaderboard ? 'text-indigo-300' : 'text-white/40 hover:text-white/70'}`}
            onClick={() => setShowLeaderboard((v) => !v)}
          >
            🏆 Leaderboard
          </button>
          <a href="/landing" className="text-xs text-indigo-400 hover:text-indigo-200">← Back</a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col lg:flex-row gap-5">

        {/* Sidebar */}
        <aside className="w-full lg:w-52 lg:shrink-0 space-y-5">

          {/* Scope toggle */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Mode</div>
            <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
              <button
                className={`flex-1 py-1.5 transition-colors ${scope === 'selected' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/50 hover:text-white/80'}`}
                onClick={() => setScope('selected')}
              >
                My bands
              </button>
              <button
                className={`flex-1 py-1.5 transition-colors ${scope === 'all' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-white/50 hover:text-white/80'}`}
                onClick={() => setScope('all')}
              >
                All bands
              </button>
            </div>
            {scope === 'all' && (
              <p className="text-xs text-white/30 mt-1 leading-tight">Big challenge — word from the entire library</p>
            )}
          </div>

          {/* Game controls */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">Challenge</div>
            {!challenge ? (
              <button
                className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50"
                onClick={loadChallenge}
                disabled={loadingChallenge || !canPlay}
              >
                {loadingChallenge ? 'Loading…' : 'Start game'}
              </button>
            ) : (
              <button
                className="w-full px-3 py-2 bg-white/10 hover:bg-white/20 text-xs text-white rounded-lg transition-colors"
                onClick={loadChallenge}
                disabled={loadingChallenge}
              >
                New word
              </button>
            )}
            {challenge && !won && !gaveUp && (
              <button
                className="w-full px-3 py-1.5 bg-red-900/50 hover:bg-red-800/60 text-xs text-red-300 rounded-lg transition-colors"
                onClick={handleGiveUp}
              >
                Give up
              </button>
            )}
            {(gaveUp || won) && revealed.length === 0 && (
              <button
                className="w-full px-3 py-1.5 bg-amber-900/40 hover:bg-amber-800/50 text-xs text-amber-300 rounded-lg transition-colors disabled:opacity-40"
                onClick={handleReveal}
                disabled={revealing}
              >
                {revealing ? 'Revealing…' : '🔍 Reveal answer'}
              </button>
            )}
            {scope === 'selected' && selectedBandIds.length === 0 && (
              <p className="text-xs text-amber-400/70">Select artists first</p>
            )}
          </div>

          {/* Artists (only shown in selected mode) */}
          {scope === 'selected' && scopes && (
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
              <div className="flex justify-between"><span className="text-white/60">Wrong</span><span className="text-red-400">{badAttempts}</span></div>
              {won && (
                <div className="flex justify-between mt-1 pt-1 border-t border-white/10">
                  <span className="text-white/60">Score</span>
                  <span className="text-green-400 font-bold font-mono">{calcScore(badAttempts, elapsed)}</span>
                </div>
              )}
            </div>
          )}

          {/* Submitted score + rank */}
          {submittedScore && (
            <div className="rounded-lg bg-green-900/30 border border-green-500/30 p-3 text-xs space-y-1">
              <div className="text-green-300 font-semibold">Score saved!</div>
              <div className="flex justify-between text-white/60">
                <span>Points</span><span className="font-mono text-green-300">{submittedScore.score}</span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>Rank</span><span className="font-mono text-yellow-300">#{submittedScore.rank}</span>
              </div>
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

          {/* Revealed answer */}
          {revealed.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-amber-400/70 uppercase tracking-wider font-semibold">Answer</div>
              <p className="text-xs text-white/40 leading-snug">
                "{challenge?.word}" in {revealed.length} song{revealed.length !== 1 ? 's' : ''}:
              </p>
              <div className="space-y-1">
                {revealed.map((s) => (
                  <div key={s.id} className="text-xs px-2 py-1 rounded bg-amber-900/30 text-amber-200 flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">♪</span>
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-amber-400/60">{s.bandName}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="text-xs space-y-1 text-white/40">
            <div className="font-semibold uppercase tracking-wider mb-1.5">Legend</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Found</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Not there</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-slate-500 inline-block" /> No lyrics</div>
            <p className="mt-2 leading-snug">Click <span className="text-indigo-300">purple song nodes</span> to check. Click <span className="text-violet-300">album nodes</span> to focus.</p>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 space-y-4">

          {/* Leaderboard (collapsible) */}
          {showLeaderboard && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-bold text-white mb-3">🏆 Top Scores</div>
              {!leaderboard ? (
                <div className="text-xs text-white/40">Loading…</div>
              ) : leaderboard.length === 0 ? (
                <div className="text-xs text-white/40">No scores yet — be the first!</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-white/30 text-left">
                        <th className="pr-3 pb-2 font-medium">#</th>
                        <th className="pr-3 pb-2 font-medium">Player</th>
                        <th className="pr-3 pb-2 font-medium">Word</th>
                        <th className="pr-3 pb-2 font-medium text-right">Score</th>
                        <th className="pr-3 pb-2 font-medium text-right">Wrong</th>
                        <th className="pb-2 font-medium text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((e) => (
                        <tr key={e.rank} className="border-t border-white/5">
                          <td className="pr-3 py-1.5 text-white/30">{e.rank}</td>
                          <td className="pr-3 py-1.5 text-white font-medium">{e.playerName}</td>
                          <td className="pr-3 py-1.5 text-indigo-300 uppercase tracking-wider font-mono">{e.word}</td>
                          <td className="pr-3 py-1.5 text-green-400 font-bold font-mono text-right">{e.score}</td>
                          <td className="pr-3 py-1.5 text-red-400 text-right">{e.wrongCount}</td>
                          <td className="py-1.5 text-white/40 text-right font-mono">{formatTime(e.timeSec)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-white/20 mt-3 leading-tight">Score = 1000 − (wrong × 100) − (seconds × 2). Only wins count.</p>
                </div>
              )}
            </div>
          )}

          {/* Challenge display */}
          {challenge && (
            <div className={`rounded-xl border px-6 py-4 transition-all
              ${won ? 'border-green-500/50 bg-green-900/20' : gaveUp ? 'border-red-500/30 bg-red-900/10' : 'border-indigo-500/30 bg-indigo-900/10'}`}>
              {won ? (
                <div className="text-center">
                  <div className="text-2xl font-black text-green-400 tracking-widest uppercase mb-1">{challenge.word}</div>
                  <div className="text-sm text-green-300">
                    Found! {attempts.length} attempt{attempts.length !== 1 ? 's' : ''} · {formatTime(elapsed)} · {calcScore(badAttempts, elapsed)} pts
                  </div>
                  {!user && <div className="text-xs text-white/30 mt-2">Sign in to save your score to the leaderboard</div>}
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
                    <div className="text-xs text-white/40 mt-1">
                      Hidden in {challenge.songCount} song{challenge.songCount !== 1 ? 's' : ''}
                      {scope === 'all' ? ' across all bands' : ''} · click purple nodes to find it
                    </div>
                  </div>
                  {checking && (
                    <div className="flex gap-1">
                      {[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!challenge && !canPlay && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-6 py-8 text-center text-white/40 text-sm">
              <div className="text-3xl mb-3 opacity-30">🔍</div>
              <div>{scope === 'selected' ? 'Pick some artists, then hit Start game' : 'No artists in the library yet'}</div>
            </div>
          )}

          {graphLabel && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">
                {graphLabel}{scope === 'all' ? ` (${graphBandCount} bands)` : ''}
              </span>
              {isFetching && <span className="text-xs text-indigo-400">Loading…</span>}
            </div>
          )}

          {isFetching && (
            <div className="flex items-center justify-center h-[500px] rounded-xl bg-white/5 border border-white/10">
              <div className="flex gap-1.5">
                {[0,1,2].map((i) => <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className={`rounded-xl overflow-hidden border border-white/10 transition-opacity duration-300
              ${isFetching || (!canPlay && scope === 'selected') ? 'opacity-0 pointer-events-none h-0' : 'opacity-100'}`}
            style={{ width: '100%', height: '520px', background: '#060d1a' }}
          />

          {!isFetching && canPlay && !challenge && (
            <p className="text-xs text-white/30 text-center">Graph loaded · start the game to activate song checking</p>
          )}
          {!isFetching && challenge && !won && !gaveUp && (
            <p className="text-xs text-white/30 text-center">
              Click <span className="text-indigo-300">song nodes</span> to check for "{challenge.word}"
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LyricPathPanel — full-screen Cinema overlay that renders a song's lyrics as
 * a 3-D word-sequence graph.
 *
 * Each word is a node pinned to a helix position; consecutive words are linked.
 * The auto-play tour flies the camera through the helix word-by-word.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';
import { api } from '../lib/api';

// ── Helix geometry constants ──────────────────────────────────────────────────

const HELIX_RADIUS     = 28;   // world units
const HELIX_ANGLE_STEP = 0.52; // radians per word (≈ 12 words per full turn)
const HELIX_Y_STEP     = 3.8;  // vertical rise per word

// ── Colour gradient: indigo → cyan ────────────────────────────────────────────

function wordColor(i: number, total: number): string {
  if (total <= 1) return '#6366f1';
  const t  = i / (total - 1);
  const r  = Math.round(0x63 + (0x22 - 0x63) * t);
  const g  = Math.round(0x66 + (0xd3 - 0x66) * t);
  const b  = Math.round(0xf1 + (0xee - 0xf1) * t);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LyricWord {
  id: string;
  label: string;
  wordIndex: number;
  total: number;
  fx: number; fy: number; fz: number;
  theta: number;
}

interface LyricLink {
  source: string;
  target: string;
}

interface Props {
  songId: string;
  songLabel: string;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LyricPathPanel({ songId, songLabel, onClose }: Props) {
  const fgRef = useRef<any>(null);

  const [graphData, setGraphData] = useState<{ nodes: LyricWord[]; links: LyricLink[] }>({ nodes: [], links: [] });
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState('');

  // Playback
  const [currentIdx, setCurrentIdx] = useState(0);
  const currentIdxRef = useRef(0);
  const [isPlaying, setIsPlaying]   = useState(false);
  const isPlayingRef  = useRef(false);
  const tourTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Controls
  const [speed, setSpeed]         = useState(1.0);
  const speedRef = useRef(1.0);
  const [orbitDist, setOrbitDist] = useState(55);
  const orbitDistRef = useRef(55);
  const nodesRef = useRef<LyricWord[]>([]);

  useEffect(() => { speedRef.current    = speed;     }, [speed]);
  useEffect(() => { orbitDistRef.current = orbitDist; }, [orbitDist]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── Load lyrics and build graph ───────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    setCurrentIdx(0);
    currentIdxRef.current = 0;
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current);

    api.get<{ id: string; text: string; isPrimary: boolean }[]>(`/api/songs/${songId}/lyrics`)
      .then((lyrics) => {
        const primary = lyrics.find(l => l.isPrimary) ?? lyrics[0];
        if (!primary) { setLoadError('No lyrics found for this song.'); setLoading(false); return; }

        const words = primary.text
          .split(/[\r\n]+/)
          .flatMap(line => line.trim().split(/\s+/).filter(w => w.length > 0))
          .slice(0, 600);

        if (!words.length) { setLoadError('Lyrics appear to be empty.'); setLoading(false); return; }

        const total   = words.length;
        const totalY  = (total - 1) * HELIX_Y_STEP;

        const nodes: LyricWord[] = words.map((word, i) => {
          const theta = i * HELIX_ANGLE_STEP;
          return {
            id: `lw-${i}`,
            label: word,
            wordIndex: i,
            total,
            fx: HELIX_RADIUS * Math.cos(theta),
            fy: i * HELIX_Y_STEP - totalY / 2,
            fz: HELIX_RADIUS * Math.sin(theta),
            theta,
          };
        });

        const links: LyricLink[] = [];
        for (let i = 0; i < nodes.length - 1; i++) {
          links.push({ source: `lw-${i}`, target: `lw-${i + 1}` });
        }

        nodesRef.current = nodes;
        setGraphData({ nodes, links });
        setLoading(false);
      })
      .catch(() => { setLoadError('Failed to load lyrics.'); setLoading(false); });
  }, [songId]);

  // ── Camera fly-to ─────────────────────────────────────────────────────────

  const flyToWord = useCallback((idx: number, durationMs?: number) => {
    const node = nodesRef.current[idx];
    if (!node || !fgRef.current) return;
    const dist = orbitDistRef.current;
    const camX = node.fx + Math.cos(node.theta) * dist;
    const camY = node.fy + dist * 0.22;
    const camZ = node.fz + Math.sin(node.theta) * dist;
    fgRef.current.cameraPosition(
      { x: camX, y: camY, z: camZ },
      { x: node.fx, y: node.fy, z: node.fz },
      durationMs ?? (1100 / speedRef.current),
    );
  }, []);

  // Initial camera position after load
  useEffect(() => {
    if (!loading && graphData.nodes.length > 0) {
      const timer = setTimeout(() => flyToWord(0, 1400), 350);
      return () => clearTimeout(timer);
    }
  }, [loading, graphData, flyToWord]);

  // Refresh graph when active word changes so SpriteText colours update
  useEffect(() => {
    fgRef.current?.refresh();
  }, [currentIdx]);

  // ── Tour playback ─────────────────────────────────────────────────────────

  const scheduleTick = useCallback(() => {
    if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    if (!isPlayingRef.current) return;
    const delay = 1300 / speedRef.current;
    tourTimerRef.current = setTimeout(() => {
      if (!isPlayingRef.current) return;
      const total = nodesRef.current.length;
      if (!total) return;
      const next = (currentIdxRef.current + 1) % total;
      currentIdxRef.current = next;
      setCurrentIdx(next);
      flyToWord(next);
      scheduleTick();
    }, delay);
  }, [flyToWord]);

  useEffect(() => {
    if (isPlaying) {
      scheduleTick();
    } else {
      if (tourTimerRef.current) clearTimeout(tourTimerRef.current);
    }
    return () => { if (tourTimerRef.current) clearTimeout(tourTimerRef.current); };
  }, [isPlaying, scheduleTick]);

  useEffect(() => () => { if (tourTimerRef.current) clearTimeout(tourTimerRef.current); }, []);

  // ── Step controls ─────────────────────────────────────────────────────────

  const stepTo = useCallback((idx: number, dur = 400) => {
    const clamped = Math.max(0, Math.min(nodesRef.current.length - 1, idx));
    currentIdxRef.current = clamped;
    setCurrentIdx(clamped);
    flyToWord(clamped, dur);
  }, [flyToWord]);

  const currentWord = graphData.nodes[currentIdx];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-50 bg-black flex flex-col overflow-hidden select-none">

      {/* ── Header ── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 pt-4 pb-8 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <div className="text-white font-semibold text-sm leading-tight">{songLabel}</div>
          {!loading && !loadError && (
            <div className="text-gray-600 text-[10px] uppercase tracking-widest mt-0.5">
              Lyric Path · {graphData.nodes.length} words
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="pointer-events-auto text-gray-400 hover:text-white text-xs bg-gray-900/80 border border-gray-700/70 rounded-lg px-3 py-1.5 transition-colors"
        >
          ← Cinema
        </button>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {loadError && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-red-400 text-sm">{loadError}</p>
            <button onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-3 py-1.5">
              ← Back to Cinema
            </button>
          </div>
        </div>
      )}

      {/* ── 3D Graph ── */}
      {!loading && !loadError && (
        <>
          <ForceGraph3D
            ref={fgRef}
            graphData={graphData as any}
            backgroundColor="#000000"
            showNavInfo={false}
            enableNodeDrag={false}
            nodeThreeObject={(node: any) => {
              const n = node as LyricWord;
              const isActive = n.wordIndex === currentIdxRef.current;
              const sp = new SpriteText(n.label);
              sp.color       = isActive ? '#ffffff' : wordColor(n.wordIndex, n.total);
              sp.textHeight  = isActive ? 6.5 : 3.5;
              sp.fontFace    = 'Inter, system-ui, sans-serif';
              if (isActive) {
                sp.backgroundColor = 'rgba(88,80,220,0.38)';
                sp.padding         = 3;
                sp.borderRadius    = 3;
              } else {
                sp.backgroundColor = 'rgba(0,0,0,0)';
                sp.padding         = 1;
              }
              return sp;
            }}
            nodeThreeObjectExtend={false}
            linkColor={() => 'rgba(99,102,241,0.32)'}
            linkWidth={0.7}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => 'rgba(139,92,246,0.65)'}
            d3AlphaDecay={1}
            d3VelocityDecay={1}
            cooldownTicks={0}
            onNodeClick={(node: any) => {
              const n = node as LyricWord;
              stepTo(n.wordIndex, 500);
            }}
          />

          {/* Current-word ticker (top-right) */}
          {currentWord && (
            <div className="absolute top-1/2 right-5 -translate-y-1/2 z-10 text-right pointer-events-none max-w-[12rem]">
              <div className="text-white/85 text-xl font-light tracking-widest break-words leading-tight">
                {currentWord.label}
              </div>
              <div className="text-gray-700 text-[10px] mt-1.5">
                {currentIdx + 1} / {graphData.nodes.length}
              </div>
            </div>
          )}

          {/* ── Controls bar ── */}
          <div className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10
            bg-gray-900/92 border border-gray-700/60 rounded-xl px-5 py-3
            flex items-center gap-4 backdrop-blur-sm shadow-2xl">

            {/* Step prev */}
            <button
              onClick={() => stepTo(currentIdxRef.current - 1)}
              className="text-gray-400 hover:text-white text-sm transition-colors"
              title="Previous word"
            >⏮</button>

            {/* Play / pause */}
            <button
              onClick={() => setIsPlaying(v => !v)}
              className="text-white text-base w-8 text-center hover:text-indigo-300 transition-colors"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Step next */}
            <button
              onClick={() => stepTo(currentIdxRef.current + 1)}
              className="text-gray-400 hover:text-white text-sm transition-colors"
              title="Next word"
            >⏭</button>

            <div className="w-px h-5 bg-gray-700 mx-1" />

            {/* Speed */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-[10px] whitespace-nowrap">Speed</span>
              <input
                type="range" min={0.2} max={5} step={0.1}
                value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                className="w-20 accent-indigo-500"
              />
              <span className="text-gray-400 text-[10px] w-7 text-right">{speed.toFixed(1)}×</span>
            </div>

            {/* Distance */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-[10px] whitespace-nowrap">Distance</span>
              <input
                type="range" min={15} max={220} step={5}
                value={orbitDist}
                onChange={e => {
                  setOrbitDist(Number(e.target.value));
                  flyToWord(currentIdxRef.current, 250);
                }}
                className="w-20 accent-indigo-500"
              />
              <span className="text-gray-400 text-[10px] w-7 text-right">{orbitDist}</span>
            </div>

            <div className="w-px h-5 bg-gray-700 mx-1" />

            {/* Word counter */}
            <span className="text-[10px] text-gray-600 tabular-nums whitespace-nowrap">
              {currentIdx + 1} / {graphData.nodes.length}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

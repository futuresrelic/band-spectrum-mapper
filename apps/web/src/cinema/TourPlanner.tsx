/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TourPlanner — a drag-free step sequencer for Cinema Mode.
 *
 * The user picks nodes from the graph (filter by type / search by label), adds them
 * as tour steps, sets a dwell time per step, then hits Play to watch the camera
 * orbit each node in order.
 */

import { useState, useMemo } from 'react';
import type { CinemaNode, TourStep } from './types';

interface TourPlannerProps {
  nodes: CinemaNode[];
  steps: TourStep[];
  isPlaying: boolean;
  currentStepIdx: number;
  onAddStep: (step: TourStep) => void;
  onRemoveStep: (id: string) => void;
  onDwellChange: (id: string, ms: number) => void;
  onPlay: () => void;
  onStop: () => void;
  onClear: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  artist: '🎸',
  album:  '💿',
  song:   '🎵',
  keyword:'🔑',
  theme:  '🌿',
  tag:    '🏷',
  emotion:'💜',
};

const TYPE_ORDER = ['artist', 'album', 'song', 'keyword', 'theme', 'tag', 'emotion'];
/** Dwell = time spent orbiting/breathing after arrival (travel is ~1.8s extra) */
const DWELL_PRESETS = [4000, 6000, 10000, 15000, 20000];

function dwellLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(0)}s`;
}

export default function TourPlanner({
  nodes, steps, isPlaying, currentStepIdx,
  onAddStep, onRemoveStep, onDwellChange, onPlay, onStop, onClear,
}: TourPlannerProps) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const types = useMemo(() => {
    const seen = new Set(nodes.map(n => n.type));
    return TYPE_ORDER.filter(t => seen.has(t));
  }, [nodes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return nodes
      .filter(n => typeFilter === 'all' || n.type === typeFilter)
      .filter(n => !q || n.label.toLowerCase().includes(q))
      .slice(0, 60);
  }, [nodes, typeFilter, search]);

  const stepNodeIds = useMemo(() => new Set(steps.map(s => s.nodeId)), [steps]);

  function addNode(n: CinemaNode) {
    const step: TourStep = {
      id: `step-${Date.now()}-${n.id}`,
      nodeId: n.id,
      nodeLabel: n.label,
      nodeType: n.type,
      dwellMs: 8000,
    };
    onAddStep(step);
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Tour Script</span>
        <div className="flex gap-1.5">
          {steps.length > 0 && (
            <>
              {isPlaying ? (
                <button
                  onClick={onStop}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-red-800/60 hover:bg-red-700/60 text-red-300 transition-colors"
                >
                  ⏹ Stop
                </button>
              ) : (
                <button
                  onClick={onPlay}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-indigo-700/60 hover:bg-indigo-600/60 text-indigo-200 transition-colors"
                >
                  ▶ Play Tour
                </button>
              )}
              <button
                onClick={onClear}
                className="text-[10px] px-2 py-1 rounded-md text-gray-600 hover:text-gray-400 transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Step list ── */}
      {steps.length > 0 && (
        <div className="shrink-0 max-h-44 overflow-y-auto space-y-1 pr-0.5">
          {steps.map((step, idx) => (
            <div
              key={step.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                isPlaying && idx === currentStepIdx
                  ? 'bg-indigo-900/60 border border-indigo-700/50'
                  : 'bg-gray-800/60'
              }`}
            >
              <span className="shrink-0 text-[10px] text-gray-600 w-4">{idx + 1}</span>
              <span className="shrink-0">{TYPE_ICONS[step.nodeType] ?? '•'}</span>
              <span className="flex-1 truncate text-gray-300">{step.nodeLabel}</span>
              {/* Dwell time selector (time at node, after ~1.8s travel) */}
              <select
                value={step.dwellMs}
                onChange={e => onDwellChange(step.id, Number(e.target.value))}
                title="Time spent at this node after arriving (~1.8s travel + this)"
                className="text-[10px] bg-gray-700/60 border border-gray-600 text-gray-300 rounded px-1 py-0.5 shrink-0"
              >
                {DWELL_PRESETS.map(ms => (
                  <option key={ms} value={ms}>{dwellLabel(ms)}</option>
                ))}
              </select>
              <button
                onClick={() => onRemoveStep(step.id)}
                className="shrink-0 text-gray-700 hover:text-red-400 transition-colors"
              >
                ✕
              </button>
              {isPlaying && idx === currentStepIdx && (
                <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              )}
            </div>
          ))}
        </div>
      )}

      {steps.length === 0 && (
        <div className="text-[10px] text-gray-700 italic text-center py-2">
          Add nodes below to build a tour
        </div>
      )}

      {/* ── Divider ── */}
      <div className="border-t border-gray-800 shrink-0" />

      {/* ── Node picker ── */}
      <div className="shrink-0 space-y-2">
        {/* Type filter pills */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter('all')}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
              typeFilter === 'all'
                ? 'bg-gray-600 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            All
          </button>
          {types.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                typeFilter === t
                  ? 'bg-gray-600 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {TYPE_ICONS[t] ?? ''} {t}
            </button>
          ))}
        </div>
        {/* Search */}
        <input
          type="text"
          placeholder="Search nodes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-[11px] bg-gray-800/60 border border-gray-700 text-gray-300 rounded-md px-2.5 py-1.5 placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
        />
      </div>

      {/* ── Scrollable node list ── */}
      <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
        {filtered.map(n => (
          <button
            key={n.id}
            onClick={() => addNode(n)}
            disabled={stepNodeIds.has(n.id)}
            className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
              stepNodeIds.has(n.id)
                ? 'opacity-30 cursor-not-allowed text-gray-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <span>{TYPE_ICONS[n.type] ?? '•'}</span>
            <span className="truncate">{n.label}</span>
            {!stepNodeIds.has(n.id) && (
              <span className="ml-auto shrink-0 text-gray-700">+</span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-[10px] text-gray-700 text-center py-3">No nodes match</div>
        )}
      </div>
    </div>
  );
}

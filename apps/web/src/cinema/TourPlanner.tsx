/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TourPlanner — node-based camera sequence editor for Cinema Mode.
 *
 * Each step targets a node by ID (resilient to graph layout changes).
 * Per-step camera controls override the global CinemaControls for that shot.
 * Sequences can be saved/loaded by name from localStorage.
 */

import { useState, useMemo } from 'react';
import type { CinemaNode, TourStep, NodeSequence } from './types';

interface TourPlannerProps {
  nodes: CinemaNode[];
  steps: TourStep[];
  isPlaying: boolean;
  currentStepIdx: number;
  isAddMode: boolean;
  onAddStep: (step: TourStep) => void;
  onRemoveStep: (id: string) => void;
  onStepChange: (id: string, patch: Partial<TourStep>) => void;
  onMoveStep: (id: string, dir: -1 | 1) => void;
  onPlay: () => void;
  onStop: () => void;
  onClear: () => void;
  onToggleAddMode: () => void;
  savedSequences: NodeSequence[];
  onSaveSequence: (name: string) => void;
  onLoadSequence: (seq: NodeSequence) => void;
  onDeleteSequence: (id: string) => void;
  /** Admin-only: toggle isPublic on a saved sequence. */
  onTogglePublic?: (id: string, currentIsPublic: boolean) => void;
}

const TYPE_ICONS: Record<string, string> = {
  artist: '🎸', album: '💿', song: '🎵', keyword: '🔑',
  theme: '🌿', tag: '🏷', emotion: '💜',
};
const TYPE_ORDER = ['artist', 'album', 'song', 'keyword', 'theme', 'tag', 'emotion'];
const DWELL_PRESETS  = [2000, 4000, 6000, 8000, 10000, 15000, 20000, 30000, 60000];
const FLY_IN_PRESETS = [600, 1000, 1800, 2800, 4000, 6000, 10000];
const ORBIT_SPEED_OPTIONS = [0.02, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0];

function dwellLabel(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(0)}s`;
}

function StepRow({
  step, idx, total, isActive, isPlaying,
  onRemove, onChange, onMove,
}: {
  step: TourStep; idx: number; total: number;
  isActive: boolean; isPlaying: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<TourStep>) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasOverrides = step.orbitSpeed !== undefined || step.approachDist !== undefined
    || step.elevation !== undefined || step.orbitMode !== undefined;

  return (
    <div className={`rounded-lg text-[11px] transition-colors ${
      isActive ? 'bg-indigo-900/50 border border-indigo-700/50' : 'bg-gray-800/50 border border-transparent'
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="text-gray-600 font-mono w-4 shrink-0 text-center">{idx + 1}</span>
        <span className="shrink-0 text-[12px]">{TYPE_ICONS[step.nodeType] ?? '•'}</span>
        <span className="flex-1 truncate text-gray-300" title={step.nodeLabel}>{step.nodeLabel}</span>

        {/* Fly-in speed */}
        <select
          value={step.flyInMs ?? 1800}
          onChange={e => onChange({ flyInMs: Number(e.target.value) })}
          title="Travel time to reach this node"
          className="text-[10px] bg-gray-700/60 border border-gray-600 text-gray-300 rounded px-1 py-0.5 shrink-0"
        >
          {FLY_IN_PRESETS.map(ms => <option key={ms} value={ms}>✈{dwellLabel(ms)}</option>)}
        </select>

        {/* Dwell selector */}
        <select
          value={step.dwellMs}
          onChange={e => onChange({ dwellMs: Number(e.target.value) })}
          title="Time orbiting after arrival"
          className="text-[10px] bg-gray-700/60 border border-gray-600 text-gray-300 rounded px-1 py-0.5 shrink-0"
        >
          {DWELL_PRESETS.map(ms => <option key={ms} value={ms}>◉{dwellLabel(ms)}</option>)}
        </select>

        {/* Reorder */}
        <button onClick={() => onMove(-1)} disabled={idx === 0}
          className="shrink-0 text-gray-700 hover:text-gray-400 disabled:opacity-20">↑</button>
        <button onClick={() => onMove(1)} disabled={idx === total - 1}
          className="shrink-0 text-gray-700 hover:text-gray-400 disabled:opacity-20">↓</button>
        <button onClick={onRemove}
          className="shrink-0 text-gray-700 hover:text-red-400 transition-colors">✕</button>

        {/* Expand cam controls */}
        <button onClick={() => setExpanded(v => !v)}
          className={`shrink-0 transition-colors ${expanded ? 'text-indigo-400' : hasOverrides ? 'text-amber-500' : 'text-gray-700 hover:text-gray-400'}`}
          title="Per-shot camera settings">
          {expanded ? '▲' : '▼'}
        </button>

        {isActive && isPlaying && (
          <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
        )}
      </div>

      {/* Expandable camera controls */}
      {expanded && (
        <div className="px-3 pb-2 pt-0.5 space-y-1.5 border-t border-gray-700/40">
          {/* Orbit speed */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">Orbit speed</span>
            <select
              value={step.orbitSpeed ?? ''}
              onChange={e => {
                const v = e.target.value;
                if (v === '') onChange({ orbitSpeed: undefined });
                else onChange({ orbitSpeed: Number(v) });
              }}
              className="flex-1 text-[10px] bg-gray-700/60 border border-gray-600 text-gray-300 rounded px-1 py-0.5"
            >
              <option value="">Global default</option>
              {ORBIT_SPEED_OPTIONS.map(v => <option key={v} value={v}>{v}×</option>)}
            </select>
          </div>

          {/* Approach distance */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">Distance</span>
            <input type="range" min={30} max={800} step={10}
              value={step.approachDist ?? 120}
              onChange={e => onChange({ approachDist: Number(e.target.value) })}
              className="flex-1 accent-indigo-500" />
            <span className="text-gray-400 w-8 text-right shrink-0 text-[10px]">
              {step.approachDist ?? '—'}
            </span>
            {step.approachDist !== undefined && (
              <button onClick={() => onChange({ approachDist: undefined })}
                className="text-gray-700 hover:text-gray-400 text-[10px]">reset</button>
            )}
          </div>

          {/* Elevation */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">Elevation</span>
            <input type="range" min={0} max={220} step={5}
              value={step.elevation ?? 55}
              onChange={e => onChange({ elevation: Number(e.target.value) })}
              className="flex-1 accent-indigo-500" />
            <span className="text-gray-400 w-8 text-right shrink-0 text-[10px]">
              {step.elevation ?? '—'}
            </span>
            {step.elevation !== undefined && (
              <button onClick={() => onChange({ elevation: undefined })}
                className="text-gray-700 hover:text-gray-400 text-[10px]">reset</button>
            )}
          </div>

          {/* Orbit mode */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500 w-20 shrink-0">Mode</span>
            <div className="flex gap-1">
              {(['orbit', 'breathe', undefined] as const).map(mode => (
                <button key={String(mode)}
                  onClick={() => onChange({ orbitMode: mode })}
                  className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                    step.orbitMode === mode
                      ? 'bg-indigo-800 text-indigo-300 border border-indigo-600'
                      : 'text-gray-600 hover:text-gray-400 bg-gray-800'
                  }`}
                >
                  {mode === undefined ? 'Global' : mode}
                </button>
              ))}
            </div>
          </div>

          {/* On-arrive behaviours */}
          <div className="flex items-center gap-4 pt-1 border-t border-gray-700/30">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={step.selectOnArrive ?? false}
                onChange={e => onChange({ selectOnArrive: e.target.checked || undefined })}
                className="accent-indigo-500 w-3 h-3 shrink-0"
              />
              <span className="text-[10px] text-gray-400">◉ Select node</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={step.stareLyricsOnArrive ?? false}
                onChange={e => onChange({ stareLyricsOnArrive: e.target.checked || undefined })}
                className="accent-indigo-500 w-3 h-3 shrink-0"
              />
              <span className="text-[10px] text-gray-400">👁 Stare lyrics</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TourPlanner({
  nodes, steps, isPlaying, currentStepIdx, isAddMode,
  onAddStep, onRemoveStep, onStepChange, onMoveStep,
  onPlay, onStop, onClear, onToggleAddMode,
  savedSequences, onSaveSequence, onLoadSequence, onDeleteSequence, onTogglePublic,
}: TourPlannerProps) {
  const [typeFilter, setTypeFilter]   = useState<string>('all');
  const [search, setSearch]           = useState('');
  const [saveName, setSaveName]       = useState('');
  const [showSaved, setShowSaved]     = useState(false);
  const [showPicker, setShowPicker]   = useState(true);

  const types = useMemo(() => {
    const seen = new Set(nodes.map(n => n.type));
    return TYPE_ORDER.filter(t => seen.has(t));
  }, [nodes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return nodes
      .filter(n => typeFilter === 'all' || n.type === typeFilter)
      .filter(n => !q || n.label.toLowerCase().includes(q))
      .slice(0, 120);
  }, [nodes, typeFilter, search]);

  const stepNodeIds = useMemo(() => new Set(steps.map(s => s.nodeId)), [steps]);

  function addNode(n: CinemaNode) {
    if (stepNodeIds.has(n.id)) return;
    onAddStep({
      id: `step-${Date.now()}-${n.id}`,
      nodeId: n.id,
      nodeLabel: n.label,
      nodeType: n.type,
      dwellMs: 8000,
    });
  }

  function handleSave() {
    const name = saveName.trim();
    if (!name || steps.length === 0) return;
    onSaveSequence(name);
    setSaveName('');
  }

  const totalTime = steps.reduce((s, st) => s + st.dwellMs + 2200, 0);

  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Node Sequence</span>
        <div className="flex gap-1.5 items-center">
          <button
            onClick={onToggleAddMode}
            title={isAddMode ? 'Click-to-add active — click a graph node to add it' : 'Enable click-to-add mode'}
            className={`text-[10px] px-2 py-1 rounded-md transition-colors ${
              isAddMode
                ? 'bg-amber-700/60 text-amber-300 border border-amber-600/60'
                : 'text-gray-500 hover:text-gray-300 bg-gray-800'
            }`}
          >
            {isAddMode ? '🖱 Adding…' : '🖱 Click to add'}
          </button>
          {steps.length > 0 && (
            <>
              {isPlaying ? (
                <button onClick={onStop}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-red-800/60 hover:bg-red-700/60 text-red-300">
                  ⏹ Stop
                </button>
              ) : (
                <button onClick={onPlay}
                  className="text-[10px] px-2.5 py-1 rounded-md bg-indigo-700/60 hover:bg-indigo-600/60 text-indigo-200">
                  ▶ Play
                </button>
              )}
              <button onClick={onClear}
                className="text-[10px] px-2 py-1 rounded-md text-gray-600 hover:text-gray-400">
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Step list ── */}
      {steps.length > 0 ? (
        <div className="shrink-0 space-y-0.5 max-h-64 overflow-y-auto pr-0.5">
          {steps.map((step, idx) => (
            <StepRow
              key={step.id}
              step={step} idx={idx} total={steps.length}
              isActive={isPlaying && idx === currentStepIdx}
              isPlaying={isPlaying}
              onRemove={() => onRemoveStep(step.id)}
              onChange={patch => onStepChange(step.id, patch)}
              onMove={dir => onMoveStep(step.id, dir)}
            />
          ))}
          <div className="text-[10px] text-gray-700 text-center pt-1">
            {steps.length} stop{steps.length > 1 ? 's' : ''} · ~{Math.round(totalTime / 1000)}s total
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-gray-700 italic text-center py-1">
          Add nodes below or click 🖱 then click any graph node
        </div>
      )}

      {/* ── Save / Load ── */}
      <div className="shrink-0 border-t border-gray-800 pt-2 space-y-1.5">
        {steps.length > 0 && (
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="Sequence name…"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="flex-1 text-[11px] bg-gray-800/60 border border-gray-700 text-gray-300 rounded px-2 py-1 placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="text-[10px] px-2.5 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-30 shrink-0"
            >
              💾 Save
            </button>
          </div>
        )}

        {savedSequences.length > 0 && (
          <button
            onClick={() => setShowSaved(v => !v)}
            className="w-full flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <span>{showSaved ? '▲' : '▼'}</span>
            <span>Saved sequences ({savedSequences.length})</span>
          </button>
        )}

        {showSaved && (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {savedSequences.map(seq => (
              <div key={seq.id} className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/60 rounded-lg text-[11px]">
                <span className="flex-1 truncate text-gray-400" title={seq.name}>{seq.name}</span>
                <span className="text-gray-700 text-[10px] shrink-0">{seq.steps.length} stops</span>
                {onTogglePublic && (
                  <button
                    onClick={() => onTogglePublic(seq.id, seq.isPublic ?? false)}
                    title={seq.isPublic ? 'Published — click to make private' : 'Private — click to publish for all users'}
                    className={`shrink-0 text-[11px] transition-colors ${seq.isPublic ? 'text-green-400 hover:text-gray-500' : 'text-gray-700 hover:text-green-500'}`}
                  >
                    🌐
                  </button>
                )}
                <button
                  onClick={() => onLoadSequence(seq)}
                  className="shrink-0 text-indigo-500 hover:text-indigo-300 text-[10px] transition-colors"
                >
                  Load
                </button>
                <button
                  onClick={() => onDeleteSequence(seq.id)}
                  className="shrink-0 text-gray-700 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Node picker ── */}
      <div className="shrink-0 border-t border-gray-800 pt-2">
        <button
          onClick={() => setShowPicker(v => !v)}
          className="w-full flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors mb-1.5"
        >
          <span>{showPicker ? '▲' : '▼'}</span>
          <span>Node picker</span>
        </button>
        {showPicker && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setTypeFilter('all')}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${typeFilter === 'all' ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                All
              </button>
              {types.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${typeFilter === t ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {TYPE_ICONS[t] ?? ''} {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search nodes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-[11px] bg-gray-800/60 border border-gray-700 text-gray-300 rounded-md px-2.5 py-1.5 placeholder:text-gray-600 focus:outline-none focus:border-gray-500"
            />
            <div className="overflow-y-auto space-y-0.5" style={{ maxHeight: '200px' }}>
              {filtered.map(n => (
                <button key={n.id} onClick={() => addNode(n)} disabled={stepNodeIds.has(n.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] transition-colors ${
                    stepNodeIds.has(n.id)
                      ? 'opacity-30 cursor-not-allowed text-gray-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <span>{TYPE_ICONS[n.type] ?? '•'}</span>
                  <span className="truncate">{n.label}</span>
                  {!stepNodeIds.has(n.id) && <span className="ml-auto shrink-0 text-gray-700">+</span>}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="text-[10px] text-gray-700 text-center py-2">No nodes match</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

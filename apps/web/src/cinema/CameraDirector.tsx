import { useState } from 'react';
import type { CinemaKeyframe } from './types';

const DURATION_OPTIONS = [
  { label: '1s',  ms: 1_000 },
  { label: '2s',  ms: 2_000 },
  { label: '3s',  ms: 3_000 },
  { label: '5s',  ms: 5_000 },
  { label: '8s',  ms: 8_000 },
  { label: '12s', ms: 12_000 },
  { label: '20s', ms: 20_000 },
];

function fmtPos(p: { x: number; y: number; z: number }) {
  return `${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`;
}

function KeyframeList({
  keyframes,
  isPlaying,
  onCapture,
  onPlay,
  onStop,
  onGoTo,
  onChange,
  emptyHint,
  playLabel,
}: {
  keyframes: CinemaKeyframe[];
  isPlaying: boolean;
  onCapture: () => void;
  onPlay: () => void;
  onStop: () => void;
  onGoTo: (kf: CinemaKeyframe) => void;
  onChange: (kfs: CinemaKeyframe[]) => void;
  emptyHint: string;
  playLabel: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  function updateKf(id: string, patch: Partial<CinemaKeyframe>) {
    onChange(keyframes.map(k => k.id === id ? { ...k, ...patch } : k));
  }

  function move(id: string, dir: -1 | 1) {
    const idx = keyframes.findIndex(k => k.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= keyframes.length) return;
    const arr = [...keyframes];
    const tmp = arr[idx]!; arr[idx] = arr[next]!; arr[next] = tmp;
    onChange(arr);
  }

  const totalSec = (keyframes.reduce((s, k) => s + k.durationMs, 0) / 1000).toFixed(1);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onCapture}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-900/60 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-xs font-medium transition-colors"
      >
        📍 Capture current camera
      </button>

      {keyframes.length === 0 && (
        <div className="text-center text-[11px] text-gray-700 py-3">{emptyHint}</div>
      )}

      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
        {keyframes.map((kf, i) => (
          <div key={kf.id} className="bg-gray-900 border border-gray-800 rounded-lg p-2 text-[11px]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-gray-700 font-mono w-4 shrink-0 text-center">{i + 1}</span>

              {editingId === kf.id ? (
                <input
                  autoFocus
                  className="flex-1 bg-gray-800 border border-indigo-700 rounded px-1.5 py-0.5 text-gray-200 text-[11px] outline-none"
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  onBlur={() => { updateKf(kf.id, { label: editLabel.trim() || kf.label }); setEditingId(null); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { updateKf(kf.id, { label: editLabel.trim() || kf.label }); setEditingId(null); }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <button
                  className="flex-1 text-left text-gray-300 hover:text-white truncate"
                  title="Click to rename"
                  onClick={() => { setEditingId(kf.id); setEditLabel(kf.label); }}
                >
                  {kf.label}
                </button>
              )}

              <button onClick={() => onGoTo(kf)} title="Fly to this position" className="shrink-0 text-gray-700 hover:text-indigo-400 transition-colors">⟶</button>
              <button onClick={() => move(kf.id, -1)} disabled={i === 0} className="shrink-0 text-gray-700 hover:text-gray-400 disabled:opacity-20 transition-colors">↑</button>
              <button onClick={() => move(kf.id, 1)} disabled={i === keyframes.length - 1} className="shrink-0 text-gray-700 hover:text-gray-400 disabled:opacity-20 transition-colors">↓</button>
              <button onClick={() => onChange(keyframes.filter(k => k.id !== kf.id))} className="shrink-0 text-gray-700 hover:text-red-400 transition-colors">✕</button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-700 text-[10px] font-mono truncate flex-1" title={`pos ${fmtPos(kf.position)} | tgt ${fmtPos(kf.target)}`}>
                {fmtPos(kf.position)}
              </span>
              <select
                value={kf.durationMs}
                onChange={e => updateKf(kf.id, { durationMs: Number(e.target.value) })}
                className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-400 text-[10px] outline-none shrink-0"
              >
                {DURATION_OPTIONS.map(o => <option key={o.ms} value={o.ms}>{o.label}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {keyframes.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-gray-800">
          <div className="text-[10px] text-gray-600 text-center">
            {keyframes.length} shot{keyframes.length > 1 ? 's' : ''} · {totalSec}s
          </div>
          <div className="flex gap-2">
            {isPlaying ? (
              <button onClick={onStop} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-900/60 hover:bg-red-900 border border-red-800 text-red-200 text-xs font-medium transition-colors">
                ⬛ Stop
              </button>
            ) : (
              <button onClick={onPlay} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-900/60 hover:bg-green-900 border border-green-800 text-green-200 text-xs font-medium transition-colors">
                ▶ {playLabel}
              </button>
            )}
            <button onClick={() => onChange([])} title="Clear all" className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-600 hover:text-gray-300 text-xs transition-colors">🗑</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Tab = 'sequence' | 'scene';

interface Props {
  // Global Director sequence
  keyframes: CinemaKeyframe[];
  setKeyframes: (kfs: CinemaKeyframe[]) => void;
  isPlaying: boolean;
  onCapture: () => void;
  onPlay: () => void;
  onStop: () => void;
  onGoTo: (kf: CinemaKeyframe) => void;

  // Per-scene camera path
  currentSceneId: string | null;
  currentSceneName: string | null;
  sceneKeyframes: CinemaKeyframe[];
  isSceneKfPlaying: boolean;
  onSceneCapture: () => void;
  onSceneKfPlay: () => void;
  onSceneKfStop: () => void;
  onSceneKfGoTo: (kf: CinemaKeyframe) => void;
  onSceneKeyframesChange: (kfs: CinemaKeyframe[]) => void;
  onCopyToSequence?: () => void;
}

export default function CameraDirector(props: Props) {
  const {
    keyframes, setKeyframes, isPlaying, onCapture, onPlay, onStop, onGoTo,
    currentSceneId, currentSceneName,
    sceneKeyframes, isSceneKfPlaying,
    onSceneCapture, onSceneKfPlay, onSceneKfStop, onSceneKfGoTo, onSceneKeyframesChange,
    onCopyToSequence,
  } = props;

  const [tab, setTab] = useState<Tab>('sequence');

  return (
    <div className="flex flex-col gap-2">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-0.5 shrink-0">
        <button
          onClick={() => setTab('sequence')}
          className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
            tab === 'sequence' ? 'bg-gray-700 text-gray-200' : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          📹 Sequence
        </button>
        <button
          onClick={() => setTab('scene')}
          className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
            tab === 'scene'
              ? 'bg-gray-700 text-gray-200'
              : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          🎬 Scene cam
          {sceneKeyframes.length > 0 && (
            <span className="ml-1 text-[9px] bg-amber-700 text-amber-200 px-1 rounded-full">{sceneKeyframes.length}</span>
          )}
        </button>
      </div>

      {tab === 'sequence' && (
        <KeyframeList
          keyframes={keyframes}
          isPlaying={isPlaying}
          onCapture={onCapture}
          onPlay={onPlay}
          onStop={onStop}
          onGoTo={onGoTo}
          onChange={setKeyframes}
          emptyHint="Navigate freely, then capture. Build a one-shot sequence."
          playLabel="Play once"
        />
      )}

      {tab === 'scene' && (
        <div className="flex flex-col gap-2">
          {currentSceneId ? (
            <div className="text-[10px] text-amber-500/80 px-0.5">
              Editing camera for: <span className="font-semibold text-amber-400">{currentSceneName}</span>
            </div>
          ) : (
            <div className="text-[10px] text-gray-600 px-0.5">Select a scene to set its camera path.</div>
          )}
          <div className="text-[10px] text-gray-600 leading-snug px-0.5">
            These keyframes loop continuously while the scene plays. Clear them to restore the scene's built-in camera.
          </div>
          {currentSceneId ? (
            <>
              <KeyframeList
                keyframes={sceneKeyframes}
                isPlaying={isSceneKfPlaying}
                onCapture={onSceneCapture}
                onPlay={onSceneKfPlay}
                onStop={onSceneKfStop}
                onGoTo={onSceneKfGoTo}
                onChange={onSceneKeyframesChange}
                emptyHint="No shots yet — the scene uses its built-in camera path."
                playLabel="Preview loop"
              />
              {sceneKeyframes.length > 0 && (
                <>
                  <div className="text-[10px] text-gray-600 text-center">
                    🔁 Loops automatically when scene plays
                  </div>
                  {onCopyToSequence && (
                    <button
                      onClick={onCopyToSequence}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-gray-200 text-[11px] transition-colors"
                    >
                      ↗ Copy path to Sequence
                    </button>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="text-center text-[11px] text-gray-700 py-4">
              Start a scene first.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

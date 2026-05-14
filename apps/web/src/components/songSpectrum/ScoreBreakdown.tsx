import { useState } from 'react';
import type { ScoreAxisDetail } from '@band-spectrum-mapper/shared';

interface Props {
  axis: string;
  detail: ScoreAxisDetail;
}

const AXIS_META: Record<string, { label: string; color: string; description: string }> = {
  aggression:  { label: 'Aggression',  color: '#ef4444', description: 'Intensity, drive, and raw energy' },
  complexity:  { label: 'Complexity',  color: '#f59e0b', description: 'Structural and tonal density' },
  atmosphere:  { label: 'Atmosphere',  color: '#3b82f6', description: 'Immersive, spacious, cinematic quality' },
  emotion:     { label: 'Emotion',     color: '#ec4899', description: 'Dynamic expressiveness and feeling' },
  psychedelic: { label: 'Psychedelic', color: '#8b5cf6', description: 'Disorienting, surreal, or trance-like' },
  concept:     { label: 'Concept',     color: '#10b981', description: 'Narrative depth and compositional ambition' },
};

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 bg-surface-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.round(value * 100)}%`,
            backgroundColor: value > 0.7 ? '#22c55e' : value > 0.4 ? '#f59e0b' : '#ef4444',
          }}
        />
      </div>
      <span className="text-xs text-surface-400 shrink-0 w-8 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

export default function ScoreBreakdown({ axis, detail }: Props) {
  const [open, setOpen] = useState(false);
  const meta = AXIS_META[axis] ?? { label: axis, color: '#6366f1', description: '' };

  const arcAngle = (detail.score / 100) * 251.2; // circumference of r=40 circle

  return (
    <div className="bg-surface-800 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-700 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Mini donut */}
        <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
          <circle cx="26" cy="26" r="20" fill="none" stroke="#1e293b" strokeWidth="6" />
          <circle
            cx="26" cy="26" r="20"
            fill="none"
            stroke={meta.color}
            strokeWidth="6"
            strokeDasharray={`${arcAngle} 251.2`}
            strokeLinecap="round"
            transform="rotate(-90 26 26)"
          />
          <text x="26" y="31" textAnchor="middle" fontSize="12" fontWeight="700" fill="white">
            {detail.score}
          </text>
        </svg>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{meta.label}</span>
            <span className="text-xs text-surface-400">· {meta.description}</span>
          </div>
          <ConfidenceBar value={detail.confidence} />
        </div>

        <span className="text-surface-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-surface-700">
          {/* Explanation */}
          <p className="text-sm text-surface-300 mt-3 mb-3 leading-relaxed">
            {detail.explanation}
          </p>

          {/* Audio features */}
          {detail.audioFeatures.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                Audio Features
              </div>
              <ul className="space-y-1">
                {detail.audioFeatures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-surface-300">
                    <span className="text-surface-600 mt-0.5">→</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Lyrics features */}
          {detail.lyricsFeatures.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-2">
                Lyrical/Context Features
              </div>
              <ul className="space-y-1">
                {detail.lyricsFeatures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-surface-300">
                    <span className="text-surface-600 mt-0.5">→</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

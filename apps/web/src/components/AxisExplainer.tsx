import { SCORE_AXES, AXIS_COLORS, AXIS_LABELS, AXIS_INFO } from '@band-spectrum-mapper/shared';

const AXIS_PLAIN: Record<string, string> = {
  aggression:  'How intense, harsh, or confrontational the music feels — from gentle and calm to abrasive and violent.',
  complexity:  'How intricate or demanding the music is — from simple and accessible to dense, layered, and hard to follow.',
  atmosphere:  'How immersive or cinematic the sound is — from dry and direct to deep, ambient, and enveloping.',
  emotion:     'How emotionally raw or expressive the music feels — from cold and detached to vulnerable and intensely felt.',
  psychedelic: 'How surreal or mind-bending the music is — from concrete and literal to abstract and hallucinatory.',
  concept:     'How philosophical or abstract the ideas are — from personal storytelling to broad conceptual themes.',
};

interface Props {
  theme?: 'light' | 'dark';
  compact?: boolean;
}

export default function AxisExplainer({ theme = 'light', compact = false }: Props) {
  const isDark = theme === 'dark';

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {SCORE_AXES.map((axis) => (
          <span
            key={axis}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
              isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-surface-50 border-surface-200'
            }`}
            style={{ color: AXIS_COLORS[axis] }}
          >
            <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: AXIS_COLORS[axis] }} />
            {AXIS_LABELS[axis]}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {SCORE_AXES.map((axis) => (
        <div
          key={axis}
          className={`rounded-xl border p-5 ${
            isDark
              ? 'bg-gray-900 border-gray-800'
              : 'bg-white border-surface-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: AXIS_COLORS[axis] }} />
            <span className="font-semibold text-sm" style={{ color: AXIS_COLORS[axis] }}>{AXIS_LABELS[axis]}</span>
          </div>
          <p className={`text-xs leading-relaxed mb-3 ${isDark ? 'text-gray-400' : 'text-surface-600'}`}>
            {AXIS_PLAIN[axis]}
          </p>
          <div className={`flex justify-between text-xs ${isDark ? 'text-gray-600' : 'text-surface-400'}`}>
            <span>0 · {AXIS_INFO[axis].lo}</span>
            <span className="text-right">{AXIS_INFO[axis].hi} · 10</span>
          </div>
        </div>
      ))}
    </div>
  );
}

import type { AudioSection } from '@band-spectrum-mapper/shared';

interface Props {
  sections: AudioSection[];
  duration: number;
  className?: string;
}

const SECTION_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#4f46e5',
  '#7c3aed', '#5b21b6', '#818cf8', '#c4b5fd',
];

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SectionTimeline({ sections, duration, className }: Props) {
  if (!sections.length || duration <= 0) return null;

  // Determine if there are any time signatures to display
  const hasSectionTs = sections.some((s) => s.timeSignature);
  const uniqueTs = hasSectionTs
    ? [...new Set(sections.map((s) => s.timeSignature).filter(Boolean))]
    : [];
  const hasChanges = uniqueTs.length > 1;

  return (
    <div className={className}>
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-xs text-surface-400 font-medium uppercase tracking-wider">
          Structure
        </span>
        {hasChanges && (
          <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-700/50 rounded px-1.5 py-0.5">
            ⟳ Meter changes detected
          </span>
        )}
        {hasSectionTs && !hasChanges && uniqueTs[0] && (
          <span className="text-xs text-surface-500">{uniqueTs[0]} throughout</span>
        )}
      </div>

      {/* Bar */}
      <div className="relative rounded overflow-hidden flex" style={{ height: hasSectionTs ? '52px' : '32px' }}>
        {sections.map((sec, i) => {
          const pct = ((sec.end - sec.start) / duration) * 100;
          const color = SECTION_COLORS[i % SECTION_COLORS.length]!;
          // Mark sections whose time sig differs from the most common one
          const prevTs = sections[i - 1]?.timeSignature;
          const tsChanged = i > 0 && sec.timeSignature && prevTs && sec.timeSignature !== prevTs;
          return (
            <div
              key={i}
              className="relative flex flex-col items-center justify-center text-white overflow-hidden group cursor-default select-none"
              style={{
                width: `${pct}%`,
                backgroundColor: color,
                minWidth: '1%',
              }}
              title={[
                `${sec.label}: ${formatTime(sec.start)} – ${formatTime(sec.end)}`,
                sec.timeSignature ? `Time: ${sec.timeSignature}` : '',
              ].filter(Boolean).join('\n')}
            >
              {/* Meter-change marker at the left edge */}
              {tsChanged && (
                <span
                  className="absolute left-0 top-0 bottom-0 w-0.5 bg-white/70"
                  title={`Meter changes to ${sec.timeSignature}`}
                />
              )}
              <span className="text-xs font-bold leading-none">{sec.label}</span>
              {sec.timeSignature && (
                <span className="text-[9px] leading-none opacity-80 mt-0.5">
                  {sec.timeSignature}
                </span>
              )}
              {/* section divider */}
              {i < sections.length - 1 && (
                <span className="absolute right-0 top-0 bottom-0 w-px bg-black/20" />
              )}
            </div>
          );
        })}
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-xs text-surface-500 mt-1">
        <span>0:00</span>
        {duration > 120 && <span>{formatTime(duration / 2)}</span>}
        <span>{formatTime(duration)}</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {sections.map((sec, i) => (
          <span key={i} className="flex items-center gap-1 text-xs text-surface-400">
            <span
              className="w-2 h-2 rounded-sm inline-block shrink-0"
              style={{ backgroundColor: SECTION_COLORS[i % SECTION_COLORS.length] }}
            />
            {sec.label} ({formatTime(sec.start)}–{formatTime(sec.end)})
            {sec.timeSignature && (
              <span className="text-surface-600 font-mono">{sec.timeSignature}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

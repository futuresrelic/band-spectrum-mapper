interface Section {
  start: number;
  end: number;
  label: string;
}

interface Props {
  sections: Section[];
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

  return (
    <div className={className}>
      <div className="text-xs text-surface-400 mb-1.5 font-medium uppercase tracking-wider">
        Structure
      </div>

      {/* Bar */}
      <div className="relative h-8 rounded overflow-hidden flex">
        {sections.map((sec, i) => {
          const pct = ((sec.end - sec.start) / duration) * 100;
          return (
            <div
              key={i}
              className="relative flex items-center justify-center text-xs font-bold text-white overflow-hidden group cursor-default"
              style={{
                width: `${pct}%`,
                backgroundColor: SECTION_COLORS[i % SECTION_COLORS.length],
                minWidth: '1%',
              }}
              title={`${sec.label}: ${formatTime(sec.start)} – ${formatTime(sec.end)}`}
            >
              <span className="select-none">{sec.label}</span>
              {/* divider */}
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
              className="w-2 h-2 rounded-sm inline-block"
              style={{ backgroundColor: SECTION_COLORS[i % SECTION_COLORS.length] }}
            />
            {sec.label} ({formatTime(sec.start)}–{formatTime(sec.end)})
          </span>
        ))}
      </div>
    </div>
  );
}

import { AXIS_COLORS, AXIS_LABELS } from '@band-spectrum-mapper/shared';
import type { ScoreAxis } from '@band-spectrum-mapper/shared';

type Size = 'sm' | 'md' | 'lg';

const dotSize: Record<Size, number> = { sm: 6, md: 8, lg: 10 };
const textSize: Record<Size, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

export function AxisTag({ axis, size = 'sm' }: { axis: ScoreAxis; size?: Size }) {
  const color = AXIS_COLORS[axis];
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${textSize[size]}`}>
      <span
        className="rounded-full flex-shrink-0"
        style={{ backgroundColor: color, width: dotSize[size], height: dotSize[size] }}
      />
      <span style={{ color }}>{AXIS_LABELS[axis]}</span>
    </span>
  );
}

export function AxisDot({ axis, size = 'sm' }: { axis: ScoreAxis; size?: Size }) {
  const color = AXIS_COLORS[axis];
  return (
    <span
      className="rounded-full inline-block flex-shrink-0"
      style={{ backgroundColor: color, width: dotSize[size], height: dotSize[size] }}
    />
  );
}

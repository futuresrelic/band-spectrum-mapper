import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';
import type { AxisScoreMap } from '@band-spectrum-mapper/shared';

interface DataSet {
  label: string;
  scores: AxisScoreMap;
  color: string;
}

interface Props {
  datasets: DataSet[];
  /** Dark-theme styling for grid/ticks/tooltip — for use on dark-background pages (e.g. the Song Card). Defaults to light-theme (existing behavior). */
  dark?: boolean;
  /** Near-zero fill so the shape reads as an outline, not a solid blob — prevents the readability problem filled radar charts caused previously. Defaults to the existing light fill. */
  outline?: boolean;
  height?: number;
}

const AXIS_LABELS: Record<string, string> = {
  aggression: 'Aggression',
  complexity: 'Complexity',
  atmosphere: 'Atmosphere',
  emotion: 'Emotion',
  psychedelic: 'Psychedelic',
  concept: 'Concept',
};

export default function RadarChart({ datasets, dark = false, outline = false, height = 340 }: Props) {
  const data = SCORE_AXES.map((axis) => ({
    axis: AXIS_LABELS[axis] ?? axis,
    ...Object.fromEntries(datasets.map((d) => [d.label, d.scores[axis]])),
  }));

  const gridStroke = dark ? '#1f2937' : '#e5e7eb';
  const tickFill = dark ? '#9ca3af' : '#374151';
  const fillOpacity = outline ? 0.06 : 0.15;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke={gridStroke} />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12, fill: tickFill }} />
        <Tooltip
          formatter={(value) => [(value as number).toFixed(1), '']}
          contentStyle={dark ? { background: '#0b0f16', border: '1px solid #1a2332', color: '#e5e7eb' } : undefined}
        />
        {datasets.map((d) => (
          <Radar
            key={d.label}
            name={d.label}
            dataKey={d.label}
            stroke={d.color}
            strokeWidth={outline ? 2 : 1}
            fill={d.color}
            fillOpacity={fillOpacity}
          />
        ))}
        {datasets.length > 1 && <Legend wrapperStyle={dark ? { color: tickFill } : undefined} />}
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}

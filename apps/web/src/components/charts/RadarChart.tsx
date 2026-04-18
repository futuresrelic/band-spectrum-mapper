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
}

const AXIS_LABELS: Record<string, string> = {
  aggression: 'Aggression',
  complexity: 'Complexity',
  atmosphere: 'Atmosphere',
  emotion: 'Emotion',
  psychedelic: 'Psychedelic',
  concept: 'Concept',
};

export default function RadarChart({ datasets }: Props) {
  const data = SCORE_AXES.map((axis) => ({
    axis: AXIS_LABELS[axis] ?? axis,
    ...Object.fromEntries(datasets.map((d) => [d.label, d.scores[axis]])),
  }));

  return (
    <ResponsiveContainer width="100%" height={340}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value) => [(value as number).toFixed(1), '']} />
        {datasets.map((d) => (
          <Radar
            key={d.label}
            name={d.label}
            dataKey={d.label}
            stroke={d.color}
            fill={d.color}
            fillOpacity={0.15}
          />
        ))}
        {datasets.length > 1 && <Legend />}
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}

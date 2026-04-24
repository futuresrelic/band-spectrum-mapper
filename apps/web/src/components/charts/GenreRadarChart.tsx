import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { GENRE_PERSPECTIVES } from '@band-spectrum-mapper/shared';
import type { GenreScoreMap } from '@band-spectrum-mapper/shared';

interface DataSet {
  label: string;
  scores: GenreScoreMap;
  color: string;
}

interface Props {
  datasets: DataSet[];
}

export default function GenreRadarChart({ datasets }: Props) {
  const data = GENRE_PERSPECTIVES.map((p) => ({
    axis: p.label,
    ...Object.fromEntries(datasets.map((d) => [d.label, d.scores[p.id]])),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
        <PolarGrid />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value) => [(value as number).toFixed(1), '']} />
        {datasets.map((d) => (
          <Radar
            key={d.label}
            name={d.label}
            dataKey={d.label}
            stroke={d.color}
            fill={d.color}
            fillOpacity={0.15}
            dot={{ r: 3, fill: d.color }}
          />
        ))}
        {datasets.length > 1 && <Legend />}
      </RechartsRadarChart>
    </ResponsiveContainer>
  );
}

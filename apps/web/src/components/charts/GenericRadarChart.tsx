import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

interface Axis {
  key: string;
  label: string;
}

interface DataSet {
  label: string;
  scores: Record<string, number>;
  color: string;
}

interface Props {
  axes: Axis[];
  datasets: DataSet[];
}

export default function GenericRadarChart({ axes, datasets }: Props) {
  const data = axes.map(({ key, label }) => ({
    axis: label,
    ...Object.fromEntries(datasets.map((d) => [d.label, d.scores[key] ?? 0])),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
        <PolarGrid />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10 }} />
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

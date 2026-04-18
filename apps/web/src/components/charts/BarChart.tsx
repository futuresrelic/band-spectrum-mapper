import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';
import type { AxisScoreMap } from '@band-spectrum-mapper/shared';

interface Props {
  scores: AxisScoreMap;
  color?: string;
}

const COLORS = ['#374151', '#6b7280', '#9ca3af', '#374151', '#6b7280', '#9ca3af'];

export default function BarChart({ scores, color }: Props) {
  const data = SCORE_AXES.map((axis, i) => ({
    axis: axis.charAt(0).toUpperCase() + axis.slice(1),
    value: scores[axis],
    fill: color ?? COLORS[i % COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsBarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="axis" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [(v as number).toFixed(1), 'Score']} />
        <Bar dataKey="value">
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

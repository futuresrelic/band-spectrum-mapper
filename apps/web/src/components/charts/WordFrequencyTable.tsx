import type { WordFrequency } from '@band-spectrum-mapper/shared';

interface Props {
  words: WordFrequency[];
  title?: string;
}

export default function WordFrequencyTable({ words, title }: Props) {
  if (words.length === 0) {
    return <p className="text-surface-700 text-sm">No word data available.</p>;
  }

  return (
    <div>
      {title && <h3 className="mb-3">{title}</h3>}
      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 text-left">
              <th className="pb-2 pr-4 font-medium text-surface-700">#</th>
              <th className="pb-2 pr-4 font-medium text-surface-700">Word</th>
              <th className="pb-2 pr-4 font-medium text-surface-700">Count</th>
              <th className="pb-2 font-medium text-surface-700">%</th>
            </tr>
          </thead>
          <tbody>
            {words.map((w, i) => (
              <tr key={w.word} className="border-b border-surface-100">
                <td className="py-1.5 pr-4 text-surface-700">{i + 1}</td>
                <td className="py-1.5 pr-4 font-mono">{w.word}</td>
                <td className="py-1.5 pr-4">{w.count}</td>
                <td className="py-1.5 text-surface-700">{w.percentage.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

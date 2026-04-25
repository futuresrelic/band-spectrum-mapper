import type { WordCloudEntry } from '@band-spectrum-mapper/shared';

interface Props {
  data: WordCloudEntry[];
  height?: number;
  onWordClick?: (word: string) => void;
  reversed?: boolean;
}

export default function WordCloudChart({ data, height = 240, onWordClick, reversed }: Props) {
  if (data.length === 0) {
    return <p className="text-surface-700 text-sm">No words to display.</p>;
  }

  const displayed = reversed ? [...data].reverse() : data;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;

  const sized = displayed.map((d) => ({
    ...d,
    // In reversed mode the rarest word should still read at a reasonable size
    size: reversed
      ? 28 - Math.round(((d.value - min) / range) * 16)   // 28→12 rare→common
      : 12 + Math.round(((d.value - min) / range) * 28),  // 12→40 rare→common
    opacity: reversed
      ? 0.95 - ((d.value - min) / range) * 0.45
      : 0.5 + ((d.value - min) / range) * 0.5,
  }));

  return (
    <div
      className="flex flex-wrap gap-2 items-center content-center p-4 bg-white rounded border border-surface-200"
      style={{ minHeight: height }}
    >
      {sized.map((w) => (
        <span
          key={w.text}
          className={`font-mono text-surface-900 select-none ${onWordClick ? 'cursor-pointer hover:text-indigo-600 hover:underline transition-colors' : ''}`}
          style={{ fontSize: w.size, opacity: w.opacity }}
          title={`${w.text}: ${w.value} occurrence${w.value !== 1 ? 's' : ''} — click to see songs`}
          onClick={() => onWordClick?.(w.text)}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}

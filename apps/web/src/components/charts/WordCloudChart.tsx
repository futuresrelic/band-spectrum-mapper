import type { WordCloudEntry } from '@band-spectrum-mapper/shared';

interface Props {
  data: WordCloudEntry[];
  height?: number;
}

// Lightweight word cloud using variable font sizes.
// react-wordcloud requires canvas which may have SSR issues;
// this implementation is a clean fallback that works everywhere.
export default function WordCloudChart({ data, height = 240 }: Props) {
  if (data.length === 0) {
    return <p className="text-surface-700 text-sm">No words to display.</p>;
  }

  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;

  const sized = data.map((d) => ({
    ...d,
    size: 12 + Math.round(((d.value - min) / range) * 28),
    opacity: 0.5 + ((d.value - min) / range) * 0.5,
  }));

  return (
    <div
      className="flex flex-wrap gap-2 items-center content-center p-4 bg-white rounded border border-surface-200"
      style={{ minHeight: height }}
    >
      {sized.map((w) => (
        <span
          key={w.text}
          className="font-mono text-surface-900 select-none"
          style={{ fontSize: w.size, opacity: w.opacity }}
          title={`${w.text}: ${w.value}`}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}

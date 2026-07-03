// Shared loading indicator for dark-theme list/card contexts (Leaderboard,
// Games, Collection, etc). Replaces plain "Loading…" text with a small
// spinner so waiting states read the same everywhere in the app.

interface Props {
  label?: string;
  className?: string;
}

export default function DarkLoadingRow({ label = 'Loading…', className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2.5 py-10 ${className}`}>
      <span
        aria-hidden
        className="w-5 h-5 rounded-full border-2 border-gray-700 border-t-indigo-400 animate-spin motion-reduce:animate-none motion-reduce:border-t-gray-700"
      />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}

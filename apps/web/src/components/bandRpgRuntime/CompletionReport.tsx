import { useNavigate } from 'react-router-dom';
import type { AdventureProgress, Adventure } from '../../api/adventureApi';

interface Props {
  adventure: Adventure;
  progress: AdventureProgress;
  onDismiss?: () => void;
  onReplay?: () => void;
}

export default function CompletionReport({ adventure, progress, onDismiss, onReplay }: Props) {
  const navigate = useNavigate();

  const levelCount = adventure._count?.levels ?? 0;
  const questCount = adventure._count?.quests ?? 0;

  const durationMs = progress.completedAt
    ? new Date(progress.completedAt).getTime() - new Date(progress.startedAt).getTime()
    : null;
  const durationMin = durationMs !== null ? Math.round(durationMs / 60_000) : null;

  // If the adventure is marked complete but completionPct is 0, it's a data inconsistency —
  // recalculate from the fields we do have rather than showing a misleading 0%.
  const rawPct = progress.completionPct;
  const recalcPct =
    (levelCount > 0 ? ((progress.levelsDiscovered?.length ?? 0) / levelCount) * 50 : 0) +
    (questCount > 0 ? (progress.questsCompleted / questCount) * 50 : 0);
  const displayPct = progress.isCompleted && rawPct === 0 && recalcPct > 0
    ? Math.round(recalcPct)
    : Math.round(rawPct);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border border-indigo-500/40 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-4 text-center">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-2xl font-bold text-indigo-200 mb-1">Adventure Complete!</h1>
          <p className="text-indigo-400 text-sm">{adventure.name}</p>
        </div>

        {/* Stats grid */}
        <div className="mx-8 mb-6 grid grid-cols-2 gap-3">
          <StatCard label="Completion" value={`${displayPct}%`} />
          <StatCard label="Quests Done" value={`${progress.questsCompleted} / ${questCount}`} />
          <StatCard label="Levels Found" value={`${progress.levelsDiscovered.length} / ${levelCount}`} />
          <StatCard label="Items Collected" value={String(progress.itemsCollected)} />
          {durationMin !== null && (
            <StatCard label="Play Time" value={`${durationMin} min`} className="col-span-2" />
          )}
        </div>

        {/* Progress bar */}
        <div className="mx-8 mb-8">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-1000"
              style={{ width: `${displayPct}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 pb-8 flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/play/band-rpg/adventures')}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Adventure Hub
            </button>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="flex-1 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 text-white/70 text-sm font-medium transition-colors"
              >
                Keep Exploring
              </button>
            )}
          </div>
          {onReplay && (
            <button
              onClick={onReplay}
              className="w-full py-2 rounded-xl border border-indigo-500/30 hover:bg-indigo-500/10 text-indigo-400 text-xs font-medium transition-colors"
            >
              ↺ Replay Adventure
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl bg-white/5 border border-white/10 p-3 text-center ${className}`}>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-indigo-300 mt-0.5">{label}</div>
    </div>
  );
}

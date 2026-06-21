import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { adventureProgressApi } from '../api/adventureApi';

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

export default function BandRpgAdventureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [restarting, setRestarting] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['adventure-detail', id],
    queryFn: () => adventureProgressApi.get(id!),
    enabled: !!id && !!user,
    staleTime: 30_000,
  });

  const restartMut = useMutation({
    mutationFn: () => adventureProgressApi.restart(id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['adventure-detail', id] });
      void qc.invalidateQueries({ queryKey: ['adventures-my'] });
      void qc.invalidateQueries({ queryKey: ['adventures-browse'] });
      setRestarting(false);
    },
  });

  const adventure = data?.adventure;
  const progress = data?.progress;

  const firstLevelSlug = data?.firstLevelSlug ?? null;
  const hasProgress = progress && (progress.questsCompleted + progress.levelsDiscovered.length + progress.itemsCollected) > 0;
  const isCompleted = progress?.isCompleted ?? false;
  const pct = progress?.completionPct ?? 0;

  function getGameUrl(levelSlug: string) {
    return `/play/band-rpg/game/${encodeURIComponent(levelSlug)}?adventureId=${encodeURIComponent(id!)}`;
  }

  function handleStart() {
    if (!firstLevelSlug) {
      alert('This adventure has no levels yet.');
      return;
    }
    navigate(getGameUrl(firstLevelSlug));
  }

  function handleContinue() {
    // Use firstLevelSlug as fallback — the global save will keep the player at the right level
    if (!firstLevelSlug) { handleStart(); return; }
    navigate(getGameUrl(firstLevelSlug));
  }

  if (!user) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Please log in to access adventures.
        </div>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 animate-pulse">Loading adventure…</p>
        </div>
      </Shell>
    );
  }

  if (isError || !adventure) {
    return (
      <Shell>
        <div className="flex-1 flex items-center justify-center flex-col gap-4">
          <p className="text-red-400">Adventure not found.</p>
          <button onClick={() => navigate('/play/band-rpg/adventures')} className="text-indigo-400 hover:text-indigo-300 text-sm">
            ← Back to Hub
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

          {/* Cover */}
          {adventure.coverImageUrl ? (
            <div className="rounded-2xl overflow-hidden h-48">
              <img src={adventure.coverImageUrl} alt={adventure.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="rounded-2xl h-48 flex items-center justify-center bg-gradient-to-br from-indigo-950 to-gray-900 border border-gray-800">
              <span className="text-6xl opacity-20">🗺️</span>
            </div>
          )}

          {/* Meta */}
          <div>
            <div className="flex items-start gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white flex-1">{adventure.name}</h1>
              {adventure.difficulty && (
                <span className="mt-1 text-xs px-2.5 py-1 rounded-full bg-indigo-900/60 text-indigo-300 shrink-0">
                  {DIFFICULTY_LABELS[adventure.difficulty] ?? adventure.difficulty}
                </span>
              )}
            </div>
            {adventure.authorName && (
              <p className="text-gray-500 text-sm mb-2">by {adventure.authorName}</p>
            )}
            {adventure.description && (
              <p className="text-gray-300 text-sm leading-relaxed">{adventure.description}</p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Levels" value={String(adventure._count?.levels ?? 0)} />
            <StatCard label="Quests" value={String(adventure._count?.quests ?? 0)} />
            {adventure.estimatedPlaytime
              ? <StatCard label="Est. Time" value={`${adventure.estimatedPlaytime}min`} />
              : <StatCard label="Items" value={String(adventure._count?.items ?? 0)} />}
          </div>

          {/* Tags */}
          {adventure.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {adventure.tags.map(tag => (
                <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-400">{tag}</span>
              ))}
            </div>
          )}

          {/* Progress */}
          {progress && hasProgress && (
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className={`font-medium ${isCompleted ? 'text-emerald-400' : 'text-indigo-400'}`}>
                  {isCompleted ? '✓ Completed' : 'In Progress'}
                </span>
                <span className="text-gray-400">{Math.round(pct)}% complete</span>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>📜 {progress.questsCompleted} quests done</span>
                <span>📍 {progress.levelsDiscovered.length} levels found</span>
                <span>🎒 {progress.itemsCollected} items</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {!hasProgress && (
              <button
                onClick={handleStart}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
              >
                Start Adventure
              </button>
            )}
            {hasProgress && !isCompleted && (
              <button
                onClick={handleContinue}
                className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
              >
                Continue Adventure
              </button>
            )}
            {hasProgress && isCompleted && (
              <button
                onClick={handleContinue}
                className="flex-1 py-3 rounded-xl border border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 font-semibold text-sm transition-colors"
              >
                Revisit Adventure
              </button>
            )}
            {hasProgress && !restarting && (
              <button
                onClick={() => setRestarting(true)}
                className="px-4 py-3 rounded-xl border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-800 text-sm transition-colors"
              >
                Restart
              </button>
            )}
            {restarting && (
              <div className="flex-1 rounded-xl bg-red-950 border border-red-800 p-4">
                <p className="text-red-300 text-sm mb-3">Reset all progress for this adventure?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => restartMut.mutate()}
                    disabled={restartMut.isPending}
                    className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {restartMut.isPending ? 'Resetting…' : 'Yes, reset'}
                  </button>
                  <button
                    onClick={() => setRestarting(false)}
                    className="text-xs border border-gray-600 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Admin shortcuts */}
          {(user?.isAdmin ?? false) && (
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 space-y-2">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-widest">Admin Shortcuts</div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/admin/game"
                  className="text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Manage in Admin →
                </a>
                {firstLevelSlug && (
                  <button
                    onClick={handleStart}
                    className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Play First Level →
                  </button>
                )}
                <button
                  onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/play/band-rpg/adventures`)}
                  className="text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Copy Player Link
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </Shell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 text-center">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />
      <div className="flex items-center gap-3 px-4 py-3 bg-black/50 border-b border-gray-800 shrink-0">
        <button onClick={() => navigate('/play/band-rpg/adventures')} className="text-gray-500 hover:text-gray-300 text-sm">←</button>
        <span className="text-white text-sm font-medium">Adventure Detail</span>
        {user && <span className="text-emerald-400 text-xs ml-auto">● {user.username ?? user.name ?? 'Player'}</span>}
      </div>
      {children}
    </div>
  );
}

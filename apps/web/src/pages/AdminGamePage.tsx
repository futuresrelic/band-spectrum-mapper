import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type GameLeaderboardEntry } from '../api/admin';
import PageHeader from '../components/layout/PageHeader';

export default function AdminGamePage() {
  const queryClient = useQueryClient();

  const { data: scores = [], isLoading, error } = useQuery({
    queryKey: ['admin-game-leaderboard'],
    queryFn: () => adminApi.getGameLeaderboard(),
  });

  const deleteMutation = useMutation({
    mutationFn: (scoreId: string) => adminApi.deleteGameScore(scoreId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-game-leaderboard'] });
    },
  });

  const totalGames = scores.length;
  const highScore = scores.length > 0 ? Math.max(...scores.map((s) => s.score)) : 0;
  const playerCounts = scores.reduce<Record<string, number>>((acc, s) => {
    acc[s.userId] = (acc[s.userId] ?? 0) + 1;
    return acc;
  }, {});
  const topPlayerId = Object.entries(playerCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
  const topPlayer = scores.find((s) => s.userId === topPlayerId)?.user;

  return (
    <div>
      <PageHeader
        title="Album Art Quiz — Admin"
        subtitle="Leaderboard management and game statistics"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-2xl font-bold text-indigo-600">{totalGames}</div>
          <div className="text-xs text-surface-500 mt-1">Games played</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-green-600">{highScore.toLocaleString()}</div>
          <div className="text-xs text-surface-500 mt-1">Highest score</div>
        </div>
        <div className="card text-center">
          <div className="text-sm font-bold text-surface-700 truncate">
            {topPlayer?.name ?? topPlayer?.email ?? '—'}
          </div>
          <div className="text-xs text-surface-500 mt-1">Most active player</div>
        </div>
      </div>

      {/* Leaderboard table */}
      {isLoading && <div className="card text-center py-8 text-surface-500">Loading…</div>}
      {error && <div className="card text-red-600 text-sm p-4">Failed to load leaderboard.</div>}

      {!isLoading && scores.length === 0 && (
        <div className="card text-center py-12 text-surface-500 text-sm">
          No game scores yet. Scores appear here once users play the Album Art Quiz at{' '}
          <code className="text-xs bg-surface-100 px-1 rounded">/play</code>.
        </div>
      )}

      {scores.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr className="text-left">
                  <th className="py-3 px-4 font-medium text-surface-600">#</th>
                  <th className="py-3 px-4 font-medium text-surface-600">Player</th>
                  <th className="py-3 px-4 font-medium text-surface-600 text-right">Score</th>
                  <th className="py-3 px-4 font-medium text-surface-600 text-right">Level</th>
                  <th className="py-3 px-4 font-medium text-surface-600 text-right">Duration</th>
                  <th className="py-3 px-4 font-medium text-surface-600">Date</th>
                  <th className="py-3 px-4 font-medium text-surface-600"></th>
                </tr>
              </thead>
              <tbody>
                {scores.map((entry: GameLeaderboardEntry, i: number) => (
                  <tr key={entry.id} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="py-2 px-4 text-surface-400 tabular-nums">{i + 1}</td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        {entry.user.avatarUrl ? (
                          <img src={entry.user.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-surface-200 flex items-center justify-center text-xs text-surface-500">
                            {(entry.user.name ?? entry.user.email)[0]?.toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-surface-800">{entry.user.name ?? 'Unknown'}</div>
                          <div className="text-xs text-surface-400 truncate max-w-[180px]">{entry.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-indigo-600 tabular-nums">
                      {entry.score.toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-right text-surface-500 tabular-nums">{entry.level}</td>
                    <td className="py-2 px-4 text-right text-surface-500 tabular-nums">
                      {entry.duration >= 60
                        ? `${Math.floor(entry.duration / 60)}m ${entry.duration % 60}s`
                        : `${entry.duration}s`}
                    </td>
                    <td className="py-2 px-4 text-surface-400 text-xs whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this score?')) {
                            deleteMutation.mutate(entry.id);
                          }
                        }}
                        disabled={deleteMutation.isPending && deleteMutation.variables === entry.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

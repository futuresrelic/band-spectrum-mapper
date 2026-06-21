import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bandRpgApi } from '../../api/bandRpg';
import { bandsApi } from '../../api/bands';

export default function LeaderboardTab() {
  const [bandId, setBandId] = useState('');

  const { data: bands = [] } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
    staleTime: 5 * 60_000,
  });

  const { data: scores = [], isLoading } = useQuery({
    queryKey: ['band-rpg-scores-admin', bandId],
    queryFn: () => bandRpgApi.getLeaderboard(50, bandId || undefined),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <div className="flex items-center gap-4 mb-5">
          <h2 className="font-semibold text-surface-900 flex-1">Band RPG Scores</h2>
          <select
            className="border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none min-w-40"
            value={bandId}
            onChange={e => setBandId(e.target.value)}
          >
            <option value="">All bands</option>
            {bands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {isLoading && <p className="text-sm text-surface-400 py-4 text-center">Loading scores…</p>}

        {!isLoading && scores.length === 0 && (
          <p className="text-sm text-surface-400 py-4 text-center">No scores yet.</p>
        )}

        {scores.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-2 text-xs font-semibold text-surface-500 w-8">#</th>
                <th className="text-left py-2 text-xs font-semibold text-surface-500">Player</th>
                <th className="text-right py-2 text-xs font-semibold text-surface-500">Score</th>
                <th className="text-right py-2 text-xs font-semibold text-surface-500">Quests</th>
                <th className="text-right py-2 text-xs font-semibold text-surface-500">Items</th>
                <th className="text-left py-2 text-xs font-semibold text-surface-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((s, idx) => (
                <tr key={`${idx}-${s.playerName}`} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                  <td className="py-2 text-surface-400 text-xs">{s.rank}</td>
                  <td className="py-2 font-medium text-surface-900">{s.playerName || '—'}</td>
                  <td className="py-2 text-right font-mono font-semibold text-indigo-600">{s.score.toLocaleString()}</td>
                  <td className="py-2 text-right text-surface-600">{s.questsCompleted}</td>
                  <td className="py-2 text-right text-surface-600">{s.itemsCollected}</td>
                  <td className="py-2 text-xs text-surface-400">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

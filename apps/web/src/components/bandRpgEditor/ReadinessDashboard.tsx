import { useQuery } from '@tanstack/react-query';
import { readinessApi } from '../../api/adventureApi';

export default function ReadinessDashboard() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['band-rpg-readiness'],
    queryFn: () => readinessApi.get(),
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="text-surface-500 text-sm animate-pulse">Loading readiness report…</div>;
  }

  if (!data) return null;

  const { summary, readinessChecks, adventureHealth, issues } = data;
  const pct = summary.readinessPct;
  const pctColour = pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-surface-900">v1.0 Readiness Dashboard</h2>
        <button onClick={() => void refetch()} className="text-xs border border-surface-300 px-3 py-1.5 rounded-lg hover:bg-surface-50">
          ↻ Refresh
        </button>
      </div>

      {/* Readiness score */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={`text-5xl font-bold ${pctColour}`}>{pct}%</div>
            <div className="text-xs text-surface-500 mt-1">Ready</div>
          </div>
          <div className="flex-1">
            <div className="h-3 rounded-full bg-surface-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-surface-500 mt-2">
              {pct >= 80 ? 'Engine is ready for real players.' : pct >= 50 ? 'Good progress — address outstanding items before launch.' : 'More content needed before launch.'}
            </p>
          </div>
        </div>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">⚠ Outstanding Issues</h3>
          <ul className="space-y-1">
            {issues.map((issue, i) => (
              <li key={i} className="text-sm text-amber-700">• {issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Readiness checklist */}
      <div className="rounded-xl border border-surface-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-surface-800 mb-4">Launch Checklist</h3>
        <div className="space-y-2">
          {readinessChecks.map((check, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className={check.passed ? 'text-emerald-500' : 'text-surface-300'}>
                {check.passed ? '✓' : '○'}
              </span>
              <span className={check.passed ? 'text-surface-800' : 'text-surface-500'}>{check.item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Adventures" value={String(summary.adventures.total)} sub={`${summary.adventures.published} published · ${summary.adventures.featured} featured`} />
        <StatCard label="Levels" value={String(summary.levels.total)} sub={`${summary.levels.published} published`} />
        <StatCard label="Quests" value={String(summary.quests.total)} />
        <StatCard label="NPCs" value={String(summary.npcs.total)} />
        <StatCard label="Items" value={String(summary.items.total)} />
        <StatCard label="Players" value={String(summary.players.total)} sub={`${summary.players.progressRecords} progress records`} />
        <StatCard label="Avg Health" value={`${summary.averageHealthScore}/100`} colour={summary.averageHealthScore >= 70 ? 'emerald' : summary.averageHealthScore >= 50 ? 'amber' : 'red'} />
      </div>

      {/* Per-adventure health */}
      {adventureHealth.length > 0 && (
        <div className="rounded-xl border border-surface-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Adventure Health Scores</h3>
          <div className="space-y-3">
            {adventureHealth.map(adv => {
              const c = adv.score >= 70 ? 'emerald' : adv.score >= 50 ? 'amber' : 'red';
              return (
                <div key={adv.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-surface-800 font-medium">{adv.name}</span>
                    <span className={`text-sm font-bold text-${c}-600`}>{adv.score}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-${c}-500`}
                      style={{ width: `${adv.score}%` }}
                    />
                  </div>
                  {adv.score < 100 && (
                    <div className="flex flex-wrap gap-x-3 mt-1">
                      {adv.checks.filter(c => !c.passed).map(ch => (
                        <span key={ch.name} className="text-xs text-surface-400">✗ {ch.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, colour = '' }: { label: string; value: string; sub?: string; colour?: string }) {
  const col = colour === 'emerald' ? 'text-emerald-600' : colour === 'amber' ? 'text-amber-600' : colour === 'red' ? 'text-red-600' : 'text-surface-900';
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4">
      <div className={`text-2xl font-bold ${col}`}>{value}</div>
      <div className="text-xs font-medium text-surface-600 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-surface-400 mt-0.5">{sub}</div>}
    </div>
  );
}

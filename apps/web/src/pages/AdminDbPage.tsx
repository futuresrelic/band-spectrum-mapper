import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import type { MigrationResult } from '../api/admin';
import PageHeader from '../components/layout/PageHeader';

function StatusDot({ applied }: { applied: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${
        applied ? 'bg-green-500' : 'bg-amber-400'
      }`}
    />
  );
}

function ResultBadge({ status }: { status: MigrationResult['status'] }) {
  if (status === 'applied')
    return <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">Applied</span>;
  if (status === 'already_applied')
    return <span className="text-xs font-medium text-surface-500 bg-surface-100 px-2 py-0.5 rounded">Already applied</span>;
  return <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded">Error</span>;
}

export default function AdminDbPage() {
  const qc = useQueryClient();

  const { data: migrations, isLoading, error } = useQuery({
    queryKey: ['admin-db-status'],
    queryFn: () => adminApi.getDbStatus(),
  });

  const migrate = useMutation({
    mutationFn: () => adminApi.runDbMigrate(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-db-status'] }),
  });

  const pending = migrations?.filter((m) => !m.applied) ?? [];
  const allApplied = migrations?.every((m) => m.applied) ?? false;

  return (
    <div>
      <PageHeader
        title="Database Migrations"
        subtitle="Apply schema changes that require a database update"
      />

      <div className="max-w-2xl space-y-6">
        <div className="card">
          <h2 className="font-semibold mb-1 text-surface-900">What this does</h2>
          <p className="text-sm text-surface-600 leading-relaxed">
            Some features require new columns or values to be added to the production
            database. This page applies those changes safely — nothing is deleted or
            modified, only missing pieces are added. It is safe to run multiple times.
          </p>
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-surface-900">Pending schema changes</h2>

          {isLoading && <p className="text-sm text-surface-500">Checking database…</p>}
          {error && (
            <p className="text-sm text-red-600">
              Could not check status: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          )}

          {migrations && (
            <ul className="space-y-2">
              {migrations.map((m) => (
                <li key={m.key} className="flex items-start gap-3 text-sm">
                  <StatusDot applied={m.applied} />
                  <div>
                    <span className={m.applied ? 'text-surface-500 line-through' : 'text-surface-900'}>
                      {m.description}
                    </span>
                    {m.applied && (
                      <span className="ml-2 text-xs text-green-600 font-medium no-underline" style={{ textDecoration: 'none' }}>✓ done</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {allApplied && !migrate.data && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              All schema changes are already applied. Nothing to do.
            </p>
          )}

          {!allApplied && !migrate.isPending && (
            <button
              className="btn-primary mt-2"
              onClick={() => migrate.mutate()}
              disabled={isLoading}
            >
              Apply {pending.length} pending change{pending.length !== 1 ? 's' : ''}
            </button>
          )}

          {migrate.isPending && (
            <p className="text-sm text-surface-500">Applying changes…</p>
          )}
        </div>

        {migrate.data && (
          <div className="card space-y-3">
            <h2 className="font-semibold text-surface-900">Results</h2>
            <ul className="space-y-2">
              {migrate.data.results.map((r) => (
                <li key={r.key} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <ResultBadge status={r.status} />
                    <span className="text-surface-700">{r.description}</span>
                  </div>
                  {r.error && (
                    <p className="text-xs text-red-600 pl-2 border-l-2 border-red-300 ml-1">
                      {r.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {migrate.data.results.every((r) => r.status !== 'error') && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                Done. All changes applied successfully. Album art and AI lyrics recall should now work.
              </p>
            )}
          </div>
        )}

        {migrate.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            Migration failed: {migrate.error instanceof Error ? migrate.error.message : 'Unknown error'}
          </p>
        )}
      </div>
    </div>
  );
}

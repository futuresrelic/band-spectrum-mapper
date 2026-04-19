import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/layout/PageHeader';
import SignInPrompt from '../components/auth/SignInPrompt';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';
import type { AdminUser } from '@band-spectrum-mapper/shared';

function StatusBadge({ active, excluded }: { active: boolean; excluded: boolean }) {
  if (!active) return <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Deactivated</span>;
  if (excluded) return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Excluded</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Included</span>;
}

function UserRatingsPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => adminApi.getUser(userId),
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end">
      <div className="bg-white h-full w-full max-w-xl overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 sticky top-0 bg-white">
          <div>
            <h2 className="font-semibold text-surface-900">{user?.name ?? user?.email ?? '...'}</h2>
            {user && <p className="text-xs text-surface-500">{user.email} · {user._count.ratings} ratings</p>}
          </div>
          <button className="text-surface-400 hover:text-surface-700 text-xl leading-none" onClick={onClose}>✕</button>
        </div>

        {isLoading && <p className="p-6 text-surface-500 text-sm">Loading...</p>}

        {user?.ratings.map((r) => (
          <div key={r.id} className="border-b border-surface-100 px-6 py-4">
            <p className="font-medium text-sm text-surface-900">{r.song.title}</p>
            <p className="text-xs text-surface-500 mb-2">
              {[r.song.band?.name, r.song.album?.title].filter(Boolean).join(' / ')}
            </p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
              {SCORE_AXES.map((axis) => (
                <div key={axis} className="flex justify-between text-xs">
                  <span className="text-surface-500 capitalize">{axis}</span>
                  <span className="font-mono font-medium">{r[axis as keyof typeof r] as number}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-surface-400 mt-1">Updated {new Date(r.updatedAt).toLocaleDateString()}</p>
          </div>
        ))}

        {user?.ratings.length === 0 && (
          <p className="p-6 text-surface-500 text-sm">No ratings submitted yet.</p>
        )}
      </div>
    </div>
  );
}

function UserRow({ user, onInspect }: { user: AdminUser; onInspect: (id: string) => void }) {
  const qc = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (data: { isCommunityExcluded?: boolean; isActive?: boolean }) =>
      adminApi.updateUser(user.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  return (
    <tr className="border-b border-surface-100 hover:bg-surface-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt={user.name ?? user.email} className="w-6 h-6 rounded-full" />
          )}
          <div>
            <p className="text-sm font-medium text-surface-900">{user.name ?? '—'}</p>
            <p className="text-xs text-surface-500">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-mono">{user._count.ratings}</span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge active={user.isActive} excluded={user.isCommunityExcluded} />
        {user.isAdmin && (
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-surface-900 text-white font-medium">Admin</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-surface-500">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            className="text-xs underline text-surface-600 hover:text-surface-900"
            onClick={() => onInspect(user.id)}
          >
            Ratings
          </button>
          <button
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              user.isCommunityExcluded
                ? 'border-green-300 text-green-700 hover:bg-green-50'
                : 'border-amber-300 text-amber-700 hover:bg-amber-50'
            }`}
            onClick={() => toggleMutation.mutate({ isCommunityExcluded: !user.isCommunityExcluded })}
            disabled={toggleMutation.isPending || !user.isActive}
            title={user.isCommunityExcluded ? 'Re-include in Community' : 'Exclude from Community'}
          >
            {user.isCommunityExcluded ? 'Re-include' : 'Exclude'}
          </button>
          <button
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              user.isActive
                ? 'border-red-300 text-red-700 hover:bg-red-50'
                : 'border-surface-300 text-surface-600 hover:bg-surface-50'
            }`}
            onClick={() => toggleMutation.mutate({ isActive: !user.isActive })}
            disabled={toggleMutation.isPending}
            title={user.isActive ? 'Deactivate user' : 'Reactivate user'}
          >
            {user.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);

  const { data: users, isLoading, isError } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
    enabled: !!user?.isAdmin,
  });

  if (!user) {
    return (
      <div>
        <PageHeader title="User Moderation" subtitle="Admin only" />
        <SignInPrompt message="Sign in as admin to access this page." />
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div>
        <PageHeader title="User Moderation" subtitle="Admin only" />
        <div className="card text-center py-10 text-surface-500 text-sm">
          You do not have admin access.
        </div>
      </div>
    );
  }

  const totalRatings = users?.reduce((n, u) => n + u._count.ratings, 0) ?? 0;
  const excludedCount = users?.filter((u) => u.isCommunityExcluded || !u.isActive).length ?? 0;

  return (
    <div>
      <PageHeader
        title="User Moderation"
        subtitle={`${users?.length ?? 0} users · ${totalRatings} ratings · ${excludedCount} excluded`}
      />

      {isLoading && <p className="text-surface-500 text-sm">Loading users...</p>}
      {isError && <p className="text-red-600 text-sm">Failed to load users.</p>}

      {users && users.length === 0 && (
        <div className="card text-center py-10 text-surface-500 text-sm">
          No users have signed in yet.
        </div>
      )}

      {users && users.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-100 bg-surface-50 text-xs text-surface-600 font-medium">
            Community aggregation only includes users who are Active and not Excluded.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-200 text-xs text-surface-500 font-medium uppercase tracking-wide">
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2 text-center">Ratings</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Joined</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow key={u.id} user={u} onInspect={setInspectUserId} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {users && (
        <div className="mt-6 card space-y-2">
          <h3 className="text-sm font-medium text-surface-700">Admin Note</h3>
          <p className="text-xs text-surface-500">
            <strong>Exclude</strong> — user's ratings are hidden from Community averages but preserved in the database. Reversible.
          </p>
          <p className="text-xs text-surface-500">
            <strong>Deactivate</strong> — same as Exclude, but also prevents the user from submitting new ratings (when enforced). Reversible.
          </p>
          <p className="text-xs text-surface-500">
            To grant admin access to another user, set <code className="bg-surface-100 px-1 rounded">isAdmin = true</code> in the database for that user's row.
          </p>
        </div>
      )}

      {inspectUserId && (
        <UserRatingsPanel userId={inspectUserId} onClose={() => setInspectUserId(null)} />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

interface ProfileStats {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
  ratingsCount: number;
  genreRatingsCount: number;
  commentsCount: number;
  contributions: {
    id: string;
    artistName: string;
    status: string;
    createdAt: string;
    reviewedAt: string | null;
    reviewNote: string | null;
  }[];
}

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$/;

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

// ---------------------------------------------------------------------------
// Username editor card
// ---------------------------------------------------------------------------

function UsernameCard() {
  const { user, refreshUser } = useAuth();
  const [editing, setEditing]   = useState(false);
  const [input, setInput]       = useState(user?.username ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [saved, setSaved]       = useState(false);

  if (!user) return null;

  function startEdit() {
    setInput(user?.username ?? '');
    setError(null);
    setSaved(false);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const trimmed = input.toLowerCase().trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      setError('Must be 3–20 characters'); return;
    }
    if (!USERNAME_RE.test(trimmed)) {
      setError('Only lowercase letters, numbers, hyphens and underscores'); return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/auth/me/username', { username: trimmed });
      await refreshUser();
      setSaved(true);
      setEditing(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-surface-400">Username</p>
        {!editing && (
          <button onClick={startEdit} className="text-xs text-indigo-600 hover:underline">
            Change
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value.toLowerCase()); setError(null); }}
            placeholder="your-username"
            maxLength={20}
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-400"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') cancel(); }}
          />
          <p className="text-xs text-surface-400">
            3–20 chars · lowercase letters, numbers, hyphens, underscores
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={cancel} className="btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-mono text-base font-semibold text-surface-900">
            {user.username ?? <span className="text-surface-400 italic">not set</span>}
          </span>
          {saved && <span className="text-xs text-green-600">Saved!</span>}
        </div>
      )}

      <p className="text-xs text-surface-500 leading-relaxed">
        Your username is shown on game leaderboards instead of your Google name. Pick something you like — it can be changed any time.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UserProfilePage() {
  const { user, logout } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['me-stats'],
    queryFn: () => api.get<ProfileStats>('/api/auth/me/stats'),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="text-center py-12 space-y-4">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-surface-600">Sign in to view your profile.</p>
        <a href="/api/auth/google" className="btn-primary inline-block">Sign in with Google</a>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header card */}
      <div className="card flex items-center gap-5">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name ?? user.email} className="w-16 h-16 rounded-full" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-surface-200 flex items-center justify-center text-2xl font-bold text-surface-600">
            {(user.name ?? user.email)[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {user.username ?? user.name ?? 'Anonymous'}
          </h1>
          {user.username && user.name && user.name !== user.username && (
            <p className="text-sm text-surface-500 truncate">{user.name}</p>
          )}
          <p className="text-sm text-surface-600 truncate">{user.email}</p>
          {stats?.createdAt && (
            <p className="text-xs text-surface-400 mt-1">
              Member since {new Date(stats.createdAt).toLocaleDateString()}
            </p>
          )}
          {user.isAdmin && (
            <span className="inline-block mt-1 text-xs font-medium bg-surface-900 text-white px-2 py-0.5 rounded">
              Admin
            </span>
          )}
        </div>
        <button onClick={logout} className="btn-ghost text-sm self-start shrink-0">
          Sign out
        </button>
      </div>

      {/* Username editor */}
      <UsernameCard />

      {/* Stats */}
      {isLoading && <p className="text-surface-500 text-sm">Loading stats…</p>}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-2xl font-bold">{stats.ratingsCount}</p>
            <p className="text-xs text-surface-600 mt-1">Spectrum ratings</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold">{stats.genreRatingsCount}</p>
            <p className="text-xs text-surface-600 mt-1">Genre ratings</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold">{stats.commentsCount}</p>
            <p className="text-xs text-surface-600 mt-1">Comments</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="card space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-surface-400">Quick actions</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/my/rate"       className="btn-primary text-sm">Rate songs</Link>
          <Link to="/leaderboard"   className="btn-secondary text-sm">Leaderboard</Link>
          <Link to="/my/contribute" className="btn-secondary text-sm">Contribute a band</Link>
          <Link to="/view"          className="btn-ghost text-sm">Browse library</Link>
        </div>
      </div>

      {/* Contribution history */}
      {stats && (
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-4">
            Contributions ({stats.contributions.length})
          </p>

          {stats.contributions.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-surface-600">No contributions yet.</p>
              <Link to="/my/contribute" className="text-sm text-indigo-600 hover:underline">
                Submit a band for review →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-surface-100">
              {stats.contributions.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium text-sm">{c.artistName}</p>
                      <p className="text-xs text-surface-500 mt-0.5">Submitted {timeAgo(c.createdAt)}</p>
                      {c.reviewedAt && (
                        <p className="text-xs text-surface-400">Reviewed {timeAgo(c.reviewedAt)}</p>
                      )}
                      {c.reviewNote && c.status === 'rejected' && (
                        <p className="text-xs text-red-600 mt-1 italic">"{c.reviewNote}"</p>
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                        STATUS_COLORS[c.status] ?? 'bg-surface-100 text-surface-600'
                      }`}
                    >
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { musicBrainzApi } from '../api/musicbrainz';
import type { AdminContributionItem } from '../api/musicbrainz';
import PageHeader from '../components/layout/PageHeader';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'approved' ? 'bg-green-100 text-green-800' :
    status === 'rejected' ? 'bg-red-100 text-red-800' :
    'bg-yellow-100 text-yellow-800';
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ContributionRow({ item }: { item: AdminContributionItem }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: () => musicBrainzApi.approveContribution(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-contributions'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => musicBrainzApi.rejectContribution(item.id, rejectNote.trim() || undefined),
    onSuccess: () => {
      setShowRejectInput(false);
      queryClient.invalidateQueries({ queryKey: ['admin-contributions'] });
    },
  });

  const isPending = item.status === 'pending';

  return (
    <li className="divide-y divide-surface-100">
      {/* Header row */}
      <div className="px-4 py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="font-medium text-sm hover:underline text-left"
              onClick={() => setExpanded((v) => !v)}
            >
              {item.artistName}
            </button>
            <StatusBadge status={item.status} />
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {item.albumCount} album{item.albumCount !== 1 ? 's' : ''} · by{' '}
            <span className="font-medium">{item.user.name ?? item.user.email}</span> ·{' '}
            {new Date(item.createdAt).toLocaleDateString()}
            {item.reviewer && item.reviewedAt && (
              <> · reviewed by {item.reviewer.name} on{' '}
                {new Date(item.reviewedAt).toLocaleDateString()}
              </>
            )}
          </p>
          {item.adminNote && (
            <p className="text-xs text-surface-600 mt-1 italic">Note: {item.adminNote}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            className="text-xs text-surface-500 hover:text-surface-800 transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Collapse' : 'Details'}
          </button>
          {isPending && (
            <>
              <button
                className="btn-primary text-xs px-3 py-1.5"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                {approveMutation.isPending ? 'Importing…' : 'Approve & Import'}
              </button>
              <button
                className="btn-ghost text-xs px-3 py-1.5 text-red-600 hover:text-red-700"
                onClick={() => setShowRejectInput((v) => !v)}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Approve result */}
      {approveMutation.isError && (
        <div className="px-4 py-2 bg-red-50">
          <p className="text-xs text-red-700">
            Import failed:{' '}
            {approveMutation.error instanceof Error
              ? approveMutation.error.message
              : 'Unknown error'}
          </p>
        </div>
      )}
      {approveMutation.isSuccess && (
        <div className="px-4 py-2 bg-green-50">
          <p className="text-xs text-green-700 font-medium">Imported successfully.</p>
        </div>
      )}

      {/* Reject input */}
      {showRejectInput && isPending && (
        <div className="px-4 py-3 bg-surface-50 flex items-center gap-3">
          <input
            className="input flex-1 text-sm"
            placeholder="Optional note for the user…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <button
            className="btn-primary text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700"
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending}
          >
            {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
          </button>
          <button
            className="btn-ghost text-xs"
            onClick={() => { setShowRejectInput(false); setRejectNote(''); }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Expanded detail — shows album + track list from stored data */}
      {expanded && (
        <ContributionDetail item={item} />
      )}
    </li>
  );
}

function ContributionDetail({ item }: { item: AdminContributionItem }) {
  type AlbumData = {
    album_title: string;
    year: number | null;
    tracks: { track_number: number; song_title: string }[];
  };
  type Data = { artist?: string; albums?: AlbumData[] };

  const data = item as unknown as { data: Data };
  const albums: AlbumData[] = data.data?.albums ?? [];

  return (
    <div className="px-4 py-3 bg-surface-50 space-y-3">
      <p className="text-xs font-medium text-surface-600">
        MusicBrainz ID: <code className="text-surface-800">{item.artistMbId}</code>
      </p>
      {albums.map((album, ai) => (
        <div key={ai} className="rounded border border-surface-200 bg-white overflow-hidden">
          <div className="px-3 py-2 bg-surface-50 border-b border-surface-200 flex items-baseline gap-3">
            <p className="text-sm font-semibold">{album.album_title}</p>
            {album.year && <p className="text-xs text-surface-500">{album.year}</p>}
            <p className="text-xs text-surface-400 ml-auto">{album.tracks.length} tracks</p>
          </div>
          <ul className="divide-y divide-surface-100 max-h-48 overflow-y-auto">
            {album.tracks.map((t) => (
              <li key={t.track_number} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <span className="text-surface-400 w-5 text-right shrink-0">{t.track_number}</span>
                <span>{t.song_title}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function AdminContributionsPage() {
  const [filter, setFilter] = useState<StatusFilter>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-contributions', filter],
    queryFn: () =>
      musicBrainzApi.getContributions(filter === 'all' ? undefined : filter),
  });

  const pendingCount = data?.filter((c) => c.status === 'pending').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Contributions"
        subtitle="Review band submissions from community members"
      />

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-200">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === value
                ? 'border-surface-900 text-surface-900'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
            onClick={() => setFilter(value)}
          >
            {label}
            {value === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full px-1.5 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-surface-600 text-sm">Loading…</p>}

      {data && data.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-surface-600 text-sm">No {filter === 'all' ? '' : filter} contributions.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <ul className="divide-y divide-surface-100">
            {data.map((item) => (
              <ContributionRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

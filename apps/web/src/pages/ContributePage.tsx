import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { musicBrainzApi } from '../api/musicbrainz';
import type { ContributionPayload } from '../api/musicbrainz';
import MusicBrainzLookup from '../components/MusicBrainzLookup';

function hoursUntilRefresh(nextRefresh: string): string {
  const ms = new Date(nextRefresh).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  const h = Math.ceil(ms / (1000 * 60 * 60));
  return `${h}h`;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'approved' ? 'bg-green-100 text-green-800' :
    status === 'rejected' ? 'bg-red-100 text-red-800' :
    'bg-yellow-100 text-yellow-800';
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function ContributePage() {
  const { user, login } = useAuth();
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);

  const { data: tokenData } = useQuery({
    queryKey: ['contribution-tokens'],
    queryFn: () => musicBrainzApi.getTokens(),
    enabled: !!user,
  });

  const { data: history } = useQuery({
    queryKey: ['my-contributions'],
    queryFn: () => musicBrainzApi.getMyContributions(),
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: (payload: ContributionPayload) => musicBrainzApi.submitContribution(payload),
    onSuccess: () => {
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] });
      queryClient.invalidateQueries({ queryKey: ['contribution-tokens'] });
    },
  });

  if (!user) {
    return (
      <div className="text-center py-20">
        <p className="text-surface-700 mb-5 text-sm">Sign in to suggest bands for the library.</p>
        <button className="btn-primary" onClick={login}>Sign in with Google</button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Contribute a Band</h1>
        <p className="text-sm text-surface-600 mt-1">
          Search MusicBrainz, pick albums, and submit for admin review. You can add lyrics after
          it's approved.
        </p>
      </div>

      {/* Token balance */}
      {tokenData && (
        <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              {tokenData.tokens} of 3 song token{tokenData.tokens !== 1 ? 's' : ''} remaining today
            </p>
            <p className="text-xs text-surface-500 mt-0.5">
              Refreshes in {hoursUntilRefresh(tokenData.nextRefresh)} · 1 token per song submitted
            </p>
          </div>
          <span
            className={`text-2xl font-bold ${
              tokenData.tokens === 0
                ? 'text-red-500'
                : tokenData.tokens === 1
                ? 'text-yellow-500'
                : 'text-green-600'
            }`}
          >
            {tokenData.tokens}/3
          </span>
        </div>
      )}

      {/* Lookup wizard */}
      {tokenData?.tokens === 0 ? (
        <div className="card text-center py-10">
          <p className="text-surface-700 text-sm mb-2">No tokens remaining today.</p>
          <p className="text-xs text-surface-500">
            You'll get 3 fresh song tokens in {hoursUntilRefresh(tokenData.nextRefresh)}.
          </p>
        </div>
      ) : (
        <div className="card">
          <MusicBrainzLookup
            actionLabel="Submit for Review"
            onAction={(payload) => {
              setDone(false);
              submitMutation.mutate(payload);
            }}
            actionPending={submitMutation.isPending}
            actionDone={done}
          />
          {submitMutation.isError && (
            <p className="text-red-600 text-sm mt-3">
              {submitMutation.error instanceof Error
                ? submitMutation.error.message
                : 'Submission failed'}
            </p>
          )}
          {done && (
            <p className="text-green-700 text-sm mt-3 font-medium">
              Submitted! An admin will review your contribution soon.
            </p>
          )}
        </div>
      )}

      {/* Submission history */}
      {history && history.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-3">
            My Submissions
          </p>
          <div className="card p-0 overflow-hidden">
            <ul className="divide-y divide-surface-100">
              {history.map((c) => (
                <li key={c.id} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.artistName}</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {c.albumCount} album{c.albumCount !== 1 ? 's' : ''} ·{' '}
                      {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                    {c.adminNote && (
                      <p className="text-xs text-surface-600 mt-1 italic">{c.adminNote}</p>
                    )}
                  </div>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

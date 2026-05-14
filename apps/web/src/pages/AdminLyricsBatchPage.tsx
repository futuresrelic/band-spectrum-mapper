import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminApi, type BatchItem, type BatchJobState } from '../api/admin';

const POLL_INTERVAL = 2000;

const INITIAL: BatchJobState = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  totalSongs: 0,
  processedSongs: 0,
  foundCount: 0,
  notFoundCount: 0,
  skippedInstrumentalCount: 0,
  currentSong: null,
  items: [],
  error: null,
  processedSongIds: [],
  notFoundSongIds: [],
};

export default function AdminLyricsBatchPage() {
  const [job, setJob] = useState<BatchJobState>(INITIAL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [markedInstrumental, setMarkedInstrumental] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMutation = useMutation({
    mutationFn: () => adminApi.startLyricsBatch(),
    onSuccess: (data) => setJob(data),
  });

  const resumeMutation = useMutation({
    mutationFn: () => adminApi.resumeLyricsBatch(),
    onSuccess: (data) => setJob(data),
  });

  const stopMutation = useMutation({
    mutationFn: () => adminApi.stopLyricsBatch(),
    onSuccess: (data) => setJob(data),
  });

  const clearMutation = useMutation({
    mutationFn: () => adminApi.clearLyricsBatch(),
    onSuccess: (data) => setJob(data),
  });

  const approveMutation = useMutation({
    mutationFn: ({ itemId }: { itemId: string }) => adminApi.approveLyricsItem(itemId),
    onSuccess: (_data, { itemId }) => {
      setJob((prev) => ({
        ...prev,
        items: prev.items.map((i) => i.id === itemId ? { ...i, status: 'approved' as const } : i),
      }));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ itemId }: { itemId: string }) => adminApi.rejectLyricsItem(itemId),
    onSuccess: (_data, { itemId }) => {
      setJob((prev) => ({
        ...prev,
        items: prev.items.map((i) => i.id === itemId ? { ...i, status: 'rejected' as const } : i),
      }));
    },
  });

  const instrumentalMutation = useMutation({
    mutationFn: ({ songId }: { songId: string }) => adminApi.markInstrumental(songId, true),
    onSuccess: (_data, { songId }) => {
      setMarkedInstrumental((prev) => new Set([...prev, songId]));
    },
  });

  const poll = useCallback(async () => {
    try {
      const data = await adminApi.getLyricsBatchStatus();
      setJob(data);
      if (data.status !== 'running') stopPolling();
    } catch { /* ignore poll errors */ }
  }, []);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => {
    void adminApi.getLyricsBatchStatus().then((data) => {
      setJob(data);
      if (data.status === 'running') startPolling();
    }).catch(() => {/* server may not have started yet */});
    return stopPolling;
  }, []);

  function handleStart() {
    startMutation.mutate(undefined, {
      onSuccess: (data) => {
        setJob(data);
        if (data.status === 'running') startPolling();
      },
    });
  }

  function handleResume() {
    resumeMutation.mutate(undefined, {
      onSuccess: (data) => {
        setJob(data);
        if (data.status === 'running') startPolling();
      },
    });
  }

  function handleApprove(item: BatchItem) {
    if (editingId === item.id) {
      adminApi.approveLyricsItem(item.id).then(() => {
        setJob((prev) => ({
          ...prev,
          items: prev.items.map((i) => i.id === item.id ? { ...i, text: editText, status: 'approved' as const } : i),
        }));
        setEditingId(null);
      }).catch(() => { /* mutation already handles errors */ });
    } else {
      approveMutation.mutate({ itemId: item.id });
    }
  }

  const pendingItems = job.items.filter((i) => i.status === 'found');
  const approvedCount = job.items.filter((i) => i.status === 'approved').length;
  const rejectedCount = job.items.filter((i) => i.status === 'rejected').length;
  const pct = job.totalSongs > 0 ? Math.round((job.processedSongs / job.totalSongs) * 100) : 0;

  // Songs that were tried and not found — eligible for "mark as instrumental"
  // We show these from the notFoundSongIds when status is done/stopped
  const canResume = (job.status === 'done' || job.status === 'error') && job.processedSongIds.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-surface-100 mb-1">Lyrics Batch Fetcher</h1>
        <p className="text-sm text-surface-400">
          Fetches lyrics for every song missing them using Lyrics.ovh and lrclib.net. Results queue
          here for your review — nothing is saved until you approve it. Songs marked as
          instrumental are permanently skipped.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {job.status === 'idle' && (
          <button
            onClick={handleStart}
            disabled={startMutation.isPending}
            className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {startMutation.isPending ? 'Starting…' : 'Start batch fetch'}
          </button>
        )}

        {job.status === 'running' && (
          <button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            className="px-4 py-2 rounded bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 disabled:opacity-50 transition-colors"
          >
            Stop
          </button>
        )}

        {(job.status === 'done' || job.status === 'error') && (
          <>
            <button
              onClick={handleStart}
              disabled={startMutation.isPending}
              className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              Run again (full scan)
            </button>
            {canResume && (
              <button
                onClick={handleResume}
                disabled={resumeMutation.isPending}
                className="px-4 py-2 rounded bg-indigo-900 border border-indigo-600 text-indigo-300 text-sm font-medium hover:bg-indigo-800 disabled:opacity-50 transition-colors"
              >
                {resumeMutation.isPending ? 'Resuming…' : `Resume (skip ${job.processedSongs} already tried)`}
              </button>
            )}
            <button
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="px-4 py-2 rounded border border-surface-600 text-surface-300 text-sm hover:bg-surface-800 disabled:opacity-50 transition-colors"
            >
              Clear results
            </button>
          </>
        )}
      </div>

      {/* Progress */}
      {job.status !== 'idle' && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-baseline gap-4 text-sm">
            <span className={`font-semibold ${
              job.status === 'running' ? 'text-amber-400' :
              job.status === 'done'    ? 'text-green-400' :
              job.status === 'error'   ? 'text-red-400' : 'text-surface-400'
            }`}>
              {job.status === 'running' ? 'Running…' :
               job.status === 'done'    ? 'Done' :
               job.status === 'error'   ? 'Error' : ''}
            </span>
            <span className="text-surface-400">
              {job.processedSongs} / {job.totalSongs} songs
            </span>
            <span className="text-green-400">{job.foundCount} found</span>
            <span className="text-surface-500">{job.notFoundCount} not found</span>
            {job.skippedInstrumentalCount > 0 && (
              <span className="text-surface-600">{job.skippedInstrumentalCount} skipped (instrumental)</span>
            )}
            {approvedCount > 0 && <span className="text-indigo-400">{approvedCount} approved</span>}
            {rejectedCount > 0 && <span className="text-surface-500">{rejectedCount} rejected</span>}
          </div>

          {job.status === 'running' && (
            <>
              <div className="w-full bg-surface-700 rounded-full h-1.5">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {job.currentSong && (
                <p className="text-xs text-surface-500 truncate">Checking: {job.currentSong}</p>
              )}
            </>
          )}

          {job.status === 'error' && job.error && (
            <p className="text-sm text-red-400">{job.error}</p>
          )}
        </div>
      )}

      {/* Not-found songs — mark as instrumental */}
      {job.notFoundSongIds.length > 0 && job.status !== 'running' && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-surface-200">
              Not found — {job.notFoundSongIds.length} songs
            </h2>
            <p className="text-xs text-surface-500 mt-0.5">
              These songs returned no results from either lyrics source. If they are instrumentals,
              mark them to skip permanently in future runs.
            </p>
          </div>
          <NotFoundList
            notFoundSongIds={job.notFoundSongIds}
            items={job.items}
            markedInstrumental={markedInstrumental}
            onMarkInstrumental={(songId) => instrumentalMutation.mutate({ songId })}
            isMarking={instrumentalMutation.isPending}
            markingId={instrumentalMutation.variables?.songId}
          />
        </div>
      )}

      {/* Results queue */}
      {pendingItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-surface-200">
            Ready to review — {pendingItems.length} pending
          </h2>
          {pendingItems.map((item) => (
            <LyricsItem
              key={item.id}
              item={item}
              isEditing={editingId === item.id}
              editText={editText}
              onEditStart={() => { setEditingId(item.id); setEditText(item.text); }}
              onEditChange={setEditText}
              onEditCancel={() => setEditingId(null)}
              onApprove={() => handleApprove(item)}
              onReject={() => rejectMutation.mutate({ itemId: item.id })}
              approving={approveMutation.isPending && approveMutation.variables?.itemId === item.id}
              rejecting={rejectMutation.isPending && rejectMutation.variables?.itemId === item.id}
            />
          ))}
        </div>
      )}

      {job.status !== 'idle' && pendingItems.length === 0 && job.foundCount > 0 && (
        <p className="text-sm text-green-400">
          All {job.foundCount} found lyrics have been reviewed.
        </p>
      )}

      {job.status !== 'idle' && job.foundCount === 0 && job.status !== 'running' && (
        <p className="text-sm text-surface-400">No lyrics were found in either database.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not-found list with mark-instrumental actions
// ---------------------------------------------------------------------------

function NotFoundList({
  notFoundSongIds,
  items: _items,
  markedInstrumental,
  onMarkInstrumental,
  isMarking,
  markingId,
}: {
  notFoundSongIds: string[];
  items: BatchItem[];
  markedInstrumental: Set<string>;
  onMarkInstrumental: (songId: string) => void;
  isMarking: boolean;
  markingId?: string;
}) {
  // We only have song IDs here — display them in a compact list
  // The full song details aren't fetched here to keep it lightweight
  return (
    <div className="bg-surface-900 border border-surface-700 rounded-lg overflow-hidden">
      <div className="max-h-48 overflow-y-auto divide-y divide-surface-800">
        {notFoundSongIds.map((songId) => {
          const isMarked = markedInstrumental.has(songId);
          return (
            <div key={songId} className="flex items-center justify-between px-4 py-2 gap-3">
              <span className="text-xs text-surface-400 font-mono truncate">{songId}</span>
              {isMarked ? (
                <span className="text-xs text-surface-600 shrink-0">Marked instrumental</span>
              ) : (
                <button
                  onClick={() => onMarkInstrumental(songId)}
                  disabled={isMarking && markingId === songId}
                  className="text-xs px-2 py-0.5 rounded border border-surface-600 text-surface-400 hover:text-white hover:border-surface-400 disabled:opacity-50 transition-colors shrink-0"
                >
                  {isMarking && markingId === songId ? '…' : 'Mark instrumental'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lyrics item — review queue
// ---------------------------------------------------------------------------

function LyricsItem({
  item,
  isEditing,
  editText,
  onEditStart,
  onEditChange,
  onEditCancel,
  onApprove,
  onReject,
  approving,
  rejecting,
}: {
  item: BatchItem;
  isEditing: boolean;
  editText: string;
  onEditStart: () => void;
  onEditChange: (t: string) => void;
  onEditCancel: () => void;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
  rejecting: boolean;
}) {
  return (
    <div className="bg-surface-850 border border-surface-700 rounded-lg px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-surface-100 truncate">{item.songTitle}</p>
          <p className="text-xs text-surface-500">
            {item.bandName}{item.albumTitle ? ` · ${item.albumTitle}` : ''}
            <span className="ml-2 text-surface-600">via {item.source}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isEditing && (
            <button
              onClick={onEditStart}
              className="px-2.5 py-1 rounded border border-surface-600 text-surface-400 text-xs hover:text-surface-200 hover:border-surface-400 transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={onApprove}
            disabled={approving || rejecting}
            className="px-3 py-1 rounded bg-green-700 text-white text-xs font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            {approving ? 'Saving…' : 'Approve'}
          </button>
          <button
            onClick={onReject}
            disabled={approving || rejecting}
            className="px-3 py-1 rounded border border-red-800 text-red-400 text-xs hover:bg-red-900/30 disabled:opacity-50 transition-colors"
          >
            {rejecting ? '…' : 'Reject'}
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editText}
            onChange={(e) => onEditChange(e.target.value)}
            rows={10}
            className="w-full bg-surface-800 border border-surface-600 rounded px-3 py-2 text-xs text-surface-200 font-mono resize-y focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={onEditCancel}
            className="text-xs text-surface-500 hover:text-surface-300 underline"
          >
            Cancel edit
          </button>
        </div>
      ) : (
        <pre className="text-xs text-surface-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
          {item.text}
        </pre>
      )}
    </div>
  );
}

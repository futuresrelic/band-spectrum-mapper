import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminApi, type DbHealthReport, type UnlinkedSong } from '../api/admin';

function dot(ok: boolean) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${ok ? 'bg-green-500' : 'bg-amber-400'}`}
    />
  );
}

function SectionHeader({
  label,
  count,
  note,
}: {
  label: string;
  count: number;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      {dot(count === 0)}
      <h2 className="text-sm font-semibold text-surface-100">
        {label}
        <span
          className={`ml-2 text-xs font-normal ${count === 0 ? 'text-green-400' : 'text-amber-400'}`}
        >
          {count === 0 ? 'clean' : `${count} issue${count !== 1 ? 's' : ''}`}
        </span>
      </h2>
      {note && <span className="text-xs text-surface-500">{note}</span>}
    </div>
  );
}

export default function AdminDbHealthPage() {
  const [report, setReport] = useState<DbHealthReport | null>(null);
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null);

  const scanMutation = useMutation({
    mutationFn: () => adminApi.getDbHealth(),
    onSuccess: (data) => {
      setReport(data);
      setCleanupMsg(null);
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: (actions: string[]) => adminApi.runDbCleanup(actions),
    onSuccess: (data, variables) => {
      const lines = variables.map((action) => {
        const n = data.results[action] ?? 0;
        const label =
          action === 'delete_safe_unlinked'
            ? 'unlinked songs'
            : action === 'delete_empty_albums'
              ? 'empty albums'
              : 'empty bands';
        return `${n} ${label} deleted`;
      });
      setCleanupMsg(lines.join(' · '));
      // Re-scan after cleanup
      scanMutation.mutate();
    },
  });

  const safeUnlinked = report?.unlinkedSongs.filter((s) => s.isSafeToDelete) ?? [];
  const unsafeUnlinked = report?.unlinkedSongs.filter((s) => !s.isSafeToDelete) ?? [];

  function runCleanup(actions: string[]) {
    setCleanupMsg(null);
    cleanupMutation.mutate(actions);
  }

  const isBusy = scanMutation.isPending || cleanupMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-surface-100 mb-1">Database Health</h1>
        <p className="text-sm text-surface-400">
          Detects orphaned and duplicate records that can prevent clean re-imports.
          Safe auto-fixes remove only records with no user data attached.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => scanMutation.mutate()}
          disabled={isBusy}
          className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {scanMutation.isPending ? 'Scanning…' : 'Scan Database'}
        </button>
        {scanMutation.isError && (
          <span className="text-sm text-red-400">
            Scan failed: {(scanMutation.error as Error).message}
          </span>
        )}
        {cleanupMsg && (
          <span className="text-sm text-green-400">{cleanupMsg}</span>
        )}
        {cleanupMutation.isError && (
          <span className="text-sm text-red-400">
            Cleanup failed: {(cleanupMutation.error as Error).message}
          </span>
        )}
      </div>

      {report && (
        <div className="space-y-8">
          {/* ── Unlinked songs ── */}
          <section className="bg-surface-850 rounded-lg p-5 border border-surface-700">
            <SectionHeader
              label="Unlinked songs (albumId = null)"
              count={report.unlinkedSongs.length}
              note="Happen when an album is deleted — songs stay but lose their album link"
            />
            {report.unlinkedSongs.length > 0 && (
              <>
                {safeUnlinked.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-surface-400">
                        {safeUnlinked.length} safe to delete (no lyrics, ratings, or comments)
                      </span>
                      <button
                        onClick={() => runCleanup(['delete_safe_unlinked'])}
                        disabled={isBusy}
                        className="px-3 py-1 rounded bg-red-700 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                      >
                        Delete {safeUnlinked.length} safe
                      </button>
                    </div>
                    <UnlinkedTable songs={safeUnlinked} safe />
                  </div>
                )}
                {unsafeUnlinked.length > 0 && (
                  <div>
                    <p className="text-xs text-amber-400 mb-2">
                      {unsafeUnlinked.length} have attached data — review manually before deleting
                    </p>
                    <UnlinkedTable songs={unsafeUnlinked} safe={false} />
                  </div>
                )}
              </>
            )}
            {report.unlinkedSongs.length === 0 && (
              <p className="text-xs text-surface-500">No unlinked songs found.</p>
            )}
          </section>

          {/* ── Empty albums ── */}
          <section className="bg-surface-850 rounded-lg p-5 border border-surface-700">
            <SectionHeader
              label="Empty albums (no songs)"
              count={report.emptyAlbums.length}
              note="Albums whose songs were all removed or never imported"
            />
            {report.emptyAlbums.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => runCleanup(['delete_empty_albums'])}
                    disabled={isBusy}
                    className="px-3 py-1 rounded bg-red-700 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    Delete {report.emptyAlbums.length} empty albums
                  </button>
                </div>
                <table className="w-full text-xs text-surface-300 border-collapse">
                  <thead>
                    <tr className="border-b border-surface-700 text-surface-500 text-left">
                      <th className="pb-1 pr-4 font-normal">Band</th>
                      <th className="pb-1 pr-4 font-normal">Album</th>
                      <th className="pb-1 font-normal">Slug</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.emptyAlbums.map((a) => (
                      <tr key={a.id} className="border-b border-surface-800">
                        <td className="py-1 pr-4">{a.bandName}</td>
                        <td className="py-1 pr-4">{a.title}</td>
                        <td className="py-1 font-mono text-surface-500">{a.slug}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {report.emptyAlbums.length === 0 && (
              <p className="text-xs text-surface-500">No empty albums found.</p>
            )}
          </section>

          {/* ── Empty bands ── */}
          <section className="bg-surface-850 rounded-lg p-5 border border-surface-700">
            <SectionHeader
              label="Empty bands (no albums, no songs)"
              count={report.emptyBands.length}
              note="Bands left over after all albums and songs were removed"
            />
            {report.emptyBands.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => runCleanup(['delete_empty_bands'])}
                    disabled={isBusy}
                    className="px-3 py-1 rounded bg-red-700 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    Delete {report.emptyBands.length} empty bands
                  </button>
                </div>
                <table className="w-full text-xs text-surface-300 border-collapse">
                  <thead>
                    <tr className="border-b border-surface-700 text-surface-500 text-left">
                      <th className="pb-1 pr-4 font-normal">Name</th>
                      <th className="pb-1 font-normal">Slug</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.emptyBands.map((b) => (
                      <tr key={b.id} className="border-b border-surface-800">
                        <td className="py-1 pr-4">{b.name}</td>
                        <td className="py-1 font-mono text-surface-500">{b.slug}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {report.emptyBands.length === 0 && (
              <p className="text-xs text-surface-500">No empty bands found.</p>
            )}
          </section>

          {/* ── Duplicate track numbers ── */}
          <section className="bg-surface-850 rounded-lg p-5 border border-surface-700">
            <SectionHeader
              label="Duplicate track numbers on same album"
              count={report.duplicateTrackNumbers.length}
              note="Two or more songs share the same track number on the same album"
            />
            {report.duplicateTrackNumbers.length > 0 && (
              <>
                <p className="text-xs text-amber-400 mb-3">
                  These need manual resolution — go to the album and delete the unwanted duplicate.
                </p>
                <table className="w-full text-xs text-surface-300 border-collapse">
                  <thead>
                    <tr className="border-b border-surface-700 text-surface-500 text-left">
                      <th className="pb-1 pr-4 font-normal">Band / Album</th>
                      <th className="pb-1 pr-4 font-normal">Track #</th>
                      <th className="pb-1 font-normal">Conflicting songs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.duplicateTrackNumbers.map((g) => (
                      <tr key={`${g.albumId}:${g.trackNumber}`} className="border-b border-surface-800">
                        <td className="py-1 pr-4">
                          {g.bandName} / {g.albumTitle}
                        </td>
                        <td className="py-1 pr-4">{g.trackNumber}</td>
                        <td className="py-1">
                          {g.songs.map((s) => s.title).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {report.duplicateTrackNumbers.length === 0 && (
              <p className="text-xs text-surface-500">No duplicate track numbers found.</p>
            )}
          </section>

          {/* ── Songs without scores ── */}
          <section className="bg-surface-850 rounded-lg p-5 border border-surface-700">
            <SectionHeader
              label="Songs without spectrum scores"
              count={report.songsWithoutScores.length}
              note="Songs that exist but have never been scored on any axis"
            />
            {report.songsWithoutScores.length > 0 && (
              <>
                <p className="text-xs text-surface-500 mb-3">
                  These are informational only — add scores via the Discography importer or edit the song directly.
                </p>
                <table className="w-full text-xs text-surface-300 border-collapse">
                  <thead>
                    <tr className="border-b border-surface-700 text-surface-500 text-left">
                      <th className="pb-1 pr-4 font-normal">Band</th>
                      <th className="pb-1 pr-4 font-normal">Album</th>
                      <th className="pb-1 font-normal">Song</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.songsWithoutScores.map((s) => (
                      <tr key={s.id} className="border-b border-surface-800">
                        <td className="py-1 pr-4">{s.bandName}</td>
                        <td className="py-1 pr-4">{s.albumTitle ?? '—'}</td>
                        <td className="py-1">{s.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {report.songsWithoutScores.length === 0 && (
              <p className="text-xs text-surface-500">All songs have spectrum scores.</p>
            )}
          </section>

          {/* ── Fix all safe issues at once ── */}
          {(safeUnlinked.length > 0 || report.emptyAlbums.length > 0 || report.emptyBands.length > 0) && (
            <div className="flex items-center gap-4 pt-2 border-t border-surface-700">
              <span className="text-xs text-surface-400">Fix everything safe in one pass:</span>
              <button
                onClick={() =>
                  runCleanup([
                    ...(safeUnlinked.length > 0 ? ['delete_safe_unlinked'] : []),
                    ...(report.emptyAlbums.length > 0 ? ['delete_empty_albums'] : []),
                    ...(report.emptyBands.length > 0 ? ['delete_empty_bands'] : []),
                  ])
                }
                disabled={isBusy}
                className="px-4 py-2 rounded bg-red-700 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                Fix all safe issues
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnlinkedTable({ songs, safe }: { songs: UnlinkedSong[]; safe: boolean }) {
  return (
    <table className="w-full text-xs text-surface-300 border-collapse mb-2">
      <thead>
        <tr className="border-b border-surface-700 text-surface-500 text-left">
          <th className="pb-1 pr-4 font-normal">Band</th>
          <th className="pb-1 pr-4 font-normal">Song</th>
          <th className="pb-1 pr-4 font-normal">Slug</th>
          {!safe && <th className="pb-1 font-normal">Attached data</th>}
        </tr>
      </thead>
      <tbody>
        {songs.map((s) => (
          <tr key={s.id} className="border-b border-surface-800">
            <td className="py-1 pr-4">{s.bandName}</td>
            <td className="py-1 pr-4">{s.title}</td>
            <td className="py-1 pr-4 font-mono text-surface-500">{s.slug}</td>
            {!safe && (
              <td className="py-1 text-amber-400">
                {[
                  s.lyricCount > 0 ? `${s.lyricCount} lyric${s.lyricCount !== 1 ? 's' : ''}` : null,
                  s.ratingCount > 0 ? `${s.ratingCount} rating${s.ratingCount !== 1 ? 's' : ''}` : null,
                  s.commentCount > 0 ? `${s.commentCount} comment${s.commentCount !== 1 ? 's' : ''}` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

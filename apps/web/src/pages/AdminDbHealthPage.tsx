import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  adminApi,
  type AlbumOption,
  type DbHealthReport,
  type DuplicateTrackGroup,
  type UnlinkedSong,
} from '../api/admin';

// ─── helpers ────────────────────────────────────────────────────────────────

function StatusDot({ clean }: { clean: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full mr-2 shrink-0 ${clean ? 'bg-green-500' : 'bg-amber-400'}`}
    />
  );
}

function SectionHeader({ label, count, note }: { label: string; count: number; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
      <StatusDot clean={count === 0} />
      <h2 className="text-sm font-semibold text-surface-100">
        {label}
        <span className={`ml-2 text-xs font-normal ${count === 0 ? 'text-green-400' : 'text-amber-400'}`}>
          {count === 0 ? 'clean' : `${count} issue${count !== 1 ? 's' : ''}`}
        </span>
      </h2>
      {note && <span className="text-xs text-surface-500">{note}</span>}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function AdminDbHealthPage() {
  const navigate = useNavigate();
  const [report, setReport] = useState<DbHealthReport | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Album list for re-link dropdown — loaded lazily once
  const [albums, setAlbums] = useState<AlbumOption[] | null>(null);
  const [albumsLoading, setAlbumsLoading] = useState(false);

  // Which song is currently open in the re-link form
  const [relinking, setRelinking] = useState<string | null>(null);
  const [relinkTarget, setRelinkTarget] = useState('');

  // Album-delete confirmation state
  const [confirmAlbum, setConfirmAlbum] = useState<{
    albumId: string;
    albumTitle: string;
    bandName: string;
  } | null>(null);
  const [deleteAlbumSongs, setDeleteAlbumSongs] = useState(true);

  // ── mutations ──────────────────────────────────────────────────────────────

  const scanMutation = useMutation({
    mutationFn: () => adminApi.getDbHealth(),
    onSuccess: (data) => { setReport(data); setStatusMsg(null); },
    onError: (e) => setStatusMsg({ text: `Scan failed: ${(e as Error).message}`, ok: false }),
  });

  const cleanupMutation = useMutation({
    mutationFn: (actions: string[]) => adminApi.runDbCleanup(actions),
    onSuccess: (data, vars) => {
      const lines = vars.map((a) => {
        const n = data.results[a] ?? 0;
        const label = a === 'delete_safe_unlinked' ? 'unlinked songs'
          : a === 'delete_empty_albums' ? 'empty albums' : 'empty bands';
        return `${n} ${label} removed`;
      });
      setStatusMsg({ text: lines.join(' · '), ok: true });
      scanMutation.mutate();
    },
    onError: (e) => setStatusMsg({ text: `Cleanup failed: ${(e as Error).message}`, ok: false }),
  });

  const relinkMutation = useMutation({
    mutationFn: ({ songId, albumId }: { songId: string; albumId: string }) =>
      adminApi.relinkSong(songId, albumId),
    onSuccess: () => {
      setRelinking(null);
      setRelinkTarget('');
      setStatusMsg({ text: 'Song re-linked to album.', ok: true });
      scanMutation.mutate();
    },
    onError: (e) => setStatusMsg({ text: `Re-link failed: ${(e as Error).message}`, ok: false }),
  });

  const deleteSongMutation = useMutation({
    mutationFn: (songId: string) => adminApi.deleteSong(songId),
    onSuccess: () => {
      setStatusMsg({ text: 'Song deleted.', ok: true });
      scanMutation.mutate();
    },
    onError: (e) => setStatusMsg({ text: `Delete failed: ${(e as Error).message}`, ok: false }),
  });

  const deleteAlbumMutation = useMutation({
    mutationFn: ({ albumId, andSongs }: { albumId: string; andSongs: boolean }) =>
      adminApi.deleteAlbum(albumId, andSongs),
    onSuccess: () => {
      setConfirmAlbum(null);
      setStatusMsg({ text: 'Album deleted.', ok: true });
      scanMutation.mutate();
    },
    onError: (e) => setStatusMsg({ text: `Delete album failed: ${(e as Error).message}`, ok: false }),
  });

  const isBusy =
    scanMutation.isPending ||
    cleanupMutation.isPending ||
    relinkMutation.isPending ||
    deleteSongMutation.isPending ||
    deleteAlbumMutation.isPending;

  // ── helpers ────────────────────────────────────────────────────────────────

  async function openRelink(songId: string) {
    setRelinking(songId);
    setRelinkTarget('');
    if (!albums && !albumsLoading) {
      setAlbumsLoading(true);
      try {
        setAlbums(await adminApi.getAlbumsList());
      } finally {
        setAlbumsLoading(false);
      }
    }
  }

  function albumsForBand(bandId: string) {
    return (albums ?? []).filter((a) => a.bandId === bandId);
  }

  const safeUnlinked = report?.unlinkedSongs.filter((s) => s.isSafeToDelete) ?? [];
  const hasAnySafeIssues =
    safeUnlinked.length > 0 ||
    (report?.emptyAlbums.length ?? 0) > 0 ||
    (report?.emptyBands.length ?? 0) > 0;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-surface-100 mb-1">Database Health</h1>
        <p className="text-sm text-surface-400">
          Detects orphaned and duplicate records that can prevent clean re-imports.
          Safe auto-fixes remove only records with no user data attached.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => scanMutation.mutate()}
          disabled={isBusy}
          className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {scanMutation.isPending ? 'Scanning…' : 'Scan Database'}
        </button>
        {statusMsg && (
          <span className={`text-sm ${statusMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
            {statusMsg.text}
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
              note="Songs whose album was deleted — they keep their lyrics but lose their place in the tracklist"
            />

            {report.unlinkedSongs.length > 0 && (
              <div className="space-y-4">
                {/* Safe-to-delete */}
                {safeUnlinked.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-surface-400">
                        {safeUnlinked.length} have no user data — safe to bulk-remove
                      </span>
                      <button
                        onClick={() => cleanupMutation.mutate(['delete_safe_unlinked'])}
                        disabled={isBusy}
                        className="px-3 py-1 rounded bg-red-700 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                      >
                        Delete {safeUnlinked.length} safe
                      </button>
                    </div>
                    <UnlinkedTable
                      songs={safeUnlinked}
                      relinking={relinking}
                      relinkTarget={relinkTarget}
                      albumsLoading={albumsLoading}
                      albumsForBand={albumsForBand}
                      isBusy={isBusy}
                      onOpenRelink={openRelink}
                      onSetRelinkTarget={setRelinkTarget}
                      onCancelRelink={() => { setRelinking(null); setRelinkTarget(''); }}
                      onConfirmRelink={(songId) => relinkMutation.mutate({ songId, albumId: relinkTarget })}
                      onDelete={(songId) => { if (window.confirm('Delete this song permanently?')) deleteSongMutation.mutate(songId); }}
                    />
                  </div>
                )}

                {/* Unsafe (has user data) */}
                {report.unlinkedSongs.filter((s) => !s.isSafeToDelete).length > 0 && (
                  <div>
                    <p className="text-xs text-amber-400 mb-2">
                      These have saved lyrics or ratings — use Re-link to restore them to an album, or delete with caution.
                    </p>
                    <UnlinkedTable
                      songs={report.unlinkedSongs.filter((s) => !s.isSafeToDelete)}
                      relinking={relinking}
                      relinkTarget={relinkTarget}
                      albumsLoading={albumsLoading}
                      albumsForBand={albumsForBand}
                      isBusy={isBusy}
                      showDataColumn
                      onOpenRelink={openRelink}
                      onSetRelinkTarget={setRelinkTarget}
                      onCancelRelink={() => { setRelinking(null); setRelinkTarget(''); }}
                      onConfirmRelink={(songId) => relinkMutation.mutate({ songId, albumId: relinkTarget })}
                      onDelete={(songId, hasData) => {
                        const msg = hasData
                          ? 'This song has saved lyrics/ratings. Delete it permanently?'
                          : 'Delete this song permanently?';
                        if (window.confirm(msg)) deleteSongMutation.mutate(songId);
                      }}
                    />
                  </div>
                )}
              </div>
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
                    onClick={() => cleanupMutation.mutate(['delete_empty_albums'])}
                    disabled={isBusy}
                    className="px-3 py-1 rounded bg-red-700 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    Delete {report.emptyAlbums.length} empty albums
                  </button>
                </div>
                <SimpleTable
                  cols={['Band', 'Album', 'Slug']}
                  rows={report.emptyAlbums.map((a) => [a.bandName, a.title, a.slug])}
                />
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
              note="Bands left over after all content was removed"
            />
            {report.emptyBands.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => cleanupMutation.mutate(['delete_empty_bands'])}
                    disabled={isBusy}
                    className="px-3 py-1 rounded bg-red-700 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    Delete {report.emptyBands.length} empty bands
                  </button>
                </div>
                <SimpleTable
                  cols={['Name', 'Slug']}
                  rows={report.emptyBands.map((b) => [b.name, b.slug])}
                />
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
                <p className="text-xs text-surface-500 mb-4">
                  Delete individual songs to keep the version you want, or delete an entire album (e.g. compilations / box sets that shouldn't be in the library).
                </p>
                {/* Group by album */}
                {groupByAlbum(report.duplicateTrackNumbers).map(({ albumId, albumTitle, bandName, groups }) => (
                  <div key={albumId} className="mb-5">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-medium text-surface-200">
                        {bandName} / {albumTitle}
                      </span>
                      {confirmAlbum?.albumId === albumId ? (
                        <span className="text-xs text-red-300 flex items-center gap-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={deleteAlbumSongs}
                              onChange={(e) => setDeleteAlbumSongs(e.target.checked)}
                              className="accent-red-500"
                            />
                            also delete all its songs
                          </label>
                          <button
                            onClick={() => deleteAlbumMutation.mutate({ albumId, andSongs: deleteAlbumSongs })}
                            disabled={isBusy}
                            className="px-2 py-0.5 rounded bg-red-700 text-white text-xs hover:bg-red-600 disabled:opacity-50"
                          >
                            Confirm delete
                          </button>
                          <button
                            onClick={() => setConfirmAlbum(null)}
                            className="text-surface-400 hover:text-surface-200 text-xs"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => { setConfirmAlbum({ albumId, albumTitle, bandName }); setDeleteAlbumSongs(true); }}
                          disabled={isBusy}
                          className="px-2 py-0.5 rounded border border-red-700 text-red-400 text-xs hover:bg-red-900 disabled:opacity-50 transition-colors"
                        >
                          Delete album…
                        </button>
                      )}
                    </div>
                    <table className="w-full text-xs text-surface-300 border-collapse mb-2">
                      <thead>
                        <tr className="border-b border-surface-700 text-surface-500 text-left">
                          <th className="pb-1 pr-3 font-normal w-12">#</th>
                          <th className="pb-1 pr-4 font-normal">Song</th>
                          <th className="pb-1 pr-4 font-normal">Slug</th>
                          <th className="pb-1 font-normal" />
                        </tr>
                      </thead>
                      <tbody>
                        {groups.flatMap((g) =>
                          g.songs.map((s) => (
                            <tr key={s.id} className="border-b border-surface-800">
                              <td className="py-1 pr-3 text-surface-500">{g.trackNumber}</td>
                              <td className="py-1 pr-4">{s.title}</td>
                              <td className="py-1 pr-4 font-mono text-surface-500">{s.slug}</td>
                              <td className="py-1 text-right">
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Delete "${s.title}" permanently?`)) {
                                      deleteSongMutation.mutate(s.id);
                                    }
                                  }}
                                  disabled={isBusy}
                                  className="px-2 py-0.5 rounded bg-red-800 text-red-200 text-xs hover:bg-red-700 disabled:opacity-50 transition-colors"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ))}
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
              note="Set core scores in Quick Score, or run AI Spectrum in the Batch Runner"
            />
            {report.songsWithoutScores.length > 0 && (
              <>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => navigate('/admin/hub?tab=score')}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Quick Score Songs →
                  </button>
                  <button
                    onClick={() => navigate('/admin/ai-batch')}
                    className="text-xs px-3 py-1.5 border border-surface-600 text-surface-300 rounded hover:bg-surface-700 transition-colors"
                  >
                    AI Batch Runner →
                  </button>
                </div>
                <SimpleTable
                  cols={['Band', 'Album', 'Song']}
                  rows={report.songsWithoutScores.map((s) => [s.bandName, s.albumTitle ?? '—', s.title])}
                />
              </>
            )}
            {report.songsWithoutScores.length === 0 && (
              <p className="text-xs text-surface-500">All songs have spectrum scores.</p>
            )}
          </section>

          {/* ── Albums without artwork ── */}
          <section className="bg-surface-850 rounded-lg p-5 border border-surface-700">
            <SectionHeader
              label="Albums without artwork"
              count={report.albumsWithoutArtwork.length}
              note="Albums with songs but no cover art stored — affects Band 2048 tiles and library display"
            />
            {report.albumsWithoutArtwork.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <Link
                    to="/admin/missing-artwork"
                    className="px-3 py-1.5 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 transition-colors"
                  >
                    Fix artwork in Missing Art page →
                  </Link>
                </div>
                <SimpleTable
                  cols={['Band', 'Album', 'Year', 'Songs']}
                  rows={report.albumsWithoutArtwork.slice(0, 15).map((a) => [
                    a.bandName, a.title, a.year != null ? String(a.year) : '—', String(a.songCount),
                  ])}
                />
                {report.albumsWithoutArtwork.length > 15 && (
                  <p className="text-xs text-surface-500 mt-2">
                    …and {report.albumsWithoutArtwork.length - 15} more.{' '}
                    <Link to="/admin/missing-artwork" className="text-indigo-400 hover:underline">
                      View all in Missing Art page →
                    </Link>
                  </p>
                )}
              </>
            )}
            {report.albumsWithoutArtwork.length === 0 && (
              <p className="text-xs text-surface-500">All albums with songs have artwork.</p>
            )}
          </section>

          {/* ── Albums without release year ── */}
          <section className="bg-surface-850 rounded-lg p-5 border border-surface-700">
            <SectionHeader
              label="Albums without release year"
              count={report.albumsWithoutYear.length}
              note="Missing year prevents correct ordering in Band 2048 and timeline features"
            />
            {report.albumsWithoutYear.length > 0 && (
              <>
                <p className="text-xs text-surface-500 mb-3">
                  Edit each album in the Library to set its year. Click an album name to open it.
                </p>
                <table className="w-full text-xs text-surface-300 border-collapse">
                  <thead>
                    <tr className="border-b border-surface-700 text-surface-500 text-left">
                      <th className="pb-1 pr-4 font-normal">Band</th>
                      <th className="pb-1 pr-4 font-normal">Album</th>
                      <th className="pb-1 font-normal">Songs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.albumsWithoutYear.slice(0, 15).map((a) => (
                      <tr key={a.id} className="border-b border-surface-800">
                        <td className="py-1 pr-4">{a.bandName}</td>
                        <td className="py-1 pr-4">
                          <Link to={`/library/albums/${a.id}`} className="text-indigo-400 hover:underline">
                            {a.title}
                          </Link>
                        </td>
                        <td className="py-1">{a.songCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.albumsWithoutYear.length > 15 && (
                  <p className="text-xs text-surface-500 mt-2">…and {report.albumsWithoutYear.length - 15} more.</p>
                )}
              </>
            )}
            {report.albumsWithoutYear.length === 0 && (
              <p className="text-xs text-surface-500">All albums with songs have a release year.</p>
            )}
          </section>

          {/* ── Fix all safe ── */}
          {hasAnySafeIssues && (
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-surface-700">
              <span className="text-xs text-surface-400">Fix all safe issues at once:</span>
              <button
                onClick={() =>
                  cleanupMutation.mutate([
                    ...(safeUnlinked.length > 0 ? ['delete_safe_unlinked'] : []),
                    ...((report.emptyAlbums.length ?? 0) > 0 ? ['delete_empty_albums'] : []),
                    ...((report.emptyBands.length ?? 0) > 0 ? ['delete_empty_bands'] : []),
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

// ─── sub-components ──────────────────────────────────────────────────────────

function UnlinkedTable({
  songs,
  relinking,
  relinkTarget,
  albumsLoading,
  albumsForBand,
  isBusy,
  showDataColumn = false,
  onOpenRelink,
  onSetRelinkTarget,
  onCancelRelink,
  onConfirmRelink,
  onDelete,
}: {
  songs: UnlinkedSong[];
  relinking: string | null;
  relinkTarget: string;
  albumsLoading: boolean;
  albumsForBand: (bandId: string) => AlbumOption[];
  isBusy: boolean;
  showDataColumn?: boolean;
  onOpenRelink: (id: string) => void;
  onSetRelinkTarget: (v: string) => void;
  onCancelRelink: () => void;
  onConfirmRelink: (id: string) => void;
  onDelete: (id: string, hasData: boolean) => void;
}) {
  return (
    <table className="w-full text-xs text-surface-300 border-collapse">
      <thead>
        <tr className="border-b border-surface-700 text-surface-500 text-left">
          <th className="pb-1 pr-4 font-normal">Band</th>
          <th className="pb-1 pr-4 font-normal">Song</th>
          {showDataColumn && <th className="pb-1 pr-4 font-normal">Attached data</th>}
          <th className="pb-1 font-normal" />
        </tr>
      </thead>
      <tbody>
        {songs.map((s) => (
          <>
            <tr key={s.id} className="border-b border-surface-800">
              <td className="py-1.5 pr-4">{s.bandName}</td>
              <td className="py-1.5 pr-4">{s.title}</td>
              {showDataColumn && (
                <td className="py-1.5 pr-4 text-amber-400">
                  {[
                    s.lyricCount > 0 ? `${s.lyricCount} lyric${s.lyricCount !== 1 ? 's' : ''}` : null,
                    s.ratingCount > 0 ? `${s.ratingCount} rating${s.ratingCount !== 1 ? 's' : ''}` : null,
                    s.commentCount > 0 ? `${s.commentCount} comment${s.commentCount !== 1 ? 's' : ''}` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </td>
              )}
              <td className="py-1.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  {relinking !== s.id && (
                    <button
                      onClick={() => onOpenRelink(s.id)}
                      disabled={isBusy}
                      className="px-2 py-0.5 rounded border border-indigo-600 text-indigo-300 text-xs hover:bg-indigo-900 disabled:opacity-50 transition-colors"
                    >
                      Re-link
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(s.id, !s.isSafeToDelete)}
                    disabled={isBusy}
                    className="px-2 py-0.5 rounded bg-red-800 text-red-200 text-xs hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
            {relinking === s.id && (
              <tr key={`${s.id}-relink`} className="border-b border-indigo-900 bg-indigo-950/30">
                <td colSpan={showDataColumn ? 4 : 3} className="py-2 px-2">
                  {albumsLoading ? (
                    <span className="text-surface-400 text-xs">Loading albums…</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-surface-400 text-xs shrink-0">Link to album:</span>
                      <select
                        value={relinkTarget}
                        onChange={(e) => onSetRelinkTarget(e.target.value)}
                        className="flex-1 min-w-48 bg-surface-800 border border-surface-600 rounded px-2 py-1 text-xs text-surface-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="">— choose album —</option>
                        {albumsForBand(s.bandId).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title}{a.year ? ` (${a.year})` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onConfirmRelink(s.id)}
                        disabled={!relinkTarget || isBusy}
                        className="px-3 py-1 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={onCancelRelink}
                        className="px-2 py-1 text-xs text-surface-400 hover:text-surface-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  );
}

function SimpleTable({ cols, rows }: { cols: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-xs text-surface-300 border-collapse">
      <thead>
        <tr className="border-b border-surface-700 text-surface-500 text-left">
          {cols.map((c) => (
            <th key={c} className="pb-1 pr-4 font-normal">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-surface-800">
            {row.map((cell, j) => (
              <td key={j} className="py-1 pr-4">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── utils ───────────────────────────────────────────────────────────────────

function groupByAlbum(groups: DuplicateTrackGroup[]) {
  const map = new Map<string, {
    albumId: string;
    albumTitle: string;
    bandName: string;
    groups: DuplicateTrackGroup[];
  }>();
  for (const g of groups) {
    if (!map.has(g.albumId)) {
      map.set(g.albumId, { albumId: g.albumId, albumTitle: g.albumTitle, bandName: g.bandName, groups: [] });
    }
    map.get(g.albumId)!.groups.push(g);
  }
  return Array.from(map.values());
}

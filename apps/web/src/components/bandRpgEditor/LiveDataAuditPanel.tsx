import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bandRpgApi, type SongAlias, type UnmatchedSetlistFmTitle, type ZeroMatchBsmSong } from '../../api/bandRpg';

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-center">
      <div className="text-lg font-bold text-surface-800">{value}</div>
      <div className="text-xs text-surface-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-surface-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function AliasRow({
  alias,
  onDelete,
  isDeleting,
}: {
  alias: SongAlias;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  return (
    <tr className="border-t border-surface-100">
      <td className="py-2 pr-3 text-sm font-mono text-surface-700">{alias.setlistFmTitle}</td>
      <td className="py-2 pr-3 text-sm text-surface-600">
        {alias.songId ? (
          <span className="font-medium text-emerald-700">{alias.songTitle ?? alias.songId}</span>
        ) : (
          <span className="text-surface-400 italic">Ignore</span>
        )}
      </td>
      <td className="py-2 pr-3 text-xs text-surface-400">{alias.note ?? '—'}</td>
      <td className="py-2 text-right">
        <button
          onClick={() => onDelete(alias.id)}
          disabled={isDeleting}
          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function AddAliasForm({
  bandId,
  setlistFmTitle,
  onSuccess,
}: {
  bandId: string;
  setlistFmTitle: string;
  onSuccess: () => void;
}) {
  const [songSearchQuery, setSongSearchQuery] = useState('');
  const [mode, setMode] = useState<'link' | 'ignore'>('link');

  const { data: songs = [] } = useQuery({
    queryKey: ['songs-for-band', bandId],
    queryFn:  async () => {
      const res = await fetch(`/api/band-rpg/songs?bandId=${encodeURIComponent(bandId)}`);
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ id: string; title: string }>>;
    },
    enabled: !!bandId,
    staleTime: 60_000,
  });

  const filteredSongs = songs.filter((s) =>
    s.title.toLowerCase().includes(songSearchQuery.toLowerCase()),
  );

  const createMutation = useMutation({
    mutationFn: (songId: string | null) =>
      bandRpgApi.createSongAlias(bandId, setlistFmTitle, songId),
    onSuccess,
  });

  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
      <div className="text-xs font-medium text-indigo-900">
        Map "<span className="font-mono">{setlistFmTitle}</span>" to:
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setMode('link')}
          className={`text-xs px-2 py-1 rounded border ${mode === 'link' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-surface-700 border-surface-300'}`}
        >
          Link to BSM song
        </button>
        <button
          onClick={() => setMode('ignore')}
          className={`text-xs px-2 py-1 rounded border ${mode === 'ignore' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-surface-700 border-surface-300'}`}
        >
          Ignore this title
        </button>
      </div>
      {mode === 'link' && (
        <>
          <input
            type="text"
            placeholder="Search songs…"
            value={songSearchQuery}
            onChange={(e) => setSongSearchQuery(e.target.value)}
            className="w-full border border-surface-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"
          />
          <div className="max-h-32 overflow-y-auto space-y-1">
            {filteredSongs.slice(0, 20).map((s) => (
              <button
                key={s.id}
                onClick={() => createMutation.mutate(s.id)}
                disabled={createMutation.isPending}
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-indigo-100 text-surface-800 disabled:opacity-50"
              >
                {s.title}
              </button>
            ))}
            {filteredSongs.length === 0 && (
              <p className="text-xs text-surface-400 px-2">No songs found.</p>
            )}
          </div>
        </>
      )}
      {mode === 'ignore' && (
        <button
          onClick={() => createMutation.mutate(null)}
          disabled={createMutation.isPending}
          className="text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-3 py-1.5 rounded"
        >
          {createMutation.isPending ? 'Saving…' : 'Mark as Ignore'}
        </button>
      )}
      {createMutation.isError && (
        <p className="text-xs text-red-600">Failed to save alias.</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiveDataAuditPanel({ bandId }: { bandId: string }) {
  const queryClient = useQueryClient();
  const [expandUnmatched, setExpandUnmatched] = useState(true);
  const [expandZeroMatch, setExpandZeroMatch] = useState(false);
  const [expandAliases,   setExpandAliases]   = useState(false);
  const [addingAliasFor,  setAddingAliasFor]  = useState<string | null>(null);
  const [deletingId,      setDeletingId]       = useState<string | null>(null);
  const [reanalysisMsg,   setReanalysisMsg]    = useState<string | null>(null);

  const { data: audit, isLoading, isError, refetch } = useQuery({
    queryKey: ['live-data-audit', bandId],
    queryFn:  () => bandRpgApi.getLiveDataAudit(bandId),
    enabled:  !!bandId,
    staleTime: 30_000,
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () => bandRpgApi.reanalyzeLiveData(bandId),
    onSuccess: (r) => {
      setReanalysisMsg(`Re-analysis complete — ${r.updatedSongs} song profiles updated from ${r.rawEntries} raw entries.`);
      void queryClient.invalidateQueries({ queryKey: ['live-data-audit', bandId] });
      void queryClient.invalidateQueries({ queryKey: ['live-data-status', bandId] });
    },
  });

  const deleteAliasMutation = useMutation({
    mutationFn: (id: string) => {
      setDeletingId(id);
      return bandRpgApi.deleteSongAlias(id);
    },
    onSuccess: () => {
      setDeletingId(null);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ['live-data-status', bandId] });
    },
    onError: () => setDeletingId(null),
  });

  if (isLoading) {
    return <p className="text-sm text-surface-400 py-4">Loading audit data…</p>;
  }
  if (isError || !audit) {
    return <p className="text-sm text-red-600 py-4">Failed to load audit data.</p>;
  }
  if (!audit.hasRawData) {
    return (
      <div className="rounded-lg border border-surface-200 bg-surface-50 p-5 text-sm text-surface-500">
        No raw Setlist.fm data stored yet.
        Fetch live data first — the audit becomes available after the first successful (or partial) fetch.
      </div>
    );
  }

  const matchPct = audit.totalUniqueSetlistFmTitles > 0
    ? Math.round((audit.matchedTitles / audit.totalUniqueSetlistFmTitles) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Raw appearances" value={audit.totalRawEntries.toLocaleString()} />
        <StatTile label="Unique Setlist.fm titles" value={audit.totalUniqueSetlistFmTitles.toLocaleString()} />
        <StatTile label="Matched titles" value={`${matchPct}%`} sub={`${audit.matchedTitles} of ${audit.totalUniqueSetlistFmTitles}`} />
        <StatTile label="Unmatched titles" value={audit.unmatchedTitles.toLocaleString()} sub="Click below to review" />
      </div>

      {/* Re-analyze button */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => { setReanalysisMsg(null); reanalyzeMutation.mutate(); }}
          disabled={reanalyzeMutation.isPending}
          className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {reanalyzeMutation.isPending ? 'Re-analyzing…' : '🔄 Re-analyze Local Setlist Data'}
        </button>
        <span className="text-xs text-surface-500">
          Applies current aliases and title rules — no Setlist.fm API call.
        </span>
      </div>
      {reanalysisMsg && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-800">
          ✓ {reanalysisMsg}
        </div>
      )}
      {reanalyzeMutation.isError && (
        <p className="text-sm text-red-600">Re-analysis failed. Check server logs.</p>
      )}

      {/* Unmatched Setlist.fm titles */}
      <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
        <button
          onClick={() => setExpandUnmatched((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-surface-50"
        >
          <span className="font-semibold text-surface-900 text-sm">
            Unmatched Setlist.fm Titles
            <span className="ml-2 text-xs font-normal text-surface-500">
              ({audit.unmatchedTitles} titles, top {audit.unmatchedSetlistFmTitles.length} shown)
            </span>
          </span>
          <span className="text-surface-400 text-sm">{expandUnmatched ? '▲' : '▼'}</span>
        </button>
        {expandUnmatched && (
          <div className="border-t border-surface-100">
            {audit.unmatchedSetlistFmTitles.length === 0 ? (
              <p className="px-5 py-4 text-sm text-emerald-700">All Setlist.fm titles are matched.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {audit.unmatchedSetlistFmTitles.map((item: UnmatchedSetlistFmTitle) => (
                  <div key={item.title} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-sm text-surface-900">{item.title}</span>
                        <span className="ml-2 text-xs text-surface-400">
                          {item.appearances} appearance{item.appearances !== 1 ? 's' : ''}
                        </span>
                        {item.possibleMatches.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.possibleMatches.map((m) => (
                              <span key={m.songTitle} className="inline-block bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 text-xs">
                                ≈ {m.songTitle} ({Math.round(m.score * 100)}%)
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setAddingAliasFor(addingAliasFor === item.title ? null : item.title)}
                        className="flex-shrink-0 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded"
                      >
                        {addingAliasFor === item.title ? 'Cancel' : '+ Alias'}
                      </button>
                    </div>
                    {addingAliasFor === item.title && (
                      <AddAliasForm
                        bandId={bandId}
                        setlistFmTitle={item.title}
                        onSuccess={() => {
                          setAddingAliasFor(null);
                          void refetch();
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BSM songs with zero matches */}
      <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
        <button
          onClick={() => setExpandZeroMatch((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-surface-50"
        >
          <span className="font-semibold text-surface-900 text-sm">
            BSM Songs With Zero Plays
            <span className="ml-2 text-xs font-normal text-surface-500">
              ({audit.bsmSongsWithZeroMatches} songs)
            </span>
          </span>
          <span className="text-surface-400 text-sm">{expandZeroMatch ? '▲' : '▼'}</span>
        </button>
        {expandZeroMatch && (
          <div className="border-t border-surface-100">
            {audit.zeroMatchBsmSongs.length === 0 ? (
              <p className="px-5 py-4 text-sm text-emerald-700">All songs have at least one live play.</p>
            ) : (
              <div className="divide-y divide-surface-100">
                {audit.zeroMatchBsmSongs.map((s: ZeroMatchBsmSong) => (
                  <div key={s.songId} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-medium text-sm text-surface-900">{s.songTitle}</span>
                        {s.albumTitle && (
                          <span className="ml-2 text-xs text-surface-400">{s.albumTitle}</span>
                        )}
                        {s.suspiciousReasons.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {s.suspiciousReasons.map((r) => (
                              <span key={r} className="inline-block bg-red-100 text-red-700 border border-red-200 rounded px-1.5 py-0.5 text-xs">
                                ⚠ {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {s.possibleSetlistFmMatches.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {s.possibleSetlistFmMatches.map((m) => (
                              <span key={m.title} className="inline-block bg-amber-100 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 text-xs">
                                ≈ "{m.title}" ({m.appearances} plays, {Math.round(m.score * 100)}%)
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {s.possibleSetlistFmMatches.length > 0 && (
                        <button
                          onClick={() => {
                            const best = s.possibleSetlistFmMatches[0];
                            if (best?.title) setAddingAliasFor(best.title);
                          }}
                          className="flex-shrink-0 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded"
                        >
                          Fix Alias
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aliases */}
      <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
        <button
          onClick={() => setExpandAliases((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-surface-50"
        >
          <span className="font-semibold text-surface-900 text-sm">
            Active Aliases
            <span className="ml-2 text-xs font-normal text-surface-500">
              ({audit.aliases.length})
            </span>
          </span>
          <span className="text-surface-400 text-sm">{expandAliases ? '▲' : '▼'}</span>
        </button>
        {expandAliases && (
          <div className="border-t border-surface-100 p-5">
            {audit.aliases.length === 0 ? (
              <p className="text-sm text-surface-400">No aliases defined yet.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-surface-500 border-b border-surface-200">
                    <th className="pb-2 pr-3">Setlist.fm title</th>
                    <th className="pb-2 pr-3">Maps to</th>
                    <th className="pb-2 pr-3">Note</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {audit.aliases.map((a: SongAlias) => (
                    <AliasRow
                      key={a.id}
                      alias={a}
                      onDelete={(id) => deleteAliasMutation.mutate(id)}
                      isDeleting={deletingId === a.id && deleteAliasMutation.isPending}
                    />
                  ))}
                </tbody>
              </table>
            )}
            {deleteAliasMutation.isError && (
              <p className="mt-2 text-xs text-red-600">Delete failed. Check server logs.</p>
            )}
          </div>
        )}
      </div>

      {/* Glossary */}
      <div className="rounded-lg border border-surface-100 bg-surface-50 p-4 text-xs text-surface-500 space-y-1">
        <p><strong className="text-surface-700">Setlist.fm title</strong> — raw song name as returned by the Setlist.fm API.</p>
        <p><strong className="text-surface-700">BSM song</strong> — the canonical song record in this database.</p>
        <p><strong className="text-surface-700">Alias</strong> — a manual mapping from a Setlist.fm title to a BSM song. Fixes mismatches without re-fetching.</p>
        <p><strong className="text-surface-700">Fuzzy score</strong> — Jaccard word-overlap similarity (0–100%). Used to surface likely matches, not applied automatically.</p>
        <p><strong className="text-surface-700">Re-analyze Local Data</strong> — recomputes play counts and liveStatus from stored raw data using current aliases. Does not call Setlist.fm.</p>
      </div>
    </div>
  );
}

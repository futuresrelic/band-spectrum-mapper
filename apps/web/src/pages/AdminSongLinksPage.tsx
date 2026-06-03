/**
 * Admin: Song Source Linker
 *
 * Links live, bootleg, demo, and single recordings to their studio originals
 * so lyrics can be inherited in bulk. Fuzzy title matching happens entirely
 * client-side — no AI needed.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader';

// ── Types ──────────────────────────────────────────────────────────────────────

type SongRow = {
  id: string;
  title: string;
  bandId: string;
  bandName: string;
  albumId: string | null;
  albumTitle: string | null;
  albumType: string | null;
  albumYear: number | null;
  sourceSongId: string | null;
  hasLyrics: boolean;
};

type LinkRow = {
  song: SongRow;
  suggestedSourceId: string | null;
  confidence: number;
  chosenSourceId: string | null;
  copyLyrics: boolean;
  status: 'pending' | 'linked' | 'skipped' | 'error';
};

// ── Title normalization + similarity ───────────────────────────────────────────

const STRIP_RE = /[\[(][^\])]*(live|boot|demo|remix|remaster|acoustic|radio|edit|cover|version|feat|ft\.|session|take|alt)[^\])]*[\])]/gi;
const SUFFIX_RE = /\s*[-–—]\s*(live|bootleg|demo|remix|remaster|acoustic|radio edit|extended|feat\..+|session|take \d+|alt(ernate)?)(\s|$).*/i;

function normTitle(s: string): string {
  return s
    .replace(STRIP_RE, '')
    .replace(SUFFIX_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j]!, row[j - 1]!);
      prev = tmp;
    }
  }
  return row[n]!;
}

function similarity(a: string, b: string): number {
  const na = normTitle(a), nb = normTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.startsWith(nb) || nb.startsWith(na)) return 0.95;
  if (na.includes(nb) || nb.includes(na)) return 0.88;
  const dist = levenshtein(na, nb);
  return Math.max(0, 1 - dist / Math.max(na.length, nb.length));
}

function bestMatch(song: SongRow, studioSongs: SongRow[]): { id: string; confidence: number } | null {
  let best: { id: string; confidence: number } | null = null;
  const sameBand = studioSongs.filter(s => s.bandId === song.bandId);
  for (const s of sameBand) {
    const c = similarity(song.title, s.title);
    if (!best || c > best.confidence) best = { id: s.id, confidence: c };
  }
  return best;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DERIVATION_TYPES = new Set(['live', 'bootleg', 'demo', 'single', 'ep', 'compilation']);

const TYPE_BADGE: Record<string, string> = {
  live: 'bg-blue-900/60 text-blue-300',
  bootleg: 'bg-orange-900/60 text-orange-300',
  demo: 'bg-purple-900/60 text-purple-300',
  single: 'bg-green-900/60 text-green-300',
  ep: 'bg-teal-900/60 text-teal-300',
  compilation: 'bg-yellow-900/60 text-yellow-300',
  studio: 'bg-gray-800 text-gray-400',
};

function confidenceColor(c: number): string {
  if (c >= 0.9) return 'text-green-400';
  if (c >= 0.7) return 'text-yellow-400';
  return 'text-red-400';
}
function confidenceBg(c: number): string {
  if (c >= 0.9) return 'bg-green-500';
  if (c >= 0.7) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminSongLinksPage() {
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'unlinked' | 'linked'>('all');
  const [minConfidence, setMinConfidence] = useState(0.8);
  const [globalCopyLyrics, setGlobalCopyLyrics] = useState(true);
  const [bulkResult, setBulkResult] = useState<{ linked: number; lyricsInherited: number } | null>(null);
  const [isDetected, setIsDetected] = useState(false);

  // Load bands
  const bandsQuery = useQuery({
    queryKey: ['bands-list'],
    queryFn: () => api.get<{ bands: { id: string; name: string }[] }>('/api/public/graph/scopes'),
    select: d => d.bands,
  });

  const bands = bandsQuery.data ?? [];

  // Load candidates
  const {
    data: candidateData,
    isFetching: isLoading,
    refetch: loadCandidates,
  } = useQuery({
    queryKey: ['song-link-candidates', selectedBandIds.join(',')],
    queryFn: () => api.get<{ songs: SongRow[] }>(
      `/api/song-links/candidates?bandIds=${selectedBandIds.join(',')}`
    ),
    enabled: false,
  });

  // Bulk link mutation
  const bulkMutation = useMutation({
    mutationFn: (links: { songId: string; sourceSongId: string; copyLyrics: boolean }[]) =>
      api.post<{ linked: number; lyricsInherited: number; errors: unknown[] }>(
        '/api/song-links/bulk',
        { links }
      ),
    onSuccess: (result) => {
      setBulkResult(result);
      // Mark linked rows in state
      setRows(prev => prev.map(r => {
        if (r.chosenSourceId && r.status === 'pending') {
          return { ...r, status: 'linked', song: { ...r.song, sourceSongId: r.chosenSourceId } };
        }
        return r;
      }));
    },
  });

  // Run auto-detect after loading candidates
  const runAutoDetect = useCallback(() => {
    if (!candidateData?.songs.length) return;
    const allSongs = candidateData.songs;
    const studio = allSongs.filter(s => s.albumType === 'studio');
    const derivations = allSongs.filter(
      s => s.albumType !== null && DERIVATION_TYPES.has(s.albumType)
    );

    const newRows: LinkRow[] = derivations.map(song => {
      const match = bestMatch(song, studio);
      const chosenSourceId = song.sourceSongId ?? (match && match.confidence >= 0.6 ? match.id : null);
      return {
        song,
        suggestedSourceId: match?.id ?? null,
        confidence: match?.confidence ?? 0,
        chosenSourceId,
        copyLyrics: globalCopyLyrics && !song.hasLyrics,
        status: song.sourceSongId ? 'linked' : 'pending',
      };
    });

    setRows(newRows);
    setIsDetected(true);
  }, [candidateData, globalCopyLyrics]);

  const handleLoad = useCallback(async () => {
    setBulkResult(null);
    setIsDetected(false);
    setRows([]);
    await loadCandidates();
  }, [loadCandidates]);

  // Call auto-detect when data becomes available
  useMemo(() => {
    if (candidateData && !isLoading) {
      runAutoDetect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateData, isLoading]);

  const studioSongs = useMemo(() =>
    (candidateData?.songs ?? []).filter(s => s.albumType === 'studio'),
    [candidateData]
  );

  const studioByBand = useMemo(() => {
    const map = new Map<string, SongRow[]>();
    for (const s of studioSongs) {
      const arr = map.get(s.bandId) ?? [];
      arr.push(s);
      map.set(s.bandId, arr);
    }
    return map;
  }, [studioSongs]);

  const filteredRows = useMemo(() => {
    if (filter === 'unlinked') return rows.filter(r => r.status === 'pending');
    if (filter === 'linked') return rows.filter(r => r.status === 'linked');
    return rows;
  }, [rows, filter]);

  const pendingRows = rows.filter(r => r.status === 'pending');
  const linkedRows = rows.filter(r => r.status === 'linked');
  const highConfidence = pendingRows.filter(r => r.chosenSourceId && r.confidence >= minConfidence);

  const updateRow = (songId: string, patch: Partial<LinkRow>) => {
    setRows(prev => prev.map(r => r.song.id === songId ? { ...r, ...patch } : r));
  };

  const handleBulkLink = () => {
    const toLink = highConfidence
      .filter(r => r.chosenSourceId)
      .map(r => ({ songId: r.song.id, sourceSongId: r.chosenSourceId!, copyLyrics: r.copyLyrics }));
    if (toLink.length === 0) return;
    setBulkResult(null);
    bulkMutation.mutate(toLink);
  };

  const handleLinkAll = () => {
    const toLink = pendingRows
      .filter(r => r.chosenSourceId)
      .map(r => ({ songId: r.song.id, sourceSongId: r.chosenSourceId!, copyLyrics: r.copyLyrics }));
    if (toLink.length === 0) return;
    setBulkResult(null);
    bulkMutation.mutate(toLink);
  };

  const toggleBand = (id: string) => {
    setSelectedBandIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <PageHeader
        title="Song Source Linker"
        subtitle="Link live, bootleg, and demo recordings to their studio originals — then inherit lyrics in bulk"
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Band picker ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-300">1. Select bands to process</div>
          <div className="flex flex-wrap gap-2">
            {bands.map(b => (
              <button
                key={b.id}
                onClick={() => toggleBand(b.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedBandIds.includes(b.id)
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {b.name}
              </button>
            ))}
            {selectedBandIds.length > 0 && (
              <button onClick={() => setSelectedBandIds([])}
                className="px-3 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-600 hover:text-gray-400">
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleLoad}
              disabled={selectedBandIds.length === 0 || isLoading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Loading…' : '2. Load & Auto-detect'}
            </button>
            {isDetected && (
              <span className="text-xs text-gray-500">
                {rows.length} derivations found across {studioSongs.length} studio songs
              </span>
            )}
          </div>
        </div>

        {/* ── Summary + bulk actions ── */}
        {isDetected && rows.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-gray-400">
                <span className="text-white font-semibold">{rows.length}</span> derivations
              </span>
              <span className="text-gray-400">
                <span className="text-green-400 font-semibold">{linkedRows.length}</span> already linked
              </span>
              <span className="text-gray-400">
                <span className="text-yellow-400 font-semibold">{pendingRows.length}</span> to review
              </span>
              <span className="text-gray-400">
                <span className="text-indigo-400 font-semibold">{highConfidence.length}</span>{' '}
                high-confidence (≥{Math.round(minConfidence * 100)}%)
              </span>
            </div>

            {/* Bulk action row */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input type="checkbox" checked={globalCopyLyrics}
                  onChange={e => {
                    setGlobalCopyLyrics(e.target.checked);
                    setRows(prev => prev.map(r => ({
                      ...r,
                      copyLyrics: e.target.checked && !r.song.hasLyrics && r.status === 'pending',
                    })));
                  }}
                  className="accent-indigo-500" />
                Copy lyrics when linking (only if song has none)
              </label>

              <div className="flex items-center gap-2 text-sm text-gray-400 ml-auto">
                <span>Min confidence:</span>
                <select
                  value={minConfidence}
                  onChange={e => setMinConfidence(Number(e.target.value))}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
                >
                  <option value={0.95}>95%</option>
                  <option value={0.9}>90%</option>
                  <option value={0.8}>80%</option>
                  <option value={0.7}>70%</option>
                </select>
              </div>

              <button
                onClick={handleBulkLink}
                disabled={highConfidence.length === 0 || bulkMutation.isPending}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {bulkMutation.isPending ? 'Linking…' : `Link ${highConfidence.length} high-confidence`}
              </button>

              <button
                onClick={handleLinkAll}
                disabled={pendingRows.filter(r => r.chosenSourceId).length === 0 || bulkMutation.isPending}
                className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200 text-sm font-medium hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Link all with a match
              </button>
            </div>

            {/* Result banner */}
            {bulkResult && (
              <div className="bg-green-900/30 border border-green-700/50 rounded-lg px-4 py-2 text-sm text-green-300">
                ✓ Linked {bulkResult.linked} songs
                {bulkResult.lyricsInherited > 0 && ` · Copied lyrics to ${bulkResult.lyricsInherited} songs`}
              </div>
            )}

            {/* Filter tabs */}
            <div className="flex gap-1 border-t border-gray-800 pt-3">
              {(['all', 'unlinked', 'linked'] as const).map(f => (
                <button key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {f === 'all' ? `All (${rows.length})` : f === 'unlinked' ? `To review (${pendingRows.length})` : `Linked (${linkedRows.length})`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Grid ── */}
        {isDetected && filteredRows.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_140px_1fr_80px_56px_80px] gap-2 px-4 py-2 border-b border-gray-800 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              <div>Song · Album</div>
              <div>Type</div>
              <div>Source (studio match)</div>
              <div>Confidence</div>
              <div>Lyrics</div>
              <div>Status</div>
            </div>

            <div className="divide-y divide-gray-800/60">
              {filteredRows.map(row => {
                const bandStudio = studioByBand.get(row.song.bandId) ?? [];
                const isAlreadyLinked = row.status === 'linked';
                const chosen = bandStudio.find(s => s.id === row.chosenSourceId);

                return (
                  <div
                    key={row.song.id}
                    className={`grid grid-cols-[1fr_140px_1fr_80px_56px_80px] gap-2 px-4 py-2.5 items-center hover:bg-gray-800/30 transition-colors ${
                      isAlreadyLinked ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Song info */}
                    <div className="min-w-0">
                      <div className="text-sm text-white font-medium truncate">{row.song.title}</div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {row.song.albumTitle ?? '—'}
                        {row.song.albumYear ? ` (${row.song.albumYear})` : ''}
                        {row.song.bandName !== row.song.bandName ? ` · ${row.song.bandName}` : ''}
                      </div>
                    </div>

                    {/* Type badge */}
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                        TYPE_BADGE[row.song.albumType ?? ''] ?? 'bg-gray-800 text-gray-500'
                      }`}>
                        {row.song.albumType ?? '?'}
                      </span>
                    </div>

                    {/* Source picker */}
                    <div className="min-w-0">
                      {isAlreadyLinked ? (
                        <div className="text-[11px] text-green-400 truncate">
                          ✓ {chosen?.title ?? 'Linked'}
                          {chosen?.albumTitle ? ` — ${chosen.albumTitle}` : ''}
                        </div>
                      ) : bandStudio.length === 0 ? (
                        <span className="text-[11px] text-gray-600">No studio songs loaded</span>
                      ) : (
                        <select
                          value={row.chosenSourceId ?? ''}
                          onChange={e => updateRow(row.song.id, { chosenSourceId: e.target.value || null })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 truncate"
                        >
                          <option value="">— No match</option>
                          {bandStudio
                            .sort((a, b) => {
                              const ca = similarity(row.song.title, a.title);
                              const cb = similarity(row.song.title, b.title);
                              return cb - ca;
                            })
                            .map(s => {
                              const conf = similarity(row.song.title, s.title);
                              return (
                                <option key={s.id} value={s.id}>
                                  {s.title}{s.albumTitle ? ` — ${s.albumTitle}` : ''} ({Math.round(conf * 100)}%)
                                </option>
                              );
                            })}
                        </select>
                      )}
                    </div>

                    {/* Confidence */}
                    <div className="flex flex-col gap-1">
                      {row.chosenSourceId && !isAlreadyLinked ? (
                        <>
                          <span className={`text-xs font-semibold ${confidenceColor(row.confidence)}`}>
                            {Math.round(row.confidence * 100)}%
                          </span>
                          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${confidenceBg(row.confidence)}`}
                              style={{ width: `${Math.round(row.confidence * 100)}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>

                    {/* Copy lyrics toggle */}
                    <div className="flex justify-center">
                      {!isAlreadyLinked && row.chosenSourceId && (
                        <input
                          type="checkbox"
                          checked={row.copyLyrics}
                          onChange={e => updateRow(row.song.id, { copyLyrics: e.target.checked })}
                          title={row.song.hasLyrics ? 'Song already has lyrics' : 'Copy lyrics from source'}
                          disabled={row.song.hasLyrics}
                          className="accent-indigo-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      )}
                      {row.song.hasLyrics && (
                        <span className="text-[10px] text-gray-600" title="Song already has its own lyrics">✓</span>
                      )}
                    </div>

                    {/* Status + per-row action */}
                    <div className="flex justify-end">
                      {isAlreadyLinked ? (
                        <span className="text-[10px] text-green-500 font-medium">Linked</span>
                      ) : row.chosenSourceId ? (
                        <button
                          onClick={() => {
                            bulkMutation.mutate([{
                              songId: row.song.id,
                              sourceSongId: row.chosenSourceId!,
                              copyLyrics: row.copyLyrics,
                            }]);
                          }}
                          disabled={bulkMutation.isPending}
                          className="px-2 py-1 rounded text-[11px] bg-indigo-700 text-white hover:bg-indigo-600 disabled:opacity-40 transition-colors"
                        >
                          Link
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-600">Skip</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {isDetected && rows.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <div className="text-gray-500 text-sm">
              No live, bootleg, demo, EP, or single songs found for the selected bands.
            </div>
            <div className="text-gray-600 text-xs mt-1">
              Make sure the albums are imported with their correct album type.
            </div>
          </div>
        )}

        {/* ── How it works ── */}
        {!isDetected && (
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4 text-xs text-gray-600 space-y-1">
            <div className="font-semibold text-gray-500 mb-2">How it works</div>
            <div>1. Select one or more bands, then click Load & Auto-detect.</div>
            <div>2. All songs on live, bootleg, demo, EP, single, and compilation albums are matched against studio tracks by title similarity.</div>
            <div>3. Review the suggestions, adjust any wrong matches with the dropdown, then link in bulk.</div>
            <div>4. Optionally inherit lyrics — the derived song gets its own editable copy so you can adjust later.</div>
            <div className="pt-2 text-gray-700">Confidence ≥ 90% = exact or near-exact title match · 70–89% = likely · &lt; 70% = review carefully</div>
          </div>
        )}
      </div>
    </div>
  );
}

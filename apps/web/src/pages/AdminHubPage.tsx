import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { bandsApi } from '../api/bands';
import { songsApi } from '../api/songs';
import { analysisApi } from '../api/analysis';
import { musicBrainzApi, type AdminContributionItem } from '../api/musicbrainz';
import PageHeader from '../components/layout/PageHeader';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'status' | 'score' | 'contributions';

type AxisMap = {
  aggression: number; complexity: number; atmosphere: number;
  emotion: number; psychedelic: number; concept: number;
};

type DataGridRow = {
  id: string;
  title: string;
  bandId: string;
  bandName: string;
  albumTitle: string | null;
  trackNumber: number | null;
  isInstrumental: boolean;
  hasLyrics: boolean;
  hasAiAnalysis: boolean;
  coreScore: AxisMap | null;
  aiGenre: Record<string, number> | null;
};

type ScanResult = {
  total: number;
  has: Record<string, number>;
  missing: Record<string, number>;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const AXES = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
type Axis = (typeof AXES)[number];

const AXIS_LABELS: Record<Axis, string> = {
  aggression: 'Aggression', complexity: 'Complexity', atmosphere: 'Atmosphere',
  emotion: 'Emotion', psychedelic: 'Psychedelic', concept: 'Concept',
};

const JOB_LABELS: Record<string, string> = {
  analysis: 'Lyric Analysis', spectrum: 'AI Spectrum', research: 'Research',
  genre: 'Genre', context: 'Context', metadata: 'Duration',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreHue(v: number) {
  return `hsl(${Math.round((v / 10) * 120)}, 70%, 36%)`;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdminHubPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('status');

  // ── Status tab ──────────────────────────────────────────────────────────────
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const { data: pendingContributions = [] } = useQuery({
    queryKey: ['hub-pending'],
    queryFn: () => musicBrainzApi.getContributions('pending'),
    staleTime: 60_000,
  });

  async function runScan() {
    setScanning(true);
    try {
      setScan(await api.get<ScanResult>('/api/admin/ai-batch/scan'));
    } catch { /* ignore */ } finally {
      setScanning(false);
    }
  }

  // ── Quick Score tab ─────────────────────────────────────────────────────────
  const [selectedBandId, setSelectedBandId] = useState('');
  const [filterAlbum, setFilterAlbum] = useState('');
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);
  const [draftScore, setDraftScore] = useState<Record<Axis, number>>({
    aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5,
  });
  const [draftNotes, setDraftNotes] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [runningGenreId, setRunningGenreId] = useState<string | null>(null);

  const { data: bands = [] } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
    staleTime: 5 * 60_000,
  });

  const { data: gridRows = [], isLoading: gridLoading } = useQuery<DataGridRow[]>({
    queryKey: ['hub-grid', selectedBandId],
    queryFn: () => api.get<DataGridRow[]>(`/api/admin/data-grid?bandIds=${selectedBandId}`),
    enabled: !!selectedBandId,
    staleTime: 60_000,
  });

  const albumTitles = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of gridRows) {
      const t = r.albumTitle ?? '(unassigned)';
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out;
  }, [gridRows]);

  const visibleRows = useMemo(() =>
    filterAlbum
      ? gridRows.filter((r) => (r.albumTitle ?? '(unassigned)') === filterAlbum)
      : gridRows,
    [gridRows, filterAlbum],
  );

  const missingScoreCount = visibleRows.filter((r) => !r.coreScore).length;
  const missingGenreCount = visibleRows.filter((r) => !r.aiGenre).length;

  function expandSong(row: DataGridRow) {
    if (expandedSongId === row.id) { setExpandedSongId(null); return; }
    setExpandedSongId(row.id);
    if (row.coreScore) {
      setDraftScore({ ...row.coreScore });
    } else {
      setDraftScore({ aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5 });
    }
    setDraftNotes('');
  }

  async function saveScore(songId: string) {
    setSavingId(songId);
    try {
      await songsApi.upsertScore(songId, { ...draftScore, notes: draftNotes || null });
      setSavedIds((prev) => { const s = new Set(prev); s.add(songId); return s; });
      queryClient.setQueryData<DataGridRow[]>(['hub-grid', selectedBandId], (old) =>
        old ? old.map((r) => r.id === songId ? { ...r, coreScore: { ...draftScore } } : r) : old,
      );
      setExpandedSongId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  }

  async function runAiGenre(songId: string) {
    setRunningGenreId(songId);
    try {
      await analysisApi.regenerateAiGenreSpectrum(songId);
      queryClient.invalidateQueries({ queryKey: ['hub-grid', selectedBandId] });
    } catch { /* ignore */ } finally {
      setRunningGenreId(null);
    }
  }

  // ── Contributions tab ───────────────────────────────────────────────────────
  const { data: allContributions = [], refetch: refetchContribs } = useQuery({
    queryKey: ['hub-contribs'],
    queryFn: () => musicBrainzApi.getContributions('pending'),
    staleTime: 30_000,
  });

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  async function approveContrib(id: string) {
    setApprovingId(id);
    try {
      await musicBrainzApi.approveContribution(id);
      await refetchContribs();
      queryClient.invalidateQueries({ queryKey: ['hub-pending'] });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setApprovingId(null);
    }
  }

  async function rejectContrib(id: string) {
    try {
      await musicBrainzApi.rejectContribution(id, rejectNote || undefined);
      setRejectingId(null);
      setRejectNote('');
      await refetchContribs();
      queryClient.invalidateQueries({ queryKey: ['hub-pending'] });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Reject failed');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Admin Hub"
        subtitle="Library management, scoring, and contributions — all in one place"
      />

      {/* Tab bar */}
      <div className="flex border-b border-surface-200 mb-6">
        {(['status', 'score', 'contributions'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            {t === 'status' ? 'Overview' : t === 'score' ? 'Quick Score' : 'Contributions'}
            {t === 'contributions' && pendingContributions.length > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 align-middle">
                {pendingContributions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
      {tab === 'status' && (
        <div className="space-y-6">

          {/* Pending contributions alert */}
          {pendingContributions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-amber-800">
                  {pendingContributions.length} pending contribution{pendingContributions.length !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-amber-700 mt-0.5">
                  User-submitted bands waiting for review and import
                </p>
              </div>
              <button onClick={() => setTab('contributions')} className="btn-primary text-sm">
                Review now →
              </button>
            </div>
          )}

          {/* AI data scan */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-semibold">AI Data Coverage</p>
                <p className="text-xs text-surface-500 mt-0.5">
                  See which songs are missing AI-generated content
                </p>
              </div>
              <button
                onClick={() => void runScan()}
                disabled={scanning}
                className="btn-secondary text-sm"
              >
                {scanning ? 'Scanning…' : 'Scan now'}
              </button>
            </div>
            {scan ? (
              <div className="grid grid-cols-3 gap-3">
                {Object.keys(JOB_LABELS).map((job) => {
                  const missing = scan.missing[job] ?? 0;
                  const has = scan.has[job] ?? 0;
                  return (
                    <div
                      key={job}
                      className={`rounded-lg border p-3 ${
                        missing > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
                      }`}
                    >
                      <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide">
                        {JOB_LABELS[job]}
                      </p>
                      <p className={`text-lg font-bold mt-1 ${missing > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                        {missing > 0 ? `${missing} missing` : '✓ Complete'}
                      </p>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {has} / {scan.total} have data
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-surface-400">
                Click <strong>Scan now</strong> to check coverage across your entire library.
              </p>
            )}
          </div>

          {/* Tool shortcuts */}
          <div>
            <p className="text-sm font-semibold text-surface-700 mb-3 uppercase tracking-wide">Tools</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTab('score')}
                className="text-left p-4 rounded-lg border-2 border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 transition-colors"
              >
                <p className="font-semibold text-blue-800">Quick Score Songs</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Set core spectrum scores (6 axes) per song, inline
                </p>
              </button>
              <button
                onClick={() => setTab('contributions')}
                className="text-left p-4 rounded-lg border-2 border-amber-200 bg-amber-50 hover:border-amber-400 transition-colors"
              >
                <p className="font-semibold text-amber-800">Contributions Queue</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Review and approve user-submitted band discographies
                  {pendingContributions.length > 0 && ` · ${pendingContributions.length} pending`}
                </p>
              </button>

              {[
                { label: 'AI Batch Runner', desc: 'Analysis, spectrum, research, genre, context for all songs', path: '/admin/ai-batch' },
                { label: 'Lyrics Batch Fetcher', desc: 'Automatically fetch missing lyrics', path: '/admin/lyrics-batch' },
                { label: 'Song Source Linker', desc: 'Link live/bootleg/demo tracks to studio originals · inherit lyrics in bulk', path: '/admin/song-links' },
                { label: 'Discography Import', desc: 'Import artist discographies from MusicBrainz', path: '/discography' },
                { label: 'Data Grid', desc: 'Full song matrix — all scored data in one table', path: '/admin/data-grid' },
                { label: 'DB Health', desc: 'Find and fix integrity issues in the library', path: '/admin/db-health' },
                { label: 'Library', desc: 'Browse and manage bands, albums, and songs', path: '/library' },
              ].map(({ label, desc, path }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="text-left p-4 rounded-lg border border-surface-200 hover:border-surface-400 hover:bg-surface-50 transition-colors"
                >
                  <p className="font-medium text-surface-800">{label} ↗</p>
                  <p className="text-xs text-surface-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* How it all fits together */}
          <div className="card bg-surface-50 border border-surface-200">
            <p className="font-semibold text-surface-700 mb-2">Library Workflow</p>
            <ol className="text-sm text-surface-600 space-y-1 list-decimal list-inside">
              <li>Approve user contributions or import via Discography</li>
              <li>Run Lyrics Batch to fill missing song lyrics</li>
              <li>Run AI Batch: Analysis → Research → Context → Genre → Spectrum</li>
              <li>Set core spectrum scores per song here in Quick Score</li>
              <li>Users rate, comment, and improve community scores automatically</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── QUICK SCORE TAB ───────────────────────────────────────────────── */}
      {tab === 'score' && (
        <div className="space-y-4">
          <div className="card">
            <p className="font-semibold mb-1">Select a band</p>
            <p className="text-xs text-surface-500 mb-3">
              Click any song to open its scoring panel. Scores are saved immediately.
            </p>
            <div className="flex gap-3 flex-wrap">
              <select
                value={selectedBandId}
                onChange={(e) => {
                  setSelectedBandId(e.target.value);
                  setFilterAlbum('');
                  setExpandedSongId(null);
                  setSavedIds(new Set());
                }}
                className="input w-56"
              >
                <option value="">Choose band…</option>
                {bands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              {albumTitles.length > 1 && (
                <select
                  value={filterAlbum}
                  onChange={(e) => { setFilterAlbum(e.target.value); setExpandedSongId(null); }}
                  className="input w-64"
                >
                  <option value="">All albums ({gridRows.length} songs)</option>
                  {albumTitles.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {selectedBandId && (
            <div className="card p-0 overflow-hidden">
              {gridLoading ? (
                <div className="p-10 text-center text-surface-400 text-sm">Loading songs…</div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="px-4 py-2 bg-surface-50 border-b border-surface-200 flex items-center justify-between text-xs text-surface-500">
                    <span>
                      {visibleRows.length} songs
                      {missingScoreCount > 0 && (
                        <span className="ml-3 text-orange-600 font-medium">{missingScoreCount} need core score</span>
                      )}
                      {missingGenreCount > 0 && (
                        <span className="ml-3 text-surface-400">{missingGenreCount} need genre</span>
                      )}
                      {missingScoreCount === 0 && missingGenreCount === 0 && (
                        <span className="ml-3 text-green-600 font-medium">✓ All scored</span>
                      )}
                    </span>
                    <button
                      onClick={() => navigate('/admin/ai-batch')}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      AI Batch Runner →
                    </button>
                  </div>

                  {/* Song rows */}
                  <div className="divide-y divide-surface-100">
                    {visibleRows.map((row) => {
                      const isExpanded = expandedSongId === row.id;
                      const isSaving = savingId === row.id;

                      return (
                        <div key={row.id}>
                          {/* Song header row */}
                          <div
                            className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
                              isExpanded ? 'bg-blue-50' : 'hover:bg-surface-50'
                            }`}
                            onClick={() => expandSong(row)}
                          >
                            <span className="text-xs text-surface-400 w-6 text-right tabular-nums shrink-0">
                              {row.trackNumber ?? '·'}
                            </span>
                            <span
                              className="flex-1 text-sm font-medium text-surface-800 truncate"
                              title={row.title}
                            >
                              {row.title}
                              {row.isInstrumental && (
                                <span className="ml-1.5 text-xs text-surface-400 font-normal">(inst)</span>
                              )}
                            </span>

                            {/* Core score mini-bar */}
                            {row.coreScore ? (
                              <div className="flex gap-0.5 items-end h-4 shrink-0">
                                {AXES.map((a) => {
                                  const v = row.coreScore![a];
                                  return (
                                    <div
                                      key={a}
                                      title={`${AXIS_LABELS[a]}: ${v}`}
                                      className="w-2 rounded-sm"
                                      style={{ height: `${Math.max(2, Math.round((v / 10) * 16))}px`, backgroundColor: scoreHue(v) }}
                                    />
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 shrink-0">
                                ! Score
                              </span>
                            )}

                            <span
                              className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                                row.aiGenre ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-surface-400'
                              }`}
                            >
                              {row.aiGenre ? '✓ Genre' : '— Genre'}
                            </span>

                            {savedIds.has(row.id) && (
                              <span className="text-xs text-green-600 font-semibold shrink-0">Saved ✓</span>
                            )}

                            <span className="text-xs text-surface-400 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                          </div>

                          {/* Inline score panel */}
                          {isExpanded && (
                            <div className="px-6 pt-3 pb-4 bg-blue-50 border-t border-blue-100">
                              <div className="space-y-2.5 max-w-lg">
                                {AXES.map((axis) => (
                                  <div key={axis} className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-surface-600 w-24 shrink-0">
                                      {AXIS_LABELS[axis]}
                                    </span>
                                    <input
                                      type="range"
                                      min={0}
                                      max={10}
                                      step={0.5}
                                      value={draftScore[axis]}
                                      onChange={(e) =>
                                        setDraftScore((prev) => ({
                                          ...prev,
                                          [axis]: parseFloat(e.target.value),
                                        }))
                                      }
                                      className="flex-1 accent-blue-600"
                                    />
                                    <span
                                      className="text-sm font-bold font-mono w-8 text-right shrink-0"
                                      style={{ color: scoreHue(draftScore[axis]) }}
                                    >
                                      {draftScore[axis].toFixed(1)}
                                    </span>
                                  </div>
                                ))}

                                <div className="flex gap-2 pt-2 flex-wrap">
                                  <button
                                    onClick={() => void saveScore(row.id)}
                                    disabled={isSaving}
                                    className="btn-primary text-sm"
                                  >
                                    {isSaving ? 'Saving…' : 'Save Score'}
                                  </button>
                                  <button
                                    onClick={() => void runAiGenre(row.id)}
                                    disabled={runningGenreId === row.id}
                                    className="btn-secondary text-sm"
                                  >
                                    {runningGenreId === row.id
                                      ? 'Running…'
                                      : row.aiGenre ? 'Re-run AI Genre' : 'Run AI Genre'}
                                  </button>
                                  <button
                                    onClick={() => setExpandedSongId(null)}
                                    className="btn-ghost text-sm"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {visibleRows.length === 0 && (
                      <div className="p-10 text-center text-surface-400 text-sm">No songs found.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {!selectedBandId && (
            <div className="card text-center py-12 text-surface-400 text-sm">
              Select a band above to view and score its songs.
            </div>
          )}
        </div>
      )}

      {/* ── CONTRIBUTIONS TAB ────────────────────────────────────────────── */}
      {tab === 'contributions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-surface-500">
              {allContributions.length > 0
                ? `${allContributions.length} pending submission${allContributions.length !== 1 ? 's' : ''} — approve to auto-import into your library`
                : 'No pending contributions'}
            </p>
            <button
              onClick={() => navigate('/admin/contributions')}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Full contributions page ↗
            </button>
          </div>

          {allContributions.length === 0 ? (
            <div className="card py-12 text-center text-surface-400 text-sm">
              No pending contributions right now. Check back later or share the contribution link with your community.
            </div>
          ) : (
            <div className="card p-0 divide-y divide-surface-100 overflow-hidden">
              {allContributions.map((c: AdminContributionItem) => (
                <div key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-surface-900">{c.artistName}</p>
                      <p className="text-xs text-surface-500 mt-0.5">
                        {c.albumCount} album{c.albumCount !== 1 ? 's' : ''}
                        {' · '}Submitted by {c.user?.name ?? c.user?.email ?? 'unknown'}
                        {' · '}
                        {new Date(c.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => void approveContrib(c.id)}
                        disabled={approvingId === c.id}
                        className="btn-primary text-sm"
                      >
                        {approvingId === c.id ? 'Importing…' : 'Approve & Import'}
                      </button>
                      <button
                        onClick={() =>
                          setRejectingId((prev) => (prev === c.id ? null : c.id))
                        }
                        className="text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  {/* Reject form */}
                  {rejectingId === c.id && (
                    <div className="mt-3 flex gap-2 items-center">
                      <input
                        type="text"
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Optional note for the submitter…"
                        className="input flex-1 text-sm"
                      />
                      <button
                        onClick={() => void rejectContrib(c.id)}
                        className="text-sm px-3 py-1.5 border border-red-300 bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectNote(''); }}
                        className="btn-ghost text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

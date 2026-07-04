import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';
import { listAnalysisJobs, retryAnalysisJob, cancelAnalysisJob } from '../api/analysisJobs';
import type { AnalysisJob } from '@band-spectrum-mapper/shared';

interface SongHealthRow {
  songId: string;
  title: string;
  bandId: string;
  bandName: string;
  albumTitle: string | null;
  isInstrumental: boolean;
  hasLyrics: boolean;
  hasCoreScore: boolean;
  hasLiveProfile: boolean;
  hasMedia: boolean;
  hasComments: boolean;
  hasAiAnalysis: boolean;
  hasAiSpectrum: boolean;
  hasMusicScore: boolean;
  hasResearch: boolean;
  hasContext: boolean;
  hasGenreSpectrum: boolean;
  hasThemes: boolean;
  hasAudioAnalysis: boolean;
}

interface HealthSummary {
  total: number;
  hasLyrics: number;
  hasCoreScore: number;
  hasLiveProfile: number;
  hasMedia: number;
  hasComments: number;
  hasAiAnalysis: number;
  hasAiSpectrum: number;
  hasMusicScore: number;
  hasResearch: number;
  hasContext: number;
  hasGenreSpectrum: number;
  hasThemes: number;
  hasAudioAnalysis: number;
}

interface HealthResponse {
  summary: HealthSummary;
  songs: SongHealthRow[];
}

interface ColumnDef {
  key: keyof SongHealthRow;
  label: string;
  short: string;
  batchJob?: string;
  batchLabel?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'hasLyrics',        label: 'Lyrics',          short: 'Lyr',   batchJob: 'lyrics',    batchLabel: 'Lyrics Batch' },
  { key: 'hasCoreScore',     label: 'Spectrum (Core)', short: 'Spct',  batchJob: 'spectrum',  batchLabel: 'AI Batch' },
  { key: 'hasLiveProfile',   label: 'Live Data',       short: 'Live' },
  { key: 'hasMusicScore',    label: 'Rhythm',          short: 'Rhy',   batchJob: 'musicScore',batchLabel: 'AI Batch' },
  { key: 'hasGenreSpectrum', label: 'Genre',           short: 'Gen',   batchJob: 'genre',     batchLabel: 'AI Batch' },
  { key: 'hasThemes',        label: 'Theme',           short: 'Thm',   batchJob: 'themes',    batchLabel: 'AI Batch' },
  { key: 'hasResearch',      label: 'AI Summary',      short: 'Sum',   batchJob: 'research',  batchLabel: 'AI Batch' },
  { key: 'hasMedia',         label: 'Media',           short: 'Med' },
  { key: 'hasComments',      label: 'Community',       short: 'Comm' },
  { key: 'hasAiAnalysis',    label: 'AI Analysis',     short: 'Ana',   batchJob: 'analysis',  batchLabel: 'AI Batch' },
  { key: 'hasAiSpectrum',    label: 'AI Spectrum (secondary)', short: 'ASpc' },
  { key: 'hasContext',       label: 'Context',         short: 'Ctx',   batchJob: 'context',   batchLabel: 'AI Batch' },
  { key: 'hasAudioAnalysis', label: 'Audio Analysis',  short: 'Aud' },
];

function Cell({ has }: { has: boolean }) {
  return (
    <td className="px-2 py-2 text-center">
      {has
        ? <span className="text-green-600 text-sm">✓</span>
        : <span className="text-red-400 text-sm">✗</span>}
    </td>
  );
}

function SummaryCard({
  label, have, total, batchJob, batchLabel,
}: {
  label: string;
  have: number;
  total: number;
  batchJob?: string;
  batchLabel?: string;
}) {
  const missing = total - have;
  const pct = total > 0 ? Math.round((have / total) * 100) : 100;
  const color = pct === 100 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-500';

  return (
    <div className="card space-y-2">
      <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{pct}%</p>
      <p className="text-xs text-surface-500">
        {have} / {total} songs
        {missing > 0 && <span className="text-red-400 ml-1">({missing} missing)</span>}
      </p>
      {missing > 0 && batchJob && batchLabel && (
        <Link
          to={`/admin/ai-batch`}
          className="text-xs text-indigo-600 hover:underline"
        >
          → Run in {batchLabel}
        </Link>
      )}
      {missing > 0 && batchJob === 'lyrics' && (
        <Link to="/admin/lyrics-batch" className="text-xs text-indigo-600 hover:underline">
          → Fetch in Lyrics Batch
        </Link>
      )}
    </div>
  );
}

const JOB_STATUS_STYLE: Record<AnalysisJob['status'], string> = {
  waiting:   'bg-surface-100 text-surface-700',
  running:   'bg-indigo-100 text-indigo-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed:    'bg-red-100 text-red-700',
  cancelled: 'bg-surface-100 text-surface-500',
};

// Analysis pipeline job queue (Phase Z.17.5) — "Analyze Song/Album/Band"
// enqueues here; this panel is a monitor + retry/cancel, not a new trigger
// point (analysis is started from the Song/Album/Band pages themselves).
function AnalysisJobsPanel() {
  const queryClient = useQueryClient();

  const { data: jobs = [] } = useQuery({
    queryKey: ['analysis-jobs'],
    queryFn: () => listAnalysisJobs(),
    refetchInterval: (query) => {
      const list = query.state.data ?? [];
      return list.some((j) => j.status === 'waiting' || j.status === 'running') ? 2000 : 10000;
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['analysis-jobs'] });

  if (jobs.length === 0) return null;

  return (
    <div className="card mb-6">
      <p className="text-sm font-medium text-surface-700 mb-3">Analysis Jobs</p>
      <div className="space-y-1.5">
        {jobs.slice(0, 15).map((job) => (
          <div key={job.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-surface-100 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${JOB_STATUS_STYLE[job.status]}`}>
                  {job.status}
                </span>
                <span className="text-surface-900 font-medium truncate">
                  {job.scope}: {job.targetLabel}
                </span>
              </div>
              {job.currentStep && (
                <p className="text-xs text-surface-500 mt-0.5">{job.currentStep}</p>
              )}
              {!job.currentStep && (
                <p className="text-xs text-surface-500 mt-0.5">
                  {job.completedSteps}/{job.totalSteps} songs
                  {job.errorMessage && <span className="text-red-500 ml-1.5">— {job.errorMessage}</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(job.status === 'failed' || job.status === 'cancelled') && (
                <button
                  className="text-xs text-indigo-600 hover:underline"
                  onClick={() => void retryAnalysisJob(job.id).then(refetch)}
                >
                  Retry
                </button>
              )}
              {(job.status === 'waiting' || job.status === 'running') && (
                <button
                  className="text-xs text-surface-500 hover:underline"
                  onClick={() => void cancelAnalysisJob(job.id).then(refetch)}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DataHealthPage() {
  const [selectedBandId, setSelectedBandId] = useState('');
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [missingFilter, setMissingFilter] = useState<string>('any');

  const { data: bands } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['data-health', selectedBandId],
    queryFn: () =>
      api.get<HealthResponse>(
        `/api/admin/data-health${selectedBandId ? `?bandId=${encodeURIComponent(selectedBandId)}` : ''}`,
      ),
  });

  const rows = data?.songs ?? [];
  const summary = data?.summary ?? null;

  const filteredRows = rows.filter((r) => {
    if (!showMissingOnly) return true;
    if (missingFilter === 'any') {
      return COLUMNS.some((c) => !r[c.key]);
    }
    const col = COLUMNS.find((c) => c.key === missingFilter);
    if (!col) return true;
    return !r[col.key];
  });

  return (
    <div>
      <PageHeader
        title="Data Health"
        subtitle="See what's missing across all songs and queue it for generation"
        actions={
          <button className="btn-secondary" onClick={() => refetch()}>
            Refresh
          </button>
        }
      />

      {/* Band filter */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <label className="label">Filter by Band</label>
          <select
            className="input"
            value={selectedBandId}
            onChange={(e) => setSelectedBandId(e.target.value)}
          >
            <option value="">All bands</option>
            {bands?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <input
            id="missing-only"
            type="checkbox"
            checked={showMissingOnly}
            onChange={(e) => setShowMissingOnly(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="missing-only" className="text-sm text-surface-700">Show missing only</label>
        </div>
        {showMissingOnly && (
          <div>
            <label className="label">Missing type</label>
            <select
              className="input"
              value={missingFilter}
              onChange={(e) => setMissingFilter(e.target.value)}
            >
              <option value="any">Any missing</option>
              {COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {COLUMNS.map((col) => (
            <SummaryCard
              key={col.key}
              label={col.label}
              have={(summary as unknown as Record<string, number>)[col.key] ?? 0}
              total={summary.total}
              batchJob={col.batchJob}
              batchLabel={col.batchLabel}
            />
          ))}
        </div>
      )}

      {/* Action shortcuts */}
      <div className="card mb-6">
        <p className="text-sm font-medium text-surface-700 mb-3">Quick actions</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/ai-batch" className="btn-secondary text-sm">
            AI Batch Runner →
          </Link>
          <Link to="/admin/lyrics-batch" className="btn-secondary text-sm">
            Lyrics Batch Fetch →
          </Link>
          <Link to="/admin/missing-lyrics" className="btn-secondary text-sm">
            Missing Lyrics Scanner →
          </Link>
          <Link to="/admin/missing-artwork" className="btn-secondary text-sm">
            Missing Artwork →
          </Link>
        </div>
      </div>

      {/* Analysis pipeline queue */}
      <AnalysisJobsPanel />

      {/* Song table */}
      {isLoading && <p className="text-sm text-surface-600">Scanning…</p>}

      {!isLoading && filteredRows.length === 0 && (
        <div className="card text-center py-10 text-surface-500 text-sm">
          {showMissingOnly ? 'All songs have this data.' : 'No songs found.'}
        </div>
      )}

      {filteredRows.length > 0 && (
        <div className="overflow-x-auto rounded border border-surface-200">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 border-b border-surface-200">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-surface-600">Song</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-surface-600">Band</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-xs font-medium text-surface-600 text-center whitespace-nowrap">
                    {c.short}
                  </th>
                ))}
                <th className="px-3 py-2 text-xs font-medium text-surface-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filteredRows.map((row) => (
                <tr key={row.songId} className="hover:bg-surface-50">
                  <td className="px-3 py-2">
                    <Link
                      to={`/library/songs/${row.songId}`}
                      className="font-medium hover:underline text-surface-900"
                    >
                      {row.title}
                    </Link>
                    {row.albumTitle && (
                      <span className="text-xs text-surface-500 ml-1.5">{row.albumTitle}</span>
                    )}
                    {row.isInstrumental && (
                      <span className="text-xs bg-indigo-100 text-indigo-600 rounded px-1 ml-1">instr</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-surface-600 text-xs">{row.bandName}</td>
                  {COLUMNS.map((c) => (
                    <Cell key={c.key} has={Boolean(row[c.key])} />
                  ))}
                  <td className="px-3 py-2">
                    <Link
                      to={`/spectrum?songId=${row.songId}`}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Score →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-surface-500 px-3 py-2 border-t border-surface-100">
            Showing {filteredRows.length} of {rows.length} songs
          </p>
        </div>
      )}
    </div>
  );
}

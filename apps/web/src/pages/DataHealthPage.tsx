import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';

interface SongHealthRow {
  songId: string;
  title: string;
  bandId: string;
  bandName: string;
  albumTitle: string | null;
  isInstrumental: boolean;
  hasLyrics: boolean;
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
  { key: 'hasAiAnalysis',    label: 'AI Analysis',     short: 'Ana',   batchJob: 'analysis',  batchLabel: 'AI Batch' },
  { key: 'hasAiSpectrum',    label: 'AI Spectrum',     short: 'Spec',  batchJob: 'spectrum',  batchLabel: 'AI Batch' },
  { key: 'hasMusicScore',    label: 'Music Score',     short: 'Mus',   batchJob: 'musicScore',batchLabel: 'AI Batch' },
  { key: 'hasResearch',      label: 'Research',        short: 'Res',   batchJob: 'research',  batchLabel: 'AI Batch' },
  { key: 'hasContext',       label: 'Context',         short: 'Ctx',   batchJob: 'context',   batchLabel: 'AI Batch' },
  { key: 'hasGenreSpectrum', label: 'Genre Spectrum',  short: 'Gen',   batchJob: 'genre',     batchLabel: 'AI Batch' },
  { key: 'hasThemes',        label: 'Themes',          short: 'Thm',   batchJob: 'themes',    batchLabel: 'AI Batch' },
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

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

type AxisMap = {
  aggression: number;
  complexity: number;
  atmosphere: number;
  emotion: number;
  psychedelic: number;
  concept: number;
};

type AiGenre = {
  metal: number;
  rock: number;
  pop: number;
  hiphop: number;
  electronic: number;
  folk: number;
};

type DataGridRow = {
  id: string;
  title: string;
  bandId: string;
  bandName: string;
  albumTitle: string | null;
  trackNumber: number | null;
  durationSeconds: number | null;
  isInstrumental: boolean;
  hasLyrics: boolean;
  hasResearch: boolean;
  hasAiAnalysis: boolean;
  hasContext: boolean;
  tagCount: number;
  commentCount: number;
  coreScore: AxisMap | null;
  aiScore: AxisMap | null;
  communityScore: AxisMap | null;
  communityCount: number;
  aiGenre: AiGenre | null;
  tags: string[];
};

type BandOption = { id: string; name: string };

// ── Column group config ───────────────────────────────────────────────────────

const AXES = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
const GENRES = ['metal', 'rock', 'pop', 'hiphop', 'electronic', 'folk'] as const;

type ColGroup = 'identity' | 'status' | 'core' | 'ai' | 'community' | 'genre' | 'tags';

const GROUP_LABELS: Record<ColGroup, string> = {
  identity: 'Identity',
  status: 'Status',
  core: 'Core Score',
  ai: 'AI Score',
  community: 'Community',
  genre: 'AI Genre',
  tags: 'Tags',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(v: number | null | undefined): string {
  if (v == null) return '';
  // HSL: 0=red, 60=yellow, 120=green — map 0→10 to 0→120 hue
  const hue = Math.round((v / 10) * 120);
  return `hsl(${hue}, 70%, 36%)`;
}

function fmtScore(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(1);
}

function fmtDuration(s: number | null): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function Check({ v }: { v: boolean }) {
  return <span className={v ? 'text-green-600' : 'text-surface-400'}>{v ? '✓' : '—'}</span>;
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = string;
type SortDir = 'asc' | 'desc';

function getSortValue(row: DataGridRow, key: SortKey): string | number | null {
  if (key === 'band')        return row.bandName;
  if (key === 'album')       return row.albumTitle ?? '';
  if (key === 'track')       return row.trackNumber ?? 9999;
  if (key === 'title')       return row.title;
  if (key === 'duration')    return row.durationSeconds ?? -1;
  if (key === 'instrumental') return row.isInstrumental ? 1 : 0;
  if (key === 'hasLyrics')   return row.hasLyrics ? 1 : 0;
  if (key === 'hasResearch') return row.hasResearch ? 1 : 0;
  if (key === 'hasAi')       return row.hasAiAnalysis ? 1 : 0;
  if (key === 'hasContext')  return row.hasContext ? 1 : 0;
  if (key === 'tags')        return row.tagCount;
  if (key === 'comments')    return row.commentCount;
  if (key === 'communityCount') return row.communityCount;
  // Axis scores: e.g. "core.aggression"
  const [group, axis] = key.split('.');
  if (group === 'core' && axis)      return (row.coreScore as Record<string, number> | null)?.[axis] ?? -1;
  if (group === 'ai' && axis)        return (row.aiScore as Record<string, number> | null)?.[axis] ?? -1;
  if (group === 'community' && axis) return (row.communityScore as Record<string, number> | null)?.[axis] ?? -1;
  if (group === 'genre' && axis)     return (row.aiGenre as Record<string, number> | null)?.[axis] ?? -1;
  return null;
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(rows: DataGridRow[]) {
  const headers = [
    'Band', 'Album', 'Track', 'Title', 'Duration', 'Instrumental',
    'Lyrics', 'Research', 'AI Analysis', 'Context', 'Tags', 'Comments',
    ...AXES.map((a) => `Core ${a}`),
    ...AXES.map((a) => `AI ${a}`),
    ...AXES.map((a) => `Community ${a}`),
    'Community Ratings',
    ...GENRES.map((g) => `Genre ${g}`),
    'Tag List',
  ];

  const escape = (v: string | number | null | boolean) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) =>
      [
        r.bandName, r.albumTitle ?? '', r.trackNumber ?? '', r.title,
        fmtDuration(r.durationSeconds), r.isInstrumental ? 'Yes' : 'No',
        r.hasLyrics ? 'Yes' : 'No', r.hasResearch ? 'Yes' : 'No',
        r.hasAiAnalysis ? 'Yes' : 'No', r.hasContext ? 'Yes' : 'No',
        r.tagCount, r.commentCount,
        ...AXES.map((a) => r.coreScore?.[a] ?? ''),
        ...AXES.map((a) => r.aiScore?.[a] ?? ''),
        ...AXES.map((a) => r.communityScore?.[a] ?? ''),
        r.communityCount,
        ...GENRES.map((g) => r.aiGenre?.[g] ?? ''),
        r.tags.join('; '),
      ].map(escape).join(',')
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'band-spectrum-data-grid.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Score cell ────────────────────────────────────────────────────────────────

function ScoreCell({ v }: { v: number | null | undefined }) {
  const color = scoreColor(v);
  return (
    <td
      className="px-1.5 py-1 text-center text-xs tabular-nums font-mono w-12 border-r border-surface-200"
      style={color ? { backgroundColor: color, color: '#fff' } : { color: '#9ca3af' }}
    >
      {fmtScore(v)}
    </td>
  );
}

// ── Th (sortable header) ──────────────────────────────────────────────────────

function Th({
  label, sortKey, current, dir, onSort, className = '',
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th
      className={`px-1.5 py-1 text-left text-xs font-semibold cursor-pointer select-none whitespace-nowrap border-r border-surface-300 hover:bg-surface-100 ${active ? 'bg-surface-200' : 'bg-surface-50'} ${className}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active && <span className="ml-0.5 text-surface-500">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDataGridPage() {
  const [selectedBandId, setSelectedBandId] = useState<string>('');
  const [sortKey, setSortKey]   = useState<SortKey>('band');
  const [sortDir, setSortDir]   = useState<SortDir>('asc');
  const [visibleGroups, setVisibleGroups] = useState<Set<ColGroup>>(
    new Set(['identity', 'status', 'core', 'ai', 'community', 'genre', 'tags'])
  );

  // Fetch all bands for the filter dropdown
  const { data: bands = [] } = useQuery<BandOption[]>({
    queryKey: ['bands-list'],
    queryFn: () => api.get<BandOption[]>('/api/bands'),
    staleTime: 5 * 60 * 1000,
  });

  const queryParams = selectedBandId ? `?bandIds=${selectedBandId}` : '';

  const { data: rows = [], isLoading, isError } = useQuery<DataGridRow[]>({
    queryKey: ['admin-data-grid', selectedBandId],
    queryFn: () => api.get<DataGridRow[]>(`/api/admin/data-grid${queryParams}`),
    staleTime: 2 * 60 * 1000,
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function toggleGroup(g: ColGroup) {
    setVisibleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g); else next.add(g);
      return next;
    });
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const show = (g: ColGroup) => visibleGroups.has(g);

  return (
    <div className="min-h-screen bg-white">
      {/* Header bar */}
      <div className="border-b border-surface-200 bg-surface-50 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold text-surface-900">Data Grid</h1>
            <p className="text-xs text-surface-500 mt-0.5">
              {rows.length} songs — all scored data in one view
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Band filter */}
            <select
              value={selectedBandId}
              onChange={(e) => setSelectedBandId(e.target.value)}
              className="text-sm border border-surface-300 rounded px-2 py-1.5 bg-white text-surface-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">All bands</option>
              {bands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {/* CSV export */}
            <button
              onClick={() => exportCsv(sorted)}
              disabled={sorted.length === 0}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Column group toggles */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-surface-500 mr-1">Columns:</span>
          {(Object.keys(GROUP_LABELS) as ColGroup[]).map((g) => (
            <button
              key={g}
              onClick={() => toggleGroup(g)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                visibleGroups.has(g)
                  ? 'bg-surface-800 text-white border-surface-800'
                  : 'bg-white text-surface-500 border-surface-300 hover:border-surface-500'
              }`}
            >
              {GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-48 text-surface-500 text-sm">
            Loading…
          </div>
        )}
        {isError && (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">
            Failed to load data grid.
          </div>
        )}
        {!isLoading && !isError && (
          <table className="text-xs border-collapse w-full min-w-max">
            <thead className="sticky top-0 z-10">
              <tr>
                {/* Identity */}
                {show('identity') && (
                  <>
                    <Th label="Band"    sortKey="band"     current={sortKey} dir={sortDir} onSort={handleSort} />
                    <Th label="Album"   sortKey="album"    current={sortKey} dir={sortDir} onSort={handleSort} />
                    <Th label="#"       sortKey="track"    current={sortKey} dir={sortDir} onSort={handleSort} className="w-8" />
                    <Th label="Title"   sortKey="title"    current={sortKey} dir={sortDir} onSort={handleSort} />
                    <Th label="Dur"     sortKey="duration" current={sortKey} dir={sortDir} onSort={handleSort} className="w-14" />
                    <Th label="Inst"    sortKey="instrumental" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10" />
                  </>
                )}
                {/* Status */}
                {show('status') && (
                  <>
                    <th className="px-1.5 py-1 text-center text-xs font-semibold bg-surface-50 border-r border-surface-300 w-10 whitespace-nowrap">Lyr</th>
                    <th className="px-1.5 py-1 text-center text-xs font-semibold bg-surface-50 border-r border-surface-300 w-10 whitespace-nowrap">Res</th>
                    <th className="px-1.5 py-1 text-center text-xs font-semibold bg-surface-50 border-r border-surface-300 w-10 whitespace-nowrap">AI</th>
                    <th className="px-1.5 py-1 text-center text-xs font-semibold bg-surface-50 border-r border-surface-300 w-10 whitespace-nowrap">Ctx</th>
                    <Th label="Tags"    sortKey="tags"     current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" />
                    <Th label="Cmts"    sortKey="comments" current={sortKey} dir={sortDir} onSort={handleSort} className="w-10 text-center" />
                  </>
                )}
                {/* Core score group header spans */}
                {show('core') && AXES.map((a) => (
                  <Th key={`core-${a}`} label={a.slice(0, 4)} sortKey={`core.${a}`} current={sortKey} dir={sortDir} onSort={handleSort} className="w-12 text-center" />
                ))}
                {/* AI score */}
                {show('ai') && AXES.map((a) => (
                  <Th key={`ai-${a}`} label={a.slice(0, 4)} sortKey={`ai.${a}`} current={sortKey} dir={sortDir} onSort={handleSort} className="w-12 text-center" />
                ))}
                {/* Community */}
                {show('community') && (
                  <>
                    {AXES.map((a) => (
                      <Th key={`comm-${a}`} label={a.slice(0, 4)} sortKey={`community.${a}`} current={sortKey} dir={sortDir} onSort={handleSort} className="w-12 text-center" />
                    ))}
                    <Th label="n" sortKey="communityCount" current={sortKey} dir={sortDir} onSort={handleSort} className="w-8 text-center" />
                  </>
                )}
                {/* AI Genre */}
                {show('genre') && GENRES.map((g) => (
                  <Th key={`genre-${g}`} label={g.slice(0, 4)} sortKey={`genre.${g}`} current={sortKey} dir={sortDir} onSort={handleSort} className="w-12 text-center" />
                ))}
                {/* Tags */}
                {show('tags') && (
                  <th className="px-1.5 py-1 text-left text-xs font-semibold bg-surface-50 border-r border-surface-300 whitespace-nowrap min-w-[160px]">
                    Tags
                  </th>
                )}
              </tr>

              {/* Group label row */}
              <tr className="bg-surface-100 border-b border-surface-300">
                {show('identity') && (
                  <th colSpan={6} className="px-1.5 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wide text-surface-500 border-r border-surface-300">
                    Identity
                  </th>
                )}
                {show('status') && (
                  <th colSpan={6} className="px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-surface-500 border-r border-surface-300">
                    Status
                  </th>
                )}
                {show('core') && (
                  <th colSpan={6} className="px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-blue-600 border-r border-surface-300">
                    Core Score
                  </th>
                )}
                {show('ai') && (
                  <th colSpan={6} className="px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-purple-600 border-r border-surface-300">
                    AI Score
                  </th>
                )}
                {show('community') && (
                  <th colSpan={7} className="px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-600 border-r border-surface-300">
                    Community
                  </th>
                )}
                {show('genre') && (
                  <th colSpan={6} className="px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-orange-600 border-r border-surface-300">
                    AI Genre
                  </th>
                )}
                {show('tags') && (
                  <th className="px-1.5 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wide text-surface-500 border-r border-surface-300">
                    Tags
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {sorted.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-b border-surface-100 hover:bg-blue-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-surface-50/50'}`}
                >
                  {/* Identity */}
                  {show('identity') && (
                    <>
                      <td className="px-1.5 py-1 text-xs text-surface-700 border-r border-surface-200 max-w-[120px] truncate whitespace-nowrap" title={row.bandName}>
                        {row.bandName}
                      </td>
                      <td className="px-1.5 py-1 text-xs text-surface-600 border-r border-surface-200 max-w-[140px] truncate whitespace-nowrap" title={row.albumTitle ?? ''}>
                        {row.albumTitle ?? '—'}
                      </td>
                      <td className="px-1.5 py-1 text-xs text-surface-500 border-r border-surface-200 text-center tabular-nums">
                        {row.trackNumber ?? '—'}
                      </td>
                      <td className="px-1.5 py-1 text-xs text-surface-800 border-r border-surface-200 max-w-[180px] truncate whitespace-nowrap font-medium" title={row.title}>
                        {row.title}
                      </td>
                      <td className="px-1.5 py-1 text-xs text-surface-500 border-r border-surface-200 tabular-nums text-center">
                        {fmtDuration(row.durationSeconds)}
                      </td>
                      <td className="px-1.5 py-1 text-center border-r border-surface-200">
                        <Check v={row.isInstrumental} />
                      </td>
                    </>
                  )}
                  {/* Status */}
                  {show('status') && (
                    <>
                      <td className="px-1.5 py-1 text-center border-r border-surface-200"><Check v={row.hasLyrics} /></td>
                      <td className="px-1.5 py-1 text-center border-r border-surface-200"><Check v={row.hasResearch} /></td>
                      <td className="px-1.5 py-1 text-center border-r border-surface-200"><Check v={row.hasAiAnalysis} /></td>
                      <td className="px-1.5 py-1 text-center border-r border-surface-200"><Check v={row.hasContext} /></td>
                      <td className="px-1.5 py-1 text-center border-r border-surface-200 tabular-nums text-surface-600">{row.tagCount}</td>
                      <td className="px-1.5 py-1 text-center border-r border-surface-200 tabular-nums text-surface-600">{row.commentCount}</td>
                    </>
                  )}
                  {/* Core */}
                  {show('core') && AXES.map((a) => (
                    <ScoreCell key={`core-${a}`} v={row.coreScore?.[a]} />
                  ))}
                  {/* AI */}
                  {show('ai') && AXES.map((a) => (
                    <ScoreCell key={`ai-${a}`} v={row.aiScore?.[a]} />
                  ))}
                  {/* Community */}
                  {show('community') && (
                    <>
                      {AXES.map((a) => (
                        <ScoreCell key={`comm-${a}`} v={row.communityScore?.[a]} />
                      ))}
                      <td className="px-1.5 py-1 text-center text-xs text-surface-500 border-r border-surface-200 tabular-nums">
                        {row.communityCount > 0 ? row.communityCount : '—'}
                      </td>
                    </>
                  )}
                  {/* AI Genre */}
                  {show('genre') && GENRES.map((g) => (
                    <ScoreCell key={`genre-${g}`} v={row.aiGenre?.[g]} />
                  ))}
                  {/* Tags */}
                  {show('tags') && (
                    <td className="px-1.5 py-1 text-xs text-surface-600 border-r border-surface-200 min-w-[160px] max-w-[280px]">
                      {row.tags.length > 0
                        ? row.tags.map((t) => (
                            <span key={t} className="inline-block mr-1 mb-0.5 px-1 bg-surface-100 rounded text-[10px] text-surface-700 border border-surface-200">
                              {t}
                            </span>
                          ))
                        : <span className="text-surface-400">—</span>
                      }
                    </td>
                  )}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={50} className="py-16 text-center text-sm text-surface-400">
                    No songs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

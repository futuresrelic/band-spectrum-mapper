import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import { analysisApi } from '../api/analysis';
import PageHeader from '../components/layout/PageHeader';
import type { Song } from '@band-spectrum-mapper/shared';

type JobType = 'analysis' | 'spectrum' | 'research' | 'genre' | 'tags';

const JOB_LABELS: Record<JobType, string> = {
  analysis: 'AI Lyric Analysis',
  spectrum: 'AI Spectrum Scoring',
  research: 'Song Research',
  genre: 'Genre Accessibility',
  tags: 'Thematic Tags',
};

const JOB_DESCRIPTIONS: Record<JobType, string> = {
  analysis: 'Themes, emotional register, notable craft elements',
  spectrum: 'Aggression, Complexity, Atmosphere, Emotion, Psychedelic, Concept (0–10)',
  research: 'Music style summary and background context',
  genre: 'How much each genre audience would enjoy it (Metal, Rock, Pop, Hip-Hop, Electronic, Folk/Indie)',
  tags: 'Generate thematic tags (mood, theme, style, context) — powers the Song Cloud',
};

type RowStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface SongRow {
  song: Song;
  bandName: string;
  statuses: Record<JobType, RowStatus>;
  errors: Record<JobType, string>;
}

async function runJob(songId: string, job: JobType, force: boolean): Promise<void> {
  if (job === 'analysis') {
    force ? await analysisApi.regenerateAiAnalysis(songId) : await analysisApi.getAiAnalysis(songId);
    return;
  }
  if (job === 'spectrum') {
    force ? await analysisApi.regenerateAiSpectrum(songId) : await analysisApi.getAiSpectrum(songId);
    return;
  }
  if (job === 'research') {
    force ? await analysisApi.regenerateSongResearch(songId) : await analysisApi.getSongResearch(songId);
    return;
  }
  if (job === 'genre') {
    force ? await analysisApi.regenerateAiGenreSpectrum(songId) : await analysisApi.getAiGenreSpectrum(songId);
    return;
  }
  if (job === 'tags') {
    // Tags always regenerate (they upsert, not replace — safe to re-run)
    await analysisApi.generateAiTags(songId);
    return;
  }
}

export default function AiBatchRunnerPage() {
  const [selectedJobs, setSelectedJobs] = useState<Set<JobType>>(new Set(['analysis', 'spectrum']));
  const [delayMs, setDelayMs] = useState(2000);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [rows, setRows] = useState<SongRow[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const abortRef = useRef(false);

  const { data: bands, isLoading: bandsLoading } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  const toggleJob = (job: JobType) => {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      next.has(job) ? next.delete(job) : next.add(job);
      return next;
    });
  };

  const loadAllSongs = useCallback(async () => {
    if (!bands) return;
    const all: SongRow[] = [];
    for (const band of bands) {
      const songs = await bandsApi.listSongs(band.id);
      for (const song of songs) {
        const statuses: Record<JobType, RowStatus> = {
          analysis: 'pending', spectrum: 'pending', research: 'pending', genre: 'pending', tags: 'pending',
        };
        const errors: Record<JobType, string> = {
          analysis: '', spectrum: '', research: '', genre: '', tags: '',
        };
        all.push({ song, bandName: band.name, statuses, errors });
      }
    }
    setRows(all);
    setCurrentIdx(-1);
    setDoneCount(0);
    setErrorCount(0);
  }, [bands]);

  const start = useCallback(async () => {
    if (rows.length === 0) { await loadAllSongs(); return; }
    if (selectedJobs.size === 0) return;

    abortRef.current = false;
    setRunning(true);
    setDoneCount(0);
    setErrorCount(0);

    const jobs = [...selectedJobs];

    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) break;
      const row = rows[i]!;
      setCurrentIdx(i);

      for (const job of jobs) {
        if (abortRef.current) break;
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, statuses: { ...r.statuses, [job]: 'running' } } : r,
          ),
        );
        try {
          await runJob(row.song.id, job, forceRegenerate);
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, statuses: { ...r.statuses, [job]: 'done' } } : r,
            ),
          );
          setDoneCount((n) => n + 1);
        } catch (e) {
          const status = (e as Error & { status?: number }).status;
          if (status === 404) {
            // Song has no lyrics — skip silently, don't count as error
            setRows((prev) =>
              prev.map((r, idx) =>
                idx === i ? { ...r, statuses: { ...r.statuses, [job]: 'skipped' } } : r,
              ),
            );
          } else {
            const msg = e instanceof Error ? e.message : 'Failed';
            setRows((prev) =>
              prev.map((r, idx) =>
                idx === i ? {
                  ...r,
                  statuses: { ...r.statuses, [job]: 'error' },
                  errors: { ...r.errors, [job]: msg },
                } : r,
              ),
            );
            setErrorCount((n) => n + 1);
          }
        }
      }

      // Delay between songs (not after last)
      if (i < rows.length - 1 && !abortRef.current && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    setCurrentIdx(-1);
    setRunning(false);
  }, [rows, selectedJobs, delayMs, forceRegenerate, loadAllSongs]);

  const stop = () => { abortRef.current = true; };
  const reset = () => { setRows([]); setCurrentIdx(-1); setDoneCount(0); setErrorCount(0); };

  const totalJobs = rows.length * selectedJobs.size;
  const skippedCount = rows.reduce(
    (n, r) => n + [...selectedJobs].filter((j) => r.statuses[j] === 'skipped').length, 0,
  );
  const processedCount = doneCount + errorCount + skippedCount;
  const progress = totalJobs > 0 ? Math.round((processedCount / totalJobs) * 100) : 0;

  const statusCls: Record<RowStatus, string> = {
    pending: 'text-surface-300',
    running: 'text-blue-600 animate-pulse',
    done: 'text-green-600',
    error: 'text-red-600',
    skipped: 'text-surface-400',
  };

  const statusIcon: Record<RowStatus, string> = {
    pending: '·',
    running: '⟳',
    done: '✓',
    error: '✗',
    skipped: '—',
  };

  return (
    <div>
      <PageHeader
        title="AI Batch Runner"
        subtitle="Run AI generation for all songs in sequence — analysis, spectrum scoring, research, genre"
      />

      {/* Config */}
      <div className="card mb-6 space-y-5">
        {/* Job selection */}
        <div>
          <p className="label mb-2">AI jobs to run</p>
          <div className="space-y-2">
            {(Object.entries(JOB_LABELS) as [JobType, string][]).map(([job, label]) => (
              <label key={job} className="flex items-start gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  className="rounded mt-0.5 shrink-0"
                  checked={selectedJobs.has(job)}
                  onChange={() => toggleJob(job)}
                  disabled={running}
                />
                <div>
                  <span className="text-sm font-medium">{label}</span>
                  <p className="text-xs text-surface-500">{JOB_DESCRIPTIONS[job]}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Force regenerate */}
        <div className="border-t border-surface-100 pt-4">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded mt-0.5 shrink-0"
              checked={forceRegenerate}
              onChange={(e) => setForceRegenerate(e.target.checked)}
              disabled={running}
            />
            <div>
              <span className="text-sm font-medium text-amber-700">Force Regenerate</span>
              <p className="text-xs text-surface-500">
                When checked, existing AI results are discarded and regenerated from scratch.
                Use this after prompt improvements or when you want fresh scores for all songs.
                When unchecked (default), songs with existing results are returned instantly without calling OpenAI.
              </p>
            </div>
          </label>
        </div>

        {/* Delay */}
        <div>
          <label className="label">Delay between songs (ms)</label>
          <div className="flex items-center gap-3">
            <input
              className="input w-28"
              type="number"
              min="0"
              max="30000"
              step="500"
              value={delayMs}
              onChange={(e) => setDelayMs(parseInt(e.target.value) || 0)}
              disabled={running}
            />
            <span className="text-xs text-surface-500">
              {delayMs >= 1000 ? `${(delayMs / 1000).toFixed(1)}s` : `${delayMs}ms`} pause between songs
              · Each AI call takes ~3–8s by itself
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 flex-wrap items-center">
          {rows.length === 0 ? (
            <button className="btn-secondary" onClick={loadAllSongs} disabled={bandsLoading || running}>
              {bandsLoading ? 'Loading bands…' : 'Load all songs'}
            </button>
          ) : (
            <>
              <button className="btn-primary" onClick={start} disabled={running || selectedJobs.size === 0}>
                {running
                  ? 'Running…'
                  : `${forceRegenerate ? 'Regenerate' : 'Run'} ${selectedJobs.size} job${selectedJobs.size !== 1 ? 's' : ''} on ${rows.length} songs`}
              </button>
              {running && (
                <button className="btn-secondary text-red-600 border-red-300 hover:border-red-500" onClick={stop}>
                  Stop
                </button>
              )}
              {!running && (
                <button className="btn-ghost text-sm" onClick={reset}>Reset</button>
              )}
            </>
          )}
          {bands && !running && (
            <span className="text-xs text-surface-500 ml-auto">
              {bands.length} band{bands.length !== 1 ? 's' : ''} in library
              {rows.length > 0 && ` · ${rows.length} songs loaded`}
            </span>
          )}
        </div>

        {/* Mode indicator */}
        {forceRegenerate && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Force Regenerate is ON — every song will call OpenAI regardless of cached results. This will use API credits for all {rows.length > 0 ? rows.length : '...'} songs × {selectedJobs.size} job{selectedJobs.size !== 1 ? 's' : ''}.
          </div>
        )}

        {/* Progress bar */}
        {rows.length > 0 && (running || doneCount > 0 || errorCount > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-surface-600">
              <span>
                {processedCount} / {totalJobs} jobs
                {skippedCount > 0 && <span className="text-surface-400 ml-2">{skippedCount} skipped (no lyrics)</span>}
                {errorCount > 0 && <span className="text-red-600 ml-2">{errorCount} errors</span>}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {currentIdx >= 0 && rows[currentIdx] && (
              <p className="text-xs text-surface-500">
                Processing: <span className="font-medium">{rows[currentIdx]!.song.title}</span>
                {' '}· {rows[currentIdx]!.bandName}
                {' '}({currentIdx + 1}/{rows.length})
              </p>
            )}
          </div>
        )}
      </div>

      {/* Song table */}
      {rows.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-50 z-10">
                <tr className="border-b border-surface-200 text-left">
                  <th className="py-2 px-3 font-medium">#</th>
                  <th className="py-2 px-3 font-medium">Song</th>
                  <th className="py-2 px-3 font-medium">Band</th>
                  {(Object.keys(JOB_LABELS) as JobType[]).filter((j) => selectedJobs.has(j)).map((j) => (
                    <th key={j} className="py-2 px-3 font-medium text-center" title={JOB_DESCRIPTIONS[j]}>
                      {JOB_LABELS[j].replace('AI ', '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.song.id}
                    className={`border-b border-surface-100 ${i === currentIdx ? 'bg-blue-50' : 'hover:bg-surface-50'}`}
                  >
                    <td className="py-1.5 px-3 text-surface-400 tabular-nums">{i + 1}</td>
                    <td className="py-1.5 px-3 font-medium whitespace-nowrap max-w-[200px] truncate">{row.song.title}</td>
                    <td className="py-1.5 px-3 text-surface-500 whitespace-nowrap">{row.bandName}</td>
                    {(Object.keys(JOB_LABELS) as JobType[]).filter((j) => selectedJobs.has(j)).map((j) => (
                      <td key={j} className="py-1.5 px-3 text-center">
                        <span
                          className={`font-medium ${statusCls[row.statuses[j]]}`}
                          title={row.errors[j] || undefined}
                        >
                          {statusIcon[row.statuses[j]]}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="card text-center py-10 text-surface-500 text-sm">
          <p>Click <strong>Load all songs</strong> to populate the song list, then <strong>Run</strong> to start.</p>
          <p className="text-xs mt-2 text-surface-400">
            By default, songs with existing AI results are returned instantly without calling OpenAI.
            Enable <strong>Force Regenerate</strong> above to discard cached results and regenerate everything.
          </p>
        </div>
      )}
    </div>
  );
}

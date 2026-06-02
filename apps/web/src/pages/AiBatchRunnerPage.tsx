import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import { analysisApi } from '../api/analysis';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader';
import type { Song } from '@band-spectrum-mapper/shared';

type JobType = 'compound' | 'analysis' | 'spectrum' | 'coreScore' | 'musicScore' | 'research' | 'genre' | 'tags' | 'metadata' | 'context';

// Jobs that compound mode replaces (all AI jobs except metadata)
const COMPOUND_COVERS = new Set<JobType>(['analysis', 'spectrum', 'coreScore', 'musicScore', 'research', 'genre', 'tags', 'context']);

const JOB_LABELS: Record<JobType, string> = {
  compound:   '⚡ Compound (all AI jobs — 2 calls)',
  analysis:   'AI Lyric Analysis',
  spectrum:   'AI Spectrum (lyrics/artistic)',
  coreScore:  'Core Score (fix zeros)',
  musicScore: 'Music Structure Spectrum',
  research:   'Song Research',
  genre:      'Genre Accessibility',
  tags:       'Thematic Tags',
  metadata:   'Track Duration',
  context:    'Context Analysis',
};

const JOB_DESCRIPTIONS: Record<JobType, string> = {
  compound:   'Combines Analysis, Spectrum, Music Score, Research, Genre, Core Score & Context into just 2 OpenAI calls per song (~4× fewer API calls, ~3× faster). Run this instead of the individual jobs above. Metadata (MusicBrainz) still runs separately.',
  analysis:   'Curated discovery tags + emotional register + notable craft elements + narrative voice (also writes tags to Song Cloud — runs one AI call for both)',
  spectrum:   'Aggression, Complexity, Atmosphere, Emotion, Psychedelic, Concept (0–10). For songs with no lyrics, now infers from song/album titles, tags, and research context instead of failing.',
  coreScore:  'Targets only songs with missing or all-zero spectrum scores. Click "Load targets" to load only those songs — then Run to fix them. Use instead of full Spectrum job when most songs are already scored.',
  musicScore: 'Musical Structure Spectrum — 6 new axes scored from HOW the music is built: Rhythmic Complexity, Harmonic Depth, Structural Complexity, Sonic Density, Tempo Energy, Tonal Darkness (0–10). Works for instrumental bands — uses song/album context, tags, research, and audio features.',
  research:   'Music style summary and background context',
  genre:      'How much each genre audience would enjoy it (Metal, Rock, Pop, Hip-Hop, Electronic, Folk/Indie)',
  tags:       'Generate thematic tags separately — not needed if Analysis has already run (Analysis now includes tags)',
  metadata:   'Fetch track length from MusicBrainz (rate-limited, ~1 req/sec)',
  context:    'Deep synthesis of title meaning, lyrical interpretation, and historical context. Run after Research for best results. Output feeds into tag quality.',
};

interface ScanResult {
  total: number;
  has: Record<JobType, number>;
  missing: Record<JobType, number>;
  extra?: { spectrumZero?: number };
}

type RowStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped' | 'retrying';

interface SongRow {
  song: Song;
  bandName: string;
  statuses: Record<JobType, RowStatus>;
  errors: Record<JobType, string>;
}

// Retry delays on 429: 20s, 40s, 90s
const RETRY_DELAYS_MS = [20_000, 40_000, 90_000];

async function runJob(songId: string, job: JobType, force: boolean): Promise<void> {
  if (job === 'compound') {
    await analysisApi.runCompoundAnalysis(songId, force);
    return;
  }
  if (job === 'analysis') {
    force ? await analysisApi.regenerateAiAnalysis(songId) : await analysisApi.getAiAnalysis(songId);
    return;
  }
  if (job === 'spectrum') {
    force ? await analysisApi.regenerateAiSpectrum(songId) : await analysisApi.getAiSpectrum(songId);
    return;
  }
  if (job === 'coreScore') {
    // Generates an emotionally-driven Core Score → SongAxisScore (NOT AI Spectrum)
    await analysisApi.generateCoreScore(songId);
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
    await analysisApi.generateAiTags(songId);
    return;
  }
  if (job === 'metadata') {
    await api.post<void>(`/api/admin/songs/${songId}/fetch-metadata`, {});
    return;
  }
  if (job === 'context') {
    force ? await analysisApi.regenerateSongContext(songId) : await analysisApi.getSongContext(songId);
    return;
  }
  if (job === 'musicScore') {
    force ? await analysisApi.regenerateMusicScore(songId) : await analysisApi.getMusicScore(songId);
  }
}

// Wraps runJob with automatic retry on 429 (rate limit). Calls onRetry(waitMs)
// so the caller can update UI while waiting.
async function runJobWithRetry(
  songId: string,
  job: JobType,
  force: boolean,
  abortRef: React.MutableRefObject<boolean>,
  onRetry: (waitMs: number, attempt: number) => void,
): Promise<void> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await runJob(songId, job, force);
      return;
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 429 && attempt < RETRY_DELAYS_MS.length && !abortRef.current) {
        const waitMs = RETRY_DELAYS_MS[attempt] ?? 90_000;
        onRetry(waitMs, attempt + 1);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw e;
    }
  }
}

// Returns true if all selected jobs for this row are already completed/skipped
function isRowDone(row: SongRow, jobs: JobType[]): boolean {
  return jobs.every((j) => row.statuses[j] === 'done' || row.statuses[j] === 'skipped');
}

export default function AiBatchRunnerPage() {
  const [selectedJobs, setSelectedJobs] = useState<Set<JobType>>(new Set<JobType>(['compound']));
  const [delayMs, setDelayMs] = useState(2000);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [rows, setRows] = useState<SongRow[]>([]);
  const [running, setRunning] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [doneCount, setDoneCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [filterBandIds, setFilterBandIds] = useState<Set<string>>(new Set());
  const [showBandFilter, setShowBandFilter] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [retryInfo, setRetryInfo] = useState<{ waitMs: number; attempt: number; job: string } | null>(null);
  const abortRef = useRef(false);

  const { data: bands, isLoading: bandsLoading } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  const toggleJob = (job: JobType) => {
    setSelectedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(job)) {
        next.delete(job);
      } else {
        next.add(job);
        // Mutual exclusivity: compound ↔ individual AI jobs
        if (job === 'compound') {
          COMPOUND_COVERS.forEach((j) => next.delete(j));
        } else if (COMPOUND_COVERS.has(job)) {
          next.delete('compound');
        }
      }
      return next;
    });
  };

  const toggleBand = (bandId: string) => {
    setFilterBandIds((prev) => {
      const next = new Set(prev);
      next.has(bandId) ? next.delete(bandId) : next.add(bandId);
      return next;
    });
  };

  const makeBlankRow = (song: Song, bandName: string): SongRow => ({
    song,
    bandName,
    statuses: { compound: 'pending', analysis: 'pending', spectrum: 'pending', coreScore: 'pending', musicScore: 'pending', research: 'pending', genre: 'pending', tags: 'pending', metadata: 'pending', context: 'pending' },
    errors:   { compound: '', analysis: '', spectrum: '', coreScore: '', musicScore: '', research: '', genre: '', tags: '', metadata: '', context: '' },
  });

  const loadAllSongs = useCallback(async () => {
    if (!bands) return;
    const all: SongRow[] = [];
    const bandsToLoad = filterBandIds.size > 0
      ? bands.filter((b) => filterBandIds.has(b.id))
      : bands;
    for (const band of bandsToLoad) {
      const songs = await bandsApi.listSongs(band.id);
      for (const song of songs) all.push(makeBlankRow(song, band.name));
    }
    setRows(all);
    setCurrentIdx(-1);
    setDoneCount(0);
    setErrorCount(0);
  }, [bands, filterBandIds]);

  // Load only songs that have tags missing descriptions
  const loadTagsMissingDescriptionTargets = useCallback(async () => {
    const bandParam = filterBandIds.size > 0 ? `?bandIds=${[...filterBandIds].join(',')}` : '';
    const targets = await api.get<{ id: string; title: string; band: { id: string; name: string }; tagsMissingDesc: number; tagsTotal: number }[]>(
      `/api/admin/ai-batch/tags-missing-description${bandParam}`,
    );
    const all: SongRow[] = targets.map(t => makeBlankRow(
      { id: t.id, title: t.title, bandId: t.band.id } as Song,
      t.band.name,
    ));
    setRows(all);
    setCurrentIdx(-1);
    setDoneCount(0);
    setErrorCount(0);
  }, [filterBandIds]);

  // Load only songs with missing or all-zero spectrum (Core Score targets)
  const loadCoreScoreTargets = useCallback(async () => {
    const bandParam = filterBandIds.size > 0 ? `?bandIds=${[...filterBandIds].join(',')}` : '';
    const targets = await api.get<{ id: string; title: string; band: { id: string; name: string } }[]>(
      `/api/admin/ai-batch/spectrum-targets${bandParam}`,
    );
    const all: SongRow[] = targets.map(t => makeBlankRow(
      { id: t.id, title: t.title, bandId: t.band.id } as Song,
      t.band.name,
    ));
    setRows(all);
    setCurrentIdx(-1);
    setDoneCount(0);
    setErrorCount(0);
  }, [filterBandIds]);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const bandParam = filterBandIds.size > 0 ? `?bandIds=${[...filterBandIds].join(',')}` : '';
      const result = await api.get<ScanResult>(`/api/admin/ai-batch/scan${bandParam}`);
      setScanResult(result);
    } catch { /* ignore */ } finally {
      setScanning(false);
    }
  }, [filterBandIds]);

  const start = useCallback(async (continueFromCheckpoint = false) => {
    if (rows.length === 0) { await loadAllSongs(); return; }
    if (selectedJobs.size === 0) return;

    abortRef.current = false;
    setRunning(true);

    // When continuing, don't reset existing done/skipped counts
    if (!continueFromCheckpoint) {
      setDoneCount(0);
      setErrorCount(0);
      // Reset all rows to pending
      setRows((prev) => prev.map((r) => ({
        ...r,
        statuses: Object.fromEntries(
          (Object.keys(r.statuses) as JobType[]).map((j) => [j, 'pending' as RowStatus])
        ) as Record<JobType, RowStatus>,
        errors: Object.fromEntries(
          (Object.keys(r.errors) as JobType[]).map((j) => [j, ''])
        ) as Record<JobType, string>,
      })));
    }

    const jobs = [...selectedJobs];

    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) break;
      const row = rows[i]!;

      // Skip rows that are already fully done when continuing
      if (continueFromCheckpoint && isRowDone(row, jobs)) continue;

      setCurrentIdx(i);

      for (const job of jobs) {
        if (abortRef.current) break;
        // Skip individual jobs already done when continuing
        if (continueFromCheckpoint && (row.statuses[job] === 'done' || row.statuses[job] === 'skipped')) continue;

        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, statuses: { ...r.statuses, [job]: 'running' } } : r,
          ),
        );
        try {
          await runJobWithRetry(
            row.song.id, job, forceRegenerate, abortRef,
            (waitMs, attempt) => {
              setRetryInfo({ waitMs, attempt, job: JOB_LABELS[job] });
              setRows((prev) =>
                prev.map((r, idx) =>
                  idx === i ? { ...r, statuses: { ...r.statuses, [job]: 'retrying' } } : r,
                ),
              );
            },
          );
          setRetryInfo(null);
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, statuses: { ...r.statuses, [job]: 'done' } } : r,
            ),
          );
          setDoneCount((n) => n + 1);
        } catch (e) {
          setRetryInfo(null);
          const status = (e as Error & { status?: number }).status;
          if (status === 404) {
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

        // Small delay between job calls within a song to avoid rate-limit bursts
        if (!abortRef.current && job !== jobs[jobs.length - 1]) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (i < rows.length - 1 && !abortRef.current && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    setCurrentIdx(-1);
    setRunning(false);
  }, [rows, selectedJobs, delayMs, forceRegenerate, loadAllSongs]);

  const stop = () => { abortRef.current = true; setRetryInfo(null); };
  const reset = () => { setRows([]); setCurrentIdx(-1); setDoneCount(0); setErrorCount(0); setRetryInfo(null); };

  const jobs = [...selectedJobs];
  const totalJobs = rows.length * jobs.length;
  const skippedCount = rows.reduce(
    (n, r) => n + jobs.filter((j) => r.statuses[j] === 'skipped').length, 0,
  );
  const processedCount = doneCount + errorCount + skippedCount;
  const progress = totalJobs > 0 ? Math.round((processedCount / totalJobs) * 100) : 0;

  // Detect checkpoint: some rows done, some still pending
  const hasCheckpoint = rows.length > 0 && !running &&
    rows.some((r) => jobs.some((j) => r.statuses[j] === 'done' || r.statuses[j] === 'skipped')) &&
    rows.some((r) => jobs.some((j) => r.statuses[j] === 'pending' || r.statuses[j] === 'error'));

  const pendingCount = rows.filter((r) => !isRowDone(r, jobs)).length;

  const statusCls: Record<RowStatus, string> = {
    pending: 'text-surface-300',
    running: 'text-blue-600 animate-pulse',
    done: 'text-green-600',
    error: 'text-red-600',
    skipped: 'text-surface-400',
    retrying: 'text-amber-500 animate-pulse',
  };

  const statusIcon: Record<RowStatus, string> = {
    pending: '·',
    running: '⟳',
    done: '✓',
    error: '✗',
    skipped: '—',
    retrying: '↺',
  };

  return (
    <div>
      <PageHeader
        title="AI Batch Runner"
        subtitle="Run AI generation for all songs in sequence — analysis, spectrum scoring, research, genre"
      />

      {/* Data scan panel */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="label">Data Coverage Scan</p>
            <p className="text-xs text-surface-500 mt-0.5">Check which songs are missing AI data before running.</p>
          </div>
          <button
            className="btn-secondary text-sm"
            onClick={() => void runScan()}
            disabled={scanning || running}
          >
            {scanning ? 'Scanning…' : 'Scan now'}
          </button>
        </div>

        {scanResult && (
          <div>
            <p className="text-xs text-surface-500 mb-2">
              {scanResult.total} songs total
              {filterBandIds.size > 0 && ` (${filterBandIds.size} band${filterBandIds.size !== 1 ? 's' : ''} filtered)`}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(JOB_LABELS) as [JobType, string][]).map(([job, label]) => {
                const has     = scanResult.has[job] ?? 0;
                const missing = scanResult.missing[job] ?? 0;
                const pct     = scanResult.total > 0 ? Math.round((has / scanResult.total) * 100) : 0;
                const spectrumZero = job === 'spectrum' ? (scanResult.extra?.spectrumZero ?? 0) : 0;
                return (
                  <div key={job} className="bg-surface-50 border border-surface-200 rounded p-2">
                    <p className="text-[10px] font-medium text-surface-600 truncate">{label}</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-sm font-bold ${missing > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {missing > 0 ? `${missing} missing` : 'complete'}
                      </span>
                    </div>
                    <div className="h-1 bg-surface-200 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-surface-400 mt-0.5">{has}/{scanResult.total} have data</p>
                    {spectrumZero > 0 && (
                      <p className="text-[10px] text-orange-500 mt-0.5 font-medium">
                        ⚠ {spectrumZero} all-zero (unscored)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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

        {/* Band filter */}
        <div className="border-t border-surface-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="label">Band filter</p>
            <button
              className="text-xs text-indigo-600 hover:text-indigo-800"
              onClick={() => setShowBandFilter((s) => !s)}
              disabled={running}
            >
              {showBandFilter ? 'Hide' : (filterBandIds.size > 0 ? `${filterBandIds.size} selected — edit` : 'Filter by band')}
            </button>
          </div>
          {filterBandIds.size === 0 && !showBandFilter && (
            <p className="text-xs text-surface-500">All bands will be included.</p>
          )}
          {showBandFilter && bands && (
            <div className="grid grid-cols-2 gap-1 mt-2 max-h-48 overflow-y-auto pr-1">
              <label className="col-span-2 flex items-center gap-2 text-xs cursor-pointer mb-1">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={filterBandIds.size === 0}
                  onChange={() => setFilterBandIds(new Set())}
                  disabled={running}
                />
                <span className="font-medium">All bands</span>
              </label>
              {bands.map((band) => (
                <label key={band.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={filterBandIds.has(band.id)}
                    onChange={() => toggleBand(band.id)}
                    disabled={running}
                  />
                  <span className="truncate">{band.name}</span>
                </label>
              ))}
            </div>
          )}
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
            <>
              <button className="btn-secondary" onClick={() => void loadAllSongs()} disabled={bandsLoading || running}>
                {bandsLoading ? 'Loading bands…' : 'Load songs'}
              </button>
              {selectedJobs.has('coreScore') && (
                <button className="btn-secondary text-orange-700 border-orange-300 hover:border-orange-500" onClick={() => void loadCoreScoreTargets()} disabled={running}>
                  Load Core Score targets only
                </button>
              )}
              {selectedJobs.has('tags') && (
                <button className="btn-secondary text-cyan-700 border-cyan-300 hover:border-cyan-500" onClick={() => void loadTagsMissingDescriptionTargets()} disabled={running}>
                  Load tags missing description
                </button>
              )}
            </>
          ) : (
            <>
              {!running && (
                <button className="btn-primary" onClick={() => void start(false)} disabled={selectedJobs.size === 0}>
                  {forceRegenerate ? 'Regenerate all' : `Run on ${rows.length} songs`}
                </button>
              )}
              {hasCheckpoint && !running && (
                <button
                  className="btn-secondary text-indigo-700 border-indigo-300 hover:border-indigo-500"
                  onClick={() => void start(true)}
                  disabled={selectedJobs.size === 0}
                >
                  Continue ({pendingCount} remaining)
                </button>
              )}
              {running && (
                <button className="btn-secondary text-red-600 border-red-300 hover:border-red-500" onClick={stop}>
                  Stop
                </button>
              )}
              {!running && (
                <button className="btn-ghost text-sm" onClick={reset}>Reset</button>
              )}
              {!running && rows.length > 0 && (
                <button className="btn-ghost text-sm" onClick={() => void loadAllSongs()} disabled={bandsLoading}>
                  Reload songs
                </button>
              )}
            </>
          )}
          {bands && !running && (
            <span className="text-xs text-surface-500 ml-auto">
              {bands.length} band{bands.length !== 1 ? 's' : ''}
              {rows.length > 0 && ` · ${rows.length} songs loaded`}
            </span>
          )}
        </div>

        {/* Mode indicator */}
        {forceRegenerate && rows.length > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Force Regenerate is ON — every song will call OpenAI regardless of cached results.
            {selectedJobs.size >= 3 && (
              <> Running {selectedJobs.size} jobs per song hits OpenAI harder — if you see rate limit errors, the batch will auto-retry. Consider setting delay to 3000ms or higher.</>
            )}
          </div>
        )}

        {hasCheckpoint && (
          <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
            Scan paused — {rows.length - pendingCount} songs done, {pendingCount} remaining.
            Click <strong>Continue</strong> to resume from where you left off, or <strong>Run on {rows.length} songs</strong> to restart from scratch.
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
            {retryInfo && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Rate limit hit on <strong>{retryInfo.job}</strong> — waiting {Math.round(retryInfo.waitMs / 1000)}s before retry #{retryInfo.attempt}.
                The batch will resume automatically.
              </div>
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
                      {JOB_LABELS[j]!.replace('AI ', '')}
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
          <p>Click <strong>Load songs</strong> to populate the song list, then <strong>Run</strong> to start.</p>
          <p className="text-xs mt-2 text-surface-400">
            By default, songs with existing AI results are returned instantly without calling OpenAI.
            Use <strong>Band filter</strong> to run only selected bands.
            Use <strong>Continue</strong> to resume after stopping.
          </p>
        </div>
      )}
    </div>
  );
}

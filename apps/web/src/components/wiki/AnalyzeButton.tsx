// The "one button" — Analyze Song / Analyze Album / Analyze Band. Enqueues
// a pipeline job, polls it while running, and lets the caller refresh once
// it completes. Same component for all three scopes; the backend decides
// what "song set" a scope resolves to.

import { useEffect, useRef, useState } from 'react';
import type { AnalysisJob, AnalysisJobScope } from '@band-spectrum-mapper/shared';
import { runAnalysisPipeline, getAnalysisJob, cancelAnalysisJob } from '../../api/analysisJobs';

interface Props {
  scope: AnalysisJobScope;
  targetId: string;
  label: string;
  onDone?: () => void;
  className?: string;
}

const POLL_MS = 1500;

export default function AnalyzeButton({ scope, targetId, label, onDone, className = '' }: Props) {
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  function poll(jobId: string) {
    intervalRef.current = setInterval(() => {
      void getAnalysisJob(jobId).then((j) => {
        setJob(j);
        if (j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (j.status === 'completed') onDone?.();
        }
      }).catch(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      });
    }, POLL_MS);
  }

  async function start() {
    if (scope !== 'song') {
      const noun = scope === 'album' ? 'album' : 'band';
      const confirmed = window.confirm(
        `This runs AI analysis sequentially across every song missing data in this ${noun}. ` +
        `It calls external AI services and may take a while — songs that already have data are skipped, but a large ${noun} can still mean many API calls. Continue?`,
      );
      if (!confirmed) return;
    }
    setError(null);
    try {
      const j = await runAnalysisPipeline(scope, targetId);
      setJob(j);
      poll(j.id);
    } catch {
      setError('Failed to start analysis.');
    }
  }

  async function cancel() {
    if (!job) return;
    await cancelAnalysisJob(job.id).catch(() => {});
  }

  const running = job?.status === 'waiting' || job?.status === 'running';

  if (running) {
    return (
      <div className={`inline-flex items-center gap-2 text-xs ${className}`}>
        <span aria-hidden className="w-3 h-3 rounded-full border-2 border-amber-700 border-t-amber-300 animate-spin motion-reduce:animate-none shrink-0" />
        <span className="text-amber-300 font-medium tabular-nums">
          {job.currentStep ?? 'Starting…'} ({job.completedSteps}/{job.totalSteps})
        </span>
        <button type="button" onClick={() => void cancel()} className="text-gray-500 hover:text-gray-300 underline">
          Cancel
        </button>
      </div>
    );
  }

  if (job?.status === 'completed') {
    return (
      <div className={`inline-flex items-center gap-2 text-xs ${className}`}>
        <span className="text-emerald-400 font-medium">✓ Analysis complete</span>
        <button type="button" onClick={() => void start()} className="text-indigo-400 hover:text-indigo-300 underline">
          Run again
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void start()}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
      >
        {job?.status === 'cancelled' ? `${label} (cancelled — retry)` : job?.status === 'failed' ? `${label} (failed — retry)` : label}
      </button>
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );
}

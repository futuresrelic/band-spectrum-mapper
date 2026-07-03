// Analysis Job Queue — Phase Z.17.5.
//
// A single-process, DB-backed queue. enqueue() writes a row and immediately
// returns it; processing continues in-process without blocking the HTTP
// response. There is no distributed worker — the `analysis_jobs` table is
// the seam a future phase can hand to a real worker without changing this
// service's public API (enqueue/retry/cancel/list all stay the same).
//
// Cancellation is cooperative: the runner checks job.status before each
// pipeline stage of each song, so "Cancel" takes effect at the next
// stage/song boundary rather than instantly.

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { runSongPipeline } from './songHealthService.js';
import type { AnalysisJob, AnalysisJobScope, AnalysisJobStepResult } from '@band-spectrum-mapper/shared';

function serialize(row: {
  id: string; scope: string; targetId: string; targetLabel: string; status: string;
  totalSteps: number; completedSteps: number; currentStep: string | null;
  resultJson: unknown; errorMessage: string | null; requestedBy: string | null;
  createdAt: Date; updatedAt: Date;
}): AnalysisJob {
  return {
    id: row.id,
    scope: row.scope as AnalysisJobScope,
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    status: row.status as AnalysisJob['status'],
    totalSteps: row.totalSteps,
    completedSteps: row.completedSteps,
    currentStep: row.currentStep,
    resultJson: (row.resultJson as AnalysisJobStepResult[] | null) ?? null,
    errorMessage: row.errorMessage,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveTargetSongs(scope: AnalysisJobScope, targetId: string): Promise<{ label: string; songs: Array<{ id: string; title: string }> }> {
  if (scope === 'song') {
    const song = await prisma.song.findUnique({ where: { id: targetId }, select: { title: true } });
    if (!song) throw new Error('Song not found');
    return { label: song.title, songs: [{ id: targetId, title: song.title }] };
  }
  if (scope === 'album') {
    const album = await prisma.album.findUnique({
      where: { id: targetId },
      select: { title: true, songs: { select: { id: true, title: true }, orderBy: [{ trackNumber: 'asc' }, { title: 'asc' }] } },
    });
    if (!album) throw new Error('Album not found');
    return { label: album.title, songs: album.songs };
  }
  const band = await prisma.band.findUnique({
    where: { id: targetId },
    select: { name: true, songs: { select: { id: true, title: true }, orderBy: { title: 'asc' } } },
  });
  if (!band) throw new Error('Band not found');
  return { label: band.name, songs: band.songs };
}

export const analysisJobService = {
  async enqueue(scope: AnalysisJobScope, targetId: string, requestedBy: string | null): Promise<AnalysisJob> {
    const { label, songs } = await resolveTargetSongs(scope, targetId);
    if (songs.length === 0) throw new Error('Nothing to analyze — no songs in scope');

    const job = await prisma.analysisJob.create({
      data: {
        scope, targetId, targetLabel: label,
        status: 'waiting', totalSteps: songs.length, completedSteps: 0,
        requestedBy,
      },
    });

    // Fire-and-forget: the HTTP caller gets the job row back immediately;
    // processing continues after this function returns.
    void this.process(job.id, songs).catch(async (e) => {
      await prisma.analysisJob.update({
        where: { id: job.id },
        data: { status: 'failed', errorMessage: e instanceof Error ? e.message : 'Unknown error' },
      }).catch(() => { /* job may have been deleted; nothing more to do */ });
    });

    return serialize(job);
  },

  async process(jobId: string, songs: Array<{ id: string; title: string }>): Promise<void> {
    await prisma.analysisJob.update({ where: { id: jobId }, data: { status: 'running' } });

    const isCancelled = async () => {
      const row = await prisma.analysisJob.findUnique({ where: { id: jobId }, select: { status: true } });
      return row?.status === 'cancelled';
    };

    const allResults: AnalysisJobStepResult[] = [];
    let completed = 0;

    for (const song of songs) {
      if (await isCancelled()) break;
      await prisma.analysisJob.update({
        where: { id: jobId },
        data: { currentStep: `Song ${completed + 1}/${songs.length}: ${song.title}` },
      });

      const stageResults = await runSongPipeline(song.id, song.title, isCancelled);
      allResults.push(...stageResults);
      completed += 1;

      await prisma.analysisJob.update({
        where: { id: jobId },
        data: { completedSteps: completed, resultJson: allResults as unknown as Prisma.InputJsonValue },
      });
    }

    const finalStatus = (await isCancelled()) ? 'cancelled' : 'completed';
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: finalStatus, currentStep: null },
    });
  },

  async retry(jobId: string): Promise<AnalysisJob> {
    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job not found');
    if (job.status !== 'failed' && job.status !== 'cancelled') {
      throw new Error(`Cannot retry a job in status "${job.status}"`);
    }
    const { songs } = await resolveTargetSongs(job.scope as AnalysisJobScope, job.targetId);
    const updated = await prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: 'waiting', completedSteps: 0, currentStep: null, errorMessage: null, resultJson: Prisma.JsonNull },
    });
    void this.process(jobId, songs).catch(async (e) => {
      await prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'failed', errorMessage: e instanceof Error ? e.message : 'Unknown error' },
      }).catch(() => {});
    });
    return serialize(updated);
  },

  async cancel(jobId: string): Promise<AnalysisJob> {
    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job not found');
    if (job.status !== 'waiting' && job.status !== 'running') {
      throw new Error(`Cannot cancel a job in status "${job.status}"`);
    }
    const updated = await prisma.analysisJob.update({ where: { id: jobId }, data: { status: 'cancelled' } });
    return serialize(updated);
  },

  async get(jobId: string): Promise<AnalysisJob | null> {
    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
    return job ? serialize(job) : null;
  },

  async list(limit = 50): Promise<AnalysisJob[]> {
    const jobs = await prisma.analysisJob.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return jobs.map(serialize);
  },
};

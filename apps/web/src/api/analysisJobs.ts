// Analysis pipeline job queue — client for the "Analyze Song/Album/Band"
// one-button feature and the admin job-monitoring view (Phase Z.17.5).

import { api } from '../lib/api';
import type { AnalysisJob, AnalysisJobScope } from '@band-spectrum-mapper/shared';

export async function runAnalysisPipeline(scope: AnalysisJobScope, targetId: string): Promise<AnalysisJob> {
  return api.post<AnalysisJob>(`/api/admin/analysis-jobs/${scope}/${encodeURIComponent(targetId)}/run`, {});
}

export async function getAnalysisJob(jobId: string): Promise<AnalysisJob> {
  return api.get<AnalysisJob>(`/api/admin/analysis-jobs/${encodeURIComponent(jobId)}`);
}

export async function listAnalysisJobs(): Promise<AnalysisJob[]> {
  return api.get<AnalysisJob[]>('/api/admin/analysis-jobs');
}

export async function retryAnalysisJob(jobId: string): Promise<AnalysisJob> {
  return api.post<AnalysisJob>(`/api/admin/analysis-jobs/${encodeURIComponent(jobId)}/retry`, {});
}

export async function cancelAnalysisJob(jobId: string): Promise<AnalysisJob> {
  return api.post<AnalysisJob>(`/api/admin/analysis-jobs/${encodeURIComponent(jobId)}/cancel`, {});
}

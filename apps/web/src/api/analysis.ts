import { api } from '../lib/api';
import type {
  LyricsAnalysisResult,
  ComparisonResult,
  CompareQueryInput,
} from '@band-spectrum-mapper/shared';

type AxisAverage = { axis: string; average: number; count: number };

export const analysisApi = {
  analyzeSong: (songId: string, topN = 50) =>
    api.get<LyricsAnalysisResult>(`/api/analysis/lyrics?songId=${songId}&topN=${topN}`),
  analyzeAlbum: (albumId: string, topN = 50) =>
    api.get<LyricsAnalysisResult>(`/api/analysis/lyrics?albumId=${albumId}&topN=${topN}`),
  analyzeBand: (bandId: string, topN = 50) =>
    api.get<LyricsAnalysisResult>(`/api/analysis/lyrics?bandId=${bandId}&topN=${topN}`),
  analyzeSongIds: (songIds: string[], topN = 50) =>
    api.get<LyricsAnalysisResult>(
      `/api/analysis/lyrics?${songIds.map((id) => `songIds[]=${id}`).join('&')}&topN=${topN}`,
    ),

  scoresByBand: (bandId: string) => api.get<AxisAverage[]>(`/api/analysis/scores/band/${bandId}`),
  scoresByAlbum: (albumId: string) =>
    api.get<AxisAverage[]>(`/api/analysis/scores/album/${albumId}`),

  compare: (query: CompareQueryInput) => api.post<ComparisonResult>('/api/analysis/compare', query),
};

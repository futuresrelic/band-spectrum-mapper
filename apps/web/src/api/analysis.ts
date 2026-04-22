import { api } from '../lib/api';
import type {
  LyricsAnalysisResult,
  ComparisonResult,
  CompareQueryInput,
  SongAiAnalysis,
  SongAiSpectrum,
  SongResearch,
  SongContextAnalysis,
} from '@band-spectrum-mapper/shared';

type AxisAverage = { axis: string; average: number; count: number };

interface AnalysisOptions {
  topN?: number;
  minCount?: number;
  includeNgrams?: boolean;
  ngramN?: number;
  includeWordSongLinks?: boolean;
}

function buildLyricsUrl(params: Record<string, string | number | boolean | undefined>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== false)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `/api/analysis/lyrics?${qs}`;
}

export const analysisApi = {
  analyzeSong: (songId: string, opts: AnalysisOptions = {}) =>
    api.get<LyricsAnalysisResult>(buildLyricsUrl({ songId, ...opts, topN: opts.topN ?? 50 })),
  analyzeAlbum: (albumId: string, opts: AnalysisOptions = {}) =>
    api.get<LyricsAnalysisResult>(buildLyricsUrl({ albumId, ...opts, topN: opts.topN ?? 50 })),
  analyzeBand: (bandId: string, opts: AnalysisOptions = {}) =>
    api.get<LyricsAnalysisResult>(buildLyricsUrl({ bandId, ...opts, topN: opts.topN ?? 50 })),
  analyzeSongIds: (songIds: string[], opts: AnalysisOptions = {}) => {
    const base = songIds.map((id) => `songIds[]=${encodeURIComponent(id)}`).join('&');
    const extra = Object.entries(opts)
      .filter(([, v]) => v !== undefined && v !== false)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return api.get<LyricsAnalysisResult>(
      `/api/analysis/lyrics?${base}&topN=${opts.topN ?? 50}${extra ? `&${extra}` : ''}`,
    );
  },

  scoresByBand: (bandId: string) => api.get<AxisAverage[]>(`/api/analysis/scores/band/${bandId}`),
  scoresByAlbum: (albumId: string) =>
    api.get<AxisAverage[]>(`/api/analysis/scores/album/${albumId}`),

  compare: (query: CompareQueryInput) => api.post<ComparisonResult>('/api/analysis/compare', query),

  getAiAnalysis: (songId: string) => api.get<SongAiAnalysis>(`/api/analysis/ai/${songId}`),
  regenerateAiAnalysis: (songId: string) =>
    api.post<SongAiAnalysis>(`/api/analysis/ai/${songId}/regenerate`, {}),

  getAiSpectrum: (songId: string) => api.get<SongAiSpectrum>(`/api/analysis/ai/${songId}/spectrum`),
  regenerateAiSpectrum: (songId: string) =>
    api.post<SongAiSpectrum>(`/api/analysis/ai/${songId}/spectrum/regenerate`, {}),

  getSongResearch: (songId: string) =>
    api.get<SongResearch>(`/api/analysis/ai/${songId}/research`),
  regenerateSongResearch: (songId: string) =>
    api.post<SongResearch>(`/api/analysis/ai/${songId}/research/regenerate`, {}),

  getSongContext: (songId: string) =>
    api.get<SongContextAnalysis>(`/api/analysis/ai/${songId}/context`),
  regenerateSongContext: (songId: string) =>
    api.post<SongContextAnalysis>(`/api/analysis/ai/${songId}/context/regenerate`, {}),
};

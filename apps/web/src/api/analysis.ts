import { api } from '../lib/api';
import type {
  LyricsAnalysisResult,
  ComparisonResult,
  CompareQueryInput,
  SongAiAnalysis,
  SongAiSpectrum,
  SongMusicScore,
  SongResearch,
  SongContextAnalysis,
  SongAiGenreSpectrum,
  AlbumContextAnalysis,
  BandContextAnalysis,
  SongThemeScore,
  ThemeSimilarSong,
  SongAudienceProfile,
  AlbumAudienceProfile,
  BandAudienceProfile,
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

  generateCoreScore: (songId: string) =>
    api.post<{ aggression: number; complexity: number; atmosphere: number; emotion: number; psychedelic: number; concept: number; rationale: string }>(
      `/api/analysis/ai/${songId}/core-score/generate`, {},
    ),

  getSongResearch: (songId: string) =>
    api.get<SongResearch>(`/api/analysis/ai/${songId}/research`),
  regenerateSongResearch: (songId: string) =>
    api.post<SongResearch>(`/api/analysis/ai/${songId}/research/regenerate`, {}),

  getSongContext: (songId: string) =>
    api.get<SongContextAnalysis>(`/api/analysis/ai/${songId}/context`),
  regenerateSongContext: (songId: string) =>
    api.post<SongContextAnalysis>(`/api/analysis/ai/${songId}/context/regenerate`, {}),

  getAiGenreSpectrum: (songId: string) =>
    api.get<SongAiGenreSpectrum>(`/api/analysis/ai/${songId}/genre-spectrum`),
  regenerateAiGenreSpectrum: (songId: string) =>
    api.post<SongAiGenreSpectrum>(`/api/analysis/ai/${songId}/genre-spectrum/regenerate`, {}),

  getMusicScore: (songId: string) =>
    api.get<SongMusicScore>(`/api/analysis/ai/${songId}/music-score`),
  regenerateMusicScore: (songId: string) =>
    api.post<SongMusicScore>(`/api/analysis/ai/${songId}/music-score/regenerate`, {}),

  getAudioSpectrum: (songId: string) =>
    api.get<{ aggression: number; complexity: number; atmosphere: number; emotion: number; psychedelic: number; concept: number; songTitle: string; artistName: string; analyzedAt: string } | null>(
      `/api/analysis/ai/${songId}/audio-spectrum`,
    ),

  getAiTags: (songId: string) =>
    api.get<{ tags: { name: string; description: string }[] }>(`/api/analysis/ai/${songId}/tags`),
  generateAiTags: (songId: string) =>
    api.post<{ tags: { name: string; description: string }[] }>(`/api/analysis/ai/${songId}/tags`, {}),

  getAlbumContext: (albumId: string) =>
    api.get<AlbumContextAnalysis>(`/api/analysis/albums/${albumId}/context`),
  regenerateAlbumContext: (albumId: string) =>
    api.post<AlbumContextAnalysis>(`/api/analysis/albums/${albumId}/context/regenerate`, {}),

  getBandContext: (bandId: string) =>
    api.get<BandContextAnalysis>(`/api/analysis/bands/${bandId}/context`),
  regenerateBandContext: (bandId: string) =>
    api.post<BandContextAnalysis>(`/api/analysis/bands/${bandId}/context/regenerate`, {}),

  getThemeScores: (songId: string) =>
    api.get<SongThemeScore[]>(`/api/analysis/ai/${songId}/themes`),
  regenerateThemeScores: (songId: string) =>
    api.post<SongThemeScore[]>(`/api/analysis/ai/${songId}/themes/regenerate`, {}),
  getSimilarByTheme: (songId: string, bandId?: string) =>
    api.get<ThemeSimilarSong[]>(
      `/api/analysis/ai/${songId}/themes/similar${bandId ? `?bandId=${encodeURIComponent(bandId)}` : ''}`,
    ),

  // Compound mode: 2 OpenAI calls cover all 7 AI job types
  runCompoundAnalysis: (songId: string, force: boolean) =>
    api.post<{ phase1Ran: boolean; phase2Ran: boolean }>(`/api/admin/ai-batch/compound/${songId}`, { force }),

  // Audience Profile — Music Identity Framework (Phase O)
  getAudienceProfile: (songId: string) =>
    api.get<SongAudienceProfile>(`/api/analysis/ai/${songId}/audience-profile`),
  regenerateAudienceProfile: (songId: string) =>
    api.post<SongAudienceProfile>(`/api/analysis/ai/${songId}/audience-profile/regenerate`, {}),

  getAlbumAudienceProfile: (albumId: string) =>
    api.get<AlbumAudienceProfile>(`/api/analysis/albums/${albumId}/audience-profile`),
  regenerateAlbumAudienceProfile: (albumId: string) =>
    api.post<AlbumAudienceProfile>(`/api/analysis/albums/${albumId}/audience-profile/regenerate`, {}),

  getBandAudienceProfile: (bandId: string) =>
    api.get<BandAudienceProfile>(`/api/analysis/bands/${bandId}/audience-profile`),
  regenerateBandAudienceProfile: (bandId: string) =>
    api.post<BandAudienceProfile>(`/api/analysis/bands/${bandId}/audience-profile/regenerate`, {}),
};

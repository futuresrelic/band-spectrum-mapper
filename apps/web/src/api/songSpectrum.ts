import { api } from '../lib/api';
import type {
  SongSpectrumAnalysis,
  YouTubeMetadata,
} from '@band-spectrum-mapper/shared';

export const songSpectrumApi = {
  status(): Promise<{ audioWorker: boolean; youtubeApi: boolean; youtubeAudio: boolean }> {
    return api.get('/api/song-spectrum/status');
  },

  fetchYouTubeMetadata(url: string): Promise<YouTubeMetadata> {
    return api.post('/api/song-spectrum/youtube-metadata', { url });
  },

  analyzeAudio(params: {
    file: File;
    songTitle: string;
    artistName: string;
    youtubeUrl?: string;
    analysisId?: string;
    lyricsContext?: string;
    analysisNotes?: string;
    songId?: string;
  }): Promise<SongSpectrumAnalysis> {
    const fd = new FormData();
    fd.append('audio', params.file, params.file.name);
    fd.append('songTitle', params.songTitle);
    fd.append('artistName', params.artistName);
    if (params.youtubeUrl) fd.append('youtubeUrl', params.youtubeUrl);
    if (params.analysisId) fd.append('analysisId', params.analysisId);
    if (params.lyricsContext) fd.append('lyricsContext', params.lyricsContext);
    if (params.analysisNotes) fd.append('analysisNotes', params.analysisNotes);
    if (params.songId) fd.append('songId', params.songId);
    return api.postForm('/api/song-spectrum/analyze-audio', fd);
  },

  analyzeFromYouTube(params: {
    youtubeUrl: string;
    songTitle: string;
    artistName: string;
    analysisId?: string;
    lyricsContext?: string;
    analysisNotes?: string;
    songId?: string;
  }): Promise<SongSpectrumAnalysis> {
    return api.post('/api/song-spectrum/analyze-youtube-audio', params);
  },

  createStub(params: {
    songTitle: string;
    artistName: string;
    youtubeUrl?: string;
    ytMetadata?: YouTubeMetadata;
    songId?: string;
  }): Promise<SongSpectrumAnalysis> {
    return api.post('/api/song-spectrum/analyses', params);
  },

  list(): Promise<SongSpectrumAnalysis[]> {
    return api.get('/api/song-spectrum/analyses');
  },

  get(id: string): Promise<SongSpectrumAnalysis> {
    return api.get(`/api/song-spectrum/analyses/${id}`);
  },

  finalScore(analysisId: string, songId?: string): Promise<SongSpectrumAnalysis> {
    return api.post('/api/song-spectrum/final-score', { analysisId, songId });
  },

  delete(id: string): Promise<void> {
    return api.delete(`/api/song-spectrum/analyses/${id}`);
  },

  pushToLibrary(id: string): Promise<{ ok: boolean; pushed: Record<string, number> }> {
    return api.post(`/api/song-spectrum/analyses/${id}/push-to-library`, {});
  },
};

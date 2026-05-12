import { api } from '../lib/api';
import type {
  Song,
  Lyric,
  LyricRevision,
  SongAxisScore,
  SongWithLyrics,
  SongComment,
  UpdateSongInput,
  CreateLyricInput,
  UpdateLyricInput,
  UpsertScoreInput,
} from '@band-spectrum-mapper/shared';

export const songsApi = {
  getById: (id: string) => api.get<SongWithLyrics>(`/api/songs/${id}`),
  update: (id: string, data: UpdateSongInput) => api.patch<Song>(`/api/songs/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/songs/${id}`),
  search: (q: string) => api.get<Song[]>(`/api/songs/search?q=${encodeURIComponent(q)}`),

  getLyrics: (songId: string) => api.get<Lyric[]>(`/api/songs/${songId}/lyrics`),
  createLyric: (songId: string, data: CreateLyricInput) =>
    api.post<Lyric>(`/api/songs/${songId}/lyrics`, data),
  fetchAiLyrics: (songId: string) =>
    api.post<Lyric>(`/api/songs/${songId}/ai-lyrics`, {}),

  lyricsLookup: (artist: string, title: string) =>
    api.get<{ lyrics: string | null }>(
      `/api/songs/lyrics-lookup?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`
    ),

  getScore: (songId: string) => api.get<SongAxisScore>(`/api/songs/${songId}/score`),
  upsertScore: (songId: string, data: UpsertScoreInput) =>
    api.put<SongAxisScore>(`/api/songs/${songId}/score`, data),

  getComments: (songId: string) =>
    api.get<SongComment[]>(`/api/songs/${songId}/comments`),
  postComment: (songId: string, text: string) =>
    api.post<SongComment>(`/api/songs/${songId}/comments`, { text }),
  deleteComment: (songId: string, commentId: string) =>
    api.delete<void>(`/api/songs/${songId}/comments/${commentId}`),
};

export const lyricsApi = {
  getById: (id: string) => api.get<Lyric>(`/api/lyrics/${id}`),
  update: (id: string, data: UpdateLyricInput) => api.patch<Lyric>(`/api/lyrics/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/lyrics/${id}`),
  getRevisions: (id: string) => api.get<LyricRevision[]>(`/api/lyrics/${id}/revisions`),
  restoreRevision: (lyricId: string, revisionId: string) =>
    api.post<Lyric>(`/api/lyrics/${lyricId}/revisions/${revisionId}/restore`, {}),
};

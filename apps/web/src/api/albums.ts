import { api } from '../lib/api';
import type { Album, Song, AlbumWithSongs, UpdateAlbumInput } from '@band-spectrum-mapper/shared';

export const albumsApi = {
  getById: (id: string) => api.get<AlbumWithSongs>(`/api/albums/${id}`),
  update: (id: string, data: UpdateAlbumInput) => api.patch<Album>(`/api/albums/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/albums/${id}`),
  getSongs: (albumId: string) => api.get<Song[]>(`/api/albums/${albumId}/songs`),
};

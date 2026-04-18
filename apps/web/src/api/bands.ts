import { api } from '../lib/api';
import type {
  Band,
  BandWithCounts,
  Album,
  Song,
  CreateBandInput,
  UpdateBandInput,
  CreateAlbumInput,
  CreateSongInput,
} from '@band-spectrum-mapper/shared';

export const bandsApi = {
  list: (search?: string) =>
    api.get<BandWithCounts[]>(`/api/bands${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getById: (id: string) => api.get<Band & { albums: Album[] }>(`/api/bands/${id}`),
  create: (data: CreateBandInput) => api.post<Band>('/api/bands', data),
  update: (id: string, data: UpdateBandInput) => api.patch<Band>(`/api/bands/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/bands/${id}`),

  listAlbums: (bandId: string) => api.get<Album[]>(`/api/bands/${bandId}/albums`),
  createAlbum: (bandId: string, data: CreateAlbumInput) =>
    api.post<Album>(`/api/bands/${bandId}/albums`, data),

  listSongs: (bandId: string, search?: string) =>
    api.get<Song[]>(`/api/bands/${bandId}/songs${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createSong: (bandId: string, data: CreateSongInput) =>
    api.post<Song>(`/api/bands/${bandId}/songs`, data),
};

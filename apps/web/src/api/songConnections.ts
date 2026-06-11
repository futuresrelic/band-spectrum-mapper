import { api } from '../lib/api';

export interface SongConnectionItem {
  songId: string;
  title: string;
  bandId: string;
  bandName: string;
  albumId?: string;
  albumTitle?: string;
  connectionCount: number;
  sharedWords: string[];
  sharedWordCount: number;
  sharedThemes: string[];
  sharedTags: string[];
  sameAlbum: boolean;
  sameArtist: boolean;
}

export interface SongConnectionsResponse {
  sourceSong: {
    id: string;
    title: string;
    bandId: string;
    bandName: string;
    albumId?: string;
    albumTitle?: string;
  };
  connections: SongConnectionItem[];
  totalCount: number;
}

export interface SongSearchResult {
  id: string;
  title: string;
  band: { id: string; name: string; slug: string };
  album: { id: string; title: string; slug: string } | null;
}

export interface Band {
  id: string;
  name: string;
  slug: string;
}

export const songConnectionsApi = {
  getConnections: (songId: string): Promise<SongConnectionsResponse> =>
    api.get(`/api/song-connections/${encodeURIComponent(songId)}`),

  search: (q: string): Promise<SongSearchResult[]> =>
    api.get(`/api/songs/search?q=${encodeURIComponent(q)}`),

  getBands: (): Promise<Band[]> =>
    api.get('/api/bands'),
};

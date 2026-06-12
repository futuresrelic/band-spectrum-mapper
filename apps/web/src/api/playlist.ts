const BASE = '/api/playlist';

export interface PlaylistBand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  _count: { songs: number };
}

export interface PlaylistAlbum {
  id: string;
  title: string;
  year: number | null;
  artworkUrl: string | null;
}

export interface PlaylistBandRef {
  id: string;
  name: string;
  slug: string;
}

export interface RoundSong {
  id: string;
  title: string;
  durationSeconds: number | null;
  bandId: string;
  band: PlaylistBandRef & { logoUrl: string | null };
  album: PlaylistAlbum | null;
}

export interface SavedPlaylistSong {
  id: string;
  songId: string;
  position: number;
  addedAt: string;
  song: {
    id: string;
    title: string;
    durationSeconds: number | null;
    band: PlaylistBandRef;
    album: PlaylistAlbum | null;
  };
}

export interface SavedPlaylist {
  id: string;
  name: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  songs: SavedPlaylistSong[];
}

export interface PlaylistSummary {
  id: string;
  name: string;
  createdAt: string;
  _count: { songs: number };
}

export const playlistApi = {
  getBands: async (): Promise<PlaylistBand[]> => {
    const r = await fetch(`${BASE}/bands`);
    if (!r.ok) throw new Error('Failed to load bands');
    return r.json() as Promise<PlaylistBand[]>;
  },

  getRound: async (bandIds: string[], count: number, excludeIds: string[]): Promise<RoundSong[]> => {
    const params = new URLSearchParams({
      bandIds: bandIds.join(','),
      count: String(count),
      ...(excludeIds.length > 0 ? { exclude: excludeIds.join(',') } : {}),
    });
    const r = await fetch(`${BASE}/round?${params.toString()}`);
    if (!r.ok) throw new Error('Failed to load round');
    return r.json() as Promise<RoundSong[]>;
  },

  savePlaylist: async (name: string, songIds: string[]): Promise<SavedPlaylist> => {
    const r = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, songIds }),
    });
    if (!r.ok) throw new Error('Failed to save playlist');
    return r.json() as Promise<SavedPlaylist>;
  },

  getPlaylist: async (id: string): Promise<SavedPlaylist> => {
    const r = await fetch(`${BASE}/${id}`);
    if (!r.ok) throw new Error('Playlist not found');
    return r.json() as Promise<SavedPlaylist>;
  },

  listPlaylists: async (): Promise<PlaylistSummary[]> => {
    const r = await fetch(BASE);
    if (!r.ok) throw new Error('Failed to load playlists');
    return r.json() as Promise<PlaylistSummary[]>;
  },

  deletePlaylist: async (id: string): Promise<void> => {
    const r = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Failed to delete playlist');
  },
};

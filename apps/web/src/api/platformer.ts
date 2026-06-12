import { api } from '../lib/api';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PlatformerAsset {
  id: string;
  assetType: string;
  name: string;
  dataUrl: string;
  metadata?: { frameCount?: number; frameWidth?: number; frameHeight?: number } | null;
}

export interface PlatformerScore {
  rank: number;
  playerName: string;
  avatarUrl?: string | null;
  score: number;
  level: number;
  recordsCollected: number;
  distancePx: number;
  bandScopeNames?: string | null;
  createdAt: string;
}

export interface PlatformerAlbum {
  id: string;
  title: string;
  artworkUrl: string | null;
  bandName: string;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const platformerApi = {
  /** Fetch top N leaderboard scores (default: 25). */
  getScores(limit?: number): Promise<PlatformerScore[]> {
    const qs = limit !== undefined ? `?limit=${limit}` : '';
    return api.get<PlatformerScore[]>(`/api/platformer/scores${qs}`);
  },

  /** Submit a completed run score. */
  saveScore(payload: {
    score: number;
    level: number;
    recordsCollected: number;
    distancePx: number;
    bandIds?: string[];
  }): Promise<{ ok: boolean; rank: number }> {
    return api.post<{ ok: boolean; rank: number }>('/api/platformer/scores', payload);
  },

  /** Fetch all uploaded sprite / background assets. */
  getAssets(): Promise<PlatformerAsset[]> {
    return api.get<PlatformerAsset[]>('/api/platformer/assets');
  },

  /** Fetch a single asset by type.  Returns null if not found (404). */
  async getAsset(type: string): Promise<PlatformerAsset | null> {
    try {
      return await api.get<PlatformerAsset>(`/api/platformer/assets/${encodeURIComponent(type)}`);
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  },

  /** Create or replace a sprite / background asset. */
  uploadAsset(payload: {
    assetType: string;
    name: string;
    dataUrl: string;
    metadata?: { frameCount?: number; frameWidth?: number; frameHeight?: number };
  }): Promise<PlatformerAsset> {
    const { assetType, ...body } = payload;
    return api.put<PlatformerAsset>(`/api/platformer/assets/${encodeURIComponent(assetType)}`, body);
  },

  /** Delete an asset by type. */
  deleteAsset(type: string): Promise<void> {
    return api.delete<void>(`/api/platformer/assets/${encodeURIComponent(type)}`);
  },

  /** Fetch all gameplay config values as a flat key→value map. */
  getConfig(): Promise<Record<string, string>> {
    return api.get<Record<string, string>>('/api/platformer/config');
  },

  /** Persist updated gameplay config values. */
  saveConfig(config: Record<string, string>): Promise<{ ok: boolean }> {
    return api.put<{ ok: boolean }>('/api/platformer/config', config);
  },

  /** Fetch albums belonging to the given bands (for collectible override previews). */
  getAlbums(bandIds: string[]): Promise<PlatformerAlbum[]> {
    const qs = bandIds.map((id) => `bandIds=${encodeURIComponent(id)}`).join('&');
    return api.get<PlatformerAlbum[]>(`/api/platformer/albums?${qs}`);
  },
};

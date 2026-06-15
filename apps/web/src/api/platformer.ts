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

export interface PlatformerMember {
  id: string;
  name: string;
  role: string | null;
  bandId: string;
}

export interface BodySkin {
  id: string;
  name: string;
  role: string | null;
  dataUrl: string | null;
  torsoUrl: string | null;
  armUrl: string | null;
  legUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterSkin {
  id: string;
  name: string;
  dataUrl: string;
  bandId: string | null;
  memberId: string | null;
  isAiGenerated: boolean;
  member?: { name: string; role?: string | null } | null;
  band?: { name: string } | null;
  submittedBy?: { name: string | null; avatarUrl: string | null } | null;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Custom level types (used by level designer and game)
// ---------------------------------------------------------------------------

export type EditorColBase = 'ground' | 'gap' | 'plat-low' | 'plat-mid' | 'plat-high';

export interface EditorCol {
  base: EditorColBase;
  hasRecord: boolean;
  hasEnemy: boolean;
}

export interface LevelData {
  colWidthUnits: number; // world units per column (default 100)
  cols: EditorCol[];
}

export interface PlatformerLevelSummary {
  id: string;
  name: string;
  description: string | null;
  isTemplate: boolean;
  levelData: LevelData;
  createdAt: string;
  updatedAt: string;
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

  // ---------------------------------------------------------------------------
  // Band members
  // ---------------------------------------------------------------------------

  getMembers(bandIds?: string[]): Promise<PlatformerMember[]> {
    const qs = bandIds?.length
      ? `?bandIds=${bandIds.map(encodeURIComponent).join(',')}`
      : '';
    return api.get<PlatformerMember[]>(`/api/platformer/members${qs}`);
  },

  addMember(data: { bandId: string; name: string; role?: string }): Promise<PlatformerMember> {
    return api.post<PlatformerMember>('/api/platformer/members', data);
  },

  deleteMember(id: string): Promise<void> {
    return api.delete<void>(`/api/platformer/members/${encodeURIComponent(id)}`);
  },

  suggestMembers(bandId: string): Promise<{ suggestions: { name: string; role: string }[] }> {
    return api.post<{ suggestions: { name: string; role: string }[] }>('/api/platformer/members/suggest', { bandId });
  },

  // ---------------------------------------------------------------------------
  // Character skins
  // ---------------------------------------------------------------------------

  getSkins(params?: { bandIds?: string[]; excludeBandIds?: string[] }): Promise<CharacterSkin[]> {
    const qs = new URLSearchParams();
    if (params?.bandIds?.length) qs.set('bandIds', params.bandIds.join(','));
    if (params?.excludeBandIds?.length) qs.set('excludeBandIds', params.excludeBandIds.join(','));
    const q = qs.toString();
    return api.get<CharacterSkin[]>(`/api/platformer/skins${q ? `?${q}` : ''}`);
  },

  submitSkin(data: {
    name: string;
    dataUrl: string;
    bandId?: string;
    memberId?: string;
  }): Promise<CharacterSkin> {
    return api.post<CharacterSkin>('/api/platformer/skins', data);
  },

  getPendingSkins(): Promise<CharacterSkin[]> {
    return api.get<CharacterSkin[]>('/api/platformer/skins/pending');
  },

  approveSkin(id: string): Promise<CharacterSkin> {
    return api.put<CharacterSkin>(`/api/platformer/skins/${encodeURIComponent(id)}/approve`, {});
  },

  deleteSkin(id: string): Promise<void> {
    return api.delete<void>(`/api/platformer/skins/${encodeURIComponent(id)}`);
  },

  updateSkin(id: string, data: { dataUrl: string }): Promise<CharacterSkin> {
    return api.put<CharacterSkin>(`/api/platformer/skins/${encodeURIComponent(id)}`, data);
  },

  assignSkin(id: string, data: { memberId?: string | null; bandId?: string | null }): Promise<CharacterSkin> {
    return api.put<CharacterSkin>(`/api/platformer/skins/${encodeURIComponent(id)}/assign`, data);
  },

  aiGenerateSkin(data: {
    memberId?: string;
    memberName: string;
    memberRole?: string | null;
    bandName: string;
    bandId?: string;
  }): Promise<CharacterSkin> {
    return api.post<CharacterSkin>('/api/platformer/skins/ai-generate', data);
  },

  // ---------------------------------------------------------------------------
  // Body skins
  // ---------------------------------------------------------------------------

  getBodySkins(): Promise<BodySkin[]> {
    return api.get<BodySkin[]>('/api/platformer/body-skins');
  },

  createBodySkin(data: {
    name: string;
    role?: string | null;
    isDefault?: boolean;
    dataUrl?: string | null;
    torsoUrl?: string | null;
    armUrl?: string | null;
    legUrl?: string | null;
  }): Promise<BodySkin> {
    return api.post<BodySkin>('/api/platformer/body-skins', data);
  },

  updateBodySkin(id: string, data: {
    name?: string;
    role?: string | null;
    isDefault?: boolean;
    dataUrl?: string | null;
    torsoUrl?: string | null;
    armUrl?: string | null;
    legUrl?: string | null;
  }): Promise<BodySkin> {
    return api.put<BodySkin>(`/api/platformer/body-skins/${encodeURIComponent(id)}`, data);
  },

  deleteBodySkin(id: string): Promise<void> {
    return api.delete<void>(`/api/platformer/body-skins/${encodeURIComponent(id)}`);
  },

  // ---------------------------------------------------------------------------
  // Custom levels
  // ---------------------------------------------------------------------------

  getLevels(): Promise<PlatformerLevelSummary[]> {
    return api.get<PlatformerLevelSummary[]>('/api/platformer/levels');
  },

  getLevel(id: string): Promise<PlatformerLevelSummary> {
    return api.get<PlatformerLevelSummary>(`/api/platformer/levels/${encodeURIComponent(id)}`);
  },

  createLevel(data: { name: string; description?: string; isTemplate?: boolean; levelData: LevelData }): Promise<PlatformerLevelSummary> {
    return api.post<PlatformerLevelSummary>('/api/platformer/levels', data);
  },

  updateLevel(id: string, data: { name?: string; description?: string | null; isTemplate?: boolean; levelData?: LevelData }): Promise<PlatformerLevelSummary> {
    return api.put<PlatformerLevelSummary>(`/api/platformer/levels/${encodeURIComponent(id)}`, data);
  },

  deleteLevel(id: string): Promise<void> {
    return api.delete<void>(`/api/platformer/levels/${encodeURIComponent(id)}`);
  },
};

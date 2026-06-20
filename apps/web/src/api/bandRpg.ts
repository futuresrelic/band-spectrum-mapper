import { api } from '../lib/api';

// ── Selection types ───────────────────────────────────────────────────────────

export interface BandRpgSelectedBand {
  id: string;
  name: string;
  logoUrl?: string | null;
}

export interface BandRpgSelectedCharacter {
  id: string;           // memberId, skinId, or 'archivist'
  name: string;
  role?: string | null;
  dataUrl?: string | null;
}

// ── Session (song discovery) ──────────────────────────────────────────────────

export interface BandRpgLyricFragment {
  id: string;
  text: string;
}

export interface BandRpgSession {
  songId: string | null;
  songTitle: string | null;
  songRarity: string | null;
  fragments: BandRpgLyricFragment[];
}

export interface BandRpgSong {
  id: string;
  title: string;
}

// ── API response types ────────────────────────────────────────────────────────

export interface BandRpgScoreEntry {
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  score: number;
  questsCompleted: number;
  itemsCollected: number;
  bandName: string | null;
  characterName: string | null;
  songTitle: string | null;
  guessedCorrectly: boolean;
  guessBonus: number;
  createdAt: string;
}

export interface BandRpgStats {
  totalRuns: number;
  totalScore: number;
  totalSongsRecovered: number;
  uniqueSongsRecovered: number;
  correctGuessCount: number;
  investigationAccuracy: number;
  albumsCompleted: number;
  favoriteBandId: string | null;
  favoriteBandName: string | null;
  favoriteCharacterId: string | null;
  favoriteCharacterName: string | null;
  lastPlayedAt: string | null;
}

// ── Collection types ──────────────────────────────────────────────────────────

export interface BandRpgCollectedSong {
  id: string;
  songId: string;
  songTitle: string;
  bandId: string;
  bandName: string;
  guessedCorrectly: boolean;
  scoreEarned: number;
  rarity: string;
  recoveredAt: string;
}

export interface BandRpgCollectionGroup {
  bandId: string;
  bandName: string;
  collected: BandRpgCollectedSong[];
  totalSongsInBand: number;
}

// ── Album types ───────────────────────────────────────────────────────────────

export type AlbumState = 'not_started' | 'in_progress' | 'completed';

export interface BandRpgAlbumProgress {
  albumId: string;
  albumTitle: string;
  artworkUrl: string | null;
  albumType: string | null;
  year: number | null;
  bandId: string;
  bandName: string;
  totalSongs: number;
  recoveredSongs: number;
  completionPct: number;
  state: AlbumState;
  completedAt: string | null;
}

export interface BandRpgBandAlbumGroup {
  bandId: string;
  bandName: string;
  totalAlbums: number;
  completedAlbums: number;
  albums: BandRpgAlbumProgress[];
}

export interface BandRpgAlbumSong {
  songId: string;
  title: string;
  rarity: string;
  trackNumber: number | null;
  recovered: boolean;
  recoveredAt: string | null;
  guessedCorrectly: boolean;
}

export interface BandRpgAlbumDetail extends BandRpgAlbumProgress {
  songs: BandRpgAlbumSong[];
}

// ── Setlist types ─────────────────────────────────────────────────────────────

export interface BandRpgSetlistSummary {
  id: string;
  bandId: string;
  bandName: string;
  name: string;
  songCount: number;
  rarityValue: number;
  albumCount: number;
  diversityBonus: number;
  grade: string;
  createdAt: string;
  updatedAt: string;
}

export interface BandRpgSetlistSongEntry {
  id: string;
  songId: string;
  songTitle: string;
  rarity: string;
  position: number;
  addedAt: string;
}

export interface BandRpgSetlistDetail extends BandRpgSetlistSummary {
  rarityBreakdown: Record<string, number>;
  songs: BandRpgSetlistSongEntry[];
}

// ── Venue types ───────────────────────────────────────────────────────────────

export interface BandRpgVenue {
  id: string;
  name: string;
  description: string;
  capacity: number;
  atmosphereAffinity: number;
  aggressionAffinity: number;
  complexityAffinity: number;
  emotionAffinity: number;
  psychedelicAffinity: number;
  conceptAffinity: number;
  rarityBonus: number;
}

// ── Concert types ─────────────────────────────────────────────────────────────

export interface BandRpgConcertSummary {
  id: string;
  concertName: string;
  bandId: string;
  bandName: string;
  setlistId: string;
  setlistName: string;
  songCount: number;
  rarityValue: number;
  albumCount: number;
  diversityBonus: number;
  flowScore: number;
  openerScore: number;
  closerScore: number;
  venueId: string | null;
  venueName: string | null;
  venueFit: number | null;
  venueFitLabel: string | null;
  venueContribution: number;
  concertTotal: number;
  grade: string;
  encorePosition: number | null;
  realWorldScore: number | null;
  fanServiceScore: number;
  deepCutScore: number;
  concertPersonality: string;
  createdAt: string;
  updatedAt: string;
}

export interface BandRpgConcertVenueAffinities {
  aggression: number;
  atmosphere: number;
  emotion: number;
  complexity: number;
  psychedelic: number;
  concept: number;
}

export interface BandRpgConcertLegendRef {
  songId: string;
  songTitle: string;
  rarity: string;
  position: number;
}

export interface BandRpgConcertDetail extends BandRpgConcertSummary {
  avgAggression: number | null;
  avgAtmosphere: number | null;
  avgEmotion: number | null;
  avgComplexity: number | null;
  avgPsychedelic: number | null;
  avgConcept: number | null;
  openerLabel: string;
  closerLabel: string;
  venueDescription: string | null;
  venueAffinities: BandRpgConcertVenueAffinities | null;
  rarityBreakdown: Record<string, number>;
  songs: BandRpgSetlistSongEntry[];
  mainSet: BandRpgSetlistSongEntry[];
  encore: BandRpgSetlistSongEntry[];
  setlistStory: string;
  legendTrack: BandRpgConcertLegendRef | null;
  deepCutSong: BandRpgConcertLegendRef | null;
  mostFamiliar: BandRpgConcertLegendRef | null;
}

// ── Festival types ────────────────────────────────────────────────────────────

export interface AudienceArchetype {
  key: string;
  name: string;
  icon: string;
  score: number;
  explanation: string;
}

export interface FestivalAudienceProfile {
  archetypes: AudienceArchetype[];
  primaryArchetype: AudienceArchetype;
  secondaryArchetype: AudienceArchetype | null;
  audienceDiversityScore: number;
  audienceDiversityLabel: string;
  audienceReport: string;
}

export interface LineupAnalysis {
  flowRating: number;
  lineupReport: string;
  headlinerScore: number;
  openerScore: number;
  headlinerName: string;
  openerName: string;
  headlinerBandName: string;
  openerBandName: string;
  headlinerIsStrongest: boolean;
}

export interface FestivalChemistry {
  chemistryScore: number;
  chemistryLabel: string;
  chemistryReport: string;
  audienceOverlap: number | null;
  personalityCompatibility: number;
  festivalFlow: number;
  venueCompatibility: number | null;
  fanServiceBalance: number;
  deepCutBalance: number;
  hasAudienceData: boolean;
}

export interface BandRpgFestivalConcertEntry {
  festivalConcertId: string;
  position: number;
  concertId: string;
  concertName: string;
  bandId: string;
  bandName: string;
  songCount: number;
  grade: string;
  concertTotal: number;
  concertPersonality: string;
  fanServiceScore: number;
  deepCutScore: number;
  venueFit: number | null;
  venueFitLabel: string | null;
  venueName: string | null;
  flowScore: number;
  openerScore: number;
  closerScore: number;
  role: string;
  roleLabel: string;
  headlinerStrength: number;
  openerStrength: number;
}

export interface FestivalAchievement {
  key: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
}

export interface FestivalPrestige {
  prestigeScore: number;
  prestigeTier: string;
  legacyReport: string;
  achievements: FestivalAchievement[];
}

export interface BandRpgFestivalSummary {
  id: string;
  name: string;
  description: string | null;
  isDream: boolean;
  concertCount: number;
  bandCount: number;
  totalSongs: number;
  avgFanService: number;
  avgDeepCuts: number;
  avgVenueFit: number | null;
  festivalPersonality: string;
  festivalStory: string;
  chemistry: FestivalChemistry;
  lineupAnalysis: LineupAnalysis;
  audience: FestivalAudienceProfile;
  prestige: FestivalPrestige;
  createdAt: string;
  updatedAt: string;
}

export interface BandRpgFestivalDetail extends BandRpgFestivalSummary {
  concerts: BandRpgFestivalConcertEntry[];
}

// ── API client ────────────────────────────────────────────────────────────────

export const bandRpgApi = {
  startSession: (bandId: string) =>
    api.get<BandRpgSession>(`/api/band-rpg/start-session?bandId=${encodeURIComponent(bandId)}`),

  getSongs: (bandId: string) =>
    api.get<BandRpgSong[]>(`/api/band-rpg/songs?bandId=${encodeURIComponent(bandId)}`),

  submitScore: (data: {
    score: number;
    questsCompleted: number;
    itemsCollected: number;
    levelsCleared: number;
    bandId?: string;
    bandName?: string;
    characterId?: string;
    characterName?: string;
    songId?: string;
    songTitle?: string;
    guessedCorrectly?: boolean;
    guessBonus?: number;
  }) => api.post<{ ok: boolean; score: number; rank: number }>('/api/band-rpg/scores', data),

  getLeaderboard: (limit = 10, bandId?: string) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (bandId) qs.set('bandId', bandId);
    return api.get<BandRpgScoreEntry[]>(`/api/band-rpg/scores?${qs.toString()}`);
  },

  saveProgress: (data: {
    questPhase: string;
    score: number;
    bandId?: string;
    bandName?: string;
    characterId?: string;
    characterName?: string;
  }) => api.post<{ ok: boolean }>('/api/band-rpg/progress', data),

  getStats: () => api.get<BandRpgStats>('/api/band-rpg/stats'),

  collectSong: (data: {
    songId: string;
    songTitle: string;
    bandId: string;
    bandName: string;
    guessedCorrectly: boolean;
    scoreEarned: number;
    rarity?: string;
  }) => api.post<{
    ok: boolean; isNew: boolean; albumCompleted: boolean;
    completedAlbumId?: string; completedAlbumTitle?: string;
  }>('/api/band-rpg/collect', data),

  getCollection: () => api.get<BandRpgCollectionGroup[]>('/api/band-rpg/collection'),

  getAlbums: () => api.get<BandRpgBandAlbumGroup[]>('/api/band-rpg/albums'),

  getAlbumDetail: (albumId: string) => api.get<BandRpgAlbumDetail>(`/api/band-rpg/albums/${encodeURIComponent(albumId)}`),

  getSetlists: () =>
    api.get<BandRpgSetlistSummary[]>('/api/band-rpg/setlists'),

  createSetlist: (data: { bandId: string; bandName: string; name: string }) =>
    api.post<{ ok: boolean; id: string }>('/api/band-rpg/setlists', data),

  getSetlistDetail: (id: string) =>
    api.get<BandRpgSetlistDetail>(`/api/band-rpg/setlists/${encodeURIComponent(id)}`),

  renameSetlist: (id: string, name: string) =>
    api.put<{ ok: boolean }>(`/api/band-rpg/setlists/${encodeURIComponent(id)}`, { name }),

  deleteSetlist: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/band-rpg/setlists/${encodeURIComponent(id)}`),

  updateSetlistSongs: (id: string, songs: Array<{ songId: string }>) =>
    api.put<{ ok: boolean; songCount: number }>(
      `/api/band-rpg/setlists/${encodeURIComponent(id)}/songs`,
      { songs },
    ),

  adminResetMyData: () =>
    api.post<{ ok: boolean; message: string }>('/api/band-rpg/admin/reset-my-data', {}),

  adminRandomizeRarities: (bandId: string) =>
    api.post<{ ok: boolean; updated: number }>('/api/band-rpg/admin/randomize-rarities', { bandId }),

  getConcerts: () =>
    api.get<BandRpgConcertSummary[]>('/api/band-rpg/concerts'),

  createConcert: (data: { setlistId: string; concertName: string }) =>
    api.post<{ ok: boolean; id: string }>('/api/band-rpg/concerts', data),

  getConcertDetail: (id: string) =>
    api.get<BandRpgConcertDetail>(`/api/band-rpg/concerts/${encodeURIComponent(id)}`),

  updateConcert: (id: string, data: { concertName?: string; encorePosition?: number | null; venueId?: string | null }) =>
    api.put<{ ok: boolean }>(`/api/band-rpg/concerts/${encodeURIComponent(id)}`, data),

  deleteConcert: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/band-rpg/concerts/${encodeURIComponent(id)}`),

  getVenues: () =>
    api.get<BandRpgVenue[]>('/api/band-rpg/venues'),

  getFestivals: () =>
    api.get<BandRpgFestivalSummary[]>('/api/band-rpg/festivals'),

  createFestival: (data: { name: string; description?: string; concertIds?: string[] }) =>
    api.post<{ ok: boolean; id: string }>('/api/band-rpg/festivals', data),

  getFestivalDetail: (id: string) =>
    api.get<BandRpgFestivalDetail>(`/api/band-rpg/festivals/${encodeURIComponent(id)}`),

  updateFestival: (id: string, data: { name?: string; description?: string }) =>
    api.put<{ ok: boolean }>(`/api/band-rpg/festivals/${encodeURIComponent(id)}`, data),

  deleteFestival: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/band-rpg/festivals/${encodeURIComponent(id)}`),

  updateFestivalConcerts: (id: string, concertIds: string[]) =>
    api.put<{ ok: boolean; concertCount: number }>(
      `/api/band-rpg/festivals/${encodeURIComponent(id)}/concerts`,
      { concertIds },
    ),

  setDreamFestival: (id: string, isDream: boolean) =>
    api.patch<{ ok: boolean; isDream: boolean }>(
      `/api/band-rpg/festivals/${encodeURIComponent(id)}/dream`,
      { isDream },
    ),
};

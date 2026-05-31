import { api } from '../lib/api';
import type { UserSongRating, CommunityScore, UserMusicRating, CommunityMusicScore } from '@band-spectrum-mapper/shared';

export interface SongRatings {
  myRating: UserSongRating | null;
  communityRating: CommunityScore | null;
}

export interface SongMusicRatings {
  myRating: UserMusicRating | null;
  communityRating: CommunityMusicScore | null;
}

export const ratingsApi = {
  // Single song: my rating + community
  getSongRatings: (songId: string) =>
    api.get<SongRatings>(`/api/ratings/songs/${songId}`),

  // Upsert my rating for a song
  upsertMyRating: (songId: string, data: {
    aggression: number; complexity: number; atmosphere: number;
    emotion: number; psychedelic: number; concept: number;
  }) => api.put<UserSongRating>(`/api/ratings/songs/${songId}`, data),

  // Batch my ratings for multiple songs
  getMyRatings: (songIds: string[]) =>
    api.get<Record<string, UserSongRating>>(`/api/ratings/me/songs?songIds=${songIds.join(',')}`),

  // Batch community ratings (public, no auth)
  getCommunityRatings: (songIds: string[]) =>
    api.get<Record<string, CommunityScore>>(`/api/public/community?songIds=${songIds.join(',')}`),

  // Single song: my music rating + community music rating
  getSongMusicRatings: (songId: string) =>
    api.get<SongMusicRatings>(`/api/ratings/songs/${songId}/music`),

  // Upsert my music rating for a song
  upsertMyMusicRating: (songId: string, data: {
    rhythmicComplexity: number; harmonicDepth: number; structuralComplexity: number;
    sonicDensity: number; tempoEnergy: number; tonalDarkness: number;
  }) => api.put<UserMusicRating>(`/api/ratings/songs/${songId}/music`, data),
};

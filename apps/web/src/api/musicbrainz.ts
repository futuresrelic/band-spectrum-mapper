import { api } from '../lib/api';

export interface MbArtist {
  id: string;
  name: string;
  sortName: string;
  disambiguation: string;
  country: string | null;
  type: string | null;
}

export interface MbReleaseGroup {
  id: string;
  title: string;
  year: number | null;
  primaryType: string;
}

export interface MbTrack {
  number: number;
  title: string;
  durationMs: number | null;
}

export interface MbRelease {
  releaseGroupId: string;
  title: string;
  year: number | null;
  tracks: MbTrack[];
}

export interface MbReleaseOption {
  id: string;
  title: string;
  date: string | null;
  country: string | null;
  status: string | null;
  formats: string[];
  trackCount: number;
}

export interface TokenStatus {
  tokens: number;
  nextRefresh: string; // ISO
}

export interface ContributionPayload {
  artistName: string;
  artistMbId: string;
  data: {
    artist: string;
    albums: {
      album_title: string;
      album_slug: string;
      year: number | null;
      tracks: { track_number: number; song_title: string; song_slug: string }[];
    }[];
  };
}

export const musicBrainzApi = {
  searchArtists: (q: string) =>
    api.get<MbArtist[]>(`/api/musicbrainz/search?q=${encodeURIComponent(q)}`),

  getArtistAlbums: (mbId: string) =>
    api.get<MbReleaseGroup[]>(`/api/musicbrainz/artists/${mbId}/albums`),

  getTracks: (releaseGroupIds: string[]) =>
    api.post<Record<string, MbRelease | null>>('/api/musicbrainz/tracks', { releaseGroupIds }),

  getReleaseOptions: (releaseGroupIds: string[]) =>
    api.post<Record<string, MbReleaseOption[]>>('/api/musicbrainz/release-options', { releaseGroupIds }),

  getTracksByRelease: (items: { releaseGroupId: string; releaseId: string }[]) =>
    api.post<Record<string, MbRelease | null>>('/api/musicbrainz/tracks-by-release', { items }),

  getTokens: () =>
    api.get<TokenStatus>('/api/contributions/tokens'),

  submitContribution: (payload: ContributionPayload) =>
    api.post<{ id: string }>('/api/contributions', payload),

  getMyContributions: () =>
    api.get<ContributionSummary[]>('/api/contributions/mine'),

  getContributions: (status?: string) =>
    api.get<AdminContributionItem[]>(
      `/api/contributions${status ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),

  approveContribution: (id: string) =>
    api.post<{ ok: boolean }>(`/api/contributions/${id}/approve`, {}),

  rejectContribution: (id: string, note?: string) =>
    api.post<{ ok: boolean }>(`/api/contributions/${id}/reject`, { note }),
};

export interface ContributionSummary {
  id: string;
  artistName: string;
  albumCount: number;
  status: 'pending' | 'approved' | 'rejected';
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AdminContributionItem extends ContributionSummary {
  artistMbId: string;
  user: { id: string; name: string | null; email: string };
  reviewer: { id: string; name: string | null } | null;
}

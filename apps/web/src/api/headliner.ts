import { api } from '../lib/api';

export type ConcertMode = 'quick' | 'daily' | 'campaign' | 'historical';
export type FactionId = 'casual' | 'hardcore' | 'deepCut' | 'progHeads' | 'firstTimers';
export type LiveFrequencyTier =
  | 'Essential' | 'Frequent' | 'Occasional' | 'Rare' | 'Legendary' | 'Mythic' | 'Unclassified';

export interface BandEligibility {
  bandId: string;
  bandName: string;
  eligible: boolean;
  scoredSongCount: number;
  reason?: string;
}

export interface Venue {
  id: string;
  name: string;
  description: string;
  capacity: number;
}

export interface CandidateSong {
  id: string;
  title: string;
  albumTitle: string | null;
  durationSeconds: number;
  liveTier: LiveFrequencyTier;
  liveSource: 'live' | 'estimated';
  audienceIsFallback: boolean;
}

export interface FactionReaction {
  score: number;
  explanation: string;
}

export interface PickResult {
  song: CandidateSong;
  factionReactions: Record<FactionId, FactionReaction>;
  crowdEnergyDelta: number;
  pacingPenalty: number;
  rarityMoment: boolean;
}

export interface ConcertReport {
  metrics: Record<string, number>;
  overallScore: number;
  highlights: string[];
  reviewText: string;
  usedFallbackData: boolean;
  fallbackSongCount: number;
}

export interface StartRunResponse {
  runId: string;
  state: unknown;
  candidates: CandidateSong[];
}

export interface PickResponse {
  result: PickResult;
  candidates?: CandidateSong[];
  encoreCandidates?: CandidateSong[];
  encoreEligible?: boolean;
  report?: ConcertReport;
  finished: boolean;
}

export interface CampaignEligibilitySummary {
  bandId: string;
  recoveredCount: number;
  eligible: boolean;
}

export const headlinerApi = {
  getBands: () => api.get<{ bands: BandEligibility[] }>('/api/headliner/bands'),
  getVenues: () => api.get<{ venues: Venue[] }>('/api/headliner/venues'),
  getCampaignEligibility: (bandId: string) =>
    api.get<CampaignEligibilitySummary>(`/api/headliner/campaign/${bandId}`),
  startRun: (bandId: string, venueId: string | null, mode: ConcertMode = 'quick') =>
    api.post<StartRunResponse>('/api/headliner/runs', { bandId, venueId, mode }),
  pick: (runId: string, songId: string) =>
    api.post<PickResponse>(`/api/headliner/runs/${runId}/pick`, { songId }),
};

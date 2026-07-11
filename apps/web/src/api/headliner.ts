import { api } from '../lib/api';

export type ConcertMode = 'quick' | 'daily' | 'campaign' | 'historical';
export type FactionId = 'casual' | 'hardcore' | 'deepCut' | 'progHeads' | 'firstTimers';
export type LiveFrequencyTier =
  | 'Essential' | 'Frequent' | 'Occasional' | 'Rare' | 'Legendary' | 'Mythic' | 'Unclassified';
export type StageKey =
  | 'rehearsal_room' | 'local_bar' | 'small_theatre' | 'festival_side_stage' | 'major_theatre';

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

export interface ObjectiveResult {
  key: string;
  label: string;
  met: boolean;
  wasRequired: boolean;
}

export interface CampaignFinishResult {
  stageKey: StageKey;
  stageName: string;
  score: number;
  stars: number;
  objectiveResults: ObjectiveResult[];
  previousBest: number | null;
  isNewBest: boolean;
  firstClear: boolean;
  nextStageUnlocked: StageKey | null;
  totalShowsCompleted: number;
  totalAudienceReached: number;
  starsEarned: number;
  recoverySuggestion: string | null;
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
  campaignResult?: CampaignFinishResult | null;
  finished: boolean;
}

export interface CampaignEligibilitySummary {
  bandId: string;
  recoveredCount: number;
  totalDurationSeconds: number;
  uniqueAlbumCount: number;
  eligible: boolean;
}

export interface StageReadiness {
  eligible: boolean;
  missingSongs: number;
  missingDurationSeconds: number;
  message: string | null;
}

export interface StageCard {
  key: StageKey;
  order: number;
  name: string;
  description: string;
  contextLabel: string;
  capacity: number;
  showLengthMinutes: number;
  requiredRecoveredSongs: number;
  requiredMinDurationSeconds: number;
  objectives: { key: string; label: string }[];
  starThresholds: { oneStar: number; twoStar: number; threeStar: number };
  status: 'locked' | 'available' | 'cleared';
  bestScore: number | null;
  bestStars: number;
  readiness: StageReadiness;
  tutorial: boolean;
}

export interface RecoveredBandSummary {
  bandId: string;
  bandName: string;
  recoveredCount: number;
}

export interface CampaignLadder {
  bandId: string;
  bandName: string;
  bandSlug: string;
  currentStage: StageKey;
  unlockedStage: StageKey;
  totalShowsCompleted: number;
  bestScore: number | null;
  totalAudienceReached: number;
  starsEarned: number;
  tutorialCompleted: boolean;
  recoveredCount: number;
  stages: StageCard[];
}

export const headlinerApi = {
  getBands: () => api.get<{ bands: BandEligibility[] }>('/api/headliner/bands'),
  getVenues: () => api.get<{ venues: Venue[] }>('/api/headliner/venues'),
  getCampaignEligibility: (bandId: string) =>
    api.get<CampaignEligibilitySummary>(`/api/headliner/campaign/${bandId}/summary`),
  getCampaignLadder: (bandId: string) =>
    api.get<CampaignLadder>(`/api/headliner/campaign/${bandId}/ladder`),
  getCampaignBands: () => api.get<{ bands: RecoveredBandSummary[] }>('/api/headliner/campaign/bands'),
  markTutorialCompleted: (bandId: string) =>
    api.post<{ ok: boolean }>(`/api/headliner/campaign/${bandId}/tutorial-complete`, {}),
  startRun: (bandId: string, venueId: string | null, mode: ConcertMode = 'quick', stageKey?: StageKey) =>
    api.post<StartRunResponse>('/api/headliner/runs', { bandId, venueId, mode, stageKey }),
  pick: (runId: string, songId: string) =>
    api.post<PickResponse>(`/api/headliner/runs/${runId}/pick`, { songId }),
};

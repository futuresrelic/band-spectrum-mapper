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

export type ReactionLogCategory =
  | 'strongOpener' | 'weakOpener' | 'successfulContrast' | 'repetitiveStretch'
  | 'energySurge' | 'emotionalPeak' | 'complexityOverload' | 'accessibilityBoost'
  | 'deepCutSurprise' | 'casualFanLoss' | 'hardcoreExcitement' | 'crowdRecovery'
  | 'spectrumCorrection' | 'spectrumDrift' | 'successfulEncoreSetup' | 'encoreDemand'
  | 'poorTransition' | 'excellentTransition';

export interface ReactionLogEntry {
  category: ReactionLogCategory;
  text: string;
}

export type MomentumDirection = 'rising' | 'falling' | 'steady';
export type PulseIntensity = 'low' | 'medium' | 'high';
export type ShowPhaseLabel = 'opening' | 'middle' | 'closing' | 'encore';

export interface FactionPulseSummary {
  id: FactionId;
  direction: 'up' | 'down' | 'flat';
  intensity: PulseIntensity;
  atWalkoutRisk: boolean;
  relevanceRank: number;
  crowdShare: number;
}

export interface ConcertPulseState {
  hasPlayedASong: boolean;
  momentumDirection: MomentumDirection;
  momentumIntensity: PulseIntensity;
  isNewShowHigh: boolean;
  isNewShowLow: boolean;
  isRecovery: boolean;
  isSplitRoom: boolean;
  walkoutRisk: boolean;
  phase: ShowPhaseLabel | null;
  topLine: string | null;
  factions: FactionPulseSummary[];
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
  resultText: string;
  unlockText: string | null;
}

export interface StartRunResponse {
  runId: string;
  state: unknown;
  candidates: CandidateSong[];
  isPractice: boolean;
}

export interface DailyFinishResult {
  isOfficial: boolean;
  score: number;
  finalAttendance: number;
  satisfaction: number;
  officialScore: number | null;
  rank: number | null;
  participantCount: number;
  shareText: string;
}

export interface PickResponse {
  result: PickResult;
  candidates?: CandidateSong[];
  encoreCandidates?: CandidateSong[];
  encoreEligible?: boolean;
  report?: ConcertReport;
  campaignResult?: CampaignFinishResult | null;
  dailyResult?: DailyFinishResult | null;
  reactionLog?: ReactionLogEntry[];
  pulse?: ConcertPulseState;
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

export interface CampaignStarText {
  one: string;
  two: string;
  three: string;
}

export interface CampaignStageCopy {
  stageKey: StageKey;
  titleTagline: string;
  intro: string;
  venueFantasy: string;
  audienceFeeling: string;
  whyItMatters: string;
  playerLearns: string;
  victoryText: string;
  starText: CampaignStarText;
  unlockText: string;
  failureText: string | null;
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
  unlockRequiresStars: number;
  copy: CampaignStageCopy;
  lockedExplanation: string | null;
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

export interface DailyTodayInfo {
  challengeDate: string;
  bandId: string;
  bandName: string;
  venueId: string | null;
  contextKey: string;
  contextLabel: string;
  contextDescription: string;
  difficulty: string;
  participantCount: number;
  myResult: {
    score: number; finalAttendance: number; authenticity: number;
    spectrumMatch: number; encoreQuality: number; rank: number | null;
  } | null;
}

export interface DailyLeaderboardEntry {
  rank: number;
  playerName: string;
  avatarUrl: string | null;
  score: number;
  finalAttendance: number;
  satisfaction: number;
  authenticity: number;
  spectrumMatch: number;
  encoreQuality: number;
  completedAt: string;
}

export interface DailyLeaderboard {
  challengeDate: string;
  bandName: string | null;
  venueId: string | null;
  contextKey: string | null;
  entries: DailyLeaderboardEntry[];
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
  getDailyToday: () => api.get<DailyTodayInfo>('/api/headliner/daily/today'),
  getDailyLeaderboard: (date?: string) =>
    api.get<DailyLeaderboard>(`/api/headliner/daily/leaderboard${date ? `?date=${date}` : ''}`),
  startRun: (bandId: string | null, venueId: string | null, mode: ConcertMode = 'quick', stageKey?: StageKey) =>
    api.post<StartRunResponse>('/api/headliner/runs', { bandId: bandId ?? undefined, venueId, mode, stageKey }),
  pick: (runId: string, songId: string) =>
    api.post<PickResponse>(`/api/headliner/runs/${runId}/pick`, { songId }),
};

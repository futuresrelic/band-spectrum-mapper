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

// ── Live intelligence types (Phase V) ────────────────────────────────────────

export interface SongLiveData {
  liveStatus: string;       // Never Played | Extremely Rare | Rare | Occasional | Common | Staple | Unknown
  liveValue: number;        // 0-100 excitement score
  rarityIndex: number;      // 0-100 rarity index
  totalPerformances: number;
  performancePct: number;
  yearsSincePlayed: number | null;
  lastPerformanceDate: string | null;
  firstPerformanceDate: string | null;
}

export type SongRarityValue = 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Mythic';

export interface RaritySuggestion {
  songId: string;
  songTitle: string;
  albumTitle: string | null;
  currentRarity: SongRarityValue;
  suggestedRarity: SongRarityValue | null;
  hasProfile: boolean;
  performancePct: number;
  totalPerformances: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
  changed: boolean;
}

export interface RaritySuggestionsResponse {
  totalSongs: number;
  matchedSongs: number;
  unmatchedSongs: number;
  songs: RaritySuggestion[];
}

export interface RarityThresholds {
  common: number;
  uncommon: number;
  rare: number;
  legendary: number;
}

export interface BandLiveDataStatus {
  bandId: string;
  fetchStatus: string;      // never | in_progress | complete | failed
  totalShows: number;
  fetchedShows: number;
  lastFetchedAt: string | null;
  setlistFmMbid: string | null;
  setlistFmName: string | null;
  errorMessage: string | null;
  profileCount: number;
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
  liveData: SongLiveData | null;
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
  realismScore: number | null;
  realismLabel: string | null;
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
  visibility: string;
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
  realismScore: number | null;
  realismLabel: string | null;
  historicalHighlights: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BandRpgFestivalDetail extends BandRpgFestivalSummary {
  concerts: BandRpgFestivalConcertEntry[];
}

// ── Tour types (Phase W) ──────────────────────────────────────────────────────

export interface TourAchievement {
  key:         string;
  name:        string;
  icon:        string;
  description: string;
  unlocked:    boolean;
}

export interface TourStop {
  id:           string;
  position:     number;
  cityName:     string | null;
  countryName:  string | null;
  concertId:    string;
  concertName:  string;
  bandId:       string;
  bandName:     string;
  songCount:    number;
  concertPower: number;
  fanService:   number;
  deepCut:      number;
  venueName:    string | null;
  realismScore: number | null;
  realismLabel: string | null;
}

export interface BandRpgTourSummary {
  id:              string;
  name:            string;
  description:     string | null;
  visibility:      string;
  stopCount:       number;
  bands:           string[];
  firstCity:       string | null;
  lastCity:        string | null;
  momentum:        number;
  variety:         number;
  historicalScore: number | null;
  historicalLabel: string | null;
  personality:     string;
  personalityIcon: string;
  achievements:    TourAchievement[];
  stops:           TourStop[];
  createdAt:       string;
  updatedAt:       string;
}

export interface BandRpgTourDetail extends BandRpgTourSummary {
  story: string;
}

// ── Challenge types (Phase X) ─────────────────────────────────────────────────

export interface ChallengeAttemptSummary {
  tier:        string | null;
  metricScore: number;
  achieved:    boolean;
  entityName:  string;
  completedAt: string;
}

export interface BandRpgChallenge {
  id:             string;
  name:           string;
  description:    string;
  type:           string;
  difficulty:     string;
  rivalName:      string | null;
  rivalDesc:      string | null;
  targetAudience: string | null;
  rewardTitle:    string | null;
  rewardBadge:    string | null;
  minChemistry:   number | null;
  minVariety:     number | null;
  minMomentum:    number | null;
  minPrestige:    number | null;
  minDiversity:   number | null;
  minDeepCut:     number | null;
  minFanService:  number | null;
  minRareSongs:   number | null;
  minAlbums:      number | null;
  minStopCount:   number | null;
  isGenerated:    boolean;
  totalAttempts:  number;
  bestAttempt:    ChallengeAttemptSummary | null;
}

export interface BandRpgChallengeHistoryEntry {
  id:            string;
  challengeId:   string;
  challengeName: string;
  difficulty:    string;
  rewardBadge:   string | null;
  entityType:    string;
  entityName:    string;
  achieved:      boolean;
  metricScore:   number;
  tier:          string | null;
  completedAt:   string;
}

export interface BandRpgChallengeStats {
  totalAttempts:       number;
  achievedAttempts:    number;
  bestTier:            string | null;
  titlesUnlocked:      string[];
  challengesCompleted: number;
  rareSongsCount:      number;
  albumsCompleted:     number;
}

export interface ChallengeAttemptResult {
  achieved:    boolean;
  tier:        string | null;
  metricScore: number;
  margin:      number;
  message:     string;
}

// ── Curator Progression types (Phase X.5) ────────────────────────────────────

export interface CuratorStatsSummary {
  songsRecovered:        number;
  albumsCompleted:       number;
  setlistsCreated:       number;
  concertsCreated:       number;
  festivalsCreated:      number;
  dreamFestivalsCreated: number;
  toursCreated:          number;
  challengesCompleted:   number;
  rareSongsFound:        number;
  legendarySongsFound:   number;
  mythicSongsFound:      number;
  correctGuessCount:     number;
  totalGuesses:          number;
  correctGuessPct:       number;
}

export interface CuratorBadge {
  key:         string;
  icon:        string;
  name:        string;
  description: string;
  unlocked:    boolean;
  progress:    { current: number; target: number } | null;
}

export interface CuratorActivityItem {
  type:  string;
  icon:  string;
  label: string;
  date:  string;
}

export interface BandRpgCuratorProfile {
  level:               number;
  xp:                  number;
  xpIntoLevel:         number;
  xpForNextLevel:      number;
  xpProgressPct:       number;
  levelTitle:          string;
  currentTitle:        string | null;
  titlesUnlocked:      string[];
  allTitles:           string[];
  badgesUnlocked:      string[];
  firstRecoveryDate:   string | null;
  lastActiveDate:      string | null;
  selectedCharacterId:   string | null;
  selectedCharacterName: string | null;
  visibility:          string;
  stats:          CuratorStatsSummary;
  badges:         CuratorBadge[];
  recentActivity: CuratorActivityItem[];
}

// ── Phase Y.1 — Public page types ────────────────────────────────────────────

export interface PublicCuratorProfile {
  userId:               string;
  level:                number;
  xpProgressPct:        number;
  levelTitle:           string;
  currentTitle:         string | null;
  selectedCharacterName: string | null;
  stats:                CuratorStatsSummary;
  badges:               CuratorBadge[];
  badgeCount:           number;
  recentActivity:       CuratorActivityItem[];
  firstRecoveryDate:    string | null;
  visibility:           string;
  favoriteCount?:      number;
  followerCount?:      number;
  distinctions?:       string[];
  mostPopularFestival?: { id: string; name: string } | null;
  mostPopularTour?:    { id: string; name: string } | null;
}

export interface PublicFestivalStop {
  position:    number;
  cityName:    string | null;
  countryName: string | null;
  concertName: string;
  bandName:    string;
  songCount:   number;
}

export interface PublicFestival {
  id:           string;
  name:         string;
  description:  string | null;
  isDream:      boolean;
  visibility:   string;
  concertCount: number;
  bandCount:    number;
  totalSongs:   number;
  rareSongs:    number;
  avgFanService: number;
  avgDeepCut:   number;
  personality:  string;
  story:        string;
  bands:        string[];
  createdAt:    string;
  favoriteCount?: number;
  savedCount?:    number;
  distinctions?:  string[];
}

export interface PublicTourStop {
  position:    number;
  cityName:    string | null;
  countryName: string | null;
  concertName: string;
  bandName:    string;
  songCount:   number;
}

export interface PublicTour {
  id:              string;
  name:            string;
  description:     string | null;
  visibility:      string;
  stopCount:       number;
  bands:           string[];
  firstCity:       string | null;
  lastCity:        string | null;
  momentum:        number;
  variety:         number;
  historicalScore: number | null;
  historicalLabel: string | null;
  personality:     string;
  personalityIcon: string;
  story:           string;
  achievements:    Array<{ key: string; name: string; icon: string; description: string; unlocked: boolean }>;
  stops:           PublicTourStop[];
  createdAt:       string;
  favoriteCount?: number;
  savedCount?:    number;
  distinctions?:  string[];
}

// ── Phase Y.2 — Community Discovery types ────────────────────────────────────

export interface CommunityCuratorCard {
  userId:      string;
  displayName: string;
  title:       string;
  level:       number;
  xp:          number;
  badgeCount:  number;
  label:       string;
}

export interface CommunityFestivalCard {
  id:           string;
  name:         string;
  isDream:      boolean;
  concertCount: number;
  label:        string;
  createdAt:    string;
}

export interface CommunityTourCard {
  id:        string;
  name:      string;
  stopCount: number;
  label:     string;
  createdAt: string;
}

export interface CommunityHub {
  stats: {
    publicCurators:          number;
    publicFestivals:         number;
    publicTours:             number;
    totalSongsRecovered:     number;
    totalChallengesCompleted: number;
  };
  featured: {
    curator:   CommunityCuratorCard | null;
    festival:  CommunityFestivalCard | null;
    tour:      CommunityTourCard | null;
    discovery: { type: string; id: string; name: string; url: string } | null;
  };
  spotlights: {
    curatorOfWeek:  CommunityCuratorCard | null;
    festivalOfWeek: CommunityFestivalCard | null;
    tourOfWeek:     CommunityTourCard | null;
  };
}

export interface LeaderboardEntry {
  rank:        number;
  userId:      string;
  displayName: string;
  title:       string;
  level:       number;
  score:       number;
  scoreLabel:  string;
  label:       string;
}

export interface LeaderboardResponse {
  type:    string;
  period:  string;
  entries: LeaderboardEntry[];
}

export interface DiscoverCuratorItem {
  userId:      string;
  displayName: string;
  title:       string;
  level:       number;
  xp:          number;
  badgeCount:  number;
  label:       string;
  since:       string | null;
  url:         string;
}

export interface DiscoverFestivalItem {
  id:           string;
  name:         string;
  isDream:      boolean;
  concertCount: number;
  label:        string;
  createdAt:    string;
  url:          string;
}

export interface DiscoverTourItem {
  id:        string;
  name:      string;
  stopCount: number;
  label:     string;
  createdAt: string;
  url:       string;
}

export interface DiscoverResponse {
  type:  string;
  total: number;
  page:  number;
  limit: number;
  items: (DiscoverCuratorItem | DiscoverFestivalItem | DiscoverTourItem)[];
}

export interface SurpriseResponse {
  type: string | null;
  id:   string | null;
  name: string | null;
  url:  string | null;
}

// ── Phase Y.3 — Community Appreciation types ──────────────────────────────────

export interface AppreciationStatus {
  favorited: boolean;
  saved:     boolean;
  following?: boolean;
}

export interface MySavedItem {
  savedId:     string;
  entityType:  string;
  entityId:    string;
  savedAt:     string;
  name:        string;
  visibility:  string;
  isDream?:    boolean;
  concertCount?: number;
  stopCount?:  number;
  title?:      string;
}

export interface FollowingEntry {
  followeeId:  string;
  followedAt:  string;
  displayName: string;
  title:       string;
  visibility:  string;
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

  // Phase V — Live Intelligence
  getLiveProfiles: (bandId: string) =>
    api.get<{ profiles: Array<{ songId: string } & SongLiveData>; cacheStatus: BandLiveDataStatus | null }>(
      `/api/band-rpg/live-profiles?bandId=${encodeURIComponent(bandId)}`,
    ),

  getLiveDataStatus: (bandId: string) =>
    api.get<BandLiveDataStatus | null>(
      `/api/band-rpg/admin/live-data-status?bandId=${encodeURIComponent(bandId)}`,
    ),

  searchSetlistFmArtist: (artistName: string) =>
    api.post<{ results: Array<{ mbid: string; name: string; sortName: string; disambiguation?: string }> }>(
      '/api/band-rpg/admin/search-setlistfm',
      { artistName },
    ),

  storeBandArtistMatch: (bandId: string, mbid: string, name: string) =>
    api.post<{ ok: boolean }>(
      '/api/band-rpg/admin/set-setlistfm-artist',
      { bandId, mbid, name },
    ),

  fetchBandLiveData: (bandId: string) =>
    api.post<{ ok: boolean; songsUpdated: number; totalShows: number; fetchedShows: number; message?: string }>(
      '/api/band-rpg/admin/fetch-live-data',
      { bandId },
    ),

  // Phase W — Tours
  getTours: () =>
    api.get<BandRpgTourSummary[]>('/api/band-rpg/tours'),

  createTour: (data: { name: string; description?: string }) =>
    api.post<{ ok: boolean; id: string }>('/api/band-rpg/tours', data),

  getTourDetail: (id: string) =>
    api.get<BandRpgTourDetail>(`/api/band-rpg/tours/${encodeURIComponent(id)}`),

  updateTour: (id: string, data: { name?: string; description?: string }) =>
    api.put<{ ok: boolean }>(`/api/band-rpg/tours/${encodeURIComponent(id)}`, data),

  deleteTour: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/band-rpg/tours/${encodeURIComponent(id)}`),

  updateTourStops: (
    id: string,
    stops: Array<{ concertId: string; cityName?: string; countryName?: string; venueId?: string }>,
  ) =>
    api.put<{ ok: boolean; stopCount: number }>(
      `/api/band-rpg/tours/${encodeURIComponent(id)}/stops`,
      { stops },
    ),

  // Phase X — Rival Events & Challenges
  getChallenges: () =>
    api.get<BandRpgChallenge[]>('/api/band-rpg/challenges'),

  getChallengeHistory: () =>
    api.get<BandRpgChallengeHistoryEntry[]>('/api/band-rpg/challenges/history'),

  getChallengeStats: () =>
    api.get<BandRpgChallengeStats>('/api/band-rpg/challenges/stats'),

  generateChallenge: () =>
    api.post<{ ok: boolean; id: string }>('/api/band-rpg/challenges/generate', {}),

  attemptChallenge: (
    id: string,
    data: {
      entityType: string;
      entityId:   string;
      entityName: string;
      chemistry?:  number;
      variety?:    number;
      momentum?:   number;
      prestige?:   number;
      diversity?:  number;
      deepCut?:    number;
      fanService?: number;
      stopCount?:  number;
    },
  ) =>
    api.post<ChallengeAttemptResult>(
      `/api/band-rpg/challenges/${encodeURIComponent(id)}/attempt`,
      data,
    ),

  // Phase X.5 — Curator Progression
  getCuratorProfile: () =>
    api.get<BandRpgCuratorProfile>('/api/band-rpg/curator'),

  setCuratorTitle: (title: string) =>
    api.put<{ ok: boolean; currentTitle: string }>('/api/band-rpg/curator/title', { title }),

  setCuratorCharacter: (characterId: string, characterName: string) =>
    api.put<{ ok: boolean }>('/api/band-rpg/curator/character', { characterId, characterName }),

  setCuratorVisibility: (visibility: string) =>
    api.put<{ ok: boolean; visibility: string }>('/api/band-rpg/curator/visibility', { visibility }),

  setFestivalVisibility: (festivalId: string, visibility: string) =>
    api.put<{ ok: boolean; visibility: string }>(
      `/api/band-rpg/festivals/${encodeURIComponent(festivalId)}/visibility`,
      { visibility },
    ),

  setTourVisibility: (tourId: string, visibility: string) =>
    api.put<{ ok: boolean; visibility: string }>(
      `/api/band-rpg/tours/${encodeURIComponent(tourId)}/visibility`,
      { visibility },
    ),

  // Phase Y.1 — Public pages
  getPublicCuratorProfile: (userId: string) =>
    api.get<PublicCuratorProfile>(`/api/band-rpg/public/curator/${encodeURIComponent(userId)}`),

  getPublicFestival: (id: string) =>
    api.get<PublicFestival>(`/api/band-rpg/public/festival/${encodeURIComponent(id)}`),

  getPublicTour: (id: string) =>
    api.get<PublicTour>(`/api/band-rpg/public/tour/${encodeURIComponent(id)}`),

  // Phase Y.2 — Community Discovery
  getCommunityHub: () =>
    api.get<CommunityHub>('/api/band-rpg/community/hub'),

  getCommunityLeaderboard: (type: string, period: string) =>
    api.get<LeaderboardResponse>(
      `/api/band-rpg/community/leaderboard?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}`,
    ),

  communityDiscover: (type: string, page = 1, limit = 12, isDream?: boolean) => {
    const qs = new URLSearchParams({ type, page: String(page), limit: String(limit) });
    if (isDream !== undefined) qs.set('isDream', String(isDream));
    return api.get<DiscoverResponse>(`/api/band-rpg/community/discover?${qs.toString()}`);
  },

  communitySurprise: () =>
    api.get<SurpriseResponse>('/api/band-rpg/community/surprise'),

  // Phase Y.3 — Community Appreciation
  toggleFavorite: (kind: string, entityType: string, entityId: string) =>
    api.post<{ active: boolean; count: number }>('/api/band-rpg/appreciation/toggle', { kind, entityType, entityId }),

  toggleFollow: (followeeId: string) =>
    api.post<{ following: boolean; followerCount: number }>(`/api/band-rpg/appreciation/follow/${encodeURIComponent(followeeId)}`, {}),

  getAppreciationStatus: (entityType: string, entityIds: string[]) => {
    const qs = new URLSearchParams({ entityType });
    entityIds.forEach((id) => qs.append('entityId', id));
    return api.get<Record<string, AppreciationStatus>>(`/api/band-rpg/appreciation/status?${qs.toString()}`);
  },

  getMySaved: (type?: string) => {
    const qs = type ? `?type=${encodeURIComponent(type)}` : '';
    return api.get<MySavedItem[]>(`/api/band-rpg/appreciation/my-saved${qs}`);
  },

  getMyFollowing: () =>
    api.get<FollowingEntry[]>('/api/band-rpg/appreciation/following'),

  getRaritySuggestions: (bandId: string, thresholds?: RarityThresholds) => {
    const qs = new URLSearchParams({ bandId });
    if (thresholds) {
      qs.set('common',    String(thresholds.common));
      qs.set('uncommon',  String(thresholds.uncommon));
      qs.set('rare',      String(thresholds.rare));
      qs.set('legendary', String(thresholds.legendary));
    }
    return api.get<RaritySuggestionsResponse>(`/api/band-rpg/admin/rarity-suggestions?${qs.toString()}`);
  },

  applySongRarities: (entries: Array<{ songId: string; rarity: SongRarityValue }>) =>
    api.post<{ ok: boolean; updated: number }>('/api/band-rpg/admin/apply-song-rarities', { entries }),

  syncCollectionRarity: (bandId?: string) =>
    api.post<{ ok: boolean; collectedUpdated: number; setlistUpdated: number; songsProcessed: number }>(
      '/api/band-rpg/admin/sync-collection-rarity',
      bandId ? { bandId } : {},
    ),
};

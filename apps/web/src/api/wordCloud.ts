import { api } from '../lib/api';

export interface CloudWord {
  text: string;
  weight: number;
  frequency: number;
  themeBoost: number;
  tagBoost: number;
  songs: { id: string; title: string; band: string }[];
}

export interface WordCloudData {
  words: CloudWord[];
  scope: string;
  label: string;
  totalTokens: number;
  uniqueWords: number;
}

export interface CloudScopes {
  bands: { id: string; name: string }[];
  albums: { id: string; title: string; band: { id: string; name: string } }[];
}

export interface BandSong {
  id: string;
  title: string;
  album: { title: string } | null;
}

export interface SimilarSong {
  song: { id: string; title: string; band: string; albumTitle: string | null };
  sharedWords: string[];
  sharedCount: number;
  seedWordCount: number;
  targetWordCount: number;
}

export interface SimilarSongsResult {
  seed: { id: string; title: string; band: string };
  similar: SimilarSong[];
}

export interface WordLookupResult {
  word: string;
  songs: { id: string; title: string; band: string; albumTitle: string | null }[];
}

export interface WordCluster {
  words: string[];
  songs: { id: string; title: string; band: string; albumTitle: string | null }[];
  songCount: number;
  wordCount: number;
  score: number;
}

export interface WordClustersResult {
  clusters: WordCluster[];
  totalSongs: number;
  candidateWords: number;
}

export const wordCloudApi = {
  getData(params: {
    scope: string;
    id?: string;
    limit?: number;
    minFreq?: number;
    maxFreq?: number;
    includeLyrics?: boolean;
    includeThemes?: boolean;
    includeTags?: boolean;
  }): Promise<WordCloudData> {
    const qs = new URLSearchParams({ scope: params.scope });
    if (params.id) qs.set('id', params.id);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.minFreq) qs.set('minFreq', String(params.minFreq));
    if (params.maxFreq) qs.set('maxFreq', String(params.maxFreq));
    if (params.includeLyrics === false) qs.set('includeLyrics', 'false');
    if (params.includeThemes === false) qs.set('includeThemes', 'false');
    if (params.includeTags === false) qs.set('includeTags', 'false');
    return api.get(`/api/word-cloud?${qs}`);
  },

  getScopes(): Promise<CloudScopes> {
    return api.get('/api/word-cloud/scopes');
  },

  getSongsByBand(bandId: string): Promise<BandSong[]> {
    return api.get(`/api/word-cloud/songs?bandId=${encodeURIComponent(bandId)}`);
  },

  getSimilar(params: {
    songId: string;
    limit?: number;
    bandIds?: string[];
    minShared?: number;
  }): Promise<SimilarSongsResult> {
    const qs = new URLSearchParams({ songId: params.songId });
    if (params.limit)              qs.set('limit',     String(params.limit));
    if (params.bandIds?.length)    qs.set('bandIds',   params.bandIds.join(','));
    if (params.minShared !== undefined) qs.set('minShared', String(params.minShared));
    return api.get(`/api/word-cloud/similar?${qs}`);
  },

  lookup(params: { word: string; bandIds?: string[] }): Promise<WordLookupResult> {
    const qs = new URLSearchParams({ word: params.word });
    if (params.bandIds?.length) qs.set('bandIds', params.bandIds.join(','));
    return api.get(`/api/word-cloud/lookup?${qs}`);
  },

  findClusters(params: {
    bandIds?: string[];
    minSongs?: number;
    maxGroupSize?: number;
    topN?: number;
  }): Promise<WordClustersResult> {
    const qs = new URLSearchParams();
    if (params.bandIds?.length) qs.set('bandIds', params.bandIds.join(','));
    if (params.minSongs)     qs.set('minSongs',     String(params.minSongs));
    if (params.maxGroupSize) qs.set('maxGroupSize', String(params.maxGroupSize));
    if (params.topN)         qs.set('topN',         String(params.topN));
    return api.get(`/api/word-cloud/clusters?${qs}`);
  },
};

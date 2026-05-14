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
  albums: { id: string; title: string; band: { name: string } }[];
  songs: {
    id: string; title: string;
    band: { name: string };
    album: { title: string } | null;
  }[];
}

export const wordCloudApi = {
  getData(params: {
    scope: string;
    id?: string;
    limit?: number;
    minFreq?: number;
  }): Promise<WordCloudData> {
    const qs = new URLSearchParams({ scope: params.scope });
    if (params.id) qs.set('id', params.id);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.minFreq) qs.set('minFreq', String(params.minFreq));
    return api.get(`/api/word-cloud?${qs}`);
  },

  getScopes(): Promise<CloudScopes> {
    return api.get('/api/word-cloud/scopes');
  },
};

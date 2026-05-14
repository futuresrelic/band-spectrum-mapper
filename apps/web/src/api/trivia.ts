import { api } from '../lib/api';

export interface TriviaQuestion {
  id: string;
  type: string;
  question: string;
  imageUrl?: string;
  answer: string;
  options: string[];
  explanation?: string;
}

export interface TriviaData {
  questions: TriviaQuestion[];
}

export const triviaApi = {
  getQuestions: (params?: { count?: number; bandIds?: string[] }): Promise<TriviaData> => {
    const qs = new URLSearchParams();
    if (params?.count) qs.set('count', String(params.count));
    if (params?.bandIds?.length) qs.set('bandIds', params.bandIds.join(','));
    return api.get(`/api/trivia/questions${qs.toString() ? `?${qs}` : ''}`);
  },
};

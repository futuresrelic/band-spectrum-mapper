import { api } from '../lib/api';
import type { LyricLabResult, LyricLabScope } from '@band-spectrum-mapper/shared';

export const lyricLabApi = {
  batch(params: {
    scope: LyricLabScope;
    bandId?: string;
    albumId?: string;
    songId?: string;
    maxWords?: number;
  }): Promise<LyricLabResult> {
    const qs = new URLSearchParams({ scope: params.scope });
    if (params.bandId) qs.set('bandId', params.bandId);
    if (params.albumId) qs.set('albumId', params.albumId);
    if (params.songId) qs.set('songId', params.songId);
    if (params.maxWords) qs.set('maxWords', String(params.maxWords));
    return api.get(`/api/lyric-lab/batch?${qs}`);
  },
};

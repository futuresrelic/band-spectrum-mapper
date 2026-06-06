import { api } from '../lib/api';

export interface SongRef { id: string; title: string; band: string; albumTitle: string | null; }
export interface AlbumRef { id: string; title: string; band: string; }

export interface WordOccurrence {
  word: string;
  songCount: number;
  albumCount: number;
  songs: SongRef[];
  albums: AlbumRef[];
}

export interface PhraseOccurrence {
  phrase: string;
  totalCount: number;
  songCount: number;
  albumCount: number;
  songs: SongRef[];
}

export interface RecurringWordsResult {
  words: WordOccurrence[];
  totalSongs: number;
  totalAlbums: number;
}

export interface RecurringPhrasesResult {
  phrases: PhraseOccurrence[];
  totalSongs: number;
}

export interface AlbumDnaResult {
  album: AlbumRef;
  uniqueWords: WordOccurrence[];
  sharedWords: WordOccurrence[];
  artistAlbumCount: number;
}

export interface ArtistDnaResult {
  bands: string[];
  topWords: WordOccurrence[];
  albumConnectors: WordOccurrence[];
  topPhrases: PhraseOccurrence[];
  totalSongs: number;
  totalAlbums: number;
}

export interface BandWordSet {
  bandId: string;
  bandName: string;
  words: WordOccurrence[];
}

export interface UniversalConnectorsResult {
  sharedAll: WordOccurrence[];
  uniquePerBand: BandWordSet[];
  partialShared: WordOccurrence[];
  bandNames: string[];
}

export interface PatternLabScopes {
  bands: { id: string; name: string }[];
  albums: { id: string; title: string; year: number | null; band: { id: string; name: string } }[];
}

export const patternLabApi = {
  getScopes(): Promise<PatternLabScopes> {
    return api.get('/api/pattern-lab/scopes');
  },

  findRecurringWords(params: {
    bandIds?: string[];
    albumIds?: string[];
    minSongs?: number;
    requireAllAlbums?: boolean;
    limit?: number;
  }): Promise<RecurringWordsResult> {
    const qs = new URLSearchParams();
    if (params.bandIds?.length)  qs.set('bandIds',  params.bandIds.join(','));
    if (params.albumIds?.length) qs.set('albumIds', params.albumIds.join(','));
    if (params.minSongs)         qs.set('minSongs', String(params.minSongs));
    if (params.requireAllAlbums) qs.set('requireAllAlbums', 'true');
    if (params.limit)            qs.set('limit',    String(params.limit));
    return api.get(`/api/pattern-lab/recurring?${qs}`);
  },

  findRecurringPhrases(params: {
    bandIds: string[];
    phraseLength?: number;
    minSongCount?: number;
    limit?: number;
  }): Promise<RecurringPhrasesResult> {
    const qs = new URLSearchParams({ bandIds: params.bandIds.join(',') });
    if (params.phraseLength)  qs.set('phraseLength',  String(params.phraseLength));
    if (params.minSongCount)  qs.set('minSongCount',  String(params.minSongCount));
    if (params.limit)         qs.set('limit',         String(params.limit));
    return api.get(`/api/pattern-lab/phrases?${qs}`);
  },

  getAlbumDna(albumId: string): Promise<AlbumDnaResult> {
    return api.get(`/api/pattern-lab/album-dna?albumId=${encodeURIComponent(albumId)}`);
  },

  getArtistDna(bandIds: string[]): Promise<ArtistDnaResult> {
    return api.get(`/api/pattern-lab/artist-dna?bandIds=${bandIds.join(',')}`);
  },

  findConnectors(bandIds: string[]): Promise<UniversalConnectorsResult> {
    return api.get(`/api/pattern-lab/connectors?bandIds=${bandIds.join(',')}`);
  },
};

/**
 * Pattern Lab Service — admin-only deep analysis of recurring words,
 * phrases, album DNA, artist DNA, and cross-artist connectors.
 *
 * All functions are configure-before-execute; nothing runs automatically.
 */

import { prisma } from '../lib/prisma.js';
import { tokenize, getCustomStopwords, BUILTIN_STOPWORDS } from './wordCloudService.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface SongRef {
  id: string;
  title: string;
  band: string;
  albumTitle: string | null;
}

export interface AlbumRef {
  id: string;
  title: string;
  band: string;
}

export interface WordOccurrence {
  word: string;
  songCount: number;
  albumCount: number;
  songs: SongRef[];
  albums: AlbumRef[];
}

export interface PhraseOccurrence {
  phrase: string;
  totalCount: number;  // raw occurrences across all songs
  songCount: number;
  albumCount: number;
  songs: SongRef[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SongWordData {
  meta: SongRef;
  albumId: string | null;
  albumRef: AlbumRef | null;
  wordSet: Set<string>;
  tokenArray: string[]; // ordered, for phrase building
}

async function fetchSongData(opts: {
  bandIds?: string[];
  albumIds?: string[];
}): Promise<SongWordData[]> {
  const customStopwords = await getCustomStopwords();

  const lyrics = await prisma.lyric.findMany({
    where: {
      isPrimary: true,
      song: {
        ...(opts.bandIds?.length  ? { bandId:  { in: opts.bandIds  } } : {}),
        ...(opts.albumIds?.length ? { albumId: { in: opts.albumIds } } : {}),
      },
    },
    select: {
      text: true,
      song: {
        select: {
          id: true, title: true,
          band:  { select: { id: true, name: true } },
          album: { select: { id: true, title: true } },
        },
      },
    },
  });

  // Aggregate multiple lyric rows per song (shouldn't happen with isPrimary, but safe)
  const byId = new Map<string, SongWordData>();
  for (const lyric of lyrics) {
    const s = lyric.song;
    if (!byId.has(s.id)) {
      byId.set(s.id, {
        meta: { id: s.id, title: s.title, band: s.band.name, albumTitle: s.album?.title ?? null },
        albumId:  s.album?.id ?? null,
        albumRef: s.album ? { id: s.album.id, title: s.album.title, band: s.band.name } : null,
        wordSet:  new Set<string>(),
        tokenArray: [],
      });
    }
    const entry = byId.get(s.id)!;
    const tokens = tokenize(lyric.text).filter((w) => !customStopwords.has(w));
    for (const w of tokens) entry.wordSet.add(w);
    // Append token array (ordered, for phrase building)
    entry.tokenArray.push(...tokens);
  }

  return [...byId.values()];
}

function buildInvertedIndex(songs: SongWordData[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const song of songs) {
    for (const word of song.wordSet) {
      const s = idx.get(word) ?? new Set<string>();
      s.add(song.meta.id);
      idx.set(word, s);
    }
  }
  return idx;
}

function buildWordOccurrence(
  word: string,
  songIds: Set<string>,
  songById: Map<string, SongWordData>,
): WordOccurrence {
  const songs: SongRef[] = [];
  const albumMap = new Map<string, AlbumRef>();
  for (const id of songIds) {
    const d = songById.get(id);
    if (!d) continue;
    songs.push(d.meta);
    if (d.albumId && d.albumRef && !albumMap.has(d.albumId)) {
      albumMap.set(d.albumId, d.albumRef);
    }
  }
  songs.sort((a, b) => a.band.localeCompare(b.band) || a.title.localeCompare(b.title));
  const albums = [...albumMap.values()].sort((a, b) => a.title.localeCompare(b.title));
  return { word, songCount: songs.length, albumCount: albums.length, songs, albums };
}

// ---------------------------------------------------------------------------
// 1. Recurring Words
// ---------------------------------------------------------------------------

export interface RecurringWordsResult {
  words: WordOccurrence[];
  totalSongs: number;
  totalAlbums: number;
}

export async function findRecurringWords(opts: {
  bandIds?: string[];
  albumIds?: string[];
  minSongs?: number;
  requireAllAlbums?: boolean; // word must appear in EVERY album of selected bands
  limit?: number;
}): Promise<RecurringWordsResult> {
  const { minSongs = 2, requireAllAlbums = false, limit = 150 } = opts;

  const songs = await fetchSongData(opts);
  if (songs.length === 0) return { words: [], totalSongs: 0, totalAlbums: 0 };

  const songById = new Map(songs.map((s) => [s.meta.id, s]));
  const totalAlbumIds = new Set(songs.map((s) => s.albumId).filter(Boolean) as string[]);

  // requireAllAlbums: we need the full album list for the selected bands
  let requiredAlbumIds: Set<string> | null = null;
  if (requireAllAlbums && opts.bandIds?.length) {
    const albums = await prisma.album.findMany({
      where: { bandId: { in: opts.bandIds } },
      select: { id: true },
    });
    requiredAlbumIds = new Set(albums.map((a) => a.id));
  }

  const idx = buildInvertedIndex(songs);
  const results: WordOccurrence[] = [];

  for (const [word, songIds] of idx) {
    if (songIds.size < minSongs) continue;

    if (requiredAlbumIds) {
      // Check the word appears in at least one song from every required album
      const coveredAlbums = new Set<string>();
      for (const sid of songIds) {
        const albumId = songById.get(sid)?.albumId;
        if (albumId) coveredAlbums.add(albumId);
      }
      if (![...requiredAlbumIds].every((aid) => coveredAlbums.has(aid))) continue;
    }

    results.push(buildWordOccurrence(word, songIds, songById));
  }

  results.sort((a, b) => b.songCount - a.songCount || b.albumCount - a.albumCount);

  return {
    words: results.slice(0, limit),
    totalSongs: songs.length,
    totalAlbums: totalAlbumIds.size,
  };
}

// ---------------------------------------------------------------------------
// 2. Phrase Discovery
// ---------------------------------------------------------------------------

export interface RecurringPhrasesResult {
  phrases: PhraseOccurrence[];
  totalSongs: number;
}

export async function findRecurringPhrases(opts: {
  bandIds?: string[];
  phraseLength?: number;
  minSongCount?: number;
  limit?: number;
}): Promise<RecurringPhrasesResult> {
  const { phraseLength = 2, minSongCount = 2, limit = 100 } = opts;
  const clampedLen = Math.min(6, Math.max(2, phraseLength));

  const songs = await fetchSongData(opts);
  if (songs.length === 0) return { phrases: [], totalSongs: 0 };

  const songById = new Map(songs.map((s) => [s.meta.id, s]));

  // Build phrase → { songIds, totalCount }
  const phraseToSongs = new Map<string, Set<string>>();
  const phraseToCount = new Map<string, number>();

  for (const song of songs) {
    const tokens = song.tokenArray;
    if (tokens.length < clampedLen) continue;
    const seenInSong = new Set<string>();
    for (let i = 0; i <= tokens.length - clampedLen; i++) {
      const phrase = tokens.slice(i, i + clampedLen).join(' ');
      phraseToCount.set(phrase, (phraseToCount.get(phrase) ?? 0) + 1);
      if (!seenInSong.has(phrase)) {
        seenInSong.add(phrase);
        const s = phraseToSongs.get(phrase) ?? new Set<string>();
        s.add(song.meta.id);
        phraseToSongs.set(phrase, s);
      }
    }
  }

  const results: PhraseOccurrence[] = [];
  for (const [phrase, songIds] of phraseToSongs) {
    if (songIds.size < minSongCount) continue;
    const phraseSongs: SongRef[] = [];
    const albumSet = new Set<string>();
    for (const sid of songIds) {
      const d = songById.get(sid);
      if (!d) continue;
      phraseSongs.push(d.meta);
      if (d.albumId) albumSet.add(d.albumId);
    }
    phraseSongs.sort((a, b) => a.band.localeCompare(b.band) || a.title.localeCompare(b.title));
    results.push({
      phrase,
      totalCount: phraseToCount.get(phrase) ?? songIds.size,
      songCount: phraseSongs.length,
      albumCount: albumSet.size,
      songs: phraseSongs,
    });
  }

  results.sort((a, b) => b.songCount - a.songCount || b.totalCount - a.totalCount);

  return { phrases: results.slice(0, limit), totalSongs: songs.length };
}

// ---------------------------------------------------------------------------
// 3. Album DNA
// ---------------------------------------------------------------------------

export interface AlbumDnaResult {
  album: AlbumRef;
  uniqueWords: WordOccurrence[];    // appear ONLY in this album (not any other of same band)
  sharedWords: WordOccurrence[];    // appear in this album AND at least one other album of same band
  artistAlbumCount: number;
}

export async function getAlbumDna(albumId: string): Promise<AlbumDnaResult> {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: { band: true },
  });
  if (!album) throw new Error('Album not found');

  const albumRef: AlbumRef = { id: album.id, title: album.title, band: album.band.name };

  // All songs for this band
  const allBandSongs = await fetchSongData({ bandIds: [album.bandId] });
  const thisSongs  = allBandSongs.filter((s) => s.albumId === albumId);
  const otherSongs = allBandSongs.filter((s) => s.albumId !== albumId);

  const thisWords  = new Set(thisSongs.flatMap((s)  => [...s.wordSet]));
  const otherWords = new Set(otherSongs.flatMap((s) => [...s.wordSet]));

  const songById = new Map(allBandSongs.map((s) => [s.meta.id, s]));

  // Build inverted index for this album's songs only
  const thisIdx = buildInvertedIndex(thisSongs);

  const uniqueWords:  WordOccurrence[] = [];
  const sharedWords:  WordOccurrence[] = [];

  for (const [word, songIds] of thisIdx) {
    const occ = buildWordOccurrence(word, songIds, songById);
    if (otherWords.has(word)) {
      sharedWords.push(occ);
    } else if (thisWords.has(word)) {
      uniqueWords.push(occ);
    }
  }

  uniqueWords.sort((a, b) => b.songCount - a.songCount);
  sharedWords.sort((a, b) => b.songCount - a.songCount);

  const artistAlbums = await prisma.album.count({ where: { bandId: album.bandId } });

  return {
    album: albumRef,
    uniqueWords: uniqueWords.slice(0, 100),
    sharedWords: sharedWords.slice(0, 100),
    artistAlbumCount: artistAlbums,
  };
}

// ---------------------------------------------------------------------------
// 4. Artist DNA
// ---------------------------------------------------------------------------

export interface ArtistDnaResult {
  bands: string[];
  topWords: WordOccurrence[];
  albumConnectors: WordOccurrence[]; // words present in EVERY album
  topPhrases: PhraseOccurrence[];
  totalSongs: number;
  totalAlbums: number;
}

export async function getArtistDna(bandIds: string[]): Promise<ArtistDnaResult> {
  if (bandIds.length === 0) throw new Error('At least one band required');

  const songs = await fetchSongData({ bandIds });
  if (songs.length === 0) {
    const bands = await prisma.band.findMany({ where: { id: { in: bandIds } }, select: { name: true } });
    return { bands: bands.map((b) => b.name), topWords: [], albumConnectors: [], topPhrases: [], totalSongs: 0, totalAlbums: 0 };
  }

  const bandNames = await prisma.band.findMany({
    where: { id: { in: bandIds } },
    select: { name: true },
    orderBy: { name: 'asc' },
  });

  const songById = new Map(songs.map((s) => [s.meta.id, s]));
  const allAlbumIds = new Set(songs.map((s) => s.albumId).filter(Boolean) as string[]);

  const idx = buildInvertedIndex(songs);

  // Top words (appear in ≥2 songs)
  const topWords: WordOccurrence[] = [];
  for (const [word, songIds] of idx) {
    if (songIds.size < 2) continue;
    topWords.push(buildWordOccurrence(word, songIds, songById));
  }
  topWords.sort((a, b) => b.songCount - a.songCount || b.albumCount - a.albumCount);

  // Album connectors: words present in every album
  const albumConnectors: WordOccurrence[] = [];
  if (allAlbumIds.size >= 2) {
    for (const [word, songIds] of idx) {
      const coveredAlbums = new Set<string>();
      for (const sid of songIds) {
        const albumId = songById.get(sid)?.albumId;
        if (albumId) coveredAlbums.add(albumId);
      }
      if ([...allAlbumIds].every((aid) => coveredAlbums.has(aid))) {
        albumConnectors.push(buildWordOccurrence(word, songIds, songById));
      }
    }
    albumConnectors.sort((a, b) => b.songCount - a.songCount);
  }

  // Top phrases (bigrams)
  const phraseResult = await findRecurringPhrases({ bandIds, phraseLength: 2, minSongCount: 2, limit: 30 });

  return {
    bands: bandNames.map((b) => b.name),
    topWords: topWords.slice(0, 100),
    albumConnectors: albumConnectors.slice(0, 50),
    topPhrases: phraseResult.phrases,
    totalSongs: songs.length,
    totalAlbums: allAlbumIds.size,
  };
}

// ---------------------------------------------------------------------------
// 5. Universal Connectors
// ---------------------------------------------------------------------------

export interface BandWordSet {
  bandId: string;
  bandName: string;
  words: WordOccurrence[];
}

export interface UniversalConnectorsResult {
  sharedAll: WordOccurrence[];       // words in every selected band
  uniquePerBand: BandWordSet[];       // words exclusive to one band
  partialShared: WordOccurrence[];    // words in some (not all) bands, sorted by coverage
  bandNames: string[];
}

export async function findUniversalConnectors(bandIds: string[]): Promise<UniversalConnectorsResult> {
  if (bandIds.length < 2) throw new Error('At least two bands required');

  const bands = await prisma.band.findMany({
    where: { id: { in: bandIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const bandNameMap = new Map(bands.map((b) => [b.id, b.name]));

  // Per-band word sets and per-band inverted index
  const perBandSongs = new Map<string, SongWordData[]>();
  for (const bandId of bandIds) {
    perBandSongs.set(bandId, await fetchSongData({ bandIds: [bandId] }));
  }

  // Global inverted index: word → Set<bandId> (which bands contain this word)
  const wordToBands = new Map<string, Set<string>>();
  // Also track song-level for occurrence building
  const allSongs = [...perBandSongs.values()].flat();
  const songById = new Map(allSongs.map((s) => [s.meta.id, s]));

  const perBandIdx = new Map<string, Map<string, Set<string>>>();
  for (const [bandId, songs] of perBandSongs) {
    const idx = buildInvertedIndex(songs);
    perBandIdx.set(bandId, idx);
    for (const word of idx.keys()) {
      const bs = wordToBands.get(word) ?? new Set<string>();
      bs.add(bandId);
      wordToBands.set(word, bs);
    }
  }

  const sharedAll:     WordOccurrence[] = [];
  const partialShared: WordOccurrence[] = [];
  const uniqueMap = new Map<string, WordOccurrence[]>(); // bandId → unique words

  for (const [word, bandSet] of wordToBands) {
    // Build combined song list from all bands that have this word
    const allSongIds = new Set<string>();
    for (const bid of bandSet) {
      const bidSongIds = perBandIdx.get(bid)?.get(word);
      if (bidSongIds) for (const sid of bidSongIds) allSongIds.add(sid);
    }
    const occ = buildWordOccurrence(word, allSongIds, songById);

    if (bandSet.size === bandIds.length) {
      sharedAll.push(occ);
    } else if (bandSet.size === 1) {
      const [bid] = [...bandSet];
      if (bid) {
        const arr = uniqueMap.get(bid) ?? [];
        arr.push(occ);
        uniqueMap.set(bid, arr);
      }
    } else {
      partialShared.push(occ);
    }
  }

  sharedAll.sort((a, b) => b.songCount - a.songCount);
  partialShared.sort((a, b) => b.songCount - a.songCount);

  const uniquePerBand: BandWordSet[] = bandIds.map((bid) => {
    const words = (uniqueMap.get(bid) ?? [])
      .sort((a, b) => b.songCount - a.songCount)
      .slice(0, 60);
    return { bandId: bid, bandName: bandNameMap.get(bid) ?? bid, words };
  });

  return {
    sharedAll: sharedAll.slice(0, 100),
    uniquePerBand,
    partialShared: partialShared.slice(0, 100),
    bandNames: bands.map((b) => b.name),
  };
}

// ---------------------------------------------------------------------------
// 6. Phrase Search (exact, with context)
// ---------------------------------------------------------------------------

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')          // strip [bracketed annotations]
    .replace(/[^a-z0-9'\s]/g, ' ')        // keep only letters, digits, apostrophes, spaces
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PhraseContext {
  songId: string;
  songTitle: string;
  band: string;
  albumTitle: string | null;
  context: string;      // surrounding snippet, phrase marked with **phrase**
  occurrences: number;  // times the phrase appears in this song
}

export interface PhraseSearchResult {
  phrase: string;
  normalizedPhrase: string;
  totalOccurrences: number;
  songCount: number;
  albumCount: number;
  matches: PhraseContext[];
}

export interface PhraseBridge {
  phrase: string;
  totalCount: number;
  songCount: number;
  albumCount: number;
  bridgeStrength: number;
  songs: SongRef[];
  topContext: string | null;
}

export interface PhraseBridgesResult {
  bridges: PhraseBridge[];
  totalSongs: number;
  phraseLength: number;
}

export interface PhraseDnaResult {
  phrase: string;
  totalOccurrences: number;
  songCount: number;
  albumCount: number;
  bridgeStrength: number;
  matches: PhraseContext[];
  nearbyWords: string[];   // top 15 content words within 5 positions of the phrase
  bandNames: string[];
}

/** Fetch raw lyric text for phrase search (not tokenized). */
async function fetchRawLyrics(opts: { bandIds?: string[]; albumIds?: string[] }) {
  return prisma.lyric.findMany({
    where: {
      isPrimary: true,
      song: {
        ...(opts.bandIds?.length  ? { bandId:  { in: opts.bandIds  } } : {}),
        ...(opts.albumIds?.length ? { albumId: { in: opts.albumIds } } : {}),
      },
    },
    select: {
      text: true,
      song: {
        select: {
          id: true, title: true,
          band:  { select: { name: true } },
          album: { select: { id: true, title: true } },
        },
      },
    },
  });
}

/**
 * Extract context snippet for a phrase found at word-index `phraseStart`
 * in `words` array. The phrase has `phraseLen` words.
 * Returns a string with 6 words before + **phrase** + 6 words after.
 */
function extractContext(words: string[], phraseStart: number, phraseLen: number): string {
  const before = words.slice(Math.max(0, phraseStart - 6), phraseStart);
  const phraseWords = words.slice(phraseStart, phraseStart + phraseLen);
  const after = words.slice(phraseStart + phraseLen, phraseStart + phraseLen + 6);
  const parts: string[] = [];
  if (phraseStart > 6) parts.push('…');
  parts.push(...before);
  parts.push(`**${phraseWords.join(' ')}**`);
  parts.push(...after);
  return parts.join(' ');
}

export async function phraseSearch(opts: {
  q: string;
  bandIds?: string[];
  albumIds?: string[];
  limit?: number;
}): Promise<PhraseSearchResult> {
  const { limit = 50 } = opts;
  const normalizedPhrase = normalizeForSearch(opts.q);
  const phraseWords = normalizedPhrase.split(' ').filter((w) => w.length > 0);

  if (phraseWords.length < 2) {
    throw new Error('Phrase must contain at least 2 words');
  }

  const phraseLen = phraseWords.length;
  const lyrics = await fetchRawLyrics(opts);

  // songId → { meta, contexts }
  const songMap = new Map<string, { meta: PhraseContext; albumId: string | null }>();

  let totalOccurrences = 0;
  const albumIds = new Set<string>();

  for (const lyric of lyrics) {
    const s = lyric.song;
    const normalizedText = normalizeForSearch(lyric.text);
    const words = normalizedText.split(' ').filter((w) => w.length > 0);

    const contexts: string[] = [];

    for (let i = 0; i <= words.length - phraseLen; i++) {
      let match = true;
      for (let j = 0; j < phraseLen; j++) {
        if (words[i + j] !== phraseWords[j]) { match = false; break; }
      }
      if (match) {
        contexts.push(extractContext(words, i, phraseLen));
      }
    }

    if (contexts.length === 0) continue;

    totalOccurrences += contexts.length;

    const existing = songMap.get(s.id);
    if (existing) {
      existing.meta.occurrences += contexts.length;
      // append more contexts to the first context string
      existing.meta.context = contexts[0]!;
    } else {
      if (s.album?.id) albumIds.add(s.album.id);
      songMap.set(s.id, {
        meta: {
          songId: s.id,
          songTitle: s.title,
          band: s.band.name,
          ...(s.album ? { albumTitle: s.album.title } : { albumTitle: null }),
          context: contexts[0]!,
          occurrences: contexts.length,
        },
        albumId: s.album?.id ?? null,
      });
    }
  }

  const matches = [...songMap.values()]
    .map((v) => v.meta)
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, limit);

  return {
    phrase: opts.q,
    normalizedPhrase,
    totalOccurrences,
    songCount: songMap.size,
    albumCount: albumIds.size,
    matches,
  };
}

// ---------------------------------------------------------------------------
// 7. Phrase Bridges (n-gram discovery on raw text)
// ---------------------------------------------------------------------------

function computeBridgeStrength(songCount: number, albumCount: number, totalCount: number): number {
  return Math.round((songCount * 3 + albumCount * 2 + Math.log10(totalCount + 1)) * 10) / 10;
}

export async function phraseBridges(opts: {
  bandIds?: string[];
  phraseLength?: number;
  minSongCount?: number;
  limit?: number;
  excludeStopPhrases?: boolean;
}): Promise<PhraseBridgesResult> {
  const {
    phraseLength = 2,
    minSongCount = 2,
    limit = 100,
    excludeStopPhrases = true,
  } = opts;
  const phraseLen = Math.min(6, Math.max(2, phraseLength));

  const lyrics = await fetchRawLyrics(opts);

  // Build per-song data: normalize text, build n-grams
  interface RawSongData {
    songId: string;
    meta: SongRef;
    albumId: string | null;
    normalizedText: string;
    words: string[];
  }

  const songDataMap = new Map<string, RawSongData>();
  for (const lyric of lyrics) {
    const s = lyric.song;
    const normalizedText = normalizeForSearch(lyric.text);
    const existing = songDataMap.get(s.id);
    if (existing) {
      existing.normalizedText += ' ' + normalizedText;
      existing.words = (existing.normalizedText).split(' ').filter((w) => w.length > 0);
    } else {
      const words = normalizedText.split(' ').filter((w) => w.length > 0);
      songDataMap.set(s.id, {
        songId: s.id,
        meta: { id: s.id, title: s.title, band: s.band.name, albumTitle: s.album?.title ?? null },
        albumId: s.album?.id ?? null,
        normalizedText,
        words,
      });
    }
  }

  const songList = [...songDataMap.values()];

  // Build phrase → { songs, albums, totalCount, firstMatchSongId, firstMatchPos }
  const phraseToSongs   = new Map<string, Set<string>>();
  const phraseToAlbums  = new Map<string, Set<string>>();
  const phraseToCount   = new Map<string, number>();
  const phraseFirstSong = new Map<string, string>();
  const phraseFirstPos  = new Map<string, number>();

  for (const song of songList) {
    const words = song.words;
    const seenInSong = new Set<string>();
    for (let i = 0; i <= words.length - phraseLen; i++) {
      const phrase = words.slice(i, i + phraseLen).join(' ');
      phraseToCount.set(phrase, (phraseToCount.get(phrase) ?? 0) + 1);
      if (!seenInSong.has(phrase)) {
        seenInSong.add(phrase);
        const songSet = phraseToSongs.get(phrase) ?? new Set<string>();
        songSet.add(song.songId);
        phraseToSongs.set(phrase, songSet);
        if (song.albumId) {
          const albumSet = phraseToAlbums.get(phrase) ?? new Set<string>();
          albumSet.add(song.albumId);
          phraseToAlbums.set(phrase, albumSet);
        }
        if (!phraseFirstSong.has(phrase)) {
          phraseFirstSong.set(phrase, song.songId);
          phraseFirstPos.set(phrase, i);
        }
      }
    }
  }

  const bridges: PhraseBridge[] = [];

  for (const [phrase, songSet] of phraseToSongs) {
    if (songSet.size < minSongCount) continue;

    if (excludeStopPhrases) {
      const allStop = phrase.split(' ').every((w) => BUILTIN_STOPWORDS.has(w));
      if (allStop) continue;
    }

    const albumSet  = phraseToAlbums.get(phrase) ?? new Set<string>();
    const totalCount = phraseToCount.get(phrase) ?? songSet.size;
    const albumCount = albumSet.size;
    const songCount  = songSet.size;
    const bridgeStrength = computeBridgeStrength(songCount, albumCount, totalCount);

    // Build song refs
    const songs: SongRef[] = [];
    for (const sid of songSet) {
      const d = songDataMap.get(sid);
      if (d) songs.push(d.meta);
    }
    songs.sort((a, b) => a.band.localeCompare(b.band) || a.title.localeCompare(b.title));

    // Get top context from first matching song
    let topContext: string | null = null;
    const firstSongId = phraseFirstSong.get(phrase);
    const firstPos    = phraseFirstPos.get(phrase);
    if (firstSongId !== undefined && firstPos !== undefined) {
      const firstSong = songDataMap.get(firstSongId);
      if (firstSong) {
        topContext = extractContext(firstSong.words, firstPos, phraseLen);
      }
    }

    bridges.push({ phrase, totalCount, songCount, albumCount, bridgeStrength, songs, topContext });
  }

  bridges.sort((a, b) => b.bridgeStrength - a.bridgeStrength || b.songCount - a.songCount);

  return {
    bridges: bridges.slice(0, limit),
    totalSongs: songList.length,
    phraseLength: phraseLen,
  };
}

// ---------------------------------------------------------------------------
// 8. Phrase DNA
// ---------------------------------------------------------------------------

export async function phraseDna(opts: {
  phrase: string;
  bandIds?: string[];
  albumIds?: string[];
}): Promise<PhraseDnaResult> {
  const normalizedPhrase = normalizeForSearch(opts.phrase);
  const phraseWords = normalizedPhrase.split(' ').filter((w) => w.length > 0);

  if (phraseWords.length < 2) {
    throw new Error('Phrase must contain at least 2 words');
  }

  // Get all matches + contexts via phraseSearch
  const searchResult = await phraseSearch({
    q: opts.phrase,
    ...(opts.bandIds?.length  ? { bandIds:  opts.bandIds  } : {}),
    ...(opts.albumIds?.length ? { albumIds: opts.albumIds } : {}),
    limit: 500,
  });

  // Collect nearby words from contexts
  const nearbyWordCount = new Map<string, number>();
  const phraseLen = phraseWords.length;
  const phraseSet = new Set(phraseWords);

  // Re-fetch lyrics to extract nearby words properly
  const lyrics = await fetchRawLyrics(opts);

  for (const lyric of lyrics) {
    const normalizedText = normalizeForSearch(lyric.text);
    const words = normalizedText.split(' ').filter((w) => w.length > 0);

    for (let i = 0; i <= words.length - phraseLen; i++) {
      let match = true;
      for (let j = 0; j < phraseLen; j++) {
        if (words[i + j] !== phraseWords[j]) { match = false; break; }
      }
      if (!match) continue;

      // Words within 5 positions before/after the phrase
      const start = Math.max(0, i - 5);
      const end   = Math.min(words.length, i + phraseLen + 5);

      for (let k = start; k < end; k++) {
        // Skip positions within the phrase itself
        if (k >= i && k < i + phraseLen) continue;
        const w = words[k];
        if (!w) continue;
        if (BUILTIN_STOPWORDS.has(w)) continue;
        if (phraseSet.has(w)) continue;
        if (w.length < 3) continue;
        nearbyWordCount.set(w, (nearbyWordCount.get(w) ?? 0) + 1);
      }
    }
  }

  // Top 15 nearby words
  const nearbyWords = [...nearbyWordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w);

  // Band names from matches
  const bandNames = [...new Set(searchResult.matches.map((m) => m.band))].sort();

  const bridgeStrength = computeBridgeStrength(
    searchResult.songCount,
    searchResult.albumCount,
    searchResult.totalOccurrences,
  );

  return {
    phrase: opts.phrase,
    totalOccurrences: searchResult.totalOccurrences,
    songCount: searchResult.songCount,
    albumCount: searchResult.albumCount,
    bridgeStrength,
    matches: searchResult.matches,
    nearbyWords,
    bandNames,
  };
}

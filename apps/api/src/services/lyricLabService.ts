import { prisma } from '../lib/prisma.js';
import { tokenize, getCustomStopwords } from './wordCloudService.js';
import type {
  LyricLabResult,
  LyricLabScope,
  LyricLabSongResult,
  LyricLabAlbumAggregate,
  LyricLabGlobalAggregate,
} from '@band-spectrum-mapper/shared';

interface LyricLabParams {
  bandId?: string;
  albumId?: string;
  songId?: string;
  scope: LyricLabScope;
  maxWords?: number;
}

export async function buildLyricLab(params: LyricLabParams): Promise<LyricLabResult> {
  const { bandId, albumId, songId, scope, maxWords = 80 } = params;

  const customStopwords = await getCustomStopwords();

  const where =
    scope === 'song' && songId
      ? { id: songId }
      : scope === 'album' && albumId
        ? { albumId }
        : bandId
          ? { bandId }
          : undefined;

  if (!where) throw new Error('Missing required filter for scope');

  const songs = await prisma.song.findMany({
    where,
    select: {
      id: true,
      title: true,
      albumId: true,
      bandId: true,
      trackNumber: true,
      album: { select: { id: true, title: true, year: true } },
      band: { select: { id: true, name: true } },
      lyrics: {
        where: { isPrimary: true },
        select: { text: true },
        take: 1,
      },
    },
    orderBy: [{ album: { year: 'asc' } }, { trackNumber: 'asc' }, { title: 'asc' }],
  });

  const bandName = songs[0]?.band?.name ?? '';
  const resolvedBandId = bandId ?? songs[0]?.band?.id ?? '';

  const songResults: LyricLabSongResult[] = songs
    .filter((s) => s.lyrics.length > 0 && s.lyrics[0]?.text?.trim())
    .map((s) => {
      const rawTokens = tokenize(s.lyrics[0]!.text);
      const tokens = rawTokens.filter((w) => !customStopwords.has(w));
      const freq = new Map<string, number>();
      for (const t of tokens) {
        freq.set(t, (freq.get(t) ?? 0) + 1);
      }
      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
      return {
        songId: s.id,
        songTitle: s.title,
        albumId: s.album?.id ?? '',
        albumTitle: s.album?.title ?? '',
        bandId: s.band?.id ?? '',
        bandName: s.band?.name ?? '',
        words: sorted.slice(0, maxWords).map(([text, count], i) => ({ text, count, rank: i + 1 })),
        totalTokens: tokens.length,
        uniqueWords: freq.size,
      };
    });

  // Album aggregates (skip for single-song scope)
  const albumAggregates: LyricLabAlbumAggregate[] = [];
  if (scope !== 'song') {
    const albumIds = [...new Set(songResults.map((s) => s.albumId).filter(Boolean))];
    for (const aId of albumIds) {
      const albumSongs = songResults.filter((s) => s.albumId === aId);
      const albumFreq = new Map<string, number>();
      for (const song of albumSongs) {
        for (const { text, count } of song.words) {
          albumFreq.set(text, (albumFreq.get(text) ?? 0) + count);
        }
      }
      const sorted = [...albumFreq.entries()].sort((a, b) => b[1] - a[1]);
      const songWordSets = albumSongs.map((s) => new Set(s.words.map((w) => w.text)));
      const sharedWords = sorted
        .filter(([text]) => songWordSets.filter((set) => set.has(text)).length > 1)
        .map(([text]) => text)
        .slice(0, 30);

      albumAggregates.push({
        albumId: aId,
        albumTitle: albumSongs[0]?.albumTitle ?? '',
        words: sorted.slice(0, maxWords).map(([text, count], i) => ({ text, count, rank: i + 1 })),
        totalTokens: albumSongs.reduce((sum, s) => sum + s.totalTokens, 0),
        uniqueWords: albumFreq.size,
        sharedWords,
        songCount: albumSongs.length,
      });
    }
  }

  // Global aggregate for full-discography scope
  let globalAggregate: LyricLabGlobalAggregate | null = null;
  if (scope === 'discography' && songResults.length > 0) {
    const globalFreq = new Map<string, number>();
    for (const song of songResults) {
      for (const { text, count } of song.words) {
        globalFreq.set(text, (globalFreq.get(text) ?? 0) + count);
      }
    }
    const sorted = [...globalFreq.entries()].sort((a, b) => b[1] - a[1]);
    globalAggregate = {
      words: sorted.slice(0, maxWords).map(([text, count], i) => ({ text, count, rank: i + 1 })),
      totalTokens: songResults.reduce((sum, s) => sum + s.totalTokens, 0),
      uniqueWords: globalFreq.size,
      songCount: songResults.length,
    };
  }

  return {
    bandId: resolvedBandId,
    bandName,
    scope,
    songs: songResults,
    albumAggregates,
    globalAggregate,
    songsWithLyrics: songResults.length,
    songsTotal: songs.length,
  };
}

import { prisma } from '../lib/prisma.js';
import { DEFAULT_STOPWORDS } from '@band-spectrum-mapper/shared';
import type {
  LyricsAnalysisResult,
  WordFrequency,
  WordCloudEntry,
  WordSongLink,
  ComparisonResult,
  AnalysisQueryInput,
  CompareQueryInput,
} from '@band-spectrum-mapper/shared';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';
import { HttpError } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// Text processing helpers
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .map((t) => t.replace(/^['-]+|['-]+$/g, ''))
    .filter((t) => t.length > 0);
}

function buildNgrams(tokens: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

async function getCustomStopwords(): Promise<Set<string>> {
  const rows = await prisma.customStopword.findMany();
  return new Set(rows.map((r) => r.word.toLowerCase()));
}

function computeFrequency(
  tokens: string[],
  stopwords: Set<string>,
  minLength: number,
  topN: number,
  minCount: number = 0,
): { topWords: WordFrequency[]; uniqueWords: number; totalWords: number } {
  const filtered = tokens.filter(
    (t) => t.length >= minLength && !stopwords.has(t),
  );

  const freq = new Map<string, number>();
  for (const word of filtered) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  const totalFiltered = filtered.length;

  const sorted = [...freq.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({
      word,
      count,
      percentage: totalFiltered > 0 ? (count / totalFiltered) * 100 : 0,
    }));

  return {
    topWords: sorted,
    uniqueWords: freq.size,
    totalWords: totalFiltered,
  };
}

function computeNgramFrequency(
  tokens: string[],
  stopwords: Set<string>,
  n: number,
  topN: number,
  minCount: number = 0,
): WordFrequency[] {
  const ngrams = buildNgrams(tokens, n);

  // Filter ngrams where first or last token is a stopword or too short
  const filtered = ngrams.filter((gram) => {
    const parts = gram.split(' ');
    return (
      !stopwords.has(parts[0]!) &&
      !stopwords.has(parts[parts.length - 1]!) &&
      parts.every((p) => p.length >= 2)
    );
  });

  const freq = new Map<string, number>();
  for (const gram of filtered) {
    freq.set(gram, (freq.get(gram) ?? 0) + 1);
  }

  const total = filtered.length;

  return [...freq.entries()]
    .filter(([, count]) => count >= Math.max(2, minCount))
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({
      word,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }));
}

// ---------------------------------------------------------------------------
// Lyric fetching
// ---------------------------------------------------------------------------

async function fetchLyricTexts(query: AnalysisQueryInput): Promise<string[]> {
  let songFilter: Record<string, unknown> = {};

  if (query.songId) {
    songFilter = { id: query.songId };
  } else if (query.albumId) {
    songFilter = { albumId: query.albumId };
  } else if (query.bandId) {
    songFilter = { bandId: query.bandId };
  } else if (query.songIds && query.songIds.length > 0) {
    songFilter = { id: { in: query.songIds } };
  }

  const lyrics = await prisma.lyric.findMany({
    where: {
      isPrimary: true,
      song: songFilter,
    },
    select: { text: true },
  });

  if (lyrics.length === 0 && (query.songId || query.albumId || query.bandId)) {
    const allLyrics = await prisma.lyric.findMany({
      where: { song: songFilter },
      select: { text: true },
    });
    return allLyrics.map((l) => l.text);
  }

  return lyrics.map((l) => l.text);
}

async function fetchLyricsWithSongs(query: AnalysisQueryInput): Promise<
  Array<{ songId: string; title: string; text: string; bandId: string; bandName: string; albumId: string | null; albumTitle: string | null }>
> {
  let songFilter: Record<string, unknown> = {};

  if (query.songId) {
    songFilter = { id: query.songId };
  } else if (query.albumId) {
    songFilter = { albumId: query.albumId };
  } else if (query.bandId) {
    songFilter = { bandId: query.bandId };
  } else if (query.songIds && query.songIds.length > 0) {
    songFilter = { id: { in: query.songIds } };
  }

  const lyrics = await prisma.lyric.findMany({
    where: { isPrimary: true, song: songFilter },
    select: {
      text: true,
      song: {
        select: {
          id: true,
          title: true,
          bandId: true,
          albumId: true,
          band: { select: { name: true } },
          album: { select: { title: true } },
        },
      },
    },
  });

  return lyrics.map((l) => ({
    songId: l.song.id,
    title: l.song.title,
    text: l.text,
    bandId: l.song.bandId,
    bandName: l.song.band.name,
    albumId: l.song.albumId,
    albumTitle: l.song.album?.title ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Public analysis API
// ---------------------------------------------------------------------------

export const analysisService = {
  async analyze(query: AnalysisQueryInput): Promise<LyricsAnalysisResult> {
    if (!query.songId && !query.albumId && !query.bandId && !query.songIds?.length) {
      throw new HttpError(400, 'At least one of songId, albumId, bandId, or songIds is required');
    }

    const texts = await fetchLyricTexts(query);
    if (texts.length === 0) {
      throw new HttpError(404, 'No lyrics found for the given selection');
    }

    const combined = texts.join('\n');
    const tokens = tokenize(combined);

    const stopwords = new Set(DEFAULT_STOPWORDS);
    if (query.includeCustomStopwords) {
      const custom = await getCustomStopwords();
      for (const w of custom) stopwords.add(w);
    }

    const { topWords, uniqueWords, totalWords } = computeFrequency(
      tokens,
      stopwords,
      query.minWordLength,
      query.topN,
      query.minCount,
    );

    const wordCloudData: WordCloudEntry[] = topWords.map((w) => ({
      text: w.word,
      value: w.count,
    }));

    const result: LyricsAnalysisResult = {
      ...(query.songId !== undefined && { songId: query.songId }),
      ...(query.albumId !== undefined && { albumId: query.albumId }),
      ...(query.bandId !== undefined && { bandId: query.bandId }),
      totalWords,
      uniqueWords,
      topWords,
      wordCloudData,
    };

    if (query.includeNgrams) {
      result.topPhrases = computeNgramFrequency(
        tokens,
        stopwords,
        query.ngramN,
        query.topN,
        query.minCount,
      );
    }

    if (query.includeWordSongLinks) {
      const lyricsWithSongs = await fetchLyricsWithSongs(query);
      const topWordSet = new Set(topWords.map((w) => w.word));

      type SongMeta = { title: string; count: number; bandId: string; bandName: string; albumId: string | null; albumTitle: string | null };
      const linkMap = new Map<string, Map<string, SongMeta>>();

      for (const { songId, title, text, bandId, bandName, albumId, albumTitle } of lyricsWithSongs) {
        const songTokens = tokenize(text);
        const songFreq = new Map<string, number>();
        for (const t of songTokens) {
          if (topWordSet.has(t)) songFreq.set(t, (songFreq.get(t) ?? 0) + 1);
        }
        for (const [word, count] of songFreq.entries()) {
          if (!linkMap.has(word)) linkMap.set(word, new Map());
          linkMap.get(word)!.set(songId, { title, count, bandId, bandName, albumId, albumTitle });
        }
      }

      result.wordSongLinks = topWords
        .filter((w) => linkMap.has(w.word))
        .map((w) => ({
          word: w.word,
          totalCount: w.count,
          songs: [...(linkMap.get(w.word)?.entries() ?? [])].map(([songId, d]) => ({
            songId, title: d.title, count: d.count,
            bandId: d.bandId, bandName: d.bandName, albumId: d.albumId, albumTitle: d.albumTitle,
          })),
        })) as WordSongLink[];

      // Phrase song links (phrases that appear across multiple songs)
      if (query.includeNgrams && result.topPhrases && result.topPhrases.length > 0) {
        const topPhraseSet = new Set(result.topPhrases.map((p) => p.word));
        const phraseLinkMap = new Map<string, Map<string, SongMeta>>();

        for (const { songId, title, text, bandId, bandName, albumId, albumTitle } of lyricsWithSongs) {
          const songTokens = tokenize(text);
          const songNgrams = buildNgrams(songTokens, query.ngramN);
          const phraseFreq = new Map<string, number>();
          for (const gram of songNgrams) {
            if (topPhraseSet.has(gram)) phraseFreq.set(gram, (phraseFreq.get(gram) ?? 0) + 1);
          }
          for (const [phrase, count] of phraseFreq.entries()) {
            if (!phraseLinkMap.has(phrase)) phraseLinkMap.set(phrase, new Map());
            phraseLinkMap.get(phrase)!.set(songId, { title, count, bandId, bandName, albumId, albumTitle });
          }
        }

        result.phraseSongLinks = result.topPhrases
          .filter((p) => phraseLinkMap.has(p.word))
          .map((p) => ({
            word: p.word,
            totalCount: p.count,
            songs: [...(phraseLinkMap.get(p.word)?.entries() ?? [])].map(([songId, d]) => ({
              songId, title: d.title, count: d.count,
              bandId: d.bandId, bandName: d.bandName, albumId: d.albumId, albumTitle: d.albumTitle,
            })),
          })) as WordSongLink[];
      }
    }

    return result;
  },

  async compare(query: CompareQueryInput): Promise<ComparisonResult> {
    const { topN, minWordLength } = query;

    const stopwords = new Set(DEFAULT_STOPWORDS);
    const custom = await getCustomStopwords();
    for (const w of custom) stopwords.add(w);

    type LyricRow = {
      text: string;
      songId: string;
      song: {
        title: string;
        bandId: string;
        albumId: string | null;
        band: { name: string };
        album: { id: string; title: string } | null;
      };
    };

    const fetchLyrics = (sel: CompareQueryInput['selectionA']): Promise<LyricRow[]> => {
      const songFilter = sel.songIds?.length
        ? { id: { in: sel.songIds } }
        : sel.albumIds?.length
          ? { albumId: { in: sel.albumIds } }
          : sel.bandIds?.length
            ? { bandId: { in: sel.bandIds } }
            : {};
      return prisma.lyric.findMany({
        where: { isPrimary: true, song: songFilter },
        select: {
          text: true,
          songId: true,
          song: {
            select: {
              title: true,
              bandId: true,
              albumId: true,
              band: { select: { name: true } },
              album: { select: { id: true, title: true } },
            },
          },
        },
      }) as Promise<LyricRow[]>;
    };

    const processSelection = (lyrics: LyricRow[]) => {
      const combined = lyrics.map((l) => l.text).join('\n');
      const tokens = tokenize(combined);
      const freq = computeFrequency(tokens, stopwords, minWordLength, topN);
      const topWordSet = new Set(freq.topWords.map((w) => w.word));

      // Build per-word → per-song link map
      const linkMap = new Map<string, Map<string, { title: string; count: number; bandId: string; bandName: string; albumId: string | null; albumTitle: string | null }>>();
      for (const lyric of lyrics) {
        const songTokens = tokenize(lyric.text);
        const songFreq = new Map<string, number>();
        for (const tok of songTokens) {
          if (tok.length >= minWordLength && !stopwords.has(tok) && topWordSet.has(tok)) {
            songFreq.set(tok, (songFreq.get(tok) ?? 0) + 1);
          }
        }
        for (const [word, count] of songFreq) {
          if (!linkMap.has(word)) linkMap.set(word, new Map());
          linkMap.get(word)!.set(lyric.songId, {
            title: lyric.song.title,
            count,
            bandId: lyric.song.bandId,
            bandName: lyric.song.band.name,
            albumId: lyric.song.albumId,
            albumTitle: lyric.song.album?.title ?? null,
          });
        }
      }

      const wordSongLinks: WordSongLink[] = freq.topWords
        .filter((w) => linkMap.has(w.word))
        .map((w) => ({
          word: w.word,
          totalCount: w.count,
          songs: [...(linkMap.get(w.word)?.entries() ?? [])].map(([songId, d]) => ({
            songId,
            title: d.title,
            count: d.count,
            bandId: d.bandId,
            bandName: d.bandName,
            albumId: d.albumId,
            albumTitle: d.albumTitle,
          })),
        }));

      return {
        ...freq,
        wordSongLinks,
        wordCloudData: freq.topWords.map((w) => ({ text: w.word, value: w.count })),
      };
    };

    const getScoreAverages = async (sel: CompareQueryInput['selectionA']) => {
      const songFilter = sel.songIds?.length
        ? { songId: { in: sel.songIds } }
        : sel.albumIds?.length
          ? { song: { albumId: { in: sel.albumIds } } }
          : sel.bandIds?.length
            ? { bandId: { in: sel.bandIds } }
            : {};
      const scores = await prisma.songAxisScore.findMany({ where: songFilter });
      if (scores.length === 0) {
        return { aggression: 0, complexity: 0, atmosphere: 0, emotion: 0, psychedelic: 0, concept: 0 };
      }
      return Object.fromEntries(
        SCORE_AXES.map((axis) => [
          axis,
          scores.reduce((sum, s) => sum + (s[axis] as number), 0) / scores.length,
        ]),
      ) as { aggression: number; complexity: number; atmosphere: number; emotion: number; psychedelic: number; concept: number };
    };

    const sels = [query.selectionA, query.selectionB, ...(query.selectionC ? [query.selectionC] : [])];
    const [lyricsA, lyricsB, lyricsC] = await Promise.all(sels.map(fetchLyrics));

    const resultA = processSelection(lyricsA!);
    const resultB = processSelection(lyricsB!);
    const resultC = lyricsC ? processSelection(lyricsC) : undefined;

    const [scoresA, scoresB, ...restScores] = await Promise.all(sels.map(getScoreAverages));
    const scoresC = restScores[0];

    const wordsA = new Set(resultA.topWords.map((w) => w.word));
    const wordsB = new Set(resultB.topWords.map((w) => w.word));
    const wordsC = resultC ? new Set(resultC.topWords.map((w) => w.word)) : null;

    const inAll = (word: string) =>
      wordsA.has(word) && wordsB.has(word) && (!wordsC || wordsC.has(word));

    const sharedTopWords = resultA.topWords.filter((w) => inAll(w.word));
    const uniqueToA = resultA.topWords.filter((w) => !wordsB.has(w.word) && (!wordsC || !wordsC.has(w.word)));
    const uniqueToB = resultB.topWords.filter((w) => !wordsA.has(w.word) && (!wordsC || !wordsC.has(w.word)));
    const uniqueToC = resultC
      ? resultC.topWords.filter((w) => !wordsA.has(w.word) && !wordsB.has(w.word))
      : undefined;

    const makeAnalysis = (r: ReturnType<typeof processSelection>) => ({
      totalWords: r.totalWords,
      uniqueWords: r.uniqueWords,
      topWords: r.topWords,
      wordCloudData: r.wordCloudData,
      wordSongLinks: r.wordSongLinks,
    });

    return {
      selectionA: { label: query.selectionA.label, scores: scoresA!, analysis: makeAnalysis(resultA) },
      selectionB: { label: query.selectionB.label, scores: scoresB!, analysis: makeAnalysis(resultB) },
      ...(resultC && scoresC ? {
        selectionC: { label: query.selectionC!.label, scores: scoresC, analysis: makeAnalysis(resultC) },
      } : {}),
      sharedTopWords,
      uniqueToA,
      uniqueToB,
      ...(uniqueToC ? { uniqueToC } : {}),
    };
  },
};

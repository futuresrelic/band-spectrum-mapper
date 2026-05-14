/**
 * Word Cloud Service — aggregates lyric frequency, AI themes, and tags
 * into a weighted word list suitable for visual display.
 *
 * Weight formula: 0.55 * freq_norm + 0.30 * theme_boost + 0.15 * tag_boost
 */

import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudScope = 'song' | 'album' | 'artist' | 'universe';

export interface CloudWord {
  text: string;
  weight: number;           // 0–100
  frequency: number;        // raw occurrence count
  themeBoost: number;       // 0–1 from AI theme presence
  tagBoost: number;         // 0–1 from tag matches
  songs: { id: string; title: string; band: string }[];
}

export interface WordCloudData {
  words: CloudWord[];
  scope: CloudScope;
  label: string;
  totalTokens: number;
  uniqueWords: number;
}

// ---------------------------------------------------------------------------
// Stopwords (extend from DB custom_stopwords)
// ---------------------------------------------------------------------------

const BUILTIN_STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','as','is','was','are','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','this','that','these','those',
  'what','which','who','when','where','how','all','each','every','both',
  'more','most','other','some','such','no','not','only','same','so','than',
  'too','very','just','because','if','up','out','about','into','through',
  'then','there','here','now','can','get','go','come','know','like','see',
  'one','two','three','time','way','day','man','new','old','s','t','re',
  'don','didn','doesn','won','wouldn','can\'t','cannot','i\'m','it\'s',
  'let','us','come','back','down','got','even','still','know','said',
  'im','its','youre','thats','dont','cant','wont','isnt','are','were',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length >= 3 && !BUILTIN_STOPWORDS.has(w));
}

async function getCustomStopwords(): Promise<Set<string>> {
  const rows = await prisma.customStopword.findMany({ select: { word: true } });
  return new Set(rows.map((r) => r.word.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchSongIds(scope: CloudScope, id: string): Promise<string[]> {
  switch (scope) {
    case 'song':
      return [id];

    case 'album': {
      const songs = await prisma.song.findMany({
        where: { albumId: id },
        select: { id: true },
      });
      return songs.map((s) => s.id);
    }

    case 'artist': {
      const songs = await prisma.song.findMany({
        where: { bandId: id },
        select: { id: true },
      });
      return songs.map((s) => s.id);
    }

    case 'universe':
    default: {
      const songs = await prisma.song.findMany({ select: { id: true } });
      return songs.map((s) => s.id);
    }
  }
}

async function getScopeLabel(scope: CloudScope, id: string): Promise<string> {
  switch (scope) {
    case 'song': {
      const s = await prisma.song.findUnique({
        where: { id },
        include: { band: true },
      });
      return s ? `${s.title} — ${s.band.name}` : id;
    }
    case 'album': {
      const a = await prisma.album.findUnique({
        where: { id },
        include: { band: true },
      });
      return a ? `${a.title} — ${a.band.name}` : id;
    }
    case 'artist': {
      const b = await prisma.band.findUnique({ where: { id } });
      return b?.name ?? id;
    }
    case 'universe':
      return 'All Songs';
  }
}

// ---------------------------------------------------------------------------
// Build word cloud data
// ---------------------------------------------------------------------------

export async function buildWordCloud(
  scope: CloudScope,
  id: string,
  opts: {
    limit?: number;
    minFreq?: number;
    maxFreqFilter?: number;
    includeLyrics?: boolean;
    includeThemes?: boolean;
    includeTags?: boolean;
  } = {},
): Promise<WordCloudData> {
  const {
    limit = 120,
    minFreq = 2,
    maxFreqFilter,
    includeLyrics = true,
    includeThemes = true,
    includeTags = true,
  } = opts;

  const customStopwords = await getCustomStopwords();
  const songIds = await fetchSongIds(scope, id);
  const label = await getScopeLabel(scope, id);

  if (songIds.length === 0) {
    return { words: [], scope, label, totalTokens: 0, uniqueWords: 0 };
  }

  // ── Fetch all the data we need in parallel (skip disabled sources) ─────────
  const [lyrics, songMeta, aiAnalyses, tags] = await Promise.all([
    includeLyrics
      ? prisma.lyric.findMany({
          where: { songId: { in: songIds }, isPrimary: true },
          select: { songId: true, text: true },
        })
      : Promise.resolve([]),
    prisma.song.findMany({
      where: { id: { in: songIds } },
      select: { id: true, title: true, band: { select: { name: true } } },
    }),
    includeThemes
      ? prisma.songAiAnalysis.findMany({
          where: { songId: { in: songIds } },
          select: { songId: true, themes: true },
        })
      : Promise.resolve([]),
    includeTags
      ? prisma.songTag.findMany({
          where: { songId: { in: songIds } },
          include: { tag: true, song: { select: { id: true, title: true, band: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  const songById = new Map(songMeta.map((s) => [s.id, s]));

  // ── Word frequency across all songs ──────────────────────────────────────
  // Map: word → { totalFreq, songsSet }
  const wordFreq = new Map<string, { freq: number; songIds: Set<string> }>();
  let totalTokens = 0;

  for (const lyric of lyrics) {
    const tokens = tokenize(lyric.text).filter((w) => !customStopwords.has(w));
    totalTokens += tokens.length;
    for (const token of tokens) {
      const entry = wordFreq.get(token) ?? { freq: 0, songIds: new Set() };
      entry.freq += 1;
      entry.songIds.add(lyric.songId);
      wordFreq.set(token, entry);
    }
  }

  // ── AI theme boost ────────────────────────────────────────────────────────
  const themeWords = new Map<string, number>(); // word → occurrence count across songs
  for (const analysis of aiAnalyses) {
    const themes = analysis.themes as string[] | null ?? [];
    for (const theme of themes) {
      const tokens = tokenize(theme).filter((w) => !customStopwords.has(w));
      for (const t of tokens) {
        themeWords.set(t, (themeWords.get(t) ?? 0) + 1);
      }
    }
  }
  const maxThemeCount = Math.max(1, ...themeWords.values());

  // ── Tag boost ─────────────────────────────────────────────────────────────
  const tagWordMap = new Map<string, { count: number; songIds: Set<string> }>();
  for (const st of tags) {
    const tagTokens = tokenize(st.tag.name).filter((w) => !customStopwords.has(w));
    for (const t of tagTokens) {
      const entry = tagWordMap.get(t) ?? { count: 0, songIds: new Set() };
      entry.count += 1;
      entry.songIds.add(st.song.id);
      tagWordMap.set(t, entry);
    }
    // Also add the full tag slug if short (≤ 2 words)
    const fullTag = st.tag.name.toLowerCase().trim();
    if (!BUILTIN_STOPWORDS.has(fullTag) && !customStopwords.has(fullTag) && fullTag.length >= 3) {
      const entry = tagWordMap.get(fullTag) ?? { count: 0, songIds: new Set() };
      entry.count += 1;
      entry.songIds.add(st.song.id);
      tagWordMap.set(fullTag, entry);
    }
  }
  const maxTagCount = Math.max(1, ...([...tagWordMap.values()].map((e) => e.count)));

  // ── Combine all candidate words ───────────────────────────────────────────
  // Union of enabled source words
  const allWords = new Set([
    ...(includeLyrics ? wordFreq.keys() : []),
    ...(includeThemes ? themeWords.keys() : []),
    ...(includeTags ? tagWordMap.keys() : []),
  ]);

  const maxFreqNorm = Math.max(1, ...([...wordFreq.values()].map((e) => e.freq)));

  const results: CloudWord[] = [];

  for (const word of allWords) {
    const freqEntry = wordFreq.get(word);
    const freq = freqEntry?.freq ?? 0;

    if (freq < minFreq && !themeWords.has(word) && !tagWordMap.has(word)) continue;
    // Max frequency filter: skip words that appear too often (for rare-word analysis)
    if (maxFreqFilter !== undefined && maxFreqFilter > 0 && freq > maxFreqFilter) continue;

    const freqNorm = includeLyrics ? freq / maxFreqNorm : 0;
    const themeBoost = includeThemes ? (themeWords.get(word) ?? 0) / maxThemeCount : 0;
    const tagBoost = includeTags ? ((tagWordMap.get(word)?.count ?? 0)) / maxTagCount : 0;

    const weight = Math.round(
      (freqNorm * 0.55 + themeBoost * 0.30 + tagBoost * 0.15) * 100,
    );

    if (weight < 2) continue;

    // Song associations
    const songIdsForWord = new Set<string>([
      ...(freqEntry?.songIds ?? []),
      ...(tagWordMap.get(word)?.songIds ?? []),
    ]);

    const songList = [...songIdsForWord]
      .map((sid) => songById.get(sid))
      .filter(Boolean)
      .map((s) => ({ id: s!.id, title: s!.title, band: s!.band.name }));

    results.push({ text: word, weight, frequency: freq, themeBoost, tagBoost, songs: songList });
  }

  // Sort by weight desc, take top N
  results.sort((a, b) => b.weight - a.weight);
  const topWords = results.slice(0, limit);

  return {
    words: topWords,
    scope,
    label,
    totalTokens,
    uniqueWords: wordFreq.size,
  };
}

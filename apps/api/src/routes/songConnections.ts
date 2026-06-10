import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const songConnectionsRouter = Router();

// Common English + lyric-filler stopwords
const BASE_STOPWORDS = new Set([
  'the', 'and', 'for', 'but', 'not', 'all', 'can', 'has', 'had', 'him',
  'his', 'how', 'its', 'may', 'now', 'old', 'own', 'put', 'use', 'was',
  'who', 'any', 'are', 'our', 'out', 'one', 'her', 'she', 'too', 'way',
  'you', 'they', 'them', 'your', 'this', 'that', 'what', 'with', 'from',
  'have', 'been', 'when', 'where', 'will', 'more', 'than', 'into', 'then',
  'these', 'those', 'were', 'some', 'many', 'much', 'such', 'most', 'each',
  'both', 'even', 'also', 'over', 'very', 'back', 'just', 'well', 'here',
  'still', 'about', 'after', 'other', 'could', 'there', 'their', 'which',
  'would', 'first', 'last', 'long', 'look', 'come', 'like', 'know', 'take',
  'make', 'only', 'right', 'good', 'down', 'once', 'away', 'same', 'feel',
  'time', 'life', 'mind', 'keep', 'turn', 'need', 'want', 'find', 'call',
  'hand', 'high', 'hold', 'left', 'lost', 'seen', 'ever',
  // lyric filler
  'yeah', 'ooh', 'ohh', 'ahh', 'aah', 'mmm', 'hey', 'huh', 'wow',
  'whoa', 'woah', 'nah',
  // structure markers occasionally embedded in lyric text
  'verse', 'chorus', 'bridge', 'outro', 'intro', 'repeat',
  // contractions (post-apostrophe-strip residue)
  'don', 'won', 'ain', 'isn', 'aren', 'didn', 'wasn', 'couldn', 'wouldn',
  'shouldn', 'haven', 'hadn', 'let', 'did', 'got', 'say', 'see', 'get',
]);

function tokenize(text: string, extra: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z']+/)) {
    const w = raw.replace(/^'+|'+$/g, '');
    if (w.length >= 3 && !BASE_STOPWORDS.has(w) && !extra.has(w)) result.add(w);
  }
  return result;
}

function intersect<T>(a: Set<T>, b: Set<T>): T[] {
  const r: T[] = [];
  for (const v of a) if (b.has(v)) r.push(v);
  return r;
}

interface ConnectionItem {
  songId: string;
  title: string;
  bandId: string;
  bandName: string;
  albumId?: string;
  albumTitle?: string;
  connectionCount: number;
  sharedWords: string[];
  sharedWordCount: number;
  sharedThemes: string[];
  sharedTags: string[];
  sameAlbum: boolean;
  sameArtist: boolean;
}

// GET /api/song-connections/:songId
// Returns all connection types for every other song in the library.
// Filtering by type and minConnections is done client-side for fast interactivity.
songConnectionsRouter.get('/:songId', async (req, res, next): Promise<void> => {
  try {
    const { songId } = req.params as { songId: string };

    const [source, customStopwords] = await Promise.all([
      prisma.song.findUnique({
        where: { id: songId },
        include: {
          band:       { select: { id: true, name: true } },
          album:      { select: { id: true, title: true } },
          lyrics:     { where: { isPrimary: true }, take: 1, select: { text: true } },
          songTags:   { include: { tag: { select: { name: true } } } },
          aiAnalysis: { select: { themes: true } },
        },
      }),
      prisma.customStopword.findMany({ select: { word: true } }),
    ]);

    if (!source) { res.status(404).json({ error: 'Song not found' }); return; }

    const extra = new Set(customStopwords.map(s => s.word.toLowerCase()));

    const allSongs = await prisma.song.findMany({
      where:   { NOT: { id: songId } },
      include: {
        band:       { select: { id: true, name: true } },
        album:      { select: { id: true, title: true } },
        lyrics:     { where: { isPrimary: true }, take: 1, select: { text: true } },
        songTags:   { include: { tag: { select: { name: true } } } },
        aiAnalysis: { select: { themes: true } },
      },
      orderBy: { title: 'asc' },
    });

    const srcText   = source.lyrics[0]?.text ?? '';
    const srcWords  = tokenize(srcText, extra);
    const srcTags   = new Set(source.songTags.map(st => st.tag.name));
    const srcThemes = new Set((source.aiAnalysis?.themes as string[] | null) ?? []);

    const connections: ConnectionItem[] = [];

    for (const song of allSongs) {
      const text   = song.lyrics[0]?.text ?? '';
      const words  = srcText && text ? tokenize(text, extra) : new Set<string>();
      const tags   = new Set(song.songTags.map(st => st.tag.name));
      const themes = new Set((song.aiAnalysis?.themes as string[] | null) ?? []);

      const sharedWords  = intersect(srcWords, words);
      const sharedThemes = intersect(srcThemes, themes);
      const sharedTags   = intersect(srcTags, tags);
      const sameAlbum    = !!(source.albumId && song.albumId === source.albumId);
      const sameArtist   = song.bandId === source.bandId;

      const connectionCount =
        sharedWords.length + sharedThemes.length + sharedTags.length +
        (sameAlbum ? 1 : 0) + (sameArtist ? 1 : 0);

      if (connectionCount === 0) continue;

      const item: ConnectionItem = {
        songId:          song.id,
        title:           song.title,
        bandId:          song.bandId,
        bandName:        song.band.name,
        connectionCount,
        sharedWords:     sharedWords.slice(0, 60),
        sharedWordCount: sharedWords.length,
        sharedThemes,
        sharedTags,
        sameAlbum,
        sameArtist,
      };
      if (song.albumId) item.albumId    = song.albumId;
      if (song.album)   item.albumTitle = song.album.title;
      connections.push(item);
    }

    connections.sort((a, b) => b.connectionCount - a.connectionCount);

    const sourceSong: {
      id: string; title: string; bandId: string; bandName: string;
      albumId?: string; albumTitle?: string;
    } = {
      id:       source.id,
      title:    source.title,
      bandId:   source.bandId,
      bandName: source.band.name,
    };
    if (source.albumId) sourceSong.albumId    = source.albumId;
    if (source.album)   sourceSong.albumTitle = source.album.title;

    res.json({ sourceSong, connections, totalCount: connections.length }); return;
  } catch (e) { next(e); }
});

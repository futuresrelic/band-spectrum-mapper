import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const lyricChainRouter = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const STOP = new Set([
  'the','a','an','and','or','in','on','at','to','for','of',
  'with','by','is','was','are','be','i','you','he','she','it','we','they',
  'my','your','his','its','not','no','so','than','very','just','let','s','t',
  'that','this','have','had','has','but','from','all','when','what','here',
  'there','will','can','get','got','like','more','some','been','her','him',
  'they','them','then','into','about','up','out','do','did','don',
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

interface SongEntry {
  id: string;
  title: string;
  bandName: string;
  albumId: string | null;
  albumTitle: string | null;
  words: string[]; // unique tokenized words
}

async function fetchSongLyrics(bandIds: string[]): Promise<SongEntry[]> {
  const songs = await prisma.song.findMany({
    where: {
      bandId: { in: bandIds },
      isInstrumental: false,
      lyrics: { some: { isPrimary: true } },
    },
    select: {
      id: true, title: true, albumId: true,
      band:  { select: { name: true } },
      album: { select: { title: true } },
      lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
    },
    take: 3000,
  });

  return songs
    .map((s) => ({
      id: s.id,
      title: s.title,
      bandName: s.band.name,
      albumId: s.albumId,
      albumTitle: s.album?.title ?? null,
      words: [...new Set(tokenize(s.lyrics[0]?.text ?? ''))],
    }))
    .filter((s) => s.words.length > 0);
}

function buildWordMap(songs: SongEntry[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const s of songs) {
    for (const w of s.words) {
      const existing = map.get(w);
      if (existing) {
        existing.add(s.id);
      } else {
        map.set(w, new Set([s.id]));
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// GET /api/lyric-chain/start?bandIds=id1,id2&count=6
// Returns seed words to kick off the game.
// ---------------------------------------------------------------------------

lyricChainRouter.get('/start', async (req, res, next): Promise<void> => {
  try {
    const raw = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];
    const count = Math.min(6, Math.max(2,
      parseInt(typeof req.query['count'] === 'string' ? req.query['count'] : '6', 10) || 6,
    ));

    if (bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' }); return;
    }

    const songs = await fetchSongLyrics(bandIds);
    if (songs.length < 2) {
      res.status(400).json({ error: 'Not enough songs with lyrics for these bands' }); return;
    }

    const wordMap = buildWordMap(songs);

    const candidates: { word: string; count: number }[] = [];
    for (const [word, songSet] of wordMap) {
      if (songSet.size >= 2) candidates.push({ word, count: songSet.size });
    }

    if (candidates.length < count) {
      res.status(400).json({ error: 'Not enough shared words — try selecting more bands or adding lyrics' }); return;
    }

    // Tier 1: words appearing in 3–8 songs (interesting, not trivial)
    // Tier 2: words in 2 songs (narrow but valid)
    // Tier 3: words in 9+ songs (very common)
    const tier1 = candidates.filter((c) => c.count >= 3 && c.count <= 8);
    const tier2 = candidates.filter((c) => c.count === 2);
    const tier3 = candidates.filter((c) => c.count > 8);
    const pool = [...tier1, ...tier2, ...tier3];

    const shuffled = pool.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count).map((c) => ({ word: c.word, songCount: c.count }));

    res.json({ words: selected });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/lyric-chain/start-song?bandIds=id1,id2&count=6
// Returns a seed song + its available first words.
// ---------------------------------------------------------------------------

lyricChainRouter.get('/start-song', async (req, res, next): Promise<void> => {
  try {
    const raw = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];
    const count = Math.min(6, Math.max(2,
      parseInt(typeof req.query['count'] === 'string' ? req.query['count'] : '6', 10) || 6,
    ));

    if (bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' }); return;
    }

    const songs = await fetchSongLyrics(bandIds);
    if (songs.length < 2) {
      res.status(400).json({ error: 'Not enough songs with lyrics for these bands' }); return;
    }

    const wordMap = buildWordMap(songs);
    const shuffled = [...songs].sort(() => Math.random() - 0.5);

    let seedSong: SongEntry | null = null;
    let seedWords: { word: string; availableCount: number }[] = [];

    for (const song of shuffled) {
      const words: { word: string; availableCount: number }[] = [];
      for (const word of song.words) {
        const songSet = wordMap.get(word);
        if (!songSet) continue;
        const available = [...songSet].filter(sid => sid !== song.id);
        if (available.length >= 1) words.push({ word, availableCount: available.length });
      }
      if (words.length >= count) {
        seedSong = song;
        const preferred = words.filter(w => w.availableCount >= 2 && w.availableCount <= 6).sort(() => Math.random() - 0.5);
        const fallback  = words.filter(w => w.availableCount < 2 || w.availableCount > 6).sort(() => Math.random() - 0.5);
        seedWords = [...preferred, ...fallback].slice(0, count);
        break;
      }
    }

    if (!seedSong) {
      res.status(400).json({ error: 'Could not find a suitable seed song — try selecting more bands' }); return;
    }

    res.json({
      seed: { id: seedSong.id, title: seedSong.title, bandName: seedSong.bandName, albumId: seedSong.albumId, albumTitle: seedSong.albumTitle },
      words: seedWords.map(w => ({ word: w.word, songCount: w.availableCount })),
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/lyric-chain/songs
// Returns songs that contain the given word (excluding already-used ones).
// ---------------------------------------------------------------------------

lyricChainRouter.post('/songs', async (req, res, next): Promise<void> => {
  try {
    const { word, bandIds, usedSongIds, hardMode, usedAlbumIds, count } = req.body as {
      word?: unknown; bandIds?: unknown; usedSongIds?: unknown;
      hardMode?: unknown; usedAlbumIds?: unknown; count?: unknown;
    };

    if (typeof word !== 'string' || word.length < 2) {
      res.status(400).json({ error: 'word required' }); return;
    }
    if (!Array.isArray(bandIds) || bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' }); return;
    }

    const safeBandIds    = bandIds.filter((x): x is string => typeof x === 'string');
    const safeUsed       = Array.isArray(usedSongIds)   ? usedSongIds.filter((x): x is string => typeof x === 'string')  : [];
    const safeUsedAlbums = Array.isArray(usedAlbumIds)  ? usedAlbumIds.filter((x): x is string => typeof x === 'string') : [];
    const isHard         = hardMode === true;
    const songCount      = Math.min(6, Math.max(2, typeof count === 'number' ? count : 6));

    const songs = await fetchSongLyrics(safeBandIds);

    const matching = songs
      .filter((s) => {
        if (safeUsed.includes(s.id)) return false;
        if (isHard && s.albumId && safeUsedAlbums.includes(s.albumId)) return false;
        return s.words.includes(word);
      })
      .map((s) => ({ id: s.id, title: s.title, bandName: s.bandName, albumId: s.albumId, albumTitle: s.albumTitle }));

    // Shuffle and limit to songCount so higher difficulties show fewer options
    const shuffled = [...matching].sort(() => Math.random() - 0.5);
    res.json({ songs: shuffled.slice(0, songCount) });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/lyric-chain/next-words
// Returns words from the chosen song that still lead to ≥1 available song.
// Empty array signals a dead end.
// ---------------------------------------------------------------------------

lyricChainRouter.post('/next-words', async (req, res, next): Promise<void> => {
  try {
    const { songId, bandIds, usedWords, usedSongIds, hardMode, usedAlbumIds, count } = req.body as {
      songId?: unknown; bandIds?: unknown; usedWords?: unknown; usedSongIds?: unknown;
      hardMode?: unknown; usedAlbumIds?: unknown; count?: unknown;
    };

    if (typeof songId !== 'string') {
      res.status(400).json({ error: 'songId required' }); return;
    }
    if (!Array.isArray(bandIds) || bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' }); return;
    }

    const safeBandIds    = bandIds.filter((x): x is string => typeof x === 'string');
    const safeUsedWords  = Array.isArray(usedWords)    ? usedWords.filter((x): x is string => typeof x === 'string')   : [];
    const safeUsed       = Array.isArray(usedSongIds)  ? usedSongIds.filter((x): x is string => typeof x === 'string') : [];
    const safeUsedAlbums = Array.isArray(usedAlbumIds) ? usedAlbumIds.filter((x): x is string => typeof x === 'string'): [];
    const isHard         = hardMode === true;
    const wordCount      = Math.min(6, Math.max(2, typeof count === 'number' ? count : 6));

    const songs   = await fetchSongLyrics(safeBandIds);
    const wordMap = buildWordMap(songs);

    const chosenSong = songs.find((s) => s.id === songId);
    if (!chosenSong) { res.json({ words: [] }); return; }

    // The chosen song is now "used" for next-word purposes
    const nextUsed = [...safeUsed, songId];

    const candidates: { word: string; availableCount: number }[] = [];

    for (const word of chosenSong.words) {
      if (safeUsedWords.includes(word)) continue;
      const songSet = wordMap.get(word);
      if (!songSet) continue;

      const available = [...songSet].filter((sid) => {
        if (nextUsed.includes(sid)) return false;
        if (isHard) {
          const s = songs.find((x) => x.id === sid);
          if (s?.albumId && safeUsedAlbums.includes(s.albumId)) return false;
        }
        return true;
      });

      if (available.length >= 1) {
        candidates.push({ word, availableCount: available.length });
      }
    }

    if (candidates.length === 0) {
      res.json({ words: [] }); return;
    }

    // Mix high-connectivity words with surprises
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    // Prefer words with 2-6 connecting songs (sweet spot for choice without being trivial)
    const preferredPool = shuffled.filter((c) => c.availableCount >= 2 && c.availableCount <= 6);
    const fallbackPool  = shuffled.filter((c) => !preferredPool.includes(c));
    const combined      = [...preferredPool, ...fallbackPool];

    const selected = combined.slice(0, wordCount).map((c) => ({ word: c.word, songCount: c.availableCount }));
    res.json({ words: selected });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/lyric-chain/scores — save a completed chain (auth required)
// ---------------------------------------------------------------------------

lyricChainRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { chainLength, chainJson, bandIds, hardMode } = req.body as {
      chainLength?: unknown; chainJson?: unknown; bandIds?: unknown; hardMode?: unknown;
    };

    if (typeof chainLength !== 'number' || chainLength < 1 || chainLength > 10000) {
      res.status(400).json({ error: 'Invalid chainLength' }); return;
    }

    const safeChainJson = typeof chainJson === 'string' ? chainJson.slice(0, 20000) : '[]';
    const safeBandScope = Array.isArray(bandIds)
      ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
      : null;

    const saved = await prisma.lyricChainScore.create({
      data: {
        userId,
        chainLength: Math.floor(chainLength),
        chainJson: safeChainJson,
        hardMode: hardMode === true,
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });

    const rank = await prisma.lyricChainScore.count({
      where: { chainLength: { gt: saved.chainLength }, hardMode: saved.hardMode },
    });

    res.status(201).json({ ok: true, chainLength: saved.chainLength, rank: rank + 1 });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/lyric-chain/scores — leaderboard
// ---------------------------------------------------------------------------

lyricChainRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit    = Math.min(50, parseInt(typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10) || 15);
    const hardMode = req.query['hardMode'] === 'true';

    const scores = await prisma.lyricChainScore.findMany({
      where:   { hardMode },
      orderBy: { chainLength: 'desc' },
      take:    limit,
      select: {
        id: true, chainLength: true, hardMode: true, bandScope: true, createdAt: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    });

    const allBandIds = [...new Set(
      scores.flatMap(s => s.bandScope ? s.bandScope.split(',').filter(Boolean) : [])
    )];
    const bandNameMap = new Map<string, string>();
    if (allBandIds.length > 0) {
      const bands = await prisma.band.findMany({
        where: { id: { in: allBandIds } },
        select: { id: true, name: true },
      });
      for (const b of bands) bandNameMap.set(b.id, b.name);
    }

    res.json(scores.map((s, i) => ({
      rank:           i + 1,
      playerName:     s.user.name ?? 'Anonymous',
      avatarUrl:      s.user.avatarUrl,
      chainLength:    s.chainLength,
      hardMode:       s.hardMode,
      bandScope:      s.bandScope,
      bandScopeNames: s.bandScope
        ? s.bandScope.split(',').filter(Boolean).map(id => bandNameMap.get(id) ?? id).join(', ')
        : null,
      createdAt:      s.createdAt,
    })));
  } catch (e) { next(e); }
});

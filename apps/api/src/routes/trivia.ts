import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const triviaRouter = Router();

triviaRouter.use(requireAuth);
triviaRouter.use(requireAdmin);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j]!;
    a[j] = tmp!;
  }
  return a;
}

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

type TriviaQuestion = {
  id: string;
  type: string;
  question: string;
  imageUrl?: string;
  answer: string;
  options: string[];
  explanation?: string;
};

// ---------------------------------------------------------------------------
// GET /api/trivia/questions?count=10&bandIds=...
// ---------------------------------------------------------------------------

triviaRouter.get('/questions', async (req, res, next) => {
  try {
    const count = Math.min(20, Math.max(1, parseInt(String(req.query['count'] ?? '10'))));
    const bandIdsParam = req.query['bandIds'];
    const bandIds = typeof bandIdsParam === 'string' && bandIdsParam
      ? bandIdsParam.split(',').filter(Boolean)
      : undefined;

    const bandFilter = bandIds?.length ? { bandId: { in: bandIds } } : {};

    const questions: TriviaQuestion[] = [];

    // ── Question type 1: Highest axis score song ──────────────────────────
    const axes = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
    try {
      const randomAxis = axes[Math.floor(Math.random() * axes.length)]!;
      const topSong = await prisma.songAxisScore.findFirst({
        where: { song: { ...bandFilter } },
        orderBy: { [randomAxis]: 'desc' },
        include: { song: { include: { band: true } } },
      });
      if (topSong) {
        const otherSongs = await prisma.song.findMany({
          where: { ...bandFilter, id: { not: topSong.songId } },
          take: 20,
          include: { band: true },
          orderBy: { createdAt: 'desc' },
        });
        const distractors = shuffle(otherSongs).slice(0, 3).map((s) => s.title);
        if (distractors.length === 3) {
          questions.push({
            id: makeId(),
            type: 'highest_score',
            question: `Which song scores highest on ${randomAxis.charAt(0).toUpperCase() + randomAxis.slice(1)} for ${topSong.song.band.name}?`,
            answer: topSong.song.title,
            options: shuffle([topSong.song.title, ...distractors]),
            explanation: `${topSong.song.title} scores ${topSong[randomAxis]}/10 on ${randomAxis}.`,
          });
        }
      }
    } catch { /* skip if not enough data */ }

    // ── Question type 2: Album release order ─────────────────────────────
    try {
      const albums = await prisma.album.findMany({
        where: { year: { not: null }, ...bandFilter },
        select: { id: true, title: true, year: true, band: { select: { name: true } } },
        orderBy: { year: 'asc' },
      });
      if (albums.length >= 4) {
        const [a, b] = shuffle(albums.filter((al) => al.year !== null)).slice(0, 2) as [typeof albums[number], typeof albums[number]];
        if (a && b && a.year !== null && b.year !== null) {
          const earlier = a.year < b.year ? a : b;
          const later = a.year < b.year ? b : a;
          questions.push({
            id: makeId(),
            type: 'album_order',
            question: `Which album was released first: "${a.title}" or "${b.title}"?`,
            answer: earlier.title,
            options: shuffle([earlier.title, later.title]),
            explanation: `"${earlier.title}" (${earlier.year}) came before "${later.title}" (${later.year}).`,
          });
        }
      }
    } catch { /* skip */ }

    // ── Question type 3: Album art identification ─────────────────────────
    try {
      const albumsWithArt = await prisma.album.findMany({
        where: { artworkUrl: { not: null }, ...bandFilter },
        select: { id: true, title: true, artworkUrl: true, band: { select: { id: true, name: true } } },
      });
      const artAlbums = albumsWithArt.filter((a) => a.artworkUrl?.startsWith('http'));
      if (artAlbums.length >= 4) {
        const picked = shuffle(artAlbums)[0]!;
        const distractors = shuffle(artAlbums.filter((a) => a.id !== picked.id))
          .slice(0, 3).map((a) => a.title);
        const artworkUrl = picked.artworkUrl ?? undefined;
        questions.push({
          id: makeId(),
          type: 'match_album',
          question: `Which album is this?`,
          ...(artworkUrl !== undefined && { imageUrl: artworkUrl }),
          answer: picked.title,
          options: shuffle([picked.title, ...distractors]),
          explanation: `This is "${picked.title}" by ${picked.band.name}.`,
        });
      }
    } catch { /* skip */ }

    // ── Question type 4: Lyric snippet → song ────────────────────────────
    try {
      const lyricsPool = await prisma.lyric.findMany({
        where: { song: { ...bandFilter } },
        take: 50,
        select: {
          text: true,
          song: { select: { title: true, band: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      const validLyrics = lyricsPool.filter((l) => l.text.trim().split(/\s+/).length >= 15);
      if (validLyrics.length >= 4) {
        const picked = shuffle(validLyrics)[0]!;
        const words = picked.text.trim().split(/\s+/);
        // Take a line/snippet of 8–12 words from the middle
        const start = Math.floor(words.length * 0.3);
        const snippet = words.slice(start, start + 10).join(' ') + '…';
        const otherSongs = shuffle(validLyrics.filter((l) => l.song.title !== picked.song.title))
          .slice(0, 3).map((l) => l.song.title);
        if (otherSongs.length === 3) {
          questions.push({
            id: makeId(),
            type: 'lyric_snippet',
            question: `"${snippet}" — which song is this from?`,
            answer: picked.song.title,
            options: shuffle([picked.song.title, ...otherSongs]),
            explanation: `This lyric is from "${picked.song.title}" by ${picked.song.band.name}.`,
          });
        }
      }
    } catch { /* skip */ }

    // ── Question type 5: Radar profile → song name ───────────────────────
    try {
      const allScores = await prisma.songAxisScore.findMany({
        where: { song: { ...bandFilter } },
        take: 50,
        include: { song: { include: { band: true } } },
        orderBy: { updatedAt: 'desc' },
      });
      // Skip songs where every axis is 0 — they produce uninformative questions
      const scores = allScores.filter((s) =>
        s.aggression > 0 || s.complexity > 0 || s.atmosphere > 0 ||
        s.emotion > 0 || s.psychedelic > 0 || s.concept > 0,
      );
      if (scores.length >= 4) {
        const picked = shuffle(scores)[0]!;
        const distractors = shuffle(scores.filter((s) => s.songId !== picked.songId))
          .slice(0, 3).map((s) => s.song.title);
        questions.push({
          id: makeId(),
          type: 'radar_guess',
          question: `This song scores: Aggression ${picked.aggression}, Complexity ${picked.complexity}, Atmosphere ${picked.atmosphere}, Emotion ${picked.emotion}, Psychedelic ${picked.psychedelic}, Concept ${picked.concept}. Which song is it?`,
          answer: picked.song.title,
          options: shuffle([picked.song.title, ...distractors]),
          explanation: `"${picked.song.title}" by ${picked.song.band.name}.`,
        });
      }
    } catch { /* skip */ }

    // ── Question type 6: Band identification by song title ───────────────
    try {
      const allSongs = await prisma.song.findMany({
        where: { ...bandFilter },
        take: 100,
        select: { id: true, title: true, band: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      const bands = [...new Map(allSongs.map((s) => [s.band.id, s.band.name])).entries()];
      if (bands.length >= 4 && allSongs.length >= 4) {
        const picked = shuffle(allSongs)[0]!;
        const distractorBands = shuffle(bands.filter(([id]) => id !== picked.band.id))
          .slice(0, 3).map(([, name]) => name);
        if (distractorBands.length === 3) {
          questions.push({
            id: makeId(),
            type: 'band_id',
            question: `Which band recorded "${picked.title}"?`,
            answer: picked.band.name,
            options: shuffle([picked.band.name, ...distractorBands]),
            explanation: `"${picked.title}" is by ${picked.band.name}.`,
          });
        }
      }
    } catch { /* skip */ }

    // Return up to `count` questions, shuffled
    res.json({ questions: shuffle(questions).slice(0, count) });
  } catch (e) { next(e); }
});

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const lyricCompleteRouter = Router();

// ---------------------------------------------------------------------------
// Difficulty config
// ---------------------------------------------------------------------------

interface DifficultyConfig {
  id: string;
  choices: number;  // number of word options per step (including correct)
  timerSec: number; // seconds allowed per word
  phraseCount: number;
  scoreFactor: number;
}

const DIFFICULTIES: DifficultyConfig[] = [
  { id: 'super-easy', choices: 4, timerSec: 8,  phraseCount: 5, scoreFactor: 1.0 },
  { id: 'easy',       choices: 4, timerSec: 6,  phraseCount: 5, scoreFactor: 1.2 },
  { id: 'medium',     choices: 3, timerSec: 5,  phraseCount: 6, scoreFactor: 1.5 },
  { id: 'hard',       choices: 3, timerSec: 4,  phraseCount: 6, scoreFactor: 2.0 },
  { id: 'very-hard',  choices: 2, timerSec: 3,  phraseCount: 7, scoreFactor: 3.0 },
];

const DIFF_MAP = new Map(DIFFICULTIES.map((d) => [d.id, d]));
const DEFAULT_DIFF = DIFFICULTIES[2]!; // medium

// ---------------------------------------------------------------------------
// Lyric helpers
// ---------------------------------------------------------------------------

const STOP = new Set([
  'the','a','an','and','or','in','on','at','to','for','of','with','by',
  'is','was','are','be','i','you','he','she','it','we','they','my','your',
  'his','its','not','no','so','than','very','just','let','s','t','that',
  'this','have','had','has','but','from','all','when','what','here','there',
  'will','can','get','got','like','more','some','been','her','him','them',
  'then','into','about','up','out','do','did','don',
]);

function splitPhrases(text: string): string[][] {
  return text
    .replace(/\[.*?\]/g, '')       // strip [Verse], [Chorus] etc
    .split(/[,;.!?\r\n]+/)
    .map((p) => p.trim().split(/\s+/).filter((w) => w.length > 0))
    .filter((words) => words.length >= 4 && words.length <= 14);
}

function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z'-]/g, '').replace(/^'+|'+$/g, '');
}

function isGoodDecoy(w: string): boolean {
  const c = cleanWord(w);
  return c.length >= 3 && !STOP.has(c);
}

// ---------------------------------------------------------------------------
// GET /api/lyric-complete/round?bandIds=id1,id2&difficulty=medium
// Returns a set of phrases for one game.
// Each phrase: context words + ordered steps (answer + decoys per step).
// ---------------------------------------------------------------------------

lyricCompleteRouter.get('/round', async (req, res, next): Promise<void> => {
  try {
    const raw = typeof req.query['bandIds'] === 'string' ? req.query['bandIds'] : '';
    const bandIds = raw ? raw.split(',').filter(Boolean) : [];
    const diffId = typeof req.query['difficulty'] === 'string' ? req.query['difficulty'] : 'medium';

    if (bandIds.length === 0) {
      res.status(400).json({ error: 'bandIds required' }); return;
    }

    const diff = DIFF_MAP.get(diffId) ?? DEFAULT_DIFF;

    // Fetch songs with lyrics
    const songs = await prisma.song.findMany({
      where: {
        bandId: { in: bandIds },
        isInstrumental: false,
        lyrics: { some: { isPrimary: true } },
      },
      select: {
        id: true, title: true,
        band: { select: { name: true } },
        lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
      },
      take: 2000,
    });

    if (songs.length === 0) {
      res.status(400).json({ error: 'No songs with lyrics found for these bands' }); return;
    }

    // Build decoy word pool from all lyrics
    const allWords: string[] = [];
    const songPhrasePool: { songId: string; title: string; bandName: string; phrases: string[][] }[] = [];

    for (const s of songs) {
      const text = s.lyrics[0]?.text ?? '';
      if (!text) continue;
      const phrases = splitPhrases(text);
      if (phrases.length > 0) {
        songPhrasePool.push({ songId: s.id, title: s.title, bandName: s.band.name, phrases });
      }
      // Collect raw words for decoy pool
      for (const p of phrases) {
        for (const w of p) {
          if (isGoodDecoy(w)) allWords.push(w);
        }
      }
    }

    if (songPhrasePool.length === 0) {
      res.status(400).json({ error: 'Not enough lyric content found' }); return;
    }

    // Shuffle for variety
    const shuffledSongs = [...songPhrasePool].sort(() => Math.random() - 0.5);

    // Build unique decoy word set
    const decoySet = [...new Set(allWords.filter((w) => isGoodDecoy(w)))];

    const rounds: {
      songId: string;
      songTitle: string;
      bandName: string;
      contextWords: string[];   // first 2 words shown as context
      steps: {                  // one object per word the player must complete
        answer: string;         // exact original token (case preserved)
        options: string[];      // shuffled array including answer (cleanWord applied for display)
      }[];
    }[] = [];

    const usedSongIds = new Set<string>();

    for (const entry of shuffledSongs) {
      if (rounds.length >= diff.phraseCount) break;
      if (usedSongIds.has(entry.songId)) continue;

      // Pick a suitable phrase from this song
      const shuffledPhrases = [...entry.phrases].sort(() => Math.random() - 0.5);
      let chosenPhrase: string[] | null = null;

      for (const phrase of shuffledPhrases) {
        // Need at least 3 words after the 2-word context
        if (phrase.length >= 5) {
          chosenPhrase = phrase;
          break;
        }
      }
      if (!chosenPhrase) continue;

      // Context = first 2 words; Steps = words 2 onwards (up to 8 more for display,
      // but the game progresses word by word)
      const contextWords = chosenPhrase.slice(0, 2);
      // Words the player must guess: positions 2..min(end, 2+6)
      const targetWords = chosenPhrase.slice(2, 2 + 6);

      // Build per-word options
      const steps: { answer: string; options: string[] }[] = [];
      for (const word of targetWords) {
        const answerClean = cleanWord(word);
        // Collect decoys: unique, different from answer, good word
        const decoys = decoySet
          .filter((w) => cleanWord(w) !== answerClean && isGoodDecoy(w))
          .sort(() => Math.random() - 0.5)
          .slice(0, diff.choices - 1)
          .map((w) => cleanWord(w));

        if (decoys.length < diff.choices - 1) continue; // not enough decoys

        const options = [answerClean, ...decoys].sort(() => Math.random() - 0.5);
        steps.push({ answer: answerClean, options });
      }

      if (steps.length === 0) continue;

      rounds.push({
        songId: entry.songId,
        songTitle: entry.title,
        bandName: entry.bandName,
        contextWords,
        steps,
      });
      usedSongIds.add(entry.songId);
    }

    if (rounds.length === 0) {
      res.status(400).json({ error: 'Could not build rounds — try selecting more bands or adding lyrics' }); return;
    }

    res.json({
      difficulty: diff.id,
      timerSec: diff.timerSec,
      scoreFactor: diff.scoreFactor,
      rounds,
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/lyric-complete/scores — save a completed game (auth required)
// ---------------------------------------------------------------------------

lyricCompleteRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { score, wordsCompleted, maxStreak, difficulty, bandIds } = req.body as {
      score?: unknown; wordsCompleted?: unknown; maxStreak?: unknown;
      difficulty?: unknown; bandIds?: unknown;
    };

    if (typeof score !== 'number' || score < 0 || score > 10_000_000) {
      res.status(400).json({ error: 'Invalid score' }); return;
    }
    if (typeof wordsCompleted !== 'number' || wordsCompleted < 0) {
      res.status(400).json({ error: 'Invalid wordsCompleted' }); return;
    }

    const safeStreak = typeof maxStreak === 'number' ? Math.max(0, Math.floor(maxStreak)) : 0;
    const safeDiff = typeof difficulty === 'string' && DIFF_MAP.has(difficulty) ? difficulty : 'medium';
    const safeBandScope = Array.isArray(bandIds)
      ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
      : null;

    const saved = await prisma.lyricCompleteScore.create({
      data: {
        userId,
        score: Math.floor(score),
        wordsCompleted: Math.floor(wordsCompleted),
        maxStreak: safeStreak,
        difficulty: safeDiff,
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });

    const rank = await prisma.lyricCompleteScore.count({
      where: { score: { gt: saved.score }, difficulty: saved.difficulty },
    });

    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/lyric-complete/scores — leaderboard
// ---------------------------------------------------------------------------

lyricCompleteRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, parseInt(
      typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10,
    ) || 15);
    const difficulty = typeof req.query['difficulty'] === 'string' ? req.query['difficulty'] : 'medium';

    const scores = await prisma.lyricCompleteScore.findMany({
      where:   { difficulty },
      orderBy: { score: 'desc' },
      take:    limit,
      select: {
        id: true, score: true, wordsCompleted: true, maxStreak: true,
        difficulty: true, bandScope: true, createdAt: true,
        user: { select: { name: true, username: true, avatarUrl: true } },
      },
    });

    const allBandIds = [...new Set(
      scores.flatMap((s) => s.bandScope ? s.bandScope.split(',').filter(Boolean) : []),
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
      playerName:     s.user.username ?? s.user.name ?? 'Anonymous',
      avatarUrl:      s.user.avatarUrl,
      score:          s.score,
      wordsCompleted: s.wordsCompleted,
      maxStreak:      s.maxStreak,
      difficulty:     s.difficulty,
      bandScope:      s.bandScope,
      bandScopeNames: s.bandScope
        ? s.bandScope.split(',').filter(Boolean).map((id) => bandNameMap.get(id) ?? id).join(', ')
        : null,
      createdAt:      s.createdAt,
    })));
  } catch (e) { next(e); }
});

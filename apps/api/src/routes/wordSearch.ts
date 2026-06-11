import { Router } from 'express';
import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';

export const wordSearchRouter = Router();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WS_SIZES: Record<string, number>      = { easy: 10, medium: 12, hard: 15, expert: 15 };
const WS_WORD_COUNTS: Record<string, number> = { easy: 10, medium: 14, hard: 18, expert: 22 };

// Directions: [dr, dc]
type Dir = [number, number];
const EASY_DIRS:   Dir[] = [[0,1],[1,0]];
const MEDIUM_DIRS: Dir[] = [[0,1],[1,0],[1,1],[1,-1]];
const HARD_DIRS:   Dir[] = [[0,1],[1,0],[1,1],[1,-1],[0,-1],[-1,0],[-1,-1],[-1,1]];

function getDirs(difficulty: string): Dir[] {
  if (difficulty === 'easy')   return EASY_DIRS;
  if (difficulty === 'medium') return MEDIUM_DIRS;
  return HARD_DIRS;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WordSolution {
  word: string;
  row: number;
  col: number;
  dr: number;
  dc: number;
}

export interface WordSearchData {
  size: number;
  grid: string[][];
  words: { word: string; clue: string }[];
  solutions: WordSolution[];  // for post-game reveal only
  difficulty: string;
  bandScope: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Word-search grid algorithm
// ---------------------------------------------------------------------------

function buildWordSearchGrid(
  wordClues: { word: string; clue: string }[],
  size: number,
  difficulty: string,
): { grid: string[][]; placed: (WordSolution & { clue: string })[] } {
  const dirs = getDirs(difficulty);
  const items = wordClues
    .map(({ word, clue }) => ({ word: word.toUpperCase().replace(/[^A-Z]/g, ''), clue }))
    .filter(({ word }) => word.length >= 3 && word.length <= size - 1)
    .sort((a, b) => b.word.length - a.word.length);

  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill('') as string[]);
  const placed: (WordSolution & { clue: string })[] = [];

  for (const { word, clue } of items) {
    let success = false;
    const shuffledDirs = [...dirs].sort(() => Math.random() - 0.5);

    for (let attempt = 0; attempt < 120 && !success; attempt++) {
      const [dr, dc] = shuffledDirs[attempt % shuffledDirs.length]!;

      // Valid starting-cell bounds for this direction + word length
      const rMin = dr < 0 ? word.length - 1 : 0;
      const rMax = dr > 0 ? size - word.length : size - 1;
      const cMin = dc < 0 ? word.length - 1 : 0;
      const cMax = dc > 0 ? size - word.length : size - 1;
      if (rMin > rMax || cMin > cMax) continue;

      const row = rMin + Math.floor(Math.random() * (rMax - rMin + 1));
      const col = cMin + Math.floor(Math.random() * (cMax - cMin + 1));

      let valid = true;
      for (let i = 0; i < word.length; i++) {
        const cell = grid[row + dr * i]?.[col + dc * i];
        if (cell && cell !== word[i]) { valid = false; break; }
      }

      if (valid) {
        for (let i = 0; i < word.length; i++) {
          grid[row + dr * i]![col + dc * i] = word[i]!;
        }
        placed.push({ word, clue, row, col, dr, dc });
        success = true;
      }
    }
  }

  // Fill empty cells with random letters (slightly weighted to word letters for false positives)
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const wordLetters = placed.flatMap((p) => p.word.split(''));
  const fillPool = [...wordLetters, ...wordLetters, ...alpha.split('')];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r]![c]) {
        grid[r]![c] = fillPool[Math.floor(Math.random() * fillPool.length)]!;
      }
    }
  }

  return { grid, placed };
}

// ---------------------------------------------------------------------------
// AI word/clue generation (same pattern as crossword)
// ---------------------------------------------------------------------------

function getOpenAIClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY not configured');
  return new OpenAI({ apiKey });
}

async function generateWordClues(
  bandNames: string,
  albumList: string,
  songList: string,
  analysisContext: string,
  difficulty: string,
  wordCount: number,
): Promise<{ word: string; clue: string }[]> {
  const diffHints: Record<string, string> = {
    easy:   'Most well-known songs and albums. Clue hints directly at the answer.',
    medium: 'Mix of popular tracks and album-track references.',
    hard:   'Deep cuts, lyrical words, thematic concepts. More cryptic hints.',
    expert: 'Obscure references. Challenging clues.',
  };

  const prompt = `You are generating a word-search puzzle for a music trivia game about: ${bandNames}

Albums: ${albumList || '(none)'}
Songs: ${songList || '(none)'}
${analysisContext ? `Context: ${analysisContext}` : ''}

DIFFICULTY: ${difficulty.toUpperCase()} — ${diffHints[difficulty] ?? diffHints['medium']!}

Generate exactly ${wordCount} words with short clue hints.

STRICT RULES:
1. Single word only — no spaces, hyphens, punctuation
2. Letters A-Z only
3. Length: 3 to 14 characters
4. Include song title words, album title words, thematic/lyrical words
5. Vary lengths (short 3-5, medium 6-9, long 10-14)
6. No duplicate words
7. Clue: max 70 characters

Return ONLY a JSON array:
[{"word":"LATERALUS","clue":"Tool's 2001 masterpiece"},{"word":"SPIRAL","clue":"Recurring geometric motif"}]`;

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.75,
    max_tokens: 2500,
  });

  const raw     = completion.choices[0]?.message?.content ?? '[]';
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { return []; } }
    else return [];
  }

  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.['entries'])
    ? ((parsed as Record<string, unknown>)['entries'] as unknown[])
    : [];

  return arr
    .filter((x): x is { word: string; clue: string } =>
      typeof x === 'object' && x !== null &&
      typeof (x as Record<string, unknown>)['word'] === 'string' &&
      typeof (x as Record<string, unknown>)['clue'] === 'string',
    )
    .map((x) => ({
      word: (x.word as string).toUpperCase().replace(/[^A-Z]/g, ''),
      clue: (x.clue as string).slice(0, 80),
    }))
    .filter(({ word }) => word.length >= 3 && word.length <= 14);
}

// ---------------------------------------------------------------------------
// POST /api/word-search/generate  — auth required
// ---------------------------------------------------------------------------

wordSearchRouter.post('/generate', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const { bandIds, difficulty } = req.body as { bandIds?: unknown; difficulty?: unknown };

    const safeBandIds = Array.isArray(bandIds) ? bandIds.filter((x): x is string => typeof x === 'string') : [];
    const safeDiff    = typeof difficulty === 'string' && ['easy','medium','hard','expert'].includes(difficulty) ? difficulty : 'medium';

    if (safeBandIds.length === 0) { res.status(400).json({ error: 'bandIds required' }); return; }

    const bands = await prisma.band.findMany({
      where: { id: { in: safeBandIds } },
      select: { id: true, name: true, contextAnalysis: { select: { thematicSynthesis: true } } },
    });

    const albums = await prisma.album.findMany({
      where: { bandId: { in: safeBandIds } },
      select: { id: true, title: true, year: true },
      take: 20,
    });

    const songs = await prisma.song.findMany({
      where: { bandId: { in: safeBandIds }, isInstrumental: false },
      select: { id: true, title: true, contextAnalysis: { select: { thematicSynthesis: true } } },
      take: 60,
    });

    const bandNames      = bands.map((b) => b.name).join(', ') || 'Unknown Artists';
    const albumList      = albums.map((a) => a.title).join(', ');
    const songList       = songs.map((s) => s.title).join(', ');
    const analysisCtx    = bands
      .flatMap((b) => b.contextAnalysis?.thematicSynthesis ? [b.contextAnalysis.thematicSynthesis] : [])
      .join(' ').slice(0, 600);

    const wordCount = WS_WORD_COUNTS[safeDiff] ?? 14;
    const size      = WS_SIZES[safeDiff]      ?? 12;

    const wordClues = await generateWordClues(bandNames, albumList, songList, analysisCtx, safeDiff, wordCount);
    if (wordClues.length < 4) { res.status(422).json({ error: 'AI returned too few words. Try again.' }); return; }

    const { grid, placed } = buildWordSearchGrid(wordClues, size, safeDiff);
    if (placed.length < 4) { res.status(422).json({ error: 'Could not build grid. Try again.' }); return; }

    const data: WordSearchData = {
      size,
      grid,
      words:     placed.map((p) => ({ word: p.word, clue: p.clue })),
      solutions: placed.map(({ word, row, col, dr, dc }) => ({ word, row, col, dr, dc })),
      difficulty: safeDiff,
      bandScope:  safeBandIds.join(','),
      title:      `${bandNames} Word Search`,
    };

    res.json(data);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/word-search/scores  — auth required
// ---------------------------------------------------------------------------

wordSearchRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { score, wordsFound, totalWords, timeSec, difficulty, bandIds } = req.body as {
      score?: unknown; wordsFound?: unknown; totalWords?: unknown; timeSec?: unknown;
      difficulty?: unknown; bandIds?: unknown;
    };

    if (typeof score     !== 'number' || score < 0)     { res.status(400).json({ error: 'Invalid score' });      return; }
    if (typeof wordsFound !== 'number' || wordsFound < 0) { res.status(400).json({ error: 'Invalid wordsFound' }); return; }

    const safeDiff      = typeof difficulty   === 'string' && ['easy','medium','hard','expert'].includes(difficulty) ? difficulty : 'medium';
    const safeBandScope = Array.isArray(bandIds)
      ? bandIds.filter((x): x is string => typeof x === 'string').join(',') || null
      : null;

    const saved = await prisma.wordSearchScore.create({
      data: {
        userId,
        score:      Math.floor(score),
        wordsFound: Math.max(0, Math.floor(typeof wordsFound  === 'number' ? wordsFound  : 0)),
        totalWords: Math.max(0, Math.floor(typeof totalWords  === 'number' ? totalWords  : 0)),
        timeSec:    Math.max(0, Math.floor(typeof timeSec     === 'number' ? timeSec     : 0)),
        difficulty: safeDiff,
        ...(safeBandScope ? { bandScope: safeBandScope } : {}),
      },
    });

    const rank = await prisma.wordSearchScore.count({
      where: { score: { gt: saved.score }, difficulty: saved.difficulty },
    });

    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/word-search/scores  — public leaderboard
// ---------------------------------------------------------------------------

wordSearchRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, parseInt(
      typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10,
    ) || 15);
    const difficulty = typeof req.query['difficulty'] === 'string' ? req.query['difficulty'] : 'medium';

    const scores = await prisma.wordSearchScore.findMany({
      where:   { difficulty },
      orderBy: { score: 'desc' },
      take:    limit,
      select: {
        id: true, score: true, wordsFound: true, totalWords: true,
        timeSec: true, difficulty: true, bandScope: true, createdAt: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    });

    const allBandIds = [...new Set(scores.flatMap((s) => s.bandScope ? s.bandScope.split(',').filter(Boolean) : []))];
    const bandNameMap = new Map<string, string>();
    if (allBandIds.length > 0) {
      const bands = await prisma.band.findMany({ where: { id: { in: allBandIds } }, select: { id: true, name: true } });
      for (const b of bands) bandNameMap.set(b.id, b.name);
    }

    res.json(scores.map((s, i) => ({
      rank:           i + 1,
      playerName:     s.user.name ?? 'Anonymous',
      avatarUrl:      s.user.avatarUrl,
      score:          s.score,
      wordsFound:     s.wordsFound,
      totalWords:     s.totalWords,
      timeSec:        s.timeSec,
      difficulty:     s.difficulty,
      bandScopeNames: s.bandScope ? s.bandScope.split(',').filter(Boolean).map((id) => bandNameMap.get(id) ?? id).join(', ') : null,
      createdAt:      s.createdAt,
    })));
  } catch (e) { next(e); }
});

import { Router } from 'express';
import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { HttpError } from '../middleware/errorHandler.js';

export const crosswordRouter = Router();

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

function getOpenAIClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY not configured');
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const GRID_SIZES: Record<string, number> = {
  easy: 11, medium: 13, hard: 15, expert: 15,
};

const WORD_COUNTS: Record<string, number> = {
  easy: 14, medium: 20, hard: 25, expert: 28,
};

interface PlacedWord {
  word: string;
  clue: string;
  row: number;
  col: number;
  direction: 'across' | 'down';
}

export interface CrosswordCell {
  letter: string | null;
  number: number | null;
}

export interface CrosswordClue {
  number: number;
  direction: 'across' | 'down';
  clue: string;
  answer: string;
  row: number;
  col: number;
  length: number;
}

export interface CrosswordData {
  size: number;
  cells: CrosswordCell[][];
  acrossClues: CrosswordClue[];
  downClues: CrosswordClue[];
  difficulty: string;
  bandScope: string;
  title: string;
  dailyDate?: string;
}

// ---------------------------------------------------------------------------
// Crossword grid algorithm
// ---------------------------------------------------------------------------

function buildCrosswordGrid(
  wordClues: { word: string; clue: string }[],
  size: number,
): PlacedWord[] {
  const items = wordClues
    .map(({ word, clue }) => ({ word: word.toUpperCase().replace(/[^A-Z]/g, ''), clue }))
    .filter(({ word }) => word.length >= 3 && word.length <= size - 2)
    .sort((a, b) => b.word.length - a.word.length);

  const grid: (string | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null) as (string | null)[],
  );
  const placed: PlacedWord[] = [];
  if (items.length === 0) return placed;

  const first = items[0]!;
  const r0 = Math.floor(size / 2);
  const c0 = Math.floor((size - first.word.length) / 2);
  placeWordOnGrid(grid, first.word, r0, c0, 'across');
  placed.push({ ...first, row: r0, col: c0, direction: 'across' });

  for (const item of items.slice(1)) {
    const result = findPlacement(grid, item.word, placed, size);
    if (result) {
      placeWordOnGrid(grid, item.word, result.row, result.col, result.direction);
      placed.push({ ...item, row: result.row, col: result.col, direction: result.direction });
    }
  }
  return placed;
}

function placeWordOnGrid(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  dir: 'across' | 'down',
): void {
  for (let i = 0; i < word.length; i++) {
    const r = dir === 'down' ? row + i : row;
    const c = dir === 'across' ? col + i : col;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    grid[r]![c] = word[i]!;
  }
}

function findPlacement(
  grid: (string | null)[][],
  word: string,
  placed: PlacedWord[],
  size: number,
): { row: number; col: number; direction: 'across' | 'down' } | null {
  const center = size / 2;
  const candidates: { row: number; col: number; direction: 'across' | 'down'; score: number }[] = [];

  for (const p of placed) {
    const oppDir: 'across' | 'down' = p.direction === 'across' ? 'down' : 'across';
    for (let wi = 0; wi < word.length; wi++) {
      for (let pi = 0; pi < p.word.length; pi++) {
        if (word[wi] !== p.word[pi]) continue;
        const row = p.direction === 'across' ? p.row - wi : p.row + pi;
        const col = p.direction === 'across' ? p.col + pi : p.col - wi;
        if (!canPlace(grid, word, row, col, oppDir, size)) continue;
        const midR = oppDir === 'down' ? row + word.length / 2 : row;
        const midC = oppDir === 'across' ? col + word.length / 2 : col;
        const score = -Math.sqrt((midR - center) ** 2 + (midC - center) ** 2);
        candidates.push({ row, col, direction: oppDir, score });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function canPlace(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  dir: 'across' | 'down',
  size: number,
): boolean {
  if (row < 0 || col < 0) return false;
  const endRow = dir === 'down' ? row + word.length - 1 : row;
  const endCol = dir === 'across' ? col + word.length - 1 : col;
  if (endRow >= size || endCol >= size) return false;

  // Word boundary cells must be empty
  if (dir === 'across') {
    if (col > 0 && grid[row]![col - 1] !== null) return false;
    if (col + word.length < size && grid[row]![col + word.length] !== null) return false;
  } else {
    if (row > 0 && grid[row - 1]![col] !== null) return false;
    if (row + word.length < size && grid[row + word.length]![col] !== null) return false;
  }

  let intersections = 0;

  for (let i = 0; i < word.length; i++) {
    const r = dir === 'down' ? row + i : row;
    const c = dir === 'across' ? col + i : col;
    const cell = grid[r]![c];
    const letter = word[i]!;

    if (cell !== null) {
      if (cell !== letter) return false;
      intersections++;
    } else {
      if (dir === 'across') {
        if (r > 0 && grid[r - 1]![c] !== null) return false;
        if (r < size - 1 && grid[r + 1]![c] !== null) return false;
      } else {
        if (c > 0 && grid[r]![c - 1] !== null) return false;
        if (c < size - 1 && grid[r]![c + 1] !== null) return false;
      }
    }
  }

  return intersections >= 1;
}

function buildCrosswordData(
  placed: PlacedWord[],
  size: number,
  difficulty: string,
  bandScope: string,
  title: string,
): CrosswordData {
  const grid: (string | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null) as (string | null)[],
  );
  for (const p of placed) {
    for (let i = 0; i < p.word.length; i++) {
      const r = p.direction === 'down' ? p.row + i : p.row;
      const c = p.direction === 'across' ? p.col + i : p.col;
      grid[r]![c] = p.word[i]!;
    }
  }

  const acrossStarts = new Map(
    placed.filter((p) => p.direction === 'across').map((p) => [`${p.row},${p.col}`, p]),
  );
  const downStarts = new Map(
    placed.filter((p) => p.direction === 'down').map((p) => [`${p.row},${p.col}`, p]),
  );

  let clueNum = 1;
  const numMap = new Map<string, number>();
  const acrossClues: CrosswordClue[] = [];
  const downClues: CrosswordClue[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r]![c] === null) continue;
      const key = `${r},${c}`;
      const isAcross = acrossStarts.has(key);
      const isDown = downStarts.has(key);
      if (!isAcross && !isDown) continue;

      numMap.set(key, clueNum);
      if (isAcross) {
        const p = acrossStarts.get(key)!;
        acrossClues.push({ number: clueNum, direction: 'across', clue: p.clue, answer: p.word, row: r, col: c, length: p.word.length });
      }
      if (isDown) {
        const p = downStarts.get(key)!;
        downClues.push({ number: clueNum, direction: 'down', clue: p.clue, answer: p.word, row: r, col: c, length: p.word.length });
      }
      clueNum++;
    }
  }

  const cells: CrosswordCell[][] = grid.map((row, r) =>
    row.map((letter, c) => ({
      letter: letter ?? null,
      number: numMap.get(`${r},${c}`) ?? null,
    })),
  );

  return {
    size,
    cells,
    acrossClues: acrossClues.sort((a, b) => a.number - b.number),
    downClues: downClues.sort((a, b) => a.number - b.number),
    difficulty,
    bandScope,
    title,
  };
}

// ---------------------------------------------------------------------------
// AI word/clue generation
// ---------------------------------------------------------------------------

async function generateWordClues(
  bandNames: string,
  albumList: string,
  songList: string,
  analysisContext: string,
  difficulty: string,
  wordCount: number,
): Promise<{ word: string; clue: string }[]> {
  const diffHints: Record<string, string> = {
    easy:   'Use the most well-known songs and albums. Clues should be clear and direct.',
    medium: 'Mix popular and album-track references. Clues can have a light hint or wordplay.',
    hard:   'Include deep cuts, specific themes, lyrical references. Clues should be challenging.',
    expert: 'Highly specific — lyrics, lore, personnel, concepts. Cryptic-adjacent clue style.',
  };
  const hint = diffHints[difficulty] ?? diffHints['medium']!;

  const prompt = `You are building a crossword puzzle for a music trivia game about: ${bandNames}

Known data:
Albums: ${albumList || '(none listed)'}
Songs: ${songList || '(none listed)'}
${analysisContext ? `Context: ${analysisContext}` : ''}

DIFFICULTY: ${difficulty.toUpperCase()} — ${hint}

Generate exactly ${wordCount} crossword entries.

STRICT RULES:
1. Each entry must be ONE word — NO spaces, NO hyphens, NO punctuation
2. Letters A-Z only
3. Length: 3 to 12 characters
4. Topics: key words from song/album titles, thematic concepts, lyrical words, band lore
5. Vary lengths — include a mix of short (3–5), medium (6–8), and long (9–12) words
6. No duplicate words
7. Clue max 90 characters

Return ONLY a JSON array, no markdown, no explanation:
[{"word":"LATERALUS","clue":"Tool's 2001 album built on Fibonacci sequence"},{"word":"SPIRAL","clue":"Mathematical pattern recurring in Tool's imagery"}]`;

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.75,
    max_tokens: 3500,
  });

  const raw = completion.choices[0]?.message?.content ?? '[]';
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { return []; }
    } else { return []; }
  }

  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.['entries'])
    ? ((parsed as Record<string, unknown>)['entries'] as unknown[])
    : [];

  return arr
    .filter((item): item is { word: string; clue: string } =>
      typeof item === 'object' && item !== null &&
      typeof (item as Record<string, unknown>)['word'] === 'string' &&
      typeof (item as Record<string, unknown>)['clue'] === 'string',
    )
    .map((item) => ({
      word: (item.word).toUpperCase().replace(/[^A-Z]/g, ''),
      clue: (item.clue).slice(0, 100),
    }))
    .filter(({ word }) => word.length >= 3 && word.length <= 12);
}

// ---------------------------------------------------------------------------
// POST /api/crossword/generate  — any auth'd user; calls OpenAI
// ---------------------------------------------------------------------------

crosswordRouter.post('/generate', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const { bandIds, albumIds, difficulty } = req.body as {
      bandIds?: unknown; albumIds?: unknown; difficulty?: unknown;
    };

    const safeBandIds  = Array.isArray(bandIds)  ? bandIds.filter((x): x is string => typeof x === 'string') : [];
    const safeAlbumIds = Array.isArray(albumIds) ? albumIds.filter((x): x is string => typeof x === 'string') : [];
    const safeDiff     = typeof difficulty === 'string' && ['easy','medium','hard','expert'].includes(difficulty) ? difficulty : 'medium';

    if (safeBandIds.length === 0 && safeAlbumIds.length === 0) {
      res.status(400).json({ error: 'bandIds or albumIds required' }); return;
    }

    const bands = await prisma.band.findMany({
      where: safeBandIds.length > 0 ? { id: { in: safeBandIds } } : {},
      select: {
        id: true, name: true, description: true,
        contextAnalysis: { select: { thematicSynthesis: true, overallNarrative: true } },
      },
    });

    const albums = await prisma.album.findMany({
      where: {
        ...(safeAlbumIds.length > 0 ? { id: { in: safeAlbumIds } } : {}),
        ...(safeBandIds.length > 0 ? { bandId: { in: safeBandIds } } : {}),
      },
      select: { id: true, title: true, year: true },
      take: 25,
    });

    const songs = await prisma.song.findMany({
      where: {
        ...(safeAlbumIds.length > 0 ? { albumId: { in: safeAlbumIds } } : {}),
        ...(safeBandIds.length > 0 ? { bandId: { in: safeBandIds } } : {}),
        isInstrumental: false,
      },
      select: {
        id: true, title: true,
        contextAnalysis: { select: { thematicSynthesis: true } },
        aiAnalysis: { select: { themes: true, emotionalRegister: true } },
      },
      take: 60,
    });

    const bandNames  = bands.map((b) => b.name).join(', ') || 'Unknown Artists';
    const albumList  = albums.map((a) => `${a.title}${a.year ? ` (${a.year})` : ''}`).join(', ');
    const songList   = songs.map((s) => s.title).join(', ');

    const analysisTexts: string[] = [];
    for (const b of bands) {
      if (b.contextAnalysis?.thematicSynthesis) analysisTexts.push(b.contextAnalysis.thematicSynthesis);
    }
    for (const s of songs.slice(0, 6)) {
      if (s.contextAnalysis?.thematicSynthesis) analysisTexts.push(s.contextAnalysis.thematicSynthesis);
    }
    const analysisContext = analysisTexts.join(' ').slice(0, 900);

    const wordCount = WORD_COUNTS[safeDiff] ?? 20;
    const size      = GRID_SIZES[safeDiff]  ?? 13;

    const wordClues = await generateWordClues(bandNames, albumList, songList, analysisContext, safeDiff, wordCount);

    if (wordClues.length < 5) {
      res.status(422).json({ error: 'AI returned too few valid words. Try again.' }); return;
    }

    const placed = buildCrosswordGrid(wordClues, size);

    if (placed.length < 5) {
      res.status(422).json({ error: 'Could not build puzzle — not enough word crossings. Try again.' }); return;
    }

    const bandScope = safeBandIds.join(',');
    const title     = `${bandNames} Crossword`;
    const data      = buildCrosswordData(placed, size, safeDiff, bandScope, title);

    res.json(data);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/crossword/daily?date=YYYY-MM-DD  — public; get daily puzzle
// ---------------------------------------------------------------------------

crosswordRouter.get('/daily', async (req, res, next): Promise<void> => {
  try {
    const today = typeof req.query['date'] === 'string'
      ? req.query['date']
      : new Date().toISOString().slice(0, 10);

    const puzzle = await prisma.crosswordPuzzle.findFirst({
      where: { isDaily: true, dailyDate: today },
    });

    if (!puzzle) {
      res.status(404).json({ error: 'No daily puzzle for this date' }); return;
    }

    const data = JSON.parse(puzzle.gridJson) as CrosswordData;
    if (puzzle.dailyDate) data.dailyDate = puzzle.dailyDate;

    res.json({ puzzleId: puzzle.id, puzzle: data, title: puzzle.title });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/crossword/daily  — admin only; save puzzle as daily
// ---------------------------------------------------------------------------

crosswordRouter.post('/daily', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const { puzzleData, date, title } = req.body as {
      puzzleData?: unknown; date?: unknown; title?: unknown;
    };

    if (typeof puzzleData !== 'object' || puzzleData === null) {
      res.status(400).json({ error: 'puzzleData required' }); return;
    }

    const safeDate  = typeof date  === 'string' ? date  : new Date().toISOString().slice(0, 10);
    const safeTitle = typeof title === 'string' ? title : 'Daily Crossword';
    const data      = puzzleData as CrosswordData;
    const gridJson  = JSON.stringify(puzzleData);

    // Upsert: only one daily per date
    const existing = await prisma.crosswordPuzzle.findFirst({
      where: { isDaily: true, dailyDate: safeDate },
    });

    let puzzle;
    if (existing) {
      puzzle = await prisma.crosswordPuzzle.update({
        where: { id: existing.id },
        data: { title: safeTitle, gridJson, difficulty: data.difficulty, bandScope: data.bandScope || null },
      });
    } else {
      puzzle = await prisma.crosswordPuzzle.create({
        data: {
          title: safeTitle,
          isDaily: true,
          dailyDate: safeDate,
          gridJson,
          difficulty: data.difficulty,
          ...(data.bandScope ? { bandScope: data.bandScope } : {}),
        },
      });
    }

    res.status(201).json({ ok: true, puzzleId: puzzle.id, date: safeDate });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/crossword/daily-list  — admin; list scheduled daily puzzles
// ---------------------------------------------------------------------------

crosswordRouter.get('/daily-list', requireAuth, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const puzzles = await prisma.crosswordPuzzle.findMany({
      where: { isDaily: true },
      orderBy: { dailyDate: 'desc' },
      take: 30,
      select: { id: true, title: true, dailyDate: true, difficulty: true, bandScope: true, createdAt: true },
    });
    res.json(puzzles);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/crossword/scores  — auth required
// ---------------------------------------------------------------------------

crosswordRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { score, timeSec, hintsUsed, mistakes, completed, difficulty, bandScope, puzzleId } = req.body as {
      score?: unknown; timeSec?: unknown; hintsUsed?: unknown; mistakes?: unknown;
      completed?: unknown; difficulty?: unknown; bandScope?: unknown; puzzleId?: unknown;
    };

    if (typeof score    !== 'number' || score    < 0) { res.status(400).json({ error: 'Invalid score' }); return; }
    if (typeof timeSec  !== 'number' || timeSec  < 0) { res.status(400).json({ error: 'Invalid timeSec' }); return; }

    const safeDiff  = typeof difficulty === 'string' && ['easy','medium','hard','expert'].includes(difficulty) ? difficulty : 'medium';
    const safeScope = typeof bandScope  === 'string' ? bandScope.slice(0, 500) : null;
    const safePuzId = typeof puzzleId   === 'string' ? puzzleId : null;

    const saved = await prisma.crosswordScore.create({
      data: {
        userId,
        score: Math.floor(score),
        timeSec: Math.floor(timeSec),
        hintsUsed:  typeof hintsUsed === 'number' ? Math.max(0, Math.floor(hintsUsed)) : 0,
        mistakes:   typeof mistakes  === 'number' ? Math.max(0, Math.floor(mistakes))  : 0,
        completed:  completed === true,
        difficulty: safeDiff,
        ...(safeScope ? { bandScope: safeScope } : {}),
        ...(safePuzId ? { puzzleId: safePuzId }  : {}),
      },
    });

    const rank = await prisma.crosswordScore.count({
      where: { score: { gt: saved.score }, difficulty: saved.difficulty },
    });

    res.status(201).json({ ok: true, score: saved.score, rank: rank + 1 });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/crossword/scores  — public leaderboard
// ---------------------------------------------------------------------------

crosswordRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const limit = Math.min(50, parseInt(
      typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10,
    ) || 15);
    const difficulty = typeof req.query['difficulty'] === 'string' ? req.query['difficulty'] : 'medium';

    const scores = await prisma.crosswordScore.findMany({
      where:   { difficulty, completed: true },
      orderBy: { score: 'desc' },
      take:    limit,
      select: {
        id: true, score: true, timeSec: true, hintsUsed: true,
        mistakes: true, difficulty: true, bandScope: true, createdAt: true,
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
      timeSec:        s.timeSec,
      hintsUsed:      s.hintsUsed,
      mistakes:       s.mistakes,
      difficulty:     s.difficulty,
      bandScope:      s.bandScope,
      bandScopeNames: s.bandScope
        ? s.bandScope.split(',').filter(Boolean).map((id) => bandNameMap.get(id) ?? id).join(', ')
        : null,
      createdAt:      s.createdAt,
    })));
  } catch (e) { next(e); }
});

import { Router } from 'express';
import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';

export const lyricDuelRouter = Router();

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

const TOTAL_ROUNDS: Record<string, number> = {
  friendly: 3, normal: 3, ruthless: 5, legendary: 5,
};

const DIFFICULTY_NOTE: Record<string, string> = {
  friendly: 'Be generous with both sides — reward strong moments from both bands.',
  normal: 'Be fair and balanced in your scoring.',
  ruthless: 'Apply strict scrutiny. The rival is a seasoned champion — hold the challenger to a high standard.',
  legendary: 'The rival is a living legend. Apply legendary standards — minor flaws cost significant points.',
};

// ---------------------------------------------------------------------------
// GET /api/lyric-duel/bands — bands that have lyric-capable songs
// ---------------------------------------------------------------------------

lyricDuelRouter.get('/bands', async (_req, res, next): Promise<void> => {
  try {
    const bands = await prisma.band.findMany({
      where: {
        songs: { some: { isInstrumental: false, lyrics: { some: { isPrimary: true } } } },
      },
      select: { id: true, name: true, _count: { select: { songs: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(bands); return;
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/lyric-duel/start — AI generates theme + 10 rules + rival (if needed)
// ---------------------------------------------------------------------------

lyricDuelRouter.post('/start', async (req, res, next): Promise<void> => {
  try {
    const { playerBandId, rivalBandId: rawRivalId, mode, difficulty } = req.body as {
      playerBandId?: unknown; rivalBandId?: unknown; mode?: unknown; difficulty?: unknown;
    };

    if (typeof playerBandId !== 'string') { res.status(400).json({ error: 'playerBandId required' }); return; }
    const safeMode = typeof mode === 'string' ? mode : 'challenge';
    const safeDiff = typeof difficulty === 'string' && TOTAL_ROUNDS[difficulty] ? difficulty : 'normal';

    const playerBand = await prisma.band.findUnique({ where: { id: playerBandId }, select: { id: true, name: true } });
    if (!playerBand) { res.status(404).json({ error: 'Player band not found' }); return; }

    // Resolve rival band
    let rivalBandId = typeof rawRivalId === 'string' ? rawRivalId : null;
    if (!rivalBandId || safeMode === 'ai-showdown') {
      // Pick a random band with lyrics that isn't the player band
      const eligibleIds = await prisma.band.findMany({
        where: {
          id: { not: playerBandId },
          songs: { some: { isInstrumental: false, lyrics: { some: { isPrimary: true } } } },
        },
        select: { id: true },
      });
      if (eligibleIds.length === 0) { res.status(400).json({ error: 'Not enough bands with lyrics for a duel' }); return; }
      const pick = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
      if (!pick) { res.status(400).json({ error: 'Could not pick rival band' }); return; }
      rivalBandId = pick.id;
    }

    // AI showdown: also replace playerBand if mode is ai-showdown
    let finalPlayerBandId = playerBandId;
    let finalPlayerBand = playerBand;
    if (safeMode === 'ai-showdown') {
      const allEligible = await prisma.band.findMany({
        where: { songs: { some: { isInstrumental: false, lyrics: { some: { isPrimary: true } } } } },
        select: { id: true, name: true },
      });
      const candidatesForPlayer = allEligible.filter((b) => b.id !== rivalBandId);
      const playerPick = candidatesForPlayer[Math.floor(Math.random() * candidatesForPlayer.length)];
      if (playerPick) { finalPlayerBandId = playerPick.id; finalPlayerBand = playerPick; }
    }

    const rivalBand = await prisma.band.findUnique({ where: { id: rivalBandId }, select: { id: true, name: true } });
    if (!rivalBand) { res.status(404).json({ error: 'Rival band not found' }); return; }

    const totalRounds = TOTAL_ROUNDS[safeDiff] ?? 3;

    // AI: generate theme + 10 rules + intro
    const openai = getClient();
    const aiRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `You are the host of an epic lyric battle showdown.

CHALLENGER: ${finalPlayerBand.name}
RIVAL: ${rivalBand.name}
DIFFICULTY: ${safeDiff}

Generate a dramatic battle setup. Respond ONLY with valid JSON:
{
  "theme": "2-5 word battle theme (e.g. 'The Weight of Regret', 'Defiance and Fire')",
  "themeDescription": "One sentence explaining what this theme means in this battle context",
  "rules": [
    { "name": "short rule name", "description": "what it measures and how strong performance scores" }
  ],
  "introSpeech": "Dramatic 2-3 sentence announcer speech hyping the crowd for this specific matchup",
  "rivalPickReason": "One vivid sentence explaining why this rival stepped up to face the challenger"
}

The rules array must contain EXACTLY 10 items. Make them creative and specific to lyric battles.
Cover: thematic relevance, word rarity, emotional intensity, metaphor power, narrative coherence,
killer line impact, contextual fit, originality, rhythmic vocabulary complexity, and conceptual depth —
but rephrase them in dramatic language unique to this match.`,
      }],
    });

    const raw = aiRes.choices[0]?.message?.content ?? '{}';
    let aiData: {
      theme?: string; themeDescription?: string;
      rules?: { name: string; description: string }[];
      introSpeech?: string; rivalPickReason?: string;
    } = {};
    try { aiData = JSON.parse(raw) as typeof aiData; } catch { /* use defaults */ }

    res.json({
      playerBandId: finalPlayerBandId,
      playerBandName: finalPlayerBand.name,
      rivalBandId: rivalBand.id,
      rivalBandName: rivalBand.name,
      theme: aiData.theme ?? 'The Ultimate Showdown',
      themeDescription: aiData.themeDescription ?? 'Two bands face off in a battle of lyrical supremacy.',
      rules: Array.isArray(aiData.rules) && aiData.rules.length >= 5 ? aiData.rules : [
        { name: 'Thematic Relevance', description: 'How closely the lyrics align with the battle theme' },
        { name: 'Word Rarity', description: 'Unique and uncommon vocabulary that shows range' },
        { name: 'Emotional Intensity', description: 'Rawness and emotional power of the lyrics' },
        { name: 'Metaphor Power', description: 'Quality and originality of figurative language' },
        { name: 'Narrative Coherence', description: 'Story structure and internal logic of the lyrics' },
        { name: 'Killer Line', description: 'Impact of the single most powerful line' },
        { name: 'Contextual Fit', description: 'Whether the song truly belongs in this theme or is out of context' },
        { name: 'Originality', description: 'Freshness and distinctiveness of ideas' },
        { name: 'Rhythmic Complexity', description: 'Vocabulary variety and linguistic dexterity' },
        { name: 'Conceptual Depth', description: 'Abstract thinking and philosophical weight of the lyrics' },
      ],
      introSpeech: aiData.introSpeech ?? `Tonight, two legendary acts face off in the ultimate lyric showdown. ${finalPlayerBand.name} versus ${rivalBand.name}. Only one will walk away with their reputation intact.`,
      rivalPickReason: aiData.rivalPickReason ?? null,
      totalRounds,
      difficulty: safeDiff,
      mode: safeMode,
    }); return;
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/lyric-duel/round — AI scores one round
// ---------------------------------------------------------------------------

lyricDuelRouter.post('/round', async (req, res, next): Promise<void> => {
  try {
    const {
      playerBandId, rivalBandId, theme, themeDescription, rules,
      difficulty, roundIndex, usedPlayerSongIds, usedRivalSongIds,
      playerBandName, rivalBandName,
    } = req.body as {
      playerBandId?: unknown; rivalBandId?: unknown; theme?: unknown; themeDescription?: unknown;
      rules?: unknown; difficulty?: unknown; roundIndex?: unknown;
      usedPlayerSongIds?: unknown; usedRivalSongIds?: unknown;
      playerBandName?: unknown; rivalBandName?: unknown;
    };

    if (typeof playerBandId !== 'string' || typeof rivalBandId !== 'string') {
      res.status(400).json({ error: 'playerBandId and rivalBandId required' }); return;
    }

    const safeUsedPlayer = Array.isArray(usedPlayerSongIds)
      ? usedPlayerSongIds.filter((x): x is string => typeof x === 'string') : [];
    const safeUsedRival = Array.isArray(usedRivalSongIds)
      ? usedRivalSongIds.filter((x): x is string => typeof x === 'string') : [];
    const safeDiff = typeof difficulty === 'string' ? difficulty : 'normal';

    async function pickSong(bandId: string, excludeIds: string[]) {
      let songs = await prisma.song.findMany({
        where: {
          bandId, isInstrumental: false,
          ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
          lyrics: { some: { isPrimary: true } },
        },
        select: { id: true, title: true, lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 } },
        take: 80,
      });
      // If nothing left, allow reuse
      if (songs.length === 0) {
        songs = await prisma.song.findMany({
          where: { bandId, isInstrumental: false, lyrics: { some: { isPrimary: true } } },
          select: { id: true, title: true, lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 } },
          take: 80,
        });
      }
      if (songs.length === 0) return null;
      return songs[Math.floor(Math.random() * songs.length)] ?? null;
    }

    const [playerSong, rivalSong] = await Promise.all([
      pickSong(playerBandId, safeUsedPlayer),
      pickSong(rivalBandId, safeUsedRival),
    ]);

    if (!playerSong || !rivalSong) {
      res.status(400).json({ error: 'Not enough songs with lyrics for this round' }); return;
    }

    const playerText = (playerSong.lyrics[0]?.text ?? '').slice(0, 900);
    const rivalText = (rivalSong.lyrics[0]?.text ?? '').slice(0, 900);

    const rulesArr = Array.isArray(rules) ? rules as { name: string; description: string }[] : [];
    const rulesFormatted = rulesArr
      .slice(0, 10)
      .map((r, i) => `${i + 1}. ${r.name}: ${r.description}`)
      .join('\n');

    const openai = getClient();
    const aiRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.75,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `You are the judge of an epic lyric battle.

BATTLE THEME: "${typeof theme === 'string' ? theme : 'Ultimate Showdown'}"
${typeof themeDescription === 'string' ? themeDescription : ''}

BAND A — ${typeof playerBandName === 'string' ? playerBandName : 'Challenger'}
Song: "${playerSong.title}"
Lyrics:
${playerText}

BAND B — ${typeof rivalBandName === 'string' ? rivalBandName : 'Rival'}
Song: "${rivalSong.title}"
Lyrics:
${rivalText}

DIFFICULTY: ${safeDiff}
Judging note: ${DIFFICULTY_NOTE[safeDiff] ?? DIFFICULTY_NOTE['normal']}

Score BOTH bands on EACH of these 10 rules (0–10 points each):
${rulesFormatted}

Respond ONLY with valid JSON:
{
  "playerScore": <integer 0-100, exact sum of your 10 rule scores for Band A>,
  "rivalScore": <integer 0-100, exact sum of your 10 rule scores for Band B>,
  "breakdown": [
    { "ruleName": "...", "playerScore": 0-10, "rivalScore": 0-10, "note": "one vivid sentence comparing both" }
  ],
  "playerHighlight": "the single most powerful line from Band A's excerpt",
  "rivalHighlight": "the single most powerful line from Band B's excerpt",
  "commentary": "dramatic 2-3 sentence judge commentary for this round, declare a round winner by name"
}

The breakdown array must have exactly 10 items matching the 10 rules above.`,
      }],
    });

    const raw = aiRes.choices[0]?.message?.content ?? '{}';
    let scored: {
      playerScore?: number; rivalScore?: number;
      breakdown?: { ruleName: string; playerScore: number; rivalScore: number; note: string }[];
      playerHighlight?: string; rivalHighlight?: string; commentary?: string;
    } = {};
    try { scored = JSON.parse(raw) as typeof scored; } catch { /* use defaults */ }

    const ps = typeof scored.playerScore === 'number' ? scored.playerScore : 50;
    const rs = typeof scored.rivalScore === 'number' ? scored.rivalScore : 50;
    const roundWinner = ps > rs ? 'player' : rs > ps ? 'rival' : 'draw';

    res.json({
      playerSongId: playerSong.id,
      playerSongTitle: playerSong.title,
      playerLyricsExcerpt: playerText,
      rivalSongId: rivalSong.id,
      rivalSongTitle: rivalSong.title,
      rivalLyricsExcerpt: rivalText,
      playerScore: ps,
      rivalScore: rs,
      breakdown: Array.isArray(scored.breakdown) ? scored.breakdown : [],
      playerHighlight: scored.playerHighlight ?? '',
      rivalHighlight: scored.rivalHighlight ?? '',
      commentary: scored.commentary ?? 'The judge deliberates...',
      roundWinner,
    }); return;
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// POST /api/lyric-duel/scores — save match result (auth required)
// ---------------------------------------------------------------------------

lyricDuelRouter.post('/scores', requireAuth, async (req, res, next): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const {
      playerBandId, rivalBandId, playerName, rivalName,
      playerPoints, rivalPoints, playerWins, rivalWins,
      totalRounds, difficulty, mode, theme, won,
    } = req.body as Record<string, unknown>;

    if (typeof playerBandId !== 'string' || typeof rivalBandId !== 'string') {
      res.status(400).json({ error: 'Band IDs required' }); return;
    }
    if (typeof playerPoints !== 'number' || typeof rivalPoints !== 'number') {
      res.status(400).json({ error: 'Points required' }); return;
    }
    if (typeof won !== 'boolean') { res.status(400).json({ error: 'won required' }); return; }

    const saved = await prisma.lyricDuelScore.create({
      data: {
        userId,
        playerBandId,
        rivalBandId,
        playerName:   typeof playerName === 'string' ? playerName : 'Unknown',
        rivalName:    typeof rivalName === 'string' ? rivalName : 'Unknown',
        playerPoints: Math.floor(Math.max(0, Math.min(10000, playerPoints))),
        rivalPoints:  Math.floor(Math.max(0, Math.min(10000, rivalPoints))),
        playerWins:   typeof playerWins === 'number' ? Math.floor(playerWins) : 0,
        rivalWins:    typeof rivalWins === 'number' ? Math.floor(rivalWins) : 0,
        totalRounds:  typeof totalRounds === 'number' ? Math.floor(totalRounds) : 3,
        difficulty:   typeof difficulty === 'string' ? difficulty : 'normal',
        mode:         typeof mode === 'string' ? mode : 'challenge',
        theme:        typeof theme === 'string' ? theme : 'The Ultimate Showdown',
        won,
      },
    });

    const rank = await prisma.lyricDuelScore.count({
      where: { difficulty: saved.difficulty, won: true, playerPoints: { gt: saved.playerPoints } },
    });

    res.status(201).json({ ok: true, rank: rank + 1 }); return;
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GET /api/lyric-duel/scores — leaderboard
// ---------------------------------------------------------------------------

lyricDuelRouter.get('/scores', async (req, res, next): Promise<void> => {
  try {
    const difficulty = typeof req.query['difficulty'] === 'string' ? req.query['difficulty'] : 'normal';
    const limit = Math.min(50, parseInt(
      typeof req.query['limit'] === 'string' ? req.query['limit'] : '15', 10,
    ) || 15);

    const scores = await prisma.lyricDuelScore.findMany({
      where: { difficulty, won: true },
      orderBy: { playerPoints: 'desc' },
      take: limit,
      select: {
        id: true, playerName: true, rivalName: true, playerPoints: true, rivalPoints: true,
        playerWins: true, rivalWins: true, totalRounds: true,
        theme: true, difficulty: true, mode: true, createdAt: true,
        user: { select: { name: true, username: true, avatarUrl: true } },
      },
    });

    res.json(scores.map((s, i) => ({
      rank: i + 1,
      playerDisplayName: s.user?.username ?? s.user?.name ?? 'Anonymous',
      avatarUrl: s.user?.avatarUrl ?? null,
      playerName: s.playerName,
      rivalName: s.rivalName,
      playerPoints: s.playerPoints,
      rivalPoints: s.rivalPoints,
      playerWins: s.playerWins,
      rivalWins: s.rivalWins,
      totalRounds: s.totalRounds,
      theme: s.theme,
      difficulty: s.difficulty,
      mode: s.mode,
      createdAt: s.createdAt,
    }))); return;
  } catch (e) { next(e); }
});

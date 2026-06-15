import { Router } from 'express';
import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { AlbumType } from '@prisma/client';

export const lyricDuelRouter = Router();

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

const TOTAL_ROUNDS: Record<string, number> = {
  friendly: 3, normal: 3, ruthless: 5, legendary: 5,
};

const RULES_PER_DIFFICULTY: Record<string, number> = {
  friendly: 3, normal: 6, ruthless: 9, legendary: 10,
};

const DIFFICULTY_NOTE: Record<string, string> = {
  friendly: 'Be generous with both sides — reward strong moments from both bands.',
  normal: 'Be fair and balanced in your scoring.',
  ruthless: 'Apply strict scrutiny. The rival is a seasoned champion — hold the challenger to a high standard.',
  legendary: 'The rival is a living legend. Apply legendary standards — minor flaws cost significant points.',
};

// ---------------------------------------------------------------------------
// Curated rule pool — 10 random rules drawn per match so players learn them
// ---------------------------------------------------------------------------

export interface PoolRule {
  id: string;
  name: string;
  shortDesc: string;    // caveman-style: short, punchy, immediately understandable
  description: string;  // full explanation shown on demand
}

export const RULE_POOL: PoolRule[] = [
  {
    id: 'theme-lock',
    name: 'Theme Lock',
    shortDesc: 'Lyric hits theme? Big points.',
    description: 'Directly addressing the battle theme scores highest. Tangential or unrelated lyrics lose ground fast.',
  },
  {
    id: 'rare-words',
    name: 'Rare Words',
    shortDesc: 'Weird words = smart words.',
    description: 'Uncommon, precise vocabulary shows range and intelligence. Generic filler words score low.',
  },
  {
    id: 'raw-feeling',
    name: 'Raw Feeling',
    shortDesc: 'If it hurts, it scores.',
    description: 'Emotional intensity — does this lyric make you feel something visceral? Detached or clinical lyrics lose points.',
  },
  {
    id: 'killer-line',
    name: 'Killer Line',
    shortDesc: 'One line to rule all.',
    description: 'The single most devastating line in the excerpt. If one line could stand alone as a quote, it wins big here.',
  },
  {
    id: 'story-flow',
    name: 'Story Flow',
    shortDesc: 'Does it go somewhere?',
    description: 'Narrative arc — setup, tension, resolution. Lyrics that wander without purpose score low.',
  },
  {
    id: 'metaphor-game',
    name: 'Metaphor Game',
    shortDesc: 'Say it weird. Mean it deep.',
    description: 'Quality of figurative language — similes, metaphors, symbolism. Tired clichés score nothing.',
  },
  {
    id: 'word-economy',
    name: 'Word Economy',
    shortDesc: 'Short but loud.',
    description: 'More meaning with fewer words wins. Filler lines and padding cost points — every word must earn its place.',
  },
  {
    id: 'authenticity',
    name: 'Authenticity',
    shortDesc: 'Sounds real, not written.',
    description: 'Does this feel lived-in and genuine, or polished and hollow? Listeners can smell performance from a mile away.',
  },
  {
    id: 'image-power',
    name: 'Image Power',
    shortDesc: 'Paint picture in head.',
    description: 'Vivid visual imagery that places a scene in the listener\'s mind. Abstract vagueness without images scores low.',
  },
  {
    id: 'rhythm-brain',
    name: 'Rhythm Brain',
    shortDesc: 'Words flow like water.',
    description: 'Vocabulary variety and rhythmic complexity — the musical quality of the word choices themselves.',
  },
  {
    id: 'concept-depth',
    name: 'Concept Depth',
    shortDesc: 'Big idea, small words.',
    description: 'Philosophical or abstract thinking packed efficiently into lyrical form. Surface-level observations score low.',
  },
  {
    id: 'context-fit',
    name: 'Context Fit',
    shortDesc: 'Song born for this?',
    description: 'Was this song actually written about something relevant to the theme, or does it feel shoehorned in? Bad fit = points lost.',
  },
  {
    id: 'originality',
    name: 'Originality',
    shortDesc: 'Nobody said it this way.',
    description: 'How fresh and distinctive is the expression? Recognizable clichés and borrowed phrases lose significant points.',
  },
  {
    id: 'crowd-line',
    name: 'Crowd Line',
    shortDesc: 'Whole crowd sings it.',
    description: 'Memorability — is there a hook or phrase here that sticks immediately? A strong crowd line is worth extra.',
  },
  {
    id: 'vulnerability',
    name: 'Vulnerability',
    shortDesc: 'Shows the wound.',
    description: 'Openness and emotional honesty. Hiding behind irony or cleverness when the theme demands sincerity loses points.',
  },
  {
    id: 'density',
    name: 'Density',
    shortDesc: 'Pack more meaning per word.',
    description: 'How much meaning is compressed per line? Dense, layered lyrics beat sparse, padded ones.',
  },
  {
    id: 'signature-sound',
    name: 'Signature Sound',
    shortDesc: 'Sound like nobody else.',
    description: 'Does this lyric sound like only THIS artist could have written it? Interchangeable lyrics score low.',
  },
  {
    id: 'aggression',
    name: 'Aggression',
    shortDesc: 'Who hits harder?',
    description: 'Assertiveness, attack energy, and lyrical dominance. Which side comes out swinging hardest?',
  },
  {
    id: 'profundity',
    name: 'Profundity',
    shortDesc: 'Says something true.',
    description: 'Does this contain a universal truth or insight that resonates beyond the song? Cheap observations score nothing.',
  },
  {
    id: 'subversion',
    name: 'Subversion',
    shortDesc: 'Flip the expected.',
    description: 'Taking a familiar idea and turning it completely upside down. The most rewarding surprise gets the most points.',
  },
  {
    id: 'specificity',
    name: 'Specificity',
    shortDesc: 'Real details win.',
    description: 'Concrete, specific details beat vague generalities. "A faded blue Chevy" beats "an old car" every time.',
  },
  {
    id: 'time-capsule',
    name: 'Time Capsule',
    shortDesc: 'Still hits in 50 years.',
    description: 'Does this lyric feel timeless, or does it feel dated to a specific trend or era? Timeless scores highest.',
  },
  {
    id: 'internal-logic',
    name: 'Internal Logic',
    shortDesc: 'Makes sense on own terms.',
    description: 'Even if surreal or abstract, the lyric must be coherent within its own world. Random confusion scores zero.',
  },
  {
    id: 'urgency',
    name: 'Urgency',
    shortDesc: 'Says: this matters NOW.',
    description: 'Does the lyric feel urgent and immediate, like it cannot wait to be said? Passive or detached writing loses.',
  },
  {
    id: 'wordplay',
    name: 'Wordplay',
    shortDesc: 'Double meaning? Yes please.',
    description: 'Clever wordplay, double entendres, or linguistic wit that rewards attention. Surface-only lyrics score low.',
  },
  {
    id: 'defiance',
    name: 'Defiance',
    shortDesc: 'Refuses to bow.',
    description: 'Resistance, refusal, and refusal to accept defeat or convention. If the theme calls for defiance, show it.',
  },
  {
    id: 'hunger',
    name: 'Hunger',
    shortDesc: 'Wants something badly.',
    description: 'Desire and longing as a driving force — ache and yearning score high when they feel unresolvable.',
  },
  {
    id: 'battle-cry',
    name: 'Battle Cry',
    shortDesc: 'Makes you want to fight.',
    description: 'Anthemic, rallying quality — words that make you want to stand up. Quiet resignation scores low here.',
  },
  {
    id: 'restraint',
    name: 'Restraint',
    shortDesc: 'Calm contains the storm.',
    description: 'Understatement and restraint used to maximum effect. Sometimes saying less hits harder than screaming.',
  },
  {
    id: 'final-word',
    name: 'Final Word',
    shortDesc: 'Last line hits hardest.',
    description: 'Does the excerpt end on its strongest note? Endings matter most — a weak landing loses major points.',
  },
  {
    id: 'contradiction',
    name: 'Contradiction',
    shortDesc: 'Holds two truths at once.',
    description: 'Paradox used to reveal deeper truth. Holding contradictory feelings simultaneously shows lyrical maturity.',
  },
  {
    id: 'aftermath',
    name: 'Aftermath',
    shortDesc: 'Deals with what\'s left.',
    description: 'The lyric captures the state after the event — grief, silence, consequence. Aftermath is often more powerful than the event itself.',
  },
  {
    id: 'tension-arc',
    name: 'Tension Arc',
    shortDesc: 'Gets worse before better.',
    description: 'Building and releasing tension within the lyric structure. Flat emotional delivery loses to a well-constructed arc.',
  },
  {
    id: 'mythology',
    name: 'Mythology',
    shortDesc: 'References big things.',
    description: 'Use of archetypal, mythological, or historical concepts that elevate the lyrical weight beyond the personal.',
  },
  {
    id: 'sonic-weight',
    name: 'Sonic Weight',
    shortDesc: 'Heavy sounds heavy.',
    description: 'Hard consonants, density, and sonic texture in the actual word choices — the feel of the words in the mouth.',
  },
  {
    id: 'dark-energy',
    name: 'Dark Energy',
    shortDesc: 'Darkness = power here.',
    description: 'For dark or painful themes: embracing pain, anger, or dread rather than softening it scores highest.',
  },
  {
    id: 'resolution',
    name: 'Resolution',
    shortDesc: 'Does it land?',
    description: 'Does the lyric reach a satisfying conclusion, or does it trail off without payoff? Unresolved lyrics lose points.',
  },
  {
    id: 'rebellion',
    name: 'Rebellion',
    shortDesc: 'Break the rules. Win.',
    description: 'Counter-culture attitude and anti-establishment energy in the words. Safe, obedient lyrics score low.',
  },
  {
    id: 'melancholy',
    name: 'Melancholy',
    shortDesc: 'Beauty found in sadness.',
    description: 'Poetic sadness that transforms pain into art. Wallowing without beauty scores low; transformation scores high.',
  },
  {
    id: 'lyricism',
    name: 'Pure Lyricism',
    shortDesc: 'Poetry for its own sake.',
    description: 'Pure lyrical beauty divorced from meaning — the sound and rhythm of the words alone, as pure poetry.',
  },
];

// ---------------------------------------------------------------------------
// Lyric text cleaner — removes structural markers and annotation noise
// ---------------------------------------------------------------------------

function cleanLyricText(raw: string): string {
  // Strip a leading structural tag like [Chorus] or [Verse 1] from the start of a line.
  // Using non-greedy so nested/mismatched brackets don't swallow real content.
  const LEADING_TAG  = /^\[.*?\]\s*/;
  // Multiplier annotations: (x2), (x3), (3x), (×2), etc.
  const PAREN_MULTI  = /\(\s*[x×]\s*\d+\s*\)|\(\s*\d+\s*[x×]\s*\)/gi;
  // Explicit repeat annotations
  const PAREN_REPEAT = /\(\s*repeat(?:s)?\s*\)/gi;

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(LEADING_TAG, '')   // strip [Tag] / [Tag x2] from line start
        .replace(PAREN_MULTI, '')   // strip (x2), (3x), (×4), etc.
        .replace(PAREN_REPEAT, '')  // strip (repeat), (repeats)
        .trim(),
    )
    .filter((line) => line.length > 0) // drop lines that became empty after stripping
    .join('\n');
}

function pickRules(count = 10): PoolRule[] {
  const shuffled = [...RULE_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

const VALID_ALBUM_TYPES = new Set<string>([
  'studio', 'ep', 'live', 'compilation', 'bootleg',
  'single', 'demo', 'lp', 'remix', 'mixtape',
  'boxset', 'soundtrack', 'acoustic', 'instrumental',
]);

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
// POST /api/lyric-duel/start — AI generates theme + selects rules from pool
// ---------------------------------------------------------------------------

lyricDuelRouter.post('/start', async (req, res, next): Promise<void> => {
  try {
    const { playerBandId, rivalBandId: rawRivalId, mode, difficulty, ruleCount: rawRuleCount } = req.body as {
      playerBandId?: unknown; rivalBandId?: unknown; mode?: unknown; difficulty?: unknown; ruleCount?: unknown;
    };

    if (typeof playerBandId !== 'string') { res.status(400).json({ error: 'playerBandId required' }); return; }
    const safeMode = typeof mode === 'string' ? mode : 'challenge';
    const safeDiff = typeof difficulty === 'string' && TOTAL_ROUNDS[difficulty] ? difficulty : 'normal';

    const playerBand = await prisma.band.findUnique({ where: { id: playerBandId }, select: { id: true, name: true } });
    if (!playerBand) { res.status(404).json({ error: 'Player band not found' }); return; }

    // Resolve rival band
    let rivalBandId = typeof rawRivalId === 'string' ? rawRivalId : null;
    if (!rivalBandId || safeMode === 'ai-showdown') {
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

    // AI showdown: also pick a random player band
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

    // Rule count: client may override the difficulty default (must be one of 3/6/9/10)
    const defaultRuleCount = RULES_PER_DIFFICULTY[safeDiff] ?? 6;
    const VALID_RULE_COUNTS = new Set([3, 6, 9, 10]);
    const safeRuleCount = typeof rawRuleCount === 'number' && VALID_RULE_COUNTS.has(rawRuleCount)
      ? rawRuleCount
      : defaultRuleCount;

    const selectedRules = pickRules(safeRuleCount);

    // AI: generate theme + intro speech only (rules come from the pool)
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
  "introSpeech": "Dramatic 2-3 sentence announcer speech hyping the crowd for this specific matchup",
  "rivalPickReason": "One vivid sentence explaining why this rival stepped up to face the challenger"
}`,
      }],
    });

    const raw = aiRes.choices[0]?.message?.content ?? '{}';
    let aiData: {
      theme?: string; themeDescription?: string;
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
      rules: selectedRules,
      introSpeech: aiData.introSpeech ?? `Tonight, two legendary acts face off in the ultimate lyric showdown. ${finalPlayerBand.name} versus ${rivalBand.name}. Only one walks away.`,
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
      playerBandName, rivalBandName, albumTypes,
    } = req.body as {
      playerBandId?: unknown; rivalBandId?: unknown; theme?: unknown; themeDescription?: unknown;
      rules?: unknown; difficulty?: unknown; roundIndex?: unknown;
      usedPlayerSongIds?: unknown; usedRivalSongIds?: unknown;
      playerBandName?: unknown; rivalBandName?: unknown; albumTypes?: unknown;
    };

    if (typeof playerBandId !== 'string' || typeof rivalBandId !== 'string') {
      res.status(400).json({ error: 'playerBandId and rivalBandId required' }); return;
    }

    const safeUsedPlayer = Array.isArray(usedPlayerSongIds)
      ? usedPlayerSongIds.filter((x): x is string => typeof x === 'string') : [];
    const safeUsedRival = Array.isArray(usedRivalSongIds)
      ? usedRivalSongIds.filter((x): x is string => typeof x === 'string') : [];
    const safeDiff = typeof difficulty === 'string' ? difficulty : 'normal';

    // Validate and normalize album types filter
    const safeAlbumTypes: AlbumType[] = Array.isArray(albumTypes)
      ? albumTypes.filter((x): x is string => typeof x === 'string')
          .filter((x) => VALID_ALBUM_TYPES.has(x as AlbumType))
          .map((x) => x as AlbumType)
      : [];

    // Album type filter: if types specified, only songs whose album matches
    // (songs with no album are included when filtering is active)
    const albumTypeFilter = safeAlbumTypes.length > 0
      ? { OR: [
          { albumId: null },
          { album: { albumType: { in: safeAlbumTypes } } },
        ] }
      : {};

    async function pickSong(bandId: string, excludeIds: string[]) {
      const baseWhere = {
        bandId,
        isInstrumental: false,
        lyrics: { some: { isPrimary: true } },
        ...albumTypeFilter,
      };
      let songs = await prisma.song.findMany({
        where: { ...baseWhere, ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}) },
        select: { id: true, title: true, lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 } },
        take: 80,
      });
      // Allow reuse if all songs exhausted
      if (songs.length === 0) {
        songs = await prisma.song.findMany({
          where: baseWhere,
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
      res.status(400).json({ error: 'Not enough songs with lyrics for this round. Try adding more song types in filters.' }); return;
    }

    const playerText = cleanLyricText(playerSong.lyrics[0]?.text ?? '').slice(0, 900);
    const rivalText  = cleanLyricText(rivalSong.lyrics[0]?.text ?? '').slice(0, 900);

    const rulesArr = Array.isArray(rules) ? rules as { name: string; description: string }[] : [];
    const rulesFormatted = rulesArr
      .map((r, i) => `${i + 1}. ${r.name}: ${r.description}`)
      .join('\n');
    const ruleN = rulesArr.length;

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

Score BOTH bands on EACH of these ${ruleN} rules (0–10 points each):
${rulesFormatted}

Respond ONLY with valid JSON:
{
  "playerScore": <integer 0-${ruleN * 10}, exact sum of your ${ruleN} rule scores for Band A>,
  "rivalScore": <integer 0-${ruleN * 10}, exact sum of your ${ruleN} rule scores for Band B>,
  "breakdown": [
    { "ruleName": "...", "playerScore": 0-10, "rivalScore": 0-10, "note": "one vivid sentence comparing both" }
  ],
  "playerHighlight": "the single most powerful line from Band A's excerpt",
  "rivalHighlight": "the single most powerful line from Band B's excerpt",
  "commentary": "dramatic 2-3 sentence judge commentary for this round, declare a round winner by name"
}

The breakdown array must have exactly ${ruleN} items matching the ${ruleN} rules above in order.`,
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
      roundIndex: typeof roundIndex === 'number' ? roundIndex : 0,
    }); return;
  } catch (e) { console.error('[lyric-duel/round] error:', e); next(e); }
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

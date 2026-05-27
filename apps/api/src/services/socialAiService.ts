import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Platform + post type metadata
// ---------------------------------------------------------------------------

const PLATFORM_NOTES: Record<string, string> = {
  facebook: 'Facebook groups/pages: conversational, discussion-sparking, question-driven. Encourage comments and debate. 2-4 paragraphs OK. No hashtags or max 3.',
  instagram: 'Instagram: strong visual hook in first line, punchy caption 1-3 sentences, heavy hashtags (15-25). Emojis used sparingly.',
  threads: 'Threads: conversational, hot-take energy, feels like a genuine thought. Short paragraphs. Optional thread format. 3-7 hashtags.',
  tiktok: 'TikTok caption: hook in first 3 words, under 150 chars for caption, strong CTA. Separate: full overlay script text 30-60 words.',
  reddit: 'Reddit: analytical, cite the actual data/scores, invite discussion. No hype. Feels like a post from someone who genuinely loves the music. Title + body.',
};

const POST_TYPE_NOTES: Record<string, string> = {
  radar_analysis: 'Explain what the radar scores reveal about the song — make the data visceral and emotionally meaningful.',
  emotional: 'Focus on the emotional landscape — how the song makes you feel, what emotional states it maps to.',
  philosophy: 'Philosophical angle — what ideas, consciousness states, or existential themes the song explores.',
  poll: 'Create an engaging poll with 2-4 options. The options should be interesting, not obvious.',
  entry_point: '"Best entry point for [genre] fans" — why this song is perfect for people who haven\'t heard this artist.',
  compare: 'Compare this song\'s character to another song or artist the target audience knows.',
  meme: 'Observational, slightly irreverent, self-aware. Feels like something a music nerd would actually post.',
  discussion: 'Open-ended discussion starter — a question or observation that has no obvious answer.',
};

const TONE_NOTES: Record<string, string> = {
  cinematic: 'Cinematic, atmospheric, evocative. Feels like a film score review or poetry.',
  analytical: 'Precise and data-driven, but emotionally grounded. Like a music scientist who also has feelings.',
  conversational: 'Natural, like something a thoughtful friend would say. Never performative.',
  provocative: 'Bold opinion, slight edge. Designed to make people think "wait... actually." Not inflammatory, just confident.',
};

const POST_SIZE_NOTES: Record<string, string> = {
  single_line: 'HOOK ONLY — 1 to 2 sentences, under 30 words total. Every word must earn its place. No preamble, no padding.',
  short:       'SHORT CAPTION — 3 to 5 sentences, under 80 words. Strong opening, one clear idea, clean ending.',
  paragraph:   'PARAGRAPH — one dense, well-constructed paragraph, 80 to 150 words. Enough room to develop one idea properly.',
  essay:       'LONG FORM — 2 to 3 paragraphs, 200 to 350 words. Build the idea, develop it, resolve it. A proper piece of writing.',
};

const BSM_SYSTEM_PROMPT = `You are the social media content strategist for Band Spectrum Mapper — a music psychology and analysis platform.

ABOUT BAND SPECTRUM MAPPER:
It maps songs along six psychological axes: Aggression, Complexity, Atmosphere, Emotion, Psychedelic depth, and Conceptual depth (each scored 0-10). It also maps genre appeal (how the song lands for metal, rock, pop, hip-hop, electronic, and folk audiences) and analyses philosophical/psychological themes. The platform is positioning music as emotional data — a psychological map of sound.

VOICE:
- Intelligent, cinematically aware, emotionally resonant
- Music as psychology, not entertainment journalism
- Discussion-driven, observation-based
- Never sounds like AI spam or generic music praise

FORBIDDEN:
- Clichés ("sonic journey", "musical tapestry", "hauntingly beautiful", "slaps", "banger")
- Generic superlatives ("incredible", "amazing", "stunning")
- Corporate or influencer language
- Hashtags that are clearly just stuffing (#music #song #vibes)
- Anything that sounds machine-generated or insincere

RULES:
- Make the data visceral — a "complexity: 8.7" should translate to something you feel, not just read
- Focus on what is SPECIFIC and SURPRISING about this song
- What would make a real person stop scrolling and comment?
- The best posts create a feeling of recognition: "yes, exactly that"`;

// ---------------------------------------------------------------------------
// Social post generation
// ---------------------------------------------------------------------------

interface SocialPostInput {
  platform: string;
  postType: string;
  tone: string;
  postSize: string;
  variants: number;
  // Exactly one of these identifies the subject:
  songId?: string;
  albumId?: string;
  bandId?: string;
}

interface PostVariant {
  body: string;
  hashtags: string[];
  cta: string;
  pollOptions?: string[];
}

// ---------------------------------------------------------------------------
// Context builders — one per subject level
// ---------------------------------------------------------------------------

type AxesRow = {
  aggression: number | string; complexity: number | string; atmosphere: number | string;
  emotion: number | string; psychedelic: number | string; concept: number | string;
};

function avgAxes(rows: AxesRow[]): string {
  if (!rows.length) return '';
  const keys = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
  const avgs = keys.map((k) => {
    const vals = rows.map((r) => +r[k]).filter((v) => !isNaN(v));
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    return `${k} ${avg.toFixed(1)}`;
  });
  return `Average spectrum: ${avgs.join(', ')}`;
}

async function buildSongSubject(songId: string): Promise<{ subject: string; contextText: string }> {
  const [song, aiSpectrum, aiGenre, aiAnalysis, themes, context] = await Promise.all([
    prisma.song.findUnique({ where: { id: songId }, include: { band: true, album: true, score: true } }),
    prisma.songAiSpectrum.findUnique({ where: { songId } }),
    prisma.songAiGenreSpectrum.findUnique({ where: { songId } }),
    prisma.songAiAnalysis.findUnique({ where: { songId } }),
    prisma.songThemeScore.findMany({ where: { songId }, orderBy: { score: 'desc' }, take: 5 }),
    prisma.songContextAnalysis.findUnique({ where: { songId } }),
  ]);
  if (!song) throw new HttpError(404, 'Song not found');

  const scoreBlock = song.score
    ? `Core scores: aggression ${song.score.aggression}/10, complexity ${song.score.complexity}/10, atmosphere ${song.score.atmosphere}/10, emotion ${song.score.emotion}/10, psychedelic ${song.score.psychedelic}/10, concept ${song.score.concept}/10`
    : 'No core scores yet';
  const aiBlock = aiSpectrum
    ? `AI scores: aggression ${(+aiSpectrum.aggression).toFixed(1)}, complexity ${(+aiSpectrum.complexity).toFixed(1)}, atmosphere ${(+aiSpectrum.atmosphere).toFixed(1)}, emotion ${(+aiSpectrum.emotion).toFixed(1)}, psychedelic ${(+aiSpectrum.psychedelic).toFixed(1)}, concept ${(+aiSpectrum.concept).toFixed(1)}`
    : '';
  const genreBlock = aiGenre
    ? `Genre appeal: metal ${(+aiGenre.metal).toFixed(1)}, rock ${(+aiGenre.rock).toFixed(1)}, pop ${(+aiGenre.pop).toFixed(1)}, hiphop ${(+aiGenre.hiphop).toFixed(1)}, electronic ${(+aiGenre.electronic).toFixed(1)}, folk ${(+aiGenre.folk).toFixed(1)}`
    : '';
  const themesBlock = themes.length > 0
    ? `Top themes: ${themes.map((t) => `${t.themeSlug} (${(t.score * 10).toFixed(1)}/10)${t.evidence ? ` — "${t.evidence}"` : ''}`).join('; ')}`
    : '';
  const analysisBlock = context?.overallNarrative
    ? `Overall analysis: ${context.overallNarrative.slice(0, 400)}`
    : aiAnalysis
    ? `AI analysis: ${aiAnalysis.emotionalRegister}. Themes: ${Array.isArray(aiAnalysis.themes) ? (aiAnalysis.themes as string[]).join(', ') : ''}`
    : '';

  return {
    subject: `Song: "${song.title}" by ${song.band.name}${song.album ? ` (from ${song.album.title}, ${song.album.year ?? ''})` : ''}`,
    contextText: [scoreBlock, aiBlock, genreBlock, themesBlock, analysisBlock].filter(Boolean).join('\n'),
  };
}

async function buildAlbumSubject(albumId: string): Promise<{ subject: string; contextText: string }> {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      band: true,
      songs: {
        include: { score: true, aiSpectrum: true, aiGenreSpectrum: true,
          themeScores: { orderBy: { score: 'desc' }, take: 3 } },
        orderBy: { trackNumber: 'asc' },
      },
    },
  });
  if (!album) throw new HttpError(404, 'Album not found');

  const songList = album.songs.map((s) => s.title).join(', ');
  const coreRows = album.songs.map((s) => s.score).filter(Boolean) as AxesRow[];
  const aiRows   = album.songs.map((s) => s.aiSpectrum).filter(Boolean) as AxesRow[];
  const genreRows = album.songs.map((s) => s.aiGenreSpectrum).filter(Boolean);

  const genreAvg = genreRows.length
    ? `Average genre appeal: metal ${(genreRows.reduce((s, r) => s + +r!.metal, 0) / genreRows.length).toFixed(1)}, rock ${(genreRows.reduce((s, r) => s + +r!.rock, 0) / genreRows.length).toFixed(1)}, pop ${(genreRows.reduce((s, r) => s + +r!.pop, 0) / genreRows.length).toFixed(1)}, hiphop ${(genreRows.reduce((s, r) => s + +r!.hiphop, 0) / genreRows.length).toFixed(1)}, electronic ${(genreRows.reduce((s, r) => s + +r!.electronic, 0) / genreRows.length).toFixed(1)}, folk ${(genreRows.reduce((s, r) => s + +r!.folk, 0) / genreRows.length).toFixed(1)}`
    : '';

  const topThemes = new Map<string, number>();
  for (const s of album.songs) {
    for (const t of s.themeScores) {
      topThemes.set(t.themeSlug, Math.max(topThemes.get(t.themeSlug) ?? 0, t.score));
    }
  }
  const themesBlock = topThemes.size > 0
    ? `Recurring themes: ${[...topThemes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([slug]) => slug).join(', ')}`
    : '';

  return {
    subject: `Album: "${album.title}" by ${album.band.name}${album.year ? ` (${album.year})` : ''}`,
    contextText: [
      `Track list: ${songList}`,
      coreRows.length ? avgAxes(coreRows) + ' (Core, 0-10)' : '',
      aiRows.length   ? avgAxes(aiRows)   + ' (AI, 0-10)'   : '',
      genreAvg,
      themesBlock,
    ].filter(Boolean).join('\n'),
  };
}

async function buildBandSubject(bandId: string): Promise<{ subject: string; contextText: string }> {
  const band = await prisma.band.findUnique({
    where: { id: bandId },
    include: { albums: { orderBy: { year: 'asc' } } },
  });
  if (!band) throw new HttpError(404, 'Band not found');

  const songs = await prisma.song.findMany({
    where: { bandId },
    include: { score: true, aiSpectrum: true, aiGenreSpectrum: true,
      themeScores: { orderBy: { score: 'desc' }, take: 3 } },
  });

  const albumList = band.albums.map((a) => `${a.title}${a.year ? ` (${a.year})` : ''}`).join(', ');
  const coreRows  = songs.map((s) => s.score).filter(Boolean) as AxesRow[];
  const aiRows    = songs.map((s) => s.aiSpectrum).filter(Boolean) as AxesRow[];
  const genreRows = songs.map((s) => s.aiGenreSpectrum).filter(Boolean);

  const genreAvg = genreRows.length
    ? `Average genre appeal: metal ${(genreRows.reduce((s, r) => s + +r!.metal, 0) / genreRows.length).toFixed(1)}, rock ${(genreRows.reduce((s, r) => s + +r!.rock, 0) / genreRows.length).toFixed(1)}, pop ${(genreRows.reduce((s, r) => s + +r!.pop, 0) / genreRows.length).toFixed(1)}, hiphop ${(genreRows.reduce((s, r) => s + +r!.hiphop, 0) / genreRows.length).toFixed(1)}, electronic ${(genreRows.reduce((s, r) => s + +r!.electronic, 0) / genreRows.length).toFixed(1)}, folk ${(genreRows.reduce((s, r) => s + +r!.folk, 0) / genreRows.length).toFixed(1)}`
    : '';

  // Find standout songs per axis
  type AxisKey = 'aggression' | 'complexity' | 'atmosphere' | 'emotion' | 'psychedelic' | 'concept';
  const axisKeys: AxisKey[] = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'];
  const standouts = axisKeys.map((k) => {
    const top = songs.filter((s) => s.score).sort((a, b) => +(b.score![k]) - +(a.score![k]))[0];
    return top ? `highest ${k}: "${top.title}" (${top.score![k]}/10)` : null;
  }).filter(Boolean);

  const topThemes = new Map<string, number>();
  for (const s of songs) {
    for (const t of s.themeScores) {
      topThemes.set(t.themeSlug, Math.max(topThemes.get(t.themeSlug) ?? 0, t.score));
    }
  }
  const themesBlock = topThemes.size > 0
    ? `Recurring themes: ${[...topThemes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([slug]) => slug).join(', ')}`
    : '';

  return {
    subject: `Artist: ${band.name}`,
    contextText: [
      `Discography (${band.albums.length} albums, ${songs.length} songs): ${albumList}`,
      coreRows.length ? avgAxes(coreRows) + ' across all songs (Core)' : '',
      aiRows.length   ? avgAxes(aiRows)   + ' across all songs (AI)'   : '',
      genreAvg,
      standouts.length ? `Standout tracks — ${standouts.join(' · ')}` : '',
      themesBlock,
    ].filter(Boolean).join('\n'),
  };
}

export async function generateSocialPost(input: SocialPostInput): Promise<PostVariant[]> {
  const client = getClient();

  let subject: string;
  let contextText: string;

  if (input.songId) {
    ({ subject, contextText } = await buildSongSubject(input.songId));
  } else if (input.albumId) {
    ({ subject, contextText } = await buildAlbumSubject(input.albumId));
  } else if (input.bandId) {
    ({ subject, contextText } = await buildBandSubject(input.bandId));
  } else {
    throw new HttpError(400, 'One of songId, albumId, or bandId is required');
  }

  const userPrompt = `${subject}

ANALYTICAL DATA:
${contextText}

TASK:
Generate ${input.variants} ${input.variants > 1 ? 'distinct variants' : 'post'} for ${input.platform.toUpperCase()}.

Platform context: ${PLATFORM_NOTES[input.platform] ?? input.platform}
Post type: ${POST_TYPE_NOTES[input.postType] ?? input.postType}
Tone: ${TONE_NOTES[input.tone] ?? input.tone}
Length: ${POST_SIZE_NOTES[input.postSize] ?? POST_SIZE_NOTES['paragraph']}

Return a JSON array with ${input.variants} objects. Each object must have:
- "body": the main post text
- "hashtags": array of relevant hashtags (platform-appropriate quantity)
- "cta": a call-to-action line (can be empty string if not appropriate for platform)
- "pollOptions": array of 2-4 poll options (only if postType is "poll", otherwise omit or empty array)

Return ONLY valid JSON. No markdown, no explanation.`;

  const maxTokensBySize: Record<string, number> = {
    single_line: 800,
    short: 1500,
    paragraph: 2500,
    essay: 5000,
  };
  const maxTokens = (maxTokensBySize[input.postSize] ?? 2500) * Math.max(1, input.variants);

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: BSM_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: Math.min(maxTokens, 8000),
    temperature: 0.85,
  });

  const raw = response.choices[0]?.message.content ?? '[]';
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');

  try {
    const parsed = JSON.parse(cleaned) as PostVariant[];
    return Array.isArray(parsed) ? parsed : [parsed as PostVariant];
  } catch {
    throw new HttpError(502, 'AI returned invalid JSON for social post');
  }
}

// ---------------------------------------------------------------------------
// Conversational AI strategist
// ---------------------------------------------------------------------------

const CHAT_SYSTEM_PROMPT = `${BSM_SYSTEM_PROMPT}

YOUR ROLE IN THIS CONVERSATION:
You are a creative collaborator helping craft and refine social content for Band Spectrum Mapper.

You can:
- Generate post drafts (Facebook, Instagram, Threads, Reddit, TikTok)
- Critique and improve existing drafts
- Suggest alternative angles, tones, or formats
- Create polls, carousel text, discussion starters
- Adapt content between platforms
- Explain WHY something works or doesn't

CONVERSATION STYLE:
- Direct and efficient — give the content, not an essay about it
- When generating posts, just write them — no preamble
- When critiquing, be specific about what to change and why
- Ask for clarification only when genuinely needed
- You have aesthetic opinions — share them if something is genuinely weak

If song data is provided below, use it to make the content specific and data-driven.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithStrategist(
  messages: ChatMessage[],
  songContext?: string,
): Promise<string> {
  const client = getClient();

  const systemContent = songContext
    ? `${CHAT_SYSTEM_PROMPT}\n\nCURRENT SONG CONTEXT:\n${songContext}`
    : CHAT_SYSTEM_PROMPT;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemContent },
      ...messages,
    ],
    max_tokens: 1200,
    temperature: 0.8,
  });

  return response.choices[0]?.message.content ?? '';
}

// ---------------------------------------------------------------------------
// Build song context string for the chat panel (fetched server-side)
// ---------------------------------------------------------------------------

export async function buildSongContextString(songId: string): Promise<string> {
  const [song, aiSpectrum, aiGenre, themes] = await Promise.all([
    prisma.song.findUnique({
      where: { id: songId },
      include: { band: true, album: true, score: true },
    }),
    prisma.songAiSpectrum.findUnique({ where: { songId } }),
    prisma.songAiGenreSpectrum.findUnique({ where: { songId } }),
    prisma.songThemeScore.findMany({ where: { songId }, orderBy: { score: 'desc' }, take: 5 }),
  ]);

  if (!song) return '';

  const lines: string[] = [
    `Song: "${song.title}" by ${song.band.name}${song.album ? ` — ${song.album.title} (${song.album.year ?? 'unknown year'})` : ''}`,
  ];

  if (song.score) {
    lines.push(`Spectrum scores: Aggression ${song.score.aggression}, Complexity ${song.score.complexity}, Atmosphere ${song.score.atmosphere}, Emotion ${song.score.emotion}, Psychedelic ${song.score.psychedelic}, Concept ${song.score.concept}`);
  }
  if (aiSpectrum) {
    lines.push(`AI spectrum: Aggression ${(+aiSpectrum.aggression).toFixed(1)}, Complexity ${(+aiSpectrum.complexity).toFixed(1)}, Atmosphere ${(+aiSpectrum.atmosphere).toFixed(1)}, Emotion ${(+aiSpectrum.emotion).toFixed(1)}, Psychedelic ${(+aiSpectrum.psychedelic).toFixed(1)}, Concept ${(+aiSpectrum.concept).toFixed(1)}`);
  }
  if (aiGenre) {
    lines.push(`Genre appeal: Metal ${(+aiGenre.metal).toFixed(1)}, Rock ${(+aiGenre.rock).toFixed(1)}, Pop ${(+aiGenre.pop).toFixed(1)}, Hip-Hop ${(+aiGenre.hiphop).toFixed(1)}, Electronic ${(+aiGenre.electronic).toFixed(1)}, Folk ${(+aiGenre.folk).toFixed(1)}`);
  }
  if (themes.length > 0) {
    lines.push(`Themes: ${themes.map((t) => `${t.themeSlug} (${(t.score * 10).toFixed(1)}/10)`).join(', ')}`);
  }

  return lines.join('\n');
}

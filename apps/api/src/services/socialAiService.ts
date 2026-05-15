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
  songId: string;
  platform: string;
  postType: string;
  tone: string;
  postSize: string;
  variants: number;
}

interface PostVariant {
  body: string;
  hashtags: string[];
  cta: string;
  pollOptions?: string[];
}

export async function generateSocialPost(input: SocialPostInput): Promise<PostVariant[]> {
  const client = getClient();

  const [song, aiSpectrum, aiGenre, aiAnalysis, themes, context] = await Promise.all([
    prisma.song.findUnique({
      where: { id: input.songId },
      include: { band: true, album: true, score: true },
    }),
    prisma.songAiSpectrum.findUnique({ where: { songId: input.songId } }),
    prisma.songAiGenreSpectrum.findUnique({ where: { songId: input.songId } }),
    prisma.songAiAnalysis.findUnique({ where: { songId: input.songId } }),
    prisma.songThemeScore.findMany({
      where: { songId: input.songId },
      orderBy: { score: 'desc' },
      take: 5,
    }),
    prisma.songContextAnalysis.findUnique({ where: { songId: input.songId } }),
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

  const contextText = [scoreBlock, aiBlock, genreBlock, themesBlock, analysisBlock].filter(Boolean).join('\n');

  const userPrompt = `Song: "${song.title}" by ${song.band.name}${song.album ? ` (from ${song.album.title}, ${song.album.year ?? ''})` : ''}

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
    model: 'gpt-4o',
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
    model: 'gpt-4o',
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

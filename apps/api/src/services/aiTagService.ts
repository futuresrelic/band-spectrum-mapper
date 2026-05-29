import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const MODEL = 'gpt-4o-mini';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface TagWithDescription {
  name: string;
  description: string;
}

export const aiTagService = {
  async generateAndApply(songId: string): Promise<TagWithDescription[]> {
    const [song, aiAnalysis, research, aiSpectrum, genreSpectrum, contextAnalysis, recentComments] = await Promise.all([
      prisma.song.findUnique({
        where: { id: songId },
        include: {
          band: { select: { name: true } },
          album: { select: { title: true, year: true } },
          lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
        },
      }),
      prisma.songAiAnalysis.findUnique({ where: { songId } }),
      prisma.songResearch.findUnique({ where: { songId }, select: { musicStyle: true, summary: true } }),
      prisma.songAiSpectrum.findUnique({ where: { songId } }),
      prisma.songAiGenreSpectrum.findUnique({ where: { songId } }),
      prisma.songContextAnalysis.findUnique({ where: { songId } }),
      prisma.songComment.findMany({ where: { songId }, select: { text: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);

    if (!song) throw new HttpError(404, 'Song not found');

    const lyric = song.lyrics[0];
    const contextParts: string[] = [
      `Song: "${song.title}" by ${song.band.name}`,
    ];

    if (song.album) {
      contextParts.push(`Album: ${song.album.title}${song.album.year ? ` (${song.album.year})` : ''}`);
    }
    if (research?.musicStyle) {
      contextParts.push(`Music style: ${research.musicStyle}`);
    }
    if (research?.summary) {
      contextParts.push(`Background: ${research.summary.slice(0, 1200)}`);
    }
    if (aiAnalysis) {
      const themes = (aiAnalysis.themes as string[]).join(', ');
      contextParts.push(`AI themes: ${themes}`);
      contextParts.push(`Emotional register: ${aiAnalysis.emotionalRegister}`);
      contextParts.push(`Conceptual depth: ${aiAnalysis.conceptualDepth}`);
    }
    if (aiSpectrum) {
      contextParts.push(
        `Spectrum: aggression=${aiSpectrum.aggression} complexity=${aiSpectrum.complexity} atmosphere=${aiSpectrum.atmosphere} emotion=${aiSpectrum.emotion} psychedelic=${aiSpectrum.psychedelic} concept=${aiSpectrum.concept}`,
      );
    }
    if (genreSpectrum) {
      contextParts.push(
        `Genre appeal: metal=${genreSpectrum.metal} rock=${genreSpectrum.rock} electronic=${genreSpectrum.electronic} folk=${genreSpectrum.folk}`,
      );
    }
    if (lyric) {
      contextParts.push(`Lyrics excerpt:\n${lyric.text.slice(0, 1200)}`);
    }
    if (contextAnalysis?.titleSignificance) {
      contextParts.push(`Title significance: ${contextAnalysis.titleSignificance}`);
    }
    if (contextAnalysis?.lyricalInterpretation) {
      contextParts.push(`Lyrical interpretation: ${contextAnalysis.lyricalInterpretation}`);
    }
    if (contextAnalysis?.historicalContext) {
      contextParts.push(`Historical context: ${contextAnalysis.historicalContext}`);
    }
    if (recentComments.length > 0) {
      const commentSnippet = recentComments.map((c: { text: string }) => `"${c.text}"`).join(' | ').slice(0, 600);
      contextParts.push(`Listener perspectives: ${commentSnippet}`);
    }

    const prompt = `You are tagging songs for a cross-genre music discovery platform.
Generate 3–5 precise discovery tags for this song, each with a short description explaining why the tag fits THIS specific song.

Draw from these categories (pick the most relevant, do not fill all categories):
- AFFECT: the felt emotional quality (e.g. "melancholic", "cathartic", "unsettling", "euphoric", "hypnotic", "anxious", "serene", "abrasive")
- TEXTURE: sonic/lyrical character (e.g. "atmospheric", "layered", "cinematic", "minimalist", "dense", "sparse", "abstract")
- THEME: the core subject (e.g. "mortality", "isolation", "identity", "transcendence", "duality", "loss", "transformation", "ego dissolution")
- CONTEXT: conceptual lens (e.g. "existential", "spiritual", "psychological", "philosophical", "political")
- MUSICAL CRAFT: technical/structural interest (e.g. "polyrhythm", "odd time signature", "dynamic contrast", "counterpoint", "call and response", "modal", "microtonal", "through-composed")

Tag name rules:
- 3–5 tags total — quality over quantity
- Each tag name: 1–3 words, lowercase, no punctuation
- No genre names (no "metal", "rock", "jazz" — those are separate)
- Prefer vivid and specific: "ego dissolution" beats "self-reflection"; "cyclical grief" beats "sadness"
- Tags should make sense to a listener who has never heard this genre before
CANONICAL FORM RULES (critical):
- Use the simplest adjectival or root-noun form. Never suffix a concept with -ity, -ness, -tion, or -ism when the root already works. Write "spiritual" not "spirituality"; "transcendent" not "transcendence" (unless the noun is most natural, e.g. "mortality" or "isolation" are fine).
- Do NOT expand a single word into a phrase when the word is sufficient.
- Before finalising, check: are any two tags near-synonyms? If yes, drop the weaker one.
- If lyrical interpretation or historical context is provided, prioritise tags that reflect the song's KNOWN meaning.

Description rules:
- 1–2 sentences max, specific to THIS song (not generic to the tag)
- Explain how the song earns this tag — cite lyrics, structure, mood, or context
- Do not restate the tag name in the description

${contextParts.join('\n\n')}

Return ONLY a JSON array of objects. No markdown. No explanation.
Example: [{"name":"mortality","description":"The lyric circles a confrontation with physical decay..."},{"name":"polyrhythm","description":"The 7/8 guitar pattern locks against a 4/4 bass groove..."}]`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    let tagObjects: TagWithDescription[];
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      tagObjects = (parsed as unknown[]).slice(0, 10).map((item) => {
        if (typeof item === 'string') return { name: item, description: '' };
        const obj = item as Record<string, unknown>;
        return {
          name: String(obj['name'] ?? '').toLowerCase().trim(),
          description: String(obj['description'] ?? '').trim(),
        };
      }).filter((t) => t.name.length > 0);
    } catch {
      throw new HttpError(502, 'AI returned invalid tag list');
    }

    // Clear existing tags for this song so stale description-less entries don't survive
    await prisma.songTag.deleteMany({ where: { songId } });

    // Create fresh tags with descriptions
    for (const { name: tagName, description } of tagObjects) {
      const slug = slugify(tagName);
      if (!slug) continue;
      const tag = await prisma.tag.upsert({
        where: { slug },
        create: { name: tagName, slug },
        update: {},
      });
      await prisma.songTag.create({
        data: { songId, tagId: tag.id, description: description || null },
      });
    }

    return tagObjects;
  },

  async getTags(songId: string): Promise<TagWithDescription[]> {
    const songTags = await prisma.songTag.findMany({
      where: { songId },
      include: { tag: { select: { name: true } } },
      orderBy: { tag: { name: 'asc' } },
    });
    return songTags.map((st) => ({ name: st.tag.name, description: st.description ?? '' }));
  },
};

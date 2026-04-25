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

export const aiTagService = {
  async generateAndApply(songId: string): Promise<string[]> {
    const [song, aiAnalysis, research, aiSpectrum, genreSpectrum] = await Promise.all([
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
      contextParts.push(`Background: ${research.summary.slice(0, 400)}`);
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

    const prompt = `You are tagging songs for a cross-genre music discovery platform.
Generate 5–8 concise thematic tags for this song. Tags help listeners from different backgrounds find songs that resonate with them.

Tag categories to draw from (mix and match as appropriate):
- THEME: what the song is fundamentally about (e.g. "mortality", "isolation", "duality", "control", "transcendence", "grief", "consciousness", "time", "identity", "communication", "power", "rebellion", "connection", "loss", "transformation")
- MOOD: the emotional texture (e.g. "melancholic", "euphoric", "meditative", "unsettling", "cathartic", "introspective", "hypnotic", "intense")
- STYLE: the musical/lyrical approach (e.g. "atmospheric", "progressive", "minimalist", "layered", "spoken-word", "cinematic", "abstract", "polyrhythmic", "conceptual")
- CONTEXT: the conceptual lens (e.g. "spiritual", "political", "philosophical", "psychological", "mythological", "technological", "existential")

Rules:
- Each tag: 1–3 words, lowercase, no punctuation, no genre names (no "metal", "rock", etc — those are handled separately)
- Prefer specific over generic: "god complex" beats "religion"; "machine consciousness" beats "technology"
- Tags should help a Pop fan or a Folk fan understand what the song is about and why it might resonate with them
- Do NOT repeat tags already obvious from the genre spectrum

${contextParts.join('\n\n')}

Return ONLY a JSON array of tag strings. No markdown. No explanation.
Example: ["mortality", "ego dissolution", "cyclical time", "meditative", "philosophical", "isolation"]`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    let tags: string[];
    try {
      const parsed = JSON.parse(cleaned) as unknown;
      if (!Array.isArray(parsed)) throw new Error('Not an array');
      tags = (parsed as unknown[]).map(String).slice(0, 10);
    } catch {
      throw new HttpError(502, 'AI returned invalid tag list');
    }

    // Upsert each tag and link to the song
    for (const tagName of tags) {
      const slug = slugify(tagName);
      if (!slug) continue;
      const tag = await prisma.tag.upsert({
        where: { slug },
        create: { name: tagName.toLowerCase().trim(), slug },
        update: {},
      });
      await prisma.songTag.upsert({
        where: { songId_tagId: { songId, tagId: tag.id } },
        create: { songId, tagId: tag.id },
        update: {},
      });
    }

    return tags;
  },

  async getTags(songId: string): Promise<string[]> {
    const songTags = await prisma.songTag.findMany({
      where: { songId },
      include: { tag: { select: { name: true } } },
      orderBy: { tag: { name: 'asc' } },
    });
    return songTags.map((st) => st.tag.name);
  },
};

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';
import type { SongAiAnalysis, SongAiSpectrum } from '@band-spectrum-mapper/shared';

const MODEL = 'gpt-4o-mini';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

// Unified analysis prompt — covers tags AND analysis fields in a single call.
// "themes" field in the DB is now populated with the same curated tags so other
// features (album context, social copy) that read aiAnalysis.themes still work.
// Running the "analysis" batch job now also satisfies the "tags" batch job.
const ANALYSIS_PROMPT = `You are a music analyst specializing in lyrical content. Analyze the following song lyrics and return a JSON object with exactly these fields:
- tags: array of 3-5 curated discovery tags. Draw from these categories (mix freely):
  MOOD — "melancholic", "euphoric", "unsettling", "hypnotic", "cathartic", "anxious", "serene", "abrasive"
  TEXTURE — "atmospheric", "layered", "minimalist", "cinematic", "abstract", "dense", "sparse"
  THEME — "mortality", "isolation", "identity", "transcendence", "rebellion", "loss", "duality", "transformation"
  CONTEXT — "existential", "spiritual", "psychological", "philosophical", "political"
  CANONICAL FORM RULES (critical — read carefully):
  • Use the simplest adjectival or root-noun form. Never suffix a concept with -ity, -ness, -tion, -ism, or -ization when the root already works as a tag. "spiritual" not "spirituality"; "transcendent" not "transcendence" (unless the noun is more natural, e.g. "mortality" or "isolation" are fine).
  • Do NOT expand a single-word concept into a phrase. "spiritual awakening" is redundant if "spiritual" or "transcendent" already applies. Pick the tightest word that conveys the idea.
  • Before finalising, check: are any two of your tags near-synonyms or root/derived-form pairs of each other? If yes, keep only the simpler one.
  • 1-3 words each, lowercase, no genre names (no "metal", "rock", "jazz")
- emotionalRegister: one sentence describing the dominant emotional tone
- conceptualDepth: one sentence assessing how layered or abstract the lyrical concepts are
- notableElements: array of 2-4 notable craft elements (e.g. "extended metaphor", "cyclical structure", "visceral imagery")
- narrativeVoice: one sentence on the lyrical perspective and delivery style (e.g. "second-person address that implicates the listener directly", "fractured first-person across shifting time frames", "omniscient narrator observing from outside")

Return only valid JSON. No markdown, no explanation.

Lyrics:
`;

interface AiResponseShape {
  tags: string[];
  emotionalRegister: string;
  conceptualDepth: string;
  notableElements: string[];
  narrativeVoice: string;
}

function parseAiResponse(raw: string): AiResponseShape {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new HttpError(502, 'AI returned invalid JSON');
  }

  const obj = parsed as Record<string, unknown>;
  if (
    !Array.isArray(obj['tags']) ||
    typeof obj['emotionalRegister'] !== 'string' ||
    typeof obj['conceptualDepth'] !== 'string' ||
    !Array.isArray(obj['notableElements'])
  ) {
    throw new HttpError(502, 'AI response missing required fields');
  }

  return {
    tags: (obj['tags'] as unknown[]).map(String).slice(0, 5),
    emotionalRegister: obj['emotionalRegister'] as string,
    conceptualDepth: obj['conceptualDepth'] as string,
    notableElements: (obj['notableElements'] as unknown[]).map(String),
    narrativeVoice: typeof obj['narrativeVoice'] === 'string' ? obj['narrativeVoice'] : '',
  };
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const aiAnalysisService = {
  async getOrCreate(songId: string): Promise<SongAiAnalysis> {
    const existing = await prisma.songAiAnalysis.findUnique({ where: { songId } });
    if (existing) {
      return {
        ...existing,
        themes: existing.themes as string[],
        notableElements: existing.notableElements as string[],
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      };
    }
    return aiAnalysisService.regenerate(songId);
  },

  async getOrCreateSpectrum(songId: string): Promise<SongAiSpectrum> {
    const existing = await prisma.songAiSpectrum.findUnique({ where: { songId } });
    if (existing) {
      return { ...existing, createdAt: existing.createdAt.toISOString(), updatedAt: existing.updatedAt.toISOString() };
    }
    return aiAnalysisService.regenerateSpectrum(songId);
  },

  async regenerateSpectrum(songId: string): Promise<SongAiSpectrum> {
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        id: true, title: true,
        lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
      },
    });
    if (!song) throw new HttpError(404, 'Song not found');
    const lyric = song.lyrics[0] ?? null;
    if (!lyric) throw new HttpError(404, 'No primary lyrics found for this song');

    const client = getClient();
    const axisDescriptions = [
      'aggression (0=calm/peaceful, 10=intense/violent/abrasive)',
      'complexity (0=simple/repetitive, 10=dense/layered/intricate)',
      'atmosphere (0=dry/direct, 10=immersive/ambient/cinematic)',
      'emotion (0=detached/cold, 10=raw/vulnerable/emotionally intense)',
      'psychedelic (0=grounded/literal, 10=surreal/hallucinatory/mind-bending)',
      'concept (0=personal/narrative, 10=philosophical/abstract/conceptual)',
    ];

    const prompt = `You are a music analyst. Score the following song lyrics on 6 axes (0–10 integers each) and give a one-sentence rationale.

Axes:
${axisDescriptions.map((a) => `- ${a}`).join('\n')}

Return only valid JSON with keys: aggression, complexity, atmosphere, emotion, psychedelic, concept, rationale.
No markdown. No extra text.

Song: "${song.title}"

Lyrics:
${lyric.text.slice(0, 4000)}`;

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 256,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(cleaned) as Record<string, unknown>; }
    catch { throw new HttpError(502, 'AI returned invalid JSON for spectrum scoring'); }

    const toScore = (v: unknown) => Math.min(10, Math.max(0, Math.round(Number(v) || 0)));
    const rationale = typeof parsed['rationale'] === 'string' ? parsed['rationale'] : '';

    const record = await prisma.songAiSpectrum.upsert({
      where: { songId },
      create: {
        songId, model: MODEL,
        aggression: toScore(parsed['aggression']),
        complexity: toScore(parsed['complexity']),
        atmosphere: toScore(parsed['atmosphere']),
        emotion: toScore(parsed['emotion']),
        psychedelic: toScore(parsed['psychedelic']),
        concept: toScore(parsed['concept']),
        rationale,
      },
      update: {
        model: MODEL,
        aggression: toScore(parsed['aggression']),
        complexity: toScore(parsed['complexity']),
        atmosphere: toScore(parsed['atmosphere']),
        emotion: toScore(parsed['emotion']),
        psychedelic: toScore(parsed['psychedelic']),
        concept: toScore(parsed['concept']),
        rationale,
      },
    });

    return { ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
  },

  async regenerate(songId: string): Promise<SongAiAnalysis> {
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        id: true,
        title: true,
        lyrics: {
          where: { isPrimary: true },
          select: { text: true },
          take: 1,
        },
      },
    });

    if (!song) throw new HttpError(404, 'Song not found');

    const lyric = song.lyrics[0] ?? null;
    if (!lyric) throw new HttpError(404, 'No primary lyrics found for this song');

    const contextAnalysis = await prisma.songContextAnalysis.findUnique({ where: { songId } });

    const client = getClient();
    const contextSuffix = (() => {
      const parts: string[] = [];
      if (contextAnalysis?.titleSignificance) parts.push(`Title significance: ${contextAnalysis.titleSignificance}`);
      if (contextAnalysis?.lyricalInterpretation) parts.push(`Lyrical interpretation: ${contextAnalysis.lyricalInterpretation}`);
      if (contextAnalysis?.historicalContext) parts.push(`Historical context: ${contextAnalysis.historicalContext}`);
      return parts.length ? `\n\nAdditional context (use to refine tag accuracy):\n${parts.join('\n\n')}` : '';
    })();
    const prompt = `${ANALYSIS_PROMPT}${lyric.text.slice(0, 4000)}${contextSuffix}`;

    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 512,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = parseAiResponse(raw);

    const record = await prisma.songAiAnalysis.upsert({
      where: { songId },
      create: {
        songId,
        model: MODEL,
        themes: parsed.tags,
        emotionalRegister: parsed.emotionalRegister,
        conceptualDepth: parsed.conceptualDepth,
        notableElements: parsed.notableElements,
        rawResponse: raw,
      },
      update: {
        model: MODEL,
        themes: parsed.tags,
        emotionalRegister: parsed.emotionalRegister,
        conceptualDepth: parsed.conceptualDepth,
        notableElements: parsed.notableElements,
        rawResponse: raw,
      },
    });

    // Write tags to SongTag table so the analysis batch also satisfies the tags batch
    for (const tagName of parsed.tags) {
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

    return {
      ...record,
      themes: record.themes as string[],
      notableElements: record.notableElements as string[],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  },
};

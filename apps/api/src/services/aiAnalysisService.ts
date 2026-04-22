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

const ANALYSIS_PROMPT = `You are a music analyst specializing in lyrical content. Analyze the following song lyrics and return a JSON object with exactly these fields:
- themes: array of 3-6 short thematic keywords or phrases (e.g. "mortality", "isolation", "industrial machinery")
- emotionalRegister: one sentence describing the dominant emotional tone
- conceptualDepth: one sentence assessing how layered or abstract the lyrical concepts are
- notableElements: array of 2-4 notable craft elements (e.g. "extended metaphor", "cyclical structure", "visceral imagery")

Return only valid JSON. No markdown, no explanation.

Lyrics:
`;

interface AiResponseShape {
  themes: string[];
  emotionalRegister: string;
  conceptualDepth: string;
  notableElements: string[];
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
    !Array.isArray(obj['themes']) ||
    typeof obj['emotionalRegister'] !== 'string' ||
    typeof obj['conceptualDepth'] !== 'string' ||
    !Array.isArray(obj['notableElements'])
  ) {
    throw new HttpError(502, 'AI response missing required fields');
  }

  return {
    themes: (obj['themes'] as unknown[]).map(String),
    emotionalRegister: obj['emotionalRegister'] as string,
    conceptualDepth: obj['conceptualDepth'] as string,
    notableElements: (obj['notableElements'] as unknown[]).map(String),
  };
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

    const client = getClient();
    const prompt = `${ANALYSIS_PROMPT}${lyric.text.slice(0, 4000)}`;

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
        themes: parsed.themes,
        emotionalRegister: parsed.emotionalRegister,
        conceptualDepth: parsed.conceptualDepth,
        notableElements: parsed.notableElements,
        rawResponse: raw,
      },
      update: {
        model: MODEL,
        themes: parsed.themes,
        emotionalRegister: parsed.emotionalRegister,
        conceptualDepth: parsed.conceptualDepth,
        notableElements: parsed.notableElements,
        rawResponse: raw,
      },
    });

    return {
      ...record,
      themes: record.themes as string[],
      notableElements: record.notableElements as string[],
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  },
};

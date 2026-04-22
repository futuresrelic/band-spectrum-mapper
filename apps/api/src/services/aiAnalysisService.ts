import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { SongAiAnalysis } from '@band-spectrum-mapper/shared';

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

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const MODEL = 'gpt-4o-mini';
const NOT_FOUND = 'LYRICS_NOT_FOUND';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

export const aiLyricService = {
  async recallAndStore(songId: string) {
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: { band: true },
    });
    if (!song) throw new HttpError(404, 'Song not found');

    const prompt =
      `You are a music archivist with extensive knowledge of song lyrics.\n\n` +
      `Recall the complete lyrics for "${song.title}" by ${song.band.name}.\n\n` +
      `If you are highly confident you know the full, accurate lyrics from your training data, ` +
      `provide them exactly as they appear — verse/chorus structure intact, line breaks preserved, ` +
      `no title header, no attribution, no commentary. Begin with the first word of the lyrics.\n\n` +
      `If you do not know this song, are uncertain about the accuracy, or cannot provide a complete ` +
      `set, respond with exactly: ${NOT_FOUND}\n\n` +
      `Only respond with lyrics if you are highly confident they are correct and complete.`;

    const client = getClient();
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    if (!raw || raw.includes(NOT_FOUND)) return null;

    // Make primary only if no existing primary lyric
    const existingPrimary = await prisma.lyric.findFirst({
      where: { songId, isPrimary: true },
    });

    return prisma.lyric.create({
      data: {
        songId,
        text: raw,
        sourceType: 'ai_recall',
        sourceLabel: 'AI recall — accuracy unverified, review before relying on this',
        isPrimary: !existingPrimary,
      },
    });
  },
};

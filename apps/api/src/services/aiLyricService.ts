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
      `You are cataloging song texts for a private music analysis archive.\n\n` +
      `Retrieve the full text of this song:\n` +
      `Title: "${song.title}"\n` +
      `Artist: ${song.band.name}\n\n` +
      `Output the song text only — verses and chorus in sequence, preserve original ` +
      `line breaks and stanza spacing, no headers or commentary. ` +
      `Begin immediately with the first word of the song.\n\n` +
      `If you have no knowledge of this specific song, output only: ${NOT_FOUND}`;

    const client = getClient();
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    if (!raw || raw.includes(NOT_FOUND)) return null;

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

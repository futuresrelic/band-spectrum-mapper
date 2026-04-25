import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { AlbumContextAnalysis } from '@band-spectrum-mapper/shared';

const MODEL = 'gpt-4o-mini';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function serialize(record: {
  id: string;
  albumId: string;
  model: string;
  overallNarrative: string;
  thematicSynthesis: string;
  artisticContext: string;
  createdAt: Date;
  updatedAt: Date;
}): AlbumContextAnalysis {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const albumContextService = {
  async getOrCreate(albumId: string): Promise<AlbumContextAnalysis> {
    const existing = await prisma.albumContextAnalysis.findUnique({ where: { albumId } });
    if (existing) return serialize(existing);
    return albumContextService.regenerate(albumId);
  },

  async regenerate(albumId: string): Promise<AlbumContextAnalysis> {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: {
        band: { select: { name: true } },
        songs: {
          orderBy: { trackNumber: 'asc' },
          include: {
            aiAnalysis: true,
            aiSpectrum: true,
            research:   { select: { musicStyle: true, summary: true } },
            songTags:   { include: { tag: { select: { name: true } } } },
          },
        },
      },
    });

    if (!album) throw new HttpError(404, 'Album not found');

    const songSummaries = album.songs.map((s, i) => {
      const parts: string[] = [`Track ${s.trackNumber ?? i + 1}: "${s.title}"`];
      if (s.aiAnalysis) {
        parts.push(`  Themes: ${(s.aiAnalysis.themes as string[]).join(', ')}`);
        parts.push(`  Emotional register: ${s.aiAnalysis.emotionalRegister}`);
        parts.push(`  Conceptual depth: ${s.aiAnalysis.conceptualDepth}`);
      }
      if (s.aiSpectrum) {
        parts.push(`  Spectrum: aggression=${s.aiSpectrum.aggression} complexity=${s.aiSpectrum.complexity} atmosphere=${s.aiSpectrum.atmosphere} emotion=${s.aiSpectrum.emotion} psychedelic=${s.aiSpectrum.psychedelic} concept=${s.aiSpectrum.concept}`);
      }
      if (s.research?.musicStyle) {
        parts.push(`  Style: ${s.research.musicStyle}`);
      }
      if (s.songTags.length > 0) {
        parts.push(`  Tags: ${s.songTags.map((t) => t.tag.name).join(', ')}`);
      }
      return parts.join('\n');
    });

    const songCount = album.songs.length;
    const songsWithAnalysis = album.songs.filter((s) => s.aiAnalysis).length;

    const prompt = `You are a music critic and cultural analyst writing about albums as cohesive artistic works.

IMPORTANT DISCLAIMER (weave this understanding into your analysis, but do not state it mechanically):
This analysis is based exclusively on lyrics and publicly available information — not the music itself.
The spectral scores (aggression, complexity, atmosphere, etc.) reflect the lyrical and conceptual weight of the songs,
not their sonic qualities. Human listeners bring the musical interpretation that text alone cannot provide.

ALBUM: "${album.title}"${album.year ? ` (${album.year})` : ''}
ARTIST: ${album.band.name}
SONGS: ${songCount} tracks${songsWithAnalysis < songCount ? ` (${songsWithAnalysis} with AI analysis available)` : ''}

=== SONG-BY-SONG DATA ===
${songSummaries.join('\n\n')}

Write a rich critical analysis of this album as a unified work. You are writing for curious listeners from any genre background who want to understand what this album is about and why it matters.

Provide your response as a JSON object with these exact string fields:

- overallNarrative: What this album is ultimately about as a unified artistic statement. What is it exploring, what does it feel like to move through it from start to finish, and what makes it significant? Reference specific songs where they anchor the album's meaning. Note where human musical interpretation would complete what lyrics alone reveal. (5–8 sentences)

- thematicSynthesis: The specific themes, images, and ideas that recur across songs — the vocabulary the album builds, the questions it keeps returning to, the conceptual architecture that holds it together. Be specific about which songs carry which threads. (4–6 sentences)

- artisticContext: Where this album sits in the band's body of work, what it was trying to do, and how it compares to what came before or after (if inferable). Draw on the research data and any contextual clues in the song data. (3–5 sentences)

Return only valid JSON. No markdown. No extra text outside the JSON object.`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1800,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new HttpError(502, 'AI returned invalid JSON for album context analysis');
    }

    const str = (key: string) =>
      typeof parsed[key] === 'string' ? (parsed[key] as string) : '';

    const record = await prisma.albumContextAnalysis.upsert({
      where: { albumId },
      create: {
        albumId,
        model: MODEL,
        overallNarrative:  str('overallNarrative'),
        thematicSynthesis: str('thematicSynthesis'),
        artisticContext:   str('artisticContext'),
      },
      update: {
        model: MODEL,
        overallNarrative:  str('overallNarrative'),
        thematicSynthesis: str('thematicSynthesis'),
        artisticContext:   str('artisticContext'),
      },
    });

    return serialize(record);
  },
};

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { BandContextAnalysis } from '@band-spectrum-mapper/shared';

const MODEL = 'gpt-4o-mini';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function serialize(record: {
  id: string;
  bandId: string;
  model: string;
  overallNarrative: string;
  thematicSynthesis: string;
  artisticEvolution: string;
  createdAt: Date;
  updatedAt: Date;
}): BandContextAnalysis {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const bandContextService = {
  async getOrCreate(bandId: string): Promise<BandContextAnalysis> {
    const existing = await prisma.bandContextAnalysis.findUnique({ where: { bandId } });
    if (existing) return serialize(existing);
    return bandContextService.regenerate(bandId);
  },

  async regenerate(bandId: string): Promise<BandContextAnalysis> {
    const band = await prisma.band.findUnique({
      where: { id: bandId },
      include: {
        albums: {
          orderBy: { year: 'asc' },
          include: {
            contextAnalysis: true,
            songs: {
              orderBy: { trackNumber: 'asc' },
              include: {
                aiAnalysis:     true,
                research:       { select: { musicStyle: true } },
                songTags:       { include: { tag: { select: { name: true } } } },
                aiGenreSpectrum: { select: { metal: true, rock: true, pop: true, hiphop: true, electronic: true, folk: true } },
              },
              take: 5, // representative songs per album for context
            },
          },
        },
      },
    });

    if (!band) throw new HttpError(404, 'Band not found');

    // Aggregate all themes across songs for a cross-album view
    const allThemes: string[] = [];
    const allTags = new Set<string>();
    band.albums.forEach((album) => {
      album.songs.forEach((song) => {
        if (song.aiAnalysis) {
          (song.aiAnalysis.themes as string[]).forEach((t) => allThemes.push(t));
        }
        song.songTags.forEach((st) => allTags.add(st.tag.name));
      });
    });

    // Deduplicate themes by count
    const themeCounts: Record<string, number> = {};
    allThemes.forEach((t) => { themeCounts[t] = (themeCounts[t] ?? 0) + 1; });
    const topThemes = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([theme, count]) => `${theme} (×${count})`)
      .join(', ');

    const albumSummaries = band.albums.map((album) => {
      const lines: string[] = [`Album: "${album.title}"${album.year ? ` (${album.year})` : ''} — ${album.songs.length} songs`];
      if (album.contextAnalysis) {
        lines.push(`  Album narrative: ${album.contextAnalysis.overallNarrative.slice(0, 300)}…`);
      } else {
        const songThemes = album.songs
          .flatMap((s) => s.aiAnalysis ? (s.aiAnalysis.themes as string[]) : [])
          .slice(0, 8);
        if (songThemes.length > 0) {
          lines.push(`  Song themes: ${[...new Set(songThemes)].join(', ')}`);
        }
        const sampleSongs = album.songs.map((s) => s.title).slice(0, 4).join(', ');
        if (sampleSongs) lines.push(`  Sample songs: ${sampleSongs}`);
      }
      return lines.join('\n');
    });

    const totalSongs = band.albums.reduce((n, a) => n + a.songs.length, 0);

    const prompt = `You are a music critic and cultural analyst writing artist profiles for a cross-genre music discovery platform.

IMPORTANT DISCLAIMER (weave this understanding into your analysis, but do not state it mechanically):
This analysis is based exclusively on lyrics and publicly available information — not the music itself.
The platform's spectral scores reflect lyrical and conceptual qualities, not sonic qualities.
Human listeners and their ratings/comments provide the musical interpretation that text alone cannot deliver.
This is a feature, not a limitation — it means every genre of listener can find their own entry point.

ARTIST: ${band.name}
${band.description ? `DESCRIPTION: ${band.description}\n` : ''}ALBUMS: ${band.albums.length} | TOTAL SONGS ANALYZED: ${totalSongs}
TOP RECURRING THEMES: ${topThemes || 'Not yet analyzed'}
TOP TAGS ACROSS ALL SONGS: ${[...allTags].slice(0, 20).join(', ') || 'None yet'}

=== ALBUM-BY-ALBUM OVERVIEW ===
${albumSummaries.join('\n\n')}

Write a rich critical overview of this artist for curious listeners from any genre background. Help a metal fan, a folk fan, a pop fan, and an electronic fan each understand why this artist might speak to them.

Provide your response as a JSON object with these exact string fields:

- overallNarrative: Who this artist is as a lyrical and conceptual force. What do they keep returning to? What does their work feel like to inhabit? What distinguishes their voice from any other artist? Write for someone who has never heard them but is deciding whether to listen. Acknowledge what lyrics reveal and what only listening can complete — this is an invitation, not a verdict. (5–8 sentences)

- thematicSynthesis: The specific ideas, images, tensions, and obsessions that run through their catalog. Name the recurring symbols, the philosophical questions they keep wrestling with, the emotional territory they claim. Be specific enough that someone who knows the work will recognize it immediately. (4–6 sentences)

- artisticEvolution: How their lyrical themes, conceptual ambitions, and emotional register have changed across albums. What have they grown toward, what have they left behind, and what seems to be a permanent part of who they are as artists? (3–5 sentences)

Return only valid JSON. No markdown. No extra text outside the JSON object.`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new HttpError(502, 'AI returned invalid JSON for band context analysis');
    }

    const str = (key: string) =>
      typeof parsed[key] === 'string' ? (parsed[key] as string) : '';

    const record = await prisma.bandContextAnalysis.upsert({
      where: { bandId },
      create: {
        bandId,
        model: MODEL,
        overallNarrative:  str('overallNarrative'),
        thematicSynthesis: str('thematicSynthesis'),
        artisticEvolution: str('artisticEvolution'),
      },
      update: {
        model: MODEL,
        overallNarrative:  str('overallNarrative'),
        thematicSynthesis: str('thematicSynthesis'),
        artisticEvolution: str('artisticEvolution'),
      },
    });

    return serialize(record);
  },
};

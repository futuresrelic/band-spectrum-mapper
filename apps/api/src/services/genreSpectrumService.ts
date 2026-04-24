import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { GENRE_PERSPECTIVES } from '@band-spectrum-mapper/shared';
import type { SongAiGenreSpectrum } from '@band-spectrum-mapper/shared';

const MODEL = 'gpt-4o-mini';
const GENRE_IDS = GENRE_PERSPECTIVES.map((p) => p.id);

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function serialize(record: {
  id: string;
  songId: string;
  model: string;
  metal: number;
  rock: number;
  pop: number;
  hiphop: number;
  electronic: number;
  folk: number;
  rationale: string;
  generatedAt: Date;
  updatedAt: Date;
}): SongAiGenreSpectrum {
  return {
    ...record,
    generatedAt: record.generatedAt.toISOString(),
    updatedAt:   record.updatedAt.toISOString(),
  };
}

export const genreSpectrumService = {
  async getOrCreate(songId: string): Promise<SongAiGenreSpectrum> {
    const existing = await prisma.songAiGenreSpectrum.findUnique({ where: { songId } });
    if (existing) return serialize(existing);
    return genreSpectrumService.regenerate(songId);
  },

  async regenerate(songId: string): Promise<SongAiGenreSpectrum> {
    // Gather all available context in parallel
    const [song, research, coreScore, communityAgg, comments] = await Promise.all([
      prisma.song.findUnique({
        where: { id: songId },
        select: {
          id: true,
          title: true,
          band: { select: { name: true } },
          album: { select: { title: true, year: true } },
          lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
        },
      }),
      prisma.songResearch.findUnique({ where: { songId }, select: { musicStyle: true, summary: true } }),
      prisma.songAxisScore.findUnique({ where: { songId } }),
      prisma.userSongRating.groupBy({
        by: ['songId'],
        where: { songId },
        _avg: {
          aggression: true, complexity: true, atmosphere: true,
          emotion: true, psychedelic: true, concept: true,
        },
      }),
      prisma.songComment.findMany({
        where: { songId },
        select: { text: true },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);

    if (!song) throw new HttpError(404, 'Song not found');

    const lyric = song.lyrics[0];
    const communityScores = communityAgg[0]?._avg ?? null;

    // Build context sections for the prompt
    const contextParts: string[] = [];

    contextParts.push(`Song: "${song.title}" by ${song.band.name}`);
    if (song.album) {
      contextParts.push(`Album: ${song.album.title}${song.album.year ? ` (${song.album.year})` : ''}`);
    }

    if (research?.musicStyle) {
      contextParts.push(`Music style: ${research.musicStyle}`);
    }
    if (research?.summary) {
      contextParts.push(`Background: ${research.summary.slice(0, 300)}`);
    }

    if (coreScore) {
      const scores = [
        `aggression=${coreScore.aggression}`,
        `complexity=${coreScore.complexity}`,
        `atmosphere=${coreScore.atmosphere}`,
        `emotion=${coreScore.emotion}`,
        `psychedelic=${coreScore.psychedelic}`,
        `concept=${coreScore.concept}`,
      ];
      contextParts.push(`Spectrum scores (0-10): ${scores.join(', ')}`);
    } else if (communityScores) {
      const fmt = (v: number | null) => (v != null ? v.toFixed(1) : '?');
      const scores = [
        `aggression=${fmt(communityScores.aggression)}`,
        `complexity=${fmt(communityScores.complexity)}`,
        `atmosphere=${fmt(communityScores.atmosphere)}`,
        `emotion=${fmt(communityScores.emotion)}`,
        `psychedelic=${fmt(communityScores.psychedelic)}`,
        `concept=${fmt(communityScores.concept)}`,
      ];
      contextParts.push(`Community spectrum scores (0-10): ${scores.join(', ')}`);
    }

    if (lyric) {
      contextParts.push(`Lyrics excerpt:\n${lyric.text.slice(0, 1500)}`);
    }

    if (comments.length > 0) {
      const commentBlock = comments.map((c, i) => `${i + 1}. ${c.text.slice(0, 150)}`).join('\n');
      contextParts.push(`Community discussion (${comments.length} comments):\n${commentBlock}`);
    }

    const prompt = `You are a cross-genre music accessibility analyst. Given a song's profile, rate how much fans of each musical genre would enjoy this song on a scale of 1–10.

Scale:
1–2  Would likely dislike / completely outside their taste
3–4  A few genre fans might appreciate it, but most would not
5–6  A meaningful portion of genre fans would enjoy it
7–8  Most fans of this genre would appreciate or enjoy it
9–10 Near-universally loved within this genre

Genres to rate:
- metal: fans of heavy, aggressive, technical music (Tool, Metallica, Meshuggah, Slayer)
- rock: fans of guitar-driven, melodic, energetic rock (Foo Fighters, Pearl Jam, RHCP, Radiohead)
- pop: mainstream music fans who prefer accessible, catchy, structured songs
- hiphop: fans of beats, flow, lyricism, rhythm, and production (Kendrick Lamar, Jay-Z, Tyler)
- electronic: fans of synthesizers, production design, beats, and digital soundscapes (Aphex Twin, Daft Punk, Burial)
- folk: fans of acoustic, storytelling-focused, organic music (Bob Dylan, Fleet Foxes, Nick Drake)

${contextParts.join('\n\n')}

Return only valid JSON with exactly these keys (integer values 1–10 for each genre, plus a rationale paragraph):
{ "metal": 8, "rock": 7, "pop": 3, "hiphop": 4, "electronic": 6, "folk": 2, "rationale": "..." }
No markdown, no extra text.`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new HttpError(502, 'AI returned invalid JSON for genre spectrum');
    }

    // Validate and clamp each genre score
    const scores: Record<string, number> = {};
    for (const id of GENRE_IDS) {
      const raw = parsed[id];
      const val = typeof raw === 'number' ? Math.round(raw) : parseInt(String(raw), 10);
      if (isNaN(val)) throw new HttpError(502, `AI missing genre score for "${id}"`);
      scores[id] = Math.max(1, Math.min(10, val));
    }

    const rationale = typeof parsed['rationale'] === 'string' ? parsed['rationale'] : '';

    const record = await prisma.songAiGenreSpectrum.upsert({
      where: { songId },
      create: {
        songId, model: MODEL,
        metal: scores['metal']!, rock: scores['rock']!, pop: scores['pop']!,
        hiphop: scores['hiphop']!, electronic: scores['electronic']!, folk: scores['folk']!,
        rationale,
      },
      update: {
        model: MODEL,
        metal: scores['metal']!, rock: scores['rock']!, pop: scores['pop']!,
        hiphop: scores['hiphop']!, electronic: scores['electronic']!, folk: scores['folk']!,
        rationale,
        updatedAt: new Date(),
      },
    });

    return serialize(record);
  },
};

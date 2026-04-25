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

    const systemMessage = `You are a cross-genre music accessibility analyst. Your job is to score how much fans of each genre would enjoy a song.
The folk/indie category covers a WIDE spectrum of eclectic listeners. Indie/alternative audiences regularly embrace experimental, dark, atmospheric, progressive, and psychedelic music.
Bands like Tool, A Perfect Circle, Puscifer, Porcupine Tree, Radiohead, Nine Inch Nails, Portishead, Björk, Nick Cave, Deftones, and Talk Talk are beloved by indie/alternative listeners and would score 7–9 in this category.
Never score folk/indie low simply because a song is heavy, complex, or dark — those are features, not disqualifiers for this audience.`;

    const prompt = `Rate how much fans of each genre would enjoy this song (1–10 integers).

SCALE:
1–3  Would likely dislike / outside their taste
4–5  Niche appeal, only a subset would enjoy it
6–7  Solid crossover appeal, most fans would appreciate it
8–9  Strong fit — this is exactly what these fans seek
10   Quintessential for this genre's fanbase

GENRE DEFINITIONS (be accurate to these, not stereotypes):

metal (1–10): Heavy, aggressive, technical. Includes prog-metal, djent, post-metal, doom.
  Reference bands: Tool, Metallica, Meshuggah, Mastodon, Opeth, Gojira.
  Score high for: aggression, technical complexity, heavy riffs, rhythmic intensity.

rock (1–10): Guitar-driven, energetic. Includes alt-rock, grunge, post-rock, art rock.
  Reference bands: Pearl Jam, RHCP, Alice in Chains, Soundgarden, Foo Fighters, Muse.
  Score high for: guitar presence, song structure, melodic hooks, energy.

pop (1–10): Mainstream accessibility. Structured, catchy, radio-friendly.
  Reference bands: Taylor Swift, Coldplay (singles), Imagine Dragons, Maroon 5.
  Score high for: immediate hooks, verse-chorus structure, mass appeal. Score low for: complexity, experimentation.

hiphop (1–10): Beats, flow, lyricism, rhythm. Includes conscious rap, experimental hip-hop.
  Reference: Kendrick Lamar, Tyler the Creator, Death Grips, Run the Jewels.
  Score high for: rhythmic spoken word, prominent beats. Score low for: lack of rap/spoken word elements.

electronic (1–10): Synthesizers, production, digital soundscapes. Includes industrial, ambient, IDM.
  Reference: Aphex Twin, Daft Punk, Burial, Nine Inch Nails, Boards of Canada.
  Score high for: synth-heavy production, programmed beats, electronic textures.

folk (1–10): THIS IS THE INDIE/ALTERNATIVE AUDIENCE — not just literal folk music.
  These are the most eclectic listeners. They embrace experimental, dark, atmospheric,
  conceptually rich, and emotionally intense music alongside acoustic folk.
  CALIBRATION EXAMPLES for the folk/indie score:
    - Tool "Lateralus": folk=8 (progressive, cerebral, beloved by indie fans)
    - A Perfect Circle "3 Libras": folk=8 (atmospheric, emotional, indie crossover)
    - Puscifer "Existential Reckoning": folk=7 (experimental, conceptual)
    - Porcupine Tree "Trains": folk=9 (indie fans' favorite genre of prog)
    - Radiohead "Paranoid Android": folk=9 (indie/alt fans love this)
    - Nine Inch Nails "Hurt": folk=8 (dark, emotional, eclectic fans adore it)
    - Metallica "Enter Sandman": folk=4 (straightforward metal, less cerebral crossover)
    - Slayer "Raining Blood": folk=2 (pure aggression, minimal indie crossover)
  Score folk/indie HIGH (7–9) for: atmospheric, psychedelic, emotionally intense, conceptually deep, or
  progressive music. Score LOW (1–3) ONLY for pure aggression with zero melodic/cerebral qualities.
  If spectrum scores show atmosphere≥6, psychedelic≥5, or concept≥6, folk/indie should be at least 7.

SONG PROFILE:
${contextParts.join('\n\n')}

Return only valid JSON:
{ "metal": 8, "rock": 7, "pop": 3, "hiphop": 4, "electronic": 6, "folk": 8, "rationale": "One paragraph explaining the scores, especially folk/indie reasoning." }
No markdown, no extra text.`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 500,
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

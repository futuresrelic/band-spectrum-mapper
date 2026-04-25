import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { SongContextAnalysis } from '@band-spectrum-mapper/shared';

const MODEL = 'gpt-4o-mini';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function serialize(record: {
  id: string;
  songId: string;
  model: string;
  titleSignificance: string;
  historicalContext: string;
  lyricalInterpretation: string;
  thematicSynthesis: string;
  overallNarrative: string;
  createdAt: Date;
  updatedAt: Date;
}): SongContextAnalysis {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const AXES = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;

export const songContextService = {
  async getOrCreate(songId: string): Promise<SongContextAnalysis> {
    const existing = await prisma.songContextAnalysis.findUnique({ where: { songId } });
    if (existing) return serialize(existing);
    return songContextService.regenerate(songId);
  },

  async regenerate(songId: string): Promise<SongContextAnalysis> {
    // Gather all available data in parallel
    const [song, research, aiAnalysis, aiSpectrum, coreScore, communityAgg, comments] = await Promise.all([
      prisma.song.findUnique({
        where: { id: songId },
        include: {
          band: true,
          album: true,
          lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
        },
      }),
      prisma.songResearch.findUnique({ where: { songId } }),
      prisma.songAiAnalysis.findUnique({ where: { songId } }),
      prisma.songAiSpectrum.findUnique({ where: { songId } }),
      prisma.songAxisScore.findUnique({ where: { songId } }),
      prisma.userSongRating.aggregate({
        where: { songId, user: { isCommunityExcluded: false, isActive: true } },
        _avg: { aggression: true, complexity: true, atmosphere: true, emotion: true, psychedelic: true, concept: true },
        _count: { _all: true },
      }),
      prisma.songComment.findMany({
        where: { songId },
        select: { text: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    if (!song) throw new HttpError(404, 'Song not found');

    // --- Build prompt sections ---

    const albumLine = song.album
      ? `${song.album.title}${song.album.year ? ` (${song.album.year})` : ''}`
      : null;

    const lyric = song.lyrics[0];
    const lyricsSection = lyric
      ? `=== LYRICS ===\n${lyric.text.slice(0, 5000)}`
      : '=== LYRICS ===\n[No lyrics have been added for this song yet]';

    const researchSection = research?.summary
      ? `=== WIKIPEDIA RESEARCH ===\n${research.summary}`
      : '=== WIKIPEDIA RESEARCH ===\n[No research available — run the Song Research panel first for richer context]';

    const analysisLines: string[] = [];
    if (aiAnalysis) {
      analysisLines.push(
        `Themes: ${(aiAnalysis.themes as string[]).join(', ')}`,
        `Emotional register: ${aiAnalysis.emotionalRegister}`,
        `Conceptual depth: ${aiAnalysis.conceptualDepth}`,
        `Notable craft: ${(aiAnalysis.notableElements as string[]).join(', ')}`,
      );
    }
    const analysisSection = analysisLines.length
      ? `=== PRIOR LYRIC ANALYSIS ===\n${analysisLines.join('\n')}`
      : '';

    const scoreLines: string[] = [];
    if (coreScore) {
      scoreLines.push(
        `Core (manually scored): ${AXES.map((a) => `${a}=${coreScore[a]}`).join(' | ')}`,
      );
    }
    if (aiSpectrum) {
      scoreLines.push(
        `AI spectrum: ${AXES.map((a) => `${a}=${aiSpectrum[a]}`).join(' | ')}`,
        `AI rationale: "${aiSpectrum.rationale}"`,
      );
    }
    if (communityAgg._count._all > 0) {
      const avg = communityAgg._avg;
      scoreLines.push(
        `Community average (${communityAgg._count._all} raters): ${AXES.map((a) => `${a}=${(avg[a] ?? 0).toFixed(1)}`).join(' | ')}`,
      );
    }
    const scoresSection = scoreLines.length
      ? `=== SPECTRUM SCORES (0–10) ===\n${scoreLines.join('\n')}`
      : '';

    const commentsSection = comments.length > 0
      ? `=== COMMUNITY DISCUSSION (${comments.length} comments) ===\n${comments.map((c) => `- "${c.text}"`).join('\n')}`
      : '=== COMMUNITY DISCUSSION ===\n[No listener comments yet]';

    const contextSections = [lyricsSection, researchSection, analysisSection, scoresSection, commentsSection]
      .filter(Boolean)
      .join('\n\n');

    const prompt = `You are a music analyst, literary critic, and cultural historian with deep expertise in progressive metal, art rock, and concept albums. You treat music as serious art and engage with it at the level of an intelligent, passionate critic.

Analyze the song comprehensively using all data provided below.

SONG: "${song.title}"
ARTIST: ${song.band.name}${albumLine ? `\nALBUM: ${albumLine}` : ''}

═══════════════════════════════════════════
CRITICAL PRINCIPLE — THE TITLE AS KEY:
In progressive and art rock, the song title frequently states the central concept that the lyrics orbit but never utter directly. The title is the artist naming what the song is about while trusting the listener to arrive there through imagery alone.
Classic example: "Schism" (Tool) — the word "schism" never appears in the lyrics; the song is entirely constructed of imagery that enacts division without naming it. Apply this lens rigorously to this analysis.
═══════════════════════════════════════════

${contextSections}

Provide your analysis as a JSON object with these exact string fields:

- titleSignificance: What the title means and why it matters. Is it a concept, a reference, a metaphor, an irony, or the key that unlocks everything the lyrics won't say? Be specific. (2–4 sentences)

- historicalContext: Where this song sits in the band's artistic journey, the album's arc, and the cultural/biographical moment it came from. Draw on the research if available. (3–5 sentences)

- lyricalInterpretation: What the lyrics actually mean beneath the surface — metaphors decoded, the narrative unpacked, the subtext named. Be specific about language and imagery in the lyrics themselves. (4–6 sentences)

- thematicSynthesis: How the title, lyrics, context, scores, and community discussion converge into a coherent artistic statement. What is the song doing as a whole work? (3–4 sentences)

- overallNarrative: The complete picture — what this song is ultimately saying, why it resonates, and what makes it significant. If community comments are present, weave the most compelling interpretations in. If NO community comments exist, close with 1–2 sentences that tease listeners into wanting to share their interpretation — something that hints there is a layer of meaning not yet unpacked, or poses a question only a listener who has felt the song deeply could answer. Write as a critic who takes the work seriously and expects the reader to as well. (4–7 sentences)

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
      throw new HttpError(502, 'AI returned invalid JSON for context analysis');
    }

    const str = (key: string) =>
      typeof parsed[key] === 'string' ? (parsed[key] as string) : '';

    const record = await prisma.songContextAnalysis.upsert({
      where: { songId },
      create: {
        songId,
        model: MODEL,
        titleSignificance: str('titleSignificance'),
        historicalContext: str('historicalContext'),
        lyricalInterpretation: str('lyricalInterpretation'),
        thematicSynthesis: str('thematicSynthesis'),
        overallNarrative: str('overallNarrative'),
      },
      update: {
        model: MODEL,
        titleSignificance: str('titleSignificance'),
        historicalContext: str('historicalContext'),
        lyricalInterpretation: str('lyricalInterpretation'),
        thematicSynthesis: str('thematicSynthesis'),
        overallNarrative: str('overallNarrative'),
      },
    });

    return serialize(record);
  },
};

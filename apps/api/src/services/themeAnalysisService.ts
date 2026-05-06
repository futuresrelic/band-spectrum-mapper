import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import { THEME_CATEGORIES } from '@band-spectrum-mapper/shared';
import type { SongThemeScore, ThemeSimilarSong } from '@band-spectrum-mapper/shared';

const MODEL = 'gpt-4o-mini';
const THEME_SLUGS = THEME_CATEGORIES.map((c) => c.slug);

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function serialize(record: {
  id: string;
  songId: string;
  themeSlug: string;
  score: number;
  evidence: string | null;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}): SongThemeScore {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// Build the canonical theme vector (ordered by THEME_CATEGORIES index) for a set of scores
function buildVector(rows: SongThemeScore[]): number[] {
  const bySlug = new Map(rows.map((r) => [r.themeSlug, r.score]));
  return THEME_SLUGS.map((slug) => bySlug.get(slug) ?? 0);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += (a[i]! * b[i]!);
    magA += (a[i]! * a[i]!);
    magB += (b[i]! * b[i]!);
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export const themeAnalysisService = {
  async getScores(songId: string): Promise<SongThemeScore[]> {
    const rows = await prisma.songThemeScore.findMany({ where: { songId } });
    return rows.map(serialize);
  },

  async getOrCreate(songId: string): Promise<SongThemeScore[]> {
    const existing = await prisma.songThemeScore.findMany({ where: { songId } });
    if (existing.length > 0) return existing.map(serialize);
    return themeAnalysisService.regenerate(songId);
  },

  async regenerate(songId: string): Promise<SongThemeScore[]> {
    const [song, aiAnalysis, context] = await Promise.all([
      prisma.song.findUnique({
        where: { id: songId },
        select: {
          id: true,
          title: true,
          band:  { select: { name: true } },
          album: { select: { title: true, year: true } },
          lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
        },
      }),
      prisma.songAiAnalysis.findUnique({
        where: { songId },
        select: { themes: true, conceptualDepth: true, emotionalRegister: true },
      }),
      prisma.songContextAnalysis.findUnique({
        where: { songId },
        select: { overallNarrative: true, thematicSynthesis: true },
      }),
    ]);

    if (!song) throw new HttpError(404, 'Song not found');

    const lyricText = song.lyrics[0]?.text ?? '';
    const themes = THEME_CATEGORIES.map(
      (c) => `"${c.slug}": "${c.label}" — ${c.description}`,
    ).join('\n');

    const prompt = `You are a philosophical music analyst specializing in lyrical meaning and symbolism.

Score the song below against each of the 16 thematic categories (0.0 = not present, 1.0 = central defining theme).
Only assign a score above 0.15 when there is genuine lyrical or conceptual evidence.
For any theme scoring above 0.3, provide a concise evidence string: either a direct lyric quote (≤80 chars) or a 1-sentence rationale.
For themes scoring ≤0.3, set evidence to null.

SONG: "${song.title}" by ${song.band.name}${song.album ? ` — ${song.album.title}${song.album.year ? ` (${song.album.year})` : ''}` : ''}

LYRICS (primary):
${lyricText.slice(0, 3500)}

${aiAnalysis ? `PRIOR AI THEMES: ${JSON.stringify(aiAnalysis.themes)}\nCONCEPTUAL DEPTH: ${aiAnalysis.conceptualDepth}\nEMOTIONAL REGISTER: ${aiAnalysis.emotionalRegister}` : ''}
${context ? `OVERALL NARRATIVE: ${context.overallNarrative.slice(0, 400)}\nTHEMATIC SYNTHESIS: ${context.thematicSynthesis.slice(0, 300)}` : ''}

CATEGORIES:
${themes}

Return ONLY valid JSON — no markdown, no extra text:
{
  "perception":    { "score": 0.0, "evidence": null },
  "ego-death":     { "score": 0.0, "evidence": null },
  "introspection": { "score": 0.0, "evidence": null },
  "shadow-self":   { "score": 0.0, "evidence": null },
  "acceptance":    { "score": 0.0, "evidence": null },
  "transcendence": { "score": 0.0, "evidence": null },
  "spirituality":  { "score": 0.0, "evidence": null },
  "evolution":     { "score": 0.0, "evidence": null },
  "rebirth":       { "score": 0.0, "evidence": null },
  "catharsis":     { "score": 0.0, "evidence": null },
  "communication": { "score": 0.0, "evidence": null },
  "unity":         { "score": 0.0, "evidence": null },
  "warning":       { "score": 0.0, "evidence": null },
  "satire":        { "score": 0.0, "evidence": null },
  "mortality":     { "score": 0.0, "evidence": null },
  "apocalypse":    { "score": 0.0, "evidence": null }
}`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1400,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new HttpError(502, 'AI returned invalid JSON for theme analysis');
    }

    // Upsert all 16 theme rows in a single transaction
    const upserts = THEME_SLUGS.map((slug) => {
      const entry = parsed[slug] as { score?: unknown; evidence?: unknown } | undefined;
      const raw = typeof entry?.score === 'number' ? entry.score : 0;
      const score = Math.min(1, Math.max(0, raw));
      const rawEvidence = typeof entry?.evidence === 'string' ? entry.evidence.slice(0, 500) : null;
      const evidence = rawEvidence && rawEvidence.trim().length > 0 ? rawEvidence.trim() : null;

      return prisma.songThemeScore.upsert({
        where:  { songId_themeSlug: { songId, themeSlug: slug } },
        create: { songId, themeSlug: slug, score, evidence, model: MODEL },
        update: { score, evidence, model: MODEL, updatedAt: new Date() },
      });
    });

    const rows = await prisma.$transaction(upserts);
    return rows.map(serialize);
  },

  async getSimilar(songId: string, bandId?: string): Promise<ThemeSimilarSong[]> {
    // Load theme scores for the target song first
    const target = await prisma.songThemeScore.findMany({ where: { songId } });
    if (target.length === 0) return [];

    const targetVec = buildVector(target.map(serialize));

    // Load all other songs' theme scores (scoped to band if requested)
    const allRows = await prisma.songThemeScore.findMany({
      where: { NOT: { songId }, ...(bandId ? { song: { bandId } } : {}) },
      include: {
        song: {
          select: {
            id: true,
            title: true,
            band:  { select: { name: true, slug: true } },
            album: { select: { title: true } },
          },
        },
      },
    });

    // Group rows by song
    const bySong = new Map<string, {
      rows: SongThemeScore[];
      meta: { title: string; bandName: string; bandSlug: string; albumTitle: string | null };
    }>();

    for (const row of allRows) {
      const sid = row.songId;
      if (!bySong.has(sid)) {
        bySong.set(sid, {
          rows: [],
          meta: {
            title:      row.song.title,
            bandName:   row.song.band.name,
            bandSlug:   row.song.band.slug,
            albumTitle: row.song.album?.title ?? null,
          },
        });
      }
      bySong.get(sid)!.rows.push(serialize(row));
    }

    // Compute cosine similarity for each candidate
    const results: ThemeSimilarSong[] = [];
    for (const [sid, { rows, meta }] of bySong) {
      const vec = buildVector(rows);
      const similarity = cosine(targetVec, vec);
      if (similarity > 0.01) {
        results.push({ songId: sid, ...meta, similarity });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, 5);
  },
};

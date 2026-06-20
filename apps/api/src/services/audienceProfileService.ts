/**
 * Audience Profile Service — Music Identity Framework (Phase O)
 *
 * Scores each song across 10 dimensions (0–100) that describe WHO it appeals to:
 *   progressive, heavy, technical, atmospheric, experimental,
 *   accessible, psychedelic, emotional, aggressive, improvisational
 *
 * Album and Band profiles are pure aggregates (averaged from song profiles),
 * so no additional AI calls are needed at the album/band level.
 */

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const MODEL = 'gpt-4o-mini';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function clamp100(v: unknown): number {
  return Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
}

const DIMENSIONS = [
  'progressive',
  'heavy',
  'technical',
  'atmospheric',
  'experimental',
  'accessible',
  'psychedelic',
  'emotional',
  'aggressive',
  'improvisational',
] as const;

type Dimension = typeof DIMENSIONS[number];

const DIMENSION_DESCRIPTIONS = `
- progressive     (0=straightforward pop structure; 100=avant-garde, non-linear, suite-like, boundary-pushing concepts)
- heavy           (0=gentle/acoustic/minimal; 100=crushing sonic weight, massive distortion, dense intensity)
- technical       (0=simple/basic playing; 100=extreme instrumental virtuosity and compositional sophistication)
- atmospheric     (0=dry/direct/no texture; 100=richly textured, immersive soundscapes, strong mood/ambience)
- experimental    (0=entirely conventional; 100=completely unconventional, unexpected, defies genre conventions)
- accessible      (0=difficult/alienating on first listen; 100=immediately enjoyable, familiar hooks, wide appeal)
- psychedelic     (0=grounded/literal/concrete; 100=surreal, mind-altering, consciousness-expanding, otherworldly)
- emotional       (0=cold/intellectual/detached; 100=deeply emotional, resonant, emotionally overwhelming)
- aggressive      (0=calm/serene/peaceful; 100=confrontational, intense aggression, anger, hostility, attack)
- improvisational (0=tightly composed/scripted; 100=spontaneous, live-feel, exploratory, jazz-like freedom)
`.trim();

interface AudienceScores {
  progressive: number;
  heavy: number;
  technical: number;
  atmospheric: number;
  experimental: number;
  accessible: number;
  psychedelic: number;
  emotional: number;
  aggressive: number;
  improvisational: number;
}

async function buildContext(songId: string): Promise<{ contextLines: string[]; contextJson: string }> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
      id: true,
      title: true,
      isInstrumental: true,
      durationSeconds: true,
      band: { select: { name: true } },
      album: { select: { title: true, year: true, albumType: true } },
      lyrics: { where: { isPrimary: true }, select: { text: true }, take: 1 },
      songTags: { select: { tag: { select: { name: true } } }, take: 20 },
      research: { select: { summary: true } },
      aiSpectrum: { select: { aggression: true, atmosphere: true, psychedelic: true, concept: true, emotion: true, complexity: true } },
      musicScore: { select: { rhythmicComplexity: true, harmonicDepth: true, structuralComplexity: true, sonicDensity: true, tempoEnergy: true, tonalDarkness: true } },
    },
  });
  if (!song) throw new HttpError(404, 'Song not found');

  const lines: string[] = [];
  const ctx: Record<string, unknown> = {};

  lines.push(`Artist: ${song.band.name}`);
  lines.push(`Song: "${song.title}"`);
  ctx['artist'] = song.band.name;
  ctx['title'] = song.title;

  if (song.album) {
    const albumInfo = `${song.album.title}${song.album.year ? ` (${song.album.year})` : ''}${song.album.albumType ? ` [${song.album.albumType}]` : ''}`;
    lines.push(`Album: ${albumInfo}`);
    ctx['album'] = albumInfo;
  }

  if (song.isInstrumental) {
    lines.push('Note: This is an instrumental track.');
    ctx['instrumental'] = true;
  }

  if (song.durationSeconds) {
    const m = Math.floor(song.durationSeconds / 60);
    const s = song.durationSeconds % 60;
    lines.push(`Duration: ${m}:${String(s).padStart(2, '0')}`);
    ctx['duration'] = song.durationSeconds;
  }

  const tagNames = song.songTags.map((st) => st.tag.name);
  if (tagNames.length > 0) {
    lines.push(`Tags: ${tagNames.join(', ')}`);
    ctx['tags'] = tagNames;
  }

  const lyricsText = song.lyrics[0]?.text ?? '';
  if (lyricsText.trim().length > 10) {
    lines.push(`\nLyrics excerpt (first 600 chars):\n${lyricsText.slice(0, 600)}`);
    ctx['hasLyrics'] = true;
  }

  if (song.research?.summary) {
    lines.push(`\nResearch notes: ${song.research.summary.slice(0, 400)}`);
    ctx['hasResearch'] = true;
  }

  if (song.aiSpectrum) {
    const sp = song.aiSpectrum;
    lines.push(`\nLyric/artistic spectrum (0–10): aggression=${sp.aggression} atmosphere=${sp.atmosphere} psychedelic=${sp.psychedelic} concept=${sp.concept} emotion=${sp.emotion} complexity=${sp.complexity}`);
    ctx['lyricSpectrum'] = sp;
  }

  if (song.musicScore) {
    const ms = song.musicScore;
    lines.push(`\nMusical structure spectrum (0–10): rhythmicComplexity=${ms.rhythmicComplexity} harmonicDepth=${ms.harmonicDepth} structuralComplexity=${ms.structuralComplexity} sonicDensity=${ms.sonicDensity} tempoEnergy=${ms.tempoEnergy} tonalDarkness=${ms.tonalDarkness}`);
    ctx['musicScore'] = ms;
  }

  return { contextLines: lines, contextJson: JSON.stringify(ctx) };
}

type SongAudienceProfileRecord = {
  id: string;
  songId: string;
  model: string;
  progressive: number;
  heavy: number;
  technical: number;
  atmospheric: number;
  experimental: number;
  accessible: number;
  psychedelic: number;
  emotional: number;
  aggressive: number;
  improvisational: number;
  rationales: unknown;
  contextJson: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatSongRecord(r: SongAudienceProfileRecord) {
  return {
    ...r,
    rationales: r.rationales as Record<string, string>,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

type AlbumAudienceProfileRecord = {
  id: string;
  albumId: string;
  progressive: number;
  heavy: number;
  technical: number;
  atmospheric: number;
  experimental: number;
  accessible: number;
  psychedelic: number;
  emotional: number;
  aggressive: number;
  improvisational: number;
  songCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function formatAlbumRecord(r: AlbumAudienceProfileRecord) {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}

type BandAudienceProfileRecord = {
  id: string;
  bandId: string;
  progressive: number;
  heavy: number;
  technical: number;
  atmospheric: number;
  experimental: number;
  accessible: number;
  psychedelic: number;
  emotional: number;
  aggressive: number;
  improvisational: number;
  songCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function formatBandRecord(r: BandAudienceProfileRecord) {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}

export const audienceProfileService = {
  async getOrCreate(songId: string) {
    const existing = await prisma.songAudienceProfile.findUnique({ where: { songId } });
    if (existing) return formatSongRecord(existing);
    return this.regenerate(songId);
  },

  async regenerate(songId: string) {
    const { contextLines, contextJson } = await buildContext(songId);

    const prompt = `You are a music analyst specialising in audience identity profiles. Score this song on 10 dimensions (0–100 each, integers only) that describe WHO the song appeals to and what kind of music it is.

${DIMENSION_DESCRIPTIONS}

Rules:
- Use the full 0–100 range — avoid clustering at 50
- Scores should be consistent: accessible and experimental tend to be inversely related
- For instrumentals, reason from artist style, album context, tags, and any research
- heavy ≠ aggressive: a dense ambient wall of sound can score high on heavy but low on aggressive

Return ONLY valid JSON with these exact keys: progressive, heavy, technical, atmospheric, experimental, accessible, psychedelic, emotional, aggressive, improvisational, rationales.
rationales: an object with the same 10 keys, each containing one sentence explaining the score.

Song context:
${contextLines.join('\n')}`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(cleaned) as Record<string, unknown>; }
    catch { throw new HttpError(502, 'AI returned invalid JSON for audience profile'); }

    const rationales: Record<string, string> = {};
    const rationalesRaw = parsed['rationales'];
    if (rationalesRaw && typeof rationalesRaw === 'object') {
      for (const dim of DIMENSIONS) {
        const val = (rationalesRaw as Record<string, unknown>)[dim];
        if (typeof val === 'string') rationales[dim] = val;
      }
    }

    const scores: AudienceScores = {
      progressive:     clamp100(parsed['progressive']),
      heavy:           clamp100(parsed['heavy']),
      technical:       clamp100(parsed['technical']),
      atmospheric:     clamp100(parsed['atmospheric']),
      experimental:    clamp100(parsed['experimental']),
      accessible:      clamp100(parsed['accessible']),
      psychedelic:     clamp100(parsed['psychedelic']),
      emotional:       clamp100(parsed['emotional']),
      aggressive:      clamp100(parsed['aggressive']),
      improvisational: clamp100(parsed['improvisational']),
    };

    const record = await prisma.songAudienceProfile.upsert({
      where: { songId },
      create: { songId, model: MODEL, ...scores, rationales, contextJson },
      update: { model: MODEL, ...scores, rationales, contextJson },
    });

    return formatSongRecord(record);
  },

  async getOrCreateAlbum(albumId: string) {
    const existing = await prisma.albumAudienceProfile.findUnique({ where: { albumId } });
    if (existing) return formatAlbumRecord(existing);
    return this.regenerateAlbum(albumId);
  },

  async regenerateAlbum(albumId: string) {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, songs: { select: { id: true, audienceProfile: true } } },
    });
    if (!album) throw new HttpError(404, 'Album not found');

    const profiles = album.songs
      .map((s) => s.audienceProfile)
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const songCount = profiles.length;

    const averages: AudienceScores = {
      progressive: 0, heavy: 0, technical: 0, atmospheric: 0, experimental: 0,
      accessible: 0, psychedelic: 0, emotional: 0, aggressive: 0, improvisational: 0,
    };

    if (songCount > 0) {
      for (const p of profiles) {
        for (const dim of DIMENSIONS) {
          averages[dim] += p[dim];
        }
      }
      for (const dim of DIMENSIONS) {
        averages[dim] = Math.round(averages[dim] / songCount);
      }
    }

    const record = await prisma.albumAudienceProfile.upsert({
      where: { albumId },
      create: { albumId, ...averages, songCount },
      update: { ...averages, songCount },
    });

    return formatAlbumRecord(record);
  },

  async getOrCreateBand(bandId: string) {
    const existing = await prisma.bandAudienceProfile.findUnique({ where: { bandId } });
    if (existing) return formatBandRecord(existing);
    return this.regenerateBand(bandId);
  },

  async regenerateBand(bandId: string) {
    const band = await prisma.band.findUnique({
      where: { id: bandId },
      select: { id: true, songs: { select: { id: true, audienceProfile: true } } },
    });
    if (!band) throw new HttpError(404, 'Band not found');

    const profiles = band.songs
      .map((s) => s.audienceProfile)
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const songCount = profiles.length;

    const averages: AudienceScores = {
      progressive: 0, heavy: 0, technical: 0, atmospheric: 0, experimental: 0,
      accessible: 0, psychedelic: 0, emotional: 0, aggressive: 0, improvisational: 0,
    };

    if (songCount > 0) {
      for (const p of profiles) {
        for (const dim of DIMENSIONS) {
          averages[dim] += p[dim];
        }
      }
      for (const dim of DIMENSIONS) {
        averages[dim] = Math.round(averages[dim] / songCount);
      }
    }

    const record = await prisma.bandAudienceProfile.upsert({
      where: { bandId },
      create: { bandId, ...averages, songCount },
      update: { ...averages, songCount },
    });

    return formatBandRecord(record);
  },
};

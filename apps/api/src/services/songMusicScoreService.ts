/**
 * Musical Structure Spectrum — AI scoring of musical characteristics.
 *
 * Unlike the lyric/emotional spectrum (aggression, emotion, psychedelic…),
 * this scores HOW the music is built:
 *   rhythmicComplexity, harmonicDepth, structuralComplexity,
 *   sonicDensity, tempoEnergy, tonalDarkness
 *
 * Works well for instrumental bands. Uses all available context:
 * song title, album, genre tags, lyrics (if any), research, audio features.
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

function clamp(v: unknown): number {
  return Math.min(10, Math.max(0, Math.round(Number(v) || 0) * 10) / 10);
}

const AXIS_DESCRIPTIONS = `
- rhythmicComplexity  (0=steady 4/4 pop pulse; 10=extreme polymetry / polyrhythm / constantly shifting time signatures)
- harmonicDepth       (0=simple power chords or major/minor triads; 10=dense jazz harmony / extended chords / microtonality / atonality)
- structuralComplexity (0=standard verse-chorus-verse pop; 10=through-composed, suite-like, prog epic with no repeated sections)
- sonicDensity        (0=sparse / single instrument / minimal; 10=dense / heavily layered / full orchestra or wall-of-sound)
- tempoEnergy         (0=slow / meditative / ambient drone; 10=extremely fast / relentless / high-octane)
- tonalDarkness       (0=bright / major key / uplifting / consonant; 10=dark / minor or atonal / dissonant / foreboding)
`.trim();

interface MusicScoreResult {
  rhythmicComplexity: number;
  harmonicDepth: number;
  structuralComplexity: number;
  sonicDensity: number;
  tempoEnergy: number;
  tonalDarkness: number;
  rationale: string;
  contextJson: string;
}

interface AudioFeatureSnapshot {
  bpm?: number;
  bpmConfidence?: number;
  key?: string;
  keyConfidence?: number;
  timeSignature?: string;
  polyrhythmic?: boolean;
  loudnessMeanDb?: number;
  dynamicRange?: number;
  rhythmicDensity?: number;
  spectralCentroid?: number;
  spectralContrast?: number;
  sectionCount?: number;
}

function extractAudioFeatures(raw: unknown): AudioFeatureSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const features = (a['features'] as Record<string, unknown> | undefined) ?? {};
  const loudness = (a['loudness'] as Record<string, unknown> | undefined) ?? {};
  const sections = Array.isArray(a['sections']) ? a['sections'] as unknown[] : [];

  const snapshot: AudioFeatureSnapshot = {};
  if (typeof a['bpm'] === 'number')            snapshot.bpm           = Math.round(a['bpm'] * 10) / 10;
  if (typeof a['bpmConfidence'] === 'number')  snapshot.bpmConfidence = a['bpmConfidence'];
  if (typeof a['key'] === 'string')            snapshot.key           = a['key'];
  if (typeof a['keyConfidence'] === 'number')  snapshot.keyConfidence = a['keyConfidence'];
  if (typeof a['timeSignature'] === 'string')  snapshot.timeSignature = a['timeSignature'];
  if (typeof a['polyrhythmic'] === 'boolean')  snapshot.polyrhythmic  = a['polyrhythmic'];
  if (typeof loudness['meanDb'] === 'number')  snapshot.loudnessMeanDb  = Math.round(loudness['meanDb'] * 10) / 10;
  if (typeof loudness['dynamicRange'] === 'number') snapshot.dynamicRange = Math.round(loudness['dynamicRange'] * 10) / 10;
  if (typeof features['rhythmicDensity'] === 'number')   snapshot.rhythmicDensity   = Math.round(features['rhythmicDensity'] * 100) / 100;
  if (typeof features['spectralCentroid'] === 'number')  snapshot.spectralCentroid  = Math.round(features['spectralCentroid']);
  if (typeof features['spectralContrast'] === 'number')  snapshot.spectralContrast  = Math.round(features['spectralContrast'] * 10) / 10;
  if (sections.length > 0) snapshot.sectionCount = sections.length;

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

async function buildContext(songId: string): Promise<{
  contextLines: string[];
  contextJson: string;
}> {
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
      aiSpectrum: { select: { aggression: true, atmosphere: true, psychedelic: true, concept: true, rationale: true } },
      spectrumAnalyses: {
        select: { audioAnalysis: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
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
    lines.push('Note: This is an instrumental track (no lyrics).');
    ctx['instrumental'] = true;
  }

  if (song.durationSeconds) {
    const m = Math.floor(song.durationSeconds / 60);
    const s = song.durationSeconds % 60;
    lines.push(`Duration: ${m}:${String(s).padStart(2, '0')}`);
    ctx['duration'] = song.durationSeconds;
  }

  const tagNames = song.songTags.map(st => st.tag.name);
  if (tagNames.length > 0) {
    lines.push(`Tags: ${tagNames.join(', ')}`);
    ctx['tags'] = tagNames;
  }

  const lyricsText = song.lyrics[0]?.text ?? '';
  if (lyricsText.trim().length > 10) {
    lines.push(`\nLyrics excerpt (first 800 chars):\n${lyricsText.slice(0, 800)}`);
    ctx['hasLyrics'] = true;
  }

  if (song.research?.summary) {
    lines.push(`\nResearch notes: ${song.research.summary.slice(0, 500)}`);
    ctx['hasResearch'] = true;
  }

  if (song.aiSpectrum) {
    lines.push(`\nEmotional/lyrical spectrum (for reference): aggression=${song.aiSpectrum.aggression} atmosphere=${song.aiSpectrum.atmosphere} psychedelic=${song.aiSpectrum.psychedelic} concept=${song.aiSpectrum.concept}`);
  }

  // Audio analysis from the Python worker (if this song has been run through Song Spectrum Analyzer)
  const audioRaw = song.spectrumAnalyses[0]?.audioAnalysis ?? null;
  const audio = extractAudioFeatures(audioRaw);
  if (audio) {
    const audioLines: string[] = [];
    if (audio.bpm !== undefined)          audioLines.push(`BPM: ${audio.bpm}${audio.bpmConfidence !== undefined ? ` (confidence ${(audio.bpmConfidence * 100).toFixed(0)}%)` : ''}`);
    if (audio.key !== undefined)          audioLines.push(`Key: ${audio.key}${audio.keyConfidence !== undefined ? ` (confidence ${(audio.keyConfidence * 100).toFixed(0)}%)` : ''}`);
    if (audio.timeSignature !== undefined) audioLines.push(`Time signature: ${audio.timeSignature}`);
    if (audio.polyrhythmic !== undefined)  audioLines.push(`Polyrhythmic: ${audio.polyrhythmic ? 'yes' : 'no'}`);
    if (audio.loudnessMeanDb !== undefined) audioLines.push(`Loudness mean: ${audio.loudnessMeanDb} dB`);
    if (audio.dynamicRange !== undefined)  audioLines.push(`Dynamic range: ${audio.dynamicRange} dB`);
    if (audio.rhythmicDensity !== undefined) audioLines.push(`Rhythmic density (onsets/s): ${audio.rhythmicDensity}`);
    if (audio.spectralCentroid !== undefined) audioLines.push(`Spectral centroid: ${audio.spectralCentroid} Hz`);
    if (audio.spectralContrast !== undefined) audioLines.push(`Spectral contrast: ${audio.spectralContrast} dB`);
    if (audio.sectionCount !== undefined)  audioLines.push(`Detected sections: ${audio.sectionCount}`);
    lines.push(`\nAudio analysis (from Python worker):\n${audioLines.join('\n')}`);
    ctx['audioFeatures'] = audio;
  }

  return { contextLines: lines, contextJson: JSON.stringify(ctx) };
}

export const songMusicScoreService = {
  async getOrCreate(songId: string): Promise<MusicScoreResult & { id: string; songId: string; createdAt: string; updatedAt: string }> {
    const existing = await prisma.songMusicScore.findUnique({ where: { songId } });
    if (existing) {
      return { ...existing, createdAt: existing.createdAt.toISOString(), updatedAt: existing.updatedAt.toISOString() };
    }
    return this.regenerate(songId);
  },

  async regenerate(songId: string): Promise<MusicScoreResult & { id: string; songId: string; createdAt: string; updatedAt: string }> {
    const { contextLines, contextJson } = await buildContext(songId);

    const prompt = `You are a music theory analyst. Based on the information below, score this song on 6 musical structure axes (0–10 each, one decimal place allowed).

${AXIS_DESCRIPTIONS}

Scoring guidelines:
- Use the full 0–10 range — don't cluster everything at 5
- For instrumentals, reason from the artist's known style, album context, song title, tags, and any research notes
- "Rhythmic complexity" is about time signature stability and polyrhythm, not just speed
- "Harmonic depth" is about chord vocabulary and tonality, not just darkness
- Consider duration: a 2-minute song is unlikely to be structurally complex (10); a 20-minute suite might be

Return ONLY valid JSON with keys: rhythmicComplexity, harmonicDepth, structuralComplexity, sonicDensity, tempoEnergy, tonalDarkness, rationale.
rationale: one sentence explaining the key musical reasoning.

Song context:
${contextLines.join('\n')}`;

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(cleaned) as Record<string, unknown>; }
    catch { throw new HttpError(502, 'AI returned invalid JSON for music scoring'); }

    const rationale = typeof parsed['rationale'] === 'string' ? parsed['rationale'] : '';

    const data = {
      model: MODEL,
      rhythmicComplexity:   clamp(parsed['rhythmicComplexity']),
      harmonicDepth:        clamp(parsed['harmonicDepth']),
      structuralComplexity: clamp(parsed['structuralComplexity']),
      sonicDensity:         clamp(parsed['sonicDensity']),
      tempoEnergy:          clamp(parsed['tempoEnergy']),
      tonalDarkness:        clamp(parsed['tonalDarkness']),
      rationale,
      contextJson,
    };

    const record = await prisma.songMusicScore.upsert({
      where: { songId },
      create: { songId, ...data },
      update: { ...data },
    });

    return { ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
  },
};

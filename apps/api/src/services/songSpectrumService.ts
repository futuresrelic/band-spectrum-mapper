/**
 * Song Spectrum Analyzer — service layer.
 *
 * Feature flags:
 *   AUDIO_WORKER_URL   — Python FastAPI audio analysis service URL
 *   YOUTUBE_API_KEY    — YouTube Data API v3 key (metadata only, no download)
 */

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import type {
  SongSpectrumAnalysis,
  YouTubeMetadata,
  AudioAnalysisResult,
  MusicBrainzSongData,
  RhythmResearch,
  ScoreAxisDetail,
  SpectrumScores,
  RhythmBand,
  RhythmAnalysisResult,
} from '@band-spectrum-mapper/shared';

// ---------------------------------------------------------------------------
// Feature-flag helpers
// ---------------------------------------------------------------------------

export function isAudioWorkerConfigured(): boolean {
  return Boolean(process.env['AUDIO_WORKER_URL']);
}

export function isYouTubeConfigured(): boolean {
  return Boolean(process.env['YOUTUBE_API_KEY']);
}

export function isYouTubeAudioEnabled(): boolean {
  return (
    isAudioWorkerConfigured() &&
    process.env['ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT'] === 'true'
  );
}

// ---------------------------------------------------------------------------
// Worker diagnostics — proxies to Python worker GET /diagnostics
// ---------------------------------------------------------------------------

export interface WorkerDiagnostics {
  ytDlpInstalled: boolean;
  ytDlpVersion: string | null;
  ytDlpPath: string | null;
  ffmpegInstalled: boolean;
  ffmpegVersion: string | null;
  ffmpegPath: string | null;
  tempDirectoryWritable: boolean;
  cookiesConfigured: boolean;
  youtubeEnabled: boolean;
  maxUploadMb: number;
  platform: string;
  pythonVersion: string;
  // Local API-side additions
  workerUrl: string | null;
  workerReachable: boolean;
  nodeYoutubeAudioEnabled: boolean;
}

export async function getWorkerDiagnostics(): Promise<WorkerDiagnostics> {
  const workerUrl = process.env['AUDIO_WORKER_URL']?.replace(/\/$/, '') ?? null;
  const nodeYoutubeAudioEnabled = isYouTubeAudioEnabled();

  if (!workerUrl) {
    return {
      ytDlpInstalled: false, ytDlpVersion: null, ytDlpPath: null,
      ffmpegInstalled: false, ffmpegVersion: null, ffmpegPath: null,
      tempDirectoryWritable: false, cookiesConfigured: false,
      youtubeEnabled: false, maxUploadMb: 0,
      platform: 'unknown', pythonVersion: 'unknown',
      workerUrl: null, workerReachable: false, nodeYoutubeAudioEnabled,
    };
  }

  try {
    const res = await fetch(`${workerUrl}/diagnostics`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Worker returned ${res.status}`);
    const data = await res.json() as Omit<WorkerDiagnostics, 'workerUrl' | 'workerReachable' | 'nodeYoutubeAudioEnabled'>;
    return { ...data, workerUrl, workerReachable: true, nodeYoutubeAudioEnabled };
  } catch {
    return {
      ytDlpInstalled: false, ytDlpVersion: null, ytDlpPath: null,
      ffmpegInstalled: false, ffmpegVersion: null, ffmpegPath: null,
      tempDirectoryWritable: false, cookiesConfigured: false,
      youtubeEnabled: false, maxUploadMb: 0,
      platform: 'unknown', pythonVersion: 'unknown',
      workerUrl, workerReachable: false, nodeYoutubeAudioEnabled,
    };
  }
}

// ---------------------------------------------------------------------------
// YouTube metadata — official Data API v3 only, no audio download
// ---------------------------------------------------------------------------

function extractVideoId(urlOrId: string): string | null {
  // Already a plain ID (11 chars, no slashes)
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;

  try {
    const u = new URL(urlOrId);
    // youtube.com/watch?v=
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return u.searchParams.get('v');
    }
    // youtu.be/<id>
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null;
    }
    // youtube.com/embed/<id>  or  youtube.com/shorts/<id>
    const pathMatch = u.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch) return pathMatch[2] ?? null;
  } catch {
    // not a valid URL
  }
  return null;
}

function iso8601ToSeconds(duration: string): number | null {
  // PT4M33S → 273
  const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = parseInt(m[1] ?? '0', 10);
  const min = parseInt(m[2] ?? '0', 10);
  const sec = parseInt(m[3] ?? '0', 10);
  return h * 3600 + min * 60 + sec;
}

export async function fetchYouTubeMetadata(urlOrId: string): Promise<YouTubeMetadata> {
  if (!isYouTubeConfigured()) {
    throw Object.assign(new Error('YouTube API key not configured'), { statusCode: 503 });
  }

  const videoId = extractVideoId(urlOrId);
  if (!videoId) {
    throw Object.assign(new Error('Cannot extract a valid YouTube video ID from the provided URL'), { statusCode: 400 });
  }

  const apiKey = process.env['YOUTUBE_API_KEY']!;
  const endpoint =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails` +
    `&id=${encodeURIComponent(videoId)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(endpoint);
  if (!res.ok) {
    throw Object.assign(
      new Error(`YouTube API error: ${res.status} ${res.statusText}`),
      { statusCode: 502 },
    );
  }

  const body = (await res.json()) as {
    items?: {
      snippet: {
        title: string;
        channelTitle: string;
        description: string;
        publishedAt: string;
        thumbnails?: { high?: { url: string }; medium?: { url: string } };
        tags?: string[];
        categoryId?: string;
      };
      contentDetails?: { duration?: string };
    }[];
  };

  if (!body.items || body.items.length === 0) {
    throw Object.assign(new Error(`Video not found: ${videoId}`), { statusCode: 404 });
  }

  const item = body.items[0]!;
  const snippet = item.snippet;
  const isoDuration = item.contentDetails?.duration ?? null;

  return {
    videoId,
    title: snippet.title,
    channel: snippet.channelTitle,
    description: snippet.description,
    publishedAt: snippet.publishedAt,
    thumbnailUrl:
      snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? null,
    duration: isoDuration,
    durationSeconds: isoDuration ? iso8601ToSeconds(isoDuration) : null,
    tags: snippet.tags ?? [],
    categoryId: snippet.categoryId ?? null,
  };
}

// ---------------------------------------------------------------------------
// MusicBrainz lookup — free, no auth, rate-limit: 1 req/s
// ---------------------------------------------------------------------------

export async function fetchMusicBrainzData(
  artistName: string,
  songTitle: string,
): Promise<MusicBrainzSongData | null> {
  try {
    const q = encodeURIComponent(`recording:"${songTitle}" AND artist:"${artistName}"`);
    const url = `https://musicbrainz.org/ws/2/recording/?query=${q}&fmt=json&limit=5`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BandSpectrumMapper/1.0 (https://github.com/futuresrelic/band-spectrum-mapper)',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return null;

    const body = await res.json() as {
      recordings?: {
        id: string;
        title: string;
        disambiguation?: string;
        tags?: { name: string; count: number }[];
        genres?: { name: string; count: number }[];
        releases?: {
          title: string;
          date?: string;
        }[];
      }[];
    };

    const recordings = body.recordings ?? [];
    if (!recordings.length) return null;

    // Pick the best match: first recording whose title matches closely
    const lowerTitle = songTitle.toLowerCase();
    const match = recordings.find(
      (r) => r.title.toLowerCase() === lowerTitle,
    ) ?? recordings[0]!;

    const genres = (match.genres ?? [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((g) => g.name);

    const tags = (match.tags ?? [])
      .filter((t) => !genres.includes(t.name))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((t) => t.name);

    const release = match.releases?.[0] ?? null;

    return {
      recordingId: match.id,
      genres,
      tags,
      disambiguation: match.disambiguation ?? null,
      releaseTitle: release?.title ?? null,
      releaseDate: release?.date ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GPT rhythm research — uses existing OPENAI_API_KEY, no new dependencies.
// Returns known time signatures, polyrhythm status, and a brief explanation
// drawn from GPT's training data (which includes MuseScore, Wikipedia, etc.).
// Gracefully returns null when the key is absent or the call fails.
// ---------------------------------------------------------------------------

const RHYTHM_MODEL = 'gpt-4o-mini';

const RHYTHM_PROMPT = `You are a music theory expert with deep knowledge of rhythm and meter.
Given a song, return ONLY a valid JSON object (no markdown, no extra text) with exactly these fields:

{
  "timeSignatures": [],      // array of time signature strings found in the song, e.g. ["9/8","8/8","7/8","5/4"]
  "polyrhythmic": false,     // true if the song uses polyrhythm or multiple simultaneous meters
  "bpmRange": null,          // string describing the tempo, e.g. "≈ 85 quarter-note BPM" or null if unknown
  "notes": null              // 1–2 sentence explanation of the rhythmic structure, or null if unknown
}

If you don't recognise the song or have no reliable information, return:
{"timeSignatures": [], "polyrhythmic": false, "bpmRange": null, "notes": null}`;

export async function fetchRhythmResearch(
  artistName: string,
  songTitle: string,
): Promise<RhythmResearch | null> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) return null;

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: RHYTHM_MODEL,
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: 'system', content: RHYTHM_PROMPT },
        { role: 'user', content: `Song: "${songTitle}" by ${artistName}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(cleaned) as Record<string, unknown>; }
    catch { return null; }

    const toStrArr = (v: unknown): string[] =>
      Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === 'string') as string[] : [];

    return {
      timeSignatures: toStrArr(parsed['timeSignatures']),
      polyrhythmic: Boolean(parsed['polyrhythmic']),
      bpmRange: typeof parsed['bpmRange'] === 'string' ? parsed['bpmRange'] : null,
      notes: typeof parsed['notes'] === 'string' ? parsed['notes'] : null,
      model: RHYTHM_MODEL,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Audio analysis — proxy to Python worker
// ---------------------------------------------------------------------------

// Railway cold-start helper: if the worker returns 502 or 503 (the Railway
// load-balancer refusing connections while the Python service boots), wait
// 10 s then retry once.
//
// IMPORTANT: do NOT retry 422 — the Python worker uses 422 specifically for
// yt-dlp download failures (403/429 from YouTube).  Retrying those just
// hammers YouTube's rate-limit and makes the next request fail faster.
async function workerFetch(
  url: string,
  init: RequestInit,
  attempt: () => RequestInit,
): Promise<Response> {
  let res = await fetch(url, init);
  if (res.status === 502 || res.status === 503) {
    // Clone the body check without consuming it: peek at the text to rule out
    // a "yt-dlp failed" body returned with 502 by an older worker version.
    const body = await res.text().catch(() => '');
    if (body.includes('yt-dlp failed')) {
      // Reconstruct a response so callers can read the body normally.
      return new Response(body, { status: res.status, headers: res.headers });
    }
    await new Promise<void>((r) => setTimeout(r, 10_000));
    res = await fetch(url, attempt());
  }
  return res;
}

export async function analyzeAudio(
  fileBuffer: Buffer,
  filename: string,
  lyricsContext: string = '',
): Promise<{ analysis: AudioAnalysisResult; scores: Record<string, ScoreAxisDetail> }> {
  if (!isAudioWorkerConfigured()) {
    throw Object.assign(
      new Error('Audio analysis worker not configured. Set AUDIO_WORKER_URL environment variable.'),
      { statusCode: 503 },
    );
  }

  const workerUrl = process.env['AUDIO_WORKER_URL']!.replace(/\/$/, '');

  function buildForm(): RequestInit {
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), filename);
    formData.append('lyrics_context', lyricsContext);
    return { method: 'POST', body: formData };
  }

  const res = await workerFetch(`${workerUrl}/analyze`, buildForm(), buildForm);

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw Object.assign(
      new Error(`Audio worker error (${res.status}): ${detail}`),
      { statusCode: res.status >= 500 ? 502 : res.status },
    );
  }

  return res.json() as Promise<{
    analysis: AudioAnalysisResult;
    scores: Record<string, ScoreAxisDetail>;
  }>;
}

// ---------------------------------------------------------------------------
// YouTube analysis cache — avoids re-downloading audio for the same URL.
//
// The Python analysis pipeline is expensive (yt-dlp download + librosa).
// If we already have an AudioAnalysisResult for this URL in the DB (within
// the TTL), we re-score it via the lightweight /score worker endpoint
// instead of re-running the full pipeline.
//
// Cache TTL: 30 days.  Cache key: normalized YouTube URL.
// Only the audio features are cached; scores are always recomputed because
// they depend on the per-call lyricsContext.
// ---------------------------------------------------------------------------

const YOUTUBE_ANALYSIS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function findCachedYoutubeAnalysis(youtubeUrl: string): Promise<AudioAnalysisResult | null> {
  const cutoff = new Date(Date.now() - YOUTUBE_ANALYSIS_CACHE_TTL_MS);
  const row = await prisma.songSpectrumAnalysis.findFirst({
    where: {
      youtubeUrl,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: 'desc' },
    select: { audioAnalysis: true },
  });
  if (!row || !row.audioAnalysis) return null;
  return row.audioAnalysis as unknown as AudioAnalysisResult;
}

async function scoreAnalysisFromWorker(
  workerUrl: string,
  analysis: AudioAnalysisResult,
  lyricsContext: string,
): Promise<Record<string, ScoreAxisDetail>> {
  try {
    const res = await fetch(`${workerUrl}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis, lyrics_context: lyricsContext }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return res.json() as Promise<Record<string, ScoreAxisDetail>>;
  } catch (err) {
    console.warn('[songSpectrumService] /score request failed, returning empty scores:', err);
  }
  return {};
}

// ---------------------------------------------------------------------------
// YouTube audio analysis — calls Python worker /analyze-youtube endpoint.
// Requires ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true on BOTH the Node.js API
// and the Python worker (defense in depth).
// ---------------------------------------------------------------------------

export async function analyzeAudioFromYouTube(
  youtubeUrl: string,
  lyricsContext: string = '',
): Promise<{ analysis: AudioAnalysisResult; scores: Record<string, ScoreAxisDetail>; fromCache?: boolean }> {
  if (!isAudioWorkerConfigured()) {
    throw Object.assign(
      new Error('Audio analysis worker not configured. Set AUDIO_WORKER_URL.'),
      { statusCode: 503 },
    );
  }
  if (process.env['ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT'] !== 'true') {
    throw Object.assign(
      new Error('YouTube audio import is disabled. Set ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true (local use only).'),
      { statusCode: 403 },
    );
  }

  const workerUrl = process.env['AUDIO_WORKER_URL']!.replace(/\/$/, '');

  // Cache check: skip the yt-dlp download if we already have analysis data
  // for this URL within the 30-day TTL.
  const cachedAnalysis = await findCachedYoutubeAnalysis(youtubeUrl);
  if (cachedAnalysis) {
    console.log(`[songSpectrumService] Cache hit for ${youtubeUrl} — skipping yt-dlp download`);
    const scores = await scoreAnalysisFromWorker(workerUrl, cachedAnalysis, lyricsContext);
    return { analysis: cachedAnalysis, scores, fromCache: true };
  }

  const buildInit = (): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ youtube_url: youtubeUrl, lyrics_context: lyricsContext }),
    signal: AbortSignal.timeout(240_000),
  });

  const res = await workerFetch(`${workerUrl}/analyze-youtube`, buildInit(), buildInit);

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw Object.assign(
      new Error(`Audio worker error (${res.status}): ${detail}`),
      { statusCode: res.status >= 500 ? 502 : res.status },
    );
  }

  return res.json() as Promise<{
    analysis: AudioAnalysisResult;
    scores: Record<string, ScoreAxisDetail>;
  }>;
}

// ---------------------------------------------------------------------------
// Rhythm band analysis — proxy to Python worker
// ---------------------------------------------------------------------------

export async function analyzeRhythmBands(
  fileBuffer: Buffer,
  filename: string,
  bands: RhythmBand[],
): Promise<RhythmAnalysisResult> {
  if (!isAudioWorkerConfigured()) {
    throw Object.assign(
      new Error('Audio analysis worker not configured. Set AUDIO_WORKER_URL environment variable.'),
      { statusCode: 503 },
    );
  }

  const workerUrl = process.env['AUDIO_WORKER_URL']!.replace(/\/$/, '');

  function buildForm(): RequestInit {
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), filename);
    formData.append('bands', JSON.stringify(
      bands.map((b) => ({ label: b.label, min_hz: b.minHz, max_hz: b.maxHz }))
    ));
    return { method: 'POST', body: formData, signal: AbortSignal.timeout(120_000) };
  }

  const res = await workerFetch(`${workerUrl}/analyze-rhythm`, buildForm(), buildForm);

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw Object.assign(
      new Error(`Audio worker error (${res.status}): ${detail}`),
      { statusCode: res.status >= 500 ? 502 : res.status },
    );
  }

  return res.json() as Promise<RhythmAnalysisResult>;
}

export async function analyzeRhythmBandsFromYouTube(
  youtubeUrl: string,
  bands: RhythmBand[],
): Promise<RhythmAnalysisResult> {
  if (!isAudioWorkerConfigured()) {
    throw Object.assign(
      new Error('Audio analysis worker not configured. Set AUDIO_WORKER_URL environment variable.'),
      { statusCode: 503 },
    );
  }
  if (process.env['ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT'] !== 'true') {
    throw Object.assign(
      new Error('YouTube audio import is disabled. Set ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true (local use only).'),
      { statusCode: 403 },
    );
  }

  const workerUrl = process.env['AUDIO_WORKER_URL']!.replace(/\/$/, '');

  const buildInit = (): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      youtube_url: youtubeUrl,
      bands: bands.map((b) => ({ label: b.label, min_hz: b.minHz, max_hz: b.maxHz })),
    }),
    signal: AbortSignal.timeout(240_000),
  });

  const res = await workerFetch(`${workerUrl}/analyze-rhythm-youtube`, buildInit(), buildInit);

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw Object.assign(
      new Error(`Audio worker error (${res.status}): ${detail}`),
      { statusCode: res.status >= 500 ? 502 : res.status },
    );
  }

  return res.json() as Promise<RhythmAnalysisResult>;
}

// ---------------------------------------------------------------------------
// Combined spectrum + rhythm analysis from YouTube — one yt-dlp download
// ---------------------------------------------------------------------------

export async function analyzeFullFromYouTube(
  youtubeUrl: string,
  lyricsContext: string = '',
  bands: RhythmBand[] = [],
): Promise<{ analysis: AudioAnalysisResult; scores: Record<string, ScoreAxisDetail>; rhythm: RhythmAnalysisResult }> {
  if (!isAudioWorkerConfigured()) {
    throw Object.assign(
      new Error('Audio analysis worker not configured. Set AUDIO_WORKER_URL.'),
      { statusCode: 503 },
    );
  }
  if (process.env['ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT'] !== 'true') {
    throw Object.assign(
      new Error('YouTube audio import is disabled. Set ENABLE_LOCAL_YOUTUBE_AUDIO_IMPORT=true (local use only).'),
      { statusCode: 403 },
    );
  }

  const workerUrl = process.env['AUDIO_WORKER_URL']!.replace(/\/$/, '');

  const buildInit = (): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      youtube_url: youtubeUrl,
      lyrics_context: lyricsContext,
      bands: bands.map((b) => ({ label: b.label, min_hz: b.minHz, max_hz: b.maxHz })),
    }),
    signal: AbortSignal.timeout(300_000),
  });

  const res = await workerFetch(`${workerUrl}/analyze-youtube-full`, buildInit(), buildInit);

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw Object.assign(
      new Error(`Audio worker error (${res.status}): ${detail}`),
      { statusCode: res.status >= 500 ? 502 : res.status },
    );
  }

  return res.json() as Promise<{
    analysis: AudioAnalysisResult;
    scores: Record<string, ScoreAxisDetail>;
    rhythm: RhythmAnalysisResult;
  }>;
}

// ---------------------------------------------------------------------------
// Database — save / list / get / delete analyses
// ---------------------------------------------------------------------------

function serializeAnalysis(row: {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  songTitle: string;
  artistName: string;
  youtubeUrl: string | null;
  ytMetadata: unknown;
  audioFileName: string | null;
  audioAnalysis: unknown;
  scores: unknown;
  scoreBreakdown: unknown;
  songId: string | null;
}): SongSpectrumAnalysis {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    songTitle: row.songTitle,
    artistName: row.artistName,
    youtubeUrl: row.youtubeUrl,
    ytMetadata: (row.ytMetadata as YouTubeMetadata | null) ?? null,
    audioFileName: row.audioFileName,
    audioAnalysis: (row.audioAnalysis as AudioAnalysisResult | null) ?? null,
    scores: (row.scores as SpectrumScores) ?? {},
    scoreBreakdown: (row.scoreBreakdown as Record<string, ScoreAxisDetail>) ?? {},
    songId: row.songId,
  };
}

export async function createAnalysis(input: {
  songTitle: string;
  artistName: string;
  youtubeUrl?: string;
  ytMetadata?: YouTubeMetadata;
  audioFileName?: string;
  audioAnalysis?: AudioAnalysisResult;
  scores?: SpectrumScores;
  scoreBreakdown?: Record<string, ScoreAxisDetail>;
  songId?: string;
}): Promise<SongSpectrumAnalysis> {
  const row = await prisma.songSpectrumAnalysis.create({
    data: {
      songTitle: input.songTitle,
      artistName: input.artistName,
      youtubeUrl: input.youtubeUrl ?? null,
      ...(input.ytMetadata !== undefined && {
        ytMetadata: input.ytMetadata as unknown as Prisma.InputJsonValue,
      }),
      audioFileName: input.audioFileName ?? null,
      ...(input.audioAnalysis !== undefined && {
        audioAnalysis: input.audioAnalysis as unknown as Prisma.InputJsonValue,
      }),
      scores: (input.scores ?? {}) as unknown as Prisma.InputJsonValue,
      scoreBreakdown: (input.scoreBreakdown ?? {}) as unknown as Prisma.InputJsonValue,
      songId: input.songId ?? null,
    },
  });
  return serializeAnalysis(row);
}

export async function updateAnalysis(
  id: string,
  patch: Partial<{
    ytMetadata: YouTubeMetadata;
    audioFileName: string;
    audioAnalysis: AudioAnalysisResult;
    scores: SpectrumScores;
    scoreBreakdown: Record<string, ScoreAxisDetail>;
    songId: string | null;
  }>,
): Promise<SongSpectrumAnalysis> {
  const row = await prisma.songSpectrumAnalysis.update({
    where: { id },
    data: {
      ...(patch.ytMetadata !== undefined && {
        ytMetadata: patch.ytMetadata as unknown as Prisma.InputJsonValue,
      }),
      ...(patch.audioFileName !== undefined && { audioFileName: patch.audioFileName }),
      ...(patch.audioAnalysis !== undefined && {
        audioAnalysis: patch.audioAnalysis as unknown as Prisma.InputJsonValue,
      }),
      ...(patch.scores !== undefined && {
        scores: patch.scores as unknown as Prisma.InputJsonValue,
      }),
      ...(patch.scoreBreakdown !== undefined && {
        scoreBreakdown: patch.scoreBreakdown as unknown as Prisma.InputJsonValue,
      }),
      ...(patch.songId !== undefined && { songId: patch.songId }),
    },
  });
  return serializeAnalysis(row);
}

export async function listAnalyses(): Promise<SongSpectrumAnalysis[]> {
  const rows = await prisma.songSpectrumAnalysis.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(serializeAnalysis);
}

export async function getAnalysis(id: string): Promise<SongSpectrumAnalysis | null> {
  const row = await prisma.songSpectrumAnalysis.findUnique({ where: { id } });
  return row ? serializeAnalysis(row) : null;
}

export async function deleteAnalysis(id: string): Promise<void> {
  await prisma.songSpectrumAnalysis.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Final score computation — optionally enriched with lyrics from library
// ---------------------------------------------------------------------------

export async function computeFinalScore(
  analysisId: string,
  songId?: string,
): Promise<SongSpectrumAnalysis> {
  const existing = await prisma.songSpectrumAnalysis.findUnique({
    where: { id: analysisId },
  });
  if (!existing) {
    throw Object.assign(new Error('Analysis not found'), { statusCode: 404 });
  }

  let lyricsContext = '';
  const linkedSongId = songId ?? existing.songId;

  if (linkedSongId) {
    const lyric = await prisma.lyric.findFirst({
      where: { songId: linkedSongId, isPrimary: true },
      select: { text: true },
    });
    if (lyric) lyricsContext = lyric.text.slice(0, 3000);
  }

  // Re-run scoring with lyrics context if audio analysis is available
  if (existing.audioAnalysis && lyricsContext) {
    // Forward to Python worker for re-scoring with lyrics context
    try {
      const workerUrl = process.env['AUDIO_WORKER_URL'];
      if (workerUrl) {
        // We don't re-upload audio — call a lightweight re-score endpoint
        // For now, just mark the songId and return (lyrics integration is a Phase 2 enhancement)
      }
    } catch {
      // Non-fatal — proceed with current scores
    }
  }

  // Only update songId if it actually changed
  const patch = linkedSongId !== undefined && linkedSongId !== (existing.songId ?? undefined)
    ? { songId: linkedSongId }
    : {};
  return updateAnalysis(analysisId, patch);
}

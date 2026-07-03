/**
 * Compound AI analysis — combines 7 individual OpenAI calls into 2 per song.
 *
 * Phase 1 (1 call): research + spectrum + musicScore + analysis + genre
 * Phase 2 (1 call): coreScore + context (uses Phase 1 output as context)
 *
 * Results are written to the same DB tables as the individual jobs so all
 * downstream features (Spectrum page, Song page, etc.) continue working
 * without any changes.
 */

import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';

const MODEL = 'gpt-4o-mini';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_UA = 'BandSpectrumMapper/1.0 (music analysis; contact via github)';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function clampInt(v: unknown): number {
  return Math.min(10, Math.max(0, Math.round(Number(v) || 0)));
}

function clampDec(v: unknown): number {
  return Math.min(10, Math.max(0, Math.round((Number(v) || 0) * 10) / 10));
}

function clampGenre(v: unknown): number {
  return Math.max(1, Math.min(10, Math.round(Number(v) || 1)));
}

function parseJson(raw: string, label: string): Record<string, unknown> {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new HttpError(502, `AI returned invalid JSON for ${label}`);
  }
}

async function fetchWikiExcerpt(query: string): Promise<string> {
  try {
    const searchUrl = `${WIKI_API}?${new URLSearchParams({
      action: 'query', list: 'search', srsearch: query,
      format: 'json', srlimit: '1', srprop: 'snippet',
    })}`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': WIKI_UA },
      signal: AbortSignal.timeout(6000),
    });
    const searchData = (await searchRes.json()) as { query?: { search?: Array<{ title: string }> } };
    const pageTitle = searchData?.query?.search?.[0]?.title;
    if (!pageTitle) return '';

    const extractUrl = `${WIKI_API}?${new URLSearchParams({
      action: 'query', prop: 'extracts', exintro: 'true',
      titles: pageTitle, format: 'json', explaintext: 'true',
    })}`;
    const extractRes = await fetch(extractUrl, {
      headers: { 'User-Agent': WIKI_UA },
      signal: AbortSignal.timeout(6000),
    });
    const extractData = (await extractRes.json()) as {
      query?: { pages?: Record<string, { extract?: string; missing?: string }> };
    };
    const pages = extractData?.query?.pages;
    if (!pages) return '';
    const page = Object.values(pages)[0] as { extract?: string; missing?: string } | undefined;
    if (!page || page.missing !== undefined || !page.extract) return '';
    return page.extract.slice(0, 2000);
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface Phase1Input {
  artistName: string;
  songTitle: string;
  albumTitle: string | null;
  albumYear: number | null;
  isInstrumental: boolean;
  lyricsText: string;
  tagNames: string[];
  wikiSong: string;
  wikiAlbum: string;
  wikiBand: string;
  durationSeconds: number | null;
}

interface Phase1Output {
  research:  { summary: string; musicStyle: string };
  spectrum:  { aggression: number; complexity: number; atmosphere: number; emotion: number; psychedelic: number; concept: number; rationale: string; contextInferred: boolean };
  musicScore: { rhythmicComplexity: number; harmonicDepth: number; structuralComplexity: number; sonicDensity: number; tempoEnergy: number; tonalDarkness: number; rationale: string };
  analysis:  { tags: string[]; emotionalRegister: string; conceptualDepth: string; notableElements: string[]; narrativeVoice: string };
  genre:     { metal: number; rock: number; pop: number; hiphop: number; electronic: number; folk: number; rationale: string };
}

interface Phase2Output {
  coreScore: { aggression: number; complexity: number; atmosphere: number; emotion: number; psychedelic: number; concept: number; rationale: string };
  context:   { titleSignificance: string; historicalContext: string; lyricalInterpretation: string; thematicSynthesis: string; overallNarrative: string };
}

export interface CompoundRunResult {
  phase1Ran: boolean;
  phase2Ran: boolean;
}

// ---------------------------------------------------------------------------
// Phase 1: research + spectrum + musicScore + analysis + genre (1 OpenAI call)
// ---------------------------------------------------------------------------

async function runPhase1(input: Phase1Input): Promise<Phase1Output> {
  const client = getClient();
  const hasLyrics = input.lyricsText.trim().length > 20;
  const contextInferred = !hasLyrics;

  const wikiBlock = [
    input.wikiSong  ? `=== Wikipedia: Song ===\n${input.wikiSong}`  : '',
    input.wikiAlbum ? `=== Wikipedia: Album ===\n${input.wikiAlbum}` : '',
    input.wikiBand  ? `=== Wikipedia: Artist ===\n${input.wikiBand}` : '',
  ].filter(Boolean).join('\n\n');

  const albumLine  = input.albumTitle
    ? `Album: "${input.albumTitle}"${input.albumYear ? ` (${input.albumYear})` : ''}`
    : '';
  const tagLine    = input.tagNames.length ? `Tags: ${input.tagNames.join(', ')}` : '';
  const durLine    = input.durationSeconds != null
    ? `Duration: ${Math.floor(input.durationSeconds / 60)}:${String(input.durationSeconds % 60).padStart(2, '0')}`
    : '';
  const lyricsBlock = hasLyrics
    ? `=== LYRICS ===\n${input.lyricsText.slice(0, 3000)}`
    : `=== LYRICS ===\n[${input.isInstrumental ? 'Instrumental — no lyrics' : 'No lyrics available — infer from context'}]`;

  const systemMessage = `You are a comprehensive music analyst. Return a single JSON object with exactly 5 keys: "research", "spectrum", "musicScore", "analysis", "genre". Follow each section's instructions precisely.

GENRE CALIBRATION (applies only to the "genre" section):
The folk/indie category covers eclectic listeners who embrace experimental, dark, atmospheric, progressive, and psychedelic music. Bands like Tool, Radiohead, Nick Cave, Deftones, Portishead, Porcupine Tree, NIN are loved by this audience.
Never score folk/indie low simply because a song is heavy, complex, or dark.
If spectrum atmosphere≥6, psychedelic≥5, or concept≥6, folk should be ≥7.
Calibration: Tool "Lateralus"=8, Radiohead "Paranoid Android"=9, Metallica "Enter Sandman"=4, Slayer "Raining Blood"=2.`;

  const prompt = `=== SONG CONTEXT ===
Artist: ${input.artistName}
Song: "${input.songTitle}"
${albumLine}${durLine ? `\n${durLine}` : ''}${input.isInstrumental ? '\n[Instrumental track]' : ''}${tagLine ? `\n${tagLine}` : ''}
${wikiBlock ? `\n${wikiBlock}\n` : ''}
${lyricsBlock}

=== INSTRUCTIONS ===

"research":
  summary: 3–5 sentences — song meaning/creation, album thematic arc, band's artistic context at release. Use Wikipedia if provided; use knowledge if not.
  musicStyle: 3–4 sentences — genre/subgenre, instrumentation, production approach, sonic texture, rhythmic character.

"spectrum" (0–10 integers):
  aggression (0=calm/peaceful, 10=intense/violent/abrasive)
  complexity (0=simple/repetitive, 10=dense/layered/intricate)
  atmosphere (0=dry/direct, 10=immersive/ambient/cinematic)
  emotion (0=detached/cold, 10=raw/vulnerable/emotionally intense)
  psychedelic (0=grounded/literal, 10=surreal/hallucinatory/mind-bending)
  concept (0=personal/narrative, 10=philosophical/abstract/conceptual)
  rationale: one sentence${contextInferred ? '\n  NOTE: No lyrics — infer from song/album title, artist style, tags.' : ''}

"musicScore" (0–10, one decimal allowed — HOW the music is built):
  rhythmicComplexity (0=steady 4/4; 10=extreme polymetry/polyrhythm/shifting time sigs)
  harmonicDepth (0=simple power chords; 10=dense jazz/extended chords/microtonality)
  structuralComplexity (0=verse-chorus pop; 10=through-composed suite with no repeated sections)
  sonicDensity (0=sparse/minimal; 10=densely layered/wall-of-sound)
  tempoEnergy (0=slow/ambient drone; 10=extremely fast/relentless)
  tonalDarkness (0=bright/major/uplifting; 10=dark/minor/atonal/foreboding)
  rationale: one sentence

"analysis" (lyrical character):
  tags: 3–5 discovery tags — lowercase, no genre names, simplest form (e.g. "spiritual" not "spirituality"), no near-synonyms. Draw from: mood, texture, theme, context.
  emotionalRegister: one sentence on dominant emotional tone
  conceptualDepth: one sentence on how layered/abstract the lyrical concepts are
  notableElements: 2–4 craft elements (e.g. "extended metaphor", "cyclical structure", "visceral imagery")
  narrativeVoice: one sentence on lyrical perspective/delivery style${!hasLyrics ? '\n  NOTE: No lyrics — base analysis on song context, infer carefully.' : ''}

"genre" (1–10 integer — how much would this genre's fanbase enjoy it):
  metal: heavy/aggressive/technical fans
  rock: guitar-driven alt/grunge/post-rock fans
  pop: mainstream/catchy fans (score LOW for complexity/experimentation)
  hiphop: beats/flow/lyricism fans (score LOW without rap elements)
  electronic: synth/production/IDM fans
  folk: indie/alternative/eclectic listeners — see calibration above
  rationale: one paragraph explaining scores, especially folk/indie

Return ONLY valid JSON. No markdown. No text outside the JSON object.`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 1800,
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const parsed = parseJson(raw, 'compound phase 1');

  const r = parsed['research']  as Record<string, unknown> | undefined;
  const s = parsed['spectrum']  as Record<string, unknown> | undefined;
  const m = parsed['musicScore'] as Record<string, unknown> | undefined;
  const a = parsed['analysis']  as Record<string, unknown> | undefined;
  const g = parsed['genre']     as Record<string, unknown> | undefined;

  if (!r || !s || !m || !a || !g) {
    throw new HttpError(502, 'Compound phase 1: AI response missing required sections');
  }

  return {
    research: {
      summary:    typeof r['summary']    === 'string' ? r['summary']    : 'Research unavailable.',
      musicStyle: typeof r['musicStyle'] === 'string' ? r['musicStyle'] : '',
    },
    spectrum: {
      aggression:  clampInt(s['aggression']),
      complexity:  clampInt(s['complexity']),
      atmosphere:  clampInt(s['atmosphere']),
      emotion:     clampInt(s['emotion']),
      psychedelic: clampInt(s['psychedelic']),
      concept:     clampInt(s['concept']),
      rationale:   typeof s['rationale'] === 'string' ? s['rationale'] : '',
      contextInferred,
    },
    musicScore: {
      rhythmicComplexity:   clampDec(m['rhythmicComplexity']),
      harmonicDepth:        clampDec(m['harmonicDepth']),
      structuralComplexity: clampDec(m['structuralComplexity']),
      sonicDensity:         clampDec(m['sonicDensity']),
      tempoEnergy:          clampDec(m['tempoEnergy']),
      tonalDarkness:        clampDec(m['tonalDarkness']),
      rationale: typeof m['rationale'] === 'string' ? m['rationale'] : '',
    },
    analysis: {
      tags:              Array.isArray(a['tags']) ? (a['tags'] as unknown[]).map(String).slice(0, 5) : [],
      emotionalRegister: typeof a['emotionalRegister'] === 'string' ? a['emotionalRegister'] : '',
      conceptualDepth:   typeof a['conceptualDepth']   === 'string' ? a['conceptualDepth']   : '',
      notableElements:   Array.isArray(a['notableElements']) ? (a['notableElements'] as unknown[]).map(String) : [],
      narrativeVoice:    typeof a['narrativeVoice']     === 'string' ? a['narrativeVoice']    : '',
    },
    genre: {
      metal:      clampGenre(g['metal']),
      rock:       clampGenre(g['rock']),
      pop:        clampGenre(g['pop']),
      hiphop:     clampGenre(g['hiphop']),
      electronic: clampGenre(g['electronic']),
      folk:       clampGenre(g['folk']),
      rationale:  typeof g['rationale'] === 'string' ? g['rationale'] : '',
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 2: coreScore + context (1 OpenAI call — uses Phase 1 results)
// ---------------------------------------------------------------------------

async function runPhase2(
  artistName: string,
  songTitle: string,
  albumLine: string,
  lyricsText: string,
  p1: Phase1Output,
): Promise<Phase2Output> {
  const client = getClient();
  const hasLyrics = lyricsText.trim().length > 20;

  const p1Summary = [
    `Research: ${p1.research.summary.slice(0, 400)}`,
    `Music style: ${p1.research.musicStyle.slice(0, 300)}`,
    `Analytical spectrum (0–10): aggression=${p1.spectrum.aggression} complexity=${p1.spectrum.complexity} atmosphere=${p1.spectrum.atmosphere} emotion=${p1.spectrum.emotion} psychedelic=${p1.spectrum.psychedelic} concept=${p1.spectrum.concept}`,
    `Spectrum rationale: ${p1.spectrum.rationale}`,
    `Discovery themes: ${p1.analysis.tags.join(', ')}`,
    `Emotional register: ${p1.analysis.emotionalRegister}`,
    `Conceptual depth: ${p1.analysis.conceptualDepth}`,
    `Narrative voice: ${p1.analysis.narrativeVoice}`,
  ].join('\n');

  const prompt = `=== SONG CONTEXT ===
Artist: ${artistName}
Song: "${songTitle}"
${albumLine}

=== PRIOR ANALYSIS ===
${p1Summary}
${hasLyrics ? `\n=== LYRICS ===\n${lyricsText.slice(0, 3000)}` : '\n=== LYRICS ===\n[No lyrics available]'}

=== INSTRUCTIONS ===

Return a JSON object with exactly 2 keys: "coreScore" and "context".

"coreScore" — How a deeply invested, passionate human listener EMOTIONALLY experiences this song. Think like the most devoted fan, not a detached analyst. Scores 0.0–10.0, one decimal:
  aggression: confrontation/intensity/internal violence felt — soft songs can score high here
  complexity: cognitive and emotional weight, depth rewarded on repeated listening
  atmosphere: how completely does this song pull you into its world
  emotion: raw emotional weight — does it crack something open
  psychedelic: does it warp your sense of reality or time (not literal drug content)
  concept: does it reach for something bigger — metaphysical, a grand idea
  rationale: one sentence describing the emotional experience

"context" — Deep interpretive synthesis:
  titleSignificance: 1–2 sentences on what the title means or symbolises
  historicalContext: 1–2 sentences on where this sits in the band's journey and cultural moment
  lyricalInterpretation: 2–3 sentences on the meaning beneath the surface
  thematicSynthesis: 2–3 sentences on how all elements converge
  overallNarrative: 2–3 sentences on the complete picture and why it resonates

Return ONLY valid JSON. No markdown.`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 1500,
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const parsed = parseJson(raw, 'compound phase 2');

  const cs = parsed['coreScore'] as Record<string, unknown> | undefined;
  const cx = parsed['context']   as Record<string, unknown> | undefined;

  if (!cs || !cx) {
    throw new HttpError(502, 'Compound phase 2: AI response missing required sections');
  }

  return {
    coreScore: {
      aggression:  clampDec(cs['aggression']),
      complexity:  clampDec(cs['complexity']),
      atmosphere:  clampDec(cs['atmosphere']),
      emotion:     clampDec(cs['emotion']),
      psychedelic: clampDec(cs['psychedelic']),
      concept:     clampDec(cs['concept']),
      rationale:   typeof cs['rationale'] === 'string' ? cs['rationale'] : '',
    },
    context: {
      titleSignificance:     typeof cx['titleSignificance']     === 'string' ? cx['titleSignificance']     : '',
      historicalContext:     typeof cx['historicalContext']     === 'string' ? cx['historicalContext']     : '',
      lyricalInterpretation: typeof cx['lyricalInterpretation'] === 'string' ? cx['lyricalInterpretation'] : '',
      thematicSynthesis:     typeof cx['thematicSynthesis']     === 'string' ? cx['thematicSynthesis']     : '',
      overallNarrative:      typeof cx['overallNarrative']      === 'string' ? cx['overallNarrative']      : '',
    },
  };
}

// ---------------------------------------------------------------------------
// Write Phase 1 results to their DB tables
// ---------------------------------------------------------------------------

async function writePhase1(songId: string, p1: Phase1Output): Promise<void> {
  const sourcesJson: Prisma.InputJsonValue = [
    { type: 'compound', title: 'Compound AI (no separate Wikipedia fetch)', url: '', found: false, excerpt: '' },
  ];
  const rawResponse = JSON.stringify({
    tags: p1.analysis.tags,
    emotionalRegister: p1.analysis.emotionalRegister,
    conceptualDepth: p1.analysis.conceptualDepth,
    notableElements: p1.analysis.notableElements,
    narrativeVoice: p1.analysis.narrativeVoice,
  });

  await Promise.all([
    prisma.songResearch.upsert({
      where: { songId },
      create: { songId, model: MODEL, summary: p1.research.summary, musicStyle: p1.research.musicStyle, sources: sourcesJson },
      update: { model: MODEL, summary: p1.research.summary, musicStyle: p1.research.musicStyle },
    }),

    prisma.songAiSpectrum.upsert({
      where: { songId },
      create: { songId, model: MODEL, ...p1.spectrum },
      update: { model: MODEL, ...p1.spectrum },
    }),

    prisma.songMusicScore.upsert({
      where: { songId },
      create: { songId, model: MODEL, ...p1.musicScore, contextJson: '{}' },
      update: { model: MODEL, ...p1.musicScore, contextJson: '{}' },
    }),

    prisma.songAiAnalysis.upsert({
      where: { songId },
      create: {
        songId, model: MODEL,
        themes: p1.analysis.tags,
        emotionalRegister: p1.analysis.emotionalRegister,
        conceptualDepth: p1.analysis.conceptualDepth,
        notableElements: p1.analysis.notableElements,
        rawResponse,
      },
      update: {
        model: MODEL,
        themes: p1.analysis.tags,
        emotionalRegister: p1.analysis.emotionalRegister,
        conceptualDepth: p1.analysis.conceptualDepth,
        notableElements: p1.analysis.notableElements,
        rawResponse,
      },
    }),

    prisma.songAiGenreSpectrum.upsert({
      where: { songId },
      create: { songId, model: MODEL, ...p1.genre },
      update: { model: MODEL, ...p1.genre },
    }),
  ]);

  // Write tags to SongTag table (same as individual analysis job)
  for (const tagName of p1.analysis.tags) {
    const slug = slugify(tagName);
    if (!slug) continue;
    const tag = await prisma.tag.upsert({
      where: { slug },
      create: { name: tagName.toLowerCase().trim(), slug },
      update: {},
    });
    await prisma.songTag.upsert({
      where: { songId_tagId: { songId, tagId: tag.id } },
      create: { songId, tagId: tag.id },
      update: {},
    });
  }
}

// ---------------------------------------------------------------------------
// Write Phase 2 results to their DB tables
// ---------------------------------------------------------------------------

async function writePhase2(songId: string, bandId: string, p2: Phase2Output): Promise<void> {
  const { coreScore, context } = p2;
  await Promise.all([
    prisma.songAxisScore.upsert({
      where: { songId },
      create: {
        songId, bandId,
        aggression:  coreScore.aggression,
        complexity:  coreScore.complexity,
        atmosphere:  coreScore.atmosphere,
        emotion:     coreScore.emotion,
        psychedelic: coreScore.psychedelic,
        concept:     coreScore.concept,
        notes: coreScore.rationale,
        source: 'ai',
      },
      update: {
        aggression:  coreScore.aggression,
        complexity:  coreScore.complexity,
        atmosphere:  coreScore.atmosphere,
        emotion:     coreScore.emotion,
        psychedelic: coreScore.psychedelic,
        concept:     coreScore.concept,
        notes: coreScore.rationale,
        source: 'ai',
      },
    }),

    prisma.songContextAnalysis.upsert({
      where: { songId },
      create: { songId, model: MODEL, ...context },
      update: { model: MODEL, ...context },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export const compoundAiService = {
  async run(songId: string, force: boolean): Promise<CompoundRunResult> {
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: {
        id: true, title: true, isInstrumental: true, durationSeconds: true,
        bandId: true,
        band:  { select: { name: true } },
        album: { select: { title: true, year: true } },
        lyrics:  { where: { isPrimary: true }, select: { text: true }, take: 1 },
        songTags: { select: { tag: { select: { name: true } } }, take: 20 },
      },
    });
    if (!song) throw new HttpError(404, 'Song not found');

    const albumTitle = song.album?.title ?? null;
    const albumYear  = song.album?.year  ?? null;
    const lyricsText = song.lyrics[0]?.text ?? '';
    const tagNames   = song.songTags.map(st => st.tag.name);
    const albumLine  = albumTitle
      ? `Album: "${albumTitle}"${albumYear ? ` (${albumYear})` : ''}`
      : '';

    // Decide which phases need to run
    const [e1, e2, e3, e4, e5, e6, e7] = await Promise.all([
      prisma.songResearch.findUnique(        { where: { songId }, select: { id: true } }),
      prisma.songAiSpectrum.findUnique(      { where: { songId }, select: { id: true } }),
      prisma.songMusicScore.findUnique(      { where: { songId }, select: { id: true } }),
      prisma.songAiAnalysis.findUnique(      { where: { songId }, select: { id: true } }),
      prisma.songAiGenreSpectrum.findUnique( { where: { songId }, select: { id: true } }),
      prisma.songAxisScore.findUnique(       { where: { songId }, select: { songId: true } }),
      prisma.songContextAnalysis.findUnique( { where: { songId }, select: { id: true } }),
    ]);

    const runP1 = force || !(e1 && e2 && e3 && e4 && e5);
    const runP2 = force || !(e6 && e7);

    if (!runP1 && !runP2) return { phase1Ran: false, phase2Ran: false };

    let p1: Phase1Output | null = null;

    if (runP1) {
      const albumQuery = albumTitle ? `${albumTitle} ${song.band.name} album` : null;
      const [wikiSong, wikiAlbum, wikiBand] = await Promise.all([
        fetchWikiExcerpt(`${song.title} ${song.band.name} song`),
        albumQuery ? fetchWikiExcerpt(albumQuery) : Promise.resolve(''),
        fetchWikiExcerpt(`${song.band.name} band`),
      ]);

      p1 = await runPhase1({ artistName: song.band.name, songTitle: song.title, albumTitle, albumYear, isInstrumental: song.isInstrumental, lyricsText, tagNames, wikiSong, wikiAlbum, wikiBand, durationSeconds: song.durationSeconds });
      await writePhase1(songId, p1);
    }

    if (runP2) {
      // If Phase 1 wasn't just run, load its output from DB so Phase 2 has context
      if (!p1) {
        const [res, spec, anal] = await Promise.all([
          prisma.songResearch.findUnique({   where: { songId }, select: { summary: true, musicStyle: true } }),
          prisma.songAiSpectrum.findUnique({ where: { songId } }),
          prisma.songAiAnalysis.findUnique({ where: { songId } }),
        ]);

        if (!res || !spec || !anal) {
          // Phase 1 data missing — must run it first
          const albumQuery = albumTitle ? `${albumTitle} ${song.band.name} album` : null;
          const [wikiSong, wikiAlbum, wikiBand] = await Promise.all([
            fetchWikiExcerpt(`${song.title} ${song.band.name} song`),
            albumQuery ? fetchWikiExcerpt(albumQuery) : Promise.resolve(''),
            fetchWikiExcerpt(`${song.band.name} band`),
          ]);
          p1 = await runPhase1({ artistName: song.band.name, songTitle: song.title, albumTitle, albumYear, isInstrumental: song.isInstrumental, lyricsText, tagNames, wikiSong, wikiAlbum, wikiBand, durationSeconds: song.durationSeconds });
          await writePhase1(songId, p1);
        } else {
          p1 = {
            research:  { summary: res.summary, musicStyle: res.musicStyle ?? '' },
            spectrum:  { aggression: spec.aggression, complexity: spec.complexity, atmosphere: spec.atmosphere, emotion: spec.emotion, psychedelic: spec.psychedelic, concept: spec.concept, rationale: spec.rationale, contextInferred: spec.contextInferred },
            musicScore: { rhythmicComplexity: 0, harmonicDepth: 0, structuralComplexity: 0, sonicDensity: 0, tempoEnergy: 0, tonalDarkness: 0, rationale: '' },
            analysis:  { tags: anal.themes as string[], emotionalRegister: anal.emotionalRegister, conceptualDepth: anal.conceptualDepth, notableElements: anal.notableElements as string[], narrativeVoice: '' },
            genre:     { metal: 5, rock: 5, pop: 5, hiphop: 5, electronic: 5, folk: 5, rationale: '' },
          };
        }
      }

      const p2 = await runPhase2(song.band.name, song.title, albumLine, lyricsText, p1);
      await writePhase2(songId, song.bandId, p2);
    }

    return { phase1Ran: runP1, phase2Ran: runP2 };
  },
};

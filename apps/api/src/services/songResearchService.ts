import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../middleware/errorHandler.js';
import type { SongResearch, SongResearchSource } from '@band-spectrum-mapper/shared';

const MODEL = 'gpt-4o-mini';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_UA = 'BandSpectrumMapper/1.0 (music analysis; contact via github)';

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

async function fetchWikipedia(
  query: string,
  type: SongResearchSource['type'],
): Promise<SongResearchSource> {
  const base: SongResearchSource = { type, title: query, url: '', found: false, excerpt: '' };

  // Search
  let pageTitle: string;
  try {
    const searchUrl = `${WIKI_API}?${new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      format: 'json',
      srlimit: '3',
      srprop: 'snippet',
    })}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': WIKI_UA },
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    const results = data?.query?.search;
    if (!results?.length) return base;
    pageTitle = results[0]!.title;
  } catch {
    return base;
  }

  // Fetch intro extract
  try {
    const extractUrl = `${WIKI_API}?${new URLSearchParams({
      action: 'query',
      prop: 'extracts',
      exintro: 'true',
      titles: pageTitle,
      format: 'json',
      explaintext: 'true',
      exsectionformat: 'plain',
    })}`;
    const res = await fetch(extractUrl, {
      headers: { 'User-Agent': WIKI_UA },
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { extract?: string; missing?: string }> };
    };
    const pages = data?.query?.pages;
    const page = pages ? (Object.values(pages)[0] as { extract?: string; missing?: string }) : null;
    if (!page || page.missing !== undefined || !page.extract) return { ...base, title: pageTitle };

    return {
      type,
      title: pageTitle,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
      found: true,
      excerpt: page.extract.slice(0, 2500),
    };
  } catch {
    return { ...base, title: pageTitle };
  }
}

function serialize(record: {
  id: string;
  songId: string;
  model: string;
  summary: string;
  sources: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SongResearch {
  return {
    ...record,
    sources: record.sources as SongResearchSource[],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const songResearchService = {
  async getOrCreate(songId: string): Promise<SongResearch> {
    const existing = await prisma.songResearch.findUnique({ where: { songId } });
    if (existing) return serialize(existing);
    return songResearchService.regenerate(songId);
  },

  async regenerate(songId: string): Promise<SongResearch> {
    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: { band: true, album: true },
    });
    if (!song) throw new HttpError(404, 'Song not found');

    // Fetch Wikipedia info in parallel: song page, album page, band page
    const [songWiki, albumWiki, bandWiki] = await Promise.all([
      fetchWikipedia(`${song.title} ${song.band.name} song`, 'song'),
      song.album
        ? fetchWikipedia(`${song.album.title} ${song.band.name} album`, 'album')
        : Promise.resolve<SongResearchSource | null>(null),
      fetchWikipedia(`${song.band.name} band`, 'band'),
    ]);

    const sources: SongResearchSource[] = [
      songWiki,
      ...(albumWiki ? [albumWiki] : []),
      bandWiki,
    ];

    // AI summary of whatever was found
    const foundSources = sources.filter((s) => s.found && s.excerpt);
    let summary: string;
    if (foundSources.length === 0) {
      summary = `No Wikipedia articles were found for "${song.title}", the album, or ${song.band.name}. Research context is unavailable.`;
    } else {
      const client = getClient();
      const contentBlock = foundSources
        .map((s) => `=== ${s.type.toUpperCase()} PAGE: ${s.title} ===\n${s.excerpt}`)
        .join('\n\n');

      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: `Summarize the following Wikipedia research about the song "${song.title}" by ${song.band.name}${song.album ? ` from the album "${song.album.title}"` : ''}.\n\nFocus on: the song's documented meaning and creation story, the album's thematic arc, and the band's artistic context at the time of release. If details are sparse, say so honestly. Write 3–5 sentences in a neutral, informative tone.\n\n${contentBlock}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 400,
      });
      summary = completion.choices[0]?.message?.content?.trim() ?? 'Research summary unavailable.';
    }

    const sourcesJson = sources as unknown as Prisma.InputJsonValue;
    const record = await prisma.songResearch.upsert({
      where: { songId },
      create: { songId, model: MODEL, summary, sources: sourcesJson },
      update: { model: MODEL, summary, sources: sourcesJson },
    });

    return serialize(record);
  },
};

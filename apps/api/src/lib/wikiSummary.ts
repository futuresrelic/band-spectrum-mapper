const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_UA  = 'BandSpectrumMapper/1.0 (music analysis; contact via github)';

export interface WikiSummaryResult {
  found: boolean;
  pageTitle: string;
  pageUrl: string;
  extract: string; // up to 1500 chars of the intro section
}

/**
 * Search Wikipedia for `query` and return the intro extract of the best match.
 * Returns `{ found: false }` if nothing is found or on network error.
 */
export async function fetchWikiSummary(query: string): Promise<WikiSummaryResult> {
  const empty: WikiSummaryResult = { found: false, pageTitle: '', pageUrl: '', extract: '' };

  let pageTitle: string;
  try {
    const url = `${WIKI_API}?${new URLSearchParams({
      action: 'query', list: 'search', srsearch: query,
      format: 'json', srlimit: '3', srprop: 'snippet',
    })}`;
    const res  = await fetch(url, { headers: { 'User-Agent': WIKI_UA }, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { query?: { search?: Array<{ title: string }> } };
    const first = data?.query?.search?.[0];
    if (!first) return empty;
    pageTitle = first.title;
  } catch {
    return empty;
  }

  try {
    const url = `${WIKI_API}?${new URLSearchParams({
      action: 'query', prop: 'extracts', exintro: 'true',
      titles: pageTitle, format: 'json', explaintext: 'true', exsectionformat: 'plain',
    })}`;
    const res  = await fetch(url, { headers: { 'User-Agent': WIKI_UA }, signal: AbortSignal.timeout(8000) });
    const data = (await res.json()) as { query?: { pages?: Record<string, { extract?: string; missing?: string }> } };
    const page = data?.query?.pages ? Object.values(data.query.pages)[0] : null;
    if (!page || page.missing !== undefined || !page.extract) return { ...empty, pageTitle };

    return {
      found: true,
      pageTitle,
      pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
      extract: page.extract.slice(0, 1500),
    };
  } catch {
    return { ...empty, pageTitle };
  }
}

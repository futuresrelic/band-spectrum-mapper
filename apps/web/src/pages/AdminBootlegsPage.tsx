/**
 * AdminBootlegsPage — import live concert recordings from Archive.org as bootleg albums.
 *
 * Three ways to find shows:
 * 1. Scrape any band's official bootleg page (KGLW, Pearl Jam, etc.) — extracts show artwork
 *    and Archive.org identifiers directly from the band's own website.
 * 2. Search Archive.org by query.
 * 3. Paste a direct Archive.org URL or identifier.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArchiveDoc {
  identifier: string;
  title?: string;
  date?: string;
  coverage?: string;
  creator?: string;
  downloads?: number;
}

interface ArchiveSearchResponse {
  response: {
    numFound: number;
    start: number;
    docs: ArchiveDoc[];
  };
}

interface ArchiveFile {
  name: string;
  format: string;
  title?: string;
  track?: string;
  creator?: string;
  album?: string;
  size?: string;
}

interface ArchiveItemResponse {
  metadata?: {
    identifier?: string;
    title?: string;
    date?: string;
    venue?: string;
    coverage?: string;
    creator?: string;
    description?: string;
  };
  files?: ArchiveFile[];
}

interface ImportResult {
  album: { id: string; title: string };
  songCount: number;
}

interface ScrapedShow {
  identifier: string;
  archiveUrl: string;
  artworkUrl: string;
  title: string;
  date: string;
  venue: string;
  sourceUrl: string;
  rawText: string;
}

interface ScrapeResponse {
  url: string;
  shows: ScrapedShow[];
  requiresJs: boolean;
  showCount: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanDate(raw?: string): string {
  if (!raw) return '';
  return raw.slice(0, 10);
}

function extractTracks(files: ArchiveFile[]): { title: string; trackNumber: number }[] {
  const AUDIO_FORMATS = new Set(['Flac', 'VBR MP3', 'MP3', 'Ogg Vorbis', '64Kbps MP3', '128Kbps MP3', 'WAVE', 'SHN']);
  const tracks = files
    .filter(f => AUDIO_FORMATS.has(f.format))
    .map(f => {
      const rawTitle = f.title ?? f.name.replace(/\.[^.]+$/, '').replace(/^\d+[\s.\-_]+/, '');
      const trackNum = f.track ? parseInt(f.track) : NaN;
      return { title: rawTitle.trim(), format: f.format, trackNum };
    })
    .filter(t => t.title.length > 0);

  const seen = new Map<string, typeof tracks[0]>();
  for (const t of tracks) {
    const key = t.trackNum ? String(t.trackNum) : t.title.toLowerCase();
    const existing = seen.get(key);
    if (!existing || t.format === 'Flac') seen.set(key, t);
  }

  return Array.from(seen.values())
    .sort((a, b) => {
      if (!isNaN(a.trackNum) && !isNaN(b.trackNum)) return a.trackNum - b.trackNum;
      return 0;
    })
    .map((t, i) => ({ title: t.title, trackNumber: isNaN(t.trackNum) ? i + 1 : t.trackNum }));
}

function extractImages(identifier: string, files: ArchiveFile[]): { label: string; url: string }[] {
  const IMAGE_FORMATS = new Set(['JPEG', 'PNG', 'GIF', 'Item Image']);
  const images: { label: string; url: string }[] = [
    { label: 'Archive.org thumbnail (auto)', url: `https://archive.org/services/img/${encodeURIComponent(identifier)}` },
  ];
  for (const f of files) {
    if (!IMAGE_FORMATS.has(f.format)) continue;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['jpg', 'jpeg', 'png', 'gif'].includes(ext)) continue;
    images.push({
      label: f.name,
      url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(f.name)}`,
    });
  }
  return images;
}

function parseIdentifier(input: string): string {
  const trimmed = input.trim();
  const archiveMatch = trimmed.match(/archive\.org\/(?:details|download)\/([^/?#\s]+)/);
  if (archiveMatch?.[1]) return archiveMatch[1];
  const kglwMatch = trimmed.match(/bootlegger\/([^/?#\s]+)/i);
  if (kglwMatch?.[1]) return kglwMatch[1];
  if (!trimmed.includes('/') && !trimmed.includes(' ') && trimmed.length > 3) return trimmed;
  return '';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single show card used in both scrape results and search results */
function ShowCard({
  identifier,
  title,
  date,
  coverage,
  artworkUrl: initialArtwork,
  downloads,
  onExpand,
  expanded,
  importState,
  onImport,
  selectedBandId,
  artworkSelection,
  onArtworkSelect,
}: {
  identifier: string;
  title?: string;
  date?: string;
  coverage?: string;
  artworkUrl?: string;
  downloads?: number;
  onExpand: (id: string) => void;
  expanded: { loading: boolean; data?: ArchiveItemResponse; error?: string } | undefined;
  importState: { loading: boolean; result?: ImportResult; error?: string } | undefined;
  onImport: (id: string) => void;
  selectedBandId: string;
  artworkSelection: Record<string, string>;
  onArtworkSelect: (id: string, url: string) => void;
}) {
  const exp = expanded;
  const imp = importState;
  const tracks = exp?.data?.files ? extractTracks(exp.data.files) : [];
  const images = exp?.data?.files
    ? extractImages(identifier, exp.data.files)
    : [{ label: 'Archive.org thumbnail (auto)', url: `https://archive.org/services/img/${encodeURIComponent(identifier)}` }];
  const meta = exp?.data?.metadata;

  // Artwork priority: user selection > initial artwork from scrape > archive.org thumb
  const defaultArtwork = initialArtwork || `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
  const selectedArtwork = artworkSelection[identifier] ?? defaultArtwork;

  return (
    <div className="border border-surface-200 rounded-lg overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-50 hover:bg-surface-100 transition-colors">
        <img
          src={selectedArtwork}
          alt=""
          className="w-10 h-10 rounded object-cover shrink-0 bg-surface-200"
          loading="lazy"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-surface-900 truncate">{title ?? identifier}</div>
          <div className="text-xs text-surface-500 flex gap-3 mt-0.5 flex-wrap">
            {date && <span>📅 {cleanDate(date)}</span>}
            {coverage && <span>📍 {coverage}</span>}
            {downloads != null && <span>⬇ {downloads.toLocaleString()}</span>}
            <span className="font-mono text-surface-400">{identifier}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {imp?.result && (
            <Link
              to={`/library/albums/${imp.result.album.id}`}
              className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 hover:underline"
            >
              ✓ Imported ({imp.result.songCount} tracks)
            </Link>
          )}
          {imp?.error && (
            <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">
              {imp.error.includes('Already imported') ? '⚠ Already imported' : `✗ ${imp.error}`}
            </span>
          )}
          <button
            onClick={() => onExpand(identifier)}
            className="text-xs text-surface-500 hover:text-surface-800 border border-surface-300 rounded px-2 py-0.5 bg-white transition-colors"
          >
            {exp ? (exp.loading ? '…' : '▲ Hide') : '▼ Preview'}
          </button>
          {!imp?.result && (
            <button
              onClick={() => onImport(identifier)}
              disabled={!selectedBandId || imp?.loading}
              className="btn-primary text-xs py-1 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {imp?.loading ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {exp && !exp.loading && exp.data && (
        <div className="border-t border-surface-200 bg-white">
          <div className="flex gap-4 p-3">
            {/* Artwork picker */}
            <div className="shrink-0 space-y-2" style={{ width: 160 }}>
              <div className="text-xs font-semibold text-surface-600">Cover art</div>
              <img
                src={selectedArtwork}
                alt="cover"
                className="w-full aspect-square object-cover rounded border border-surface-200 bg-surface-100"
                loading="lazy"
              />
              {images.length > 1 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-surface-500 font-medium">Pick artwork:</div>
                  <div className="max-h-28 overflow-y-auto space-y-0.5">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => onArtworkSelect(identifier, img.url)}
                        className={`w-full text-left text-[10px] px-1.5 py-1 rounded truncate transition-colors ${
                          selectedArtwork === img.url
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'text-surface-600 hover:bg-surface-100'
                        }`}
                        title={img.label}
                      >
                        {selectedArtwork === img.url ? '✓ ' : ''}{img.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <a
                href={`https://archive.org/details/${encodeURIComponent(identifier)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[10px] text-indigo-500 hover:underline"
              >
                View on Archive.org ↗
              </a>
            </div>

            {/* Show details + tracklist */}
            <div className="flex-1 min-w-0">
              {meta?.venue && (
                <p className="text-xs text-surface-600 mb-2">
                  📍 {meta.venue}{meta.coverage ? `, ${meta.coverage}` : ''}
                </p>
              )}
              {meta?.description && (
                <p className="text-xs text-surface-500 italic mb-2 line-clamp-2">{meta.description}</p>
              )}
              {tracks.length > 0 ? (
                <>
                  <div className="text-xs font-semibold text-surface-600 mb-1">Setlist ({tracks.length} tracks)</div>
                  <ol className="space-y-0.5 max-h-48 overflow-y-auto">
                    {tracks.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-surface-700">
                        <span className="text-surface-400 tabular-nums w-5 text-right shrink-0">{t.trackNumber}.</span>
                        <span>{t.title}</span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="text-xs text-surface-500 italic">
                  {exp.loading ? 'Loading tracklist…' : 'Click ▼ Preview to load the setlist from Archive.org.'}
                </p>
              )}
              {tracks.length > 0 && !imp?.result && (
                <button
                  onClick={() => onImport(identifier)}
                  disabled={!selectedBandId || imp?.loading}
                  className="btn-primary text-xs py-1 px-3 mt-3 disabled:opacity-40"
                >
                  {imp?.loading ? 'Importing…' : `Import show (${tracks.length} tracks)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {exp?.loading && (
        <div className="border-t border-surface-200 px-3 py-2 text-xs text-surface-500">Loading show details from Archive.org…</div>
      )}
      {exp?.error && (
        <div className="border-t border-surface-200 px-3 py-2 text-xs text-red-600">{exp.error}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminBootlegsPage() {
  const [selectedBandId, setSelectedBandId] = useState('');

  // ── Scraper state ─────────────────────────────────────────────────────────
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResponse | null>(null);
  const [scrapeError, setScrapeError] = useState('');

  // ── Archive.org search state ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRows, setSearchRows] = useState(50);
  const [searchResults, setSearchResults] = useState<ArchiveDoc[] | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchPage = useRef(1);

  // ── Direct URL loader ─────────────────────────────────────────────────────
  const [directUrl, setDirectUrl] = useState('');

  // ── Shared expanded / import / artwork state ──────────────────────────────
  const [expanded, setExpanded] = useState<Record<string, { loading: boolean; data?: ArchiveItemResponse; error?: string }>>({});
  const [importState, setImportState] = useState<Record<string, { loading: boolean; result?: ImportResult; error?: string }>>({});
  const [artworkSelection, setArtworkSelection] = useState<Record<string, string>>({});

  const { data: bands } = useQuery({
    queryKey: ['bands-list'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/api/bands'),
  });

  const selectedBand = bands?.find(b => b.id === selectedBandId);

  const onBandChange = (bandId: string) => {
    setSelectedBandId(bandId);
    const band = bands?.find(b => b.id === bandId);
    if (band) setSearchQuery(`creator:"${band.name}" AND mediatype:audio`);
    setSearchResults(null);
    setSearchError('');
  };

  // Pre-seed artwork from the scrape (band site image wins over archive thumb)
  const applyScrapeArtwork = (shows: ScrapedShow[]) => {
    setArtworkSelection(prev => {
      const next = { ...prev };
      for (const s of shows) {
        if (s.artworkUrl && !next[s.identifier]) next[s.identifier] = s.artworkUrl;
      }
      return next;
    });
  };

  // ── Scraper ───────────────────────────────────────────────────────────────
  const doScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeError('');
    setScrapeResult(null);
    try {
      const params = new URLSearchParams({ url: scrapeUrl.trim() });
      const data = await api.get<ScrapeResponse>(`/api/admin/bootlegs/scrape?${params}`);
      setScrapeResult(data);
      applyScrapeArtwork(data.shows);
    } catch (e) {
      setScrapeError(e instanceof Error ? e.message : 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  // ── Archive.org search ────────────────────────────────────────────────────
  const doSearch = useCallback(async (page = 1) => {
    if (!searchQuery.trim()) { setSearchError('Enter a search query'); return; }
    setSearching(true);
    setSearchError('');
    if (page === 1) setSearchResults(null);
    try {
      const params = new URLSearchParams({ q: searchQuery.trim(), rows: String(searchRows), page: String(page) });
      const data = await api.get<ArchiveSearchResponse>(`/api/admin/bootlegs/search?${params}`);
      const docs = data.response.docs ?? [];
      setSearchTotal(data.response.numFound ?? 0);
      setSearchResults(prev => page === 1 ? docs : [...(prev ?? []), ...docs]);
      searchPage.current = page;
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchRows]);

  // ── Direct URL loader ─────────────────────────────────────────────────────
  const loadDirectUrl = async () => {
    const id = parseIdentifier(directUrl);
    if (!id) { alert('Could not parse an Archive.org identifier from that URL.'); return; }
    setSearchResults(prev => {
      if (prev?.some(d => d.identifier === id)) return prev;
      return [{ identifier: id, title: id }, ...(prev ?? [])];
    });
    setSearchTotal(t => t + 1);
    setDirectUrl('');
    await loadItem(id);
  };

  // ── Item expand (loads Archive.org metadata) ──────────────────────────────
  const loadItem = async (identifier: string) => {
    if (expanded[identifier]) {
      setExpanded(prev => { const next = { ...prev }; delete next[identifier]; return next; });
      return;
    }
    setExpanded(prev => ({ ...prev, [identifier]: { loading: true } }));
    try {
      const data = await api.get<ArchiveItemResponse>(`/api/admin/bootlegs/item/${encodeURIComponent(identifier)}`);
      setExpanded(prev => ({ ...prev, [identifier]: { loading: false, data } }));
      // Only set artwork default if not already set (scrape artwork takes priority)
      setArtworkSelection(prev => ({
        ...prev,
        [identifier]: prev[identifier] ?? `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
      }));
    } catch (e) {
      setExpanded(prev => ({ ...prev, [identifier]: { loading: false, error: e instanceof Error ? e.message : 'Failed to load' } }));
    }
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const importShow = async (identifier: string, overrideTitle?: string, overrideDate?: string) => {
    if (!selectedBandId) { alert('Select a band first'); return; }
    const item = expanded[identifier]?.data;
    const meta = item?.metadata ?? {};

    // Find title from scrape results if not in archive metadata
    const scrapeShow = scrapeResult?.shows.find(s => s.identifier === identifier);
    const searchDoc = searchResults?.find(d => d.identifier === identifier);

    setImportState(prev => ({ ...prev, [identifier]: { loading: true } }));
    try {
      const tracks = item?.files ? extractTracks(item.files) : [];
      const artworkUrl = artworkSelection[identifier]
        ?? scrapeShow?.artworkUrl
        ?? `https://archive.org/services/img/${encodeURIComponent(identifier)}`;

      const result = await api.post<ImportResult>('/api/admin/bootlegs/import', {
        bandId: selectedBandId,
        identifier,
        title: overrideTitle ?? meta.title ?? scrapeShow?.title ?? searchDoc?.title ?? identifier,
        date: overrideDate ?? cleanDate(meta.date ?? searchDoc?.date ?? scrapeShow?.date ?? ''),
        venue: meta.venue ?? scrapeShow?.venue ?? '',
        city: meta.coverage ?? searchDoc?.coverage ?? '',
        artworkUrl,
        tracks,
      });
      setImportState(prev => ({ ...prev, [identifier]: { loading: false, result } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import failed';
      setImportState(prev => ({ ...prev, [identifier]: { loading: false, error: msg } }));
    }
  };

  const onArtworkSelect = (id: string, url: string) => {
    setArtworkSelection(prev => ({ ...prev, [id]: url }));
  };

  // ── Which tab is active ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'scrape' | 'search'>('scrape');

  return (
    <div>
      <PageHeader
        title="Bootleg Importer"
        subtitle="Import live bootlegs from any band's official page or Archive.org"
        actions={<Link to="/library" className="btn-secondary">← Library</Link>}
      />

      {/* Band picker */}
      <div className="card mb-4">
        <label className="label">Band to import into *</label>
        <div className="flex items-center gap-4">
          <select className="input max-w-xs" value={selectedBandId} onChange={e => onBandChange(e.target.value)}>
            <option value="">— select band —</option>
            {bands?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {selectedBand && (
            <p className="text-sm text-surface-500">
              Shows will be added to <strong>{selectedBand.name}</strong> as bootleg albums.
            </p>
          )}
          {!selectedBandId && (
            <p className="text-sm text-amber-600">← Select a band before importing</p>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 border-b border-surface-200">
        <button
          onClick={() => setActiveTab('scrape')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'scrape' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-surface-500 hover:text-surface-700'
          }`}
        >
          🌐 Scrape Band Site
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'search' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-surface-500 hover:text-surface-700'
          }`}
        >
          🔍 Search Archive.org
        </button>
      </div>

      {/* ── Scrape tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'scrape' && (
        <div className="space-y-4">
          <div className="card">
            <label className="label">Band's Official Bootleg Page URL</label>
            <p className="text-xs text-surface-500 mb-3">
              Paste the URL of any band's official bootleg page. The importer fetches the page,
              extracts show artwork and Archive.org links, and presents the full list ready to import.
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={scrapeUrl}
                onChange={e => setScrapeUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void doScrape(); }}
                placeholder="https://kinggizzardandthelizardwizard.com/bootlegger"
              />
              <button
                className="btn-primary shrink-0"
                onClick={() => void doScrape()}
                disabled={scraping || !scrapeUrl.trim()}
              >
                {scraping ? 'Scraping…' : 'Fetch Shows'}
              </button>
            </div>
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
              <p><strong>KGLW:</strong> <code>https://kinggizzardandthelizardwizard.com/bootlegger</code></p>
              <p><strong>Pearl Jam:</strong> Look for their official vault / bootleg page and paste the URL here.</p>
              <p><strong>Any band:</strong> As long as the page links to Archive.org, shows will be extracted automatically with their original artwork.</p>
            </div>
          </div>

          {scrapeError && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700 font-medium mb-1">Scrape failed</p>
              <p className="text-sm text-red-600">{scrapeError}</p>
              <p className="text-xs text-red-500 mt-2">
                If the site blocks automated requests, try copying an individual Archive.org link from that page
                and using the "Search Archive.org" tab instead, or paste a direct URL in the search tab's URL loader.
              </p>
            </div>
          )}

          {scrapeResult && (
            <div className="card">
              {scrapeResult.requiresJs && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  ⚠ This page appears to load content via JavaScript. The server can only read the initial HTML —
                  some shows may be missing. Use the Archive.org search tab as a fallback.
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">
                  {scrapeResult.showCount} show{scrapeResult.showCount !== 1 ? 's' : ''} found on {new URL(scrapeResult.url).hostname}
                </h2>
                {!selectedBandId && <p className="text-xs text-amber-600">← Select a band to enable import</p>}
              </div>

              {scrapeResult.shows.length === 0 && (
                <p className="text-sm text-surface-500 italic">
                  No shows with Archive.org links were found on this page.
                  The page may use JavaScript to render its content, or use a different link format.
                  Try the Archive.org search tab.
                </p>
              )}

              <div className="space-y-2">
                {scrapeResult.shows.map(show => (
                  <ShowCard
                    key={show.identifier || show.sourceUrl}
                    identifier={show.identifier}
                    title={show.title}
                    date={show.date}
                    coverage={show.venue}
                    artworkUrl={show.artworkUrl}
                    onExpand={loadItem}
                    expanded={expanded[show.identifier]}
                    importState={importState[show.identifier]}
                    onImport={id => void importShow(id)}
                    selectedBandId={selectedBandId}
                    artworkSelection={artworkSelection}
                    onArtworkSelect={onArtworkSelect}
                  />
                ))}
              </div>
            </div>
          )}

          {!scrapeResult && !scraping && !scrapeError && (
            <div className="card bg-surface-50 border-surface-200">
              <h3 className="font-medium mb-2">How to use</h3>
              <ol className="space-y-2 text-sm text-surface-700 list-decimal list-inside">
                <li>Select a band from the dropdown above</li>
                <li>Paste the URL of the band's official bootleg page (e.g. the KGLW bootlegger page)</li>
                <li>Click <strong>Fetch Shows</strong> — the importer reads the page and extracts shows with their artwork</li>
                <li>Click <strong>▼ Preview</strong> on any show to load the full setlist from Archive.org</li>
                <li>Click <strong>Import</strong> — the show becomes a bootleg album with the band's original poster art</li>
              </ol>
              <p className="text-xs text-surface-500 mt-3">
                Imported bootlegs appear in Cinema Mode alongside studio albums.
                Use the "Album types" filter in the Cinema ⚙ controls to show/hide bootlegs in the node cluster.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Search tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="card">
            <label className="label">Archive.org Search Query</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void doSearch(1); }}
                placeholder='e.g. creator:"King Gizzard" AND mediatype:audio'
              />
              <button className="btn-primary shrink-0" onClick={() => void doSearch(1)} disabled={searching}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-2 text-sm text-surface-600">
                Results per page:
                <select className="input w-20 py-1 text-sm" value={searchRows} onChange={e => setSearchRows(Number(e.target.value))}>
                  {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div className="text-xs text-surface-500 mt-2 space-y-0.5">
              <p>Tips: <code className="bg-surface-100 px-1 rounded">creator:"Band Name"</code>
                {' · '}<code className="bg-surface-100 px-1 rounded">collection:KingGizzardandtheLizardWizard</code>
                {' · '}<code className="bg-surface-100 px-1 rounded">subject:live</code>
              </p>
            </div>
          </div>

          {/* Direct URL loader */}
          <div className="card">
            <label className="label">Load by Archive.org URL or Identifier</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={directUrl}
                onChange={e => setDirectUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void loadDirectUrl(); }}
                placeholder="https://archive.org/details/kglw2024-01-01  or  kglw2024-01-01"
              />
              <button className="btn-secondary shrink-0" onClick={() => void loadDirectUrl()} disabled={!directUrl.trim()}>
                Load Show
              </button>
            </div>
          </div>

          {searchError && (
            <div className="card border-red-200 bg-red-50">
              <p className="text-sm text-red-700">{searchError}</p>
            </div>
          )}

          {searchResults !== null && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">
                  {searchTotal.toLocaleString()} results{searchResults.length < searchTotal ? ` (showing ${searchResults.length})` : ''}
                </h2>
                {!selectedBandId && <p className="text-xs text-amber-600">← Select a band to enable import</p>}
              </div>

              {searchResults.length === 0 && (
                <p className="text-sm text-surface-500 italic">No results. Try a different query.</p>
              )}

              <div className="space-y-2">
                {searchResults.map(doc => (
                  <ShowCard
                    key={doc.identifier}
                    identifier={doc.identifier}
                    title={doc.title}
                    date={doc.date}
                    coverage={doc.coverage}
                    downloads={doc.downloads}
                    onExpand={loadItem}
                    expanded={expanded[doc.identifier]}
                    importState={importState[doc.identifier]}
                    onImport={id => void importShow(id)}
                    selectedBandId={selectedBandId}
                    artworkSelection={artworkSelection}
                    onArtworkSelect={onArtworkSelect}
                  />
                ))}
              </div>

              {searchResults.length < searchTotal && (
                <div className="mt-4 text-center">
                  <button
                    className="btn-secondary"
                    onClick={() => void doSearch(searchPage.current + 1)}
                    disabled={searching}
                  >
                    {searching ? 'Loading…' : `Load more (${searchTotal - searchResults.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * AdminBootlegsPage — import live concert recordings from Archive.org as bootleg albums.
 *
 * Works for any band: search Archive.org for live audio recordings by creator/title,
 * preview the tracklist and artwork, then import the show as a bootleg album + songs.
 *
 * Also supports pasting a direct Archive.org URL or a KGLW bootlegger URL to load
 * a show instantly without searching.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanDate(raw?: string): string {
  if (!raw) return '';
  return raw.slice(0, 10);
}

/** Extract audio tracks from the Archive.org files list, deduplicated and sorted. */
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

/** Extract image files (covers, posters) from the Archive.org files list. */
function extractImages(identifier: string, files: ArchiveFile[]): { label: string; url: string }[] {
  const IMAGE_FORMATS = new Set(['JPEG', 'PNG', 'GIF', 'Item Image', 'JPEG Thumb', 'Thumbnail']);
  const images: { label: string; url: string }[] = [];

  // Always offer the Archive.org thumbnail service as first option
  images.push({
    label: 'Archive.org thumbnail (auto)',
    url: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
  });

  for (const f of files) {
    if (!IMAGE_FORMATS.has(f.format)) continue;
    if (f.format === 'JPEG Thumb' || f.format === 'Thumbnail') continue; // skip small thumbs
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['jpg', 'jpeg', 'png', 'gif'].includes(ext)) continue;
    images.push({
      label: f.name,
      url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(f.name)}`,
    });
  }

  return images;
}

/**
 * Parse an Archive.org identifier from:
 * - https://archive.org/details/IDENTIFIER
 * - https://archive.org/download/IDENTIFIER/...
 * - https://kinggizzardandthelizardwizard.com/bootlegger/... (may redirect to archive.org)
 * - A bare identifier (no slashes, no spaces)
 */
function parseIdentifier(input: string): string {
  const trimmed = input.trim();
  // archive.org URL
  const archiveMatch = trimmed.match(/archive\.org\/(?:details|download)\/([^/?#\s]+)/);
  if (archiveMatch?.[1]) return archiveMatch[1];
  // KGLW bootlegger URL pattern: /bootlegger/IDENTIFIER
  const kglwMatch = trimmed.match(/bootlegger\/([^/?#\s]+)/i);
  if (kglwMatch?.[1]) return kglwMatch[1];
  // Bare identifier (no slashes)
  if (!trimmed.includes('/') && !trimmed.includes(' ') && trimmed.length > 3) return trimmed;
  return '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminBootlegsPage() {
  const [selectedBandId, setSelectedBandId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRows, setSearchRows] = useState(50);
  const [directUrl, setDirectUrl] = useState('');

  const [searchResults, setSearchResults] = useState<ArchiveDoc[] | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchPage = useRef(1);

  const [expanded, setExpanded] = useState<Record<string, { loading: boolean; data?: ArchiveItemResponse; error?: string }>>({});
  const [importState, setImportState] = useState<Record<string, { loading: boolean; result?: ImportResult; error?: string }>>({});

  // Per-item selected artwork URL (defaults to archive.org thumbnail service)
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

  const loadItem = async (identifier: string) => {
    if (expanded[identifier]) {
      setExpanded(prev => { const next = { ...prev }; delete next[identifier]; return next; });
      return;
    }
    setExpanded(prev => ({ ...prev, [identifier]: { loading: true } }));
    try {
      const data = await api.get<ArchiveItemResponse>(`/api/admin/bootlegs/item/${encodeURIComponent(identifier)}`);
      setExpanded(prev => ({ ...prev, [identifier]: { loading: false, data } }));
      // Default artwork: archive.org thumbnail service
      setArtworkSelection(prev => ({
        ...prev,
        [identifier]: prev[identifier] ?? `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
      }));
    } catch (e) {
      setExpanded(prev => ({ ...prev, [identifier]: { loading: false, error: e instanceof Error ? e.message : 'Failed to load' } }));
    }
  };

  /** Load a show directly from a URL or bare identifier */
  const loadDirectUrl = async () => {
    const id = parseIdentifier(directUrl);
    if (!id) { alert('Could not parse an Archive.org identifier from that URL. Try pasting the full archive.org/details/... URL.'); return; }
    // Inject a synthetic doc into results so the UI renders it
    setSearchResults(prev => {
      if (prev?.some(d => d.identifier === id)) return prev;
      return [{ identifier: id, title: id }, ...(prev ?? [])];
    });
    setSearchTotal(t => t + 1);
    setDirectUrl('');
    await loadItem(id);
  };

  const importShow = async (doc: ArchiveDoc) => {
    if (!selectedBandId) { alert('Select a band first'); return; }
    const item = expanded[doc.identifier]?.data;
    setImportState(prev => ({ ...prev, [doc.identifier]: { loading: true } }));
    try {
      const tracks = item?.files ? extractTracks(item.files) : [];
      const meta = item?.metadata ?? {};
      const artworkUrl = artworkSelection[doc.identifier] ?? `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`;
      const result = await api.post<ImportResult>('/api/admin/bootlegs/import', {
        bandId: selectedBandId,
        identifier: doc.identifier,
        title: meta.title ?? doc.title ?? doc.identifier,
        date: cleanDate(meta.date ?? doc.date),
        venue: meta.venue ?? '',
        city: meta.coverage ?? doc.coverage ?? '',
        artworkUrl,
        tracks,
      });
      setImportState(prev => ({ ...prev, [doc.identifier]: { loading: false, result } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import failed';
      setImportState(prev => ({ ...prev, [doc.identifier]: { loading: false, error: msg } }));
    }
  };

  return (
    <div>
      <PageHeader
        title="Bootleg Importer"
        subtitle="Import live concert recordings from Archive.org as bootleg albums with artwork"
        actions={<Link to="/library" className="btn-secondary">← Library</Link>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* Band picker */}
        <div className="card">
          <label className="label">Band to import into *</label>
          <select className="input" value={selectedBandId} onChange={e => onBandChange(e.target.value)}>
            <option value="">— select band —</option>
            {bands?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {selectedBand && (
            <p className="text-xs text-surface-500 mt-1">
              Shows will be added to <strong>{selectedBand.name}</strong> as bootleg albums.
            </p>
          )}
        </div>

        {/* Search */}
        <div className="card md:col-span-2">
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
            <p>
              Tips: <code className="bg-surface-100 px-1 rounded">creator:"Band Name"</code>
              {' · '}<code className="bg-surface-100 px-1 rounded">collection:KingGizzardandtheLizardWizard</code>
              {' · '}<code className="bg-surface-100 px-1 rounded">subject:live</code>
            </p>
          </div>
        </div>
      </div>

      {/* Direct URL loader */}
      <div className="card mb-4">
        <label className="label">Load by URL or Identifier</label>
        <p className="text-xs text-surface-500 mb-2">
          Paste any Archive.org URL (<code className="bg-surface-100 px-1 rounded">archive.org/details/IDENTIFIER</code>), a KGLW bootlegger link, or a bare Archive.org identifier — the show is loaded instantly without searching.
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={directUrl}
            onChange={e => setDirectUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void loadDirectUrl(); }}
            placeholder="https://archive.org/details/kglw2024-01-01 or just kglw2024-01-01"
          />
          <button className="btn-secondary shrink-0" onClick={() => void loadDirectUrl()} disabled={!directUrl.trim()}>
            Load Show
          </button>
        </div>
      </div>

      {searchError && (
        <div className="card border-red-200 bg-red-50 mb-4">
          <p className="text-sm text-red-700">{searchError}</p>
        </div>
      )}

      {/* Results */}
      {searchResults !== null && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">
              {searchTotal.toLocaleString()} results{searchResults.length < searchTotal ? ` (showing ${searchResults.length})` : ''}
            </h2>
            {!selectedBandId && (
              <p className="text-xs text-amber-600">← Select a band to enable import</p>
            )}
          </div>

          {searchResults.length === 0 && (
            <p className="text-sm text-surface-500 italic">No results. Try a different query.</p>
          )}

          <div className="space-y-2">
            {searchResults.map(doc => {
              const exp = expanded[doc.identifier];
              const imp = importState[doc.identifier];
              const tracks = exp?.data?.files ? extractTracks(exp.data.files) : [];
              const images = exp?.data?.files ? extractImages(doc.identifier, exp.data.files) : [{ label: 'Archive.org thumbnail (auto)', url: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}` }];
              const meta = exp?.data?.metadata;
              const selectedArtwork = artworkSelection[doc.identifier] ?? images[0]?.url ?? '';

              return (
                <div key={doc.identifier} className="border border-surface-200 rounded-lg overflow-hidden">
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-50 hover:bg-surface-100 transition-colors">
                    {/* Artwork thumbnail */}
                    <img
                      src={`https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`}
                      alt=""
                      className="w-10 h-10 rounded object-cover shrink-0 bg-surface-200"
                      loading="lazy"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-surface-900 truncate">
                        {doc.title ?? doc.identifier}
                      </div>
                      <div className="text-xs text-surface-500 flex gap-3 mt-0.5 flex-wrap">
                        {doc.date && <span>📅 {cleanDate(doc.date)}</span>}
                        {doc.coverage && <span>📍 {doc.coverage}</span>}
                        {doc.downloads != null && <span>⬇ {doc.downloads.toLocaleString()}</span>}
                        <span className="font-mono text-surface-400">{doc.identifier}</span>
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
                        onClick={() => void loadItem(doc.identifier)}
                        className="text-xs text-surface-500 hover:text-surface-800 border border-surface-300 rounded px-2 py-0.5 bg-white transition-colors"
                      >
                        {exp ? (exp.loading ? '…' : '▲ Hide') : '▼ Preview'}
                      </button>
                      {!imp?.result && (
                        <button
                          onClick={() => void importShow(doc)}
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
                          {/* Preview of selected artwork */}
                          <img
                            src={selectedArtwork}
                            alt="cover"
                            className="w-full aspect-square object-cover rounded border border-surface-200 bg-surface-100"
                            loading="lazy"
                            onError={e => { (e.target as HTMLImageElement).src = ''; }}
                          />
                          {/* Alternative images */}
                          {images.length > 1 && (
                            <div className="space-y-1">
                              <div className="text-[10px] text-surface-500 font-medium">Pick artwork:</div>
                              <div className="max-h-24 overflow-y-auto space-y-0.5">
                                {images.map((img, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setArtworkSelection(prev => ({ ...prev, [doc.identifier]: img.url }))}
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
                            href={`https://archive.org/details/${encodeURIComponent(doc.identifier)}`}
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
                            <p className="text-xs text-surface-500 italic">No audio tracks found.</p>
                          )}
                          {tracks.length > 0 && !imp?.result && (
                            <button
                              onClick={() => void importShow(doc)}
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
                    <div className="border-t border-surface-200 px-3 py-2 text-xs text-surface-500">
                      Loading show details…
                    </div>
                  )}
                  {exp?.error && (
                    <div className="border-t border-surface-200 px-3 py-2 text-xs text-red-600">
                      {exp.error}
                    </div>
                  )}
                </div>
              );
            })}
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

      {/* Quick help */}
      {searchResults === null && !searching && (
        <div className="card bg-surface-50 border-surface-200">
          <h3 className="font-medium mb-2">How to use</h3>
          <ol className="space-y-2 text-sm text-surface-700 list-decimal list-inside">
            <li>Select a band from the dropdown</li>
            <li>The search box pre-fills a suitable Archive.org query — adjust if needed and click <strong>Search</strong></li>
            <li>Or paste any <strong>Archive.org URL</strong> or identifier directly into "Load by URL or Identifier" to skip searching</li>
            <li>Click <strong>▼ Preview</strong> to see the setlist and pick cover artwork for the show</li>
            <li>Click <strong>Import</strong> — the show becomes a bootleg album with artwork ready for Cinema node clusters</li>
          </ol>
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
            <p><strong>KGLW official bootlegs:</strong> Use <code>collection:KingGizzardandtheLizardWizard</code> for the full official collection.
              Their individual show pages are at <strong>archive.org/details/IDENTIFIER</strong> — paste them into the URL loader above.</p>
            <p><strong>Pearl Jam:</strong> Try <code>creator:"Pearl Jam" AND subject:live</code></p>
            <p><strong>Any band:</strong> <code>creator:"Band Name"</code> searches by artist/uploader field.</p>
          </div>
          <p className="text-xs text-surface-500 mt-3">
            Imported bootlegs appear in Cinema Mode alongside studio albums. Use the "Album types" filter in the Cinema ⚙ controls to show/hide bootlegs.
            Each imported show stores its Archive.org cover art as <code>artworkUrl</code> so it appears in Visual Node Mode.
          </p>
        </div>
      )}
    </div>
  );
}

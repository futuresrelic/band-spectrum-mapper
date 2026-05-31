/**
 * AdminBootlegsPage — import live concert recordings from Archive.org as bootleg albums.
 *
 * Works for any band: search Archive.org for live audio recordings by creator/title,
 * preview the tracklist, then import the show as a bootleg album + songs into BSM.
 *
 * The page is band-agnostic. KGLW has an official bootlegger collection, as does
 * Pearl Jam and many others — the same search flow handles all of them.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader';

// ---------------------------------------------------------------------------
// Types (matching Archive.org API shapes)
// ---------------------------------------------------------------------------

interface ArchiveDoc {
  identifier: string;
  title?: string;
  date?: string;
  coverage?: string;   // city / venue string from Archive.org
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

/** Extract a clean date string (YYYY-MM-DD) from Archive.org date fields */
function cleanDate(raw?: string): string {
  if (!raw) return '';
  return raw.slice(0, 10); // ISO datetime → date portion
}

/** Extract trackable audio files from Archive.org files list and sort by track number */
function extractTracks(files: ArchiveFile[]): { title: string; trackNumber: number }[] {
  const AUDIO_FORMATS = new Set(['Flac', 'VBR MP3', 'MP3', 'Ogg Vorbis', '64Kbps MP3', '128Kbps MP3', 'VBR MP3', 'WAVE', 'SHN']);
  // Prefer tracks with explicit title metadata; fall back to filename parsing
  const tracks = files
    .filter(f => AUDIO_FORMATS.has(f.format))
    .map(f => {
      const rawTitle = f.title ?? f.name.replace(/\.[^.]+$/, '').replace(/^\d+[\s.\-_]+/, '');
      const trackNum = f.track ? parseInt(f.track) : NaN;
      return { title: rawTitle.trim(), format: f.format, trackNum };
    })
    .filter(t => t.title.length > 0);

  // Deduplicate: if both FLAC and MP3 versions exist, keep FLAC (higher quality indicator)
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminBootlegsPage() {
  const [selectedBandId, setSelectedBandId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRows, setSearchRows] = useState(50);

  // Search state
  const [searchResults, setSearchResults] = useState<ArchiveDoc[] | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchPage = useRef(1);

  // Per-item expanded state: identifier → { loading, data, error }
  const [expanded, setExpanded] = useState<Record<string, { loading: boolean; data?: ArchiveItemResponse; error?: string }>>({});

  // Import state: identifier → { loading, result?, error? }
  const [importState, setImportState] = useState<Record<string, { loading: boolean; result?: ImportResult; error?: string }>>({});

  // Fetch bands for the picker
  const { data: bands } = useQuery({
    queryKey: ['bands-list'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/api/bands'),
  });

  const selectedBand = bands?.find(b => b.id === selectedBandId);

  // When band is selected, prefill a sensible search query
  const onBandChange = (bandId: string) => {
    setSelectedBandId(bandId);
    const band = bands?.find(b => b.id === bandId);
    if (band) {
      setSearchQuery(`creator:"${band.name}" AND mediatype:audio`);
    }
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

  const expandItem = async (identifier: string) => {
    if (expanded[identifier]) {
      // Collapse
      setExpanded(prev => { const next = { ...prev }; delete next[identifier]; return next; });
      return;
    }
    setExpanded(prev => ({ ...prev, [identifier]: { loading: true } }));
    try {
      const data = await api.get<ArchiveItemResponse>(`/api/admin/bootlegs/item/${encodeURIComponent(identifier)}`);
      setExpanded(prev => ({ ...prev, [identifier]: { loading: false, data } }));
    } catch (e) {
      setExpanded(prev => ({ ...prev, [identifier]: { loading: false, error: e instanceof Error ? e.message : 'Failed to load' } }));
    }
  };

  const importShow = async (doc: ArchiveDoc) => {
    if (!selectedBandId) { alert('Select a band first'); return; }
    const item = expanded[doc.identifier]?.data;

    setImportState(prev => ({ ...prev, [doc.identifier]: { loading: true } }));
    try {
      const tracks = item?.files ? extractTracks(item.files) : [];
      const meta = item?.metadata ?? {};
      const result = await api.post<ImportResult>('/api/admin/bootlegs/import', {
        bandId: selectedBandId,
        identifier: doc.identifier,
        title: meta.title ?? doc.title ?? doc.identifier,
        date: cleanDate(meta.date ?? doc.date),
        venue: meta.venue ?? '',
        city: meta.coverage ?? doc.coverage ?? '',
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
        subtitle="Import live concert recordings from Archive.org as bootleg albums"
        actions={<Link to="/library" className="btn-secondary">← Library</Link>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Band picker */}
        <div className="card">
          <label className="label">Band to import into *</label>
          <select
            className="input"
            value={selectedBandId}
            onChange={e => onBandChange(e.target.value)}
          >
            <option value="">— select band —</option>
            {bands?.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {selectedBand && (
            <p className="text-xs text-surface-500 mt-1">
              Imported shows will be added to <strong>{selectedBand.name}</strong> as bootleg albums.
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
            <button
              className="btn-primary shrink-0"
              onClick={() => void doSearch(1)}
              disabled={searching}
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm text-surface-600">
              Results per page:
              <select
                className="input w-20 py-1 text-sm"
                value={searchRows}
                onChange={e => setSearchRows(Number(e.target.value))}
              >
                {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="text-xs text-surface-500 mt-2 space-y-0.5">
            <p>Tips: <code className="bg-surface-100 px-1 rounded">creator:"Band Name"</code> · <code className="bg-surface-100 px-1 rounded">subject:"kglw"</code> · <code className="bg-surface-100 px-1 rounded">collection:KingGizzardandtheLizardWizard</code></p>
            <p>For KGLW: their official bootlegger collection is on Archive.org at <strong>archive.org/details/KingGizzardandtheLizardWizard</strong></p>
          </div>
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
              const meta = exp?.data?.metadata;

              return (
                <div key={doc.identifier} className="border border-surface-200 rounded-lg overflow-hidden">
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-50 hover:bg-surface-100 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-surface-900 truncate">
                        {doc.title ?? doc.identifier}
                      </div>
                      <div className="text-xs text-surface-500 flex gap-3 mt-0.5 flex-wrap">
                        {doc.date && <span>📅 {cleanDate(doc.date)}</span>}
                        {doc.coverage && <span>📍 {doc.coverage}</span>}
                        {doc.downloads != null && <span>⬇ {doc.downloads.toLocaleString()} downloads</span>}
                        <span className="font-mono text-surface-400">{doc.identifier}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Import status */}
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

                      {/* Expand/collapse tracklist */}
                      <button
                        onClick={() => void expandItem(doc.identifier)}
                        className="text-xs text-surface-500 hover:text-surface-800 border border-surface-300 rounded px-2 py-0.5 bg-white transition-colors"
                      >
                        {exp ? (exp.loading ? '…' : '▲ Hide') : '▼ Tracklist'}
                      </button>

                      {/* Import button */}
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

                  {/* Expanded: tracklist */}
                  {exp && !exp.loading && exp.data && (
                    <div className="border-t border-surface-200 px-3 py-2 bg-white">
                      {meta?.venue && (
                        <p className="text-xs text-surface-600 mb-1">
                          📍 {meta.venue}{meta.coverage ? `, ${meta.coverage}` : ''}
                        </p>
                      )}
                      {tracks.length > 0 ? (
                        <ol className="space-y-0.5 max-h-48 overflow-y-auto">
                          {tracks.map((t, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-surface-700">
                              <span className="text-surface-400 tabular-nums w-5 text-right shrink-0">{t.trackNumber}.</span>
                              <span>{t.title}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-xs text-surface-500 italic">No audio tracks found in this item.</p>
                      )}
                      {tracks.length > 0 && !imp?.result && (
                        <button
                          onClick={() => void importShow(doc)}
                          disabled={!selectedBandId || imp?.loading}
                          className="btn-primary text-xs py-1 px-3 mt-2 disabled:opacity-40"
                        >
                          {imp?.loading ? 'Importing…' : `Import (${tracks.length} tracks)`}
                        </button>
                      )}
                    </div>
                  )}

                  {exp?.loading && (
                    <div className="border-t border-surface-200 px-3 py-2 text-xs text-surface-500">
                      Loading tracklist…
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

          {/* Load more */}
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
            <li>Select a band from the dropdown (e.g. King Gizzard and the Lizard Wizard)</li>
            <li>The search box pre-fills with a suitable Archive.org query — adjust if needed</li>
            <li>Click <strong>Search</strong> to browse available live recordings</li>
            <li>Click <strong>▼ Tracklist</strong> to preview the setlist for a show</li>
            <li>Click <strong>Import</strong> to add the show as a bootleg album with songs</li>
          </ol>
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
            <p><strong>KGLW specific:</strong> Use <code>collection:KingGizzardandtheLizardWizard</code> to get their official bootlegger releases only.</p>
            <p><strong>Pearl Jam:</strong> Try <code>creator:"Pearl Jam" AND subject:live</code></p>
            <p><strong>Any band:</strong> <code>creator:"Band Name"</code> searches by uploader/artist field.</p>
          </div>
          <p className="text-xs text-surface-500 mt-3">
            Imported bootlegs appear in Cinema Mode alongside studio albums. Use the album type filter in the Cinema ⚙ controls to show/hide bootlegs.
          </p>
        </div>
      )}
    </div>
  );
}

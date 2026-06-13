import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminApi, type MissingBandLogo } from '../api/admin';
import { bandsApi } from '../api/bands';

type ArtResult = { url: string; label: string; source: string; isLogo?: boolean };

type BandState = {
  mode: 'idle' | 'searching' | 'results' | 'saving' | 'done' | 'error';
  searchTerm: string;
  results: ArtResult[];
  selected: string | null;
  pasteUrl: string;
  error: string;
};

function initialState(band: MissingBandLogo): BandState {
  return { mode: 'idle', searchTerm: band.name, results: [], selected: null, pasteUrl: '', error: '' };
}

// ── Image search (6 free sources, no API keys needed) ────────────────────────
// Results are split into logos (shown first) and photos.
// Sources that specifically return graphical band logos:
//   • TheAudioDB strArtistLogo  (explicit logo field)
//   • Wikimedia Commons          (file-namespace logo search)
// Sources that return artist photos:
//   • Deezer, iTunes, Discogs, Wikipedia

async function searchBandImages(term: string): Promise<ArtResult[]> {
  const logos:  ArtResult[] = [];  // graphical band logos — shown first
  const photos: ArtResult[] = [];  // artist/promo photos

  // 1. TheAudioDB — logo specifically tagged + other art types
  try {
    const r = await fetch(
      `https://theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(term)}`
    );
    const d = await r.json() as {
      artists?: {
        strArtist?: string;
        strArtistThumb?: string;
        strArtistLogo?: string;
        strArtistBanner?: string;
        strArtistFanart?: string;
        strArtistFanart2?: string;
      }[];
    };
    for (const a of (d.artists ?? [])) {
      const name = a.strArtist ?? term;
      // Logo goes into logos[] — it's the actual band wordmark/logotype
      if (a.strArtistLogo)    logos.push({ url: a.strArtistLogo,    label: `${name} — Logo`,    source: 'AudioDB', isLogo: true });
      if (a.strArtistThumb)   photos.push({ url: a.strArtistThumb,  label: `${name} — Thumb`,   source: 'AudioDB' });
      if (a.strArtistBanner)  photos.push({ url: a.strArtistBanner, label: `${name} — Banner`,  source: 'AudioDB' });
      if (a.strArtistFanart)  photos.push({ url: a.strArtistFanart, label: `${name} — Fanart`,  source: 'AudioDB' });
      if (a.strArtistFanart2) photos.push({ url: a.strArtistFanart2, label: `${name} — Fanart2`, source: 'AudioDB' });
    }
  } catch { /* offline */ }

  // 2. Wikimedia Commons — file-namespace search for "{term} logo"
  // Often contains the official SVG/PNG band logo uploaded to Commons.
  try {
    const r = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term + ' logo')}&srnamespace=6&format=json&origin=*&srlimit=10`
    );
    const d = await r.json() as {
      query?: { search?: { title: string }[] };
    };
    for (const item of (d.query?.search ?? [])) {
      // Special:FilePath serves the file at any width; ?width=600 for reasonable size
      const file = item.title.replace(/^File:/, '');
      const url  = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=600`;
      const label = file.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      logos.push({ url, label, source: 'Commons', isLogo: true });
    }
  } catch { /* offline */ }

  // 3. Deezer — free, no auth, returns artist photos
  try {
    const r = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(term)}&limit=10`
    );
    const d = await r.json() as {
      data?: { name: string; picture_xl?: string; picture_big?: string }[];
    };
    for (const item of (d.data ?? [])) {
      const pic = item.picture_xl ?? item.picture_big;
      if (pic && !pic.includes('default')) {
        photos.push({ url: pic, label: item.name, source: 'Deezer' });
      }
    }
  } catch { /* offline */ }

  // 4. Discogs — free artist search, returns artist images (no auth required)
  try {
    const r = await fetch(
      `https://api.discogs.com/database/search?q=${encodeURIComponent(term)}&type=artist&per_page=8`,
      { headers: { 'User-Agent': 'BandSpectrumMapper/1.0' } }
    );
    const d = await r.json() as {
      results?: { thumb?: string; cover_image?: string; title: string }[];
    };
    for (const item of (d.results ?? [])) {
      const img = item.cover_image ?? item.thumb;
      if (img && !img.includes('spacer') && !img.includes('placeholder')) {
        photos.push({ url: img, label: item.title, source: 'Discogs' });
      }
    }
  } catch { /* offline */ }

  // 5. iTunes — musicArtist entity returns artist art (promo photos)
  try {
    const r = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=musicArtist&limit=8&media=music`
    );
    const d = await r.json() as {
      results: { artworkUrl100?: string; artistName?: string }[];
    };
    for (const item of d.results) {
      if (item.artworkUrl100) {
        photos.push({
          url: item.artworkUrl100.replace('100x100bb', '600x600bb'),
          label: item.artistName ?? term,
          source: 'iTunes',
        });
      }
    }
  } catch { /* offline */ }

  // 6. Wikipedia — band article thumbnail (often a promo photo or album art)
  try {
    const r = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term + ' band')}&prop=pageimages&pithumbsize=600&format=json&origin=*&gsrlimit=5`
    );
    const d = await r.json() as {
      query?: { pages?: Record<string, { title: string; thumbnail?: { source: string } }> };
    };
    if (d.query?.pages) {
      for (const page of Object.values(d.query.pages)) {
        if (page.thumbnail?.source) {
          photos.push({ url: page.thumbnail.source, label: page.title, source: 'Wikipedia' });
        }
      }
    }
  } catch { /* offline */ }

  // Logos first, then photos — caller sees the most useful results at the top
  return [...logos, ...photos];
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminMissingBandLogoPage() {
  const [bands, setBands]   = useState<MissingBandLogo[] | null>(null);
  const [states, setStates] = useState<Record<string, BandState>>({});
  const [doneCount, setDoneCount] = useState(0);

  const scanMutation = useMutation({
    mutationFn: () => adminApi.getMissingBandLogos(),
    onSuccess: (data) => {
      setBands(data);
      const init: Record<string, BandState> = {};
      for (const b of data) init[b.id] = initialState(b);
      setStates(init);
    },
  });

  function get(id: string): BandState | undefined { return states[id]; }

  function set(id: string, update: Partial<BandState>) {
    setStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? initialState({ id, name: '', slug: '', songCount: 0, albumCount: 0 })), ...update },
    }));
  }

  async function doSearch(band: MissingBandLogo) {
    const term = get(band.id)?.searchTerm ?? band.name;
    set(band.id, { mode: 'searching', results: [], selected: null, error: '' });
    const results = await searchBandImages(term);
    set(band.id, { mode: 'results', results });
  }

  async function doSave(band: MissingBandLogo, url: string) {
    set(band.id, { mode: 'saving' });
    try {
      await bandsApi.update(band.id, { logoUrl: url });
      set(band.id, { mode: 'done', selected: url });
      setDoneCount((n) => n + 1);
      setTimeout(() => setBands((prev) => prev?.filter((b) => b.id !== band.id) ?? null), 1500);
    } catch (e) {
      set(band.id, { mode: 'error', error: e instanceof Error ? e.message : 'Save failed' });
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-surface-900 mb-1">Missing Band Logos</h1>
        <p className="text-sm text-surface-500">
          Bands with no logo or image stored. Search iTunes, Deezer, AudioDB, and Wikipedia — pick
          the best result and save. You can also paste any image URL directly.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => { setBands(null); setStates({}); setDoneCount(0); scanMutation.mutate(); }}
          disabled={scanMutation.isPending}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {scanMutation.isPending ? 'Scanning…' : 'Scan for missing band logos'}
        </button>
        {bands !== null && (
          <span className="text-sm text-surface-500">
            {bands.length} band{bands.length !== 1 ? 's' : ''} without a logo
            {doneCount > 0 && <span className="text-emerald-600 ml-2">· {doneCount} filled this session</span>}
          </span>
        )}
        {scanMutation.isError && (
          <span className="text-sm text-red-500">{(scanMutation.error as Error).message}</span>
        )}
      </div>

      {bands !== null && bands.length === 0 && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-6 py-4">
          <p className="text-sm text-emerald-700 font-medium">All bands have logos.</p>
        </div>
      )}

      {bands !== null && bands.length > 0 && (
        <div className="space-y-4">
          {bands.map((band) => {
            const s = get(band.id);
            if (!s) return null;
            return (
              <BandCard
                key={band.id}
                band={band}
                state={s}
                onSearchTermChange={(t) => set(band.id, { searchTerm: t })}
                onPasteUrlChange={(u) => set(band.id, { pasteUrl: u })}
                onSearch={() => void doSearch(band)}
                onSelect={(url) => set(band.id, { selected: url })}
                onSave={(url) => void doSave(band, url)}
                onReset={() => set(band.id, { mode: 'idle', results: [], selected: null, pasteUrl: '', error: '' })}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── BandCard ──────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
  iTunes:    'bg-pink-100 text-pink-700',
  Deezer:    'bg-purple-100 text-purple-700',
  AudioDB:   'bg-blue-100 text-blue-700',
  Wikipedia: 'bg-orange-100 text-orange-700',
  Commons:   'bg-emerald-100 text-emerald-700',
  Discogs:   'bg-amber-100 text-amber-700',
};

function BandCard({
  band,
  state,
  onSearchTermChange,
  onPasteUrlChange,
  onSearch,
  onSelect,
  onSave,
  onReset,
}: {
  band: MissingBandLogo;
  state: BandState;
  onSearchTermChange: (t: string) => void;
  onPasteUrlChange: (u: string) => void;
  onSearch: () => void;
  onSelect: (url: string) => void;
  onSave: (url: string) => void;
  onReset: () => void;
}) {
  const busy = state.mode === 'searching' || state.mode === 'saving';
  const saveUrl = state.selected ?? (state.pasteUrl.startsWith('http') ? state.pasteUrl : null);

  if (state.mode === 'done') {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        {state.selected && (
          <img src={state.selected} alt="" className="w-14 h-14 object-contain rounded-lg border border-emerald-200" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-surface-800">{band.name}</p>
          <p className="text-xs text-emerald-600">Logo saved</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-surface-200 rounded-xl p-5 space-y-4 shadow-sm">
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-surface-900">{band.name}</p>
          <p className="text-xs text-surface-400 mt-0.5">
            {band.albumCount} album{band.albumCount !== 1 ? 's' : ''} · {band.songCount} song{band.songCount !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Search row */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={state.searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
            placeholder="Band name to search"
            className="border border-surface-300 rounded-lg px-3 py-1.5 text-sm text-surface-800 w-52 focus:outline-none focus:border-indigo-400 transition-colors"
          />
          <button
            onClick={onSearch}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {state.mode === 'searching' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {/* Paste URL shortcut */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-surface-400 shrink-0">Or paste URL:</span>
        <input
          type="url"
          value={state.pasteUrl}
          onChange={(e) => onPasteUrlChange(e.target.value)}
          placeholder="https://…"
          className="flex-1 border border-surface-300 rounded-lg px-3 py-1.5 text-sm text-surface-700 focus:outline-none focus:border-indigo-400 transition-colors min-w-0"
        />
        {state.pasteUrl.startsWith('http') && (
          <button
            onClick={() => onSave(state.pasteUrl)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors shrink-0"
          >
            Save URL
          </button>
        )}
      </div>

      {state.mode === 'error' && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      {/* Results */}
      {(state.mode === 'results' || state.mode === 'saving') && (
        <>
          {state.results.length === 0 ? (
            <p className="text-sm text-surface-400 italic">No images found. Try a different search term or paste a URL above.</p>
          ) : (() => {
            const logoResults  = state.results.filter((r) => r.isLogo);
            const photoResults = state.results.filter((r) => !r.isLogo);

            function ResultGrid({ items, heading }: { items: ArtResult[]; heading: string }) {
              if (!items.length) return null;
              return (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-surface-500 mb-1.5">
                    {heading} <span className="font-normal text-surface-600">({items.length})</span>
                  </p>
                  <div className="overflow-x-auto">
                    <div className="flex gap-3 pb-2" style={{ width: 'max-content' }}>
                      {items.map((r, i) => (
                        <button
                          key={i}
                          onClick={() => onSelect(r.url)}
                          title={`${r.label} (${r.source})`}
                          className={`relative shrink-0 rounded-xl overflow-hidden border-2 transition-all group ${
                            state.selected === r.url
                              ? 'border-indigo-500 ring-2 ring-indigo-400'
                              : heading.startsWith('Logo')
                                ? 'border-emerald-200 hover:border-emerald-400'
                                : 'border-surface-200 hover:border-indigo-300'
                          }`}
                        >
                          <img
                            src={r.url}
                            alt={r.label}
                            className="w-24 h-24 object-contain bg-surface-100"
                            onError={(e) => {
                              const btn = e.currentTarget.closest('button') as HTMLElement | null;
                              if (btn) btn.style.display = 'none';
                            }}
                          />
                          <span className={`absolute bottom-1 left-1 text-[9px] font-bold px-1 rounded ${SOURCE_COLORS[r.source] ?? 'bg-gray-100 text-gray-600'}`}>
                            {r.source}
                          </span>
                          {state.selected === r.url && (
                            <span className="absolute inset-0 flex items-center justify-center bg-indigo-900/50 text-white text-2xl">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div className="space-y-4">
                <ResultGrid items={logoResults}  heading="Logos — click to select" />
                {logoResults.length > 0 && photoResults.length > 0 && (
                  <div className="border-t border-surface-200" />
                )}
                <ResultGrid items={photoResults} heading="Photos — click to select" />
                {logoResults.length === 0 && (
                  <p className="text-xs text-surface-500 italic">
                    No dedicated logos found. Try a more specific search term, or paste a URL from
                    a Google Images search for "{state.searchTerm} band logo".
                  </p>
                )}
              </div>
            );
          })()}

          {saveUrl && (
            <div className="flex items-start gap-4 pt-2 border-t border-surface-100">
              <img
                src={saveUrl}
                alt="selected"
                className="w-20 h-20 object-contain rounded-xl border border-surface-200 shrink-0 bg-surface-50"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs text-surface-400 font-mono break-all">{saveUrl}</p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => onSave(saveUrl)}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                  >
                    {state.mode === 'saving' ? 'Saving…' : 'Save as band logo'}
                  </button>
                  <button
                    onClick={() => onSelect('')}
                    className="text-sm text-surface-400 hover:text-surface-600 transition-colors"
                  >
                    Deselect
                  </button>
                </div>
              </div>
            </div>
          )}

          <button onClick={onReset} className="text-xs text-surface-400 hover:text-surface-600 transition-colors">
            Clear results
          </button>
        </>
      )}
    </div>
  );
}

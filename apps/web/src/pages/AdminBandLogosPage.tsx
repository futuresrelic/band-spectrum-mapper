import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { bandsApi } from '../api/bands';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Band {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  _count: { albums: number; songs: number };
}

type ArtResult = { url: string; label: string; source: string; isLogo?: boolean };

type Filter = 'all' | 'has' | 'missing';

// ---------------------------------------------------------------------------
// Multi-source logo search (same sources as AdminMissingBandLogoPage)
// ---------------------------------------------------------------------------

async function searchBandImages(term: string): Promise<ArtResult[]> {
  const logos: ArtResult[] = [];
  const photos: ArtResult[] = [];

  await Promise.allSettled([
    // TheAudioDB
    fetch(`https://theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(term)}`)
      .then((r) => r.json())
      .then((d: { artists?: { strArtist?: string; strArtistThumb?: string; strArtistLogo?: string; strArtistBanner?: string; strArtistFanart?: string }[] }) => {
        for (const a of d.artists ?? []) {
          const n = a.strArtist ?? term;
          if (a.strArtistLogo)   logos.push({ url: a.strArtistLogo,   label: `${n} — Logo`,   source: 'AudioDB', isLogo: true });
          if (a.strArtistThumb)  photos.push({ url: a.strArtistThumb,  label: `${n} — Thumb`,  source: 'AudioDB' });
          if (a.strArtistBanner) photos.push({ url: a.strArtistBanner, label: `${n} — Banner`, source: 'AudioDB' });
          if (a.strArtistFanart) photos.push({ url: a.strArtistFanart, label: `${n} — Fanart`, source: 'AudioDB' });
        }
      }),

    // Wikimedia Commons
    fetch(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term + ' logo')}&srnamespace=6&format=json&origin=*&srlimit=10`)
      .then((r) => r.json())
      .then((d: { query?: { search?: { title: string }[] } }) => {
        for (const item of d.query?.search ?? []) {
          const file = item.title.replace(/^File:/, '');
          logos.push({ url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=600`, label: file.replace(/\.[^.]+$/, '').replace(/_/g, ' '), source: 'Commons', isLogo: true });
        }
      }),

    // Deezer
    fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(term)}&limit=10`)
      .then((r) => r.json())
      .then((d: { data?: { name: string; picture_xl?: string; picture_big?: string }[] }) => {
        for (const item of d.data ?? []) {
          const pic = item.picture_xl ?? item.picture_big;
          if (pic && !pic.includes('default')) photos.push({ url: pic, label: item.name, source: 'Deezer' });
        }
      }),

    // Discogs
    fetch(`https://api.discogs.com/database/search?q=${encodeURIComponent(term)}&type=artist&per_page=8`, { headers: { 'User-Agent': 'BandSpectrumMapper/1.0' } })
      .then((r) => r.json())
      .then((d: { results?: { thumb?: string; cover_image?: string; title: string }[] }) => {
        for (const item of d.results ?? []) {
          const img = item.cover_image ?? item.thumb;
          if (img && !img.includes('spacer') && !img.includes('placeholder')) photos.push({ url: img, label: item.title, source: 'Discogs' });
        }
      }),

    // iTunes
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=musicArtist&limit=8&media=music`)
      .then((r) => r.json())
      .then((d: { results: { artworkUrl100?: string; artistName?: string }[] }) => {
        for (const item of d.results) {
          if (item.artworkUrl100) photos.push({ url: item.artworkUrl100.replace('100x100bb', '600x600bb'), label: item.artistName ?? term, source: 'iTunes' });
        }
      }),

    // Wikipedia
    fetch(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term + ' band')}&prop=pageimages&pithumbsize=600&format=json&origin=*&gsrlimit=5`)
      .then((r) => r.json())
      .then((d: { query?: { pages?: Record<string, { title: string; thumbnail?: { source: string } }> } }) => {
        for (const page of Object.values(d.query?.pages ?? {})) {
          if (page.thumbnail?.source) photos.push({ url: page.thumbnail.source, label: page.title, source: 'Wikipedia' });
        }
      }),
  ]);

  return [...logos, ...photos];
}

// ---------------------------------------------------------------------------
// Source badge colours
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<string, string> = {
  iTunes:    'bg-pink-100 text-pink-700',
  Deezer:    'bg-purple-100 text-purple-700',
  AudioDB:   'bg-blue-100 text-blue-700',
  Wikipedia: 'bg-orange-100 text-orange-700',
  Commons:   'bg-emerald-100 text-emerald-700',
  Discogs:   'bg-amber-100 text-amber-700',
};

// ---------------------------------------------------------------------------
// Edit panel — shown when a band is selected
// ---------------------------------------------------------------------------

interface EditPanelProps {
  band: Band;
  onSaved: (logoUrl: string | null) => void;
  onClose: () => void;
}

function EditPanel({ band, onSaved, onClose }: EditPanelProps) {
  const [searchTerm, setSearchTerm]   = useState(band.name);
  const [pasteUrl, setPasteUrl]       = useState(band.logoUrl ?? '');
  const [results, setResults]         = useState<ArtResult[]>([]);
  const [selected, setSelected]       = useState<string | null>(band.logoUrl);
  const [searching, setSearching]     = useState(false);
  const [msg, setMsg]                 = useState<{ text: string; ok: boolean } | null>(null);

  const saveMutation = useMutation({
    mutationFn: (url: string | null) => bandsApi.update(band.id, { logoUrl: url ?? undefined }),
    onSuccess: (_, url) => {
      setMsg({ text: 'Saved.', ok: true });
      onSaved(url);
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e: Error) => setMsg({ text: e.message, ok: false }),
  });

  async function doSearch() {
    setSearching(true);
    setResults([]);
    try {
      const r = await searchBandImages(searchTerm);
      setResults(r);
    } finally {
      setSearching(false);
    }
  }

  const saveUrl = selected ?? (pasteUrl.startsWith('http') ? pasteUrl : null);
  const logos  = results.filter((r) => r.isLogo);
  const photos = results.filter((r) => !r.isLogo);

  return (
    <div className="bg-white border border-surface-200 rounded-xl p-5 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {selected ? (
            <img src={selected} alt="" className="w-14 h-14 object-contain rounded-lg border border-surface-200 shrink-0 bg-surface-50" />
          ) : (
            <div className="w-14 h-14 rounded-lg border border-surface-200 bg-surface-100 flex items-center justify-center text-xl font-bold text-surface-400 shrink-0">
              {band.name[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-surface-900">{band.name}</p>
            <p className="text-xs text-surface-400">{band._count.albums} albums · {band._count.songs} songs</p>
          </div>
        </div>
        <button onClick={onClose} className="text-surface-400 hover:text-surface-700 text-lg leading-none shrink-0">✕</button>
      </div>

      {/* Paste URL */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-surface-600 uppercase tracking-widest">Paste image URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={pasteUrl}
            onChange={(e) => { setPasteUrl(e.target.value); if (e.target.value.startsWith('http')) setSelected(e.target.value); }}
            placeholder="https://..."
            className="flex-1 border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {pasteUrl && (
            <button
              onClick={() => { setPasteUrl(''); setSelected(band.logoUrl); }}
              className="px-3 py-2 text-xs text-surface-500 hover:text-surface-800 border border-surface-200 rounded-lg"
            >Clear</button>
          )}
        </div>
      </div>

      {/* Source search */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-surface-600 uppercase tracking-widest">Search image sources</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void doSearch(); }}
            className="flex-1 border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => { void doSearch(); }}
            disabled={searching || !searchTerm.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        <p className="text-[11px] text-surface-400">Searches AudioDB, Wikimedia Commons, Deezer, Discogs, iTunes, Wikipedia</p>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {logos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-700 mb-2">Logos ({logos.length})</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {logos.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelected(r.url); setPasteUrl(r.url); }}
                    title={`${r.label} — ${r.source}`}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors bg-surface-50 ${
                      selected === r.url ? 'border-indigo-500' : 'border-surface-200 hover:border-surface-400'
                    }`}
                  >
                    <img src={r.url} alt={r.label} className="w-full h-full object-contain p-1" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {photos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-surface-500 mb-2">Photos ({photos.length})</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {photos.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelected(r.url); setPasteUrl(r.url); }}
                    title={`${r.label} — ${r.source}`}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                      selected === r.url ? 'border-indigo-500' : 'border-surface-200 hover:border-surface-400'
                    }`}
                  >
                    <img src={r.url} alt={r.label} className="w-full h-full object-cover" loading="lazy" />
                    <div className={`absolute bottom-0 right-0 text-[9px] px-1 rounded-tl font-medium ${SOURCE_COLORS[r.source] ?? 'bg-gray-100 text-gray-600'}`}>
                      {r.source}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save / remove */}
      <div className="flex items-center gap-3 pt-1 border-t border-surface-100">
        <button
          onClick={() => { if (saveUrl) saveMutation.mutate(saveUrl); }}
          disabled={!saveUrl || saveMutation.isPending}
          className="px-5 py-2 bg-surface-900 hover:bg-surface-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save logo'}
        </button>
        {band.logoUrl && (
          <button
            onClick={() => { if (window.confirm('Remove this logo?')) saveMutation.mutate(null); }}
            disabled={saveMutation.isPending}
            className="px-4 py-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            Remove logo
          </button>
        )}
        {msg && (
          <span className={`text-sm font-medium ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminBandLogosPage() {
  const qc = useQueryClient();

  const { data: bands = [], isLoading } = useQuery<Band[]>({
    queryKey: ['admin-all-bands-logos'],
    queryFn: () => api.get<Band[]>('/api/bands'),
    staleTime: 60_000,
  });

  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState<Filter>('all');
  const [selectedId, setSelectedId]   = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = bands;
    if (filter === 'has')     list = list.filter((b) => b.logoUrl);
    if (filter === 'missing') list = list.filter((b) => !b.logoUrl);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }
    return list;
  }, [bands, filter, search]);

  const hasLogo     = bands.filter((b) => b.logoUrl).length;
  const missingLogo = bands.length - hasLogo;
  const selected    = filtered.find((b) => b.id === selectedId) ?? null;

  function handleSaved(bandId: string, logoUrl: string | null) {
    qc.setQueryData<Band[]>(['admin-all-bands-logos'], (prev) =>
      prev?.map((b) => b.id === bandId ? { ...b, logoUrl } : b) ?? []
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-900">Band Logos</h1>
        <p className="text-sm text-surface-500 mt-1">
          View and manage logo images for every band. Click any card to search sources or paste a URL.
        </p>
      </div>

      {/* Stats + filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-surface-500">{bands.length} bands total</span>
          <span className="text-emerald-600 font-medium">{hasLogo} with logo</span>
          {missingLogo > 0 && (
            <span className="text-red-500 font-medium">{missingLogo} missing</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter bands…"
            className="border border-surface-200 rounded-lg px-3 py-1.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
          />

          {/* Filter toggle */}
          <div className="flex rounded-lg border border-surface-200 overflow-hidden text-sm">
            {(['all', 'has', 'missing'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 font-medium transition-colors capitalize ${
                  filter === f
                    ? 'bg-surface-900 text-white'
                    : 'bg-white text-surface-600 hover:bg-surface-50'
                }`}
              >
                {f === 'has' ? 'Has logo' : f === 'missing' ? 'Missing' : 'All'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Edit panel — shown above the grid when a band is selected */}
      {selected && (
        <EditPanel
          key={selected.id}
          band={selected}
          onSaved={(url) => handleSaved(selected.id, url)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="text-sm text-surface-400 py-12 text-center">Loading bands…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-surface-400 py-12 text-center">No bands match this filter.</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {filtered.map((band) => {
            const isActive = selectedId === band.id;
            return (
              <button
                key={band.id}
                onClick={() => setSelectedId(isActive ? null : band.id)}
                className={`flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-colors text-left group ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-surface-200 bg-white hover:border-surface-400'
                }`}
              >
                {/* Logo or placeholder */}
                <div className="w-full aspect-square rounded-lg overflow-hidden bg-surface-100 border border-surface-100 flex items-center justify-center relative">
                  {band.logoUrl ? (
                    <img
                      src={band.logoUrl}
                      alt={band.name}
                      className="w-full h-full object-contain p-1"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-surface-300">
                      {band.name[0]?.toUpperCase()}
                    </span>
                  )}
                  {/* Missing indicator */}
                  {!band.logoUrl && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-400" title="No logo" />
                  )}
                </div>

                {/* Name */}
                <span className="text-xs text-surface-700 font-medium text-center leading-tight line-clamp-2 w-full">
                  {band.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

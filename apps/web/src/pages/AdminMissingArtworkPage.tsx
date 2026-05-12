import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, type MissingArtworkAlbum } from '../api/admin';
import { albumsApi } from '../api/albums';

type ArtResult = { url: string; label: string };

type AlbumState = {
  mode: 'idle' | 'searching' | 'results' | 'saving' | 'done' | 'error';
  searchTerm: string;
  results: ArtResult[];
  selected: string | null;
  error: string;
};

function initialState(album: MissingArtworkAlbum): AlbumState {
  return {
    mode: 'idle',
    searchTerm: `${album.bandName} ${album.title}`,
    results: [],
    selected: null,
    error: '',
  };
}

async function searchArtwork(term: string): Promise<ArtResult[]> {
  const combined: ArtResult[] = [];

  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=album&limit=20&media=music`
    );
    const data = await res.json() as { results: { artworkUrl100?: string; collectionName?: string; artistName?: string }[] };
    combined.push(...data.results
      .filter((r) => r.artworkUrl100)
      .map((r) => ({
        url: r.artworkUrl100!.replace('100x100bb', '600x600bb'),
        label: `${r.artistName ?? ''} – ${r.collectionName ?? ''}`,
      }))
    );
  } catch { /* network unavailable */ }

  try {
    const mbRes = await fetch(
      `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(term)}&limit=15&fmt=json`,
      { headers: { 'User-Agent': 'BandSpectrumMapper/1.0 (music-analysis-tool)' } }
    );
    const mbData = await mbRes.json() as { releases?: { id: string; title: string; 'artist-credit'?: { name: string }[] }[] };
    if (mbData.releases) {
      combined.push(...mbData.releases.map((r) => ({
        url: `https://coverartarchive.org/release/${r.id}/front-500`,
        label: `${r['artist-credit']?.[0]?.name ?? ''} – ${r.title}`,
      })));
    }
  } catch { /* network unavailable */ }

  try {
    const wpRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&prop=pageimages&pithumbsize=500&format=json&origin=*&gsrlimit=8`
    );
    const wpData = await wpRes.json() as { query?: { pages?: Record<string, { title: string; thumbnail?: { source: string } }> } };
    if (wpData.query?.pages) {
      for (const page of Object.values(wpData.query.pages)) {
        if (page.thumbnail?.source) {
          combined.push({ url: page.thumbnail.source, label: page.title });
        }
      }
    }
  } catch { /* network unavailable */ }

  return combined;
}

export default function AdminMissingArtworkPage() {
  const [albums, setAlbums] = useState<MissingArtworkAlbum[] | null>(null);
  const [states, setStates] = useState<Record<string, AlbumState>>({});
  const qc = useQueryClient();

  const scanMutation = useMutation({
    mutationFn: () => adminApi.getMissingArtwork(),
    onSuccess: (data) => {
      setAlbums(data);
      const init: Record<string, AlbumState> = {};
      for (const a of data) init[a.id] = initialState(a);
      setStates(init);
    },
  });

  function get(id: string): AlbumState | undefined {
    return states[id];
  }

  function set(id: string, update: Partial<AlbumState>) {
    setStates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? initialState({ id, title: '', year: null, bandId: '', bandName: '' })), ...update } }));
  }

  async function doSearch(album: MissingArtworkAlbum) {
    const term = get(album.id)?.searchTerm ?? `${album.bandName} ${album.title}`;
    set(album.id, { mode: 'searching', results: [], selected: null, error: '' });
    try {
      const results = await searchArtwork(term);
      set(album.id, { mode: 'results', results });
    } catch {
      set(album.id, { mode: 'error', error: 'Search failed' });
    }
  }

  async function doSave(album: MissingArtworkAlbum, url: string) {
    set(album.id, { mode: 'saving' });
    try {
      await albumsApi.update(album.id, { artworkUrl: url });
      qc.invalidateQueries({ queryKey: ['album', album.id] });
      set(album.id, { mode: 'done', selected: url });
      // Remove from list after brief delay
      setTimeout(() => setAlbums((prev) => prev?.filter((a) => a.id !== album.id) ?? null), 1500);
    } catch (e) {
      set(album.id, { mode: 'error', error: e instanceof Error ? e.message : 'Save failed' });
    }
  }

  const doneCount = Object.values(states).filter((s) => s.mode === 'done').length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-surface-100 mb-1">Missing Album Art</h1>
        <p className="text-sm text-surface-400">
          Albums with no artwork stored. Search iTunes, MusicBrainz, or Wikipedia, pick a result, and save.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => { setAlbums(null); setStates({}); scanMutation.mutate(); }}
          disabled={scanMutation.isPending}
          className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {scanMutation.isPending ? 'Scanning…' : 'Scan for missing artwork'}
        </button>
        {albums !== null && (
          <span className="text-sm text-surface-400">
            {albums.length} album{albums.length !== 1 ? 's' : ''} without artwork
            {doneCount > 0 && <span className="text-green-400 ml-2">· {doneCount} filled this session</span>}
          </span>
        )}
        {scanMutation.isError && (
          <span className="text-sm text-red-400">{(scanMutation.error as Error).message}</span>
        )}
      </div>

      {albums !== null && albums.length > 0 && (
        <div className="space-y-4">
          {albums.map((album) => {
            const s = get(album.id);
            if (!s) return null;
            return (
              <AlbumCard
                key={album.id}
                album={album}
                state={s}
                onSearchTermChange={(t) => set(album.id, { searchTerm: t })}
                onSearch={() => doSearch(album)}
                onSelect={(url) => set(album.id, { selected: url })}
                onSave={() => s.selected && doSave(album, s.selected)}
                onReset={() => set(album.id, { mode: 'idle', results: [], selected: null, error: '' })}
              />
            );
          })}
        </div>
      )}

      {albums !== null && albums.length === 0 && (
        <p className="text-sm text-green-400">All albums have artwork.</p>
      )}
    </div>
  );
}

function AlbumCard({
  album,
  state,
  onSearchTermChange,
  onSearch,
  onSelect,
  onSave,
  onReset,
}: {
  album: MissingArtworkAlbum;
  state: AlbumState;
  onSearchTermChange: (t: string) => void;
  onSearch: () => void;
  onSelect: (url: string) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const busy = state.mode === 'searching' || state.mode === 'saving';

  if (state.mode === 'done') {
    return (
      <div className="flex items-center gap-3 bg-surface-850 border border-green-900 rounded-lg p-3">
        {state.selected && (
          <img src={state.selected} alt="" className="w-12 h-12 object-cover rounded" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-surface-200 truncate">{album.bandName} — {album.title}</p>
          <p className="text-xs text-green-400">Artwork saved</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-850 border border-surface-700 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-surface-200 truncate">
            {album.bandName} — {album.title}
            {album.year && <span className="text-surface-500 ml-1">({album.year})</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={state.searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
            placeholder="Search term"
            className="bg-surface-800 border border-surface-600 rounded px-2 py-1 text-xs text-surface-200 w-48 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={onSearch}
            disabled={busy}
            className="px-3 py-1 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {state.mode === 'searching' ? 'Searching…' : 'Search'}
          </button>
        </div>
        {state.mode === 'error' && (
          <span className="text-xs text-red-400">{state.error}</span>
        )}
      </div>

      {/* Results grid */}
      {(state.mode === 'results' || state.mode === 'saving') && (
        <>
          {state.results.length === 0 ? (
            <p className="text-xs text-surface-500">No results found. Try a different search term.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
                {state.results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => onSelect(r.url)}
                    className={`relative shrink-0 rounded overflow-hidden border-2 transition-all ${
                      state.selected === r.url
                        ? 'border-indigo-400 ring-2 ring-indigo-400'
                        : 'border-surface-600 hover:border-surface-400'
                    }`}
                  >
                    <img
                      src={r.url}
                      alt={r.label}
                      title={r.label}
                      className="w-20 h-20 object-cover"
                      onError={(e) => { (e.currentTarget.closest('button') as HTMLElement | null)!.style.display = 'none'; }}
                    />
                    {state.selected === r.url && (
                      <span className="absolute inset-0 flex items-center justify-center bg-indigo-900/60 text-white text-lg">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.selected && (
            <div className="flex items-center gap-3">
              <img src={state.selected} alt="" className="w-16 h-16 object-cover rounded border border-surface-600" />
              <div className="space-y-1">
                <p className="text-xs text-surface-400 font-mono break-all max-w-md">{state.selected}</p>
                <div className="flex gap-2">
                  <button
                    onClick={onSave}
                    disabled={busy}
                    className="px-3 py-1 rounded bg-green-700 text-white text-xs font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
                  >
                    {state.mode === 'saving' ? 'Saving…' : 'Save artwork'}
                  </button>
                  <button
                    onClick={() => onSelect('')}
                    className="text-xs text-surface-400 hover:text-surface-200 transition-colors"
                  >
                    Deselect
                  </button>
                </div>
              </div>
            </div>
          )}

          <button onClick={onReset} className="text-xs text-surface-500 hover:text-surface-300 transition-colors">
            Clear results
          </button>
        </>
      )}
    </div>
  );
}

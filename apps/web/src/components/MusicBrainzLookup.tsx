// Shared MusicBrainz lookup flow used by both admin (direct import) and users (contribution).
// Props control what the final action button does.

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { musicBrainzApi, type MbArtist, type MbReleaseGroup, type MbRelease, type MbReleaseOption } from '../api/musicbrainz';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fmtDuration(ms: number | null): string {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Auto-pick the most sensible release: Official > CD/Digital > modal track count > earliest date
function pickBestRelease(options: MbReleaseOption[]): string | null {
  if (options.length === 0) return null;
  if (options.length === 1) return options[0]!.id;

  const countFreq: Record<number, number> = {};
  for (const o of options) countFreq[o.trackCount] = (countFreq[o.trackCount] ?? 0) + 1;
  const modeCount = Number(Object.entries(countFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);

  const scored = options.map((o) => {
    let score = 0;
    if (o.status === 'Official') score += 100;
    if (o.trackCount === modeCount) score += 50;
    const fmt = (o.formats[0] ?? '').toLowerCase();
    if (fmt === 'cd') score += 20;
    else if (fmt === 'digital media') score += 15;
    else if (fmt.includes('vinyl') || fmt.includes('lp')) score -= 20;
    if (o.date) score += (2100 - parseInt(o.date.slice(0, 4), 10)) * 0.01;
    return { id: o.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? options[0]!.id;
}

interface Props {
  actionLabel: string;
  onAction: (payload: {
    artistName: string;
    artistMbId: string;
    data: {
      artist: string;
      albums: {
        album_title: string;
        album_slug: string;
        year: number | null;
        tracks: { track_number: number; song_title: string; song_slug: string }[];
      }[];
    };
  }) => void;
  actionPending?: boolean;
  actionDone?: boolean;
}

type Step = 'search' | 'albums' | 'release-picker' | 'tracks';

export default function MusicBrainzLookup({ actionLabel, onAction, actionPending, actionDone }: Props) {
  const [query, setQuery] = useState('');
  const [artists, setArtists] = useState<MbArtist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<MbArtist | null>(null);
  const [albums, setAlbums] = useState<MbReleaseGroup[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [releaseOptions, setReleaseOptions] = useState<Record<string, MbReleaseOption[]>>({});
  const [chosenReleaseId, setChosenReleaseId] = useState<Record<string, string>>({});
  const [tracks, setTracks] = useState<Record<string, MbRelease | null>>({});
  const [step, setStep] = useState<Step>('search');

  const searchMutation = useMutation({
    mutationFn: (q: string) => musicBrainzApi.searchArtists(q),
    onSuccess: (data) => { setArtists(data); setStep('search'); },
  });

  const albumsMutation = useMutation({
    mutationFn: (mbId: string) => musicBrainzApi.getArtistAlbums(mbId),
    onSuccess: (data) => { setAlbums(data); setSelectedIds(new Set(data.map((a) => a.id))); setStep('albums'); },
  });

  const releaseOptionsMutation = useMutation({
    mutationFn: (ids: string[]) => musicBrainzApi.getReleaseOptions(ids),
    onSuccess: (data) => {
      setReleaseOptions(data);
      // Auto-pick the best release for each album
      const chosen: Record<string, string> = {};
      for (const [rgId, opts] of Object.entries(data)) {
        const best = pickBestRelease(opts);
        if (best) chosen[rgId] = best;
      }
      setChosenReleaseId(chosen);
      setStep('release-picker');
    },
  });

  const tracksMutation = useMutation({
    mutationFn: (items: { releaseGroupId: string; releaseId: string }[]) =>
      musicBrainzApi.getTracksByRelease(items),
    onSuccess: (data) => { setTracks(data); setStep('tracks'); },
  });

  const handleSearch = () => {
    if (query.trim().length < 2) return;
    setArtists([]); setSelectedArtist(null); setAlbums([]); setSelectedIds(new Set());
    setReleaseOptions({}); setChosenReleaseId({}); setTracks({});
    searchMutation.mutate(query.trim());
  };

  const handleSelectArtist = (artist: MbArtist) => {
    setSelectedArtist(artist); setAlbums([]); setSelectedIds(new Set());
    setReleaseOptions({}); setChosenReleaseId({}); setTracks({});
    albumsMutation.mutate(artist.id);
  };

  const toggleAlbum = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleFetchOptions = () => {
    if (selectedIds.size === 0) return;
    setReleaseOptions({}); setChosenReleaseId({}); setTracks({});
    releaseOptionsMutation.mutate([...selectedIds]);
  };

  const handleLoadTracks = () => {
    const items = [...selectedIds]
      .filter((rgId) => chosenReleaseId[rgId])
      .map((rgId) => ({ releaseGroupId: rgId, releaseId: chosenReleaseId[rgId]! }));
    if (items.length === 0) return;
    tracksMutation.mutate(items);
  };

  const handleAction = () => {
    if (!selectedArtist) return;
    const albumData = albums
      .filter((a) => selectedIds.has(a.id))
      .map((a) => {
        const rel = tracks[a.id];
        const trackList = (rel?.tracks ?? []).map((t) => ({
          track_number: t.number,
          song_title: t.title,
          song_slug: slugify(t.title),
        }));
        return {
          album_title: rel?.title ?? a.title,
          album_slug: slugify(rel?.title ?? a.title),
          year: rel?.year ?? a.year,
          tracks: trackList,
        };
      });

    onAction({
      artistName: selectedArtist.name,
      artistMbId: selectedArtist.id,
      data: { artist: selectedArtist.name, albums: albumData },
    });
  };

  const selectedAlbums = albums.filter((a) => selectedIds.has(a.id));
  const allTracksLoaded = selectedAlbums.every((a) => tracks[a.id] !== undefined);

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Artist or band name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button
          className="btn-primary px-5"
          onClick={handleSearch}
          disabled={searchMutation.isPending || query.trim().length < 2}
        >
          {searchMutation.isPending ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Artist results */}
      {artists.length > 0 && !selectedArtist && (
        <div className="card p-0 overflow-hidden">
          <p className="text-xs text-surface-500 font-medium px-3 py-2 border-b border-surface-100">
            Select an artist
          </p>
          <ul className="divide-y divide-surface-100">
            {artists.map((a) => (
              <li key={a.id}>
                <button
                  className="w-full text-left px-3 py-2.5 hover:bg-surface-50 transition-colors flex items-baseline gap-2"
                  onClick={() => handleSelectArtist(a)}
                >
                  <span className="font-medium text-sm">{a.name}</span>
                  {a.disambiguation && (
                    <span className="text-xs text-surface-500">{a.disambiguation}</span>
                  )}
                  {a.country && <span className="text-xs text-surface-400 ml-auto">{a.country}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Selected artist */}
      {selectedArtist && (
        <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">{selectedArtist.name}</p>
            {selectedArtist.disambiguation && (
              <p className="text-xs text-surface-500">{selectedArtist.disambiguation}</p>
            )}
          </div>
          <button
            className="text-xs text-surface-500 hover:text-surface-800"
            onClick={() => { setSelectedArtist(null); setAlbums([]); setTracks({}); setStep('search'); }}
          >
            Change
          </button>
        </div>
      )}

      {albumsMutation.isPending && (
        <p className="text-sm text-surface-500 italic">Loading discography from MusicBrainz…</p>
      )}

      {/* Album selection */}
      {albums.length > 0 && (step === 'albums' || step === 'release-picker' || step === 'tracks') && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface-100">
            <p className="text-xs font-medium text-surface-600">
              {albums.length} albums — select which to include
            </p>
            <div className="flex gap-2">
              <button className="text-xs text-surface-500 hover:text-surface-800" onClick={() => setSelectedIds(new Set(albums.map((a) => a.id)))}>All</button>
              <button className="text-xs text-surface-500 hover:text-surface-800" onClick={() => setSelectedIds(new Set())}>None</button>
            </div>
          </div>
          <ul className="divide-y divide-surface-100 max-h-72 overflow-y-auto">
            {albums.map((a) => (
              <li key={a.id}>
                <label className="flex items-center gap-3 px-3 py-2 hover:bg-surface-50 cursor-pointer">
                  <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleAlbum(a.id)} className="rounded" />
                  <span className="text-sm flex-1">{a.title}</span>
                  <span className="text-xs text-surface-400">{a.year ?? '—'}</span>
                  {tracks[a.id] && (
                    <span className="text-xs text-surface-400">{tracks[a.id]!.tracks.length} tracks</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          {step === 'albums' && (
            <div className="px-3 py-2 border-t border-surface-100">
              <button
                className="btn-secondary text-sm"
                onClick={handleFetchOptions}
                disabled={selectedIds.size === 0 || releaseOptionsMutation.isPending}
              >
                {releaseOptionsMutation.isPending
                  ? `Loading releases… (${Object.keys(releaseOptions).length}/${selectedIds.size})`
                  : `Choose releases for ${selectedIds.size} album${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
              {releaseOptionsMutation.isPending && (
                <p className="text-xs text-surface-400 mt-1">MusicBrainz is rate-limited — ~2 seconds per album.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Release picker — one card per album */}
      {step === 'release-picker' && selectedAlbums.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-surface-700">
            Choose which release to use for each album. The app has pre-selected the best match — change only if needed.
          </p>

          {selectedAlbums.map((a) => {
            const opts = releaseOptions[a.id] ?? [];
            const chosen = chosenReleaseId[a.id];
            return (
              <div key={a.id} className="card p-0 overflow-hidden">
                <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 flex items-baseline gap-2">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="text-xs text-surface-400">{a.year ?? '—'}</p>
                  <p className="text-xs text-surface-400 ml-auto">{opts.length} release{opts.length !== 1 ? 's' : ''} found</p>
                </div>
                {opts.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-surface-400 italic">No releases found in MusicBrainz.</p>
                ) : (
                  <ul className="divide-y divide-surface-100">
                    {opts.map((o) => {
                      const isChosen = o.id === chosen;
                      const formatLabel = o.formats.length > 1
                        ? `${o.formats.length}×${o.formats[0]}`
                        : (o.formats[0] ?? 'Unknown');
                      return (
                        <li key={o.id}>
                          <label className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${isChosen ? 'bg-indigo-50' : 'hover:bg-surface-50'}`}>
                            <input
                              type="radio"
                              name={`release-${a.id}`}
                              value={o.id}
                              checked={isChosen}
                              onChange={() => setChosenReleaseId((prev) => ({ ...prev, [a.id]: o.id }))}
                              className="shrink-0"
                            />
                            <span className={`text-sm font-medium w-28 shrink-0 ${isChosen ? 'text-indigo-700' : 'text-surface-700'}`}>
                              {formatLabel}
                            </span>
                            <span className="text-sm text-surface-900 font-medium w-16 shrink-0">
                              {o.trackCount} tracks
                            </span>
                            <span className="text-xs text-surface-400 w-24 shrink-0">{o.date ?? '—'}</span>
                            <span className="text-xs text-surface-400 flex-1">{o.country ?? ''}</span>
                            {o.status && o.status !== 'Official' && (
                              <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{o.status}</span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <button
              className="btn-primary"
              onClick={handleLoadTracks}
              disabled={tracksMutation.isPending || selectedAlbums.every((a) => !chosenReleaseId[a.id])}
            >
              {tracksMutation.isPending
                ? `Loading tracklists… (${Object.keys(tracks).length}/${selectedAlbums.length})`
                : 'Load Tracklists'}
            </button>
            <button className="btn-secondary text-sm" onClick={() => setStep('albums')}>← Back</button>
            {tracksMutation.isPending && (
              <p className="text-xs text-surface-400">~2 seconds per album.</p>
            )}
          </div>
        </div>
      )}

      {/* Track preview */}
      {step === 'tracks' && allTracksLoaded && selectedAlbums.length > 0 && (
        <div className="space-y-4">
          {selectedAlbums.map((a) => {
            const rel = tracks[a.id];
            return (
              <div key={a.id} className="card p-0 overflow-hidden">
                <div className="px-3 py-2 bg-surface-50 border-b border-surface-100 flex items-baseline gap-2">
                  <p className="text-sm font-semibold">{rel?.title ?? a.title}</p>
                  <p className="text-xs text-surface-500">{rel?.year ?? a.year ?? '—'}</p>
                  <button
                    className="ml-auto text-xs text-indigo-600 hover:underline"
                    onClick={() => setStep('release-picker')}
                  >
                    Change release
                  </button>
                </div>
                {rel ? (
                  <ul className="divide-y divide-surface-100">
                    {rel.tracks.map((t) => (
                      <li key={t.number} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                        <span className="text-xs text-surface-400 w-5 text-right shrink-0">{t.number}</span>
                        <span className="flex-1">{t.title}</span>
                        {t.durationMs && (
                          <span className="text-xs text-surface-400">{fmtDuration(t.durationMs)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-2 text-xs text-surface-400 italic">No tracklist found.</p>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <button
              className="btn-primary"
              onClick={handleAction}
              disabled={actionPending || actionDone}
            >
              {actionDone ? '✓ Done!' : actionPending ? 'Working…' : actionLabel}
            </button>
            <p className="text-xs text-surface-500">
              {selectedAlbums.length} album{selectedAlbums.length !== 1 ? 's' : ''} ·{' '}
              {selectedAlbums.reduce((s, a) => s + (tracks[a.id]?.tracks.length ?? 0), 0)} songs ·
              Lyrics not included — add manually after import.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

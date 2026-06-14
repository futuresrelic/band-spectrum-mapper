import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { playlistApi, type RoundSong, type SavedPlaylist } from '../api/playlist';

// Minimal type declaration for Google Identity Services token client
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

const MAX_SONGS = 500;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function copyTracklist(name: string, songs: RoundSong[]): void {
  const lines = [name, '', ...songs.map((s, i) => `${i + 1}. ${s.band.name} — ${s.title}`)];
  void navigator.clipboard.writeText(lines.join('\n'));
}

// ── Sub-components ───────────────────────────────────────────────────────────

function AlbumArt({ url, size = 56, alt }: { url: string | null; size?: number; alt: string }) {
  if (!url) {
    return (
      <div
        className="rounded-lg bg-gray-800 flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <span className="text-gray-600 text-xl">♪</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className="rounded-lg object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

function SongCard({
  song,
  index,
  total,
  picked,
  onPick,
}: {
  song: RoundSong;
  index: number;
  total: number;
  picked: boolean;
  onPick: (song: RoundSong) => void;
}) {
  const label = total === 2 ? (index === 0 ? 'A' : 'B') : String(index + 1);

  return (
    <button
      onClick={() => !picked && onPick(song)}
      disabled={picked}
      className={`group w-full text-left rounded-2xl border p-5 transition-all flex gap-4 items-center
        ${picked
          ? 'border-violet-500/80 bg-violet-900/30 opacity-60 cursor-default'
          : 'border-gray-700 bg-gray-900 hover:border-violet-400/60 hover:bg-gray-800/80 cursor-pointer active:scale-[0.98]'
        }`}
    >
      {/* Letter badge */}
      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm
        ${picked ? 'bg-violet-700 text-white' : 'bg-gray-800 text-gray-400 group-hover:bg-violet-800 group-hover:text-white transition-colors'}`}>
        {picked ? '✓' : label}
      </div>

      {/* Album art */}
      <AlbumArt url={song.album?.artworkUrl ?? null} size={64} alt={song.album?.title ?? song.title} />

      {/* Song info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-base leading-tight truncate">{song.title}</p>
        <p className="text-violet-400 text-sm mt-0.5 truncate">{song.band.name}</p>
        <p className="text-gray-500 text-xs mt-0.5 truncate">
          {song.album?.title ?? ''}
          {song.album?.year ? ` · ${song.album.year}` : ''}
          {song.durationSeconds ? ` · ${formatDuration(song.durationSeconds)}` : ''}
        </p>
      </div>

      {!picked && (
        <div className="shrink-0 text-gray-600 group-hover:text-violet-400 transition-colors text-xl">›</div>
      )}
    </button>
  );
}

function PlaylistPanel({
  songs,
  onRemove,
}: {
  songs: RoundSong[];
  onRemove: (id: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [songs.length]);

  if (songs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-sm italic">
        Your picks will appear here
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
      {songs.map((song, i) => (
        <div
          key={`${song.id}-${i}`}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/50 group"
        >
          <span className="text-gray-600 text-xs w-6 text-right shrink-0">{i + 1}</span>
          <AlbumArt url={song.album?.artworkUrl ?? null} size={28} alt={song.title} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{song.title}</p>
            <p className="text-gray-500 text-xs truncate">{song.band.name}</p>
          </div>
          <button
            onClick={() => onRemove(song.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 text-xs px-1"
            title="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

// ── Export Section ────────────────────────────────────────────────────────────

type ExportSong = { title: string; band: { name: string } };

type ExportState =
  | { status: 'idle' }
  | { status: 'working'; message: string; progress?: { current: number; total: number } }
  | { status: 'done'; playlistUrl: string; added: number; skipped: number }
  | { status: 'error'; message: string };

function ytMusicSearchUrl(song: ExportSong): string {
  return `https://music.youtube.com/search?q=${encodeURIComponent(`${song.band.name} ${song.title}`)}`;
}

function spotifySearchUrl(song: ExportSong): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${song.band.name} ${song.title}`)}`;
}

function ExportSection({ songs, playlistName }: { songs: ExportSong[]; playlistName: string }) {
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const [showLinks, setShowLinks] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [gisReady, setGisReady] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d: { googleClientId?: string }) => setGoogleClientId(d.googleClientId ?? ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (window.google?.accounts?.oauth2) { setGisReady(true); return; }
    const existing = document.getElementById('gis-client-script');
    if (existing) { existing.addEventListener('load', () => setGisReady(true)); return; }
    const script = document.createElement('script');
    script.id = 'gis-client-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setGisReady(true);
    document.head.appendChild(script);
  }, []);

  async function handleCreateYouTubePlaylist() {
    if (!googleClientId || !gisReady || !window.google?.accounts?.oauth2) {
      setExportState({ status: 'error', message: 'Google sign-in is not ready. Refresh the page and try again.' });
      return;
    }

    setExportState({ status: 'working', message: 'Opening Google sign-in…' });

    try {
      // 1. Obtain YouTube OAuth token via GIS popup
      const token = await new Promise<string>((resolve, reject) => {
        window.google!.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'https://www.googleapis.com/auth/youtube',
          callback: (r) => {
            if (r.error) {
              reject(new Error(r.error === 'access_denied' ? 'Sign-in was cancelled.' : r.error));
            } else {
              resolve(r.access_token);
            }
          },
        }).requestAccessToken();
      });

      // 2. Create the YouTube playlist
      setExportState({ status: 'working', message: 'Creating YouTube playlist…' });
      const createRes = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippet: { title: playlistName || 'My Playlist', description: 'Created with Band Spectrum Mapper' },
          status: { privacyStatus: 'private' },
        }),
      });
      if (!createRes.ok) {
        const errBody = await createRes.json() as { error?: { message?: string } };
        throw new Error(errBody.error?.message ?? `Failed to create playlist (${createRes.status})`);
      }
      const createdPlaylist = await createRes.json() as { id: string };
      const playlistId = createdPlaylist.id;

      // 3. Search YouTube for each song and add to playlist (cap at 50 to respect quota)
      const songsToAdd = songs.slice(0, 50);
      let added = 0;
      let skipped = 0;

      for (let i = 0; i < songsToAdd.length; i++) {
        const song = songsToAdd[i]!;
        setExportState({
          status: 'working',
          message: `Finding "${song.title}"…`,
          progress: { current: i + 1, total: songsToAdd.length },
        });

        try {
          const q = encodeURIComponent(`${song.band.name} ${song.title}`);
          const searchRes = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=1&q=${q}`,
            { headers: { 'Authorization': `Bearer ${token}` } },
          );
          if (!searchRes.ok) { skipped++; continue; }

          const searchData = await searchRes.json() as { items?: Array<{ id?: { videoId?: string } }> };
          const videoId = searchData.items?.[0]?.id?.videoId;
          if (!videoId) { skipped++; continue; }

          const addRes = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
            }),
          });
          if (addRes.ok) added++;
          else skipped++;
        } catch {
          skipped++;
        }

        // Small delay between calls to stay within rate limits
        if (i < songsToAdd.length - 1) await new Promise<void>((r) => setTimeout(r, 150));
      }

      setExportState({
        status: 'done',
        playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
        added,
        skipped,
      });
    } catch (e) {
      setExportState({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  }

  if (songs.length === 0) return null;

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mt-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Export</h2>

      {/* YouTube playlist creation */}
      {googleClientId && (
        <div className="mb-5">
          {exportState.status === 'idle' && (
            <button
              onClick={() => void handleCreateYouTubePlaylist()}
              disabled={!gisReady}
              className="flex items-center gap-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              <span className="text-base">▶</span>
              Create YouTube Playlist
            </button>
          )}

          {exportState.status === 'working' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-sm text-gray-300">{exportState.message}</span>
              </div>
              {exportState.progress && (
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden w-full max-w-xs">
                  <div
                    className="h-full bg-red-600 transition-all duration-300"
                    style={{ width: `${(exportState.progress.current / exportState.progress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {exportState.status === 'done' && (
            <div className="flex flex-col gap-2">
              <a
                href={exportState.playlistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm w-fit"
              >
                <span className="text-base">▶</span>
                Open YouTube Playlist →
              </a>
              <p className="text-xs text-gray-500">
                {exportState.added} song{exportState.added !== 1 ? 's' : ''} added
                {exportState.skipped > 0 ? `, ${exportState.skipped} not found on YouTube` : ''}
                {songs.length > 50 ? ` (first 50 processed — YouTube quota limit)` : ''}
              </p>
              <button
                onClick={() => setExportState({ status: 'idle' })}
                className="text-xs text-gray-600 hover:text-gray-400 w-fit"
              >
                Create another
              </button>
            </div>
          )}

          {exportState.status === 'error' && (
            <div className="flex flex-col gap-2">
              <p className="text-red-400 text-sm">{exportState.message}</p>
              {exportState.message.includes('origin') && (
                <p className="text-xs text-gray-500">
                  Fix: In Google Cloud Console, add your app URL to <em>Authorized JavaScript origins</em> for your OAuth client.
                </p>
              )}
              <button
                onClick={() => setExportState({ status: 'idle' })}
                className="text-xs text-violet-400 hover:text-violet-300 w-fit"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {/* Per-song search links */}
      <div>
        <button
          onClick={() => setShowLinks((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
        >
          <span>{showLinks ? '▾' : '▸'}</span>
          {showLinks ? 'Hide' : 'Show'} per-song search links
        </button>

        {showLinks && (
          <div className="mt-3 space-y-1.5 max-h-60 overflow-y-auto border border-gray-800 rounded-xl p-3">
            {songs.map((song, i) => (
              <div key={i} className="flex items-center gap-2 text-xs group">
                <span className="text-gray-700 w-5 text-right shrink-0">{i + 1}</span>
                <span className="text-gray-500 truncate flex-1 min-w-0">{song.band.name} — {song.title}</span>
                <a
                  href={ytMusicSearchUrl(song)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-400 hover:text-red-300 shrink-0 font-medium"
                  title="YouTube Music"
                >
                  YT
                </a>
                <a
                  href={spotifySearchUrl(song)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 hover:text-green-300 shrink-0 font-medium"
                  title="Spotify"
                >
                  SP
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({
  onStart,
}: {
  onStart: (bandIds: string[], count: number) => void;
}) {
  const [selectedBands, setSelectedBands] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(3);

  const { data: bands, isLoading } = useQuery({
    queryKey: ['playlist-bands'],
    queryFn: () => playlistApi.getBands(),
    staleTime: 300_000,
  });

  function toggleBand(id: string) {
    setSelectedBands((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedBands(new Set(bands?.map((b) => b.id) ?? []));
  }

  function clearAll() {
    setSelectedBands(new Set());
  }

  const canStart = selectedBands.size > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="playlist" />
      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🎵</div>
          <h1 className="text-4xl font-bold mb-3">Playlist Maker</h1>
          <p className="text-gray-400 text-lg max-w-lg mx-auto">
            Choose your bands, pick one song at a time from a rotating selection, and build your perfect playlist.
          </p>
        </div>

        {/* Band picker */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Choose bands to draw from</h2>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                All
              </button>
              <span className="text-gray-700">·</span>
              <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                None
              </button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-gray-500 text-sm">Loading bands…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {(bands ?? []).map((band) => {
                const active = selectedBands.has(band.id);
                return (
                  <button
                    key={band.id}
                    onClick={() => toggleBand(band.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all
                      ${active
                        ? 'border-violet-500/70 bg-violet-900/30 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                      }`}
                  >
                    {band.logoUrl ? (
                      <img src={band.logoUrl} alt="" className="w-6 h-6 rounded object-contain shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded bg-gray-700 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight truncate">{band.name}</p>
                      <p className="text-xs text-gray-600">{band._count.songs} songs</p>
                    </div>
                    {active && <span className="ml-auto text-violet-400 text-xs shrink-0">✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {selectedBands.size > 0 && (
            <p className="text-xs text-violet-400 mt-3">
              {selectedBands.size} band{selectedBands.size !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* Options per round */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-8">
          <h2 className="font-semibold text-white mb-4">Songs per choice</h2>
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`w-12 h-12 rounded-xl font-bold text-sm transition-all
                  ${count === n
                    ? 'bg-violet-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                  }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Each round shows {count} songs — you pick one to add to your playlist.
          </p>
        </div>

        <button
          onClick={() => onStart([...selectedBands], count)}
          disabled={!canStart}
          className="w-full py-4 rounded-2xl bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg transition-colors"
        >
          Start Building →
        </button>
      </main>
    </div>
  );
}

// ── Picking Screen ────────────────────────────────────────────────────────────

function PickingScreen({
  bandIds,
  count,
  onDone,
}: {
  bandIds: string[];
  count: number;
  onDone: (songs: RoundSong[], name: string) => void;
}) {
  const { user } = useAuth();

  const [playlist, setPlaylist] = useState<RoundSong[]>([]);
  const [round, setRound] = useState<RoundSong[]>([]);
  const [pickedInRound, setPickedInRound] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlistName, setPlaylistName] = useState('My Playlist');
  const [copied, setCopied] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  const loadRound = useCallback(async (currentPlaylist: RoundSong[]) => {
    setLoading(true);
    setError(null);
    setPickedInRound(null);
    try {
      const excludeIds = currentPlaylist.map((s) => s.id);
      const songs = await playlistApi.getRound(bandIds, count, excludeIds);
      setRound(songs);
    } catch {
      setError('Failed to load next songs. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [bandIds, count]);

  useEffect(() => {
    void loadRound([]);
  }, [loadRound]);

  function handlePick(song: RoundSong) {
    if (pickedInRound) return;
    if (playlist.length >= MAX_SONGS) return;
    setPickedInRound(song.id);
    const next = [...playlist, song];
    setPlaylist(next);

    // Brief pause so user sees the selection, then load next round
    setTimeout(() => {
      void loadRound(next);
    }, 700);
  }

  function handleRemove(songId: string) {
    setPlaylist((prev) => {
      // Remove last occurrence of this songId (since same song could appear twice if somehow picked)
      const idx = [...prev].map((s) => s.id).lastIndexOf(songId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }

  function handleCopy() {
    copyTracklist(playlistName, playlist);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const atMax = playlist.length >= MAX_SONGS;
  const noMore = round.length === 0 && !loading;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SiteHeader theme="dark" active="playlist" />

      {/* Top bar */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            className="bg-transparent text-white font-semibold text-sm border-b border-gray-700 focus:border-violet-500 outline-none pb-0.5 min-w-0 max-w-xs"
            placeholder="Playlist name…"
            maxLength={80}
          />
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-xs text-gray-500">
              {playlist.length} song{playlist.length !== 1 ? 's' : ''}
              {atMax ? ' (max reached)' : ''}
            </span>
            <button
              onClick={() => setShowPanel((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors md:hidden"
            >
              {showPanel ? 'Hide list' : 'Show list'}
            </button>
            {playlist.length > 0 && (
              <button
                onClick={handleCopy}
                className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy list'}
              </button>
            )}
            <button
              onClick={() => onDone(playlist, playlistName)}
              className="bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              Done →
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 py-6 gap-6 min-h-0">
        {/* Song choice area */}
        <div className="flex-1 flex flex-col">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Pick a song
            </h2>
            {!loading && !noMore && !atMax && (
              <span className="text-xs text-gray-600">
                Round {Math.ceil((playlist.length + 1) / 1)}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Loading songs…
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={() => void loadRound(playlist)}
                className="text-sm text-violet-400 hover:text-violet-300 underline"
              >
                Try again
              </button>
            </div>
          ) : atMax ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-4xl">🎉</div>
              <p className="text-white font-semibold">Maximum reached!</p>
              <p className="text-gray-500 text-sm">Your playlist has {MAX_SONGS} songs. That&apos;s a lot of music.</p>
              <button
                onClick={() => onDone(playlist, playlistName)}
                className="mt-2 bg-violet-700 hover:bg-violet-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
              >
                Save Playlist →
              </button>
            </div>
          ) : noMore ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-4xl">🏁</div>
              <p className="text-white font-semibold">No more songs to pick from</p>
              <p className="text-gray-500 text-sm">
                You&apos;ve gone through the library for the selected bands.
              </p>
              <button
                onClick={() => onDone(playlist, playlistName)}
                className="mt-2 bg-violet-700 hover:bg-violet-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
              >
                Save Playlist →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {round.map((song, i) => (
                <SongCard
                  key={song.id}
                  song={song}
                  index={i}
                  total={round.length}
                  picked={pickedInRound === song.id}
                  onPick={handlePick}
                />
              ))}
            </div>
          )}

          {!loading && !noMore && !atMax && playlist.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-800 flex justify-center">
              <button
                onClick={() => void loadRound(playlist)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Skip this round ↩
              </button>
            </div>
          )}

          {!user && (
            <p className="mt-6 text-center text-xs text-gray-600">
              <a href="/api/auth/google" className="text-violet-400 hover:text-violet-300 underline">
                Sign in
              </a>{' '}
              to save your playlist to your account.
            </p>
          )}
        </div>

        {/* Playlist sidebar */}
        {showPanel && (
          <div className="hidden md:flex w-72 flex-col bg-gray-900 rounded-2xl border border-gray-800 p-4 max-h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Playlist · {playlist.length}
              </h3>
              {playlist.length > 0 && (
                <button
                  onClick={handleCopy}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                  title="Copy tracklist"
                >
                  {copied ? '✓' : '⎘'}
                </button>
              )}
            </div>
            <PlaylistPanel songs={playlist} onRemove={handleRemove} />
          </div>
        )}
      </div>

      {/* Mobile playlist panel */}
      {showPanel && playlist.length > 0 && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 py-3 max-h-40 overflow-y-auto">
            <PlaylistPanel songs={playlist} onRemove={handleRemove} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Done / Save Screen ────────────────────────────────────────────────────────

function DoneScreen({
  initialSongs,
  initialName,
  onRestart,
}: {
  initialSongs: RoundSong[];
  initialName: string;
  onRestart: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(initialName);
  const [songs, setSongs] = useState(initialSongs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedPlaylist | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleRemove(songId: string) {
    setSongs((prev) => {
      const idx = [...prev].map((s) => s.id).lastIndexOf(songId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setSaved(null);
  }

  async function handleSave() {
    if (songs.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await playlistApi.savePlaylist(name.trim() || 'My Playlist', songs.map((s) => s.id));
      setSaved(result);
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleCopy() {
    copyTracklist(name, songs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const totalDuration = songs.reduce((acc, s) => acc + (s.durationSeconds ?? 0), 0);
  const hours = Math.floor(totalDuration / 3600);
  const mins = Math.floor((totalDuration % 3600) / 60);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="playlist" />
      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎶</div>
          <h1 className="text-3xl font-bold mb-2">Your Playlist</h1>
          <p className="text-gray-400">
            {songs.length} song{songs.length !== 1 ? 's' : ''}
            {totalDuration > 0 && (
              <> · {hours > 0 ? `${hours}h ` : ''}{mins}m</>
            )}
          </p>
        </div>

        {/* Name + save */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Playlist name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(null); }}
            className="w-full bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-xl px-4 py-3 text-white text-lg font-semibold outline-none transition-colors mb-4"
            placeholder="My Playlist"
            maxLength={80}
          />

          <div className="flex flex-wrap items-center gap-3">
            {user ? (
              <button
                onClick={() => void handleSave()}
                disabled={saving || songs.length === 0}
                className="bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
              >
                {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Playlist'}
              </button>
            ) : (
              <a
                href="/api/auth/google"
                className="bg-violet-700 hover:bg-violet-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
              >
                Sign in to save
              </a>
            )}

            <button
              onClick={handleCopy}
              className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              {copied ? '✓ Copied' : 'Copy tracklist'}
            </button>

            <button
              onClick={onRestart}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Build another →
            </button>
          </div>

          {saved && (
            <div className="mt-3 flex items-center gap-2">
              <p className="text-emerald-400 text-sm">Playlist saved!</p>
              <Link
                to={`/playlist/${saved.id}`}
                className="text-sm text-violet-400 hover:text-violet-300 underline"
              >
                View shareable link →
              </Link>
            </div>
          )}
          {saveError && <p className="mt-3 text-red-400 text-sm">{saveError}</p>}
        </div>

        {/* Song list */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400">Tracks</h2>
            <span className="text-xs text-gray-600">{songs.length} / {MAX_SONGS}</span>
          </div>
          {songs.length === 0 ? (
            <p className="px-5 py-8 text-center text-gray-600 text-sm">No songs yet</p>
          ) : (
            <div className="divide-y divide-gray-800/60">
              {songs.map((song, i) => (
                <div key={`${song.id}-${i}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/40 group">
                  <span className="text-gray-700 text-xs w-7 text-right shrink-0">{i + 1}</span>
                  <AlbumArt url={song.album?.artworkUrl ?? null} size={40} alt={song.title} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{song.title}</p>
                    <p className="text-gray-500 text-xs truncate">
                      {song.band.name}{song.album ? ` · ${song.album.title}` : ''}
                    </p>
                  </div>
                  {song.durationSeconds && (
                    <span className="text-gray-600 text-xs shrink-0">{formatDuration(song.durationSeconds)}</span>
                  )}
                  <button
                    onClick={() => handleRemove(song.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 text-xs px-1 shrink-0"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <ExportSection songs={songs} playlistName={name} />
      </main>
    </div>
  );
}

// ── View Saved Playlist Screen ────────────────────────────────────────────────

function ViewPlaylistScreen({ playlistId }: { playlistId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: () => playlistApi.getPlaylist(playlistId),
    staleTime: 60_000,
  });

  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!data) return;
    const lines = [
      data.name,
      '',
      ...data.songs.map((ps, i) => `${i + 1}. ${ps.song.band.name} — ${ps.song.title}`),
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="playlist" />
      <main className="max-w-3xl mx-auto px-6 py-12">
        {isLoading ? (
          <div className="text-center text-gray-500 py-20">Loading playlist…</div>
        ) : isError || !data ? (
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">Playlist not found.</p>
            <Link to="/playlist" className="text-violet-400 hover:text-violet-300 underline">
              Build a new one →
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">🎶</div>
              <h1 className="text-3xl font-bold mb-2">{data.name}</h1>
              <p className="text-gray-400">{data.songs.length} song{data.songs.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="flex justify-center gap-3 mb-8">
              <button
                onClick={handleCopy}
                className="border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                {copied ? '✓ Copied' : 'Copy tracklist'}
              </button>
              <Link
                to="/playlist"
                className="bg-violet-700 hover:bg-violet-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Build yours →
              </Link>
            </div>

            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div className="divide-y divide-gray-800/60">
                {data.songs.map((ps, i) => (
                  <div key={ps.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-gray-700 text-xs w-7 text-right shrink-0">{i + 1}</span>
                    <AlbumArt url={ps.song.album?.artworkUrl ?? null} size={40} alt={ps.song.title} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{ps.song.title}</p>
                      <p className="text-gray-500 text-xs truncate">
                        {ps.song.band.name}{ps.song.album ? ` · ${ps.song.album.title}` : ''}
                      </p>
                    </div>
                    {ps.song.durationSeconds && (
                      <span className="text-gray-600 text-xs shrink-0">{formatDuration(ps.song.durationSeconds)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <ExportSection
              songs={data.songs.map((ps) => ({ title: ps.song.title, band: { name: ps.song.band.name } }))}
              playlistName={data.name}
            />
          </>
        )}
      </main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

type Phase = { kind: 'setup' } | { kind: 'picking'; bandIds: string[]; count: number } | { kind: 'done'; songs: RoundSong[]; name: string };

export default function PlaylistMakerPage() {
  // If URL has /playlist/:id, show saved playlist view
  const path = window.location.pathname;
  const viewMatch = path.match(/^\/playlist\/([^/]+)$/);
  if (viewMatch) {
    return <ViewPlaylistScreen playlistId={viewMatch[1]!} />;
  }

  return <PlaylistMakerRoot />;
}

function PlaylistMakerRoot() {
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });

  if (phase.kind === 'setup') {
    return (
      <SetupScreen
        onStart={(bandIds, count) => setPhase({ kind: 'picking', bandIds, count })}
      />
    );
  }

  if (phase.kind === 'picking') {
    return (
      <PickingScreen
        bandIds={phase.bandIds}
        count={phase.count}
        onDone={(songs, name) => setPhase({ kind: 'done', songs, name })}
      />
    );
  }

  return (
    <DoneScreen
      initialSongs={phase.songs}
      initialName={phase.name}
      onRestart={() => setPhase({ kind: 'setup' })}
    />
  );
}

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminApi, type MissingSong } from '../api/admin';
import { songsApi } from '../api/songs';

type SongStatus = {
  mode: 'idle' | 'ai-loading' | 'online-loading' | 'preview' | 'saving' | 'done' | 'error';
  text: string;
  error: string;
};

const blank: SongStatus = { mode: 'idle', text: '', error: '' };

// Group songs by band → album
function group(songs: MissingSong[]) {
  const bands = new Map<string, { bandId: string; bandName: string; albums: Map<string, { albumId: string | null; albumTitle: string | null; songs: MissingSong[] }> }>();
  for (const s of songs) {
    if (!bands.has(s.bandId)) bands.set(s.bandId, { bandId: s.bandId, bandName: s.bandName, albums: new Map() });
    const band = bands.get(s.bandId)!;
    const key = s.albumId ?? '__none__';
    if (!band.albums.has(key)) band.albums.set(key, { albumId: s.albumId, albumTitle: s.albumTitle, songs: [] });
    band.albums.get(key)!.songs.push(s);
  }
  return Array.from(bands.values()).map((b) => ({ ...b, albums: Array.from(b.albums.values()) }));
}

export default function AdminMissingLyricsPage() {
  const [songs, setSongs] = useState<MissingSong[] | null>(null);
  const [states, setStates] = useState<Record<string, SongStatus>>({});

  const scanMutation = useMutation({
    mutationFn: () => adminApi.getMissingLyrics(),
    onSuccess: (data) => setSongs(data),
  });

  function st(id: string): SongStatus {
    return states[id] ?? blank;
  }

  function set(id: string, update: Partial<SongStatus>) {
    setStates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? blank), ...update } }));
  }

  async function doAiRecall(song: MissingSong) {
    set(song.id, { mode: 'ai-loading', error: '' });
    try {
      await songsApi.fetchAiLyrics(song.id);
      set(song.id, { mode: 'done' });
    } catch (e) {
      const err = e as { status?: number; message?: string };
      const msg = err.status === 404 ? 'Not recognized by AI' : (err.message ?? 'AI recall failed');
      set(song.id, { mode: 'error', error: msg });
    }
  }

  async function doFindOnline(song: MissingSong) {
    set(song.id, { mode: 'online-loading', error: '' });
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(song.bandName)}/${encodeURIComponent(song.title)}`
      );
      if (!res.ok) throw new Error('not found');
      const data = await res.json() as { lyrics?: string };
      if (!data.lyrics?.trim()) throw new Error('empty response');
      set(song.id, { mode: 'preview', text: data.lyrics.trim() });
    } catch {
      set(song.id, { mode: 'error', error: 'Not found online' });
    }
  }

  async function doSave(song: MissingSong, text: string) {
    set(song.id, { mode: 'saving' });
    try {
      await songsApi.createLyric(song.id, {
        text: text.trim(),
        sourceType: 'user_provided',
        isPrimary: true,
      });
      set(song.id, { mode: 'done' });
    } catch (e) {
      set(song.id, { mode: 'error', error: e instanceof Error ? e.message : 'Save failed' });
    }
  }

  const grouped = songs ? group(songs) : [];
  const doneCount = Object.values(states).filter((s) => s.mode === 'done').length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-surface-100 mb-1">Missing Lyrics</h1>
        <p className="text-sm text-surface-400">
          Songs with no lyrics at all. Use AI Recall to retrieve from memory, or Find Online to search Lyrics.ovh,
          edit the result, then save.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => { setSongs(null); setStates({}); scanMutation.mutate(); }}
          disabled={scanMutation.isPending}
          className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {scanMutation.isPending ? 'Scanning…' : 'Scan for missing lyrics'}
        </button>
        {songs !== null && (
          <span className="text-sm text-surface-400">
            {songs.length} songs missing lyrics
            {doneCount > 0 && <span className="text-green-400 ml-2">· {doneCount} filled this session</span>}
          </span>
        )}
        {scanMutation.isError && (
          <span className="text-sm text-red-400">{(scanMutation.error as Error).message}</span>
        )}
      </div>

      {grouped.map((band) => (
        <div key={band.bandId}>
          <h2 className="text-base font-semibold text-surface-200 mb-3 border-b border-surface-700 pb-1">
            {band.bandName}
          </h2>
          {band.albums.map((album) => (
            <div key={album.albumId ?? '__none__'} className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-surface-500 mb-2">
                {album.albumTitle ?? 'No album'}
              </h3>
              <div className="space-y-1">
                {album.songs.map((song) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    status={st(song.id)}
                    onAiRecall={() => doAiRecall(song)}
                    onFindOnline={() => doFindOnline(song)}
                    onTextChange={(t) => set(song.id, { text: t })}
                    onSave={() => doSave(song, st(song.id).text)}
                    onRetry={() => set(song.id, { mode: 'idle', error: '' })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {songs !== null && songs.length === 0 && (
        <p className="text-sm text-green-400">All songs have lyrics.</p>
      )}
    </div>
  );
}

function SongRow({
  song,
  status,
  onAiRecall,
  onFindOnline,
  onTextChange,
  onSave,
  onRetry,
}: {
  song: MissingSong;
  status: SongStatus;
  onAiRecall: () => void;
  onFindOnline: () => void;
  onTextChange: (t: string) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  const busy = status.mode === 'ai-loading' || status.mode === 'online-loading' || status.mode === 'saving';

  return (
    <div className="bg-surface-850 border border-surface-700 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Track # + title */}
        <span className="text-sm text-surface-200 flex-1 min-w-0 truncate">
          {song.trackNumber != null && (
            <span className="text-surface-500 mr-2 font-mono text-xs">{song.trackNumber}.</span>
          )}
          {song.title}
        </span>

        {/* Action buttons */}
        {status.mode === 'done' ? (
          <span className="text-xs text-green-400 font-medium">Saved</span>
        ) : status.mode === 'error' ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-red-400">{status.error}</span>
            <button onClick={onRetry} className="text-xs text-surface-400 hover:text-surface-200 underline">
              retry
            </button>
          </span>
        ) : (
          <>
            <button
              onClick={onAiRecall}
              disabled={busy}
              className="px-2.5 py-1 rounded border border-purple-700 text-purple-300 text-xs hover:bg-purple-900/40 disabled:opacity-50 transition-colors"
            >
              {status.mode === 'ai-loading' ? 'AI thinking…' : 'AI Recall'}
            </button>
            <button
              onClick={onFindOnline}
              disabled={busy}
              className="px-2.5 py-1 rounded border border-sky-700 text-sky-300 text-xs hover:bg-sky-900/40 disabled:opacity-50 transition-colors"
            >
              {status.mode === 'online-loading' ? 'Searching…' : 'Find Online'}
            </button>
          </>
        )}
      </div>

      {/* Preview / edit area */}
      {status.mode === 'preview' && (
        <div className="mt-3 space-y-2">
          <textarea
            value={status.text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={8}
            className="w-full bg-surface-800 border border-surface-600 rounded px-3 py-2 text-xs text-surface-200 font-mono resize-y focus:outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="px-3 py-1 rounded bg-green-700 text-white text-xs font-medium hover:bg-green-600 transition-colors"
            >
              Save lyrics
            </button>
            <button
              onClick={onRetry}
              className="px-3 py-1 text-xs text-surface-400 hover:text-surface-200 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import { albumsApi } from '../api/albums';
import { songsApi, lyricsApi } from '../api/songs';
import type { Lyric, Song } from '@band-spectrum-mapper/shared';
import PageHeader from '../components/layout/PageHeader';

// ─── types ────────────────────────────────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SongEntry {
  song: Song;
  lyric: Lyric | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function lineCount(text: string): number {
  return text ? text.split('\n').length : 0;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SongLyricsRow({
  entry,
  text,
  saveState,
  onChange,
  onSave,
}: {
  entry: SongEntry;
  text: string;
  saveState: SaveState;
  onChange: (id: string, value: string) => void;
  onSave: (entry: SongEntry) => void;
}) {
  const { song, lyric } = entry;
  const isDirty = text !== (lyric?.text ?? '');
  const hasText = text.trim().length > 0;
  const lines = lineCount(text);

  return (
    <div className="border border-surface-200 rounded-lg overflow-hidden">
      {/* Song header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-50 border-b border-surface-200">
        {song.trackNumber != null && (
          <span className="text-xs text-surface-400 font-mono w-5 text-right shrink-0">
            {song.trackNumber}
          </span>
        )}
        <p className="font-medium text-sm flex-1">{song.title}</p>
        <div className="flex items-center gap-2 shrink-0">
          {lines > 0 && (
            <span className="text-xs text-surface-400">{lines} lines</span>
          )}
          {lyric ? (
            <span className="text-xs text-surface-500 bg-surface-100 px-2 py-0.5 rounded-full">
              has lyrics
            </span>
          ) : (
            <span className="text-xs text-surface-400 bg-surface-50 px-2 py-0.5 rounded-full">
              no lyrics yet
            </span>
          )}
          <button
            className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
              saveState === 'saved'
                ? 'bg-green-100 text-green-700'
                : saveState === 'error'
                ? 'bg-red-100 text-red-700'
                : saveState === 'saving'
                ? 'bg-surface-100 text-surface-400 cursor-wait'
                : isDirty && hasText
                ? 'bg-surface-900 text-white hover:bg-surface-700'
                : 'bg-surface-100 text-surface-400 cursor-default'
            }`}
            onClick={() => onSave(entry)}
            disabled={saveState === 'saving' || !isDirty || !hasText}
          >
            {saveState === 'saving' ? 'Saving…'
              : saveState === 'saved' ? '✓ Saved'
              : saveState === 'error' ? '✗ Error'
              : 'Save'}
          </button>
        </div>
      </div>

      {/* Lyrics textarea */}
      <textarea
        className="w-full px-4 py-3 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-surface-400 bg-white placeholder:text-surface-300 placeholder:font-sans placeholder:not-italic"
        rows={12}
        spellCheck
        placeholder={`Paste or type lyrics for "${song.title}" here.\n\nLine breaks are preserved exactly as you type.\nUse a blank line between verses.`}
        value={text}
        onChange={(e) => onChange(song.id, e.target.value)}
      />
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function LyricsBuilderPage() {
  const [bandId, setBandId] = useState('');
  const [albumId, setAlbumId] = useState('');
  const [entries, setEntries] = useState<SongEntry[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [loadError, setLoadError] = useState('');

  const { data: bands } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  const { data: albums } = useQuery({
    queryKey: ['band-albums', bandId],
    queryFn: () => bandsApi.listAlbums(bandId),
    enabled: !!bandId,
  });

  // When album is selected, load songs + their lyrics in parallel
  const handleAlbumChange = useCallback(async (newAlbumId: string) => {
    setAlbumId(newAlbumId);
    setEntries([]);
    setTexts({});
    setSaveStates({});
    setLoadError('');
    if (!newAlbumId) return;

    setLoadingLyrics(true);
    try {
      const songs: Song[] = await albumsApi.getSongs(newAlbumId);
      const sorted = [...songs].sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));

      const lyricLists = await Promise.all(
        sorted.map((s) => songsApi.getLyrics(s.id).catch(() => [] as Lyric[])),
      );

      const built: SongEntry[] = sorted.map((s, i) => ({
        song: s,
        lyric: lyricLists[i]?.find((l) => l.isPrimary) ?? lyricLists[i]?.[0] ?? null,
      }));

      const initialTexts: Record<string, string> = {};
      for (const e of built) {
        initialTexts[e.song.id] = e.lyric?.text ?? '';
      }

      setEntries(built);
      setTexts(initialTexts);
    } catch {
      setLoadError('Failed to load songs. Please try again.');
    } finally {
      setLoadingLyrics(false);
    }
  }, []);

  const handleTextChange = useCallback((songId: string, value: string) => {
    setTexts((prev) => ({ ...prev, [songId]: value }));
    setSaveStates((prev) => ({ ...prev, [songId]: 'idle' }));
  }, []);

  const saveSong = useCallback(async (entry: SongEntry) => {
    const { song, lyric } = entry;
    const text = texts[song.id] ?? '';
    if (!text.trim()) return;

    setSaveStates((prev) => ({ ...prev, [song.id]: 'saving' }));
    try {
      if (lyric) {
        await lyricsApi.update(lyric.id, { text });
        // Update entry so future saves work correctly
        setEntries((prev) =>
          prev.map((e) =>
            e.song.id === song.id ? { ...e, lyric: { ...lyric, text } } : e,
          ),
        );
      } else {
        const created = await songsApi.createLyric(song.id, {
          text,
          sourceType: 'manual',
          isPrimary: true,
        });
        setEntries((prev) =>
          prev.map((e) => (e.song.id === song.id ? { ...e, lyric: created } : e)),
        );
      }
      setSaveStates((prev) => ({ ...prev, [song.id]: 'saved' }));
    } catch {
      setSaveStates((prev) => ({ ...prev, [song.id]: 'error' }));
    }
  }, [texts]);

  const handleSaveAll = useCallback(async () => {
    const toSave = entries.filter((e) => {
      const text = texts[e.song.id] ?? '';
      return text.trim() && text !== (e.lyric?.text ?? '');
    });
    await Promise.all(toSave.map((e) => saveSong(e)));
  }, [entries, texts, saveSong]);

  const dirtyCount = entries.filter((e) => {
    const text = texts[e.song.id] ?? '';
    return text.trim() && text !== (e.lyric?.text ?? '');
  }).length;

  const withLyricsCount = entries.filter(
    (e) => (texts[e.song.id] ?? '').trim().length > 0,
  ).length;

  return (
    <div>
      <PageHeader
        title="Lyrics Builder"
        subtitle="Add or edit lyrics for every song in an album — all in one place"
      />

      {/* Band + album selectors */}
      <div className="card mb-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Band</label>
            <select
              className="input"
              value={bandId}
              onChange={(e) => {
                setBandId(e.target.value);
                setAlbumId('');
                setEntries([]);
                setTexts({});
              }}
            >
              <option value="">Select a band…</option>
              {bands?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Album</label>
            <select
              className="input"
              value={albumId}
              onChange={(e) => handleAlbumChange(e.target.value)}
              disabled={!bandId || !albums}
            >
              <option value="">
                {!bandId ? 'Select a band first…' : albums ? 'Select an album…' : 'Loading…'}
              </option>
              {albums?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}{a.year ? ` (${a.year})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tip */}
        <div className="rounded-lg bg-surface-50 border border-surface-200 px-4 py-3 text-xs text-surface-600 space-y-1">
          <p><strong>How it works:</strong> Select a band and album, then type or paste lyrics into each song's text area.</p>
          <p>Line breaks and blank lines between verses are preserved exactly as you type them. Save individual songs or use <strong>Save All</strong> when you're done.</p>
          <p>If a song already has lyrics they'll appear pre-filled — editing and saving will update them and keep a revision history.</p>
        </div>
      </div>

      {/* Loading state */}
      {loadingLyrics && (
        <div className="card text-center py-10">
          <p className="text-surface-600 text-sm">Loading songs and lyrics…</p>
        </div>
      )}

      {loadError && (
        <p className="text-red-600 text-sm mb-4">{loadError}</p>
      )}

      {/* Song entries */}
      {!loadingLyrics && entries.length > 0 && (
        <>
          {/* Album summary + Save All */}
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <p className="text-sm text-surface-600">
              <strong>{entries.length}</strong> songs ·{' '}
              <strong>{withLyricsCount}</strong> with lyrics
              {dirtyCount > 0 && (
                <span className="text-amber-600 ml-2">· {dirtyCount} unsaved</span>
              )}
            </p>
            <button
              className="btn-primary"
              onClick={handleSaveAll}
              disabled={dirtyCount === 0}
            >
              {dirtyCount > 0 ? `Save All (${dirtyCount} songs)` : 'All saved'}
            </button>
          </div>

          <div className="space-y-4">
            {entries.map((entry) => (
              <SongLyricsRow
                key={entry.song.id}
                entry={entry}
                text={texts[entry.song.id] ?? ''}
                saveState={saveStates[entry.song.id] ?? 'idle'}
                onChange={handleTextChange}
                onSave={saveSong}
              />
            ))}
          </div>

          {/* Bottom Save All */}
          {entries.length > 4 && (
            <div className="mt-6 flex justify-end">
              <button
                className="btn-primary"
                onClick={handleSaveAll}
                disabled={dirtyCount === 0}
              >
                {dirtyCount > 0 ? `Save All (${dirtyCount} songs)` : 'All saved'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loadingLyrics && albumId && entries.length === 0 && !loadError && (
        <div className="card text-center py-10">
          <p className="text-surface-600 text-sm">No songs found in this album.</p>
        </div>
      )}
    </div>
  );
}

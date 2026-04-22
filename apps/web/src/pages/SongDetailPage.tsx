import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { songsApi, lyricsApi } from '../api/songs';
import { albumsApi } from '../api/albums';
import { analysisApi } from '../api/analysis';
import { useAuth } from '../contexts/AuthContext';
import type { Song, SongResearchSource } from '@band-spectrum-mapper/shared';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import EmptyState from '../components/layout/EmptyState';
import type { Lyric, LyricRevision } from '@band-spectrum-mapper/shared';

function LyricEditor({
  lyric,
  onSaved,
}: {
  lyric: Lyric;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(lyric.text);
  const [changeNote, setChangeNote] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);

  const { data: revisions } = useQuery({
    queryKey: ['revisions', lyric.id],
    queryFn: () => lyricsApi.getRevisions(lyric.id),
    enabled: showRevisions,
  });

  const saveMutation = useMutation({
    mutationFn: () => lyricsApi.update(lyric.id, { text, changeNote: changeNote || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', lyric.songId] });
      qc.invalidateQueries({ queryKey: ['revisions', lyric.id] });
      setIsDirty(false);
      setChangeNote('');
      onSaved();
    },
  });

  const setPrimary = useMutation({
    mutationFn: () => lyricsApi.update(lyric.id, { isPrimary: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['song', lyric.songId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => lyricsApi.delete(lyric.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', lyric.songId] });
      onSaved();
    },
  });

  const restoreRevision = useMutation({
    mutationFn: (revisionId: string) => lyricsApi.restoreRevision(lyric.id, revisionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', lyric.songId] });
      qc.invalidateQueries({ queryKey: ['revisions', lyric.id] });
    },
  });

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {lyric.isPrimary && <span className="badge badge-gray">Primary</span>}
          <span className="badge badge-gray">{lyric.sourceType}</span>
          {lyric.sourceLabel && <span className="text-xs text-surface-700">{lyric.sourceLabel}</span>}
        </div>
        <div className="flex gap-2">
          {!lyric.isPrimary && (
            <button className="btn-ghost text-xs" onClick={() => setPrimary.mutate()}>Set as Primary</button>
          )}
          <button className="btn-ghost text-xs" onClick={() => setShowRevisions(!showRevisions)}>
            {showRevisions ? 'Hide History' : 'History'}
          </button>
          <button
            className="btn-ghost text-xs text-red-600"
            onClick={() => { if (confirm('Delete this lyric record?')) deleteMutation.mutate(); }}
          >
            Delete
          </button>
        </div>
      </div>

      <textarea
        className="textarea w-full min-h-[300px]"
        value={text}
        onChange={(e) => { setText(e.target.value); setIsDirty(e.target.value !== lyric.text); }}
      />

      {isDirty && (
        <div className="flex items-center gap-3">
          <input
            className="input flex-1"
            placeholder="Change note (optional)"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
          />
          <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button className="btn-secondary" onClick={() => { setText(lyric.text); setIsDirty(false); }}>
            Revert
          </button>
        </div>
      )}

      {saveMutation.isError && <ErrorMessage error={saveMutation.error} />}

      {showRevisions && revisions && revisions.length > 0 && (
        <div className="border-t border-surface-200 pt-3">
          <h3 className="mb-2 text-sm font-medium">Revision History</h3>
          <ul className="space-y-2">
            {revisions.map((rev: LyricRevision) => (
              <li key={rev.id} className="text-xs border border-surface-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-surface-700">
                    {new Date(rev.createdAt).toLocaleString()}
                    {rev.changeNote && ` — ${rev.changeNote}`}
                  </span>
                  <button className="btn-ghost text-xs" onClick={() => restoreRevision.mutate(rev.id)}>
                    Restore
                  </button>
                </div>
                <pre className="font-mono whitespace-pre-wrap line-clamp-3 text-surface-700">
                  {rev.previousText}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showRevisions && revisions && revisions.length === 0 && (
        <p className="text-xs text-surface-700 border-t border-surface-200 pt-3">No revision history yet.</p>
      )}
    </div>
  );
}

function AiAnalysisPanel({ songId }: { songId: string }) {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ai-analysis', songId],
    queryFn: () => analysisApi.getAiAnalysis(songId),
    retry: false,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateAiAnalysis(songId),
    onSuccess: () => refetch(),
  });

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3>AI Analysis</h3>
        {user?.isAdmin && (
          <button
            className="btn-ghost text-xs"
            disabled={regen.isPending}
            onClick={() => regen.mutate()}
          >
            {regen.isPending ? 'Regenerating…' : 'Regenerate'}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-surface-700">Analyzing lyrics…</p>}
      {error && <ErrorMessage error={error} />}
      {regen.isError && <ErrorMessage error={regen.error} />}

      {data && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Themes</p>
            <div className="flex flex-wrap gap-1">
              {data.themes.map((t) => (
                <span key={t} className="badge badge-gray">{t}</span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Emotional Register</p>
            <p className="text-sm">{data.emotionalRegister}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Conceptual Depth</p>
            <p className="text-sm">{data.conceptualDepth}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Notable Elements</p>
            <ul className="text-sm space-y-0.5 list-disc list-inside">
              {data.notableElements.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-surface-500">Model: {data.model} · Analyzed {new Date(data.updatedAt).toLocaleDateString()}</p>
        </div>
      )}
    </div>
  );
}

function AlbumTrackList({ songs, currentSongId }: { songs: Song[]; currentSongId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card mb-4 p-0 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Album tracks ({songs.length})</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ol className="border-t border-surface-100 divide-y divide-surface-100">
          {songs.map((s) => (
            <li key={s.id}>
              <Link
                to={`/library/songs/${s.id}`}
                className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-50 transition-colors ${s.id === currentSongId ? 'font-semibold text-indigo-700 bg-indigo-50' : 'text-surface-900'}`}
              >
                {s.trackNumber != null && (
                  <span className="w-5 text-right tabular-nums text-surface-400 text-xs flex-shrink-0">{s.trackNumber}.</span>
                )}
                <span className="flex-1 truncate">{s.title}</span>
                {s.id === currentSongId && <span className="text-xs text-indigo-400">← here</span>}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const SOURCE_LABELS: Record<SongResearchSource['type'], string> = {
  song: 'Song',
  album: 'Album',
  band: 'Artist',
};

function SongResearchPanel({ songId }: { songId: string }) {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['song-research', songId],
    queryFn: () => analysisApi.getSongResearch(songId),
    retry: false,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateSongResearch(songId),
    onSuccess: () => refetch(),
  });

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3>Song Research</h3>
        {user?.isAdmin && (
          <button className="btn-ghost text-xs" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {regen.isPending ? 'Researching…' : 'Regenerate'}
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-surface-700">Searching Wikipedia…</p>
      )}
      {error && <ErrorMessage error={error} />}
      {regen.isError && <ErrorMessage error={regen.error} />}

      {data && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">{data.summary}</p>

          {data.sources.length > 0 && (
            <div>
              <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-2">Sources</p>
              <ul className="space-y-1">
                {data.sources.map((s) => (
                  <li key={s.type} className="flex items-center gap-2 text-sm">
                    <span className="text-xs font-medium text-surface-500 w-12 flex-shrink-0">
                      {SOURCE_LABELS[s.type]}
                    </span>
                    {s.found ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline truncate"
                      >
                        {s.title}
                      </a>
                    ) : (
                      <span className="text-surface-400 italic">Not found on Wikipedia</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-surface-500">
            Model: {data.model} · Researched {new Date(data.updatedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

const CONTEXT_SECTIONS = [
  { key: 'titleSignificance', label: 'Title Significance' },
  { key: 'historicalContext', label: 'Historical Context' },
  { key: 'lyricalInterpretation', label: 'Lyrical Interpretation' },
  { key: 'thematicSynthesis', label: 'Thematic Synthesis' },
  { key: 'overallNarrative', label: 'Overall Narrative' },
] as const;

function SongContextPanel({ songId }: { songId: string }) {
  const { user } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['song-context', songId],
    queryFn: () => analysisApi.getSongContext(songId),
    retry: false,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateSongContext(songId),
    onSuccess: () => refetch(),
  });

  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3>Deep Analysis</h3>
          <p className="text-xs text-surface-500 mt-0.5">
            Synthesises title, lyrics, research, scores, and ratings.
          </p>
        </div>
        {user?.isAdmin && (
          <button className="btn-ghost text-xs" disabled={regen.isPending} onClick={() => regen.mutate()}>
            {regen.isPending ? 'Analysing…' : 'Regenerate'}
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-surface-700">Running deep analysis…</p>
      )}
      {error && <ErrorMessage error={error} />}
      {regen.isError && <ErrorMessage error={regen.error} />}

      {data && (
        <div className="space-y-5">
          {CONTEXT_SECTIONS.map(({ key, label }) => (
            <div key={key}>
              <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide mb-1.5">
                {label}
              </p>
              <p className="text-sm leading-relaxed">{data[key]}</p>
            </div>
          ))}
          <p className="text-xs text-surface-500 border-t border-surface-100 pt-3">
            Model: {data.model} · Analysed {new Date(data.updatedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

export default function SongDetailPage() {
  const { songId } = useParams<{ songId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [showAddLyric, setShowAddLyric] = useState(false);
  const [newLyricText, setNewLyricText] = useState('');
  const [newSourceType, setNewSourceType] = useState<'manual' | 'paste' | 'user_provided'>('manual');

  // Edit song state
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTrack, setEditTrack] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');

  const { data: song, isLoading, error } = useQuery({
    queryKey: ['song', songId],
    queryFn: () => songsApi.getById(songId!),
    enabled: !!songId,
  });

  const { data: albumSongs } = useQuery({
    queryKey: ['album-songs', song?.albumId],
    queryFn: () => albumsApi.getSongs(song!.albumId!),
    enabled: !!song?.albumId,
  });

  const sortedAlbumSongs: Song[] = albumSongs
    ? [...albumSongs].sort((a, b) => {
        if (a.trackNumber != null && b.trackNumber != null) return a.trackNumber - b.trackNumber;
        if (a.trackNumber != null) return -1;
        if (b.trackNumber != null) return 1;
        return a.title.localeCompare(b.title);
      })
    : [];

  const currentIdx = sortedAlbumSongs.findIndex((s) => s.id === songId);
  const prevSong = currentIdx > 0 ? sortedAlbumSongs[currentIdx - 1] : null;
  const nextSong = currentIdx !== -1 && currentIdx < sortedAlbumSongs.length - 1 ? sortedAlbumSongs[currentIdx + 1] : null;

  const updateSong = useMutation({
    mutationFn: () => songsApi.update(songId!, {
      title: editTitle.trim() || undefined,
      trackNumber: editTrack ? parseInt(editTrack) : null,
      notes: editNotes.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', songId] });
      setShowEdit(false);
      setEditError('');
    },
    onError: (e) => setEditError(e instanceof Error ? e.message : 'Failed to save'),
  });

  const addLyric = useMutation({
    mutationFn: () =>
      songsApi.createLyric(songId!, {
        text: newLyricText,
        sourceType: newSourceType,
        isPrimary: (song?.lyrics ?? []).length === 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['song', songId] });
      setShowAddLyric(false);
      setNewLyricText('');
    },
  });

  const deleteSong = useMutation({
    mutationFn: () => songsApi.delete(songId!),
    onSuccess: () => navigate(song?.albumId ? `/library/albums/${song.albumId}` : `/library/bands/${song?.bandId}`),
  });

  const openEdit = () => {
    setEditTitle(song?.title ?? '');
    setEditTrack(song?.trackNumber ? String(song.trackNumber) : '');
    setEditNotes(song?.notes ?? '');
    setEditError('');
    setShowEdit(true);
  };

  if (isLoading) return <p className="text-surface-700 text-sm">Loading...</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!song) return null;

  const tags = song.songTags ?? [];

  return (
    <div>
      <PageHeader
        title={song.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-1">
            <Link to={`/library/bands/${song.bandId}`} className="hover:underline">
              {song.band?.name}
            </Link>
            {song.album && (
              <>
                <span className="text-surface-400">/</span>
                <Link to={`/library/albums/${song.albumId!}`} className="hover:underline">
                  {song.album.title}
                </Link>
              </>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {song.albumId
              ? <Link to={`/library/albums/${song.albumId}`} className="btn-secondary">← Album</Link>
              : <Link to={`/library/bands/${song.bandId}`} className="btn-secondary">← Band</Link>
            }
            {prevSong && (
              <Link to={`/library/songs/${prevSong.id}`} className="btn-secondary" title={prevSong.title}>
                ‹ Prev
              </Link>
            )}
            {nextSong && (
              <Link to={`/library/songs/${nextSong.id}`} className="btn-secondary" title={nextSong.title}>
                Next ›
              </Link>
            )}
            <button className="btn-secondary" onClick={openEdit}>Edit</button>
            <Link to={`/spectrum?songId=${song.id}`} className="btn-secondary">Score</Link>
            <button className="btn-danger" onClick={() => { if (confirm('Delete this song?')) deleteSong.mutate(); }}>
              Delete
            </button>
          </div>
        }
      />

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {tags.map(({ tag }) => (
            <Link
              key={tag.id}
              to={`/library/tags/${tag.slug}`}
              className="badge badge-gray hover:bg-surface-300 transition-colors"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      )}

      {/* Album tracklist */}
      {sortedAlbumSongs.length > 1 && <AlbumTrackList songs={sortedAlbumSongs} currentSongId={song.id} />}

      {/* Edit form */}
      {showEdit && (
        <div className="card mb-6">
          <h3 className="mb-3 font-medium">Edit Song</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editTitle.trim()) { setEditError('Title is required'); return; }
              updateSong.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Title *</label>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Track #</label>
              <input className="input" type="number" value={editTrack} onChange={(e) => setEditTrack(e.target.value)} placeholder="Optional" min="1" />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="textarea w-full" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes" />
            </div>
            {editError && <p className="text-red-600 text-sm">{editError}</p>}
            <div className="flex gap-2">
              <button className="btn-primary" type="submit" disabled={updateSong.isPending}>
                {updateSong.isPending ? 'Saving...' : 'Save'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setShowEdit(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2>Lyrics</h2>
        <button className="btn-primary" onClick={() => setShowAddLyric(!showAddLyric)}>
          {showAddLyric ? 'Cancel' : 'Add Lyrics'}
        </button>
      </div>

      {showAddLyric && (
        <div className="card mb-4 space-y-3">
          <div>
            <label className="label">Source Type</label>
            <select
              className="input"
              value={newSourceType}
              onChange={(e) => setNewSourceType(e.target.value as typeof newSourceType)}
            >
              <option value="manual">Manual Entry</option>
              <option value="paste">Paste</option>
              <option value="user_provided">User Provided</option>
            </select>
          </div>
          <div>
            <label className="label">Lyrics Text *</label>
            <textarea
              className="textarea w-full min-h-[200px]"
              placeholder="Enter or paste lyrics here..."
              value={newLyricText}
              onChange={(e) => setNewLyricText(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!newLyricText.trim() || addLyric.isPending}
            onClick={() => addLyric.mutate()}
          >
            {addLyric.isPending ? 'Saving...' : 'Save Lyrics'}
          </button>
          {addLyric.isError && <ErrorMessage error={addLyric.error} />}
        </div>
      )}

      {song.lyrics.length === 0 && (
        <EmptyState
          message="No lyrics yet."
          action={<button className="btn-primary" onClick={() => setShowAddLyric(true)}>Add lyrics</button>}
        />
      )}

      <div className="space-y-4">
        {song.lyrics.map((lyric) => (
          <LyricEditor key={lyric.id} lyric={lyric} onSaved={() => {}} />
        ))}
      </div>

      {song.notes && !showEdit && (
        <div className="card mt-6">
          <h3 className="mb-2">Notes</h3>
          <p className="text-sm whitespace-pre-wrap">{song.notes}</p>
        </div>
      )}

      {song.lyrics.length > 0 && <AiAnalysisPanel songId={song.id} />}

      <SongResearchPanel songId={song.id} />

      <SongContextPanel songId={song.id} />
    </div>
  );
}

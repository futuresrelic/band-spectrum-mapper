import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { songsApi, lyricsApi } from '../api/songs';
import { analysisApi } from '../api/analysis';
import { useAuth } from '../contexts/AuthContext';
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
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ai-analysis', songId],
    queryFn: () => analysisApi.getAiAnalysis(songId),
    enabled,
    retry: false,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateAiAnalysis(songId),
    onSuccess: () => refetch(),
  });

  if (!enabled) {
    return (
      <div className="card mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3>AI Analysis</h3>
          <button className="btn-secondary text-sm" onClick={() => setEnabled(true)}>
            Load Analysis
          </button>
        </div>
        <p className="text-xs text-surface-700">OpenAI-powered lyrical theme and tone analysis.</p>
      </div>
    );
  }

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

  return (
    <div>
      <PageHeader
        title={song.title}
        subtitle={[song.band?.name, song.album?.title].filter(Boolean).join(' / ')}
        actions={
          <div className="flex gap-2">
            {song.albumId
              ? <Link to={`/library/albums/${song.albumId}`} className="btn-secondary">← Album</Link>
              : <Link to={`/library/bands/${song.bandId}`} className="btn-secondary">← Band</Link>
            }
            <button className="btn-secondary" onClick={openEdit}>Edit</button>
            <Link to={`/spectrum?songId=${song.id}`} className="btn-secondary">Score</Link>
            <button className="btn-danger" onClick={() => { if (confirm('Delete this song?')) deleteSong.mutate(); }}>
              Delete
            </button>
          </div>
        }
      />

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
    </div>
  );
}

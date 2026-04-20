import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { albumsApi } from '../api/albums';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import EmptyState from '../components/layout/EmptyState';
import type { CreateSongInput } from '@band-spectrum-mapper/shared';

export default function AlbumDetailPage() {
  const { albumId } = useParams<{ albumId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [showSongForm, setShowSongForm] = useState(false);
  const [songTitle, setSongTitle] = useState('');
  const [trackNumber, setTrackNumber] = useState('');
  const [formError, setFormError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  // Edit album state
  const [showEdit, setShowEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');

  const { data: album, isLoading, error } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () => albumsApi.getById(albumId!),
    enabled: !!albumId,
  });

  const updateAlbum = useMutation({
    mutationFn: () => albumsApi.update(albumId!, {
      title: editTitle.trim() || undefined,
      year: editYear ? parseInt(editYear) : null,
      notes: editNotes.trim() || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['album', albumId] });
      setShowEdit(false);
      setEditError('');
    },
    onError: (e) => setEditError(e instanceof Error ? e.message : 'Failed to save'),
  });

  const createSong = useMutation({
    mutationFn: (data: CreateSongInput) =>
      bandsApi.createSong(album!.bandId, { ...data, albumId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['album', albumId] });
      setSongTitle('');
      setTrackNumber('');
      setShowSongForm(false);
      setFormError('');
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Failed to create song'),
  });

  const deleteAlbum = useMutation({
    mutationFn: () => albumsApi.delete(albumId!),
    onSuccess: () => navigate(`/library/bands/${album?.bandId}`),
  });

  const openEdit = () => {
    setEditTitle(album?.title ?? '');
    setEditYear(album?.year ? String(album.year) : '');
    setEditNotes(album?.notes ?? '');
    setEditError('');
    setShowEdit(true);
  };

  if (isLoading) return <p className="text-surface-700 text-sm">Loading...</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!album) return null;

  return (
    <div>
      <PageHeader
        title={album.title}
        subtitle={album.year ? String(album.year) : undefined}
        actions={
          <div className="flex gap-2">
            <Link to={`/library/bands/${album.bandId}`} className="btn-secondary">← Band</Link>
            <button className="btn-secondary" onClick={openEdit}>Edit</button>
            <button className="btn-danger" onClick={() => setShowDelete(true)}>Delete Album</button>
          </div>
        }
      />

      {/* Edit form */}
      {showEdit && (
        <div className="card mb-6">
          <h3 className="mb-3 font-medium">Edit Album</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editTitle.trim()) { setEditError('Title is required'); return; }
              updateAlbum.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Title *</label>
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Year</label>
              <input className="input" type="number" value={editYear} onChange={(e) => setEditYear(e.target.value)} placeholder="2024" min="1900" max="2100" />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="textarea w-full" rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Optional notes" />
            </div>
            {editError && <p className="text-red-600 text-sm">{editError}</p>}
            <div className="flex gap-2">
              <button className="btn-primary" type="submit" disabled={updateAlbum.isPending}>
                {updateAlbum.isPending ? 'Saving...' : 'Save'}
              </button>
              <button className="btn-secondary" type="button" onClick={() => setShowEdit(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {showDelete && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm mb-3">Delete <strong>{album.title}</strong>? Songs will not be deleted, but they will be unlinked from this album.</p>
          <div className="flex gap-2">
            <button className="btn-danger" onClick={() => deleteAlbum.mutate()}>Yes, delete</button>
            <button className="btn-secondary" onClick={() => setShowDelete(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2>Songs</h2>
        <button className="btn-primary" onClick={() => setShowSongForm(!showSongForm)}>
          {showSongForm ? 'Cancel' : 'Add Song'}
        </button>
      </div>

      {showSongForm && (
        <div className="card mb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!songTitle.trim()) { setFormError('Title is required'); return; }
              createSong.mutate({
                title: songTitle.trim(),
                trackNumber: trackNumber ? parseInt(trackNumber) : null,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Title *</label>
              <input className="input" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title" />
            </div>
            <div>
              <label className="label">Track #</label>
              <input className="input" type="number" value={trackNumber} onChange={(e) => setTrackNumber(e.target.value)} placeholder="1" min="1" />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <button className="btn-primary" type="submit" disabled={createSong.isPending}>
              {createSong.isPending ? 'Saving...' : 'Create Song'}
            </button>
          </form>
        </div>
      )}

      {album.songs.length === 0 && (
        <EmptyState
          message="No songs yet."
          action={<button className="btn-primary" onClick={() => setShowSongForm(true)}>Add first song</button>}
        />
      )}

      {album.songs.length > 0 && (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left">
                <th className="pb-2 pr-4 font-medium text-surface-700 w-8">#</th>
                <th className="pb-2 font-medium text-surface-700">Title</th>
              </tr>
            </thead>
            <tbody>
              {album.songs.map((song) => (
                <tr key={song.id} className="border-b border-surface-100">
                  <td className="py-2 pr-4 text-surface-700">{song.trackNumber ?? '—'}</td>
                  <td className="py-2">
                    <Link to={`/library/songs/${song.id}`} className="hover:underline">
                      {song.title}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {album.notes && !showEdit && (
        <div className="card mt-4">
          <p className="text-xs font-medium text-surface-600 mb-1">Notes</p>
          <p className="text-sm whitespace-pre-wrap text-surface-700">{album.notes}</p>
        </div>
      )}
    </div>
  );
}

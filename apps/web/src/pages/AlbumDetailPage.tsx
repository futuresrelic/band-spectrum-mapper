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

  const { data: album, isLoading, error } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () => albumsApi.getById(albumId!),
    enabled: !!albumId,
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
            <button className="btn-danger" onClick={() => setShowDelete(true)}>Delete Album</button>
          </div>
        }
      />

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
    </div>
  );
}

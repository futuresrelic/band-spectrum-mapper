import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import EmptyState from '../components/layout/EmptyState';
import type { CreateAlbumInput } from '@band-spectrum-mapper/shared';

export default function BandDetailPage() {
  const { bandId } = useParams<{ bandId: string }>();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showAlbumForm, setShowAlbumForm] = useState(false);
  const [albumTitle, setAlbumTitle] = useState('');
  const [albumYear, setAlbumYear] = useState('');
  const [formError, setFormError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: band, isLoading, error } = useQuery({
    queryKey: ['band', bandId],
    queryFn: () => bandsApi.getById(bandId!),
    enabled: !!bandId,
  });

  const { data: albums } = useQuery({
    queryKey: ['albums', bandId],
    queryFn: () => bandsApi.listAlbums(bandId!),
    enabled: !!bandId,
  });

  const createAlbum = useMutation({
    mutationFn: (data: CreateAlbumInput) => bandsApi.createAlbum(bandId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['albums', bandId] });
      setAlbumTitle('');
      setAlbumYear('');
      setShowAlbumForm(false);
      setFormError('');
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Failed to create album'),
  });

  const deleteBand = useMutation({
    mutationFn: () => bandsApi.delete(bandId!),
    onSuccess: () => navigate('/library'),
  });

  if (isLoading) return <p className="text-surface-700 text-sm">Loading...</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!band) return null;

  return (
    <div>
      <PageHeader
        title={band.name}
        subtitle={band.description ?? undefined}
        actions={
          <div className="flex gap-2">
            <Link to="/library" className="btn-secondary">← Library</Link>
            <button
              className="btn-danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Band
            </button>
          </div>
        }
      />

      {showDeleteConfirm && (
        <div className="card mb-6 border-red-200 bg-red-50">
          <p className="text-sm mb-3">
            Delete <strong>{band.name}</strong>? This will also delete all albums, songs, and lyrics. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button className="btn-danger" onClick={() => deleteBand.mutate()}>
              Yes, delete
            </button>
            <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2>Albums</h2>
        <button className="btn-primary" onClick={() => setShowAlbumForm(!showAlbumForm)}>
          {showAlbumForm ? 'Cancel' : 'Add Album'}
        </button>
      </div>

      {showAlbumForm && (
        <div className="card mb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!albumTitle.trim()) { setFormError('Title is required'); return; }
              createAlbum.mutate({
                title: albumTitle.trim(),
                year: albumYear ? parseInt(albumYear) : null,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label className="label">Title *</label>
              <input className="input" value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value)} placeholder="Album title" />
            </div>
            <div>
              <label className="label">Year</label>
              <input className="input" type="number" value={albumYear} onChange={(e) => setAlbumYear(e.target.value)} placeholder="2024" min="1900" max="2100" />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <button className="btn-primary" type="submit" disabled={createAlbum.isPending}>
              {createAlbum.isPending ? 'Saving...' : 'Create Album'}
            </button>
          </form>
        </div>
      )}

      {albums && albums.length === 0 && (
        <EmptyState
          message="No albums yet."
          action={<button className="btn-primary" onClick={() => setShowAlbumForm(true)}>Add first album</button>}
        />
      )}

      {albums && albums.length > 0 && (
        <div className="card">
          <ul className="divide-y divide-surface-100">
            {albums.map((album) => (
              <li key={album.id} className="py-3 flex items-center justify-between">
                <div>
                  <Link to={`/library/albums/${album.id}`} className="font-medium hover:underline">
                    {album.title}
                  </Link>
                  {album.year && <span className="ml-2 text-xs text-surface-700">{album.year}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

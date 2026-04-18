import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import EmptyState from '../components/layout/EmptyState';

export default function LibraryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const { data: bands, isLoading, error } = useQuery({
    queryKey: ['bands', search],
    queryFn: () => bandsApi.list(search || undefined),
  });

  const createBand = useMutation({
    mutationFn: () => bandsApi.create({ name: name.trim(), description: description.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bands'] });
      setName('');
      setDescription('');
      setShowForm(false);
      setFormError('');
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Failed to create band'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setFormError('Name is required'); return; }
    createBand.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle="Browse and manage your bands, albums, and songs"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add Band'}
          </button>
        }
      />

      {showForm && (
        <div className="card mb-6">
          <h2 className="mb-4">Add Band</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Name *</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Band name"
              />
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            {formError && <p className="text-red-600 text-sm">{formError}</p>}
            <button className="btn-primary" type="submit" disabled={createBand.isPending}>
              {createBand.isPending ? 'Saving...' : 'Create Band'}
            </button>
          </form>
        </div>
      )}

      <div className="mb-4">
        <input
          className="input max-w-sm"
          placeholder="Search bands..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <ErrorMessage error={error} />}
      {isLoading && <p className="text-surface-700 text-sm">Loading...</p>}

      {bands && bands.length === 0 && (
        <EmptyState
          message="No bands found."
          action={
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              Add your first band
            </button>
          }
        />
      )}

      {bands && bands.length > 0 && (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left">
                <th className="pb-2 font-medium text-surface-700">Band</th>
                <th className="pb-2 font-medium text-surface-700">Albums</th>
                <th className="pb-2 font-medium text-surface-700">Songs</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band) => (
                <tr key={band.id} className="border-b border-surface-100">
                  <td className="py-3 pr-4">
                    <Link
                      to={`/library/bands/${band.id}`}
                      className="font-medium hover:underline"
                    >
                      {band.name}
                    </Link>
                    {band.description && (
                      <p className="text-xs text-surface-700 mt-0.5 line-clamp-1">
                        {band.description}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-surface-700">{band._count.albums}</td>
                  <td className="py-3 text-surface-700">{band._count.songs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

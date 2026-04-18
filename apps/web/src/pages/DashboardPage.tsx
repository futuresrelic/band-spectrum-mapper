import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '';

function handleExport() {
  const a = document.createElement('a');
  a.href = `${BASE_URL}/api/export`;
  a.download = `band-spectrum-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

export default function DashboardPage() {
  const { data: bands, isLoading, error } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your music library"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={handleExport}>Export JSON</button>
            <Link to="/view" target="_blank" className="btn-secondary">Public Viewer ↗</Link>
            <Link to="/library" className="btn-primary">Open Library</Link>
          </div>
        }
      />

      {error && <ErrorMessage error={error} />}

      {isLoading && <p className="text-surface-700 text-sm">Loading...</p>}

      {bands && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="card">
            <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Bands</p>
            <p className="text-3xl font-bold">{bands.length}</p>
          </div>
          <div className="card">
            <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Albums</p>
            <p className="text-3xl font-bold">
              {bands.reduce((n, b) => n + b._count.albums, 0)}
            </p>
          </div>
          <div className="card">
            <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Songs</p>
            <p className="text-3xl font-bold">
              {bands.reduce((n, b) => n + b._count.songs, 0)}
            </p>
          </div>
        </div>
      )}

      {bands && bands.length > 0 && (
        <div className="card">
          <h2 className="mb-4">Your Bands</h2>
          <ul className="divide-y divide-surface-100">
            {bands.map((band) => (
              <li key={band.id} className="py-3 flex items-center justify-between">
                <div>
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
                </div>
                <div className="flex gap-4 text-xs text-surface-700">
                  <span>{band._count.albums} albums</span>
                  <span>{band._count.songs} songs</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {bands && bands.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-surface-700 mb-4">No bands yet. Add your first band to get started.</p>
          <Link to="/library" className="btn-primary">
            Go to Library
          </Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/spectrum', label: 'Spectrum Scoring', desc: 'Score songs on 6 axes' },
          { to: '/analysis', label: 'Lyrics Analysis', desc: 'Word frequency and clouds' },
          { to: '/compare', label: 'Compare', desc: 'Band vs band comparison' },
          { to: '/imports', label: 'Import Lyrics', desc: 'Bulk import from files' },
        ].map(({ to, label, desc }) => (
          <Link key={to} to={to} className="card hover:border-surface-700 transition-colors group">
            <p className="font-medium group-hover:underline">{label}</p>
            <p className="text-xs text-surface-700 mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

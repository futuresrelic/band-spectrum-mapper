import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';
import type { BandWithCounts } from '@band-spectrum-mapper/shared';

export default function ViewerIndexPage() {
  const { data: bands, isLoading } = useQuery({
    queryKey: ['public-bands'],
    queryFn: () => api.get<BandWithCounts[]>('/api/public/bands'),
  });

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      <SiteHeader theme="light" active="library" />

      {/* Content */}
      <div className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Band Library</h1>
            <p className="text-surface-600 mt-1 text-sm">
              Select a band to explore their albums, songs, spectrum scores, AI analysis, and community discussion.
            </p>
          </div>

          {isLoading && <p className="text-surface-600 text-sm">Loading…</p>}

          {bands && bands.length === 0 && (
            <p className="text-surface-600 text-sm">No bands in the library yet.</p>
          )}

          {bands && bands.length > 0 && (
            <ul className="space-y-2">
              {bands.map((band) => (
                <li key={band.id}>
                  <Link
                    to={`/view/${band.slug}`}
                    className="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-5 py-4 hover:border-surface-700 transition-colors group"
                  >
                    <div>
                      <p className="font-semibold group-hover:underline">{band.name}</p>
                      {band.description && (
                        <p className="text-sm text-surface-600 mt-0.5 line-clamp-1">{band.description}</p>
                      )}
                    </div>
                    <div className="text-xs text-surface-500 text-right shrink-0 ml-4">
                      <p>{band._count.albums} albums</p>
                      <p>{band._count.songs} songs</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-surface-200 py-6">
        <div className="max-w-3xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-surface-500">
          <span>Band Spectrum Mapper · Read-only view</span>
          <div className="flex flex-wrap gap-4 items-center">
            <a
              href="https://buymeacoffee.com/bandspectrummapper"
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-600 hover:text-yellow-700 transition-colors font-medium"
            >
              ☕ Buy me a coffee
            </a>
            <Link to="/landing" className="hover:text-surface-900 transition-colors">About</Link>
            <Link to="/help" className="hover:text-surface-900 transition-colors">Help</Link>
            <Link to="/legal" className="hover:text-surface-900 transition-colors">Legal</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

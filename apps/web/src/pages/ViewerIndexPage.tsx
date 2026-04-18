import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { BandWithCounts } from '@band-spectrum-mapper/shared';

export default function ViewerIndexPage() {
  const { data: bands, isLoading } = useQuery({
    queryKey: ['public-bands'],
    queryFn: () => api.get<BandWithCounts[]>('/api/public/bands'),
  });

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Band Spectrum</h1>
          <p className="text-surface-700 mt-1">Browse bands, albums, songs, and style analysis.</p>
        </div>

        {isLoading && <p className="text-surface-700">Loading...</p>}

        {bands && bands.length === 0 && (
          <p className="text-surface-700">No bands available yet.</p>
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
                      <p className="text-sm text-surface-700 mt-0.5 line-clamp-1">{band.description}</p>
                    )}
                  </div>
                  <div className="text-xs text-surface-700 text-right shrink-0 ml-4">
                    <p>{band._count.albums} albums</p>
                    <p>{band._count.songs} songs</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-surface-700 mt-12 border-t border-surface-200 pt-4">
          Read-only view. Data managed by Band Spectrum Mapper.
        </p>
      </div>
    </div>
  );
}

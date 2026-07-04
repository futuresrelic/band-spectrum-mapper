import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bandsApi } from '../../api/bands';
import WikiLayout from '../../components/wiki/WikiLayout';
import WikiBrowseSearch from '../../components/wiki/WikiBrowseSearch';

export default function WikiBandsBrowsePage() {
  const [q, setQ] = useState('');

  const { data: bands, isLoading, isError, refetch } = useQuery({
    queryKey: ['wiki', 'browse', 'bands'],
    queryFn: () => bandsApi.list(),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!bands) return [];
    const query = q.trim().toLowerCase();
    if (!query) return bands;
    return bands.filter((b) => b.name.toLowerCase().includes(query));
  }, [bands, q]);

  return (
    <WikiLayout nav={[]} title="Bands" subtitle="Every band in the collection.">
      <WikiBrowseSearch
        value={q}
        onChange={setQ}
        placeholder="Search bands…"
        resultCount={filtered.length}
        totalCount={bands?.length ?? 0}
        noun="bands"
      />

      {isLoading && <GridSkeleton />}

      {isError && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-400 mb-3">Couldn't load bands right now.</p>
          <button
            onClick={() => void refetch()}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && bands?.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500">No bands in the collection yet.</p>
        </div>
      )}

      {!isLoading && !isError && (bands?.length ?? 0) > 0 && filtered.length === 0 && (
        <p className="text-center text-gray-500 text-sm py-10">No bands match "{q}".</p>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((b) => (
            <Link
              key={b.id}
              to={`/wiki/bands/${b.slug}`}
              className="group flex flex-col items-center gap-2.5 p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-indigo-800 hover:bg-gray-800/80 transition-colors"
            >
              {b.logoUrl ? (
                <img src={b.logoUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-gray-800" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 text-lg font-bold">
                  {b.name[0]}
                </div>
              )}
              <div className="text-center min-w-0 w-full">
                <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate transition-colors">{b.name}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {b._count.albums} album{b._count.albums !== 1 ? 's' : ''} · {b._count.songs} song{b._count.songs !== 1 ? 's' : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </WikiLayout>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2.5 p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="w-14 h-14 rounded-full bg-gray-800" />
          <div className="h-3 w-16 bg-gray-800 rounded" />
        </div>
      ))}
    </div>
  );
}

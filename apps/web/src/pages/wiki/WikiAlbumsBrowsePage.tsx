import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getWikiAlbumsBrowse } from '../../api/wiki';
import WikiLayout from '../../components/wiki/WikiLayout';
import WikiBrowseSearch from '../../components/wiki/WikiBrowseSearch';

export default function WikiAlbumsBrowsePage() {
  const [q, setQ] = useState('');

  const { data: albums, isLoading, isError, refetch } = useQuery({
    queryKey: ['wiki', 'browse', 'albums'],
    queryFn: () => getWikiAlbumsBrowse(),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!albums) return [];
    const query = q.trim().toLowerCase();
    if (!query) return albums;
    return albums.filter((a) => a.title.toLowerCase().includes(query) || a.band.name.toLowerCase().includes(query));
  }, [albums, q]);

  return (
    <WikiLayout nav={[]} title="Albums" subtitle="Every album in the collection.">
      <WikiBrowseSearch
        value={q}
        onChange={setQ}
        placeholder="Search albums or bands…"
        resultCount={filtered.length}
        totalCount={albums?.length ?? 0}
        noun="albums"
      />

      {isLoading && <GridSkeleton />}

      {isError && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-400 mb-3">Couldn't load albums right now.</p>
          <button
            onClick={() => void refetch()}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && albums?.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500">No albums in the collection yet.</p>
        </div>
      )}

      {!isLoading && !isError && (albums?.length ?? 0) > 0 && filtered.length === 0 && (
        <p className="text-center text-gray-500 text-sm py-10">No albums match "{q}".</p>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((a) => (
            <Link
              key={a.id}
              to={`/wiki/albums/${a.band.slug}/${a.slug}`}
              className="group flex flex-col gap-2"
            >
              <div className="aspect-square rounded-lg overflow-hidden bg-gray-800 border border-gray-800 group-hover:border-indigo-800 transition-colors">
                {a.artworkUrl ? (
                  <img src={a.artworkUrl} alt={a.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700 text-3xl">💿</div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-200 group-hover:text-white truncate transition-colors">{a.title}</p>
                <p className="text-[10px] text-gray-500 truncate">
                  {a.band.name}{a.year ? ` · ${a.year}` : ''}
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
        <div key={i} className="flex flex-col gap-2">
          <div className="aspect-square rounded-lg bg-gray-900 border border-gray-800" />
          <div className="h-3 w-3/4 bg-gray-800 rounded" />
        </div>
      ))}
    </div>
  );
}

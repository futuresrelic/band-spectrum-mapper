import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getWikiArtistsBrowse } from '../../api/wiki';
import WikiLayout from '../../components/wiki/WikiLayout';
import WikiBrowseSearch from '../../components/wiki/WikiBrowseSearch';

export default function WikiArtistsBrowsePage() {
  const [q, setQ] = useState('');

  const { data: members, isLoading, isError, refetch } = useQuery({
    queryKey: ['wiki', 'browse', 'artists'],
    queryFn: () => getWikiArtistsBrowse(),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!members) return [];
    const query = q.trim().toLowerCase();
    if (!query) return members;
    return members.filter((m) => m.name.toLowerCase().includes(query) || m.band.name.toLowerCase().includes(query));
  }, [members, q]);

  return (
    <WikiLayout nav={[]} title="Artists" subtitle="Every band member in the collection.">
      <WikiBrowseSearch
        value={q}
        onChange={setQ}
        placeholder="Search artists or bands…"
        resultCount={filtered.length}
        totalCount={members?.length ?? 0}
        noun="artists"
      />

      {isLoading && <ListSkeleton />}

      {isError && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-400 mb-3">Couldn't load artists right now.</p>
          <button
            onClick={() => void refetch()}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && members?.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500">No band members listed yet.</p>
        </div>
      )}

      {!isLoading && !isError && (members?.length ?? 0) > 0 && filtered.length === 0 && (
        <p className="text-center text-gray-500 text-sm py-10">No artists match "{q}".</p>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map((m) => (
            <Link
              key={m.id}
              to={`/wiki/artists/${m.id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-colors group"
            >
              <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                {m.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate transition-colors">{m.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {m.band.name}{m.role ? ` · ${m.role}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </WikiLayout>
  );
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg bg-gray-900 border border-gray-800" />
      ))}
    </div>
  );
}

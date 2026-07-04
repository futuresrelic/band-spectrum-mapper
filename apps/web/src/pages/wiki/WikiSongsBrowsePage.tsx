import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getWikiSongsBrowse } from '../../api/wiki';
import WikiLayout from '../../components/wiki/WikiLayout';
import WikiBrowseSearch from '../../components/wiki/WikiBrowseSearch';
import { deriveLiveFrequency, LIVE_FREQUENCY_COLOR } from '../../lib/liveFrequency';

export default function WikiSongsBrowsePage() {
  const [q, setQ] = useState('');

  const { data: songs, isLoading, isError, refetch } = useQuery({
    queryKey: ['wiki', 'browse', 'songs'],
    queryFn: () => getWikiSongsBrowse(),
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!songs) return [];
    const query = q.trim().toLowerCase();
    if (!query) return songs;
    return songs.filter((s) => s.title.toLowerCase().includes(query) || s.band.name.toLowerCase().includes(query));
  }, [songs, q]);

  return (
    <WikiLayout nav={[]} title="Songs" subtitle="Every song in the collection.">
      <WikiBrowseSearch
        value={q}
        onChange={setQ}
        placeholder="Search songs or bands…"
        resultCount={filtered.length}
        totalCount={songs?.length ?? 0}
        noun="songs"
      />

      {isLoading && <ListSkeleton />}

      {isError && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-400 mb-3">Couldn't load songs right now.</p>
          <button
            onClick={() => void refetch()}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && !isError && songs?.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500">No songs in the collection yet.</p>
        </div>
      )}

      {!isLoading && !isError && (songs?.length ?? 0) > 0 && filtered.length === 0 && (
        <p className="text-center text-gray-500 text-sm py-10">No songs match "{q}".</p>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {filtered.map((s) => {
            const { tier } = deriveLiveFrequency(null, s.rarity);
            const tierColor = LIVE_FREQUENCY_COLOR[tier];
            return (
              <Link
                key={s.id}
                to={`/wiki/songs/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate transition-colors">{s.title}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {s.band.name}{s.album ? ` · ${s.album.title}` : ''}
                  </p>
                </div>
                <span className={`text-[10px] font-medium uppercase tracking-widest shrink-0 ${tierColor}`}>
                  {tier}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </WikiLayout>
  );
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg bg-gray-900 border border-gray-800" />
      ))}
    </div>
  );
}

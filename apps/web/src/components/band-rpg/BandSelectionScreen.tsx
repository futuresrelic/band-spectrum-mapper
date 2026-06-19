import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bandsApi } from '../../api/bands';
import type { BandRpgSelectedBand } from '../../api/bandRpg';

interface Props {
  onSelect: (band: BandRpgSelectedBand) => void;
  onBack:   () => void;
}

export default function BandSelectionScreen({ onSelect, onBack }: Props) {
  const [search, setSearch] = useState('');

  const { data: allBands, isLoading, isError } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
    staleTime: 5 * 60_000,
  });

  const bands = useMemo(() => {
    if (!allBands) return [];
    const q = search.trim().toLowerCase();
    return q ? allBands.filter(b => b.name.toLowerCase().includes(q)) : allBands;
  }, [allBands, search]);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-gray-800 bg-black/30">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-1"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Choose Your Band</h1>
            <p className="text-gray-500 text-xs mt-0.5">The Archives will be themed to the band you select</p>
          </div>
        </div>
        <input
          type="text"
          placeholder="Search bands…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && (
          <div className="text-gray-500 text-center py-16 text-sm">Loading bands…</div>
        )}

        {isError && (
          <div className="text-red-400 text-center py-16 text-sm">Failed to load bands.</div>
        )}

        {!isLoading && !isError && bands.length === 0 && (
          <div className="text-gray-500 text-center py-16 text-sm">No bands found.</div>
        )}

        {!isLoading && !isError && bands.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {bands.map((band) => (
              <button
                key={band.id}
                onClick={() => onSelect({ id: band.id, name: band.name, logoUrl: band.logoUrl })}
                className="group bg-gray-900/50 hover:bg-gray-800/80 border border-gray-800 hover:border-violet-500/50 rounded-xl p-4 flex flex-col items-center gap-3 transition-all text-left"
              >
                {band.logoUrl ? (
                  <img
                    src={band.logoUrl}
                    alt={band.name}
                    className="w-16 h-16 object-contain rounded-lg"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl font-bold text-gray-400 group-hover:text-violet-400 transition-colors">
                    {band.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="w-full text-center min-w-0">
                  <p className="text-white text-sm font-semibold line-clamp-2 leading-snug">{band.name}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {band._count.albums} albums · {band._count.songs} songs
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { bandRpgApi } from '../api/bandRpg';
import type { BandRpgCollectedSong } from '../api/bandRpg';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function SongRow({ song }: { song: BandRpgCollectedSong }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors">
      <span className="text-base">{song.guessedCorrectly ? '🎵' : '💿'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{song.songTitle}</p>
        <p className="text-xs text-gray-500">{formatDate(song.recoveredAt)}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {song.guessedCorrectly && (
          <span className="text-xs text-emerald-400 font-medium">Identified</span>
        )}
        <span className="text-xs text-amber-400 font-mono">{song.scoreEarned} pts</span>
      </div>
    </div>
  );
}

export default function BandRpgCollectionPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState('');

  const { data: groups = [], isLoading, isError } = useQuery({
    queryKey: ['band-rpg-collection'],
    queryFn:  () => bandRpgApi.getCollection(),
    enabled:  !!user,
    staleTime: 60_000,
  });

  const totalCollected = groups.reduce((sum, g) => sum + g.collected.length, 0);

  const filteredGroups = search.trim()
    ? groups
        .map((g) => ({
          ...g,
          collected: g.collected.filter(
            (s) =>
              s.songTitle.toLowerCase().includes(search.toLowerCase()) ||
              s.bandName.toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter((g) => g.collected.length > 0)
    : groups;

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <SiteHeader theme="dark" active="games" />

      <div className="flex items-center gap-3 px-4 py-3 bg-black/40 border-b border-gray-800 shrink-0">
        <Link to="/play/band-rpg" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          ← Band RPG
        </Link>
        <span className="text-gray-700 text-sm">·</span>
        <span className="text-white text-sm font-semibold">My Collection</span>
        {totalCollected > 0 && (
          <span className="ml-auto text-gray-500 text-xs">{totalCollected} song{totalCollected !== 1 ? 's' : ''} recovered</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {authLoading ? (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-gray-400 text-sm">Please log in to view your collection.</p>
            <Link to="/play/band-rpg" className="text-amber-400 text-sm hover:text-amber-300 transition-colors">← Back to Band RPG</Link>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 rounded-full border-2 border-amber-500/60 border-t-amber-400 animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-red-400 text-sm">Failed to load collection.</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
            <span className="text-4xl">📂</span>
            <p className="text-gray-300 font-semibold">No songs recovered yet</p>
            <p className="text-gray-500 text-sm max-w-xs">
              Play Band RPG and complete quests to add songs to your collection.
            </p>
            <Link to="/play/band-rpg" className="bg-amber-700 hover:bg-amber-600 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors">
              Play Band RPG
            </Link>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search songs or bands…"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/60"
            />

            {filteredGroups.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-8">No results for "{search}"</p>
            ) : (
              filteredGroups.map((group) => {
                const pct = group.totalSongsInBand > 0
                  ? Math.round((group.collected.length / group.totalSongsInBand) * 100)
                  : 0;
                return (
                  <div key={group.bandId} className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
                    {/* Band header */}
                    <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-semibold text-sm">{group.bandName}</span>
                        <span className="text-gray-500 text-xs">
                          {group.collected.length} / {group.totalSongsInBand} songs
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Song list */}
                    <div>
                      {group.collected.map((song) => (
                        <SongRow key={song.id} song={song} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { bandRpgApi } from '../api/bandRpg';
import type {
  BandRpgCollectedSong, BandRpgAlbumProgress,
  BandRpgAlbumSong, AlbumState,
} from '../api/bandRpg';

// ── Rarity display ────────────────────────────────────────────────────────────

const RARITY_ORDER: Record<string, number> = {
  Common: 0, Uncommon: 1, Rare: 2, Legendary: 3, Mythic: 4,
};

const RARITY_BADGE: Record<string, { label: string; className: string }> = {
  Common:    { label: '⚪ Common',    className: 'text-gray-400 bg-gray-800'         },
  Uncommon:  { label: '🟢 Uncommon',  className: 'text-emerald-400 bg-emerald-900/40' },
  Rare:      { label: '🔵 Rare',      className: 'text-blue-400 bg-blue-900/40'       },
  Legendary: { label: '🟣 Legendary', className: 'text-purple-400 bg-purple-900/40'  },
  Mythic:    { label: '🟠 Mythic',    className: 'text-orange-400 bg-orange-900/40'  },
};

function RarityBadge({ rarity }: { rarity: string }) {
  const badge = RARITY_BADGE[rarity] ?? { label: rarity, className: 'text-gray-400 bg-gray-800' };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Album state display ───────────────────────────────────────────────────────

const ALBUM_STATE_CONFIG: Record<AlbumState, { icon: string; label: string; className: string }> = {
  not_started: { icon: '⚫', label: 'Not Started', className: 'text-gray-500'   },
  in_progress: { icon: '🟡', label: 'In Progress', className: 'text-amber-400'  },
  completed:   { icon: '🟢', label: 'Completed',   className: 'text-emerald-400' },
};

// ── Songs tab components ──────────────────────────────────────────────────────

type SortMode = 'date_desc' | 'title_asc' | 'rarity_asc' | 'rarity_desc';
type RarityFilter = 'all' | 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Mythic';

function SongRow({ song }: { song: BandRpgCollectedSong }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors">
      <span className="text-base shrink-0">{song.guessedCorrectly ? '🎵' : '💿'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{song.songTitle}</p>
        <p className="text-xs text-gray-500">{formatDate(song.recoveredAt)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <RarityBadge rarity={song.rarity} />
        {song.guessedCorrectly && <span className="text-xs text-emerald-400 font-medium hidden sm:inline">Identified</span>}
        <span className="text-xs text-amber-400 font-mono">{song.scoreEarned} pts</span>
      </div>
    </div>
  );
}

function sortSongs(songs: BandRpgCollectedSong[], mode: SortMode): BandRpgCollectedSong[] {
  const copy = [...songs];
  if (mode === 'date_desc')  return copy.sort((a, b) => new Date(b.recoveredAt).getTime() - new Date(a.recoveredAt).getTime());
  if (mode === 'title_asc')  return copy.sort((a, b) => a.songTitle.localeCompare(b.songTitle));
  if (mode === 'rarity_asc') return copy.sort((a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0));
  if (mode === 'rarity_desc')return copy.sort((a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0));
  return copy;
}

// ── Album detail modal ────────────────────────────────────────────────────────

function AlbumDetailSongRow({ song }: { song: BandRpgAlbumSong }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/50 last:border-0 ${song.recovered ? '' : 'opacity-50'}`}>
      <span className="shrink-0 text-sm">{song.recovered ? '✅' : '○'}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${song.recovered ? 'text-white' : 'text-gray-500'}`}>{song.title}</p>
        {song.recovered && song.recoveredAt && (
          <p className="text-xs text-gray-600">{formatDate(song.recoveredAt)}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <RarityBadge rarity={song.rarity} />
        {song.recovered && song.guessedCorrectly && (
          <span className="text-xs text-emerald-400 hidden sm:inline">Identified</span>
        )}
      </div>
    </div>
  );
}

function AlbumDetailModal({
  albumId, onClose,
}: {
  albumId: string; onClose: () => void;
}) {
  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['band-rpg-album-detail', albumId],
    queryFn:  () => bandRpgApi.getAlbumDetail(albumId),
    staleTime: 60_000,
  });

  const stateConfig = detail ? (ALBUM_STATE_CONFIG[detail.state] ?? ALBUM_STATE_CONFIG.not_started) : null;
  const recovered = detail?.songs.filter((s) => s.recovered) ?? [];
  const missing   = detail?.songs.filter((s) => !s.recovered) ?? [];

  return (
    <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 rounded-full border-2 border-amber-500/60 border-t-amber-400 animate-spin" />
          </div>
        ) : isError || !detail ? (
          <div className="p-8 text-center text-red-400 text-sm">Failed to load album detail.</div>
        ) : (
          <>
            <div className="flex items-start gap-4 p-5 border-b border-gray-800">
              {detail.artworkUrl ? (
                <img src={detail.artworkUrl} alt={detail.albumTitle} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center text-2xl shrink-0">💿</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{detail.albumTitle}</p>
                <p className="text-gray-400 text-sm">{detail.bandName}{detail.year ? ` · ${detail.year}` : ''}</p>
                <div className="flex items-center gap-2 mt-1">
                  {stateConfig && (
                    <span className={`text-xs font-semibold ${stateConfig.className}`}>
                      {stateConfig.icon} {stateConfig.label}
                    </span>
                  )}
                  <span className="text-gray-600 text-xs">{detail.recoveredSongs} / {detail.totalSongs} songs</span>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none shrink-0 mt-0.5">✕</button>
            </div>

            {/* Progress bar */}
            <div className="px-5 py-3 border-b border-gray-800">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Archive Progress</span>
                <span>{detail.completionPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${detail.state === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${detail.completionPct}%` }}
                />
              </div>
              {detail.completedAt && (
                <p className="text-emerald-400 text-xs mt-1.5 font-semibold">
                  🏆 Restored {formatDate(detail.completedAt)}
                </p>
              )}
            </div>

            {/* Song list */}
            <div className="flex-1 overflow-y-auto">
              {recovered.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-gray-800/40 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                    Recovered · {recovered.length}
                  </div>
                  {recovered.map((s) => <AlbumDetailSongRow key={s.songId} song={s} />)}
                </>
              )}
              {missing.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-gray-800/40 text-xs text-gray-500 font-semibold uppercase tracking-wide border-t border-gray-800/50">
                    Missing · {missing.length}
                  </div>
                  {missing.map((s) => <AlbumDetailSongRow key={s.songId} song={s} />)}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Album card ────────────────────────────────────────────────────────────────

function AlbumCard({ album, onOpen }: { album: BandRpgAlbumProgress; onOpen: () => void }) {
  const cfg = ALBUM_STATE_CONFIG[album.state] ?? ALBUM_STATE_CONFIG.not_started;
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 px-4 py-3 w-full text-left border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors"
    >
      {album.artworkUrl ? (
        <img src={album.artworkUrl} alt={album.albumTitle} className="w-11 h-11 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-lg bg-gray-800 flex items-center justify-center text-lg shrink-0">💿</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm text-white font-medium truncate">{album.albumTitle}</p>
          {album.year && <span className="text-gray-600 text-xs shrink-0">{album.year}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${album.state === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${album.completionPct}%` }}
            />
          </div>
          <span className="text-gray-500 text-xs shrink-0">{album.recoveredSongs}/{album.totalSongs}</span>
        </div>
      </div>
      <span className={`text-xs font-semibold shrink-0 ${cfg.className}`}>{cfg.icon}</span>
    </button>
  );
}

// ── Songs tab ─────────────────────────────────────────────────────────────────

function SongsTab() {
  const [search,       setSearch]       = useState('');
  const [sort,         setSort]         = useState<SortMode>('date_desc');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');

  const { data: groups = [], isLoading, isError } = useQuery({
    queryKey: ['band-rpg-collection'],
    queryFn:  () => bandRpgApi.getCollection(),
    staleTime: 60_000,
  });

  const filteredGroups = useMemo(() => {
    return groups
      .map((g) => {
        let songs = g.collected;
        if (rarityFilter !== 'all') songs = songs.filter((s) => s.rarity === rarityFilter);
        if (search.trim()) {
          const q = search.toLowerCase();
          songs = songs.filter((s) => s.songTitle.toLowerCase().includes(q) || s.bandName.toLowerCase().includes(q));
        }
        songs = sortSongs(songs, sort);
        return { ...g, collected: songs };
      })
      .filter((g) => g.collected.length > 0);
  }, [groups, search, sort, rarityFilter]);

  if (isLoading) return <LoadingSpinner />;
  if (isError)   return <ErrorMsg msg="Failed to load songs." />;

  if (groups.length === 0) {
    return (
      <EmptyState
        icon="📂"
        title="No songs recovered yet"
        desc="Play Band RPG and complete quests to add songs to your collection."
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search songs or bands…"
          className="flex-1 min-w-40 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/60"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-amber-500/60">
          <option value="date_desc">Newest first</option>
          <option value="title_asc">Title A–Z</option>
          <option value="rarity_desc">Rarest first</option>
          <option value="rarity_asc">Common first</option>
        </select>
        <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-amber-500/60">
          <option value="all">All rarities</option>
          <option value="Common">⚪ Common</option>
          <option value="Uncommon">🟢 Uncommon</option>
          <option value="Rare">🔵 Rare</option>
          <option value="Legendary">🟣 Legendary</option>
          <option value="Mythic">🟠 Mythic</option>
        </select>
      </div>

      {filteredGroups.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-8">No results match your filters.</p>
      ) : (
        filteredGroups.map((group) => {
          const pct = group.totalSongsInBand > 0
            ? Math.round((group.collected.length / group.totalSongsInBand) * 100) : 0;
          return (
            <div key={group.bandId} className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
              <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold text-sm">{group.bandName}</span>
                  <span className="text-gray-500 text-xs">{group.collected.length} / {group.totalSongsInBand} songs</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div>{group.collected.map((song) => <SongRow key={song.id} song={song} />)}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Albums tab ────────────────────────────────────────────────────────────────

function AlbumsTab() {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  const { data: bandGroups = [], isLoading, isError } = useQuery({
    queryKey: ['band-rpg-albums'],
    queryFn:  () => bandRpgApi.getAlbums(),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError)   return <ErrorMsg msg="Failed to load albums." />;

  if (bandGroups.length === 0) {
    return (
      <EmptyState
        icon="🎵"
        title="No albums to show yet"
        desc="Recover songs from bands with albums to track your progress here."
      />
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {bandGroups.map((group) => (
          <div key={group.bandId} className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden">
            {/* Band header */}
            <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold text-sm">{group.bandName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-xs">
                    Albums: <span className={group.completedAlbums > 0 ? 'text-emerald-400' : 'text-gray-500'}>{group.completedAlbums}</span> / {group.totalAlbums}
                  </span>
                </div>
              </div>
            </div>

            {/* Album cards */}
            <div>
              {group.albums.map((album) => (
                <AlbumCard key={album.albumId} album={album} onOpen={() => setSelectedAlbumId(album.albumId)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedAlbumId && (
        <AlbumDetailModal albumId={selectedAlbumId} onClose={() => setSelectedAlbumId(null)} />
      )}
    </>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-amber-500/60 border-t-amber-400 animate-spin" />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-red-400 text-sm">{msg}</p>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
      <span className="text-4xl">{icon}</span>
      <p className="text-gray-300 font-semibold">{title}</p>
      <p className="text-gray-500 text-sm max-w-xs">{desc}</p>
      <Link to="/play/band-rpg" className="bg-amber-700 hover:bg-amber-600 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors">
        Play Band RPG
      </Link>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type CollectionTab = 'songs' | 'albums';

export default function BandRpgCollectionPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<CollectionTab>('songs');

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500/60 border-t-amber-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-gray-400 text-sm">Please log in to view your collection.</p>
          <Link to="/play/band-rpg" className="text-amber-400 text-sm hover:text-amber-300 transition-colors">← Back to Band RPG</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <SiteHeader theme="dark" active="games" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/40 border-b border-gray-800 shrink-0">
        <Link to="/play/band-rpg" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          ← Band RPG
        </Link>
        <span className="text-gray-700">·</span>
        <span className="text-white text-sm font-semibold">The Archive</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2.5 bg-black/20 border-b border-gray-800 shrink-0">
        {(['songs', 'albums'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === t
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'songs' ? '🎵 Songs' : '💿 Albums'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'songs'  && <SongsTab />}
        {activeTab === 'albums' && <AlbumsTab />}
      </div>
    </div>
  );
}

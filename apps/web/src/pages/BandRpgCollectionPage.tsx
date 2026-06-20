import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { bandRpgApi } from '../api/bandRpg';
import type {
  BandRpgCollectedSong, BandRpgAlbumProgress,
  BandRpgAlbumSong, AlbumState,
  BandRpgCollectionGroup, BandRpgSetlistSummary, BandRpgSetlistDetail,
  BandRpgConcertSummary, BandRpgConcertDetail, BandRpgSetlistSongEntry,
} from '../api/bandRpg';

// ── Rarity display ─────────────────────────────────────────────────────────────

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

// ── Setlist grade ──────────────────────────────────────────────────────────────

const GRADE_STYLE: Record<string, { color: string; bg: string; canvasColor: string }> = {
  S: { color: 'text-amber-400',   bg: 'bg-amber-900/30 border-amber-600/40',    canvasColor: '#f59e0b' },
  A: { color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-600/40', canvasColor: '#10b981' },
  B: { color: 'text-blue-400',    bg: 'bg-blue-900/30 border-blue-600/40',      canvasColor: '#60a5fa' },
  C: { color: 'text-yellow-400',  bg: 'bg-yellow-900/30 border-yellow-600/40',  canvasColor: '#eab308' },
  D: { color: 'text-gray-400',    bg: 'bg-gray-800/60 border-gray-700',         canvasColor: '#6b7280' },
};

// ── Venue fit display ──────────────────────────────────────────────────────────

const VENUE_FIT_STYLE: Record<string, { color: string; canvasColor: string }> = {
  'Legendary Fit': { color: 'text-amber-400',  canvasColor: '#f59e0b' },
  'Excellent Fit':  { color: 'text-blue-400',   canvasColor: '#60a5fa' },
  'Good Fit':       { color: 'text-yellow-400', canvasColor: '#eab308' },
  'Poor Fit':       { color: 'text-gray-500',   canvasColor: '#6b7280' },
};

// ── Setlist rarity values ─────────────────────────────────────────────────────

const SETLIST_RARITY_VALUE: Record<string, number> = {
  Common: 1, Uncommon: 2, Rare: 4, Legendary: 8, Mythic: 15,
};

type SetlistSong = { songId: string; songTitle: string; rarity: string };

const RARITY_BARS = [
  { key: 'Common',    barClass: 'bg-gray-500',    textClass: 'text-gray-400'    },
  { key: 'Uncommon',  barClass: 'bg-emerald-500', textClass: 'text-emerald-400' },
  { key: 'Rare',      barClass: 'bg-blue-500',    textClass: 'text-blue-400'    },
  { key: 'Legendary', barClass: 'bg-purple-500',  textClass: 'text-purple-400'  },
  { key: 'Mythic',    barClass: 'bg-orange-500',  textClass: 'text-orange-400'  },
] as const;

// ── Canvas card export ─────────────────────────────────────────────────────────

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function truncateForCanvas(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

const CARD_RARITY_DOT: Record<string, string> = {
  Common: '#9ca3af', Uncommon: '#34d399', Rare: '#60a5fa',
  Legendary: '#a78bfa', Mythic: '#fb923c',
};

function drawSetlistCard(canvas: HTMLCanvasElement, data: BandRpgSetlistDetail): void {
  const W = 800, H = 1020;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#09090f');
  bg.addColorStop(0.5, '#0e0c1a');
  bg.addColorStop(1, '#12101e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Top accent bar (amber gradient)
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, '#f59e0b');
  topBar.addColorStop(1, '#d97706');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 6);

  const PAD = 52;
  let y = 62;

  // "THE ARCHIVE" label
  ctx.fillStyle = '#374151';
  ctx.font = '600 11px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THE ARCHIVE', PAD, y);

  y += 38;

  // Grade circle (top-right)
  const gradeCfg = GRADE_STYLE[data.grade] ?? GRADE_STYLE['D']!;
  const gX = W - PAD - 44, gY = y + 22;
  ctx.beginPath();
  ctx.arc(gX, gY, 44, 0, Math.PI * 2);
  ctx.fillStyle = gradeCfg.canvasColor + '1a';
  ctx.fill();
  ctx.strokeStyle = gradeCfg.canvasColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = gradeCfg.canvasColor;
  ctx.font = 'bold 42px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.grade, gX, gY + 15);
  ctx.textAlign = 'left';

  // Band name
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 16px system-ui,sans-serif';
  ctx.fillText(data.bandName, PAD, y);

  y += 38;

  // Setlist name
  const nameSize = data.name.length > 28 ? 26 : data.name.length > 18 ? 30 : 36;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${nameSize}px system-ui,sans-serif`;
  ctx.fillText(truncateForCanvas(ctx, data.name, W - PAD * 2 - 120), PAD, y);

  y += 28;

  // Total score
  const total = data.rarityValue + data.diversityBonus;
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 14px system-ui,sans-serif';
  ctx.fillText(`⚡ ${total} pts`, PAD, y);
  if (data.diversityBonus > 0) {
    ctx.fillStyle = '#4b5563';
    ctx.font = '400 12px system-ui,sans-serif';
    ctx.fillText(`(${data.rarityValue} rarity + ${data.diversityBonus} diversity bonus)`, PAD + 88, y);
  }

  y += 22;

  // Stats
  ctx.fillStyle = '#6b7280';
  ctx.font = '400 14px system-ui,sans-serif';
  ctx.fillText(`🎵 ${data.songCount} songs   💿 ${data.albumCount} albums`, PAD, y);

  y += 30;

  // Divider
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  y += 24;

  // Song list (max 14)
  const displaySongs = data.songs.slice(0, 14);
  for (const [i, song] of displaySongs.entries()) {
    const sy = y + i * 35;
    ctx.fillStyle = '#374151';
    ctx.font = '400 11px system-ui,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(i + 1).padStart(2, '0'), PAD + 26, sy);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d1d5db';
    ctx.font = '400 15px system-ui,sans-serif';
    ctx.fillText(truncateForCanvas(ctx, song.songTitle, W - PAD * 2 - 56), PAD + 38, sy);
    const dotColor = CARD_RARITY_DOT[song.rarity] ?? '#9ca3af';
    ctx.beginPath();
    ctx.arc(W - PAD - 8, sy - 5, 5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();
  }

  y += displaySongs.length * 35;

  if (data.songs.length > 14) {
    ctx.fillStyle = '#4b5563';
    ctx.font = 'italic 13px system-ui,sans-serif';
    ctx.fillText(`+ ${data.songs.length - 14} more songs`, PAD, y + 14);
    y += 34;
  } else {
    y += 10;
  }

  // Divider
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  y += 24;

  // Rarity breakdown bars
  const maxCount = Math.max(1, ...RARITY_BARS.map((r) => data.rarityBreakdown[r.key] ?? 0));
  const barMaxW = W - PAD * 2 - 106;
  const RARITY_BAR_CANVAS = [
    { key: 'Common',    color: '#9ca3af' },
    { key: 'Uncommon',  color: '#34d399' },
    { key: 'Rare',      color: '#60a5fa' },
    { key: 'Legendary', color: '#a78bfa' },
    { key: 'Mythic',    color: '#fb923c' },
  ] as const;

  for (const [i, r] of RARITY_BAR_CANVAS.entries()) {
    const count = data.rarityBreakdown[r.key] ?? 0;
    const ry = y + i * 26;
    ctx.fillStyle = '#6b7280';
    ctx.font = '400 12px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(r.key, PAD, ry);
    const bx = PAD + 86, by = ry - 11;
    ctx.fillStyle = '#1f2937';
    rrect(ctx, bx, by, barMaxW, 9, 4);
    ctx.fill();
    if (count > 0) {
      ctx.fillStyle = r.color;
      rrect(ctx, bx, by, Math.max(9, (count / maxCount) * barMaxW), 9, 4);
      ctx.fill();
    }
    ctx.fillStyle = count > 0 ? '#d1d5db' : '#374151';
    ctx.textAlign = 'right';
    ctx.fillText(String(count), W - PAD, ry);
  }

  ctx.textAlign = 'left';

  // Footer
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 44);
  ctx.lineTo(W - PAD, H - 44);
  ctx.stroke();
  ctx.fillStyle = '#374151';
  ctx.font = '400 12px system-ui,sans-serif';
  ctx.fillText('Band Spectrum Mapper · The Archive', PAD, H - 22);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().getFullYear().toString(), W - PAD, H - 22);
}

// ── Setlist export modal ───────────────────────────────────────────────────────

function SetlistExportModal({ detail, onClose }: { detail: BandRpgSetlistDetail; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) drawSetlistCard(canvasRef.current, detail);
  }, [detail]);

  function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.bandName} - ${detail.name}.png`.replace(/[^a-z0-9.\-_ ]/gi, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h3 className="text-white font-semibold">Share Setlist</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl overflow-hidden bg-gray-950 border border-gray-800">
            <canvas ref={canvasRef} width={800} height={1020} className="w-full h-auto block" />
          </div>
          <p className="text-center text-xs text-gray-600 mt-3">
            Tap Export to save as PNG · Share anywhere
          </p>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleExport}
            className="flex-1 bg-amber-700 hover:bg-amber-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Export PNG
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Album state display ────────────────────────────────────────────────────────

const ALBUM_STATE_CONFIG: Record<AlbumState, { icon: string; label: string; className: string }> = {
  not_started: { icon: '⚫', label: 'Not Started', className: 'text-gray-500'   },
  in_progress: { icon: '🟡', label: 'In Progress', className: 'text-amber-400'  },
  completed:   { icon: '🟢', label: 'Completed',   className: 'text-emerald-400' },
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

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

// ── Songs tab ──────────────────────────────────────────────────────────────────

type SortMode    = 'date_desc' | 'title_asc' | 'rarity_asc' | 'rarity_desc';
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

const NOTABLE_RARITIES = new Set(['Legendary', 'Mythic']);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function NotableRecoveriesBanner({ groups }: { groups: Array<{ collected: BandRpgCollectedSong[] }> }) {
  const notable = useMemo(() => {
    const now = Date.now();
    return groups
      .flatMap((g) => g.collected)
      .filter((s) => NOTABLE_RARITIES.has(s.rarity) && now - new Date(s.recoveredAt).getTime() < SEVEN_DAYS_MS)
      .sort((a, b) => new Date(b.recoveredAt).getTime() - new Date(a.recoveredAt).getTime())
      .slice(0, 5);
  }, [groups]);

  if (notable.length === 0) return null;

  return (
    <div className="rounded-xl border border-orange-900/40 bg-orange-950/20 overflow-hidden">
      <div className="px-4 py-2 border-b border-orange-900/30">
        <p className="text-xs text-orange-400/80 font-semibold uppercase tracking-wide">Notable Recoveries · Last 7 Days</p>
      </div>
      <div className="divide-y divide-gray-800/40">
        {notable.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-2">
            <span className="text-base shrink-0">{s.rarity === 'Mythic' ? '🟠' : '🟣'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{s.songTitle}</p>
              <p className="text-xs text-gray-600">{s.bandName} · {formatDate(s.recoveredAt)}</p>
            </div>
            <RarityBadge rarity={s.rarity} />
          </div>
        ))}
      </div>
    </div>
  );
}

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
      <NotableRecoveriesBanner groups={groups} />
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

// ── Albums tab ─────────────────────────────────────────────────────────────────

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

function AlbumDetailModal({ albumId, onClose }: { albumId: string; onClose: () => void }) {
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
            <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold text-sm">{group.bandName}</span>
                <span className="text-gray-500 text-xs">
                  Albums: <span className={group.completedAlbums > 0 ? 'text-emerald-400' : 'text-gray-500'}>{group.completedAlbums}</span> / {group.totalAlbums}
                </span>
              </div>
            </div>
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

// ── Setlists tab ───────────────────────────────────────────────────────────────

function GradeBadge({ grade, size = 'sm' }: { grade: string; size?: 'sm' | 'lg' }) {
  const cfg = GRADE_STYLE[grade] ?? GRADE_STYLE['D']!;
  const cls = size === 'lg'
    ? `w-14 h-14 rounded-full border-2 flex items-center justify-center font-bold text-2xl ${cfg.bg} ${cfg.color}`
    : `w-9 h-9 rounded-full border flex items-center justify-center font-bold text-sm ${cfg.bg} ${cfg.color}`;
  return <div className={cls}>{grade}</div>;
}

function SetlistCard({ setlist, onClick }: { setlist: BandRpgSetlistSummary; onClick: () => void }) {
  const totalScore = setlist.rarityValue + setlist.diversityBonus;
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3 hover:bg-gray-800/60 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">{setlist.bandName}</p>
          <p className="text-white font-semibold truncate">{setlist.name}</p>
        </div>
        <GradeBadge grade={setlist.grade} />
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span>🎵 {setlist.songCount} {setlist.songCount === 1 ? 'song' : 'songs'}</span>
        <span className="text-amber-500/80">⚡ {totalScore} pts</span>
        <span className="text-gray-700">{formatDate(setlist.createdAt)}</span>
      </div>
    </button>
  );
}

function SetlistHallOfFame({ setlists }: { setlists: BandRpgSetlistSummary[] }) {
  if (setlists.length === 0) return null;

  const best = (fn: (a: BandRpgSetlistSummary, b: BandRpgSetlistSummary) => boolean) =>
    setlists.reduce((acc, sl) => (fn(sl, acc) ? sl : acc));

  const highestValue  = best((a, b) => (a.rarityValue + a.diversityBonus) > (b.rarityValue + b.diversityBonus));
  const mostDiverse   = best((a, b) => a.albumCount > b.albumCount);
  const largest       = best((a, b) => a.songCount > b.songCount);

  const items = [
    { label: 'Highest Value',  icon: '⚡', setlist: highestValue, value: `${highestValue.rarityValue + highestValue.diversityBonus} pts` },
    { label: 'Most Diverse',   icon: '💿', setlist: mostDiverse,  value: `${mostDiverse.albumCount} album${mostDiverse.albumCount !== 1 ? 's' : ''}`  },
    { label: 'Largest',        icon: '🎵', setlist: largest,      value: `${largest.songCount} song${largest.songCount !== 1 ? 's' : ''}`       },
  ];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="px-4 py-2 bg-gray-900 border-b border-gray-800">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Personal Records</p>
      </div>
      <div className="divide-y divide-gray-800/60">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-base shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600">{item.label}</p>
              <p className="text-sm text-white font-medium truncate">{item.setlist.name}</p>
            </div>
            <span className="text-xs text-amber-400/80 font-mono shrink-0">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateSetlistModal({
  collectionGroups,
  onClose,
  onCreated,
}: {
  collectionGroups: BandRpgCollectionGroup[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [bandId,        setBandId]        = useState('');
  const [bandName,      setBandName]      = useState('');
  const [name,          setName]          = useState('');
  const [selectedSongs, setSelectedSongs] = useState<SetlistSong[]>([]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await bandRpgApi.createSetlist({ bandId, bandName, name: name.trim() });
      if (selectedSongs.length > 0) {
        await bandRpgApi.updateSetlistSongs(res.id, selectedSongs.map((s) => ({ songId: s.songId })));
      }
      return res;
    },
    onSuccess: onCreated,
  });

  function handleBandChange(newBandId: string) {
    const group = collectionGroups.find((g) => g.bandId === newBandId);
    setBandId(newBandId);
    setBandName(group?.bandName ?? '');
    setSelectedSongs([]);
  }

  function addSong(s: SetlistSong) { setSelectedSongs((prev) => [...prev, s]); }
  function removeSong(songId: string) { setSelectedSongs((prev) => prev.filter((s) => s.songId !== songId)); }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setSelectedSongs((prev) => {
      const next = [...prev];
      const tmp = next[idx - 1]!; next[idx - 1] = next[idx]!; next[idx] = tmp;
      return next;
    });
  }

  function moveDown(idx: number) {
    setSelectedSongs((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      const tmp = next[idx + 1]!; next[idx + 1] = next[idx]!; next[idx] = tmp;
      return next;
    });
  }

  const selectedBandGroup = collectionGroups.find((g) => g.bandId === bandId);
  const availableSongs = selectedBandGroup?.collected
    .filter((s) => !selectedSongs.some((ss) => ss.songId === s.songId)) ?? [];

  const rarityValue = selectedSongs.reduce((sum, s) => sum + (SETLIST_RARITY_VALUE[s.rarity] ?? 1), 0);
  const canCreate = !!bandId && name.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">New Setlist</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Band</label>
            <select value={bandId} onChange={(e) => handleBandChange(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/60">
              <option value="">Choose a band…</option>
              {collectionGroups.map((g) => (
                <option key={g.bandId} value={g.bandId}>{g.bandName} ({g.collected.length} recovered)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Setlist Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dream Concert Set" maxLength={80}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/60" />
          </div>

          {selectedSongs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Setlist ({selectedSongs.length})</p>
                <span className="text-xs text-amber-500/80">⚡ {rarityValue} pts</span>
              </div>
              <div className="rounded-lg border border-gray-700 divide-y divide-gray-800">
                {selectedSongs.map((s, idx) => (
                  <div key={s.songId} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-gray-600 text-xs w-5 text-right shrink-0">{idx + 1}</span>
                    <p className="flex-1 text-sm text-white truncate">{s.songTitle}</p>
                    <RarityBadge rarity={s.rarity} />
                    <div className="flex items-center shrink-0">
                      <button onClick={() => moveUp(idx)} disabled={idx === 0}
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-30 px-1 py-0.5 text-sm">↑</button>
                      <button onClick={() => moveDown(idx)} disabled={idx === selectedSongs.length - 1}
                        className="text-gray-600 hover:text-gray-300 disabled:opacity-30 px-1 py-0.5 text-sm">↓</button>
                      <button onClick={() => removeSong(s.songId)}
                        className="text-red-700 hover:text-red-500 px-1 py-0.5 text-sm">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bandId && availableSongs.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Add Songs</p>
              <div className="rounded-lg border border-gray-700 divide-y divide-gray-800 max-h-52 overflow-y-auto">
                {availableSongs.map((s) => (
                  <button key={s.songId}
                    onClick={() => addSong({ songId: s.songId, songTitle: s.songTitle, rarity: s.rarity })}
                    className="flex items-center gap-2 px-3 py-2.5 w-full text-left hover:bg-gray-800/60 transition-colors">
                    <span className="text-emerald-500 text-sm shrink-0 font-bold">+</span>
                    <p className="flex-1 text-sm text-gray-300 truncate">{s.songTitle}</p>
                    <RarityBadge rarity={s.rarity} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {bandId && availableSongs.length === 0 && selectedSongs.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-4">No recovered songs for this band.</p>
          )}
          {bandId && availableSongs.length === 0 && selectedSongs.length > 0 && (
            <p className="text-center text-gray-600 text-xs py-2">All recovered songs are in the setlist.</p>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800">
          <button onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={() => void createMutation.mutate()} disabled={!canCreate}
            className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
            {createMutation.isPending ? 'Creating…' : 'Create Setlist'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetlistDetailModal({
  setlistId,
  collectionGroups,
  onClose,
  onDeleted,
  onSaved,
}: {
  setlistId: string;
  collectionGroups: BandRpgCollectionGroup[];
  onClose: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}) {
  const [editName,    setEditName]    = useState('');
  const [editSongs,   setEditSongs]   = useState<SetlistSong[]>([]);
  const [isDirty,     setIsDirty]     = useState(false);
  const [showExport,  setShowExport]  = useState(false);

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['band-rpg-setlist-detail', setlistId],
    queryFn:  () => bandRpgApi.getSetlistDetail(setlistId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (detail) {
      setEditName(detail.name);
      setEditSongs(detail.songs.map((s) => ({ songId: s.songId, songTitle: s.songTitle, rarity: s.rarity })));
      setIsDirty(false);
    }
  }, [detail]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const saves: Promise<unknown>[] = [];
      if (detail && editName.trim() !== detail.name) {
        saves.push(bandRpgApi.renameSetlist(setlistId, editName.trim()));
      }
      saves.push(bandRpgApi.updateSetlistSongs(setlistId, editSongs.map((s) => ({ songId: s.songId }))));
      await Promise.all(saves);
    },
    onSuccess: () => { setIsDirty(false); onSaved(); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => bandRpgApi.deleteSetlist(setlistId),
    onSuccess:  onDeleted,
  });

  function addSong(s: SetlistSong) { setEditSongs((prev) => [...prev, s]); setIsDirty(true); }
  function removeSong(songId: string) { setEditSongs((prev) => prev.filter((s) => s.songId !== songId)); setIsDirty(true); }

  function moveUp(idx: number) {
    if (idx === 0) return;
    setEditSongs((prev) => {
      const next = [...prev];
      const tmp = next[idx - 1]!; next[idx - 1] = next[idx]!; next[idx] = tmp;
      return next;
    });
    setIsDirty(true);
  }

  function moveDown(idx: number) {
    setEditSongs((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      const tmp = next[idx + 1]!; next[idx + 1] = next[idx]!; next[idx] = tmp;
      return next;
    });
    setIsDirty(true);
  }

  const availableSongs: SetlistSong[] = detail
    ? (collectionGroups
        .find((g) => g.bandId === detail.bandId)
        ?.collected
        .filter((s) => !editSongs.some((es) => es.songId === s.songId))
        .map((s) => ({ songId: s.songId, songTitle: s.songTitle, rarity: s.rarity }))
        ?? [])
    : [];

  const liveRarityValue = editSongs.reduce((sum, s) => sum + (SETLIST_RARITY_VALUE[s.rarity] ?? 1), 0);

  // Build a live rarity breakdown for the analysis panel
  const liveBreakdown: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0, Legendary: 0, Mythic: 0 };
  for (const s of editSongs) { liveBreakdown[s.rarity] = (liveBreakdown[s.rarity] ?? 0) + 1; }
  const maxRarityCount = Math.max(1, ...RARITY_BARS.map((r) => liveBreakdown[r.key] ?? 0));

  const gradeCfg = detail ? (GRADE_STYLE[detail.grade] ?? GRADE_STYLE['D']!) : GRADE_STYLE['D']!;

  return (
    <>
      <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
        <div
          className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 rounded-full border-2 border-amber-500/60 border-t-amber-400 animate-spin" />
            </div>
          ) : isError || !detail ? (
            <div className="p-8 text-center text-red-400 text-sm">Failed to load setlist.</div>
          ) : (
            <>
              {/* Editable header */}
              <div className="px-5 py-4 border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-3">
                  <input type="text" value={editName}
                    onChange={(e) => { setEditName(e.target.value); setIsDirty(true); }}
                    maxLength={80}
                    className="flex-1 bg-transparent text-white font-semibold text-lg focus:outline-none border-b border-transparent focus:border-amber-500/60 pb-0.5 transition-colors min-w-0" />
                  <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none shrink-0">✕</button>
                </div>
                <p className="text-gray-500 text-sm mt-0.5">{detail.bandName}</p>
              </div>

              {/* Analysis panel */}
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 shrink-0">
                <div className="flex items-center gap-3 mb-3">
                  <GradeBadge grade={detail.grade} size="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-0.5">Setlist Score</p>
                    <p className={`text-xl font-bold ${gradeCfg.color}`}>
                      {detail.rarityValue + detail.diversityBonus} pts
                    </p>
                    <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-gray-600">
                      <span>⚡ {detail.rarityValue} rarity</span>
                      {detail.diversityBonus > 0 && (
                        <span className="text-emerald-600">+ {detail.diversityBonus} diversity</span>
                      )}
                      <span>💿 {detail.albumCount} {detail.albumCount === 1 ? 'album' : 'albums'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowExport(true)}
                    className="shrink-0 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Share
                  </button>
                </div>

                {/* Rarity breakdown bars */}
                <div className="space-y-1.5">
                  {RARITY_BARS.map((r) => {
                    const count = liveBreakdown[r.key] ?? 0;
                    return (
                      <div key={r.key} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-16 shrink-0">{r.key}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${r.barClass} transition-all`}
                            style={{ width: `${count > 0 ? Math.max(5, (count / maxRarityCount) * 100) : 0}%` }}
                          />
                        </div>
                        <span className={`text-xs w-4 text-right shrink-0 ${count > 0 ? r.textClass : 'text-gray-800'}`}>
                          {count || ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Song list + add section */}
              <div className="flex-1 overflow-y-auto">
                {editSongs.length > 0 ? (
                  <>
                    <div className="px-4 py-2 bg-gray-800/40 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                      Setlist · {editSongs.length} {editSongs.length === 1 ? 'song' : 'songs'} · ⚡ {liveRarityValue} pts
                    </div>
                    {editSongs.map((s, idx) => (
                      <div key={s.songId} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800/50 last:border-0">
                        <span className="text-gray-600 text-xs w-5 text-right shrink-0">{idx + 1}</span>
                        <p className="flex-1 text-sm text-white truncate">{s.songTitle}</p>
                        <RarityBadge rarity={s.rarity} />
                        <div className="flex items-center shrink-0">
                          <button onClick={() => moveUp(idx)} disabled={idx === 0}
                            className="text-gray-600 hover:text-gray-300 disabled:opacity-30 p-1 text-sm">↑</button>
                          <button onClick={() => moveDown(idx)} disabled={idx === editSongs.length - 1}
                            className="text-gray-600 hover:text-gray-300 disabled:opacity-30 p-1 text-sm">↓</button>
                          <button onClick={() => removeSong(s.songId)}
                            className="text-red-700 hover:text-red-500 p-1 text-sm">✕</button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="px-4 py-8 text-center text-gray-600 text-sm">
                    No songs yet. Add songs from below.
                  </div>
                )}

                {availableSongs.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-gray-800/40 text-xs text-gray-500 font-semibold uppercase tracking-wide border-t border-gray-800/50">
                      Add Songs
                    </div>
                    {availableSongs.map((s) => (
                      <button key={s.songId} onClick={() => addSong(s)}
                        className="flex items-center gap-2 px-4 py-2.5 w-full text-left border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 transition-colors">
                        <span className="text-emerald-500 text-sm shrink-0 font-bold">+</span>
                        <p className="flex-1 text-sm text-gray-300 truncate">{s.songTitle}</p>
                        <RarityBadge rarity={s.rarity} />
                      </button>
                    ))}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
                <button
                  onClick={() => { if (window.confirm('Delete this setlist?')) void deleteMutation.mutate(); }}
                  disabled={deleteMutation.isPending}
                  className="text-red-700 hover:text-red-500 disabled:opacity-50 text-sm font-semibold transition-colors px-1"
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <div className="flex-1" />
                <button onClick={onClose}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                  Close
                </button>
                <button onClick={() => void saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}
                  className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showExport && detail && (
        <SetlistExportModal detail={detail} onClose={() => setShowExport(false)} />
      )}
    </>
  );
}

function SetlistsTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: setlists = [], isLoading, isError } = useQuery({
    queryKey: ['band-rpg-setlists'],
    queryFn:  () => bandRpgApi.getSetlists(),
    staleTime: 60_000,
  });

  const { data: collectionGroups = [] } = useQuery({
    queryKey: ['band-rpg-collection'],
    queryFn:  () => bandRpgApi.getCollection(),
    staleTime: 60_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['band-rpg-setlists'] });

  if (isLoading) return <LoadingSpinner />;
  if (isError)   return <ErrorMsg msg="Failed to load setlists." />;

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {setlists.length > 0
              ? `${setlists.length} setlist${setlists.length !== 1 ? 's' : ''}`
              : 'No setlists yet'}
          </p>
          {collectionGroups.length > 0 && (
            <button onClick={() => setShowCreate(true)}
              className="bg-amber-700 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              + New Setlist
            </button>
          )}
        </div>

        {setlists.length === 0 && collectionGroups.length === 0 ? (
          <EmptyState icon="🎸" title="No setlists yet"
            desc="Recover songs first, then build your dream setlist from your collection." />
        ) : setlists.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-10 text-center">
            <p className="text-gray-300 font-semibold mb-1">Build your first setlist</p>
            <p className="text-gray-600 text-sm">Arrange your recovered songs into the perfect concert order.</p>
          </div>
        ) : (
          <>
            <SetlistHallOfFame setlists={setlists} />
            <div className="space-y-2">
              {setlists.map((sl) => (
                <SetlistCard key={sl.id} setlist={sl} onClick={() => setSelectedId(sl.id)} />
              ))}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateSetlistModal
          collectionGroups={collectionGroups}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {selectedId && (
        <SetlistDetailModal
          setlistId={selectedId}
          collectionGroups={collectionGroups}
          onClose={() => setSelectedId(null)}
          onDeleted={() => { setSelectedId(null); refresh(); }}
          onSaved={refresh}
        />
      )}
    </>
  );
}

// ── Concert canvas card ────────────────────────────────────────────────────────

function drawConcertCard(canvas: HTMLCanvasElement, data: BandRpgConcertDetail): void {
  const W = 800, H = 1140;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#080b14');
  bg.addColorStop(0.5, '#0b0e1c');
  bg.addColorStop(1, '#0e1020');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Top accent bar (indigo gradient — distinct from amber setlist)
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, '#6366f1');
  topBar.addColorStop(1, '#4f46e5');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 6);

  const PAD = 52;
  let y = 62;

  // Header label
  ctx.fillStyle = '#374151';
  ctx.font = '600 11px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THE ARCHIVE — CONCERT', PAD, y);

  y += 38;

  // Grade circle (top-right)
  const gradeCfg = GRADE_STYLE[data.grade] ?? GRADE_STYLE['D']!;
  const gX = W - PAD - 44, gY = y + 22;
  ctx.beginPath();
  ctx.arc(gX, gY, 44, 0, Math.PI * 2);
  ctx.fillStyle = gradeCfg.canvasColor + '1a';
  ctx.fill();
  ctx.strokeStyle = gradeCfg.canvasColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = gradeCfg.canvasColor;
  ctx.font = 'bold 42px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.grade, gX, gY + 15);
  ctx.textAlign = 'left';

  // Band name
  ctx.fillStyle = '#9ca3af';
  ctx.font = '500 16px system-ui,sans-serif';
  ctx.fillText(data.bandName, PAD, y);

  y += 38;

  // Concert name
  const nameSize = data.concertName.length > 28 ? 26 : data.concertName.length > 18 ? 30 : 36;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${nameSize}px system-ui,sans-serif`;
  ctx.fillText(truncateForCanvas(ctx, data.concertName, W - PAD * 2 - 120), PAD, y);

  y += 28;

  // Score
  ctx.fillStyle = '#818cf8';
  ctx.font = 'bold 14px system-ui,sans-serif';
  ctx.fillText(`⚡ ${data.concertTotal} pts`, PAD, y);
  ctx.fillStyle = '#4b5563';
  ctx.font = '400 12px system-ui,sans-serif';
  ctx.fillText(
    `(${data.rarityValue} rarity + ${data.diversityBonus} diversity + ${data.flowScore} flow + ${data.openerScore} opener + ${data.closerScore} closer)`,
    PAD + 96, y,
  );

  y += 22;

  // Stats
  ctx.fillStyle = '#6b7280';
  ctx.font = '400 14px system-ui,sans-serif';
  ctx.fillText(`${data.songCount} songs  ·  ${data.albumCount} albums  ·  Flow ${data.flowScore}/20`, PAD, y);

  y += 22;

  // Venue line (if set)
  if (data.venueName && data.venueFitLabel) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '400 13px system-ui,sans-serif';
    const venuePrefix = `Venue: ${data.venueName}  ·  `;
    ctx.fillText(venuePrefix, PAD, y);
    const fitCfg = VENUE_FIT_STYLE[data.venueFitLabel] ?? VENUE_FIT_STYLE['Poor Fit']!;
    ctx.fillStyle = fitCfg.canvasColor;
    ctx.fillText(data.venueFitLabel, PAD + ctx.measureText(venuePrefix).width, y);
    y += 20;
  }

  // Personality label
  if (data.concertPersonality) {
    ctx.fillStyle = '#4f46e5';
    ctx.font = 'italic 600 13px system-ui,sans-serif';
    ctx.fillText(data.concertPersonality, PAD, y);
    y += 20;
  }

  y += 10;

  // Divider
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  // Main set section
  const drawSongBlock = (label: string, songs: BandRpgSetlistSongEntry[], startIndex: number): number => {
    ctx.fillStyle = '#374151';
    ctx.font = '700 11px system-ui,sans-serif';
    ctx.fillText(label.toUpperCase(), PAD, y);
    y += 20;

    const max = 10;
    const display = songs.slice(0, max);
    for (const [i, song] of display.entries()) {
      const sy = y + i * 32;
      ctx.fillStyle = '#374151';
      ctx.font = '400 11px system-ui,sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(startIndex + i + 1).padStart(2, '0'), PAD + 24, sy);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d1d5db';
      ctx.font = '400 14px system-ui,sans-serif';
      ctx.fillText(truncateForCanvas(ctx, song.songTitle, W - PAD * 2 - 52), PAD + 36, sy);
      const dot = CARD_RARITY_DOT[song.rarity] ?? '#9ca3af';
      ctx.beginPath();
      ctx.arc(W - PAD - 8, sy - 4, 5, 0, Math.PI * 2);
      ctx.fillStyle = dot;
      ctx.fill();
    }
    y += display.length * 32;
    if (songs.length > max) {
      ctx.fillStyle = '#4b5563';
      ctx.font = 'italic 12px system-ui,sans-serif';
      ctx.fillText(`+ ${songs.length - max} more`, PAD, y + 12);
      y += 28;
    }
    return y;
  };

  drawSongBlock('Main Set', data.mainSet, 0);

  if (data.encore.length > 0) {
    y += 10;
    ctx.strokeStyle = '#312e81';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
    y += 18;
    drawSongBlock('Encore', data.encore, data.mainSet.length);
  }

  y += 8;

  // Divider
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  // Opener / Closer labels
  if (data.openerLabel || data.closerLabel) {
    ctx.fillStyle = '#4b5563';
    ctx.font = '400 12px system-ui,sans-serif';
    if (data.openerLabel) ctx.fillText(`▶ ${data.openerLabel}`, PAD, y);
    if (data.closerLabel) ctx.fillText(`◼ ${data.closerLabel}`, PAD + 260, y);
    y += 24;
  }

  // Footer
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, H - 44); ctx.lineTo(W - PAD, H - 44); ctx.stroke();
  ctx.fillStyle = '#374151';
  ctx.font = '400 12px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Band Spectrum Mapper · The Archive', PAD, H - 22);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().getFullYear().toString(), W - PAD, H - 22);
}

// ── Concert export modal ───────────────────────────────────────────────────────

function ConcertExportModal({ detail, onClose }: { detail: BandRpgConcertDetail; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) drawConcertCard(canvasRef.current, detail);
  }, [detail]);

  function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.bandName} - ${detail.concertName}.png`.replace(/[^a-z0-9.\-_ ]/gi, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="fixed inset-0 bg-black/85 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h3 className="text-white font-semibold">Share Concert</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-xl overflow-hidden bg-gray-950 border border-gray-800">
            <canvas ref={canvasRef} width={800} height={1140} className="w-full h-auto block" />
          </div>
          <p className="text-center text-xs text-gray-600 mt-3">Tap Export to save as PNG · Share anywhere</p>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
          <button onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            Close
          </button>
          <button onClick={handleExport}
            className="flex-1 bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
            Export PNG
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Concert components ─────────────────────────────────────────────────────────

function ConcertGradeBadge({ grade, size = 'sm' }: { grade: string; size?: 'sm' | 'lg' }) {
  const cfg = GRADE_STYLE[grade] ?? GRADE_STYLE['D']!;
  const cls = size === 'lg'
    ? `w-14 h-14 rounded-full border-2 flex items-center justify-center font-bold text-2xl ${cfg.bg} ${cfg.color}`
    : `w-9 h-9 rounded-full border flex items-center justify-center font-bold text-sm ${cfg.bg} ${cfg.color}`;
  return <div className={cls}>{grade}</div>;
}

function ConcertCard({ concert, onClick }: { concert: BandRpgConcertSummary; onClick: () => void }) {
  const fitCfg = concert.venueFitLabel ? (VENUE_FIT_STYLE[concert.venueFitLabel] ?? VENUE_FIT_STYLE['Poor Fit']!) : null;
  return (
    <button onClick={onClick}
      className="w-full text-left bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-3 hover:bg-gray-800/60 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-0.5">{concert.bandName} · {concert.setlistName}</p>
          <p className="text-white font-semibold truncate">{concert.concertName}</p>
        </div>
        <ConcertGradeBadge grade={concert.grade} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
        <span>🎵 {concert.songCount} songs</span>
        <span className="text-indigo-400/80">⚡ {concert.concertTotal} pts</span>
        <span className="text-gray-600">Flow {concert.flowScore}/20</span>
        {concert.venueName && fitCfg && (
          <span>
            <span className="text-gray-700">📍 {concert.venueName} · </span>
            <span className={fitCfg.color}>{concert.venueFitLabel}</span>
          </span>
        )}
        {!concert.venueName && <span className="text-gray-700">No venue</span>}
        {concert.encorePosition !== null && <span className="text-purple-500/70">Encore ✓</span>}
      </div>
      {concert.concertPersonality && (
        <p className="text-xs text-indigo-400/50 mt-1.5 font-medium italic">{concert.concertPersonality}</p>
      )}
    </button>
  );
}

function ConcertHallOfFame({ concerts }: { concerts: BandRpgConcertSummary[] }) {
  if (concerts.length === 0) return null;
  const best = (fn: (a: BandRpgConcertSummary, b: BandRpgConcertSummary) => boolean) =>
    concerts.reduce((acc, c) => (fn(c, acc) ? c : acc));

  const bestGrade     = best((a, b) => a.concertTotal > b.concertTotal);
  const highestFlow   = best((a, b) => a.flowScore > b.flowScore);
  const mostDiverse   = best((a, b) => a.albumCount > b.albumCount);
  const bestOpener    = best((a, b) => a.openerScore > b.openerScore);
  const venueContests = concerts.filter((c) => c.venueFit !== null);
  const bestVenueFit  = venueContests.length > 0
    ? best((a, b) => (a.venueFit ?? -1) > (b.venueFit ?? -1))
    : null;

  const items = [
    { label: 'Best Concert',    icon: '🎤', concert: bestGrade,   value: `${bestGrade.concertTotal} pts`         },
    { label: 'Highest Flow',    icon: '〜', concert: highestFlow,  value: `Flow ${highestFlow.flowScore}/20`      },
    { label: 'Most Diverse',    icon: '💿', concert: mostDiverse,  value: `${mostDiverse.albumCount} albums`     },
    { label: 'Best Opener',     icon: '▶',  concert: bestOpener,   value: `Opener ${bestOpener.openerScore}/10`  },
    ...(bestVenueFit ? [{ label: 'Best Venue Fit', icon: '📍', concert: bestVenueFit, value: `${bestVenueFit.venueFit ?? 0}/100` }] : []),
  ];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="px-4 py-2 bg-gray-900 border-b border-gray-800">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Concert Records</p>
      </div>
      <div className="divide-y divide-gray-800/60">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-base shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600">{item.label}</p>
              <p className="text-sm text-white font-medium truncate">{item.concert.concertName}</p>
            </div>
            <span className="text-xs text-indigo-400/80 font-mono shrink-0">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateConcertModal({
  setlists,
  onClose,
  onCreated,
}: {
  setlists: BandRpgSetlistSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [setlistId,   setSetlistId]   = useState('');
  const [concertName, setConcertName] = useState('');
  const [venueId,     setVenueId]     = useState('');

  const { data: venues = [] } = useQuery({
    queryKey: ['band-rpg-venues'],
    queryFn:  () => bandRpgApi.getVenues(),
    staleTime: Infinity,
  });

  const selectedVenue = venues.find((v) => v.id === venueId) ?? null;

  const createMutation = useMutation({
    mutationFn: () => bandRpgApi.createConcert({
      setlistId, concertName: concertName.trim(),
      ...(venueId ? { venueId } : {}),
    }),
    onSuccess: onCreated,
  });

  const canCreate = !!setlistId && concertName.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-white font-semibold">New Concert</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Based on Setlist</label>
            <select value={setlistId} onChange={(e) => setSetlistId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60">
              <option value="">Choose a setlist…</option>
              {setlists.map((sl) => (
                <option key={sl.id} value={sl.id}>
                  {sl.bandName} — {sl.name} ({sl.songCount} songs · Grade {sl.grade})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Concert Name</label>
            <input type="text" value={concertName} onChange={(e) => setConcertName(e.target.value)}
              placeholder="e.g. The Observatory Session" maxLength={80}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/60" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Venue (optional)</label>
            <select value={venueId} onChange={(e) => setVenueId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/60">
              <option value="">No venue assigned</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name} (cap. {v.capacity.toLocaleString()})</option>
              ))}
            </select>
            {selectedVenue && (
              <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">{selectedVenue.description}</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800">
          <button onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={() => void createMutation.mutate()} disabled={!canCreate}
            className="flex-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
            {createMutation.isPending ? 'Creating…' : 'Create Concert'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConcertDetailModal({
  concertId,
  onClose,
  onDeleted,
  onSaved,
}: {
  concertId: string;
  onClose: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [editName,    setEditName]    = useState('');
  const [isDirty,     setIsDirty]     = useState(false);
  const [showExport,  setShowExport]  = useState(false);

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['band-rpg-concert-detail', concertId],
    queryFn:  () => bandRpgApi.getConcertDetail(concertId),
    staleTime: 30_000,
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['band-rpg-venues'],
    queryFn:  () => bandRpgApi.getVenues(),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (detail) { setEditName(detail.concertName); setIsDirty(false); }
  }, [detail]);

  const saveMutation = useMutation({
    mutationFn: () => bandRpgApi.updateConcert(concertId, { concertName: editName.trim() }),
    onSuccess: () => {
      setIsDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-concert-detail', concertId] });
      onSaved();
    },
  });

  const venueMutation = useMutation({
    mutationFn: (venueId: string | null) => bandRpgApi.updateConcert(concertId, { venueId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-concert-detail', concertId] });
      onSaved();
    },
  });

  const encoreMutation = useMutation({
    mutationFn: (pos: number | null) => bandRpgApi.updateConcert(concertId, { encorePosition: pos }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-concert-detail', concertId] });
      onSaved();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => bandRpgApi.deleteConcert(concertId),
    onSuccess: onDeleted,
  });

  const gradeCfg = detail ? (GRADE_STYLE[detail.grade] ?? GRADE_STYLE['D']!) : GRADE_STYLE['D']!;

  const fmtAxis = (v: number | null) => v !== null ? v.toFixed(1) : '—';

  return (
    <>
      <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
        <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500/60 border-t-indigo-400 animate-spin" />
            </div>
          ) : isError || !detail ? (
            <div className="p-8 text-center text-red-400 text-sm">Failed to load concert.</div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-3">
                  <input type="text" value={editName}
                    onChange={(e) => { setEditName(e.target.value); setIsDirty(true); }}
                    maxLength={80}
                    className="flex-1 bg-transparent text-white font-semibold text-lg focus:outline-none border-b border-transparent focus:border-indigo-500/60 pb-0.5 transition-colors min-w-0" />
                  <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none shrink-0">✕</button>
                </div>
                <p className="text-gray-500 text-sm mt-0.5">{detail.bandName} · {detail.setlistName}</p>
              </div>

              {/* Analysis panel */}
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 shrink-0">
                <div className="flex items-center gap-3 mb-3">
                  <ConcertGradeBadge grade={detail.grade} size="lg" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 mb-0.5">Concert Score</p>
                    <p className={`text-xl font-bold ${gradeCfg.color}`}>{detail.concertTotal} pts</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-600">
                      <span>⚡ {detail.rarityValue} rarity</span>
                      {detail.diversityBonus > 0 && <span className="text-emerald-700">+{detail.diversityBonus} diversity</span>}
                      <span className="text-indigo-600">〜 {detail.flowScore}/20 flow</span>
                      <span>▶ {detail.openerScore}/10 opener</span>
                      <span>◼ {detail.closerScore}/10 closer</span>
                    </div>
                  </div>
                  <button onClick={() => setShowExport(true)}
                    className="shrink-0 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
                    Share
                  </button>
                </div>

                {/* Opener / Closer */}
                <div className="flex gap-3 text-xs mb-2">
                  <div className="flex-1 bg-gray-800/60 rounded-lg px-3 py-2">
                    <p className="text-gray-600 mb-0.5">▶ Opener</p>
                    <p className="text-gray-300 font-medium">{detail.openerLabel || '—'}</p>
                    {detail.mainSet[0] && (
                      <p className="text-gray-600 truncate mt-0.5">{detail.mainSet[0].songTitle}</p>
                    )}
                  </div>
                  <div className="flex-1 bg-gray-800/60 rounded-lg px-3 py-2">
                    <p className="text-gray-600 mb-0.5">◼ Closer</p>
                    <p className="text-gray-300 font-medium">{detail.closerLabel || '—'}</p>
                    {detail.songs[detail.songs.length - 1] && (
                      <p className="text-gray-600 truncate mt-0.5">{detail.songs[detail.songs.length - 1]!.songTitle}</p>
                    )}
                  </div>
                </div>

                {/* Venue selector + fit */}
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-xs text-gray-600 font-semibold uppercase tracking-wide">Venue</p>
                    {detail.venueFitLabel && (() => {
                      const cfg = VENUE_FIT_STYLE[detail.venueFitLabel] ?? VENUE_FIT_STYLE['Poor Fit']!;
                      return (
                        <span className={`text-xs font-semibold ${cfg.color}`}>
                          {detail.venueFit}/100 · {detail.venueFitLabel}
                        </span>
                      );
                    })()}
                    {detail.venueContribution > 0 && (
                      <span className="text-xs text-indigo-500/80 ml-auto">+{detail.venueContribution} pts</span>
                    )}
                  </div>
                  <select
                    value={detail.venueId ?? ''}
                    onChange={(e) => void venueMutation.mutate(e.target.value || null)}
                    disabled={venueMutation.isPending}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500/60 disabled:opacity-60"
                  >
                    <option value="">No venue assigned</option>
                    {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  {detail.venueDescription && (
                    <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">{detail.venueDescription}</p>
                  )}
                  {detail.venueAffinities && (
                    <div className="grid grid-cols-3 gap-1 mt-2">
                      {(Object.entries(detail.venueAffinities) as [string, number][]).map(([axis, val]) => (
                        <div key={axis} className="bg-gray-800/50 rounded px-2 py-1 text-center">
                          <p className="text-gray-600 text-[10px] capitalize">{axis}</p>
                          <div className="flex gap-0.5 justify-center mt-0.5">
                            {Array.from({ length: 5 }, (_, i) => (
                              <div key={i} className={`w-2 h-2 rounded-sm ${i < val ? 'bg-indigo-500' : 'bg-gray-700'}`} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Spectrum averages (only if data exists) */}
                {detail.avgAggression !== null && (
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {([
                      ['Aggression', detail.avgAggression],
                      ['Atmosphere', detail.avgAtmosphere],
                      ['Emotion',    detail.avgEmotion],
                      ['Complexity', detail.avgComplexity],
                      ['Psychedelic',detail.avgPsychedelic],
                      ['Concept',    detail.avgConcept],
                    ] as [string, number | null][]).map(([label, val]) => (
                      <div key={label} className="bg-gray-800/40 rounded px-2 py-1.5 text-center">
                        <p className="text-gray-600 text-[10px]">{label}</p>
                        <p className="text-gray-300 font-mono">{fmtAxis(val)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Concert Intelligence panel */}
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-950/40 space-y-3">
                {/* Personality */}
                <div>
                  <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide mb-1">Concert Personality</p>
                  <p className="text-indigo-400 font-semibold italic text-sm">{detail.concertPersonality}</p>
                  {detail.setlistStory && (
                    <p className="text-gray-500 text-xs leading-relaxed mt-1.5">{detail.setlistStory}</p>
                  )}
                </div>

                {/* Score bars */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-gray-600 w-20 shrink-0">Fan Service</p>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-600/70 rounded-full transition-all" style={{ width: `${detail.fanServiceScore}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 w-8 text-right font-mono">{detail.fanServiceScore}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-gray-600 w-20 shrink-0">Deep Cuts</p>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-600/70 rounded-full transition-all" style={{ width: `${detail.deepCutScore}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 w-8 text-right font-mono">{detail.deepCutScore}</p>
                  </div>
                </div>

                {/* Legends */}
                {(detail.legendTrack || detail.deepCutSong || detail.mostFamiliar) && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {detail.legendTrack && (
                      <div className="bg-gray-800/50 rounded-lg px-2 py-2">
                        <p className="text-[9px] text-orange-500/80 font-semibold uppercase tracking-wide mb-0.5">Legend</p>
                        <p className="text-[11px] text-white leading-tight line-clamp-2">{detail.legendTrack.songTitle}</p>
                        <p className="text-[9px] text-orange-500/60 mt-0.5">{detail.legendTrack.rarity}</p>
                      </div>
                    )}
                    {detail.deepCutSong && (
                      <div className="bg-gray-800/50 rounded-lg px-2 py-2">
                        <p className="text-[9px] text-purple-400/80 font-semibold uppercase tracking-wide mb-0.5">Deep Cut</p>
                        <p className="text-[11px] text-white leading-tight line-clamp-2">{detail.deepCutSong.songTitle}</p>
                        <p className="text-[9px] text-purple-400/60 mt-0.5">{detail.deepCutSong.rarity}</p>
                      </div>
                    )}
                    {detail.mostFamiliar && (
                      <div className="bg-gray-800/50 rounded-lg px-2 py-2">
                        <p className="text-[9px] text-emerald-400/80 font-semibold uppercase tracking-wide mb-0.5">Familiar</p>
                        <p className="text-[11px] text-white leading-tight line-clamp-2">{detail.mostFamiliar.songTitle}</p>
                        <p className="text-[9px] text-emerald-400/60 mt-0.5">{detail.mostFamiliar.rarity}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Song list with encore marker */}
              <div className="flex-1 overflow-y-auto">
                {detail.songs.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-600 text-sm">No songs in this setlist.</div>
                ) : (
                  <>
                    {detail.encorePosition !== null && detail.mainSet.length > 0 && (
                      <div className="px-4 py-1.5 bg-gray-800/40 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                        Main Set · {detail.mainSet.length} songs
                      </div>
                    )}

                    {detail.songs.map((song, idx) => {
                      const isEncoreStart = detail.encorePosition !== null && idx === detail.encorePosition;
                      const isInEncore    = detail.encorePosition !== null && idx >= detail.encorePosition;
                      return (
                        <div key={song.id}>
                          {isEncoreStart && (
                            <div className="px-4 py-1.5 bg-indigo-950/40 text-xs text-indigo-400 font-semibold uppercase tracking-wide border-t border-indigo-900/40">
                              Encore · {detail.encore.length} songs
                            </div>
                          )}
                          <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-gray-800/50 last:border-0 ${isInEncore ? 'bg-indigo-950/10' : ''}`}>
                            <span className="text-gray-600 text-xs w-5 text-right shrink-0">{idx + 1}</span>
                            <p className="flex-1 text-sm text-white truncate">{song.songTitle}</p>
                            <RarityBadge rarity={song.rarity} />
                            <button
                              onClick={() => void encoreMutation.mutate(idx === detail.encorePosition ? null : idx)}
                              title={idx === detail.encorePosition ? 'Remove encore' : 'Encore starts here'}
                              className={`shrink-0 text-xs px-1.5 py-0.5 rounded transition-colors ${
                                idx === detail.encorePosition
                                  ? 'text-indigo-400 bg-indigo-900/40 hover:bg-indigo-900/70'
                                  : 'text-gray-700 hover:text-indigo-400 hover:bg-indigo-900/20'
                              }`}
                            >
                              {idx === detail.encorePosition ? '★' : '☆'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
                <button
                  onClick={() => { if (window.confirm('Delete this concert?')) void deleteMutation.mutate(); }}
                  disabled={deleteMutation.isPending}
                  className="text-red-700 hover:text-red-500 disabled:opacity-50 text-sm font-semibold transition-colors px-1">
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <div className="flex-1" />
                <button onClick={onClose}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                  Close
                </button>
                <button onClick={() => void saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}
                  className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showExport && detail && (
        <ConcertExportModal detail={detail} onClose={() => setShowExport(false)} />
      )}
    </>
  );
}

function ConcertsTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: concerts = [], isLoading, isError } = useQuery({
    queryKey: ['band-rpg-concerts'],
    queryFn:  () => bandRpgApi.getConcerts(),
    staleTime: 60_000,
  });

  const { data: setlists = [] } = useQuery({
    queryKey: ['band-rpg-setlists'],
    queryFn:  () => bandRpgApi.getSetlists(),
    staleTime: 60_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['band-rpg-concerts'] });

  if (isLoading) return <LoadingSpinner />;
  if (isError)   return <ErrorMsg msg="Failed to load concerts." />;

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {concerts.length > 0
              ? `${concerts.length} concert${concerts.length !== 1 ? 's' : ''}`
              : 'No concerts yet'}
          </p>
          {setlists.length > 0 && (
            <button onClick={() => setShowCreate(true)}
              className="bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              + New Concert
            </button>
          )}
        </div>

        {concerts.length === 0 && setlists.length === 0 ? (
          <EmptyState icon="🎤" title="No concerts yet"
            desc="Build a setlist first, then turn it into a concert with flow analysis and an encore." />
        ) : concerts.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-10 text-center">
            <p className="text-gray-300 font-semibold mb-1">Stage your first concert</p>
            <p className="text-gray-600 text-sm">Turn one of your setlists into a concert to unlock flow analysis, opener/closer grades, and the encore marker.</p>
          </div>
        ) : (
          <>
            <ConcertHallOfFame concerts={concerts} />
            <div className="space-y-2">
              {concerts.map((c) => (
                <ConcertCard key={c.id} concert={c} onClick={() => setSelectedId(c.id)} />
              ))}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateConcertModal
          setlists={setlists}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {selectedId && (
        <ConcertDetailModal
          concertId={selectedId}
          onClose={() => setSelectedId(null)}
          onDeleted={() => { setSelectedId(null); refresh(); }}
          onSaved={refresh}
        />
      )}
    </>
  );
}

// ── Lifetime archive points ────────────────────────────────────────────────────

function LifetimePoints() {
  const { data: stats } = useQuery({
    queryKey: ['band-rpg-stats'],
    queryFn:  () => bandRpgApi.getStats(),
    staleTime: 120_000,
  });
  if (!stats || stats.totalScore === 0) return null;
  return (
    <div className="flex items-center gap-1.5 ml-auto">
      <span className="text-gray-600 text-xs">⚡</span>
      <span className="text-amber-400/80 font-mono text-xs font-semibold">
        {stats.totalScore.toLocaleString()}
      </span>
      <span className="text-gray-600 text-xs hidden sm:inline">lifetime pts</span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type CollectionTab = 'songs' | 'albums' | 'setlists' | 'concerts';

const TABS: { id: CollectionTab; label: string }[] = [
  { id: 'songs',    label: '🎵 Songs'    },
  { id: 'albums',   label: '💿 Albums'   },
  { id: 'setlists', label: '🎸 Setlists' },
  { id: 'concerts', label: '🎤 Concerts' },
];

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

      {/* Header with lifetime points */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/40 border-b border-gray-800 shrink-0">
        <Link to="/play/band-rpg" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          ← Band RPG
        </Link>
        <span className="text-gray-700">·</span>
        <span className="text-white text-sm font-semibold">The Archive</span>
        <LifetimePoints />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2.5 bg-black/20 border-b border-gray-800 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === t.id
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'songs'    && <SongsTab />}
        {activeTab === 'albums'   && <AlbumsTab />}
        {activeTab === 'setlists' && <SetlistsTab />}
        {activeTab === 'concerts' && <ConcertsTab />}
      </div>
    </div>
  );
}

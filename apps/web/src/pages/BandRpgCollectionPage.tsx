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
  BandRpgFestivalSummary, BandRpgFestivalDetail,
  FestivalAchievement, FestivalPrestige,
  BandRpgTourSummary, BandRpgTourDetail, TourAchievement,
  BandRpgChallenge, BandRpgChallengeStats, BandRpgChallengeHistoryEntry,
  ChallengeAttemptResult,
  BandRpgCuratorProfile, CuratorBadge,
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

const ROLE_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  'Opening Act':  { color: 'text-sky-400',    bg: 'bg-sky-900/30',    label: 'Opener'    },
  'Support Act':  { color: 'text-gray-400',   bg: 'bg-gray-800/50',   label: 'Support'   },
  'Featured Act': { color: 'text-indigo-400', bg: 'bg-indigo-900/30', label: 'Featured'  },
  'Co-Headliner': { color: 'text-violet-400', bg: 'bg-violet-900/30', label: 'Co-Head'   },
  'Headliner':    { color: 'text-amber-400',  bg: 'bg-amber-900/30',  label: 'Headliner' },
};

function assignLineupRoleClient(position: number, total: number): string {
  if (total <= 1) return 'Headliner';
  if (position === 0) return 'Opening Act';
  if (position === total - 1) return 'Headliner';
  if (total >= 4 && position === total - 2) return 'Co-Headliner';
  if (position === 1) return 'Support Act';
  return 'Featured Act';
}

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_STYLE[role] ?? ROLE_STYLE['Support Act']!;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.color} ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
      <span className="text-4xl">{icon}</span>
      <p className="text-gray-300 font-semibold">{title}</p>
      <p className="text-gray-500 text-sm max-w-xs">{desc}</p>
      {action ?? (
        <Link to="/play/band-rpg" className="bg-amber-700 hover:bg-amber-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
          Play Band RPG
        </Link>
      )}
    </div>
  );
}

// ── Songs tab ──────────────────────────────────────────────────────────────────

type SortMode    = 'date_desc' | 'title_asc' | 'rarity_asc' | 'rarity_desc';
type RarityFilter = 'all' | 'Common' | 'Uncommon' | 'Rare' | 'Legendary' | 'Mythic';

const LIVE_STATUS_STYLE: Record<string, { label: string; className: string }> = {
  'Never Played':    { label: 'Never Played',    className: 'text-cyan-300 bg-cyan-900/40 border border-cyan-800/50' },
  'Extremely Rare':  { label: 'Extremely Rare',  className: 'text-violet-300 bg-violet-900/40 border border-violet-800/50' },
  'Rare':            { label: 'Rare Live',        className: 'text-indigo-300 bg-indigo-900/40 border border-indigo-800/50' },
  'Occasional':      { label: 'Occasional',       className: 'text-blue-300/80 bg-blue-900/30 border border-blue-800/40' },
  'Common':          { label: 'Common',           className: 'text-gray-400 bg-gray-800/50 border border-gray-700/40' },
  'Staple':          { label: 'Staple',           className: 'text-gray-500 bg-gray-800/40 border border-gray-700/30' },
};

function LiveStatusBadge({ liveStatus }: { liveStatus: string }) {
  const cfg = LIVE_STATUS_STYLE[liveStatus];
  if (!cfg) return null;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function SongRow({ song }: { song: BandRpgCollectedSong }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors">
      <span className="text-base shrink-0">{song.guessedCorrectly ? '🎵' : '💿'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{song.songTitle}</p>
        <p className="text-xs text-gray-500">{formatDate(song.recoveredAt)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {song.liveData && song.liveData.liveStatus !== 'Unknown' && (
          <LiveStatusBadge liveStatus={song.liveData.liveStatus} />
        )}
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
        <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
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

              {/* Scrollable body: analysis + intelligence + setlist */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Analysis panel */}
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50">
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

                {/* Concert Realism (Phase V) */}
                {detail.realismScore !== null && detail.realismLabel !== null && (
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-gray-600 w-20 shrink-0">Realism</p>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-600/70 rounded-full transition-all" style={{ width: `${detail.realismScore}%` }} />
                    </div>
                    <p className="text-[10px] text-sky-400 font-semibold w-20 text-right">{detail.realismLabel}</p>
                  </div>
                )}

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
              <div>
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
              </div>{/* end scrollable body */}

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
                  className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                  Close
                </button>
                <button onClick={() => void saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}
                  className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
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
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-10 text-center space-y-3">
            <p className="text-gray-300 font-semibold">Stage your first concert</p>
            <p className="text-gray-600 text-sm">Turn one of your setlists into a concert to unlock flow analysis, opener/closer grades, and the encore marker.</p>
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center bg-indigo-700 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              + New Concert
            </button>
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

// ── Festival canvas card ───────────────────────────────────────────────────────

function drawFestivalCard(canvas: HTMLCanvasElement, data: BandRpgFestivalDetail): void {
  const W = 800, H = 1100;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c0816');
  bg.addColorStop(0.5, '#10091a');
  bg.addColorStop(1, '#130b1e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Violet top bar — distinct from amber (setlist) and indigo (concert)
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, '#7c3aed');
  topBar.addColorStop(1, '#6d28d9');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 6);

  const PAD = 52;
  let y = 62;

  ctx.fillStyle = '#374151';
  ctx.font = '600 11px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THE ARCHIVE — FESTIVAL', PAD, y);

  y += 38;

  // Stat badges (top-right)
  const statStr = `${data.concertCount} concerts  ·  ${data.bandCount} bands  ·  ${data.totalSongs} songs`;
  ctx.fillStyle = '#4b5563';
  ctx.font = '400 12px system-ui,sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(statStr, W - PAD, y);
  ctx.textAlign = 'left';

  // Festival name
  const nameSize = data.name.length > 30 ? 24 : data.name.length > 20 ? 28 : 34;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${nameSize}px system-ui,sans-serif`;
  ctx.fillText(truncateForCanvas(ctx, data.name, W - PAD * 2), PAD, y);

  y += 28;

  // Personality label
  ctx.fillStyle = '#7c3aed';
  ctx.font = 'italic 600 15px system-ui,sans-serif';
  ctx.fillText(data.festivalPersonality, PAD, y);

  y += 24;

  // Story (word-wrapped)
  if (data.festivalStory) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '400 13px system-ui,sans-serif';
    const maxW = W - PAD * 2;
    const words = data.festivalStory.split(' ');
    let line = '';
    const storyLines: string[] = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW) { storyLines.push(line); line = word; }
      else line = test;
    }
    if (line) storyLines.push(line);
    for (const [i, l] of storyLines.slice(0, 3).entries()) {
      ctx.fillText(l, PAD, y + i * 18);
    }
    y += Math.min(storyLines.length, 3) * 18 + 6;
  }

  // Headliner line
  if (data.lineupAnalysis.headlinerName) {
    ctx.fillStyle = '#92400e';
    ctx.font = '400 12px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`★ ${truncateForCanvas(ctx, data.lineupAnalysis.headlinerName, W - PAD * 2 - 80)}  ·  Flow ${data.lineupAnalysis.flowRating}`, PAD, y);
    y += 20;
  }

  y += 6;

  // Chemistry Score badge
  const chem = data.chemistry;
  const chemColor = chem.chemistryScore >= 88 ? '#fbbf24' : chem.chemistryScore >= 75 ? '#34d399' : chem.chemistryScore >= 60 ? '#a78bfa' : chem.chemistryScore >= 45 ? '#60a5fa' : '#6b7280';
  ctx.fillStyle = '#111827';
  rrect(ctx, PAD, y - 14, W - PAD * 2, 38, 6);
  ctx.fill();
  ctx.fillStyle = chemColor;
  ctx.font = 'bold 22px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(String(chem.chemistryScore), PAD + 10, y + 10);
  ctx.fillStyle = '#6b7280';
  ctx.font = '600 11px system-ui,sans-serif';
  ctx.fillText('CHEMISTRY', PAD + 44, y - 1);
  ctx.fillStyle = '#7c3aed';
  ctx.font = 'italic 12px system-ui,sans-serif';
  ctx.fillText(chem.chemistryLabel, PAD + 44, y + 13);
  y += 36;

  // Divider
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  // Score bars
  const barMaxW = W - PAD * 2 - 140;
  const bars = [
    { label: 'Fan Service', value: data.avgFanService, color: '#059669' },
    { label: 'Deep Cuts',   value: data.avgDeepCuts,   color: '#7c3aed' },
    ...(data.avgVenueFit !== null ? [{ label: 'Venue Fit', value: data.avgVenueFit, color: '#6366f1' }] : []),
  ];
  for (const [i, bar] of bars.entries()) {
    const by = y + i * 26;
    ctx.fillStyle = '#6b7280';
    ctx.font = '400 12px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(bar.label, PAD, by);
    const bx = PAD + 110, bby = by - 11;
    ctx.fillStyle = '#1f2937';
    rrect(ctx, bx, bby, barMaxW, 9, 4);
    ctx.fill();
    if (bar.value > 0) {
      ctx.fillStyle = bar.color;
      rrect(ctx, bx, bby, Math.max(9, (bar.value / 100) * barMaxW), 9, 4);
      ctx.fill();
    }
    ctx.fillStyle = '#d1d5db';
    ctx.textAlign = 'right';
    ctx.fillText(String(bar.value), W - PAD, by);
  }
  y += bars.length * 26 + 6;
  ctx.textAlign = 'left';

  // Audience archetypes line
  const primary   = data.audience.primaryArchetype;
  const secondary = data.audience.secondaryArchetype;
  ctx.fillStyle = '#4338ca';
  ctx.font = '400 12px system-ui,sans-serif';
  ctx.fillText(
    `${primary.icon} ${truncateForCanvas(ctx, primary.name, W - PAD * 2 - 160)}${secondary ? `  ·  ${secondary.icon} ${secondary.name}` : ''}`,
    PAD, y,
  );
  y += 16;
  ctx.fillStyle = '#374151';
  ctx.font = '400 11px system-ui,sans-serif';
  ctx.fillText(`${data.audience.audienceDiversityLabel} · ${data.audience.audienceDiversityScore}% diverse`, PAD, y);
  y += 20;

  // Divider
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  // Lineup header
  ctx.fillStyle = '#374151';
  ctx.font = '700 11px system-ui,sans-serif';
  ctx.fillText('LINEUP', PAD, y);
  y += 20;

  const displayConcerts = data.concerts.slice(0, 12);
  for (const [i, c] of displayConcerts.entries()) {
    const cy = y + i * 34;
    ctx.fillStyle = '#374151';
    ctx.font = '400 12px system-ui,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(i + 1).padStart(2, '0'), PAD + 22, cy);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d1d5db';
    ctx.font = '500 14px system-ui,sans-serif';
    ctx.fillText(truncateForCanvas(ctx, c.concertName, W - PAD * 2 - 180), PAD + 32, cy);
    ctx.fillStyle = '#4b5563';
    ctx.font = '400 11px system-ui,sans-serif';
    ctx.fillText(c.bandName, PAD + 32, cy + 14);
    const gradeCfg = GRADE_STYLE[c.grade] ?? GRADE_STYLE['D']!;
    ctx.fillStyle = gradeCfg.canvasColor;
    ctx.font = 'bold 12px system-ui,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(c.grade, W - PAD, cy);
    ctx.textAlign = 'left';
  }

  if (data.concerts.length > 12) {
    y += displayConcerts.length * 34 + 6;
    ctx.fillStyle = '#4b5563';
    ctx.font = 'italic 12px system-ui,sans-serif';
    ctx.fillText(`+ ${data.concerts.length - 12} more`, PAD, y);
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

// ── Dream Festival export card (gold canvas) ──────────────────────────────────

function drawDreamFestivalCard(canvas: HTMLCanvasElement, data: BandRpgFestivalDetail): void {
  const W = 900, H = 1400;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep gold/black background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,   '#0d0a00');
  bg.addColorStop(0.4, '#110c00');
  bg.addColorStop(1,   '#0a0800');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Gold top bar
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0,   '#f59e0b');
  topBar.addColorStop(0.5, '#fbbf24');
  topBar.addColorStop(1,   '#d97706');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 8);

  // Outer gold border
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  // Inner border
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  const PAD = 60;
  let y = 78;

  // Dream badge
  ctx.fillStyle = '#92400e';
  rrect(ctx, PAD, y - 16, 130, 22, 4);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 11px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★ DREAM FESTIVAL', PAD + 65, y - 1);
  ctx.textAlign = 'left';
  y += 16;

  // Festival name
  const nameSize = data.name.length > 28 ? 26 : data.name.length > 18 ? 32 : 40;
  ctx.fillStyle = '#fbbf24';
  ctx.font = `bold ${nameSize}px system-ui,sans-serif`;
  ctx.fillText(truncateForCanvas(ctx, data.name, W - PAD * 2), PAD, y);
  y += 10;

  // Personality
  ctx.fillStyle = '#d97706';
  ctx.font = 'italic 600 16px system-ui,sans-serif';
  y += 22;
  ctx.fillText(data.festivalPersonality, PAD, y);
  y += 10;

  // Prestige tier + score
  const tier  = data.prestige.prestigeTier;
  const score = data.prestige.prestigeScore;
  const tierColor = score >= 90 ? '#fbbf24' : score >= 75 ? '#f59e0b' : score >= 60 ? '#d97706' : '#92400e';
  ctx.fillStyle = '#1a1200';
  rrect(ctx, PAD, y, W - PAD * 2, 52, 8);
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 0.5;
  rrect(ctx, PAD, y, W - PAD * 2, 52, 8);
  ctx.stroke();
  ctx.fillStyle = tierColor;
  ctx.font = 'bold 30px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(String(score), PAD + 14, y + 34);
  ctx.fillStyle = '#92400e';
  ctx.font = '600 11px system-ui,sans-serif';
  ctx.fillText('PRESTIGE', PAD + 58, y + 18);
  ctx.fillStyle = tierColor;
  ctx.font = 'italic 13px system-ui,sans-serif';
  ctx.fillText(tier, PAD + 58, y + 36);
  y += 64;

  // Legacy report (word-wrapped)
  if (data.prestige.legacyReport) {
    ctx.fillStyle = '#b45309';
    ctx.font = '400 13px system-ui,sans-serif';
    const maxW = W - PAD * 2;
    const words = data.prestige.legacyReport.split(' ');
    let line = '';
    const legacyLines: string[] = [];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW) { legacyLines.push(line); line = word; }
      else line = test;
    }
    if (line) legacyLines.push(line);
    for (const [i, l] of legacyLines.slice(0, 4).entries()) ctx.fillText(l, PAD, y + i * 19);
    y += Math.min(legacyLines.length, 4) * 19 + 10;
  }

  // Gold divider
  const goldLine = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  goldLine.addColorStop(0,   'rgba(146,64,14,0)');
  goldLine.addColorStop(0.5, '#92400e');
  goldLine.addColorStop(1,   'rgba(146,64,14,0)');
  ctx.strokeStyle = goldLine;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  // Achievements — unlocked ones
  const unlocked = data.prestige.achievements.filter((a) => a.unlocked);
  if (unlocked.length > 0) {
    ctx.fillStyle = '#78350f';
    ctx.font = '700 10px system-ui,sans-serif';
    ctx.fillText(`ACHIEVEMENTS  (${unlocked.length}/${data.prestige.achievements.length})`, PAD, y);
    y += 16;
    const cols = 4;
    const cellW = Math.floor((W - PAD * 2) / cols);
    unlocked.slice(0, 8).forEach((ach, i) => {
      const cx = PAD + (i % cols) * cellW;
      const cy = y + Math.floor(i / cols) * 48;
      ctx.fillStyle = '#1a1200';
      rrect(ctx, cx + 2, cy, cellW - 8, 42, 6);
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 0.5;
      rrect(ctx, cx + 2, cy, cellW - 8, 42, 6);
      ctx.stroke();
      ctx.font = '20px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(ach.icon, cx + cellW / 2, cy + 22);
      ctx.font = '500 9px system-ui,sans-serif';
      ctx.fillStyle = '#92400e';
      ctx.fillText(truncateForCanvas(ctx, ach.name, cellW - 12), cx + cellW / 2, cy + 37);
    });
    y += (Math.ceil(Math.min(unlocked.length, 8) / cols)) * 48 + 10;
    ctx.textAlign = 'left';
  }

  // Gold divider
  ctx.strokeStyle = goldLine;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  // Score bars
  const barMaxW = W - PAD * 2 - 160;
  const bars = [
    { label: 'Chemistry',    value: data.chemistry.chemistryScore,  color: '#fbbf24' },
    { label: 'Fan Service',  value: data.avgFanService,             color: '#d97706' },
    { label: 'Deep Cuts',    value: data.avgDeepCuts,               color: '#92400e' },
    ...(data.avgVenueFit !== null ? [{ label: 'Venue Fit', value: data.avgVenueFit, color: '#78350f' }] : []),
  ];
  for (const [i, bar] of bars.entries()) {
    const by = y + i * 28;
    ctx.fillStyle = '#78350f';
    ctx.font = '400 12px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(bar.label, PAD, by);
    const bx = PAD + 120, bby = by - 12;
    ctx.fillStyle = '#1a1200';
    rrect(ctx, bx, bby, barMaxW, 10, 4);
    ctx.fill();
    if (bar.value > 0) {
      const barGrad = ctx.createLinearGradient(bx, 0, bx + barMaxW, 0);
      barGrad.addColorStop(0, bar.color);
      barGrad.addColorStop(1, '#fbbf24');
      ctx.fillStyle = barGrad;
      rrect(ctx, bx, bby, Math.max(10, (bar.value / 100) * barMaxW), 10, 4);
      ctx.fill();
    }
    ctx.fillStyle = '#d97706';
    ctx.textAlign = 'right';
    ctx.fillText(String(bar.value), W - PAD, by);
  }
  y += bars.length * 28 + 14;
  ctx.textAlign = 'left';

  // Audience
  const primary = data.audience.primaryArchetype;
  ctx.fillStyle = '#d97706';
  ctx.font = '400 13px system-ui,sans-serif';
  ctx.fillText(`${primary.icon} ${primary.name}  ·  ${data.audience.audienceDiversityLabel}`, PAD, y);
  y += 20;

  // Gold divider
  ctx.strokeStyle = goldLine;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 20;

  // Lineup
  ctx.fillStyle = '#78350f';
  ctx.font = '700 11px system-ui,sans-serif';
  ctx.fillText('LINEUP', PAD, y);
  y += 20;

  const displayConcerts = data.concerts.slice(0, 10);
  for (const [i, c] of displayConcerts.entries()) {
    const cy = y + i * 36;
    ctx.fillStyle = '#78350f';
    ctx.font = '400 12px system-ui,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(i + 1).padStart(2, '0'), PAD + 22, cy);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    ctx.font = '500 15px system-ui,sans-serif';
    ctx.fillText(truncateForCanvas(ctx, c.concertName, W - PAD * 2 - 190), PAD + 32, cy);
    ctx.fillStyle = '#92400e';
    ctx.font = '400 11px system-ui,sans-serif';
    ctx.fillText(c.bandName, PAD + 32, cy + 15);
    const gradeCfg = GRADE_STYLE[c.grade] ?? GRADE_STYLE['D']!;
    ctx.fillStyle = gradeCfg.canvasColor;
    ctx.font = 'bold 12px system-ui,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(c.grade, W - PAD, cy);
    ctx.textAlign = 'left';
  }

  if (data.concerts.length > 10) {
    y += displayConcerts.length * 36 + 6;
    ctx.fillStyle = '#78350f';
    ctx.font = 'italic 12px system-ui,sans-serif';
    ctx.fillText(`+ ${data.concerts.length - 10} more`, PAD, y);
  }

  // Footer
  ctx.strokeStyle = goldLine;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, H - 50); ctx.lineTo(W - PAD, H - 50); ctx.stroke();
  ctx.fillStyle = '#92400e';
  ctx.font = '400 12px system-ui,sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Band Spectrum Mapper · Dream Festival Archive', PAD, H - 26);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().getFullYear().toString(), W - PAD, H - 26);
}

// ── Festival export modal ──────────────────────────────────────────────────────

function FestivalExportModal({ detail, dream, onClose }: { detail: BandRpgFestivalDetail; dream?: boolean; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDreamCard = dream ?? detail.isDream;

  useEffect(() => {
    if (!canvasRef.current) return;
    if (isDreamCard) drawDreamFestivalCard(canvasRef.current, detail);
    else             drawFestivalCard(canvasRef.current, detail);
  }, [detail, isDreamCard]);

  function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${isDreamCard ? 'dream-festival' : 'festival'}-${detail.name}.png`.replace(/[^a-z0-9.\-_ ]/gi, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="fixed inset-0 bg-black/85 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={onClose}>
      <div className={`border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${
        isDreamCard ? 'bg-amber-950/95 border-amber-800/60' : 'bg-gray-900 border-gray-700'
      }`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${isDreamCard ? 'border-amber-800/40' : 'border-gray-800'}`}>
          <h3 className={`font-semibold ${isDreamCard ? 'text-amber-300' : 'text-white'}`}>
            {isDreamCard ? '★ Dream Festival Card' : 'Share Festival'}
          </h3>
          <button onClick={onClose} className={`text-xl leading-none ${isDreamCard ? 'text-amber-700 hover:text-amber-500' : 'text-gray-600 hover:text-gray-400'}`}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className={`rounded-xl overflow-hidden border ${isDreamCard ? 'bg-black border-amber-900/60' : 'bg-gray-950 border-gray-800'}`}>
            <canvas ref={canvasRef} width={isDreamCard ? 900 : 800} height={isDreamCard ? 1400 : 1100} className="w-full h-auto block" />
          </div>
          <p className={`text-center text-xs mt-3 ${isDreamCard ? 'text-amber-800' : 'text-gray-600'}`}>
            {isDreamCard ? 'Gold Dream Festival card · Export PNG' : 'Tap Export to save as PNG · Share anywhere'}
          </p>
        </div>
        <div className={`flex gap-3 px-5 py-4 border-t shrink-0 ${isDreamCard ? 'border-amber-800/40' : 'border-gray-800'}`}>
          <button onClick={onClose}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${isDreamCard ? 'bg-amber-900/60 hover:bg-amber-900 text-amber-300' : 'bg-gray-800 hover:bg-gray-700 text-white'}`}>
            Close
          </button>
          <button onClick={handleExport}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${isDreamCard ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-violet-700 hover:bg-violet-600 text-white'}`}>
            Export PNG
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Festival components ────────────────────────────────────────────────────────

function chemistryScoreColor(score: number) {
  if (score >= 88) return 'text-yellow-400';
  if (score >= 75) return 'text-emerald-400';
  if (score >= 60) return 'text-violet-400';
  if (score >= 45) return 'text-blue-400';
  return 'text-gray-500';
}

// ── Prestige + Dream components ───────────────────────────────────────────────

function PrestigeSection({ prestige }: { prestige: FestivalPrestige }) {
  const tierColor = prestigeTierColorRaw(prestige.prestigeTier);
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2.5 border border-gray-700/50 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Festival Prestige</p>
        <span className={`text-lg font-bold font-mono ${tierColor}`}>{prestige.prestigeScore}</span>
      </div>
      {/* Tier badge */}
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-semibold ${
        prestige.prestigeScore >= 90 ? 'bg-yellow-900/30 border-yellow-800/40 text-yellow-400' :
        prestige.prestigeScore >= 75 ? 'bg-amber-900/30 border-amber-800/40 text-amber-400'   :
        prestige.prestigeScore >= 60 ? 'bg-orange-900/30 border-orange-800/40 text-orange-400':
        prestige.prestigeScore >= 40 ? 'bg-violet-900/30 border-violet-800/40 text-violet-400':
        prestige.prestigeScore >= 20 ? 'bg-blue-900/30 border-blue-800/40 text-blue-400'      :
                                       'bg-gray-800/60 border-gray-700/40 text-gray-500'
      }`}>
        {prestige.prestigeTier}
      </div>
      {/* Prestige bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              prestige.prestigeScore >= 90 ? 'bg-yellow-400' :
              prestige.prestigeScore >= 75 ? 'bg-amber-400'  :
              prestige.prestigeScore >= 60 ? 'bg-orange-400' :
              prestige.prestigeScore >= 40 ? 'bg-violet-500' :
              prestige.prestigeScore >= 20 ? 'bg-blue-500'   : 'bg-gray-500'
            }`}
            style={{ width: `${prestige.prestigeScore}%` }} />
        </div>
        <span className="text-[10px] text-gray-500 font-mono w-6 text-right">{prestige.prestigeScore}</span>
      </div>
      {/* Legacy report */}
      <p className="text-xs text-gray-400/80 leading-relaxed italic">{prestige.legacyReport}</p>
      {/* Achievements grid */}
      <div className="pt-1 border-t border-gray-700/30">
        <p className="text-[10px] text-gray-600 mb-1.5">
          Achievements · {prestige.achievements.filter((a) => a.unlocked).length}/{prestige.achievements.length}
        </p>
        <div className="grid grid-cols-5 gap-1">
          {prestige.achievements.map((ach: FestivalAchievement) => (
            <div key={ach.key}
              title={`${ach.name}: ${ach.description}`}
              className={`flex flex-col items-center justify-center rounded-lg p-1.5 border transition-all ${
                ach.unlocked
                  ? 'bg-amber-900/30 border-amber-800/40'
                  : 'bg-gray-800/40 border-gray-700/20 opacity-40'
              }`}>
              <span className="text-base leading-none">{ach.icon}</span>
              <span className={`text-[8px] mt-1 text-center leading-tight font-medium ${ach.unlocked ? 'text-amber-400/80' : 'text-gray-600'}`}>
                {ach.name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DreamFestivalToggle({
  isDream,
  isPending,
  onToggle,
}: { isDream: boolean; isPending: boolean; onToggle: (val: boolean) => void }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 border ${isDream ? 'bg-amber-950/40 border-amber-800/50' : 'bg-gray-800/40 border-gray-700/40'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold ${isDream ? 'text-amber-300' : 'text-gray-400'}`}>
            {isDream ? '★ Dream Festival' : 'Dream Festival'}
          </p>
          <p className="text-[10px] text-gray-600 leading-relaxed mt-0.5">
            {isDream
              ? 'This is your Dream Festival. Only one may be active at a time.'
              : 'Designate this as your Dream Festival — the ultimate lineup.'}
          </p>
        </div>
        <button
          onClick={() => onToggle(!isDream)}
          disabled={isPending}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
            isDream
              ? 'bg-amber-800/60 hover:bg-amber-700/60 text-amber-300 border border-amber-700/40'
              : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}>
          {isPending ? '…' : isDream ? 'Unset Dream' : 'Set as Dream'}
        </button>
      </div>
    </div>
  );
}

function prestigeTierColorRaw(tier: string) {
  if (tier === 'Mythic Festival')      return 'text-yellow-400';
  if (tier === 'World Class Festival') return 'text-amber-400';
  if (tier === 'Legendary Event')      return 'text-orange-400';
  if (tier === 'Cult Festival')        return 'text-violet-400';
  if (tier === 'Regional Event')       return 'text-blue-400';
  return 'text-gray-500';
}

function prestigeTierColor(tier: string) { return prestigeTierColorRaw(tier); }

function FestivalCard({ festival, onClick }: { festival: BandRpgFestivalSummary; onClick: () => void }) {
  const chem   = festival.chemistry;
  const isDream = festival.isDream;
  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-xl px-4 py-3 transition-colors ${
        isDream
          ? 'bg-amber-950/40 border border-amber-800/60 hover:bg-amber-950/60 ring-1 ring-amber-700/30'
          : 'bg-gray-900/60 border border-gray-800 hover:bg-gray-800/60'
      } active:scale-[0.99]`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {isDream && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-800/40 border border-amber-700/40 text-amber-400 font-bold shrink-0">
                ★ DREAM
              </span>
            )}
            <p className={`font-semibold truncate ${isDream ? 'text-amber-100' : 'text-white'}`}>{festival.name}</p>
          </div>
          <p className={`text-xs font-medium italic ${isDream ? 'text-amber-500/70' : 'text-violet-400/60'}`}>{festival.festivalPersonality}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0 mt-0.5">
          <span className={`text-lg font-bold font-mono ${chemistryScoreColor(chem.chemistryScore)}`}>{chem.chemistryScore}</span>
          <span className="text-[10px] text-gray-600">{festival.concertCount} concerts</span>
        </div>
      </div>

      {/* Prestige tier */}
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-[10px] font-semibold ${prestigeTierColor(festival.prestige.prestigeTier)}`}>
          {festival.prestige.prestigeScore} · {festival.prestige.prestigeTier}
        </span>
      </div>

      {festival.lineupAnalysis.headlinerName && (
        <p className={`text-xs mt-1 truncate ${isDream ? 'text-amber-500/60' : 'text-amber-400/50'}`}>★ {festival.lineupAnalysis.headlinerName}</p>
      )}
      {/* Audience archetypes */}
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
          isDream ? 'bg-amber-900/30 border-amber-800/30 text-amber-400/80' : 'bg-indigo-900/40 border-indigo-800/30 text-indigo-300/80'
        }`}>
          {festival.audience.primaryArchetype.icon} {festival.audience.primaryArchetype.name}
        </span>
        {festival.audience.secondaryArchetype && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 border border-gray-700/30 text-gray-400">
            {festival.audience.secondaryArchetype.icon} {festival.audience.secondaryArchetype.name}
          </span>
        )}
        <span className="text-[10px] text-gray-600 ml-auto">{festival.audience.audienceDiversityLabel}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
        <span>🎤 {festival.bandCount} band{festival.bandCount !== 1 ? 's' : ''}</span>
        <span>🎵 {festival.totalSongs} songs</span>
        <span className="text-sky-500/80">Flow {festival.lineupAnalysis.flowRating}</span>
        <span className="text-emerald-600">Fan {festival.avgFanService}</span>
        {festival.avgVenueFit !== null && <span className="text-indigo-500/80">Venue {festival.avgVenueFit}/100</span>}
      </div>
    </button>
  );
}

function FestivalRecords({ festivals }: { festivals: BandRpgFestivalSummary[] }) {
  if (festivals.length === 0) return null;
  const best = (fn: (a: BandRpgFestivalSummary, b: BandRpgFestivalSummary) => boolean) =>
    festivals.reduce((acc, f) => (fn(f, acc) ? f : acc));

  const largest    = best((a, b) => a.totalSongs > b.totalSongs);
  const mostBands  = best((a, b) => a.bandCount > b.bandCount);
  const deepest    = best((a, b) => a.avgDeepCuts > b.avgDeepCuts);
  const fanFav     = best((a, b) => a.avgFanService > b.avgFanService);
  const topChem    = best((a, b) => a.chemistry.chemistryScore > b.chemistry.chemistryScore);
  const bestFlow   = best((a, b) => a.chemistry.festivalFlow > b.chemistry.festivalFlow);
  const mostCohes  = best((a, b) => (a.chemistry.audienceOverlap ?? 0) > (b.chemistry.audienceOverlap ?? 0));
  const venueOnes  = festivals.filter((f) => f.avgVenueFit !== null);
  const bestVenue  = venueOnes.length > 0 ? best((a, b) => (a.avgVenueFit ?? -1) > (b.avgVenueFit ?? -1)) : null;
  const bestHL     = best((a, b) => a.lineupAnalysis.headlinerScore > b.lineupAnalysis.headlinerScore);
  const bestOp     = best((a, b) => a.lineupAnalysis.openerScore    > b.lineupAnalysis.openerScore);
  const bestFlowR  = best((a, b) => a.lineupAnalysis.flowRating      > b.lineupAnalysis.flowRating);

  // Audience archetype records
  const mostDiverse   = best((a, b) => a.audience.audienceDiversityScore > b.audience.audienceDiversityScore);
  const mostProg      = best((a, b) => {
    const sa = a.audience.archetypes.find((x) => x.key === 'progressive_pilgrims')?.score ?? 0;
    const sb = b.audience.archetypes.find((x) => x.key === 'progressive_pilgrims')?.score ?? 0;
    return sa > sb;
  });
  const mostUndergrd  = best((a, b) => {
    const sa = (a.audience.archetypes.find((x) => x.key === 'deep_cut_hunters')?.score ?? 0) +
               (a.audience.archetypes.find((x) => x.key === 'collector_class')?.score ?? 0);
    const sb = (b.audience.archetypes.find((x) => x.key === 'deep_cut_hunters')?.score ?? 0) +
               (b.audience.archetypes.find((x) => x.key === 'collector_class')?.score ?? 0);
    return sa > sb;
  });
  const mostAccessible = best((a, b) => {
    const sa = a.audience.archetypes.find((x) => x.key === 'festival_casuals')?.score ?? 0;
    const sb = b.audience.archetypes.find((x) => x.key === 'festival_casuals')?.score ?? 0;
    return sa > sb;
  });
  const mostPsych = best((a, b) => {
    const sa = a.audience.archetypes.find((x) => x.key === 'psychedelic_travelers')?.score ?? 0;
    const sb = b.audience.archetypes.find((x) => x.key === 'psychedelic_travelers')?.score ?? 0;
    return sa > sb;
  });

  const highestPrestige = best((a, b) => a.prestige.prestigeScore > b.prestige.prestigeScore);
  const mostAchievements = best((a, b) =>
    a.prestige.achievements.filter((x) => x.unlocked).length > b.prestige.achievements.filter((x) => x.unlocked).length
  );

  const items = [
    { label: 'Highest Prestige',    icon: '🌟', festival: highestPrestige,  value: `${highestPrestige.prestige.prestigeScore} · ${highestPrestige.prestige.prestigeTier}` },
    { label: 'Most Legendary',      icon: '🏆', festival: mostAchievements, value: `${mostAchievements.prestige.achievements.filter((x) => x.unlocked).length}/10 achievements` },
    { label: 'Best Headliner', icon: '★',  festival: bestHL,    value: `${bestHL.lineupAnalysis.headlinerScore} · ${bestHL.lineupAnalysis.headlinerName}`.slice(0, 30)  },
    { label: 'Best Opener',    icon: '🔥', festival: bestOp,    value: `${bestOp.lineupAnalysis.openerScore} · ${bestOp.lineupAnalysis.openerName}`.slice(0, 30)         },
    { label: 'Best Flow',      icon: '🌊', festival: bestFlowR, value: `Flow ${bestFlowR.lineupAnalysis.flowRating}`                                                     },
    { label: 'Best Chemistry',      icon: '⚗️', festival: topChem,   value: `${topChem.chemistry.chemistryScore} · ${topChem.chemistry.chemistryLabel}` },
    { label: 'Chem Flow',           icon: '🌊', festival: bestFlow,  value: `Flow ${bestFlow.chemistry.festivalFlow}`                                   },
    { label: 'Most Cohesive',       icon: '🧲', festival: mostCohes, value: mostCohes.chemistry.audienceOverlap !== null ? `Overlap ${mostCohes.chemistry.audienceOverlap}` : 'No data' },
    { label: 'Largest Festival',    icon: '🎪', festival: largest,   value: `${largest.totalSongs} songs`                                              },
    { label: 'Most Bands',          icon: '🎤', festival: mostBands, value: `${mostBands.bandCount} bands`                                             },
    { label: 'Deepest Cuts',        icon: '🎭', festival: deepest,   value: `Deep Cuts ${deepest.avgDeepCuts}`                                         },
    { label: 'Fan Favourite',       icon: '⭐', festival: fanFav,    value: `Fan Service ${fanFav.avgFanService}`                                       },
    ...(bestVenue ? [{ label: 'Best Venue Fit', icon: '📍', festival: bestVenue, value: `${bestVenue.avgVenueFit ?? 0}/100` }] : []),
    // Audience archetype records
    { label: 'Most Diverse Audience',   icon: '🎨', festival: mostDiverse,    value: `${mostDiverse.audience.audienceDiversityScore}% · ${mostDiverse.audience.audienceDiversityLabel}` },
    { label: 'Most Progressive',        icon: '🎭', festival: mostProg,       value: mostProg.audience.primaryArchetype.name },
    { label: 'Most Underground',        icon: '🔍', festival: mostUndergrd,   value: mostUndergrd.audience.primaryArchetype.name },
    { label: 'Most Accessible',         icon: '🎪', festival: mostAccessible, value: mostAccessible.audience.primaryArchetype.name },
    { label: 'Most Psychedelic',        icon: '🌀', festival: mostPsych,      value: mostPsych.audience.primaryArchetype.name },
  ];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="px-4 py-2 bg-gray-900 border-b border-gray-800">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Festival Records</p>
      </div>
      <div className="divide-y divide-gray-800/60">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-base shrink-0">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-600">{item.label}</p>
              <p className="text-sm text-white font-medium truncate">{item.festival.name}</p>
            </div>
            <span className="text-xs text-violet-400/80 font-mono shrink-0">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateFestivalModal({
  concerts,
  onClose,
  onCreated,
}: {
  concerts: BandRpgConcertSummary[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleConcert = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const createMutation = useMutation({
    mutationFn: () => bandRpgApi.createFestival({
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(selectedIds.length > 0 ? { concertIds: selectedIds } : {}),
    }),
    onSuccess: onCreated,
  });

  const canCreate = name.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-white font-semibold">New Festival</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Festival Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Dream Convergence" maxLength={80}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/60" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes this festival special…" maxLength={300} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/60 resize-none" />
          </div>

          {concerts.length > 0 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">Add Concerts (optional)</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {concerts.map((c) => (
                  <label key={c.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.includes(c.id)
                        ? 'border-violet-600/60 bg-violet-900/20'
                        : 'border-gray-700 bg-gray-800/60 hover:bg-gray-800'
                    }`}>
                    <input type="checkbox" checked={selectedIds.includes(c.id)}
                      onChange={() => toggleConcert(c.id)} className="accent-violet-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{c.concertName}</p>
                      <p className="text-xs text-gray-500">{c.bandName} · Grade {c.grade}</p>
                    </div>
                  </label>
                ))}
              </div>
              {selectedIds.length > 0 && (
                <p className="text-xs text-violet-400/70 mt-1.5">{selectedIds.length} concert{selectedIds.length !== 1 ? 's' : ''} selected</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
          <button onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={() => void createMutation.mutate()} disabled={!canCreate}
            className="flex-1 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
            {createMutation.isPending ? 'Creating…' : 'Create Festival'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FestivalDetailModal({
  festivalId,
  onClose,
  onDeleted,
  onSaved,
}: {
  festivalId: string;
  onClose: () => void;
  onDeleted: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [editName,    setEditName]    = useState('');
  const [isDirty,     setIsDirty]     = useState(false);
  const [showExport,  setShowExport]  = useState(false);
  const [dreamExport, setDreamExport] = useState(false);
  const [lineupIds,   setLineupIds]   = useState<string[]>([]);
  const [lineupDirty, setLineupDirty] = useState(false);
  const [addId,       setAddId]       = useState('');

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['band-rpg-festival-detail', festivalId],
    queryFn:  () => bandRpgApi.getFestivalDetail(festivalId),
    staleTime: 30_000,
  });

  const { data: allConcerts = [] } = useQuery({
    queryKey: ['band-rpg-concerts'],
    queryFn:  () => bandRpgApi.getConcerts(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (detail) {
      setEditName(detail.name);
      setLineupIds(detail.concerts.map((c) => c.concertId));
      setIsDirty(false);
      setLineupDirty(false);
    }
  }, [detail]);

  const concertDataMap = useMemo(
    () => new Map(allConcerts.map((c) => [c.id, c])),
    [allConcerts],
  );

  const availableConcerts = useMemo(
    () => allConcerts.filter((c) => !lineupIds.includes(c.id)),
    [allConcerts, lineupIds],
  );

  const lineupEntries = useMemo(
    () => lineupIds.map((id, pos) => {
      const fromDetail = detail?.concerts.find((c) => c.concertId === id);
      const fromList   = concertDataMap.get(id);
      return {
        concertId:         id,
        position:          pos,
        concertName:       fromDetail?.concertName ?? fromList?.concertName ?? id,
        bandName:          fromDetail?.bandName     ?? fromList?.bandName    ?? '—',
        grade:             fromDetail?.grade        ?? fromList?.grade       ?? '?',
        concertPersonality: fromDetail?.concertPersonality ?? fromList?.concertPersonality ?? '',
        role:              fromDetail?.role ?? assignLineupRoleClient(pos, lineupIds.length),
        roleLabel:         fromDetail?.roleLabel ?? '',
        headlinerStrength: fromDetail?.headlinerStrength ?? 0,
        openerStrength:    fromDetail?.openerStrength    ?? 0,
      };
    }),
    [lineupIds, detail, concertDataMap],
  );

  const moveUp   = (idx: number) => { if (idx === 0) return; const ids = [...lineupIds]; [ids[idx - 1], ids[idx]] = [ids[idx]!, ids[idx - 1]!]; setLineupIds(ids); setLineupDirty(true); };
  const moveDown = (idx: number) => { if (idx >= lineupIds.length - 1) return; const ids = [...lineupIds]; [ids[idx], ids[idx + 1]] = [ids[idx + 1]!, ids[idx]!]; setLineupIds(ids); setLineupDirty(true); };
  const removeConcert = (id: string) => { setLineupIds((prev) => prev.filter((x) => x !== id)); setLineupDirty(true); };
  const addConcert = () => { if (!addId || lineupIds.includes(addId)) return; setLineupIds((prev) => [...prev, addId]); setAddId(''); setLineupDirty(true); };

  const saveMeta = useMutation({
    mutationFn: () => bandRpgApi.updateFestival(festivalId, { name: editName.trim() }),
    onSuccess: () => {
      setIsDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-festival-detail', festivalId] });
      onSaved();
    },
  });

  const saveLineup = useMutation({
    mutationFn: () => bandRpgApi.updateFestivalConcerts(festivalId, lineupIds),
    onSuccess: () => {
      setLineupDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-festival-detail', festivalId] });
      onSaved();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => bandRpgApi.deleteFestival(festivalId),
    onSuccess: onDeleted,
  });

  const dreamMutation = useMutation({
    mutationFn: (isDream: boolean) => bandRpgApi.setDreamFestival(festivalId, isDream),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-festivals'] });
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-festival-detail', festivalId] });
    },
  });

  const anySaving = saveMeta.isPending || saveLineup.isPending;

  return (
    <>
      <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
        <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 rounded-full border-2 border-violet-500/60 border-t-violet-400 animate-spin" />
            </div>
          ) : isError || !detail ? (
            <div className="p-8 text-center text-red-400 text-sm">Failed to load festival.</div>
          ) : (
            <>
              {/* Header */}
              <div className={`px-5 py-4 border-b shrink-0 ${detail.isDream ? 'border-amber-800/40 bg-amber-950/30' : 'border-gray-800'}`}>
                <div className="flex items-center gap-3">
                  {detail.isDream && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-800/50 border border-amber-700/40 text-amber-400 font-bold shrink-0">★</span>
                  )}
                  <input type="text" value={editName}
                    onChange={(e) => { setEditName(e.target.value); setIsDirty(true); }}
                    maxLength={80}
                    className={`flex-1 font-semibold text-lg focus:outline-none border-b border-transparent pb-0.5 transition-colors min-w-0 bg-transparent ${
                      detail.isDream ? 'text-amber-100 focus:border-amber-600/60' : 'text-white focus:border-violet-500/60'
                    }`} />
                  <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none shrink-0">✕</button>
                </div>
                <p className={`text-sm italic mt-0.5 ${detail.isDream ? 'text-amber-500/60' : 'text-violet-400/60'}`}>{detail.festivalPersonality}</p>
              </div>

              {/* Scrollable body: analysis + lineup */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Analysis */}
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 space-y-2">
                <div className="flex gap-4 text-xs text-gray-500 flex-wrap">
                  <span>🎤 {detail.concertCount} concert{detail.concertCount !== 1 ? 's' : ''}</span>
                  <span>🎸 {detail.bandCount} band{detail.bandCount !== 1 ? 's' : ''}</span>
                  <span>🎵 {detail.totalSongs} songs</span>
                  {detail.avgVenueFit !== null && <span className="text-indigo-400/80">📍 Venue Fit {detail.avgVenueFit}/100</span>}
                  <div className="ml-auto flex gap-1.5">
                    {detail.isDream && (
                      <button onClick={() => { setDreamExport(true); setShowExport(true); }}
                        className="bg-amber-900/50 hover:bg-amber-800/60 border border-amber-800/50 text-amber-400 px-3 py-1 rounded-lg text-xs font-semibold transition-colors">
                        ★ Dream Card
                      </button>
                    )}
                    <button onClick={() => { setDreamExport(false); setShowExport(true); }}
                      className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-colors">
                      Share
                    </button>
                  </div>
                </div>

                {/* Lineup Analysis */}
                <div className="bg-gray-800/60 rounded-lg px-3 py-2.5 border border-gray-700/50">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-2">Lineup</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-amber-900/20 border border-amber-900/30 rounded-lg px-2.5 py-2">
                      <p className="text-[10px] text-amber-400/70 font-semibold uppercase tracking-wide mb-0.5">Headliner</p>
                      <p className="text-xs text-white font-semibold truncate">{detail.lineupAnalysis.headlinerName}</p>
                      <p className="text-[10px] text-amber-400/50 mt-0.5 truncate">{detail.lineupAnalysis.headlinerBandName} · {detail.lineupAnalysis.headlinerScore}/100</p>
                    </div>
                    <div className="bg-sky-900/20 border border-sky-900/30 rounded-lg px-2.5 py-2">
                      <p className="text-[10px] text-sky-400/70 font-semibold uppercase tracking-wide mb-0.5">Opener</p>
                      <p className="text-xs text-white font-semibold truncate">{detail.lineupAnalysis.openerName}</p>
                      <p className="text-[10px] text-sky-400/50 mt-0.5 truncate">{detail.lineupAnalysis.openerBandName} · {detail.lineupAnalysis.openerScore}/100</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] text-gray-600 w-20 shrink-0">Flow Rating</p>
                    <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500/70 rounded-full transition-all" style={{ width: `${detail.lineupAnalysis.flowRating}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-500 w-7 text-right font-mono">{detail.lineupAnalysis.flowRating}</p>
                  </div>
                  <p className="text-xs text-amber-400/60 italic leading-relaxed">{detail.lineupAnalysis.lineupReport}</p>
                </div>
                {/* Chemistry Score */}
                <div className="bg-gray-800/60 rounded-lg px-3 py-2.5 border border-gray-700/50">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Chemistry</span>
                      <span className="ml-2 text-xs text-violet-300/60 italic">{detail.chemistry.chemistryLabel}</span>
                    </div>
                    <span className={`text-2xl font-bold font-mono ${chemistryScoreColor(detail.chemistry.chemistryScore)}`}>
                      {detail.chemistry.chemistryScore}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mb-2">{detail.chemistry.chemistryReport}</p>
                  <div className="space-y-1">
                    {([
                      { label: 'Personality',   value: detail.chemistry.personalityCompatibility, color: 'bg-violet-600/70'  },
                      { label: 'Flow',          value: detail.chemistry.festivalFlow,              color: 'bg-cyan-600/70'    },
                      { label: 'Fan Balance',   value: detail.chemistry.fanServiceBalance,         color: 'bg-emerald-600/70' },
                      { label: 'Deep Balance',  value: detail.chemistry.deepCutBalance,            color: 'bg-purple-600/70'  },
                      ...(detail.chemistry.audienceOverlap !== null
                        ? [{ label: 'Audience',  value: detail.chemistry.audienceOverlap,  color: 'bg-indigo-500/70' }]
                        : []),
                      ...(detail.chemistry.venueCompatibility !== null
                        ? [{ label: 'Venue',     value: detail.chemistry.venueCompatibility, color: 'bg-blue-600/70'  }]
                        : []),
                    ] as { label: string; value: number; color: string }[]).map((bar) => (
                      <div key={bar.label} className="flex items-center gap-2">
                        <p className="text-[10px] text-gray-600 w-20 shrink-0">{bar.label}</p>
                        <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full ${bar.color} rounded-full transition-all`} style={{ width: `${bar.value}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 w-6 text-right font-mono">{bar.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Audience Archetypes */}
                <div className="bg-gray-800/60 rounded-lg px-3 py-2.5 border border-gray-700/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Audience</p>
                    <span className="text-[10px] text-gray-600 italic">{detail.audience.audienceDiversityLabel} · {detail.audience.audienceDiversityScore}% diverse</span>
                  </div>
                  {/* Primary + secondary badges */}
                  <div className="flex gap-2">
                    <div className="flex-1 bg-indigo-900/30 border border-indigo-800/40 rounded-lg px-2.5 py-2">
                      <p className="text-[10px] text-indigo-400/60 uppercase tracking-wide font-semibold mb-0.5">Primary</p>
                      <p className="text-xs text-white font-semibold">{detail.audience.primaryArchetype.icon} {detail.audience.primaryArchetype.name}</p>
                      <p className="text-[10px] text-indigo-300/50 mt-0.5 font-mono">{detail.audience.primaryArchetype.score}/100</p>
                    </div>
                    {detail.audience.secondaryArchetype && (
                      <div className="flex-1 bg-gray-800/60 border border-gray-700/40 rounded-lg px-2.5 py-2">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Secondary</p>
                        <p className="text-xs text-gray-300 font-semibold">{detail.audience.secondaryArchetype.icon} {detail.audience.secondaryArchetype.name}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5 font-mono">{detail.audience.secondaryArchetype.score}/100</p>
                      </div>
                    )}
                  </div>
                  {/* Audience report */}
                  <p className="text-xs text-gray-400/80 leading-relaxed italic">{detail.audience.audienceReport}</p>
                  {/* Archetype score bars — top 5 */}
                  <div className="space-y-1 pt-1 border-t border-gray-700/30">
                    {detail.audience.archetypes.slice(0, 5).map((arch) => (
                      <div key={arch.key} className="flex items-center gap-2" title={arch.explanation}>
                        <p className="text-[10px] text-gray-600 w-28 shrink-0 truncate">{arch.icon} {arch.name}</p>
                        <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500/60 rounded-full transition-all" style={{ width: `${arch.score}%` }} />
                        </div>
                        <p className="text-[10px] text-gray-500 w-6 text-right font-mono">{arch.score}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {detail.festivalStory && (
                  <p className="text-xs text-gray-500 leading-relaxed">{detail.festivalStory}</p>
                )}

                <div className="space-y-1.5">
                  {[
                    { label: 'Fan Service', value: detail.avgFanService, color: 'bg-emerald-600/70' },
                    { label: 'Deep Cuts',   value: detail.avgDeepCuts,   color: 'bg-purple-600/70'  },
                  ].map((bar) => (
                    <div key={bar.label} className="flex items-center gap-2">
                      <p className="text-[10px] text-gray-600 w-20 shrink-0">{bar.label}</p>
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${bar.color} rounded-full transition-all`} style={{ width: `${bar.value}%` }} />
                      </div>
                      <p className="text-[10px] text-gray-500 w-7 text-right font-mono">{bar.value}</p>
                    </div>
                  ))}
                </div>

                {/* Prestige section */}
                <PrestigeSection prestige={detail.prestige} />

                {/* Dream Festival designation */}
                <DreamFestivalToggle
                  isDream={detail.isDream}
                  isPending={dreamMutation.isPending}
                  onToggle={(val) => void dreamMutation.mutate(val)}
                />

                {/* Real World Intelligence (Phase V) */}
                {(detail.realismScore !== null || (detail.historicalHighlights && detail.historicalHighlights.length > 0)) && (
                  <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 px-3 py-3 space-y-2">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">Real World</p>
                    {detail.realismScore !== null && detail.realismLabel !== null && (
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] text-gray-600 w-16 shrink-0">Realism</p>
                        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-600/70 rounded-full transition-all" style={{ width: `${detail.realismScore}%` }} />
                        </div>
                        <p className="text-[10px] text-sky-400 font-semibold w-20 text-right">{detail.realismLabel}</p>
                      </div>
                    )}
                    {detail.historicalHighlights && detail.historicalHighlights.length > 0 && (
                      <div className="space-y-1">
                        {detail.historicalHighlights.map((h, i) => (
                          <p key={i} className="text-[11px] text-gray-400 leading-snug">• {h}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Lineup editor */}
              <div>
                {lineupEntries.length === 0 ? (
                  <div className="px-4 py-6 text-center text-gray-600 text-sm">No concerts in this lineup yet.</div>
                ) : (
                  <div className="divide-y divide-gray-800/50">
                    {lineupEntries.map((entry, idx) => (
                      <div key={entry.concertId} className="flex items-center gap-2 px-4 py-2.5">
                        <span className="text-gray-600 text-xs w-5 text-right shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <RoleBadge role={entry.role} />
                            {entry.roleLabel && (
                              <span className="text-[10px] text-gray-600 italic truncate">{entry.roleLabel}</span>
                            )}
                          </div>
                          <p className="text-sm text-white truncate">{entry.concertName}</p>
                          <p className="text-xs text-gray-600 truncate">{entry.bandName}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => moveUp(idx)}
                            disabled={idx === 0}
                            className="text-gray-600 hover:text-violet-400 disabled:opacity-20 text-sm px-1 py-0.5 rounded transition-colors"
                            title="Move up">
                            ▲
                          </button>
                          <button
                            onClick={() => moveDown(idx)}
                            disabled={idx === lineupEntries.length - 1}
                            className="text-gray-600 hover:text-violet-400 disabled:opacity-20 text-sm px-1 py-0.5 rounded transition-colors"
                            title="Move down">
                            ▼
                          </button>
                          <button
                            onClick={() => removeConcert(entry.concertId)}
                            className="text-gray-700 hover:text-red-500 text-sm px-1 py-0.5 rounded transition-colors ml-1"
                            title="Remove">
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add concert */}
                {availableConcerts.length > 0 && (
                  <div className="flex gap-2 px-4 py-3 border-t border-gray-800/50">
                    <select value={addId} onChange={(e) => setAddId(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-violet-500/60">
                      <option value="">Add a concert…</option>
                      {availableConcerts.map((c) => (
                        <option key={c.id} value={c.id}>{c.concertName} — {c.bandName}</option>
                      ))}
                    </select>
                    <button onClick={addConcert} disabled={!addId}
                      className="bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0">
                      Add
                    </button>
                  </div>
                )}
              </div>
              </div>{/* end scrollable body */}

              {/* Footer */}
              <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
                <button
                  onClick={() => { if (window.confirm('Delete this festival?')) void deleteMutation.mutate(); }}
                  disabled={deleteMutation.isPending}
                  className="text-red-700 hover:text-red-500 disabled:opacity-50 text-sm font-semibold transition-colors px-1">
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <div className="flex-1" />
                <button onClick={onClose}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                  Close
                </button>
                {lineupDirty && (
                  <button onClick={() => void saveLineup.mutate()} disabled={anySaving}
                    className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                    {saveLineup.isPending ? 'Saving…' : 'Save Lineup'}
                  </button>
                )}
                {isDirty && !lineupDirty && (
                  <button onClick={() => void saveMeta.mutate()} disabled={anySaving}
                    className="bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                    {saveMeta.isPending ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showExport && detail && (
        <FestivalExportModal detail={detail} dream={dreamExport} onClose={() => { setShowExport(false); setDreamExport(false); }} />
      )}
    </>
  );
}

function FestivalHallOfFame({ festivals, onSelect }: { festivals: BandRpgFestivalSummary[]; onSelect: (id: string) => void }) {
  if (festivals.length < 2) return null;
  const sorted = [...festivals].sort((a, b) => b.prestige.prestigeScore - a.prestige.prestigeScore).slice(0, 5);
  const hasLegendary = sorted.some((f) => f.prestige.prestigeScore >= 60);
  if (!hasLegendary) return null;

  return (
    <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 overflow-hidden mt-2">
      <div className="px-4 py-2.5 border-b border-amber-900/30 flex items-center gap-2">
        <span className="text-amber-500 text-sm">🏆</span>
        <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Hall of Fame</p>
        <p className="text-xs text-amber-900 ml-auto">Top by prestige</p>
      </div>
      <div className="divide-y divide-amber-900/20">
        {sorted.filter((f) => f.prestige.prestigeScore >= 40).map((festival, i) => (
          <button key={festival.id} onClick={() => onSelect(festival.id)}
            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-amber-950/40 transition-colors text-left">
            <span className={`text-sm font-bold font-mono w-5 shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-amber-400' : 'text-amber-800'}`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {festival.isDream && <span className="text-[9px] text-amber-500 font-bold">★</span>}
                <p className="text-sm text-amber-100 font-medium truncate">{festival.name}</p>
              </div>
              <p className="text-[10px] text-amber-800 italic truncate">{festival.prestige.prestigeTier}</p>
            </div>
            <span className={`text-sm font-bold font-mono shrink-0 ${prestigeTierColorRaw(festival.prestige.prestigeTier)}`}>
              {festival.prestige.prestigeScore}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FestivalsTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: festivals = [], isLoading, isError } = useQuery({
    queryKey: ['band-rpg-festivals'],
    queryFn:  () => bandRpgApi.getFestivals(),
    staleTime: 60_000,
  });

  const { data: concerts = [] } = useQuery({
    queryKey: ['band-rpg-concerts'],
    queryFn:  () => bandRpgApi.getConcerts(),
    staleTime: 60_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['band-rpg-festivals'] });

  if (isLoading) return <LoadingSpinner />;
  if (isError)   return <ErrorMsg msg="Failed to load festivals." />;

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {festivals.length > 0
              ? `${festivals.length} festival${festivals.length !== 1 ? 's' : ''}`
              : 'No festivals yet'}
          </p>
          {concerts.length > 0 && (
            <button onClick={() => setShowCreate(true)}
              className="bg-violet-700 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
              + New Festival
            </button>
          )}
        </div>

        {festivals.length === 0 && concerts.length === 0 ? (
          <EmptyState icon="🎪" title="No festivals yet"
            desc="Build concerts first, then combine them into a festival lineup." />
        ) : festivals.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-6 py-10 text-center space-y-3">
            <p className="text-gray-300 font-semibold">Stage your first festival</p>
            <p className="text-gray-600 text-sm">Combine your concerts into a festival lineup. Each festival receives a Chemistry Score, personality, and an exportable card.</p>
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center bg-violet-700 hover:bg-violet-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors">
              + New Festival
            </button>
          </div>
        ) : (
          <>
            <FestivalRecords festivals={festivals} />
            {/* Dream Festival pinned at top */}
            {(() => {
              const dream = festivals.find((f) => f.isDream);
              const rest  = festivals.filter((f) => !f.isDream);
              return (
                <div className="space-y-2">
                  {dream && (
                    <div>
                      <p className="text-[10px] text-amber-600/70 font-semibold uppercase tracking-wide mb-1.5 px-1">★ Dream Festival</p>
                      <FestivalCard festival={dream} onClick={() => setSelectedId(dream.id)} />
                    </div>
                  )}
                  {rest.length > 0 && (
                    <div className="space-y-2">
                      {dream && rest.length > 0 && (
                        <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide px-1 pt-1">All Festivals</p>
                      )}
                      {rest.map((f) => (
                        <FestivalCard key={f.id} festival={f} onClick={() => setSelectedId(f.id)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <FestivalHallOfFame festivals={festivals} onSelect={(id) => setSelectedId(id)} />
          </>
        )}
      </div>

      {showCreate && (
        <CreateFestivalModal
          concerts={concerts}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {selectedId && (
        <FestivalDetailModal
          festivalId={selectedId}
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

// ── Tours (Phase W) ────────────────────────────────────────────────────────────

const TOUR_SCORE_COLOR = (score: number) =>
  score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-sky-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';

function TourScoreBar({ label, value, color }: { label: string; value: number | null; color: string }) {
  if (value === null) return (
    <div className="flex items-center gap-2">
      <p className="text-[10px] text-gray-600 w-20 shrink-0">{label}</p>
      <p className="text-[10px] text-gray-700 italic">No data</p>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      <p className="text-[10px] text-gray-600 w-20 shrink-0">{label}</p>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <p className={`text-[10px] font-semibold w-8 text-right font-mono ${TOUR_SCORE_COLOR(value)}`}>{value}</p>
    </div>
  );
}

function TourAchievementGrid({ achievements }: { achievements: TourAchievement[] }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {achievements.map((a) => (
        <div key={a.key} title={`${a.name} — ${a.description}`}
          className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg border text-center ${
            a.unlocked
              ? 'border-sky-800/60 bg-sky-900/30'
              : 'border-gray-800/40 bg-gray-900/20 opacity-40'
          }`}>
          <span className="text-base leading-none">{a.icon}</span>
          <span className="text-[9px] text-gray-400 leading-tight line-clamp-1">{a.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── Tour export canvas ─────────────────────────────────────────────────────────

function drawTourCard(ctx: CanvasRenderingContext2D, tour: BandRpgTourDetail): void {
  const W = 900; const H = 1200; const PAD = 48;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#050d1a');
  bg.addColorStop(1, '#071220');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Teal border
  ctx.strokeStyle = '#0d9488';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, W - 24, H - 24);

  // Header label
  ctx.fillStyle = '#0d9488';
  ctx.font = 'bold 11px sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('BAND RPG  ·  TOUR', PAD, 50);
  ctx.letterSpacing = '0px';

  // Tour name
  ctx.fillStyle = '#f0fdfa';
  ctx.font = 'bold 38px sans-serif';
  let y = 90;
  ctx.fillText(truncateForCanvas(ctx, tour.name, W - PAD * 2), PAD, y);
  y += 48;

  // Personality
  ctx.fillStyle = '#5eead4';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`${tour.personalityIcon}  ${tour.personality}`, PAD, y + 8); y += 48;

  // Bands
  if (tour.bands.length > 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText(tour.bands.slice(0, 3).join(' · '), PAD, y); y += 28;
  }

  // Route summary
  if (tour.firstCity || tour.lastCity) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    const routeStr = [tour.firstCity, tour.lastCity].filter(Boolean).join(' → ');
    ctx.fillText(routeStr, PAD, y); y += 24;
  }

  y += 20;

  // Separator
  ctx.strokeStyle = '#0f3d38';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 28;

  // Score bars
  const bars: Array<{ label: string; value: number | null; color: string }> = [
    { label: 'Momentum',   value: tour.momentum,        color: '#0d9488' },
    { label: 'Variety',    value: tour.variety,          color: '#7c3aed' },
    { label: 'Historical', value: tour.historicalScore,  color: '#0369a1' },
  ];
  ctx.font = '11px sans-serif';
  for (const bar of bars) {
    ctx.fillStyle = '#475569';
    ctx.fillText(bar.label, PAD, y + 4);
    if (bar.value !== null) {
      const bx = PAD + 100; const bw = W - PAD * 2 - 140;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(bx, y - 10, bw, 14);
      ctx.fillStyle = bar.color;
      ctx.fillRect(bx, y - 10, Math.round(bw * bar.value / 100), 14);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${bar.value}`, W - PAD - 32, y + 4);
    } else {
      ctx.fillStyle = '#334155';
      ctx.fillText('No data', PAD + 100, y + 4);
    }
    y += 28;
  }

  y += 16;
  ctx.strokeStyle = '#0f3d38';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 24;

  // Stop list
  ctx.fillStyle = '#0d9488';
  ctx.font = 'bold 11px sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(`TOUR STOPS  ·  ${tour.stopCount}`, PAD, y);
  ctx.letterSpacing = '0px';
  y += 20;
  ctx.font = '12px sans-serif';
  const visibleStops = tour.stops.slice(0, 8);
  for (const [i, stop] of visibleStops.entries()) {
    ctx.fillStyle = '#475569';
    ctx.fillText(`${i + 1}.`, PAD, y + 4);
    ctx.fillStyle = '#cbd5e1';
    const stopLabel = [stop.concertName, stop.cityName, stop.countryName].filter(Boolean).join(' · ');
    ctx.fillText(truncateForCanvas(ctx, stopLabel, W - PAD * 2 - 40), PAD + 28, y + 4);
    y += 22;
  }
  if (tour.stops.length > 8) {
    ctx.fillStyle = '#334155';
    ctx.font = '11px sans-serif';
    ctx.fillText(`+ ${tour.stops.length - 8} more stops`, PAD + 28, y + 4);
    y += 20;
  }

  y += 16;
  ctx.strokeStyle = '#0f3d38';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 24;

  // Achievements
  const unlocked = tour.achievements.filter((a) => a.unlocked);
  ctx.fillStyle = '#0d9488';
  ctx.font = 'bold 11px sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(`ACHIEVEMENTS  ·  ${unlocked.length} / ${tour.achievements.length}`, PAD, y);
  ctx.letterSpacing = '0px';
  y += 16;
  ctx.font = '18px sans-serif';
  let ax = PAD;
  for (const a of unlocked) {
    ctx.fillText(a.icon, ax, y + 16);
    ax += 30;
    if (ax > W - PAD - 30) { ax = PAD; y += 28; }
  }

  // Footer
  ctx.fillStyle = '#0f3d38';
  ctx.fillRect(0, H - 48, W, 48);
  ctx.fillStyle = '#0d9488';
  ctx.font = '11px sans-serif';
  ctx.fillText(`Band RPG · ${tour.stopCount} stops`, PAD, H - 20);
  ctx.fillStyle = '#334155';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('band-spectrum-mapper.com', W - PAD, H - 20);
  ctx.textAlign = 'left';
}

function TourExportModal({ tour, onClose }: { tour: BandRpgTourDetail; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawTourCard(ctx, tour);
  }, [tour]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${tour.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-tour-card.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-sm w-full p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Tour Card Export</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">✕</button>
        </div>
        <div className="overflow-auto max-h-64 rounded-lg border border-gray-800">
          <canvas ref={canvasRef} width={900} height={1200} className="w-full h-auto" />
        </div>
        <button onClick={handleDownload}
          className="bg-teal-700 hover:bg-teal-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
          Download PNG
        </button>
      </div>
    </div>
  );
}

// ── Tour detail modal ──────────────────────────────────────────────────────────

type EditTourStop = {
  concertId:    string;
  concertName:  string;
  bandName:     string;
  cityName:     string;
  countryName:  string;
  songCount:    number;
  concertPower: number;
  realismScore: number | null;
};

function TourDetailModal({
  tourId,
  onClose,
  onDeleted,
  onSaved,
}: {
  tourId:    string;
  onClose:   () => void;
  onDeleted: () => void;
  onSaved:   () => void;
}) {
  const queryClient = useQueryClient();

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['band-rpg-tour-detail', tourId],
    queryFn:  () => bandRpgApi.getTourDetail(tourId),
    staleTime: 30_000,
  });

  const { data: allConcerts = [] } = useQuery({
    queryKey: ['band-rpg-concerts'],
    queryFn:  () => bandRpgApi.getConcerts(),
    staleTime: 60_000,
  });

  const [editName,     setEditName]     = useState('');
  const [editStops,    setEditStops]    = useState<EditTourStop[]>([]);
  const [addConcertId, setAddConcertId] = useState('');
  const [isDirty,      setIsDirty]      = useState(false);
  const [showExport,   setShowExport]   = useState(false);

  useEffect(() => {
    if (!detail) return;
    setEditName(detail.name);
    setEditStops(
      detail.stops.map((s) => ({
        concertId:    s.concertId,
        concertName:  s.concertName,
        bandName:     s.bandName,
        cityName:     s.cityName ?? '',
        countryName:  s.countryName ?? '',
        songCount:    s.songCount,
        concertPower: s.concertPower,
        realismScore: s.realismScore,
      })),
    );
    setIsDirty(false);
  }, [detail]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await bandRpgApi.updateTour(tourId, { name: editName });
      await bandRpgApi.updateTourStops(
        tourId,
        editStops.map((s) => ({
          concertId:   s.concertId,
          ...(s.cityName.trim()    ? { cityName:    s.cityName.trim()    } : {}),
          ...(s.countryName.trim() ? { countryName: s.countryName.trim() } : {}),
        })),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-tour-detail', tourId] });
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-tours'] });
      setIsDirty(false);
      onSaved();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => bandRpgApi.deleteTour(tourId),
    onSuccess:  onDeleted,
  });

  function moveStop(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editStops.length) return;
    const copy = [...editStops];
    const a = copy[idx]!; const b = copy[newIdx]!;
    copy[idx] = b; copy[newIdx] = a;
    setEditStops(copy);
    setIsDirty(true);
  }

  function removeStop(idx: number) {
    setEditStops(editStops.filter((_, i) => i !== idx));
    setIsDirty(true);
  }

  function addStop() {
    const concert = allConcerts.find((c) => c.id === addConcertId);
    if (!concert) return;
    setEditStops([...editStops, {
      concertId:    concert.id,
      concertName:  concert.concertName,
      bandName:     concert.bandName,
      cityName:     '',
      countryName:  '',
      songCount:    concert.songCount,
      concertPower: 0,
      realismScore: null,
    }]);
    setAddConcertId('');
    setIsDirty(true);
  }

  function updateStopField(idx: number, field: 'cityName' | 'countryName', value: string) {
    const copy = [...editStops];
    const stop = copy[idx];
    if (!stop) return;
    copy[idx] = { ...stop, [field]: value };
    setEditStops(copy);
    setIsDirty(true);
  }

  // Concerts already in the tour (exclude from add dropdown)
  const usedIds = new Set(editStops.map((s) => s.concertId));
  const availableConcerts = allConcerts.filter((c) => !usedIds.has(c.id));

  return (
    <>
      <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
        <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}>

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 rounded-full border-2 border-teal-500/60 border-t-teal-400 animate-spin" />
            </div>
          ) : isError || !detail ? (
            <div className="p-8 text-center text-red-400 text-sm">Failed to load tour.</div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-3">
                  <input type="text" value={editName}
                    onChange={(e) => { setEditName(e.target.value); setIsDirty(true); }}
                    maxLength={80}
                    className="flex-1 bg-transparent text-white font-semibold text-lg focus:outline-none border-b border-transparent focus:border-teal-500/60 pb-0.5 transition-colors min-w-0" />
                  <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xl leading-none shrink-0">✕</button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm">{detail.personalityIcon}</span>
                  <p className="text-teal-400 text-sm font-medium">{detail.personality}</p>
                  <span className="text-gray-700 text-xs">·</span>
                  <p className="text-gray-500 text-xs">{detail.stopCount} stops</p>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto overscroll-contain">

                {/* Analysis panel */}
                <div className="px-4 py-4 border-b border-gray-800 bg-gray-900/50 space-y-3">
                  {/* Score bars */}
                  <TourScoreBar label="Momentum"   value={detail.momentum}       color="bg-teal-600/70" />
                  <TourScoreBar label="Variety"     value={detail.variety}        color="bg-violet-600/70" />
                  <TourScoreBar label="Historical"  value={detail.historicalScore} color="bg-sky-600/70" />
                  {detail.historicalLabel && (
                    <p className="text-[10px] text-sky-400 font-medium pl-22">
                      {detail.historicalLabel}
                    </p>
                  )}

                  {/* Story */}
                  {detail.story && (
                    <div className="rounded-lg bg-gray-800/40 px-3 py-2.5">
                      <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide mb-1">Tour Story</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{detail.story}</p>
                    </div>
                  )}

                  {/* Achievements */}
                  <div>
                    <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide mb-1.5">
                      Achievements · {detail.achievements.filter((a) => a.unlocked).length} / {detail.achievements.length}
                    </p>
                    <TourAchievementGrid achievements={detail.achievements} />
                  </div>
                </div>

                {/* Stop list */}
                <div>
                  <div className="px-4 py-2.5 border-b border-gray-800/50 bg-gray-900/30">
                    <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide">Tour Stops</p>
                  </div>

                  {editStops.length === 0 ? (
                    <p className="px-4 py-6 text-center text-gray-600 text-sm">No stops yet. Add a concert below.</p>
                  ) : (
                    <div className="divide-y divide-gray-800/50">
                      {editStops.map((stop, idx) => (
                        <div key={`${stop.concertId}-${idx}`} className="px-4 py-3">
                          <div className="flex items-start gap-2 mb-1.5">
                            <span className="text-gray-600 text-xs w-5 text-right shrink-0 mt-0.5">{idx + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{stop.concertName}</p>
                              <p className="text-xs text-gray-500 truncate">{stop.bandName}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => moveStop(idx, -1)} disabled={idx === 0}
                                className="text-gray-600 hover:text-teal-400 disabled:opacity-20 text-sm px-1 py-0.5 rounded transition-colors">▲</button>
                              <button onClick={() => moveStop(idx, 1)} disabled={idx === editStops.length - 1}
                                className="text-gray-600 hover:text-teal-400 disabled:opacity-20 text-sm px-1 py-0.5 rounded transition-colors">▼</button>
                              <button onClick={() => removeStop(idx)}
                                className="text-gray-700 hover:text-red-500 text-sm px-1 py-0.5 rounded transition-colors ml-1">✕</button>
                            </div>
                          </div>
                          <div className="flex gap-2 pl-7">
                            <input
                              type="text"
                              placeholder="City"
                              value={stop.cityName}
                              onChange={(e) => updateStopField(idx, 'cityName', e.target.value)}
                              className="flex-1 bg-gray-800/60 border border-gray-700/60 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-teal-600/60"
                            />
                            <input
                              type="text"
                              placeholder="Country"
                              value={stop.countryName}
                              onChange={(e) => updateStopField(idx, 'countryName', e.target.value)}
                              className="w-28 bg-gray-800/60 border border-gray-700/60 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-teal-600/60"
                            />
                          </div>
                          {stop.realismScore !== null && (
                            <div className="pl-7 mt-1">
                              <span className="text-[10px] text-sky-400">Realism: {stop.realismScore}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add stop */}
                  {availableConcerts.length > 0 && (
                    <div className="flex gap-2 px-4 py-3 border-t border-gray-800/50">
                      <select value={addConcertId} onChange={(e) => setAddConcertId(e.target.value)}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-teal-600/60 min-w-0">
                        <option value="">+ Add a concert…</option>
                        {availableConcerts.map((c) => (
                          <option key={c.id} value={c.id}>{c.concertName} — {c.bandName}</option>
                        ))}
                      </select>
                      <button onClick={addStop} disabled={!addConcertId}
                        className="bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
                <button onClick={() => { if (window.confirm('Delete this tour?')) void deleteMutation.mutate(); }}
                  disabled={deleteMutation.isPending}
                  className="text-red-700 hover:text-red-500 disabled:opacity-50 text-sm font-semibold transition-colors px-1">
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <div className="flex-1" />
                <button onClick={() => setShowExport(true)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors">
                  Share
                </button>
                <button onClick={onClose}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                  Close
                </button>
                <button onClick={() => void saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}
                  className="bg-teal-700 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showExport && detail && (
        <TourExportModal tour={detail} onClose={() => setShowExport(false)} />
      )}
    </>
  );
}

// ── Tour card (list item) ──────────────────────────────────────────────────────

function TourCard({ tour, onClick }: { tour: BandRpgTourSummary; onClick: () => void }) {
  const unlockedCount = tour.achievements.filter((a) => a.unlocked).length;
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-xl border border-gray-800/60 bg-gray-900/60 hover:bg-gray-800/40 hover:border-teal-900/60 transition-colors p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 mt-0.5">{tour.personalityIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-semibold text-white truncate">{tour.name}</p>
          </div>
          <p className="text-xs text-teal-400/80 font-medium mb-2">{tour.personality}</p>

          {/* Bands + route */}
          {tour.bands.length > 0 && (
            <p className="text-xs text-gray-500 truncate mb-1">{tour.bands.slice(0, 2).join(' · ')}</p>
          )}
          {(tour.firstCity || tour.lastCity) && (
            <p className="text-xs text-gray-600 truncate mb-2">
              {[tour.firstCity, tour.lastCity].filter(Boolean).join(' → ')}
            </p>
          )}

          {/* Score pills */}
          <div className="flex flex-wrap gap-2 text-[10px] mb-2">
            <span className={`font-mono font-semibold ${TOUR_SCORE_COLOR(tour.momentum)}`}>
              ⚡{tour.momentum} momentum
            </span>
            <span className={`font-mono font-semibold ${TOUR_SCORE_COLOR(tour.variety)}`}>
              🎲 {tour.variety} variety
            </span>
            {tour.historicalScore !== null && (
              <span className={`font-mono font-semibold ${TOUR_SCORE_COLOR(tour.historicalScore)}`}>
                📜 {tour.historicalScore} historical
              </span>
            )}
          </div>

          {/* Achievements */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600">{tour.stopCount} stops</span>
            <span className="text-gray-700">·</span>
            <span className="text-[10px] text-gray-600">{unlockedCount} / {tour.achievements.length} achievements</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Tours tab ──────────────────────────────────────────────────────────────────

function ToursTab() {
  const queryClient       = useQueryClient();
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [createName,      setCreateName]      = useState('');
  const [showCreate,      setShowCreate]      = useState(false);
  const [createError,     setCreateError]     = useState<string | null>(null);

  const { data: tours = [], isLoading, isError } = useQuery({
    queryKey: ['band-rpg-tours'],
    queryFn:  () => bandRpgApi.getTours(),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => bandRpgApi.createTour({ name }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-tours'] });
      setCreateName('');
      setShowCreate(false);
      setCreateError(null);
      setSelectedId(r.id);
    },
    onError: () => setCreateError('Failed to create tour.'),
  });

  function handleCreate() {
    const name = createName.trim();
    if (!name) { setCreateError('Tour name is required.'); return; }
    createMutation.mutate(name);
  }

  return (
    <div className="p-4 space-y-4">
      {/* Create form */}
      {showCreate ? (
        <div className="rounded-xl border border-teal-800/40 bg-teal-950/20 p-4">
          <p className="text-xs text-teal-400/80 font-semibold uppercase tracking-wide mb-3">New Tour</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={createName}
              onChange={(e) => { setCreateName(e.target.value); setCreateError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Tour name…"
              autoFocus
              maxLength={80}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-teal-600/60"
            />
            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              {createMutation.isPending ? '…' : 'Create'}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateError(null); setCreateName(''); }}
              className="text-gray-500 hover:text-gray-300 text-sm px-2 transition-colors">Cancel</button>
          </div>
          {createError && <p className="text-xs text-red-400 mt-2">{createError}</p>}
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)}
          className="w-full rounded-xl border border-dashed border-gray-700 hover:border-teal-700 text-gray-500 hover:text-teal-400 text-sm py-3 transition-colors">
          + New Tour
        </button>
      )}

      {/* Tour list */}
      {isLoading && (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 rounded-full border-2 border-teal-500/60 border-t-teal-400 animate-spin" />
        </div>
      )}
      {isError && (
        <div className="text-center py-8 text-red-400 text-sm">Failed to load tours.</div>
      )}
      {!isLoading && !isError && tours.length === 0 && (
        <div className="text-center py-10">
          <p className="text-gray-600 text-sm">No tours yet.</p>
          <p className="text-gray-700 text-xs mt-1">Create a tour and add concerts to begin a musical journey.</p>
        </div>
      )}
      {!isLoading && !isError && tours.length > 0 && (
        <div className="space-y-3">
          {tours.map((tour) => (
            <TourCard key={tour.id} tour={tour} onClick={() => setSelectedId(tour.id)} />
          ))}
        </div>
      )}

      {selectedId && (
        <TourDetailModal
          tourId={selectedId}
          onClose={() => setSelectedId(null)}
          onDeleted={() => {
            void queryClient.invalidateQueries({ queryKey: ['band-rpg-tours'] });
            setSelectedId(null);
          }}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['band-rpg-tours'] })}
        />
      )}
    </div>
  );
}

// ── Curator Progression (Phase X.5) ───────────────────────────────────────────

function XPBar({ xpIntoLevel, xpForNextLevel, pct }: { xpIntoLevel: number; xpForNextLevel: number; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>{xpIntoLevel.toLocaleString()} XP</span>
        <span>{xpForNextLevel.toLocaleString()} XP to next level</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function drawCuratorCard(
  ctx: CanvasRenderingContext2D,
  profile: BandRpgCuratorProfile,
): void {
  const W = 900, H = 1200, PAD = 60;

  // Background — deep indigo
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,    '#0a0a1a');
  bg.addColorStop(0.5,  '#0f0a25');
  bg.addColorStop(1,    '#05050f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Silver border
  ctx.strokeStyle = '#9090b8';
  ctx.lineWidth   = 3;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.strokeStyle = '#3a3a6a';
  ctx.lineWidth   = 1;
  ctx.strokeRect(22, 22, W - 44, H - 44);

  ctx.textAlign = 'center';

  // Header
  ctx.fillStyle = '#9090c8';
  ctx.font      = 'bold 22px sans-serif';
  ctx.fillText('BAND RPG — CURATOR PROFILE', W / 2, 65);

  // Character / avatar placeholder
  ctx.fillStyle = '#1a1a3a';
  ctx.beginPath();
  ctx.arc(W / 2, 155, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6060a0';
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.fillStyle = '#8080b8';
  ctx.font      = '56px sans-serif';
  ctx.fillText(profile.selectedCharacterName ? profile.selectedCharacterName.charAt(0).toUpperCase() : '🎵', W / 2, 175);

  // Level badge
  ctx.fillStyle = '#ffd700';
  ctx.font      = 'bold 56px serif';
  ctx.fillText(`Lv. ${profile.level}`, W / 2, 270);

  // Level title
  ctx.fillStyle = '#b8b0e8';
  ctx.font      = 'bold 26px serif';
  ctx.fillText(profile.levelTitle, W / 2, 308);

  // Current title
  if (profile.currentTitle && profile.currentTitle !== profile.levelTitle) {
    ctx.fillStyle = '#e0d060';
    ctx.font      = '20px sans-serif';
    ctx.fillText(`✦ ${profile.currentTitle}`, W / 2, 342);
  }

  // XP bar
  const barX  = PAD + 20;
  const barW  = W - (PAD + 20) * 2;
  const barY  = 370;
  ctx.fillStyle = '#1a1a3a';
  ctx.fillRect(barX, barY, barW, 16);
  const fillW = Math.max(4, Math.round((profile.xpProgressPct / 100) * barW));
  const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
  grad.addColorStop(0, '#6060ff');
  grad.addColorStop(1, '#a060ff');
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, fillW, 16);
  ctx.fillStyle = '#707090';
  ctx.font      = '14px sans-serif';
  ctx.fillText(`${profile.xp.toLocaleString()} XP  ·  ${profile.xpProgressPct}% to Level ${profile.level + 1}`, W / 2, barY + 34);

  // Divider
  ctx.strokeStyle = '#2a2a5a';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 420); ctx.lineTo(W - PAD, 420); ctx.stroke();

  // Stats grid (2-column)
  const statItems = [
    ['Songs', String(profile.stats.songsRecovered)],
    ['Albums', String(profile.stats.albumsCompleted)],
    ['Concerts', String(profile.stats.concertsCreated)],
    ['Festivals', String(profile.stats.festivalsCreated)],
    ['Tours', String(profile.stats.toursCreated)],
    ['Challenges', String(profile.stats.challengesCompleted)],
    ['Rare Songs', String(profile.stats.rareSongsFound)],
    ['Correct %', `${profile.stats.correctGuessPct}%`],
  ];
  ctx.fillStyle = '#8080b0';
  ctx.font      = 'bold 16px sans-serif';
  ctx.fillText('STATS', W / 2, 448);
  const colW = (W - PAD * 2) / 2;
  statItems.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x   = PAD + col * colW + colW / 2;
    const y   = 475 + row * 48;
    ctx.fillStyle = '#505080';
    ctx.font      = '14px sans-serif';
    ctx.fillText(label ?? '', x, y);
    ctx.fillStyle = '#d0d0f0';
    ctx.font      = 'bold 22px serif';
    ctx.fillText(value ?? '', x, y + 22);
  });

  // Divider
  ctx.strokeStyle = '#2a2a5a';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 680); ctx.lineTo(W - PAD, 680); ctx.stroke();

  // Badges
  const unlockedBadges = profile.badges.filter(b => b.unlocked);
  ctx.fillStyle = '#8080b0';
  ctx.font      = 'bold 16px sans-serif';
  ctx.fillText('BADGES', W / 2, 706);
  ctx.font = '36px sans-serif';
  const bRow   = Math.ceil(unlockedBadges.length / 6);
  const bStart = W / 2 - Math.min(unlockedBadges.length, 6) * 56 / 2;
  unlockedBadges.forEach((b, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    ctx.fillText(b.icon, bStart + col * 56, 750 + row * 56);
  });
  const nextY = 750 + bRow * 56 + 20;

  // Footer
  ctx.fillStyle = '#3a3a6a';
  ctx.font      = '14px sans-serif';
  ctx.fillText('Band RPG — The Archive', W / 2, Math.max(nextY + 40, H - 55));
}

function CuratorExportModal({
  profile, onClose,
}: { profile: BandRpgCuratorProfile; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = 900;
    canvas.height = 1200;
    drawCuratorCard(ctx, profile);
  }, [profile]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href     = canvas.toDataURL('image/png');
    a.download = `curator-card-level-${profile.level}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-white font-semibold text-sm">Curator Card</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">×</button>
        </div>
        <div className="p-4">
          <canvas ref={canvasRef} className="w-full rounded border border-gray-700" />
          <button onClick={handleDownload} className="mt-3 w-full py-2 rounded-lg bg-indigo-900/50 hover:bg-indigo-800/60 text-indigo-300 text-sm font-semibold transition-colors">
            Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}

function TitleSelectorModal({
  profile, onSelect, onClose,
}: {
  profile:  BandRpgCuratorProfile;
  onSelect: (title: string) => void;
  onClose:  () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-white font-semibold text-sm">Select Title</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">×</button>
        </div>
        <div className="p-3 max-h-80 overflow-y-auto space-y-1">
          {profile.allTitles.map(t => (
            <button
              key={t}
              onClick={() => { onSelect(t); onClose(); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                profile.currentTitle === t
                  ? 'bg-indigo-900/50 text-indigo-300 font-semibold'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {profile.currentTitle === t ? '✦ ' : ''}{t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BadgeGrid({ badges }: { badges: CuratorBadge[] }) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap gap-3">
      {badges.map(b => (
        <div
          key={b.key}
          className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border w-[68px] cursor-default transition-all ${
            b.unlocked
              ? 'bg-indigo-950/50 border-indigo-700/50'
              : 'bg-gray-900/40 border-gray-800/40 opacity-40'
          }`}
          onMouseEnter={() => setTooltip(b.key)}
          onMouseLeave={() => setTooltip(null)}
        >
          <span className="text-2xl">{b.icon}</span>
          <span className={`text-[10px] font-semibold text-center leading-tight ${b.unlocked ? 'text-indigo-300' : 'text-gray-600'}`}>
            {b.name}
          </span>
          {b.progress && !b.unlocked && (
            <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{ width: `${Math.round((b.progress.current / b.progress.target) * 100)}%` }}
              />
            </div>
          )}
          {tooltip === b.key && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 z-20 w-44 shadow-xl pointer-events-none">
              <p className="text-white text-xs font-semibold">{b.name}</p>
              <p className="text-gray-400 text-xs mt-0.5">{b.description}</p>
              {b.progress && (
                <p className="text-indigo-400 text-xs mt-1">{b.progress.current} / {b.progress.target}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CuratorTab() {
  const queryClient = useQueryClient();
  const [showExport, setShowExport]       = useState(false);
  const [showTitles, setShowTitles]       = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['band-rpg-curator'],
    queryFn:  () => bandRpgApi.getCuratorProfile(),
  });

  const setTitle = useMutation({
    mutationFn: (title: string) => bandRpgApi.setCuratorTitle(title),
    onSuccess:  () => void queryClient.invalidateQueries({ queryKey: ['band-rpg-curator'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500/60 border-t-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const stats = profile.stats;
  const unlockedCount = profile.badges.filter(b => b.unlocked).length;

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Identity card */}
      <div className="bg-gray-900 border border-indigo-900/50 rounded-2xl p-5 shadow-lg">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-indigo-950 border-2 border-indigo-700/60 flex items-center justify-center text-2xl shrink-0">
            {profile.selectedCharacterName
              ? profile.selectedCharacterName.charAt(0).toUpperCase()
              : '🎵'}
          </div>

          {/* Level + title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-yellow-400 font-bold text-xl">Level {profile.level}</span>
              <span className="text-indigo-400 text-sm font-semibold">{profile.levelTitle}</span>
            </div>

            {/* Active title */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-indigo-300 text-sm">
                ✦ {profile.currentTitle ?? profile.levelTitle}
              </span>
              {profile.allTitles.length > 1 && (
                <button
                  onClick={() => setShowTitles(true)}
                  className="text-[11px] text-gray-500 hover:text-indigo-400 transition-colors underline"
                >
                  Change
                </button>
              )}
            </div>

            {/* XP bar */}
            <div className="mt-3">
              <XPBar
                xpIntoLevel={profile.xpIntoLevel}
                xpForNextLevel={profile.xpForNextLevel}
                pct={profile.xpProgressPct}
              />
            </div>
          </div>

          {/* Export button */}
          <button
            onClick={() => setShowExport(true)}
            title="Export Curator Card"
            className="shrink-0 text-indigo-500 hover:text-indigo-300 text-xl transition-colors"
          >
            ↓
          </button>
        </div>

        {/* Total XP */}
        <p className="text-xs text-gray-600 mt-3 text-right">
          {profile.xp.toLocaleString()} total XP
          {profile.firstRecoveryDate && ` · First recovery ${formatDate(profile.firstRecoveryDate)}`}
        </p>
      </div>

      {/* Stats */}
      <div>
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Curator Stats</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { label: 'Songs',       value: stats.songsRecovered },
            { label: 'Albums',      value: stats.albumsCompleted },
            { label: 'Concerts',    value: stats.concertsCreated },
            { label: 'Festivals',   value: stats.festivalsCreated },
            { label: 'Tours',       value: stats.toursCreated },
            { label: 'Challenges',  value: stats.challengesCompleted },
            { label: 'Rare Songs',  value: stats.rareSongsFound },
            { label: 'Correct %',   value: `${stats.correctGuessPct}%` },
          ] as { label: string; value: string | number }[]).map(({ label, value }) => (
            <div key={label} className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-3 text-center">
              <p className="text-white font-bold text-xl">{value}</p>
              <p className="text-gray-500 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Legendary / Mythic highlight */}
      {(stats.legendarySongsFound > 0 || stats.mythicSongsFound > 0) && (
        <div className="flex gap-3">
          {stats.legendarySongsFound > 0 && (
            <div className="flex-1 bg-purple-950/30 border border-purple-800/40 rounded-xl p-3 text-center">
              <p className="text-purple-300 font-bold text-2xl">{stats.legendarySongsFound}</p>
              <p className="text-purple-400/70 text-xs">🟣 Legendary Songs</p>
            </div>
          )}
          {stats.mythicSongsFound > 0 && (
            <div className="flex-1 bg-orange-950/30 border border-orange-800/40 rounded-xl p-3 text-center">
              <p className="text-orange-300 font-bold text-2xl">{stats.mythicSongsFound}</p>
              <p className="text-orange-400/70 text-xs">🟠 Mythic Songs</p>
            </div>
          )}
        </div>
      )}

      {/* Badges */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Badges</h3>
          <span className="text-gray-600 text-xs">{unlockedCount}/{profile.badges.length} unlocked</span>
        </div>
        <BadgeGrid badges={profile.badges} />
      </div>

      {/* Titles */}
      {profile.titlesUnlocked.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Earned Titles</h3>
          <div className="flex flex-wrap gap-2">
            {profile.titlesUnlocked.map(t => (
              <span key={t} className="text-xs px-2 py-1 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-700/40 font-semibold">
                ✦ {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {profile.recentActivity.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Recent Activity</h3>
          <div className="space-y-1.5">
            {profile.recentActivity.slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-gray-900/50 border border-gray-800/40">
                <span className="text-base">{a.icon}</span>
                <p className="text-gray-300 text-sm truncate flex-1">{a.label}</p>
                <span className="text-gray-600 text-xs shrink-0">{formatDate(a.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {profile.stats.songsRecovered === 0 && (
        <div className="text-center py-8 text-gray-600 text-sm">
          <p className="text-4xl mb-3">🎵</p>
          <p>Your curator journey begins with the first song.</p>
          <p className="text-xs mt-1">Play Band RPG to start building your legacy.</p>
        </div>
      )}

      {/* Modals */}
      {showExport && (
        <CuratorExportModal profile={profile} onClose={() => setShowExport(false)} />
      )}
      {showTitles && (
        <TitleSelectorModal
          profile={profile}
          onSelect={(t) => setTitle.mutate(t)}
          onClose={() => setShowTitles(false)}
        />
      )}
    </div>
  );
}

// ── Rival Events & Challenges (Phase X) ───────────────────────────────────────

const DIFFICULTY_BADGE: Record<string, { label: string; className: string }> = {
  easy:      { label: 'Easy',      className: 'text-green-400 bg-green-900/30 border border-green-800/50' },
  medium:    { label: 'Medium',    className: 'text-yellow-400 bg-yellow-900/30 border border-yellow-800/50' },
  hard:      { label: 'Hard',      className: 'text-orange-400 bg-orange-900/30 border border-orange-800/50' },
  legendary: { label: 'Legendary', className: 'text-red-400 bg-red-900/30 border border-red-800/50' },
};

const TIER_BADGE: Record<string, { label: string; className: string }> = {
  bronze:   { label: '🥉 Bronze',   className: 'text-amber-600 bg-amber-900/20 border border-amber-800/40' },
  silver:   { label: '🥈 Silver',   className: 'text-gray-300 bg-gray-700/40 border border-gray-600/40' },
  gold:     { label: '🥇 Gold',     className: 'text-yellow-400 bg-yellow-900/30 border border-yellow-700/40' },
  platinum: { label: '🏆 Platinum', className: 'text-cyan-300 bg-cyan-900/30 border border-cyan-700/40' },
};

function ChallengeDifficultyBadge({ difficulty }: { difficulty: string }) {
  const b = DIFFICULTY_BADGE[difficulty] ?? { label: difficulty, className: 'text-gray-400 bg-gray-800' };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${b.className}`}>{b.label}</span>;
}

function ChallengeTierBadge({ tier }: { tier: string }) {
  const b = TIER_BADGE[tier] ?? { label: tier, className: 'text-gray-400 bg-gray-800' };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${b.className}`}>{b.label}</span>;
}

function ChallengeObjectiveTags({ ch }: { ch: BandRpgChallenge }) {
  const tags: string[] = [];
  if (ch.minChemistry  != null) tags.push(`Chemistry ≥ ${ch.minChemistry}`);
  if (ch.minVariety    != null) tags.push(`Variety ≥ ${ch.minVariety}`);
  if (ch.minMomentum   != null) tags.push(`Momentum ≥ ${ch.minMomentum}`);
  if (ch.minPrestige   != null) tags.push(`Prestige ≥ ${ch.minPrestige}`);
  if (ch.minDiversity  != null) tags.push(`Diversity ≥ ${ch.minDiversity}`);
  if (ch.minDeepCut    != null) tags.push(`Deep Cuts ≥ ${ch.minDeepCut}`);
  if (ch.minFanService != null) tags.push(`Fan Service ≥ ${ch.minFanService}`);
  if (ch.minRareSongs  != null) tags.push(`Rare Songs ≥ ${ch.minRareSongs}`);
  if (ch.minAlbums     != null) tags.push(`Albums ≥ ${ch.minAlbums}`);
  if (ch.minStopCount  != null) tags.push(`Stops ≥ ${ch.minStopCount}`);
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tags.map(t => (
        <span key={t} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-mono border border-gray-700/50">
          {t}
        </span>
      ))}
      {ch.targetAudience && (
        <span className="text-xs px-2 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-800/40">
          {ch.targetAudience}
        </span>
      )}
    </div>
  );
}

function drawChallengeCard(
  ctx: CanvasRenderingContext2D,
  data: {
    challengeName: string;
    description:   string;
    tier:          string;
    entityName:    string;
    metricScore:   number;
    rivalName:     string | null;
    rewardTitle:   string | null;
    rewardBadge:   string | null;
    difficulty:    string;
  },
): void {
  const W = 900, H = 1200, PAD = 60;

  // Background gradient — dark crimson to deep bronze
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,    '#1a0505');
  bg.addColorStop(0.45, '#2d1a00');
  bg.addColorStop(1,    '#0d0505');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Outer gold border
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth   = 4;
  ctx.strokeRect(12, 12, W - 24, H - 24);

  // Inner border
  ctx.strokeStyle = '#6b4309';
  ctx.lineWidth   = 1;
  ctx.strokeRect(22, 22, W - 44, H - 44);

  ctx.textAlign = 'center';

  // Header
  ctx.fillStyle = '#ffd700';
  ctx.font      = 'bold 28px serif';
  ctx.fillText('⚔  CHALLENGE VICTORY', W / 2, 78);

  // Tier
  const TIER_COLORS: Record<string, string> = {
    platinum: '#e5e4e2', gold: '#ffd700', silver: '#c0c0c0', bronze: '#cd7f32',
  };
  const tierColor = TIER_COLORS[data.tier] ?? '#ffd700';
  ctx.fillStyle = tierColor;
  ctx.font      = 'bold 72px serif';
  ctx.fillText(data.tier.toUpperCase(), W / 2, 175);

  // Challenge name
  ctx.fillStyle = '#f5e6c8';
  ctx.font      = 'bold 38px serif';
  ctx.fillText(truncateForCanvas(ctx, data.challengeName, W - PAD * 2), W / 2, 250);

  // Entity name
  ctx.fillStyle = '#c0a060';
  ctx.font      = '22px sans-serif';
  ctx.fillText(truncateForCanvas(ctx, data.entityName, W - PAD * 2), W / 2, 292);

  // Divider
  ctx.strokeStyle = '#6b4309';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 320); ctx.lineTo(W - PAD, 320); ctx.stroke();

  // Description
  ctx.fillStyle = '#d4b896';
  ctx.font      = '21px sans-serif';
  ctx.fillText(truncateForCanvas(ctx, data.description, W - PAD * 2), W / 2, 362);

  // Rival
  let nextY = 420;
  if (data.rivalName) {
    ctx.fillStyle = '#ff8080';
    ctx.font      = 'bold 18px sans-serif';
    ctx.fillText('RIVAL DEFEATED', W / 2, nextY);
    nextY += 40;
    ctx.fillStyle = '#f5c0c0';
    ctx.font      = '28px serif';
    ctx.fillText(truncateForCanvas(ctx, data.rivalName, W - PAD * 2), W / 2, nextY);
    nextY += 60;
  }

  // Score
  ctx.strokeStyle = '#6b4309';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(PAD, nextY); ctx.lineTo(W - PAD, nextY); ctx.stroke();
  nextY += 30;
  ctx.fillStyle = '#9ca3af';
  ctx.font      = '18px sans-serif';
  ctx.fillText('SCORE', W / 2, nextY);
  nextY += 10;
  ctx.fillStyle = tierColor;
  ctx.font      = 'bold 80px serif';
  ctx.fillText(String(Math.round(data.metricScore)), W / 2, nextY + 80);
  nextY += 110;

  // Reward title
  if (data.rewardTitle) {
    ctx.strokeStyle = '#6b4309';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(PAD, nextY + 20); ctx.lineTo(W - PAD, nextY + 20); ctx.stroke();
    nextY += 50;
    ctx.fillStyle = '#ffd700';
    ctx.font      = 'bold 20px sans-serif';
    ctx.fillText('TITLE UNLOCKED', W / 2, nextY);
    nextY += 44;
    const badge = data.rewardBadge ? `${data.rewardBadge}  ` : '';
    ctx.fillStyle = '#fff8e1';
    ctx.font      = 'bold 34px serif';
    ctx.fillText(`${badge}${data.rewardTitle}`, W / 2, nextY);
  }

  // Difficulty
  const DIFF_COLORS: Record<string, string> = {
    easy: '#4ade80', medium: '#fbbf24', hard: '#f97316', legendary: '#ef4444',
  };
  ctx.fillStyle = DIFF_COLORS[data.difficulty] ?? '#9ca3af';
  ctx.font      = 'bold 16px sans-serif';
  ctx.fillText(data.difficulty.toUpperCase() + ' CHALLENGE', W / 2, H - 90);

  ctx.fillStyle = '#6b5a3e';
  ctx.font      = '15px sans-serif';
  ctx.fillText('Band RPG — The Archive', W / 2, H - 55);
}

function ChallengeExportModal({
  data,
  onClose,
}: {
  data: {
    challengeName: string; description: string; tier: string; entityName: string;
    metricScore: number; rivalName: string | null; rewardTitle: string | null;
    rewardBadge: string | null; difficulty: string;
  };
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = 900;
    canvas.height = 1200;
    drawChallengeCard(ctx, data);
  }, [data]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href     = canvas.toDataURL('image/png');
    a.download = `challenge-victory-${data.tier}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-white font-semibold text-sm">Victory Card</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">×</button>
        </div>
        <div className="p-4">
          <canvas ref={canvasRef} className="w-full rounded border border-gray-700" />
          <button
            onClick={handleDownload}
            className="mt-3 w-full py-2 rounded-lg bg-yellow-700/40 hover:bg-yellow-700/60 text-yellow-300 text-sm font-semibold transition-colors"
          >
            Download PNG
          </button>
        </div>
      </div>
    </div>
  );
}

type EntityOption = {
  id: string;
  label: string;
  metrics: {
    chemistry?: number; variety?: number; momentum?: number; prestige?: number;
    diversity?: number; deepCut?: number; fanService?: number; stopCount?: number;
  };
};

function AttemptModal({
  challenge,
  stats,
  onClose,
  onSubmitted,
}: {
  challenge:   BandRpgChallenge;
  stats:       BandRpgChallengeStats;
  onClose:     () => void;
  onSubmitted: () => void;
}) {
  const queryClient                  = useQueryClient();
  const [selectedId, setSelectedId]  = useState('');
  const [result, setResult]          = useState<ChallengeAttemptResult | null>(null);
  const [showExport, setShowExport]  = useState(false);

  const isFestival  = challenge.type === 'festival' || challenge.type === 'dream_festival';
  const isTour      = challenge.type === 'tour';
  const isConcert   = challenge.type === 'concert';
  const isSetlist   = challenge.type === 'setlist';
  const isCollection = challenge.type === 'collection';

  const { data: festivals } = useQuery({
    queryKey: ['band-rpg-festivals'],
    queryFn:  () => bandRpgApi.getFestivals(),
    enabled:  isFestival,
  });
  const { data: tours } = useQuery({
    queryKey: ['band-rpg-tours'],
    queryFn:  () => bandRpgApi.getTours(),
    enabled:  isTour,
  });
  const { data: concerts } = useQuery({
    queryKey: ['band-rpg-concerts'],
    queryFn:  () => bandRpgApi.getConcerts(),
    enabled:  isConcert,
  });
  const { data: setlists } = useQuery({
    queryKey: ['band-rpg-setlists'],
    queryFn:  () => bandRpgApi.getSetlists(),
    enabled:  isSetlist,
  });

  const entityOptions = useMemo((): EntityOption[] => {
    if (isCollection) return [];
    if (isFestival && festivals) {
      return (challenge.type === 'dream_festival' ? festivals.filter(f => f.isDream) : festivals)
        .map(f => ({
          id:      f.id,
          label:   f.name,
          metrics: {
            chemistry:  f.chemistry.chemistryScore,
            prestige:   f.prestige.prestigeScore,
            fanService: f.avgFanService,
            deepCut:    f.avgDeepCuts,
            diversity:  f.audience.audienceDiversityScore,
            stopCount:  f.concertCount,
          },
        }));
    }
    if (isTour && tours) {
      return tours.map(t => ({
        id:      t.id,
        label:   t.name,
        metrics: { momentum: t.momentum, variety: t.variety, stopCount: t.stops.length },
      }));
    }
    if (isConcert && concerts) {
      return concerts.map(c => ({
        id:      c.id,
        label:   c.concertName,
        metrics: { fanService: c.fanServiceScore, deepCut: c.deepCutScore },
      }));
    }
    if (isSetlist && setlists) {
      return setlists.map(s => ({
        id:      s.id,
        label:   s.name,
        metrics: {},
      }));
    }
    return [];
  }, [isFestival, isTour, isConcert, isSetlist, isCollection, festivals, tours, concerts, setlists, challenge.type]);

  const selected = entityOptions.find(e => e.id === selectedId);

  const attempt = useMutation({
    mutationFn: async () => {
      if (isCollection) {
        return bandRpgApi.attemptChallenge(challenge.id, {
          entityType: 'collection',
          entityId:   '',
          entityName: 'My Collection',
        });
      }
      if (!selected) throw new Error('Please select an entity first');
      return bandRpgApi.attemptChallenge(challenge.id, {
        entityType: challenge.type,
        entityId:   selected.id,
        entityName: selected.label,
        ...selected.metrics,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-challenges'] });
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-challenge-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-challenge-history'] });
      onSubmitted();
    },
  });

  const entityLabel =
    isCollection ? 'My Collection' :
    isFestival   ? 'Festival' :
    isTour       ? 'Tour' :
    isConcert    ? 'Concert' :
    'Setlist';

  const canSubmit = isCollection || !!selected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold">Attempt Challenge</span>
              <ChallengeDifficultyBadge difficulty={challenge.difficulty} />
            </div>
            <p className="text-amber-400 font-bold mt-0.5">{challenge.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Challenge details */}
          <p className="text-gray-300 text-sm">{challenge.description}</p>
          {challenge.rivalName && (
            <div className="bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
              <p className="text-red-400 text-xs font-semibold mb-0.5">RIVAL: {challenge.rivalName}</p>
              {challenge.rivalDesc && <p className="text-red-300/70 text-xs">{challenge.rivalDesc}</p>}
            </div>
          )}
          <ChallengeObjectiveTags ch={challenge} />

          {/* Entity picker */}
          {!isCollection && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Select {entityLabel}</label>
              {entityOptions.length === 0 ? (
                <p className="text-gray-500 text-sm">No {entityLabel.toLowerCase()}s found. Build one first.</p>
              ) : (
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="">— choose —</option>
                  {entityOptions.map(e => (
                    <option key={e.id} value={e.id}>{e.label}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Metrics preview */}
          {selected && Object.keys(selected.metrics).length > 0 && (
            <div className="bg-gray-800/60 rounded-lg px-3 py-3">
              <p className="text-xs text-gray-400 mb-2 font-semibold">SELECTED METRICS</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {(Object.entries(selected.metrics) as [string, number | undefined][]).map(([k, v]) => {
                  if (v == null) return null;
                  const label = k === 'stopCount' ? 'Stops' : k.charAt(0).toUpperCase() + k.slice(1);
                  const min = (challenge as unknown as Record<string, number | null>)[`min${k.charAt(0).toUpperCase() + k.slice(1)}`];
                  const passing = min == null || v >= min;
                  return (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">{label}</span>
                      <span className={`text-xs font-mono font-semibold ${passing ? 'text-green-400' : 'text-red-400'}`}>
                        {Math.round(v)}{!passing && min != null ? ` / ${min}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collection stats for collection challenges */}
          {isCollection && (
            <div className="bg-gray-800/60 rounded-lg px-3 py-3">
              <p className="text-xs text-gray-400 mb-2 font-semibold">COLLECTION STATS</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Rare Songs</span>
                  <span className={`text-xs font-mono font-semibold ${challenge.minRareSongs == null || stats.rareSongsCount >= challenge.minRareSongs ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.rareSongsCount}{challenge.minRareSongs != null ? ` / ${challenge.minRareSongs}` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Albums Done</span>
                  <span className={`text-xs font-mono font-semibold ${challenge.minAlbums == null || stats.albumsCompleted >= challenge.minAlbums ? 'text-green-400' : 'text-red-400'}`}>
                    {stats.albumsCompleted}{challenge.minAlbums != null ? ` / ${challenge.minAlbums}` : ''}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-lg px-4 py-3 ${result.achieved ? 'bg-green-950/40 border border-green-800/50' : 'bg-red-950/30 border border-red-900/40'}`}>
              <p className={`font-semibold text-sm ${result.achieved ? 'text-green-300' : 'text-red-400'}`}>
                {result.message}
              </p>
              {result.achieved && result.tier && (
                <div className="mt-2 flex items-center gap-2">
                  <ChallengeTierBadge tier={result.tier} />
                  <button
                    onClick={() => setShowExport(true)}
                    className="text-xs text-yellow-400 hover:text-yellow-300 underline"
                  >
                    Export Victory Card
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {attempt.isError && (
            <p className="text-red-400 text-xs">{String(attempt.error)}</p>
          )}

          {/* Actions */}
          {!result && (
            <button
              onClick={() => attempt.mutate()}
              disabled={attempt.isPending || !canSubmit}
              className="w-full py-2.5 rounded-lg bg-red-900/50 hover:bg-red-800/60 text-red-200 font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {attempt.isPending ? 'Evaluating…' : '⚔ Attempt Challenge'}
            </button>
          )}
          {result && (
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {showExport && result?.achieved && result.tier && (
        <ChallengeExportModal
          data={{
            challengeName: challenge.name,
            description:   challenge.description,
            tier:          result.tier,
            entityName:    selected?.label ?? 'My Collection',
            metricScore:   result.metricScore,
            rivalName:     challenge.rivalName,
            rewardTitle:   challenge.rewardTitle,
            rewardBadge:   challenge.rewardBadge,
            difficulty:    challenge.difficulty,
          }}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

function ChallengeCard({
  challenge,
  stats,
  onAttemptDone,
}: {
  challenge:    BandRpgChallenge;
  stats:        BandRpgChallengeStats;
  onAttemptDone: () => void;
}) {
  const [showAttempt, setShowAttempt] = useState(false);
  const best = challenge.bestAttempt;

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 flex flex-col gap-3 ${
      best?.achieved
        ? 'border-yellow-700/40'
        : 'border-gray-700/60'
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-sm">{challenge.name}</span>
            <ChallengeDifficultyBadge difficulty={challenge.difficulty} />
            {best?.achieved && best.tier && <ChallengeTierBadge tier={best.tier} />}
          </div>
          <p className="text-gray-400 text-xs mt-1 leading-relaxed">{challenge.description}</p>
        </div>
        {challenge.rewardBadge && (
          <span className="text-2xl shrink-0">{challenge.rewardBadge}</span>
        )}
      </div>

      {/* Rival */}
      {challenge.rivalName && (
        <div className="flex items-center gap-2">
          <span className="text-red-500 text-xs">⚔</span>
          <span className="text-red-400 text-xs font-semibold">{challenge.rivalName}</span>
        </div>
      )}

      {/* Objective tags */}
      <ChallengeObjectiveTags ch={challenge} />

      {/* Reward */}
      {challenge.rewardTitle && (
        <p className="text-xs text-yellow-500/70">
          Reward: <span className="text-yellow-400">{challenge.rewardTitle}</span>
        </p>
      )}

      {/* Best attempt info */}
      {best && (
        <p className="text-xs text-gray-500">
          {best.achieved
            ? `Best: scored ${Math.round(best.metricScore)} with "${best.entityName}"`
            : `Last attempt: ${Math.round(best.metricScore)} with "${best.entityName}" — not yet achieved`}
          {challenge.totalAttempts > 1 && ` (${challenge.totalAttempts} attempts)`}
        </p>
      )}

      {/* Attempt button */}
      <button
        onClick={() => setShowAttempt(true)}
        className="py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-300 text-xs font-semibold transition-colors border border-red-900/30"
      >
        ⚔ Attempt
      </button>

      {showAttempt && (
        <AttemptModal
          challenge={challenge}
          stats={stats}
          onClose={() => setShowAttempt(false)}
          onSubmitted={() => {
            setShowAttempt(false);
            onAttemptDone();
          }}
        />
      )}
    </div>
  );
}

const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'legendary'];

function ChallengeHistoryList({ history }: { history: BandRpgChallengeHistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <div>
      <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Recent Attempts</h3>
      <div className="space-y-2">
        {history.slice(0, 12).map(entry => (
          <div key={entry.id} className="flex items-center gap-3 py-2 px-3 bg-gray-900/60 rounded-lg border border-gray-800/60">
            <span className="text-lg">{entry.rewardBadge ?? '⚔'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{entry.challengeName}</p>
              <p className="text-xs text-gray-500 truncate">{entry.entityName} · {formatDate(entry.completedAt)}</p>
            </div>
            <div className="shrink-0">
              {entry.achieved && entry.tier
                ? <ChallengeTierBadge tier={entry.tier} />
                : <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">Failed</span>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChallengesTab() {
  const queryClient = useQueryClient();

  const { data: challenges = [], isLoading: loadingChallenges } = useQuery({
    queryKey: ['band-rpg-challenges'],
    queryFn:  () => bandRpgApi.getChallenges(),
  });

  const { data: stats } = useQuery({
    queryKey: ['band-rpg-challenge-stats'],
    queryFn:  () => bandRpgApi.getChallengeStats(),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['band-rpg-challenge-history'],
    queryFn:  () => bandRpgApi.getChallengeHistory(),
  });

  const generate = useMutation({
    mutationFn: () => bandRpgApi.generateChallenge(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['band-rpg-challenges'] });
    },
  });

  const handleAttemptDone = () => {
    void queryClient.invalidateQueries({ queryKey: ['band-rpg-challenges'] });
    void queryClient.invalidateQueries({ queryKey: ['band-rpg-challenge-stats'] });
    void queryClient.invalidateQueries({ queryKey: ['band-rpg-challenge-history'] });
  };

  const defaultStats: BandRpgChallengeStats = {
    totalAttempts: 0, achievedAttempts: 0, bestTier: null,
    titlesUnlocked: [], challengesCompleted: 0, rareSongsCount: 0, albumsCompleted: 0,
  };
  const s = stats ?? defaultStats;

  // Group challenges by difficulty
  const byDifficulty = useMemo(() => {
    const map = new Map<string, BandRpgChallenge[]>();
    for (const d of DIFFICULTY_ORDER) map.set(d, []);
    for (const ch of challenges) {
      const list = map.get(ch.difficulty);
      if (list) list.push(ch);
      else map.set(ch.difficulty, [ch]);
    }
    return map;
  }, [challenges]);

  if (loadingChallenges) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-red-500/60 border-t-red-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Completed',   value: s.challengesCompleted },
          { label: 'Best Tier',   value: s.bestTier ? s.bestTier.charAt(0).toUpperCase() + s.bestTier.slice(1) : '—' },
          { label: 'Rare Songs',  value: s.rareSongsCount },
          { label: 'Albums Done', value: s.albumsCompleted },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 border border-gray-700/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Titles unlocked */}
      {s.titlesUnlocked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {s.titlesUnlocked.map(t => (
            <span key={t} className="text-xs px-2 py-1 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-700/40 font-semibold">
              ★ {t}
            </span>
          ))}
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="px-4 py-2 rounded-lg bg-red-900/40 hover:bg-red-800/50 text-red-300 text-sm font-semibold border border-red-900/40 transition-colors disabled:opacity-50"
        >
          {generate.isPending ? 'Generating…' : '⚔ Generate New Challenge'}
        </button>
        <p className="text-xs text-gray-500">Weighted random — from Easy to Legendary</p>
      </div>

      {/* Challenge grid by difficulty */}
      {DIFFICULTY_ORDER.map(diff => {
        const group = byDifficulty.get(diff) ?? [];
        if (group.length === 0) return null;
        const badge = DIFFICULTY_BADGE[diff] ?? { label: diff, className: '' };
        return (
          <div key={diff}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${badge.className}`}>{badge.label}</span>
              <span className="text-gray-600 text-xs">{group.filter(c => c.bestAttempt?.achieved).length}/{group.length} completed</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {group.map(ch => (
                <ChallengeCard
                  key={ch.id}
                  challenge={ch}
                  stats={s}
                  onAttemptDone={handleAttemptDone}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* History */}
      <ChallengeHistoryList history={history} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type CollectionTab = 'songs' | 'albums' | 'setlists' | 'concerts' | 'festivals' | 'tours' | 'challenges' | 'curator';

const TABS: { id: CollectionTab; label: string }[] = [
  { id: 'songs',      label: '🎵 Songs'      },
  { id: 'albums',     label: '💿 Albums'     },
  { id: 'setlists',   label: '🎸 Setlists'   },
  { id: 'concerts',   label: '🎤 Concerts'   },
  { id: 'festivals',  label: '🎪 Festivals'  },
  { id: 'tours',      label: '🗺️ Tours'     },
  { id: 'challenges', label: '⚔ Challenges' },
  { id: 'curator',    label: '👤 Curator'    },
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

      {/* Tab bar — scrollable on mobile so all 5 tabs are always reachable */}
      <div className="overflow-x-auto bg-black/20 border-b border-gray-800 shrink-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-1 px-4 py-2.5 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'songs'      && <SongsTab />}
        {activeTab === 'albums'     && <AlbumsTab />}
        {activeTab === 'setlists'   && <SetlistsTab />}
        {activeTab === 'concerts'   && <ConcertsTab />}
        {activeTab === 'festivals'  && <FestivalsTab />}
        {activeTab === 'tours'      && <ToursTab />}
        {activeTab === 'challenges' && <ChallengesTab />}
        {activeTab === 'curator'    && <CuratorTab />}
      </div>
    </div>
  );
}

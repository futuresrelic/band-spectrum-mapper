import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  bandRpgApi,
  type CommunityHub,
  type CommunityCuratorCard,
  type CommunityFestivalCard,
  type CommunityTourCard,
  type LeaderboardEntry,
  type DiscoverCuratorItem,
  type DiscoverFestivalItem,
  type DiscoverTourItem,
} from '../api/bandRpg';
import SiteHeader from '../components/layout/SiteHeader';

// ── Card components ───────────────────────────────────────────────────────────

function CuratorMiniCard({ c, url }: { c: CommunityCuratorCard; url: string }) {
  return (
    <Link
      to={url}
      className="flex flex-col gap-2 bg-gray-900/60 border border-gray-800 rounded-xl p-4 hover:border-indigo-700/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-950 border border-indigo-800 flex items-center justify-center text-xl shrink-0">
          🎵
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">{c.displayName}</p>
          <p className="text-indigo-300 text-xs truncate">{c.title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="bg-indigo-900/50 text-indigo-300 text-[10px] px-2 py-0.5 rounded-full border border-indigo-800/40">
          Lv {c.level}
        </span>
        <span className="bg-gray-800 text-gray-400 text-[10px] px-2 py-0.5 rounded-full">
          {c.label}
        </span>
        {c.badgeCount > 0 && (
          <span className="text-gray-600 text-[10px]">
            {c.badgeCount} badge{c.badgeCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </Link>
  );
}

function FestivalMiniCard({ f, url }: { f: CommunityFestivalCard; url: string }) {
  return (
    <Link
      to={url}
      className="flex flex-col gap-2 bg-gray-900/60 border border-gray-800 rounded-xl p-4 hover:border-amber-700/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        {f.isDream && <span className="text-yellow-400 text-sm shrink-0">✦</span>}
        <p className="text-white text-sm font-semibold truncate">{f.name}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-xs">
          {f.concertCount} concert{f.concertCount !== 1 ? 's' : ''}
        </span>
        <span className="bg-amber-900/40 text-amber-300 text-[10px] px-2 py-0.5 rounded-full border border-amber-800/40">
          {f.label}
        </span>
      </div>
    </Link>
  );
}

function TourMiniCard({ t, url }: { t: CommunityTourCard; url: string }) {
  return (
    <Link
      to={url}
      className="flex flex-col gap-2 bg-gray-900/60 border border-gray-800 rounded-xl p-4 hover:border-teal-700/50 transition-colors"
    >
      <p className="text-white text-sm font-semibold truncate">{t.name}</p>
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-xs">
          {t.stopCount} stop{t.stopCount !== 1 ? 's' : ''}
        </span>
        <span className="bg-teal-900/40 text-teal-300 text-[10px] px-2 py-0.5 rounded-full border border-teal-800/40">
          {t.label}
        </span>
      </div>
    </Link>
  );
}

function EmptySlot({ label, icon, colour }: {
  label:  string;
  icon:   string;
  colour: 'indigo' | 'amber' | 'teal';
}) {
  const cls = {
    indigo: 'border-indigo-900/30 text-indigo-800',
    amber:  'border-amber-900/30  text-amber-800',
    teal:   'border-teal-900/30   text-teal-800',
  }[colour];
  return (
    <div className={`flex flex-col items-center justify-center gap-2 bg-gray-900/30 border ${cls} rounded-xl p-4 min-h-[84px]`}>
      <span className="text-2xl opacity-20">{icon}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

// ── Leaderboard row ───────────────────────────────────────────────────────────

const RANK_RING = ['text-yellow-400', 'text-gray-300', 'text-amber-600'] as const;

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const rankColour = entry.rank <= 3
    ? (RANK_RING[entry.rank - 1] ?? 'text-gray-500')
    : 'text-gray-600';

  return (
    <Link
      to={`/band-rpg/curator/${entry.userId}`}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800/40 transition-colors"
    >
      <span className={`text-sm font-black w-5 text-right shrink-0 ${rankColour}`}>
        {entry.rank}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{entry.displayName}</p>
        <p className="text-gray-500 text-xs truncate">{entry.title} · Lv {entry.level}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-white text-sm font-bold">{entry.score.toLocaleString()}</p>
        <p className="text-gray-600 text-[10px]">{entry.scoreLabel}</p>
      </div>
    </Link>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ hub, onSurprise, isSurprising }: {
  hub:         CommunityHub;
  onSurprise:  () => void;
  isSurprising: boolean;
}) {
  const { stats, featured, spotlights } = hub;

  return (
    <div className="flex flex-col gap-8">

      {/* Community stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {([
          { label: 'Curators',    value: stats.publicCurators.toLocaleString() },
          { label: 'Festivals',   value: stats.publicFestivals.toLocaleString() },
          { label: 'Tours',       value: stats.publicTours.toLocaleString() },
          { label: 'Songs Found', value: stats.totalSongsRecovered.toLocaleString() },
          { label: 'Challenges',  value: stats.totalChallengesCompleted.toLocaleString() },
        ]).map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center gap-0.5 bg-gray-900/60 border border-gray-800 rounded-xl px-3 py-3">
            <span className="text-white text-xl font-bold leading-tight">{value}</span>
            <span className="text-gray-500 text-[11px] uppercase tracking-wide">{label}</span>
          </div>
        ))}
      </div>

      {/* Spotlight of the week */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-gray-400 text-xs uppercase tracking-widest">Spotlight This Week</h2>
          <button
            onClick={onSurprise}
            disabled={isSurprising}
            className="flex items-center gap-1.5 text-xs bg-purple-900/40 text-purple-300 border border-purple-700/40 px-3 py-1.5 rounded-lg hover:bg-purple-800/40 disabled:opacity-50 transition-colors"
          >
            <span>🎲</span>
            <span>{isSurprising ? 'Finding...' : 'Surprise Me'}</span>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {spotlights.curatorOfWeek
            ? <CuratorMiniCard c={spotlights.curatorOfWeek} url={`/band-rpg/curator/${spotlights.curatorOfWeek.userId}`} />
            : <EmptySlot label="Curator of the Week" icon="🎵" colour="indigo" />}
          {spotlights.festivalOfWeek
            ? <FestivalMiniCard f={spotlights.festivalOfWeek} url={`/band-rpg/festival/${spotlights.festivalOfWeek.id}`} />
            : <EmptySlot label="Festival of the Week" icon="🎪" colour="amber" />}
          {spotlights.tourOfWeek
            ? <TourMiniCard t={spotlights.tourOfWeek} url={`/band-rpg/tour/${spotlights.tourOfWeek.id}`} />
            : <EmptySlot label="Tour of the Week" icon="🚌" colour="teal" />}
        </div>
      </div>

      {/* Top of the archive */}
      {(featured.curator || featured.festival || featured.tour) && (
        <div>
          <h2 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Top of the Archive</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {featured.curator && (
              <CuratorMiniCard c={featured.curator} url={`/band-rpg/curator/${featured.curator.userId}`} />
            )}
            {featured.festival && (
              <FestivalMiniCard f={featured.festival} url={`/band-rpg/festival/${featured.festival.id}`} />
            )}
            {featured.tour && (
              <TourMiniCard t={featured.tour} url={`/band-rpg/tour/${featured.tour.id}`} />
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────

const LB_TYPES = [
  { key: 'curators',          label: 'Curators'       },
  { key: 'collectors',        label: 'Collectors'     },
  { key: 'festivals',         label: 'Festivals'      },
  { key: 'tours',             label: 'Tours'          },
  { key: 'challenges',        label: 'Champions'      },
  { key: 'archivists',        label: 'Archivists'     },
  { key: 'most-followed',     label: 'Most Followed'  },
  { key: 'most-saved-festivals', label: 'Saved Festivals' },
  { key: 'most-saved-tours',  label: 'Saved Tours'   },
];

const LB_PERIODS = [
  { key: 'alltime', label: 'All Time'   },
  { key: 'month',   label: 'This Month' },
  { key: 'week',    label: 'This Week'  },
];

function LeaderboardTab() {
  const [type,   setType]   = useState('curators');
  const [period, setPeriod] = useState('alltime');

  const { data, isLoading } = useQuery({
    queryKey: ['communityLeaderboard', type, period],
    queryFn:  () => bandRpgApi.getCommunityLeaderboard(type, period),
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-4">

      {/* Type tabs */}
      <div className="flex flex-wrap gap-1.5">
        {LB_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => setType(t.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              type === t.key
                ? 'bg-indigo-700 text-white border-indigo-600'
                : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Period tabs */}
      <div className="flex gap-1">
        {LB_PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              period === p.key
                ? 'text-white bg-gray-700'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Entries */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-500/60 border-t-indigo-400 animate-spin" />
        </div>
      ) : !data || data.entries.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-8">No entries yet for this period.</p>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800/60">
          {data.entries.map((entry) => (
            <LeaderboardRow key={entry.userId} entry={entry} />
          ))}
        </div>
      )}

    </div>
  );
}

// ── Discover tab ──────────────────────────────────────────────────────────────

const DISCOVER_TYPES = [
  { key: 'festival', label: 'Festivals' },
  { key: 'tour',     label: 'Tours'     },
  { key: 'curator',  label: 'Curators'  },
];

function DiscoverTab() {
  const [type,     setType]     = useState('festival');
  const [page,     setPage]     = useState(1);
  const [dreamOnly, setDreamOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['communityDiscover', type, page, dreamOnly],
    queryFn:  () => bandRpgApi.communityDiscover(
      type, page, 12,
      type === 'festival' && dreamOnly ? true : undefined,
    ),
    staleTime: 60_000,
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const changeType = (t: string) => { setType(t); setPage(1); setDreamOnly(false); };

  return (
    <div className="flex flex-col gap-4">

      {/* Type tabs + Dream filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {DISCOVER_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => changeType(t.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              type === t.key
                ? 'bg-gray-700 text-white border-gray-600'
                : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
        {type === 'festival' && (
          <button
            onClick={() => { setDreamOnly(!dreamOnly); setPage(1); }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ml-2 ${
              dreamOnly
                ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700/40'
                : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-600'
            }`}
          >
            ✦ Dream Only
          </button>
        )}
      </div>

      {/* Card grid */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 rounded-full border-2 border-gray-500/60 border-t-gray-400 animate-spin" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-8">Nothing here yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {type === 'curator'
            ? (data.items as DiscoverCuratorItem[]).map((item) => (
                <CuratorMiniCard key={item.userId} c={item} url={item.url} />
              ))
            : type === 'festival'
            ? (data.items as DiscoverFestivalItem[]).map((item) => (
                <FestivalMiniCard key={item.id} f={item} url={item.url} />
              ))
            : (data.items as DiscoverTourItem[]).map((item) => (
                <TourMiniCard key={item.id} t={item} url={item.url} />
              ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-gray-500 text-xs">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {data && data.total > 0 && (
        <p className="text-gray-700 text-xs text-center">{data.total.toLocaleString()} total</p>
      )}

    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'leaderboards' | 'discover';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview',     label: 'Overview'     },
  { key: 'leaderboards', label: 'Leaderboards' },
  { key: 'discover',     label: 'Discover'     },
];

export default function CommunityPage() {
  const navigate                        = useNavigate();
  const [activeTab, setActiveTab]       = useState<TabKey>('overview');
  const [isSurprising, setIsSurprising] = useState(false);

  const hubQ = useQuery({
    queryKey: ['communityHub'],
    queryFn:  () => bandRpgApi.getCommunityHub(),
    staleTime: 5 * 60 * 1000,
  });

  const handleSurprise = async () => {
    setIsSurprising(true);
    try {
      const result = await bandRpgApi.communitySurprise();
      if (result.url) navigate(result.url);
    } catch (_err) { /* silent */ } finally {
      setIsSurprising(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <SiteHeader theme="dark" active="games" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl font-black text-white">The Archive Community</h1>
            <p className="text-gray-500 text-sm mt-1">
              Discover curators, festivals, and tours from across the archive.
            </p>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-xl p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 text-sm py-2 rounded-lg font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && (
            hubQ.isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 rounded-full border-2 border-gray-500/60 border-t-gray-400 animate-spin" />
              </div>
            ) : hubQ.data ? (
              <OverviewTab
                hub={hubQ.data}
                onSurprise={() => { void handleSurprise(); }}
                isSurprising={isSurprising}
              />
            ) : (
              <p className="text-gray-600 text-sm text-center py-8">
                Failed to load community data.
              </p>
            )
          )}

          {activeTab === 'leaderboards' && <LeaderboardTab />}
          {activeTab === 'discover'     && <DiscoverTab />}

        </div>
      </div>
    </div>
  );
}

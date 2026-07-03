import { useState, useEffect, type ReactNode } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import {
  getWikiSong,
  getWikiSongPlayerContext,
  type WikiSongPageData,
  type WikiSongPlayerContext,
} from '../../api/wiki';
import SiteHeader from '../../components/layout/SiteHeader';
import KnowledgeConfidenceBadge from '../../components/wiki/KnowledgeConfidenceBadge';
import WikiModulePlaceholder from '../../components/wiki/WikiModulePlaceholder';
import { WikiBreadcrumb, SpectrumBar } from '../../components/wiki/WikiLayout';
import {
  deriveLiveFrequency,
  LIVE_FREQUENCY_COLOR,
  LIVE_FREQUENCY_BG,
  LIVE_FREQUENCY_EMOJI,
  type LiveFrequencyTier,
} from '../../lib/liveFrequency';

// Helper: get the BG/border/glow style for a tier (returns object with text too)
function tierStyle(tier: LiveFrequencyTier) {
  const bg = LIVE_FREQUENCY_BG[tier];
  const text = LIVE_FREQUENCY_COLOR[tier].replace('-400', '-300');
  return { text, bg: bg.bg, border: bg.border, glow: bg.glow };
}

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtYear(d: string | null | undefined): string {
  if (!d) return '—';
  return String(new Date(d).getFullYear());
}

// ── Live Frequency story ───────────────────────────────────────────────────────

function generateFrequencyStory(
  data: WikiSongPageData,
): { headline: string; detail: string; confidence: 'calculated' | 'estimated' } {
  const { song, liveCache } = data;
  const lp = song.bandRpgProfile;
  const shows = liveCache?.fetchedShows ?? 0;
  const { tier } = deriveLiveFrequency(lp?.liveStatus, song.rarity);

  if (!lp || shows === 0) {
    const lines: Partial<Record<LiveFrequencyTier, string>> = {
      Mythic:        'An ultra-rare collectible — one of the hardest cards to find in this collection.',
      Legendary:     'A legendary find. Very few players have this in their archive.',
      Rare:          'A rare discovery. Most players haven\'t found this one yet.',
      Occasional:    'Less common than the average song. Worth holding onto.',
      Frequent:      'One of the more accessible songs in the collection.',
      Essential:     'A cornerstone of the catalog — frequently encountered.',
      Unclassified:  'Rarity data not yet available for this song.',
    };
    return {
      headline: lines[tier] ?? 'Rarity data not available.',
      detail: 'Live performance data not yet available for this band.',
      confidence: 'estimated',
    };
  }

  const pct = lp.performancePct;
  const plays = lp.totalPerformances;

  if (plays === 0) {
    return {
      headline: `No confirmed live performances found in ${shows.toLocaleString()} tracked concerts.`,
      detail: 'This song may have been performed under a different title, or records may be incomplete.',
      confidence: 'calculated',
    };
  }

  const playLine = `Performed ${plays.toLocaleString()} time${plays !== 1 ? 's' : ''} across ${shows.toLocaleString()} tracked concerts (${pct.toFixed(1)}% show rate).`;

  if (tier === 'Essential') {
    return {
      headline: `A guaranteed crowd moment — played at ${pct.toFixed(0)}% of concerts.`,
      detail: `${playLine} Easy to collect; almost impossible to miss live.`,
      confidence: 'calculated',
    };
  }
  if (tier === 'Frequent') {
    return {
      headline: `A regular in the rotation at ${pct.toFixed(0)}% of concerts.`,
      detail: playLine,
      confidence: 'calculated',
    };
  }
  if (tier === 'Occasional') {
    return {
      headline: `Heard occasionally — shows up in ${pct.toFixed(1)}% of setlists.`,
      detail: playLine,
      confidence: 'calculated',
    };
  }
  if (tier === 'Rare' || tier === 'Legendary') {
    return {
      headline: playLine,
      detail: `A genuinely rare live event — fans who've seen this performed are in an exclusive group.`,
      confidence: 'calculated',
    };
  }
  return {
    headline: playLine,
    detail: '',
    confidence: 'calculated',
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WikiSongPage() {
  const { songId = '' } = useParams<{ songId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const fromGame = searchParams.get('unlocked') === '1';
  const [revealed, setRevealed] = useState(!fromGame);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wiki', 'song', songId],
    queryFn: () => getWikiSong(songId),
    enabled: !!songId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: playerCtx } = useQuery({
    queryKey: ['wiki', 'song-player', songId],
    queryFn: () => getWikiSongPlayerContext(songId),
    enabled: !!songId && !!user,
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  // Unlock animation — reveal after data arrives
  useEffect(() => {
    if (fromGame && data) {
      const t = setTimeout(() => setRevealed(true), 60);
      return () => clearTimeout(t);
    }
  }, [fromGame, data]);

  if (isLoading) return <Shell><LoadingState /></Shell>;
  if (isError || !data) return <Shell><ErrorState /></Shell>;

  const { song, collectedCount, albumSiblings, bandRarityCounts, relatedByRarity, liveCache } = data;
  const lp = song.bandRpgProfile;
  const { tier, source: tierSource } = deriveLiveFrequency(lp?.liveStatus, song.rarity);
  const tStyle = tierStyle(tier);
  const frequencyStory = generateFrequencyStory(data);
  const totalShows = liveCache?.fetchedShows ?? 0;
  const primaryLyric = song.lyrics[0] ?? null;
  const axes = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;

  const navItems = [
    { id: 'hero',       label: 'Overview'   },
    { id: 'frequency',  label: 'Frequency'  },
    { id: 'live',       label: 'Live'       },
    ...(user ? [{ id: 'discovery', label: 'Discovery' }, { id: 'collection', label: 'Collection' }] : []),
    { id: 'related',    label: 'Related'    },
    { id: 'spectrum',   label: 'Spectrum'   },
    ...(primaryLyric ? [{ id: 'lyrics', label: 'Lyrics' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#070a0f]">
      <SiteHeader active="wiki" />

      <div
        style={{
          transition: 'opacity 0.65s ease-out, transform 0.65s ease-out',
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translateY(0)' : 'translateY(14px)',
        }}
      >
        {/* ── Hero ── */}
        <HeroSection song={song} fromGame={fromGame} revealed={revealed} playerCtx={playerCtx} />

        {/* ── Body ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <WikiBreadcrumb
            crumbs={[
              { label: song.band.name, to: `/wiki/bands/${song.band.slug}` },
              ...(song.album
                ? [{ label: song.album.title, to: `/wiki/albums/${song.band.slug}/${song.album.slug}` }]
                : []),
              { label: song.title, to: `/wiki/songs/${song.id}` },
            ]}
          />

          <div className="flex gap-8 items-start mt-4">
            {/* Sticky sidebar */}
            <aside className="hidden lg:block w-52 shrink-0 sticky top-20">
              <nav className="flex flex-col gap-0.5 mb-6">
                {navItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>

              {/* Mini quick stats */}
              <div className="space-y-2">
                <MiniStat label="Live Frequency" value={
                  <span className={tStyle.text}>{tier}</span>
                } />
                {lp && lp.totalPerformances > 0 && (
                  <MiniStat label="Performances" value={lp.totalPerformances.toLocaleString()} />
                )}
                <MiniStat label="Players own" value={collectedCount.toLocaleString()} />
                {song.score && (
                  <MiniStat label="Complexity" value={song.score.complexity.toFixed(1)} />
                )}
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0 space-y-10">

              {/* ── Live Frequency explainer ── */}
              <Section id="frequency" title="Live Frequency">
                <FrequencyExplainer song={song} story={frequencyStory} tier={tier} tierSource={tierSource} tStyle={tStyle} totalShows={totalShows} />
              </Section>

              {/* ── Quick stats grid ── */}
              <Section id="hero" title="At a Glance">
                <QuickStatsGrid song={song} collectedCount={collectedCount} liveCache={liveCache} tier={tier} tierSource={tierSource} />
              </Section>

              {/* ── Live history ── */}
              <Section id="live" title="Live Performance History"
                badge={lp ? <KnowledgeConfidenceBadge level="calculated" /> : undefined}
              >
                {lp ? (
                  <LiveHistoryPanel lp={lp} totalShows={totalShows} />
                ) : (
                  <WikiModulePlaceholder
                    icon="📡"
                    title="Live data not yet fetched"
                    description="An admin can fetch Setlist.fm data from the Band RPG admin panel to populate this section."
                  />
                )}
              </Section>

              {/* ── Discovery (player-specific) ── */}
              {user && (
                <Section id="discovery" title="Your Discovery">
                  <DiscoveryPanel playerCtx={playerCtx} song={song} />
                </Section>
              )}

              {/* ── Collection progress (player-specific) ── */}
              {user && playerCtx && (
                <Section id="collection" title="Collection Progress">
                  <CollectionPanel ctx={playerCtx} song={song} bandRarityCounts={bandRarityCounts} />
                </Section>
              )}

              {/* ── Related songs ── */}
              <Section id="related" title="Related Songs">
                <RelatedSongs
                  albumSiblings={albumSiblings}
                  relatedByRarity={relatedByRarity}
                  currentTier={tier}
                  bandSlug={song.band.slug}
                  albumSlug={song.album?.slug}
                />
              </Section>

              {/* ── Spectrum analysis ── */}
              <Section id="spectrum" title="Spectrum Analysis"
                badge={<KnowledgeConfidenceBadge level={song.score ? 'calculated' : 'estimated'} />}
              >
                {song.score ? (
                  <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 space-y-3">
                    {axes.map((ax) => (
                      <SpectrumBar key={ax} label={ax} value={song.score![ax]} />
                    ))}
                    {song.score.notes && (
                      <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-800 leading-relaxed">
                        {song.score.notes}
                      </p>
                    )}
                  </div>
                ) : (
                  <WikiModulePlaceholder
                    icon="📊"
                    title="Not yet scored"
                    description="Run the AI batch scorer from the admin panel to generate spectrum data."
                  />
                )}
              </Section>

              {/* ── Lyrics ── */}
              {(primaryLyric || song.isInstrumental) && (
                <Section id="lyrics" title="Lyrics">
                  {song.isInstrumental ? (
                    <p className="text-sm text-gray-500 italic">This is an instrumental track — no lyrics.</p>
                  ) : primaryLyric ? (
                    <LyricsPanel lyric={primaryLyric} />
                  ) : null}
                </Section>
              )}

              {/* ── Future module placeholders ── */}
              <Section id="modules" title="Coming Soon">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <WikiModulePlaceholder icon="🧬" title="Lyrics DNA" description="Word frequency, rhyme density, thematic fingerprint across the discography." comingSoon />
                  <WikiModulePlaceholder icon="🥁" title="Rhythm Lab" description="Tempo, time signature, sonic structure and production era analysis." comingSoon />
                  <WikiModulePlaceholder icon="🕸" title="Song Node" description="How this song connects to others via shared words, themes, and tags." comingSoon />
                  <WikiModulePlaceholder icon="🎬" title="Performances" description="Bootleg and known recordings from live concerts." comingSoon />
                  <WikiModulePlaceholder icon="💬" title="Community" description="Player ratings, comments, and fan analysis." comingSoon />
                  <WikiModulePlaceholder icon="📝" title="Your Notes" description="Personal field notes about this song, visible only to you." comingSoon />
                </div>
              </Section>

              {/* ── Admin panel ── */}
              {user?.isAdmin && (
                <Section id="admin" title="Admin">
                  <AdminPanel song={song} lp={lp} />
                </Section>
              )}

            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection({
  song,
  fromGame,
  revealed,
  playerCtx,
}: {
  song: WikiSongPageData['song'];
  fromGame: boolean;
  revealed: boolean;
  playerCtx: WikiSongPlayerContext | undefined;
}) {
  const lp = song.bandRpgProfile;
  const { tier, source } = deriveLiveFrequency(lp?.liveStatus, song.rarity);
  const tStyle = tierStyle(tier);
  const artworkUrl = song.album?.artworkUrl;

  return (
    <div className="relative overflow-hidden">
      {/* Blurred artwork background — radial spotlight centered on right side */}
      {artworkUrl && (
        <div className="absolute inset-0" aria-hidden>
          <img
            src={artworkUrl}
            alt=""
            className="absolute top-0 right-0 w-[50%] h-full object-cover blur-2xl scale-110 opacity-10"
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 80% 120% at 85% 50%, transparent 0%, #070a0f 65%)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070a0f] via-[#070a0f]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070a0f] via-transparent to-[#070a0f]/80" />
        </div>
      )}
      {!artworkUrl && (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 to-[#070a0f]" />
      )}

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Left: text */}
          <div className="flex-1 min-w-0">
            {/* Band + album eyebrow */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {song.band.logoUrl && (
                <img src={song.band.logoUrl} alt="" className="w-5 h-5 rounded object-cover opacity-80" />
              )}
              <Link
                to={`/wiki/bands/${song.band.slug}`}
                className="text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors uppercase tracking-widest"
              >
                {song.band.name}
              </Link>
              {song.album && (
                <>
                  <span className="text-gray-700">·</span>
                  <Link
                    to={`/wiki/albums/${song.band.slug}/${song.album.slug}`}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {song.album.title}
                    {song.album.year ? ` (${song.album.year})` : ''}
                  </Link>
                </>
              )}
            </div>

            {/* Song title */}
            <h1
              className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-none mb-4"
              style={{ textWrap: 'balance', letterSpacing: '-0.03em' }}
            >
              {song.title}
            </h1>

            {/* Badge row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Live Frequency — unified single badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${tStyle.bg} ${tStyle.border} ${tStyle.text}`}
                style={{
                  boxShadow: tStyle.glow,
                  transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                  transform: fromGame && revealed ? 'scale(1)' : fromGame ? 'scale(1.12)' : 'scale(1)',
                }}
              >
                <FrequencyDiamond tier={tier} />
                {tier}
                {source === 'estimated' && <span className="opacity-50 text-[9px] normal-case tracking-normal">est.</span>}
              </span>

              {/* Discovery stamp */}
              {playerCtx?.collected && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                  ✓ Discovered
                </span>
              )}
              {playerCtx && !playerCtx.collected && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-gray-600 border border-gray-800 bg-gray-900/40">
                  ❓ Not yet discovered
                </span>
              )}
            </div>

            {/* Quick meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-gray-500">
              {song.album?.title && (
                <span>Track {song.album && 'on'} {song.album.title}</span>
              )}
              {song.durationSeconds && <span>{fmtDuration(song.durationSeconds)}</span>}
              {song.isInstrumental && <span className="text-gray-600 uppercase tracking-widest text-[10px]">Instrumental</span>}
              {song.isRemix && <span className="text-gray-600 uppercase tracking-widest text-[10px]">Remix</span>}
              {song._count.ratings > 0 && <span>{song._count.ratings.toLocaleString()} ratings</span>}
            </div>
          </div>

          {/* Right: album artwork */}
          {artworkUrl && (
            <div className="shrink-0 self-start">
              <Link to={`/wiki/albums/${song.band.slug}/${song.album?.slug ?? ''}`}>
                <img
                  src={artworkUrl}
                  alt={song.album?.title ?? ''}
                  className="w-32 h-32 sm:w-44 sm:h-44 rounded-xl object-cover border border-white/10 shadow-2xl hover:border-white/20 transition-colors"
                />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Live Frequency explainer ──────────────────────────────────────────────────

function FrequencyExplainer({
  song,
  story,
  tier,
  tierSource,
  tStyle,
  totalShows,
}: {
  song: WikiSongPageData['song'];
  story: ReturnType<typeof generateFrequencyStory>;
  tier: LiveFrequencyTier;
  tierSource: 'live' | 'estimated';
  tStyle: ReturnType<typeof tierStyle>;
  totalShows: number;
}) {
  const lp = song.bandRpgProfile;

  return (
    <div className={`rounded-xl border p-5 ${tStyle.bg} ${tStyle.border}`}>
      <div className="flex items-start gap-4">
        <div className={`text-3xl font-black leading-none mt-0.5 ${tStyle.text}`}>
          {LIVE_FREQUENCY_EMOJI[tier]}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] uppercase tracking-widest font-bold mb-1 ${tStyle.text}`}>
            {tier}
            {tierSource === 'estimated' && <span className="ml-1 opacity-60 normal-case tracking-normal font-normal">(estimated from catalog data)</span>}
          </div>
          <p className="text-sm text-gray-100 leading-relaxed font-medium">{story.headline}</p>
          {story.detail && (
            <p className="text-xs text-gray-400 leading-relaxed mt-1">{story.detail}</p>
          )}
        </div>
        <KnowledgeConfidenceBadge level={story.confidence} className="shrink-0 mt-0.5" />
      </div>

      {/* Performance bar */}
      {lp && lp.totalPerformances > 0 && totalShows > 0 && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-24 shrink-0">Show coverage</span>
            <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${LIVE_FREQUENCY_COLOR[tier].replace('text-', 'bg-').replace('-400', '-500')}`}
                style={{ width: `${Math.min(lp.performancePct, 100)}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-gray-400 w-10 text-right">
              {lp.performancePct.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quick stats grid ──────────────────────────────────────────────────────────

function QuickStatsGrid({
  song,
  collectedCount,
  liveCache,
  tier,
  tierSource,
}: {
  song: WikiSongPageData['song'];
  collectedCount: number;
  liveCache: WikiSongPageData['liveCache'];
  tier: LiveFrequencyTier;
  tierSource: 'live' | 'estimated';
}) {
  const lp = song.bandRpgProfile;
  const tStyle = tierStyle(tier);

  const stats: Array<{ label: string; value: ReactNode; sub?: string; badge?: 'calculated' | 'estimated' }> = [
    {
      label: 'Live Frequency',
      value: <span className={`font-bold ${tStyle.text}`}>{tier}</span>,
      badge: tierSource === 'live' ? 'calculated' : 'estimated',
    },
    {
      label: 'Performances',
      value: lp ? lp.totalPerformances.toLocaleString() : '—',
      sub: liveCache?.fetchedShows ? `of ${liveCache.fetchedShows.toLocaleString()} tracked shows` : undefined,
      badge: lp ? 'calculated' : undefined,
    },
    {
      label: 'Show %',
      value: lp && lp.performancePct > 0 ? `${lp.performancePct.toFixed(1)}%` : '—',
      badge: lp ? 'calculated' : undefined,
    },
    {
      label: 'Players Own',
      value: collectedCount.toLocaleString(),
      badge: 'calculated',
    },
    {
      label: 'Duration',
      value: fmtDuration(song.durationSeconds),
    },
    ...(song.score ? [
      { label: 'Complexity', value: song.score.complexity.toFixed(1), badge: 'calculated' as const },
      { label: 'Aggression',  value: song.score.aggression.toFixed(1),  badge: 'calculated' as const },
      { label: 'Atmosphere',  value: song.score.atmosphere.toFixed(1),  badge: 'calculated' as const },
    ] : []),
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {stats.map((s, i) => (
        <div key={i} className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-1.5">{s.label}</div>
          <div className="text-lg font-bold text-gray-100 tabular-nums leading-none">{s.value}</div>
          {s.sub && <div className="text-[10px] text-gray-600 mt-1">{s.sub}</div>}
          {s.badge && <KnowledgeConfidenceBadge level={s.badge} className="mt-2" />}
        </div>
      ))}
    </div>
  );
}

// ── Live history ──────────────────────────────────────────────────────────────

function LiveHistoryPanel({
  lp,
  totalShows,
}: {
  lp: NonNullable<WikiSongPageData['song']['bandRpgProfile']>;
  totalShows: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Performances" value={lp.totalPerformances.toLocaleString()} />
        <StatCard label="Show Coverage" value={`${lp.performancePct.toFixed(1)}%`} />
        <StatCard label="Distinct Years" value={lp.distinctYears.toString()} />
        <StatCard label="Rarity Index" value={`${lp.rarityIndex.toFixed(0)} / 100`} sub="higher = rarer" />
      </div>

      {lp.totalPerformances > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="First Performance"
            value={fmtYear(lp.firstPerformanceDate)}
            sub={fmtDate(lp.firstPerformanceDate)}
          />
          <StatCard
            label="Last Performance"
            value={fmtYear(lp.lastPerformanceDate)}
            sub={fmtDate(lp.lastPerformanceDate)}
          />
          {lp.yearsSincePlayed !== null && (
            <StatCard
              label="Years Since Played"
              value={lp.yearsSincePlayed.toFixed(0)}
              sub="approximate"
            />
          )}
        </div>
      )}

      {totalShows > 0 && (
        <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">
            Performance coverage — {lp.totalPerformances.toLocaleString()} of {totalShows.toLocaleString()} concerts
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full"
              style={{ width: `${Math.min(lp.performancePct, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            Source: Setlist.fm · <KnowledgeConfidenceBadge level="calculated" />
          </p>
        </div>
      )}

      {lp.totalPerformances === 0 && (
        <p className="text-sm text-gray-500 italic bg-gray-900/40 border border-gray-800 rounded-xl px-4 py-3">
          No confirmed live performances found in {totalShows > 0 ? `${totalShows.toLocaleString()} tracked` : 'any tracked'} concerts.
          Records may be incomplete or the song may appear under a different title.
        </p>
      )}
    </div>
  );
}

// ── Discovery panel ───────────────────────────────────────────────────────────

function DiscoveryPanel({
  playerCtx,
  song,
}: {
  playerCtx: WikiSongPlayerContext | undefined;
  song: WikiSongPageData['song'];
}) {
  if (!playerCtx) {
    return (
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl px-5 py-4 animate-pulse">
        <div className="h-3 w-32 bg-gray-800 rounded mb-2" />
        <div className="h-3 w-48 bg-gray-800 rounded" />
      </div>
    );
  }

  if (!playerCtx.collected) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="text-3xl">❓</div>
        <div>
          <p className="text-sm font-semibold text-gray-300 mb-1">Not yet in your archive</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            Discover this song in Band RPG to unlock your personal discovery record.
          </p>
        </div>
        <Link
          to="/play/band-rpg"
          className="sm:ml-auto shrink-0 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
        >
          Play Band RPG
        </Link>
      </div>
    );
  }

  const { tier: collectedTier } = deriveLiveFrequency(null, playerCtx.frozenRarity ?? song.rarity);
  const cStyle = tierStyle(collectedTier);

  return (
    <div className={`rounded-xl border p-5 ${cStyle.bg} ${cStyle.border}`}>
      <div className="flex items-start gap-4">
        <div className="text-2xl leading-none">✓</div>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] uppercase tracking-widest font-bold mb-1 ${cStyle.text}`}>
            Discovered
          </p>
          <p className="text-sm font-semibold text-gray-100">
            Added to your archive on {fmtDate(playerCtx.collectedAt)}
          </p>
          <div className="flex flex-wrap gap-4 mt-3">
            {playerCtx.frozenRarity && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Frequency at collect</p>
                <p className={`text-sm font-bold ${cStyle.text}`}>{collectedTier}</p>
              </div>
            )}
            {playerCtx.scoreEarned != null && playerCtx.scoreEarned > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">XP earned</p>
                <p className="text-sm font-bold text-amber-300">{playerCtx.scoreEarned.toLocaleString()}</p>
              </div>
            )}
            {playerCtx.guessedCorrectly != null && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Guessed correctly</p>
                <p className={`text-sm font-bold ${playerCtx.guessedCorrectly ? 'text-emerald-400' : 'text-gray-500'}`}>
                  {playerCtx.guessedCorrectly ? 'Yes' : 'No'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Collection progress ───────────────────────────────────────────────────────

function CollectionPanel({
  ctx,
  song,
  bandRarityCounts,
}: {
  ctx: WikiSongPlayerContext;
  song: WikiSongPageData['song'];
  bandRarityCounts: WikiSongPageData['bandRarityCounts'];
}) {
  const bandPct = ctx.bandProgress.total > 0
    ? Math.round((ctx.bandProgress.owned / ctx.bandProgress.total) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Band progress */}
      <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">{song.band.name}</p>
            <p className="text-sm font-semibold text-gray-200">
              {ctx.bandProgress.owned.toLocaleString()} / {ctx.bandProgress.total.toLocaleString()} songs
            </p>
          </div>
          <span className="text-2xl font-black tabular-nums text-gray-300">{bandPct}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 rounded-full transition-all"
            style={{ width: `${bandPct}%` }}
          />
        </div>
      </div>

      {/* Album progress */}
      {ctx.albumProgress && song.album && (
        <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">{song.album.title}</p>
              <p className="text-sm font-semibold text-gray-200">
                {ctx.albumProgress.owned} / {ctx.albumProgress.total} songs
              </p>
            </div>
            <span className="text-2xl font-black tabular-nums text-gray-300">
              {ctx.albumProgress.total > 0
                ? Math.round((ctx.albumProgress.owned / ctx.albumProgress.total) * 100)
                : 0}%
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{
                width: `${ctx.albumProgress.total > 0
                  ? (ctx.albumProgress.owned / ctx.albumProgress.total) * 100
                  : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Live Frequency tier progress — grouped by derived tier from Song.rarity */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {(['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'] as const).map((rawRarity) => {
          const prog = ctx.rarityProgress[rawRarity];
          const total = bandRarityCounts.find((r) => r.rarity === rawRarity)?._count.id ?? 0;
          if (!total) return null;
          const owned = prog?.owned ?? 0;
          const { tier: t } = deriveLiveFrequency(null, rawRarity);
          const tS = tierStyle(t);
          return (
            <div key={rawRarity} className={`rounded-xl border p-3 ${tS.bg} ${tS.border}`}>
              <p className={`text-[10px] uppercase tracking-widest font-bold mb-1.5 ${tS.text}`}>{t}</p>
              <p className="text-lg font-black tabular-nums text-gray-100 leading-none">
                {owned} <span className="text-sm font-normal text-gray-500">/ {total}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Related songs ─────────────────────────────────────────────────────────────

function RelatedSongs({
  albumSiblings,
  relatedByRarity,
  currentTier,
  bandSlug,
  albumSlug,
}: {
  albumSiblings: WikiSongPageData['albumSiblings'];
  relatedByRarity: WikiSongPageData['relatedByRarity'];
  currentTier: LiveFrequencyTier;
  bandSlug: string;
  albumSlug?: string;
}) {
  return (
    <div className="space-y-5">
      {/* Album siblings */}
      {albumSiblings.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">On the same album</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {albumSiblings.slice(0, 9).map((s) => {
              const { tier: sTier } = deriveLiveFrequency(null, s.rarity);
              const sTStyle = tierStyle(sTier);
              return (
                <Link
                  key={s.id}
                  to={`/wiki/songs/${s.id}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-800 hover:border-indigo-800/60 hover:bg-gray-800/60 transition-colors group truncate"
                >
                  {s.trackNumber && (
                    <span className="text-[10px] tabular-nums text-gray-700 w-4 shrink-0">{s.trackNumber}</span>
                  )}
                  <span className="text-xs text-gray-300 group-hover:text-white truncate transition-colors flex-1">{s.title}</span>
                  <span className={`text-[9px] uppercase font-bold shrink-0 ${sTStyle.text}`}>{sTier[0]}</span>
                </Link>
              );
            })}
          </div>
          {albumSiblings.length > 9 && albumSlug && (
            <Link
              to={`/wiki/albums/${bandSlug}/${albumSlug}`}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-2 inline-block"
            >
              View full album →
            </Link>
          )}
        </div>
      )}

      {/* Same Live Frequency tier */}
      {relatedByRarity.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">
            Other {currentTier} songs from this band
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {relatedByRarity.map((s) => {
              const { tier: sTier } = deriveLiveFrequency(s.bandRpgProfile?.liveStatus, s.rarity);
              const sTStyle = tierStyle(sTier);
              return (
                <Link
                  key={s.id}
                  to={`/wiki/songs/${s.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-gray-800 hover:border-indigo-800/60 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 group-hover:text-white truncate transition-colors">{s.title}</p>
                    {s.album && <p className="text-[10px] text-gray-600 truncate">{s.album.title}</p>}
                  </div>
                  {s.bandRpgProfile && (
                    <span className={`text-[10px] font-medium shrink-0 ${sTStyle.text}`}>
                      {s.bandRpgProfile.totalPerformances > 0
                        ? `${s.bandRpgProfile.totalPerformances}×`
                        : sTier}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {albumSiblings.length === 0 && relatedByRarity.length === 0 && (
        <p className="text-sm text-gray-500">No related songs found.</p>
      )}
    </div>
  );
}

// ── Lyrics panel ──────────────────────────────────────────────────────────────

function LyricsPanel({ lyric }: { lyric: WikiSongPageData['song']['lyrics'][0] }) {
  const [expanded, setExpanded] = useState(false);
  const lines = lyric.text.split('\n');
  const preview = lines.slice(0, 16);
  const hasMore = lines.length > 16;

  return (
    <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <KnowledgeConfidenceBadge level="verified" />
        {lyric.sourceLabel && (
          <span className="text-[10px] text-gray-600">{lyric.sourceLabel}</span>
        )}
      </div>
      <pre className="text-sm text-gray-300 leading-relaxed font-sans whitespace-pre-wrap break-words">
        {expanded ? lyric.text : preview.join('\n')}
      </pre>
      {hasMore && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {expanded ? '↑ Collapse' : '↓ Show full lyrics'}
        </button>
      )}
    </div>
  );
}

// ── Admin panel ───────────────────────────────────────────────────────────────

function AdminPanel({
  song,
  lp,
}: {
  song: WikiSongPageData['song'];
  lp: WikiSongPageData['song']['bandRpgProfile'];
}) {
  return (
    <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-5">
      <p className="text-[10px] uppercase tracking-widest text-amber-700 mb-3 font-bold">Admin Quick Access</p>
      <div className="flex flex-wrap gap-2 mb-4">
        <AdminLink to="/admin/band-rpg" label="Live Data Audit" />
        <AdminLink to="/admin/ai-batch" label="AI Batch Scorer" />
        <AdminLink to="/admin/lyrics-batch" label="Lyrics Batch" />
        <AdminLink to="/library" label="Library Editor" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-0.5">Song ID</p>
          <p className="text-gray-400 font-mono text-[11px] break-all">{song.id}</p>
        </div>
        <div>
          <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-0.5">DB Rarity</p>
          <p className="text-gray-400 font-mono text-xs">{song.rarity}</p>
        </div>
        <div>
          <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-0.5">Live Profile</p>
          <p className={lp ? 'text-emerald-400' : 'text-gray-600'}>{lp ? 'Matched' : 'No profile'}</p>
        </div>
        {lp && (
          <>
            <div>
              <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-0.5">Performances</p>
              <p className="text-gray-300">{lp.totalPerformances}</p>
            </div>
            <div>
              <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-0.5">Raw Live Status</p>
              <p className="text-gray-400 font-mono text-xs">{lp.liveStatus}</p>
            </div>
            <div>
              <p className="text-gray-600 uppercase tracking-widest text-[10px] mb-0.5">Rarity Index</p>
              <p className="text-gray-300">{lp.rarityIndex.toFixed(0)} / 100</p>
            </div>
          </>
        )}
        {!song.score && (
          <div className="sm:col-span-3">
            <p className="text-amber-600 text-[11px]">⚠ No spectrum score — run AI batch scorer.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded text-xs font-medium bg-amber-950/40 border border-amber-900/50 text-amber-300 hover:bg-amber-900/40 transition-colors"
    >
      {label} →
    </Link>
  );
}

// ── Reusable building blocks ──────────────────────────────────────────────────

function Section({
  id,
  title,
  children,
  badge,
}: {
  id: string;
  title: string;
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest shrink-0">{title}</h2>
        {badge}
        <div className="flex-1 h-px bg-[#1a2332]" />
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{label}</p>
      <p className="text-xl font-black tabular-nums text-gray-100 leading-none">{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-900">
      <span className="text-[10px] uppercase tracking-widest text-gray-600">{label}</span>
      <span className="text-xs font-medium text-gray-300 tabular-nums">{value}</span>
    </div>
  );
}

function FrequencyDiamond({ tier }: { tier: LiveFrequencyTier }) {
  const glyphs: Record<LiveFrequencyTier, string> = {
    Mythic:        '◆',
    Legendary:     '◇',
    Rare:          '◈',
    Occasional:    '◉',
    Frequent:      '◎',
    Essential:     '○',
    Unclassified:  '·',
  };
  return <span className="text-[10px]">{glyphs[tier]}</span>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#070a0f]">
      <SiteHeader active="wiki" />
      <div className="max-w-7xl mx-auto px-4 py-12">{children}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-48 bg-gray-900 rounded-xl" />
      <div className="h-8 bg-gray-900 rounded w-1/2" />
      <div className="h-8 bg-gray-900 rounded w-1/3" />
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center gap-4 py-20">
      <p className="text-gray-400 text-sm">Song not found.</p>
      <Link to="/wiki" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
        ← Back to Wiki
      </Link>
    </div>
  );
}

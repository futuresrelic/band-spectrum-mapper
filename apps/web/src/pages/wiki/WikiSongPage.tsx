// The Song Card — the centerpiece of Band Spectrum Mapper.
//
// Designed like a museum exhibit: the artifact first, then the placard,
// then provenance, then the artifact's public life, then your own
// relationship with it. Every sentence on this page is constructed from
// verified data — when a fact is missing, the sentence is omitted, never
// invented.
//
// Reading order is mobile-first; desktop inherits the same column and adds
// a wayfinding rail.

import { useState, useEffect, type ReactNode, type CSSProperties } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import {
  getWikiSong,
  getWikiSongPlayerContext,
  updateSongSpectrum,
  upsertSongMedia,
  patchSongMedia,
  removeSongMedia,
  type WikiSongPageData,
  type WikiSongPlayerContext,
  type ScoreAxisKey,
} from '../../api/wiki';
import { ratingsApi } from '../../api/ratings';
import SiteHeader from '../../components/layout/SiteHeader';
import KnowledgeConfidenceBadge from '../../components/wiki/KnowledgeConfidenceBadge';
import WikiModulePlaceholder from '../../components/wiki/WikiModulePlaceholder';
import ModuleAdminActionButton from '../../components/wiki/ModuleAdminActionButton';
import AnalyzeButton from '../../components/wiki/AnalyzeButton';
import { WikiBreadcrumb } from '../../components/wiki/WikiLayout';
import RadarChart from '../../components/charts/RadarChart';
import { SCORE_AXES, AXIS_LABELS, AXIS_COLORS, AXIS_INFO, MUSIC_SCORE_AXES, MUSIC_AXIS_LABELS, normalizeYouTubeUrl } from '@band-spectrum-mapper/shared';
import type { ModuleDataStatus, SongHealth } from '@band-spectrum-mapper/shared';
import {
  deriveLiveFrequency,
  LIVE_FREQUENCY_COLOR,
  LIVE_FREQUENCY_BG,
  LIVE_FREQUENCY_EMOJI,
  type LiveFrequencyTier,
} from '../../lib/liveFrequency';

// ── Design tokens ─────────────────────────────────────────────────────────────

const SERIF = 'Georgia, "Times New Roman", serif';

function tierStyle(tier: LiveFrequencyTier) {
  const bg = LIVE_FREQUENCY_BG[tier];
  const text = LIVE_FREQUENCY_COLOR[tier].replace('-400', '-300');
  return { text, bg: bg.bg, border: bg.border, glow: bg.glow };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtDuration(secs: number | null): string {
  if (!secs) return '—';
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtYear(d: string | null | undefined): number | null {
  if (!d) return null;
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? y : null;
}

function fmtPct(pct: number): string {
  return pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
}

const ORDINAL_WORDS = [
  '', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth',
];

function ordinal(n: number): string {
  const word = ORDINAL_WORDS[n];
  if (word) return word;
  const rem10 = n % 10; const rem100 = n % 100;
  const suffix =
    rem10 === 1 && rem100 !== 11 ? 'st' :
    rem10 === 2 && rem100 !== 12 ? 'nd' :
    rem10 === 3 && rem100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

// ── The Song Story ────────────────────────────────────────────────────────────
// A short curated narrative, assembled sentence-by-sentence from verified data.
// Each sentence has a data precondition; missing data means the sentence is
// silently dropped. Nothing here is generated or guessed.

function buildSongStory(data: WikiSongPageData): {
  sentences: string[];
  confidence: 'calculated' | 'estimated';
} {
  const { song, collectedCount, liveCache } = data;
  const lp = song.bandRpgProfile;
  const shows = liveCache?.fetchedShows ?? 0;
  const sentences: string[] = [];

  // 1 — identity: where the song lives in the catalog
  if (song.album && song.album.year && song.trackNumber) {
    sentences.push(
      `“${song.title}” is the ${ordinal(song.trackNumber)} track on ${song.album.title}, ${song.band.name}'s ${song.album.year} album.`,
    );
  } else if (song.album && song.album.year) {
    sentences.push(
      `“${song.title}” appears on ${song.album.title}, ${song.band.name}'s ${song.album.year} album.`,
    );
  } else if (song.album) {
    sentences.push(`“${song.title}” appears on ${song.band.name}'s album ${song.album.title}.`);
  } else {
    sentences.push(`“${song.title}” is a song by ${song.band.name}.`);
  }
  if (song.isInstrumental) sentences.push('It is an instrumental piece.');
  if (song.isRemix) sentences.push('This recording is a remix.');

  // 2 — its life on stage (requires real concert data)
  if (lp && shows > 0) {
    const plays = lp.totalPerformances;
    const pct = fmtPct(lp.performancePct);
    const { tier } = deriveLiveFrequency(lp.liveStatus, song.rarity);

    if (plays === 0) {
      sentences.push(
        `Across ${shows.toLocaleString()} tracked concerts, no live performance has ever been confirmed — it remains a studio artifact.`,
      );
    } else if (tier === 'Essential') {
      sentences.push(
        `On stage it became a fixture, appearing in roughly ${pct}% of the ${shows.toLocaleString()} concerts on record.`,
      );
    } else if (tier === 'Frequent') {
      sentences.push(
        `It earned a regular place in the live rotation, appearing in about ${pct}% of tracked concerts.`,
      );
    } else if (tier === 'Occasional') {
      sentences.push(
        `It surfaces in concert from time to time — about ${pct}% of tracked shows.`,
      );
    } else if (tier === 'Rare') {
      sentences.push(
        `Live outings are scarce: just ${plays.toLocaleString()} appearance${plays !== 1 ? 's' : ''} across ${shows.toLocaleString()} tracked concerts.`,
      );
    } else if (tier === 'Legendary') {
      sentences.push(
        `It has been performed only ${plays.toLocaleString()} time${plays !== 1 ? 's' : ''} in ${shows.toLocaleString()} tracked concerts — hearing it live places you in rare company.`,
      );
    }

    // 3 — the span of its touring life
    const firstYear = fmtYear(lp.firstPerformanceDate);
    const lastYear = fmtYear(lp.lastPerformanceDate);
    if (plays > 0 && firstYear && lastYear && lp.distinctYears >= 2 && lastYear > firstYear) {
      sentences.push(
        `Its live history runs from ${firstYear} to ${lastYear}, across ${lp.distinctYears} different years of touring.`,
      );
    }
    if (plays > 0 && lp.yearsSincePlayed !== null && lp.yearsSincePlayed >= 5) {
      sentences.push(`It has not been heard on stage in over ${Math.floor(lp.yearsSincePlayed)} years.`);
    }
  }

  // 4 — its place among players
  if (collectedCount > 0) {
    sentences.push(
      `Among players, it has been recovered ${collectedCount.toLocaleString()} time${collectedCount !== 1 ? 's' : ''} so far.`,
    );
  } else {
    sentences.push('No player has recovered it yet — the archive is still waiting for its first.');
  }

  return {
    sentences,
    confidence: lp && shows > 0 ? 'calculated' : 'estimated',
  };
}

// ── Player goals ──────────────────────────────────────────────────────────────
// The exit through the gift shop: every Song Card ends with somewhere to go next.

type Goal = { icon: string; title: string; sub: string; to: string };

function buildGoals(
  data: WikiSongPageData,
  ctx: WikiSongPlayerContext | undefined,
): Goal[] {
  const { song } = data;
  const goals: Goal[] = [];

  if (!ctx) {
    return [{
      icon: '🎮',
      title: 'Begin your archive',
      sub: `Play Band RPG to start recovering ${song.band.name}'s songs.`,
      to: '/play/band-rpg',
    }];
  }

  if (!ctx.collected) {
    goals.push({
      icon: '💿',
      title: 'Recover this song',
      sub: `Run a ${song.band.name} quest in Band RPG — it may surface.`,
      to: '/play/band-rpg',
    });
  }

  if (ctx.albumProgress && song.album && ctx.albumProgress.owned < ctx.albumProgress.total) {
    const remaining = ctx.albumProgress.total - ctx.albumProgress.owned;
    goals.push({
      icon: '📀',
      title: `Complete ${song.album.title}`,
      sub: `${remaining} track${remaining !== 1 ? 's' : ''} still to recover.`,
      to: `/wiki/albums/${song.band.slug}/${song.album.slug}`,
    });
  }

  // Rarest tiers still missing — Mythic first, then Legendary
  for (const rawRarity of ['Mythic', 'Legendary'] as const) {
    const prog = ctx.rarityProgress[rawRarity];
    if (prog && prog.owned < prog.total) {
      const remaining = prog.total - prog.owned;
      const { tier } = deriveLiveFrequency(null, rawRarity);
      goals.push({
        icon: LIVE_FREQUENCY_EMOJI[tier],
        title: `Hunt the ${tier} tier`,
        sub: `${remaining} ${tier} song${remaining !== 1 ? 's' : ''} from ${song.band.name} still unrecovered.`,
        to: '/play/band-rpg',
      });
      break;
    }
  }

  if (ctx.bandProgress.owned < ctx.bandProgress.total) {
    const remaining = ctx.bandProgress.total - ctx.bandProgress.owned;
    goals.push({
      icon: '🏛',
      title: `Finish ${song.band.name}`,
      sub: `${remaining} of ${ctx.bandProgress.total} songs remain at large.`,
      to: `/wiki/bands/${song.band.slug}`,
    });
  }

  if (goals.length === 0) {
    goals.push({
      icon: '🏆',
      title: `The ${song.band.name} archive is complete`,
      sub: 'A curator\'s work is never truly done — choose another band.',
      to: '/wiki',
    });
  }

  return goals.slice(0, 3);
}

// ── Reserved modules — extension points for Phase Z.18+ ───────────────────────
// Song Spectrum (Z.17), Rhythm Lab (Z.17), Media (Z.17.6), Full Timeline
// (Z.17.7), and Community (Z.17.7) all graduated from a generic placeholder
// into a live section. These three stay deliberately "prep only" per
// Z.17.7's explicit scope — each still needs bespoke logic (checking
// whether lyrics exist, gating the right admin link), so they're built as
// small dedicated panels rather than a generic array-driven grid.

// Trivia: the existing trivia system (/api/trivia/questions) is a global,
// admin-only quiz generator scoped to a band, not a single song — it
// doesn't fit "show trivia for this song" at all, so this stays a
// placeholder. Admins get a link to the existing tool rather than a fake
// per-song generate button.
function TriviaPrepPanel({ isAdmin }: { isAdmin: boolean }) {
  return (
    <WikiModulePlaceholder
      icon="❓"
      title="Trivia"
      description="Questions about this song will surface as the trivia bank grows."
      comingSoon
      action={isAdmin ? (
        <Link
          to="/trivia"
          className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-900/50 text-amber-300 hover:bg-amber-900/40 transition-colors"
        >
          Open Trivia Tool →
        </Link>
      ) : undefined}
    />
  );
}

// Lyrics DNA: no generator exists yet at all, so there is nothing to wire
// up — "Generate Lyrics DNA" is shown as a clearly non-interactive
// reserved label, never a button that would 404 when clicked.
function LyricsDnaPrepPanel({ hasLyrics, isAdmin }: { hasLyrics: boolean; isAdmin: boolean }) {
  if (!hasLyrics) {
    return (
      <WikiModulePlaceholder
        icon="🧬"
        title="Lyrics DNA"
        description="Requires lyrics — none exist for this song yet."
        comingSoon
      />
    );
  }
  return (
    <WikiModulePlaceholder
      icon="🧬"
      title="Lyrics DNA"
      description="Will show word frequency, repeated phrases, mood, vocabulary density, and thematic keywords once linguistic analysis exists."
      comingSoon
      action={isAdmin ? (
        <span className="inline-block text-[10px] uppercase tracking-widest text-gray-600 border border-gray-800 rounded-full px-2.5 py-1">
          Generate Lyrics DNA — not yet built
        </span>
      ) : undefined}
    />
  );
}

// Song Node: the network graph (/song-nodes) is admin-only and genuinely
// heavy (Cytoscape.js) — never embedded here. Everyone gets a link to the
// public /explore graph instead; admins additionally get the dedicated tool.
function SongNodePrepPanel({ isAdmin }: { isAdmin: boolean }) {
  return (
    <WikiModulePlaceholder
      icon="🕸"
      title="Song Node"
      description="Connections to other songs, mapped as a living graph."
      comingSoon
      action={
        <div className="flex flex-wrap gap-2">
          <Link
            to="/explore"
            className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Explore the Graph →
          </Link>
          {isAdmin && (
            <Link
              to="/song-nodes"
              className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-900/50 text-amber-300 hover:bg-amber-900/40 transition-colors"
            >
              Open Song Node Tool →
            </Link>
          )}
        </div>
      }
    />
  );
}

// ── Song Spectrum interpretation ──────────────────────────────────────────────
// A single deterministic sentence built only from real axis values — never
// hallucinated. Reports the highest axis/axes, and the lowest if it's a real
// outlier, using plain descriptive bands (high/moderate/low) rather than
// invented commentary.

function buildSpectrumInterpretation(score: WikiSongPageData['song']['score']): string | null {
  if (!score) return null;
  const values = SCORE_AXES.map((axis) => ({ axis, value: score[axis] }));
  const sorted = [...values].sort((a, b) => b.value - a.value);
  const top = sorted.filter((v) => v.value >= 7);
  const low = sorted[sorted.length - 1];

  const band = (v: number) => (v >= 7 ? 'high' : v >= 4 ? 'moderate' : 'low');

  if (top.length === 0) {
    // Nothing stands out sharply — describe the two strongest axes plainly
    const [a, b] = sorted;
    if (!a || !b) return null;
    return `This song sits at a ${band(a.value)} level in ${AXIS_LABELS[a.axis].toLowerCase()} and a ${band(b.value)} level in ${AXIS_LABELS[b.axis].toLowerCase()}, without a single axis dominating.`;
  }

  const topLabels = top.slice(0, 2).map((v) => AXIS_LABELS[v.axis].toLowerCase());
  const topPhrase = topLabels.length === 2 ? `${topLabels[0]} and ${topLabels[1]}` : topLabels[0];

  let sentence = `This song leans high in ${topPhrase}`;
  if (low && !top.some((v) => v.axis === low.axis) && low.value <= 3) {
    sentence += `, with low ${AXIS_LABELS[low.axis].toLowerCase()}`;
  } else {
    const middle = sorted.find((v) => !top.some((t) => t.axis === v.axis));
    if (middle) sentence += `, with moderate ${AXIS_LABELS[middle.axis].toLowerCase()}`;
  }
  return `${sentence}.`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WikiSongPage() {
  const { songId = '' } = useParams<{ songId: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fromGame = searchParams.get('unlocked') === '1';
  const [revealed, setRevealed] = useState(!fromGame);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wiki', 'song', songId],
    queryFn: () => getWikiSong(songId),
    enabled: !!songId,
    staleTime: 5 * 60 * 1000,
  });

  const refetchSong = () => queryClient.invalidateQueries({ queryKey: ['wiki', 'song', songId] });

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
    return undefined;
  }, [fromGame, data]);

  if (isLoading) return <Shell><LoadingState /></Shell>;
  if (isError || !data) return <Shell><ErrorState /></Shell>;

  const { song, collectedCount, albumSiblings, bandRarityCounts, relatedByRarity, liveCache, musicScore, relatedBySpectrum, health } = data;
  const lp = song.bandRpgProfile;
  const { tier, source: tierSource } = deriveLiveFrequency(lp?.liveStatus, song.rarity);
  const tStyle = tierStyle(tier);
  const story = buildSongStory(data);
  const goals = buildGoals(data, playerCtx);
  const totalShows = liveCache?.fetchedShows ?? 0;
  const primaryLyric = song.lyrics[0] ?? null;

  const navItems = [
    { id: 'story',      label: 'Story'      },
    { id: 'provenance', label: 'Timeline'   },
    { id: 'live',       label: 'Live'       },
    ...(user ? [{ id: 'journey', label: 'Your Journey' }, { id: 'collection', label: 'Collection' }] : []),
    { id: 'spectrum',   label: 'Spectrum'   },
    { id: 'related',    label: 'Related'    },
    { id: 'media',      label: 'Media'      },
    { id: 'community',  label: 'Community'  },
    ...(primaryLyric ? [{ id: 'lyrics', label: 'Lyrics' }] : []),
    { id: 'goals',      label: 'What Next'  },
    { id: 'health',     label: 'Song Health'},
  ];

  // Section stagger counter — each Section rises in reading order
  let sectionIndex = 0;
  const nextIndex = () => sectionIndex++;

  return (
    <div className="min-h-screen bg-[#070a0f]">
      <SiteHeader active="wiki" />
      <RiseStyles />

      <div
        style={{
          transition: 'opacity 0.65s ease-out, transform 0.65s ease-out',
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translateY(0)' : 'translateY(14px)',
        }}
      >
        {/* ── Hero ── */}
        <HeroSection song={song} tier={tier} tierSource={tierSource} fromGame={fromGame} revealed={revealed} playerCtx={playerCtx} />

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
            {/* Wayfinding rail — desktop only */}
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

              <div className="space-y-2">
                <MiniStat label="Song Health" value={<span className={healthColor(health.overallPct)}>{health.overallPct}%</span>} />
                <MiniStat label="Live Frequency" value={<span className={tStyle.text}>{tier}</span>} />
                {lp && lp.totalPerformances > 0 && (
                  <MiniStat label="Performances" value={lp.totalPerformances.toLocaleString()} />
                )}
                <MiniStat label="Players own" value={collectedCount.toLocaleString()} />
                {song.score && (
                  <MiniStat label="Complexity" value={song.score.complexity.toFixed(1)} />
                )}
              </div>
            </aside>

            {/* Main column — the exhibit, in reading order */}
            <main className="flex-1 min-w-0 space-y-12">

              {/* 1 · The placard */}
              <Section id="story" title="The Story" index={nextIndex()}
                badge={<KnowledgeConfidenceBadge level={story.confidence} />}
              >
                <SongStoryPanel sentences={story.sentences} tStyle={tStyle} />
              </Section>

              {/* 2 · Full Timeline */}
              <Section id="provenance" title="Full Timeline" index={nextIndex()}>
                <ProvenanceTimeline song={song} lp={lp} playerCtx={playerCtx} musicScore={musicScore} />
              </Section>

              {/* 3 · Life on stage */}
              <Section id="live" title="Life on Stage" index={nextIndex()}
                badge={lp ? <KnowledgeConfidenceBadge level="calculated" /> : undefined}
              >
                {lp ? (
                  <LiveHistoryPanel lp={lp} totalShows={totalShows} tier={tier} />
                ) : (
                  <WikiModulePlaceholder
                    icon="📡"
                    title="Concert records pending"
                    description={`Once Setlist.fm data is fetched for ${song.band.name}, this song's full live history will appear here.`}
                  />
                )}
              </Section>

              {/* 4 · Your relationship with the artifact */}
              {user && (
                <Section id="journey" title="Your Journey" index={nextIndex()}>
                  <JourneyPanel playerCtx={playerCtx} song={song} />
                </Section>
              )}

              {/* 5 · The collection it belongs to */}
              {user && playerCtx && (
                <Section id="collection" title="Your Collection" index={nextIndex()}>
                  <CollectionStory ctx={playerCtx} song={song} bandRarityCounts={bandRarityCounts} />
                </Section>
              )}

              {/* 6 · Song Spectrum — the musical fingerprint */}
              <Section id="spectrum" title="Song Spectrum" index={nextIndex()}
                badge={
                  health.modules.find((m) => m.moduleKey === 'spectrum')?.confidence
                    ? <KnowledgeConfidenceBadge level={health.modules.find((m) => m.moduleKey === 'spectrum')!.confidence!} />
                    : undefined
                }
              >
                <SpectrumModule
                  song={song}
                  musicScore={musicScore}
                  health={health}
                  isAdmin={!!user?.isAdmin}
                  onChanged={refetchSong}
                />
              </Section>

              {/* 7 · If this interested you… */}
              <Section id="related" title="Related Songs" index={nextIndex()}>
                <RelatedSongs
                  albumSiblings={albumSiblings}
                  relatedByRarity={relatedByRarity}
                  relatedBySpectrum={relatedBySpectrum}
                  currentTier={tier}
                  bandSlug={song.band.slug}
                  albumSlug={song.album?.slug}
                />
              </Section>

              {/* 8 · Media — the official video */}
              <Section id="media" title="Media" index={nextIndex()}
                badge={song.media?.status === 'available' ? <KnowledgeConfidenceBadge level="verified" /> : undefined}
              >
                <SongMediaPanel
                  media={song.media}
                  songId={song.id}
                  isAdmin={!!user?.isAdmin}
                  onChanged={refetchSong}
                />
              </Section>

              {/* 9 · Community */}
              <Section id="community" title="Community" index={nextIndex()}>
                <CommunityRatingPanel songId={song.id} />
              </Section>

              {/* 10 · Lyrics */}
              {(primaryLyric || song.isInstrumental) && (
                <Section id="lyrics" title="Lyrics" index={nextIndex()}>
                  {song.isInstrumental ? (
                    <p className="text-sm text-gray-500 italic">This is an instrumental track — no lyrics.</p>
                  ) : primaryLyric ? (
                    <LyricsPanel lyric={primaryLyric} />
                  ) : null}
                </Section>
              )}

              {/* 9 · What next */}
              <Section id="goals" title="What Next" index={nextIndex()}>
                <GoalsPanel goals={goals} />
              </Section>

              {/* 10 · Reserved wall space (Phase Z.18+ extension points) */}
              <Section id="modules" title="The Collection Grows" index={nextIndex()}>
                <p className="text-xs text-gray-600 leading-relaxed mb-4 -mt-1">
                  This exhibit is still being assembled. New wings open as data arrives.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <TriviaPrepPanel isAdmin={!!user?.isAdmin} />
                  <LyricsDnaPrepPanel hasLyrics={!!primaryLyric && !song.isInstrumental} isAdmin={!!user?.isAdmin} />
                  <SongNodePrepPanel isAdmin={!!user?.isAdmin} />
                </div>
              </Section>

              {/* 11 · Song Health — how complete our knowledge of this song is.
                     Shown to everyone; admins additionally see fill-in actions. */}
              <Section id="health" title="Song Health" index={nextIndex()}>
                <SongHealthPanel
                  health={health}
                  songId={song.id}
                  isAdmin={!!user?.isAdmin}
                  onChanged={refetchSong}
                />
              </Section>

              {/* Admin — deliberately last, deliberately plain */}
              {user?.isAdmin && (
                <Section id="admin" title="Admin" index={nextIndex()}>
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
  tier,
  tierSource,
  fromGame,
  revealed,
  playerCtx,
}: {
  song: WikiSongPageData['song'];
  tier: LiveFrequencyTier;
  tierSource: 'live' | 'estimated';
  fromGame: boolean;
  revealed: boolean;
  playerCtx: WikiSongPlayerContext | undefined;
}) {
  const tStyle = tierStyle(tier);
  const artworkUrl = song.album?.artworkUrl;

  return (
    <div className="relative overflow-hidden">
      {/* Blurred artwork wash — the room takes on the artifact's colors */}
      {artworkUrl && (
        <div className="absolute inset-0" aria-hidden>
          <img
            src={artworkUrl}
            alt=""
            className="absolute top-0 right-0 w-[65%] h-full object-cover blur-3xl scale-110 opacity-[0.13]"
          />
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 80% 120% at 80% 40%, transparent 0%, #070a0f 70%)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#070a0f] via-[#070a0f]/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070a0f] via-transparent to-[#070a0f]/70" />
        </div>
      )}
      {!artworkUrl && (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 to-[#070a0f]" />
      )}

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Mobile: artwork above the title, centered like an object on a plinth.
            Desktop: text left, artwork right. */}
        <div className="flex flex-col-reverse sm:flex-row gap-8 items-center sm:items-start">
          <div className="flex-1 min-w-0 text-center sm:text-left w-full">
            {/* Eyebrow — band · album · year */}
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap mb-3">
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

            {/* Title */}
            <h1
              className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-none mb-5"
              style={{ textWrap: 'balance', letterSpacing: '-0.03em' }}
            >
              {song.title}
            </h1>

            {/* Badge row */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
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
                {tierSource === 'estimated' && <span className="opacity-50 text-[9px] normal-case tracking-normal">est.</span>}
              </span>

              {playerCtx?.collected && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                  ✓ Recovered
                </span>
              )}
              {playerCtx && !playerCtx.collected && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-gray-500 border border-gray-800 bg-gray-900/40">
                  Not yet recovered
                </span>
              )}
            </div>

            {/* Provenance line — the placard's small print */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 mt-5 text-xs text-gray-500">
              {song.trackNumber !== null && <span>Track {song.trackNumber}</span>}
              {song.album?.year && <span>{song.album.year}</span>}
              {song.durationSeconds && <span>{fmtDuration(song.durationSeconds)}</span>}
              {song.isInstrumental && <span className="text-gray-600 uppercase tracking-widest text-[10px]">Instrumental</span>}
              {song.isRemix && <span className="text-gray-600 uppercase tracking-widest text-[10px]">Remix</span>}
              {song._count.ratings > 0 && <span>{song._count.ratings.toLocaleString()} ratings</span>}
            </div>
          </div>

          {/* The artifact */}
          {artworkUrl && (
            <div className="shrink-0">
              <Link to={`/wiki/albums/${song.band.slug}/${song.album?.slug ?? ''}`}>
                <ArtworkImage
                  src={artworkUrl}
                  alt={song.album?.title ?? ''}
                  className="w-48 h-48 sm:w-52 sm:h-52 rounded-2xl object-cover border border-white/10 shadow-2xl hover:border-white/25 transition-colors"
                />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Artwork that arrives gently rather than popping in
function ArtworkImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      className={`${className} transition-opacity duration-500 motion-reduce:transition-none ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}

// ── The Story panel ───────────────────────────────────────────────────────────

function SongStoryPanel({
  sentences,
  tStyle,
}: {
  sentences: string[];
  tStyle: ReturnType<typeof tierStyle>;
}) {
  return (
    <div className={`rounded-xl border p-6 sm:p-8 ${tStyle.bg} ${tStyle.border}`}>
      <p
        className="text-base sm:text-lg text-gray-100 leading-relaxed sm:leading-loose"
        style={{ fontFamily: SERIF }}
      >
        {sentences.join(' ')}
      </p>
    </div>
  );
}

// ── Full Timeline ──────────────────────────────────────────────────────────────
// Every dated fact BSM actually holds about this song, in chronological
// order: album release, live history, discovery, and each analysis module's
// completion date. Built only from real timestamps already on the page —
// nothing invented. Fewer than two real events means a quiet placeholder.

function ProvenanceTimeline({
  song,
  lp,
  playerCtx,
  musicScore,
}: {
  song: WikiSongPageData['song'];
  lp: WikiSongPageData['song']['bandRpgProfile'];
  playerCtx: WikiSongPlayerContext | undefined;
  musicScore: WikiSongPageData['musicScore'];
}) {
  type Node = {
    date: Date; icon: string; label: string; value: string; sub?: string;
    accent?: string; confidence?: 'verified' | 'calculated' | 'ai' | 'community' | 'estimated';
  };
  const nodes: Node[] = [];

  if (song.album?.year) {
    // Album has no exact release date on file — anchor at Jan 1 of the credited year.
    nodes.push({
      date: new Date(song.album.year, 0, 1),
      icon: '💿', label: 'Album released', value: String(song.album.year),
      sub: song.album.title, confidence: 'verified',
    });
  }
  if (lp && lp.totalPerformances > 0 && lp.firstPerformanceDate) {
    nodes.push({
      date: new Date(lp.firstPerformanceDate),
      icon: '🎤', label: 'First known live performance', value: fmtDate(lp.firstPerformanceDate),
      sub: 'Earliest confirmed appearance in tracked setlists.', confidence: 'calculated',
    });
  }
  if (
    lp && lp.totalPerformances > 1 && lp.lastPerformanceDate &&
    lp.lastPerformanceDate !== lp.firstPerformanceDate
  ) {
    nodes.push({
      date: new Date(lp.lastPerformanceDate),
      icon: '🎶', label: 'Most recent known performance', value: fmtDate(lp.lastPerformanceDate),
      sub: 'Latest confirmed appearance in tracked setlists.', confidence: 'calculated',
    });
  }
  if (song.score?.createdAt) {
    nodes.push({
      date: new Date(song.score.createdAt),
      icon: '📊', label: 'Spectrum analyzed', value: fmtDate(song.score.createdAt),
      sub: 'Musical fingerprint first scored across the 6 axes.', confidence: 'calculated',
    });
  }
  if (musicScore?.createdAt) {
    nodes.push({
      date: new Date(musicScore.createdAt),
      icon: '🥁', label: 'Rhythm analyzed', value: fmtDate(musicScore.createdAt),
      sub: 'Musical structure scored — rhythm, harmony, density.', confidence: 'ai',
    });
  }
  if (song.media && song.media.status !== 'removed') {
    nodes.push({
      date: new Date(song.media.createdAt),
      icon: '🎬', label: 'Official video linked', value: fmtDate(song.media.createdAt),
      sub: 'Official YouTube video added to the Song Card.', confidence: 'verified',
    });
  }
  if (playerCtx?.collected && playerCtx.collectedAt) {
    nodes.push({
      date: new Date(playerCtx.collectedAt),
      icon: '🗃', label: 'Recovered by you', value: fmtDate(playerCtx.collectedAt),
      sub: 'Added to your personal archive via Band RPG.', accent: 'text-emerald-300', confidence: 'verified',
    });
  }

  nodes.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (nodes.length < 2) {
    return (
      <WikiModulePlaceholder
        icon="📜"
        title="History still being written"
        description="As release, performance, analysis, and discovery dates are confirmed, this song's timeline will take shape here."
      />
    );
  }

  return (
    <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
      <ol className="relative">
        {nodes.map((n, i) => (
          <li key={i} className="relative pl-10 pb-6 last:pb-0">
            {/* rail */}
            {i < nodes.length - 1 && (
              <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-gray-800" />
            )}
            {/* node */}
            <span
              aria-hidden
              className="absolute left-0 top-0.5 w-[27px] h-[27px] rounded-full bg-gray-950 border border-gray-800 flex items-center justify-center text-xs"
            >
              {n.icon}
            </span>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <p className="text-[10px] uppercase tracking-widest text-gray-600">{n.label}</p>
              {n.confidence && <KnowledgeConfidenceBadge level={n.confidence} />}
            </div>
            <p className={`text-sm font-semibold ${n.accent ?? 'text-gray-100'}`}>{n.value}</p>
            {n.sub && <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{n.sub}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Life on stage ─────────────────────────────────────────────────────────────

function LiveHistoryPanel({
  lp,
  totalShows,
  tier,
}: {
  lp: NonNullable<WikiSongPageData['song']['bandRpgProfile']>;
  totalShows: number;
  tier: LiveFrequencyTier;
}) {
  const firstYear = fmtYear(lp.firstPerformanceDate);
  const lastYear = fmtYear(lp.lastPerformanceDate);
  const spanYears = firstYear && lastYear ? lastYear - firstYear + 1 : null;
  const barClass = LIVE_FREQUENCY_COLOR[tier].replace('text-', 'bg-').replace('-400', '-500');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Performances" value={lp.totalPerformances.toLocaleString()} />
        <StatCard label="Show Coverage" value={`${lp.performancePct.toFixed(1)}%`} />
        <StatCard label="Touring Years" value={lp.distinctYears.toString()} />
        <StatCard label="Rarity Index" value={`${lp.rarityIndex.toFixed(0)} / 100`} sub="higher = rarer" />
      </div>

      {lp.totalPerformances > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="First Appearance"
            value={firstYear ? String(firstYear) : '—'}
            sub={fmtDate(lp.firstPerformanceDate)}
          />
          <StatCard
            label="Latest Appearance"
            value={lastYear ? String(lastYear) : '—'}
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

      {/* Coverage — how often it appears when the band takes the stage */}
      {totalShows > 0 && lp.totalPerformances > 0 && (
        <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-4 sm:p-5">
          <div className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">
            Played at {lp.totalPerformances.toLocaleString()} of {totalShows.toLocaleString()} tracked concerts
          </div>
          <FillBar pct={lp.performancePct} barClass={barClass} />
          <p className="text-[10px] text-gray-600 mt-2 flex items-center gap-1.5">
            Source: Setlist.fm · <KnowledgeConfidenceBadge level="calculated" />
          </p>
        </div>
      )}

      {/* Touring-years strip — an honest small timeline from the data we hold */}
      {spanYears !== null && spanYears >= 2 && lp.totalPerformances > 0 && (
        <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-4 sm:p-5">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[10px] uppercase tracking-widest text-gray-600">Touring span</span>
            <span className="text-xs tabular-nums text-gray-400">{firstYear} — {lastYear}</span>
          </div>
          <FillBar pct={(lp.distinctYears / spanYears) * 100} barClass="bg-indigo-500" />
          <p className="text-[10px] text-gray-600 mt-2">
            Performed in {lp.distinctYears} of the {spanYears} calendar years between its first and latest appearance.
          </p>
        </div>
      )}

      {lp.totalPerformances === 0 && (
        <div className="bg-gray-900/40 border border-gray-800 rounded-xl px-5 py-4">
          <p className="text-sm text-gray-400 leading-relaxed" style={{ fontFamily: SERIF }}>
            No confirmed live performance exists in {totalShows > 0 ? `${totalShows.toLocaleString()} tracked` : 'any tracked'} concerts.
            It may have appeared under another title — or it may simply never have left the studio.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Your Journey ──────────────────────────────────────────────────────────────

function JourneyPanel({
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
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <p className="text-base text-gray-200 leading-relaxed mb-2" style={{ fontFamily: SERIF }}>
          This song is still out there.
        </p>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">
          Run a {song.band.name} quest in Band RPG: recover the vinyl fragments, name the song
          when the curator asks, and it takes its place in your archive — with this page recording
          the date it happened.
        </p>
        <Link
          to="/play/band-rpg"
          className="inline-block px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          Play Band RPG
        </Link>
      </div>
    );
  }

  const { tier: collectedTier } = deriveLiveFrequency(null, playerCtx.frozenRarity ?? song.rarity);
  const cStyle = tierStyle(collectedTier);

  return (
    <div className={`rounded-xl border p-5 sm:p-6 ${cStyle.bg} ${cStyle.border}`}>
      <p className="text-base text-gray-100 leading-relaxed mb-5" style={{ fontFamily: SERIF }}>
        You recovered this song on {fmtDate(playerCtx.collectedAt)}
        {playerCtx.guessedCorrectly ? ', identifying it on first listen.' : '.'}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Recovered</p>
          <p className="text-sm font-bold text-gray-100">{fmtDate(playerCtx.collectedAt)}</p>
        </div>
        {playerCtx.scoreEarned != null && playerCtx.scoreEarned > 0 && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">XP earned</p>
            <p className="text-sm font-bold text-amber-300">{playerCtx.scoreEarned.toLocaleString()}</p>
          </div>
        )}
        {playerCtx.guessedCorrectly != null && (
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Identified</p>
            <p className={`text-sm font-bold ${playerCtx.guessedCorrectly ? 'text-emerald-400' : 'text-gray-500'}`}>
              {playerCtx.guessedCorrectly ? 'Yes' : 'Not yet'}
            </p>
          </div>
        )}
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">In your setlists</p>
          <p className={`text-sm font-bold ${playerCtx.setlistCount > 0 ? 'text-gray-100' : 'text-gray-500'}`}>
            {playerCtx.setlistCount > 0 ? playerCtx.setlistCount : 'None yet'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Collection story ──────────────────────────────────────────────────────────
// Numbers become sentences; the bars follow as evidence.

function CollectionStory({
  ctx,
  song,
  bandRarityCounts,
}: {
  ctx: WikiSongPlayerContext;
  song: WikiSongPageData['song'];
  bandRarityCounts: WikiSongPageData['bandRarityCounts'];
}) {
  const bandPct = ctx.bandProgress.total > 0
    ? (ctx.bandProgress.owned / ctx.bandProgress.total) * 100
    : 0;
  const albumPct = ctx.albumProgress && ctx.albumProgress.total > 0
    ? (ctx.albumProgress.owned / ctx.albumProgress.total) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* Band */}
      <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
        <div className="flex items-end justify-between gap-4 mb-4">
          <p className="text-base text-gray-100 leading-relaxed" style={{ fontFamily: SERIF }}>
            You have recovered {ctx.bandProgress.owned.toLocaleString()} of {song.band.name}'s{' '}
            {ctx.bandProgress.total.toLocaleString()} known songs.
          </p>
          <span className="text-3xl font-black tabular-nums text-gray-300 leading-none shrink-0">
            {Math.round(bandPct)}%
          </span>
        </div>
        <FillBar pct={bandPct} barClass="bg-indigo-600" />
      </div>

      {/* Album */}
      {ctx.albumProgress && song.album && (
        <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <p className="text-sm text-gray-200 leading-relaxed" style={{ fontFamily: SERIF }}>
              {ctx.albumProgress.owned === ctx.albumProgress.total
                ? `${song.album.title} is complete in your archive.`
                : `${ctx.albumProgress.owned} of the ${ctx.albumProgress.total} tracks on ${song.album.title} are in your archive.`}
            </p>
            <span className="text-2xl font-black tabular-nums text-gray-300 leading-none shrink-0">
              {Math.round(albumPct)}%
            </span>
          </div>
          <FillBar pct={albumPct} barClass="bg-indigo-500" />
        </div>
      )}

      {/* Live Frequency completion */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">By Live Frequency</p>
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
    </div>
  );
}

// ── Song Spectrum module ───────────────────────────────────────────────────────
// The musical fingerprint. Radar for shape at a glance, bars for exact values
// and axis meaning, a deterministic one-sentence interpretation, and — for
// admins — the tools to generate or hand-correct it. Never shows a value
// that isn't real.

function SpectrumModule({
  song,
  musicScore,
  health,
  isAdmin,
  onChanged,
}: {
  song: WikiSongPageData['song'];
  musicScore: WikiSongPageData['musicScore'];
  health: SongHealth;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const score = song.score;
  const spectrumStatus = health.modules.find((m) => m.moduleKey === 'spectrum')!;
  const rhythmStatus = health.modules.find((m) => m.moduleKey === 'rhythm')!;

  if (!score) {
    return (
      <div className="space-y-4">
        <WikiModulePlaceholder
          icon="🎛"
          title="Song Spectrum not analyzed yet"
          description="This section will show the song's musical fingerprint once analysis is available."
        />
        {isAdmin && spectrumStatus.adminAction && (
          <ModuleAdminActionButton action={spectrumStatus.adminAction} onSuccess={onChanged} />
        )}
        <RhythmLabPanel musicScore={musicScore} moduleStatus={rhythmStatus} isAdmin={isAdmin} onChanged={onChanged} />
      </div>
    );
  }

  const confidence = { level: spectrumStatus.confidence ?? 'estimated', label: spectrumStatus.notes ?? 'Confidence unknown.' } as const;
  const interpretation = buildSpectrumInterpretation(score);
  const radarScores = {
    aggression: score.aggression, complexity: score.complexity, atmosphere: score.atmosphere,
    emotion: score.emotion, psychedelic: score.psychedelic, concept: score.concept,
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
        <div className="grid sm:grid-cols-[minmax(0,240px)_1fr] gap-6 items-start">
          <div className="max-w-[240px] mx-auto sm:mx-0 w-full">
            <RadarChart datasets={[{ label: 'Spectrum', scores: radarScores, color: '#a78bfa' }]} dark outline height={240} />
          </div>
          <div className="min-w-0">
            {interpretation && (
              <p className="text-sm sm:text-base text-gray-200 leading-relaxed mb-4" style={{ fontFamily: SERIF }}>
                {interpretation}
              </p>
            )}
            <div className="space-y-2.5">
              {SCORE_AXES.map((axis) => (
                <div key={axis}>
                  <div className="flex justify-between items-baseline mb-0.5">
                    <span className="text-xs text-gray-400">{AXIS_LABELS[axis]}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: AXIS_COLORS[axis] }}>
                      {score[axis].toFixed(1)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                      style={{ width: `${Math.max(0, Math.min(score[axis], 10)) * 10}%`, backgroundColor: AXIS_COLORS[axis] }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-600 mt-0.5">{AXIS_INFO[axis].lo} → {AXIS_INFO[axis].hi}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        {score.notes && (
          <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-800 leading-relaxed italic">{score.notes}</p>
        )}
        <p className="text-[10px] text-gray-600 mt-3">{confidence.label}</p>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          {spectrumStatus.adminAction && (
            <ModuleAdminActionButton action={spectrumStatus.adminAction} onSuccess={onChanged} />
          )}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            {editing ? 'Cancel edit' : 'Edit Spectrum'}
          </button>
        </div>
      )}
      {isAdmin && editing && (
        <SpectrumAdminEditor
          songId={song.id}
          initial={score}
          onSaved={() => { setEditing(false); onChanged(); }}
        />
      )}

      <RhythmLabPanel musicScore={musicScore} moduleStatus={rhythmStatus} isAdmin={isAdmin} onChanged={onChanged} />
    </div>
  );
}

// Minimal manual-entry form — six numeric inputs + notes. Deliberately plain;
// this is an admin repair tool, not a public-facing surface.
function SpectrumAdminEditor({
  songId,
  initial,
  onSaved,
}: {
  songId: string;
  initial: NonNullable<WikiSongPageData['song']['score']>;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<ScoreAxisKey, number>>({
    aggression: initial.aggression, complexity: initial.complexity, atmosphere: initial.atmosphere,
    emotion: initial.emotion, psychedelic: initial.psychedelic, concept: initial.concept,
  });
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateSongSpectrum(songId, { ...values, notes: notes.trim() || null });
      onSaved();
    } catch {
      setError('Failed to save — check values and try again.');
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-900/70 border border-indigo-900/40 rounded-xl p-5 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SCORE_AXES.map((axis) => (
          <label key={axis} className="block">
            <span className="text-[10px] uppercase tracking-widest text-gray-500">{AXIS_LABELS[axis]}</span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={values[axis]}
              onChange={(e) => setValues((v) => ({ ...v, [axis]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }))}
              className="mt-1 w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-gray-500">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          className="mt-1 w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 resize-y"
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-wait text-white transition-colors"
      >
        {saving ? 'Saving…' : 'Save Spectrum'}
      </button>
    </div>
  );
}

// Musical Structure ("Rhythm Lab") — a companion spectrum answering how the
// music is BUILT (rhythm/harmony/structure) rather than how it feels
// emotionally. Read-only display of existing data; never triggers AI
// generation from a page view — only the explicit admin action does.
function RhythmLabPanel({
  musicScore,
  moduleStatus,
  isAdmin,
  onChanged,
}: {
  musicScore: WikiSongPageData['musicScore'];
  moduleStatus: ModuleDataStatus;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  if (!musicScore) {
    return (
      <div className="space-y-3">
        <WikiModulePlaceholder
          icon="🥁"
          title="Rhythm Lab"
          description="Analysis will appear after rhythm extraction."
          comingSoon
        />
        {isAdmin && moduleStatus.adminAction && (
          <ModuleAdminActionButton action={moduleStatus.adminAction} onSuccess={onChanged} />
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Rhythm Lab · Musical Structure</p>
        <KnowledgeConfidenceBadge level="ai" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        {MUSIC_SCORE_AXES.map((axis) => (
          <div key={axis}>
            <p className="text-[10px] text-gray-600 mb-0.5">{MUSIC_AXIS_LABELS[axis]}</p>
            <p className="text-sm font-bold tabular-nums text-gray-200">{musicScore[axis].toFixed(1)}</p>
          </div>
        ))}
      </div>
      {musicScore.rationale && (
        <p className="text-xs text-gray-500 leading-relaxed italic pt-3 border-t border-gray-800">{musicScore.rationale}</p>
      )}
      {isAdmin && moduleStatus.adminAction && (
        <div className="mt-3">
          <ModuleAdminActionButton action={moduleStatus.adminAction} onSuccess={onChanged} />
        </div>
      )}
    </div>
  );
}

// ── Community ratings ─────────────────────────────────────────────────────────
// Reuses the existing ratings system entirely (UserSongRating +
// /api/ratings) — this section adds no new backend, only a Song Card
// surface for it. Community average is public (no login needed to see
// it); only a logged-in player can see/edit their own rating, and only
// their own — the server scopes every write to req.user.userId, never a
// client-supplied id, so this can never touch another player's row or the
// canonical SongAxisScore.

function CommunityRatingPanel({ songId }: { songId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: communityMap } = useQuery({
    queryKey: ['public-community-single', songId],
    queryFn: () => ratingsApi.getCommunityRatings([songId]),
    staleTime: 60_000,
  });
  const community = communityMap?.[songId] ?? null;

  const { data: mine } = useQuery({
    queryKey: ['song-ratings', songId],
    queryFn: () => ratingsApi.getSongRatings(songId),
    enabled: !!user,
    staleTime: 60_000,
  });
  const myRating = mine?.myRating ?? null;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['public-community-single', songId] });
    void queryClient.invalidateQueries({ queryKey: ['song-ratings', songId] });
  }

  if (!community && !user) {
    return (
      <WikiModulePlaceholder
        icon="💬"
        title="No community ratings yet."
        description="Sign in to be the first to rate this song."
      />
    );
  }

  return (
    <div className="space-y-4">
      {community ? (
        <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Community Rating</p>
            <KnowledgeConfidenceBadge level="community" />
          </div>
          <AxisBars scores={community.scores} />
          <p className="text-[10px] text-gray-600 mt-3">
            {community.count} rating{community.count !== 1 ? 's' : ''}
          </p>
        </div>
      ) : (
        <WikiModulePlaceholder
          icon="💬"
          title="No community ratings yet."
          description="Be the first to rate this song."
        />
      )}

      {user && !editing && (
        <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Your Rating</p>
            {myRating && <KnowledgeConfidenceBadge level="verified" />}
          </div>
          {myRating ? (
            <>
              <AxisBars scores={myRating} />
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-4 text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Edit your rating
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3">You haven't rated this song yet.</p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                Rate this song
              </button>
            </>
          )}
        </div>
      )}

      {user && editing && (
        <CommunityRatingForm
          songId={songId}
          initial={myRating}
          onSaved={() => { setEditing(false); refresh(); }}
          onCancel={() => setEditing(false)}
        />
      )}

      {!user && community && (
        <p className="text-xs text-gray-500">
          <a href="/api/auth/google" className="text-indigo-400 hover:text-indigo-300 transition-colors">Sign in</a> to rate this song yourself.
        </p>
      )}
    </div>
  );
}

function AxisBars({ scores }: { scores: Record<ScoreAxisKey, number> }) {
  return (
    <div className="space-y-2.5">
      {SCORE_AXES.map((axis) => (
        <div key={axis}>
          <div className="flex justify-between items-baseline mb-0.5">
            <span className="text-xs text-gray-400">{AXIS_LABELS[axis]}</span>
            <span className="text-xs font-bold tabular-nums" style={{ color: AXIS_COLORS[axis] }}>
              {scores[axis].toFixed(1)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.max(0, Math.min(scores[axis], 10)) * 10}%`, backgroundColor: AXIS_COLORS[axis] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// Any logged-in player may submit — this writes UserSongRating (their own
// row, upserted server-side by req.user.userId), never SongAxisScore.
function CommunityRatingForm({
  songId,
  initial,
  onSaved,
  onCancel,
}: {
  songId: string;
  initial: Record<ScoreAxisKey, number> | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<ScoreAxisKey, number>>({
    aggression: initial?.aggression ?? 5, complexity: initial?.complexity ?? 5, atmosphere: initial?.atmosphere ?? 5,
    emotion: initial?.emotion ?? 5, psychedelic: initial?.psychedelic ?? 5, concept: initial?.concept ?? 5,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await ratingsApi.upsertMyRating(songId, values);
      onSaved();
    } catch {
      setError('Failed to save your rating — try again.');
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-900/70 border border-indigo-900/40 rounded-xl p-5 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SCORE_AXES.map((axis) => (
          <label key={axis} className="block">
            <span className="text-[10px] uppercase tracking-widest text-gray-500">{AXIS_LABELS[axis]}</span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={values[axis]}
              onChange={(e) => setValues((v) => ({ ...v, [axis]: Number(e.target.value) }))}
              className="w-full mt-1.5 accent-indigo-500"
            />
            <span className="text-xs font-bold tabular-nums" style={{ color: AXIS_COLORS[axis] }}>
              {values[axis].toFixed(1)}
            </span>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-wait text-white transition-colors"
        >
          {saving ? 'Saving…' : 'Save Rating'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold px-3 py-2 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Media (the official YouTube video) ────────────────────────────────────────
// Admins add/replace/edit/remove; players only ever watch, open on YouTube,
// or share. A flagged video (needs_review/broken/private) never auto-plays
// for anyone — the thumbnail is disabled and a caution label takes its place.

const MEDIA_FLAG_LABEL: Record<string, string> = {
  needs_review: 'Flagged for review',
  broken: 'Link reported broken',
  private: 'May be private or unlisted',
};

function SongMediaPanel({
  media,
  songId,
  isAdmin,
  onChanged,
}: {
  media: WikiSongPageData['song']['media'];
  songId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');
  const [showPlayer, setShowPlayer] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasVideo = !!media && media.status !== 'removed';

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
        return;
      }
    } catch {
      // fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing more we can do without a new dependency
    }
  }

  if (!hasVideo) {
    return (
      <div className="space-y-3">
        <WikiModulePlaceholder
          icon="🎬"
          title="No official video has been linked yet."
          description="Once an admin links this song's official video, it will play here."
        />
        {isAdmin && mode === 'view' && (
          <button
            type="button"
            onClick={() => setMode('add')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-900/50 text-amber-300 hover:bg-amber-900/40 transition-colors"
          >
            + Add YouTube Video
          </button>
        )}
        {isAdmin && mode === 'add' && (
          <SongMediaEditForm
            songId={songId}
            onSaved={() => { setMode('view'); onChanged(); }}
            onCancel={() => setMode('view')}
          />
        )}
      </div>
    );
  }

  const flagged = media.status !== 'available';

  return (
    <div className="space-y-4">
      <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl overflow-hidden">
        <div className="relative aspect-video bg-black">
          {showPlayer && !flagged ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${media.youtubeVideoId}`}
              title={media.title ?? 'Official video'}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => { if (!flagged) setShowPlayer(true); }}
              disabled={flagged}
              className="absolute inset-0 w-full h-full group disabled:cursor-not-allowed"
              aria-label={flagged ? MEDIA_FLAG_LABEL[media.status] : 'Play video'}
            >
              <img
                src={`https://i.ytimg.com/vi/${media.youtubeVideoId}/hqdefault.jpg`}
                alt=""
                className={`w-full h-full object-cover transition-opacity ${flagged ? 'opacity-40' : 'opacity-90 group-hover:opacity-100'}`}
              />
              {!flagged ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-16 h-16 rounded-full bg-black/60 border border-white/30 flex items-center justify-center text-2xl text-white group-hover:scale-105 transition-transform motion-reduce:transition-none">
                    ▶
                  </span>
                </span>
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="text-xs text-amber-300 font-medium px-3 py-1.5 rounded-full bg-black/70 border border-amber-800/50">
                    {MEDIA_FLAG_LABEL[media.status]}
                  </span>
                </span>
              )}
            </button>
          )}
        </div>
        <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            {media.title && <p className="text-sm text-gray-200 truncate">{media.title}</p>}
            <p className="text-[10px] text-gray-600 mt-0.5">Official video · YouTube</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={`https://www.youtube.com/watch?v=${media.youtubeVideoId}`}
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Open on YouTube ↗
            </a>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>
      </div>

      {isAdmin && mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Replace
          </button>
          {!flagged && (
            <button
              type="button"
              onClick={() => void patchSongMedia(songId, { status: 'needs_review' }).then(onChanged)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Flag for review
            </button>
          )}
          <button
            type="button"
            onClick={() => { if (window.confirm('Remove this video? It can be re-added later.')) void removeSongMedia(songId).then(onChanged); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-950/30 border border-red-900/40 text-red-300 hover:bg-red-900/30 transition-colors"
          >
            Remove
          </button>
        </div>
      )}
      {isAdmin && mode === 'edit' && (
        <SongMediaEditForm
          songId={songId}
          initialUrl={`https://www.youtube.com/watch?v=${media.youtubeVideoId}`}
          initialTitle={media.title}
          onSaved={() => { setMode('view'); onChanged(); }}
          onCancel={() => setMode('view')}
        />
      )}
    </div>
  );
}

// Minimal add/replace form — client-side normalization gives instant
// feedback, but the server independently re-validates and is the only
// thing that actually enforces "YouTube only, no arbitrary embeds."
function SongMediaEditForm({
  songId,
  initialUrl,
  initialTitle,
  onSaved,
  onCancel,
}: {
  songId: string;
  initialUrl?: string;
  initialTitle?: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [title, setTitle] = useState(initialTitle ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = url.trim() ? normalizeYouTubeUrl(url) : null;
  const showInvalid = url.trim().length > 0 && !preview;

  async function handleSave() {
    if (!preview) { setError('Enter a valid YouTube URL first.'); return; }
    setSaving(true);
    setError(null);
    try {
      await upsertSongMedia(songId, url.trim(), title.trim() || null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save — check the URL and try again.');
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-900/70 border border-indigo-900/40 rounded-xl p-5 space-y-3">
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-gray-500">YouTube URL</span>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          className={`mt-1 w-full bg-gray-950 border rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none ${showInvalid ? 'border-red-800 focus:border-red-600' : 'border-gray-700 focus:border-indigo-500'}`}
        />
        {showInvalid && (
          <p className="text-[10px] text-red-400 mt-1">
            Not a recognized YouTube URL. Supports youtube.com/watch, youtu.be, /embed/, and /shorts/ links.
          </p>
        )}
        {preview && (
          <p className="text-[10px] text-emerald-400 mt-1">✓ Video ID: {preview.videoId}</p>
        )}
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-gray-500">Title (optional)</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="mt-1 w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
        />
      </label>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !preview}
          className="text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          {saving ? 'Saving…' : 'Save Video'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold px-3 py-2 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Related songs ─────────────────────────────────────────────────────────────

function RelatedSongs({
  albumSiblings,
  relatedByRarity,
  relatedBySpectrum,
  currentTier,
  bandSlug,
  albumSlug,
}: {
  albumSiblings: WikiSongPageData['albumSiblings'];
  relatedByRarity: WikiSongPageData['relatedByRarity'];
  relatedBySpectrum: WikiSongPageData['relatedBySpectrum'];
  currentTier: LiveFrequencyTier;
  bandSlug: string;
  albumSlug?: string;
}) {
  return (
    <div className="space-y-5">
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
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-gray-800 hover:border-indigo-800/60 hover:bg-gray-800/60 transition-colors group truncate"
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

      {relatedBySpectrum.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Similar by Spectrum</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {relatedBySpectrum.map((s) => (
              <Link
                key={s.id}
                to={`/wiki/songs/${s.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-gray-800 hover:border-indigo-800/60 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 group-hover:text-white truncate transition-colors">{s.title}</p>
                  {s.album && <p className="text-[10px] text-gray-600 truncate">{s.album.title}</p>}
                </div>
                <span className="text-[10px] font-medium text-violet-400 shrink-0">
                  {s.distance < 2 ? 'Very close' : s.distance < 4 ? 'Close' : 'Similar'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Reserved: concert co-occurrence (Phase Z.17) */}
      <WikiModulePlaceholder
        icon="🤝"
        title="Often played together"
        description="Songs that share setlists with this one will appear here once concert-graph analysis lands."
        comingSoon
      />

      {albumSiblings.length === 0 && relatedByRarity.length === 0 && (
        <p className="text-sm text-gray-500">No related songs found.</p>
      )}
    </div>
  );
}

// ── Goals ─────────────────────────────────────────────────────────────────────

function GoalsPanel({ goals }: { goals: Goal[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {goals.map((g, i) => (
        <Link
          key={i}
          to={g.to}
          className="group rounded-xl border border-gray-800 bg-gray-900/60 hover:border-indigo-800/70 hover:bg-gray-900 transition-colors p-5 flex flex-col gap-2"
        >
          <span className="text-2xl leading-none">{g.icon}</span>
          <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors leading-snug">
            {g.title}
          </span>
          <span className="text-xs text-gray-500 leading-relaxed">{g.sub}</span>
          <span className="text-xs text-indigo-400 group-hover:text-indigo-300 transition-colors mt-auto pt-1">
            Go →
          </span>
        </Link>
      ))}
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
    <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
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

// ── Song Health ────────────────────────────────────────────────────────────────
// One panel, two audiences. Everyone sees what BSM's knowledge of this song
// looks like; admins additionally see the action that fills each gap. The
// module list itself is entirely server-computed (songHealthService) — this
// component only renders it.

function healthColor(pct: number): string {
  return pct >= 90 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
}

function SongHealthPanel({
  health,
  songId,
  isAdmin,
  onChanged,
}: {
  health: SongHealth;
  songId: string;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900/70 border border-[#1a2332] rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-300 leading-relaxed" style={{ fontFamily: SERIF }}>
            How complete is our knowledge of this song?
          </p>
          <span className={`text-3xl font-black tabular-nums leading-none shrink-0 ml-4 ${healthColor(health.overallPct)}`}>
            {health.overallPct}%
          </span>
        </div>
        <FillBar pct={health.overallPct} barClass={health.overallPct >= 90 ? 'bg-emerald-600' : health.overallPct >= 60 ? 'bg-amber-600' : 'bg-red-600'} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
          {health.modules.map((m) => (
            <div key={m.moduleKey} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-950/50 border border-gray-900">
              <div className="flex items-center gap-2 min-w-0">
                <span aria-hidden className={`text-sm shrink-0 ${m.hasData ? 'text-emerald-400' : m.status === 'skipped' ? 'text-gray-600' : 'text-gray-600'}`}>
                  {m.hasData ? '✓' : m.status === 'skipped' ? '—' : '○'}
                </span>
                <span className="text-xs text-gray-300 truncate">{m.title}</span>
              </div>
              {isAdmin && m.adminAction && !m.hasData && (
                <ModuleAdminActionButton action={m.adminAction} onSuccess={onChanged} className="shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <AnalyzeButton scope="song" targetId={songId} label="Analyze Song" onDone={onChanged} />
      )}
    </div>
  );
}

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

// Sections rise gently into place, staggered by reading order.
// Motion is disabled entirely under prefers-reduced-motion.
function RiseStyles() {
  return (
    <style>{`
      @keyframes sc-rise {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .sc-rise {
        animation: sc-rise 0.5s ease-out both;
        animation-delay: calc(var(--sc-i, 0) * 60ms);
      }
      @media (prefers-reduced-motion: reduce) {
        .sc-rise { animation: none; }
      }
    `}</style>
  );
}

function Section({
  id,
  title,
  children,
  badge,
  index = 0,
}: {
  id: string;
  title: string;
  children: ReactNode;
  badge?: ReactNode;
  index?: number;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 sc-rise"
      style={{ '--sc-i': index } as CSSProperties}
    >
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest shrink-0">{title}</h2>
        {badge}
        <div className="flex-1 h-px bg-[#1a2332]" />
      </div>
      {children}
    </section>
  );
}

// Progress bar that fills smoothly on first paint
function FillBar({ pct, barClass }: { pct: number; barClass: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setWidth(Math.min(pct, 100)));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [pct]);
  return (
    <div className="h-2 bg-gray-800/80 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${barClass} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
        style={{ width: `${width}%` }}
      />
    </div>
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

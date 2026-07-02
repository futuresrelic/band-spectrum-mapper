import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getWikiSong } from '../../api/wiki';
import WikiLayout, {
  WikiSection,
  WikiStat,
  WikiBreadcrumb,
  SpectrumBar,
} from '../../components/wiki/WikiLayout';
import KnowledgeConfidenceBadge from '../../components/wiki/KnowledgeConfidenceBadge';
import WikiModulePlaceholder from '../../components/wiki/WikiModulePlaceholder';

const AXES = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;

function rarityColor(rarity: string): string {
  switch (rarity) {
    case 'Mythic':    return 'text-pink-400';
    case 'Legendary': return 'text-yellow-400';
    case 'Rare':      return 'text-violet-400';
    case 'Uncommon':  return 'text-sky-400';
    default:          return 'text-gray-500';
  }
}

function liveStatusColor(status: string): string {
  switch (status) {
    case 'Staple':         return 'text-emerald-400';
    case 'Common':         return 'text-sky-400';
    case 'Occasional':     return 'text-blue-400';
    case 'Rare':           return 'text-violet-400';
    case 'Extremely Rare': return 'text-pink-400';
    case 'Never Played':   return 'text-gray-600';
    default:               return 'text-gray-500';
  }
}

function fmt(secs: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function WikiSongPage() {
  const { songId = '' } = useParams<{ songId: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wiki', 'song', songId],
    queryFn: () => getWikiSong(songId),
    enabled: !!songId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingShell />;
  if (isError || !data) return <ErrorShell />;

  const { song, collectedCount, albumSiblings } = data;
  const lp = song.bandRpgProfile;
  const primaryLyric = song.lyrics[0] ?? null;

  const nav = [
    { id: 'overview', label: 'Overview' },
    { id: 'spectrum', label: 'Spectrum' },
    { id: 'live',     label: 'Live Data' },
    { id: 'lyrics',   label: 'Lyrics' },
    { id: 'context',  label: 'Context' },
  ];

  return (
    <WikiLayout
      nav={nav}
      title={song.title}
      eyebrow={
        <span>
          <Link to={`/wiki/bands/${song.band.slug}`} className="hover:text-indigo-400 transition-colors">
            {song.band.name}
          </Link>
          {song.album ? (
            <>
              {' · '}
              <Link
                to={`/wiki/albums/${song.band.slug}/${song.album.slug}`}
                className="hover:text-indigo-400 transition-colors"
              >
                {song.album.title}
              </Link>
              {song.album.year ? ` (${song.album.year})` : ''}
            </>
          ) : null}
        </span>
      }
    >
      <WikiBreadcrumb
        crumbs={[
          { label: song.band.name, to: `/wiki/bands/${song.band.slug}` },
          ...(song.album
            ? [{ label: song.album.title, to: `/wiki/albums/${song.band.slug}/${song.album.slug}` }]
            : []),
          { label: song.title, to: `/wiki/songs/${song.id}` },
        ]}
      />

      {/* ── Overview ── */}
      <WikiSection id="overview" title="Overview">
        <div className="flex gap-5 items-start">
          {song.album?.artworkUrl && (
            <Link to={`/wiki/albums/${song.band.slug}/${song.album.slug}`}>
              <img
                src={song.album.artworkUrl}
                alt={song.album.title}
                className="w-24 h-24 rounded-lg object-cover border border-gray-800 shrink-0 hover:border-indigo-800 transition-colors"
              />
            </Link>
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1 bg-gray-900 border border-gray-800 rounded-lg p-5">
            <WikiStat
              label="Rarity"
              value={
                <span className={rarityColor(song.rarity)}>{song.rarity}</span>
              }
            />
            <WikiStat label="Duration" value={fmt(song.durationSeconds)} />
            <WikiStat
              label="Instrumental"
              value={song.isInstrumental ? 'Yes' : 'No'}
            />
            <WikiStat
              label="Players Collected"
              value={
                <span>
                  {collectedCount.toLocaleString()}
                  <KnowledgeConfidenceBadge level="calculated" className="ml-2" />
                </span>
              }
            />
            <WikiStat label="User Ratings" value={song._count.ratings.toLocaleString()} />
            {song.isRemix && <WikiStat label="Type" value="Remix" />}
          </dl>
        </div>

        {/* Album context strip */}
        {albumSiblings.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Also on this album</p>
            <div className="flex flex-wrap gap-1.5">
              {albumSiblings.map((s) => (
                <Link
                  key={s.id}
                  to={`/wiki/songs/${s.id}`}
                  className="text-xs px-2 py-1 rounded bg-gray-900 border border-gray-800 hover:border-indigo-800 text-gray-400 hover:text-gray-200 transition-colors truncate max-w-[180px]"
                  title={s.title}
                >
                  {s.trackNumber ? `${s.trackNumber}. ` : ''}{s.title}
                </Link>
              ))}
            </div>
          </div>
        )}
      </WikiSection>

      {/* ── Spectrum ── */}
      <WikiSection
        id="spectrum"
        title="Spectrum Analysis"
        badge={<KnowledgeConfidenceBadge level={song.score ? 'calculated' : 'estimated'} />}
      >
        {song.score ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
            {AXES.map((ax) => (
              <SpectrumBar key={ax} label={ax} value={song.score![ax]} />
            ))}
            {song.score.notes && (
              <p className="text-xs text-gray-500 mt-3 leading-relaxed border-t border-gray-800 pt-3">
                {song.score.notes}
              </p>
            )}
          </div>
        ) : (
          <WikiModulePlaceholder
            icon="📊"
            title="Not yet scored"
            description="This song hasn't been scored on the 6-axis spectrum yet. Run the AI batch scorer from the admin panel."
          />
        )}
      </WikiSection>

      {/* ── Live Data ── */}
      <WikiSection
        id="live"
        title="Live Performance"
        badge={<KnowledgeConfidenceBadge level={lp ? 'calculated' : 'estimated'} />}
      >
        {lp ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-900 border border-gray-800 rounded-lg p-5">
              <WikiStat
                label="Live Status"
                value={<span className={liveStatusColor(lp.liveStatus)}>{lp.liveStatus}</span>}
              />
              <WikiStat label="Performances" value={lp.totalPerformances.toLocaleString()} />
              <WikiStat label="Show Coverage" value={`${lp.performancePct.toFixed(1)}%`} />
              <WikiStat label="Rarity Index" value={`${lp.rarityIndex.toFixed(0)} / 100`} />
              <WikiStat label="Distinct Years" value={lp.distinctYears} />
              <WikiStat
                label="First played"
                value={lp.firstPerformanceDate
                  ? new Date(lp.firstPerformanceDate).getFullYear()
                  : '—'}
              />
              <WikiStat
                label="Last played"
                value={lp.lastPerformanceDate
                  ? new Date(lp.lastPerformanceDate).getFullYear()
                  : '—'}
              />
              {lp.yearsSincePlayed !== null && (
                <WikiStat label="Years since played" value={lp.yearsSincePlayed.toFixed(1)} />
              )}
            </dl>

            {lp.totalPerformances === 0 && (
              <p className="text-xs text-gray-500 italic">
                No confirmed live performances found in Setlist.fm data.
              </p>
            )}
          </div>
        ) : (
          <WikiModulePlaceholder
            icon="📡"
            title="No live data"
            description="Live performance data hasn't been fetched for this band yet."
          />
        )}
      </WikiSection>

      {/* ── Lyrics ── */}
      <WikiSection id="lyrics" title="Lyrics">
        {song.isInstrumental ? (
          <p className="text-sm text-gray-500 italic">This is an instrumental track.</p>
        ) : primaryLyric ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <KnowledgeConfidenceBadge level="verified" />
              {primaryLyric.sourceLabel && (
                <span className="text-[10px] text-gray-600">{primaryLyric.sourceLabel}</span>
              )}
            </div>
            <pre className="text-sm text-gray-300 leading-relaxed font-sans whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
              {primaryLyric.text}
            </pre>
          </div>
        ) : (
          <WikiModulePlaceholder
            icon="📝"
            title="No lyrics"
            description="Lyrics haven't been added yet. They can be imported via the admin lyrics tools."
          />
        )}
      </WikiSection>

      {/* ── Context ── */}
      <WikiSection id="context" title="Context">
        {song.notes ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <p className="text-sm text-gray-300 leading-relaxed">{song.notes}</p>
          </div>
        ) : (
          <WikiModulePlaceholder
            icon="🔍"
            title="Analysis & Context"
            description="Song history, themes, and lyrical analysis will appear here as BSM's knowledge grows."
            comingSoon
          />
        )}
      </WikiSection>
    </WikiLayout>
  );
}

function LoadingShell() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ErrorShell() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-3">
      <p className="text-gray-400 text-sm">Song not found.</p>
      <Link to="/wiki" className="text-xs text-indigo-400 hover:text-indigo-300">← Back to Wiki</Link>
    </div>
  );
}

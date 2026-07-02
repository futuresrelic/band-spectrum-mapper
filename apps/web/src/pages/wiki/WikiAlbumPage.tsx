import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getWikiAlbum } from '../../api/wiki';
import WikiLayout, {
  WikiSection,
  WikiStat,
  WikiBreadcrumb,
  SpectrumBar,
} from '../../components/wiki/WikiLayout';
import KnowledgeConfidenceBadge from '../../components/wiki/KnowledgeConfidenceBadge';

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];

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

export default function WikiAlbumPage() {
  const { bandSlug = '', albumSlug = '' } = useParams<{ bandSlug: string; albumSlug: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wiki', 'album', bandSlug, albumSlug],
    queryFn: () => getWikiAlbum(bandSlug, albumSlug),
    enabled: !!bandSlug && !!albumSlug,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingShell />;
  if (isError || !data) return <ErrorShell />;

  const { band, album, avgSpectrum, rarityBreakdown } = data;
  const axisKeys = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;

  const nav = [
    { id: 'overview',  label: 'Overview' },
    { id: 'tracklist', label: 'Tracklist' },
    { id: 'spectrum',  label: 'Spectrum' },
    { id: 'rarity',    label: 'Rarity' },
  ];

  return (
    <WikiLayout
      nav={nav}
      title={album.title}
      subtitle={album.notes ?? undefined}
      eyebrow={
        <span>
          <Link to={`/wiki/bands/${band.slug}`} className="hover:text-indigo-400 transition-colors">{band.name}</Link>
          {' · Album'}
          {album.year ? ` · ${album.year}` : ''}
        </span>
      }
    >
      <WikiBreadcrumb
        crumbs={[
          { label: band.name, to: `/wiki/bands/${band.slug}` },
          { label: album.title, to: `/wiki/albums/${band.slug}/${album.slug}` },
        ]}
      />

      {/* ── Overview ── */}
      <WikiSection id="overview" title="Overview">
        <div className="flex gap-5 items-start">
          {album.artworkUrl && (
            <img
              src={album.artworkUrl}
              alt={album.title}
              className="w-28 h-28 sm:w-36 sm:h-36 rounded-lg object-cover border border-gray-800 shrink-0"
            />
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1 bg-gray-900 border border-gray-800 rounded-lg p-5">
            <WikiStat label="Year" value={album.year ?? '—'} />
            <WikiStat label="Songs" value={album.songs.length} />
            <WikiStat label="Type" value={album.albumType ?? '—'} />
            <WikiStat
              label="Scored songs"
              value={`${album.songs.filter((s) => s.score).length} / ${album.songs.length}`}
            />
            <WikiStat
              label="Live profiles"
              value={`${album.songs.filter((s) => s.bandRpgProfile).length} / ${album.songs.length}`}
            />
          </dl>
        </div>
      </WikiSection>

      {/* ── Tracklist ── */}
      <WikiSection id="tracklist" title="Tracklist">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-gray-600 border-b border-gray-800">
                <th className="text-left py-2 pr-3 w-8">#</th>
                <th className="text-left py-2 pr-3">Title</th>
                <th className="text-right py-2 pr-3">Duration</th>
                <th className="text-center py-2 pr-3">Rarity</th>
                <th className="text-center py-2">Live</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900">
              {album.songs.map((s) => (
                <tr key={s.id} className="group hover:bg-gray-900/50 transition-colors">
                  <td className="py-2.5 pr-3 text-gray-600 tabular-nums text-xs">
                    {s.trackNumber ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Link
                      to={`/wiki/songs/${s.id}`}
                      className="text-gray-200 group-hover:text-white hover:text-indigo-300 transition-colors"
                    >
                      {s.title}
                      {s.isInstrumental && <span className="ml-1.5 text-[9px] uppercase tracking-widest text-gray-600">instr</span>}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-gray-500 text-xs">
                    {fmt(s.durationSeconds)}
                  </td>
                  <td className="py-2.5 pr-3 text-center">
                    <span className={`text-[10px] font-medium uppercase tracking-widest ${rarityColor(s.rarity)}`}>
                      {s.rarity}
                    </span>
                  </td>
                  <td className="py-2.5 text-center">
                    {s.bandRpgProfile ? (
                      <span className={`text-[10px] font-medium ${liveStatusColor(s.bandRpgProfile.liveStatus)}`}>
                        {s.bandRpgProfile.liveStatus}
                      </span>
                    ) : (
                      <span className="text-gray-700 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WikiSection>

      {/* ── Spectrum ── */}
      <WikiSection id="spectrum" title="Average Spectrum" badge={<KnowledgeConfidenceBadge level="calculated" />}>
        {avgSpectrum ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
            {axisKeys.map((ax) => (
              <SpectrumBar key={ax} label={ax} value={avgSpectrum[ax]} />
            ))}
            <p className="text-[10px] text-gray-600 mt-2">
              Average across {album.songs.filter((s) => s.score).length} scored songs.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No songs have been spectrum-scored yet.</p>
        )}
      </WikiSection>

      {/* ── Rarity ── */}
      <WikiSection id="rarity" title="Rarity Breakdown" badge={<KnowledgeConfidenceBadge level="calculated" />}>
        <div className="flex flex-wrap gap-3">
          {RARITY_ORDER.filter((r) => rarityBreakdown[r]).map((r) => (
            <div key={r} className="flex flex-col items-center gap-1 px-5 py-3 bg-gray-900 border border-gray-800 rounded-lg">
              <span className={`text-xl font-bold tabular-nums ${rarityColor(r)}`}>
                {rarityBreakdown[r]}
              </span>
              <span className={`text-[10px] uppercase tracking-widest font-medium ${rarityColor(r)}`}>
                {r}
              </span>
            </div>
          ))}
        </div>
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
      <p className="text-gray-400 text-sm">Album not found.</p>
      <Link to="/wiki" className="text-xs text-indigo-400 hover:text-indigo-300">← Back to Wiki</Link>
    </div>
  );
}

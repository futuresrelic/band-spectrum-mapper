import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getWikiAlbum } from '../../api/wiki';
import { useAuth } from '../../contexts/AuthContext';
import WikiLayout, {
  WikiSection,
  WikiStat,
  WikiBreadcrumb,
  SpectrumBar,
} from '../../components/wiki/WikiLayout';
import KnowledgeConfidenceBadge from '../../components/wiki/KnowledgeConfidenceBadge';
import RadarChart from '../../components/charts/RadarChart';
import AnalyzeButton from '../../components/wiki/AnalyzeButton';
import { AXIS_LABELS } from '@band-spectrum-mapper/shared';
import { deriveLiveFrequency, LIVE_FREQUENCY_COLOR } from '../../lib/liveFrequency';

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];

function fmt(secs: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function WikiAlbumPage() {
  const { bandSlug = '', albumSlug = '' } = useParams<{ bandSlug: string; albumSlug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wiki', 'album', bandSlug, albumSlug],
    queryFn: () => getWikiAlbum(bandSlug, albumSlug),
    enabled: !!bandSlug && !!albumSlug,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingShell />;
  if (isError || !data) return <ErrorShell />;

  const { band, album, avgSpectrum, strongestAxis, mostComplexTrack, mostAtmosphericTrack, rarityBreakdown, health } = data;
  const axisKeys = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['wiki', 'album', bandSlug, albumSlug] });

  const nav = [
    { id: 'overview',  label: 'Overview' },
    { id: 'tracklist', label: 'Tracklist' },
    { id: 'spectrum',  label: 'Spectrum' },
    { id: 'rarity',    label: 'Rarity' },
    { id: 'health',    label: 'Album Health' },
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
                <th className="text-center py-2">Live Freq.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900">
              {album.songs.map((s) => {
                const { tier } = deriveLiveFrequency(s.bandRpgProfile?.liveStatus, s.rarity);
                const tierColor = LIVE_FREQUENCY_COLOR[tier];
                return (
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
                  <td className="py-2.5 text-center">
                    <span className={`text-[10px] font-medium uppercase tracking-widest ${tierColor}`}>
                      {tier}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </WikiSection>

      {/* ── Spectrum ── */}
      <WikiSection id="spectrum" title="Average Spectrum" badge={<KnowledgeConfidenceBadge level="calculated" />}>
        {avgSpectrum ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <div className="grid sm:grid-cols-[minmax(0,220px)_1fr] gap-5 items-start">
              <div className="max-w-[220px] mx-auto sm:mx-0 w-full">
                <RadarChart
                  datasets={[{ label: 'Average', scores: avgSpectrum, color: '#a78bfa' }]}
                  dark
                  outline
                  height={220}
                />
              </div>
              <div className="space-y-3 min-w-0">
                {axisKeys.map((ax) => (
                  <SpectrumBar key={ax} label={ax} value={avgSpectrum[ax]} />
                ))}
              </div>
            </div>

            {(strongestAxis || mostComplexTrack || mostAtmosphericTrack) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-800">
                {strongestAxis && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">Strongest axis</p>
                    <p className="text-sm font-semibold text-gray-200">
                      {AXIS_LABELS[strongestAxis.axis]} <span className="text-gray-500 font-normal">({strongestAxis.average.toFixed(1)})</span>
                    </p>
                  </div>
                )}
                {mostComplexTrack && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">Most complex track</p>
                    <Link to={`/wiki/songs/${mostComplexTrack.id}`} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200 transition-colors">
                      {mostComplexTrack.title}
                    </Link>
                  </div>
                )}
                {mostAtmosphericTrack && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-0.5">Most atmospheric track</p>
                    <Link to={`/wiki/songs/${mostAtmosphericTrack.id}`} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200 transition-colors">
                      {mostAtmosphericTrack.title}
                    </Link>
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-gray-600 mt-3">
              Average across {album.songs.filter((s) => s.score).length} scored songs.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No songs have been spectrum-scored yet.</p>
        )}
      </WikiSection>

      {/* ── Live Frequency breakdown ── */}
      <WikiSection id="rarity" title="Live Frequency Breakdown" badge={<KnowledgeConfidenceBadge level="calculated" />}>
        <div className="flex flex-wrap gap-3">
          {RARITY_ORDER.filter((r) => rarityBreakdown[r]).map((r) => {
            const { tier } = deriveLiveFrequency(null, r);
            const tierColor = LIVE_FREQUENCY_COLOR[tier];
            return (
            <div key={r} className="flex flex-col items-center gap-1 px-5 py-3 bg-gray-900 border border-gray-800 rounded-lg">
              <span className={`text-xl font-bold tabular-nums ${tierColor}`}>
                {rarityBreakdown[r]}
              </span>
              <span className={`text-[10px] uppercase tracking-widest font-medium ${tierColor}`}>
                {tier}
              </span>
            </div>
            );
          })}
        </div>
      </WikiSection>

      {/* ── Album Health ── */}
      <WikiSection id="health" title="Album Health" badge={<KnowledgeConfidenceBadge level="calculated" />}>
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-300">
                {health.songCount} song{health.songCount !== 1 ? 's' : ''} on this album
              </p>
              <span className={`text-2xl font-black tabular-nums ${health.overallPct >= 90 ? 'text-emerald-400' : health.overallPct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {health.overallPct}%
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {health.moduleCoverage.map((m) => (
                <div key={m.moduleKey} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-950/50 border border-gray-800">
                  <span className="text-xs text-gray-400">{m.title}</span>
                  <span className="text-xs font-semibold tabular-nums text-gray-300">{m.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          {user?.isAdmin && (
            <AnalyzeButton scope="album" targetId={album.id} label="Analyze Album" onDone={refetch} />
          )}
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

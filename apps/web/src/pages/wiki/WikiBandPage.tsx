import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getWikiBand } from '../../api/wiki';
import { useAuth } from '../../contexts/AuthContext';
import WikiLayout, {
  WikiSection,
  WikiStat,
  WikiBreadcrumb,
  SpectrumBar,
} from '../../components/wiki/WikiLayout';
import KnowledgeConfidenceBadge from '../../components/wiki/KnowledgeConfidenceBadge';
import WikiModulePlaceholder from '../../components/wiki/WikiModulePlaceholder';
import RadarChart from '../../components/charts/RadarChart';
import AnalyzeButton from '../../components/wiki/AnalyzeButton';
import { SCORE_AXES, AXIS_LABELS } from '@band-spectrum-mapper/shared';
import { tierFromLiveStatus, LIVE_FREQUENCY_COLOR } from '../../lib/liveFrequency';

export default function WikiBandPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wiki', 'band', slug],
    queryFn: () => getWikiBand(slug),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingShell />;
  if (isError || !data) return <ErrorShell />;

  const { band, topPlayed, rarestPlayed, spectrumRollup, health } = data;
  const studioAlbums = band.albums.filter((a) =>
    !a.albumType || ['studio', 'lp', 'ep'].includes(a.albumType),
  );
  const liveAlbums = band.albums.filter((a) =>
    a.albumType && ['live', 'bootleg', 'compilation'].includes(a.albumType),
  );

  const liveData = band.liveDataCache;
  const hasLiveData = liveData && liveData.fetchedShows > 0;
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['wiki', 'band', slug] });

  const nav = [
    { id: 'overview',    label: 'Overview' },
    { id: 'discography', label: 'Discography' },
    { id: 'members',     label: 'Members' },
    { id: 'live',        label: 'Live History' },
    { id: 'spectrum',    label: 'Spectrum' },
    { id: 'health',      label: 'Database Health' },
  ];

  return (
    <WikiLayout
      nav={nav}
      title={band.name}
      subtitle={band.description ?? undefined}
      eyebrow="Band"
    >
      <WikiBreadcrumb crumbs={[{ label: band.name, to: `/wiki/bands/${band.slug}` }]} />

      {/* ── Overview ── */}
      <WikiSection id="overview" title="Overview">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-900 border border-gray-800 rounded-lg p-5">
          <WikiStat label="Albums" value={band._count.albums} />
          <WikiStat label="Songs" value={band._count.songs} />
          <WikiStat label="Members" value={band.members.length || '—'} />
          <WikiStat
            label="Live Shows"
            value={
              hasLiveData ? (
                <span>
                  {liveData!.fetchedShows.toLocaleString()}
                  <KnowledgeConfidenceBadge level="calculated" className="ml-2" />
                </span>
              ) : (
                <span className="text-gray-500">Not fetched</span>
              )
            }
          />
        </dl>
      </WikiSection>

      {/* ── Discography ── */}
      <WikiSection id="discography" title="Discography">
        {studioAlbums.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Studio / EP</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
              {studioAlbums.map((a) => (
                <Link
                  key={a.id}
                  to={`/wiki/albums/${band.slug}/${a.slug}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="aspect-square rounded-md overflow-hidden bg-gray-800 border border-gray-800 group-hover:border-indigo-800 transition-colors">
                    {a.artworkUrl ? (
                      <img src={a.artworkUrl} alt={a.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-700 text-3xl">💿</div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-200 group-hover:text-white truncate transition-colors">{a.title}</p>
                    <p className="text-[10px] text-gray-500">{a.year ?? '—'} · {a._count.songs} songs</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {liveAlbums.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Live / Compilations</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {liveAlbums.map((a) => (
                <Link
                  key={a.id}
                  to={`/wiki/albums/${band.slug}/${a.slug}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="aspect-square rounded-md overflow-hidden bg-gray-800 border border-gray-800 group-hover:border-indigo-800 transition-colors">
                    {a.artworkUrl ? (
                      <img src={a.artworkUrl} alt={a.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-700 text-3xl">🎙</div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-200 group-hover:text-white truncate transition-colors">{a.title}</p>
                    <p className="text-[10px] text-gray-500">{a.year ?? '—'} · {a._count.songs} songs</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {band.albums.length === 0 && (
          <p className="text-sm text-gray-500">No albums in the collection yet.</p>
        )}
      </WikiSection>

      {/* ── Members ── */}
      <WikiSection id="members" title="Members">
        {band.members.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {band.members.map((m) => (
              <Link
                key={m.id}
                to={`/wiki/artists/${m.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-indigo-800 hover:bg-gray-800/80 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                  {m.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-200 group-hover:text-white truncate transition-colors">{m.name}</p>
                  {m.role && <p className="text-xs text-gray-500 capitalize">{m.role}</p>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <WikiModulePlaceholder
            icon="👤"
            title="No members listed"
            description="Band member profiles haven't been added yet."
          />
        )}
      </WikiSection>

      {/* ── Live History ── */}
      <WikiSection
        id="live"
        title="Live History"
        badge={<KnowledgeConfidenceBadge level="calculated" />}
      >
        {hasLiveData ? (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-900 border border-gray-800 rounded-lg p-5">
              <WikiStat label="Shows tracked" value={liveData!.fetchedShows.toLocaleString()} />
              <WikiStat label="Total shows" value={liveData!.totalShows > 0 ? liveData!.totalShows.toLocaleString() : '—'} />
              <WikiStat
                label="Last updated"
                value={liveData!.lastFetchedAt ? new Date(liveData!.lastFetchedAt).toLocaleDateString() : '—'}
              />
              <WikiStat label="Source" value="Setlist.fm" />
            </dl>

            {topPlayed.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Most Played</p>
                <div className="space-y-1">
                  {topPlayed.slice(0, 8).map((tp, i) => (
                    <Link
                      key={tp.song.id}
                      to={`/wiki/songs/${tp.song.id}`}
                      className="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-900 transition-colors group"
                    >
                      <span className="text-[10px] tabular-nums text-gray-600 w-4 shrink-0">{i + 1}</span>
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors flex-1 truncate">{tp.song.title}</span>
                      <span className="text-xs tabular-nums text-gray-500">{tp.totalPerformances}×</span>
                      <span className={`text-[10px] font-medium uppercase tracking-widest ${liveStatusColor(tp.liveStatus)}`}>{liveStatusLabel(tp.liveStatus)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {rarestPlayed.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Rarest Performed</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {rarestPlayed.map((rp) => (
                    <Link
                      key={rp.song.id}
                      to={`/wiki/songs/${rp.song.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded bg-gray-900 hover:bg-gray-800 border border-gray-800 transition-colors group"
                    >
                      <span className="text-sm text-gray-300 group-hover:text-white flex-1 truncate">{rp.song.title}</span>
                      <span className={`text-[10px] font-medium ${liveStatusColor(rp.liveStatus)}`}>{liveStatusLabel(rp.liveStatus)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <WikiModulePlaceholder
            icon="📡"
            title="Live data not yet fetched"
            description="An admin can fetch Setlist.fm data in the Band RPG admin panel to populate this section."
          />
        )}
      </WikiSection>

      {/* ── Spectrum ── */}
      <WikiSection id="spectrum" title="Spectrum Analysis" badge={spectrumRollup ? <KnowledgeConfidenceBadge level="calculated" /> : undefined}>
        {spectrumRollup ? (
          <div className="space-y-5">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
              <div className="grid sm:grid-cols-[minmax(0,220px)_1fr] gap-5 items-start">
                <div className="max-w-[220px] mx-auto sm:mx-0 w-full">
                  <RadarChart
                    datasets={[{ label: 'Average', scores: spectrumRollup.avgSpectrum, color: '#a78bfa' }]}
                    dark
                    outline
                    height={220}
                  />
                </div>
                <div className="space-y-3 min-w-0">
                  {SCORE_AXES.map((ax) => (
                    <SpectrumBar key={ax} label={ax} value={spectrumRollup.avgSpectrum[ax]} />
                  ))}
                </div>
              </div>
              {spectrumRollup.strongestAxis && (
                <p className="text-[10px] text-gray-600 mt-4 pt-4 border-t border-gray-800">
                  Strongest axis across the catalog:{' '}
                  <span className="text-gray-400 font-medium">
                    {AXIS_LABELS[spectrumRollup.strongestAxis.axis]} ({spectrumRollup.strongestAxis.average.toFixed(1)})
                  </span>
                </p>
              )}
            </div>

            {spectrumRollup.albumsByComplexity.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Albums by Complexity</p>
                <div className="space-y-1">
                  {spectrumRollup.albumsByComplexity.map((a) => {
                    const album = band.albums.find((al) => al.id === a.albumId);
                    const content = (
                      <>
                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors flex-1 truncate">{a.title}</span>
                        <span className="text-xs tabular-nums text-violet-400">{a.avgComplexity.toFixed(1)}</span>
                      </>
                    );
                    return album ? (
                      <Link
                        key={a.albumId}
                        to={`/wiki/albums/${band.slug}/${album.slug}`}
                        className="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-900 transition-colors group"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={a.albumId} className="flex items-center gap-3 px-3 py-2">{content}</div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {spectrumRollup.extremeTracks.mostComplex && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Most Complex</p>
                  <Link to={`/wiki/songs/${spectrumRollup.extremeTracks.mostComplex.id}`} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200 transition-colors">
                    {spectrumRollup.extremeTracks.mostComplex.title}
                  </Link>
                </div>
              )}
              {spectrumRollup.extremeTracks.mostAtmospheric && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Most Atmospheric</p>
                  <Link to={`/wiki/songs/${spectrumRollup.extremeTracks.mostAtmospheric.id}`} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200 transition-colors">
                    {spectrumRollup.extremeTracks.mostAtmospheric.title}
                  </Link>
                </div>
              )}
              {spectrumRollup.extremeTracks.mostAggressive && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Most Aggressive</p>
                  <Link to={`/wiki/songs/${spectrumRollup.extremeTracks.mostAggressive.id}`} className="text-sm font-semibold text-indigo-300 hover:text-indigo-200 transition-colors">
                    {spectrumRollup.extremeTracks.mostAggressive.title}
                  </Link>
                </div>
              )}
            </div>
          </div>
        ) : (
          <WikiModulePlaceholder
            icon="📊"
            title="Band-level spectrum"
            description="Aggregate spectrum heatmap across all albums will appear here once songs are scored."
            comingSoon
          />
        )}
      </WikiSection>

      {/* ── Database Health ── */}
      <WikiSection id="health" title="Database Health" badge={<KnowledgeConfidenceBadge level="calculated" />}>
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-300">
                How complete is our knowledge of {band.name}? · {health.songCount} song{health.songCount !== 1 ? 's' : ''}
              </p>
              <span className={`text-2xl font-black tabular-nums ${health.overallPct >= 90 ? 'text-emerald-400' : health.overallPct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                {health.overallPct}%
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {health.moduleCoverage.map((m) => (
                <div key={m.moduleKey} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-950/50 border border-gray-800">
                  <span className="text-xs text-gray-400">{m.title}</span>
                  <span className="text-xs font-semibold tabular-nums text-gray-300">
                    {m.songsComplete}/{health.songCount} · {m.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          {user?.isAdmin && (
            <AnalyzeButton scope="band" targetId={band.id} label="Analyze Band" onDone={refetch} />
          )}
        </div>
      </WikiSection>
    </WikiLayout>
  );
}

function liveStatusColor(status: string): string {
  return LIVE_FREQUENCY_COLOR[tierFromLiveStatus(status)] ?? 'text-gray-500';
}

function liveStatusLabel(status: string): string {
  return tierFromLiveStatus(status);
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
      <p className="text-gray-400 text-sm">Band not found.</p>
      <Link to="/wiki" className="text-xs text-indigo-400 hover:text-indigo-300">← Back to Wiki</Link>
    </div>
  );
}

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getWikiBand } from '../../api/wiki';
import WikiLayout, {
  WikiSection,
  WikiStat,
  WikiBreadcrumb,
} from '../../components/wiki/WikiLayout';
import KnowledgeConfidenceBadge from '../../components/wiki/KnowledgeConfidenceBadge';
import WikiModulePlaceholder from '../../components/wiki/WikiModulePlaceholder';
import { tierFromLiveStatus, LIVE_FREQUENCY_COLOR } from '../../lib/liveFrequency';

export default function WikiBandPage() {
  const { slug = '' } = useParams<{ slug: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wiki', 'band', slug],
    queryFn: () => getWikiBand(slug),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingShell />;
  if (isError || !data) return <ErrorShell />;

  const { band, topPlayed, rarestPlayed } = data;
  const studioAlbums = band.albums.filter((a) =>
    !a.albumType || ['studio', 'lp', 'ep'].includes(a.albumType),
  );
  const liveAlbums = band.albums.filter((a) =>
    a.albumType && ['live', 'bootleg', 'compilation'].includes(a.albumType),
  );

  const liveData = band.liveDataCache;
  const hasLiveData = liveData && liveData.fetchedShows > 0;

  const nav = [
    { id: 'overview',    label: 'Overview' },
    { id: 'discography', label: 'Discography' },
    { id: 'members',     label: 'Members' },
    { id: 'live',        label: 'Live History' },
    { id: 'spectrum',    label: 'Spectrum' },
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
      <WikiSection id="spectrum" title="Spectrum Analysis">
        <WikiModulePlaceholder
          icon="📊"
          title="Band-level spectrum"
          description="Aggregate spectrum heatmap across all albums will appear here once songs are scored."
          comingSoon
        />
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

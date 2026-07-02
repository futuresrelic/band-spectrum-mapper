import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getWikiArtist } from '../../api/wiki';
import WikiLayout, {
  WikiSection,
  WikiStat,
  WikiBreadcrumb,
} from '../../components/wiki/WikiLayout';
import WikiModulePlaceholder from '../../components/wiki/WikiModulePlaceholder';

export default function WikiArtistPage() {
  const { memberId = '' } = useParams<{ memberId: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wiki', 'artist', memberId],
    queryFn: () => getWikiArtist(memberId),
    enabled: !!memberId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingShell />;
  if (isError || !data) return <ErrorShell />;

  const { member } = data;
  const { band } = member;

  const studioAlbums = band.albums.filter(
    (a) => !a.albumType || ['studio', 'lp', 'ep'].includes(a.albumType),
  );

  const nav = [
    { id: 'overview',    label: 'Overview' },
    { id: 'discography', label: 'Discography' },
    { id: 'about',       label: 'About' },
  ];

  return (
    <WikiLayout
      nav={nav}
      title={member.name}
      eyebrow={
        <span>
          <Link to={`/wiki/bands/${band.slug}`} className="hover:text-indigo-400 transition-colors">
            {band.name}
          </Link>
          {member.role ? ` · ${member.role}` : ' · Member'}
        </span>
      }
    >
      <WikiBreadcrumb
        crumbs={[
          { label: band.name, to: `/wiki/bands/${band.slug}` },
          { label: member.name, to: `/wiki/artists/${member.id}` },
        ]}
      />

      {/* ── Overview ── */}
      <WikiSection id="overview" title="Overview">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-gray-900 border border-gray-800 rounded-lg p-5">
          <WikiStat label="Band" value={
            <Link to={`/wiki/bands/${band.slug}`} className="text-indigo-400 hover:text-indigo-300 transition-colors">
              {band.name}
            </Link>
          } />
          <WikiStat label="Role" value={member.role ?? '—'} />
          <WikiStat label="Albums" value={band.albums.length} />
          <WikiStat label="Songs" value={band._count.songs} />
        </dl>
      </WikiSection>

      {/* ── Discography ── */}
      <WikiSection id="discography" title="Discography">
        {studioAlbums.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                  <p className="text-[10px] text-gray-500">{a.year ?? '—'}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No discography in the collection.</p>
        )}
      </WikiSection>

      {/* ── About ── */}
      <WikiSection id="about" title="About">
        {member.visualNotes ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <p className="text-sm text-gray-300 leading-relaxed">{member.visualNotes}</p>
          </div>
        ) : (
          <WikiModulePlaceholder
            icon="👤"
            title="Artist biography"
            description="No detailed profile yet. Member bios and notes can be added in the admin band editor."
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
      <p className="text-gray-400 text-sm">Artist not found.</p>
      <Link to="/wiki" className="text-xs text-indigo-400 hover:text-indigo-300">← Back to Wiki</Link>
    </div>
  );
}

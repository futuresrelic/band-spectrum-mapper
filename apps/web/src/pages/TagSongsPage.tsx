import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import EmptyState from '../components/layout/EmptyState';
import type { Song, Band, Album } from '@band-spectrum-mapper/shared';

type TaggedSong = Song & {
  band: Pick<Band, 'id' | 'name' | 'slug'>;
  album: Pick<Album, 'id' | 'title' | 'slug'> | null;
};

export default function TagSongsPage() {
  const { tagSlug } = useParams<{ tagSlug: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['tag-songs', tagSlug],
    queryFn: () => api.get<{ tag: { id: string; name: string; slug: string }; songs: TaggedSong[] }>(
      `/api/tags/${tagSlug}/songs`,
    ),
    enabled: !!tagSlug,
  });

  if (isLoading) return <p className="text-surface-700 text-sm">Loading...</p>;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  const { tag, songs } = data;

  return (
    <div>
      <PageHeader
        title={`#${tag.name}`}
        subtitle={`${songs.length} song${songs.length !== 1 ? 's' : ''} tagged`}
        actions={<Link to="/library" className="btn-secondary">← Library</Link>}
      />

      {songs.length === 0 && <EmptyState message="No songs with this tag." />}

      {songs.length > 0 && (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left">
                <th className="pb-2 pr-4 font-medium text-surface-700">Song</th>
                <th className="pb-2 pr-4 font-medium text-surface-700">Band</th>
                <th className="pb-2 font-medium text-surface-700">Album</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song) => (
                <tr key={song.id} className="border-b border-surface-100">
                  <td className="py-2 pr-4">
                    <Link to={`/library/songs/${song.id}`} className="hover:underline font-medium">
                      {song.title}
                    </Link>
                    {song.trackNumber && (
                      <span className="ml-2 text-xs text-surface-500">#{song.trackNumber}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <Link to={`/library/bands/${song.band.id}`} className="hover:underline text-surface-700">
                      {song.band.name}
                    </Link>
                  </td>
                  <td className="py-2 text-surface-700">
                    {song.album ? (
                      <Link to={`/library/albums/${song.album.id}`} className="hover:underline">
                        {song.album.title}
                      </Link>
                    ) : (
                      <span className="text-surface-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

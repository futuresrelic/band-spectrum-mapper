import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import RadarChart from '../components/charts/RadarChart';
import type { Band, Album, Song, Lyric, SongAxisScore, AxisScoreMap } from '@band-spectrum-mapper/shared';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';

type PublicAlbum = Album & {
  songs: (Song & {
    score: SongAxisScore | null;
    lyrics: Lyric[];
  })[];
};

type PublicBand = Band & {
  albums: Album[];
  _count: { albums: number; songs: number };
};

function SongRow({ song }: { song: PublicAlbum['songs'][number] }) {
  const [expanded, setExpanded] = useState(false);
  const primaryLyric = song.lyrics[0];
  const hasScore = !!song.score;

  const scoreMap: AxisScoreMap | null = song.score
    ? {
        aggression: song.score.aggression,
        complexity: song.score.complexity,
        atmosphere: song.score.atmosphere,
        emotion: song.score.emotion,
        psychedelic: song.score.psychedelic,
        concept: song.score.concept,
      }
    : null;

  return (
    <li className="border-b border-surface-100 last:border-0">
      <button
        className="w-full text-left px-4 py-3 hover:bg-surface-50 transition-colors flex items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {song.trackNumber && (
            <span className="text-xs text-surface-700 w-6 text-right shrink-0">{song.trackNumber}</span>
          )}
          <span className="font-medium">{song.title}</span>
        </div>
        <span className="text-surface-700 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-5 space-y-5">
          {hasScore && scoreMap && (
            <div>
              <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-2">Spectrum</p>
              <div className="max-w-xs">
                <RadarChart datasets={[{ label: song.title, scores: scoreMap, color: '#374151' }]} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {SCORE_AXES.map((axis) => (
                  <div key={axis} className="text-xs">
                    <span className="text-surface-700 capitalize">{axis}</span>
                    <span className="ml-1 font-mono font-medium">{scoreMap[axis].toFixed(1)}</span>
                  </div>
                ))}
              </div>
              {song.score?.notes && (
                <p className="text-xs text-surface-700 mt-2 italic">{song.score.notes}</p>
              )}
            </div>
          )}

          {primaryLyric && (
            <div>
              <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-2">Lyrics</p>
              <pre className="font-mono text-sm whitespace-pre-wrap leading-relaxed text-surface-900 bg-surface-50 rounded p-3 border border-surface-200 max-h-96 overflow-auto">
                {primaryLyric.text}
              </pre>
            </div>
          )}

          {!primaryLyric && !hasScore && (
            <p className="text-sm text-surface-700">No content added yet.</p>
          )}
        </div>
      )}
    </li>
  );
}

export default function ViewerBandPage() {
  const { bandSlug } = useParams<{ bandSlug: string }>();

  const { data: band, isLoading: loadingBand } = useQuery({
    queryKey: ['public-band', bandSlug],
    queryFn: () => api.get<PublicBand>(`/api/public/bands/${bandSlug}`),
    enabled: !!bandSlug,
  });

  const { data: albums, isLoading: loadingAlbums } = useQuery({
    queryKey: ['public-albums', bandSlug],
    queryFn: () => api.get<PublicAlbum[]>(`/api/public/bands/${bandSlug}/albums`),
    enabled: !!bandSlug,
  });

  const isLoading = loadingBand || loadingAlbums;

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-2">
          <Link to="/view" className="text-sm text-surface-700 hover:underline">← All Bands</Link>
        </div>

        {isLoading && <p className="text-surface-700 mt-4">Loading...</p>}

        {band && (
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">{band.name}</h1>
            {band.description && (
              <p className="text-surface-700 mt-1">{band.description}</p>
            )}
            <p className="text-xs text-surface-700 mt-2">
              {band._count.albums} albums · {band._count.songs} songs
            </p>
          </div>
        )}

        {albums && albums.length === 0 && (
          <p className="text-surface-700">No albums yet.</p>
        )}

        {albums && albums.map((album) => (
          <div key={album.id} className="mb-8">
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-lg font-semibold">{album.title}</h2>
              {album.year && <span className="text-sm text-surface-700">{album.year}</span>}
            </div>

            {album.songs.length === 0 ? (
              <p className="text-sm text-surface-700 pl-4">No songs yet.</p>
            ) : (
              <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
                <ul>
                  {album.songs.map((song) => (
                    <SongRow key={song.id} song={song} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        <p className="text-xs text-surface-700 mt-12 border-t border-surface-200 pt-4">
          Read-only view · Band Spectrum Mapper
        </p>
      </div>
    </div>
  );
}

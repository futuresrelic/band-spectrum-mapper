import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { analysisApi } from '../api/analysis';
import { useAuth } from '../contexts/AuthContext';
import CoreSpectrumWidget from '../components/CoreSpectrumWidget';
import GenreSpectrumWidget from '../components/GenreSpectrumWidget';
import CommentSection from '../components/CommentSection';
import type { Band, Album, Song, Lyric, SongAxisScore } from '@band-spectrum-mapper/shared';

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

function SongExpanded({
  song,
}: {
  song: PublicAlbum['songs'][number];
}) {
  const { data: research } = useQuery({
    queryKey: ['song-research', song.id],
    queryFn: () => analysisApi.getSongResearch(song.id),
    retry: false,
  });

  const { data: context } = useQuery({
    queryKey: ['song-context', song.id],
    queryFn: () => analysisApi.getSongContext(song.id),
    retry: false,
  });

  const primaryLyric = song.lyrics[0];

  return (
    <div className="px-4 pb-5 space-y-5">
      {/* Core Spectrum with Community / Mine / AI tabs */}
      <div>
        <CoreSpectrumWidget songId={song.id} coreScore={song.score} />
      </div>

      {/* Genre spectrum */}
      <div>
        <div className="bg-surface-50 rounded-lg border border-surface-200 px-4 py-4">
          <GenreSpectrumWidget songId={song.id} />
        </div>
      </div>

      {/* Lyrics */}
      {primaryLyric && (
        <div>
          <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-2">Lyrics</p>
          <pre className="font-mono text-sm whitespace-pre-wrap leading-relaxed text-surface-900 bg-surface-50 rounded p-3 border border-surface-200 max-h-96 overflow-auto">
            {primaryLyric.text}
          </pre>
        </div>
      )}

      {/* Music style + research */}
      {research && (research.musicStyle || research.summary) && (
        <div className="space-y-3">
          {research.musicStyle && (
            <div>
              <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-1">Music Style</p>
              <p className="text-sm leading-relaxed text-surface-900">{research.musicStyle}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-1">Background</p>
            <p className="text-sm leading-relaxed text-surface-900">{research.summary}</p>
          </div>
        </div>
      )}

      {/* Deep analysis */}
      {context && (
        <div className="space-y-3 border-t border-surface-100 pt-4">
          {context.titleSignificance && (
            <div>
              <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-1">Title</p>
              <p className="text-sm leading-relaxed text-surface-900">{context.titleSignificance}</p>
            </div>
          )}
          {context.overallNarrative && (
            <div>
              <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-1">Analysis</p>
              <p className="text-sm leading-relaxed text-surface-900">{context.overallNarrative}</p>
            </div>
          )}
          {context.lyricalInterpretation && (
            <details className="border-t border-surface-100 pt-3">
              <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                Lyrical interpretation →
              </summary>
              <p className="text-sm leading-relaxed text-surface-900 mt-2">{context.lyricalInterpretation}</p>
            </details>
          )}
          {context.thematicSynthesis && (
            <details className="border-t border-surface-100 pt-3">
              <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                Thematic synthesis →
              </summary>
              <p className="text-sm leading-relaxed text-surface-900 mt-2">{context.thematicSynthesis}</p>
            </details>
          )}
        </div>
      )}

      {!primaryLyric && !song.score && !research && !context && (
        <p className="text-sm text-surface-700">No content added yet.</p>
      )}

      {/* Share link */}
      <div className="flex justify-end border-t border-surface-100 pt-3">
        <Link
          to={`/share/songs/${song.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:underline"
        >
          Share analysis ↗
        </Link>
      </div>

      {/* Comments */}
      <div className="border-t border-surface-100 pt-4">
        <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-3">Discussion</p>
        <CommentSection songId={song.id} card={false} />
      </div>
    </div>
  );
}

function SongRow({ song }: { song: PublicAlbum['songs'][number] }) {
  const [expanded, setExpanded] = useState(false);

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
        <div className="flex items-center gap-2">
          {song.score && (
            <span className="text-xs text-surface-400 hidden sm:inline">scored</span>
          )}
          <span className="text-surface-700 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && <SongExpanded song={song} />}
    </li>
  );
}

export default function ViewerBandPage() {
  const { bandSlug } = useParams<{ bandSlug: string }>();
  const { user } = useAuth();

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

  // Suppress TS unused-variable warning — user is used for conditional UI
  void useMemo(() => user, [user]);

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
          {user && (
            <Link to="/my/rate" className="ml-3 text-indigo-600 hover:underline">
              Rate songs →
            </Link>
          )}
          {!user && (
            <a href="/api/auth/google" className="ml-3 text-indigo-600 hover:underline">
              Sign in to rate →
            </a>
          )}
        </p>
      </div>
    </div>
  );
}

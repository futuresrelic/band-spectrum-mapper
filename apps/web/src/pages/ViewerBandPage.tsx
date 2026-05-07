import { useMemo, useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { analysisApi } from '../api/analysis';
import { useAuth } from '../contexts/AuthContext';
import SongSpectrumPanel from '../components/SongSpectrumPanel';
import CommentSection from '../components/CommentSection';
import type { Band, Album, Song, Lyric, SongAxisScore } from '@band-spectrum-mapper/shared';
import AlbumRadarCycler from '../components/AlbumRadarCycler';

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

function SongExpanded({ song }: { song: PublicAlbum['songs'][number] }) {
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

  const [showFullAi, setShowFullAi] = useState(false);
  const primaryLyric = song.lyrics[0];
  const tldr = context?.overallNarrative?.slice(0, 200);

  return (
    <div className="px-4 pb-5 space-y-5">
      {/* Unified spectrum panel */}
      <div className="bg-surface-50 rounded-lg border border-surface-200 px-4 py-4">
        <SongSpectrumPanel songId={song.id} coreScore={song.score} />
      </div>

      {/* AI Snapshot + opt-in toggle */}
      {tldr && (
        <div>
          <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-1">AI Snapshot</p>
          <p className="text-sm leading-relaxed text-surface-700 italic">
            {tldr}{context?.overallNarrative && context.overallNarrative.length > 200 ? '…' : ''}
          </p>
          <button
            onClick={() => setShowFullAi(!showFullAi)}
            className="text-xs text-indigo-600 hover:underline mt-1"
          >
            {showFullAi ? 'Hide full AI investigation ↑' : 'Read full AI investigation ↓'}
          </button>
        </div>
      )}

      {/* Discussion — user voice first */}
      <div className="border-t border-surface-100 pt-4">
        <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-3">Discussion</p>
        <CommentSection songId={song.id} card={false} />
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between border-t border-surface-100 pt-3 gap-2 flex-wrap">
        <Link
          to={`/rate?songId=${song.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-surface-900 text-white px-3 py-1.5 rounded hover:bg-surface-700 transition-colors"
        >
          Rate this song →
        </Link>
        <Link
          to={`/share/songs/${song.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:underline"
        >
          Share analysis ↗
        </Link>
      </div>

      {/* Full AI Investigation (revealed on demand) */}
      {showFullAi && (
        <div className="space-y-3 border border-surface-100 rounded-lg p-4 bg-surface-50">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium text-surface-700 uppercase tracking-wide">AI Full Investigation</p>
            <p className="text-[10px] text-surface-400">lyrics &amp; public info only — not the music</p>
          </div>
          {context?.titleSignificance && (
            <p className="text-xs text-surface-500 italic border-l-2 border-surface-200 pl-3 leading-relaxed">
              {context.titleSignificance}
            </p>
          )}
          {context?.overallNarrative && (
            <p className="text-sm leading-relaxed text-surface-900">{context.overallNarrative}</p>
          )}
          {research?.musicStyle && (
            <div className="border-t border-surface-100 pt-3">
              <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-1">Music Style</p>
              <p className="text-sm leading-relaxed text-surface-900">{research.musicStyle}</p>
            </div>
          )}
          {research?.summary && (
            <div className="border-t border-surface-100 pt-3">
              <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-1">Background</p>
              <p className="text-sm leading-relaxed text-surface-900">{research.summary}</p>
            </div>
          )}
          {context?.lyricalInterpretation && (
            <details className="border-t border-surface-100 pt-3">
              <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                Lyrical interpretation →
              </summary>
              <p className="text-sm leading-relaxed text-surface-900 mt-2">{context.lyricalInterpretation}</p>
            </details>
          )}
          {context?.thematicSynthesis && (
            <details className="border-t border-surface-100 pt-3">
              <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                Thematic synthesis →
              </summary>
              <p className="text-sm leading-relaxed text-surface-900 mt-2">{context.thematicSynthesis}</p>
            </details>
          )}
        </div>
      )}

      {/* Lyrics (collapsible) */}
      {primaryLyric && (
        <details className="border-t border-surface-100 pt-4">
          <summary className="text-xs font-medium text-surface-700 uppercase tracking-wide cursor-pointer hover:text-surface-900">
            Lyrics ▼
          </summary>
          <pre className="font-mono text-sm whitespace-pre-wrap leading-relaxed text-surface-900 bg-surface-50 rounded p-3 border border-surface-200 max-h-96 overflow-auto mt-2">
            {primaryLyric.text}
          </pre>
        </details>
      )}

      {!primaryLyric && !song.score && !research && !context && (
        <p className="text-sm text-surface-700">No content added yet.</p>
      )}
    </div>
  );
}

function SongRow({ song, defaultExpanded = false }: { song: PublicAlbum['songs'][number]; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (defaultExpanded && rowRef.current) {
      setTimeout(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    }
  }, [defaultExpanded]);

  return (
    <li ref={rowRef} id={`song-${song.id}`} className="border-b border-surface-100 last:border-0">
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
  const [showBandContext, setShowBandContext] = useState(false);

  const hashSongId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const h = window.location.hash;
    return h.startsWith('#song-') ? h.slice(6) : '';
  }, []);

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

  const { data: bandContext } = useQuery({
    queryKey: ['band-context', band?.id],
    queryFn: () => analysisApi.getBandContext(band!.id),
    enabled: !!band?.id && showBandContext,
    retry: false,
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
            <div className="flex items-center gap-3 mt-2">
              <p className="text-xs text-surface-400">
                {band._count.albums} albums · {band._count.songs} songs
              </p>
              <button
                onClick={() => setShowBandContext(!showBandContext)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {showBandContext ? 'Hide AI profile ↑' : 'AI artist profile ↓'}
              </button>
            </div>

            {showBandContext && (
              <div className="mt-4 bg-white rounded-lg border border-surface-200 p-4 space-y-3">
                {!bandContext && (
                  <p className="text-sm text-surface-500">Generating AI artist profile…</p>
                )}
                {bandContext && (
                  <>
                    <div>
                      <p className="text-xs font-medium text-surface-600 uppercase tracking-wide mb-1">Artist Overview</p>
                      <p className="text-sm leading-relaxed text-surface-900">{bandContext.overallNarrative}</p>
                    </div>
                    <details className="border-t border-surface-100 pt-3">
                      <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                        Thematic signature →
                      </summary>
                      <p className="text-sm leading-relaxed text-surface-900 mt-2">{bandContext.thematicSynthesis}</p>
                    </details>
                    <details className="border-t border-surface-100 pt-3">
                      <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-700">
                        Artistic evolution →
                      </summary>
                      <p className="text-sm leading-relaxed text-surface-900 mt-2">{bandContext.artisticEvolution}</p>
                    </details>
                    <p className="text-[10px] text-surface-400 border-t border-surface-100 pt-2">
                      Based on lyrics &amp; public information — not the music itself. Human ratings complete the picture.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {albums && albums.length === 0 && (
          <p className="text-surface-700">No albums yet.</p>
        )}

        {albums && albums.map((album) => (
          <div key={album.id} className="mb-10">
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-lg font-semibold">{album.title}</h2>
              {album.year && <span className="text-sm text-surface-700">{album.year}</span>}
              <Link
                to={`/share/albums/${album.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline ml-auto shrink-0"
              >
                Share album ↗
              </Link>
            </div>

            {/* Album spectrum cycler — shows when album has 2+ songs */}
            {album.songs.length >= 2 && band && (
              <AlbumRadarCycler albumId={album.id} bandSlug={band.slug} />
            )}

            {album.songs.length === 0 ? (
              <p className="text-sm text-surface-700 pl-4">No songs yet.</p>
            ) : (
              <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
                <ul>
                  {album.songs.map((song) => (
                    <SongRow key={song.id} song={song} defaultExpanded={song.id === hashSongId} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}

        <div className="mt-12 border-t border-surface-200 pt-4 space-y-2">
          <p className="text-xs text-surface-500">
            All analysis is based on <strong>lyrics and publicly available information</strong> — not the music itself.
            Spectrum scores reflect lyrical and conceptual qualities. The human interpretation lives in the ratings and comments below each song.
          </p>
          <p className="text-xs text-surface-400">
            Read-only view · Band Spectrum Mapper · expand any song to rate it
            {!user && (
              <a href="/api/auth/google" className="ml-3 text-indigo-600 hover:underline">
                Sign in to rate →
              </a>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

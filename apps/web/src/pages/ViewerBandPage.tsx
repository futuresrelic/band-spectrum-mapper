import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ratingsApi } from '../api/ratings';
import { analysisApi } from '../api/analysis';
import { useAuth } from '../contexts/AuthContext';
import RadarChart from '../components/charts/RadarChart';
import CommentSection from '../components/CommentSection';
import type { Band, Album, Song, Lyric, SongAxisScore, AxisScoreMap, CommunityScore, UserSongRating } from '@band-spectrum-mapper/shared';
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

type ScoreMode = 'core' | 'community' | 'mine';

function toAxisScoreMap(r: UserSongRating): AxisScoreMap {
  return {
    aggression: r.aggression,
    complexity: r.complexity,
    atmosphere: r.atmosphere,
    emotion: r.emotion,
    psychedelic: r.psychedelic,
    concept: r.concept,
  };
}

function SongExpanded({
  song,
  scoreMode,
  activeScore,
  scoreLabel,
  primaryLyric,
}: {
  song: PublicAlbum['songs'][number];
  scoreMode: ScoreMode;
  activeScore: AxisScoreMap | null;
  scoreLabel: string;
  primaryLyric: Lyric | undefined;
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

  return (
    <div className="px-4 pb-5 space-y-5">
      {/* Spectrum */}
      {activeScore ? (
        <div>
          <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-2">
            Spectrum · {scoreLabel}
          </p>
          <div className="max-w-xs">
            <RadarChart datasets={[{ label: song.title, scores: activeScore, color: '#374151' }]} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {SCORE_AXES.map((axis) => (
              <div key={axis} className="text-xs">
                <span className="text-surface-700 capitalize">{axis}</span>
                <span className="ml-1 font-mono font-medium">{activeScore[axis]}</span>
              </div>
            ))}
          </div>
          {scoreMode === 'core' && song.score?.notes && (
            <p className="text-xs text-surface-700 mt-2 italic">{song.score.notes}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-surface-500 italic">
          {scoreMode === 'core' && 'No core scores yet.'}
          {scoreMode === 'community' && 'No community ratings yet.'}
          {scoreMode === 'mine' && "You haven't rated this song yet."}
        </p>
      )}

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

      {/* Deep analysis highlights */}
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
        </div>
      )}

      {!primaryLyric && !activeScore && !research && !context && (
        <p className="text-sm text-surface-700">No content added yet.</p>
      )}

      {/* Comments */}
      <div className="border-t border-surface-100 pt-4">
        <p className="text-xs font-medium text-surface-700 uppercase tracking-wide mb-3">Discussion</p>
        <CommentSection songId={song.id} card={false} />
      </div>
    </div>
  );
}

function SongRow({
  song,
  scoreMode,
  activeScore,
  scoreLabel,
}: {
  song: PublicAlbum['songs'][number];
  scoreMode: ScoreMode;
  activeScore: AxisScoreMap | null;
  scoreLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const primaryLyric = song.lyrics[0];

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
        <SongExpanded
          song={song}
          scoreMode={scoreMode}
          activeScore={activeScore}
          scoreLabel={scoreLabel}
          primaryLyric={primaryLyric}
        />
      )}
    </li>
  );
}

export default function ViewerBandPage() {
  const { bandSlug } = useParams<{ bandSlug: string }>();
  const { user } = useAuth();
  const [scoreMode, setScoreMode] = useState<ScoreMode>('core');

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

  const allSongIds = useMemo(
    () => albums?.flatMap((a) => a.songs.map((s) => s.id)) ?? [],
    [albums],
  );

  const { data: communityMap } = useQuery({
    queryKey: ['public-community', allSongIds],
    queryFn: () => ratingsApi.getCommunityRatings(allSongIds),
    enabled: scoreMode === 'community' && allSongIds.length > 0,
  });

  const { data: mineMap } = useQuery({
    queryKey: ['my-ratings', allSongIds],
    queryFn: () => ratingsApi.getMyRatings(allSongIds),
    enabled: scoreMode === 'mine' && !!user && allSongIds.length > 0,
  });

  const isLoading = loadingBand || loadingAlbums;

  function getActiveScore(song: PublicAlbum['songs'][number]): AxisScoreMap | null {
    if (scoreMode === 'core') {
      if (!song.score) return null;
      return {
        aggression: song.score.aggression,
        complexity: song.score.complexity,
        atmosphere: song.score.atmosphere,
        emotion: song.score.emotion,
        psychedelic: song.score.psychedelic,
        concept: song.score.concept,
      };
    }
    if (scoreMode === 'community') {
      const cs: CommunityScore | undefined = communityMap?.[song.id];
      return cs?.scores ?? null;
    }
    if (scoreMode === 'mine') {
      const r: UserSongRating | undefined = mineMap?.[song.id];
      return r ? toAxisScoreMap(r) : null;
    }
    return null;
  }

  const scoreLabel: Record<ScoreMode, string> = {
    core: 'Core',
    community: 'Community',
    mine: 'Mine',
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-2">
          <Link to="/view" className="text-sm text-surface-700 hover:underline">← All Bands</Link>
        </div>

        {isLoading && <p className="text-surface-700 mt-4">Loading...</p>}

        {band && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">{band.name}</h1>
            {band.description && (
              <p className="text-surface-700 mt-1">{band.description}</p>
            )}
            <p className="text-xs text-surface-700 mt-2">
              {band._count.albums} albums · {band._count.songs} songs
            </p>
          </div>
        )}

        {/* Score mode selector */}
        {albums && albums.length > 0 && (
          <div className="flex gap-1 rounded-lg border border-surface-200 bg-white p-1 mb-8 w-fit">
            {(['core', 'community', 'mine'] as const).map((mode) => (
              <button
                key={mode}
                className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
                  scoreMode === mode
                    ? 'bg-surface-900 text-white'
                    : 'text-surface-600 hover:text-surface-900'
                }`}
                onClick={() => setScoreMode(mode)}
              >
                {scoreLabel[mode]}
              </button>
            ))}
          </div>
        )}

        {/* Mine mode — unauthenticated prompt */}
        {scoreMode === 'mine' && !user && (
          <div className="rounded-lg border border-surface-200 bg-white px-6 py-5 text-center mb-6">
            <p className="text-sm text-surface-700 mb-3">Sign in to see your personal ratings.</p>
            <a
              href="/dashboard"
              className="inline-block rounded bg-surface-900 px-4 py-2 text-sm font-medium text-white hover:bg-surface-700 transition-colors"
            >
              Go to app to sign in
            </a>
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
                    <SongRow
                      key={song.id}
                      song={song}
                      scoreMode={scoreMode}
                      activeScore={getActiveScore(song)}
                      scoreLabel={scoreLabel[scoreMode]}
                    />
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

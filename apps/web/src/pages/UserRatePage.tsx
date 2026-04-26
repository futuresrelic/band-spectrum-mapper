import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { bandsApi } from '../api/bands';
import { ratingsApi } from '../api/ratings';
import { songsApi } from '../api/songs';
import { AxisDescription, AxisHelpPanel, DISCLAIMER } from '../components/spectrum/AxisHelp';
import GenreSpectrumWidget from '../components/GenreSpectrumWidget';
import type { ScoreAxis, AxisScoreMap } from '@band-spectrum-mapper/shared';
import { SCORE_AXES } from '@band-spectrum-mapper/shared';

const AXIS_LABELS: Record<string, string> = {
  aggression: 'Aggression', complexity: 'Complexity', atmosphere: 'Atmosphere',
  emotion: 'Emotion', psychedelic: 'Psychedelic', concept: 'Concept',
};

const DEFAULT_SCORES: Record<ScoreAxis, number> = {
  aggression: 5, complexity: 5, atmosphere: 5, emotion: 5, psychedelic: 5, concept: 5,
};

function ScoreDisplay({ label, scores }: { label: string; scores: AxisScoreMap | null | undefined }) {
  if (!scores) return null;
  return (
    <div className="rounded border border-surface-200 bg-surface-50 px-3 py-2">
      <p className="text-xs font-medium text-surface-600 mb-1.5">{label}</p>
      <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
        {SCORE_AXES.map((axis) => (
          <div key={axis} className="flex justify-between text-xs">
            <span className="text-surface-600 capitalize">{axis.slice(0, 4)}</span>
            <span className="font-mono font-medium">{scores[axis]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UserRatePage() {
  const { user, login } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedBandId, setSelectedBandId] = useState('');
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [selectedSongId, setSelectedSongId] = useState(searchParams.get('songId') ?? '');
  const [myScores, setMyScores] = useState<Record<ScoreAxis, number>>({ ...DEFAULT_SCORES });
  const [saved, setSaved] = useState(false);

  const { data: bands } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  const { data: albums } = useQuery({
    queryKey: ['albums', selectedBandId],
    queryFn: () => bandsApi.listAlbums(selectedBandId),
    enabled: !!selectedBandId,
  });

  const { data: songs } = useQuery({
    queryKey: ['songs', selectedAlbumId || selectedBandId],
    queryFn: () =>
      selectedAlbumId
        ? bandsApi.listSongs(selectedBandId).then((all) => all.filter((s) => s.albumId === selectedAlbumId))
        : bandsApi.listSongs(selectedBandId),
    enabled: !!selectedBandId,
  });

  const { data: songDetail } = useQuery({
    queryKey: ['song', selectedSongId],
    queryFn: () => songsApi.getById(selectedSongId),
    enabled: !!selectedSongId,
  });

  const { data: songRatings } = useQuery({
    queryKey: ['song-ratings', selectedSongId],
    queryFn: () => ratingsApi.getSongRatings(selectedSongId),
    enabled: !!selectedSongId && !!user,
  });

  useEffect(() => {
    if (songRatings?.myRating) {
      const r = songRatings.myRating;
      setMyScores({
        aggression: r.aggression, complexity: r.complexity, atmosphere: r.atmosphere,
        emotion: r.emotion, psychedelic: r.psychedelic, concept: r.concept,
      });
    } else {
      setMyScores({ ...DEFAULT_SCORES });
    }
    setSaved(false);
  }, [songRatings, selectedSongId]);

  useEffect(() => {
    if (songDetail && selectedSongId) {
      setSelectedBandId(songDetail.bandId);
      if (songDetail.albumId) setSelectedAlbumId(songDetail.albumId);
    }
  }, [songDetail, selectedSongId]);

  const saveMutation = useMutation({
    mutationFn: () => ratingsApi.upsertMyRating(selectedSongId, myScores),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['song-ratings', selectedSongId] });
    },
  });

  const handleSongSelect = (songId: string) => {
    setSelectedSongId(songId);
    setSaved(false);
    setMyScores({ ...DEFAULT_SCORES });
    // Keep URL in sync so the page is bookmarkable and shareable
    navigate(songId ? `/my/rate?songId=${encodeURIComponent(songId)}` : '/my/rate', { replace: true });
  };

  const nextSong = () => {
    if (!songs || !selectedSongId) return;
    const idx = songs.findIndex((s) => s.id === selectedSongId);
    const next = songs[idx + 1];
    if (next) handleSongSelect(next.id);
  };

  const coreScores: AxisScoreMap | null = songDetail?.score ?? null;
  const communityScores = songRatings?.communityRating ?? null;
  const bandSlug = songDetail?.band?.slug ?? null;

  // Not signed in — prompt, preserving the songId so they land back here after auth
  if (!user) {
    const returnSongId = searchParams.get('songId');
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-4">
        <h1 className="text-2xl font-bold text-surface-900">Rate Songs</h1>
        <p className="text-surface-600 text-sm">
          Sign in with Google to submit your personal spectrum ratings.
          Your ratings are saved to your account and contribute to the community averages.
        </p>
        <button className="btn-primary" onClick={login}>
          Sign in with Google
        </button>
        <p className="text-xs text-surface-400">
          Just want to browse?{' '}
          <Link
            to={returnSongId ? `/view` : '/view'}
            className="underline hover:text-surface-700"
          >
            View analysis without signing in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-surface-900">Rate Songs</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          Your ratings are personal and also contribute to Community averages.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: song browser */}
        <div className="lg:col-span-2 space-y-3">
          <div className="card space-y-3">
            <div>
              <label className="label">Band</label>
              <select
                className="input"
                value={selectedBandId}
                onChange={(e) => {
                  setSelectedBandId(e.target.value);
                  setSelectedAlbumId('');
                  handleSongSelect('');
                }}
              >
                <option value="">Select a band...</option>
                {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            {albums && albums.length > 0 && (
              <div>
                <label className="label">
                  Album <span className="text-surface-400 font-normal">(optional)</span>
                </label>
                <select
                  className="input"
                  value={selectedAlbumId}
                  onChange={(e) => { setSelectedAlbumId(e.target.value); handleSongSelect(''); }}
                >
                  <option value="">All albums</option>
                  {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
            )}
          </div>

          {songs && songs.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <p className="text-xs text-surface-600 font-medium px-3 py-2 border-b border-surface-100">
                {songs.length} songs
              </p>
              <ul className="max-h-96 overflow-y-auto divide-y divide-surface-100">
                {songs.map((s) => (
                  <li key={s.id}>
                    <button
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        s.id === selectedSongId
                          ? 'bg-surface-900 text-white'
                          : 'hover:bg-surface-50'
                      }`}
                      onClick={() => handleSongSelect(s.id)}
                    >
                      <span className="truncate flex items-baseline gap-1.5">
                        {s.trackNumber && (
                          <span className="text-xs opacity-50 shrink-0">{s.trackNumber}.</span>
                        )}
                        {s.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: rating form */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedSongId && (
            <div className="card text-center py-10 text-surface-500 text-sm">
              Select a band and song to start rating
            </div>
          )}

          {selectedSongId && songDetail && (
            <>
              {/* Song info + reference scores */}
              <div className="card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{songDetail.title}</h2>
                    <p className="text-sm text-surface-600">
                      {[songDetail.band?.name, songDetail.album?.title].filter(Boolean).join(' — ')}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                    {bandSlug && (
                      <Link
                        to={`/view/${bandSlug}#song-${selectedSongId}`}
                        className="text-xs text-surface-500 hover:text-surface-900 border border-surface-200 rounded px-2 py-1 transition-colors"
                      >
                        View analysis
                      </Link>
                    )}
                    <Link
                      to={`/share/songs/${selectedSongId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1 transition-colors"
                    >
                      Share ↗
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <ScoreDisplay label="Core (baseline)" scores={coreScores} />
                  <ScoreDisplay
                    label={`Community (${communityScores?.count ?? 0} ratings)`}
                    scores={communityScores?.scores ?? null}
                  />
                </div>

                {!coreScores && !communityScores && (
                  <p className="text-xs text-surface-400">No reference scores yet for this song.</p>
                )}
              </div>

              {/* Lyrics */}
              {songDetail.lyrics[0] && (
                <details className="card">
                  <summary className="cursor-pointer text-sm text-surface-600 select-none">
                    Show lyrics
                  </summary>
                  <pre className="mt-3 text-xs font-mono whitespace-pre-wrap text-surface-700 max-h-48 overflow-y-auto">
                    {songDetail.lyrics[0].text}
                  </pre>
                </details>
              )}

              {/* Rating sliders */}
              <div className="card space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-semibold">Your Rating</h3>
                    {songRatings?.myRating && (
                      <p className="text-xs text-surface-400 mt-0.5">Previously saved — editing</p>
                    )}
                  </div>
                  {coreScores && (
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => {
                        setMyScores({
                          aggression: Math.round(coreScores.aggression),
                          complexity: Math.round(coreScores.complexity),
                          atmosphere: Math.round(coreScores.atmosphere),
                          emotion: Math.round(coreScores.emotion),
                          psychedelic: Math.round(coreScores.psychedelic),
                          concept: Math.round(coreScores.concept),
                        });
                        setSaved(false);
                      }}
                      title="Load the Core baseline values as your starting point"
                    >
                      Copy Core to Mine
                    </button>
                  )}
                </div>

                {SCORE_AXES.map((axis) => (
                  <div key={axis}>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <label className="label mb-0 font-medium">{AXIS_LABELS[axis]}</label>
                      <span className="text-sm font-mono font-semibold">{myScores[axis]} / 10</span>
                    </div>
                    <AxisDescription axis={axis} />
                    <input
                      type="range"
                      min="0" max="10" step="1"
                      value={myScores[axis]}
                      onChange={(e) =>
                        setMyScores((prev) => ({ ...prev, [axis]: parseInt(e.target.value, 10) }))
                      }
                      className="w-full mt-1.5 accent-surface-900"
                    />
                  </div>
                ))}

                <p className="text-xs text-surface-400 italic">{DISCLAIMER}</p>

                <div className="flex items-center gap-3 pt-1 flex-wrap">
                  <button
                    className="btn-primary"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save Rating'}
                  </button>
                  {saved && (
                    <>
                      <span className="text-green-700 text-sm font-medium">Saved!</span>
                      {songs && songs.findIndex((s) => s.id === selectedSongId) < songs.length - 1 && (
                        <button className="btn-secondary text-sm" onClick={nextSong}>
                          Next song →
                        </button>
                      )}
                      {bandSlug && (
                        <Link to={`/view/${bandSlug}#song-${selectedSongId}`} className="btn-ghost text-sm">
                          View analysis
                        </Link>
                      )}
                      <Link
                        to={`/share/songs/${selectedSongId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost text-sm"
                      >
                        Share ↗
                      </Link>
                    </>
                  )}
                </div>
                {saveMutation.isError && (
                  <p className="text-red-600 text-sm">{(saveMutation.error as Error).message}</p>
                )}
              </div>

              {/* Genre spectrum for the selected song */}
              <div className="card">
                <GenreSpectrumWidget songId={selectedSongId} showRegenerate />
              </div>

              <AxisHelpPanel />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

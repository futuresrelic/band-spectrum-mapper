import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { bandsApi } from '../api/bands';
import { songsApi } from '../api/songs';
import { analysisApi } from '../api/analysis';
import { ratingsApi } from '../api/ratings';
import { useAuth } from '../contexts/AuthContext';
import RadarChart from '../components/charts/RadarChart';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import SignInPrompt from '../components/auth/SignInPrompt';
import { SCORE_AXES, SCORE_MAX } from '@band-spectrum-mapper/shared';
import type { UpsertScoreInput, AxisScoreMap, SongMusicScore } from '@band-spectrum-mapper/shared';

const MUSIC_AXES: { key: keyof SongMusicScore; label: string; desc: string }[] = [
  { key: 'rhythmicComplexity',   label: 'Rhythmic Complexity',   desc: 'Steady 4/4 → polymetric / polyrhythmic' },
  { key: 'harmonicDepth',        label: 'Harmonic Depth',        desc: 'Simple triads → jazz / microtonal / chromatic' },
  { key: 'structuralComplexity', label: 'Structural Complexity', desc: 'Verse-chorus pop → through-composed prog suite' },
  { key: 'sonicDensity',         label: 'Sonic Density',         desc: 'Sparse / minimal → dense / orchestral' },
  { key: 'tempoEnergy',          label: 'Tempo Energy',          desc: 'Slow / meditative → fast / relentless' },
  { key: 'tonalDarkness',        label: 'Tonal Darkness',        desc: 'Bright / major / uplifting → dark / dissonant' },
];

const AXIS_LABELS: Record<string, string> = {
  aggression: 'Aggression',
  complexity: 'Complexity',
  atmosphere: 'Atmosphere',
  emotion: 'Emotion',
  psychedelic: 'Psychedelic',
  concept: 'Concept',
};

type ScoreMode = 'core' | 'community' | 'mine' | 'ai';

const SCORE_MODE_LABELS: Record<ScoreMode, string> = {
  core: 'Core',
  community: 'Community',
  mine: 'Mine',
  ai: 'AI',
};

export default function SpectrumPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [selectedBandId, setSelectedBandId] = useState(searchParams.get('bandId') ?? '');
  const [selectedSongId, setSelectedSongId] = useState(searchParams.get('songId') ?? '');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [scoreInitialized, setScoreInitialized] = useState(false);
  const [viewMode, setViewMode] = useState<'song' | 'band' | 'album'>('song');
  const [selectedAlbumId, setSelectedAlbumId] = useState('');
  const [scoreMode, setScoreMode] = useState<ScoreMode>('core');

  const { data: bands } = useQuery({ queryKey: ['bands'], queryFn: () => bandsApi.list() });

  const { data: songs } = useQuery({
    queryKey: ['songs', selectedBandId],
    queryFn: () => bandsApi.listSongs(selectedBandId),
    enabled: !!selectedBandId,
  });

  const { data: albums } = useQuery({
    queryKey: ['albums', selectedBandId],
    queryFn: () => bandsApi.listAlbums(selectedBandId),
    enabled: !!selectedBandId,
  });

  const { data: currentScore } = useQuery({
    queryKey: ['score', selectedSongId],
    queryFn: () => songsApi.getScore(selectedSongId),
    enabled: !!selectedSongId,
  });

  // Populate score sliders when a score loads for the first time
  if (currentScore && !scoreInitialized) {
    const m: Record<string, number> = {};
    for (const axis of SCORE_AXES) m[axis] = currentScore[axis];
    setScores(m);
    setNotes(currentScore.notes ?? '');
    setScoreInitialized(true);
  }

  const { data: bandAverages } = useQuery({
    queryKey: ['bandScores', selectedBandId],
    queryFn: () => analysisApi.scoresByBand(selectedBandId),
    enabled: !!selectedBandId && viewMode === 'band',
  });

  const { data: albumAverages } = useQuery({
    queryKey: ['albumScores', selectedAlbumId],
    queryFn: () => analysisApi.scoresByAlbum(selectedAlbumId),
    enabled: !!selectedAlbumId && viewMode === 'album',
  });

  // Community + mine scores for song mode
  const { data: songRatings } = useQuery({
    queryKey: ['song-ratings', selectedSongId],
    queryFn: () => ratingsApi.getSongRatings(selectedSongId),
    enabled: !!selectedSongId && viewMode === 'song' && (scoreMode === 'community' || scoreMode === 'mine'),
  });

  // AI spectrum scores — lazy, fetched when tab is selected
  const {
    data: aiSpectrum,
    isLoading: aiSpectrumLoading,
    error: aiSpectrumError,
    refetch: refetchAiSpectrum,
  } = useQuery({
    queryKey: ['ai-spectrum', selectedSongId],
    queryFn: () => analysisApi.getAiSpectrum(selectedSongId),
    enabled: !!selectedSongId && viewMode === 'song' && scoreMode === 'ai',
    retry: false,
  });

  const regenAiSpectrum = useMutation({
    mutationFn: () => analysisApi.regenerateAiSpectrum(selectedSongId),
    onSuccess: () => refetchAiSpectrum(),
  });

  // Music Structure Spectrum — separate axes, always shown in song mode
  const {
    data: musicScore,
    isLoading: musicScoreLoading,
    refetch: refetchMusicScore,
  } = useQuery({
    queryKey: ['music-score', selectedSongId],
    queryFn: () => analysisApi.getMusicScore(selectedSongId),
    enabled: !!selectedSongId && viewMode === 'song',
    retry: false,
  });

  const regenMusicScore = useMutation({
    mutationFn: () => analysisApi.regenerateMusicScore(selectedSongId),
    onSuccess: () => refetchMusicScore(),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const data: UpsertScoreInput = {
        aggression: scores['aggression'] ?? 0,
        complexity: scores['complexity'] ?? 0,
        atmosphere: scores['atmosphere'] ?? 0,
        emotion: scores['emotion'] ?? 0,
        psychedelic: scores['psychedelic'] ?? 0,
        concept: scores['concept'] ?? 0,
        notes: notes || null,
      };
      return songsApi.upsertScore(selectedSongId, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['score', selectedSongId] });
      qc.invalidateQueries({ queryKey: ['bandScores', selectedBandId] });
    },
  });

  const coreScoreMap: AxisScoreMap = {
    aggression: scores['aggression'] ?? 0,
    complexity: scores['complexity'] ?? 0,
    atmosphere: scores['atmosphere'] ?? 0,
    emotion: scores['emotion'] ?? 0,
    psychedelic: scores['psychedelic'] ?? 0,
    concept: scores['concept'] ?? 0,
  };

  const communityScoreMap: AxisScoreMap | null = songRatings?.communityRating?.scores ?? null;
  const communityCount = songRatings?.communityRating?.count ?? 0;

  const mineScoreMap: AxisScoreMap | null = songRatings?.myRating
    ? {
        aggression: songRatings.myRating.aggression,
        complexity: songRatings.myRating.complexity,
        atmosphere: songRatings.myRating.atmosphere,
        emotion: songRatings.myRating.emotion,
        psychedelic: songRatings.myRating.psychedelic,
        concept: songRatings.myRating.concept,
      }
    : null;

  const aiScoreMap: AxisScoreMap | null = aiSpectrum
    ? {
        aggression: aiSpectrum.aggression,
        complexity: aiSpectrum.complexity,
        atmosphere: aiSpectrum.atmosphere,
        emotion: aiSpectrum.emotion,
        psychedelic: aiSpectrum.psychedelic,
        concept: aiSpectrum.concept,
      }
    : null;

  const activeScoreMap: AxisScoreMap | null =
    scoreMode === 'core' ? coreScoreMap
    : scoreMode === 'community' ? communityScoreMap
    : scoreMode === 'mine' ? mineScoreMap
    : aiScoreMap;

  const bandAvgMap: AxisScoreMap | null = bandAverages
    ? {
        aggression: bandAverages.find((a) => a.axis === 'aggression')?.average ?? 0,
        complexity: bandAverages.find((a) => a.axis === 'complexity')?.average ?? 0,
        atmosphere: bandAverages.find((a) => a.axis === 'atmosphere')?.average ?? 0,
        emotion: bandAverages.find((a) => a.axis === 'emotion')?.average ?? 0,
        psychedelic: bandAverages.find((a) => a.axis === 'psychedelic')?.average ?? 0,
        concept: bandAverages.find((a) => a.axis === 'concept')?.average ?? 0,
      }
    : null;

  return (
    <div>
      <PageHeader title="Spectrum" subtitle="6-axis style scoring for songs" />

      <div className="flex gap-2 mb-6">
        {(['song', 'band', 'album'] as const).map((mode) => (
          <button
            key={mode}
            className={mode === viewMode ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setViewMode(mode)}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Selection panel */}
        <div className="space-y-4">
          <div className="card space-y-3">
            <div>
              <label className="label">Band</label>
              <select
                className="input"
                value={selectedBandId}
                onChange={(e) => {
                  setSelectedBandId(e.target.value);
                  setSelectedSongId('');
                  setScoreInitialized(false);
                }}
              >
                <option value="">Select a band...</option>
                {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            {viewMode === 'song' && songs && (
              <div>
                <label className="label">Song</label>
                <select
                  className="input"
                  value={selectedSongId}
                  onChange={(e) => {
                    setSelectedSongId(e.target.value);
                    setScoreInitialized(false);
                    setScores({});
                  }}
                >
                  <option value="">Select a song...</option>
                  {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
            )}

            {viewMode === 'album' && albums && (
              <div>
                <label className="label">Album</label>
                <select
                  className="input"
                  value={selectedAlbumId}
                  onChange={(e) => setSelectedAlbumId(e.target.value)}
                >
                  <option value="">Select an album...</option>
                  {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Score mode selector — song mode only */}
          {viewMode === 'song' && selectedSongId && (
            <div className="flex gap-1 rounded-lg border border-surface-200 bg-surface-50 p-1">
              {(['core', 'community', 'mine', 'ai'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`flex-1 rounded px-2 py-1.5 text-sm font-medium transition-colors ${
                    scoreMode === mode
                      ? 'bg-surface-900 text-white'
                      : 'text-surface-600 hover:text-surface-900'
                  }`}
                  onClick={() => setScoreMode(mode)}
                >
                  {SCORE_MODE_LABELS[mode]}
                  {mode === 'community' && communityCount > 0 && scoreMode === 'community' && (
                    <span className="ml-1 text-xs opacity-70">({communityCount})</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Core editing sliders */}
          {viewMode === 'song' && selectedSongId && scoreMode === 'core' && (
            <div className="card space-y-4">
              <h3>Edit Core Scores</h3>
              {SCORE_AXES.map((axis) => (
                <div key={axis}>
                  <div className="flex justify-between mb-1">
                    <label className="label mb-0">{AXIS_LABELS[axis]}</label>
                    <span className="text-xs font-mono text-surface-700">
                      {Math.round(scores[axis] ?? 0)} / {SCORE_MAX}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={Math.round(scores[axis] ?? 0)}
                    onChange={(e) =>
                      setScores((prev) => ({ ...prev, [axis]: parseInt(e.target.value, 10) }))
                    }
                    className="w-full accent-surface-900"
                  />
                </div>
              ))}
              <div>
                <label className="label">Rationale Notes</label>
                <textarea
                  className="textarea w-full min-h-[80px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why did you score it this way?"
                />
              </div>
              <button
                className="btn-primary"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Scores'}
              </button>
              {saveMutation.isError && <ErrorMessage error={saveMutation.error} />}
              {saveMutation.isSuccess && <p className="text-green-700 text-sm">Saved.</p>}
            </div>
          )}

          {/* Mine empty state */}
          {viewMode === 'song' && selectedSongId && scoreMode === 'mine' && !user && (
            <SignInPrompt message="Sign in to see your personal ratings." />
          )}

          {viewMode === 'song' && selectedSongId && scoreMode === 'mine' && user && !mineScoreMap && (
            <div className="card text-center py-6 text-surface-500 text-sm">
              You haven't rated this song yet.{' '}
              <a href={`/rate?songId=${selectedSongId}`} className="underline hover:text-surface-900">
                Rate it on the Rate page
              </a>
            </div>
          )}

          {/* Community empty state */}
          {viewMode === 'song' && selectedSongId && scoreMode === 'community' && !communityScoreMap && (
            <div className="card text-center py-6 text-surface-500 text-sm">
              No community ratings yet for this song.
            </div>
          )}

          {/* AI spectrum panel */}
          {viewMode === 'song' && selectedSongId && scoreMode === 'ai' && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">AI Spectrum Scoring</h3>
                {user?.isAdmin && (
                  <button
                    className="btn-ghost text-xs"
                    disabled={regenAiSpectrum.isPending}
                    onClick={() => regenAiSpectrum.mutate()}
                  >
                    {regenAiSpectrum.isPending ? 'Generating…' : 'Regenerate'}
                  </button>
                )}
              </div>
              {aiSpectrumLoading && <p className="text-sm text-surface-600">Analyzing lyrics…</p>}
              {aiSpectrumError && <ErrorMessage error={aiSpectrumError} />}
              {regenAiSpectrum.isError && <ErrorMessage error={regenAiSpectrum.error} />}
              {aiSpectrum && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {SCORE_AXES.map((axis) => (
                      <div key={axis} className="flex justify-between">
                        <span className="capitalize text-surface-600">{axis}</span>
                        <span className="font-mono font-medium">{aiSpectrum[axis as keyof typeof aiSpectrum]}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-surface-600 italic border-t border-surface-200 pt-2">{aiSpectrum.rationale}</p>
                  <p className="text-xs text-surface-400">Model: {aiSpectrum.model} · {new Date(aiSpectrum.updatedAt).toLocaleDateString()}</p>
                </>
              )}
              {!aiSpectrumLoading && !aiSpectrum && !aiSpectrumError && (
                <p className="text-xs text-surface-500">Scores will be generated automatically from the song's primary lyrics.</p>
              )}
              {aiSpectrum?.contextInferred && (
                <p className="text-xs text-amber-600 border-t border-surface-200 pt-2">
                  ⚠ Inferred from context — no lyrics available. Score based on song title, album, tags, and research.
                </p>
              )}
            </div>
          )}

          {/* Music Structure Spectrum */}
          {viewMode === 'song' && selectedSongId && (
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Music Structure Spectrum</h3>
                  <p className="text-xs text-surface-500 mt-0.5">How the music is built — works for instrumentals</p>
                </div>
                {user?.isAdmin && (
                  <button
                    className="btn-ghost text-xs"
                    disabled={regenMusicScore.isPending}
                    onClick={() => regenMusicScore.mutate()}
                  >
                    {regenMusicScore.isPending ? 'Generating…' : musicScore ? 'Regenerate' : 'Generate'}
                  </button>
                )}
              </div>
              {musicScoreLoading && <p className="text-sm text-surface-600">Scoring musical structure…</p>}
              {musicScore && (
                <>
                  <div className="space-y-2">
                    {MUSIC_AXES.map(({ key, label, desc }) => {
                      const val = musicScore[key] as number;
                      const pct = Math.round((val / 10) * 100);
                      return (
                        <div key={key} className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-surface-700 font-medium">{label}</span>
                            <span className="font-mono text-surface-500">{val.toFixed(1)}</span>
                          </div>
                          <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-surface-400">{desc}</p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-surface-600 italic border-t border-surface-200 pt-2">{musicScore.rationale}</p>
                  <p className="text-xs text-surface-400">Model: {musicScore.model} · {new Date(musicScore.updatedAt).toLocaleDateString()}</p>
                </>
              )}
              {!musicScoreLoading && !musicScore && (
                <p className="text-xs text-surface-500">
                  Click Generate to score the musical structure with AI.{' '}
                  Works for instrumental tracks — uses song title, album, tags, and research context.
                </p>
              )}
            </div>
          )}

          {/* Library link when song is selected */}
          {viewMode === 'song' && selectedSongId && (
            <div className="text-xs text-surface-500">
              <Link
                to={`/library/songs/${selectedSongId}`}
                className="hover:underline hover:text-surface-700"
              >
                → View in Library
              </Link>
            </div>
          )}
        </div>

        {/* Chart panel */}
        <div className="space-y-4">
          {viewMode === 'song' && selectedSongId && activeScoreMap && (
            <div className="card">
              <div className="flex items-baseline justify-between mb-4">
                <h3>Song Radar</h3>
                <span className="text-xs text-surface-500">{SCORE_MODE_LABELS[scoreMode]} scores</span>
              </div>
              <RadarChart
                datasets={[{ label: SCORE_MODE_LABELS[scoreMode], scores: activeScoreMap, color: '#374151' }]}
              />
              <div className="grid grid-cols-3 gap-2 mt-3">
                {SCORE_AXES.map((axis) => (
                  <div key={axis} className="text-xs">
                    <span className="text-surface-600 capitalize">{axis}</span>
                    <span className="ml-1 font-mono font-medium">{activeScoreMap[axis]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'band' && bandAvgMap && (
            <div className="card">
              <h3 className="mb-4">Band Average Radar</h3>
              <RadarChart
                datasets={[{ label: bands?.find((b) => b.id === selectedBandId)?.name ?? 'Band', scores: bandAvgMap, color: '#374151' }]}
              />
            </div>
          )}

          {viewMode === 'album' && albumAverages && (
            <div className="card">
              <h3 className="mb-4">Album Average Radar</h3>
              <RadarChart
                datasets={[{
                  label: albums?.find((a) => a.id === selectedAlbumId)?.title ?? 'Album',
                  scores: {
                    aggression: albumAverages.find((a) => a.axis === 'aggression')?.average ?? 0,
                    complexity: albumAverages.find((a) => a.axis === 'complexity')?.average ?? 0,
                    atmosphere: albumAverages.find((a) => a.axis === 'atmosphere')?.average ?? 0,
                    emotion: albumAverages.find((a) => a.axis === 'emotion')?.average ?? 0,
                    psychedelic: albumAverages.find((a) => a.axis === 'psychedelic')?.average ?? 0,
                    concept: albumAverages.find((a) => a.axis === 'concept')?.average ?? 0,
                  },
                  color: '#374151',
                }]}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

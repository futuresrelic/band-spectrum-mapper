import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { analysisApi } from '../api/analysis';
import { songsApi } from '../api/songs';
import { useAuth } from '../contexts/AuthContext';
import type { SongAxisScore, SongAiSpectrum, ScoreAxis } from '@band-spectrum-mapper/shared';
import {
  SCORE_AXES,
  AXIS_COLORS,
  AXIS_LABELS,
  GENRE_PERSPECTIVES,
  type GenrePerspective,
} from '@band-spectrum-mapper/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PublicSong = {
  id: string;
  title: string;
  bandId: string;
  albumId: string | null;
  trackNumber: number | null;
  band: { name: string; slug: string };
  album: { title: string; year: number | null } | null;
  score: SongAxisScore | null;
};

type GenreAggregate = { perspective: string; avg: number; count: number };
type AnalysisAggregate = { helpful: number; notHelpful: number; total: number };
type MyGenreRating = { perspective: string; score: number };

type GenreRatingsResponse = {
  genreAggregates: GenreAggregate[];
  analysisAggregate: AnalysisAggregate;
  myGenreRatings: MyGenreRating[];
  myAnalysisRating: boolean | null;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SpectrumBar({ axis, score }: { axis: ScoreAxis; score: number }) {
  const color = AXIS_COLORS[axis] ?? '#6366f1';
  const pct = Math.round((score / 10) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-slate-400 font-medium">{AXIS_LABELS[axis]}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{score.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function getScores(aiSpectrum: SongAiSpectrum | undefined, coreScore: SongAxisScore | null | undefined) {
  if (aiSpectrum) return { source: 'AI Spectrum', data: aiSpectrum as unknown as Record<string, number> };
  if (coreScore) return { source: 'Core Score', data: coreScore as unknown as Record<string, number> };
  return null;
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Genre rating section
// ---------------------------------------------------------------------------

const LS_GENRE_KEY = (songId: string) => `genre_rating_${songId}`;
const LS_ANALYSIS_KEY = (songId: string) => `analysis_rating_${songId}`;

function GenrePerspectiveSection({ songId }: { songId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Community data
  const { data: ratingsData, isLoading } = useQuery({
    queryKey: ['genre-ratings', songId],
    queryFn: () => api.get<GenreRatingsResponse>(`/api/genre-ratings/songs/${songId}`),
    staleTime: 30_000,
  });

  // Guest local state (used when not logged in)
  const [localGenre, setLocalGenre] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(LS_GENRE_KEY(songId)) ?? '{}'); }
    catch { return {}; }
  });

  const [selectedPerspective, setSelectedPerspective] = useState<GenrePerspective | null>(null);
  const [sliderScore, setSliderScore] = useState(5);
  const [submitted, setSubmitted] = useState(false);

  // Initialise slider when a perspective is selected
  useEffect(() => {
    if (!selectedPerspective) return;
    // Prefer server value (logged in) → local value (guest) → 5
    const serverVal = ratingsData?.myGenreRatings.find((r) => r.perspective === selectedPerspective)?.score;
    const localVal = localGenre[selectedPerspective];
    setSliderScore(serverVal ?? localVal ?? 5);
  }, [selectedPerspective]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitMutation = useMutation({
    mutationFn: ({ perspective, score }: { perspective: string; score: number }) =>
      api.put(`/api/genre-ratings/songs/${songId}/perspectives/${perspective}`, { score }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['genre-ratings', songId] });
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2500);
    },
  });

  function handleSubmit() {
    if (!selectedPerspective) return;
    if (user) {
      submitMutation.mutate({ perspective: selectedPerspective, score: sliderScore });
    } else {
      // Guest — store in localStorage
      const next = { ...localGenre, [selectedPerspective]: sliderScore };
      setLocalGenre(next);
      localStorage.setItem(LS_GENRE_KEY(songId), JSON.stringify(next));
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2500);
    }
  }

  const aggregates = ratingsData?.genreAggregates ?? [];
  const maxCount = Math.max(...aggregates.map((a) => a.count), 1);

  // Merge server my-ratings + local (guest) my-ratings
  const myRatings: Record<string, number> = {};
  (ratingsData?.myGenreRatings ?? []).forEach((r) => { myRatings[r.perspective] = r.score; });
  if (!user) Object.assign(myRatings, localGenre);

  return (
    <div className="px-7 py-6 border-b border-slate-800">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Genre Perspective</p>

      {/* Perspective chips */}
      <p className="text-xs text-slate-400 mb-3">How does this song land as a…</p>
      <div className="flex flex-wrap gap-2 mb-5">
        {GENRE_PERSPECTIVES.map((p) => {
          const myScore = myRatings[p.id];
          const isSelected = selectedPerspective === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPerspective(isSelected ? null : (p.id as GenrePerspective))}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                isSelected
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              <span>{p.emoji}</span>
              <span>{p.label}</span>
              {myScore != null && !isSelected && (
                <span className="bg-slate-700 text-slate-300 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ml-0.5">
                  {myScore}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Score slider — shown when a perspective is selected */}
      {selectedPerspective && (
        <div className="bg-slate-800/60 rounded-xl p-4 mb-5 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-300 font-medium">
              {GENRE_PERSPECTIVES.find((p) => p.id === selectedPerspective)?.label}
            </p>
            <span className="text-lg font-bold tabular-nums text-indigo-400">{sliderScore}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={sliderScore}
            onChange={(e) => setSliderScore(Number(e.target.value))}
            className="w-full accent-indigo-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1 select-none">
            <span>1 · Wouldn't appeal</span>
            <span>10 · Perfect for them</span>
          </div>
          <div className="mt-3 flex gap-2 items-center">
            <button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {submitted ? '✓ Saved!' : submitMutation.isPending ? 'Saving…' : 'Save rating'}
            </button>
            {!user && (
              <a
                href="/api/auth/google"
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                Sign in to share →
              </a>
            )}
          </div>
          {!user && (
            <p className="text-[10px] text-slate-600 mt-2">
              Your rating is saved locally.{' '}
              <a href="/api/auth/google" className="text-indigo-500 hover:text-indigo-400">Sign in</a>
              {' '}to contribute to the community average.
            </p>
          )}
        </div>
      )}

      {/* Community breakdown bars */}
      {isLoading && <p className="text-xs text-slate-600 italic">Loading community data…</p>}
      {!isLoading && aggregates.length === 0 && (
        <p className="text-xs text-slate-600 italic">No community ratings yet — be the first!</p>
      )}
      {aggregates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">Community</p>
          {GENRE_PERSPECTIVES.filter((p) => aggregates.some((a) => a.perspective === p.id)).map((p) => {
            const agg = aggregates.find((a) => a.perspective === p.id)!;
            const barPct = Math.round((agg.count / maxCount) * 100);
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 w-28 shrink-0 truncate">{p.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500/60 transition-all"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <span className="text-xs font-bold tabular-nums text-slate-400 w-8 text-right">
                  {agg.avg.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-600 w-14 text-right">
                  {agg.count} {agg.count === 1 ? 'rating' : 'ratings'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI analysis rating (helpful / not helpful)
// ---------------------------------------------------------------------------

function AnalysisRatingSection({ songId }: { songId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: ratingsData } = useQuery({
    queryKey: ['genre-ratings', songId],
    // This query is already running from GenrePerspectiveSection — will reuse cache
    queryFn: () => api.get<GenreRatingsResponse>(`/api/genre-ratings/songs/${songId}`),
    staleTime: 30_000,
  });

  const [localVote, setLocalVote] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem(LS_ANALYSIS_KEY(songId));
      return v === 'true' ? true : v === 'false' ? false : null;
    } catch { return null; }
  });

  const submitMutation = useMutation({
    mutationFn: (helpful: boolean) =>
      api.put(`/api/genre-ratings/songs/${songId}/analysis`, { helpful }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['genre-ratings', songId] }),
  });

  function vote(helpful: boolean) {
    if (user) {
      submitMutation.mutate(helpful);
    } else {
      setLocalVote(helpful);
      localStorage.setItem(LS_ANALYSIS_KEY(songId), String(helpful));
    }
  }

  const myVote = user ? (ratingsData?.myAnalysisRating ?? null) : localVote;
  const agg = ratingsData?.analysisAggregate;
  const helpfulPct = agg && agg.total > 0 ? Math.round((agg.helpful / agg.total) * 100) : null;

  return (
    <div className="px-7 py-5 border-b border-slate-800">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Was this analysis helpful?</p>
        {agg && agg.total > 0 && (
          <p className="text-[10px] text-slate-600">
            {helpfulPct}% of {agg.total} {agg.total === 1 ? 'reader' : 'readers'} found it helpful
          </p>
        )}
      </div>

      <div className="flex gap-3 mt-3">
        <button
          onClick={() => vote(true)}
          disabled={submitMutation.isPending}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            myVote === true
              ? 'bg-emerald-700/40 border-emerald-600 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
          }`}
        >
          <span>👍</span>
          <span>Yes</span>
          {agg && agg.helpful > 0 && (
            <span className="text-xs text-slate-500 tabular-nums">{agg.helpful}</span>
          )}
        </button>
        <button
          onClick={() => vote(false)}
          disabled={submitMutation.isPending}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            myVote === false
              ? 'bg-rose-900/40 border-rose-700 text-rose-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
          }`}
        >
          <span>👎</span>
          <span>Not really</span>
          {agg && agg.notHelpful > 0 && (
            <span className="text-xs text-slate-500 tabular-nums">{agg.notHelpful}</span>
          )}
        </button>
      </div>

      {!user && myVote !== null && (
        <p className="text-[10px] text-slate-600 mt-2">
          <a href="/api/auth/google" className="text-indigo-500 hover:text-indigo-400">Sign in</a>
          {' '}to make your vote count.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ShareSongPage() {
  const { songId } = useParams<{ songId: string }>();
  const [copied, setCopied] = useState(false);

  const { data: song, isLoading, isError } = useQuery({
    queryKey: ['public-song', songId],
    queryFn: () => api.get<PublicSong>(`/api/public/songs/${songId!}`),
    enabled: !!songId,
    retry: false,
  });

  const { data: aiSpectrum } = useQuery({
    queryKey: ['ai-spectrum', songId],
    queryFn: () => analysisApi.getAiSpectrum(songId!),
    enabled: !!songId,
    retry: false,
  });

  const { data: context } = useQuery({
    queryKey: ['song-context', songId],
    queryFn: () => analysisApi.getSongContext(songId!),
    enabled: !!songId,
    retry: false,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', songId],
    queryFn: () => songsApi.getComments(songId!),
    enabled: !!songId,
    retry: false,
  });

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable — silent fail
    }
  };

  const tweetText = song
    ? `"${song.title}" by ${song.band.name}${song.album ? ` · ${song.album.title}` : ''} — spectrum analysis & deep dive`
    : 'Band Spectrum Mapper — deep music analysis';
  const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;

  const scores = getScores(aiSpectrum, song?.score);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (isError || !song) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center px-6">
        <p className="text-slate-400 text-lg mb-4">Song not found.</p>
        <Link to="/view" className="text-indigo-400 hover:text-indigo-300 text-sm hover:underline">
          ← Back to library
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top bar */}
      <div className="max-w-lg mx-auto px-4 pt-8 pb-2 flex items-center justify-between">
        <Link to="/" className="text-xs font-bold tracking-widest text-slate-500 hover:text-slate-300 uppercase transition-colors">
          Band Spectrum Mapper
        </Link>
        <Link
          to={`/view/${song.band.slug}`}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Browse library →
        </Link>
      </div>

      {/* Share card */}
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">

          {/* Song identity */}
          <div className="px-7 pt-8 pb-6 border-b border-slate-800">
            {song.album && (
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-medium">
                {song.band.name}{song.album.year ? ` · ${song.album.year}` : ''}
              </p>
            )}
            <h1 className="text-3xl font-bold tracking-tight leading-tight mb-1">
              {song.title}
            </h1>
            {song.album ? (
              <p className="text-slate-400 text-sm">{song.album.title}</p>
            ) : (
              <p className="text-slate-400 text-sm">{song.band.name}</p>
            )}
            {song.trackNumber && (
              <p className="text-xs text-slate-600 mt-1">Track {song.trackNumber}</p>
            )}
          </div>

          {/* Spectrum scores */}
          {scores ? (
            <div className="px-7 py-6 border-b border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Spectrum</p>
                <p className="text-xs text-slate-600">{scores.source}</p>
              </div>
              <div className="space-y-3">
                {SCORE_AXES.map((axis) => {
                  const val = scores.data[axis];
                  if (val == null) return null;
                  return <SpectrumBar key={axis} axis={axis} score={Number(val)} />;
                })}
              </div>
            </div>
          ) : (
            <div className="px-7 py-6 border-b border-slate-800">
              <p className="text-xs text-slate-500 italic">No spectrum scores yet for this song.</p>
            </div>
          )}

          {/* AI analysis pull quote */}
          {(context?.titleSignificance || context?.overallNarrative) && (
            <div className="px-7 py-6 border-b border-slate-800">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Analysis</p>
              {context.titleSignificance && (
                <div className="mb-4">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Title</p>
                  <p className="text-sm text-slate-300 leading-relaxed italic">
                    "{truncate(context.titleSignificance, 220)}"
                  </p>
                </div>
              )}
              {context.overallNarrative && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Narrative</p>
                  <p className="text-sm text-slate-300 leading-relaxed italic">
                    "{truncate(context.overallNarrative, 300)}"
                  </p>
                </div>
              )}
            </div>
          )}

          {/* AI analysis helpfulness rating */}
          {(context?.titleSignificance || context?.overallNarrative) && (
            <AnalysisRatingSection songId={song.id} />
          )}

          {/* Genre perspective rating */}
          <GenrePerspectiveSection songId={song.id} />

          {/* Stats footer */}
          <div className="px-7 py-4 bg-slate-950/50 flex items-center gap-4 text-xs text-slate-600">
            {aiSpectrum && <span>AI scored</span>}
            {comments.length > 0 && (
              <span>{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
            )}
            <span className="ml-auto text-slate-700">bandspectrummapper</span>
          </div>
        </div>

        {/* Share actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={copyUrl}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-5 py-3 rounded-lg transition-colors"
          >
            {copied ? '✓ Copied!' : '🔗 Copy link'}
          </button>
          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-5 py-3 rounded-lg transition-colors"
          >
            Share on X
          </a>
          <Link
            to={`/view/${song.band.slug}`}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium px-5 py-3 rounded-lg transition-colors"
          >
            Full analysis →
          </Link>
        </div>

        <p className="text-center text-xs text-slate-700 mt-6">
          Screenshot this card to share as an image — dynamic preview cards require server-side rendering.
        </p>
      </div>
    </div>
  );
}

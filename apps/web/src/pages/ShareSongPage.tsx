import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { analysisApi } from '../api/analysis';
import { songsApi } from '../api/songs';
import type { SongAxisScore, SongAiSpectrum, ScoreAxis } from '@band-spectrum-mapper/shared';
import { SCORE_AXES, AXIS_COLORS, AXIS_LABELS } from '@band-spectrum-mapper/shared';

// Public song shape from /api/public/songs/:id
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
  if (aiSpectrum) {
    return { source: 'AI Spectrum', data: aiSpectrum as unknown as Record<string, number> };
  }
  if (coreScore) {
    return { source: 'Core Score', data: coreScore as unknown as Record<string, number> };
  }
  return null;
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '…';
}

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
      // fallback: select text
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

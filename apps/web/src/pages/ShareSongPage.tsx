import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { analysisApi } from '../api/analysis';
import { songsApi } from '../api/songs';
import { useAuth } from '../contexts/AuthContext';
import type { SongAxisScore, SongAiSpectrum, SongAiGenreSpectrum } from '@band-spectrum-mapper/shared';
import {
  SCORE_AXES,
  AXIS_LABELS,
  GENRE_PERSPECTIVES,
  GENRE_COLORS,
  GENRE_LABELS,
  type GenrePerspective,
} from '@band-spectrum-mapper/shared';

// Vivid axis colors — optimised for the dark share card
const VIVID_AXIS_COLORS: Record<string, string> = {
  aggression: '#ff3a3a',
  complexity:  '#ff9500',
  atmosphere:  '#34c8e8',
  emotion:     '#ff375f',
  psychedelic: '#bf5af2',
  concept:     '#30d158',
};

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
// Core Spectrum — dark gradient radar (pure SVG, matches OG image)
// ---------------------------------------------------------------------------

function CoreSpectrumRadar({
  scores,
  source,
}: {
  scores: Record<string, number>;
  source: string;
}) {
  const W = 320, H = 320;
  const cx = W / 2, cy = H / 2, R = 110;
  const N = SCORE_AXES.length;
  const angle = (i: number) => (-Math.PI / 2) + i * (2 * Math.PI / N);
  const px = (i: number, f: number) => cx + f * R * Math.cos(angle(i));
  const py = (i: number, f: number) => cy + f * R * Math.sin(angle(i));

  // Sector polygon approximating a 60° slice (avoids SVG arc bugs)
  function sectorPoints(i: number): string {
    const pts: [number, number][] = [[cx, cy]];
    const startDeg = angle(i) * (180 / Math.PI) - 31;
    const endDeg   = angle(i) * (180 / Math.PI) + 31;
    for (let d = startDeg; d <= endDeg; d += 4) {
      const r = d * Math.PI / 180;
      pts.push([cx + (R + 30) * Math.cos(r), cy + (R + 30) * Math.sin(r)]);
    }
    return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  }

  // Hex grid path at fraction f
  function hexPath(f: number) {
    const pts = Array.from({ length: N }, (_, i) => `${px(i, f).toFixed(1)},${py(i, f).toFixed(1)}`);
    return `M ${pts.join(' L ')} Z`;
  }

  // Score polygon
  const scorePolyPath = `M ${SCORE_AXES.map((ax, i) => {
    const s = (scores[ax] ?? 0) / 10;
    return `${px(i, s).toFixed(1)},${py(i, s).toFixed(1)}`;
  }).join(' L ')} Z`;

  // Label placement
  const LABEL_R = R + 26;
  const AXIS_SHORT: Record<string, string> = {
    aggression: 'AGGR', complexity: 'COMP', atmosphere: 'ATMO',
    emotion: 'EMOT', psychedelic: 'PSYC', concept: 'CONC',
  };

  return (
    <div className="px-7 py-6 border-b border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Core Spectrum</p>
        <p className="text-xs text-slate-600">{source}</p>
      </div>

      <div className="flex justify-center">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
          <defs>
            {SCORE_AXES.map((ax) => {
              const s = Math.max(0.01, (scores[ax] ?? 0) / 10);
              const col = VIVID_AXIS_COLORS[ax]!;
              const peakPct  = Math.round(s * 100);
              const fadePct  = Math.min(peakPct + 14, 100);
              const innerPct = Math.max(0, Math.round(s * 55));
              return (
                <radialGradient key={ax} id={`rg-${ax}`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R * 1.08}>
                  <stop offset="0%"           stopColor={col} stopOpacity={0}/>
                  <stop offset={`${innerPct}%`} stopColor={col} stopOpacity={s * 0.22}/>
                  <stop offset={`${peakPct}%`}  stopColor={col} stopOpacity={s * 0.9}/>
                  <stop offset={`${fadePct}%`}  stopColor={col} stopOpacity={0}/>
                </radialGradient>
              );
            })}
            {SCORE_AXES.map((ax, idx) => (
              <clipPath key={ax} id={`cp-${ax}`}>
                <polygon points={sectorPoints(idx)} />
              </clipPath>
            ))}
            <radialGradient id="cglow" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R * 0.18}>
              <stop offset="0%"   stopColor="#ffffff" stopOpacity={0.5}/>
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0}/>
            </radialGradient>
          </defs>

          {/* Hex grid */}
          {[0.2, 0.4, 0.6, 0.8, 1.0].map((f) => (
            <path key={f} d={hexPath(f)} fill="none" stroke="white" strokeWidth={0.6} strokeOpacity={f === 1.0 ? 0.18 : 0.09}/>
          ))}

          {/* Spokes */}
          {SCORE_AXES.map((_, i) => (
            <line key={i} x1={cx} y1={cy} x2={px(i, 1)} y2={py(i, 1)} stroke="white" strokeWidth={0.7} strokeOpacity={0.13}/>
          ))}

          {/* Gradient sectors */}
          {SCORE_AXES.map((ax) => (
            <rect
              key={ax}
              x={cx - R - 30} y={cy - R - 30}
              width={(R + 30) * 2} height={(R + 30) * 2}
              fill={`url(#rg-${ax})`}
              clipPath={`url(#cp-${ax})`}
            />
          ))}

          {/* Score polygon */}
          <path d={scorePolyPath} fill="white" fillOpacity={0.06} stroke="white" strokeWidth={1.6} strokeOpacity={0.65} strokeLinejoin="round"/>

          {/* Vertex dots */}
          {SCORE_AXES.map((ax, i) => {
            const s = (scores[ax] ?? 0) / 10;
            const col = VIVID_AXIS_COLORS[ax]!;
            return (
              <circle key={ax} cx={px(i, s)} cy={py(i, s)} r={3.5 + s * 2.5} fill={col} stroke="white" strokeWidth={1} strokeOpacity={0.6}/>
            );
          })}

          {/* Center glow */}
          <circle cx={cx} cy={cy} r={R * 0.18} fill="url(#cglow)"/>

          {/* Labels */}
          {SCORE_AXES.map((ax, i) => {
            const lx = cx + LABEL_R * Math.cos(angle(i));
            const ly = cy + LABEL_R * Math.sin(angle(i));
            const col = VIVID_AXIS_COLORS[ax]!;
            const deg = angle(i) * (180 / Math.PI);
            const anchor = (deg > -30 && deg < 30) || deg > 150 || deg < -150 ? 'middle'
              : deg > 0 && deg < 150 ? 'start' : 'end';
            const yOff = Math.abs(Math.sin(angle(i))) > 0.7 ? (Math.sin(angle(i)) > 0 ? 12 : -4) : 0;
            return (
              <g key={ax}>
                <text x={lx} y={ly + yOff} fontFamily="system-ui,sans-serif" fontSize={9} fontWeight={700} fill={col} textAnchor={anchor} letterSpacing={0.8}>
                  {AXIS_SHORT[ax]}
                </text>
                <text x={lx} y={ly + yOff + 13} fontFamily="system-ui,sans-serif" fontSize={12} fontWeight={700} fill={col} textAnchor={anchor}>
                  {(scores[ax] ?? 0).toFixed(1)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Compact score row */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1">
        {SCORE_AXES.map((axis) => {
          const val = Number(scores[axis] ?? 0);
          const color = VIVID_AXIS_COLORS[axis]!;
          return (
            <div key={axis} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">{AXIS_LABELS[axis]}</span>
              <span className="font-mono font-bold" style={{ color }}>{val.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Genre Spectrum — dark horizontal bars
// ---------------------------------------------------------------------------

function GenreBar({ perspective, score }: { perspective: GenrePerspective; score: number }) {
  const color = GENRE_COLORS[perspective];
  const pct = Math.round((score / 10) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-slate-400">{GENRE_LABELS[perspective]}</span>
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

function GenreSpectrumBars({
  aiGenre,
  communityAgg,
}: {
  aiGenre: SongAiGenreSpectrum | undefined;
  communityAgg: GenreAggregate[];
}) {
  const hasAi = !!aiGenre;
  const hasCommunity = communityAgg.length > 0;

  if (!hasAi && !hasCommunity) return null;

  const source = hasAi ? 'AI' : 'Community';

  function getScore(id: GenrePerspective): number {
    if (hasAi) return Number(aiGenre![id] ?? 0);
    return communityAgg.find((a) => a.perspective === id)?.avg ?? 0;
  }

  return (
    <div className="px-7 py-6 border-b border-slate-800">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Genre Appeal</p>
        <p className="text-xs text-slate-600">{source}</p>
      </div>
      <div className="space-y-3">
        {GENRE_PERSPECTIVES.map((p) => (
          <GenreBar key={p.id} perspective={p.id} score={getScore(p.id)} />
        ))}
      </div>
      {aiGenre?.rationale && (
        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed italic">
          {aiGenre.rationale.length > 200 ? aiGenre.rationale.slice(0, 197) + '…' : aiGenre.rationale}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top Themes section — dark card on share page
// ---------------------------------------------------------------------------

import {
  THEME_CATEGORIES,
  THEME_GROUP_COLORS,
} from '@band-spectrum-mapper/shared';
import type { SongThemeScore } from '@band-spectrum-mapper/shared';

function TopThemesSection({ scores }: { scores: SongThemeScore[] | undefined }) {
  if (!scores || scores.length === 0) return null;
  const top = [...scores]
    .filter((s) => s.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (top.length === 0) return null;

  return (
    <div className="px-7 py-6 border-b border-slate-800">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Philosophical Themes</p>
      <div className="space-y-3">
        {top.map((score) => {
          const cat = THEME_CATEGORIES.find((c) => c.slug === score.themeSlug);
          if (!cat) return null;
          const color = THEME_GROUP_COLORS[cat.group];
          const pct = Math.round(score.score * 100);
          return (
            <div key={score.themeSlug}>
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-xs text-slate-400">{cat.label}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
                />
              </div>
              {score.evidence && (
                <p className="text-[10px] text-slate-600 italic mt-1 leading-snug pl-1">
                  {score.evidence.length > 100 ? score.evidence.slice(0, 97) + '…' : score.evidence}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '…';
}

function getCoreScores(
  aiSpectrum: SongAiSpectrum | undefined,
  coreScore: SongAxisScore | null | undefined,
): { source: string; data: Record<string, number> } | null {
  if (aiSpectrum) return { source: 'AI', data: aiSpectrum as unknown as Record<string, number> };
  if (coreScore) return { source: 'Core', data: coreScore as unknown as Record<string, number> };
  return null;
}

// ---------------------------------------------------------------------------
// Genre rating section (interactive — unchanged)
// ---------------------------------------------------------------------------

const LS_GENRE_KEY = (songId: string) => `genre_rating_${songId}`;
const LS_ANALYSIS_KEY = (songId: string) => `analysis_rating_${songId}`;

function GenrePerspectiveSection({ songId }: { songId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: ratingsData, isLoading } = useQuery({
    queryKey: ['genre-ratings', songId],
    queryFn: () => api.get<GenreRatingsResponse>(`/api/genre-ratings/songs/${songId}`),
    staleTime: 30_000,
  });

  const [localGenre, setLocalGenre] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(LS_GENRE_KEY(songId)) ?? '{}'); }
    catch { return {}; }
  });

  const [selectedPerspective, setSelectedPerspective] = useState<GenrePerspective | null>(null);
  const [sliderScore, setSliderScore] = useState(5);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!selectedPerspective) return;
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
      const next = { ...localGenre, [selectedPerspective]: sliderScore };
      setLocalGenre(next);
      localStorage.setItem(LS_GENRE_KEY(songId), JSON.stringify(next));
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2500);
    }
  }

  const aggregates = ratingsData?.genreAggregates ?? [];
  const myRatings: Record<string, number> = {};
  (ratingsData?.myGenreRatings ?? []).forEach((r) => { myRatings[r.perspective] = r.score; });
  if (!user) Object.assign(myRatings, localGenre);

  return (
    <div className="px-7 py-6 border-b border-slate-800">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Rate as a fan</p>
      <p className="text-xs text-slate-400 mb-3">How does this song land if you're a…</p>
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

      {selectedPerspective && (
        <div className="bg-slate-800/60 rounded-xl p-4 mb-5 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-300 font-medium">
              {GENRE_PERSPECTIVES.find((p) => p.id === selectedPerspective)?.label}
            </p>
            <span className="text-lg font-bold tabular-nums text-indigo-400">{sliderScore}</span>
          </div>
          <input
            type="range" min={1} max={10} step={1} value={sliderScore}
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
              <a href="/api/auth/google" className="text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">
                Sign in to share →
              </a>
            )}
          </div>
        </div>
      )}

      {!isLoading && aggregates.length === 0 && !selectedPerspective && (
        <p className="text-xs text-slate-600 italic">No community ratings yet — be the first!</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis helpfulness
// ---------------------------------------------------------------------------

function AnalysisRatingSection({ songId }: { songId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: ratingsData } = useQuery({
    queryKey: ['genre-ratings', songId],
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
        {[{ val: true, label: '👍 Yes', count: agg?.helpful }, { val: false, label: '👎 Not really', count: agg?.notHelpful }].map(({ val, label, count }) => (
          <button
            key={String(val)}
            onClick={() => vote(val)}
            disabled={submitMutation.isPending}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              myVote === val
                ? val ? 'bg-emerald-700/40 border-emerald-600 text-emerald-300' : 'bg-rose-900/40 border-rose-700 text-rose-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {label}
            {count != null && count > 0 && <span className="text-xs text-slate-500 tabular-nums">{count}</span>}
          </button>
        ))}
      </div>
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

  const { data: aiGenre } = useQuery({
    queryKey: ['ai-genre-spectrum', songId],
    queryFn: () => analysisApi.getAiGenreSpectrum(songId!),
    enabled: !!songId,
    retry: false,
  });

  const { data: genreRatings } = useQuery({
    queryKey: ['genre-ratings', songId],
    queryFn: () => api.get<GenreRatingsResponse>(`/api/genre-ratings/songs/${songId!}`),
    enabled: !!songId,
    retry: false,
  });

  const { data: context } = useQuery({
    queryKey: ['song-context', songId],
    queryFn: () => analysisApi.getSongContext(songId!),
    enabled: !!songId,
    retry: false,
  });

  const { data: themeScores } = useQuery({
    queryKey: ['theme-scores', songId],
    queryFn: () => analysisApi.getThemeScores(songId!),
    enabled: !!songId,
    retry: false,
    staleTime: Infinity,
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
    } catch { /* clipboard unavailable */ }
  };

  const shareText = song
    ? `"${song.title}" by ${song.band.name}${song.album ? ` · ${song.album.title}` : ''} — spectrum analysis`
    : 'Band Spectrum Mapper — deep music analysis';
  const enc = (s: string) => encodeURIComponent(s);
  const tweetUrl     = `https://x.com/intent/tweet?text=${enc(shareText)}&url=${enc(shareUrl)}`;
  const facebookUrl  = `https://www.facebook.com/sharer/sharer.php?u=${enc(shareUrl)}`;
  const whatsappUrl  = `https://wa.me/?text=${enc(shareText + ' ' + shareUrl)}`;
  const redditUrl    = `https://www.reddit.com/submit?url=${enc(shareUrl)}&title=${enc(shareText)}`;
  const linkedinUrl  = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(shareUrl)}`;
  const blueskyUrl   = `https://bsky.app/intent/compose?text=${enc(shareText + ' ' + shareUrl)}`;

  const coreScores = getCoreScores(aiSpectrum, song?.score);

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
        <Link to={`/view/${song.band.slug}`} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Browse library →
        </Link>
      </div>

      {/* Share card */}
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">

          {/* Song identity */}
          <div className="px-7 pt-8 pb-6 border-b border-slate-800">
            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-medium">
              {song.band.name}{song.album?.year ? ` · ${song.album.year}` : ''}
            </p>
            <h1 className="text-3xl font-bold tracking-tight leading-tight mb-1">{song.title}</h1>
            {song.album
              ? <p className="text-slate-400 text-sm">{song.album.title}</p>
              : <p className="text-slate-400 text-sm">{song.band.name}</p>}
            {song.trackNumber && (
              <p className="text-xs text-slate-600 mt-1">Track {song.trackNumber}</p>
            )}
          </div>

          {/* Core Spectrum — dark radar */}
          {coreScores ? (
            <CoreSpectrumRadar scores={coreScores.data} source={coreScores.source} />
          ) : (
            <div className="px-7 py-5 border-b border-slate-800">
              <p className="text-xs text-slate-600 italic">No core spectrum scores yet.</p>
            </div>
          )}

          {/* Genre Appeal — bars */}
          <GenreSpectrumBars
            aiGenre={aiGenre}
            communityAgg={genreRatings?.genreAggregates ?? []}
          />

          {/* Philosophical themes */}
          <TopThemesSection scores={themeScores} />

          {/* AI Overall Narrative — full section */}
          {context?.overallNarrative && (
            <div className="px-7 py-6 border-b border-slate-800">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">AI Full Investigation</p>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                  AI's take on lyrics, published background, and listener comments combined —
                  the music itself is interpreted by the human ratings below.
                </p>
              </div>
              {context.titleSignificance && (
                <p className="text-xs text-slate-500 italic mb-3 leading-relaxed border-l-2 border-slate-700 pl-3">
                  {truncate(context.titleSignificance, 220)}
                </p>
              )}
              <p className="text-sm text-slate-200 leading-relaxed">
                {context.overallNarrative}
              </p>
              {comments.length > 0 && (
                <p className="text-[11px] text-slate-600 mt-3">
                  Woven from {comments.length} listener comment{comments.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {/* Analysis helpfulness */}
          {(context?.titleSignificance || context?.overallNarrative) && (
            <AnalysisRatingSection songId={song.id} />
          )}

          {/* Fan rating */}
          <GenrePerspectiveSection songId={song.id} />

          {/* Stats footer + disclaimer */}
          <div className="px-7 py-5 bg-slate-950/50 space-y-2">
            <div className="flex items-center gap-4 text-xs text-slate-600">
              {aiSpectrum && <span>AI spectrum</span>}
              {aiGenre && <span>AI genre</span>}
              {comments.length > 0 && (
                <span>{comments.length} listener comment{comments.length !== 1 ? 's' : ''}</span>
              )}
              <span className="ml-auto text-slate-700">bandspectrummapper</span>
            </div>
            <p className="text-[10px] text-slate-700 leading-snug">
              Analysis based on lyrics &amp; publicly available information — not the music itself.
              Scores reflect lyrical &amp; conceptual qualities. Human listener ratings and comments
              provide the musical interpretation AI cannot.
            </p>
          </div>
        </div>

        {/* Share actions */}
        <div className="mt-6 space-y-3">
          {/* Primary actions */}
          <div className="flex gap-3">
            <button
              onClick={copyUrl}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
            >
              {copied ? '✓ Copied!' : '🔗 Copy link'}
            </button>
            <Link
              to={`/view/${song.band.slug}#song-${song.id}`}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
            >
              Full analysis →
            </Link>
          </div>

          {/* Social share grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { href: tweetUrl,    label: 'X / Twitter' },
              { href: facebookUrl, label: 'Facebook'    },
              { href: whatsappUrl, label: 'WhatsApp'    },
              { href: redditUrl,   label: 'Reddit'      },
              { href: linkedinUrl, label: 'LinkedIn'    },
              { href: blueskyUrl,  label: 'Bluesky'     },
            ].map(({ href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium px-3 py-2.5 rounded-lg transition-colors"
              >
                {label}
              </a>
            ))}
          </div>

          <p className="text-center text-[11px] text-slate-600">
            Instagram: copy the link above and paste into your story or caption
          </p>
        </div>

        <p className="text-center text-xs text-slate-700 mt-4">
          Screenshot this card to share as an image
        </p>
      </div>
    </div>
  );
}

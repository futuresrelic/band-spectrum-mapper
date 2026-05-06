import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { analysisApi } from '../api/analysis';
import GenreRadarChart from './charts/GenreRadarChart';
import { GENRE_PERSPECTIVES, GENRE_COLORS, GENRE_LABELS, GENRE_INFO } from '@band-spectrum-mapper/shared';
import type { GenreScoreMap, SongAiGenreSpectrum } from '@band-spectrum-mapper/shared';
import InfoTooltip from './ui/InfoTooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GenreAggregate = { perspective: string; avg: number; count: number };

type GenreRatingsResponse = {
  genreAggregates: GenreAggregate[];
  myGenreRatings: { perspective: string; score: number }[];
  myAnalysisRating: boolean | null;
  analysisAggregate: { helpful: number; notHelpful: number; total: number };
};

type Tab = 'community' | 'mine' | 'ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LS_GENRE_KEY = (songId: string) => `genre_rating_${songId}`;

function aggregatesToScoreMap(agg: GenreAggregate[]): GenreScoreMap | null {
  const anyHasData = agg.length > 0;
  if (!anyHasData) return null;
  const map: Partial<GenreScoreMap> = {};
  for (const p of GENRE_PERSPECTIVES) {
    map[p.id] = agg.find((a) => a.perspective === p.id)?.avg ?? 0;
  }
  return map as GenreScoreMap;
}

function myRatingsToScoreMap(
  serverRatings: { perspective: string; score: number }[],
  localRatings: Record<string, number>,
  isLoggedIn: boolean,
): GenreScoreMap | null {
  const source = isLoggedIn ? serverRatings.reduce<Record<string, number>>((acc, r) => {
    acc[r.perspective] = r.score; return acc;
  }, {}) : localRatings;

  const hasAny = Object.values(source).some((v) => v > 0);
  if (!hasAny) return null;

  const map: Partial<GenreScoreMap> = {};
  for (const p of GENRE_PERSPECTIVES) {
    map[p.id] = source[p.id] ?? 0;
  }
  return map as GenreScoreMap;
}

function aiToScoreMap(ai: SongAiGenreSpectrum): GenreScoreMap {
  return {
    metal: ai.metal, rock: ai.rock, pop: ai.pop,
    hiphop: ai.hiphop, electronic: ai.electronic, folk: ai.folk,
  };
}

// A blended color for the chart — all genre colors mixed for "community" view
const COMMUNITY_COLOR = '#6366F1'; // indigo — neutral brand color

// ---------------------------------------------------------------------------
// Score value list (small numeric grid below the radar)
// ---------------------------------------------------------------------------

function GenreScoreGrid({ scores }: { scores: GenreScoreMap }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-3">
      {GENRE_PERSPECTIVES.map((p) => (
        <div key={p.id} className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: GENRE_COLORS[p.id] }}
            />
            <InfoTooltip tip={GENRE_INFO[p.id].description} href={GENRE_INFO[p.id].wikiUrl}>
                <span className="text-surface-700 truncate">{GENRE_LABELS[p.id]}</span>
              </InfoTooltip>
          </span>
          <span className="font-mono font-semibold ml-1">
            {scores[p.id] > 0 ? scores[p.id].toFixed(1) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main widget
// ---------------------------------------------------------------------------

interface Props {
  songId: string;
  /** Show admin regenerate button */
  showRegenerate?: boolean;
  /** Dark mode — for use on dark backgrounds (share card) */
  dark?: boolean;
}

export default function GenreSpectrumWidget({ songId, showRegenerate = false, dark = false }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('community');
  const [regenerating, setRegenerating] = useState(false);

  // Community + my ratings
  const { data: ratingsData } = useQuery({
    queryKey: ['genre-ratings', songId],
    queryFn: () => api.get<GenreRatingsResponse>(`/api/genre-ratings/songs/${songId}`),
    staleTime: 60_000,
  });

  // AI genre spectrum (auto-generate on first access)
  const { data: aiSpectrum, isLoading: aiLoading, isError: aiError } = useQuery({
    queryKey: ['ai-genre-spectrum', songId],
    queryFn: () => analysisApi.getAiGenreSpectrum(songId),
    retry: 1,
    staleTime: Infinity,
  });

  const regenMutation = useMutation({
    mutationFn: () => analysisApi.regenerateAiGenreSpectrum(songId),
    onMutate: () => setRegenerating(true),
    onSettled: () => setRegenerating(false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-genre-spectrum', songId] }),
  });

  // Build score maps
  const localGenre: Record<string, number> = (() => {
    try { return JSON.parse(localStorage.getItem(LS_GENRE_KEY(songId)) ?? '{}'); }
    catch { return {}; }
  })();

  const communityScores = aggregatesToScoreMap(ratingsData?.genreAggregates ?? []);
  const myScores = myRatingsToScoreMap(
    ratingsData?.myGenreRatings ?? [],
    localGenre,
    !!user,
  );
  const aiScores = aiSpectrum ? aiToScoreMap(aiSpectrum) : null;

  // Active dataset for the chart
  function getActiveDataset(): { label: string; scores: GenreScoreMap; color: string } | null {
    if (tab === 'community' && communityScores) return { label: 'Community', scores: communityScores, color: COMMUNITY_COLOR };
    if (tab === 'mine' && myScores) return { label: 'Mine', scores: myScores, color: '#10B981' };
    if (tab === 'ai' && aiScores) return { label: 'AI', scores: aiScores, color: '#8B5CF6' };
    return null;
  }

  const activeDataset = getActiveDataset();

  const tabLabel: Record<Tab, string> = { community: 'Community', mine: 'Mine', ai: 'AI' };

  const baseText = dark ? 'text-slate-400' : 'text-surface-600';
  const headingText = dark ? 'text-slate-300' : 'text-surface-700';
  const border = dark ? 'border-slate-800' : 'border-surface-200';
  const activeTab = dark
    ? 'bg-slate-700 text-white'
    : 'bg-surface-900 text-white';
  const inactiveTab = dark
    ? 'text-slate-400 hover:text-slate-200'
    : 'text-surface-600 hover:text-surface-900';

  return (
    <div>
      {/* Header + tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className={`text-xs font-bold uppercase tracking-widest ${headingText}`}>
          Genre Spectrum
        </p>
        <div className={`flex gap-0.5 rounded-md border ${border} p-0.5`}>
          {(['community', 'mine', 'ai'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t ? activeTab : inactiveTab
              }`}
            >
              {tabLabel[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Community tab */}
      {tab === 'community' && (
        communityScores ? (
          <>
            <div className="max-w-xs">
              <GenreRadarChart datasets={[{ label: 'Community', scores: communityScores, color: COMMUNITY_COLOR }]} />
            </div>
            <GenreScoreGrid scores={communityScores} />
            {ratingsData && (
              <p className={`text-xs mt-2 ${baseText}`}>
                {ratingsData.genreAggregates.reduce((s, a) => s + a.count, 0)} genre ratings from the community
              </p>
            )}
          </>
        ) : (
          <p className={`text-sm italic ${baseText}`}>No community genre ratings yet.</p>
        )
      )}

      {/* Mine tab */}
      {tab === 'mine' && (
        myScores ? (
          <>
            <div className="max-w-xs">
              <GenreRadarChart datasets={[{ label: 'Mine', scores: myScores, color: '#10B981' }]} />
            </div>
            <GenreScoreGrid scores={myScores} />
            {!user && (
              <p className={`text-xs mt-2 ${baseText}`}>
                Showing local ratings.{' '}
                <a href="/api/auth/google" className="text-indigo-500 hover:text-indigo-400">Sign in</a>
                {' '}to make them count.
              </p>
            )}
          </>
        ) : (
          <div>
            <p className={`text-sm italic ${baseText} mb-2`}>
              {user ? "You haven't added genre ratings for this song yet." : 'No local genre ratings found.'}
            </p>
            {!user && (
              <a href="/api/auth/google" className="text-xs text-indigo-500 hover:text-indigo-400">
                Sign in to rate →
              </a>
            )}
          </div>
        )
      )}

      {/* AI tab */}
      {tab === 'ai' && (
        aiLoading ? (
          <p className={`text-sm italic ${baseText}`}>Generating AI genre analysis…</p>
        ) : aiError || !aiScores ? (
          <p className={`text-sm italic ${baseText}`}>AI genre analysis unavailable.</p>
        ) : (
          <>
            <div className="max-w-xs">
              <GenreRadarChart datasets={[{ label: 'AI', scores: aiScores, color: '#8B5CF6' }]} />
            </div>
            <GenreScoreGrid scores={aiScores} />
            {aiSpectrum?.rationale && (
              <p className={`text-xs mt-3 leading-relaxed ${baseText}`}>
                {aiSpectrum.rationale}
              </p>
            )}
            {showRegenerate && user?.isAdmin && (
              <button
                onClick={() => regenMutation.mutate()}
                disabled={regenerating}
                className="mt-2 text-xs text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
              >
                {regenerating ? 'Regenerating…' : 'Regenerate AI'}
              </button>
            )}
          </>
        )
      )}

      {/* Overlay comparison: show both community + AI when both available */}
      {activeDataset && tab === 'community' && communityScores && aiScores && (
        <div className="mt-3">
          <details>
            <summary className={`text-xs cursor-pointer select-none ${baseText} hover:opacity-80`}>
              Compare with AI →
            </summary>
            <div className="max-w-xs mt-2">
              <GenreRadarChart
                datasets={[
                  { label: 'Community', scores: communityScores, color: COMMUNITY_COLOR },
                  { label: 'AI', scores: aiScores, color: '#8B5CF6' },
                ]}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

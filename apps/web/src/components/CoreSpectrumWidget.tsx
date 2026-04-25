import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { analysisApi } from '../api/analysis';
import { ratingsApi } from '../api/ratings';
import RadarChart from './charts/RadarChart';
import type { SongAxisScore, AxisScoreMap } from '@band-spectrum-mapper/shared';
import { SCORE_AXES, AXIS_LABELS, AXIS_COLORS } from '@band-spectrum-mapper/shared';

type Tab = 'core' | 'community' | 'mine' | 'ai';

interface Props {
  songId: string;
  coreScore: SongAxisScore | null;
  /** Show inline admin regen button */
  showRegenerate?: boolean;
}

function toAxisMap(obj: Record<string, unknown>): AxisScoreMap {
  return {
    aggression: Number(obj['aggression'] ?? 0),
    complexity:  Number(obj['complexity']  ?? 0),
    atmosphere:  Number(obj['atmosphere']  ?? 0),
    emotion:     Number(obj['emotion']     ?? 0),
    psychedelic: Number(obj['psychedelic'] ?? 0),
    concept:     Number(obj['concept']     ?? 0),
  };
}

function ScoreGrid({ scores }: { scores: AxisScoreMap }) {
  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-1 mt-3">
      {SCORE_AXES.map((axis) => (
        <div key={axis} className="flex items-center justify-between text-xs">
          <span className="text-surface-600">{AXIS_LABELS[axis]}</span>
          <span
            className="font-mono font-semibold ml-1"
            style={{ color: AXIS_COLORS[axis] }}
          >
            {scores[axis] != null ? Number(scores[axis]).toFixed(1) : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CoreSpectrumWidget({ songId, coreScore, showRegenerate = false }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(coreScore ? 'core' : 'community');

  const { data: communityData } = useQuery({
    queryKey: ['public-community-single', songId],
    queryFn: () => ratingsApi.getCommunityRatings([songId]),
    staleTime: 60_000,
  });

  const { data: ratingsData } = useQuery({
    queryKey: ['song-ratings', songId],
    queryFn: () => ratingsApi.getSongRatings(songId),
    enabled: !!user && tab === 'mine',
    staleTime: 60_000,
  });

  const { data: aiSpectrum, isLoading: aiLoading, isError: aiError } = useQuery({
    queryKey: ['ai-spectrum', songId],
    queryFn: () => analysisApi.getAiSpectrum(songId),
    enabled: tab === 'ai',
    retry: 1,
    staleTime: Infinity,
  });

  const communityScore = communityData?.[songId] ?? null;
  const communityScores: AxisScoreMap | null = communityScore?.scores ?? null;
  const myRating = ratingsData?.myRating ?? null;
  const myScores: AxisScoreMap | null = myRating
    ? toAxisMap(myRating as unknown as Record<string, unknown>)
    : null;
  const aiScores: AxisScoreMap | null = aiSpectrum
    ? toAxisMap(aiSpectrum as unknown as Record<string, unknown>)
    : null;
  const coreScores: AxisScoreMap | null = coreScore
    ? toAxisMap(coreScore as unknown as Record<string, unknown>)
    : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'core',      label: 'Core'      },
    { id: 'community', label: 'Community' },
    { id: 'mine',      label: 'Mine'      },
    { id: 'ai',        label: 'AI'        },
  ];

  const tabColor: Record<Tab, string> = {
    core:      '#374151',
    community: '#6366F1',
    mine:      '#10B981',
    ai:        '#8B5CF6',
  };

  function renderContent() {
    if (tab === 'core') {
      if (!coreScores) return <p className="text-sm text-surface-500 italic">No core scores yet.</p>;
      return (
        <>
          <div className="max-w-xs">
            <RadarChart datasets={[{ label: 'Core', scores: coreScores, color: tabColor.core }]} />
          </div>
          <ScoreGrid scores={coreScores} />
          {coreScore?.notes && (
            <p className="text-xs text-surface-600 mt-2 italic">{coreScore.notes}</p>
          )}
        </>
      );
    }

    if (tab === 'community') {
      if (!communityScores || communityScore?.count === 0) {
        return <p className="text-sm text-surface-500 italic">No community ratings yet.</p>;
      }
      return (
        <>
          <div className="max-w-xs">
            <RadarChart datasets={[{ label: 'Community', scores: communityScores, color: tabColor.community }]} />
          </div>
          <ScoreGrid scores={communityScores} />
          {communityScore?.count != null && communityScore.count > 0 && (
            <p className="text-xs text-surface-500 mt-2">{communityScore.count} rating{communityScore.count !== 1 ? 's' : ''}</p>
          )}
        </>
      );
    }

    if (tab === 'mine') {
      if (!user) {
        return (
          <p className="text-sm text-surface-500 italic">
            <a href="/api/auth/google" className="text-indigo-600 hover:underline">Sign in</a> to see your ratings.
          </p>
        );
      }
      if (!myScores) return <p className="text-sm text-surface-500 italic">You haven't rated this song yet.</p>;
      return (
        <>
          <div className="max-w-xs">
            <RadarChart datasets={[{ label: 'Mine', scores: myScores, color: tabColor.mine }]} />
          </div>
          <ScoreGrid scores={myScores} />
        </>
      );
    }

    if (tab === 'ai') {
      if (aiLoading) return <p className="text-sm text-surface-500 italic">Generating AI spectrum…</p>;
      if (aiError || !aiScores) return <p className="text-sm text-surface-500 italic">AI spectrum unavailable.</p>;
      return (
        <>
          <div className="max-w-xs">
            <RadarChart datasets={[{ label: 'AI', scores: aiScores, color: tabColor.ai }]} />
          </div>
          <ScoreGrid scores={aiScores} />
          {aiSpectrum?.rationale && (
            <p className="text-xs text-surface-600 mt-3 leading-relaxed">{aiSpectrum.rationale}</p>
          )}
          {showRegenerate && user?.isAdmin && (
            <button
              onClick={() => void analysisApi.regenerateAiSpectrum(songId)}
              className="mt-2 text-xs text-indigo-600 hover:text-indigo-500"
            >
              Regenerate AI
            </button>
          )}
        </>
      );
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-surface-700">Spectrum · Core</p>
        <div className="flex gap-0.5 rounded-md border border-surface-200 p-0.5">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === id
                  ? 'bg-surface-900 text-white'
                  : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {renderContent()}
    </div>
  );
}

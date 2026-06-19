import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { analysisApi } from '../api/analysis';
import { ratingsApi } from '../api/ratings';
import RadarChart from './charts/RadarChart';
import GenreRadarChart from './charts/GenreRadarChart';
import InfoTooltip from './ui/InfoTooltip';
import type {
  SongAxisScore, AxisScoreMap, GenreScoreMap,
  SongAiSpectrum, SongAiGenreSpectrum, SongThemeScore,
} from '@band-spectrum-mapper/shared';
import {
  SCORE_AXES, AXIS_LABELS, AXIS_COLORS, AXIS_INFO,
  GENRE_PERSPECTIVES, GENRE_COLORS, GENRE_LABELS, GENRE_INFO,
  THEME_CATEGORIES, THEME_GROUP_COLORS,
} from '@band-spectrum-mapper/shared';

// ── Types ──────────────────────────────────────────────────────────────────

type DataType  = 'core' | 'genre' | 'themes';
type ViewType  = 'radar' | 'bars' | 'pillars';
type CoreSrc   = 'core' | 'community' | 'ai' | 'mine' | 'audio';
type GenreSrc  = 'community' | 'ai' | 'mine';

type GenreRatingsResponse = {
  genreAggregates:  { perspective: string; avg: number; count: number }[];
  myGenreRatings:   { perspective: string; score: number }[];
  myAnalysisRating: boolean | null;
  analysisAggregate:{ helpful: number; notHelpful: number; total: number };
};

interface ChartItem {
  key: string;
  label: string;
  value: number;
  color: string;
  max: number;            // 10 for axis/genre, 1 for themes
  tip?: string;
  tipUrl?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function axisMap(o: Record<string, unknown>): AxisScoreMap {
  return {
    aggression: Number(o['aggression'] ?? 0), complexity:  Number(o['complexity']  ?? 0),
    atmosphere: Number(o['atmosphere'] ?? 0), emotion:     Number(o['emotion']     ?? 0),
    psychedelic:Number(o['psychedelic']?? 0), concept:     Number(o['concept']     ?? 0),
  };
}

function coreItems(s: AxisScoreMap): ChartItem[] {
  return SCORE_AXES.map((ax) => ({
    key: ax, label: AXIS_LABELS[ax], value: Number(s[ax] ?? 0),
    color: AXIS_COLORS[ax], max: 10,
    tip: `${AXIS_INFO[ax].lo} → ${AXIS_INFO[ax].hi}`, tipUrl: AXIS_INFO[ax].wikiUrl,
  }));
}

function genreItemsFromMap(s: GenreScoreMap): ChartItem[] {
  return GENRE_PERSPECTIVES.map((p) => ({
    key: p.id, label: GENRE_LABELS[p.id], value: Number(s[p.id] ?? 0),
    color: GENRE_COLORS[p.id], max: 10,
    tip: GENRE_INFO[p.id].description, tipUrl: GENRE_INFO[p.id].wikiUrl,
  }));
}

function themeItems(scores: SongThemeScore[], limit?: number): ChartItem[] {
  return [...scores]
    .filter((s) => s.score >= 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => {
      const cat = THEME_CATEGORIES.find((c) => c.slug === s.themeSlug);
      return {
        key: s.themeSlug,
        label: cat?.label ?? s.themeSlug,
        value: s.score,
        color: THEME_GROUP_COLORS[cat?.group ?? 'existential'],
        max: 1,
        tip: cat?.description,
        tipUrl: cat?.wikiUrl,
      };
    });
}

// ── Visualization sub-components ───────────────────────────────────────────

function BarsView({ items }: { items: ChartItem[] }) {
  return (
    <div className="space-y-2.5 mt-3">
      {items.map(({ key, label, value, color, max, tip, tipUrl }) => {
        const pct     = Math.max(0, Math.min((value / max) * 100, 100));
        const display = max <= 1 ? `${Math.round(value * 100)}%` : value.toFixed(1);
        return (
          <div key={key}>
            <div className="flex justify-between items-baseline mb-0.5">
              {tip ? (
                <InfoTooltip tip={tip} href={tipUrl}>
                  <span className="text-sm text-surface-700">{label}</span>
                </InfoTooltip>
              ) : (
                <span className="text-sm text-surface-700">{label}</span>
              )}
              <span className="text-sm font-bold tabular-nums ml-3 shrink-0" style={{ color }}>
                {display}
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PillarsView({ items }: { items: ChartItem[] }) {
  const CHART_H = 110;
  const peak = Math.max(...items.map((i) => i.value / i.max), 0.001);

  return (
    <div className="mt-4 select-none">
      {/* Bars */}
      <div className="flex items-end gap-1" style={{ height: CHART_H }}>
        {items.map(({ key, value, color, max }) => {
          const h = Math.max(2, Math.round((value / max / peak) * CHART_H));
          return (
            <div
              key={key}
              className="flex-1 rounded-t-sm"
              style={{ height: h, backgroundColor: color, opacity: 0.85 }}
            />
          );
        })}
      </div>
      {/* Labels + values */}
      <div className="flex gap-1 mt-1.5">
        {items.map(({ key, label, value, color, max, tip, tipUrl }) => {
          const display = max <= 1 ? `${Math.round(value * 100)}%` : value.toFixed(1);
          const short   = label.length > 7 ? label.slice(0, 6) : label;
          return (
            <div key={key} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
              <span className="text-[9px] font-bold tabular-nums leading-none" style={{ color }}>
                {display}
              </span>
              {tip ? (
                <InfoTooltip tip={tip} href={tipUrl} position="top">
                  <span className="text-[8px] text-surface-400 text-center leading-none truncate">
                    {short}
                  </span>
                </InfoTooltip>
              ) : (
                <span className="text-[8px] text-surface-400 text-center leading-none truncate block w-full">
                  {short}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ source, dataType }: { source: string; dataType: DataType }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-surface-400 italic">
        No {source} data yet{dataType !== 'themes' ? ' for this song' : ''}.
      </p>
      {source === 'community' && (
        <a href="/my/rate" className="text-xs text-indigo-600 hover:underline mt-1 block">
          Be the first to rate it →
        </a>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

const CORE_SRC_COLOR: Record<CoreSrc, string>  = {
  core: '#374151', community: '#6366F1', ai: '#8B5CF6', mine: '#10B981', audio: '#F59E0B',
};
const GENRE_SRC_COLOR: Record<GenreSrc, string> = {
  community: '#6366F1', ai: '#8B5CF6', mine: '#10B981',
};

interface Props {
  songId: string;
  coreScore: SongAxisScore | null;
}

export default function SongSpectrumPanel({ songId, coreScore }: Props) {
  const { user } = useAuth();
  const [dataType, setDataType] = useState<DataType>('core');
  const [viewType, setViewType] = useState<ViewType>('radar');
  const [coreSrc, setCoreSrc]   = useState<CoreSrc>(coreScore ? 'core' : 'community');
  const [genreSrc, setGenreSrc] = useState<GenreSrc>('community');

  // Auto-disable radar for themes
  useEffect(() => {
    if (dataType === 'themes' && viewType === 'radar') setViewType('bars');
  }, [dataType, viewType]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: aiSpectrum } = useQuery({
    queryKey: ['ai-spectrum', songId],
    queryFn: () => analysisApi.getAiSpectrum(songId),
    staleTime: Infinity,
  });
  const { data: audioSpectrum } = useQuery({
    queryKey: ['audio-spectrum', songId],
    queryFn: () => analysisApi.getAudioSpectrum(songId),
    staleTime: Infinity,
  });
  const { data: communityRatings } = useQuery({
    queryKey: ['public-community-single', songId],
    queryFn: () => ratingsApi.getCommunityRatings([songId]),
    staleTime: 60_000,
  });
  const { data: myRatings } = useQuery({
    queryKey: ['song-ratings', songId],
    queryFn: () => ratingsApi.getSongRatings(songId),
    enabled: !!user,
    staleTime: 60_000,
  });
  const { data: genreRatings } = useQuery({
    queryKey: ['genre-ratings', songId],
    queryFn: () => api.get<GenreRatingsResponse>(`/api/genre-ratings/songs/${songId}`),
    staleTime: 60_000,
  });
  const { data: aiGenre } = useQuery({
    queryKey: ['ai-genre-spectrum', songId],
    queryFn: () => analysisApi.getAiGenreSpectrum(songId),
    staleTime: Infinity,
  });
  const { data: themeScores } = useQuery({
    queryKey: ['theme-scores', songId],
    queryFn: () => analysisApi.getThemeScores(songId),
    staleTime: Infinity,
  });

  // ── Derived scores ────────────────────────────────────────────────────────
  function getCoreScores(): AxisScoreMap | null {
    if (coreSrc === 'core')      return coreScore ? axisMap(coreScore as unknown as Record<string, unknown>) : null;
    if (coreSrc === 'community') return communityRatings?.[songId]?.scores ?? null;
    if (coreSrc === 'mine')      return myRatings?.myRating ? axisMap(myRatings.myRating as unknown as Record<string, unknown>) : null;
    if (coreSrc === 'ai')        return aiSpectrum ? axisMap(aiSpectrum as unknown as Record<string, unknown>) : null;
    if (coreSrc === 'audio')     return audioSpectrum ? axisMap(audioSpectrum as unknown as Record<string, unknown>) : null;
    return null;
  }

  function getGenreScores(): GenreScoreMap | null {
    if (genreSrc === 'ai') {
      return aiGenre
        ? { metal: aiGenre.metal, rock: aiGenre.rock, pop: aiGenre.pop,
            hiphop: aiGenre.hiphop, electronic: aiGenre.electronic, folk: aiGenre.folk }
        : null;
    }
    const src = genreSrc === 'community'
      ? genreRatings?.genreAggregates ?? []
      : genreRatings?.myGenreRatings?.map((r) => ({ perspective: r.perspective, avg: r.score, count: 1 })) ?? [];
    if (src.length === 0) return null;
    const map: Partial<GenreScoreMap> = {};
    for (const p of GENRE_PERSPECTIVES) {
      map[p.id] = src.find((a) => 'avg' in a && a.perspective === p.id)?.avg ??
                  (src.find((a) => a.perspective === p.id) as { avg: number })?.avg ?? 0;
    }
    const hasAny = Object.values(map).some((v) => (v ?? 0) > 0);
    return hasAny ? map as GenreScoreMap : null;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  const communityCount = communityRatings?.[songId]?.count ?? 0;

  const viewOptions: ViewType[] = dataType === 'themes' ? ['bars', 'pillars'] : ['radar', 'bars', 'pillars'];
  const VIEW_LABELS: Record<ViewType, string> = { radar: '⬡ Radar', bars: '▬ Bars', pillars: '▐ Pillars' };

  const CORE_SRC_DESC: Record<CoreSrc, string> = {
    core:      'Human-curated baseline score',
    community: 'Average of all fan ratings',
    ai:        'AI reading of the lyrics',
    mine:      'Your personal score',
    audio:     'Audio signal analysis',
  };

  function renderCoreSources() {
    const srcs: { id: CoreSrc; label: string }[] = [
      ...(coreScore ? [{ id: 'core' as CoreSrc, label: 'Curator Score' }] : []),
      { id: 'community', label: `Fan Score${communityCount > 0 ? ` (${communityCount})` : ''}` },
      { id: 'ai', label: 'AI Lyric Score' },
      ...(user ? [{ id: 'mine' as CoreSrc, label: 'My Rating' }] : []),
      ...(audioSpectrum ? [{ id: 'audio' as CoreSrc, label: 'Audio Score' }] : []),
    ];
    return (
      <>
        {srcs.map(({ id, label }) => (
          <button key={id} onClick={() => setCoreSrc(id)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              coreSrc === id ? 'bg-surface-900 text-white' : 'text-surface-600 hover:text-surface-900'
            }`}>{label}</button>
        ))}
      </>
    );
  }

  function renderCoreSrcDesc() {
    return (
      <p className="text-xs text-surface-400 mt-1 px-0.5">{CORE_SRC_DESC[coreSrc]}</p>
    );
  }

  function renderGenreSources() {
    const srcs: { id: GenreSrc; label: string }[] = [
      { id: 'community', label: 'Community' },
      { id: 'ai', label: 'AI' },
      ...(user ? [{ id: 'mine' as GenreSrc, label: 'Mine' }] : []),
    ];
    return srcs.map(({ id, label }) => (
      <button key={id} onClick={() => setGenreSrc(id)}
        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          genreSrc === id ? 'bg-surface-900 text-white' : 'text-surface-600 hover:text-surface-900'
        }`}>{label}</button>
    ));
  }

  function renderVisualization() {
    // ── Core Spectrum ──────────────────────────────────────────────────────
    if (dataType === 'core') {
      const scores = getCoreScores();
      if (!scores) return <EmptyState source={coreSrc} dataType={dataType} />;
      const items = coreItems(scores);
      const color = CORE_SRC_COLOR[coreSrc];
      if (viewType === 'radar') {
        return (
          <>
            <div className="max-w-xs">
              <RadarChart datasets={[{ label: coreSrc, scores, color }]} />
            </div>
            {coreSrc === 'ai' && (aiSpectrum as SongAiSpectrum | undefined)?.rationale && (
              <p className="text-xs text-surface-600 mt-2 leading-relaxed">
                {(aiSpectrum as SongAiSpectrum).rationale}
              </p>
            )}
            {coreSrc === 'audio' && audioSpectrum && (
              <p className="text-xs text-surface-400 mt-2 italic">
                Music Score — derived from audio analysis (DSP) of "{audioSpectrum.songTitle}". Axes share the same 6 dimensions as the Lyric Score for direct comparison.
              </p>
            )}
          </>
        );
      }
      if (viewType === 'bars')    return <BarsView items={items} />;
      if (viewType === 'pillars') return <PillarsView items={items} />;
    }

    // ── Genre Appeal ──────────────────────────────────────────────────────
    if (dataType === 'genre') {
      const scores = getGenreScores();
      if (!scores) return <EmptyState source={genreSrc} dataType={dataType} />;
      const items = genreItemsFromMap(scores);
      const color = GENRE_SRC_COLOR[genreSrc];
      if (viewType === 'radar') {
        return (
          <>
            <div className="max-w-xs">
              <GenreRadarChart datasets={[{ label: genreSrc, scores, color }]} />
            </div>
            {genreSrc === 'ai' && (aiGenre as SongAiGenreSpectrum | undefined)?.rationale && (
              <p className="text-xs text-surface-600 mt-2 leading-relaxed">
                {(aiGenre as SongAiGenreSpectrum).rationale}
              </p>
            )}
          </>
        );
      }
      if (viewType === 'bars')    return <BarsView items={items} />;
      if (viewType === 'pillars') return <PillarsView items={items} />;
    }

    // ── Philosophical Themes ──────────────────────────────────────────────
    if (dataType === 'themes') {
      if (!themeScores || themeScores.length === 0) {
        return <EmptyState source="ai" dataType={dataType} />;
      }
      const items     = themeItems(themeScores);
      const topItems  = items.slice(0, 8);
      if (viewType === 'bars')    return <BarsView items={items} />;
      if (viewType === 'pillars') return <PillarsView items={topItems} />;
    }

    return null;
  }

  return (
    <div>
      {/* ── Row 1: data type selector ──────────────────────────────────── */}
      <div className="flex gap-0.5 rounded-md border border-surface-200 p-0.5 mb-3">
        {([
          ['core',   'Core Spectrum'],
          ['genre',  'Genre Appeal'],
          ['themes', 'Themes'],
        ] as [DataType, string][]).map(([dt, label]) => (
          <button
            key={dt}
            onClick={() => setDataType(dt)}
            className={`flex-1 rounded py-1.5 text-xs font-semibold transition-colors ${
              dataType === dt ? 'bg-surface-900 text-white' : 'text-surface-600 hover:text-surface-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Row 2: view type + source selector ─────────────────────────── */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        {/* View type */}
        <div className="flex gap-0.5 rounded border border-surface-200 p-0.5">
          {viewOptions.map((vt) => (
            <button
              key={vt}
              onClick={() => setViewType(vt)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                viewType === vt ? 'bg-surface-900 text-white' : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              {VIEW_LABELS[vt]}
            </button>
          ))}
        </div>

        {/* Data source (only for core + genre) */}
        {dataType !== 'themes' && (
          <div>
            <div className="flex gap-0.5 rounded border border-surface-200 p-0.5">
              {dataType === 'core' ? renderCoreSources() : renderGenreSources()}
            </div>
            {dataType === 'core' && renderCoreSrcDesc()}
          </div>
        )}
        {dataType === 'themes' && (
          <span className="text-[10px] text-surface-400">AI · {themeScores?.length ?? 0} themes scored</span>
        )}
      </div>

      {/* ── Visualization ─────────────────────────────────────────────── */}
      {renderVisualization()}
    </div>
  );
}

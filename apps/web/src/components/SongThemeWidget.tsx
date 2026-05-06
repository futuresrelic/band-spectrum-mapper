import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { analysisApi } from '../api/analysis';
import InfoTooltip from './ui/InfoTooltip';
import {
  THEME_CATEGORIES,
  THEME_GROUP_COLORS,
  type ThemeGroup,
} from '@band-spectrum-mapper/shared';
import type { SongThemeScore } from '@band-spectrum-mapper/shared';

// Group THEME_CATEGORIES by their group field for rendering
const GROUPED = THEME_CATEGORIES.reduce<Record<string, typeof THEME_CATEGORIES[number][]>>(
  (acc, cat) => {
    (acc[cat.group] ??= []).push(cat);
    return acc;
  },
  {},
);

const GROUP_ORDER: ThemeGroup[] = [
  'psychological', 'consciousness', 'spiritual', 'transformation',
  'emotional', 'relational', 'social', 'existential',
];

interface Props {
  songId: string;
  bandId?: string;
  showRegenerate?: boolean;
  dark?: boolean;
  compact?: boolean;
}

export default function SongThemeWidget({ songId, bandId, showRegenerate, dark, compact }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: scores, isLoading, error } = useQuery({
    queryKey: ['theme-scores', songId],
    queryFn: () => analysisApi.getThemeScores(songId),
    retry: false,
    staleTime: Infinity,
  });

  const { data: similar } = useQuery({
    queryKey: ['theme-similar', songId, bandId],
    queryFn: () => analysisApi.getSimilarByTheme(songId, bandId),
    enabled: !!(scores && scores.length > 0),
    retry: false,
    staleTime: Infinity,
  });

  const regen = useMutation({
    mutationFn: () => analysisApi.regenerateThemeScores(songId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['theme-scores', songId] });
      qc.invalidateQueries({ queryKey: ['theme-similar', songId, bandId] });
    },
  });

  const text = dark
    ? { label: 'text-slate-500', value: 'text-slate-200', sub: 'text-slate-600', empty: 'text-slate-600' }
    : { label: 'text-surface-500', value: 'text-surface-900', sub: 'text-surface-400', empty: 'text-surface-500' };

  const border = dark ? 'border-slate-800' : 'border-surface-100';

  if (isLoading) {
    return (
      <p className={`text-sm italic ${text.empty}`}>Generating philosophical analysis…</p>
    );
  }

  if (error) {
    return (
      <p className={`text-xs ${text.empty}`}>
        Could not load thematic analysis.
        {showRegenerate && user?.isAdmin && (
          <button
            className="ml-2 underline hover:no-underline"
            onClick={() => regen.mutate()}
            disabled={regen.isPending}
          >
            Try again
          </button>
        )}
      </p>
    );
  }

  if (!scores || scores.length === 0) return null;

  // Build score lookup
  const bySlug = new Map<string, SongThemeScore>(scores.map((s) => [s.themeSlug, s]));

  // Only show themes with meaningful scores
  const threshold = compact ? 0.3 : 0.1;
  const hasContent = scores.some((s) => s.score >= threshold);
  if (!hasContent) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-xs font-bold uppercase tracking-widest ${text.label}`}>
          Philosophical Themes
        </p>
        {showRegenerate && user?.isAdmin && (
          <button
            className={`text-xs ${text.sub} hover:${text.value} transition-colors`}
            onClick={() => regen.mutate()}
            disabled={regen.isPending}
          >
            {regen.isPending ? 'Analysing…' : 'Regenerate'}
          </button>
        )}
      </div>

      {compact ? (
        // Compact view: top 5 themes as simple bars
        <CompactThemes scores={scores} dark={dark} />
      ) : (
        // Full view: grouped by category
        <GroupedThemes bySlug={bySlug} dark={dark} threshold={threshold} text={text} />
      )}

      {/* Thematically similar songs */}
      {similar && similar.length > 0 && (
        <div className={`border-t ${border} pt-3`}>
          <p className={`text-xs font-medium uppercase tracking-wide mb-2 ${text.label}`}>
            Thematically similar songs
          </p>
          <ul className="space-y-1">
            {similar.map((s) => (
              <li key={s.songId} className="flex items-center justify-between gap-2">
                <Link
                  to={`/view/${s.bandSlug}#song-${s.songId}`}
                  className={`text-sm hover:underline truncate ${text.value}`}
                >
                  {s.title}
                  {!bandId && (
                    <span className={`ml-1.5 text-xs ${text.sub}`}>— {s.bandName}</span>
                  )}
                </Link>
                <span className={`text-xs tabular-nums shrink-0 ${text.sub}`}>
                  {Math.round(s.similarity * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CompactThemes({ scores, dark }: { scores: SongThemeScore[]; dark?: boolean }) {
  const top = [...scores]
    .filter((s) => s.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="space-y-2">
      {top.map((score) => {
        const cat = THEME_CATEGORIES.find((c) => c.slug === score.themeSlug);
        if (!cat) return null;
        const color = THEME_GROUP_COLORS[cat.group];
        const pct = Math.round(score.score * 100);
        return (
          <div key={score.themeSlug}>
            <div className="flex justify-between items-baseline mb-0.5">
              <span className={`text-xs ${dark ? 'text-slate-400' : 'text-surface-600'}`}>
                {cat.label}
              </span>
              <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct}%</span>
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-slate-800' : 'bg-surface-100'}`}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GroupedThemes({
  bySlug, dark, threshold, text,
}: {
  bySlug: Map<string, SongThemeScore>;
  dark?: boolean;
  threshold: number;
  text: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      {GROUP_ORDER.map((group) => {
        const cats = GROUPED[group] ?? [];
        const present = cats.filter((c) => (bySlug.get(c.slug)?.score ?? 0) >= threshold);
        if (present.length === 0) return null;

        const color = THEME_GROUP_COLORS[group];
        return (
          <div key={group}>
            {/* Group header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${text.label}`}>
                {group.charAt(0).toUpperCase() + group.slice(1)}
              </span>
            </div>

            <div className="space-y-3">
              {present
                .sort((a, b) => (bySlug.get(b.slug)?.score ?? 0) - (bySlug.get(a.slug)?.score ?? 0))
                .map((cat) => {
                  const score = bySlug.get(cat.slug);
                  if (!score) return null;
                  const pct = Math.round(score.score * 100);
                  return (
                    <ThemeBar
                      key={cat.slug}
                      label={cat.label}
                      description={cat.description}
                      wikiUrl={cat.wikiUrl}
                      pct={pct}
                      evidence={score.evidence}
                      color={color}
                      dark={dark}
                      text={text}
                    />
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThemeBar({
  label, description, wikiUrl, pct, evidence, color, dark, text,
}: {
  label: string;
  description: string;
  wikiUrl: string;
  pct: number;
  evidence: string | null;
  color: string;
  dark?: boolean;
  text: Record<string, string>;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-0.5">
        <InfoTooltip tip={description} href={wikiUrl} dark={dark} position="top">
          <span className={`text-xs font-medium ${text.value}`}>{label}</span>
        </InfoTooltip>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct}%</span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-slate-800' : 'bg-surface-100'}`}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
        />
      </div>
      {evidence && (
        <details className={`mt-1.5 border-l-2 pl-2.5`} style={{ borderColor: color + '55' }}>
          <summary className={`text-[10px] cursor-pointer ${text.sub} hover:${text.label}`}>
            evidence →
          </summary>
          <p className={`text-[11px] mt-1 leading-relaxed italic ${text.sub}`}>{evidence}</p>
        </details>
      )}
    </div>
  );
}

/**
 * Song Holodeck — immersive single-song exploration overlay for Cinema Mode.
 *
 * Triggered when the user clicks "Enter Song Holodeck" from the selected-node panel.
 * Renders as a full-screen overlay on top of the 3D graph (the graph keeps running
 * underneath so returning is instant).
 *
 * Desktop layout: [Left panel] [Center record] [Right panel]
 * Mobile layout:  single view + bottom tab navigation
 *
 * Data sources:
 *   - node.data.scores          → spectrum axis scores (already in graph)
 *   - node.data.albumArtworkUrl → album art (already in graph)
 *   - GET /api/analysis/ai/:id  → AI analysis (themes, emotional register, etc.)
 *   - GET /api/analysis/ai/:id/research → research summary + music style
 *   - GET /api/songs/:id/lyrics → lyrics text
 *   - GET /api/songs/yt-previews?ids=:id → YouTube URL if available
 */
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import RadarChart from '../components/charts/RadarChart';
import type { CinemaNode } from './types';
import type { AxisScoreMap } from '@band-spectrum-mapper/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiAnalysis {
  themes?: string[];
  emotionalRegister?: string;
  conceptualDepth?: string;
  notableElements?: string[];
}

interface Research {
  summary?: string;
  musicStyle?: string;
  sources?: { title: string; url: string }[];
}

interface LyricEntry {
  id: string;
  text: string;
  isPrimary: boolean;
}

export interface SongHolodeckProps {
  node: CinemaNode;
  neighborNodes: CinemaNode[];
  onClose: () => void;
}

type LeftTab  = 'spectrum' | 'research' | 'analysis';
type RightTab = 'lyrics'   | 'connections';
type MobileTab = 'record' | 'spectrum' | 'research' | 'analysis' | 'lyrics' | 'connections';

const AXIS_COLORS: Record<string, string> = {
  aggression:  '#ef4444',
  complexity:  '#f59e0b',
  atmosphere:  '#60a5fa',
  emotion:     '#a78bfa',
  psychedelic: '#34d399',
  concept:     '#fb923c',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripPrefix(id: string): string {
  return id.startsWith('song:') ? id.slice(5) : id;
}

function toProxied(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.protocol === 'blob:' || u.hostname === 'localhost') return url;
    return `/api/public/image-proxy?url=${encodeURIComponent(url)}`;
  } catch { return url; }
}

// ---------------------------------------------------------------------------
// Vinyl Record
// ---------------------------------------------------------------------------

function VinylRecord({ artworkUrl, spinning }: { artworkUrl: string | null; spinning: boolean }) {
  const size = 240;

  const grooveShadows = Array.from({ length: 18 }, (_, i) => {
    const r = 50 + i * 6;
    return `0 0 0 ${r}px rgba(255,255,255,0.025)`;
  }).join(', ');

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className="relative rounded-full shrink-0"
        style={{
          width: size, height: size,
          background: `
            radial-gradient(circle at 32% 30%, rgba(255,255,255,0.08) 0%, transparent 55%),
            conic-gradient(from 0deg, #0a0a0a 0%, #1c1c1c 20%, #0a0a0a 40%, #181818 60%, #0a0a0a 80%, #141414 100%)
          `,
          boxShadow: `${grooveShadows}, 0 0 60px rgba(0,0,0,0.9), inset 0 0 30px rgba(0,0,0,0.6)`,
          animation: spinning ? 'vinyl-spin 10s linear infinite' : 'none',
        }}
      >
        {/* Spindle hole */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-full overflow-hidden border border-gray-700/50"
            style={{ width: 80, height: 80 }}
          >
            {artworkUrl ? (
              <img
                src={toProxied(artworkUrl)}
                alt="Album art"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gray-800 flex items-center justify-center text-2xl text-gray-600">
                ♪
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes vinyl-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spectrum panel content
// ---------------------------------------------------------------------------

function SpectrumContent({ scores }: { scores: Record<string, number> | undefined }) {
  if (!scores) {
    return <div className="text-white/30 text-xs italic py-8 text-center">No spectrum data available for this song.</div>;
  }

  const axisScores = scores as unknown as AxisScoreMap;
  const datasets = [{ label: 'Score', scores: axisScores, color: '#818cf8' }];

  return (
    <div className="space-y-4">
      <RadarChart datasets={datasets} />
      <div className="space-y-2">
        {Object.entries(scores).map(([axis, val]) => (
          <div key={axis} className="flex items-center gap-3">
            <span className="text-xs text-white/50 w-24 shrink-0 capitalize">{axis}</span>
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(val / 10) * 100}%`,
                  background: AXIS_COLORS[axis] ?? '#818cf8',
                }}
              />
            </div>
            <span className="text-xs font-mono text-white/70 w-8 text-right">{Number(val).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Research panel content
// ---------------------------------------------------------------------------

function ResearchContent({ research, isLoading }: { research: Research | undefined; isLoading: boolean }) {
  if (isLoading) return <Spinner />;
  if (!research) return <Empty msg="No research available." />;

  return (
    <div className="space-y-5">
      {research.summary && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Background</div>
          <p className="text-sm text-white/70 leading-relaxed">{research.summary}</p>
        </div>
      )}
      {research.musicStyle && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Musical Style</div>
          <p className="text-sm text-white/70 leading-relaxed">{research.musicStyle}</p>
        </div>
      )}
      {research.sources && research.sources.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Sources</div>
          <div className="space-y-1">
            {research.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors truncate"
              >
                <span>↗</span>
                <span className="truncate">{s.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Analysis panel content
// ---------------------------------------------------------------------------

function AnalysisContent({ analysis, isLoading }: { analysis: AiAnalysis | undefined; isLoading: boolean }) {
  if (isLoading) return <Spinner />;
  if (!analysis || (!analysis.emotionalRegister && !analysis.conceptualDepth)) {
    return <Empty msg="AI analysis not yet generated." />;
  }

  return (
    <div className="space-y-5">
      {analysis.emotionalRegister && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Emotional Register</div>
          <p className="text-sm text-white/70 leading-relaxed">{analysis.emotionalRegister}</p>
        </div>
      )}
      {analysis.conceptualDepth && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Conceptual Depth</div>
          <p className="text-sm text-white/70 leading-relaxed">{analysis.conceptualDepth}</p>
        </div>
      )}
      {analysis.notableElements && analysis.notableElements.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Notable Elements</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.notableElements.map((e, i) => (
              <span key={i} className="px-2 py-0.5 bg-indigo-900/40 border border-indigo-500/30 rounded text-xs text-indigo-300">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}
      {analysis.themes && analysis.themes.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">Themes</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.themes.map((t, i) => (
              <span key={i} className="px-2 py-0.5 bg-purple-900/40 border border-purple-500/30 rounded text-xs text-purple-300">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lyrics panel content
// ---------------------------------------------------------------------------

function LyricsContent({ lyrics, isLoading }: { lyrics: LyricEntry[] | undefined; isLoading: boolean }) {
  const primary = lyrics?.find((l) => l.isPrimary) ?? lyrics?.[0];

  if (isLoading) return <Spinner />;
  if (!primary) return <Empty msg="No lyrics available for this song." />;

  return (
    <div>
      <pre className="text-sm text-white/80 leading-relaxed font-sans whitespace-pre-wrap break-words">
        {primary.text}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connections panel content
// ---------------------------------------------------------------------------

function ConnectionsContent({ neighborNodes }: { neighborNodes: CinemaNode[] }) {
  if (neighborNodes.length === 0) {
    return <Empty msg="No connected nodes visible in this graph scope." />;
  }

  const songs    = neighborNodes.filter((n) => n.type === 'song');
  const keywords = neighborNodes.filter((n) => n.type === 'keyword' || n.type === 'tag' || n.type === 'theme' || n.type === 'word');
  const albums   = neighborNodes.filter((n) => n.type === 'album');
  const others   = neighborNodes.filter((n) => !['song','keyword','tag','theme','word','album'].includes(n.type));

  const Section = ({ title, items, accent }: { title: string; items: CinemaNode[]; accent: string }) => (
    items.length > 0 ? (
      <div>
        <div className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${accent}`}>{title} ({items.length})</div>
        <div className="space-y-1">
          {items.slice(0, 20).map((n) => (
            <div key={n.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-white/5 rounded-lg border border-white/5">
              <span className="text-white/30 text-xs shrink-0">
                {n.type === 'song' ? '♪' : n.type === 'album' ? '💿' : '#'}
              </span>
              <span className="text-xs text-white/70 truncate">{n.label}</span>
              {typeof n.data?.bandName === 'string' && (
                <span className="text-[10px] text-white/30 ml-auto shrink-0 truncate max-w-[80px]">
                  {n.data.bandName}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

  return (
    <div className="space-y-5">
      <Section title="Connected Songs"    items={songs}    accent="text-indigo-400/70" />
      <Section title="Keywords & Themes"  items={keywords} accent="text-purple-400/70" />
      <Section title="Albums"             items={albums}   accent="text-sky-400/70" />
      <Section title="Other"              items={others}   accent="text-gray-400/70" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// YouTube panel content
// ---------------------------------------------------------------------------

function YoutubeContent({ ytUrl }: { ytUrl: string | null }) {
  if (!ytUrl) return <Empty msg="No YouTube video linked to this song." />;

  const videoId = (() => {
    try {
      const u = new URL(ytUrl);
      return u.searchParams.get('v') ?? u.pathname.split('/').pop() ?? null;
    } catch { return null; }
  })();

  if (!videoId) return <Empty msg="Could not parse YouTube URL." />;

  return (
    <div className="space-y-3">
      <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ paddingTop: '56.25%' }}>
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`}
          title="YouTube video"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <a
        href={ytUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-red-400 hover:text-red-300 transition-colors"
      >
        ↗ Open on YouTube
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <div className="flex justify-center py-10 gap-1.5">
      {[0,1,2].map((i) => (
        <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-white/30 text-xs italic py-8 text-center">{msg}</div>;
}

function TabBar<T extends string>({
  tabs, active, onSelect, accent,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onSelect: (t: T) => void;
  accent?: string;
}) {
  return (
    <div className="flex gap-0.5 mb-4 bg-white/5 rounded-lg p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`flex-1 px-2 py-1.5 rounded text-[11px] font-semibold transition-colors ${
            active === t.id
              ? `bg-white/15 text-white ${accent ?? ''}`
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SongHolodeck component
// ---------------------------------------------------------------------------

export default function SongHolodeck({ node, neighborNodes, onClose }: SongHolodeckProps) {
  const songId     = stripPrefix(node.id);
  const artworkUrl = node.data?.albumArtworkUrl as string | undefined ?? null;
  const bandName   = node.data?.bandName as string | undefined;
  const albumTitle = node.data?.albumTitle as string | undefined;
  const scores     = node.data?.scores as Record<string, number> | undefined;

  const [leftTab,   setLeftTab]   = useState<LeftTab>('spectrum');
  const [rightTab,  setRightTab]  = useState<RightTab>('lyrics');
  const [mobileTab, setMobileTab] = useState<MobileTab>('record');
  const [spinning,  setSpinning]  = useState(true);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Data fetching
  const { data: aiAnalysis, isLoading: aiLoading } = useQuery({
    queryKey: ['holodeck-analysis', songId],
    queryFn:  () => api.get<AiAnalysis>(`/api/analysis/ai/${songId}`),
    staleTime: 5 * 60 * 1000,
  });

  const { data: research, isLoading: researchLoading } = useQuery({
    queryKey: ['holodeck-research', songId],
    queryFn:  () => api.get<Research>(`/api/analysis/ai/${songId}/research`),
    staleTime: 5 * 60 * 1000,
  });

  const { data: lyrics, isLoading: lyricsLoading } = useQuery({
    queryKey: ['holodeck-lyrics', songId],
    queryFn:  () => api.get<LyricEntry[]>(`/api/songs/${songId}/lyrics`),
    staleTime: 5 * 60 * 1000,
  });

  const { data: ytMap } = useQuery({
    queryKey: ['holodeck-yt', songId],
    queryFn:  () => api.get<Record<string, string>>(`/api/songs/yt-previews?ids=${songId}`),
    staleTime: 10 * 60 * 1000,
  });

  const ytUrl = ytMap?.[songId] ?? null;
  const hasYt = !!ytUrl;

  const leftTabs: { id: LeftTab; label: string }[]   = [
    { id: 'spectrum',  label: 'Spectrum' },
    { id: 'research',  label: 'Research' },
    { id: 'analysis',  label: 'AI' },
  ];
  const rightTabs: { id: RightTab; label: string }[] = [
    { id: 'lyrics',      label: 'Lyrics' },
    { id: 'connections', label: 'Connections' },
  ];

  const mobileTabs: { id: MobileTab; label: string; icon: string }[] = [
    { id: 'record',      label: 'Record',  icon: '💿' },
    { id: 'spectrum',    label: 'Spectrum', icon: '📡' },
    { id: 'research',    label: 'Research', icon: '📚' },
    { id: 'analysis',    label: 'AI',       icon: '🤖' },
    { id: 'lyrics',      label: 'Lyrics',   icon: '📜' },
    { id: 'connections', label: 'Links',    icon: '🔗' },
  ];

  const handleClose = useCallback(() => onClose(), [onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/97 backdrop-blur-md flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg shrink-0">💿</span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">{node.label}</h2>
            <p className="text-[11px] text-white/40 truncate">
              {bandName ?? ''}
              {albumTitle ? ` · ${albumTitle}` : ''}
            </p>
          </div>
          {hasYt && (
            <span className="px-1.5 py-0.5 bg-red-900/40 border border-red-500/30 rounded text-[10px] text-red-400 shrink-0">
              YouTube
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSpinning((v) => !v)}
            className="text-[10px] text-white/30 hover:text-white/60 transition-colors hidden lg:block"
          >
            {spinning ? '⏸ Pause' : '▶ Spin'}
          </button>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Desktop: 3-column layout ─────────────────────────────────────── */}
      <div className="hidden lg:grid flex-1 min-h-0" style={{ gridTemplateColumns: '300px 1fr 300px', gap: '1rem', padding: '1rem' }}>

        {/* Left panel */}
        <div className="bg-gray-900/60 border border-white/10 rounded-xl p-4 flex flex-col min-h-0">
          <TabBar tabs={leftTabs} active={leftTab} onSelect={setLeftTab} />
          <div className="flex-1 overflow-y-auto pr-1">
            {leftTab === 'spectrum'  && <SpectrumContent scores={scores} />}
            {leftTab === 'research'  && <ResearchContent research={research} isLoading={researchLoading} />}
            {leftTab === 'analysis'  && <AnalysisContent analysis={aiAnalysis} isLoading={aiLoading} />}
          </div>
        </div>

        {/* Center */}
        <div className="flex flex-col items-center justify-center gap-6 min-h-0">
          <VinylRecord artworkUrl={artworkUrl} spinning={spinning} />

          {/* Song identity */}
          <div className="text-center space-y-1">
            <h3 className="text-xl font-bold text-white">{node.label}</h3>
            {bandName   && <p className="text-sm text-white/60">{bandName}</p>}
            {albumTitle && <p className="text-xs text-white/40 italic">{albumTitle}</p>}
          </div>

          {/* YouTube inline (if available) */}
          {hasYt && (
            <div className="w-full max-w-sm">
              <YoutubeContent ytUrl={ytUrl} />
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="bg-gray-900/60 border border-white/10 rounded-xl p-4 flex flex-col min-h-0">
          <TabBar tabs={rightTabs} active={rightTab} onSelect={setRightTab} />
          <div className="flex-1 overflow-y-auto pr-1">
            {rightTab === 'lyrics'      && <LyricsContent lyrics={lyrics} isLoading={lyricsLoading} />}
            {rightTab === 'connections' && <ConnectionsContent neighborNodes={neighborNodes} />}
          </div>
        </div>
      </div>

      {/* ── Mobile: single panel + bottom tab bar ──────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 lg:hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {mobileTab === 'record' && (
            <div className="flex flex-col items-center gap-6 py-4">
              <VinylRecord artworkUrl={artworkUrl} spinning={spinning} />
              <div className="text-center space-y-1">
                <h3 className="text-xl font-bold text-white">{node.label}</h3>
                {bandName   && <p className="text-sm text-white/60">{bandName}</p>}
                {albumTitle && <p className="text-xs text-white/40 italic">{albumTitle}</p>}
              </div>
              {hasYt && (
                <div className="w-full max-w-sm">
                  <YoutubeContent ytUrl={ytUrl} />
                </div>
              )}
            </div>
          )}
          {mobileTab === 'spectrum'    && <SpectrumContent scores={scores} />}
          {mobileTab === 'research'    && <ResearchContent research={research} isLoading={researchLoading} />}
          {mobileTab === 'analysis'    && <AnalysisContent analysis={aiAnalysis} isLoading={aiLoading} />}
          {mobileTab === 'lyrics'      && <LyricsContent lyrics={lyrics} isLoading={lyricsLoading} />}
          {mobileTab === 'connections' && <ConnectionsContent neighborNodes={neighborNodes} />}
        </div>

        {/* Bottom tab bar */}
        <div className="shrink-0 border-t border-white/10 bg-gray-950 px-2 pb-safe">
          <div className="flex">
            {mobileTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setMobileTab(t.id)}
                className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                  mobileTab === t.id ? 'text-indigo-400' : 'text-white/30 hover:text-white/60'
                }`}
              >
                <span className="text-base leading-none">{t.icon}</span>
                <span className="text-[9px] font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

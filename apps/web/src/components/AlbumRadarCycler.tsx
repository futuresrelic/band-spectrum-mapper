import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { SCORE_AXES, AXIS_LABELS, type ScoreAxis } from '@band-spectrum-mapper/shared';

// ── Types ──────────────────────────────────────────────────────────────────

type AxisMap = Record<ScoreAxis, number>;

type SongSpectrum = {
  id: string;
  title: string;
  trackNumber: number | null;
  coreScores: AxisMap | null;
  aiScores: AxisMap | null;
  communityScores: AxisMap | null;
  ratingCount: number;
};

type AlbumSpectrumResponse = {
  album: { id: string; title: string; year: number | null; artworkUrl: string | null; band: { name: string; slug: string } };
  songs: SongSpectrum[];
};

type Tab = 'core' | 'ai' | 'community';

// ── Colours & helpers ──────────────────────────────────────────────────────

const VIVID: Record<ScoreAxis, string> = {
  aggression: '#ff3a3a',
  complexity:  '#ff9500',
  atmosphere:  '#34c8e8',
  emotion:     '#ff375f',
  psychedelic: '#bf5af2',
  concept:     '#30d158',
};

const EMPTY: AxisMap = {
  aggression: 1.5, complexity: 1.5, atmosphere: 1.5,
  emotion: 1.5, psychedelic: 1.5, concept: 1.5,
};

function eio(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ── Gradient radar SVG (same technique as ShareSongPage) ──────────────────

function RadarSvg({ scores, idp, sz }: { scores: AxisMap; idp: string; sz: number }) {
  const cx = sz / 2, cy = sz / 2;
  const R  = sz * 0.385;       // scales radius proportionally with size
  const N  = SCORE_AXES.length;

  const ang = (i: number) => -Math.PI / 2 + i * (2 * Math.PI / N);
  const px  = (i: number, f: number) => cx + f * R * Math.cos(ang(i));
  const py  = (i: number, f: number) => cy + f * R * Math.sin(ang(i));

  function sector(i: number) {
    const pts: [number, number][] = [[cx, cy]];
    const a = ang(i) * (180 / Math.PI);
    for (let d = a - 31; d <= a + 31; d += 4) {
      const r = d * Math.PI / 180;
      pts.push([cx + (R + 28) * Math.cos(r), cy + (R + 28) * Math.sin(r)]);
    }
    return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  }

  function hex(f: number) {
    return `M ${SCORE_AXES.map((_, i) =>
      `${px(i, f).toFixed(1)},${py(i, f).toFixed(1)}`).join(' L ')} Z`;
  }

  const poly = `M ${SCORE_AXES.map((ax, i) => {
    const s = (scores[ax] ?? 0) / 10;
    return `${px(i, s).toFixed(1)},${py(i, s).toFixed(1)}`;
  }).join(' L ')} Z`;

  const LR = R + 20;

  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="overflow-visible">
      <defs>
        {SCORE_AXES.map((ax) => {
          const s   = Math.max(0.01, (scores[ax] ?? 0) / 10);
          const col = VIVID[ax]!;
          const pk  = Math.round(s * 100);
          const fd  = Math.min(pk + 14, 100);
          const in_ = Math.max(0, Math.round(s * 55));
          return (
            <radialGradient key={ax} id={`${idp}-rg-${ax}`}
              gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R * 1.08}>
              <stop offset="0%"         stopColor={col} stopOpacity={0}/>
              <stop offset={`${in_}%`}  stopColor={col} stopOpacity={s * 0.22}/>
              <stop offset={`${pk}%`}   stopColor={col} stopOpacity={s * 0.9}/>
              <stop offset={`${fd}%`}   stopColor={col} stopOpacity={0}/>
            </radialGradient>
          );
        })}
        {SCORE_AXES.map((ax, i) => (
          <clipPath key={ax} id={`${idp}-cp-${ax}`}>
            <polygon points={sector(i)} />
          </clipPath>
        ))}
        <radialGradient id={`${idp}-cg`} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R * 0.18}>
          <stop offset="0%"   stopColor="#ffffff" stopOpacity={0.45}/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0}/>
        </radialGradient>
      </defs>

      {[0.2, 0.4, 0.6, 0.8, 1.0].map((f) => (
        <path key={f} d={hex(f)} fill="none" stroke="white" strokeWidth={0.6}
          strokeOpacity={f === 1 ? 0.18 : 0.09}/>
      ))}
      {SCORE_AXES.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={px(i, 1)} y2={py(i, 1)}
          stroke="white" strokeWidth={0.6} strokeOpacity={0.12}/>
      ))}
      {SCORE_AXES.map((ax) => (
        <rect key={ax}
          x={cx - R - 28} y={cy - R - 28}
          width={(R + 28) * 2} height={(R + 28) * 2}
          fill={`url(#${idp}-rg-${ax})`} clipPath={`url(#${idp}-cp-${ax})`}
        />
      ))}
      <path d={poly} fill="white" fillOpacity={0.06}
        stroke="white" strokeWidth={1.5} strokeOpacity={0.65} strokeLinejoin="round"/>
      {SCORE_AXES.map((ax, i) => {
        const s = (scores[ax] ?? 0) / 10;
        return (
          <circle key={ax} cx={px(i, s)} cy={py(i, s)}
            r={3 + s * 2.5} fill={VIVID[ax]!} stroke="white" strokeWidth={1} strokeOpacity={0.6}/>
        );
      })}
      <circle cx={cx} cy={cy} r={R * 0.18} fill={`url(#${idp}-cg)`}/>

      {/* Axis labels */}
      {SCORE_AXES.map((ax, i) => {
        const lx  = cx + LR * Math.cos(ang(i));
        const ly  = cy + LR * Math.sin(ang(i));
        const col = VIVID[ax]!;
        const deg = ang(i) * (180 / Math.PI);
        const ta  = (Math.abs(deg) < 30 || Math.abs(deg) > 150) ? 'middle' : deg > 0 ? 'start' : 'end';
        const dy  = Math.abs(Math.sin(ang(i))) > 0.7 ? (Math.sin(ang(i)) > 0 ? 10 : -4) : 0;
        return (
          <g key={ax}>
            <text x={lx} y={ly + dy} fontFamily="system-ui,sans-serif"
              fontSize={sz * 0.028} fontWeight={700} fill={col} textAnchor={ta}
              letterSpacing={0.8} opacity={0.7}>
              {ax.slice(0, 4).toUpperCase()}
            </text>
            <text x={lx} y={ly + dy + sz * 0.04} fontFamily="system-ui,sans-serif"
              fontSize={sz * 0.042} fontWeight={700} fill={col} textAnchor={ta}>
              {(scores[ax] ?? 0).toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main cycler component ──────────────────────────────────────────────────

interface Props {
  albumId: string;
  /** Used for "Rate →" / "Add yours →" links */
  bandSlug?: string;
  /** Radar SVG size in px — defaults to 260 */
  radarSize?: number;
  /** Strip own border/radius when mounted inside a parent card */
  flush?: boolean;
  /** Hide the "Album Spectrum" label + art thumbnail — keep tabs visible */
  hideHeader?: boolean;
}

export default function AlbumRadarCycler({ albumId, bandSlug, radarSize = 260, flush = false, hideHeader = false }: Props) {
  const [idx, setIdx]         = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab]         = useState<Tab>('core');

  // Rendered scores are interpolated each animation frame
  const [displayed, setDisplayed] = useState<AxisMap>({ ...EMPTY });
  const displayedRef = useRef<AxisMap>({ ...EMPTY });
  const rafRef       = useRef<number | null>(null);

  // Unique SVG gradient/clipPath IDs per instance (avoids cross-album conflicts)
  const idp = useMemo(() => `arc-${albumId.slice(-8)}`, [albumId]);

  const { data, isLoading } = useQuery({
    queryKey: ['album-spectrum', albumId],
    queryFn: () => api.get<AlbumSpectrumResponse>(`/api/public/albums/${albumId}/spectrum`),
    staleTime: 5 * 60_000,
  });

  const songs = data?.songs ?? [];
  const song  = songs[idx] ?? null;

  function scoreFor(s: SongSpectrum | null, t: Tab): AxisMap | null {
    if (!s) return null;
    return t === 'core' ? s.coreScores : t === 'ai' ? s.aiScores : s.communityScores;
  }

  // ── Lerp animation — fires when song index, tab, or songs data changes ──
  useEffect(() => {
    const s      = songs[idx] ?? null;
    const raw    = s
      ? (tab === 'core' ? s.coreScores : tab === 'ai' ? s.aiScores : s.communityScores)
      : null;
    const target = raw ?? { ...EMPTY };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const from = { ...displayedRef.current };
    const t0   = performance.now();
    const dur  = 650;

    const step = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = eio(p);
      const next = {} as AxisMap;
      for (const ax of SCORE_AXES) next[ax] = from[ax]! + (target[ax]! - from[ax]!) * e;
      displayedRef.current = next;
      setDisplayed({ ...next });
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [idx, tab, songs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-play ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || songs.length === 0) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % songs.length), 2800);
    return () => clearInterval(timer);
  }, [playing, songs.length]);

  // ── Auto-select best tab when current song has no data in chosen tab ─────
  useEffect(() => {
    if (!song) return;
    if (!scoreFor(song, tab)) {
      if (scoreFor(song, 'core'))      setTab('core');
      else if (scoreFor(song, 'ai'))   setTab('ai');
      else if (scoreFor(song, 'community')) setTab('community');
    }
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className={`bg-slate-900 p-6 flex items-center justify-center min-h-20${flush ? '' : ' rounded-xl border border-slate-800 mb-4'}`}>
        <span className="text-slate-700 text-sm animate-pulse">Loading album spectrums…</span>
      </div>
    );
  }

  // Don't render for single-song albums
  if (songs.length < 2) return null;

  const coreCount      = songs.filter((s) => s.coreScores).length;
  const aiCount        = songs.filter((s) => s.aiScores).length;
  const communityCount = songs.filter((s) => s.communityScores).length;
  const totalRatings   = songs.reduce((a, s) => a + s.ratingCount, 0);
  const hasData        = !!scoreFor(song, tab);

  return (
    <div className={`bg-slate-900 overflow-hidden${flush ? '' : ' rounded-xl border border-slate-800 mb-4'}`}>

      {/* ── Header: label + tab selector ────────────────────────────────── */}
      <div className={`px-5 ${hideHeader ? 'pt-3' : 'pt-4'} pb-2 flex items-center ${hideHeader ? 'justify-end' : 'justify-between'} flex-wrap gap-2`}>
        {!hideHeader && (
          <div className="flex items-center gap-2">
            {data?.album.artworkUrl && (
              <img
                src={data.album.artworkUrl}
                alt=""
                className="w-9 h-9 rounded object-cover shrink-0 opacity-90"
              />
            )}
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              Album Spectrum
            </p>
          </div>
        )}
        <div className="flex gap-0.5 rounded border border-slate-700 p-0.5 bg-slate-950/50">
          {([
            ['core',      `Core ${coreCount}/${songs.length}`],
            ['ai',        `AI ${aiCount}/${songs.length}`],
            ['community', `Community ${communityCount}/${songs.length}`],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="px-5 pb-5">

        {/* Current song name — large, centered, above radar */}
        <div className="text-center mb-2 min-h-[64px] flex flex-col items-center justify-center">
          <div className="flex items-baseline justify-center gap-2 px-4">
            {song?.trackNumber != null && (
              <span className="text-sm tabular-nums text-slate-600 shrink-0">
                {song.trackNumber}.
              </span>
            )}
            <span key={`title-${idx}`} className="text-2xl font-bold text-white leading-tight tracking-tight">
              {song?.title ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-center gap-4 mt-1.5">
            {!hasData && (
              <span className="text-[10px] text-slate-600 italic">no {tab} data</span>
            )}
            {song && (
              <Link
                to={`/share/songs/${song.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                Share ↗
              </Link>
            )}
            {bandSlug && song && (
              <Link
                to={`/rate?songId=${song.id}`}
                className="text-[10px] text-indigo-500 hover:text-indigo-400 border border-indigo-900 rounded px-1.5 py-0.5 transition-colors"
              >
                Rate →
              </Link>
            )}
          </div>
        </div>

        {/* Animated radar */}
        <div
          className="flex justify-center relative transition-opacity duration-300"
          style={{ opacity: hasData ? 1 : 0.28 }}
        >
          <RadarSvg scores={displayed} idp={idp} sz={radarSize} />
          {!hasData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-slate-300 text-sm font-semibold">No {tab} scores yet</p>
              <p className="text-slate-500 text-xs mt-1">
                {tab === 'community'
                  ? 'Be the first to rate this song →'
                  : 'Admin can generate these from the song page'}
              </p>
            </div>
          )}
        </div>

        {/* ── Slider + prev/next/play controls ─────────────────────────── */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => { setPlaying(false); setIdx((i) => (i - 1 + songs.length) % songs.length); }}
            className="w-7 h-7 flex items-center justify-center shrink-0 text-slate-500 hover:text-slate-300 transition-colors select-none text-sm"
            aria-label="Previous song"
          >◀</button>

          <div className="flex-1">
            <input
              type="range"
              min={0}
              max={songs.length - 1}
              value={idx}
              onChange={(e) => {
                setPlaying(false);
                setIdx(Number(e.target.value));
              }}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            {/* Per-song tick dots */}
            <div className="flex justify-between px-0.5 mt-0.5">
              {songs.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => { setPlaying(false); setIdx(i); }}
                  className="flex flex-col items-center gap-0.5 group"
                  style={{ width: 0, overflow: 'visible' }}
                  aria-label={s.title}
                >
                  <div className={`w-1 h-1 rounded-full transition-colors ${
                    i === idx ? 'bg-indigo-400' : 'bg-slate-700 group-hover:bg-slate-500'
                  }`}/>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => { setPlaying(false); setIdx((i) => (i + 1) % songs.length); }}
            className="w-7 h-7 flex items-center justify-center shrink-0 text-slate-500 hover:text-slate-300 transition-colors select-none text-sm"
            aria-label="Next song"
          >▶</button>

          <button
            onClick={() => setPlaying((p) => !p)}
            className={`shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
              playing
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
            }`}
          >
            <span>{playing ? '⏸' : '▶'}</span>
            <span className="hidden sm:inline">{playing ? 'Pause' : 'Play'}</span>
          </button>
        </div>

        {/* Position counter + total ratings */}
        <p className="text-[10px] text-slate-700 text-center mt-1.5 tabular-nums">
          {idx + 1} / {songs.length} songs
          {totalRatings > 0 && ` · ${totalRatings} community rating${totalRatings !== 1 ? 's' : ''}`}
        </p>

        {/* ── Animated score bars ── */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 mt-4">
          {SCORE_AXES.map((ax) => {
            const val = displayed[ax] ?? 0;
            const pct = Math.max(0, Math.min((val / 10) * 100, 100));
            const col = VIVID[ax]!;
            return (
              <div key={ax}>
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="text-[11px] text-slate-500">{AXIS_LABELS[ax]}</span>
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: hasData ? col : '#475569' }}
                  >
                    {hasData ? val.toFixed(1) : '—'}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: col, opacity: hasData ? 0.85 : 0.15 }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Missing-data call-to-action ── */}
        {tab === 'community' && communityCount < songs.length && (
          <div className="mt-4 pt-3 border-t border-slate-800 text-center">
            <p className="text-[10px]">
              <span className="text-slate-600">
                {songs.length - communityCount} song{songs.length - communityCount !== 1 ? 's' : ''} still
                need community ratings
              </span>
              {bandSlug && (
                <Link to="/my/rate" className="ml-2 text-indigo-500 hover:text-indigo-400 font-medium">
                  Add yours →
                </Link>
              )}
            </p>
          </div>
        )}
        {tab === 'ai' && aiCount < songs.length && (
          <div className="mt-4 pt-3 border-t border-slate-800 text-center">
            <p className="text-[10px] text-slate-600">
              {songs.length - aiCount} song{songs.length - aiCount !== 1 ? 's' : ''} haven't
              been AI-scored yet
            </p>
          </div>
        )}
        {tab === 'core' && coreCount < songs.length && (
          <div className="mt-4 pt-3 border-t border-slate-800 text-center">
            <p className="text-[10px] text-slate-600">
              {songs.length - coreCount} song{songs.length - coreCount !== 1 ? 's' : ''} missing
              core scores
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

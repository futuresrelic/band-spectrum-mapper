import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { wordCloudApi, type CloudWord, type WordCloudData, type SimilarSong, type SimilarSongsResult, type WordLookupResult, type WordClustersResult } from '../api/wordCloud';
import SocialChatPanel from '../components/social/SocialChatPanel';
import { pushCinemaHandoff } from '../cinema/cinemaHandoff';
import { GUESS_SONG_STORAGE_KEY, type GuessSongHandoff } from './GuessSongPage';

// ---------------------------------------------------------------------------
// Word cloud layout algorithm
// ---------------------------------------------------------------------------

interface LayoutWord {
  text: string;
  weight: number;
  fontSize: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  word: CloudWord;
}

interface Rect { x: number; y: number; w: number; h: number; }

function overlaps(a: Rect, b: Rect): boolean {
  const PAD = 4;
  return !(
    a.x + a.w + PAD < b.x - PAD ||
    b.x + b.w + PAD < a.x - PAD ||
    a.y + a.h + PAD < b.y - PAD ||
    b.y + b.h + PAD < a.y - PAD
  );
}

function weightToFontSize(weight: number, maxWeight: number, min: number, max: number): number {
  const t = weight / maxWeight;
  // Non-linear: give top words dramatic size boost
  const scaled = Math.pow(t, 0.6);
  return Math.round(min + scaled * (max - min));
}

function weightToColor(weight: number, maxWeight: number): string {
  const t = weight / maxWeight;
  // White (dominant) → indigo-200 → indigo-400 → indigo-700 (minor)
  if (t > 0.8)  return '#ffffff';
  if (t > 0.6)  return '#e0e7ff'; // indigo-100
  if (t > 0.4)  return '#a5b4fc'; // indigo-300
  if (t > 0.2)  return '#818cf8'; // indigo-400
  return '#6366f1';                // indigo-500
}

function measureText(ctx: CanvasRenderingContext2D, text: string, fontSize: number): { w: number; h: number } {
  ctx.font = `600 ${fontSize}px "Inter", system-ui, sans-serif`;
  const m = ctx.measureText(text);
  return { w: m.width, h: fontSize * 1.2 };
}

function layoutWords(
  words: CloudWord[],
  canvasWidth: number,
  canvasHeight: number,
): LayoutWord[] {
  // Offscreen canvas for text measurement
  const mc = document.createElement('canvas');
  mc.width = canvasWidth;
  mc.height = canvasHeight;
  const ctx = mc.getContext('2d');
  if (!ctx) return [];

  const maxWeight = Math.max(1, ...words.map((w) => w.weight));
  const MIN_SIZE = 11;
  const MAX_SIZE = Math.min(72, Math.floor(canvasWidth / 10));

  const placed: LayoutWord[] = [];
  const placedRects: Rect[] = [];
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  for (const word of words) {
    const fontSize = weightToFontSize(word.weight, maxWeight, MIN_SIZE, MAX_SIZE);
    const { w, h } = measureText(ctx, word.text, fontSize);
    const color = weightToColor(word.weight, maxWeight);

    let foundX = cx - w / 2;
    let foundY = cy - h / 2;
    let placed_ok = false;

    // Archimedean spiral search from centre outward
    const MAX_STEPS = 3000;
    const STEP = 0.15;
    const SPIRAL_SPREAD = 0.45 + (1 - word.weight / maxWeight) * 0.25;

    for (let step = 0; step < MAX_STEPS; step++) {
      const angle = step * STEP;
      const r = SPIRAL_SPREAD * step;
      const tx = cx + r * Math.cos(angle) - w / 2;
      const ty = cy + r * Math.sin(angle) - h / 2;

      // Keep within canvas bounds with margin
      const MARGIN = 8;
      if (tx < MARGIN || ty < MARGIN || tx + w > canvasWidth - MARGIN || ty + h > canvasHeight - MARGIN) {
        continue;
      }

      const rect: Rect = { x: tx, y: ty, w, h };
      if (!placedRects.some((r) => overlaps(rect, r))) {
        foundX = tx;
        foundY = ty;
        placed_ok = true;
        placedRects.push(rect);
        break;
      }
    }

    if (!placed_ok && placedRects.length > 0) continue; // skip overflow words

    placed.push({
      text: word.text,
      weight: word.weight,
      fontSize,
      x: foundX + w / 2,  // SVG text anchor = middle
      y: foundY + h * 0.8, // SVG baseline adjustment
      w,
      h,
      color,
      word,
    });
  }

  return placed;
}

// ---------------------------------------------------------------------------
// SVG word cloud renderer
// ---------------------------------------------------------------------------

interface WordCloudSvgProps {
  words: CloudWord[];
  width: number;
  height: number;
  onWordClick: (word: CloudWord) => void;
  highlightWord: string | null;
  svgRef: React.RefObject<SVGSVGElement>;
}

function WordCloudSvg({ words, width, height, onWordClick, highlightWord, svgRef }: WordCloudSvgProps) {
  const [layout, setLayout] = useState<LayoutWord[]>([]);

  useEffect(() => {
    if (!words.length) { setLayout([]); return; }
    // Run layout in next tick so canvas is available
    const id = requestAnimationFrame(() => {
      setLayout(layoutWords(words, width, height));
    });
    return () => cancelAnimationFrame(id);
  }, [words, width, height]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ background: '#0d1b2e' }}
      className="rounded-xl"
    >
      <defs>
        <radialGradient id="bg-grad" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#0d2347" />
          <stop offset="100%" stopColor="#060d1a" />
        </radialGradient>
      </defs>
      <rect width={width} height={height} fill="url(#bg-grad)" />

      {layout.map((lw) => {
        const isHighlight = highlightWord === lw.text;
        const opacity = highlightWord
          ? isHighlight ? 1 : 0.25
          : 1;
        return (
          <text
            key={lw.text}
            x={lw.x}
            y={lw.y}
            textAnchor="middle"
            fontSize={lw.fontSize}
            fontWeight="600"
            fontFamily={'"Inter", system-ui, sans-serif'}
            fill={isHighlight ? '#fff' : lw.color}
            opacity={opacity}
            style={{ cursor: 'pointer', userSelect: 'none', transition: 'opacity 0.2s' }}
            onClick={() => onWordClick(lw.word)}
          >
            {lw.text}
          </text>
        );
      })}

      {/* Branding */}
      <text
        x={width - 8} y={height - 8}
        textAnchor="end"
        fontSize="10"
        fontFamily="system-ui"
        fill="#1e3a5f"
        opacity={0.6}
      >
        Band Spectrum Mapper
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function exportSvgAsPng(svgEl: SVGSVGElement, filename: string, w: number, h: number): void {
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0d1b2e';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ---------------------------------------------------------------------------
// Scope selector
// ---------------------------------------------------------------------------

type ScopeType = 'universe' | 'artist' | 'album' | 'song';

interface ScopeSelectorProps {
  scope: ScopeType;
  setScope: (s: ScopeType) => void;
  scopeId: string;
  setScopeId: (id: string) => void;
  selectedBandIds: string[];
  setSelectedBandIds: (ids: string[]) => void;
}

function ScopeSelector({
  scope, setScope,
  scopeId, setScopeId,
  selectedBandIds, setSelectedBandIds,
}: ScopeSelectorProps) {
  const { data: scopes } = useQuery({
    queryKey: ['word-cloud-scopes'],
    queryFn: wordCloudApi.getScopes,
  });

  // Internal band-filter for song/album pickers
  const [songBandFilter, setSongBandFilter] = useState('');
  const [albumBandFilter, setAlbumBandFilter] = useState('');

  // Lazy-load songs for the selected band — avoids the 500-song truncation problem
  const { data: bandSongs, isFetching: songsFetching } = useQuery({
    queryKey: ['word-cloud-songs', songBandFilter],
    queryFn: () => wordCloudApi.getSongsByBand(songBandFilter),
    enabled: scope === 'song' && songBandFilter !== '',
  });

  function toggleBand(id: string) {
    setSelectedBandIds(
      selectedBandIds.includes(id)
        ? selectedBandIds.filter((x) => x !== id)
        : [...selectedBandIds, id],
    );
  }

  const filteredAlbums = scopes?.albums.filter(a => !albumBandFilter || a.band.id === albumBandFilter) ?? [];

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Scope</div>
        <div className="flex gap-1.5 flex-wrap">
          {(['universe', 'artist', 'album', 'song'] as ScopeType[]).map((s) => (
            <button
              key={s}
              className={`px-2.5 py-1 text-xs rounded transition-colors capitalize
                ${scope === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-surface-800 text-surface-300 hover:bg-surface-700'}`}
              onClick={() => { setScope(s); setScopeId(''); setSelectedBandIds([]); setSongBandFilter(''); setAlbumBandFilter(''); }}
            >
              {s === 'universe' ? 'All Songs' : s}
            </button>
          ))}
        </div>
      </div>

      {scope === 'artist' && scopes && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Artists</div>
            {selectedBandIds.length > 0 && (
              <button
                className="text-xs text-surface-500 hover:text-surface-200 transition-colors"
                onClick={() => setSelectedBandIds([])}
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {scopes.bands.map((b) => {
              const checked = selectedBandIds.includes(b.id);
              return (
                <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBand(b.id)}
                    className="accent-indigo-500"
                  />
                  <span className={`text-xs transition-colors
                    ${checked ? 'text-white' : 'text-surface-400 group-hover:text-surface-200'}`}>
                    {b.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {scope === 'album' && scopes && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Album</div>
          {scopes.bands.length > 1 && (
            <select
              className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
              value={albumBandFilter}
              onChange={e => { setAlbumBandFilter(e.target.value); setScopeId(''); }}
            >
              <option value="">— all artists —</option>
              {scopes.bands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <select
            className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
          >
            <option value="">— pick album —</option>
            {filteredAlbums.map((a) => (
              <option key={a.id} value={a.id}>
                {albumBandFilter ? a.title : `${a.band.name} / ${a.title}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {scope === 'song' && scopes && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Song</div>
          <select
            className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
            value={songBandFilter}
            onChange={e => { setSongBandFilter(e.target.value); setScopeId(''); }}
          >
            <option value="">— pick an artist first —</option>
            {scopes.bands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {songBandFilter && (
            <select
              className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              disabled={songsFetching}
            >
              <option value="">{songsFetching ? 'Loading…' : '— pick a song —'}</option>
              {(bandSongs ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.album ? `${s.album.title} / ${s.title}` : s.title}
                </option>
              ))}
            </select>
          )}
          {!songBandFilter && (
            <p className="text-[10px] text-surface-600 leading-tight">
              Select an artist to load their songs.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Word detail panel
// ---------------------------------------------------------------------------

function WordDetail({ word, onClose }: { word: CloudWord; onClose: () => void }) {
  return (
    <div className="bg-surface-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-lg font-bold text-white">{word.text}</span>
          <div className="text-xs text-surface-400 mt-0.5">
            weight {word.weight} · freq {word.frequency}
            {word.themeBoost > 0.1 && ` · theme ×${(word.themeBoost * 100).toFixed(0)}%`}
            {word.tagBoost > 0.1 && ` · tag ×${(word.tagBoost * 100).toFixed(0)}%`}
          </div>
        </div>
        <button onClick={onClose} className="text-surface-500 hover:text-white text-sm">✕</button>
      </div>

      <div className="text-xs text-surface-400 mb-2 font-medium uppercase tracking-wider">
        Found in {word.songs.length} song{word.songs.length !== 1 ? 's' : ''}
      </div>
      <ul className="space-y-1 max-h-48 overflow-y-auto">
        {word.songs.map((s) => (
          <li key={s.id} className="text-xs text-surface-200">
            <span className="text-surface-500">{s.band}</span> — {s.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const CANVAS_SIZE = 880;

export default function WordCloudPage() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<ScopeType>('universe');
  const [scopeId, setScopeId] = useState('');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [minFreq, setMinFreq] = useState(2);
  const [maxFreq, setMaxFreq] = useState(0); // 0 = no upper limit
  const [limit, setLimit] = useState(100);
  const [includeLyrics, setIncludeLyrics] = useState(true);
  const [includeThemes, setIncludeThemes] = useState(true);
  const [includeTags, setIncludeTags] = useState(true);
  const [selectedWord, setSelectedWord] = useState<CloudWord | null>(null);
  const [highlightWord, setHighlightWord] = useState<string | null>(null);
  const [ignoreWords, setIgnoreWords] = useState('');

  // Include-only / whitelist filter
  const [includeOnlyMode, setIncludeOnlyMode] = useState(false);
  const [includeOnlyWords, setIncludeOnlyWords] = useState('');

  // Similarity finder
  const [simBandId, setSimBandId]   = useState('');
  const [simSongId, setSimSongId]   = useState('');
  const [simScope,  setSimScope]    = useState<'all' | 'artist'>('all');
  const [simMinShared, setSimMinShared] = useState(5);
  const [simResult, setSimResult]   = useState<SimilarSongsResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simExpanded, setSimExpanded] = useState<string | null>(null);

  // Word lookup
  const [lookupWord, setLookupWord]         = useState('');
  const [lookupBandIds, setLookupBandIds]   = useState<string[]>([]);
  const [lookupResult, setLookupResult]     = useState<WordLookupResult | null>(null);
  const [lookupLoading, setLookupLoading]   = useState(false);

  // Word clusters
  const [clusterBandIds, setClusterBandIds]                 = useState<string[]>([]);
  const [clusterMinSongs, setClusterMinSongs]               = useState(3);
  const [clusterMaxSongs, setClusterMaxSongs]               = useState(0); // 0 = no upper limit
  const [clusterMinWords, setClusterMinWords]               = useState(2);
  const [clusterMaxGroup, setClusterMaxGroup]               = useState(4);
  const [clusterTopN, setClusterTopN]                       = useState(25);
  const [clusterExcludeWords, setClusterExcludeWords]       = useState('');
  const [clusterRequireCrossBand, setClusterRequireCrossBand]   = useState(false);
  const [clusterRequireCrossAlbum, setClusterRequireCrossAlbum] = useState(false);
  const [clusterSortBy, setClusterSortBy]                   = useState<'score' | 'songs' | 'words'>('score');
  const [clusterResult, setClusterResult]                   = useState<WordClustersResult | null>(null);
  const [clusterLoading, setClusterLoading]                 = useState(false);
  const [clusterExpanded, setClusterExpanded]               = useState<string | null>(null);
  const [clusterPage, setClusterPage]                       = useState(1);
  const [clusterFilterExclude, setClusterFilterExclude]     = useState('');
  const [clusterFilterMustHave, setClusterFilterMustHave]   = useState('');

  const svgRef = useRef<SVGSVGElement>(null);

  // Case-insensitive set of words to exclude from display
  const ignoreSet = useMemo(() => new Set(
    ignoreWords.split(/[\s,]+/).map(w => w.trim().toLowerCase()).filter(Boolean),
  ), [ignoreWords]);

  const includeOnlySet = useMemo(() => new Set(
    includeOnlyWords.split(/[\s,]+/).map(w => w.trim().toLowerCase()).filter(Boolean),
  ), [includeOnlyWords]);

  const CLUSTERS_PER_PAGE = 25;

  const sortedClusters = useMemo(() => {
    if (!clusterResult) return [];
    const excludeFilters = clusterFilterExclude
      .split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
    const mustHave = clusterFilterMustHave.trim().toLowerCase();

    let arr = clusterResult.clusters;
    if (excludeFilters.length > 0) {
      arr = arr.filter((c) => !excludeFilters.some((fw) => c.words.some((w) => w.toLowerCase() === fw)));
    }
    if (mustHave) {
      arr = arr.filter((c) => c.words.some((w) => w.toLowerCase() === mustHave));
    }

    const sorted = [...arr];
    if (clusterSortBy === 'songs') sorted.sort((a, b) => b.songCount - a.songCount || b.wordCount - a.wordCount);
    if (clusterSortBy === 'words') sorted.sort((a, b) => b.wordCount - a.wordCount || b.songCount - a.songCount);
    return sorted; // 'score' already sorted server-side
  }, [clusterResult, clusterSortBy, clusterFilterExclude, clusterFilterMustHave]);

  const clusterTotalPages = Math.max(1, Math.ceil(sortedClusters.length / CLUSTERS_PER_PAGE));

  const paginatedClusters = useMemo(
    () => sortedClusters.slice((clusterPage - 1) * CLUSTERS_PER_PAGE, clusterPage * CLUSTERS_PER_PAGE),
    [sortedClusters, clusterPage],
  );

  // Derive effective id and canQuery based on scope
  const effectiveId = scope === 'artist' ? selectedBandIds.join(',') : scopeId;
  const canQuery =
    scope === 'universe' ||
    (scope === 'artist' && selectedBandIds.length > 0) ||
    (scope !== 'artist' && !!scopeId);

  // Shared scopes cache (same key as ScopeSelector — no extra network request)
  const { data: scopes } = useQuery({
    queryKey: ['word-cloud-scopes'],
    queryFn:  wordCloudApi.getScopes,
  });

  // Lazy-load songs for the similarity band picker
  const { data: simBandSongs, isFetching: simSongsFetching } = useQuery({
    queryKey: ['word-cloud-songs', simBandId],
    queryFn:  () => wordCloudApi.getSongsByBand(simBandId),
    enabled:  !!simBandId,
  });

  const { data, isFetching, error } = useQuery<WordCloudData>({
    queryKey: ['word-cloud', scope, effectiveId, minFreq, maxFreq, limit, includeLyrics, includeThemes, includeTags],
    queryFn: () => wordCloudApi.getData({
      scope,
      id: effectiveId || undefined,
      minFreq,
      ...(maxFreq > 0 ? { maxFreq } : {}),
      limit,
      includeLyrics,
      includeThemes,
      includeTags,
    }),
    enabled: canQuery,
  });

  const handleWordClick = useCallback((word: CloudWord) => {
    setSelectedWord(word);
    setHighlightWord(word.text);
  }, []);

  const clearHighlight = useCallback(() => {
    setSelectedWord(null);
    setHighlightWord(null);
  }, []);

  function doExport(size: 1080 | 1920) {
    if (!svgRef.current || !data) return;
    const h = size === 1920 ? 1920 : 1080;
    exportSvgAsPng(
      svgRef.current,
      `word-cloud-${data.label.replace(/[^a-z0-9]+/gi, '-')}-${size}x${h}.png`,
      1080, h,
    );
  }

  const rawWords = data?.words ?? [];
  const words = useMemo(() => {
    let filtered = rawWords;
    // Exclude-list (ignore words)
    if (ignoreSet.size > 0)
      filtered = filtered.filter(w => !ignoreSet.has(w.text.toLowerCase()));
    // Include-only (whitelist) — takes precedence if mode is on and list has entries
    if (includeOnlyMode && includeOnlySet.size > 0)
      filtered = filtered.filter(w => includeOnlySet.has(w.text.toLowerCase()));
    return filtered;
  }, [rawWords, ignoreSet, includeOnlyMode, includeOnlySet]);

  async function runSimilarity() {
    if (!simSongId) return;
    setSimLoading(true);
    setSimResult(null);
    try {
      const result = await wordCloudApi.getSimilar({
        songId: simSongId,
        minShared: simMinShared,
        ...(simScope === 'artist' && simBandId ? { bandIds: [simBandId] } : {}),
      });
      setSimResult(result);
    } catch { /* ignore — user sees empty results */ }
    finally { setSimLoading(false); }
  }

  async function runClusters() {
    if (clusterBandIds.length === 0) return;
    setClusterLoading(true);
    setClusterResult(null);
    setClusterExpanded(null);
    setClusterPage(1);
    const excludeList = clusterExcludeWords
      .split(/[\s,]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
    try {
      const result = await wordCloudApi.findClusters({
        bandIds: clusterBandIds,
        minSongs: clusterMinSongs,
        ...(clusterMaxSongs > 0 ? { maxSongs: clusterMaxSongs } : {}),
        minWords: clusterMinWords,
        maxGroupSize: clusterMaxGroup,
        topN: clusterTopN,
        ...(excludeList.length       ? { excludeWords:    excludeList } : {}),
        ...(clusterRequireCrossBand  ? { requireCrossBand:  true }      : {}),
        ...(clusterRequireCrossAlbum ? { requireCrossAlbum: true }      : {}),
      });
      setClusterResult(result);
    } catch { /* ignore */ }
    finally { setClusterLoading(false); }
  }

  async function runLookupFor(word: string, bandIds?: string[]) {
    setLookupWord(word);
    if (bandIds !== undefined) setLookupBandIds(bandIds);
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const result = await wordCloudApi.lookup({
        word,
        ...(bandIds?.length ? { bandIds } : {}),
      });
      setLookupResult(result);
      requestAnimationFrame(() => {
        document.getElementById('lookup-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch { /* ignore */ }
    finally { setLookupLoading(false); }
  }

  async function runLookup() {
    const word = lookupWord.trim();
    if (!word) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const result = await wordCloudApi.lookup({
        word,
        ...(lookupBandIds.length ? { bandIds: lookupBandIds } : {}),
      });
      setLookupResult(result);
    } catch { /* ignore */ }
    finally { setLookupLoading(false); }
  }

  /** Load the shared-words list from a similarity result into the include-only filter,
   *  then switch scope to the seed song so the cloud reflects the seed's vocabulary. */
  function useSharedWords(row: SimilarSong) {
    setIncludeOnlyWords(row.sharedWords.join(', '));
    setIncludeOnlyMode(true);
    // Switch main cloud to seed song scope if not already
    if (simResult && scope !== 'song') {
      setScope('song');
      setScopeId(simResult.seed.id);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-6">

        {/* ── Sidebar ── */}
        <aside className="w-full lg:w-56 lg:shrink-0 space-y-6">
          <div>
            <h1 className="text-sm font-bold text-white uppercase tracking-widest">Word Cloud</h1>
            <p className="text-xs text-surface-500 mt-1">
              Dominant words weighted by lyrics, AI themes, and tags.
            </p>
          </div>

          <ScopeSelector
            scope={scope} setScope={setScope}
            scopeId={scopeId} setScopeId={setScopeId}
            selectedBandIds={selectedBandIds} setSelectedBandIds={setSelectedBandIds}
          />

          <div>
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
              Min frequency: {minFreq}
            </div>
            <input
              type="range" min={1} max={20} value={minFreq}
              onChange={(e) => setMinFreq(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1">
              Max frequency: <span className={maxFreq === 0 ? 'text-surface-600' : 'text-indigo-400'}>
                {maxFreq === 0 ? 'Any' : maxFreq}
              </span>
            </div>
            <input
              type="range" min={0} max={50} value={maxFreq}
              onChange={(e) => setMaxFreq(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <p className="text-xs text-surface-600 mt-0.5 leading-tight">
              {maxFreq > 0
                ? `Only words appearing ≤ ${maxFreq}× — isolates rare/specific words`
                : 'Drag left to isolate rare words'}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Sources</div>
            <div className="space-y-1.5">
              {([
                { key: 'lyrics',  label: 'Lyrics',     val: includeLyrics,  set: setIncludeLyrics },
                { key: 'themes',  label: 'AI Themes',  val: includeThemes,  set: setIncludeThemes },
                { key: 'tags',    label: 'Tags',        val: includeTags,    set: setIncludeTags },
              ] as const).map(({ key, label, val, set }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  <span className={`text-xs transition-colors ${val ? 'text-surface-200' : 'text-surface-600'}`}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
              Max words: {limit}
            </div>
            <input
              type="range" min={20} max={200} step={10} value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
                Ignore words
              </div>
              {ignoreWords.trim() && (
                <button
                  className="text-xs text-surface-500 hover:text-surface-200 transition-colors"
                  onClick={() => setIgnoreWords('')}
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={ignoreWords}
              onChange={(e) => setIgnoreWords(e.target.value)}
              placeholder="the, and, i, it, to…"
              className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white placeholder-surface-600 resize-none focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[10px] text-surface-600 mt-0.5 leading-tight">
              Comma or space separated · not case-sensitive
              {ignoreSet.size > 0 && rawWords.length > words.length && (
                <span className="text-indigo-400"> · {rawWords.length - words.length} hidden</span>
              )}
            </p>
          </div>

          {/* Include-only / whitelist filter */}
          <div>
            <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeOnlyMode}
                onChange={e => setIncludeOnlyMode(e.target.checked)}
                className="accent-indigo-500"
              />
              <span className={`text-xs font-semibold uppercase tracking-wider transition-colors ${includeOnlyMode ? 'text-indigo-400' : 'text-surface-400'}`}>
                Show only these words
              </span>
              {includeOnlyMode && includeOnlySet.size > 0 && (
                <button
                  className="ml-auto text-xs text-surface-500 hover:text-surface-200 transition-colors"
                  onClick={() => setIncludeOnlyWords('')}
                >Clear</button>
              )}
            </label>
            <textarea
              rows={3}
              value={includeOnlyWords}
              onChange={e => setIncludeOnlyWords(e.target.value)}
              placeholder="fear, hope, time, love…"
              disabled={!includeOnlyMode}
              className={`w-full bg-surface-800 border rounded px-2 py-1.5 text-xs text-white placeholder-surface-600 resize-none focus:outline-none transition-colors ${
                includeOnlyMode ? 'border-indigo-600 focus:border-indigo-400' : 'border-surface-700 opacity-50 cursor-not-allowed'
              }`}
            />
            <p className="text-[10px] text-surface-600 mt-0.5 leading-tight">
              {includeOnlyMode && includeOnlySet.size > 0
                ? <span className="text-indigo-400">{includeOnlySet.size} word{includeOnlySet.size !== 1 ? 's' : ''} allowed · {words.length} shown</span>
                : 'Tick the box to whitelist specific words only.'}
            </p>
          </div>

          {data && (
            <div className="text-xs text-surface-500 space-y-0.5">
              <div>{data.words.length} words shown</div>
              <div>{data.uniqueWords} unique tokens</div>
              <div>{data.totalTokens.toLocaleString()} total tokens</div>
            </div>
          )}

          {data && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Export</div>
              <button
                className="w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                onClick={() => doExport(1080)}
              >
                Download 1080×1080
              </button>
              <button
                className="w-full px-3 py-2 bg-surface-700 hover:bg-surface-600 text-xs text-white rounded transition-colors"
                onClick={() => doExport(1920)}
              >
                Download Story 1080×1920
              </button>
              <button
                className="w-full px-3 py-2 bg-cyan-700/60 hover:bg-cyan-600/70 text-xs text-cyan-200 rounded transition-colors font-semibold"
                onClick={() => {
                  const handoff: GuessSongHandoff = {
                    words: words.slice(0, 120).map((w) => ({ text: w.text, weight: w.weight })),
                    label: data.label,
                    scope,
                  };
                  try { sessionStorage.setItem(GUESS_SONG_STORAGE_KEY, JSON.stringify(handoff)); } catch { /* ignore */ }
                  navigate('/guess-the-song');
                }}
              >
                🎯 What's That Song?
              </button>
            </div>
          )}

          {selectedWord && (
            <WordDetail word={selectedWord} onClose={clearHighlight} />
          )}

          {/* ── Song Similarity Finder ── */}
          <div className="border-t border-surface-700 pt-4 space-y-3">
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
              🔍 Find Similar Songs
            </div>
            <p className="text-[10px] text-surface-600 leading-tight">
              Pick a seed song, then find others sharing the most words — great for guessing-game clouds.
            </p>

            {/* Band picker */}
            <select
              className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
              value={simBandId}
              onChange={e => { setSimBandId(e.target.value); setSimSongId(''); setSimResult(null); }}
            >
              <option value="">— pick an artist —</option>
              {(scopes?.bands ?? []).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            {/* Song picker */}
            {simBandId && (
              <select
                className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
                value={simSongId}
                onChange={e => { setSimSongId(e.target.value); setSimResult(null); }}
                disabled={simSongsFetching}
              >
                <option value="">{simSongsFetching ? 'Loading…' : '— pick a song —'}</option>
                {(simBandSongs ?? []).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.album ? `${s.album.title} / ${s.title}` : s.title}
                  </option>
                ))}
              </select>
            )}

            {/* Search scope */}
            <div className="space-y-1">
              <div className="text-[10px] text-surface-500 uppercase tracking-wider">Compare against</div>
              <div className="flex gap-1.5">
                {(['all', 'artist'] as const).map(s => (
                  <button key={s}
                    onClick={() => setSimScope(s)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      simScope === s ? 'bg-indigo-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    {s === 'all' ? 'All artists' : 'Same artist'}
                  </button>
                ))}
              </div>
            </div>

            {/* Min shared words */}
            <div>
              <div className="text-[10px] text-surface-500 mb-1">Min shared words: {simMinShared}</div>
              <input type="range" min={2} max={20} value={simMinShared}
                onChange={e => setSimMinShared(Number(e.target.value))}
                className="w-full accent-indigo-500" />
            </div>

            <button
              onClick={runSimilarity}
              disabled={!simSongId || simLoading}
              className={`w-full py-2 rounded text-xs font-semibold transition-colors ${
                simSongId && !simLoading
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-surface-800 text-surface-600 cursor-not-allowed'
              }`}
            >
              {simLoading ? 'Searching…' : '🔍 Find Similar'}
            </button>

            {simResult && (
              <div className="text-[10px] text-surface-500">
                {simResult.similar.length} song{simResult.similar.length !== 1 ? 's' : ''} found
                {' '}sharing ≥ {simMinShared} words with <span className="text-indigo-300">{simResult.seed.title}</span>
              </div>
            )}
          </div>

          {/* ── Word Lookup ── */}
          <div className="border-t border-surface-700 pt-4 space-y-3">
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
              🔎 Word Lookup
            </div>
            <p className="text-[10px] text-surface-600 leading-tight">
              Find every song that contains a word — no cloud needed.
            </p>

            {/* Artist filter */}
            {(scopes?.bands ?? []).length > 1 && (
              <div>
                <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Filter by artist</div>
                <div className="space-y-0.5 max-h-28 overflow-y-auto">
                  {(scopes?.bands ?? []).map((b) => (
                    <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={lookupBandIds.includes(b.id)}
                        onChange={() =>
                          setLookupBandIds((prev) =>
                            prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id],
                          )
                        }
                        className="accent-indigo-500"
                      />
                      <span className={`text-xs transition-colors ${lookupBandIds.includes(b.id) ? 'text-white' : 'text-surface-400 group-hover:text-surface-200'}`}>
                        {b.name}
                      </span>
                    </label>
                  ))}
                </div>
                {lookupBandIds.length > 0 && (
                  <button
                    className="text-[10px] text-surface-500 hover:text-surface-200 transition-colors mt-1"
                    onClick={() => setLookupBandIds([])}
                  >Clear filter</button>
                )}
              </div>
            )}

            {/* Word input */}
            <input
              type="text"
              value={lookupWord}
              onChange={(e) => setLookupWord(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runLookup(); }}
              placeholder="e.g. sky"
              className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-indigo-500"
            />

            <button
              onClick={runLookup}
              disabled={!lookupWord.trim() || lookupLoading}
              className={`w-full py-2 rounded text-xs font-semibold transition-colors ${
                lookupWord.trim() && !lookupLoading
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-surface-800 text-surface-600 cursor-not-allowed'
              }`}
            >
              {lookupLoading ? 'Searching…' : '🔎 Find songs'}
            </button>

            {lookupResult && (
              <div className="text-[10px] text-surface-500">
                {lookupResult.songs.length === 0
                  ? <span className="text-red-400">No songs found for "{lookupResult.word}"</span>
                  : <><span className="text-indigo-300">{lookupResult.songs.length}</span> song{lookupResult.songs.length !== 1 ? 's' : ''} contain "{lookupResult.word}"</>
                }
              </div>
            )}
          </div>

          {/* ── Word Clusters ── */}
          <div className="border-t border-surface-700 pt-4 space-y-3">
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
              🧩 Word Clusters
            </div>
            <p className="text-[10px] text-surface-600 leading-tight">
              Find groups of words that appear together across multiple songs — e.g. "these 4 words appear in 6 songs".
            </p>

            {/* Artist picker */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] text-surface-500 uppercase tracking-wider">Artists (required)</div>
                {clusterBandIds.length > 0 && (
                  <button className="text-[10px] text-surface-500 hover:text-surface-200" onClick={() => setClusterBandIds([])}>Clear</button>
                )}
              </div>
              <div className="space-y-0.5 max-h-28 overflow-y-auto">
                {(scopes?.bands ?? []).map((b) => (
                  <label key={b.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={clusterBandIds.includes(b.id)}
                      onChange={() =>
                        setClusterBandIds((prev) =>
                          prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id],
                        )
                      }
                      className="accent-indigo-500"
                    />
                    <span className={`text-xs transition-colors ${clusterBandIds.includes(b.id) ? 'text-white' : 'text-surface-400 group-hover:text-surface-200'}`}>
                      {b.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Min songs */}
            <div>
              <div className="flex justify-between text-[10px] text-surface-500 mb-1">
                <span>Min songs per group</span>
                <span className="font-mono text-indigo-400">{clusterMinSongs}</span>
              </div>
              <input type="range" min={2} max={15} value={clusterMinSongs}
                onChange={(e) => setClusterMinSongs(Number(e.target.value))}
                className="w-full accent-indigo-500" />
            </div>

            {/* Max songs */}
            <div>
              <div className="flex justify-between text-[10px] text-surface-500 mb-1">
                <span>Max songs per group</span>
                <span className={`font-mono ${clusterMaxSongs === 0 ? 'text-surface-600' : 'text-indigo-400'}`}>
                  {clusterMaxSongs === 0 ? 'Any' : clusterMaxSongs}
                </span>
              </div>
              <input type="range" min={0} max={30} value={clusterMaxSongs}
                onChange={(e) => setClusterMaxSongs(Number(e.target.value))}
                className="w-full accent-indigo-500" />
              <p className="text-[10px] text-surface-600 mt-0.5 leading-tight">
                {clusterMaxSongs > 0 ? `Hides groups found in more than ${clusterMaxSongs} songs` : 'Drag left to hide too-common groups'}
              </p>
            </div>

            {/* Min words */}
            <div>
              <div className="flex justify-between text-[10px] text-surface-500 mb-1">
                <span>Min words per group</span>
                <span className="font-mono text-indigo-400">{clusterMinWords}</span>
              </div>
              <input type="range" min={2} max={5} value={clusterMinWords}
                onChange={(e) => setClusterMinWords(Number(e.target.value))}
                className="w-full accent-indigo-500" />
            </div>

            {/* Max group size */}
            <div>
              <div className="flex justify-between text-[10px] text-surface-500 mb-1">
                <span>Max words per group</span>
                <span className="font-mono text-indigo-400">{clusterMaxGroup}</span>
              </div>
              <input type="range" min={2} max={8} value={clusterMaxGroup}
                onChange={(e) => setClusterMaxGroup(Number(e.target.value))}
                className="w-full accent-indigo-500" />
              {clusterMaxGroup > 5 && (
                <p className="text-[10px] text-amber-600 mt-0.5 leading-tight">
                  High values with low min-songs can be slow — keep min-songs ≥ 4 for best results.
                </p>
              )}
            </div>

            {/* Top N */}
            <div>
              <div className="flex justify-between text-[10px] text-surface-500 mb-1">
                <span>Max results</span>
                <span className="font-mono text-indigo-400">{clusterTopN}</span>
              </div>
              <input type="range" min={10} max={100} step={5} value={clusterTopN}
                onChange={(e) => setClusterTopN(Number(e.target.value))}
                className="w-full accent-indigo-500" />
            </div>

            {/* Exclude words from candidates */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] text-surface-500 uppercase tracking-wider">Exclude words</div>
                {clusterExcludeWords.trim() && (
                  <button className="text-[10px] text-surface-500 hover:text-surface-200" onClick={() => setClusterExcludeWords('')}>Clear</button>
                )}
              </div>
              <textarea
                rows={2}
                value={clusterExcludeWords}
                onChange={(e) => setClusterExcludeWords(e.target.value)}
                placeholder="fear, time, life…"
                className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white placeholder-surface-600 resize-none focus:outline-none focus:border-red-600"
              />
              <p className="text-[10px] text-surface-600 mt-0.5 leading-tight">
                These words are excluded from the candidate pool — requires re-run
              </p>
            </div>

            {/* Diversity checkboxes */}
            <div className="space-y-2">
              <div className="text-[10px] text-surface-500 uppercase tracking-wider">Diversity</div>
              <label className="flex items-start gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={clusterRequireCrossBand}
                  onChange={(e) => setClusterRequireCrossBand(e.target.checked)}
                  className="accent-indigo-500 mt-0.5"
                />
                <span className="text-[11px] text-surface-400 group-hover:text-surface-200 leading-tight transition-colors">
                  No two songs from the same band
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={clusterRequireCrossAlbum}
                  onChange={(e) => setClusterRequireCrossAlbum(e.target.checked)}
                  className="accent-indigo-500 mt-0.5"
                />
                <span className="text-[11px] text-surface-400 group-hover:text-surface-200 leading-tight transition-colors">
                  No two songs from the same album
                </span>
              </label>
              {(clusterRequireCrossBand || clusterRequireCrossAlbum) && (
                <p className="text-[10px] text-indigo-400/70 leading-tight">
                  Each matched song must come from a different {clusterRequireCrossBand && clusterRequireCrossAlbum ? 'band and album' : clusterRequireCrossBand ? 'band' : 'album'}.
                </p>
              )}
            </div>

            <button
              onClick={runClusters}
              disabled={clusterBandIds.length === 0 || clusterLoading}
              className={`w-full py-2 rounded text-xs font-semibold transition-colors ${
                clusterBandIds.length > 0 && !clusterLoading
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-surface-800 text-surface-600 cursor-not-allowed'
              }`}
            >
              {clusterLoading ? 'Searching…' : '🧩 Find Clusters'}
            </button>

            {clusterBandIds.length > 0 && (
              <button
                onClick={() => {
                  pushCinemaHandoff({
                    label: `Word Cloud · ${clusterBandIds.length} artist${clusterBandIds.length !== 1 ? 's' : ''}`,
                    bandIds: clusterBandIds,
                    preset: 'lyrical-dna',
                  });
                  navigate('/cinema');
                }}
                className="w-full py-1.5 rounded text-[10px] font-medium bg-violet-900/60 hover:bg-violet-800/70 text-violet-300 transition-colors"
              >
                🧬 Lyrical DNA in Cinema
              </button>
            )}

            {clusterResult && (
              <div className="text-[10px] text-surface-500 space-y-0.5">
                <div>
                  {clusterResult.clusters.length === 0
                    ? <span className="text-red-400">No clusters found — try lowering "Min songs"</span>
                    : <><span className="text-indigo-300">{clusterResult.clusters.length}</span> cluster{clusterResult.clusters.length !== 1 ? 's' : ''} found</>
                  }
                </div>
                <div>{clusterResult.totalSongs} songs · {clusterResult.candidateWords} candidate words</div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 min-w-0">
          {data?.label && (
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-surface-300">{data.label}</h2>
              {highlightWord && (
                <button
                  onClick={clearHighlight}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Clear highlight
                </button>
              )}
            </div>
          )}

          {!canQuery && (
            <div className="flex items-center justify-center h-96 text-surface-500 text-sm">
              {scope === 'artist'
                ? 'Select one or more artists to build the cloud.'
                : `Select a ${scope} to see the word cloud.`}
            </div>
          )}

          {isFetching && (
            <div className="flex items-center justify-center h-96">
              <div className="flex gap-1.5">
                {[0,1,2].map((i) => (
                  <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm p-4">{String(error)}</div>
          )}

          {!isFetching && canQuery && !words.length && data && (
            <div className="flex items-center justify-center h-96 text-surface-500 text-sm">
              No words found. Try lowering min frequency or choosing a larger scope.
            </div>
          )}

          {!isFetching && words.length > 0 && (
            <div className="flex justify-center">
              <WordCloudSvg
                words={words}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                onWordClick={handleWordClick}
                highlightWord={highlightWord}
                svgRef={svgRef}
              />
            </div>
          )}

          {!isFetching && words.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <div className="text-xs text-surface-600 text-center">
                Click any word to see which songs contain it. Sized by{' '}
                {[includeLyrics && 'lyric frequency', includeThemes && 'AI theme strength', includeTags && 'tag weight']
                  .filter(Boolean).join(' + ') || 'combined score'}.
              </div>
              {selectedBandIds.length > 0 && (
                <button
                  onClick={() => {
                    pushCinemaHandoff({
                      label: `Word Cloud · ${selectedBandIds.length} artist${selectedBandIds.length !== 1 ? 's' : ''}`,
                      bandIds: selectedBandIds,
                      preset: 'lyrical-dna',
                    });
                    navigate('/cinema');
                  }}
                  className="shrink-0 text-[10px] bg-violet-900/60 hover:bg-violet-800/70 text-violet-300 rounded px-3 py-1.5 transition-colors whitespace-nowrap"
                >
                  🧬 Lyrical DNA
                </button>
              )}
            </div>
          )}

          {/* ── Similarity Results ── */}
          {simResult && simResult.similar.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  Songs most similar to <span className="text-indigo-400">{simResult.seed.title}</span>
                  <span className="ml-2 text-xs font-normal text-surface-500">by shared vocabulary</span>
                </h3>
                <button
                  onClick={() => setSimResult(null)}
                  className="text-xs text-surface-600 hover:text-surface-300 transition-colors"
                >✕ Close</button>
              </div>

              <div className="space-y-2">
                {simResult.similar.map((row) => (
                  <div key={row.song.id}
                    className="bg-surface-900 border border-surface-800 rounded-lg overflow-hidden"
                  >
                    {/* Summary row */}
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      {/* Shared count badge */}
                      <div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-900/60 flex flex-col items-center justify-center">
                        <span className="text-sm font-bold text-indigo-300 leading-none">{row.sharedCount}</span>
                        <span className="text-[8px] text-indigo-500 leading-none mt-0.5">words</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{row.song.title}</div>
                        <div className="text-xs text-surface-500">
                          {row.song.band}
                          {row.song.albumTitle && <span className="ml-1">· {row.song.albumTitle}</span>}
                          <span className="ml-2 text-surface-600">
                            {row.sharedCount}/{row.seedWordCount} seed words · {row.targetWordCount} target words
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => useSharedWords(row)}
                          className="text-[10px] bg-indigo-700/60 hover:bg-indigo-600/70 text-indigo-200 px-2 py-1 rounded transition-colors"
                          title="Load shared words into the Include-only filter and build the cloud"
                        >
                          ☁ Build cloud
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(row.sharedWords.join(', '));
                          }}
                          className="text-[10px] bg-surface-700 hover:bg-surface-600 text-surface-300 px-2 py-1 rounded transition-colors"
                          title="Copy shared words to clipboard"
                        >
                          ⧉ Copy
                        </button>
                        <button
                          onClick={() => setSimExpanded(simExpanded === row.song.id ? null : row.song.id)}
                          className="text-[10px] text-surface-600 hover:text-surface-300 px-1 py-1 transition-colors"
                          title="Show all shared words"
                        >
                          {simExpanded === row.song.id ? '▲' : '▼'}
                        </button>
                      </div>
                    </div>

                    {/* Shared word chips (first 10 in collapsed, all when expanded) */}
                    <div className="px-4 pb-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(simExpanded === row.song.id ? row.sharedWords : row.sharedWords.slice(0, 12)).map(w => (
                          <span key={w}
                            className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 rounded px-1.5 py-0.5 cursor-pointer hover:bg-indigo-800/40 transition-colors"
                            onClick={() => setHighlightWord(highlightWord === w ? null : w)}
                            title="Click to highlight in cloud"
                          >
                            {w}
                          </span>
                        ))}
                        {simExpanded !== row.song.id && row.sharedWords.length > 12 && (
                          <span className="text-[10px] text-surface-600">+{row.sharedWords.length - 12} more</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {simResult && simResult.similar.length === 0 && (
            <div className="mt-8 text-center text-surface-500 text-sm py-8 border border-surface-800 rounded-lg">
              No songs found sharing ≥ {simMinShared} words with <span className="text-indigo-400">{simResult.seed.title}</span>.
              <br/><span className="text-xs text-surface-600 mt-1 block">Try lowering "Min shared words" or switching scope to "All artists".</span>
            </div>
          )}

          {/* ── Word Lookup Results ── */}
          {lookupResult && lookupResult.songs.length > 0 && (
            <div id="lookup-results" className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  Songs containing{' '}
                  <span className="text-indigo-400 font-mono">"{lookupResult.word}"</span>
                  <span className="ml-2 text-xs font-normal text-surface-500">
                    {lookupResult.songs.length} result{lookupResult.songs.length !== 1 ? 's' : ''}
                    {lookupBandIds.length > 0 && ' (filtered by artist)'}
                  </span>
                </h3>
                <button
                  onClick={() => setLookupResult(null)}
                  className="text-xs text-surface-600 hover:text-surface-300 transition-colors"
                >✕ Close</button>
              </div>

              {/* Group by band */}
              {(() => {
                const byBand = new Map<string, typeof lookupResult.songs>();
                for (const s of lookupResult.songs) {
                  const list = byBand.get(s.band) ?? [];
                  list.push(s);
                  byBand.set(s.band, list);
                }
                return [...byBand.entries()].map(([band, songs]) => (
                  <div key={band} className="mb-4">
                    <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">{band}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {songs.map((s) => (
                        <div
                          key={s.id}
                          className="bg-surface-900 border border-surface-800 rounded px-3 py-2 text-xs"
                        >
                          <div className="text-white font-medium truncate">{s.title}</div>
                          {s.albumTitle && (
                            <div className="text-surface-500 truncate mt-0.5">{s.albumTitle}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* ── Word Cluster Results ── */}
          {clusterResult && clusterResult.clusters.length > 0 && (
            <div className="mt-8">
              {/* Header: title + sort + close */}
              <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Word Clusters
                    <span className="ml-2 text-xs font-normal text-surface-500">
                      {sortedClusters.length !== clusterResult.clusters.length
                        ? `${sortedClusters.length} of ${clusterResult.clusters.length} groups`
                        : `${clusterResult.clusters.length} groups`}
                      {' · '}{clusterResult.totalSongs} songs
                    </span>
                  </h3>
                  <p className="text-[10px] text-surface-600 mt-0.5">
                    ☁ generates cloud · word chip looks it up · song row opens its cloud
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <span className="text-[10px] text-surface-500">Sort:</span>
                  {(['score', 'songs', 'words'] as const).map((s) => (
                    <button key={s}
                      onClick={() => { setClusterSortBy(s); setClusterPage(1); }}
                      className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                        clusterSortBy === s
                          ? 'bg-indigo-600 text-white'
                          : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                      }`}
                    >
                      {s === 'score' ? '★ Score' : s === 'songs' ? '♫ Songs' : '# Words'}
                    </button>
                  ))}
                  <button onClick={() => setClusterResult(null)} className="text-xs text-surface-600 hover:text-surface-300 transition-colors ml-1">✕</button>
                </div>
              </div>

              {/* Client-side result filters */}
              <div className="flex gap-2 mb-3 flex-wrap">
                <div className="flex-1 min-w-32">
                  <input
                    type="text"
                    value={clusterFilterMustHave}
                    onChange={(e) => { setClusterFilterMustHave(e.target.value); setClusterPage(1); }}
                    placeholder="Must include word…"
                    className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-indigo-500"
                    title="Only show clusters that contain this word"
                  />
                </div>
                <div className="flex-1 min-w-32">
                  <input
                    type="text"
                    value={clusterFilterExclude}
                    onChange={(e) => { setClusterFilterExclude(e.target.value); setClusterPage(1); }}
                    placeholder="Hide clusters with word…"
                    className="w-full bg-surface-800 border border-red-900/50 rounded px-2 py-1.5 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-red-600"
                    title="Hide any cluster that contains this word (comma-separated)"
                  />
                </div>
                {(clusterFilterMustHave || clusterFilterExclude) && (
                  <button
                    onClick={() => { setClusterFilterMustHave(''); setClusterFilterExclude(''); setClusterPage(1); }}
                    className="text-[10px] text-surface-500 hover:text-surface-200 transition-colors px-1"
                  >Clear filters</button>
                )}
              </div>

              {/* Cluster list */}
              {sortedClusters.length === 0 ? (
                <div className="text-center text-surface-500 text-sm py-8 border border-surface-800 rounded-lg">
                  No clusters match your filters.
                </div>
              ) : (
                <div className="space-y-2">
                  {paginatedClusters.map((cluster) => {
                    const clusterKey = cluster.words.join('|');
                    return (
                      <div key={clusterKey} className="bg-surface-900 border border-surface-800 rounded-lg overflow-hidden">
                        {/* Header row */}
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          {/* Song count badge */}
                          <div className="shrink-0 w-12 h-10 rounded-lg bg-indigo-900/60 flex flex-col items-center justify-center">
                            <span className="text-sm font-bold text-indigo-300 leading-none">{cluster.songCount}</span>
                            <span className="text-[8px] text-indigo-500 leading-none mt-0.5">songs</span>
                          </div>

                          {/* Word chips — click to look up that word */}
                          <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                            {cluster.words.map((w) => (
                              <span
                                key={w}
                                className="text-xs bg-indigo-800/50 text-indigo-200 border border-indigo-700/40 rounded px-2 py-0.5 cursor-pointer hover:bg-indigo-600/60 transition-colors"
                                onClick={() => runLookupFor(w, clusterBandIds.length ? clusterBandIds : undefined)}
                                title="Click to look up which songs contain this word"
                              >
                                {w}
                              </span>
                            ))}
                            <span className="text-[10px] text-surface-600 self-center">
                              {cluster.wordCount} word{cluster.wordCount !== 1 ? 's' : ''} · score {cluster.score}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => {
                                setScope('artist');
                                setSelectedBandIds(clusterBandIds);
                                setIncludeOnlyWords(cluster.words.join(', '));
                                setIncludeOnlyMode(true);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="text-[10px] bg-indigo-700/60 hover:bg-indigo-600/70 text-indigo-200 px-2 py-1 rounded transition-colors"
                              title="Generate word cloud for these words across the selected artists"
                            >
                              ☁ Cloud
                            </button>
                            <button
                              onClick={() => navigator.clipboard?.writeText(cluster.words.join(', '))}
                              className="text-[10px] bg-surface-700 hover:bg-surface-600 text-surface-300 px-2 py-1 rounded transition-colors"
                              title="Copy words to clipboard"
                            >
                              ⧉ Copy
                            </button>
                            <button
                              onClick={() => setClusterExpanded(clusterExpanded === clusterKey ? null : clusterKey)}
                              className="text-[10px] text-surface-600 hover:text-surface-300 px-1 py-1 transition-colors"
                              title="Show songs"
                            >
                              {clusterExpanded === clusterKey ? '▲' : '▼'}
                            </button>
                          </div>
                        </div>

                        {/* Songs (expanded) — click a song to view its cloud */}
                        {clusterExpanded === clusterKey && (
                          <div className="px-4 pb-3 border-t border-surface-800">
                            <p className="mt-2 mb-1.5 text-[10px] text-surface-600">
                              Click a song to view its word cloud with the cluster words highlighted.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {cluster.songs.map((s) => (
                                <div
                                  key={s.id}
                                  className="text-xs text-surface-300 cursor-pointer hover:text-white hover:bg-surface-800/60 rounded px-1.5 py-1 transition-colors"
                                  onClick={() => {
                                    setScope('song');
                                    setScopeId(s.id);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  title="Click to view this song's word cloud"
                                >
                                  <span className="text-surface-500">{s.band}</span>
                                  {' — '}{s.title}
                                  {s.albumTitle && <span className="text-surface-600"> ({s.albumTitle})</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {clusterTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-surface-800">
                  <button
                    onClick={() => setClusterPage((p) => Math.max(1, p - 1))}
                    disabled={clusterPage === 1}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      clusterPage === 1
                        ? 'text-surface-700 cursor-not-allowed'
                        : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                    }`}
                  >
                    ← Prev
                  </button>
                  <div className="text-xs text-surface-500">
                    Page {clusterPage} of {clusterTotalPages}
                    <span className="ml-2 text-surface-600">
                      ({(clusterPage - 1) * CLUSTERS_PER_PAGE + 1}–{Math.min(clusterPage * CLUSTERS_PER_PAGE, sortedClusters.length)} of {sortedClusters.length})
                    </span>
                  </div>
                  <button
                    onClick={() => setClusterPage((p) => Math.min(clusterTotalPages, p + 1))}
                    disabled={clusterPage === clusterTotalPages}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      clusterPage === clusterTotalPages
                        ? 'text-surface-700 cursor-not-allowed'
                        : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                    }`}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <SocialChatPanel songLabel={data ? `Word Cloud: ${data.label}` : 'Word Cloud'} />
    </div>
  );
}

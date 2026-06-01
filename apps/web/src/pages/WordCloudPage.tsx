import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { wordCloudApi, type CloudWord, type WordCloudData } from '../api/wordCloud';
import SocialChatPanel from '../components/social/SocialChatPanel';

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
  const svgRef = useRef<SVGSVGElement>(null);

  // Case-insensitive set of words to exclude from display
  const ignoreSet = useMemo(() => new Set(
    ignoreWords.split(/[\s,]+/).map(w => w.trim().toLowerCase()).filter(Boolean),
  ), [ignoreWords]);

  // Derive effective id and canQuery based on scope
  const effectiveId = scope === 'artist' ? selectedBandIds.join(',') : scopeId;
  const canQuery =
    scope === 'universe' ||
    (scope === 'artist' && selectedBandIds.length > 0) ||
    (scope !== 'artist' && !!scopeId);

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
  const words = useMemo(
    () => ignoreSet.size > 0
      ? rawWords.filter(w => !ignoreSet.has(w.text.toLowerCase()))
      : rawWords,
    [rawWords, ignoreSet],
  );

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
                <span className="text-indigo-400"> · {rawWords.length - words.length} word{rawWords.length - words.length !== 1 ? 's' : ''} hidden</span>
              )}
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
            </div>
          )}

          {selectedWord && (
            <WordDetail word={selectedWord} onClose={clearHighlight} />
          )}
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
            <div className="mt-4 text-xs text-surface-600 text-center">
              Click any word to see which songs contain it. Sized by{' '}
              {[includeLyrics && 'lyric frequency', includeThemes && 'AI theme strength', includeTags && 'tag weight']
                .filter(Boolean).join(' + ') || 'combined score'}.
            </div>
          )}
        </main>
      </div>

      <SocialChatPanel songLabel={data ? `Word Cloud: ${data.label}` : 'Word Cloud'} />
    </div>
  );
}

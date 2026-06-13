import { useState, useEffect, useCallback, useMemo } from 'react';
import { wordCloudApi } from '../api/wordCloud';
import { lyricLabApi } from '../api/lyricLab';
import type {
  LyricLabResult,
  LyricLabScope,
  LyricLabWord,
} from '@band-spectrum-mapper/shared';
import type { CloudScopes, BandSong } from '../api/wordCloud';

// ---------------------------------------------------------------------------
// Canvas word cloud renderer
// ---------------------------------------------------------------------------

const WORD_HUES = [210, 35, 160, 290, 10, 55, 180, 320, 100, 250, 0, 140, 270, 70, 190];

function renderWordCloud(canvas: HTMLCanvasElement, words: LyricLabWord[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);

  if (!words.length) {
    ctx.fillStyle = '#475569';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No words to display', W / 2, H / 2);
    return;
  }

  const maxCount = words[0]?.count ?? 1;
  const minCount = words[words.length - 1]?.count ?? 1;
  const ratio = W / 600;
  const MIN_SIZE = 10 * ratio;
  const MAX_SIZE = 52 * ratio;

  const sizeFor = (count: number): number => {
    if (maxCount === minCount) return (MIN_SIZE + MAX_SIZE) / 2;
    return MIN_SIZE + ((count - minCount) / (maxCount - minCount)) * (MAX_SIZE - MIN_SIZE);
  };

  type Rect = { x: number; y: number; w: number; h: number };
  const placed: Rect[] = [];
  const cx = W / 2;
  const cy = H / 2;

  const hitTest = (r: Rect): boolean =>
    placed.some(
      (p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y,
    );

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const fontSize = sizeFor(word.count);
    const bold = i < 6 ? 'bold ' : '';
    ctx.font = `${bold}${Math.round(fontSize)}px system-ui, sans-serif`;
    const tw = ctx.measureText(word.text).width + 3 * ratio;
    const th = fontSize * 1.25;

    let rx = cx;
    let ry = cy;
    let found = false;

    for (let t = 0; t < 900; t++) {
      const angle = t * 0.23;
      const r = t * 0.85 * ratio;
      const tx = cx + r * Math.cos(angle) - tw / 2;
      const ty = cy + r * Math.sin(angle) - th / 2;

      if (tx < 2 || ty < 2 || tx + tw > W - 2 || ty + th > H - 2) continue;

      const candidate: Rect = { x: tx, y: ty, w: tw, h: th };
      if (!hitTest(candidate)) {
        rx = tx + tw / 2;
        ry = ty + th / 2;
        placed.push(candidate);
        found = true;
        break;
      }
    }

    if (!found) continue;

    const hue = WORD_HUES[i % WORD_HUES.length]!;
    const sat = i < 4 ? 85 : 65;
    const lit = i < 4 ? 72 : 60;
    ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(word.text, rx, ry);
  }
}

// ---------------------------------------------------------------------------
// Download helper — renders at 2x resolution from stored displayed words
// ---------------------------------------------------------------------------

type TaggedCanvas = HTMLCanvasElement & { __displayed?: LyricLabWord[] };

function downloadCanvas(canvas: TaggedCanvas, filename: string): void {
  const out = document.createElement('canvas');
  out.width = 1200;
  out.height = 760;
  renderWordCloud(out, canvas.__displayed ?? []);
  const link = document.createElement('a');
  link.href = out.toDataURL('image/png');
  link.download = filename;
  link.click();
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

interface CardProps {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  words: LyricLabWord[];
  applyFilters: (words: LyricLabWord[]) => LyricLabWord[];
  sortOrder: 'common' | 'rarest';
  totalTokens: number;
  uniqueWords: number;
  sharedWords?: string[];
  registerCanvas: (id: string, el: HTMLCanvasElement | null) => void;
}

function WordCloudCard({
  id,
  title,
  subtitle,
  badge,
  words,
  applyFilters,
  sortOrder,
  totalTokens,
  uniqueWords,
  sharedWords,
  registerCanvas,
}: CardProps) {
  const canvasRef = useCallback(
    (el: HTMLCanvasElement | null) => registerCanvas(id, el),
    [id, registerCanvas],
  );

  const displayed = applyFilters(words);
  const firstCol = displayed.slice(0, 8);
  const lastCol = displayed.length > 1 ? [...displayed].slice(-8).reverse() : [];

  const firstLabel = sortOrder === 'common' ? 'Most common' : 'Rarest';
  const lastLabel = sortOrder === 'common' ? 'Rarest' : 'Most common';

  return (
    <div className="bg-white border border-surface-200 rounded-lg overflow-hidden flex flex-col shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-900 truncate">{title}</p>
          {subtitle && <p className="text-xs text-surface-500 truncate">{subtitle}</p>}
        </div>
        {badge && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
            {badge}
          </span>
        )}
      </div>

      {/* Canvas */}
      <div className="relative bg-slate-900">
        <canvas
          ref={canvasRef}
          width={600}
          height={380}
          className="w-full"
          style={{ display: 'block' }}
        />
      </div>

      {/* Stats + word lists */}
      <div className="px-4 py-3 space-y-2 flex-1">
        <div className="flex gap-4 text-xs text-surface-500">
          <span>{displayed.length} shown</span>
          <span>{totalTokens.toLocaleString()} tokens</span>
          <span>{uniqueWords.toLocaleString()} unique</span>
        </div>

        {displayed.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="font-semibold text-surface-600 mb-1">{firstLabel}</p>
              <ol className="space-y-0.5">
                {firstCol.map((w) => (
                  <li key={w.text} className="flex justify-between gap-1">
                    <span className="text-surface-800 truncate">{w.text}</span>
                    <span className="text-surface-400 shrink-0">{w.count}×</span>
                  </li>
                ))}
              </ol>
            </div>
            {lastCol.length > 0 && (
              <div>
                <p className="font-semibold text-surface-600 mb-1">{lastLabel}</p>
                <ol className="space-y-0.5">
                  {lastCol.map((w) => (
                    <li key={w.text} className="flex justify-between gap-1">
                      <span className="text-surface-800 truncate">{w.text}</span>
                      <span className="text-surface-400 shrink-0">{w.count}×</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {displayed.length === 0 && (
          <p className="text-xs text-surface-400 italic">No words match current filters</p>
        )}

        {sharedWords && sharedWords.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-surface-600 mb-1">Shared across songs</p>
            <p className="text-xs text-surface-500 leading-relaxed">
              {sharedWords.slice(0, 15).join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Download button */}
      <div className="px-4 pb-3">
        <button
          onClick={() => {
            const canvas = canvasMap.current.get(id);
            if (canvas) downloadCanvas(canvas, `${title.replace(/[^a-z0-9]/gi, '_')}.png`);
          }}
          className="w-full text-xs py-1.5 px-3 rounded border border-surface-200 text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
        >
          Download PNG
        </button>
      </div>
    </div>
  );
}

// module-level ref so WordCloudCard download button can access it
const canvasMap = { current: new Map<string, HTMLCanvasElement>() };

// ---------------------------------------------------------------------------
// Album section wrapper
// ---------------------------------------------------------------------------

function AlbumSection({ albumTitle, children }: { albumTitle: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-3 mt-6 pb-1 border-b border-surface-200">
        {albumTitle || 'Uncategorised'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LyricLabPage() {
  const [scopes, setScopes] = useState<CloudScopes | null>(null);
  const [songs, setSongs] = useState<BandSong[]>([]);

  const [bandId, setBandId] = useState('');
  const [scope, setScope] = useState<LyricLabScope>('discography');
  const [albumId, setAlbumId] = useState('');
  const [songId, setSongId] = useState('');

  // Display controls
  const [displayCount, setDisplayCount] = useState(100);
  const [sortOrder, setSortOrder] = useState<'common' | 'rarest'>('common');
  const [excludeInput, setExcludeInput] = useState('');
  const [includeInput, setIncludeInput] = useState('');

  // Debounced committed filter state (text inputs)
  const [committed, setCommitted] = useState({ exclude: '', include: '' });
  useEffect(() => {
    const t = setTimeout(() => setCommitted({ exclude: excludeInput, include: includeInput }), 400);
    return () => clearTimeout(t);
  }, [excludeInput, includeInput]);

  const excludeSet = useMemo(
    () => new Set(committed.exclude.toLowerCase().split(/[\s,]+/).filter(Boolean)),
    [committed.exclude],
  );
  const includeSet = useMemo(
    () => new Set(committed.include.toLowerCase().split(/[\s,]+/).filter(Boolean)),
    [committed.include],
  );

  const applyFilters = useCallback(
    (words: LyricLabWord[]): LyricLabWord[] => {
      let out = words;
      if (excludeSet.size > 0) out = out.filter((w) => !excludeSet.has(w.text.toLowerCase()));
      if (includeSet.size > 0) out = out.filter((w) => includeSet.has(w.text.toLowerCase()));
      if (sortOrder === 'rarest') out = [...out].reverse();
      return out.slice(0, displayCount);
    },
    [excludeSet, includeSet, sortOrder, displayCount],
  );

  const [result, setResult] = useState<LyricLabResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Re-render all canvases whenever filters/sort/count change
  useEffect(() => {
    if (!result) return;
    const raf = requestAnimationFrame(() => {
      for (const [id, canvas] of canvasMap.current) {
        let rawWords: LyricLabWord[] = [];
        if (id === 'global') rawWords = result.globalAggregate?.words ?? [];
        else if (id.startsWith('album-')) {
          rawWords = result.albumAggregates.find((a) => a.albumId === id.slice(6))?.words ?? [];
        } else {
          rawWords = result.songs.find((s) => s.songId === id)?.words ?? [];
        }
        const displayed = applyFilters(rawWords);
        (canvas as TaggedCanvas).__displayed = displayed;
        renderWordCloud(canvas, displayed);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [result, applyFilters]);

  const registerCanvas = useCallback((id: string, el: HTMLCanvasElement | null) => {
    if (el) canvasMap.current.set(id, el);
    else canvasMap.current.delete(id);
  }, []);

  useEffect(() => {
    wordCloudApi.getScopes().then(setScopes).catch(() => null);
  }, []);

  useEffect(() => {
    if (scope === 'song' && bandId) {
      wordCloudApi.getSongsByBand(bandId).then(setSongs).catch(() => setSongs([]));
    } else {
      setSongs([]);
    }
    setSongId('');
    setAlbumId('');
  }, [bandId, scope]);

  const filteredAlbums = scopes?.albums.filter((a) => a.band.id === bandId) ?? [];

  async function generate() {
    if (!bandId && scope !== 'song') { setError('Please select a band first.'); return; }
    if (scope === 'album' && !albumId) { setError('Please select an album.'); return; }
    if (scope === 'song' && !songId) { setError('Please select a song.'); return; }

    setLoading(true);
    setError(null);
    setResult(null);
    canvasMap.current.clear();

    try {
      const data = await lyricLabApi.batch({
        scope,
        ...(bandId ? { bandId } : {}),
        ...(scope === 'album' && albumId ? { albumId } : {}),
        ...(scope === 'song' && songId ? { songId } : {}),
        maxWords: 150, // always fetch full set; display count is client-side
      });
      setResult(data);
    } catch (e: unknown) {
      setError(`Analysis failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  async function downloadAll() {
    if (!result) return;
    setDownloading(true);
    const entries = [...canvasMap.current.entries()];
    let i = 0;
    for (const [id, canvas] of entries) {
      let label = id;
      if (id === 'global') label = `${result.bandName}_Discography`;
      else if (id.startsWith('album-')) {
        const agg = result.albumAggregates.find((a) => a.albumId === id.slice(6));
        label = `${result.bandName}_${agg?.albumTitle ?? id}_ALBUM`;
      } else {
        const song = result.songs.find((s) => s.songId === id);
        label = `${song?.albumTitle ?? ''}_${song?.songTitle ?? id}`;
      }
      await new Promise<void>((resolve) => {
        setTimeout(() => { downloadCanvas(canvas, `${label.replace(/[^a-z0-9]/gi, '_')}.png`); resolve(); }, i * 350);
      });
      i++;
    }
    setDownloading(false);
  }

  const totalCards = result
    ? (result.globalAggregate ? 1 : 0) +
      result.albumAggregates.filter((a) => a.songCount > 1).length +
      result.songs.length
    : 0;

  // Build ordered card list
  type CardEntry =
    | { kind: 'global' }
    | { kind: 'albumSection'; albumId: string; albumTitle: string }
    | { kind: 'albumAggregate'; albumId: string }
    | { kind: 'song'; songId: string; albumId: string };

  const cards: CardEntry[] = [];
  if (result) {
    if (result.globalAggregate) cards.push({ kind: 'global' });
    const albumIds = [...new Set(result.songs.map((s) => s.albumId))];
    if (result.scope !== 'song') {
      for (const aId of albumIds) {
        const agg = result.albumAggregates.find((a) => a.albumId === aId);
        const albumTitle = agg?.albumTitle ?? result.songs.find((s) => s.albumId === aId)?.albumTitle ?? '';
        cards.push({ kind: 'albumSection', albumId: aId, albumTitle });
        if (agg && agg.songCount > 1) cards.push({ kind: 'albumAggregate', albumId: aId });
        for (const s of result.songs.filter((s) => s.albumId === aId)) {
          cards.push({ kind: 'song', songId: s.songId, albumId: aId });
        }
      }
    } else {
      for (const s of result.songs) cards.push({ kind: 'song', songId: s.songId, albumId: s.albumId });
    }
  }

  const cardProps = { applyFilters, sortOrder, registerCanvas };

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Lyric Lab</h1>
            <p className="text-sm text-surface-500 mt-1">
              Bulk word cloud analysis — discography, album, or individual song
            </p>
          </div>
          {result && (
            <button
              onClick={downloadAll}
              disabled={downloading}
              className="shrink-0 text-sm px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {downloading ? 'Downloading…' : `Download All (${totalCards})`}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="bg-white border border-surface-200 rounded-lg p-5 space-y-4">

          {/* Row 1: band / scope / album / song */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-surface-700">Band</label>
              <select
                value={bandId}
                onChange={(e) => { setBandId(e.target.value); setResult(null); }}
                className="w-full rounded border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">— select band —</option>
                {(scopes?.bands ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-surface-700">Scope</label>
              <div className="flex rounded overflow-hidden border border-surface-300">
                {(['discography', 'album', 'song'] as LyricLabScope[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setScope(s); setResult(null); }}
                    className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                      scope === s ? 'bg-indigo-600 text-white' : 'bg-white text-surface-600 hover:bg-surface-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {(scope === 'album' || scope === 'song') && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-surface-700">Album</label>
                <select
                  value={albumId}
                  onChange={(e) => { setAlbumId(e.target.value); setSongId(''); setResult(null); }}
                  disabled={!bandId}
                  className="w-full rounded border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">— select album —</option>
                  {filteredAlbums.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>
            )}

            {scope === 'song' && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-surface-700">Song</label>
                <select
                  value={songId}
                  onChange={(e) => { setSongId(e.target.value); setResult(null); }}
                  disabled={!bandId}
                  className="w-full rounded border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">— select song —</option>
                  {songs
                    .filter((s) => !albumId || s.album?.title === filteredAlbums.find((a) => a.id === albumId)?.title)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.album ? `${s.album.title} — ` : ''}{s.title}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* Row 2: display controls */}
          <div className="border-t border-surface-100 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Display count slider */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-surface-700">
                Words to show: {displayCount}
              </label>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={displayCount}
                onChange={(e) => setDisplayCount(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            {/* Sort order */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-surface-700">Sort order</label>
              <div className="flex rounded overflow-hidden border border-surface-300">
                {(['common', 'rarest'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortOrder(s)}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      sortOrder === s ? 'bg-indigo-600 text-white' : 'bg-white text-surface-600 hover:bg-surface-50'
                    }`}
                  >
                    {s === 'common' ? 'Most Common' : 'Rarest First'}
                  </button>
                ))}
              </div>
            </div>

            {/* Exclude words */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-surface-700">
                Exclude words
              </label>
              <input
                type="text"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                placeholder="war, love, time…"
                className="w-full rounded border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {excludeSet.size > 0 && (
                <p className="text-[10px] text-surface-400">{excludeSet.size} word{excludeSet.size !== 1 ? 's' : ''} excluded</p>
              )}
            </div>

            {/* Show only */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-surface-700">
                Show only
              </label>
              <input
                type="text"
                value={includeInput}
                onChange={(e) => setIncludeInput(e.target.value)}
                placeholder="dark, light, fire…"
                className="w-full rounded border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {includeSet.size > 0 && (
                <p className="text-[10px] text-indigo-500 font-medium">Showing {includeSet.size} specific word{includeSet.size !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>

          {/* Generate button + error */}
          <div className="flex items-center justify-between pt-1">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={generate}
              disabled={loading || !bandId}
              className="ml-auto px-6 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-surface-400 text-sm gap-3">
            <span className="animate-spin text-xl">⟳</span>
            Processing lyrics…
          </div>
        )}

        {/* Stats bar */}
        {result && !loading && (
          <div className="flex flex-wrap gap-6 text-sm text-surface-600 bg-white border border-surface-200 rounded-lg px-5 py-3">
            <span><strong className="text-surface-900">{result.bandName}</strong></span>
            <span>{result.songsWithLyrics} / {result.songsTotal} songs with lyrics</span>
            {result.globalAggregate && (
              <>
                <span>{result.globalAggregate.totalTokens.toLocaleString()} total tokens</span>
                <span>{result.globalAggregate.uniqueWords.toLocaleString()} unique words</span>
              </>
            )}
            <span className="capitalize">{result.scope} scope</span>
            {(excludeSet.size > 0 || includeSet.size > 0) && (
              <span className="text-indigo-600">
                {includeSet.size > 0 ? `Showing only: ${committed.include}` : `Excluding: ${committed.exclude}`}
              </span>
            )}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-2">
            {/* Global aggregate */}
            {result.globalAggregate && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-surface-700 uppercase tracking-wider mb-3 pb-1 border-b border-surface-200">
                  Full Discography
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <WordCloudCard
                    {...cardProps}
                    id="global"
                    title={`${result.bandName} — Full Discography`}
                    subtitle={`${result.globalAggregate.songCount} songs · ${result.globalAggregate.uniqueWords.toLocaleString()} unique words`}
                    badge="All albums"
                    words={result.globalAggregate.words}
                    totalTokens={result.globalAggregate.totalTokens}
                    uniqueWords={result.globalAggregate.uniqueWords}
                  />
                </div>
              </div>
            )}

            {/* Per-album sections */}
            {cards.filter((c) => c.kind === 'albumSection').map((section) => {
              if (section.kind !== 'albumSection') return null;
              const sectionCards = cards.filter(
                (c) => (c.kind === 'albumAggregate' || c.kind === 'song') && c.albumId === section.albumId,
              );
              return (
                <AlbumSection key={section.albumId} albumTitle={section.albumTitle}>
                  {sectionCards.map((card) => {
                    if (card.kind === 'albumAggregate') {
                      const agg = result.albumAggregates.find((a) => a.albumId === card.albumId)!;
                      return (
                        <WordCloudCard
                          {...cardProps}
                          key={`album-${agg.albumId}`}
                          id={`album-${agg.albumId}`}
                          title={agg.albumTitle}
                          subtitle={`${agg.songCount} songs · ${agg.uniqueWords.toLocaleString()} unique words`}
                          badge="Album aggregate"
                          words={agg.words}
                          totalTokens={agg.totalTokens}
                          uniqueWords={agg.uniqueWords}
                          sharedWords={agg.sharedWords}
                        />
                      );
                    }
                    if (card.kind === 'song') {
                      const song = result.songs.find((s) => s.songId === card.songId)!;
                      return (
                        <WordCloudCard
                          {...cardProps}
                          key={song.songId}
                          id={song.songId}
                          title={song.songTitle}
                          subtitle={song.albumTitle || undefined}
                          words={song.words}
                          totalTokens={song.totalTokens}
                          uniqueWords={song.uniqueWords}
                        />
                      );
                    }
                    return null;
                  })}
                </AlbumSection>
              );
            })}

            {/* Single-song scope */}
            {result.scope === 'song' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {result.songs.map((song) => (
                  <WordCloudCard
                    {...cardProps}
                    key={song.songId}
                    id={song.songId}
                    title={song.songTitle}
                    subtitle={song.albumTitle || undefined}
                    words={song.words}
                    totalTokens={song.totalTokens}
                    uniqueWords={song.uniqueWords}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {result && !loading && result.songsWithLyrics === 0 && (
          <div className="text-center py-16 text-surface-400 text-sm">
            No songs with lyrics found for this selection.
          </div>
        )}
      </div>
    </div>
  );
}

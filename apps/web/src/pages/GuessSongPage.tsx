/**
 * What's That Song? — poster composer + local game mode.
 *
 * Flow:
 *   1. User goes to Word Cloud, generates a cloud for a specific song/album.
 *   2. Clicks "What's That Song?" → stores word data in sessionStorage → navigates here.
 *   3. On this page: upload a background image, adjust transparency, style words, download poster.
 *   4. Optional: switch to Game Mode to test-guess the answer locally before sharing.
 *
 * Rendering:
 *   - All compositing happens on an HTML canvas (background image + word layer + title overlay).
 *   - Canvas lives at full export resolution (1080px wide); CSS scales it for preview.
 *   - Word layout uses the same Archimedean spiral algorithm as WordCloudPage.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuessSongHandoff {
  words: { text: string; weight: number }[];
  label: string;   // display name of the scope (song title, album, artist…)
  scope: string;   // 'song' | 'album' | 'artist' | 'universe'
}

interface PosterWord { text: string; weight: number; }

interface LayoutWord {
  text: string; weight: number; fontSize: number;
  x: number; y: number; index: number;
}

interface Rect { x: number; y: number; w: number; h: number; }

// ---------------------------------------------------------------------------
// Poster size configs
// ---------------------------------------------------------------------------

const SIZES = {
  portrait: { w: 1080, h: 1350, label: 'Portrait 4:5' },
  story:    { w: 1080, h: 1920, label: 'Story 9:16'   },
  square:   { w: 1080, h: 1080, label: 'Square 1:1'   },
} as const;

type SizeKey     = keyof typeof SIZES;
type WordColor   = 'white' | 'warm' | 'cool' | 'golden' | 'rainbow';
type WordEffect  = 'none' | 'shadow' | 'glow';

// Fixed layout measurements (poster pixels, 1080-wide)
const TITLE_AREA_H = 395; // space reserved for header + title + separator
const FOOTER_H     =  80; // space reserved for footer URL

// ---------------------------------------------------------------------------
// Spiral word layout
// ---------------------------------------------------------------------------

function overlapsRect(a: Rect, b: Rect, pad = 5): boolean {
  return !(
    a.x + a.w + pad < b.x - pad ||
    b.x + b.w + pad < a.x - pad ||
    a.y + a.h + pad < b.y - pad ||
    b.y + b.h + pad < a.y - pad
  );
}

function buildLayout(words: PosterWord[], canvasW: number, canvasH: number): LayoutWord[] {
  const areaH = Math.max(100, canvasH - TITLE_AREA_H - FOOTER_H);

  const mc = document.createElement('canvas');
  mc.width = canvasW;
  mc.height = areaH;
  const ctx = mc.getContext('2d');
  if (!ctx) return [];

  const maxWt  = Math.max(1, ...words.map((w) => w.weight));
  const MIN_FS = 18;
  const MAX_FS = Math.min(92, Math.floor(areaH / 7));

  const placed: LayoutWord[] = [];
  const rects:  Rect[]       = [];
  const cx = canvasW / 2;
  const cy = areaH   / 2;

  for (const word of words) {
    const t  = word.weight / maxWt;
    const fs = Math.round(MIN_FS + Math.pow(t, 0.6) * (MAX_FS - MIN_FS));

    ctx.font  = `700 ${fs}px "Inter", system-ui, sans-serif`;
    const m   = ctx.measureText(word.text);
    const tw  = m.width;
    const th  = fs * 1.2;
    const spread = 0.44 + (1 - t) * 0.28;

    let fx = cx - tw / 2;
    let fy = cy - th / 2;
    let ok = false;

    for (let step = 0; step < 4000; step++) {
      const angle = step * 0.12;
      const r     = spread * step;
      const tx_   = cx + r * Math.cos(angle) - tw / 2;
      const ty_   = cy + r * Math.sin(angle) - th / 2;
      const M     = 12;
      if (tx_ < M || ty_ < M || tx_ + tw > canvasW - M || ty_ + th > areaH - M) continue;
      const nr: Rect = { x: tx_, y: ty_, w: tw, h: th };
      if (!rects.some((er) => overlapsRect(er, nr))) {
        fx = tx_; fy = ty_; ok = true;
        rects.push(nr);
        break;
      }
    }
    if (!ok && rects.length > 0) continue;

    placed.push({
      text: word.text, weight: word.weight, fontSize: fs, index: placed.length,
      x: fx + tw / 2,              // horizontal center anchor
      y: TITLE_AREA_H + fy + th * 0.8, // absolute canvas y, text baseline
    });
  }
  return placed;
}

// ---------------------------------------------------------------------------
// Canvas draw
// ---------------------------------------------------------------------------

function drawPoster(
  canvas: HTMLCanvasElement,
  opts: {
    layout:       LayoutWord[];
    bgImg:        HTMLImageElement | null;
    bgOpacity:    number;
    wordOpacity:  number;
    wordColor:    WordColor;
    wordEffect:   WordEffect;
    posterNumber: string;
    showWords:    boolean;
  },
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  // 1. Black base
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // 2. Background image (cover crop, with opacity)
  if (opts.bgImg) {
    ctx.save();
    ctx.globalAlpha = opts.bgOpacity;
    const s  = Math.max(W / opts.bgImg.width, H / opts.bgImg.height);
    const ix = (W - opts.bgImg.width  * s) / 2;
    const iy = (H - opts.bgImg.height * s) / 2;
    ctx.drawImage(opts.bgImg, ix, iy, opts.bgImg.width * s, opts.bgImg.height * s);
    ctx.restore();
  }

  // 3. Word cloud layer
  if (opts.showWords && opts.layout.length > 0) {
    const maxWt = Math.max(1, ...opts.layout.map((l) => l.weight));
    ctx.save();
    ctx.globalAlpha = opts.wordOpacity;
    ctx.textAlign = 'center';

    for (const lw of opts.layout) {
      const t = lw.weight / maxWt;

      // Effect
      if (opts.wordEffect === 'shadow') {
        ctx.shadowBlur  = 10;
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
      } else if (opts.wordEffect === 'glow') {
        ctx.shadowBlur  = 22;
        ctx.shadowColor = 'rgba(0,220,255,0.7)';
      } else {
        ctx.shadowBlur  = 0;
        ctx.shadowColor = 'transparent';
      }

      // Color
      const color: string =
        opts.wordColor === 'white'   ? '#ffffff' :
        opts.wordColor === 'warm'    ? `hsl(${42 - t * 18}deg, 95%, ${85 + t * 12}%)` :
        opts.wordColor === 'cool'    ? `hsl(${198 + t * 22}deg, 80%, ${82 + t * 14}%)` :
        opts.wordColor === 'golden'  ? `hsl(45deg, 95%, ${84 - t * 22}%)` :
        `hsl(${(lw.index * 41) % 360}deg, 82%, 74%)`; // rainbow

      ctx.fillStyle = color;
      ctx.font      = `700 ${lw.fontSize}px "Inter", system-ui, sans-serif`;
      ctx.fillText(lw.text, lw.x, lw.y);
      ctx.shadowBlur  = 0;
      ctx.shadowColor = 'transparent';
    }
    ctx.restore();
  }

  // 4. Dark gradient behind the title area (always, improves legibility over any bg)
  const tGrad = ctx.createLinearGradient(0, 0, 0, TITLE_AREA_H + 60);
  tGrad.addColorStop(0,   'rgba(0,0,0,0.72)');
  tGrad.addColorStop(0.8, 'rgba(0,0,0,0.35)');
  tGrad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = tGrad;
  ctx.fillRect(0, 0, W, TITLE_AREA_H + 60);

  // 5. Subtle footer gradient
  const fGrad = ctx.createLinearGradient(0, H - 110, 0, H);
  fGrad.addColorStop(0, 'rgba(0,0,0,0)');
  fGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = fGrad;
  ctx.fillRect(0, H - 110, W, 110);

  // 6. Header: brand name (left) + series number (right)
  ctx.textAlign  = 'left';
  ctx.fillStyle  = 'rgba(255,255,255,0.28)';
  ctx.font       = '600 20px "Inter", system-ui, sans-serif';
  ctx.fillText('BAND SPECTRUM MAPPER', 52, 52);

  ctx.textAlign  = 'right';
  ctx.fillStyle  = 'rgba(255,255,255,0.22)';
  ctx.font       = '500 19px "Inter", system-ui, sans-serif';
  ctx.fillText(`GUESS SONG // ${opts.posterNumber}`, W - 52, 52);

  // 7. Main title
  ctx.textAlign = 'left';
  ctx.fillStyle = '#22d3ee'; // cyan-400
  ctx.shadowBlur  = 18;
  ctx.shadowColor = 'rgba(34,211,238,0.28)';
  ctx.font = '900 88px "Inter", system-ui, sans-serif';
  ctx.fillText("WHAT'S", 52, 172);
  ctx.fillText('THAT',   52, 268);
  ctx.fillText('SONG?',  52, 360);
  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';

  // 8. Cyan separator line
  ctx.strokeStyle = 'rgba(34,211,238,0.55)';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.moveTo(52,     381);
  ctx.lineTo(W - 52, 381);
  ctx.stroke();

  // 9. Footer URL
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font      = '400 20px "Inter", system-ui, sans-serif';
  ctx.fillText('bandspectrummapper.com', W / 2, H - 28);
}

// ---------------------------------------------------------------------------
// Session storage key (shared with WordCloudPage)
// ---------------------------------------------------------------------------

export const GUESS_SONG_STORAGE_KEY = 'guess-the-song-data';

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PREVIEW_W = 420; // CSS display width of the canvas

export default function GuessSongPage() {
  // ── Word data (from sessionStorage, written by WordCloudPage) ──
  const [words,      setWords]      = useState<PosterWord[]>([]);
  const [cloudLabel, setCloudLabel] = useState('');

  // ── Poster settings ──
  const [sizeKey,       setSizeKey]       = useState<SizeKey>('portrait');
  const [bgFile,        setBgFile]        = useState<File | null>(null);
  const [bgUrl,         setBgUrl]         = useState<string | null>(null);
  const [bgImg,         setBgImg]         = useState<HTMLImageElement | null>(null);
  const [bgOpacity,     setBgOpacity]     = useState(1.0);
  const [wordOpacity,   setWordOpacity]   = useState(0.92);
  const [wordColor,     setWordColor]     = useState<WordColor>('white');
  const [wordEffect,    setWordEffect]    = useState<WordEffect>('shadow');
  const [posterNumber,  setPosterNumber]  = useState('001');
  const [revealTitle,   setRevealTitle]   = useState('');

  // ── Mode ──
  const [mode,        setMode]        = useState<'poster' | 'game'>('poster');
  const [guess,       setGuess]       = useState('');
  const [guessResult, setGuessResult] = useState<'correct' | 'wrong' | null>(null);
  const [revealed,    setRevealed]    = useState(false);

  // ── Layout ──
  const [layout, setLayout] = useState<LayoutWord[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(GUESS_SONG_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<GuessSongHandoff>;
      if (Array.isArray(data.words)) setWords(data.words as PosterWord[]);
      if (data.label)               setCloudLabel(data.label);
      // Pre-fill answer when scope is a song
      if (data.scope === 'song' && data.label) setRevealTitle(data.label);
    } catch { /* ignore */ }
  }, []);

  // Rebuild layout when words or size change
  useEffect(() => {
    if (!words.length) { setLayout([]); return; }
    const size = SIZES[sizeKey];
    // Run in next frame so the browser font engine is ready
    const id = requestAnimationFrame(() => {
      setLayout(buildLayout(words, size.w, size.h));
    });
    return () => cancelAnimationFrame(id);
  }, [words, sizeKey]);

  // Handle background image upload
  function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (bgUrl) URL.revokeObjectURL(bgUrl);
    setBgFile(file);
    const url = URL.createObjectURL(file);
    setBgUrl(url);
    const img = new Image();
    img.onload = () => setBgImg(img);
    img.src    = url;
  }

  function removeBg() {
    if (bgUrl) URL.revokeObjectURL(bgUrl);
    setBgFile(null); setBgUrl(null); setBgImg(null);
  }

  // Draw the poster to the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawPoster(canvas, {
      layout,
      bgImg,
      bgOpacity,
      wordOpacity,
      wordColor,
      wordEffect,
      posterNumber,
      showWords: true,
    });
  }, [layout, bgImg, bgOpacity, wordOpacity, wordColor, wordEffect, posterNumber]);

  useEffect(() => { draw(); }, [draw]);

  // Download the poster at full resolution
  function downloadPoster() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `whats-that-song-${posterNumber}.png`;
      a.click();
    }, 'image/png');
  }

  // Game mode helpers
  function checkGuess() {
    if (!revealTitle.trim() || !guess.trim()) return;
    const correct = guess.trim().toLowerCase() === revealTitle.trim().toLowerCase();
    setGuessResult(correct ? 'correct' : 'wrong');
  }

  function resetGame() {
    setGuess(''); setGuessResult(null); setRevealed(false);
  }

  const size      = SIZES[sizeKey];
  const aspect    = size.h / size.w;
  const previewH  = Math.round(PREVIEW_W * aspect);
  const hasWords  = words.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Top bar ── */}
      <div className="border-b border-white/10 px-6 py-3 flex items-center gap-4">
        <Link to="/word-cloud" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Word Cloud</Link>
        <span className="text-white/20">·</span>
        <h1 className="text-sm font-semibold text-white/80">What's That Song?</h1>
        <p className="text-xs text-white/30 ml-2 hidden sm:block">
          Compose a shareable lyric-hint poster
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">

        {/* ── Left: controls ── */}
        <aside className="w-full lg:w-64 shrink-0 space-y-5">

          {/* Word source info */}
          {hasWords ? (
            <div className="bg-indigo-950/60 border border-indigo-800/50 rounded-xl p-3">
              <div className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider mb-1">
                Word cloud loaded
              </div>
              <div className="text-sm text-white font-medium truncate">{cloudLabel || 'Word cloud'}</div>
              <div className="text-[10px] text-indigo-400/70 mt-0.5">{words.length} words</div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">☁️</div>
              <p className="text-xs text-white/50 leading-relaxed">
                No word cloud loaded yet.
              </p>
              <Link to="/word-cloud"
                className="block mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                Go to Word Cloud →
              </Link>
            </div>
          )}

          {/* Background image */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Background Image
            </div>
            <label className="block cursor-pointer">
              <div className={`border-2 border-dashed rounded-xl p-4 text-center text-xs transition-colors ${
                bgFile
                  ? 'border-indigo-500/60 bg-indigo-950/40 text-indigo-300'
                  : 'border-white/15 hover:border-white/30 text-white/30'
              }`}>
                {bgFile ? (
                  <span className="truncate block max-w-full">{bgFile.name}</span>
                ) : (
                  <>
                    <span className="text-xl block mb-1">🖼️</span>
                    Click to upload
                  </>
                )}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
            </label>
            {bgFile && (
              <button onClick={removeBg}
                className="text-[10px] text-white/30 hover:text-white/60 mt-1 transition-colors">
                Remove
              </button>
            )}
          </div>

          {/* Background opacity */}
          {bgImg && (
            <div>
              <div className="flex justify-between text-xs text-white/40 mb-1.5">
                <span className="uppercase tracking-wider font-semibold">Background opacity</span>
                <span className="text-indigo-400">{Math.round(bgOpacity * 100)}%</span>
              </div>
              <input type="range" min={0} max={100} value={Math.round(bgOpacity * 100)}
                onChange={(e) => setBgOpacity(Number(e.target.value) / 100)}
                className="w-full accent-indigo-500" />
            </div>
          )}

          {/* Word opacity */}
          <div>
            <div className="flex justify-between text-xs text-white/40 mb-1.5">
              <span className="uppercase tracking-wider font-semibold">Word opacity</span>
              <span className="text-indigo-400">{Math.round(wordOpacity * 100)}%</span>
            </div>
            <input type="range" min={10} max={100} value={Math.round(wordOpacity * 100)}
              onChange={(e) => setWordOpacity(Number(e.target.value) / 100)}
              className="w-full accent-indigo-500" />
            <p className="text-[10px] text-white/20 mt-0.5 leading-tight">
              Lower = words blend into the background
            </p>
          </div>

          {/* Word color */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Word colour
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['white', 'warm', 'cool', 'golden', 'rainbow'] as const).map((c) => (
                <button key={c} onClick={() => setWordColor(c)}
                  className={`px-2.5 py-1 text-xs rounded-lg capitalize transition-colors ${
                    wordColor === c
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/8 text-white/50 hover:bg-white/15'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Word effect */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Word effect
            </div>
            <div className="flex gap-1.5">
              {(['none', 'shadow', 'glow'] as const).map((ef) => (
                <button key={ef} onClick={() => setWordEffect(ef)}
                  className={`flex-1 py-1.5 text-xs rounded-lg capitalize transition-colors ${
                    wordEffect === ef
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/8 text-white/50 hover:bg-white/15'
                  }`}>
                  {ef}
                </button>
              ))}
            </div>
          </div>

          {/* Poster size */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Poster size
            </div>
            <div className="space-y-1">
              {(Object.entries(SIZES) as [SizeKey, (typeof SIZES)[SizeKey]][]).map(([k, cfg]) => (
                <button key={k} onClick={() => setSizeKey(k)}
                  className={`w-full flex justify-between items-center px-3 py-2 rounded-lg text-xs transition-colors ${
                    sizeKey === k
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/8 text-white/50 hover:bg-white/15'
                  }`}>
                  <span>{cfg.label}</span>
                  <span className="opacity-60">{cfg.w}×{cfg.h}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Poster number */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Series number
            </div>
            <input
              type="text" maxLength={6} value={posterNumber}
              onChange={(e) => setPosterNumber(e.target.value)}
              className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500"
              placeholder="001"
            />
            <p className="text-[10px] text-white/20 mt-1">Shown as "GUESS SONG // 001"</p>
          </div>

          {/* Song title (answer) */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Song title (the answer)
            </div>
            <input
              type="text" value={revealTitle}
              onChange={(e) => setRevealTitle(e.target.value)}
              className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. Forty Six & 2"
            />
            <p className="text-[10px] text-white/20 mt-1">Used in game mode only — never printed on the poster</p>
          </div>

          {/* Mode toggle */}
          <div>
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
              Mode
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setMode('poster'); resetGame(); }}
                className={`flex-1 py-2 text-xs rounded-lg font-semibold transition-colors ${
                  mode === 'poster' ? 'bg-indigo-600 text-white' : 'bg-white/8 text-white/50 hover:bg-white/15'
                }`}>
                Poster
              </button>
              <button
                onClick={() => { setMode('game'); resetGame(); }}
                className={`flex-1 py-2 text-xs rounded-lg font-semibold transition-colors ${
                  mode === 'game' ? 'bg-purple-600 text-white' : 'bg-white/8 text-white/50 hover:bg-white/15'
                }`}>
                Game Mode
              </button>
            </div>
          </div>

          {/* Download */}
          <div>
            <button
              onClick={downloadPoster}
              disabled={!hasWords}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-sm rounded-xl transition-colors"
            >
              Download PNG
            </button>
            <p className="text-[10px] text-white/20 mt-1.5 text-center">
              {size.w} × {size.h} px · answer never included
            </p>
          </div>
        </aside>

        {/* ── Right: canvas preview + game UI ── */}
        <main className="flex-1 flex flex-col items-center gap-5">

          {/* Canvas */}
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={size.w}
              height={size.h}
              style={{ width: PREVIEW_W, height: previewH }}
              className="rounded-2xl shadow-2xl shadow-black/60 ring-1 ring-white/10"
            />

            {!hasWords && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60">
                <div className="text-center px-6">
                  <div className="text-4xl mb-3">☁️</div>
                  <p className="text-white/50 text-sm leading-relaxed max-w-xs">
                    Load a word cloud first: go to <Link to="/word-cloud" className="text-indigo-400 hover:underline">Word Cloud</Link>,
                    generate a cloud for a song, then click <strong className="text-white/70">What's That Song?</strong>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Game mode UI */}
          {mode === 'game' && hasWords && (
            <div className="w-full max-w-sm space-y-4">
              <p className="text-sm text-white/50 text-center leading-relaxed">
                The word cloud is your only clue — can you name the song?
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={guess}
                  onChange={(e) => { setGuess(e.target.value); setGuessResult(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') checkGuess(); }}
                  placeholder="Type your guess…"
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={checkGuess}
                  disabled={!guess.trim() || !revealTitle.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-bold text-sm rounded-xl transition-colors"
                >
                  Guess
                </button>
              </div>

              {guessResult === 'correct' && (
                <div className="text-center py-3 bg-green-900/30 border border-green-500/40 rounded-xl">
                  <span className="text-green-400 font-bold text-lg">Correct! 🎉</span>
                </div>
              )}
              {guessResult === 'wrong' && (
                <div className="text-center py-2.5 bg-red-900/20 border border-red-500/30 rounded-xl">
                  <span className="text-red-400 text-sm">Not quite — try again!</span>
                </div>
              )}

              {!revealed && (
                <button
                  onClick={() => setRevealed(true)}
                  className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white/60 text-sm font-semibold rounded-xl transition-colors"
                >
                  Reveal Answer
                </button>
              )}

              {revealed && (
                <div className="text-center py-4 bg-white/5 border border-white/15 rounded-xl">
                  <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1">The answer is</div>
                  <div className="text-xl font-bold text-white">
                    {revealTitle || <span className="text-white/30 italic text-sm">No answer set — add it in Song title above</span>}
                  </div>
                </div>
              )}

              <button onClick={resetGame} className="w-full text-xs text-white/30 hover:text-white/60 transition-colors py-1">
                Reset
              </button>
            </div>
          )}

          {/* Tip */}
          {mode === 'poster' && (
            <p className="text-xs text-white/20 text-center max-w-xs leading-relaxed">
              Upload a background image (question marks, album artwork…), then download the poster to share as a guessing challenge on social media.
            </p>
          )}
        </main>

      </div>
    </div>
  );
}

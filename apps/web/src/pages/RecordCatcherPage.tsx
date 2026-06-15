import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoundData {
  album: { id: string; title: string; year: number | null; artworkUrl: string | null; bandName: string; bandId: string };
  correctSongs: { id: string; title: string }[];
  decoySongs: { id: string; title: string }[];
}

interface LeaderboardEntry {
  rank: number; playerName: string; avatarUrl: string | null;
  score: number; level: number; songsCorrect: number; songsWrong: number;
  bandScopeNames: string | null; createdAt: string;
}

type Phase = 'setup' | 'play' | 'over';

// ---------------------------------------------------------------------------
// Game constants
// ---------------------------------------------------------------------------

const CANVAS_W = 520;
const CANVAS_H = 540;
const CATCHER_W = 110;
const CATCHER_H = 18;
const CATCHER_Y_OFFSET = 60; // from bottom
const RECORD_R = 36; // vinyl record radius (center-based positioning)
const RECORD_SPEED_BASE = 1.8;
const RECORD_SPEED_PER_LEVEL = 0.35;
const SPAWN_INTERVAL_BASE = 1400;
const SPAWN_INTERVAL_REDUCTION = 120;
const MAX_RECORDS_ON_SCREEN = 5;
const SONGS_PER_LEVEL = 5;
const MAX_LIVES = 3;

// ---------------------------------------------------------------------------
// Game state shapes (mutable, in ref — not React state to avoid re-render cost)
// ---------------------------------------------------------------------------

interface FallingRecord {
  id: number;
  title: string;
  isCorrect: boolean;
  x: number;
  y: number;
  speed: number;
  hit: boolean;
  hitTime: number;
  hitCorrect: boolean;
}

interface GameState {
  records: FallingRecord[];
  catcherX: number;
  score: number;
  level: number;
  lives: number;
  songsCorrect: number;
  songsWrong: number;
  levelCorrect: number;  // correct catches this level
  nextId: number;
  lastSpawnTime: number;
  running: boolean;
  round: RoundData | null;
  roundLoading: boolean;
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

function SetupScreen({
  bands, selectedBandIds, setSelectedBandIds, onStart,
}: {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  setSelectedBandIds: React.Dispatch<React.SetStateAction<string[]>>;
  onStart: () => void;
}) {
  function toggle(id: string) {
    setSelectedBandIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SiteHeader theme="dark" active="games" />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">💿</div>
            <h1 className="text-3xl font-bold">Record Catcher</h1>
            <p className="text-gray-400 mt-2 text-sm">Catch songs from the album — dodge the fakes</p>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Select Bands</h2>
              <div className="flex flex-wrap gap-2">
                {bands.map((b) => {
                  const sel = selectedBandIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggle(b.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        sel
                          ? 'bg-pink-600 border-pink-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
              {selectedBandIds.length === 0 && (
                <p className="text-xs text-amber-500 mt-2">Select at least one band.</p>
              )}
            </div>

            <div className="bg-gray-800 rounded-xl p-4 space-y-1 text-xs text-gray-400">
              <p>‣ An album cover is shown — catch only its songs</p>
              <p>‣ Arrow keys, mouse, or touch to move the catcher</p>
              <p>‣ Wrong song = lose a life · 3 lives total</p>
              <p>‣ Every {SONGS_PER_LEVEL} correct catches advances the level</p>
            </div>

            <button
              onClick={onStart}
              disabled={selectedBandIds.length === 0}
              className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Start Game
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game Over screen
// ---------------------------------------------------------------------------

function GameOverScreen({
  score, level, songsCorrect, songsWrong, bandIds, onPlayAgain,
}: {
  score: number; level: number; songsCorrect: number; songsWrong: number;
  bandIds: string[]; onPlayAgain: () => void;
}) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [rank, setRank] = useState<number | null>(null);

  const { data: lb = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ['rc-leaderboard'],
    queryFn: () => api.get('/api/record-catcher/scores?limit=15'),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!user || saved) return;
    api.post('/api/record-catcher/scores', { score, level, songsCorrect, songsWrong, bandIds })
      .then((r: unknown) => {
        const res = r as { rank?: number };
        if (res.rank) setRank(res.rank);
        setSaved(true);
      })
      .catch(() => { /* non-fatal */ });
  }, [user, saved, score, level, songsCorrect, songsWrong, bandIds]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SiteHeader theme="dark" active="games" />
      <main className="flex-1 px-4 py-12 max-w-2xl mx-auto w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💿</div>
          <h1 className="text-3xl font-bold">Game Over</h1>
          {rank && <p className="text-pink-400 mt-1 text-sm font-medium">You ranked #{rank}!</p>}
          {!user && <p className="text-gray-500 mt-1 text-sm">Sign in to save your score.</p>}
        </div>

        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Score', value: score.toLocaleString() },
            { label: 'Level', value: level },
            { label: 'Caught', value: songsCorrect },
            { label: 'Missed', value: songsWrong },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
              <div className="text-2xl font-bold text-pink-400">{value}</div>
              <div className="text-xs text-gray-500 mt-1">{label}</div>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 mb-6">
          <h2 className="text-sm font-semibold mb-4">Leaderboard</h2>
          {lb.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">No scores yet</p>
          ) : (
            <div className="space-y-1">
              {lb.map((entry) => (
                <div key={entry.rank} className="flex items-center gap-3 py-1.5 border-b border-gray-800 last:border-0">
                  <span className="w-6 text-right text-xs text-gray-500 shrink-0">#{entry.rank}</span>
                  <span className="text-sm font-medium flex-1 truncate">{entry.playerName}</span>
                  <span className="text-xs text-gray-500">Lv.{entry.level}</span>
                  <span className="text-sm font-bold text-pink-400 w-16 text-right">{entry.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={onPlayAgain}
            className="bg-pink-600 hover:bg-pink-500 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Play Again
          </button>
          <Link
            to="/games"
            className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            All Games
          </Link>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vinyl record canvas helper
// ---------------------------------------------------------------------------

function drawVinylRecord(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  albumImg: HTMLImageElement | null,
  hitResult: boolean | null,
): void {
  // Shadow / glow — green on correct catch, red on wrong, subtle violet while falling
  if (hitResult !== null) {
    ctx.shadowColor = hitResult ? '#10b981' : '#ef4444';
    ctx.shadowBlur = 18;
  } else {
    ctx.shadowColor = 'rgba(167,139,250,0.35)';
    ctx.shadowBlur = 5;
  }

  // Vinyl disc body — uniform dark color regardless of correctness (no spoilers)
  ctx.fillStyle = '#16162a';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Groove rings (concentric, slight brightness alternation)
  for (let i = 1; i <= 9; i++) {
    const r = radius * (0.42 + (i / 9) * 0.54);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${i % 2 === 0 ? 0.055 : 0.028})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // Hit flash overlay — only visible after catch
  if (hitResult !== null) {
    ctx.fillStyle = hitResult ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Center label — album art if loaded, otherwise deep purple
  const labelR = radius * 0.38;
  if (albumImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(albumImg, cx - labelR, cy - labelR, labelR * 2, labelR * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#4c1d95';
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spindle hole
  ctx.fillStyle = '#08081a';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Gloss highlight
  const gloss = ctx.createRadialGradient(cx - radius * 0.22, cy - radius * 0.28, 0, cx, cy, radius);
  gloss.addColorStop(0, 'rgba(255,255,255,0.07)');
  gloss.addColorStop(0.55, 'rgba(255,255,255,0.015)');
  gloss.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Canvas game
// ---------------------------------------------------------------------------

function RecordCatcherGame({
  bandIds,
  onGameOver,
}: {
  bandIds: string[];
  onGameOver: (score: number, level: number, songsCorrect: number, songsWrong: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    records: [], catcherX: CANVAS_W / 2 - CATCHER_W / 2,
    score: 0, level: 1, lives: MAX_LIVES,
    songsCorrect: 0, songsWrong: 0, levelCorrect: 0,
    nextId: 0, lastSpawnTime: 0, running: false,
    round: null, roundLoading: false,
  });
  const rafRef = useRef<number>(0);
  const keysRef = useRef<Set<string>>(new Set());
  const mouseXRef = useRef<number | null>(null);
  const albumImgRef = useRef<HTMLImageElement | null>(null);
  const [displayState, setDisplayState] = useState({
    score: 0, level: 1, lives: MAX_LIVES, albumTitle: '', albumBand: '', artworkUrl: null as string | null,
  });
  const gameOverFiredRef = useRef(false);

  // Load a round from API
  const loadRound = useCallback(async () => {
    const gs = stateRef.current;
    if (gs.roundLoading) return;
    gs.roundLoading = true;
    gs.records = [];
    gs.lastSpawnTime = 0;
    try {
      const data = await api.get(`/api/record-catcher/round?bandIds=${bandIds.join(',')}`) as RoundData;
      gs.round = data;
      gs.roundLoading = false;

      // Pre-load album art
      if (data.album.artworkUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = data.album.artworkUrl;
        img.onload = () => { albumImgRef.current = img; };
        img.onerror = () => { albumImgRef.current = null; };
      } else {
        albumImgRef.current = null;
      }

      setDisplayState((prev) => ({
        ...prev,
        albumTitle: data.album.title,
        albumBand: data.album.bandName,
        artworkUrl: data.album.artworkUrl,
      }));
    } catch {
      gs.roundLoading = false;
    }
  }, [bandIds]);

  function spawnRecord(gs: GameState, now: number) {
    const round = gs.round;
    if (!round) return;
    if (gs.records.filter((r) => !r.hit).length >= MAX_RECORDS_ON_SCREEN) return;

    const spawnInterval = Math.max(800, SPAWN_INTERVAL_BASE - (gs.level - 1) * SPAWN_INTERVAL_REDUCTION);
    if (now - gs.lastSpawnTime < spawnInterval) return;
    gs.lastSpawnTime = now;

    const allSongs = [
      ...round.correctSongs.map((s) => ({ ...s, isCorrect: true })),
      ...round.decoySongs.map((s) => ({ ...s, isCorrect: false })),
    ];
    const pick = allSongs[Math.floor(Math.random() * allSongs.length)];
    if (!pick) return;

    // x/y are the CENTER of the vinyl disc
    const x = RECORD_R + Math.random() * (CANVAS_W - RECORD_R * 2);
    const speed = RECORD_SPEED_BASE + (gs.level - 1) * RECORD_SPEED_PER_LEVEL;
    gs.records.push({
      id: gs.nextId++, title: pick.title, isCorrect: pick.isCorrect,
      x, y: -RECORD_R, speed, hit: false, hitTime: 0, hitCorrect: false,
    });
  }

  function drawFrame(ctx: CanvasRenderingContext2D, gs: GameState, now: number) {
    // Background — deep navy gradient, not pitch black
    const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    bgGrad.addColorStop(0, '#0e0e22');
    bgGrad.addColorStop(1, '#07070f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle grid texture for depth
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.018)';
    for (let gx = 0; gx < CANVAS_W; gx += 36) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, CANVAS_H); ctx.stroke();
    }
    for (let gy = 0; gy < CANVAS_H; gy += 36) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CANVAS_W, gy); ctx.stroke();
    }

    // ---------- Header band ----------
    const ART_SIZE = 56;
    const ART_PAD = 12;
    const HDR_H = ART_SIZE + ART_PAD * 2;

    ctx.fillStyle = 'rgba(255,255,255,0.022)';
    ctx.fillRect(0, 0, CANVAS_W, HDR_H);
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HDR_H);
    ctx.lineTo(CANVAS_W, HDR_H);
    ctx.stroke();

    // Album artwork (header left)
    if (albumImgRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ART_PAD, ART_PAD, ART_SIZE, ART_SIZE, 6);
      ctx.clip();
      ctx.drawImage(albumImgRef.current, ART_PAD, ART_PAD, ART_SIZE, ART_SIZE);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(ART_PAD, ART_PAD, ART_SIZE, ART_SIZE, 6);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1e1e38';
      ctx.beginPath();
      ctx.roundRect(ART_PAD, ART_PAD, ART_SIZE, ART_SIZE, 6);
      ctx.fill();
      ctx.font = '22px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('💿', ART_PAD + ART_SIZE / 2, ART_PAD + ART_SIZE / 2 + 8);
    }

    // Album info
    const infoX = ART_PAD + ART_SIZE + 10;
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CATCH SONGS FROM', infoX, ART_PAD + 12);

    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 13px system-ui, sans-serif';
    const titleMaxW = CANVAS_W - infoX - 125;
    let displayTitle = gs.round?.album.title ?? '…';
    while (ctx.measureText(displayTitle).width > titleMaxW && displayTitle.length > 4) {
      displayTitle = displayTitle.slice(0, -2) + '…';
    }
    ctx.fillText(displayTitle, infoX, ART_PAD + 28);

    ctx.fillStyle = '#a78bfa';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(gs.round?.album.bandName ?? '', infoX, ART_PAD + 44);

    // Score + level + lives (header right)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(gs.score.toLocaleString(), CANVAS_W - ART_PAD, ART_PAD + 17);
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(`LEVEL ${gs.level}`, CANVAS_W - ART_PAD, ART_PAD + 32);
    // Lives right-to-left
    let livesX = CANVAS_W - ART_PAD;
    ctx.font = '13px system-ui';
    for (let i = MAX_LIVES - 1; i >= 0; i--) {
      ctx.fillText(i < gs.lives ? '❤️' : '🖤', livesX, ART_PAD + 52);
      livesX -= 19;
    }

    // ---------- Level progress bar ----------
    const BAR_Y = CANVAS_H - CATCHER_Y_OFFSET - 14;
    const BAR_W = CANVAS_W - 24;
    const BAR_X = 12;
    const BAR_H = 3;
    const progress = Math.min(1, gs.levelCorrect / SONGS_PER_LEVEL);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.roundRect(BAR_X, BAR_Y, BAR_W, BAR_H, 1.5);
    ctx.fill();
    if (progress > 0) {
      const barGrad = ctx.createLinearGradient(BAR_X, 0, BAR_X + BAR_W, 0);
      barGrad.addColorStop(0, '#6d28d9');
      barGrad.addColorStop(1, '#a78bfa');
      ctx.fillStyle = barGrad;
      ctx.beginPath();
      ctx.roundRect(BAR_X, BAR_Y, BAR_W * progress, BAR_H, 1.5);
      ctx.fill();
    }

    // ---------- Falling vinyl records ----------
    for (const rec of gs.records) {
      if (rec.hit && now - rec.hitTime > 500) continue;

      const alpha = rec.hit ? Math.max(0, 1 - (now - rec.hitTime) / 500) : 1;
      ctx.globalAlpha = alpha;

      drawVinylRecord(ctx, rec.x, rec.y, RECORD_R, albumImgRef.current, rec.hit ? rec.hitCorrect : null);

      // Song title below the disc
      ctx.fillStyle = rec.hit
        ? (rec.hitCorrect ? '#6ee7b7' : '#fca5a5')
        : '#d1d5db';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      let title = rec.title;
      const maxTitleW = RECORD_R * 2.5;
      while (ctx.measureText(title).width > maxTitleW && title.length > 4) {
        title = title.slice(0, -2) + '…';
      }
      ctx.fillText(title, rec.x, rec.y + RECORD_R + 13);

      ctx.globalAlpha = 1;
    }

    // ---------- Catcher (violet with glow) ----------
    const catcherY = CANVAS_H - CATCHER_Y_OFFSET;
    const catcherGrad = ctx.createLinearGradient(gs.catcherX, 0, gs.catcherX + CATCHER_W, 0);
    catcherGrad.addColorStop(0, '#6d28d9');
    catcherGrad.addColorStop(0.5, '#a78bfa');
    catcherGrad.addColorStop(1, '#6d28d9');
    ctx.shadowColor = 'rgba(167,139,250,0.55)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = catcherGrad;
    ctx.beginPath();
    ctx.roundRect(gs.catcherX, catcherY, CATCHER_W, CATCHER_H, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function gameLoop(timestamp: number) {
    const gs = stateRef.current;
    if (!gs.running) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    // Mouse control — track mouse position
    if (mouseXRef.current !== null) {
      const targetX = mouseXRef.current - CATCHER_W / 2;
      gs.catcherX += (targetX - gs.catcherX) * 0.25;
    }

    // Keyboard control
    const speed = 6 + gs.level * 0.5;
    if (keysRef.current.has('ArrowLeft') || keysRef.current.has('a') || keysRef.current.has('A')) {
      gs.catcherX = Math.max(0, gs.catcherX - speed);
    }
    if (keysRef.current.has('ArrowRight') || keysRef.current.has('d') || keysRef.current.has('D')) {
      gs.catcherX = Math.min(CANVAS_W - CATCHER_W, gs.catcherX + speed);
    }
    gs.catcherX = Math.max(0, Math.min(CANVAS_W - CATCHER_W, gs.catcherX));

    // Spawn
    if (!gs.roundLoading) spawnRecord(gs, timestamp);

    // Move records
    const catcherY = CANVAS_H - CATCHER_Y_OFFSET;
    let stateChanged = false;

    for (const rec of gs.records) {
      if (rec.hit) continue;
      rec.y += rec.speed;

      // Collision with catcher (rec.x/y = disc center, RECORD_R = radius)
      if (
        rec.y + RECORD_R >= catcherY &&
        rec.y - RECORD_R <= catcherY + CATCHER_H &&
        rec.x + RECORD_R > gs.catcherX &&
        rec.x - RECORD_R < gs.catcherX + CATCHER_W
      ) {
        rec.hit = true;
        rec.hitTime = timestamp;
        rec.hitCorrect = rec.isCorrect;

        if (rec.isCorrect) {
          gs.songsCorrect++;
          gs.levelCorrect++;
          gs.score += 100 * gs.level;
          if (gs.levelCorrect >= SONGS_PER_LEVEL) {
            gs.level++;
            gs.levelCorrect = 0;
            // Load a new round on level up
            void loadRound();
          }
        } else {
          gs.songsWrong++;
          gs.lives--;
          gs.score = Math.max(0, gs.score - 50);
          stateChanged = true;
          if (gs.lives <= 0) {
            gs.running = false;
            setDisplayState((prev) => ({ ...prev, score: gs.score, level: gs.level, lives: 0 }));
            if (!gameOverFiredRef.current) {
              gameOverFiredRef.current = true;
              onGameOver(gs.score, gs.level, gs.songsCorrect, gs.songsWrong);
            }
            return;
          }
        }
        stateChanged = true;
      }

      // Missed (fell past bottom)
      if (rec.y - RECORD_R > CANVAS_H + 10) {
        rec.hit = true;
        rec.hitTime = timestamp;
        rec.hitCorrect = false;
        if (rec.isCorrect) {
          // Missed a correct song — lose a life
          gs.lives--;
          stateChanged = true;
          if (gs.lives <= 0) {
            gs.running = false;
            setDisplayState((prev) => ({ ...prev, score: gs.score, level: gs.level, lives: 0 }));
            if (!gameOverFiredRef.current) {
              gameOverFiredRef.current = true;
              onGameOver(gs.score, gs.level, gs.songsCorrect, gs.songsWrong);
            }
            return;
          }
        }
      }
    }

    // Prune old hit records (keep a little longer than the 500ms fade to avoid flicker)
    gs.records = gs.records.filter((r) => !r.hit || timestamp - r.hitTime < 560);

    // Draw
    drawFrame(ctx, gs, timestamp);

    // Update display state periodically
    if (stateChanged) {
      setDisplayState((prev) => ({ ...prev, score: gs.score, level: gs.level, lives: gs.lives }));
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }

  // Start game
  useEffect(() => {
    const gs = stateRef.current;
    gs.running = true;
    gameOverFiredRef.current = false;

    void loadRound();

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowLeft','ArrowRight','a','A','d','D'].includes(e.key)) {
        e.preventDefault();
        keysRef.current.add(e.key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { keysRef.current.delete(e.key); };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      gs.running = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mouse/touch tracking on the canvas
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = CANVAS_W / rect.width;
    mouseXRef.current = (e.clientX - rect.left) * scaleX;
  }
  function onMouseLeave() { mouseXRef.current = null; }
  function onTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !e.touches[0]) return;
    const scaleX = CANVAS_W / rect.width;
    mouseXRef.current = (e.touches[0].clientX - rect.left) * scaleX;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <SiteHeader theme="dark" active="games" />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-4">
        <div className="flex items-center gap-6 text-sm text-gray-400 mb-2">
          <span>❤️ {displayState.lives}/{MAX_LIVES}</span>
          <span className="text-violet-400 font-bold">{displayState.score.toLocaleString()}</span>
          <span>Level {displayState.level}</span>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="rounded-2xl border border-gray-800 max-w-full"
          style={{ touchAction: 'none', cursor: 'none' }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onTouchMove={onTouchMove}
        />

        <p className="text-xs text-gray-600">Arrow keys or mouse to move · Touch on mobile</p>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function RecordCatcherPage() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [finalScore, setFinalScore] = useState(0);
  const [finalLevel, setFinalLevel] = useState(1);
  const [finalCorrect, setFinalCorrect] = useState(0);
  const [finalWrong, setFinalWrong] = useState(0);

  const { data: bands = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['bands'],
    queryFn: () => api.get('/api/bands'),
    staleTime: 300_000,
  });

  function handleGameOver(score: number, level: number, songsCorrect: number, songsWrong: number) {
    setFinalScore(score);
    setFinalLevel(level);
    setFinalCorrect(songsCorrect);
    setFinalWrong(songsWrong);
    setPhase('over');
  }

  if (phase === 'setup') {
    return (
      <SetupScreen
        bands={bands}
        selectedBandIds={selectedBandIds}
        setSelectedBandIds={setSelectedBandIds}
        onStart={() => setPhase('play')}
      />
    );
  }

  if (phase === 'play') {
    return (
      <RecordCatcherGame
        bandIds={selectedBandIds}
        onGameOver={handleGameOver}
      />
    );
  }

  return (
    <GameOverScreen
      score={finalScore}
      level={finalLevel}
      songsCorrect={finalCorrect}
      songsWrong={finalWrong}
      bandIds={selectedBandIds}
      onPlayAgain={() => setPhase('setup')}
    />
  );
}

import { useState, useRef, useCallback, useEffect } from 'react';
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
const RECORD_W = 120;
const RECORD_H = 44;
const RECORD_SPEED_BASE = 1.4;
const RECORD_SPEED_PER_LEVEL = 0.3;
const SPAWN_INTERVAL_BASE = 1800;
const SPAWN_INTERVAL_REDUCTION = 100;
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

        <div className="flex gap-3 justify-center">
          <button
            onClick={onPlayAgain}
            className="bg-pink-600 hover:bg-pink-500 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Play Again
          </button>
        </div>
      </main>
    </div>
  );
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

    const x = Math.random() * (CANVAS_W - RECORD_W);
    const speed = RECORD_SPEED_BASE + (gs.level - 1) * RECORD_SPEED_PER_LEVEL;
    gs.records.push({
      id: gs.nextId++, title: pick.title, isCorrect: pick.isCorrect,
      x, y: -RECORD_H, speed, hit: false, hitTime: 0, hitCorrect: false,
    });
  }

  function drawFrame(ctx: CanvasRenderingContext2D, gs: GameState, now: number) {
    // Background
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Album artwork (top-right corner, small)
    const ART_SIZE = 72;
    const ART_X = CANVAS_W - ART_SIZE - 12;
    const ART_Y = 12;
    if (albumImgRef.current) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ART_X, ART_Y, ART_SIZE, ART_SIZE, 6);
      ctx.clip();
      ctx.drawImage(albumImgRef.current, ART_X, ART_Y, ART_SIZE, ART_SIZE);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.roundRect(ART_X, ART_Y, ART_SIZE, ART_SIZE, 6);
      ctx.fill();
      ctx.fillStyle = '#4b5563';
      ctx.font = '28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('💿', ART_X + ART_SIZE / 2, ART_Y + ART_SIZE / 2 + 10);
    }

    // Album info
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Catch songs from:', 12, 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    const titleMaxW = CANVAS_W - ART_SIZE - 32;
    let displayTitle = gs.round?.album.title ?? '…';
    while (ctx.measureText(displayTitle).width > titleMaxW && displayTitle.length > 4) {
      displayTitle = displayTitle.slice(0, -2) + '…';
    }
    ctx.fillText(displayTitle, 12, 44);
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(gs.round?.album.bandName ?? '', 12, 60);

    // HUD: lives
    ctx.textAlign = 'left';
    ctx.font = '18px system-ui';
    for (let i = 0; i < MAX_LIVES; i++) {
      ctx.fillText(i < gs.lives ? '❤️' : '🖤', 12 + i * 26, CANVAS_H - CATCHER_Y_OFFSET - 30);
    }

    // HUD: level
    ctx.fillStyle = '#ec4899';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Lv ${gs.level}`, CANVAS_W - 12, CANVAS_H - CATCHER_Y_OFFSET - 20);

    // HUD: score
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(gs.score.toLocaleString(), CANVAS_W - 12, CANVAS_H - CATCHER_Y_OFFSET - 36);

    // Level progress dots
    const dotY = CANVAS_H - CATCHER_Y_OFFSET - 8;
    const dotSpacing = 14;
    const dotStartX = CANVAS_W / 2 - ((SONGS_PER_LEVEL - 1) * dotSpacing) / 2;
    for (let i = 0; i < SONGS_PER_LEVEL; i++) {
      ctx.beginPath();
      ctx.arc(dotStartX + i * dotSpacing, dotY, 4, 0, Math.PI * 2);
      ctx.fillStyle = i < gs.levelCorrect ? '#ec4899' : '#374151';
      ctx.fill();
    }

    // Falling records
    for (const rec of gs.records) {
      if (rec.hit && now - rec.hitTime > 400) continue;

      const alpha = rec.hit ? Math.max(0, 1 - (now - rec.hitTime) / 400) : 1;
      ctx.globalAlpha = alpha;

      // Record body
      const bgColor = rec.hit
        ? (rec.hitCorrect ? '#065f46' : '#7f1d1d')
        : '#1f2937';
      const borderColor = rec.hit
        ? (rec.hitCorrect ? '#10b981' : '#ef4444')
        : '#4b5563';

      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = rec.isCorrect ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(rec.x, rec.y, RECORD_W, RECORD_H, 8);
      ctx.fill();
      ctx.stroke();

      // Vinyl disc icon
      ctx.fillStyle = rec.isCorrect ? '#ec4899' : '#6b7280';
      ctx.beginPath();
      ctx.arc(rec.x + 20, rec.y + RECORD_H / 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.arc(rec.x + 20, rec.y + RECORD_H / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Song title
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      const maxTitleW = RECORD_W - 40;
      let title = rec.title;
      while (ctx.measureText(title).width > maxTitleW && title.length > 4) {
        title = title.slice(0, -2) + '…';
      }
      ctx.fillText(title, rec.x + 36, rec.y + RECORD_H / 2 + 4);

      ctx.globalAlpha = 1;
    }

    // Catcher
    const catcherY = CANVAS_H - CATCHER_Y_OFFSET;
    const grad = ctx.createLinearGradient(gs.catcherX, catcherY, gs.catcherX, catcherY + CATCHER_H);
    grad.addColorStop(0, '#ec4899');
    grad.addColorStop(1, '#be185d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(gs.catcherX, catcherY, CATCHER_W, CATCHER_H, 6);
    ctx.fill();
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

      // Collision with catcher
      if (
        rec.y + RECORD_H >= catcherY &&
        rec.y <= catcherY + CATCHER_H &&
        rec.x + RECORD_W > gs.catcherX &&
        rec.x < gs.catcherX + CATCHER_W
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
      if (rec.y > CANVAS_H + 10) {
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

    // Prune old hit records
    gs.records = gs.records.filter((r) => !r.hit || timestamp - r.hitTime < 500);

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
          <span className="text-pink-400 font-bold">{displayState.score.toLocaleString()}</span>
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

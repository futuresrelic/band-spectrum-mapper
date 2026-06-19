import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { bandRpgApi } from '../../api/bandRpg';

// ── World constants ──────────────────────────────────────────────────────────

const TILE = 44;
const COLS = 24;
const ROWS = 18;
const WORLD_W = COLS * TILE; // 1056
const WORLD_H = ROWS * TILE; // 792

const P_HALF    = 13;  // player hitbox half-size (px)
const P_SPEED   = 2.8; // px per frame at 60fps
const INTERACT_R = 58; // px — show interaction prompts within this range
const COLLECT_R  = 22; // px — auto-collect vinyl range

// World-space centres (tile col/row → world pixel centre)
const NPC_POS   = { x: 11 * TILE + TILE / 2, y: 3  * TILE + TILE / 2 }; // col 11, row 3
const VINYL_POS = { x: 20 * TILE + TILE / 2, y: 9  * TILE + TILE / 2 }; // col 20, row 9
const SPAWN_POS = { x: 11 * TILE + TILE / 2, y: 15 * TILE + TILE / 2 }; // col 11, row 15

// Tile map  0=wall  1=floor  2=bookshelf (impassable)
const MAP: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,2,2,2,1,1,1,1,1,1,2,2,2,1,1,1,1,1,1,1,0],
  [0,1,1,1,2,2,2,1,1,1,1,1,1,2,2,2,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,2,2,2,1,1,1,1,1,1,2,2,2,1,1,1,1,1,1,1,0],
  [0,1,1,1,2,2,2,1,1,1,1,1,1,2,2,2,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

// ── Types ────────────────────────────────────────────────────────────────────

type QuestPhase   = 'pre_quest' | 'find_vinyl' | 'return_curator' | 'complete';
type Facing       = 'up' | 'down' | 'left' | 'right';

interface Player  { x: number; y: number; facing: Facing }
interface Input   { up: boolean; down: boolean; left: boolean; right: boolean }
interface DlgLine { speaker: string; text: string }
interface DlgState { lines: DlgLine[]; idx: number; onDone: () => void }

// ── Dialogue scripts ──────────────────────────────────────────────────────────

const LINES_FIRST: DlgLine[] = [
  { speaker: 'The Curator', text: 'Ah — a visitor! I\'ve been waiting for someone brave enough to help.' },
  { speaker: 'The Curator', text: 'One of our most prized records has gone missing somewhere in The Archives.' },
  { speaker: 'The Curator', text: '"The Missing Vinyl." Last seen in the east wing. Can you find it?' },
  { speaker: 'The Curator', text: 'I\'ll mark it in your log. Be careful — these halls can be disorienting.' },
];

const LINES_RETURN: DlgLine[] = [
  { speaker: 'The Curator', text: 'You found it! Remarkable. I knew I could count on you.' },
  { speaker: 'The Curator', text: 'This record contains one of the rarest sessions in the entire BSM collection.' },
  { speaker: 'The Curator', text: 'The Archives are in your debt. Your contribution has been logged. +100 points.' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function isWalkable(wx: number, wy: number): boolean {
  const col = Math.floor(wx / TILE);
  const row = Math.floor(wy / TILE);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return MAP[row]?.[col] === 1;
}

function d(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

// ── Canvas draw functions ────────────────────────────────────────────────────

const BOOK_COLORS = ['#7c2d12','#9a3412','#4f46e5','#1e40af','#15803d','#b45309','#7f1d1d','#1d4ed8'];

function drawMap(ctx: CanvasRenderingContext2D, cx: number, cy: number, vw: number, vh: number) {
  const c0 = Math.max(0, Math.floor(cx / TILE));
  const c1 = Math.min(COLS, Math.ceil((cx + vw) / TILE));
  const r0 = Math.max(0, Math.floor(cy / TILE));
  const r1 = Math.min(ROWS, Math.ceil((cy + vh) / TILE));

  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const tile = MAP[r]?.[c] ?? 0;
      const sx = c * TILE - cx;
      const sy = r * TILE - cy;

      if (tile === 0) {
        ctx.fillStyle = '#090b14';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = '#0d0f1e';
        ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
      } else if (tile === 1) {
        ctx.fillStyle = '#12142a';
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = '#181b34';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
      } else {
        // bookshelf
        ctx.fillStyle = '#1a0d06';
        ctx.fillRect(sx, sy, TILE, TILE);
        const bookH = 4;
        const gap = 1;
        let y = sy + 4;
        let bi = 0;
        while (y + bookH < sy + TILE - 4) {
          ctx.fillStyle = BOOK_COLORS[(c + r + bi) % BOOK_COLORS.length]!;
          ctx.fillRect(sx + 4, y, TILE - 8, bookH);
          y += bookH + gap;
          bi++;
        }
        ctx.strokeStyle = '#4a2c12';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
      }
    }
  }
}

function drawNPC(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  questPhase: QuestPhase,
  nearPlayer: boolean,
) {
  const sx = NPC_POS.x - cx;
  const sy = NPC_POS.y - cy;
  const now = performance.now();

  // Glow
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = nearPlayer ? 20 : 6;

  // Body
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(sx, sy, 16, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#fcd34d';
  ctx.beginPath();
  ctx.arc(sx, sy - 9, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Name
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('The Curator', sx, sy - 28);

  // Exclamation when quest is available or return needed
  if (questPhase === 'pre_quest' || questPhase === 'return_curator') {
    const bob = Math.sin(now / 380) * 3;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('!', sx, sy - 46 + bob);
  }

  // Interaction prompt
  if (nearPlayer && !ctx.isPointInPath) {
    drawPrompt(ctx, sx, sy - 36, isMobileHint ? 'Tap E' : '[E] Talk');
  }
}

// small hack to pass isMobile into draw without global — use a module-level ref
let isMobileHint = false;

function drawVinyl(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  collected: boolean,
  nearPlayer: boolean,
) {
  if (collected) return;
  const sx = VINYL_POS.x - cx;
  const sy = VINYL_POS.y - cy;
  const now = performance.now();
  const bob = Math.sin(now / 480) * 2.5;

  ctx.shadowColor = '#a78bfa';
  ctx.shadowBlur = 14 + Math.sin(now / 700) * 5;

  // Disc
  ctx.fillStyle = '#0d0515';
  ctx.beginPath();
  ctx.arc(sx, sy + bob, 16, 0, Math.PI * 2);
  ctx.fill();

  // Grooves
  for (let gr = 14; gr > 8; gr -= 2) {
    ctx.strokeStyle = '#1a0a2c';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy + bob, gr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Label
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.arc(sx, sy + bob, 6, 0, Math.PI * 2);
  ctx.fill();

  // Spindle
  ctx.fillStyle = '#030307';
  ctx.beginPath();
  ctx.arc(sx, sy + bob, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Label text
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c4b5fd';
  ctx.fillText('MISSING VINYL', sx, sy + bob - 26);

  if (nearPlayer) {
    drawPrompt(ctx, sx, sy + bob - 34, isMobileHint ? 'Tap E' : '[E] Collect');
  }
}

function drawPrompt(ctx: CanvasRenderingContext2D, sx: number, sy: number, text: string) {
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const pw = tw + 14;
  const ph = 18;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath();
  const rx = sx - pw / 2, ry = sy - ph / 2;
  ctx.roundRect(rx, ry, pw, ph, 4);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, sx, sy);
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, cx: number, cy: number) {
  const sx = player.x - cx;
  const sy = player.y - cy;

  ctx.shadowColor = '#4ade80';
  ctx.shadowBlur = 10;

  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(sx, sy, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#bbf7d0';
  ctx.beginPath();
  ctx.arc(sx, sy, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Direction dot
  const FACING: Record<Facing, [number, number]> = {
    up: [0, -9], down: [0, 9], left: [-9, 0], right: [9, 0],
  };
  const [fdx, fdy] = FACING[player.facing];
  ctx.fillStyle = '#052e16';
  ctx.beginPath();
  ctx.arc(sx + fdx, sy + fdy, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DialogueBox({ dlg, onNext }: { dlg: DlgState; onNext: () => void }) {
  const line = dlg.lines[dlg.idx];
  if (!line) return null;
  return (
    <div className="absolute inset-x-0 bottom-0 p-2 pointer-events-auto">
      <div
        className="max-w-2xl mx-auto rounded-xl bg-gray-950/95 border border-amber-500/50 p-4 cursor-pointer select-none"
        onClick={onNext}
        onTouchEnd={(e) => { e.preventDefault(); onNext(); }}
        role="button"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl shrink-0">
            🧙
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">{line.speaker}</p>
            <p className="text-white text-sm leading-relaxed">{line.text}</p>
          </div>
          <div className="text-gray-500 text-xs mt-1 shrink-0">{dlg.idx + 1}/{dlg.lines.length} ▶</div>
        </div>
        <p className="text-gray-600 text-xs text-center mt-2">Tap / click to continue</p>
      </div>
    </div>
  );
}

function QuestHud({ questPhase }: { questPhase: QuestPhase }) {
  if (questPhase === 'pre_quest' || questPhase === 'complete') return null;
  return (
    <div className="absolute top-2 left-2 pointer-events-none">
      <div className="bg-black/70 border border-amber-500/30 rounded-lg px-3 py-2 text-xs max-w-[200px]">
        <p className="text-amber-400 font-bold mb-0.5">Find the Missing Vinyl</p>
        {questPhase === 'find_vinyl'    && <p className="text-gray-300">Search the east wing <span className="text-amber-300 font-mono">0/1</span></p>}
        {questPhase === 'return_curator' && <p className="text-gray-300">Return to The Curator <span className="text-amber-300">✓</span></p>}
      </div>
    </div>
  );
}

function ScoreHud({ score }: { score: number }) {
  return (
    <div className="absolute top-2 right-12 pointer-events-none">
      <div className="bg-black/70 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs font-mono">
        <span className="text-emerald-400 font-bold">{score}</span>
        <span className="text-gray-500 ml-1">pts</span>
      </div>
    </div>
  );
}

function PauseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="absolute top-2 right-2 w-8 h-8 bg-black/70 border border-gray-700 rounded-lg text-white text-sm flex items-center justify-center hover:bg-black/90 transition-colors z-10"
    >⏸</button>
  );
}

function PauseMenu({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-auto z-20">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center w-64">
        <h2 className="text-xl font-bold text-white mb-6">Paused</h2>
        <div className="flex flex-col gap-3">
          <button onClick={onResume} className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">Resume</button>
          <button onClick={onQuit}   className="bg-white/10 hover:bg-white/20 text-gray-300 font-semibold px-6 py-2.5 rounded-lg transition-colors">Exit</button>
        </div>
      </div>
    </div>
  );
}

function CompleteScreen({ score, rank, onPlayAgain, onLeaderboard }: {
  score: number; rank: number | null; onPlayAgain: () => void; onLeaderboard: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto z-20">
      <div className="bg-gray-900 border border-emerald-500/40 rounded-2xl p-8 text-center max-w-sm mx-4">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-bold text-emerald-400 mb-2">Quest Complete!</h2>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          You recovered the Missing Vinyl from The Archives.
        </p>
        <div className="bg-black/40 rounded-xl p-4 mb-6">
          <div className="text-4xl font-bold text-white mb-1">{score}</div>
          <div className="text-gray-400 text-sm">points earned</div>
          {rank !== null && (
            <div className="text-emerald-400 text-sm mt-2 font-semibold">Leaderboard rank: #{rank}</div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={onPlayAgain}    className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">Play Again</button>
          <button onClick={onLeaderboard}  className="bg-white/10 hover:bg-white/20 text-gray-300 font-semibold px-6 py-2.5 rounded-lg transition-colors">View Leaderboard</button>
        </div>
      </div>
    </div>
  );
}

function VirtualJoystick({ onMove }: { onMove: (dx: number, dy: number) => void }) {
  const MAX_R = 38;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const center = useRef({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);
  const baseRef  = useRef<HTMLDivElement>(null);

  function updateFromClient(cx: number, cy: number) {
    let dx = cx - center.current.x;
    let dy = cy - center.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_R) { dx = (dx / dist) * MAX_R; dy = (dy / dist) * MAX_R; }
    setKnob({ x: dx, y: dy });
    onMove(dx / MAX_R, dy / MAX_R);
  }

  function handleDown(e: React.PointerEvent) {
    if (activeId.current !== null) return;
    activeId.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = baseRef.current?.getBoundingClientRect();
    if (r) center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    updateFromClient(e.clientX, e.clientY);
  }

  function handleMove(e: React.PointerEvent) {
    if (e.pointerId !== activeId.current) return;
    updateFromClient(e.clientX, e.clientY);
  }

  function handleUp(e: React.PointerEvent) {
    if (e.pointerId !== activeId.current) return;
    activeId.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }

  return (
    <div ref={baseRef}
      className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/25 relative touch-none select-none"
      onPointerDown={handleDown} onPointerMove={handleMove}
      onPointerUp={handleUp}    onPointerCancel={handleUp}
    >
      <div className="absolute w-10 h-10 rounded-full bg-white/35 border-2 border-white/55 pointer-events-none"
        style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function InteractBtn({ onInteract }: { onInteract: () => void }) {
  return (
    <button
      className="w-16 h-16 rounded-full bg-amber-500/80 border-2 border-amber-400 text-white font-bold text-xl flex items-center justify-center touch-none select-none active:scale-90 transition-transform"
      onPointerDown={(e) => { e.preventDefault(); onInteract(); }}
    >E</button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BandRpgGame({ onExit }: { onExit: () => void }) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs for game loop (no re-renders)
  const playerRef        = useRef<Player>({ x: SPAWN_POS.x, y: SPAWN_POS.y, facing: 'up' });
  const cameraRef        = useRef({ x: 0, y: 0 });
  const inputRef         = useRef<Input>({ up: false, down: false, left: false, right: false });
  const joystickRef      = useRef({ dx: 0, dy: 0 });
  const vinylRef         = useRef(false);
  const questPhaseRef    = useRef<QuestPhase>('pre_quest');
  const isPausedRef      = useRef(false);
  const isDialogueRef    = useRef(false);
  const isCompleteRef    = useRef(false);
  const scoreRef         = useRef(0);

  // React state (for UI overlays)
  const [questPhase, setQuestPhase] = useState<QuestPhase>('pre_quest');
  const [score, setScore]           = useState(0);
  const [isPaused, setIsPaused]           = useState(false);
  const [dlg, setDlg]                     = useState<DlgState | null>(null);
  const [isComplete, setIsComplete]       = useState(false);
  const [savedRank, setSavedRank]         = useState<number | null>(null);
  const [isMobile, setIsMobile]           = useState(false);

  useEffect(() => {
    const mobile = window.innerWidth < 768 || 'ontouchstart' in window;
    setIsMobile(mobile);
    isMobileHint = mobile;
  }, []);

  // Score submission
  const submitScore = useMutation({
    mutationFn: (data: { score: number; questsCompleted: number; itemsCollected: number; levelsCleared: number }) =>
      bandRpgApi.submitScore(data),
    onSuccess: (r) => setSavedRank(r.rank),
    onError:   () => setSavedRank(null),
  });

  // Dialogue advance
  const advanceDlg = useCallback(() => {
    setDlg((prev) => {
      if (!prev) return null;
      if (prev.idx + 1 < prev.lines.length) return { ...prev, idx: prev.idx + 1 };
      prev.onDone();
      isDialogueRef.current = false;
      return null;
    });
  }, []);

  // Open dialogue
  const openDlg = useCallback((lines: DlgLine[], onDone: () => void) => {
    isDialogueRef.current = true;
    setDlg({ lines, idx: 0, onDone });
  }, []);

  // Quest state changers (stable refs via useCallback)
  const acceptQuest = useCallback(() => {
    questPhaseRef.current = 'find_vinyl';
    setQuestPhase('find_vinyl');
  }, []);

  const finishQuest = useCallback(() => {
    const finalScore = scoreRef.current;
    questPhaseRef.current = 'complete';
    isCompleteRef.current = true;
    setQuestPhase('complete');
    setIsComplete(true);
    setScore(finalScore);
    submitScore.mutate({ score: finalScore, questsCompleted: 1, itemsCollected: 1, levelsCleared: 0 });
  }, [submitScore]);

  // Interact (E key or mobile button)
  const handleInteract = useCallback(() => {
    if (isDialogueRef.current || isPausedRef.current || isCompleteRef.current) return;
    const p = playerRef.current;

    // NPC interaction
    if (d(p.x, p.y, NPC_POS.x, NPC_POS.y) < INTERACT_R) {
      if (questPhaseRef.current === 'pre_quest') {
        openDlg(LINES_FIRST, acceptQuest);
        return;
      }
      if (questPhaseRef.current === 'return_curator') {
        openDlg(LINES_RETURN, finishQuest);
        return;
      }
    }

    // Vinyl pick up (via E key when close)
    if (!vinylRef.current && questPhaseRef.current === 'find_vinyl') {
      if (d(p.x, p.y, VINYL_POS.x, VINYL_POS.y) < INTERACT_R) {
        vinylRef.current = true;
        scoreRef.current += 25;
        questPhaseRef.current = 'return_curator';
        // vinyl collected — state tracked via questPhaseRef
        setQuestPhase('return_curator');
        setScore(scoreRef.current);
      }
    }
  }, [openDlg, acceptQuest, finishQuest]);

  // Keyboard
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp'    || k === 'w' || k === 'W') inputRef.current.up    = true;
      if (k === 'ArrowDown'  || k === 's' || k === 'S') inputRef.current.down  = true;
      if (k === 'ArrowLeft'  || k === 'a' || k === 'A') inputRef.current.left  = true;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') inputRef.current.right = true;
      if (k === 'e' || k === 'E' || k === ' ') handleInteract();
      if (k === 'Escape') { isPausedRef.current = !isPausedRef.current; setIsPaused((p) => !p); }
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp'    || k === 'w' || k === 'W') inputRef.current.up    = false;
      if (k === 'ArrowDown'  || k === 's' || k === 'S') inputRef.current.down  = false;
      if (k === 'ArrowLeft'  || k === 'a' || k === 'A') inputRef.current.left  = false;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') inputRef.current.right = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup',   ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [handleInteract]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      canvas.width  = width;
      canvas.height = height;
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId: number;

    const tick = () => {
      const ctx = canvas.getContext('2d');
      const vw = canvas.clientWidth  || canvas.offsetWidth;
      const vh = canvas.clientHeight || canvas.offsetHeight;

      if (!ctx || vw === 0 || vh === 0) { rafId = requestAnimationFrame(tick); return; }

      // ── Update ──────────────────────────────────────────────────────
      if (!isPausedRef.current && !isDialogueRef.current && !isCompleteRef.current) {
        const p   = playerRef.current;
        const inp = inputRef.current;
        const joy = joystickRef.current;

        let vx = 0, vy = 0;
        const jx = joy.dx, jy = joy.dy;

        if (inp.left  || jx < -0.2) vx = -P_SPEED * (Math.abs(jx) > 0.2 ? Math.min(1, Math.abs(jx)) : 1);
        if (inp.right || jx >  0.2) vx =  P_SPEED * (Math.abs(jx) > 0.2 ? Math.min(1, Math.abs(jx)) : 1);
        if (inp.up    || jy < -0.2) vy = -P_SPEED * (Math.abs(jy) > 0.2 ? Math.min(1, Math.abs(jy)) : 1);
        if (inp.down  || jy >  0.2) vy =  P_SPEED * (Math.abs(jy) > 0.2 ? Math.min(1, Math.abs(jy)) : 1);

        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

        if      (Math.abs(vx) > Math.abs(vy) && vx > 0) p.facing = 'right';
        else if (Math.abs(vx) > Math.abs(vy) && vx < 0) p.facing = 'left';
        else if (vy > 0) p.facing = 'down';
        else if (vy < 0) p.facing = 'up';

        if (vx !== 0) {
          const nx = p.x + vx;
          if (isWalkable(nx - P_HALF, p.y - P_HALF) && isWalkable(nx + P_HALF, p.y - P_HALF) &&
              isWalkable(nx - P_HALF, p.y + P_HALF) && isWalkable(nx + P_HALF, p.y + P_HALF))
            p.x = nx;
        }
        if (vy !== 0) {
          const ny = p.y + vy;
          if (isWalkable(p.x - P_HALF, ny - P_HALF) && isWalkable(p.x + P_HALF, ny - P_HALF) &&
              isWalkable(p.x - P_HALF, ny + P_HALF) && isWalkable(p.x + P_HALF, ny + P_HALF))
            p.y = ny;
        }

        // Auto-collect vinyl by walking into it
        if (!vinylRef.current && questPhaseRef.current === 'find_vinyl') {
          if (d(p.x, p.y, VINYL_POS.x, VINYL_POS.y) < COLLECT_R) {
            vinylRef.current = true;
            scoreRef.current += 25;
            questPhaseRef.current = 'return_curator';
            // vinyl collected — state tracked via questPhaseRef
            setQuestPhase('return_curator');
            setScore(scoreRef.current);
          }
        }
      }

      // ── Camera ──────────────────────────────────────────────────────
      const p = playerRef.current;
      const cam = cameraRef.current;
      cam.x = Math.max(0, Math.min(p.x - vw / 2, WORLD_W - vw));
      cam.y = Math.max(0, Math.min(p.y - vh / 2, WORLD_H - vh));

      // ── Render ──────────────────────────────────────────────────────
      ctx.clearRect(0, 0, vw, vh);
      ctx.fillStyle = '#090b14';
      ctx.fillRect(0, 0, vw, vh);

      drawMap(ctx, cam.x, cam.y, vw, vh);

      const nearNPC   = d(p.x, p.y, NPC_POS.x, NPC_POS.y) < INTERACT_R;
      const nearVinyl = !vinylRef.current && questPhaseRef.current === 'find_vinyl'
                        && d(p.x, p.y, VINYL_POS.x, VINYL_POS.y) < INTERACT_R;

      drawVinyl(ctx, cam.x, cam.y, vinylRef.current, nearVinyl);
      drawNPC(ctx, cam.x, cam.y, questPhaseRef.current, nearNPC);
      drawPlayer(ctx, p, cam.x, cam.y);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Joystick handler
  const handleJoystick = useCallback((dx: number, dy: number) => {
    joystickRef.current = { dx, dy };
  }, []);

  // Pause toggle
  const togglePause = useCallback(() => {
    isPausedRef.current = !isPausedRef.current;
    setIsPaused((p) => !p);
  }, []);

  // Reset everything
  const resetGame = useCallback(() => {
    playerRef.current     = { x: SPAWN_POS.x, y: SPAWN_POS.y, facing: 'up' };
    vinylRef.current      = false;
    questPhaseRef.current = 'pre_quest';
    isCompleteRef.current = false;
    isDialogueRef.current = false;
    isPausedRef.current   = false;
    scoreRef.current      = 0;
    setQuestPhase('pre_quest');
    setScore(0);
    setIsComplete(false);
    setIsPaused(false);
    setDlg(null);
    setSavedRank(null);
  }, []);

  const overlayActive = isPaused || dlg !== null || isComplete;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Canvas area */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden min-h-0">
        <canvas ref={canvasRef} className="block" style={{ touchAction: 'none' }} />

        {/* HUD */}
        {!isComplete && (
          <>
            <QuestHud questPhase={questPhase} />
            <ScoreHud score={score} />
            <PauseBtn onClick={togglePause} />
          </>
        )}

        {/* Dialogue overlay */}
        {dlg && (
          <div className="absolute inset-0 pointer-events-none">
            <DialogueBox dlg={dlg} onNext={advanceDlg} />
          </div>
        )}

        {/* Pause menu */}
        {isPaused && !isComplete && <PauseMenu onResume={togglePause} onQuit={onExit} />}

        {/* Complete screen */}
        {isComplete && (
          <CompleteScreen
            score={score}
            rank={savedRank}
            onPlayAgain={resetGame}
            onLeaderboard={() => { window.location.href = '/leaderboard'; }}
          />
        )}
      </div>

      {/* Mobile controls */}
      {isMobile && !overlayActive && (
        <div className="flex items-center justify-between px-6 py-3 bg-black/50 shrink-0 select-none" style={{ touchAction: 'none' }}>
          <VirtualJoystick onMove={handleJoystick} />
          <InteractBtn onInteract={handleInteract} />
        </div>
      )}
    </div>
  );
}

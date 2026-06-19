import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { bandRpgApi } from '../../api/bandRpg';
import type { BandRpgSelectedBand, BandRpgSelectedCharacter, BandRpgSession } from '../../api/bandRpg';

// ── World constants ──────────────────────────────────────────────────────────

const TILE = 44;
const COLS = 24;
const ROWS = 18;
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;

const P_HALF     = 13;
const P_SPEED    = 2.8;
const INTERACT_R = 58;
const COLLECT_R  = 28;

const NPC_POS   = { x: 11 * TILE + TILE / 2, y: 3  * TILE + TILE / 2 };
const SPAWN_POS = { x: 11 * TILE + TILE / 2, y: 15 * TILE + TILE / 2 };

// ── Tile map  0=wall  1=floor  2=bookshelf (impassable) ─────────────────────

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

// ── Spawn system ─────────────────────────────────────────────────────────────

interface SpawnConstraints {
  minDistFromPlayerPx: number;
  minDistFromNpcPx:    number;
  allowedTiles:        number[];
}

const DEFAULT_SPAWN_CONSTRAINTS: SpawnConstraints = {
  minDistFromPlayerPx: TILE * 4,
  minDistFromNpcPx:    TILE * 3,
  allowedTiles:        [1],
};

const VINYL_FALLBACK = { x: 20 * TILE + TILE / 2, y: 9 * TILE + TILE / 2 };

function getValidSpawnTiles(constraints: SpawnConstraints = DEFAULT_SPAWN_CONSTRAINTS): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = MAP[r]?.[c] ?? 0;
      if (!constraints.allowedTiles.includes(tile)) continue;
      const wx = c * TILE + TILE / 2;
      const wy = r * TILE + TILE / 2;
      if (
        Math.hypot(wx - SPAWN_POS.x, wy - SPAWN_POS.y) >= constraints.minDistFromPlayerPx &&
        Math.hypot(wx - NPC_POS.x,   wy - NPC_POS.y)   >= constraints.minDistFromNpcPx
      ) {
        result.push({ x: wx, y: wy });
      }
    }
  }
  return result;
}

function randomVinylPos(): { x: number; y: number } {
  const candidates = getValidSpawnTiles();
  if (candidates.length === 0) return VINYL_FALLBACK;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? VINYL_FALLBACK;
}

function getSpreadSpawnPositions(count: number): { x: number; y: number }[] {
  const candidates = getValidSpawnTiles();
  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = candidates[i]; candidates[i] = candidates[j]!; candidates[j] = tmp!;
  }
  const MIN_DIST = TILE * 5;
  const chosen: { x: number; y: number }[] = [];
  for (const pos of candidates) {
    if (chosen.length >= count) break;
    const tooClose = chosen.some((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < MIN_DIST);
    if (!tooClose) chosen.push(pos);
  }
  // Fill remaining from shuffled pool if spread was too strict
  if (chosen.length < count) {
    for (const pos of candidates) {
      if (chosen.length >= count) break;
      if (!chosen.includes(pos)) chosen.push(pos);
    }
  }
  return chosen.slice(0, count);
}

// ── Dialogue — dynamic per band + song ───────────────────────────────────────

interface DlgLine { speaker: string; text: string }

function buildQuestLines(
  bandName: string,
  songTitle: string | null,
): { intro: DlgLine[]; completion: DlgLine[] } {
  const songRef = songTitle ? `"${songTitle}"` : 'one of their recordings';
  return {
    intro: [
      { speaker: 'The Curator', text: `Ah — a visitor! I've been waiting for someone brave enough to help.` },
      { speaker: 'The Curator', text: `A recording of ${songRef} by ${bandName} has been scattered across The Archives.` },
      { speaker: 'The Curator', text: `Three lyric fragments are hidden somewhere in these halls. Find them to reconstruct the song.` },
      { speaker: 'The Curator', text: `Once the song is recovered, the vinyl will materialise. Bring it back to me.` },
    ],
    completion: [
      { speaker: 'The Curator', text: `Extraordinary! You recovered ${songRef}. This is a rare ${bandName} document.` },
      { speaker: 'The Curator', text: `The Archives owe you a great debt. Your contribution has been logged. +100 points.` },
    ],
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

type QuestPhase = 'pre_quest' | 'find_fragments' | 'song_revealed' | 'find_vinyl' | 'return_curator' | 'complete';
type Facing     = 'up' | 'down' | 'left' | 'right';

interface Player   { x: number; y: number; facing: Facing }
interface Input    { up: boolean; down: boolean; left: boolean; right: boolean }
interface DlgState { lines: DlgLine[]; idx: number; onDone: () => void }

interface LyricFragment {
  id:        string;
  text:      string;
  pos:       { x: number; y: number };
  collected: boolean;
}

interface Effect {
  id:        number;
  wx:        number;
  wy:        number;
  type:      'float_text' | 'burst';
  text?:     string;
  color:     string;
  startTime: number;
  duration:  number;
}

interface BannerData {
  title:    string;
  subtitle: string;
  color:    'amber' | 'violet' | 'emerald';
}

// ── Sound system ─────────────────────────────────────────────────────────────

let _audioCtx: AudioContext | null = null;
let isMuted = false;

function playTone(freq: number, dur: number, type: OscillatorType, vol: number): void {
  if (isMuted) return;
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const ctx = _audioCtx;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur);
  } catch { /* AudioContext unavailable */ }
}

function soundDialogueOpen():    void { playTone(440, 0.1, 'sine', 0.12); setTimeout(() => playTone(554, 0.1, 'sine', 0.1), 80); }
function soundDialogueAdvance(): void { playTone(330, 0.07, 'sine', 0.08); }
function soundQuestAccepted():   void { [392, 494, 587].forEach((f, i) => setTimeout(() => playTone(f, 0.12, 'triangle', 0.15), i * 100)); }
function soundFragmentPickup():  void { [523, 659].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'sine', 0.14), i * 60)); }
function soundSongReveal():      void { [392, 494, 587, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'triangle', 0.18), i * 90)); }
function soundItemPickup():      void { [659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'sine', 0.16), i * 70)); }
function soundQuestComplete():   void { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'triangle', 0.18), i * 120)); }

// ── Helpers ──────────────────────────────────────────────────────────────────

let isMobileHint = false;

function isWalkable(wx: number, wy: number): boolean {
  const col = Math.floor(wx / TILE);
  const row = Math.floor(wy / TILE);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return MAP[row]?.[col] === 1;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
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
        ctx.fillStyle = '#090b14'; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = '#0d0f1e'; ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
      } else if (tile === 1) {
        ctx.fillStyle = '#12142a'; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = '#181b34'; ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = '#1a0d06'; ctx.fillRect(sx, sy, TILE, TILE);
        let y = sy + 4; let bi = 0;
        while (y + 4 < sy + TILE - 4) {
          ctx.fillStyle = BOOK_COLORS[(c + r + bi) % BOOK_COLORS.length]!;
          ctx.fillRect(sx + 4, y, TILE - 8, 4);
          y += 5; bi++;
        }
        ctx.strokeStyle = '#4a2c12'; ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1);
      }
    }
  }
}

function drawNPC(ctx: CanvasRenderingContext2D, cx: number, cy: number, questPhase: QuestPhase, nearPlayer: boolean) {
  const sx = NPC_POS.x - cx;
  const sy = NPC_POS.y - cy;
  const now = performance.now();

  if (questPhase === 'return_curator') {
    const pulse = Math.sin(now / 350);
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.45 + pulse * 0.25;
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(sx, sy, 30 + pulse * 8, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = nearPlayer ? 20 : 6;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fcd34d';
  ctx.beginPath(); ctx.arc(sx, sy - 9, 8, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

  ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('The Curator', sx, sy - 28);

  if (questPhase === 'pre_quest' || questPhase === 'return_curator') {
    const bob = Math.sin(now / 380) * 3;
    ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = questPhase === 'return_curator' ? 14 : 4;
    ctx.fillText('!', sx, sy - 46 + bob);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  }

  if (questPhase === 'return_curator') {
    const bob = Math.sin(now / 380) * 3;
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8;
    ctx.fillText('↓ RETURN HERE ↓', sx, sy - 62 + bob);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  }

  if (nearPlayer) drawPrompt(ctx, sx, sy - 36, isMobileHint ? 'Tap E' : '[E] Talk');
}

function drawFragment(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  frag: LyricFragment,
  nearPlayer: boolean,
  index: number,
) {
  if (frag.collected) return;
  const sx = frag.pos.x - cx;
  const sy = frag.pos.y - cy;
  const now = performance.now();
  const bob  = Math.sin(now / 500 + index * 1.3) * 3;
  const pulse = Math.sin(now / 800 + index * 0.9);

  // Outer glow ring
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.25 + pulse * 0.15;
  ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(sx, sy + bob, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  // Amber orb
  ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 16 + pulse * 6;
  ctx.fillStyle = '#78350f';
  ctx.beginPath(); ctx.arc(sx, sy + bob, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(sx, sy + bob, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.beginPath(); ctx.arc(sx - 3, sy + bob - 3, 3, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

  // Music note symbol
  ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1c1917';
  ctx.fillText('♪', sx, sy + bob);

  // Label
  ctx.font = 'bold 8px sans-serif'; ctx.fillStyle = '#fcd34d';
  ctx.fillText(`FRAGMENT ${index + 1}`, sx, sy + bob - 24);

  // Show lyric text when near
  if (nearPlayer) {
    const maxW = 180;
    const words = frag.text.split(' ');
    const lineH = 13;
    const lines: string[] = [];
    let cur = '';
    ctx.font = 'italic 10px sans-serif';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxW) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);

    const boxW = maxW + 16;
    const boxH = lines.length * lineH + 14;
    const bx = sx - boxW / 2;
    const by = sy + bob - 44 - boxH;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 6); ctx.fill();
    ctx.fillStyle = '#fde68a';
    lines.forEach((l, li) => ctx.fillText(l, sx, by + 8 + li * lineH));

    drawPrompt(ctx, sx, sy + bob - 34, isMobileHint ? 'Tap E' : '[E] Collect');
  }
}

function drawVinyl(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  pos: { x: number; y: number },
  nearPlayer: boolean,
  songTitle: string | null,
) {
  const sx = pos.x - cx;
  const sy = pos.y - cy;
  const now = performance.now();
  const bob = Math.sin(now / 480) * 2.5;
  const pulse = Math.sin(now / 700);

  ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.28 + pulse * 0.18;
  ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(sx, sy + bob, 24, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 18 + pulse * 7;
  ctx.fillStyle = '#0d0515';
  ctx.beginPath(); ctx.arc(sx, sy + bob, 16, 0, Math.PI * 2); ctx.fill();

  for (let gr = 14; gr > 8; gr -= 2) {
    ctx.strokeStyle = '#1a0a2c'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(sx, sy + bob, gr, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.fillStyle = '#7c3aed';
  ctx.beginPath(); ctx.arc(sx, sy + bob, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#030307';
  ctx.beginPath(); ctx.arc(sx, sy + bob, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

  ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c4b5fd';
  const label = songTitle ? `🎵 ${songTitle}` : 'RECOVERED VINYL';
  ctx.fillText(label, sx, sy + bob - 26);
  if (nearPlayer) drawPrompt(ctx, sx, sy + bob - 36, isMobileHint ? 'Tap E' : '[E] Collect');
}

function drawPrompt(ctx: CanvasRenderingContext2D, sx: number, sy: number, text: string) {
  ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  const pw = tw + 14; const ph = 18;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.beginPath(); ctx.roundRect(sx - pw / 2, sy - ph / 2, pw, ph, 4); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillText(text, sx, sy);
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, cx: number, cy: number) {
  const sx = player.x - cx;
  const sy = player.y - cy;
  ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#4ade80';
  ctx.beginPath(); ctx.arc(sx, sy, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bbf7d0';
  ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  const FACING: Record<Facing, [number, number]> = { up: [0,-9], down: [0,9], left: [-9,0], right: [9,0] };
  const [fdx, fdy] = FACING[player.facing];
  ctx.fillStyle = '#052e16';
  ctx.beginPath(); ctx.arc(sx + fdx, sy + fdy, 3, 0, Math.PI * 2); ctx.fill();
}

function drawEffects(ctx: CanvasRenderingContext2D, cx: number, cy: number, effects: Effect[], now: number): void {
  let i = effects.length;
  while (i--) {
    const e = effects[i];
    if (!e) continue;
    const t = (now - e.startTime) / e.duration;
    if (t >= 1) { effects.splice(i, 1); continue; }
    const sx = e.wx - cx;
    const sy = e.wy - cy;
    if (e.type === 'float_text') {
      const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = e.color; ctx.shadowColor = e.color; ctx.shadowBlur = 10;
      ctx.fillText(e.text ?? '', sx, sy - t * 38);
      ctx.restore();
    } else {
      const radius = t * 38;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.75;
      ctx.strokeStyle = e.color; ctx.lineWidth = 2;
      ctx.shadowColor = e.color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.stroke();
      for (let j = 0; j < 6; j++) {
        const angle = (j / 6) * Math.PI * 2 + t * Math.PI;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(sx + Math.cos(angle) * radius * 0.75, sy + Math.sin(angle) * radius * 0.75, 2.5 * (1 - t), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
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
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl shrink-0">🧙</div>
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

function QuestHud({ questPhase, bandName, fragmentsCollected, songTitle }: {
  questPhase: QuestPhase;
  bandName: string;
  fragmentsCollected: number;
  songTitle: string | null;
}) {
  if (questPhase === 'pre_quest' || questPhase === 'complete') return null;

  return (
    <div className="absolute top-2 left-2 pointer-events-none">
      <div className="bg-black/70 border border-amber-500/30 rounded-lg px-3 py-2 text-xs max-w-[220px]">
        <p className="text-amber-400 font-bold mb-0.5 truncate">{bandName} · Song Discovery</p>
        {questPhase === 'find_fragments' && (
          <p className="text-gray-300">
            Find lyric fragments{' '}
            <span className="text-amber-300 font-mono">{fragmentsCollected}/3</span>
          </p>
        )}
        {questPhase === 'song_revealed' && (
          <p className="text-emerald-400 font-semibold">🎵 Song Recovered!</p>
        )}
        {questPhase === 'find_vinyl' && (
          <p className="text-gray-300">
            Recover the vinyl <span className="text-amber-300">0/1</span>
          </p>
        )}
        {questPhase === 'return_curator' && (
          <p className="text-gray-300">
            Return to The Curator <span className="text-amber-300">✓</span>
          </p>
        )}
        {songTitle && (questPhase === 'find_vinyl' || questPhase === 'return_curator') && (
          <p className="text-violet-400 text-xs mt-0.5 truncate">🎵 {songTitle}</p>
        )}
      </div>
    </div>
  );
}

function ScoreHud({ score }: { score: number }) {
  return (
    <div className="absolute top-2 right-24 pointer-events-none">
      <div className="bg-black/70 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs font-mono">
        <span className="text-emerald-400 font-bold">{score}</span>
        <span className="text-gray-500 ml-1">pts</span>
      </div>
    </div>
  );
}

function MuteBtn({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} title={muted ? 'Unmute' : 'Mute'}
      className="absolute top-2 right-12 w-8 h-8 bg-black/70 border border-gray-700 rounded-lg text-sm flex items-center justify-center hover:bg-black/90 transition-colors z-10">
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

function PauseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="absolute top-2 right-2 w-8 h-8 bg-black/70 border border-gray-700 rounded-lg text-white text-sm flex items-center justify-center hover:bg-black/90 transition-colors z-10">
      ⏸
    </button>
  );
}

function CharacterHud({ char }: { char: BandRpgSelectedCharacter }) {
  return (
    <div className="absolute bottom-2 left-2 pointer-events-none">
      <div className="bg-black/70 border border-violet-500/30 rounded-lg p-1.5 flex items-center gap-2">
        {char.dataUrl ? (
          <img src={char.dataUrl} alt={char.name} className="w-8 h-8 object-cover rounded" />
        ) : (
          <div className="w-8 h-8 rounded bg-violet-900/60 border border-violet-500/40 flex items-center justify-center text-violet-300 text-sm font-bold">
            {char.id === 'archivist' ? '🧙' : char.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-violet-400 text-xs font-bold leading-none">{char.name}</p>
          {char.role && <p className="text-gray-500 text-xs mt-0.5">{char.role}</p>}
        </div>
      </div>
    </div>
  );
}

function QuestBanner({ data, onDismiss }: { data: BannerData; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 2800);
    return () => window.clearTimeout(t);
  }, [onDismiss]);

  const borderCls = data.color === 'amber'  ? 'border-amber-500/60'
                  : data.color === 'violet' ? 'border-violet-500/60'
                  :                            'border-emerald-500/60';
  const titleCls  = data.color === 'amber'  ? 'text-amber-400'
                  : data.color === 'violet' ? 'text-violet-400'
                  :                            'text-emerald-400';

  return (
    <div className="absolute inset-x-0 top-14 flex justify-center pointer-events-none z-30">
      <div className={`bg-gray-900/95 border ${borderCls} rounded-xl px-6 py-3 text-center shadow-2xl`}>
        <p className={`font-bold text-sm ${titleCls}`}>{data.title}</p>
        <p className="text-gray-300 text-xs mt-0.5">{data.subtitle}</p>
      </div>
    </div>
  );
}

function SongRevealBanner({ songTitle, bandName, onDone }: {
  songTitle: string | null;
  bandName: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
      <div className="bg-gray-950/95 border-2 border-emerald-500/60 rounded-2xl px-8 py-6 text-center shadow-2xl max-w-sm mx-4">
        <div className="text-4xl mb-3">🎵</div>
        <p className="text-emerald-400 font-bold text-xs uppercase tracking-widest mb-1">Song Recovered</p>
        {songTitle ? (
          <p className="text-white font-bold text-lg leading-snug">{songTitle}</p>
        ) : (
          <p className="text-white font-bold text-lg">Unknown Recording</p>
        )}
        <p className="text-gray-500 text-xs mt-1">{bandName}</p>
        <p className="text-gray-600 text-xs mt-3">The vinyl is now materialising…</p>
      </div>
    </div>
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

function CompleteScreen({ score, rank, bandName, characterName, songTitle, onPlayAgain, onChangeBand, onLeaderboard }: {
  score: number; rank: number | null; bandName: string; characterName: string; songTitle: string | null;
  onPlayAgain: () => void; onChangeBand: () => void; onLeaderboard: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto z-20">
      <div className="bg-gray-900 border border-emerald-500/40 rounded-2xl p-8 text-center max-w-sm mx-4">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-bold text-emerald-400 mb-1">Quest Complete!</h2>
        <p className="text-violet-400 text-xs mb-1">{bandName} · {characterName}</p>
        {songTitle && (
          <p className="text-amber-400 text-xs mb-4">🎵 {songTitle}</p>
        )}
        <div className="bg-black/40 rounded-xl p-4 mb-6">
          <div className="text-4xl font-bold text-white mb-1">{score}</div>
          <div className="text-gray-400 text-sm">points earned</div>
          {rank !== null && (
            <div className="text-emerald-400 text-sm mt-2 font-semibold">Leaderboard rank: #{rank}</div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={onPlayAgain}   className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">Play Again</button>
          <button onClick={onChangeBand}  className="bg-violet-700/60 hover:bg-violet-700 text-violet-200 font-semibold px-6 py-2.5 rounded-lg transition-colors">Change Band</button>
          <button onClick={onLeaderboard} className="bg-white/10 hover:bg-white/20 text-gray-300 font-semibold px-6 py-2.5 rounded-lg transition-colors">View Leaderboard</button>
        </div>
      </div>
    </div>
  );
}

function VirtualJoystick({ onMove }: { onMove: (dx: number, dy: number) => void }) {
  const MAX_R = 38;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const center   = useRef({ x: 0, y: 0 });
  const activeId = useRef<number | null>(null);
  const baseRef  = useRef<HTMLDivElement>(null);

  function updateFromClient(cx: number, cy: number) {
    let dx = cx - center.current.x;
    let dy = cy - center.current.y;
    const d = Math.hypot(dx, dy);
    if (d > MAX_R) { dx = (dx / d) * MAX_R; dy = (dy / d) * MAX_R; }
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
  function handleMove(e: React.PointerEvent) { if (e.pointerId !== activeId.current) return; updateFromClient(e.clientX, e.clientY); }
  function handleUp(e: React.PointerEvent) {
    if (e.pointerId !== activeId.current) return;
    activeId.current = null; setKnob({ x: 0, y: 0 }); onMove(0, 0);
  }

  return (
    <div ref={baseRef}
      className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/25 relative touch-none select-none"
      onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={handleUp}
    >
      <div className="absolute w-10 h-10 rounded-full bg-white/35 border-2 border-white/55 pointer-events-none"
        style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
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

interface BandRpgGameProps {
  onExit:         () => void;
  onChangeBand:   () => void;
  onNewRun:       (session: BandRpgSession) => void;
  selectedBand:   BandRpgSelectedBand;
  selectedCharacter: BandRpgSelectedCharacter;
  session:        BandRpgSession;
  refetchSession: () => Promise<BandRpgSession>;
}

export default function BandRpgGame({
  onExit, onChangeBand, onNewRun,
  selectedBand, selectedCharacter,
  session, refetchSession,
}: BandRpgGameProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Live session ref — updated on Play Again to hold fresh session
  const sessionRef = useRef<BandRpgSession>(session);

  // Game-loop refs
  const playerRef       = useRef<Player>({ x: SPAWN_POS.x, y: SPAWN_POS.y, facing: 'up' });
  const cameraRef       = useRef({ x: 0, y: 0 });
  const inputRef        = useRef<Input>({ up: false, down: false, left: false, right: false });
  const joystickRef     = useRef({ dx: 0, dy: 0 });
  const vinylRef        = useRef(false);
  const vinylPosRef     = useRef<{ x: number; y: number }>(randomVinylPos());
  const questPhaseRef   = useRef<QuestPhase>('pre_quest');
  const isPausedRef     = useRef(false);
  const isDialogueRef   = useRef(false);
  const isCompleteRef   = useRef(false);
  const scoreRef        = useRef(0);
  const effectsRef      = useRef<Effect[]>([]);
  const effectIdRef     = useRef(0);

  // Fragment state (3 lyric fragments)
  const fragmentsRef     = useRef<LyricFragment[]>([]);
  const collectedCountRef = useRef(0);

  // Build dialogue using current session's song title
  const dialogueRef = useRef(buildQuestLines(selectedBand.name, session.songTitle));

  // React state for UI
  const [questPhase,        setQuestPhase]        = useState<QuestPhase>('pre_quest');
  const [score,             setScore]             = useState(0);
  const [isPaused,          setIsPaused]          = useState(false);
  const [dlg,               setDlg]               = useState<DlgState | null>(null);
  const [isComplete,        setIsComplete]        = useState(false);
  const [savedRank,         setSavedRank]         = useState<number | null>(null);
  const [isMobile,          setIsMobile]          = useState(false);
  const [banner,            setBanner]            = useState<BannerData | null>(null);
  const [muted,             setMuted]             = useState(false);
  const [fragmentsCollected, setFragmentsCollected] = useState(0);
  const [showSongReveal,    setShowSongReveal]    = useState(false);

  // Keep sessionRef in sync when prop changes (Play Again path)
  useEffect(() => { sessionRef.current = session; }, [session]);

  function initFragments(sess: BandRpgSession): LyricFragment[] {
    const positions = getSpreadSpawnPositions(3);
    return sess.fragments.map((frag, i) => ({
      id:        frag.id,
      text:      frag.text,
      pos:       positions[i] ?? randomVinylPos(),
      collected: false,
    }));
  }

  // Initialize fragments from session on mount
  useEffect(() => {
    fragmentsRef.current = initFragments(session);
    dialogueRef.current  = buildQuestLines(selectedBand.name, session.songTitle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    const mobile = window.innerWidth < 768 || 'ontouchstart' in window;
    setIsMobile(mobile);
    isMobileHint = mobile;
  }, []);

  const submitScore = useMutation({
    mutationFn: (data: Parameters<typeof bandRpgApi.submitScore>[0]) => bandRpgApi.submitScore(data),
    onSuccess: (r) => setSavedRank(r.rank),
    onError:   () => setSavedRank(null),
  });

  const saveProgress = useMutation({
    mutationFn: (data: Parameters<typeof bandRpgApi.saveProgress>[0]) => bandRpgApi.saveProgress(data),
    onError: () => { /* silent — auth may not be available */ },
  });

  const dismissBanner = useCallback(() => setBanner(null), []);

  const toggleMute = useCallback(() => {
    isMuted = !isMuted;
    setMuted(isMuted);
  }, []);

  const advanceDlg = useCallback(() => {
    soundDialogueAdvance();
    setDlg((prev) => {
      if (!prev) return null;
      if (prev.idx + 1 < prev.lines.length) return { ...prev, idx: prev.idx + 1 };
      prev.onDone();
      isDialogueRef.current = false;
      return null;
    });
  }, []);

  const openDlg = useCallback((lines: DlgLine[], onDone: () => void) => {
    isDialogueRef.current = true;
    soundDialogueOpen();
    setDlg({ lines, idx: 0, onDone });
  }, []);

  const acceptQuest = useCallback(() => {
    questPhaseRef.current = 'find_fragments';
    setQuestPhase('find_fragments');
    setBanner({ title: 'Quest Accepted!', subtitle: 'Find 3 lyric fragments in The Archives', color: 'amber' });
    effectsRef.current.push({
      id: ++effectIdRef.current, wx: NPC_POS.x, wy: NPC_POS.y - 20,
      type: 'float_text', text: 'Quest!', color: '#fbbf24',
      startTime: performance.now(), duration: 1200,
    });
    soundQuestAccepted();
  }, []);

  const spawnVinylAfterReveal = useCallback(() => {
    vinylPosRef.current   = randomVinylPos();
    questPhaseRef.current = 'find_vinyl';
    setQuestPhase('find_vinyl');
    setShowSongReveal(false);
    setBanner({ title: 'Vinyl Materialised!', subtitle: 'Find and recover the vinyl record', color: 'violet' });
  }, []);

  const handleSongRevealDone = useCallback(() => {
    spawnVinylAfterReveal();
  }, [spawnVinylAfterReveal]);

  const finishQuest = useCallback(() => {
    scoreRef.current += 100;
    const finalScore = scoreRef.current;
    const sess = sessionRef.current;
    effectsRef.current.push({
      id: ++effectIdRef.current, wx: NPC_POS.x, wy: NPC_POS.y - 24,
      type: 'float_text', text: '+100', color: '#4ade80',
      startTime: performance.now(), duration: 1400,
    });
    effectsRef.current.push({
      id: ++effectIdRef.current, wx: NPC_POS.x, wy: NPC_POS.y,
      type: 'burst', color: '#4ade80',
      startTime: performance.now(), duration: 800,
    });
    questPhaseRef.current = 'complete';
    isCompleteRef.current = true;
    setQuestPhase('complete');
    setIsComplete(true);
    setScore(finalScore);
    soundQuestComplete();
    submitScore.mutate({
      score: finalScore, questsCompleted: 1, itemsCollected: 4, levelsCleared: 0,
      bandId: selectedBand.id, bandName: selectedBand.name,
      characterId: selectedCharacter.id, characterName: selectedCharacter.name,
      ...(sess.songId    ? { songId: sess.songId }       : {}),
      ...(sess.songTitle ? { songTitle: sess.songTitle } : {}),
    });
    saveProgress.mutate({
      questPhase: 'complete', score: finalScore,
      bandId: selectedBand.id, bandName: selectedBand.name,
      characterId: selectedCharacter.id, characterName: selectedCharacter.name,
    });
  }, [submitScore, saveProgress, selectedBand, selectedCharacter]);

  const handleInteract = useCallback(() => {
    if (isDialogueRef.current || isPausedRef.current || isCompleteRef.current) return;
    const p = playerRef.current;

    // NPC interactions
    if (dist(p.x, p.y, NPC_POS.x, NPC_POS.y) < INTERACT_R) {
      if (questPhaseRef.current === 'pre_quest')      { openDlg(dialogueRef.current.intro,      acceptQuest); return; }
      if (questPhaseRef.current === 'return_curator') { openDlg(dialogueRef.current.completion, finishQuest); return; }
    }

    // Fragment collection (E-key)
    if (questPhaseRef.current === 'find_fragments') {
      for (const frag of fragmentsRef.current) {
        if (!frag.collected && dist(p.x, p.y, frag.pos.x, frag.pos.y) < INTERACT_R) {
          collectFragment(frag);
          return;
        }
      }
    }

    // Vinyl collection (E-key)
    if (!vinylRef.current && questPhaseRef.current === 'find_vinyl') {
      const vpos = vinylPosRef.current;
      if (dist(p.x, p.y, vpos.x, vpos.y) < INTERACT_R) {
        collectVinyl(vpos);
      }
    }
  }, [openDlg, acceptQuest, finishQuest]); // collectFragment + collectVinyl defined below

  const collectFragment = useCallback((frag: LyricFragment) => {
    frag.collected = true;
    scoreRef.current += 25;
    const newCount = ++collectedCountRef.current;
    setScore(scoreRef.current);
    setFragmentsCollected(newCount);

    effectsRef.current.push({ id: ++effectIdRef.current, wx: frag.pos.x, wy: frag.pos.y - 20, type: 'float_text', text: '+25 ♪', color: '#fbbf24', startTime: performance.now(), duration: 1200 });
    effectsRef.current.push({ id: ++effectIdRef.current, wx: frag.pos.x, wy: frag.pos.y, type: 'burst', color: '#f59e0b', startTime: performance.now(), duration: 600 });
    soundFragmentPickup();

    if (newCount >= 3) {
      // All 3 fragments collected — trigger song reveal
      questPhaseRef.current = 'song_revealed';
      setQuestPhase('song_revealed');
      setShowSongReveal(true);
      soundSongReveal();
      dialogueRef.current = buildQuestLines(selectedBand.name, sessionRef.current.songTitle);
    }
  }, [selectedBand.name]);

  const collectVinyl = useCallback((vpos: { x: number; y: number }) => {
    vinylRef.current = true;
    scoreRef.current += 25;
    questPhaseRef.current = 'return_curator';
    setQuestPhase('return_curator');
    setScore(scoreRef.current);
    setBanner({ title: 'Vinyl Recovered!', subtitle: 'Return to The Curator', color: 'violet' });
    effectsRef.current.push({ id: ++effectIdRef.current, wx: vpos.x, wy: vpos.y - 20, type: 'float_text', text: '+25', color: '#c4b5fd', startTime: performance.now(), duration: 1200 });
    effectsRef.current.push({ id: ++effectIdRef.current, wx: vpos.x, wy: vpos.y, type: 'burst', color: '#a78bfa', startTime: performance.now(), duration: 600 });
    soundItemPickup();
  }, []);

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
      canvas.width  = width; canvas.height = height;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
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
              isWalkable(nx - P_HALF, p.y + P_HALF) && isWalkable(nx + P_HALF, p.y + P_HALF)) p.x = nx;
        }
        if (vy !== 0) {
          const ny = p.y + vy;
          if (isWalkable(p.x - P_HALF, ny - P_HALF) && isWalkable(p.x + P_HALF, ny - P_HALF) &&
              isWalkable(p.x - P_HALF, ny + P_HALF) && isWalkable(p.x + P_HALF, ny + P_HALF)) p.y = ny;
        }

        // Auto-collect fragments
        if (questPhaseRef.current === 'find_fragments') {
          for (const frag of fragmentsRef.current) {
            if (!frag.collected && dist(p.x, p.y, frag.pos.x, frag.pos.y) < COLLECT_R) {
              collectFragment(frag);
              break; // collect one per frame
            }
          }
        }

        // Auto-collect vinyl
        if (!vinylRef.current && questPhaseRef.current === 'find_vinyl') {
          const vpos = vinylPosRef.current;
          if (dist(p.x, p.y, vpos.x, vpos.y) < COLLECT_R) {
            collectVinyl(vpos);
          }
        }
      }

      // Camera
      const p = playerRef.current;
      const cam = cameraRef.current;
      cam.x = Math.max(0, Math.min(p.x - vw / 2, WORLD_W - vw));
      cam.y = Math.max(0, Math.min(p.y - vh / 2, WORLD_H - vh));

      // Render
      const now = performance.now();
      ctx.clearRect(0, 0, vw, vh);
      ctx.fillStyle = '#090b14'; ctx.fillRect(0, 0, vw, vh);
      drawMap(ctx, cam.x, cam.y, vw, vh);

      const nearNPC   = dist(p.x, p.y, NPC_POS.x, NPC_POS.y) < INTERACT_R;
      const vpos      = vinylPosRef.current;
      const nearVinyl = !vinylRef.current && questPhaseRef.current === 'find_vinyl'
                        && dist(p.x, p.y, vpos.x, vpos.y) < INTERACT_R;

      // Draw fragments
      if (questPhaseRef.current === 'find_fragments') {
        fragmentsRef.current.forEach((frag, i) => {
          const nearFrag = !frag.collected && dist(p.x, p.y, frag.pos.x, frag.pos.y) < INTERACT_R;
          drawFragment(ctx, cam.x, cam.y, frag, nearFrag, i);
        });
      }

      // Draw vinyl only after song reveal
      if (questPhaseRef.current === 'find_vinyl' || questPhaseRef.current === 'return_curator') {
        drawVinyl(ctx, cam.x, cam.y, vpos, nearVinyl, sessionRef.current.songTitle);
      }

      drawNPC(ctx, cam.x, cam.y, questPhaseRef.current, nearNPC);
      drawPlayer(ctx, p, cam.x, cam.y);
      drawEffects(ctx, cam.x, cam.y, effectsRef.current, now);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [collectFragment, collectVinyl]);

  const handleJoystick = useCallback((dx: number, dy: number) => { joystickRef.current = { dx, dy }; }, []);

  const togglePause = useCallback(() => {
    isPausedRef.current = !isPausedRef.current;
    setIsPaused((p) => !p);
  }, []);

  const resetGame = useCallback((newSession: BandRpgSession) => {
    sessionRef.current      = newSession;
    dialogueRef.current     = buildQuestLines(selectedBand.name, newSession.songTitle);
    fragmentsRef.current    = initFragments(newSession);
    collectedCountRef.current = 0;
    vinylPosRef.current     = randomVinylPos();
    playerRef.current       = { x: SPAWN_POS.x, y: SPAWN_POS.y, facing: 'up' };
    vinylRef.current        = false;
    questPhaseRef.current   = 'pre_quest';
    isCompleteRef.current   = false;
    isDialogueRef.current   = false;
    isPausedRef.current     = false;
    scoreRef.current        = 0;
    effectsRef.current      = [];
    setQuestPhase('pre_quest');
    setScore(0);
    setIsComplete(false);
    setIsPaused(false);
    setDlg(null);
    setSavedRank(null);
    setBanner(null);
    setFragmentsCollected(0);
    setShowSongReveal(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBand.name]);

  const handlePlayAgain = useCallback(() => {
    refetchSession()
      .then((newSession) => {
        resetGame(newSession);
        onNewRun(newSession);
      })
      .catch(() => {
        // Fallback: reuse same session with new positions
        const fallback: BandRpgSession = { ...sessionRef.current };
        resetGame(fallback);
        onNewRun(fallback);
      });
  }, [refetchSession, resetGame, onNewRun]);

  const overlayActive = isPaused || dlg !== null || isComplete || showSongReveal;

  const currentSongTitle = sessionRef.current.songTitle;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div ref={containerRef} className="relative flex-1 overflow-hidden min-h-0">
        <canvas ref={canvasRef} className="block" style={{ touchAction: 'none' }} />

        {!isComplete && (
          <>
            <QuestHud
              questPhase={questPhase}
              bandName={selectedBand.name}
              fragmentsCollected={fragmentsCollected}
              songTitle={currentSongTitle}
            />
            <ScoreHud score={score} />
            <MuteBtn muted={muted} onToggle={toggleMute} />
            <PauseBtn onClick={togglePause} />
            <CharacterHud char={selectedCharacter} />
          </>
        )}

        {banner && <QuestBanner key={banner.title} data={banner} onDismiss={dismissBanner} />}

        {showSongReveal && (
          <SongRevealBanner
            songTitle={currentSongTitle}
            bandName={selectedBand.name}
            onDone={handleSongRevealDone}
          />
        )}

        {dlg && (
          <div className="absolute inset-0 pointer-events-none">
            <DialogueBox dlg={dlg} onNext={advanceDlg} />
          </div>
        )}

        {isPaused && !isComplete && <PauseMenu onResume={togglePause} onQuit={onExit} />}

        {isComplete && (
          <CompleteScreen
            score={score}
            rank={savedRank}
            bandName={selectedBand.name}
            characterName={selectedCharacter.name}
            songTitle={currentSongTitle}
            onPlayAgain={handlePlayAgain}
            onChangeBand={onChangeBand}
            onLeaderboard={() => { window.location.href = '/leaderboard'; }}
          />
        )}
      </div>

      {isMobile && !overlayActive && (
        <div className="flex items-center justify-between px-6 py-3 bg-black/50 shrink-0 select-none" style={{ touchAction: 'none' }}>
          <VirtualJoystick onMove={handleJoystick} />
          <InteractBtn onInteract={handleInteract} />
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { bandRpgApi } from '../../api/bandRpg';
import type { BandRpgSelectedBand, BandRpgSelectedCharacter, BandRpgSession, BandRpgSong } from '../../api/bandRpg';

// ── Rarity system ────────────────────────────────────────────────────────────

const RARITY_SCORE_BONUS: Record<string, number> = {
  Common:    0,
  Uncommon:  25,
  Rare:      75,
  Legendary: 200,
  Mythic:    500,
};

const RARITY_LABEL: Record<string, string> = {
  Common:    '⚪ Common',
  Uncommon:  '🟢 Uncommon',
  Rare:      '🔵 Rare',
  Legendary: '🟣 Legendary',
  Mythic:    '🟠 Mythic',
};

const RARITY_COLOR: Record<string, string> = {
  Common:    'text-gray-400',
  Uncommon:  'text-emerald-400',
  Rare:      'text-blue-400',
  Legendary: 'text-purple-400',
  Mythic:    'text-orange-400',
};

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

// ── Archive tuning — all difficulty values in one place ───────────────────────
const ARCHIVE_TUNING = {
  // Normal visitors
  visitorSpeedSlow:    0.7,
  visitorSpeedFast:    1.2,
  visitorGrabChance:   0.0025,     // per-frame probability
  visitorGrabRadius:   TILE * 2,
  // Fragment behaviors
  fragmentDriftSpeed:  0.55,
  fragmentEscapeSpeed: 1.6,
  escapeRadius:        TILE * 3.5,
  // Crowd Rush encounter
  crowdRushDuration:       12000,  // ms
  crowdRushVisitorCount:   4,
  crowdRushSpeed:          2.1,
  crowdRushGrabChance:     0.008,
  crowdRushGrabRadius:     TILE * 1.8,
} as const;

// Derived shortcuts (use ARCHIVE_TUNING as source of truth above)
const VISITOR_COLORS        = ['#60a5fa', '#f472b6', '#a78bfa', '#34d399', '#fbbf24'];
const CROWD_RUSH_COLORS     = ['#f97316', '#ef4444', '#ec4899', '#dc2626', '#fb923c'];
const VISITOR_SPEED_SLOW    = ARCHIVE_TUNING.visitorSpeedSlow;
const VISITOR_SPEED_FAST    = ARCHIVE_TUNING.visitorSpeedFast;
const VISITOR_GRAB_CHANCE   = ARCHIVE_TUNING.visitorGrabChance;
const VISITOR_GRAB_RADIUS   = ARCHIVE_TUNING.visitorGrabRadius;
const FRAGMENT_DRIFT_SPEED  = ARCHIVE_TUNING.fragmentDriftSpeed;
const FRAGMENT_ESCAPE_SPEED = ARCHIVE_TUNING.fragmentEscapeSpeed;
const ESCAPE_RADIUS         = ARCHIVE_TUNING.escapeRadius;

// Listening booth — fixed position in the open area bottom-right
const BOOTH_POS = { x: 19 * TILE + TILE / 2, y: 13 * TILE + TILE / 2 };

// LocalStorage keys
const ARCHIVE_LS_RUN_KEY  = 'bsm-archive-runs';
const ARCHIVE_LS_HINT_KEY = 'bsm-archive-hint-seen';

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

// ── Progression helpers ───────────────────────────────────────────────────────

function getArchiveRunCount(): number {
  try { return Math.max(0, parseInt(localStorage.getItem(ARCHIVE_LS_RUN_KEY) ?? '0') || 0); }
  catch { return 0; }
}
function incrementArchiveRunCount(): void {
  try { localStorage.setItem(ARCHIVE_LS_RUN_KEY, String(getArchiveRunCount() + 1)); }
  catch { /* ignore */ }
}
function archiveHintSeen(): boolean {
  try { return localStorage.getItem(ARCHIVE_LS_HINT_KEY) === '1'; }
  catch { return false; }
}
function markArchiveHintSeen(): void {
  try { localStorage.setItem(ARCHIVE_LS_HINT_KEY, '1'); }
  catch { /* ignore */ }
}

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
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = candidates[i]; candidates[i] = candidates[j]!; candidates[j] = tmp!;
  }
  const MIN_DIST = TILE * 5;
  const chosen: { x: number; y: number }[] = [];
  for (const pos of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.some((c) => Math.hypot(c.x - pos.x, c.y - pos.y) < MIN_DIST)) chosen.push(pos);
  }
  for (const pos of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.includes(pos)) chosen.push(pos);
  }
  return chosen.slice(0, count);
}

// ── Dialogue ─────────────────────────────────────────────────────────────────

interface DlgLine { speaker: string; text: string }

function buildQuestLines(bandName: string, songTitle: string | null): { intro: DlgLine[]; completion: DlgLine[] } {
  const songRef = songTitle ? `"${songTitle}"` : 'one of their recordings';
  return {
    intro: [
      { speaker: 'The Curator', text: `Ah — a visitor! I've been waiting for someone brave enough to help.` },
      { speaker: 'The Curator', text: `A recording by ${bandName} has been scattered across The Archives.` },
      { speaker: 'The Curator', text: `Three lyric fragments are hidden in these halls. Find them and you may be able to identify the song.` },
      { speaker: 'The Curator', text: `Once you've recovered the fragments, consult your journal. The vinyl will materialise when you're ready.` },
    ],
    completion: [
      { speaker: 'The Curator', text: `Extraordinary. You recovered ${songRef} by ${bandName}.` },
      { speaker: 'The Curator', text: `The Archives are in your debt. Your contribution has been logged. +100 points.` },
    ],
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

// Extensible clue type — lyric is just the first. Future: equipment, drum_chart, recording_note, etc.
interface Clue {
  id:        string;
  type:      'lyric';
  icon:      string;
  label:     string;
  content:   string;
  collected: boolean;
}

// QuestPhase: journal_review sits between find_fragments and find_vinyl.
// During journal_review the player reviews clues, optionally guesses, then reveals.
type QuestPhase = 'pre_quest' | 'find_fragments' | 'journal_review' | 'find_vinyl' | 'return_curator' | 'complete';
type Facing     = 'up' | 'down' | 'left' | 'right';

interface Player   { x: number; y: number; facing: Facing }
interface Input    { up: boolean; down: boolean; left: boolean; right: boolean }
interface DlgState { lines: DlgLine[]; idx: number; onDone: () => void }

type FragBehavior = 'static' | 'drift' | 'escape';

interface LyricFragment {
  id:          string;
  text:        string;
  pos:         { x: number; y: number };
  collected:   boolean;
  behavior:    FragBehavior;
  vx:          number;
  vy:          number;
  carriedById: number | null; // id of ArchiveVisitor carrying this fragment
}

type VisitorState = 'wandering' | 'chasing' | 'carrying';

interface ArchiveVisitor {
  id:              number;
  x:               number;
  y:               number;
  speed:           number;
  tx:              number;
  ty:              number;
  state:           VisitorState;
  carryingFragId:  string | null;
  wanderCooldown:  number;
  color:           string;
  noticedFragId:   string | null; // fragment nearby (not yet grabbed) — shows "!" cue
  isCrowdRusher:   boolean;       // crowd rush visitors behave and render differently
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

interface EventToast {
  id:      number;
  message: string;
}

interface CrowdRushState {
  active:          boolean;
  timeRemainingMs: number;
  rushers:         ArchiveVisitor[];
  fragsSaved:      number;
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

function soundDialogueOpen():       void { playTone(440, 0.1, 'sine', 0.12); setTimeout(() => playTone(554, 0.1, 'sine', 0.1), 80); }
function soundDialogueAdvance():    void { playTone(330, 0.07, 'sine', 0.08); }
function soundQuestAccepted():      void { [392, 494, 587].forEach((f, i) => setTimeout(() => playTone(f, 0.12, 'triangle', 0.15), i * 100)); }
function soundFragmentPickup():     void { [523, 659].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'sine', 0.14), i * 60)); }
function soundAllFragmentsFound():  void { [392, 494, 587, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'triangle', 0.18), i * 90)); }
function soundCorrectGuess():       void { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'triangle', 0.2), i * 80)); }
function soundRevealSong():         void { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'sine', 0.14), i * 110)); }
function soundItemPickup():         void { [659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.1, 'sine', 0.16), i * 70)); }
function soundQuestComplete():      void { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.15, 'triangle', 0.18), i * 120)); }

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

function fragmentsToClues(fragments: LyricFragment[]): Clue[] {
  return fragments.map((f, i) => ({
    id:        f.id,
    type:      'lyric',
    icon:      '📜',
    label:     `Fragment ${i + 1}`,
    content:   f.text,
    collected: f.collected,
  }));
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

  // Carried fragments: render as a small glowing note floating above the visitor
  if (frag.carriedById !== null) {
    const sx = frag.pos.x - cx;
    const sy = frag.pos.y - cy - 22;
    const now2 = performance.now();
    const bob2 = Math.sin(now2 / 400 + index) * 2;
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#92400e';
    ctx.beginPath(); ctx.arc(sx, sy + bob2, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(sx, sy + bob2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1c1917';
    ctx.fillText('♪', sx, sy + bob2);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    return;
  }

  const sx = frag.pos.x - cx;
  const sy = frag.pos.y - cy;
  const now = performance.now();
  const bob = Math.sin(now / 500 + index * 1.3) * 3;

  // Per-behavior color scheme
  const glowColor = frag.behavior === 'escape' ? '#ef4444'
                  : frag.behavior === 'drift'   ? '#38bdf8'
                  :                               '#f59e0b';
  const coreColor = frag.behavior === 'escape' ? '#7f1d1d'
                  : frag.behavior === 'drift'   ? '#0c4a6e'
                  :                               '#78350f';
  const dotColor  = frag.behavior === 'escape' ? '#fca5a5'
                  : frag.behavior === 'drift'   ? '#bae6fd'
                  :                               '#fbbf24';

  // Drift: draw a motion trail behind velocity direction
  if (frag.behavior === 'drift' && (frag.vx !== 0 || frag.vy !== 0)) {
    const len = Math.hypot(frag.vx, frag.vy) || 1;
    const ndx = -(frag.vx / len) * 10;
    const ndy = -(frag.vy / len) * 10;
    for (let t = 1; t <= 2; t++) {
      ctx.globalAlpha = 0.18 - t * 0.05;
      ctx.fillStyle = glowColor;
      ctx.beginPath(); ctx.arc(sx + ndx * t, sy + ndy * t + bob, 9 - t * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Escape: nervous shake offset
  let shakeX = 0, shakeY = 0;
  if (frag.behavior === 'escape') {
    shakeX = Math.sin(now / 80 + index * 2.1) * 1.8;
    shakeY = Math.cos(now / 60 + index * 1.7) * 1.8;
  }

  const pulsePeriod = frag.behavior === 'escape' ? 300 : 800;
  const pulse = Math.sin(now / pulsePeriod + index * 0.9);
  const sx2 = sx + shakeX;
  const sy2 = sy + bob + shakeY;

  ctx.strokeStyle = glowColor; ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.25 + pulse * 0.15;
  ctx.shadowColor = glowColor; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(sx2, sy2, 22, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.shadowColor = glowColor; ctx.shadowBlur = 16 + pulse * 6;
  ctx.fillStyle = coreColor;
  ctx.beginPath(); ctx.arc(sx2, sy2, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dotColor;
  ctx.beginPath(); ctx.arc(sx2, sy2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.beginPath(); ctx.arc(sx2 - 3, sy2 - 3, 3, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

  ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1c1917';
  ctx.fillText('♪', sx2, sy2);

  // Behavior label prefix makes each type visually distinct at a glance
  const prefix = frag.behavior === 'drift' ? '〜 ' : frag.behavior === 'escape' ? '! ' : '';
  ctx.font = 'bold 8px sans-serif'; ctx.fillStyle = dotColor;
  ctx.fillText(`${prefix}FRAGMENT ${index + 1}`, sx2, sy2 - 24);

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

    const boxW = maxW + 16; const boxH = lines.length * lineH + 14;
    const bx = sx2 - boxW / 2; const by = sy2 - 48 - boxH;
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.beginPath(); ctx.roundRect(bx, by, boxW, boxH, 6); ctx.fill();
    ctx.fillStyle = '#fde68a';
    lines.forEach((l, li) => ctx.fillText(l, sx2, by + 8 + li * lineH));

    drawPrompt(ctx, sx2, sy2 - 36, isMobileHint ? 'Tap E' : '[E] Collect');
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
  ctx.fillText(songTitle ? `🎵 ${songTitle}` : 'RECOVERED VINYL', sx, sy + bob - 26);
  if (nearPlayer) drawPrompt(ctx, sx, sy + bob - 36, isMobileHint ? 'Tap E' : '[E] Collect');
}

function drawVisitor(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  v: ArchiveVisitor,
  nearPlayer: boolean,
) {
  const sx = v.x - cx;
  const sy = v.y - cy;
  const now = performance.now();
  const bob = Math.sin(now / 600 + v.id * 1.7) * 2;
  const radius = v.isCrowdRusher ? 12 : 10;

  // Crowd rusher: pulsing orange ring
  if (v.isCrowdRusher) {
    const p = Math.sin(now / 200) * 0.3 + 0.7;
    ctx.strokeStyle = v.color; ctx.lineWidth = 2;
    ctx.globalAlpha = p * 0.6;
    ctx.shadowColor = v.color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(sx, sy + bob, radius + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.shadowColor = v.color; ctx.shadowBlur = nearPlayer ? 14 : (v.isCrowdRusher ? 10 : 5);
  ctx.fillStyle = v.color;
  ctx.beginPath(); ctx.arc(sx, sy + bob, radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(sx, sy + bob, radius / 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';

  // "!" attention cue when visitor has noticed a fragment (not yet grabbed)
  if (v.noticedFragId !== null && v.state !== 'carrying') {
    const excBob = Math.sin(now / 180 + v.id) * 2;
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fbbf24'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8;
    ctx.fillText('!', sx, sy + bob - radius - 10 + excBob);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  }

  // Carrying indicator — glow + floating note
  if (v.state === 'carrying') {
    const glowPulse = Math.sin(now / 250) * 0.2 + 0.8;
    ctx.globalAlpha = glowPulse;
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(sx, sy + bob, radius + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  }

  if (nearPlayer && v.state === 'carrying') {
    const promptText = v.isCrowdRusher
      ? (isMobileHint ? 'Tap E — Recover!' : '[E] Recover Fragment!')
      : (isMobileHint ? 'Tap E' : '[E] Recover');
    drawPrompt(ctx, sx, sy + bob - radius - 18, promptText);
  }

  // Label
  const label = v.isCrowdRusher ? 'RUSH' : 'visitor';
  ctx.font = `${v.isCrowdRusher ? 'bold ' : ''}9px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = v.color + 'aa';
  ctx.fillText(label, sx, sy + bob - radius - 2);
}

function drawBooth(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  phase: QuestPhase,
  boothUsed: boolean,
  nearPlayer: boolean,
) {
  const sx = BOOTH_POS.x - cx;
  const sy = BOOTH_POS.y - cy;
  if (phase === 'pre_quest' || phase === 'complete') return;

  const now = performance.now();
  const pulse = Math.sin(now / 500) * 0.3 + 0.7;
  const alpha = boothUsed ? 0.35 : 1;

  ctx.globalAlpha = alpha;

  // Podium base
  ctx.fillStyle = boothUsed ? '#111827' : '#1e3a5f';
  ctx.fillRect(sx - 14, sy - 8, 28, 18);
  ctx.strokeStyle = boothUsed ? '#374151' : '#2563eb'; ctx.lineWidth = 1.5;
  ctx.strokeRect(sx - 14, sy - 8, 28, 18);

  // Screen
  ctx.fillStyle = boothUsed ? 'rgba(55,65,81,0.5)' : `rgba(37,99,235,${pulse * 0.8})`;
  ctx.beginPath(); ctx.roundRect(sx - 10, sy - 20, 20, 14, 3); ctx.fill();
  ctx.strokeStyle = boothUsed ? '#4b5563' : '#60a5fa'; ctx.lineWidth = 1;
  ctx.strokeRect(sx - 10, sy - 20, 20, 14);

  ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = boothUsed ? '#6b7280' : '#93c5fd';
  ctx.fillText(boothUsed ? 'USED' : 'BOOTH', sx, sy + 3);

  // "LISTENING BOOTH" label above
  ctx.font = 'bold 7px sans-serif';
  ctx.fillStyle = boothUsed ? '#6b7280' : '#60a5fa';
  ctx.fillText('LISTENING BOOTH', sx, sy - 30);

  ctx.globalAlpha = 1;

  // Pulsing outer ring during find_fragments (not used)
  if (phase === 'find_fragments' && !boothUsed) {
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4 + pulse * 0.3;
    ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(sx, sy, 28, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  }

  if (nearPlayer && !boothUsed && phase === 'find_fragments') {
    drawPrompt(ctx, sx, sy - 40, isMobileHint ? 'Tap E — Free Clue' : '[E] Use Listening Booth');
  }
  if (nearPlayer && boothUsed) {
    drawPrompt(ctx, sx, sy - 40, 'Booth already used this run');
  }
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

function QuestHud({
  questPhase, bandName, fragmentsCollected, revealedTitle, onOpenJournal,
}: {
  questPhase: QuestPhase;
  bandName: string;
  fragmentsCollected: number;
  revealedTitle: string | null;
  onOpenJournal: () => void;
}) {
  if (questPhase === 'pre_quest' || questPhase === 'complete') return null;
  const journalPulse = questPhase === 'journal_review';

  return (
    <div className="absolute top-2 left-2 pointer-events-none">
      <div className="bg-black/70 border border-amber-500/30 rounded-lg px-3 py-2 text-xs max-w-[230px]">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-amber-400 font-bold truncate">{bandName}</p>
          <button
            onClick={onOpenJournal}
            title="Recovery Journal [J]"
            className={`text-base leading-none shrink-0 transition-all pointer-events-auto ${
              journalPulse
                ? 'text-amber-400 [filter:drop-shadow(0_0_5px_#fbbf24)]'
                : 'text-amber-600/70 hover:text-amber-400'
            }`}
          >
            📖
          </button>
        </div>
        {questPhase === 'find_fragments' && (
          <p className="text-gray-300">
            Find lyric fragments{' '}
            <span className="text-amber-300 font-mono">{fragmentsCollected}/3</span>
          </p>
        )}
        {questPhase === 'journal_review' && (
          <p className="text-amber-300 font-semibold">
            All found — open Journal 📖
          </p>
        )}
        {questPhase === 'find_vinyl' && (
          <>
            <p className="text-gray-300">Recover the vinyl <span className="text-amber-300">0/1</span></p>
            {revealedTitle && <p className="text-violet-400 truncate mt-0.5">🎵 {revealedTitle}</p>}
          </>
        )}
        {questPhase === 'return_curator' && (
          <>
            <p className="text-gray-300">Return to The Curator <span className="text-amber-300">✓</span></p>
            {revealedTitle && <p className="text-violet-400 truncate mt-0.5">🎵 {revealedTitle}</p>}
          </>
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
        {songTitle
          ? <p className="text-white font-bold text-lg leading-snug">{songTitle}</p>
          : <p className="text-white font-bold text-lg">Unknown Recording</p>
        }
        <p className="text-gray-500 text-xs mt-1">{bandName}</p>
        <p className="text-gray-600 text-xs mt-3">The vinyl is now materialising…</p>
      </div>
    </div>
  );
}

function RecoveryJournal({
  bandName, characterName, clues, questPhase,
  sessionSongId, songs, guessResult,
  revealedTitle, onGuess, onReveal, onClose,
}: {
  bandName:      string;
  characterName: string;
  clues:         Clue[];
  questPhase:    QuestPhase;
  sessionSongId: string | null;
  songs:         BandRpgSong[];
  guessResult:   'correct' | 'incorrect' | null;
  revealedTitle: string | null;
  onGuess:       (song: BandRpgSong) => void;
  onReveal:      () => void;
  onClose:       () => void;
}) {
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<BandRpgSong | null>(null);
  const [showDrop, setShowDrop] = useState(false);

  const isInvestigating = questPhase === 'journal_review';
  const collectedCount  = clues.filter((c) => c.collected).length;
  const canGuess        = isInvestigating && sessionSongId !== null && guessResult !== 'correct';

  const filteredSongs = songs.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div
      className="absolute inset-0 bg-black/75 flex items-center justify-center z-30 pointer-events-auto"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-amber-500/40 rounded-2xl p-5 w-full max-w-sm mx-4 max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">📖</span>
            <h2 className="text-amber-400 font-bold text-xs uppercase tracking-widest">Recovery Journal</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-sm leading-none w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Band + Character */}
        <div className="mb-4 p-3 bg-gray-800/50 rounded-xl text-xs space-y-1 border border-gray-700/40">
          <div className="flex gap-3">
            <span className="text-gray-500 w-16 shrink-0">Band</span>
            <span className="text-white font-semibold">{bandName}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-gray-500 w-16 shrink-0">Character</span>
            <span className="text-violet-300 font-semibold">{characterName}</span>
          </div>
        </div>

        {/* Song identity */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">
              {revealedTitle ? 'Recovered Song' : 'Unknown Song'}
            </p>
            <span className={`text-xs font-mono font-bold ${collectedCount >= 3 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {collectedCount}/3 Fragments
            </span>
          </div>
          {revealedTitle
            ? <p className="text-emerald-400 font-semibold text-sm">🎵 {revealedTitle}</p>
            : isInvestigating
              ? <p className="text-gray-600 text-sm italic">Review the fragments to identify the song…</p>
              : null
          }
        </div>

        {/* Clue list */}
        <div className="space-y-2 mb-5">
          {clues.map((clue) => (
            <div
              key={clue.id}
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs transition-all ${
                clue.collected
                  ? 'bg-amber-950/40 border-amber-500/30'
                  : 'bg-gray-800/30 border-gray-700/20 opacity-50'
              }`}
            >
              <span className="shrink-0 mt-0.5 text-sm">{clue.collected ? clue.icon : '□'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-500 text-xs mb-0.5">{clue.label}</p>
                {clue.collected
                  ? <p className="text-amber-100 italic leading-snug">"{clue.content}"</p>
                  : <p className="text-gray-600">Not yet recovered</p>
                }
              </div>
            </div>
          ))}
        </div>

        {/* Correct guess indicator */}
        {guessResult === 'correct' && (
          <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-500/40 rounded-xl text-center">
            <p className="text-emerald-400 font-bold text-sm">🎵 Correct Identification!</p>
            <p className="text-gray-300 text-xs mt-0.5">+50 bonus points awarded</p>
          </div>
        )}

        {/* Guess section — only during investigation */}
        {canGuess && (
          <div className="mb-4">
            <p className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">Guess the Song</p>
            {guessResult === 'incorrect' && (
              <p className="text-red-400 text-xs mb-2 bg-red-950/30 border border-red-500/20 rounded-lg px-3 py-1.5">
                Not quite — try another or reveal below
              </p>
            )}
            <div className="relative">
              <input
                type="text"
                value={search}
                autoComplete="off"
                onChange={(e) => { setSearch(e.target.value); setSelected(null); setShowDrop(true); }}
                onFocus={() => setShowDrop(true)}
                onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                placeholder={`Search ${bandName} songs…`}
                className="w-full bg-gray-800 border border-gray-600 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-colors"
              />
              {showDrop && filteredSongs.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg z-10 shadow-2xl">
                  {filteredSongs.slice(0, 8).map((s) => (
                    <button
                      key={s.id}
                      onMouseDown={(e) => { e.preventDefault(); setSelected(s); setSearch(s.title); setShowDrop(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        selected?.id === s.id ? 'bg-amber-900/50 text-amber-300' : 'text-white hover:bg-gray-700'
                      }`}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selected && (
              <button
                onClick={() => { onGuess(selected); setSelected(null); setSearch(''); setShowDrop(false); }}
                className="mt-2 w-full bg-amber-700 hover:bg-amber-600 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
              >
                Submit Guess: "{selected.title}"
              </button>
            )}
            {!selected && (
              <p className="text-gray-600 text-xs text-center mt-1.5">Optional — correct guess earns +50 bonus</p>
            )}
          </div>
        )}

        {/* Reveal button — only during investigation */}
        {isInvestigating && (
          <button
            onClick={onReveal}
            className="w-full bg-violet-700 hover:bg-violet-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
          >
            Reveal Song →
          </button>
        )}

        <p className="text-gray-700 text-xs text-center mt-3">
          {isInvestigating ? 'Guess for a bonus · Reveal when ready' : '[J] to close'}
        </p>
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

function CompleteScreen({
  score, rank, bandName, characterName, songTitle, songRarity, songId,
  guessedCorrectly, guessBonus, rarityBonus, isNewCollection, albumRestored,
  onPlayAgain, onChangeBand, onLeaderboard, onViewCollection,
}: {
  score: number; rank: number | null; bandName: string; characterName: string;
  songTitle: string | null; songRarity: string | null; songId: string | null;
  guessedCorrectly: boolean; guessBonus: number; rarityBonus: number;
  isNewCollection: boolean | null; albumRestored: { albumTitle: string } | null;
  onPlayAgain: () => void; onChangeBand: () => void; onLeaderboard: () => void; onViewCollection: () => void;
}) {
  const rarityColor = songRarity ? (RARITY_COLOR[songRarity] ?? 'text-gray-400') : 'text-gray-400';
  const rarityLabel = songRarity ? (RARITY_LABEL[songRarity] ?? songRarity) : null;

  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto z-20">
      <div className="bg-gray-900 border border-emerald-500/40 rounded-2xl p-8 text-center max-w-sm mx-4 overflow-y-auto max-h-full">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-bold text-emerald-400 mb-1">Quest Complete!</h2>
        <p className="text-violet-400 text-xs mb-1">{bandName} · {characterName}</p>
        {songTitle && (
          <div className="mb-4">
            <p className="text-amber-400 text-xs">🎵 {songTitle}</p>
            {rarityLabel && <p className={`text-xs font-semibold mt-0.5 ${rarityColor}`}>{rarityLabel}</p>}
          </div>
        )}
        <div className="bg-black/40 rounded-xl p-4 mb-4 text-left font-mono text-xs space-y-1">
          <div className="flex justify-between text-gray-300"><span>Quest Completion</span><span>+100</span></div>
          <div className="flex justify-between text-gray-400"><span>Fragments (3)</span><span>+75</span></div>
          <div className="flex justify-between text-gray-400"><span>Vinyl Recovery</span><span>+25</span></div>
          {guessedCorrectly && <div className="flex justify-between text-emerald-400"><span>Identified Correctly</span><span>+{guessBonus}</span></div>}
          {rarityBonus > 0 && rarityLabel && (
            <div className={`flex justify-between font-bold ${rarityColor}`}>
              <span>{rarityLabel.split(' ').slice(1).join(' ')} Bonus</span>
              <span>+{rarityBonus}</span>
            </div>
          )}
          <div className="border-t border-gray-700 pt-1 flex justify-between text-white font-bold text-sm"><span>Total</span><span>{score}</span></div>
          {rank !== null && (
            <div className="text-center text-emerald-400 text-xs pt-1 font-semibold">Leaderboard rank: #{rank}</div>
          )}
        </div>
        {songTitle && isNewCollection !== null && (
          <div className={`text-xs font-semibold mb-2 ${isNewCollection ? 'text-emerald-400' : 'text-gray-500'}`}>
            {isNewCollection ? '✓ First Recovery — Added to collection!' : '● Already Catalogued'}
          </div>
        )}
        {albumRestored && (
          <div className="bg-amber-900/30 border border-amber-600/40 rounded-lg px-4 py-3 mb-4 text-center">
            <div className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-0.5">🏆 Album Restored</div>
            <div className="text-white text-sm font-semibold">{albumRestored.albumTitle}</div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          <button onClick={onPlayAgain}      className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors">Play Again</button>
          {songId && (
            <div>
              <a
                href={`/wiki/songs/${songId}${isNewCollection === true ? '?unlocked=1' : ''}`}
                className="block w-full text-center bg-indigo-700/60 hover:bg-indigo-600/80 text-indigo-200 font-semibold px-6 py-2.5 rounded-lg transition-colors"
              >
                {isNewCollection === true ? '✦ View Song Card' : 'View Song Card'}
              </a>
              <p className="text-[10px] text-gray-600 mt-1.5 text-center leading-relaxed px-2">
                Song Cards collect live history, rarity, lyrics, spectrum, and discovery stats in one place.
              </p>
            </div>
          )}
          <button onClick={onViewCollection} className="bg-amber-700/60 hover:bg-amber-700 text-amber-200 font-semibold px-6 py-2.5 rounded-lg transition-colors">View Collection</button>
          <button onClick={onChangeBand}     className="bg-violet-700/60 hover:bg-violet-700 text-violet-200 font-semibold px-6 py-2.5 rounded-lg transition-colors">Change Band</button>
          <button onClick={onLeaderboard}    className="bg-white/10 hover:bg-white/20 text-gray-300 font-semibold px-6 py-2.5 rounded-lg transition-colors">View Leaderboard</button>
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

function ArchiveHintPanel({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 9000);
    return () => window.clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="absolute bottom-20 inset-x-0 flex justify-center pointer-events-none z-30">
      <div className="bg-gray-950/96 border border-blue-500/40 rounded-xl px-5 py-3 max-w-sm mx-4 pointer-events-auto shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="text-blue-400 text-lg shrink-0 mt-0.5">📋</span>
          <div className="flex-1 text-xs text-gray-300 leading-relaxed space-y-1.5">
            <p className="text-blue-300 font-bold text-sm mb-0.5">Archive Tips</p>
            <p>
              <span className="text-amber-300 font-semibold">♪ Gold</span> = static ·{' '}
              <span className="text-sky-300 font-semibold">♪ Blue</span> = drifting ·{' '}
              <span className="text-red-300 font-semibold">♪ Red</span> = escaping
            </p>
            <p>Visitors may <span className="text-amber-300">grab fragments</span>. Press <kbd className="bg-white/10 border border-white/20 rounded px-1 font-mono text-white">E</kbd> near a carrying visitor to recover it.</p>
            <p>Use the <span className="text-blue-300 font-semibold">Listening Booth</span> once per run for a free clue.</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-white transition-colors shrink-0 text-sm leading-none mt-0.5"
            title="Dismiss"
          >✕</button>
        </div>
      </div>
    </div>
  );
}

function EventToastList({ toasts }: { toasts: EventToast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="absolute bottom-20 right-2 flex flex-col gap-1 items-end pointer-events-none z-20">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-gray-900/90 border border-gray-700/50 text-gray-300 text-xs px-3 py-1.5 rounded-lg shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function CrowdRushOverlay({ timeSec, fragsSaved }: { timeSec: number; fragsSaved: number }) {
  return (
    <div className="absolute top-14 inset-x-0 flex justify-center pointer-events-none z-30">
      <div className="bg-red-950/95 border-2 border-red-500/70 rounded-xl px-6 py-3 text-center shadow-2xl">
        <p className="text-red-400 font-bold text-sm tracking-widest uppercase">⚡ Crowd Rush!</p>
        <p className="text-gray-300 text-xs mt-0.5">
          Press <span className="text-white font-bold">[E]</span> near rush visitors to recover fragments
        </p>
        <div className="flex items-center justify-center gap-4 mt-1.5">
          <span className="text-red-300 font-mono text-sm font-bold">{timeSec}s</span>
          <span className="text-gray-600 text-xs">•</span>
          <span className="text-emerald-300 text-xs font-semibold">Recovered: {fragsSaved}</span>
        </div>
      </div>
    </div>
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

  // Live session ref — updated on Play Again for fresh song
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
  const isJournalRef    = useRef(false);
  const scoreRef        = useRef(0);
  const effectsRef      = useRef<Effect[]>([]);
  const effectIdRef     = useRef(0);

  // Fragments
  const fragmentsRef      = useRef<LyricFragment[]>([]);
  const collectedCountRef = useRef(0);

  // Visitors & booth
  const visitorsRef       = useRef<ArchiveVisitor[]>([]);
  const boothUsedRef      = useRef(false);
  const lastFrameTimeRef  = useRef<number>(0);

  // Crowd Rush encounter
  const crowdRushRef          = useRef<CrowdRushState>({ active: false, timeRemainingMs: 0, rushers: [], fragsSaved: 0 });
  const crowdRushTriggeredRef = useRef(false);
  const crowdRushLastSecRef   = useRef(0);
  const runCountRef           = useRef(getArchiveRunCount());

  // Event toasts
  const toastIdRef   = useRef(0);
  const lastToastRef = useRef({ msg: '', time: 0 });

  // Guess / identification tracking
  const guessedCorrectlyRef = useRef(false);
  const guessBonusRef       = useRef(0);
  const rarityBonusRef      = useRef(0);

  const dialogueRef = useRef(buildQuestLines(selectedBand.name, session.songTitle));

  const boothDialogue: DlgLine[] = [
    { speaker: 'Listening Booth', text: 'A recovered fragment has been catalogued here for study. It\'s yours — transferred directly to your journal.' },
    { speaker: 'Listening Booth', text: 'Fragment acquired. The booth is now closed for this session — two more fragments remain in the archive.' },
  ];

  // React UI state
  const [questPhase,         setQuestPhase]         = useState<QuestPhase>('pre_quest');
  const [score,              setScore]              = useState(0);
  const [isPaused,           setIsPaused]           = useState(false);
  const [dlg,                setDlg]                = useState<DlgState | null>(null);
  const [isComplete,         setIsComplete]         = useState(false);
  const [savedRank,          setSavedRank]          = useState<number | null>(null);
  const [isMobile,           setIsMobile]           = useState(false);
  const [banner,             setBanner]             = useState<BannerData | null>(null);
  const [muted,              setMuted]              = useState(false);
  const [fragmentsCollected, setFragmentsCollected] = useState(0);
  const [showSongReveal,     setShowSongReveal]     = useState(false);
  const [showJournal,        setShowJournal]        = useState(false);
  const [guessResult,        setGuessResult]        = useState<'correct' | 'incorrect' | null>(null);
  const [revealedTitle,      setRevealedTitle]      = useState<string | null>(null);
  const [isNewCollection,    setIsNewCollection]    = useState<boolean | null>(null);
  const [albumRestored,      setAlbumRestored]      = useState<{ albumTitle: string } | null>(null);
  const [crowdRushActive,    setCrowdRushActive]    = useState(false);
  const [crowdRushTimeSec,   setCrowdRushTimeSec]   = useState(0);
  const [crowdRushFragsSaved, setCrowdRushFragsSaved] = useState(0);
  const [eventToasts,        setEventToasts]        = useState<EventToast[]>([]);
  const [showArchiveHint,    setShowArchiveHint]    = useState(false);

  // Pre-fetch the band's song list for the guess dropdown
  const { data: bandSongs = [] } = useQuery({
    queryKey: ['band-rpg-songs', selectedBand.id],
    queryFn:  () => bandRpgApi.getSongs(selectedBand.id),
    staleTime: 10 * 60_000,
  });

  useEffect(() => { sessionRef.current = session; }, [session]);

  function initFragments(sess: BandRpgSession): LyricFragment[] {
    const positions = getSpreadSpawnPositions(3);
    // Shuffle behavior assignment so it's different each run
    const behaviors: FragBehavior[] = ['static', 'drift', 'escape'];
    for (let i = behaviors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = behaviors[i]!; behaviors[i] = behaviors[j]!; behaviors[j] = t;
    }
    return sess.fragments.map((frag, i) => {
      const angle = Math.random() * Math.PI * 2;
      const behavior = behaviors[i] ?? 'static';
      return {
        id:          frag.id,
        text:        frag.text,
        pos:         { ...(positions[i] ?? randomVinylPos()) },
        collected:   false,
        behavior,
        vx:          behavior === 'drift' ? Math.cos(angle) * FRAGMENT_DRIFT_SPEED : 0,
        vy:          behavior === 'drift' ? Math.sin(angle) * FRAGMENT_DRIFT_SPEED : 0,
        carriedById: null,
      };
    });
  }

  function initVisitors(runCount: number): ArchiveVisitor[] {
    // Scale visitor count gently with experience
    const count = runCount < 3 ? 1 + Math.floor(Math.random() * 2)   // 1–2 early
                : runCount < 8 ? 2 + Math.floor(Math.random() * 2)   // 2–3 mid
                :                3 + Math.floor(Math.random() * 2);  // 3–4 experienced
    const candidates = getValidSpawnTiles({
      minDistFromPlayerPx: TILE * 6,
      minDistFromNpcPx: TILE * 4,
      allowedTiles: [1],
    });
    return Array.from({ length: count }, (_, i) => {
      const pos    = candidates[Math.floor(Math.random() * candidates.length)] ?? VINYL_FALLBACK;
      const target = candidates[Math.floor(Math.random() * candidates.length)] ?? VINYL_FALLBACK;
      return {
        id: i + 1,
        x: pos.x, y: pos.y,
        tx: target.x, ty: target.y,
        speed: VISITOR_SPEED_SLOW + Math.random() * (VISITOR_SPEED_FAST - VISITOR_SPEED_SLOW),
        state: 'wandering' as VisitorState,
        carryingFragId: null,
        wanderCooldown: 2000 + Math.random() * 3000,
        color: VISITOR_COLORS[i % VISITOR_COLORS.length] ?? '#60a5fa',
        noticedFragId: null,
        isCrowdRusher: false,
      };
    });
  }

  useEffect(() => {
    fragmentsRef.current = initFragments(session);
    visitorsRef.current  = initVisitors(runCountRef.current);
    dialogueRef.current  = buildQuestLines(selectedBand.name, session.songTitle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onError: () => { /* silent */ },
  });

  const collectSong = useMutation({
    mutationFn: (data: Parameters<typeof bandRpgApi.collectSong>[0]) => bandRpgApi.collectSong(data),
    onSuccess: (r) => {
      setIsNewCollection(r.isNew);
      if (r.albumCompleted && r.completedAlbumTitle) {
        setAlbumRestored({ albumTitle: r.completedAlbumTitle });
      }
    },
    onError: () => { /* silent — collection failure should not disrupt game flow */ },
  });

  const dismissBanner = useCallback(() => setBanner(null), []);

  const addToast = useCallback((message: string) => {
    const now = performance.now();
    if (lastToastRef.current.msg === message && now - lastToastRef.current.time < 3000) return;
    lastToastRef.current = { msg: message, time: now };
    const id = ++toastIdRef.current;
    setEventToasts((prev) => [...prev.slice(-3), { id, message }]);
    window.setTimeout(() => setEventToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  const startCrowdRush = useCallback(() => {
    const candidates = getValidSpawnTiles({
      minDistFromPlayerPx: TILE * 8, minDistFromNpcPx: TILE * 4, allowedTiles: [1],
    });
    const rushers: ArchiveVisitor[] = Array.from(
      { length: ARCHIVE_TUNING.crowdRushVisitorCount },
      (_, i) => {
        const pos    = candidates[Math.floor(Math.random() * candidates.length)] ?? VINYL_FALLBACK;
        const target = candidates[Math.floor(Math.random() * candidates.length)] ?? VINYL_FALLBACK;
        return {
          id: 100 + i,
          x: pos.x, y: pos.y,
          tx: target.x, ty: target.y,
          speed: ARCHIVE_TUNING.crowdRushSpeed,
          state: 'wandering' as VisitorState,
          carryingFragId: null,
          wanderCooldown: 0,
          color: CROWD_RUSH_COLORS[i % CROWD_RUSH_COLORS.length] ?? '#f97316',
          noticedFragId: null,
          isCrowdRusher: true,
        };
      },
    );
    crowdRushRef.current = {
      active: true,
      timeRemainingMs: ARCHIVE_TUNING.crowdRushDuration,
      rushers,
      fragsSaved: 0,
    };
    crowdRushLastSecRef.current = Math.ceil(ARCHIVE_TUNING.crowdRushDuration / 1000);
    setCrowdRushActive(true);
    setCrowdRushTimeSec(crowdRushLastSecRef.current);
    setCrowdRushFragsSaved(0);
    addToast('⚡ Crowd Rush started!');
    setBanner({ title: '⚡ Crowd Rush!', subtitle: 'Press E near rush visitors to recover fragments', color: 'amber' });
    playTone(220, 0.18, 'sawtooth', 0.1);
    window.setTimeout(() => playTone(330, 0.18, 'sawtooth', 0.09), 120);
  }, [addToast]);

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

  const openJournal = useCallback(() => {
    const phase = questPhaseRef.current;
    if (phase === 'pre_quest' || phase === 'complete') return;
    isJournalRef.current = true;
    setShowJournal(true);
  }, []);

  const closeJournal = useCallback(() => {
    isJournalRef.current = false;
    setShowJournal(false);
  }, []);

  const acceptQuest = useCallback(() => {
    questPhaseRef.current = 'find_fragments';
    setQuestPhase('find_fragments');
    incrementArchiveRunCount();
    runCountRef.current = getArchiveRunCount();
    // Show onboarding hint for the first few runs
    if (runCountRef.current <= 3 && !archiveHintSeen()) {
      setShowArchiveHint(true);
    }
    setBanner({ title: 'Quest Accepted!', subtitle: 'Find 3 lyric fragments hidden in The Archives', color: 'amber' });
    effectsRef.current.push({
      id: ++effectIdRef.current, wx: NPC_POS.x, wy: NPC_POS.y - 20,
      type: 'float_text', text: 'Quest!', color: '#fbbf24',
      startTime: performance.now(), duration: 1200,
    });
    soundQuestAccepted();
  }, []);

  const handleRevealSong = useCallback(() => {
    isJournalRef.current = false;
    setShowJournal(false);
    setRevealedTitle(sessionRef.current.songTitle);
    setShowSongReveal(true);
    soundRevealSong();
  }, []);

  const handleSongRevealDone = useCallback(() => {
    vinylPosRef.current   = randomVinylPos();
    questPhaseRef.current = 'find_vinyl';
    setQuestPhase('find_vinyl');
    setShowSongReveal(false);
    setBanner({ title: 'Vinyl Materialised!', subtitle: 'Find and recover the vinyl record', color: 'violet' });
  }, []);

  const handleGuess = useCallback((song: BandRpgSong) => {
    const isCorrect = song.id === sessionRef.current.songId;
    if (isCorrect) {
      if (!guessedCorrectlyRef.current) {
        guessedCorrectlyRef.current = true;
        guessBonusRef.current       = 50;
        scoreRef.current            += 50;
        setScore(scoreRef.current);
      }
      setGuessResult('correct');
      soundCorrectGuess();
    } else {
      setGuessResult('incorrect');
    }
  }, []);

  const finishQuest = useCallback(() => {
    scoreRef.current += 100;
    // Apply rarity bonus on top of quest completion
    const rarity = sessionRef.current.songRarity ?? 'Common';
    const rarityBonus = RARITY_SCORE_BONUS[rarity] ?? 0;
    if (rarityBonus > 0) {
      scoreRef.current += rarityBonus;
      rarityBonusRef.current = rarityBonus;
    }
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
      guessedCorrectly: guessedCorrectlyRef.current,
      guessBonus:       guessBonusRef.current,
    });
    saveProgress.mutate({
      questPhase: 'complete', score: finalScore,
      bandId: selectedBand.id, bandName: selectedBand.name,
      characterId: selectedCharacter.id, characterName: selectedCharacter.name,
    });
    if (sess.songId && sess.songTitle) {
      collectSong.mutate({
        songId: sess.songId,
        songTitle: sess.songTitle,
        bandId: selectedBand.id,
        bandName: selectedBand.name,
        guessedCorrectly: guessedCorrectlyRef.current,
        scoreEarned: finalScore,
        rarity: sess.songRarity ?? 'Common',
      });
    }
  }, [submitScore, saveProgress, collectSong, selectedBand, selectedCharacter]);

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
      questPhaseRef.current = 'journal_review';
      setQuestPhase('journal_review');
      dialogueRef.current = buildQuestLines(selectedBand.name, sessionRef.current.songTitle);
      soundAllFragmentsFound();
      // Auto-open journal after pickup effects play
      window.setTimeout(() => {
        isJournalRef.current = true;
        setShowJournal(true);
      }, 700);
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

  const handleInteract = useCallback(() => {
    if (isDialogueRef.current || isPausedRef.current || isCompleteRef.current) return;

    // Journal-review phase: E opens journal
    if (questPhaseRef.current === 'journal_review') {
      if (!isJournalRef.current) { isJournalRef.current = true; setShowJournal(true); }
      return;
    }

    const p = playerRef.current;

    if (dist(p.x, p.y, NPC_POS.x, NPC_POS.y) < INTERACT_R) {
      if (questPhaseRef.current === 'pre_quest')      { openDlg(dialogueRef.current.intro,      acceptQuest); return; }
      if (questPhaseRef.current === 'return_curator') { openDlg(dialogueRef.current.completion, finishQuest); return; }
    }

    if (questPhaseRef.current === 'find_fragments') {
      // Booth interaction — delivers one fragment via dialogue (once per run)
      if (!boothUsedRef.current && dist(p.x, p.y, BOOTH_POS.x, BOOTH_POS.y) < INTERACT_R) {
        boothUsedRef.current = true;
        const uncollected = fragmentsRef.current.find(f => !f.collected && f.carriedById === null);
        if (uncollected) {
          openDlg(boothDialogue, () => {
            addToast('Listening Booth revealed a clue.');
            collectFragment(uncollected);
          });
        }
        return;
      }

      // Recover fragment from any nearby carrying visitor (normal or crowd rush)
      const allCarriers = [
        ...visitorsRef.current,
        ...crowdRushRef.current.rushers,
      ];
      for (const v of allCarriers) {
        if (v.state === 'carrying' && dist(p.x, p.y, v.x, v.y) < INTERACT_R) {
          const cf = fragmentsRef.current.find(f => f.id === v.carryingFragId);
          if (cf) {
            cf.carriedById = null;
            v.carryingFragId = null;
            v.state = 'wandering';
            if (v.isCrowdRusher) {
              crowdRushRef.current.fragsSaved++;
              setCrowdRushFragsSaved(crowdRushRef.current.fragsSaved);
              addToast('Fragment recovered from crowd rush!');
            } else {
              addToast('Fragment recovered.');
            }
            collectFragment(cf);
          }
          return;
        }
      }

      // Direct fragment pickup
      for (const frag of fragmentsRef.current) {
        if (!frag.collected && frag.carriedById === null && dist(p.x, p.y, frag.pos.x, frag.pos.y) < INTERACT_R) {
          collectFragment(frag);
          return;
        }
      }
    }

    if (!vinylRef.current && questPhaseRef.current === 'find_vinyl') {
      const vpos = vinylPosRef.current;
      if (dist(p.x, p.y, vpos.x, vpos.y) < INTERACT_R) collectVinyl(vpos);
    }
  }, [openDlg, acceptQuest, finishQuest, collectFragment, collectVinyl, addToast]);

  // Keyboard
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowUp'    || k === 'w' || k === 'W') inputRef.current.up    = true;
      if (k === 'ArrowDown'  || k === 's' || k === 'S') inputRef.current.down  = true;
      if (k === 'ArrowLeft'  || k === 'a' || k === 'A') inputRef.current.left  = true;
      if (k === 'ArrowRight' || k === 'd' || k === 'D') inputRef.current.right = true;
      if (k === 'e' || k === 'E' || k === ' ') handleInteract();
      if (k === 'Escape') {
        if (isJournalRef.current) { isJournalRef.current = false; setShowJournal(false); }
        else { isPausedRef.current = !isPausedRef.current; setIsPaused((p) => !p); }
      }
      if (k === 'j' || k === 'J') {
        const phase = questPhaseRef.current;
        if (phase === 'pre_quest' || phase === 'complete') return;
        if (isJournalRef.current) { isJournalRef.current = false; setShowJournal(false); }
        else { isJournalRef.current = true; setShowJournal(true); }
      }
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

      if (!isPausedRef.current && !isDialogueRef.current && !isCompleteRef.current && !isJournalRef.current) {
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

        const now2 = performance.now();
        const dtMs = Math.min(now2 - (lastFrameTimeRef.current || now2), 50);
        lastFrameTimeRef.current = now2;

        // ── Fragment behaviors ─────────────────────────────────────────────
        if (questPhaseRef.current === 'find_fragments') {
          for (const frag of fragmentsRef.current) {
            if (frag.collected || frag.carriedById !== null) continue;
            if (frag.behavior === 'drift') {
              let nx = frag.pos.x + frag.vx;
              let ny = frag.pos.y + frag.vy;
              if (!isWalkable(nx, frag.pos.y)) { frag.vx *= -1; nx = frag.pos.x; }
              if (!isWalkable(frag.pos.x, ny)) { frag.vy *= -1; ny = frag.pos.y; }
              frag.pos.x = nx;
              frag.pos.y = ny;
            } else if (frag.behavior === 'escape') {
              const dx = frag.pos.x - p.x;
              const dy = frag.pos.y - p.y;
              const d = Math.hypot(dx, dy);
              if (d < ESCAPE_RADIUS && d > 0) {
                const ex = (dx / d) * FRAGMENT_ESCAPE_SPEED;
                const ey = (dy / d) * FRAGMENT_ESCAPE_SPEED;
                const nx = frag.pos.x + ex;
                const ny = frag.pos.y + ey;
                if (isWalkable(nx, frag.pos.y)) frag.pos.x = nx;
                if (isWalkable(frag.pos.x, ny)) frag.pos.y = ny;
              }
            }
          }
        }

        // ── Normal visitor updates ─────────────────────────────────────────
        const visitors = visitorsRef.current;
        for (const v of visitors) {
          const dx = v.tx - v.x;
          const dy = v.ty - v.y;
          const d = Math.hypot(dx, dy);
          if (d < 4) {
            v.wanderCooldown -= dtMs;
            if (v.wanderCooldown <= 0) {
              const cands = getValidSpawnTiles({ minDistFromPlayerPx: 0, minDistFromNpcPx: 0, allowedTiles: [1] });
              const next = cands[Math.floor(Math.random() * cands.length)];
              if (next) { v.tx = next.x; v.ty = next.y; }
              v.wanderCooldown = 2000 + Math.random() * 4000;
              if (v.state === 'chasing') v.state = 'wandering';
            }
          } else {
            const mx = (dx / d) * v.speed;
            const my = (dy / d) * v.speed;
            const nx = v.x + mx; const ny = v.y + my;
            if (isWalkable(nx, v.y)) v.x = nx;
            else if (isWalkable(v.x, ny)) v.y = ny;
            else {
              const cands = getValidSpawnTiles({ minDistFromPlayerPx: 0, minDistFromNpcPx: 0, allowedTiles: [1] });
              const next = cands[Math.floor(Math.random() * cands.length)];
              if (next) { v.tx = next.x; v.ty = next.y; }
            }
          }

          // noticedFragId: show "!" when a fragment is close but not yet grabbed
          if (v.state !== 'carrying') {
            v.noticedFragId = null;
            for (const frag of fragmentsRef.current) {
              if (frag.collected || frag.carriedById !== null) continue;
              if (dist(v.x, v.y, frag.pos.x, frag.pos.y) < VISITOR_GRAB_RADIUS * 1.6) {
                v.noticedFragId = frag.id;
                break;
              }
            }
          }

          // Fragment pickup (only during find_fragments)
          if (questPhaseRef.current === 'find_fragments' && v.state !== 'carrying') {
            for (const frag of fragmentsRef.current) {
              if (frag.collected || frag.carriedById !== null) continue;
              if (dist(v.x, v.y, frag.pos.x, frag.pos.y) < VISITOR_GRAB_RADIUS) {
                if (Math.random() < VISITOR_GRAB_CHANCE) {
                  frag.carriedById = v.id;
                  v.carryingFragId = frag.id;
                  v.state = 'carrying';
                  v.noticedFragId = null;
                  addToast('A visitor picked up a fragment!');
                  const cands = getValidSpawnTiles({ minDistFromPlayerPx: 0, minDistFromNpcPx: 0, allowedTiles: [1] });
                  const next = cands[Math.floor(Math.random() * cands.length)];
                  if (next) { v.tx = next.x; v.ty = next.y; }
                  break;
                }
              }
            }
          }

          if (v.state === 'carrying' && v.carryingFragId) {
            const cf = fragmentsRef.current.find(f => f.id === v.carryingFragId);
            if (cf) { cf.pos.x = v.x; cf.pos.y = v.y; }
          }
        }

        // ── Crowd Rush trigger (once per run, after first frag collected) ──
        if (
          questPhaseRef.current === 'find_fragments' &&
          !crowdRushTriggeredRef.current &&
          collectedCountRef.current >= 1
        ) {
          crowdRushTriggeredRef.current = true;
          const rushChance = runCountRef.current < 3 ? 0
                           : runCountRef.current < 8 ? 0.2
                           :                           0.35;
          if (rushChance > 0 && Math.random() < rushChance) {
            window.setTimeout(() => startCrowdRush(), 1500);
          }
        }

        // ── Crowd Rush update ──────────────────────────────────────────────
        const cr = crowdRushRef.current;
        if (cr.active) {
          cr.timeRemainingMs -= dtMs;
          const newSec = Math.ceil(Math.max(0, cr.timeRemainingMs) / 1000);
          if (newSec !== crowdRushLastSecRef.current) {
            crowdRushLastSecRef.current = newSec;
            setCrowdRushTimeSec(newSec);
          }

          for (const rusher of cr.rushers) {
            // Chase nearest uncollected, uncarried fragment
            if (rusher.state !== 'carrying') {
              let nearestFrag: LyricFragment | null = null;
              let nearestDist = Infinity;
              for (const frag of fragmentsRef.current) {
                if (frag.collected || frag.carriedById !== null) continue;
                const fd = dist(rusher.x, rusher.y, frag.pos.x, frag.pos.y);
                if (fd < nearestDist) { nearestDist = fd; nearestFrag = frag; }
              }
              if (nearestFrag) {
                rusher.tx = nearestFrag.pos.x;
                rusher.ty = nearestFrag.pos.y;
                rusher.noticedFragId = nearestDist < TILE * 3 ? nearestFrag.id : null;
              }
            }

            // Move rusher
            const rdx = rusher.tx - rusher.x;
            const rdy = rusher.ty - rusher.y;
            const rd = Math.hypot(rdx, rdy);
            if (rd > 2) {
              const rmx = (rdx / rd) * rusher.speed;
              const rmy = (rdy / rd) * rusher.speed;
              const rnx = rusher.x + rmx; const rny = rusher.y + rmy;
              if (isWalkable(rnx, rusher.y)) rusher.x = rnx;
              else if (isWalkable(rusher.x, rny)) rusher.y = rny;
            }

            // Rush grab
            if (rusher.state !== 'carrying') {
              for (const frag of fragmentsRef.current) {
                if (frag.collected || frag.carriedById !== null) continue;
                if (dist(rusher.x, rusher.y, frag.pos.x, frag.pos.y) < ARCHIVE_TUNING.crowdRushGrabRadius) {
                  if (Math.random() < ARCHIVE_TUNING.crowdRushGrabChance) {
                    frag.carriedById = rusher.id;
                    rusher.carryingFragId = frag.id;
                    rusher.state = 'carrying';
                    rusher.noticedFragId = null;
                    addToast('⚡ Rush visitor grabbed a fragment!');
                    break;
                  }
                }
              }
            }

            // Carried fragment follows rusher
            if (rusher.state === 'carrying' && rusher.carryingFragId) {
              const cf = fragmentsRef.current.find(f => f.id === rusher.carryingFragId);
              if (cf) { cf.pos.x = rusher.x; cf.pos.y = rusher.y; }
            }
          }

          // Crowd Rush end — drop all carried fragments back to floor
          if (cr.timeRemainingMs <= 0) {
            for (const rusher of cr.rushers) {
              if (rusher.carryingFragId) {
                const cf = fragmentsRef.current.find(f => f.id === rusher.carryingFragId);
                if (cf) {
                  cf.carriedById = null;
                  cf.behavior = 'static';
                  cf.vx = 0; cf.vy = 0;
                }
                rusher.carryingFragId = null;
              }
            }
            const saved = cr.fragsSaved;
            cr.active = false;
            cr.rushers = [];
            setCrowdRushActive(false);
            if (saved > 0) {
              scoreRef.current += saved * 10;
              setScore(scoreRef.current);
              addToast(`Crowd Rush cleared! +${saved * 10} pts for ${saved} recovered.`);
            } else {
              addToast('Crowd Rush ended. Fragments returned to the archive floor.');
            }
          }
        }

        // Auto-collect fragments (not carried — those require E on visitor)
        if (questPhaseRef.current === 'find_fragments') {
          for (const frag of fragmentsRef.current) {
            if (!frag.collected && frag.carriedById === null && dist(p.x, p.y, frag.pos.x, frag.pos.y) < COLLECT_R) {
              collectFragment(frag);
              break;
            }
          }
        }

        // Auto-collect vinyl
        if (!vinylRef.current && questPhaseRef.current === 'find_vinyl') {
          const vpos = vinylPosRef.current;
          if (dist(p.x, p.y, vpos.x, vpos.y) < COLLECT_R) collectVinyl(vpos);
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
      const nearBooth = !boothUsedRef.current && questPhaseRef.current === 'find_fragments'
                        && dist(p.x, p.y, BOOTH_POS.x, BOOTH_POS.y) < INTERACT_R;
      const boothNearUsed = boothUsedRef.current && questPhaseRef.current === 'find_fragments'
                            && dist(p.x, p.y, BOOTH_POS.x, BOOTH_POS.y) < INTERACT_R;

      drawBooth(ctx, cam.x, cam.y, questPhaseRef.current, boothUsedRef.current, nearBooth || boothNearUsed);

      // Fragments + visitors during fragment-hunt phase
      if (questPhaseRef.current === 'find_fragments') {
        fragmentsRef.current.forEach((frag, i) => {
          const nearFrag = !frag.collected && frag.carriedById === null
                           && dist(p.x, p.y, frag.pos.x, frag.pos.y) < INTERACT_R;
          drawFragment(ctx, cam.x, cam.y, frag, nearFrag, i);
        });
        for (const v of visitorsRef.current) {
          drawVisitor(ctx, cam.x, cam.y, v, dist(p.x, p.y, v.x, v.y) < INTERACT_R);
        }
        // Crowd rush visitors
        if (crowdRushRef.current.active) {
          for (const rusher of crowdRushRef.current.rushers) {
            drawVisitor(ctx, cam.x, cam.y, rusher, dist(p.x, p.y, rusher.x, rusher.y) < INTERACT_R);
          }
        }
      }

      // Vinyl visible after song reveal
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
  }, [collectFragment, collectVinyl, addToast, startCrowdRush]);

  const handleJoystick = useCallback((dx: number, dy: number) => { joystickRef.current = { dx, dy }; }, []);

  const togglePause = useCallback(() => {
    isPausedRef.current = !isPausedRef.current;
    setIsPaused((p) => !p);
  }, []);

  const resetGame = useCallback((newSession: BandRpgSession) => {
    runCountRef.current          = getArchiveRunCount(); // sync after acceptQuest incremented it
    sessionRef.current           = newSession;
    dialogueRef.current          = buildQuestLines(selectedBand.name, newSession.songTitle);
    fragmentsRef.current         = initFragments(newSession);
    visitorsRef.current          = initVisitors(runCountRef.current);
    boothUsedRef.current         = false;
    lastFrameTimeRef.current     = 0;
    crowdRushRef.current         = { active: false, timeRemainingMs: 0, rushers: [], fragsSaved: 0 };
    crowdRushTriggeredRef.current = false;
    collectedCountRef.current    = 0;
    guessedCorrectlyRef.current = false;
    guessBonusRef.current       = 0;
    rarityBonusRef.current      = 0;
    vinylPosRef.current         = randomVinylPos();
    playerRef.current           = { x: SPAWN_POS.x, y: SPAWN_POS.y, facing: 'up' };
    vinylRef.current            = false;
    questPhaseRef.current       = 'pre_quest';
    isCompleteRef.current       = false;
    isDialogueRef.current       = false;
    isPausedRef.current         = false;
    isJournalRef.current        = false;
    scoreRef.current            = 0;
    effectsRef.current          = [];
    setQuestPhase('pre_quest');
    setScore(0);
    setIsComplete(false);
    setIsPaused(false);
    setDlg(null);
    setSavedRank(null);
    setBanner(null);
    setFragmentsCollected(0);
    setShowSongReveal(false);
    setShowJournal(false);
    setGuessResult(null);
    setRevealedTitle(null);
    setIsNewCollection(null);
    setAlbumRestored(null);
    setCrowdRushActive(false);
    setCrowdRushTimeSec(0);
    setCrowdRushFragsSaved(0);
    setEventToasts([]);
    setShowArchiveHint(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBand.name]);

  const handlePlayAgain = useCallback(() => {
    refetchSession()
      .then((newSession) => { resetGame(newSession); onNewRun(newSession); })
      .catch(() => { resetGame({ ...sessionRef.current }); onNewRun(sessionRef.current); });
  }, [refetchSession, resetGame, onNewRun]);

  // Clues derived from fragment state at render time (re-derived on every fragmentsCollected change)
  const clues = fragmentsToClues(fragmentsRef.current);

  const overlayActive = isPaused || dlg !== null || isComplete || showSongReveal || showJournal;

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
              revealedTitle={revealedTitle}
              onOpenJournal={openJournal}
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
            songTitle={revealedTitle}
            bandName={selectedBand.name}
            onDone={handleSongRevealDone}
          />
        )}

        {showJournal && (
          <RecoveryJournal
            bandName={selectedBand.name}
            characterName={selectedCharacter.name}
            clues={clues}
            questPhase={questPhase}
            sessionSongId={sessionRef.current.songId}
            songs={bandSongs}
            guessResult={guessResult}
            revealedTitle={revealedTitle}
            onGuess={handleGuess}
            onReveal={handleRevealSong}
            onClose={closeJournal}
          />
        )}

        {dlg && (
          <div className="absolute inset-0 pointer-events-none">
            <DialogueBox dlg={dlg} onNext={advanceDlg} />
          </div>
        )}

        {crowdRushActive && !isComplete && (
          <CrowdRushOverlay timeSec={crowdRushTimeSec} fragsSaved={crowdRushFragsSaved} />
        )}

        {showArchiveHint && !isComplete && (
          <ArchiveHintPanel onDismiss={() => { setShowArchiveHint(false); markArchiveHintSeen(); }} />
        )}

        <EventToastList toasts={eventToasts} />

        {isPaused && !isComplete && <PauseMenu onResume={togglePause} onQuit={onExit} />}

        {isComplete && (
          <CompleteScreen
            score={score}
            rank={savedRank}
            bandName={selectedBand.name}
            characterName={selectedCharacter.name}
            songTitle={revealedTitle}
            songRarity={sessionRef.current.songRarity}
            songId={sessionRef.current.songId}
            guessedCorrectly={guessedCorrectlyRef.current}
            guessBonus={guessBonusRef.current}
            rarityBonus={rarityBonusRef.current}
            isNewCollection={isNewCollection}
            albumRestored={albumRestored}
            onPlayAgain={handlePlayAgain}
            onChangeBand={onChangeBand}
            onLeaderboard={() => { window.location.href = '/leaderboard'; }}
            onViewCollection={() => { window.location.href = '/play/band-rpg/collection'; }}
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

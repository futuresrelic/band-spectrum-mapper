import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';
import { platformerApi, type PlatformerAlbum, type PlatformerScore, type CharacterSkin, type BodySkin } from '../api/platformer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANVAS_W = 800;
const CANVAS_H = 450;
const GRAVITY = 0.58;
const JUMP_FORCE = 11.2;
const DOUBLE_JUMP_FORCE = 8.8;
const MAX_VX = 4.8;
const MAX_VY_DOWN = 15;
const FRICTION = 0.82;
const HERO_W = 28;
const HERO_H = 44;
const CAMERA_LEAD = 220;
const GROUND_Y = 390;
const RECORD_RADIUS = 20;
const RECORD_BOB_AMP = 4;
const ENEMY_W = 34;
const ENEMY_H = 34;
const SONGS_PER_LEVEL = 10;
const MAX_LIVES = 3;
const INVINCIBLE_MS = 1500;
const PLATFORM_THICKNESS = 14;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Platform {
  wx: number;
  wy: number;
  w: number;
  isMoving: boolean;
  moveRange: number;
  moveSpeed: number;
  moveDir: 1 | -1;
  baseY: number;
}

interface Collectible {
  wx: number;
  wy: number;
  albumArt: HTMLImageElement | null;
  albumTitle: string;
  collected: boolean;
  collectTime: number;
  rotAngle: number;
}

interface Enemy {
  wx: number;
  wy: number;
  vx: number;
  patrolLeft: number;
  patrolRight: number;
  alive: boolean;
  dieTime: number;
}

interface Particle {
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
}

interface Hero {
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  onGround: boolean;
  jumpsLeft: number;
  facingRight: boolean;
  state: 'idle' | 'run' | 'jump' | 'fall' | 'die';
  invincibleUntil: number;
  animFrame: number;
  animTime: number;
}

interface GameState {
  hero: Hero;
  platforms: Platform[];
  collectibles: Collectible[];
  enemies: Enemy[];
  particles: Particle[];
  cameraX: number;
  score: number;
  level: number;
  lives: number;
  recordsCollected: number;
  levelRecords: number;
  distance: number;
  worldEnd: number;
  running: boolean;
  lastSafePlatform: Platform | null;
  lastTimestamp: number;
}

interface InputState {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpConsumed: boolean;
}

interface Band {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// Seeded pseudo-random for star rendering (avoids jitter each frame)
function seededRand(seed: number): () => number {
  let s = seed ^ 0xdeadbeef;
  return function () {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 15;
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 15;
    return ((s >>> 0) / 0xffffffff);
  };
}

// ---------------------------------------------------------------------------
// World generation
// ---------------------------------------------------------------------------

function makeEnemy(wx: number, wy: number, patrolLeft: number, patrolRight: number): Enemy {
  return {
    wx,
    wy,
    vx: 1.2,
    patrolLeft,
    patrolRight,
    alive: true,
    dieTime: 0,
  };
}

function makePlatform(wx: number, wy: number, w: number, moving = false): Platform {
  return {
    wx,
    wy,
    w,
    isMoving: moving,
    moveRange: 40,
    moveSpeed: 1.0 + Math.random() * 0.8,
    moveDir: Math.random() < 0.5 ? 1 : -1,
    baseY: wy,
  };
}

function generateWorld(
  gs: GameState,
  targetX: number,
  albums: PlatformerAlbum[],
  artCache: Map<string, HTMLImageElement>,
): void {
  let cx = gs.worldEnd;

  // Starting safe zone
  if (cx === 0) {
    const startPlat = makePlatform(0, GROUND_Y, 600, false);
    gs.platforms.push(startPlat);
    gs.lastSafePlatform = startPlat;
    cx = 600;
  }

  let lastGroundX = 0;

  while (cx < targetX + 1400) {
    const gap = randomBetween(70, 80 + gs.level * 15);
    const w = randomBetween(90, 220);
    const platX = cx + gap;

    // Alternate between ground level and elevated
    const forceGround = platX - lastGroundX > 600;
    const elevated = !forceGround && Math.random() < 0.55;
    const platY = elevated ? randomBetween(220, 350) : GROUND_Y;

    if (!elevated) lastGroundX = platX;

    const isMoving = gs.level >= 3 && !elevated && Math.random() < 1 / 6;
    const plat = makePlatform(platX, platY, w, isMoving);
    gs.platforms.push(plat);

    // Add collectible (1 in 3 platforms)
    if (Math.random() < 1 / 3) {
      const album = albums.length > 0 ? albums[Math.floor(Math.random() * albums.length)] : null;
      let artImage: HTMLImageElement | null = null;
      if (album && album.artworkUrl) {
        const cached = artCache.get(album.id);
        if (cached) {
          artImage = cached;
        } else {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = album.artworkUrl;
          artCache.set(album.id, img);
          artImage = img;
        }
      }
      gs.collectibles.push({
        wx: platX + w / 2,
        wy: platY - 40,
        albumArt: artImage,
        albumTitle: album?.title ?? '',
        collected: false,
        collectTime: 0,
        rotAngle: 0,
      });
    }

    // Add enemy (1 in 4 platforms, level >= 2)
    if (gs.level >= 2 && Math.random() < 1 / 4) {
      gs.enemies.push(makeEnemy(platX + w / 2, platY, platX + 10, platX + w - 10));
    }

    cx = platX + w;
  }

  gs.worldEnd = cx;
}

// ---------------------------------------------------------------------------
// Particle spawning
// ---------------------------------------------------------------------------

function spawnParticles(
  gs: GameState,
  wx: number,
  wy: number,
  color: string,
  count: number,
  now: number,
): void {
  for (let i = 0; i < count; i++) {
    gs.particles.push({
      wx,
      wy,
      vx: randomBetween(-3, 3),
      vy: randomBetween(-5, -1),
      life: 600,
      maxLife: 600,
      color,
      radius: randomBetween(2, 5),
    });
  }
  void now; // used by caller
}

// ---------------------------------------------------------------------------
// Physics & update
// ---------------------------------------------------------------------------

function update(
  gs: GameState,
  dt: number,
  now: number,
  input: InputState,
  albums: PlatformerAlbum[],
  artCache: Map<string, HTMLImageElement>,
  onGameOver: (gs: GameState) => void,
): void {
  if (!gs.running) return;

  const hero = gs.hero;

  // ---- Moving platforms ----
  for (const p of gs.platforms) {
    if (p.isMoving) {
      p.wy += p.moveSpeed * p.moveDir;
      if (Math.abs(p.wy - p.baseY) >= p.moveRange) {
        p.moveDir = p.moveDir === 1 ? -1 : 1;
      }
    }
  }

  // ---- Hero horizontal movement ----
  if (hero.state !== 'die') {
    if (input.left) {
      hero.vx -= 0.8;
      hero.facingRight = false;
    } else if (input.right) {
      hero.vx += 0.8;
      hero.facingRight = true;
    } else {
      hero.vx *= FRICTION;
    }
    hero.vx = clamp(hero.vx, -MAX_VX, MAX_VX);

    // ---- Jump ----
    if (input.jumpPressed && !input.jumpConsumed && hero.jumpsLeft > 0) {
      if (hero.jumpsLeft === 2) {
        hero.vy = -JUMP_FORCE;
      } else {
        hero.vy = -DOUBLE_JUMP_FORCE;
      }
      hero.jumpsLeft--;
      input.jumpConsumed = true;
    }
  }

  // ---- Gravity ----
  hero.vy += GRAVITY;
  hero.vy = clamp(hero.vy, -99, MAX_VY_DOWN);

  // ---- Move hero ----
  const prevWy = hero.wy;
  hero.wx += hero.vx;
  hero.wy += hero.vy;

  // ---- Platform collision ----
  hero.onGround = false;
  for (const p of gs.platforms) {
    const platLeft = p.wx;
    const platRight = p.wx + p.w;
    const platTop = p.wy;
    const heroLeft = hero.wx - HERO_W / 2;
    const heroRight = hero.wx + HERO_W / 2;
    const heroBottom = hero.wy;
    const prevBottom = prevWy;

    if (
      hero.vy >= 0 &&
      prevBottom <= platTop &&
      heroBottom > platTop &&
      heroRight > platLeft &&
      heroLeft < platRight
    ) {
      hero.wy = platTop;
      hero.vy = 0;
      hero.onGround = true;
      hero.jumpsLeft = 2;
      gs.lastSafePlatform = p;
    }
  }

  // ---- Hero animation state ----
  if (hero.state !== 'die') {
    if (!hero.onGround) {
      hero.state = hero.vy < 0 ? 'jump' : 'fall';
    } else if (Math.abs(hero.vx) > 0.3) {
      hero.state = 'run';
    } else {
      hero.state = 'idle';
    }
  }

  // Animate frames
  hero.animTime += dt;
  if (hero.animTime > 80) {
    hero.animFrame++;
    hero.animTime = 0;
  }

  // ---- Enemy update ----
  for (const e of gs.enemies) {
    if (!e.alive) continue;

    // Patrol movement
    e.wx += e.vx;
    if (e.wx <= e.patrolLeft || e.wx >= e.patrolRight) {
      e.vx = -e.vx;
    }

    const heroLeft = hero.wx - HERO_W / 2;
    const heroRight = hero.wx + HERO_W / 2;
    const heroBottom = hero.wy;
    const heroTop = hero.wy - HERO_H;
    const eLeft = e.wx - ENEMY_W / 2;
    const eRight = e.wx + ENEMY_W / 2;
    const eTop = e.wy - ENEMY_H;

    // Stomp check: hero bottom within 12px of enemy top AND falling
    if (
      hero.vy > 0 &&
      heroBottom >= eTop - 12 &&
      heroBottom <= eTop + 12 &&
      heroRight > eLeft &&
      heroLeft < eRight
    ) {
      e.alive = false;
      e.dieTime = now;
      hero.vy = -9;
      gs.score += 100 * gs.level;
      spawnParticles(gs, e.wx, e.wy - ENEMY_H / 2, '#ef4444', 8, now);
    } else if (
      now > hero.invincibleUntil &&
      heroRight > eLeft + 4 &&
      heroLeft < eRight - 4 &&
      heroBottom > eTop + 4 &&
      heroTop < e.wy
    ) {
      // Side collision → take damage
      hero.invincibleUntil = now + INVINCIBLE_MS;
      gs.lives--;
      hero.vx = hero.wx < e.wx ? -5 : 5;
      hero.vy = -6;
      spawnParticles(gs, hero.wx, hero.wy - HERO_H / 2, '#f97316', 6, now);
      if (gs.lives <= 0) {
        hero.state = 'die';
        gs.running = false;
        onGameOver(gs);
        return;
      }
    }
  }

  // ---- Collectible collection ----
  for (const c of gs.collectibles) {
    if (c.collected) {
      c.rotAngle += 0.018;
      continue;
    }
    c.rotAngle += 0.018;
    const dx = hero.wx - c.wx;
    const dy = (hero.wy - HERO_H / 2) - c.wy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < RECORD_RADIUS + 14) {
      c.collected = true;
      c.collectTime = now;
      gs.score += 50 * gs.level;
      gs.recordsCollected++;
      gs.levelRecords++;
      spawnParticles(gs, c.wx, c.wy, '#fbbf24', 10, now);
      if (gs.levelRecords >= SONGS_PER_LEVEL) {
        gs.level++;
        gs.levelRecords = 0;
      }
    }
  }

  // ---- Death zone ----
  if (hero.wy > CANVAS_H + 100) {
    gs.lives--;
    if (gs.lives <= 0) {
      hero.state = 'die';
      gs.running = false;
      onGameOver(gs);
      return;
    } else {
      // Respawn
      const safe = gs.lastSafePlatform;
      if (safe) {
        hero.wx = safe.wx + safe.w / 2;
        hero.wy = safe.wy - 100;
      } else {
        hero.wx = 200;
        hero.wy = GROUND_Y - 100;
      }
      hero.vx = 0;
      hero.vy = 0;
      hero.invincibleUntil = now + INVINCIBLE_MS;
    }
  }

  // ---- Camera ----
  gs.cameraX = Math.max(0, hero.wx - CAMERA_LEAD);
  gs.distance = Math.max(gs.distance, hero.wx);

  // ---- Particle update ----
  for (const p of gs.particles) {
    p.wx += p.vx;
    p.wy += p.vy;
    p.vy += 0.2;
    p.life -= dt;
  }

  // ---- Cleanup ----
  // Remove particles that are dead
  gs.particles = gs.particles.filter((p) => p.life > 0);
  // Remove enemies that have been dead > 600ms
  gs.enemies = gs.enemies.filter((e) => e.alive || now - e.dieTime < 600);
  // Remove collectibles that have been collected > 600ms
  gs.collectibles = gs.collectibles.filter((c) => !c.collected || now - c.collectTime < 600);
  // Remove platforms that are > 400px behind camera
  const pruneX = gs.cameraX - 400;
  gs.platforms = gs.platforms.filter((p) => p.wx + p.w > pruneX);

  // ---- Distance score bonus ----
  gs.score = Math.max(gs.score, Math.floor(gs.distance / 10));

  // ---- World generation ----
  if (gs.worldEnd < gs.cameraX + 1200) {
    generateWorld(gs, gs.cameraX, albums, artCache);
  }

  void dt;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface BgImages {
  bg1?: HTMLImageElement;
  bg2?: HTMLImageElement;
  bg3?: HTMLImageElement;
}

function drawParallaxLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scrollX: number,
  y: number,
  drawH: number,
): void {
  if (!img.complete || img.naturalWidth === 0) return;
  const drawW = (img.naturalWidth / img.naturalHeight) * drawH;
  if (drawW <= 0) return;
  const offset = ((scrollX % drawW) + drawW) % drawW;
  let x = -offset;
  while (x < CANVAS_W + drawW) {
    ctx.drawImage(img, x, y, drawW, drawH);
    x += drawW;
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, cameraX: number, bgImages: BgImages): void {
  // Sky: use bg1 asset when available, else gradient
  if (bgImages.bg1?.complete && bgImages.bg1.naturalWidth > 0) {
    ctx.drawImage(bgImages.bg1, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#0e0e22');
    grad.addColorStop(1, '#1a1040');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Stars (always drawn on top of sky layer)
  const seed = Math.floor(cameraX / 400) * 400;
  const rng = seededRand(seed);
  const rng2 = seededRand(seed + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 40; i++) {
    const sx = rng() * CANVAS_W;
    const sy = rng2() * (GROUND_Y * 0.85);
    const sr = rng() * 1.2 + 0.3;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mid-ground mountains (bg2) — slow parallax
  if (bgImages.bg2) {
    drawParallaxLayer(ctx, bgImages.bg2, cameraX * 0.2, GROUND_Y - 150, 150);
  }

  // Near scenery (bg3) — faster parallax
  if (bgImages.bg3) {
    drawParallaxLayer(ctx, bgImages.bg3, cameraX * 0.5, GROUND_Y - 70, 70);
  }
}

function drawGround(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, GROUND_Y + PLATFORM_THICKNESS, CANVAS_W, CANVAS_H - GROUND_Y - PLATFORM_THICKNESS);
  ctx.fillStyle = '#374151';
  ctx.fillRect(0, GROUND_Y + PLATFORM_THICKNESS, CANVAS_W, 1);
}

function drawPlatforms(ctx: CanvasRenderingContext2D, platforms: Platform[], cameraX: number): void {
  for (const p of platforms) {
    const sx = p.wx - cameraX;
    if (sx + p.w < -10 || sx > CANVAS_W + 10) continue;

    const sy = p.wy;
    const r = 2;

    ctx.beginPath();
    ctx.moveTo(sx + r, sy);
    ctx.lineTo(sx + p.w - r, sy);
    ctx.quadraticCurveTo(sx + p.w, sy, sx + p.w, sy + r);
    ctx.lineTo(sx + p.w, sy + PLATFORM_THICKNESS - r);
    ctx.quadraticCurveTo(sx + p.w, sy + PLATFORM_THICKNESS, sx + p.w - r, sy + PLATFORM_THICKNESS);
    ctx.lineTo(sx + r, sy + PLATFORM_THICKNESS);
    ctx.quadraticCurveTo(sx, sy + PLATFORM_THICKNESS, sx, sy + PLATFORM_THICKNESS - r);
    ctx.lineTo(sx, sy + r);
    ctx.quadraticCurveTo(sx, sy, sx + r, sy);
    ctx.closePath();
    ctx.fillStyle = '#1e1b4b';
    ctx.fill();

    // Top edge highlight
    ctx.beginPath();
    ctx.moveTo(sx + r, sy);
    ctx.lineTo(sx + p.w - r, sy);
    ctx.strokeStyle = p.isMoving ? '#a78bfa' : '#6d28d9';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawRecord(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  c: Collectible,
  now: number,
  alpha = 1,
  scale = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(screenX, screenY);
  ctx.scale(scale, scale);
  ctx.rotate(c.rotAngle);

  // Glow
  ctx.shadowColor = 'rgba(167,139,250,0.5)';
  ctx.shadowBlur = 10;

  // Outer vinyl disc
  ctx.beginPath();
  ctx.arc(0, 0, RECORD_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#18182c';
  ctx.fill();

  // Groove rings
  for (let i = 1; i <= 6; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, RECORD_RADIUS * (0.35 + i * 0.095), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Center label
  const labelR = RECORD_RADIUS * 0.4;
  if (c.albumArt && c.albumArt.complete && c.albumArt.naturalWidth > 0) {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, labelR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(c.albumArt, -labelR, -labelR, labelR * 2, labelR * 2);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, labelR, 0, Math.PI * 2);
    ctx.fillStyle = '#4c1d95';
    ctx.fill();
  }

  // Spindle hole
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#0e0e22';
  ctx.shadowBlur = 0;
  ctx.fill();

  // Gloss overlay
  ctx.beginPath();
  ctx.arc(0, 0, RECORD_RADIUS, 0, Math.PI * 2);
  const gloss = ctx.createRadialGradient(-RECORD_RADIUS * 0.3, -RECORD_RADIUS * 0.3, 0, 0, 0, RECORD_RADIUS);
  gloss.addColorStop(0, 'rgba(255,255,255,0.12)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fill();

  ctx.restore();
  void now;
}

function drawCollectibles(ctx: CanvasRenderingContext2D, collectibles: Collectible[], cameraX: number, now: number): void {
  for (const c of collectibles) {
    const sx = c.wx - cameraX;
    if (sx < -60 || sx > CANVAS_W + 60) continue;

    if (!c.collected) {
      const bobY = Math.sin((now + c.wx * 200) / 700) * RECORD_BOB_AMP;
      drawRecord(ctx, sx, c.wy + bobY, c, now);
    } else {
      const age = now - c.collectTime;
      if (age < 600) {
        const progress = age / 600;
        drawRecord(ctx, sx, c.wy - age * 0.05, c, now, 1 - progress, 1 + progress * 0.4);
      }
    }
  }
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  cameraX: number,
  now: number,
  enemySkins?: HTMLImageElement[],
): void {
  const sx = e.wx - cameraX;
  const sy = e.wy;
  const movingLeft = e.vx < 0;

  // Pick a skin deterministically by position so the same enemy always looks the same
  const skinImg =
    enemySkins && enemySkins.length > 0
      ? enemySkins[Math.abs(Math.floor(e.wx / 120)) % enemySkins.length]
      : undefined;
  const useSkin = skinImg?.complete && skinImg.naturalWidth > 0;

  if (!e.alive) {
    const age = now - e.dieTime;
    if (age >= 600) return;
    const progress = age / 600;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.translate(sx, sy - ENEMY_H * (1 - progress) * 0.5);
    ctx.scale(1, 1 - progress * 0.9);
    if (useSkin) {
      ctx.drawImage(skinImg!, -ENEMY_W / 2, -ENEMY_H, ENEMY_W, ENEMY_H);
    } else {
      drawEnemyBody(ctx, movingLeft);
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(sx, sy);
  if (movingLeft) ctx.scale(-1, 1);
  if (useSkin) {
    ctx.drawImage(skinImg!, -ENEMY_W / 2, -ENEMY_H, ENEMY_W, ENEMY_H);
  } else {
    drawEnemyBody(ctx, false);
  }
  ctx.restore();
}

function drawEnemyBody(ctx: CanvasRenderingContext2D, _flipped: boolean): void {
  const hw = ENEMY_W / 2;
  const hh = ENEMY_H / 2;
  const r = 5;

  // Body
  ctx.beginPath();
  ctx.moveTo(-hw + r, -ENEMY_H);
  ctx.lineTo(hw - r, -ENEMY_H);
  ctx.quadraticCurveTo(hw, -ENEMY_H, hw, -ENEMY_H + r);
  ctx.lineTo(hw, -r);
  ctx.quadraticCurveTo(hw, 0, hw - r, 0);
  ctx.lineTo(-hw + r, 0);
  ctx.quadraticCurveTo(-hw, 0, -hw, -r);
  ctx.lineTo(-hw, -ENEMY_H + r);
  ctx.quadraticCurveTo(-hw, -ENEMY_H, -hw + r, -ENEMY_H);
  ctx.closePath();
  ctx.fillStyle = '#1f1f3a';
  ctx.fill();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Static noise lines (body texture)
  ctx.strokeStyle = 'rgba(220,38,38,0.25)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    const ly = -ENEMY_H + 6 + i * 7;
    ctx.beginPath();
    ctx.moveTo(-hw + 3, ly);
    ctx.lineTo(hw - 3, ly);
    ctx.stroke();
  }

  // Eyes
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(-6, -ENEMY_H + 10, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6, -ENEMY_H + 10, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Antenna
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -ENEMY_H);
  ctx.lineTo(0, -ENEMY_H - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -ENEMY_H - 12, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#f87171';
  ctx.fill();

  void hh;
}

function drawHero(ctx: CanvasRenderingContext2D, hero: Hero, now: number, heroSkin?: HTMLImageElement, bodySkin?: HTMLImageElement): void {
  const sx = CAMERA_LEAD;
  const sy = hero.wy;
  const flashing = now < hero.invincibleUntil && Math.floor(now / 100) % 2 === 0;

  if (hero.state === 'die') {
    ctx.save();
    ctx.translate(sx, sy - HERO_H / 2);
    ctx.rotate(Math.PI / 2);
    ctx.globalAlpha = 0.5;
    drawHeroBody(ctx, hero, now, heroSkin, bodySkin);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(sx, sy);
  if (!hero.facingRight) ctx.scale(-1, 1);
  if (flashing) ctx.globalAlpha = 0.45;
  drawHeroBody(ctx, hero, now, heroSkin, bodySkin);
  ctx.restore();
}

function drawHeroBody(ctx: CanvasRenderingContext2D, hero: Hero, _now: number, heroSkin?: HTMLImageElement, bodySkin?: HTMLImageElement): void {
  const isIdle = hero.state === 'idle';
  const isJumping = hero.state === 'jump' || hero.state === 'fall';
  const legSwing = isIdle ? 0 : Math.sin(hero.animFrame * 0.5) * 0.4;

  // Legs
  const legOffsetX = 6;
  const legLength = 14;

  // Left leg
  ctx.save();
  ctx.translate(-legOffsetX, 0);
  ctx.rotate(isJumping ? 0.3 : legSwing);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, legLength);
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // Right leg
  ctx.save();
  ctx.translate(legOffsetX, 0);
  ctx.rotate(isJumping ? -0.3 : -legSwing);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, legLength);
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // Torso
  const torsoH = isJumping ? 30 : 28;
  const torsoW = 20;
  const torsoR = 4;
  const torsoTop = -HERO_H + 14;
  ctx.beginPath();
  ctx.moveTo(-torsoW / 2 + torsoR, torsoTop);
  ctx.lineTo(torsoW / 2 - torsoR, torsoTop);
  ctx.quadraticCurveTo(torsoW / 2, torsoTop, torsoW / 2, torsoTop + torsoR);
  ctx.lineTo(torsoW / 2, torsoTop + torsoH - torsoR);
  ctx.quadraticCurveTo(torsoW / 2, torsoTop + torsoH, torsoW / 2 - torsoR, torsoTop + torsoH);
  ctx.lineTo(-torsoW / 2 + torsoR, torsoTop + torsoH);
  ctx.quadraticCurveTo(-torsoW / 2, torsoTop + torsoH, -torsoW / 2, torsoTop + torsoH - torsoR);
  ctx.lineTo(-torsoW / 2, torsoTop + torsoR);
  ctx.quadraticCurveTo(-torsoW / 2, torsoTop, -torsoW / 2 + torsoR, torsoTop);
  ctx.closePath();
  ctx.fillStyle = '#1c1917';
  ctx.fill();

  // Arms
  const armSwing = isIdle ? 0 : Math.sin(hero.animFrame * 0.5 + Math.PI) * 0.4;
  const armTop = torsoTop + 6;

  // Left arm
  ctx.save();
  ctx.translate(-torsoW / 2, armTop);
  ctx.rotate(isJumping ? -0.8 : armSwing);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, 10);
  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // Right arm
  ctx.save();
  ctx.translate(torsoW / 2, armTop);
  ctx.rotate(isJumping ? 0.8 : -armSwing);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(8, 10);
  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // Costume overlay — drawn after animated limbs so transparent areas reveal limb animation
  if (bodySkin && bodySkin.complete && bodySkin.naturalWidth > 0) {
    ctx.drawImage(bodySkin, -HERO_W / 2, -HERO_H, HERO_W, HERO_H);
  }

  // Head — use AI face portrait if available, otherwise draw default pixel head
  const headCY = torsoTop - 5;

  if (heroSkin && heroSkin.complete && heroSkin.naturalWidth > 0) {
    // Composite the face portrait onto the animated body.
    // Drawn square to match the 1:1 source image (avoids horizontal squish).
    // Centered on headCY so hair in the lower portion of the image naturally
    // overlaps the torso, which looks correct for long-haired characters.
    const faceW = 48;
    const faceH = 48;
    ctx.drawImage(heroSkin, -faceW / 2, headCY - faceH / 2, faceW, faceH);
  } else {
    ctx.beginPath();
    ctx.arc(0, headCY, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();

    // Eye (always on the right side since we flip the whole ctx for facing direction)
    ctx.beginPath();
    ctx.arc(4, headCY - 1, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, headCY - 1, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1e1b4b';
    ctx.fill();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], cameraX: number): void {
  for (const p of particles) {
    const sx = p.wx - cameraX;
    const sy = p.wy;
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.restore();
  }
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  lives: number,
  score: number,
  level: number,
  distance: number,
  levelRecords: number,
): void {
  // Semi-transparent bar
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, CANVAS_W, 40);

  ctx.font = 'bold 14px monospace';
  ctx.textBaseline = 'middle';

  // Lives — left
  const heartStr = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, MAX_LIVES - lives));
  ctx.fillStyle = '#f87171';
  ctx.textAlign = 'left';
  ctx.fillText(heartStr, 12, 20);

  // Distance — center
  const meters = Math.round(distance / 100);
  ctx.fillStyle = '#c4b5fd';
  ctx.textAlign = 'center';
  ctx.fillText(`${meters} m`, CANVAS_W / 2, 14);

  // Score — right
  ctx.fillStyle = '#fbbf24';
  ctx.textAlign = 'right';
  ctx.fillText(score.toLocaleString(), CANVAS_W - 12, 13);

  ctx.fillStyle = '#a78bfa';
  ctx.font = '11px monospace';
  ctx.fillText(`Lv ${level}`, CANVAS_W - 12, 28);

  // Level progress bar
  const barW = 80;
  const barH = 4;
  const barX = CANVAS_W / 2 - barW / 2;
  const barY = 28;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(barX, barY, barW * (levelRecords / SONGS_PER_LEVEL), barH);
}

function drawTouchControls(ctx: CanvasRenderingContext2D): void {
  const btnW = 60;
  const btnH = 50;
  const margin = 16;
  const bottomY = CANVAS_H - margin - btnH;

  ctx.globalAlpha = 0.6;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;

  // Left button
  const lx = margin;
  roundRect(ctx, lx, bottomY, btnW, btnH, 10);
  ctx.fill();
  ctx.stroke();

  // Right button
  const rx = margin + btnW + 10;
  roundRect(ctx, rx, bottomY, btnW, btnH, 10);
  ctx.fill();
  ctx.stroke();

  // Jump button
  const jx = CANVAS_W - margin - btnW;
  roundRect(ctx, jx, bottomY, btnW, btnH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'white';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('◀', lx + btnW / 2, bottomY + btnH / 2);
  ctx.fillText('▶', rx + btnW / 2, bottomY + btnH / 2);
  ctx.fillText('▲', jx + btnW / 2, bottomY + btnH / 2);

  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function draw(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  now: number,
  isMobile: boolean,
  bgImages?: BgImages,
  heroSkin?: HTMLImageElement,
  enemySkins?: HTMLImageElement[],
  bodySkin?: HTMLImageElement,
): void {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  drawBackground(ctx, gs.cameraX, bgImages ?? {});
  drawGround(ctx);
  drawPlatforms(ctx, gs.platforms, gs.cameraX);
  drawCollectibles(ctx, gs.collectibles, gs.cameraX, now);

  for (const e of gs.enemies) {
    drawEnemy(ctx, e, gs.cameraX, now, enemySkins);
  }

  drawHero(ctx, gs.hero, now, heroSkin, bodySkin);
  drawParticles(ctx, gs.particles, gs.cameraX);
  drawHUD(ctx, gs.lives, gs.score, gs.level, gs.distance, gs.levelRecords);

  if (isMobile) {
    drawTouchControls(ctx);
  }
}

// ---------------------------------------------------------------------------
// PlatformerGame component
// ---------------------------------------------------------------------------

interface PlatformerGameProps {
  bandIds: string[];
  heroSkinDataUrl?: string;
  bodySkinDataUrl?: string;
  enemySkinDataUrls?: string[];
  onGameOver: (score: number, level: number, recordsCollected: number, distancePx: number) => void;
}

function PlatformerGame({ bandIds, heroSkinDataUrl, bodySkinDataUrl, enemySkinDataUrls = [], onGameOver }: PlatformerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GameState | null>(null);
  const inputRef = useRef<InputState>({ left: false, right: false, jumpPressed: false, jumpConsumed: false });
  const rafRef = useRef<number>(0);
  const albumsRef = useRef<PlatformerAlbum[]>([]);
  const artCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const isMobileRef = useRef<boolean>(typeof window !== 'undefined' && 'ontouchstart' in window);
  const gameOverCalledRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if ('ontouchstart' in window) {
      setIsMobile(true);
      isMobileRef.current = true;
    }
  }, []);

  const bgImagesRef = useRef<BgImages>({});
  const heroSkinRef = useRef<HTMLImageElement | undefined>(undefined);
  const bodySkinRef = useRef<HTMLImageElement | undefined>(undefined);
  const enemySkinImagesRef = useRef<HTMLImageElement[]>([]);

  // Display state synced from game loop
  const [displayLives, setDisplayLives] = useState(MAX_LIVES);

  // Load albums for the selected bands
  const { data: albums = [] } = useQuery({
    queryKey: ['platformer-albums', ...bandIds],
    queryFn: () =>
      bandIds.length > 0 ? platformerApi.getAlbums(bandIds) : Promise.resolve([] as PlatformerAlbum[]),
    staleTime: 60_000,
  });

  useEffect(() => {
    albumsRef.current = albums;
  }, [albums]);

  // Load background assets
  const { data: bgAssets = [] } = useQuery({
    queryKey: ['platformer-assets'],
    queryFn: () => platformerApi.getAssets(),
    staleTime: 300_000,
  });

  useEffect(() => {
    const next: BgImages = {};
    for (const a of bgAssets) {
      if (a.assetType === 'bg1' || a.assetType === 'bg2' || a.assetType === 'bg3') {
        const img = new Image();
        img.src = a.dataUrl;
        next[a.assetType as keyof BgImages] = img;
      }
    }
    bgImagesRef.current = next;
  }, [bgAssets]);

  // Load hero skin
  useEffect(() => {
    if (!heroSkinDataUrl) { heroSkinRef.current = undefined; return; }
    const img = new Image();
    img.src = heroSkinDataUrl;
    heroSkinRef.current = img;
  }, [heroSkinDataUrl]);

  // Load body costume skin
  useEffect(() => {
    if (!bodySkinDataUrl) { bodySkinRef.current = undefined; return; }
    const img = new Image();
    img.src = bodySkinDataUrl;
    bodySkinRef.current = img;
  }, [bodySkinDataUrl]);

  // Load enemy skin images
  useEffect(() => {
    enemySkinImagesRef.current = enemySkinDataUrls.map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });
  }, [enemySkinDataUrls]);

  const handleGameOver = useCallback(
    (gs: GameState) => {
      if (gameOverCalledRef.current) return;
      gameOverCalledRef.current = true;
      cancelAnimationFrame(rafRef.current);
      onGameOver(gs.score, gs.level, gs.recordsCollected, Math.round(gs.distance));
    },
    [onGameOver],
  );

  useEffect(() => {
    const canvasOrNull = canvasRef.current;
    if (!canvasOrNull) return;
    // Safe: guarded above; re-typed so closures capture the non-null version.
    const canvas: HTMLCanvasElement = canvasOrNull;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;

    const ctxOrNull = canvas.getContext('2d');
    if (!ctxOrNull) return;
    // Safe: we just checked for null above; capturing in a non-null ref for closure use.
    const ctx: CanvasRenderingContext2D = ctxOrNull;
    ctx.scale(dpr, dpr);

    // Initial game state
    const initHero: Hero = {
      wx: 100,
      wy: GROUND_Y - HERO_H,
      vx: 0,
      vy: 0,
      onGround: false,
      jumpsLeft: 2,
      facingRight: true,
      state: 'idle',
      invincibleUntil: 0,
      animFrame: 0,
      animTime: 0,
    };

    const gs: GameState = {
      hero: initHero,
      platforms: [],
      collectibles: [],
      enemies: [],
      particles: [],
      cameraX: 0,
      score: 0,
      level: 1,
      lives: MAX_LIVES,
      recordsCollected: 0,
      levelRecords: 0,
      distance: 0,
      worldEnd: 0,
      running: true,
      lastSafePlatform: null,
      lastTimestamp: performance.now(),
    };

    generateWorld(gs, 0, albumsRef.current, artCacheRef.current);
    gsRef.current = gs;

    let lastLives = MAX_LIVES;

    function tick(timestamp: number) {
      const state = gsRef.current;
      if (!state) return;

      const dt = Math.min(timestamp - state.lastTimestamp, 50);
      state.lastTimestamp = timestamp;

      // Consume jump press
      if (inputRef.current.jumpPressed && inputRef.current.jumpConsumed) {
        // nothing — will be cleared on keyup
      }

      update(state, dt, timestamp, inputRef.current, albumsRef.current, artCacheRef.current, handleGameOver);
      draw(ctx, state, timestamp, false, bgImagesRef.current, heroSkinRef.current, enemySkinImagesRef.current, bodySkinRef.current);

      // Sync display state only when changed
      if (state.lives !== lastLives) {
        lastLives = state.lives;
        setDisplayLives(state.lives);
      }

      if (state.running) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    // Keyboard handlers
    function onKeyDown(e: KeyboardEvent) {
      const inp = inputRef.current;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          inp.left = true;
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'KeyD':
          inp.right = true;
          e.preventDefault();
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          if (!inp.jumpPressed) {
            inp.jumpPressed = true;
            inp.jumpConsumed = false;
          }
          e.preventDefault();
          break;
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const inp = inputRef.current;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          inp.left = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          inp.right = false;
          break;
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          inp.jumpPressed = false;
          inp.jumpConsumed = false;
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Canvas touch handlers — only prevent page scroll; actual game input comes from HTML overlay buttons
    function onTouchStart(e: TouchEvent) { e.preventDefault(); }
    function onTouchMove(e: TouchEvent) { e.preventDefault(); }
    function onTouchEnd(e: TouchEvent) { e.preventDefault(); }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [handleGameOver]);

  void displayLives; // used in HUD via canvas draw, not React DOM

  const ctrlBtn: React.CSSProperties = {
    width: 76,
    height: 76,
    borderRadius: 16,
    background: 'rgba(0,0,0,0.6)',
    border: '2px solid rgba(255,255,255,0.28)',
    color: 'white',
    fontSize: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    touchAction: 'none',
    cursor: 'pointer',
    WebkitUserSelect: 'none',
  };

  return (
    <div className="w-full h-full bg-gray-950 flex flex-col items-center justify-center">
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          maxWidth: `${CANVAS_W}px`,
          ...(isMobile ? { maxHeight: 'calc(100dvh - 108px)' } : {}),
          aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
          display: 'block',
          imageRendering: 'pixelated',
        }}
      />
      {isMobile && (
        <div
          style={{
            width: '100%',
            maxWidth: CANVAS_W,
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 20px',
            flexShrink: 0,
          }}
        >
          {/* Left + Right movement buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div
              style={ctrlBtn}
              onPointerDown={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                inputRef.current.left = true;
              }}
              onPointerUp={() => { inputRef.current.left = false; }}
              onPointerLeave={() => { inputRef.current.left = false; }}
              onPointerCancel={() => { inputRef.current.left = false; }}
            >◀</div>
            <div
              style={ctrlBtn}
              onPointerDown={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId);
                inputRef.current.right = true;
              }}
              onPointerUp={() => { inputRef.current.right = false; }}
              onPointerLeave={() => { inputRef.current.right = false; }}
              onPointerCancel={() => { inputRef.current.right = false; }}
            >▶</div>
          </div>
          {/* Jump button */}
          <div
            style={ctrlBtn}
            onPointerDown={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              inputRef.current.jumpPressed = true;
              inputRef.current.jumpConsumed = false;
            }}
            onPointerUp={() => { inputRef.current.jumpPressed = false; inputRef.current.jumpConsumed = false; }}
            onPointerLeave={() => { inputRef.current.jumpPressed = false; inputRef.current.jumpConsumed = false; }}
            onPointerCancel={() => { inputRef.current.jumpPressed = false; inputRef.current.jumpConsumed = false; }}
          >▲</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SetupScreen
// ---------------------------------------------------------------------------

interface SetupScreenProps {
  bands: Band[];
  selectedBandIds: string[];
  setSelectedBandIds: (ids: string[]) => void;
  skins: CharacterSkin[];
  selectedSkinId: string | null;
  setSelectedSkinId: (id: string | null) => void;
  bodySkins: BodySkin[];
  selectedBodySkinId: string | null;
  setSelectedBodySkinId: (id: string | null) => void;
  onStart: () => void;
}

function SetupScreen({ bands, selectedBandIds, setSelectedBandIds, skins, selectedSkinId, setSelectedSkinId, bodySkins, selectedBodySkinId, setSelectedBodySkinId, onStart }: SetupScreenProps) {
  function toggleBand(id: string) {
    if (selectedBandIds.includes(id)) {
      setSelectedBandIds(selectedBandIds.filter((b) => b !== id));
    } else {
      setSelectedBandIds([...selectedBandIds, id]);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white px-4 py-12">
      <div className="max-w-xl w-full space-y-8">
        {/* Title */}
        <div className="text-center space-y-2">
          <div className="text-5xl mb-2">🎮</div>
          <h1 className="text-4xl font-bold text-violet-300 tracking-tight">Vinyl Runner</h1>
          <p className="text-gray-400 text-sm">
            Collect vinyl records, stomp static-noise creatures, survive.
          </p>
        </div>

        {/* Band selector */}
        {bands.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
              Choose bands (album art on records)
            </h2>
            <div className="flex flex-wrap gap-2">
              {bands.map((b) => {
                const active = selectedBandIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleBand(b.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-violet-700 border-violet-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
            {selectedBandIds.length === 0 && (
              <p className="text-xs text-gray-500">
                No band selected — records will show abstract vinyl labels.
              </p>
            )}
          </div>
        )}

        {/* Character skin selector */}
        {skins.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
              Choose your character
            </h2>
            <div className="flex flex-wrap gap-3">
              {/* Default character option */}
              <button
                onClick={() => setSelectedSkinId(null)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                  selectedSkinId === null
                    ? 'border-violet-500 bg-violet-900/40'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="w-12 h-12 rounded bg-gray-700 flex items-center justify-center text-2xl">
                  🎮
                </div>
                <span className="text-xs text-gray-400 max-w-[56px] truncate">Default</span>
              </button>
              {skins.map((skin) => (
                <button
                  key={skin.id}
                  onClick={() => setSelectedSkinId(skin.id)}
                  title={`${skin.name}${skin.member ? ` (${skin.member.name})` : ''}${skin.band ? ` — ${skin.band.name}` : ''}`}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                    selectedSkinId === skin.id
                      ? 'border-violet-500 bg-violet-900/40'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <img
                    src={skin.dataUrl}
                    alt={skin.name}
                    className="w-12 h-12 rounded object-cover"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <span className="text-xs text-gray-400 max-w-[56px] truncate">{skin.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body skin selector */}
        {bodySkins.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
              Choose body style
            </h2>
            <div className="flex flex-wrap gap-3">
              {/* Default body option */}
              <button
                onClick={() => setSelectedBodySkinId(null)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                  selectedBodySkinId === null
                    ? 'border-violet-500 bg-violet-900/40'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="w-8 h-12 rounded bg-gray-700 flex items-center justify-center text-lg">
                  🎮
                </div>
                <span className="text-xs text-gray-400 max-w-[48px] truncate">Default</span>
              </button>
              {bodySkins.map((bs) => (
                <button
                  key={bs.id}
                  onClick={() => setSelectedBodySkinId(bs.id)}
                  title={`${bs.name}${bs.role ? ` (${bs.role})` : ''}`}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                    selectedBodySkinId === bs.id
                      ? 'border-violet-500 bg-violet-900/40'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <img
                    src={bs.dataUrl}
                    alt={bs.name}
                    style={{ imageRendering: 'pixelated', width: 32, height: 48 }}
                  />
                  <span className="text-xs text-gray-400 max-w-[48px] truncate">{bs.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">How to play</h2>
          <ul className="text-sm text-gray-300 space-y-1.5">
            <li>
              <span className="text-violet-400 font-mono">← → / A D</span> — Move left &amp; right
            </li>
            <li>
              <span className="text-violet-400 font-mono">↑ / W / Space</span> — Jump (press again
              mid-air for double jump)
            </li>
            <li>
              <span className="text-violet-400">Land on enemies</span> from above to stomp them
            </li>
            <li>
              <span className="text-violet-400">Collect glowing vinyl records</span> — 10 per level
            </li>
            <li>Enemies appear from level 2 onwards. Moving platforms from level 3.</li>
            <li>You have 3 lives. Falling off the screen costs a life.</li>
          </ul>
        </div>

        {/* Play button */}
        <button
          onClick={onStart}
          className="w-full py-4 bg-violet-700 hover:bg-violet-600 active:bg-violet-800 rounded-xl text-lg font-bold tracking-wide transition-colors shadow-lg shadow-violet-900/40"
        >
          Play
        </button>

        <div className="text-center">
          <Link to="/games" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← All games
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GameOverScreen
// ---------------------------------------------------------------------------

interface GameOverScreenProps {
  score: number;
  level: number;
  recordsCollected: number;
  distancePx: number;
  bandIds: string[];
  onPlayAgain: () => void;
}

function GameOverScreen({
  score,
  level,
  recordsCollected,
  distancePx,
  bandIds,
  onPlayAgain,
}: GameOverScreenProps) {
  const { user } = useAuth();
  const [scoreSaved, setScoreSaved] = useState(false);

  const { data: scores = [], isLoading: scoresLoading } = useQuery<PlatformerScore[]>({
    queryKey: ['platformer-scores'],
    queryFn: () => platformerApi.getScores(15),
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      platformerApi.saveScore({
        score,
        level,
        recordsCollected,
        distancePx,
        ...(bandIds.length > 0 ? { bandIds } : {}),
      }),
    onSuccess: () => {
      setScoreSaved(true);
    },
  });

  const meters = Math.round(distancePx / 100);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start py-12 px-4">
      <div className="max-w-xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="text-4xl mb-2">💿</div>
          <h1 className="text-3xl font-bold text-violet-300">Game Over</h1>
        </div>

        {/* Score card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Your run
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{score.toLocaleString()}</div>
              <div className="text-xs text-gray-400 mt-1">Score</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-violet-400">Lv {level}</div>
              <div className="text-xs text-gray-400 mt-1">Level reached</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{recordsCollected}</div>
              <div className="text-xs text-gray-400 mt-1">Records collected</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-sky-400">{meters} m</div>
              <div className="text-xs text-gray-400 mt-1">Distance</div>
            </div>
          </div>
        </div>

        {/* Save score */}
        {user && !scoreSaved && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full py-3 bg-violet-700 hover:bg-violet-600 disabled:opacity-60 rounded-xl font-semibold transition-colors"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save score to leaderboard'}
          </button>
        )}
        {scoreSaved && (
          <div className="text-center text-emerald-400 text-sm font-medium">
            Score saved!
            {saveMutation.data && ` You ranked #${saveMutation.data.rank}.`}
          </div>
        )}
        {!user && (
          <p className="text-center text-sm text-gray-500">
            Sign in to save your score to the leaderboard.
          </p>
        )}

        {/* Leaderboard */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
              Leaderboard
            </h2>
          </div>
          {scoresLoading ? (
            <div className="py-8 text-center text-gray-500 text-sm">Loading…</div>
          ) : scores.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">No scores yet. Be the first!</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2 text-left w-10">#</th>
                  <th className="px-4 py-2 text-left">Player</th>
                  <th className="px-4 py-2 text-right">Score</th>
                  <th className="px-4 py-2 text-right">Lv</th>
                  <th className="px-4 py-2 text-right hidden sm:table-cell">Records</th>
                </tr>
              </thead>
              <tbody>
                {scores.map((s, i) => (
                  <tr
                    key={i}
                    className={`border-t border-gray-800 ${
                      i === 0 ? 'text-yellow-400' : i < 3 ? 'text-violet-300' : 'text-gray-300'
                    }`}
                  >
                    <td className="px-4 py-2 font-mono text-gray-500">{s.rank}</td>
                    <td className="px-4 py-2 font-medium truncate max-w-[140px]">{s.playerName}</td>
                    <td className="px-4 py-2 text-right font-mono">{s.score.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-mono">{s.level}</td>
                    <td className="px-4 py-2 text-right font-mono hidden sm:table-cell">
                      {s.recordsCollected}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Play again */}
        <div className="flex gap-3">
          <button
            onClick={onPlayAgain}
            className="flex-1 py-3 bg-violet-700 hover:bg-violet-600 rounded-xl font-semibold transition-colors"
          >
            Play Again
          </button>
          <Link
            to="/games"
            className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl font-semibold transition-colors text-center"
          >
            All Games
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformerPage (root)
// ---------------------------------------------------------------------------

export default function PlatformerPage() {
  const [phase, setPhase] = useState<'setup' | 'playing' | 'gameover'>('setup');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [selectedSkinId, setSelectedSkinId] = useState<string | null>(null);
  const [selectedBodySkinId, setSelectedBodySkinId] = useState<string | null>(null);
  const [finalState, setFinalState] = useState({
    score: 0,
    level: 1,
    recordsCollected: 0,
    distancePx: 0,
  });

  const { data: bands = [] } = useQuery<Band[]>({
    queryKey: ['bands-list'],
    queryFn: () => api.get<Band[]>('/api/bands'),
    staleTime: 120_000,
  });

  const { data: bodySkins = [] } = useQuery<BodySkin[]>({
    queryKey: ['platformer-body-skins'],
    queryFn: () => platformerApi.getBodySkins(),
    staleTime: 300_000,
  });

  // Player-side skins: only skins belonging to selected bands (or all if none selected)
  const { data: playerSkins = [] } = useQuery<CharacterSkin[]>({
    queryKey: ['platformer-player-skins', ...selectedBandIds],
    queryFn: () =>
      platformerApi.getSkins(selectedBandIds.length > 0 ? { bandIds: selectedBandIds } : undefined),
    staleTime: 60_000,
  });

  // Enemy skins: skins from bands NOT selected by the player
  const { data: enemySkins = [] } = useQuery<CharacterSkin[]>({
    queryKey: ['platformer-enemy-skins', ...selectedBandIds],
    queryFn: () =>
      platformerApi.getSkins(selectedBandIds.length > 0 ? { excludeBandIds: selectedBandIds } : undefined),
    staleTime: 60_000,
  });

  const selectedSkin = playerSkins.find((s) => s.id === selectedSkinId) ?? null;
  const selectedBodySkin = bodySkins.find((bs) => bs.id === selectedBodySkinId) ?? null;
  const enemySkinDataUrls = enemySkins.slice(0, 20).map((s) => s.dataUrl);

  function handleStart() {
    setPhase('playing');
  }

  function handleGameOver(score: number, level: number, recordsCollected: number, distancePx: number) {
    setFinalState({ score, level, recordsCollected, distancePx });
    setPhase('gameover');
  }

  function handlePlayAgain() {
    setPhase('setup');
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {phase !== 'playing' && <SiteHeader theme="dark" active="games" />}

      {phase === 'setup' && (
        <SetupScreen
          bands={bands}
          selectedBandIds={selectedBandIds}
          setSelectedBandIds={setSelectedBandIds}
          skins={playerSkins}
          selectedSkinId={selectedSkinId}
          setSelectedSkinId={setSelectedSkinId}
          bodySkins={bodySkins}
          selectedBodySkinId={selectedBodySkinId}
          setSelectedBodySkinId={setSelectedBodySkinId}
          onStart={handleStart}
        />
      )}

      {phase === 'playing' && (
        <div className="flex-1 flex flex-col">
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: '#030712',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}
          >
            <PlatformerGame
              bandIds={selectedBandIds}
              heroSkinDataUrl={selectedSkin?.dataUrl}
              bodySkinDataUrl={selectedBodySkin?.dataUrl}
              enemySkinDataUrls={enemySkinDataUrls}
              onGameOver={handleGameOver}
            />
          </div>
        </div>
      )}

      {phase === 'gameover' && (
        <GameOverScreen
          score={finalState.score}
          level={finalState.level}
          recordsCollected={finalState.recordsCollected}
          distancePx={finalState.distancePx}
          bandIds={selectedBandIds}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}

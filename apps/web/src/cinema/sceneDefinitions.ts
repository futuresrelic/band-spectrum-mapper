/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cinema Mode scene definitions.
 *
 * CRITICAL: every tick() must call camera.lookAt() after setting camera.position.
 * TrackballControls is disabled during playback (controls.enabled = false), which
 * means Three.js does NOT automatically orient the camera toward controls.target.
 * Without the explicit lookAt(), the camera moves but keeps staring in whatever
 * direction it happened to be pointing — the orbit looks broken.
 *
 * Scenes 4–5 delegate to updateOrbitCamera() which calls lookAt() internally.
 */

import type { CinemaNode, CinemaScene } from './types';
import { initOrbitState, updateOrbitCamera, type OrbitCameraState } from './orbitCamera';

// ── Scene 4 / 5 shared state ─────────────────────────────────────────────────

interface OrbitTourState {
  currentIdx: number;
  candidates: CinemaNode[];
  orbitState: OrbitCameraState | null;
  prevTargetX: number;
  prevTargetY: number;
  prevTargetZ: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCamera(fg: any) { return fg?.camera?.(); }
function getCtrl(fg: any)   { return fg?.controls?.(); }

export const CINEMA_SCENES: CinemaScene[] = [
  // ── 1. Artist Universe ──────────────────────────────────────────────────────
  {
    id: 'artist-universe',
    name: 'Artist Universe',
    description: 'A slow orbital survey of artists and songs arranged in concentric rings',
    emoji: '🌟',
    durationMs: 40_000,
    arrangeMode: 'radial',
    enter(fg) {
      setTimeout(() => fg?.zoomToFit?.(1200, 60), 1900);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00007 * controls.orbitSpeed;
      const dist  = 640;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 100 + Math.sin(elapsedMs * 0.00014) * 35;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 2. Galaxy Drift ─────────────────────────────────────────────────────────
  {
    id: 'galaxy-drift',
    name: 'Galaxy Drift',
    description: 'A slow descent from high above as the song galaxy reveals itself',
    emoji: '🌌',
    durationMs: 35_000,
    arrangeMode: 'galaxy',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 900; camera.position.z = 400; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 35_000);
      const y     = 900 - t * 700;
      const angle = elapsedMs * 0.00005 * controls.orbitSpeed;
      const r     = 400 - t * 100;
      camera.position.x = Math.sin(angle) * r;
      camera.position.y = y;
      camera.position.z = Math.cos(angle) * r;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 3. Inside the Sphere ────────────────────────────────────────────────────
  {
    id: 'inside-the-sphere',
    name: 'Inside the Sphere',
    description: 'Camera drifts at the heart of the universe — an immersive 360° panorama',
    emoji: '🔮',
    durationMs: 30_000,
    arrangeMode: 'sphere',
    enter(fg) {
      setTimeout(() => {
        const camera = getCamera(fg);
        const ctrl   = getCtrl(fg);
        if (camera) { camera.position.x = 0; camera.position.y = 5; camera.position.z = 0; }
        if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 160; ctrl.target.z = 0; }
      }, 1700);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      camera.position.x = Math.sin(elapsedMs * 0.00004 * controls.orbitSpeed) * 10;
      camera.position.y = 5 + Math.sin(elapsedMs * 0.00003) * 8;
      camera.position.z = Math.cos(elapsedMs * 0.00004 * controls.orbitSpeed) * 10;
      const a = elapsedMs * 0.00009 * controls.orbitSpeed;
      const R = 160;
      ctrl.target.x = Math.sin(a) * R;
      ctrl.target.y = Math.sin(elapsedMs * 0.00006) * R;
      ctrl.target.z = Math.cos(a) * R;
      camera.lookAt(ctrl.target.x, ctrl.target.y, ctrl.target.z);
    },
  },

  // ── 4. Solar System Tour ────────────────────────────────────────────────────
  {
    id: 'solar-system-tour',
    name: 'Solar System Tour',
    description: 'Orbiting each artist star in the solar system — camera circles every node',
    emoji: '🪐',
    durationMs: 45_000,
    arrangeMode: 'solar-system',
    enter(fg, nodes): OrbitTourState {
      const artists = nodes.filter(n => n.type === 'artist');
      setTimeout(() => fg?.zoomToFit?.(1800, 60), 1900);
      return { currentIdx: 0, candidates: artists, orbitState: null, prevTargetX: 0, prevTargetY: 0, prevTargetZ: 0 };
    },
    tick(fg, _n, _a, elapsedMs, state, controls) {
      const s = state as OrbitTourState;
      const camera = getCamera(fg);
      if (!camera) return;

      if (!s.orbitState) {
        const node = s.candidates[s.currentIdx % Math.max(1, s.candidates.length)];
        if (!node || node.x == null) return;
        const dwellMs = Math.round(8000 / controls.speedMultiplier);
        s.orbitState = initOrbitState(
          node.x, node.y ?? 0, node.z ?? 0,
          camera.position.x, camera.position.y, camera.position.z,
          elapsedMs, dwellMs,
          s.prevTargetX, s.prevTargetY, s.prevTargetZ,
        );
      }

      const result = updateOrbitCamera(fg, s.orbitState, elapsedMs, controls);
      if (result === 'done') {
        s.prevTargetX = s.orbitState.targetX;
        s.prevTargetY = s.orbitState.targetY;
        s.prevTargetZ = s.orbitState.targetZ;
        s.currentIdx++;
        s.orbitState = null;
      }
    },
  },

  // ── 5. Node Flythrough ──────────────────────────────────────────────────────
  {
    id: 'node-flythrough',
    name: 'Node Flythrough',
    description: 'A guided orbit hop through connected songs and albums',
    emoji: '✨',
    durationMs: 35_000,
    arrangeMode: 'natural',
    enter(_fg, nodes, adj): OrbitTourState {
      const songs = nodes.filter(n => n.type === 'song');
      const start = songs[Math.floor(Math.random() * songs.length)];
      const neighborIds = [...(adj.get(start?.id ?? '') ?? [])];
      const neighbors   = nodes.filter(n => neighborIds.includes(n.id));
      return {
        currentIdx: 0,
        candidates: neighbors.length ? neighbors : songs,
        orbitState: null,
        prevTargetX: 0, prevTargetY: 0, prevTargetZ: 0,
      };
    },
    tick(fg, nodes, adj, elapsedMs, state, controls) {
      const s = state as OrbitTourState & { currentNodeId?: string };
      const camera = getCamera(fg);
      if (!camera) return;

      if (!s.orbitState) {
        const pool = s.currentNodeId
          ? nodes.filter(n => adj.get(s.currentNodeId!)?.has(n.id))
          : s.candidates;
        const target = pool.length
          ? pool[Math.floor(Math.random() * pool.length)]
          : s.candidates[s.currentIdx % Math.max(1, s.candidates.length)];
        if (!target || target.x == null) return;
        s.currentNodeId = target.id;
        const dwellMs = Math.round(4500 / controls.speedMultiplier);
        s.orbitState = initOrbitState(
          target.x, target.y ?? 0, target.z ?? 0,
          camera.position.x, camera.position.y, camera.position.z,
          elapsedMs, dwellMs,
          s.prevTargetX, s.prevTargetY, s.prevTargetZ,
        );
      }

      const result = updateOrbitCamera(fg, s.orbitState, elapsedMs, controls);
      if (result === 'done') {
        s.prevTargetX = s.orbitState.targetX;
        s.prevTargetY = s.orbitState.targetY;
        s.prevTargetZ = s.orbitState.targetZ;
        s.currentIdx++;
        s.orbitState = null;
      }
    },
  },

  // ── 6. Emotional Spectrum ───────────────────────────────────────────────────
  {
    id: 'emotional-spectrum',
    name: 'Emotional Spectrum',
    description: 'A sweeping orbital view of the emotional similarity constellation',
    emoji: '💜',
    durationMs: 30_000,
    arrangeMode: 'emotional-spectrum',
    enter(fg) {
      setTimeout(() => fg?.zoomToFit?.(1200, 60), 1900);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const dist  = 480;
      const angle = elapsedMs * 0.00004 * controls.orbitSpeed;
      const tilt  = elapsedMs * 0.00003;
      camera.position.x = Math.sin(angle) * dist * Math.cos(tilt);
      camera.position.y = 200 + Math.sin(elapsedMs * 0.00007) * 150;
      camera.position.z = Math.cos(angle) * dist * Math.cos(tilt);
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 7. Lyrical DNA ──────────────────────────────────────────────────────────
  {
    id: 'lyrical-dna',
    name: 'Lyrical DNA',
    description: 'A slow zoom into the heart of the music galaxy',
    emoji: '🧬',
    durationMs: 35_000,
    arrangeMode: 'helix',
    enter(fg) {
      setTimeout(() => fg?.zoomToFit?.(1600, 80), 2000);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00004 * controls.orbitSpeed;
      const r = 320;
      const y = Math.sin(elapsedMs * 0.00005) * 180;
      camera.position.x = Math.sin(angle) * r;
      camera.position.y = y;
      camera.position.z = Math.cos(angle) * r;
      ctrl.target.x = 0; ctrl.target.y = y * 0.3; ctrl.target.z = 0;
      camera.lookAt(0, y * 0.3, 0);
    },
  },

  // ── 8. Cosmic Overview ──────────────────────────────────────────────────────
  {
    id: 'cosmic-overview',
    name: 'Cosmic Overview',
    description: "A majestic bird's-eye view — the entire universe in one orbit",
    emoji: '🌍',
    durationMs: 30_000,
    arrangeMode: 'sphere',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 650; camera.position.z = 0; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00008 * controls.orbitSpeed;
      const dist  = 520;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 420 - Math.sin(elapsedMs * 0.00006) * 120;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 9. Genre Web ────────────────────────────────────────────────────────────
  {
    id: 'genre-web',
    name: 'Genre Web',
    description: 'Songs cluster around their genres and themes — explore the musical taxonomy',
    emoji: '🎸',
    durationMs: 35_000,
    arrangeMode: 'genre-web',
    enter(fg) {
      setTimeout(() => fg?.zoomToFit?.(1400, 60), 1900);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00005 * controls.orbitSpeed;
      const dist  = 680;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 180 + Math.sin(elapsedMs * 0.00008) * 80;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 10. Fibonacci Torus ──────────────────────────────────────────────────────
  {
    id: 'fibonacci-torus',
    name: 'Fibonacci Torus',
    description: 'Songs woven into a golden spiral torus — the mathematics of nature made musical',
    emoji: '🌀',
    durationMs: 38_000,
    arrangeMode: 'fibonacci-torus',
    enter(fg) {
      setTimeout(() => fg?.zoomToFit?.(1400, 60), 1900);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00005 * controls.orbitSpeed;
      const tilt  = Math.sin(elapsedMs * 0.00003) * 0.5;
      const dist  = 460;
      camera.position.x = Math.sin(angle) * dist * Math.cos(tilt);
      camera.position.y = dist * Math.sin(tilt) + Math.sin(elapsedMs * 0.00007) * 80;
      camera.position.z = Math.cos(angle) * dist * Math.cos(tilt);
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 11. Fractal Tree ─────────────────────────────────────────────────────────
  {
    id: 'fractal-tree',
    name: 'Fractal Tree',
    description: 'Artists at the roots, albums the branches, songs the leaves — the tree of music',
    emoji: '🌳',
    durationMs: 35_000,
    arrangeMode: 'fractal-tree',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 600; camera.position.y = -100; camera.position.z = 0; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t      = Math.min(1, elapsedMs / 20_000);
      const targetY = -200 + t * 400;
      const angle  = elapsedMs * 0.00005 * controls.orbitSpeed;
      const dist   = 520 - t * 180;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = targetY + 80;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = targetY; ctrl.target.z = 0;
      camera.lookAt(0, targetY, 0);
    },
  },

  // ── 12. Mandala ───────────────────────────────────────────────────────────────
  {
    id: 'mandala',
    name: 'Mandala',
    description: 'Sacred geometry — concentric rings of artists, albums, and songs in perfect symmetry',
    emoji: '🪷',
    durationMs: 32_000,
    arrangeMode: 'mandala',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 700; camera.position.z = 60; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00006 * controls.orbitSpeed;
      const pulse = Math.sin(elapsedMs * 0.00008) * 100;
      const dist  = 580 + pulse;
      camera.position.x = Math.sin(angle) * dist * 0.3;
      camera.position.y = dist - 100;
      camera.position.z = Math.cos(angle) * dist * 0.3;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 13. Wave Rider ────────────────────────────────────────────────────────────
  {
    id: 'wave',
    name: 'Wave Rider',
    description: 'Ride the undulating wave of music — songs rise and fall like the open sea',
    emoji: '🌊',
    durationMs: 30_000,
    arrangeMode: 'wave',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 200; camera.position.z = 500; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00006 * controls.orbitSpeed;
      const dist  = 420;
      const wave  = Math.sin(elapsedMs * 0.0001) * 60;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 120 + wave;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = wave * 0.3; ctrl.target.z = 0;
      camera.lookAt(0, wave * 0.3, 0);
    },
  },

  // ── 14. Lissajous Trip ────────────────────────────────────────────────────────
  {
    id: 'lissajous',
    name: 'Lissajous Trip',
    description: 'A psychedelic journey through interlocking curves — pure mathematics meets rock and roll',
    emoji: '🔯',
    durationMs: 35_000,
    arrangeMode: 'lissajous',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 0; camera.position.z = 600; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const a1 = elapsedMs * 0.00007 * controls.orbitSpeed;
      const a2 = elapsedMs * 0.00004 * controls.orbitSpeed;
      const dist = 520;
      camera.position.x = Math.sin(a1) * dist;
      camera.position.y = Math.sin(a2) * 200;
      camera.position.z = Math.cos(a1) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 15. Crystal Cave ──────────────────────────────────────────────────────────
  {
    id: 'crystal',
    name: 'Crystal Cave',
    description: 'Descend into a hexagonal crystal lattice — pure isometric geometry, pure sound',
    emoji: '💎',
    durationMs: 35_000,
    arrangeMode: 'crystal',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 600; camera.position.z = 400; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 15_000);
      const angle = elapsedMs * 0.00006 * controls.orbitSpeed;
      const dist  = 600 - t * 350;
      const yPos  = 600 - t * 580;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = yPos * 0.2; ctrl.target.z = 0;
      camera.lookAt(0, yPos * 0.2, 0);
    },
  },
];

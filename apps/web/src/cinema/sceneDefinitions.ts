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
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      // Torus R=220 r=60. Enter at 35° elevation showing the full donut shape.
      if (camera) { camera.position.x = 290; camera.position.y = 205; camera.position.z = 310; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00005 * controls.orbitSpeed;
      // Tilt oscillates: alternately face-on (flat disk) and edge-on (ring silhouette)
      const tilt  = Math.sin(elapsedMs * 0.000025) * 0.65;
      const dist  = 455;
      camera.position.x = Math.sin(angle) * dist * Math.cos(tilt);
      camera.position.y = dist * Math.sin(tilt) + Math.sin(elapsedMs * 0.00007) * 55;
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
      // Enter near root level, looking up the trunk from one side
      if (camera) { camera.position.x = 480; camera.position.y = -165; camera.position.z = 220; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = -80; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, -80, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      // Ease in-out rise from roots (y=-200) through canopy (y=110) over 22s
      const t      = Math.min(1, elapsedMs / 22_000);
      const eased  = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const targetY = -180 + eased * 340;
      const angle  = elapsedMs * 0.00006 * controls.orbitSpeed;
      const dist   = 520 - eased * 155;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = targetY + 60;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = targetY; ctrl.target.z = 0;
      camera.lookAt(0, targetY, 0);
    },
  },

  // ── 12. Mandala ───────────────────────────────────────────────────────────────
  {
    id: 'mandala',
    name: 'Mandala',
    description: 'Sacred geometry — concentric rippled rings of artists, albums, and songs',
    emoji: '🪷',
    durationMs: 32_000,
    arrangeMode: 'mandala',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      // Pure top-down: the full mandala pattern reveals itself immediately
      if (camera) { camera.position.x = 0; camera.position.y = 760; camera.position.z = 20; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle   = elapsedMs * 0.00006 * controls.orbitSpeed;
      // Breathe between full overhead and a 40° oblique swoop
      const breathe = Math.sin(elapsedMs * 0.00007) * 130;
      const dist    = 650 + breathe;
      const tilt    = 0.05 + Math.sin(elapsedMs * 0.000032) * 0.36;
      camera.position.x = Math.sin(angle) * dist * tilt;
      camera.position.y = dist * (1 - tilt * 0.38);
      camera.position.z = Math.cos(angle) * dist * tilt;
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
      // Low-angle view skimming across the wave surface from one end
      if (camera) { camera.position.x = 0; camera.position.y = 170; camera.position.z = 620; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00005 * controls.orbitSpeed;
      // Camera rides its own sine wave, staying low and dramatic
      const wave  = Math.sin(elapsedMs * 0.00009) * 68;
      const dist  = 475;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 115 + wave;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = wave * 0.25; ctrl.target.z = 0;
      camera.lookAt(0, wave * 0.25, 0);
    },
  },

  // ── 14. Lissajous Trip ────────────────────────────────────────────────────────
  {
    id: 'lissajous',
    name: 'Lissajous Trip',
    description: 'A psychedelic 3:5:7 Lissajous knot — pure mathematics meets rock and roll',
    emoji: '🔯',
    durationMs: 35_000,
    arrangeMode: 'lissajous',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      // Off-axis angle that immediately shows the 3D depth of the knot
      if (camera) { camera.position.x = 360; camera.position.y = 180; camera.position.z = 420; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      // Two independent rotation speeds reveal the knot's complex topology
      const a1   = elapsedMs * 0.000068 * controls.orbitSpeed;
      const a2   = elapsedMs * 0.000037 * controls.orbitSpeed;
      const dist = 535;
      camera.position.x = Math.sin(a1) * dist;
      camera.position.y = Math.sin(a2) * 225;
      camera.position.z = Math.cos(a1) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 15. Crystal Cave ──────────────────────────────────────────────────────────
  {
    id: 'crystal',
    name: 'Crystal Cave',
    description: 'Descend into a hexagonal crystal lattice — isometric geometry, pure sound',
    emoji: '💎',
    durationMs: 35_000,
    arrangeMode: 'crystal',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      // True isometric entry: equal projection from all three axes
      if (camera) { camera.position.x = 285; camera.position.y = 425; camera.position.z = 325; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      // Phase 1 (0–15s): descend from isometric overhead into the lattice
      // Phase 2 (15s+): orbit at close range inside the crystal
      const t     = Math.min(1, elapsedMs / 15_000);
      const angle = elapsedMs * 0.000058 * controls.orbitSpeed;
      const dist  = 620 - t * 385;
      const yPos  = 425 - t * 405;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = yPos * 0.14; ctrl.target.z = 0;
      camera.lookAt(0, yPos * 0.14, 0);
    },
  },

  // ── 16. Fibonacci Spiral ──────────────────────────────────────────────────────
  {
    id: 'fibonacci-spiral',
    name: 'Fibonacci Spiral',
    description: 'The golden ratio of sound — every node in its natural fibonacci place',
    emoji: '🌻',
    durationMs: 36_000,
    arrangeMode: 'fibonacci-spiral',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      // Start directly overhead: the sunflower pattern is most beautiful from above
      if (camera) { camera.position.x = 0; camera.position.y = 720; camera.position.z = 50; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 24_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const angle = elapsedMs * 0.000042 * controls.orbitSpeed;
      // Descend from top-down to a sweeping side view, revealing the 3D depth
      const dist  = 680 - eased * 355;
      const yPos  = 720 - eased * 610;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },
  // ── 17. Triangle of Power ────────────────────────────────────────────────────
  {
    id: 'star-3',
    name: 'Triangle of Power',
    description: 'Three stellar pillars — albums radiate from each point of the sacred triangle',
    emoji: '🔺',
    durationMs: 30_000,
    arrangeMode: 'star-3',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 80; camera.position.y = 720; camera.position.z = 80; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 18_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const angle = elapsedMs * 0.00005 * controls.orbitSpeed;
      const dist  = 620 - eased * 180;
      const yPos  = 720 - eased * 480;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 18. Four Pillars ─────────────────────────────────────────────────────────
  {
    id: 'star-4',
    name: 'Four Pillars',
    description: 'A cardinal compass of sound — four points anchoring the musical universe',
    emoji: '✦',
    durationMs: 32_000,
    arrangeMode: 'star-4',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 680; camera.position.z = 60; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.000055 * controls.orbitSpeed;
      const t     = Math.min(1, elapsedMs / 20_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const dist  = 580 - eased * 160;
      const yPos  = 680 - eased * 430;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 19. Five-Pointed Star ────────────────────────────────────────────────────
  {
    id: 'star-5',
    name: 'Five-Pointed Star',
    description: 'The classic pentagram — five constellations of music orbit a shared center',
    emoji: '⭐',
    durationMs: 36_000,
    arrangeMode: 'star-5',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 140; camera.position.y = 740; camera.position.z = 0; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 22_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const angle = elapsedMs * 0.000045 * controls.orbitSpeed;
      const dist  = 620 - eased * 200;
      const yPos  = 740 - eased * 530;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 20. Star of David ────────────────────────────────────────────────────────
  {
    id: 'star-6',
    name: 'Star of David',
    description: 'The hexagram — two interleaved triangles, six arms radiating perfect symmetry',
    emoji: '✡',
    durationMs: 34_000,
    arrangeMode: 'star-6',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 760; camera.position.z = 30; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 20_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const angle = elapsedMs * 0.000038 * controls.orbitSpeed;
      const dist  = 640 - eased * 210;
      const yPos  = 760 - eased * 540;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 21. Seven-Pointed Star ───────────────────────────────────────────────────
  {
    id: 'star-7',
    name: 'Seven-Pointed Star',
    description: 'The heptagram — seven arms of sound reaching into the void, perfect and indivisible',
    emoji: '🌟',
    durationMs: 38_000,
    arrangeMode: 'star-7',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 200; camera.position.y = 700; camera.position.z = 200; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 24_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const angle = elapsedMs * 0.000042 * controls.orbitSpeed;
      // Breathe between overhead and oblique — the 7-fold symmetry reveals itself slowly
      const breathe = Math.sin(elapsedMs * 0.000055) * 60;
      const dist  = 600 - eased * 175 + breathe;
      const yPos  = 700 - eased * 490;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 22. Octagram Gate ────────────────────────────────────────────────────────
  {
    id: 'star-8',
    name: 'Octagram Gate',
    description: 'Eight rays of precision — the double-square star opens into infinite symmetry',
    emoji: '✴',
    durationMs: 34_000,
    arrangeMode: 'star-8',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 720; camera.position.z = 0; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 18_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const angle = elapsedMs * 0.000048 * controls.orbitSpeed;
      const dist  = 600 - eased * 190;
      const yPos  = 720 - eased * 510;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 23. Nonagon Infinity ─────────────────────────────────────────────────────
  {
    id: 'nonagon-infinity',
    name: 'Nonagon Infinity',
    description: 'Nine vertices, one infinite loop — albums locked in the eternal cyclic polygon',
    emoji: '🔯',
    durationMs: 40_000,
    arrangeMode: 'nonagon-infinity',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      // Enter directly overhead revealing the 9-fold symmetry — then descend
      if (camera) { camera.position.x = 0; camera.position.y = 780; camera.position.z = 40; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 0, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      // Phase 1 (0–20s): descend from top-down into an oblique sweep
      // Phase 2 (20s+): slow orbit at mid-altitude, matching the cyclic nature of the album
      const t     = Math.min(1, elapsedMs / 20_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const angle = elapsedMs * 0.000032 * controls.orbitSpeed;
      const dist  = 660 - eased * 230;
      const yPos  = 780 - eased * 560;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  {
    id: 'genre-radar',
    name: 'Genre Radar',
    description: 'Songs orbit their genre poles — see where music truly lives on the spectrum',
    emoji: '🎼',
    durationMs: 40_000,
    arrangeMode: 'genre-radar',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      // 35° elevation looking over the full hexagon from above-side
      if (camera) { camera.position.x = 260; camera.position.y = 520; camera.position.z = 360; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 20; ctrl.target.z = 0; }
      if (camera) camera.lookAt(0, 20, 0);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      // Slow orbital sweep — lets user read which cluster is which genre
      const t     = Math.min(1, elapsedMs / 18_000);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const angle = elapsedMs * 0.000028 * controls.orbitSpeed;
      // Descend gently from high overview to mid-angle for immersion
      const dist = 600 - eased * 160;
      const yPos = 520 - eased * 200;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = yPos;
      camera.position.z = Math.cos(angle) * dist;
      ctrl.target.x = 0; ctrl.target.y = 20; ctrl.target.z = 0;
      camera.lookAt(0, 20, 0);
    },
  },

  // ── 25. Lyric Solar System ───────────────────────────────────────────────────
  {
    id: 'lyric-solar',
    name: 'Lyric Solar System',
    description: 'Songs orbit albums, keywords orbit songs — the full lyrical hierarchy in orbital space',
    emoji: '☀️',
    durationMs: 45_000,
    arrangeMode: 'lyric-solar',
    enter(fg) {
      setTimeout(() => fg?.zoomToFit?.(1800, 80), 2000);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00004 * controls.orbitSpeed;
      // Slowly oscillate between overhead (top-down) and oblique to show full hierarchy
      const tilt  = Math.sin(elapsedMs * 0.000025) * 0.5;
      const dist  = 500;
      camera.position.x = Math.sin(angle) * dist * (1 - Math.abs(tilt) * 0.3);
      camera.position.y = dist * Math.sin(tilt) + Math.sin(elapsedMs * 0.00006) * 55;
      camera.position.z = Math.cos(angle) * dist * (1 - Math.abs(tilt) * 0.3);
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
    },
  },

  // ── 26. Chronological Tour ───────────────────────────────────────────────────
  {
    id: 'chrono-orbit',
    name: 'Chronological Tour',
    description: 'Artist → albums in release order → songs — a guided journey through the full discography',
    emoji: '📅',
    durationMs: 60_000,
    arrangeMode: 'solar-system',
    enter(fg, nodes, adj): OrbitTourState {
      const artists = nodes.filter(n => n.type === 'artist');
      const albums  = nodes.filter(n => n.type === 'album');
      const songs   = nodes.filter(n => n.type === 'song');

      // Sort albums by release year
      const sortedAlbums = [...albums].sort((a, b) => {
        const ay = (a.data?.year as number | undefined) ?? 9999;
        const by = (b.data?.year as number | undefined) ?? 9999;
        return ay - by;
      });

      // Build candidate list: artists → albums (by year) → each album's songs (alphabetical)
      const candidates: CinemaNode[] = [...artists];
      const seenSongs = new Set<string>();
      for (const album of sortedAlbums) {
        candidates.push(album);
        const albumSongs = songs
          .filter(s => adj.get(album.id)?.has(s.id) || adj.get(s.id)?.has(album.id))
          .sort((a, b) => a.label.localeCompare(b.label));
        for (const s of albumSongs) {
          if (!seenSongs.has(s.id)) { candidates.push(s); seenSongs.add(s.id); }
        }
      }
      // Any songs not attached to albums
      for (const s of songs) {
        if (!seenSongs.has(s.id)) candidates.push(s);
      }

      setTimeout(() => fg?.zoomToFit?.(1800, 80), 1500);
      return {
        currentIdx: 0,
        candidates: candidates.length
          ? candidates
          : nodes.filter(n => ['artist', 'album', 'song'].includes(n.type)),
        orbitState: null,
        prevTargetX: 0, prevTargetY: 0, prevTargetZ: 0,
      };
    },
    tick(fg, _n, _a, elapsedMs, state, controls) {
      const s      = state as OrbitTourState;
      const camera = getCamera(fg);
      if (!camera) return;

      if (!s.orbitState) {
        const node = s.candidates[s.currentIdx % Math.max(1, s.candidates.length)];
        if (!node || node.x == null) return;
        // More dwell on artist/album, shorter on songs to keep the tour moving
        const baseDwell = node.type === 'artist' ? 10_000 : node.type === 'album' ? 7_000 : 3_500;
        const dwellMs   = Math.round(baseDwell / controls.speedMultiplier);
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
];

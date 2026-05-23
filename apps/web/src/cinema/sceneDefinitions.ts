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
    arrangeMode: 'radial',
    enter(fg) {
      setTimeout(() => fg?.zoomToFit?.(1200, 60), 1900);
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const angle = elapsedMs * 0.00005 * controls.orbitSpeed;
      const dist  = 720;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 220 - Math.sin(elapsedMs * 0.00009) * 70;
      camera.position.z = Math.cos(angle) * dist;
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
    arrangeMode: 'galaxy',
    enter(fg) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (camera) { camera.position.x = 0; camera.position.y = 120; camera.position.z = 1100; }
      if (ctrl)   { ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs, _s, controls) {
      const camera = getCamera(fg);
      const ctrl   = getCtrl(fg);
      if (!camera || !ctrl) return;
      const t     = Math.min(1, elapsedMs / 35_000);
      const angle = elapsedMs * 0.00003 * controls.orbitSpeed;
      const z     = 1100 - t * 800;
      camera.position.x = Math.sin(angle) * 90;
      camera.position.y = 120 - t * 70;
      camera.position.z = z;
      ctrl.target.x = 0; ctrl.target.y = 0; ctrl.target.z = 0;
      camera.lookAt(0, 0, 0);
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
];

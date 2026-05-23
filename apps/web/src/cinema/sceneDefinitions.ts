/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cinema Mode scene definitions.
 * Each scene specifies an arrangement, a camera enter choreography, and an optional
 * per-frame tick function for continuous camera motion.
 *
 * All camera moves use direct camera.position + controls.target manipulation (no TWEEN)
 * for orbit-style scenes, and fg.cameraPosition() for periodic fly-to scenes.
 *
 * TrackballControls is disabled during playback (see CinemaPage), so these functions
 * have full camera authority every frame.
 */

import type { CinemaNode, CinemaScene } from './types';

interface FlyState {
  lastFlyTime: number;
  currentIdx: number;
  candidates: CinemaNode[];
}

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
      // Fit after arrangement settles (1400ms arrangement + buffer)
      setTimeout(() => fg?.zoomToFit?.(1200, 60), 1900);
      return {};
    },
    tick(fg, _n, _a, elapsedMs) {
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      if (!camera || !controls) return;
      const angle = elapsedMs * 0.00007; // one full orbit in ~90 s
      const dist = 640;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 100 + Math.sin(elapsedMs * 0.00014) * 35;
      camera.position.z = Math.cos(angle) * dist;
      controls.target.x = 0; controls.target.y = 0; controls.target.z = 0;
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
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      if (camera) { camera.position.x = 0; camera.position.y = 900; camera.position.z = 400; }
      if (controls) { controls.target.x = 0; controls.target.y = 0; controls.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs) {
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      if (!camera || !controls) return;
      const t = Math.min(1, elapsedMs / 35_000);
      const y = 900 - t * 700;
      const angle = elapsedMs * 0.00005;
      const r = 400 - t * 100;
      camera.position.x = Math.sin(angle) * r;
      camera.position.y = y;
      camera.position.z = Math.cos(angle) * r;
      controls.target.x = 0; controls.target.y = 0; controls.target.z = 0;
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
      // Place camera at centre after the sphere arrangement settles
      setTimeout(() => {
        const camera = fg?.camera?.();
        const controls = fg?.controls?.();
        if (camera) { camera.position.x = 0; camera.position.y = 5; camera.position.z = 0; }
        if (controls) { controls.target.x = 0; controls.target.y = 160; controls.target.z = 0; }
      }, 1700);
      return {};
    },
    tick(fg, _n, _a, elapsedMs) {
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      if (!camera || !controls) return;
      // Tiny camera drift so it feels alive (not perfectly static)
      camera.position.x = Math.sin(elapsedMs * 0.00004) * 10;
      camera.position.y = 5 + Math.sin(elapsedMs * 0.00003) * 8;
      camera.position.z = Math.cos(elapsedMs * 0.00004) * 10;
      // Look-at point rotates around the sphere surface
      const a = elapsedMs * 0.00009;
      const R = 160;
      controls.target.x = Math.sin(a) * R;
      controls.target.y = Math.sin(elapsedMs * 0.00006) * R;
      controls.target.z = Math.cos(a) * R;
    },
  },

  // ── 4. Solar System Tour ────────────────────────────────────────────────────
  {
    id: 'solar-system-tour',
    name: 'Solar System Tour',
    description: 'A guided flyby — camera visits each artist star in the solar system layout',
    emoji: '🪐',
    durationMs: 45_000,
    arrangeMode: 'solar-system',
    enter(fg, nodes): FlyState {
      const artists = nodes.filter(n => n.type === 'artist');
      setTimeout(() => fg?.zoomToFit?.(1800, 60), 1900);
      return { lastFlyTime: -9000, currentIdx: 0, candidates: artists };
    },
    tick(fg, _n, _a, elapsedMs, state) {
      const s = state as FlyState;
      if (elapsedMs - s.lastFlyTime > 9000) {
        const node = s.candidates[s.currentIdx % Math.max(1, s.candidates.length)];
        if (node && node.x != null) {
          const nx = node.x, ny = node.y ?? 0, nz = node.z ?? 0;
          fg?.cameraPosition?.({ x: nx + 90, y: ny + 55, z: nz + 90 }, { x: nx, y: ny, z: nz }, 2500);
        }
        s.currentIdx++;
        s.lastFlyTime = elapsedMs;
      }
    },
  },

  // ── 5. Node Flythrough ──────────────────────────────────────────────────────
  {
    id: 'node-flythrough',
    name: 'Node Flythrough',
    description: 'A freeform journey hopping through connected songs and albums',
    emoji: '✨',
    durationMs: 35_000,
    arrangeMode: 'natural',
    enter(fg, nodes, adj): FlyState {
      const songs = nodes.filter(n => n.type === 'song');
      const start = songs[Math.floor(Math.random() * songs.length)];
      if (start && start.x != null) {
        fg?.cameraPosition?.(
          { x: start.x + 60, y: (start.y ?? 0) + 30, z: (start.z ?? 0) + 60 },
          { x: start.x, y: start.y ?? 0, z: start.z ?? 0 },
          1500,
        );
      }
      // candidates: neighbors reachable from start (for random walk)
      const neighborIds = [...(adj.get(start?.id ?? '') ?? [])];
      const candidates = nodes.filter(n => neighborIds.includes(n.id));
      return { lastFlyTime: 0, currentIdx: 0, candidates: candidates.length ? candidates : songs };
    },
    tick(fg, nodes, adj, elapsedMs, state) {
      const s = state as FlyState & { currentNodeId?: string };
      if (elapsedMs - s.lastFlyTime > 5500) {
        const pool = s.currentNodeId
          ? nodes.filter(n => adj.get(s.currentNodeId!)?.has(n.id))
          : s.candidates;
        const target = pool[Math.floor(Math.random() * pool.length)] ?? s.candidates[0];
        if (target && target.x != null) {
          fg?.cameraPosition?.(
            { x: target.x + 60, y: (target.y ?? 0) + 30, z: (target.z ?? 0) + 60 },
            { x: target.x, y: target.y ?? 0, z: target.z ?? 0 },
            1500,
          );
          (s as FlyState & { currentNodeId?: string }).currentNodeId = target.id;
        }
        s.lastFlyTime = elapsedMs;
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
    tick(fg, _n, _a, elapsedMs) {
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      if (!camera || !controls) return;
      // Slower orbit at higher altitude for a more contemplative feel
      const angle = elapsedMs * 0.00005;
      const dist = 720;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 220 - Math.sin(elapsedMs * 0.00009) * 70;
      camera.position.z = Math.cos(angle) * dist;
      controls.target.x = 0; controls.target.y = 0; controls.target.z = 0;
    },
  },

  // ── 7. Lyrical DNA ──────────────────────────────────────────────────────────
  {
    id: 'lyrical-dna',
    name: 'Lyrical DNA',
    description: 'The galaxy of connections — a slow zoom into the heart of the music',
    emoji: '🧬',
    durationMs: 35_000,
    arrangeMode: 'galaxy',
    enter(fg) {
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      // Start far back, angled slightly
      if (camera) { camera.position.x = 0; camera.position.y = 120; camera.position.z = 1100; }
      if (controls) { controls.target.x = 0; controls.target.y = 0; controls.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs) {
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      if (!camera || !controls) return;
      const t = Math.min(1, elapsedMs / 35_000);
      // Dolly in while slowly rotating
      const angle = elapsedMs * 0.00003;
      const z = 1100 - t * 800;
      camera.position.x = Math.sin(angle) * 90;
      camera.position.y = 120 - t * 70;
      camera.position.z = z;
      controls.target.x = 0; controls.target.y = 0; controls.target.z = 0;
    },
  },

  // ── 8. Cosmic Overview ──────────────────────────────────────────────────────
  {
    id: 'cosmic-overview',
    name: 'Cosmic Overview',
    description: 'A majestic bird\'s-eye view — the entire universe surveyed in one orbit',
    emoji: '🌍',
    durationMs: 30_000,
    arrangeMode: 'sphere',
    enter(fg) {
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      if (camera) { camera.position.x = 0; camera.position.y = 650; camera.position.z = 0; }
      if (controls) { controls.target.x = 0; controls.target.y = 0; controls.target.z = 0; }
      return {};
    },
    tick(fg, _n, _a, elapsedMs) {
      const camera = fg?.camera?.();
      const controls = fg?.controls?.();
      if (!camera || !controls) return;
      const angle = elapsedMs * 0.00008;
      const dist = 520;
      camera.position.x = Math.sin(angle) * dist;
      camera.position.y = 420 - Math.sin(elapsedMs * 0.00006) * 120;
      camera.position.z = Math.cos(angle) * dist;
      controls.target.x = 0; controls.target.y = 0; controls.target.z = 0;
    },
  },
];

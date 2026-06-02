/**
 * Camera Rail system for Cinema Mode.
 *
 * Each rail type produces a list of waypoints (camera positions + look-at targets).
 * CinemaPage feeds these into a THREE.CatmullRomCurve3 for smooth interpolation.
 *
 * Rail types are ordered from most practical to most cinematic.
 */

import type { CinemaNode } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RailType =
  | 'album-circuit'   // smooth tour of every album in release-year order
  | 'nonagon'         // 9-vertex looping polygon — one stop per major album
  | 'spiral-in'       // grand spiral descent from high orbit down to the core
  | 'perimeter'       // outer-boundary walk, always gazing inward
  | 'warp-jumps'      // launch from far, decelerate at each album — cinematic hyperjumps
  | 'slow-drift'      // ambient, unhurried drift through the full node cloud
  | 'corkscrew'       // helical rise up through the graph from below
  | 'pendulum';       // wide side-to-side sweep across the galaxy

export interface RailWaypoint {
  position: { x: number; y: number; z: number };
  lookAt:   { x: number; y: number; z: number };
  /** Short label shown in the HUD while the camera is near this waypoint. */
  label: string;
}

export interface RailDef {
  type: RailType;
  label: string;
  emoji: string;
  description: string;
  /** Whether the path loops back to the start automatically. */
  loop: boolean;
  /**
   * Default t-advancement per second (0→1 represents the full path).
   * Higher = faster.  1.0 = traverse entire path in 1 s (usually too fast).
   * Typical values: 0.025 (very slow) – 0.15 (brisk).
   */
  defaultSpeedPerSec: number;
}

export const RAIL_DEFS: RailDef[] = [
  {
    type: 'album-circuit',
    label: 'Album Circuit',
    emoji: '🎞',
    description: 'Smooth tour of every album in release order — the complete discography road trip.',
    loop: false,
    defaultSpeedPerSec: 0.07,
  },
  {
    type: 'nonagon',
    label: 'Nonagon',
    emoji: '⬡',
    description: 'Nine-point looping path around the outer ring of the graph — the infinite road.',
    loop: true,
    defaultSpeedPerSec: 0.055,
  },
  {
    type: 'spiral-in',
    label: 'Spiral In',
    emoji: '🌀',
    description: 'Grand two-and-a-half-turn spiral descent from high orbit down to the core.',
    loop: false,
    defaultSpeedPerSec: 0.045,
  },
  {
    type: 'perimeter',
    label: 'Perimeter Scout',
    emoji: '🔭',
    description: 'Walk the outer boundary of the galaxy, always looking inward at the structure.',
    loop: true,
    defaultSpeedPerSec: 0.055,
  },
  {
    type: 'warp-jumps',
    label: 'Warp Jumps',
    emoji: '⚡',
    description: 'Hyperjump to each album: launch from a long-range position, decelerate on arrival.',
    loop: false,
    defaultSpeedPerSec: 0.10,
  },
  {
    type: 'slow-drift',
    label: 'Slow Drift',
    emoji: '🌌',
    description: 'Gentle ambient drift through the entire node cloud — all types, unhurried.',
    loop: true,
    defaultSpeedPerSec: 0.022,
  },
  {
    type: 'corkscrew',
    label: 'Corkscrew',
    emoji: '🔩',
    description: 'Helical rise up through the galaxy — like a camera on a rising boom arm.',
    loop: false,
    defaultSpeedPerSec: 0.05,
  },
  {
    type: 'pendulum',
    label: 'Pendulum',
    emoji: '⏱',
    description: 'Star-polygon path through the outermost albums — the camera traces a star shape across the galaxy.',
    loop: true,
    defaultSpeedPerSec: 0.04,
  },
];

// ---------------------------------------------------------------------------
// Builder options
// ---------------------------------------------------------------------------

export interface RailBuildOpts {
  /** How far the camera stays from each target node (world units). Default 120. */
  approachDist?: number;
  /** Camera elevation above node Y (world units). Default 55. */
  elevation?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function graphCenter(nodes: CinemaNode[]): { cx: number; cy: number; cz: number } {
  if (nodes.length === 0) return { cx: 0, cy: 0, cz: 0 };
  return {
    cx: nodes.reduce((s, n) => s + (n.x ?? 0), 0) / nodes.length,
    cy: nodes.reduce((s, n) => s + (n.y ?? 0), 0) / nodes.length,
    cz: nodes.reduce((s, n) => s + (n.z ?? 0), 0) / nodes.length,
  };
}

function maxRadius(nodes: CinemaNode[], cx: number, cz: number): number {
  return Math.max(
    80,
    ...nodes.map(n => Math.sqrt(((n.x ?? 0) - cx) ** 2 + ((n.z ?? 0) - cz) ** 2)),
  );
}

/** Normalized horizontal direction from (cx, cz) toward (x, z). */
function dirFromCenter(x: number, z: number, cx: number, cz: number): { dx: number; dz: number } {
  const dx = x - cx, dz = z - cz;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return { dx: 0, dz: 1 };
  return { dx: dx / len, dz: dz / len };
}

/** Camera position for looking at a node from outside the graph. */
function outerCamPos(
  nx: number, ny: number, nz: number,
  cx: number, cz: number,
  dist: number, elev: number,
): { x: number; y: number; z: number } {
  const { dx, dz } = dirFromCenter(nx, nz, cx, cz);
  return { x: nx + dx * dist, y: ny + elev, z: nz + dz * dist };
}

/** Sort album nodes by release year, then label as tiebreak. */
function sortedAlbums(nodes: CinemaNode[]): CinemaNode[] {
  return nodes
    .filter(n => n.type === 'album')
    .sort((a, b) => {
      const ya = (a.data?.year as number | undefined) ?? 9999;
      const yb = (b.data?.year as number | undefined) ?? 9999;
      return ya !== yb ? ya - yb : a.label.localeCompare(b.label);
    });
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build the list of waypoints for the given rail type.
 * Returns an empty array when there are not enough placed nodes.
 */
export function buildRailWaypoints(
  type: RailType,
  nodes: CinemaNode[],
  opts: RailBuildOpts = {},
): RailWaypoint[] {
  const approachDist = opts.approachDist ?? 120;
  const elevation    = opts.elevation    ?? 55;

  const placed = nodes.filter(n => n.x != null && n.z != null);
  if (placed.length < 2) return [];

  const { cx, cy, cz } = graphCenter(placed);
  const maxR = maxRadius(placed, cx, cz);

  // ── Album Circuit ──────────────────────────────────────────────────────────
  if (type === 'album-circuit') {
    const albums = sortedAlbums(placed);
    if (albums.length === 0) return [];
    return albums.map(a => ({
      position: outerCamPos(a.x ?? 0, a.y ?? 0, a.z ?? 0, cx, cz, approachDist, elevation),
      lookAt:   { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 },
      label:    a.label,
    }));
  }

  // ── Nonagon ────────────────────────────────────────────────────────────────
  if (type === 'nonagon') {
    const albums = placed.filter(n => n.type === 'album');
    const r = maxR * 1.35;
    const sides = 9;
    return Array.from({ length: sides }, (_, i) => {
      const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const pz = cz + Math.sin(angle) * r;
      // Aim at the nearest album to this camera position
      const nearest = albums.reduce<CinemaNode | null>((best, a) => {
        const d  = Math.hypot((a.x ?? 0) - px, (a.z ?? 0) - pz);
        const bd = best ? Math.hypot((best.x ?? 0) - px, (best.z ?? 0) - pz) : Infinity;
        return d < bd ? a : best;
      }, null);
      const lookAt = nearest
        ? { x: nearest.x ?? 0, y: nearest.y ?? 0, z: nearest.z ?? 0 }
        : { x: cx, y: cy, z: cz };
      return {
        position: { x: px, y: cy + elevation + maxR * 0.35, z: pz },
        lookAt,
        label: nearest?.label ?? `Stop ${i + 1}`,
      };
    });
  }

  // ── Spiral In ─────────────────────────────────────────────────────────────
  if (type === 'spiral-in') {
    const turns = 2.5;
    const numPts = 60;
    return Array.from({ length: numPts }, (_, i) => {
      const t     = i / (numPts - 1);
      const angle = t * turns * Math.PI * 2;
      const r     = maxR * 1.9 * (1 - t * 0.88);
      const y     = cy + maxR * 1.3 * (1 - t) + elevation;
      return {
        position: { x: cx + Math.cos(angle) * r, y, z: cz + Math.sin(angle) * r },
        lookAt:   { x: cx, y: cy, z: cz },
        label:    t < 0.12 ? 'Approach' : t > 0.88 ? 'Core' : 'Descent',
      };
    });
  }

  // ── Perimeter Scout ────────────────────────────────────────────────────────
  if (type === 'perimeter') {
    const numSectors = 16;
    const eligible   = placed.filter(n =>
      n.type === 'album' || n.type === 'song' || n.type === 'artist',
    );
    const withAngle = eligible.map(n => {
      const dx = (n.x ?? 0) - cx, dz = (n.z ?? 0) - cz;
      return { n, angle: Math.atan2(dz, dx), r: Math.sqrt(dx * dx + dz * dz) };
    }).sort((a, b) => a.angle - b.angle);

    return Array.from({ length: numSectors }, (_, i) => {
      const angleMin = -Math.PI + (i / numSectors) * Math.PI * 2;
      const angleMax = -Math.PI + ((i + 1) / numSectors) * Math.PI * 2;
      const mid      = (angleMin + angleMax) / 2;
      const sector   = withAngle.filter(a => a.angle >= angleMin && a.angle < angleMax);
      if (sector.length === 0) {
        return {
          position: {
            x: cx + Math.cos(mid) * maxR * 1.4,
            y: cy + elevation,
            z: cz + Math.sin(mid) * maxR * 1.4,
          },
          lookAt: { x: cx, y: cy, z: cz },
          label:  'Outer reach',
        };
      }
      const outer = sector.sort((a, b) => b.r - a.r)[0]!;
      const r     = outer.r * 1.45;
      return {
        position: {
          x: cx + Math.cos(outer.angle) * r,
          y: cy + elevation,
          z: cz + Math.sin(outer.angle) * r,
        },
        lookAt: { x: cx, y: cy, z: cz },
        label:  outer.n.label,
      };
    });
  }

  // ── Warp Jumps ─────────────────────────────────────────────────────────────
  if (type === 'warp-jumps') {
    const albums = sortedAlbums(placed);
    if (albums.length === 0) return [];
    const result: RailWaypoint[] = [];
    albums.forEach((album) => {
      const nx = album.x ?? 0, ny = album.y ?? 0, nz = album.z ?? 0;
      const { dx, dz } = dirFromCenter(nx, nz, cx, cz);
      // Warp launch point: far out from center, high up
      result.push({
        position: { x: nx + dx * approachDist * 3.5, y: ny + elevation * 2.5, z: nz + dz * approachDist * 3.5 },
        lookAt:   { x: nx, y: ny, z: nz },
        label:    `→ ${album.label}`,
      });
      // Arrival: normal approach distance
      result.push({
        position: outerCamPos(nx, ny, nz, cx, cz, approachDist * 0.7, elevation * 0.5),
        lookAt:   { x: nx, y: ny, z: nz },
        label:    album.label,
      });
    });
    return result;
  }

  // ── Slow Drift ─────────────────────────────────────────────────────────────
  if (type === 'slow-drift') {
    const artists = placed.filter(n => n.type === 'artist');
    const albums2 = placed.filter(n => n.type === 'album');
    // Sample every 4th song so the path isn't enormous
    const songs   = placed.filter(n => n.type === 'song').filter((_, i) => i % 4 === 0);
    // Deterministic order: artists first, then albums, then sampled songs sorted by label
    const all = [
      ...artists.sort((a, b) => a.label.localeCompare(b.label)),
      ...sortedAlbums(albums2),
      ...songs.sort((a, b) => a.label.localeCompare(b.label)),
    ];
    return all.map(n => {
      const nx = n.x ?? 0, ny = n.y ?? 0, nz = n.z ?? 0;
      const { dx, dz } = dirFromCenter(nx, nz, cx, cz);
      // Small perpendicular offset for variety
      const perpX = -dz, perpZ = dx;
      // Seeded-like offset using label hash (deterministic, no Math.random)
      const seed = n.label.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const perpOff = ((seed % 40) - 20);
      return {
        position: {
          x: nx + dx * approachDist * 0.55 + perpX * perpOff,
          y: ny + elevation * 0.6,
          z: nz + dz * approachDist * 0.55 + perpZ * perpOff,
        },
        lookAt: { x: nx, y: ny, z: nz },
        label:  n.label,
      };
    });
  }

  // ── Corkscrew ──────────────────────────────────────────────────────────────
  if (type === 'corkscrew') {
    const numPts = 55;
    const turns  = 1.75;
    return Array.from({ length: numPts }, (_, i) => {
      const t     = i / (numPts - 1);
      const angle = t * turns * Math.PI * 2 + Math.PI;
      const r     = maxR * 1.1;
      const y     = cy - maxR * 0.4 + maxR * 1.8 * t; // rise from below
      // Find nearest album at this angle to aim at
      const albums = placed.filter(n => n.type === 'album');
      const px     = cx + Math.cos(angle) * r;
      const pz     = cz + Math.sin(angle) * r;
      const nearest = albums.reduce<CinemaNode | null>((best, a) => {
        const d  = Math.hypot((a.x ?? 0) - px, (a.z ?? 0) - pz);
        const bd = best ? Math.hypot((best.x ?? 0) - px, (best.z ?? 0) - pz) : Infinity;
        return d < bd ? a : best;
      }, null);
      const lookAt = nearest
        ? { x: nearest.x ?? 0, y: nearest.y ?? 0, z: nearest.z ?? 0 }
        : { x: cx, y: cy + y * 0.3, z: cz };
      return {
        position: { x: px, y, z: pz },
        lookAt,
        label: nearest?.label ?? (t < 0.15 ? 'Underworld' : t > 0.85 ? 'Apex' : 'Rise'),
      };
    });
  }

  // ── Pendulum ───────────────────────────────────────────────────────────────
  if (type === 'pendulum') {
    // Star-polygon pendulum: find the outermost albums, sort by angle, then
    // visit them in a skip-k star pattern so the camera traces a star shape
    // across the galaxy instead of a boring back-and-forth sweep.
    const albums = placed.filter(n => n.type === 'album');
    if (albums.length === 0) return [];

    const withDist = albums.map(a => {
      const dx = (a.x ?? 0) - cx, dz = (a.z ?? 0) - cz;
      return { a, dist: Math.sqrt(dx * dx + dz * dz), angle: Math.atan2(dz, dx) };
    }).sort((x, y) => y.dist - x.dist);

    // Take 5-9 outermost albums and sort them by angle for star construction
    const N     = Math.max(3, Math.min(9, withDist.length));
    const outer = withDist.slice(0, N).sort((x, y) => x.angle - y.angle);

    // Find a star skip k such that gcd(k, N) === 1 (visits every point exactly once)
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const starSkip = (n: number): number => {
      const ideal = Math.max(2, Math.round(n * 0.4));
      for (let k = ideal; k >= 2; k--) if (gcd(k, n) === 1) return k;
      for (let k = ideal + 1; k < n; k++) if (gcd(k, n) === 1) return k;
      return 2;
    };
    const skip = starSkip(N);

    // Build the visit-order indices
    const visitOrder: number[] = [];
    let idx = 0;
    for (let i = 0; i < N; i++) {
      visitOrder.push(idx);
      idx = (idx + skip) % N;
    }

    return visitOrder.map(i => {
      const entry = outer[i]!;
      const nx = entry.a.x ?? 0, ny = entry.a.y ?? 0, nz = entry.a.z ?? 0;
      return {
        position: outerCamPos(nx, ny, nz, cx, cz, approachDist, elevation),
        lookAt:   { x: nx, y: ny, z: nz },
        label:    entry.a.label,
      };
    });
  }

  return [];
}

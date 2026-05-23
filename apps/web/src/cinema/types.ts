/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ArrangeMode } from './graphArrange';

export type { ArrangeMode };

/** Node shape used inside the Cinema scene engine. */
export interface CinemaNode {
  id: string;
  label: string;
  type: string;
  x?: number; y?: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number; fy?: number; fz?: number;
  // Payload from graph API (e.g. axis scores on song nodes, bandId, etc.)
  data?: {
    scores?: Record<string, number>;
    [key: string]: unknown;
  };
}

export interface CinemaLink {
  source: string | CinemaNode;
  target: string | CinemaNode;
  type: string;
  weight: number;
}

/** Camera and playback controls exposed to every scene's tick() function. */
export interface CinemaControls {
  /** Orbit angular speed (and breathe frequency) multiplier. 1 = normal. */
  orbitSpeed: number;
  /** Radial distance from target node during orbit / breathe. */
  approachDist: number;
  /** Camera Y elevation above the target node. */
  elevationOffset: number;
  /** Global scene-timer speed multiplier (affects dwell timings). */
  speedMultiplier: number;
  /**
   * 'orbit' — camera circles the target continuously.
   * 'breathe' — camera stays near the target with gentle oscillation.
   */
  orbitMode: 'orbit' | 'breathe';
}

export const DEFAULT_CINEMA_CONTROLS: CinemaControls = {
  orbitSpeed: 1,
  approachDist: 120,
  elevationOffset: 55,
  speedMultiplier: 1,
  orbitMode: 'orbit',
};

/**
 * A named Cinema scene: defines the arrangement, camera choreography, and duration.
 *
 * enter() is called once when the scene starts — set up initial camera position and
 * return a state object that will be passed back to tick() every frame.
 *
 * tick() is called every rAF frame while the scene is active.
 */
export interface CinemaScene {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** How long this scene plays before auto-advancing (ms). */
  durationMs: number;
  arrangeMode: ArrangeMode;
  enter: (fg: any, nodes: CinemaNode[], adj: Map<string, Set<string>>) => unknown;
  tick?: (
    fg: any,
    nodes: CinemaNode[],
    adj: Map<string, Set<string>>,
    elapsedMs: number,
    state: unknown,
    controls: CinemaControls,
  ) => void;
}

/** One step in a user-authored tour. */
export interface TourStep {
  id: string;
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  /** How long to orbit/breathe after arriving (ms) — travel time is separate. */
  dwellMs: number;
}

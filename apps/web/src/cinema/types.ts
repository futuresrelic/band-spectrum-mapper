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
}

export interface CinemaLink {
  source: string | CinemaNode;
  target: string | CinemaNode;
  type: string;
  weight: number;
}

/**
 * A named Cinema scene: defines the arrangement, camera choreography, and duration.
 *
 * enter() is called once when the scene starts — set up initial camera position and
 * return a state object that will be passed back to tick() every frame.
 *
 * tick() is called every rAF frame while the scene is active. Modify camera.position /
 * controls.target here for continuous motion. May also call fg.cameraPosition() for
 * periodic fly-to animations.
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
  ) => void;
}

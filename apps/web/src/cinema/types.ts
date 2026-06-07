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
  /**
   * Vertical offset applied to the camera's lookAt point during orbit / breathe.
   * Positive = camera tilts down to look below the target; negative = tilts up.
   * Range: –200 to +200.
   */
  pitchBias: number;
}

export const DEFAULT_CINEMA_CONTROLS: CinemaControls = {
  orbitSpeed: 1,
  approachDist: 120,
  elevationOffset: 55,
  speedMultiplier: 1,
  orbitMode: 'orbit',
  pitchBias: 0,
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
  /** Travel duration from the previous node to this one (ms). Default 1800. */
  flyInMs?: number;
  /** Per-step camera overrides — undefined means use the global CinemaControls value. */
  orbitSpeed?: number;
  approachDist?: number;
  elevation?: number;
  orbitMode?: 'orbit' | 'breathe';
  /** When true, this node is added to the selection chain on arrival. */
  selectOnArrive?: boolean;
  /** When true, stare-at-lyrics mode is activated on arrival. */
  stareLyricsOnArrive?: boolean;
}

/** A saved, named node-based camera sequence. */
export interface NodeSequence {
  id: string;
  name: string;
  steps: TourStep[];
  savedAt: string;
  /** Admin-published sequences are visible to all logged-in users for playback. */
  isPublic?: boolean;
}

/** A camera keyframe for Director Mode. */
export interface CinemaKeyframe {
  id: string;
  /** Human-readable shot name (editable). */
  label: string;
  position: { x: number; y: number; z: number };
  /** Camera look-at target (TrackballControls.target). */
  target: { x: number; y: number; z: number };
  /** Time in ms to interpolate FROM the previous keyframe to this one. */
  durationMs: number;
  /** Node IDs that should be selected when this keyframe activates. Undefined = no change. */
  selectedChain?: string[];
}

// ---------------------------------------------------------------------------
// Final Cut timeline
// ---------------------------------------------------------------------------

export type FinalCutClipType = 'director' | 'sequence' | 'scene' | 'tour';

/**
 * A clip assembled into the Final Cut timeline from any Cinema mode.
 * Stores enough data to replay the clip autonomously.
 */
export interface FinalCutClip {
  id: string;
  /** Display name for the clip */
  label: string;
  type: FinalCutClipType;
  /** Total duration of this clip in ms */
  durationMs: number;
  /** Director keyframes (when type='director') */
  keyframes?: CinemaKeyframe[];
  /** Tour steps (when type='sequence' or 'tour') */
  steps?: TourStep[];
  /** Scene id (when type='scene') */
  sceneId?: string;
  /** Optional user notes */
  notes?: string;
  addedAt: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Orbit-approach camera helpers for Cinema Mode.
 *
 * Pattern: fly in from current position to the orbit start point (1800ms eased),
 * then continuously orbit the target node.  Starting angle is derived from the
 * current camera bearing so the approach always comes from the right direction.
 */

import { easeInOutQuad } from './graphArrange';
import type { CinemaControls } from './types';

const FLY_DURATION_MS = 1800;

export interface OrbitCameraState {
  targetX: number;
  targetY: number;
  targetZ: number;
  /** scene-elapsed-ms when fly-in started */
  flyStartTime: number;
  flyStartCamX: number;
  flyStartCamY: number;
  flyStartCamZ: number;
  /** bearing angle (radians) at fly-in start — orbit continues from here */
  flyStartOrbitAngle: number;
  /** scene-elapsed-ms when orbit phase started (-1 = not yet) */
  dwellStart: number;
  /** how long to orbit before returning 'done' (0 = infinite) */
  dwellMs: number;
}

/**
 * Build a new OrbitCameraState aimed at (targetX,targetY,targetZ).
 * Call this once per node visit.
 */
export function initOrbitState(
  targetX: number,
  targetY: number,
  targetZ: number,
  camX: number,
  camY: number,
  camZ: number,
  elapsedMs: number,
  dwellMs: number,
): OrbitCameraState {
  // Approach from the current camera bearing so there's no jarring jump
  const startAngle = Math.atan2(camX - targetX, camZ - targetZ);
  return {
    targetX, targetY, targetZ,
    flyStartTime: elapsedMs,
    flyStartCamX: camX,
    flyStartCamY: camY,
    flyStartCamZ: camZ,
    flyStartOrbitAngle: startAngle,
    dwellStart: -1,
    dwellMs,
  };
}

/**
 * Drive the camera each rAF frame for a fly-in → orbit sequence.
 *
 * Returns:
 *  'flying'   — lerping toward the orbit start position
 *  'orbiting' — continuously circling the target
 *  'done'     — dwellMs elapsed; caller should advance to the next target
 */
export function updateOrbitCamera(
  fg: any,
  state: OrbitCameraState,
  elapsedMs: number,
  controls: CinemaControls,
): 'flying' | 'orbiting' | 'done' {
  const camera = fg?.camera?.();
  const ctrl   = fg?.controls?.();
  if (!camera || !ctrl) return 'orbiting';

  const { targetX, targetY, targetZ, flyStartOrbitAngle } = state;
  const dist      = controls.approachDist;
  const elevation = controls.elevationOffset;

  const flyElapsed = elapsedMs - state.flyStartTime;
  const flyRaw     = Math.min(1, flyElapsed / FLY_DURATION_MS);
  const flyT       = easeInOutQuad(flyRaw);

  // Where the fly-in is heading
  const orbitStartX = targetX + Math.sin(flyStartOrbitAngle) * dist;
  const orbitStartY = targetY + elevation;
  const orbitStartZ = targetZ + Math.cos(flyStartOrbitAngle) * dist;

  // Always point at target
  ctrl.target.x = targetX;
  ctrl.target.y = targetY;
  ctrl.target.z = targetZ;

  if (flyRaw < 1) {
    camera.position.x = state.flyStartCamX + (orbitStartX - state.flyStartCamX) * flyT;
    camera.position.y = state.flyStartCamY + (orbitStartY - state.flyStartCamY) * flyT;
    camera.position.z = state.flyStartCamZ + (orbitStartZ - state.flyStartCamZ) * flyT;
    return 'flying';
  }

  // Orbit phase
  const orbitElapsed = flyElapsed - FLY_DURATION_MS;
  const angle = flyStartOrbitAngle + orbitElapsed * 0.001 * controls.orbitSpeed;
  camera.position.x = targetX + Math.sin(angle) * dist;
  camera.position.y = targetY + elevation + Math.sin(orbitElapsed * 0.0003) * 18;
  camera.position.z = targetZ + Math.cos(angle) * dist;

  if (state.dwellStart < 0) state.dwellStart = elapsedMs;
  if (state.dwellMs > 0 && elapsedMs - state.dwellStart >= state.dwellMs) return 'done';

  return 'orbiting';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Orbit-approach camera helpers for Cinema Mode.
 *
 * Pattern: fly in from current position to the orbit start point (1800ms eased),
 * then either orbit continuously or breathe gently in place.
 *
 * CRITICAL: camera.lookAt() is called every frame so the target stays centred.
 * (TrackballControls.enabled = false during playback, so Three.js does NOT
 * automatically make the camera face controls.target — we must do it manually.)
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
  /** scene-elapsed-ms when dwell phase started (-1 = not yet) */
  dwellStart: number;
  /** how long to orbit/breathe after arriving (ms); 0 = infinite */
  dwellMs: number;
}

/**
 * Build a new OrbitCameraState aimed at (targetX, targetY, targetZ).
 * Call this once per node visit; the orbit angle is derived from the
 * current camera bearing so the approach always comes from the right direction.
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
 * Drive the camera each rAF frame for a fly-in → orbit/breathe sequence.
 *
 * Returns:
 *  'flying'   — lerping toward the approach position (FLY_DURATION_MS)
 *  'orbiting' — in the dwell phase (orbit or breathe)
 *  'done'     — dwellMs elapsed; caller should advance to next target
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

  // Approach destination: orbit start (or breathe anchor) position
  const approachX = targetX + Math.sin(flyStartOrbitAngle) * dist;
  const approachY = targetY + elevation;
  const approachZ = targetZ + Math.cos(flyStartOrbitAngle) * dist;

  // TrackballControls pivot point — used when controls re-enable
  ctrl.target.x = targetX;
  ctrl.target.y = targetY;
  ctrl.target.z = targetZ;

  if (flyRaw < 1) {
    // ── Fly-in phase: lerp camera to approach position ──────────────────────
    camera.position.x = state.flyStartCamX + (approachX - state.flyStartCamX) * flyT;
    camera.position.y = state.flyStartCamY + (approachY - state.flyStartCamY) * flyT;
    camera.position.z = state.flyStartCamZ + (approachZ - state.flyStartCamZ) * flyT;
    // Face the target throughout the fly-in
    camera.lookAt(targetX, targetY, targetZ);
    return 'flying';
  }

  // ── Dwell phase: orbit or breathe ─────────────────────────────────────────
  const dwellElapsed = flyElapsed - FLY_DURATION_MS;
  const speed        = controls.orbitSpeed;

  if (controls.orbitMode === 'breathe') {
    // Gentle oscillation — camera stays near the approach position
    camera.position.x = approachX + Math.sin(dwellElapsed * 0.0008 * speed) * 10;
    camera.position.y = approachY + Math.sin(dwellElapsed * 0.0005 * speed) * 6;
    camera.position.z = approachZ + Math.cos(dwellElapsed * 0.0007 * speed) * 10;
  } else {
    // Circular orbit around the target
    const angle = flyStartOrbitAngle + dwellElapsed * 0.001 * speed;
    camera.position.x = targetX + Math.sin(angle) * dist;
    camera.position.y = targetY + elevation + Math.sin(dwellElapsed * 0.0003) * 18;
    camera.position.z = targetZ + Math.cos(angle) * dist;
  }

  // Always face the target — this is the critical fix that keeps the target centred
  camera.lookAt(targetX, targetY, targetZ);

  if (state.dwellStart < 0) state.dwellStart = elapsedMs;
  if (state.dwellMs > 0 && elapsedMs - state.dwellStart >= state.dwellMs) return 'done';

  return 'orbiting';
}

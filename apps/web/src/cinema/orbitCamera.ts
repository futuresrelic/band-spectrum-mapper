/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Orbit-approach camera helpers for Cinema Mode.
 *
 * Pattern: fly in from current position to the orbit start point (1800ms eased),
 * then either orbit continuously or breathe gently in place.
 *
 * KEY: during the fly-in, camera.lookAt() is lerped from the PREVIOUS look-at
 * target to the NEW target so there is no jarring rotation snap when advancing
 * between tour stops.  (Discovered: lookAt() must be called every frame since
 * TrackballControls.enabled = false suppresses automatic camera orientation.)
 */

import { easeInOutQuad } from './graphArrange';
import type { CinemaControls } from './types';

const FLY_DURATION_MS = 1800;

export interface OrbitCameraState {
  targetX: number;
  targetY: number;
  targetZ: number;
  flyStartTime: number;
  flyStartCamX: number;
  flyStartCamY: number;
  flyStartCamZ: number;
  /** Bearing angle (radians) at fly-in start. */
  flyStartOrbitAngle: number;
  /** Look-at start point for the fly-in rotation lerp (= previous orbit target). */
  prevLookAtX: number;
  prevLookAtY: number;
  prevLookAtZ: number;
  /** scene-elapsed-ms when dwell phase started (-1 = not yet) */
  dwellStart: number;
  /** How long to orbit/breathe after arriving (ms); 0 = infinite. */
  dwellMs: number;
}

/**
 * Build a new OrbitCameraState.
 * prevLookAt* should be the target of the PREVIOUS orbit step so look-at
 * transitions smoothly during the fly-in instead of snapping.
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
  prevLookAtX = 0,
  prevLookAtY = 0,
  prevLookAtZ = 0,
): OrbitCameraState {
  const startAngle = Math.atan2(camX - targetX, camZ - targetZ);
  return {
    targetX, targetY, targetZ,
    flyStartTime: elapsedMs,
    flyStartCamX: camX, flyStartCamY: camY, flyStartCamZ: camZ,
    flyStartOrbitAngle: startAngle,
    prevLookAtX, prevLookAtY, prevLookAtZ,
    dwellStart: -1,
    dwellMs,
  };
}

/**
 * Drive the camera each rAF frame for a fly-in → orbit/breathe sequence.
 *
 * Returns:
 *  'flying'   — lerping toward the approach position (FLY_DURATION_MS)
 *  'orbiting' — dwell phase active (orbit or breathe)
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

  // Where the fly-in aims for
  const approachX = targetX + Math.sin(flyStartOrbitAngle) * dist;
  const approachY = targetY + elevation;
  const approachZ = targetZ + Math.cos(flyStartOrbitAngle) * dist;

  // TrackballControls pivot (used when re-enabled after playback stops)
  ctrl.target.x = targetX;
  ctrl.target.y = targetY;
  ctrl.target.z = targetZ;

  if (flyRaw < 1) {
    // ── Fly-in: lerp camera position AND look-at direction ───────────────────
    camera.position.x = state.flyStartCamX + (approachX - state.flyStartCamX) * flyT;
    camera.position.y = state.flyStartCamY + (approachY - state.flyStartCamY) * flyT;
    camera.position.z = state.flyStartCamZ + (approachZ - state.flyStartCamZ) * flyT;
    // Smoothly rotate from previous look-at to new target — no snap
    const lx = state.prevLookAtX + (targetX - state.prevLookAtX) * flyT;
    const ly = state.prevLookAtY + (targetY - state.prevLookAtY) * flyT;
    const lz = state.prevLookAtZ + (targetZ - state.prevLookAtZ) * flyT;
    camera.lookAt(lx, ly, lz);
    return 'flying';
  }

  // ── Dwell phase ──────────────────────────────────────────────────────────────
  const dwellElapsed = flyElapsed - FLY_DURATION_MS;
  const speed        = controls.orbitSpeed;

  if (controls.orbitMode === 'breathe') {
    camera.position.x = approachX + Math.sin(dwellElapsed * 0.0008 * speed) * 10;
    camera.position.y = approachY + Math.sin(dwellElapsed * 0.0005 * speed) * 6;
    camera.position.z = approachZ + Math.cos(dwellElapsed * 0.0007 * speed) * 10;
  } else {
    const angle = flyStartOrbitAngle + dwellElapsed * 0.001 * speed;
    camera.position.x = targetX + Math.sin(angle) * dist;
    camera.position.y = targetY + elevation + Math.sin(dwellElapsed * 0.0003) * 18;
    camera.position.z = targetZ + Math.cos(angle) * dist;
  }

  // Always face the target once in dwell phase
  camera.lookAt(targetX, targetY, targetZ);

  if (state.dwellStart < 0) state.dwellStart = elapsedMs;
  if (state.dwellMs > 0 && elapsedMs - state.dwellStart >= state.dwellMs) return 'done';

  return 'orbiting';
}

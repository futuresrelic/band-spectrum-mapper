/**
 * Server-side Cinema persistence.
 *
 * Syncs Cinema data (presets, snapshots, director keyframes, scene keyframes,
 * node overrides) with the server so the admin user's settings are available
 * on any device.  All calls fail silently — localStorage is always the fallback.
 */

import { api } from '../lib/api';
import type { UserPreset } from './userPresets';
import type { ConfigSnapshot } from './configSnapshots';
import type { CinemaKeyframe } from './types';

export interface CinemaServerData {
  presets:          UserPreset[];
  snapshots:        ConfigSnapshot[];
  directorKeyframes: CinemaKeyframe[];
  sceneKeyframes:   Record<string, CinemaKeyframe[]>;
  nodeOverrides:    Record<string, { color?: string; sizeMultiplier?: number }>;
  updatedAt:        string;
}

export async function fetchCinemaServerData(): Promise<CinemaServerData | null> {
  try {
    return await api.get<CinemaServerData>('/api/cinema/data');
  } catch {
    return null;
  }
}

export async function savePresetsToServer(presets: UserPreset[]): Promise<void> {
  try {
    await api.put('/api/cinema/presets', { presets });
  } catch { /* silently ignore — localStorage is the fallback */ }
}

export async function saveSnapshotsToServer(snapshots: ConfigSnapshot[]): Promise<void> {
  try {
    await api.put('/api/cinema/snapshots', { snapshots });
  } catch { /* silently ignore */ }
}

export async function saveDirectorKeyframesToServer(keyframes: CinemaKeyframe[]): Promise<void> {
  try {
    await api.put('/api/cinema/director-keyframes', { keyframes });
  } catch { /* silently ignore */ }
}

export async function saveSceneKeyframesToServer(
  sceneKeyframes: Record<string, CinemaKeyframe[]>,
): Promise<void> {
  try {
    await api.put('/api/cinema/scene-keyframes', { sceneKeyframes });
  } catch { /* silently ignore */ }
}

export async function saveNodeOverridesToServer(
  nodeOverrides: Record<string, { color?: string; sizeMultiplier?: number }>,
): Promise<void> {
  try {
    await api.put('/api/cinema/node-overrides', { nodeOverrides });
  } catch { /* silently ignore */ }
}

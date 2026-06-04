/**
 * Cinema Mode — Config Snapshots
 *
 * A snapshot captures the full "how to view" state: theme, camera controls,
 * arrangement, hidden types, node opacity, loop toggle, and node limit.
 * It does NOT capture "what to view" (band selection, album type filters).
 *
 * Stored in localStorage, separate from User Visual Presets (which handle
 * colour overrides and sky sphere backgrounds).
 */

import type { CinemaControls } from './types';
import { DEFAULT_CINEMA_CONTROLS } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigSnapshot {
  id: string;
  name: string;
  themeId: string;
  controls: CinemaControls;
  arrangeMode: string;
  hiddenTypes: string[];
  nodeOpacity: number;
  loopScene: boolean;
  nodeLimit: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Factory + defaults
// ---------------------------------------------------------------------------

export function makeConfigSnapshot(
  name: string,
  partial: Omit<ConfigSnapshot, 'id' | 'name' | 'createdAt'>,
): ConfigSnapshot {
  return {
    id: `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

export const DEFAULT_SNAPSHOT_VALUES: Omit<ConfigSnapshot, 'id' | 'name' | 'createdAt'> = {
  themeId:     'default',
  controls:    { ...DEFAULT_CINEMA_CONTROLS },
  arrangeMode: 'radial',
  hiddenTypes: ['genre', 'emotion', 'theme'],
  nodeOpacity: 0.92,
  loopScene:   false,
  nodeLimit:   600,
};

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'cinema-config-snapshots-v1';

export function loadConfigSnapshots(): ConfigSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConfigSnapshot[];
    // Backfill missing fields from older saves
    return parsed.map(s => ({
      ...DEFAULT_SNAPSHOT_VALUES,
      ...s,
      controls: { ...DEFAULT_CINEMA_CONTROLS, ...s.controls },
    }));
  } catch {
    return [];
  }
}

export function saveConfigSnapshots(snapshots: ConfigSnapshot[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // localStorage full — silently ignore
  }
}

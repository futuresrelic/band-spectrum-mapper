/**
 * Headliner — player display settings (Phase Z.17.17)
 *
 * Local, per-player presentation preferences — persisted in
 * localStorage, never sent to the server and never treated as canonical
 * game state (unlike CrowdVisualConfig, which is the admin-owned,
 * server-stored default every player starts from). A player can only
 * ever override how their OWN client renders an already-determined,
 * server-authoritative show; nothing here can change a score or a
 * candidate hand.
 */
import { useEffect, useState } from 'react';
import type { CrowdRenderMode } from '../../api/crowdVisualConfig';

export type PulseIntensitySetting = 'off' | 'low' | 'normal' | 'high';
export type CrowdMemorySetting = 'off' | 'subtle' | 'normal';
export type AnimationQuality = 'low' | 'medium' | 'high';

export interface HeadlinerDisplaySettings {
  /** 'auto' defers to the admin-configured CrowdVisualConfig.crowdRenderMode. */
  crowdMode: CrowdRenderMode | 'auto';
  animationQuality: AnimationQuality;
  pulseIntensity: PulseIntensitySetting;
  crowdMemory: CrowdMemorySetting;
  cameraMotion: boolean;
  viewportEnabled: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: HeadlinerDisplaySettings = {
  crowdMode: 'auto',
  animationQuality: 'medium',
  pulseIntensity: 'normal',
  crowdMemory: 'normal',
  cameraMotion: true,
  viewportEnabled: true,
};

const STORAGE_KEY = 'headliner-display-settings-v1';

/** Pure merge: layers a possibly-partial, possibly-invalid stored value over the defaults. Never throws. */
export function mergeDisplaySettings(stored: unknown): HeadlinerDisplaySettings {
  if (stored === null || typeof stored !== 'object') return DEFAULT_DISPLAY_SETTINGS;
  const s = stored as Partial<Record<keyof HeadlinerDisplaySettings, unknown>>;
  const merged = { ...DEFAULT_DISPLAY_SETTINGS };
  if (['dots', 'silhouettes', 'pixel', 'minimal', 'auto'].includes(s.crowdMode as string)) merged.crowdMode = s.crowdMode as HeadlinerDisplaySettings['crowdMode'];
  if (['low', 'medium', 'high'].includes(s.animationQuality as string)) merged.animationQuality = s.animationQuality as AnimationQuality;
  if (['off', 'low', 'normal', 'high'].includes(s.pulseIntensity as string)) merged.pulseIntensity = s.pulseIntensity as PulseIntensitySetting;
  if (['off', 'subtle', 'normal'].includes(s.crowdMemory as string)) merged.crowdMemory = s.crowdMemory as CrowdMemorySetting;
  if (typeof s.cameraMotion === 'boolean') merged.cameraMotion = s.cameraMotion;
  if (typeof s.viewportEnabled === 'boolean') merged.viewportEnabled = s.viewportEnabled;
  return merged;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function loadDisplaySettings(): HeadlinerDisplaySettings {
  if (typeof window === 'undefined') return DEFAULT_DISPLAY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    return mergeDisplaySettings(JSON.parse(raw));
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

function saveDisplaySettings(settings: HeadlinerDisplaySettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private mode, quota) — non-critical, settings just won't persist.
  }
}

/** React hook: loads once, persists on every change. */
export function useHeadlinerDisplaySettings(): [HeadlinerDisplaySettings, (patch: Partial<HeadlinerDisplaySettings>) => void] {
  const [settings, setSettings] = useState<HeadlinerDisplaySettings>(() => loadDisplaySettings());

  useEffect(() => {
    saveDisplaySettings(settings);
  }, [settings]);

  function update(patch: Partial<HeadlinerDisplaySettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  return [settings, update];
}

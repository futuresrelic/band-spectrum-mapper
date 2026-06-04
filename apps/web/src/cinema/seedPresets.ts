/**
 * Seed presets — injected into the user's local storage the first time Cinema Mode
 * is opened. These are ordinary UserPresets so they can be edited, duplicated,
 * exported, or deleted just like any custom preset.
 *
 * Seeding is one-shot: once the SEEDS_KEY flag is written we never overwrite again,
 * so user edits/deletions are permanent.
 */

import type { UserPreset } from './userPresets';
import { DEFAULT_SKY } from './userPresets';

const SEEDS_KEY = 'cinema-seeds-initialized-v1';
const STORAGE_KEY = 'cinema-user-presets-v1';

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const TOOL_PRESET: UserPreset = {
  id: 'preset-seed-tool',
  name: 'Tool',
  baseThemeId: 'jungle',
  nodeColorOverrides: {
    artist:  '#d4a017',  // old gold — the eye / sacred geometry
    album:   '#2d6a4f',  // deep forest green
    song:    '#74c69d',  // emerald mint
    tag:     '#6d4c41',  // earth brown
    keyword: '#37474f',  // dark blue-slate
    emotion: '#e07a5f',  // burnt terracotta
  },
  linkColorOverride: 'rgba(116,198,157,0.18)',
  background: { ...DEFAULT_SKY },
  artistProfiles: { enabled: false, profiles: {} },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const APC_PRESET: UserPreset = {
  id: 'preset-seed-apc',
  name: 'A Perfect Circle',
  baseThemeId: 'obsidian',
  nodeColorOverrides: {
    artist:  '#c9184a',  // deep crimson
    album:   '#800016',  // dark blood red
    song:    '#ff4d6d',  // hot crimson
    tag:     '#6c2070',  // dark maroon-purple
    keyword: '#1a0a0a',  // near-black with red tint
    emotion: '#9b2226',  // blood red
  },
  linkColorOverride: 'rgba(180,0,30,0.22)',
  background: { ...DEFAULT_SKY },
  artistProfiles: { enabled: false, profiles: {} },
  createdAt: '2026-01-01T00:00:01.000Z',
};

const PUSCIFER_PRESET: UserPreset = {
  id: 'preset-seed-puscifer',
  name: 'Puscifer',
  baseThemeId: 'aurora',
  nodeColorOverrides: {
    artist:  '#00b4d8',  // electric teal / alien cyan
    album:   '#9d4edd',  // deep violet
    song:    '#4cc9f0',  // sky blue
    tag:     '#f72585',  // hot magenta
    keyword: '#3a0ca3',  // deep indigo
    emotion: '#f4a261',  // sandy desert orange
  },
  linkColorOverride: 'rgba(0,180,216,0.16)',
  background: { ...DEFAULT_SKY },
  artistProfiles: { enabled: false, profiles: {} },
  createdAt: '2026-01-01T00:00:02.000Z',
};

export const SEED_PRESETS: UserPreset[] = [
  TOOL_PRESET,
  APC_PRESET,
  PUSCIFER_PRESET,
];

// ---------------------------------------------------------------------------
// One-shot seed injection
// ---------------------------------------------------------------------------

/**
 * Call once before loadUserPresets().  Writes the seed presets into localStorage
 * the very first time, then never touches them again.  User edits/deletions persist.
 */
export function ensureSeedPresets(): void {
  try {
    if (localStorage.getItem(SEEDS_KEY)) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: UserPreset[] = raw ? (JSON.parse(raw) as UserPreset[]) : [];
    // Prepend seeds so they appear at the top of the list
    const merged = [...SEED_PRESETS, ...existing];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    localStorage.setItem(SEEDS_KEY, '1');
  } catch {
    // localStorage unavailable — skip silently
  }
}

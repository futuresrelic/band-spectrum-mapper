import { api } from '../lib/api';

export type AnimationIntensity = 'off' | 'subtle' | 'normal' | 'lively';
export type CrowdRenderMode = 'dots' | 'silhouettes' | 'pixel' | 'minimal';
export type PerformerSlot = 'vocalist' | 'guitarist' | 'bassist' | 'drummer' | 'keyboardist';
export type VenuePreset = 'club' | 'arena' | 'festival' | 'historic';

export interface PerformerSprites {
  vocalist: string | null;
  guitarist: string | null;
  bassist: string | null;
  drummer: string | null;
  keyboardist: string | null;
}

export interface CrowdVisualConfig {
  viewportBackgroundUrl: string | null;
  standingSpriteUrl: string | null;
  activeSpriteUrl: string | null;
  lowEnergySpriteUrl: string | null;
  walkoutSpriteUrl: string | null;
  stageForegroundUrl: string | null;
  animationIntensity: AnimationIntensity;
  spectatorDensity: number;
  spectatorSize: number;
  viewportOpacity: number;
  showFactionClusters: boolean;
  animationsEnabled: boolean;

  crowdRenderMode: CrowdRenderMode;
  performerSprites: PerformerSprites;
  stageBackdropUrl: string | null;
  activePerformerSlots: PerformerSlot[];
  venuePreset: VenuePreset;
  lightingEnabled: boolean;
  fogEnabled: boolean;
  particlesEnabled: boolean;
  cameraMotionEnabled: boolean;
  pulsePaletteStart: string;
  pulsePaletteEnd: string;
  crowdMemoryEnabled: boolean;
  crowdMemoryDecayMs: number;
  idleMotionIntensity: number;
  reactionMotionIntensity: number;
}

export const DEFAULT_CROWD_VISUAL_CONFIG: CrowdVisualConfig = {
  viewportBackgroundUrl: null,
  standingSpriteUrl: null,
  activeSpriteUrl: null,
  lowEnergySpriteUrl: null,
  walkoutSpriteUrl: null,
  stageForegroundUrl: null,
  animationIntensity: 'normal',
  spectatorDensity: 60,
  spectatorSize: 10,
  viewportOpacity: 1,
  showFactionClusters: true,
  animationsEnabled: true,

  crowdRenderMode: 'dots',
  performerSprites: { vocalist: null, guitarist: null, bassist: null, drummer: null, keyboardist: null },
  stageBackdropUrl: null,
  activePerformerSlots: ['vocalist', 'guitarist', 'bassist', 'drummer'],
  venuePreset: 'club',
  lightingEnabled: true,
  fogEnabled: false,
  particlesEnabled: false,
  cameraMotionEnabled: true,
  pulsePaletteStart: '#38bdf8',
  pulsePaletteEnd: '#a78bfa',
  crowdMemoryEnabled: true,
  crowdMemoryDecayMs: 9000,
  idleMotionIntensity: 0.5,
  reactionMotionIntensity: 0.7,
};

export const crowdVisualConfigApi = {
  get: () => api.get<CrowdVisualConfig>('/api/settings/headliner-crowd-visual-config'),
  set: (config: CrowdVisualConfig) => api.put<CrowdVisualConfig>('/api/settings/headliner-crowd-visual-config', config),
};

import { api } from '../lib/api';

export type AnimationIntensity = 'off' | 'subtle' | 'normal' | 'lively';

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
};

export const crowdVisualConfigApi = {
  get: () => api.get<CrowdVisualConfig>('/api/settings/headliner-crowd-visual-config'),
  set: (config: CrowdVisualConfig) => api.put<CrowdVisualConfig>('/api/settings/headliner-crowd-visual-config', config),
};

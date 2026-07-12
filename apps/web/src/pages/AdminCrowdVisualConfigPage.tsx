import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  crowdVisualConfigApi, DEFAULT_CROWD_VISUAL_CONFIG, type CrowdVisualConfig, type AnimationIntensity,
} from '../api/crowdVisualConfig';

const ASSET_FIELDS: { key: keyof CrowdVisualConfig; label: string; hint: string }[] = [
  { key: 'viewportBackgroundUrl', label: 'Viewport background', hint: 'Falls back to a plain dark panel when empty.' },
  { key: 'standingSpriteUrl', label: 'Standing spectator sprite', hint: 'A faction member with a flat reaction. Falls back to a plain dot.' },
  { key: 'activeSpriteUrl', label: 'Active/reacting spectator sprite', hint: 'A faction member reacting positively. Falls back to a colored dot.' },
  { key: 'lowEnergySpriteUrl', label: 'Low-energy spectator sprite', hint: 'A faction member reacting negatively. Falls back to a faded dot.' },
  { key: 'walkoutSpriteUrl', label: 'Walkout / empty-position sprite', hint: 'Shown for a faction at walkout risk. Falls back to an empty slot — never a fabricated headcount.' },
  { key: 'stageForegroundUrl', label: 'Stage foreground (optional)', hint: 'Rendered under the crowd, above the background.' },
];

const INTENSITY_OPTIONS: AnimationIntensity[] = ['off', 'subtle', 'normal', 'lively'];

export default function AdminCrowdVisualConfigPage() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['headliner-crowd-visual-config'],
    queryFn: () => crowdVisualConfigApi.get(),
  });

  const [local, setLocal] = useState<CrowdVisualConfig | null>(null);
  const config = local ?? data ?? DEFAULT_CROWD_VISUAL_CONFIG;
  const isDirty = local !== null;

  const saveMutation = useMutation({
    mutationFn: (next: CrowdVisualConfig) => crowdVisualConfigApi.set(next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['headliner-crowd-visual-config'] });
      setSaved(true);
      setLocal(null);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function update<K extends keyof CrowdVisualConfig>(key: K, value: CrowdVisualConfig[K]) {
    setLocal({ ...config, [key]: value });
    setSaved(false);
  }

  function resetToDefaults() {
    setLocal(DEFAULT_CROWD_VISUAL_CONFIG);
    setSaved(false);
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-surface-900 mb-1">Headliner — Crowd Visual Config</h1>
      <p className="text-sm text-surface-500 mb-6">
        Configures the Concert Viewport's audience (Creative Bible §14). Every field is optional —
        with nothing set, the viewport renders with plain CSS dots and a dark background, no images required.
      </p>

      {isLoading ? (
        <p className="text-sm text-surface-400">Loading…</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-surface-800">Assets</h2>
            {ASSET_FIELDS.map((f) => (
              <div key={f.key} className="rounded-lg border border-surface-200 bg-white px-4 py-3">
                <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor={f.key}>{f.label}</label>
                <input
                  id={f.key}
                  type="text"
                  placeholder="https://… or leave blank"
                  value={(config[f.key] as string | null) ?? ''}
                  onChange={(e) => update(f.key, (e.target.value.trim() === '' ? null : e.target.value) as CrowdVisualConfig[typeof f.key])}
                  className="w-full text-sm border border-surface-300 rounded-md px-3 py-1.5 font-mono"
                />
                <p className="text-xs text-surface-400 mt-1">{f.hint}</p>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-surface-800">Behavior</h2>

            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="animationIntensity">Animation intensity</label>
              <select
                id="animationIntensity"
                value={config.animationIntensity}
                onChange={(e) => update('animationIntensity', e.target.value as AnimationIntensity)}
                className="text-sm border border-surface-300 rounded-md px-3 py-1.5"
              >
                {INTENSITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-surface-800">Animations enabled</p>
                <p className="text-xs text-surface-400">Independent of animationIntensity — a master on/off switch.</p>
              </div>
              <input
                type="checkbox"
                checked={config.animationsEnabled}
                onChange={(e) => update('animationsEnabled', e.target.checked)}
                className="h-5 w-5"
              />
            </div>

            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-surface-800">Show faction clusters</p>
                <p className="text-xs text-surface-400">When off, spectators split evenly instead of by each faction's real share of the crowd.</p>
              </div>
              <input
                type="checkbox"
                checked={config.showFactionClusters}
                onChange={(e) => update('showFactionClusters', e.target.checked)}
                className="h-5 w-5"
              />
            </div>

            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="spectatorDensity">
                Spectator density ({config.spectatorDensity})
              </label>
              <input
                id="spectatorDensity" type="range" min={5} max={300} step={5}
                value={config.spectatorDensity}
                onChange={(e) => update('spectatorDensity', Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="spectatorSize">
                Spectator size ({config.spectatorSize}px)
              </label>
              <input
                id="spectatorSize" type="range" min={4} max={40} step={1}
                value={config.spectatorSize}
                onChange={(e) => update('spectatorSize', Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="viewportOpacity">
                Viewport opacity ({config.viewportOpacity.toFixed(2)})
              </label>
              <input
                id="viewportOpacity" type="range" min={0.1} max={1} step={0.05}
                value={config.viewportOpacity}
                onChange={(e) => update('viewportOpacity', Number(e.target.value))}
                className="w-full"
              />
            </div>
          </section>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={() => saveMutation.mutate(config)}
          disabled={!isDirty || saveMutation.isPending}
          className="bg-surface-900 hover:bg-surface-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          onClick={resetToDefaults}
          className="text-sm text-surface-500 hover:text-surface-800"
        >
          Reset to defaults
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
        {saveMutation.isError && <span className="text-sm text-red-600">Failed to save</span>}
        {isDirty && !saved && <span className="text-sm text-amber-600">Unsaved changes</span>}
      </div>
    </div>
  );
}

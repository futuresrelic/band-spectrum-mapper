import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  crowdVisualConfigApi, DEFAULT_CROWD_VISUAL_CONFIG, type CrowdVisualConfig, type AnimationIntensity,
  type CrowdRenderMode, type PerformerSlot, type VenuePreset,
} from '../api/crowdVisualConfig';

const ASSET_FIELDS: { key: keyof CrowdVisualConfig; label: string; hint: string }[] = [
  { key: 'viewportBackgroundUrl', label: 'Viewport background', hint: 'Falls back to a plain dark panel when empty.' },
  { key: 'standingSpriteUrl', label: 'Standing spectator sprite', hint: 'A faction member with a flat reaction. Falls back to a plain dot.' },
  { key: 'activeSpriteUrl', label: 'Active/reacting spectator sprite', hint: 'A faction member reacting positively. Falls back to a colored dot.' },
  { key: 'lowEnergySpriteUrl', label: 'Low-energy spectator sprite', hint: 'A faction member reacting negatively. Falls back to a faded dot.' },
  { key: 'walkoutSpriteUrl', label: 'Walkout / empty-position sprite', hint: 'Shown for a faction at walkout risk. Falls back to an empty slot — never a fabricated headcount.' },
  { key: 'stageForegroundUrl', label: 'Stage foreground (optional)', hint: 'Rendered under the crowd, above the background.' },
  { key: 'stageBackdropUrl', label: 'Stage backdrop (optional)', hint: 'Rendered behind the performers. Falls back to a plain dark gradient.' },
];

const PERFORMER_SLOTS: { key: PerformerSlot; label: string }[] = [
  { key: 'vocalist', label: 'Vocalist' },
  { key: 'guitarist', label: 'Guitarist' },
  { key: 'bassist', label: 'Bassist' },
  { key: 'drummer', label: 'Drummer' },
  { key: 'keyboardist', label: 'Keyboardist' },
];

const INTENSITY_OPTIONS: AnimationIntensity[] = ['off', 'subtle', 'normal', 'lively'];
const CROWD_MODE_OPTIONS: CrowdRenderMode[] = ['dots', 'silhouettes', 'pixel', 'minimal'];
const VENUE_PRESET_OPTIONS: VenuePreset[] = ['club', 'arena', 'festival', 'historic'];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-surface-800">{label}</p>
        {children}
      </div>
      {hint && <p className="text-xs text-surface-400 mt-1">{hint}</p>}
    </div>
  );
}

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

  function updatePerformerSprite(slot: PerformerSlot, value: string) {
    update('performerSprites', { ...config.performerSprites, [slot]: value.trim() === '' ? null : value });
  }

  function toggleActiveSlot(slot: PerformerSlot, active: boolean) {
    const next = active
      ? [...config.activePerformerSlots, slot]
      : config.activePerformerSlots.filter((s) => s !== slot);
    if (next.length === 0) return; // at least one performer must remain — mirrors the backend's min(1) validation
    update('activePerformerSlots', next);
  }

  function resetToDefaults() {
    setLocal(DEFAULT_CROWD_VISUAL_CONFIG);
    setSaved(false);
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-surface-900 mb-1">Headliner — Concert Viewport Visuals</h1>
      <p className="text-sm text-surface-500 mb-6">
        Configures the live Concert Viewport: stage, performers, crowd, lighting, camera, Concert Pulse, and
        Crowd Memory. This is presentation only — it never affects scoring, candidate generation, or Daily
        Challenge verification. Every field is optional — with nothing set, the viewport renders entirely with
        plain CSS shapes and generated colors, no images required.
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
            <h2 className="text-sm font-semibold text-surface-800">Stage & Performers</h2>
            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-surface-800 mb-2">Performers on stage</p>
              <div className="grid grid-cols-2 gap-2">
                {PERFORMER_SLOTS.map((s) => (
                  <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={config.activePerformerSlots.includes(s.key)}
                      onChange={(e) => toggleActiveSlot(s.key, e.target.checked)}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-surface-400 mt-2">At least one performer must remain on stage.</p>
            </div>
            {PERFORMER_SLOTS.map((s) => (
              <div key={s.key} className="rounded-lg border border-surface-200 bg-white px-4 py-3">
                <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor={`sprite-${s.key}`}>{s.label} sprite</label>
                <input
                  id={`sprite-${s.key}`}
                  type="text"
                  placeholder="https://… or leave blank for a generic silhouette"
                  value={config.performerSprites[s.key] ?? ''}
                  onChange={(e) => updatePerformerSprite(s.key, e.target.value)}
                  className="w-full text-sm border border-surface-300 rounded-md px-3 py-1.5 font-mono"
                />
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-surface-800">Crowd</h2>
            <Field label="Crowd rendering mode">
              <select value={config.crowdRenderMode} onChange={(e) => update('crowdRenderMode', e.target.value as CrowdRenderMode)} className="text-sm border border-surface-300 rounded-md px-3 py-1.5">
                {CROWD_MODE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Animation intensity">
              <select value={config.animationIntensity} onChange={(e) => update('animationIntensity', e.target.value as AnimationIntensity)} className="text-sm border border-surface-300 rounded-md px-3 py-1.5">
                {INTENSITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </Field>
            <Field label="Animations enabled" hint="Independent of animation intensity — a master on/off switch.">
              <input type="checkbox" checked={config.animationsEnabled} onChange={(e) => update('animationsEnabled', e.target.checked)} className="h-5 w-5" />
            </Field>
            <Field label="Show faction clusters" hint="When off, spectators split evenly instead of by each faction's real share of the crowd.">
              <input type="checkbox" checked={config.showFactionClusters} onChange={(e) => update('showFactionClusters', e.target.checked)} className="h-5 w-5" />
            </Field>
            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="spectatorDensity">Spectator density ({config.spectatorDensity})</label>
              <input id="spectatorDensity" type="range" min={5} max={300} step={5} value={config.spectatorDensity} onChange={(e) => update('spectatorDensity', Number(e.target.value))} className="w-full" />
              <p className="text-xs text-surface-400 mt-1">Small venue ≈30–80, medium ≈80–180, large ≈180–300 (hard cap).</p>
            </div>
            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="spectatorSize">Spectator size ({config.spectatorSize}px)</label>
              <input id="spectatorSize" type="range" min={4} max={40} step={1} value={config.spectatorSize} onChange={(e) => update('spectatorSize', Number(e.target.value))} className="w-full" />
            </div>
            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="viewportOpacity">Viewport opacity ({config.viewportOpacity.toFixed(2)})</label>
              <input id="viewportOpacity" type="range" min={0.1} max={1} step={0.05} value={config.viewportOpacity} onChange={(e) => update('viewportOpacity', Number(e.target.value))} className="w-full" />
            </div>
            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="idleMotion">Idle motion intensity ({config.idleMotionIntensity.toFixed(2)})</label>
              <input id="idleMotion" type="range" min={0} max={1} step={0.05} value={config.idleMotionIntensity} onChange={(e) => update('idleMotionIntensity', Number(e.target.value))} className="w-full" />
            </div>
            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="reactionMotion">Reaction motion intensity ({config.reactionMotionIntensity.toFixed(2)})</label>
              <input id="reactionMotion" type="range" min={0} max={1} step={0.05} value={config.reactionMotionIntensity} onChange={(e) => update('reactionMotionIntensity', Number(e.target.value))} className="w-full" />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-surface-800">Venue & Lighting</h2>
            <Field label="Venue preset" hint="Presentation only — backdrop/depth/density. Never a gameplay difference.">
              <select value={config.venuePreset} onChange={(e) => update('venuePreset', e.target.value as VenuePreset)} className="text-sm border border-surface-300 rounded-md px-3 py-1.5">
                {VENUE_PRESET_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Lighting enabled" hint="Reflects the current song's real 6-axis Song Spectrum.">
              <input type="checkbox" checked={config.lightingEnabled} onChange={(e) => update('lightingEnabled', e.target.checked)} className="h-5 w-5" />
            </Field>
            <Field label="Fog overlay">
              <input type="checkbox" checked={config.fogEnabled} onChange={(e) => update('fogEnabled', e.target.checked)} className="h-5 w-5" />
            </Field>
            <Field label="Particle overlay" hint="Reserved for a future visual pass — currently has no renderer.">
              <input type="checkbox" checked={config.particlesEnabled} onChange={(e) => update('particlesEnabled', e.target.checked)} className="h-5 w-5" />
            </Field>
            <Field label="Camera motion" hint="Subtle pan/zoom. Players can also disable this individually.">
              <input type="checkbox" checked={config.cameraMotionEnabled} onChange={(e) => update('cameraMotionEnabled', e.target.checked)} className="h-5 w-5" />
            </Field>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-surface-800">Concert Pulse & Crowd Memory</h2>
            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1">Pulse palette</label>
              <div className="flex items-center gap-3">
                <input type="color" value={config.pulsePaletteStart} onChange={(e) => update('pulsePaletteStart', e.target.value)} className="h-8 w-14" />
                <span className="text-xs text-surface-400">to</span>
                <input type="color" value={config.pulsePaletteEnd} onChange={(e) => update('pulsePaletteEnd', e.target.value)} className="h-8 w-14" />
              </div>
            </div>
            <Field label="Crowd Memory enabled" hint="A slowly decaying visual-only history of recent audience reaction.">
              <input type="checkbox" checked={config.crowdMemoryEnabled} onChange={(e) => update('crowdMemoryEnabled', e.target.checked)} className="h-5 w-5" />
            </Field>
            <div className="rounded-lg border border-surface-200 bg-white px-4 py-3">
              <label className="block text-sm font-medium text-surface-800 mb-1" htmlFor="memoryDecay">
                Crowd Memory decay half-life ({(config.crowdMemoryDecayMs / 1000).toFixed(1)}s)
              </label>
              <input id="memoryDecay" type="range" min={1000} max={60000} step={500} value={config.crowdMemoryDecayMs} onChange={(e) => update('crowdMemoryDecayMs', Number(e.target.value))} className="w-full" />
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

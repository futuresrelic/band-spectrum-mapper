/**
 * Headliner — player display settings panel (Phase Z.17.17)
 *
 * Compact, collapsible controls for the viewport's local display
 * preferences. Every control is a native <select>/<input type=checkbox>
 * — keyboard-accessible and touch-friendly with no custom widget code.
 */
import { useState } from 'react';
import {
  type HeadlinerDisplaySettings, type PulseIntensitySetting, type CrowdMemorySetting, type AnimationQuality,
} from './headlinerDisplaySettings';
import type { CrowdRenderMode } from '../../api/crowdVisualConfig';

const CROWD_MODE_OPTIONS: (CrowdRenderMode | 'auto')[] = ['auto', 'dots', 'silhouettes', 'pixel', 'minimal'];
const ANIMATION_QUALITY_OPTIONS: AnimationQuality[] = ['low', 'medium', 'high'];
const PULSE_OPTIONS: PulseIntensitySetting[] = ['off', 'low', 'normal', 'high'];
const CROWD_MEMORY_OPTIONS: CrowdMemorySetting[] = ['off', 'subtle', 'normal'];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-gray-400">{label}</span>
      {children}
    </div>
  );
}

const selectClass = 'bg-gray-800 border border-gray-700 rounded-md text-xs text-white px-2 py-1';

export default function HeadlinerDisplaySettingsPanel({
  settings, onChange, systemReducedMotion,
}: {
  settings: HeadlinerDisplaySettings;
  onChange: (patch: Partial<HeadlinerDisplaySettings>) => void;
  systemReducedMotion: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs font-semibold text-gray-300"
        aria-expanded={open}
      >
        <span>Display Settings</span>
        <span className="text-gray-500">{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2.5">
          <Row label="Viewport">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.viewportEnabled}
                onChange={(e) => onChange({ viewportEnabled: e.target.checked })}
              />
              <span className="text-white">{settings.viewportEnabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </Row>
          <Row label="Crowd Mode">
            <select className={selectClass} value={settings.crowdMode} onChange={(e) => onChange({ crowdMode: e.target.value as HeadlinerDisplaySettings['crowdMode'] })}>
              {CROWD_MODE_OPTIONS.map((m) => <option key={m} value={m}>{m === 'auto' ? 'Auto (venue default)' : m}</option>)}
            </select>
          </Row>
          <Row label="Animation Quality">
            <select className={selectClass} value={settings.animationQuality} onChange={(e) => onChange({ animationQuality: e.target.value as AnimationQuality })}>
              {ANIMATION_QUALITY_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </Row>
          <Row label="Concert Pulse">
            <select className={selectClass} value={settings.pulseIntensity} onChange={(e) => onChange({ pulseIntensity: e.target.value as PulseIntensitySetting })}>
              {PULSE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Row>
          <Row label="Crowd Memory">
            <select className={selectClass} value={settings.crowdMemory} onChange={(e) => onChange({ crowdMemory: e.target.value as CrowdMemorySetting })}>
              {CROWD_MEMORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Row>
          <Row label="Camera Motion">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.cameraMotion}
                onChange={(e) => onChange({ cameraMotion: e.target.checked })}
              />
              <span className="text-white">{settings.cameraMotion ? 'On' : 'Off'}</span>
            </label>
          </Row>
          {systemReducedMotion && (
            <p className="text-[11px] text-amber-400 pt-1">
              Your system's reduced-motion preference is on — animation and camera motion are minimized regardless of these settings.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

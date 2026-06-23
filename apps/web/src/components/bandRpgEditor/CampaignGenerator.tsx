import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { campaignGeneratorApi, adventureApi } from '../../api/adventureApi';
import type { CampaignSettings, ValidationResult, CampaignPingResult, ImportResult, GameplayScore, ProgressionResult } from '../../api/adventureApi';
import { useAuth } from '../../contexts/AuthContext';
import { bandsApi } from '../../api/bands';
import type { BandWithCounts } from '@band-spectrum-mapper/shared';
import { MapPreview } from './MapPreview.js';
import { MapFixer } from './MapFixer.js';

// ── Draft persistence (localStorage) ─────────────────────────────────────────

const DRAFT_KEY = 'bsm:campaign-generator-draft';

interface Draft {
  settings: Partial<CampaignSettings>;
  blueprint: string;
  jsonText: string;
  savedAt: string;
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch { return null; }
}

function saveDraft(draft: Partial<Draft>) {
  try {
    const existing = loadDraft() ?? { settings: {}, blueprint: '', jsonText: '', savedAt: '' };
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...existing, ...draft, savedAt: new Date().toISOString() }));
  } catch { /* ignore storage errors */ }
}

// ── Repair history ────────────────────────────────────────────────────────────

interface RepairHistoryEntry {
  attempt: number;
  type: 'full' | 'reachability';
  passed: boolean;
  errorSummary: string;
}

// ── Step indicator ────────────────────────────────────────────────────────────

type Step = 'settings' | 'blueprint' | 'json' | 'validate' | 'import';

const STEPS: { id: Step; label: string }[] = [
  { id: 'settings', label: '1. Settings' },
  { id: 'blueprint', label: '2. Blueprint' },
  { id: 'json', label: '3. JSON' },
  { id: 'validate', label: '4. Validate' },
  { id: 'import', label: '5. Import' },
];

function StepBar({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-1 mb-6 flex-wrap">
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.id} className="flex items-center gap-1">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              active ? 'bg-indigo-600 text-white' :
              done ? 'bg-emerald-100 text-emerald-700' :
              'bg-surface-100 text-surface-400'
            }`}>
              {done ? '✓ ' : ''}{step.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-surface-300 text-xs">›</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Diagnostics panel ─────────────────────────────────────────────────────────

function DiagnosticsPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const { data, isFetching, isError, error, refetch } = useQuery<CampaignPingResult>({
    queryKey: ['campaign-ping'],
    queryFn: () => campaignGeneratorApi.ping(),
    enabled: false,
    retry: false,
  });

  const pingError = isError
    ? (error instanceof Error ? error.message : 'Request failed')
    : null;

  const httpStatus = isError && error && 'status' in error
    ? (error as { status: number }).status
    : null;

  return (
    <div className="border border-surface-200 rounded-lg overflow-hidden text-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-50 hover:bg-surface-100 text-surface-600 text-xs font-medium transition-colors"
      >
        <span>🔌 AI Connection Diagnostics</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3 bg-white text-xs">
          <div>
            <p className="font-semibold text-surface-700 mb-1.5">Browser auth state</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
              <span className="text-surface-500">User</span>
              <span className={user ? 'text-emerald-600' : 'text-red-500'}>{user ? user.email : 'not logged in'}</span>
              <span className="text-surface-500">isAdmin</span>
              <span className={user?.isAdmin ? 'text-emerald-600' : 'text-red-500'}>{user?.isAdmin ? 'true' : 'false'}</span>
              <span className="text-surface-500">Token</span>
              <span className={localStorage.getItem('bsm_token') ? 'text-emerald-600' : 'text-red-500'}>
                {localStorage.getItem('bsm_token') ? 'present in localStorage' : 'MISSING'}
              </span>
            </div>
          </div>

          <hr className="border-surface-200" />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold text-surface-700">Server ping: GET /api/band-rpg/campaign/ping</p>
              <button
                onClick={() => { void refetch(); }}
                disabled={isFetching}
                className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
              >
                {isFetching ? 'Testing…' : '▶ Run Test'}
              </button>
            </div>

            {pingError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 space-y-0.5">
                <div><strong>Error:</strong> {pingError}</div>
                {httpStatus && <div><strong>HTTP status:</strong> {httpStatus}{httpStatus === 401 ? ' — not authenticated (token missing or expired)' : httpStatus === 403 ? ' — authenticated but not admin' : ''}</div>}
              </div>
            )}

            {data && !pingError && (
              <div className="bg-surface-50 border border-surface-200 rounded p-2 font-mono space-y-0.5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-surface-500">Authenticated</span>
                  <span className="text-emerald-600">true</span>
                  <span className="text-surface-500">User ID</span>
                  <span className="text-surface-700">{data.userId}</span>
                  <span className="text-surface-500">Email</span>
                  <span className="text-surface-700">{data.email}</span>
                  <span className="text-surface-500">isAdmin</span>
                  <span className={data.isAdmin ? 'text-emerald-600' : 'text-red-500'}>{String(data.isAdmin)}</span>
                  <span className="text-surface-500">OPENAI_API_KEY</span>
                  <span className={data.openAiKeyConfigured ? 'text-emerald-600' : 'text-red-500'}>
                    {data.openAiKeyConfigured ? 'configured ✓' : 'MISSING — set in Railway → Variables'}
                  </span>
                  <span className="text-surface-500">Model</span>
                  <span className="text-surface-700">{data.model}</span>
                  <span className="text-surface-500">Status</span>
                  <span className={data.status === 'ready' ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{data.status}</span>
                </div>
                <p className="text-surface-500 mt-1 pt-1 border-t border-surface-200">{data.message}</p>
              </div>
            )}

            {!data && !pingError && !isFetching && (
              <p className="text-surface-400">Press "Run Test" to check authentication and OpenAI key status.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Band picker (combobox from BSM library) ───────────────────────────────────

function BandPicker({ value, bandId, onChange }: {
  value: string;
  bandId: string | undefined;
  onChange: (name: string, id: string | undefined) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode]   = useState<'picker' | 'custom'>('picker');
  const containerRef      = useRef<HTMLDivElement>(null);

  const { data: bands = [], isLoading } = useQuery<BandWithCounts[]>({
    queryKey: ['bands-list'],
    queryFn: () => bandsApi.list(),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const filtered = query.trim()
    ? bands.filter(b => b.name.toLowerCase().includes(query.toLowerCase()))
    : bands;

  const selected = bandId ? bands.find(b => b.id === bandId) : null;

  function selectBand(band: BandWithCounts) {
    onChange(band.name, band.id);
    setQuery('');
    setOpen(false);
    setMode('picker');
  }

  function clearBand() {
    onChange('', undefined);
    setQuery('');
  }

  if (mode === 'custom') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={e => onChange(e.target.value, undefined)}
            placeholder="e.g. Radiohead"
            className="flex-1 border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="button"
            onClick={() => { setMode('picker'); onChange('', undefined); }}
            className="text-xs text-indigo-600 hover:text-indigo-800 whitespace-nowrap"
          >
            ← Pick from library
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative space-y-1">
      {selected && !open ? (
        <div className="flex items-center gap-2 border border-surface-300 rounded-lg px-3 py-2 bg-indigo-50">
          <span className="flex-1 text-sm font-medium text-surface-900">{selected.name}</span>
          <span className="text-xs text-surface-400">
            {selected._count.albums} album{selected._count.albums !== 1 ? 's' : ''} · {selected._count.songs} song{selected._count.songs !== 1 ? 's' : ''}
          </span>
          <button type="button" onClick={clearBand} className="text-surface-400 hover:text-red-500 text-sm leading-none">✕</button>
        </div>
      ) : (
        <div className="flex items-center border border-surface-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-400">
          <input
            value={open ? query : (value || '')}
            onChange={e => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange('', undefined); }}
            onFocus={() => setOpen(true)}
            placeholder={isLoading ? 'Loading bands…' : 'Search band library…'}
            className="flex-1 px-3 py-2 text-sm text-surface-900 bg-white focus:outline-none"
          />
          <span className="px-2 text-surface-400 text-xs select-none">▼</span>
        </div>
      )}

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-surface-300 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {isLoading && <div className="px-3 py-2 text-xs text-surface-400">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-surface-400">No bands match "{query}"</div>
          )}
          {filtered.map(band => (
            <button
              key={band.id}
              type="button"
              onClick={() => selectBand(band)}
              className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-indigo-50 transition-colors"
            >
              <span className="text-sm font-medium text-surface-900">{band.name}</span>
              <span className="text-xs text-surface-400 ml-2 shrink-0">
                {band._count.albums} album{band._count.albums !== 1 ? 's' : ''} · {band._count.songs} song{band._count.songs !== 1 ? 's' : ''}
              </span>
            </button>
          ))}
          <div className="border-t border-surface-200 px-3 py-2">
            <button
              type="button"
              onClick={() => { setOpen(false); setMode('custom'); }}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              + Use custom band name not in library
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings form ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: CampaignSettings = {
  bandName: '',
  adventureTitle: '',
  slug: '',
  theme: '',
  difficulty: 'normal',
  estimatedPlaytime: 30,
  numLevels: 3,
  numQuests: 2,
  tone: 'mysterious, atmospheric',
  includeCompletionScreen: true,
  includePuzzles: true,
  includeDoorsKeys: true,
  songRecovery: false,
  extraInstructions: '',
};

function SettingsForm({ settings, onChange, onGenerate, isLoading }: {
  settings: CampaignSettings;
  onChange: (s: CampaignSettings) => void;
  onGenerate: () => void;
  isLoading: boolean;
}) {
  function set<K extends keyof CampaignSettings>(key: K, value: CampaignSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-surface-700 mb-1">Band <span className="text-red-500">*</span></label>
          <BandPicker
            value={settings.bandName}
            bandId={settings.bandId}
            onChange={(name, id) => {
              const { bandId: _rm, ...base } = { ...settings, bandName: name };
              const next = id !== undefined ? { ...base, bandId: id } : base;
              onChange(next as CampaignSettings);
            }}
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-surface-700 mb-1">Adventure Title <span className="text-red-500">*</span></label>
          <input
            value={settings.adventureTitle}
            onChange={e => set('adventureTitle', e.target.value)}
            placeholder="e.g. OK Computer Depths"
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-surface-700 mb-1">Slug prefix (optional)</label>
          <input
            value={settings.slug ?? ''}
            onChange={e => set('slug', e.target.value)}
            placeholder="e.g. rh-ok-computer"
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <p className="text-xs text-surface-400 mt-0.5">Lowercase letters, numbers, hyphens only</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-surface-700 mb-1">Difficulty</label>
          <select
            value={settings.difficulty ?? 'normal'}
            onChange={e => set('difficulty', e.target.value)}
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {['easy', 'normal', 'hard', 'expert'].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-700 mb-1">Levels</label>
          <input type="number" min={1} max={8} value={settings.numLevels ?? 3} onChange={e => set('numLevels', Number(e.target.value))}
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-700 mb-1">Quests</label>
          <input type="number" min={1} max={10} value={settings.numQuests ?? 2} onChange={e => set('numQuests', Number(e.target.value))}
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-700 mb-1">Estimated Playtime (min)</label>
          <input type="number" min={5} max={180} value={settings.estimatedPlaytime ?? 30} onChange={e => set('estimatedPlaytime', Number(e.target.value))}
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-surface-700 mb-1">Tone</label>
          <input value={settings.tone ?? ''} onChange={e => set('tone', e.target.value)} placeholder="mysterious, atmospheric"
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-surface-700 mb-1">Theme</label>
          <input value={settings.theme ?? ''} onChange={e => set('theme', e.target.value)} placeholder="e.g. Paranoia and technology, fragmented memories"
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-surface-700 mb-2">Include features</p>
        <div className="flex flex-wrap gap-3">
          {[
            { key: 'includeCompletionScreen' as const, label: 'Completion screen' },
            { key: 'includePuzzles' as const, label: 'Puzzles & switches' },
            { key: 'includeDoorsKeys' as const, label: 'Doors & key items' },
            { key: 'songRecovery' as const, label: 'Song recovery mechanic' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-sm text-surface-700 cursor-pointer">
              <input type="checkbox" checked={!!settings[key]} onChange={e => set(key, e.target.checked)}
                className="rounded border-surface-300 text-indigo-600 focus:ring-indigo-400" />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-700 mb-1">Extra Instructions (optional)</label>
        <textarea
          value={settings.extraInstructions ?? ''}
          onChange={e => set('extraInstructions', e.target.value)}
          rows={3}
          placeholder="Any special creative direction, NPC ideas, plot twists, or specific items you want..."
          className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
        />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
        <strong>Content guidelines:</strong> GPT will create fictional NPCs. No lyrics will be quoted. Band/album/song names may be referenced by title only.
      </div>

      <button
        onClick={onGenerate}
        disabled={isLoading || !settings.bandName || !settings.adventureTitle}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        {isLoading ? '✦ Generating Blueprint…' : '✦ Generate Blueprint →'}
      </button>
    </div>
  );
}

// ── Blueprint step ────────────────────────────────────────────────────────────

function BlueprintStep({ blueprint, onChange, onGenerateJson, onBack, isLoading }: {
  blueprint: string;
  onChange: (v: string) => void;
  onGenerateJson: () => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-600">Review and edit the blueprint before generating JSON. You can add or remove details freely.</p>
      <textarea
        value={blueprint}
        onChange={e => onChange(e.target.value)}
        rows={24}
        className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
      />
      <div className="flex gap-3">
        <button onClick={onBack} className="text-sm text-surface-500 hover:text-surface-700 px-4 py-2 border border-surface-300 rounded-lg">← Back</button>
        <button
          onClick={onGenerateJson}
          disabled={isLoading || !blueprint.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? '✦ Generating JSON…' : '✦ Generate JSON →'}
        </button>
      </div>
    </div>
  );
}

// ── JSON editor step ──────────────────────────────────────────────────────────

function JsonEditorStep({ jsonText, onChange, onValidate, onBack, isLoading }: {
  jsonText: string;
  onChange: (v: string) => void;
  onValidate: () => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  const [parseError, setParseError] = useState<string | null>(null);

  function handleChange(v: string) {
    onChange(v);
    try { JSON.parse(v); setParseError(null); } catch (e) { setParseError(String(e)); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-600">Review and edit the generated adventure JSON. You can make manual corrections before validating.</p>
        <button
          onClick={() => { try { onChange(JSON.stringify(JSON.parse(jsonText), null, 2)); setParseError(null); } catch { /* already invalid */ } }}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >Format JSON</button>
      </div>
      <textarea
        value={jsonText}
        onChange={e => handleChange(e.target.value)}
        rows={28}
        spellCheck={false}
        className={`w-full border rounded-lg px-3 py-2 text-xs text-surface-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y ${parseError ? 'border-red-400' : 'border-surface-300'}`}
      />
      {parseError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          <strong>JSON parse error:</strong> {parseError}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={onBack} className="text-sm text-surface-500 hover:text-surface-700 px-4 py-2 border border-surface-300 rounded-lg">← Back</button>
        <button
          onClick={onValidate}
          disabled={isLoading || !!parseError || !jsonText.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? '✦ Validating…' : '✦ Validate →'}
        </button>
      </div>
    </div>
  );
}

// ── Gameplay score panel ──────────────────────────────────────────────────────

function GameplayScorePanel({ score }: { score: GameplayScore }) {
  const pass = score.total >= 60;
  const panelCls = pass
    ? 'bg-emerald-50 border-emerald-200'
    : 'bg-amber-50 border-amber-300';
  const headCls  = pass ? 'text-emerald-800' : 'text-amber-900';
  const subCls   = pass ? 'text-emerald-700' : 'text-amber-800';
  const barBg    = pass ? 'bg-emerald-100' : 'bg-amber-100';
  const barFill  = pass ? 'bg-emerald-500' : 'bg-amber-500';
  const badgeCls = pass
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-red-100 text-red-700';

  const dims = [
    { label: 'Exploration', value: score.exploration },
    { label: 'Puzzles',     value: score.puzzles },
    { label: 'Items',       value: score.items },
    { label: 'Variety',     value: score.variety },
    { label: 'Progression', value: score.progression },
  ];

  return (
    <div className={`border rounded-lg p-3 ${panelCls}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-sm font-semibold ${headCls}`}>
          Gameplay Quality: {score.total}/100
        </span>
        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${badgeCls}`}>
          {pass ? '✓ PASS' : `✗ FAIL (need 60)`}
        </span>
      </div>
      <div className="space-y-1.5">
        {dims.map(({ label, value }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`w-[84px] text-xs shrink-0 ${subCls}`}>{label}</span>
            <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${barBg}`}>
              <div
                className={`h-full rounded-full transition-all ${barFill}`}
                style={{ width: `${(value / 20) * 100}%` }}
              />
            </div>
            <span className={`text-xs w-8 text-right shrink-0 ${subCls}`}>{value}/20</span>
          </div>
        ))}
      </div>
      {score.details.length > 0 && (
        <details className="mt-2">
          <summary className={`text-xs cursor-pointer select-none ${subCls}`}>Level details ▸</summary>
          <ul className={`mt-1 space-y-0.5 text-xs font-mono ${subCls}`}>
            {score.details.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Progression simulation panel ──────────────────────────────────────────────

function ProgressionPanel({ progression }: { progression: ProgressionResult }) {
  const { passed, errors, warnings, metrics } = progression;

  const panelCls = passed
    ? 'bg-emerald-50 border-emerald-200'
    : 'bg-red-50 border-red-300';
  const headCls = passed ? 'text-emerald-800' : 'text-red-800';

  const checks = [
    {
      ok: metrics.adventureCompletable,
      label: 'Adventure completable',
      detail: metrics.adventureCompletable
        ? `Simulation reached __adventure_complete__ in ${metrics.progressionSteps} step${metrics.progressionSteps !== 1 ? 's' : ''}`
        : 'Simulation got stuck — player cannot finish the adventure',
    },
    {
      ok: metrics.softlockCount === 0,
      label: 'No softlocks / cycles',
      detail: metrics.softlockCount === 0
        ? 'No impossible doors or circular dependencies found'
        : `${metrics.softlockCount} softlock${metrics.softlockCount !== 1 ? 's' : ''} detected`,
    },
    {
      ok: metrics.unreachableObjectives === 0,
      label: 'All objectives completable',
      detail: metrics.unreachableObjectives === 0
        ? 'Every required objective is achievable'
        : `${metrics.unreachableObjectives} required objective${metrics.unreachableObjectives !== 1 ? 's' : ''} unreachable`,
    },
  ];

  return (
    <div className={`border rounded-lg p-3 ${panelCls}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-sm font-semibold ${headCls}`}>
          Progression Simulation
        </span>
        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
          {passed ? '✓ PASS' : '✗ FAIL'}
        </span>
      </div>

      <div className="space-y-1 mb-2">
        {checks.map(({ ok, label, detail }) => (
          <div key={label} className="flex items-start gap-2 text-xs">
            <span className={ok ? 'text-emerald-600' : 'text-red-600'}>{ok ? '✓' : '✗'}</span>
            <div>
              <span className={`font-medium ${ok ? 'text-emerald-700' : 'text-red-700'}`}>{label}</span>
              <span className="text-surface-500 ml-1">— {detail}</span>
            </div>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1.5 mt-2">
          {errors.map((e, i) => (
            <li key={i} className="text-xs text-red-800 bg-red-100/60 rounded px-2 py-1.5">
              {e.path && <span className="font-mono font-medium">[{e.path}]</span>}{' '}
              {e.message}
            </li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 mt-2">
          {warnings.map((w, i) => (
            <li key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
              ⚠ {w.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Validation step ───────────────────────────────────────────────────────────

const REACHABILITY_KEYWORDS = ['unreachable', 'sealed', 'no exit entity', 'not reachable from the starting level', 'no spawn entity', 'non-walkable tile'];

function isReachabilityError(msg: string): boolean {
  return REACHABILITY_KEYWORDS.some(kw => msg.includes(kw));
}

interface RawMapEntity {
  type?: string;
  x?: number;
  y?: number;
  refId?: string;
  label?: string;
  targetLevelSlug?: string;
  id?: string;
}

interface ParsedLevel {
  slug: string;
  name: string;
  mapData: { width?: number; height?: number; tiles?: number[][]; entities?: RawMapEntity[] };
}

function ValidationStep({ result, onRepair, onRepairReachability, onProceed, onBack, isRepairLoading, isRepairReachabilityLoading, repairAttempt, repairHistory, parsedLevels, onEditMap }: {
  result: ValidationResult;
  onRepair: () => void;
  onRepairReachability: () => void;
  onProceed: () => void;
  onBack: () => void;
  isRepairLoading: boolean;
  isRepairReachabilityLoading: boolean;
  repairAttempt: number;
  repairHistory: RepairHistoryEntry[];
  parsedLevels: ParsedLevel[];
  onEditMap: (levelSlug: string) => void;
}) {
  const MAX_REPAIRS = 6;
  const [copiedReach, setCopiedReach] = useState(false);

  function isGameplayError(e: { path: string; message: string }): boolean {
    return e.path.startsWith('gameplay.');
  }

  const progressionErrorSet = new Set(
    (result.progression?.errors ?? []).map(pe => `${pe.path}::${pe.message}`),
  );
  function isProgressionError(e: { path: string; message: string }): boolean {
    return progressionErrorSet.has(`${e.path}::${e.message}`);
  }

  const reachabilityErrors = result.errors.filter(e => isReachabilityError(e.message));
  const gameplayErrors     = result.errors.filter(e => isGameplayError(e));
  const structuralErrors   = result.errors.filter(e =>
    !isReachabilityError(e.message) && !isGameplayError(e) && !isProgressionError(e)
  );
  const anyLoading = isRepairLoading || isRepairReachabilityLoading;

  function copyReachabilityErrors() {
    const text = `Reachability errors (${reachabilityErrors.length}):\n` +
      reachabilityErrors.map(e => (e.path ? `[${e.path}] ` : '') + e.message).join('\n');
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedReach(true);
      setTimeout(() => setCopiedReach(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      {/* Gameplay score — shown in both valid and invalid states */}
      {result.gameplay && (
        <GameplayScorePanel score={result.gameplay} />
      )}

      {/* Progression simulation — shown whenever data is available */}
      {result.progression && (
        <ProgressionPanel progression={result.progression} />
      )}

      {result.valid ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-800 font-medium mb-3">
            <span className="text-xl">✅</span> Adventure is valid and ready to import
          </div>
          {result.preview && (
            <div className="grid grid-cols-3 gap-2 text-xs text-emerald-700">
              {Object.entries(result.preview).map(([k, v]) => (
                <div key={k} className="bg-emerald-100/60 rounded px-2 py-1">
                  <span className="font-medium">{k}</span>: {v}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {reachabilityErrors.length > 0 && (
            <div className="bg-orange-50 border border-orange-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-orange-900 font-semibold text-sm">
                  <span>🗺</span>
                  Reachability errors — import blocked ({reachabilityErrors.length})
                </div>
                <button
                  onClick={copyReachabilityErrors}
                  className="text-xs px-2 py-0.5 rounded border border-orange-300 text-orange-700 hover:bg-orange-100 transition-colors shrink-0"
                >
                  {copiedReach ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
              <p className="text-xs text-orange-800 mb-3">
                BFS flood-fill from spawn found entities that cannot be reached in normal gameplay.
                Use <strong>Repair Reachability</strong> for a focused map fix, or <strong>Repair All</strong> to fix everything at once.
              </p>
              <ul className="space-y-1.5">
                {reachabilityErrors.map((e, i) => (
                  <li key={i} className="text-xs text-orange-800 bg-orange-100/60 rounded px-2 py-1.5">
                    {e.path && <span className="font-mono font-medium text-orange-900">[{e.path}]</span>}{' '}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {gameplayErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
              <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm mb-2">
                <span>🎮</span>
                Gameplay quality too low — import blocked
              </div>
              <p className="text-xs text-amber-800 mb-3">
                Score is below 60/100. Use <strong>Repair All</strong> to ask GPT to improve maps,
                add items, and add puzzle mechanics. You can also edit the JSON manually.
              </p>
              <ul className="space-y-1.5">
                {gameplayErrors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-800 bg-amber-100/60 rounded px-2 py-1.5">
                    {e.path && <span className="font-mono font-medium text-amber-900">[{e.path}]</span>}{' '}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {structuralErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800 font-medium mb-2 text-sm">
                <span>❌</span>
                {structuralErrors.length} structural error{structuralErrors.length !== 1 ? 's' : ''}
              </div>
              <ul className="space-y-1">
                {structuralErrors.map((e, i) => (
                  <li key={i} className="text-xs text-red-700">
                    {e.path && <span className="font-mono font-medium">[{e.path}]</span>}{' '}{e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Map previews — shown whenever we have level data */}
      {parsedLevels.length > 0 && (
        <div className="border border-surface-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-surface-600 mb-3">Map Previews ({parsedLevels.length} level{parsedLevels.length !== 1 ? 's' : ''})</p>
          <div className="flex flex-wrap gap-4">
            {parsedLevels.map(level => {
              const hasReachErr = reachabilityErrors.some(e =>
                e.path.includes(`[${level.slug}]`) ||
                e.message.includes(level.name) ||
                e.message.includes(level.slug),
              );
              return (
                <MapPreview
                  key={level.slug}
                  mapData={level.mapData}
                  levelName={level.name}
                  hasErrors={hasReachErr}
                  onEdit={hasReachErr ? () => onEditMap(level.slug) : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {repairHistory.length > 0 && (
        <div className="border border-surface-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-surface-600 mb-2">Repair history</p>
          <ul className="space-y-1">
            {repairHistory.map((entry, i) => (
              <li key={i} className="text-xs flex items-center gap-2">
                <span>{entry.passed ? '✅' : '❌'}</span>
                <span className="text-surface-500">Attempt {entry.attempt}</span>
                <span className={`px-1.5 py-0.5 rounded font-medium ${entry.type === 'reachability' ? 'bg-orange-100 text-orange-700' : 'bg-surface-100 text-surface-600'}`}>
                  {entry.type === 'reachability' ? 'map repair' : 'full repair'}
                </span>
                <span className="text-surface-600">{entry.errorSummary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <button onClick={onBack} className="text-sm text-surface-500 hover:text-surface-700 px-4 py-2 border border-surface-300 rounded-lg">← Edit JSON</button>

        {!result.valid && repairAttempt < MAX_REPAIRS && (
          <>
            {reachabilityErrors.length > 0 && (
              <button
                onClick={onRepairReachability}
                disabled={anyLoading}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {isRepairReachabilityLoading
                  ? `✦ Repairing Maps… (${repairAttempt + 1}/${MAX_REPAIRS})`
                  : `🗺 Repair Reachability (${repairAttempt + 1}/${MAX_REPAIRS})`}
              </button>
            )}
            <button
              onClick={onRepair}
              disabled={anyLoading}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {isRepairLoading
                ? `✦ Repairing All… (${repairAttempt + 1}/${MAX_REPAIRS})`
                : `⚡ Repair All Issues (${repairAttempt + 1}/${MAX_REPAIRS})`}
            </button>
          </>
        )}

        {result.valid && (
          <button
            onClick={onProceed}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            ✦ Proceed to Import →
          </button>
        )}

        {!result.valid && repairAttempt >= MAX_REPAIRS && (
          <p className="text-sm text-surface-500">Max repair attempts reached ({MAX_REPAIRS}). Edit JSON manually then re-validate.</p>
        )}
      </div>
    </div>
  );
}

// ── Import step ───────────────────────────────────────────────────────────────

interface ImportErrorDetails {
  message: string;
  details?: string;   // raw Prisma/DB error summary surfaced from the import route
  status?: number;
  body?: unknown;
  preValidatePassed: boolean;
  mode: string;
  slug?: string;
}

function ImportStep({ jsonText, onBack, onImported }: {
  jsonText: string;
  onBack: () => void;
  onImported: (result: ImportResult) => void;
}) {
  const [mode, setMode] = useState<'create' | 'update' | 'replace'>('create');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [published, setPublished] = useState(false);
  const [preValidateErrors, setPreValidateErrors] = useState<Array<{ path: string; message: string }> | null>(null);
  const [importErrorDetails, setImportErrorDetails] = useState<ImportErrorDetails | null>(null);
  const [copied, setCopied] = useState<'payload' | 'error' | null>(null);
  const preValidatePassedRef = useRef(false);

  function copyToClipboard(text: string, which: 'payload' | 'error') {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function getAdventureSlug(): string | undefined {
    try {
      return (JSON.parse(jsonText) as { adventure?: { slug?: string } }).adventure?.slug ?? undefined;
    } catch { return undefined; }
  }

  const importMut = useMutation({
    mutationFn: async () => {
      const payload = JSON.parse(jsonText) as unknown;
      preValidatePassedRef.current = false;
      setPreValidateErrors(null);
      setImportErrorDetails(null);

      const validation = await adventureApi.validate(payload);
      if (!validation.valid) {
        setPreValidateErrors(validation.errors as Array<{ path: string; message: string }>);
        throw new Error('pre-validate-failed');
      }
      preValidatePassedRef.current = true;

      return adventureApi.import(payload, mode);
    },
    onSuccess: (result) => {
      if (result.ok && result.adventureId) {
        setImportResult(result);
        setPublished(result.isPublished ?? false);
        onImported(result);
      }
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'pre-validate-failed') return;

      const err = e as Error & { status?: number; body?: unknown };
      const body = err.body;
      const slug = getAdventureSlug();

      let message = err.message;
      if (body && typeof body === 'object') {
        const b = body as { error?: string };
        if (b.error) message = b.error;
      }

      const rawDetails = typeof (body as { details?: unknown })?.details === 'string'
        ? (body as { details: string }).details
        : undefined;

      setImportErrorDetails({
        message,
        ...(rawDetails !== undefined ? { details: rawDetails } : {}),
        ...(err.status !== undefined ? { status: err.status } : {}),
        ...(body !== undefined ? { body } : {}),
        preValidatePassed: preValidatePassedRef.current,
        mode,
        ...(slug !== undefined ? { slug } : {}),
      });
    },
  });

  const publishMut = useMutation({
    mutationFn: () => adventureApi.update(importResult!.adventureId!, { isPublished: true }),
    onSuccess: () => setPublished(true),
  });

  let preview: Record<string, number> | null = null;
  try {
    const parsed = JSON.parse(jsonText) as { levels?: unknown[]; quests?: unknown[] };
    preview = {
      levels: Array.isArray(parsed.levels) ? parsed.levels.length : 0,
      quests: Array.isArray(parsed.quests) ? parsed.quests.length : 0,
    };
  } catch { /* ignore */ }

  // ── Post-import success panel ──
  if (importResult?.ok && importResult.adventureId) {
    const advId = importResult.adventureId;
    const firstSlug = importResult.firstLevelSlug;

    return (
      <div className="space-y-5 max-w-lg">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="text-3xl mb-2">🎉</div>
          <h3 className="font-semibold text-emerald-800 text-lg mb-0.5">Adventure Imported!</h3>
          {importResult.name && (
            <p className="text-sm text-emerald-700 mb-1 font-medium">{importResult.name}</p>
          )}
          <div className="flex gap-2 flex-wrap text-xs mt-1">
            {importResult.slug && (
              <span className="bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5 font-mono">{importResult.slug}</span>
            )}
            <span className={`rounded px-1.5 py-0.5 font-medium ${published ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-100 text-amber-700'}`}>
              {published ? '● Published' : '○ Unpublished'}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {!published && (
            <button
              onClick={() => publishMut.mutate()}
              disabled={publishMut.isPending}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {publishMut.isPending ? 'Publishing…' : '🌐 Publish Now'}
            </button>
          )}

          {published && firstSlug && (
            <Link
              to={`/play/band-rpg/game/${encodeURIComponent(firstSlug)}?adventureId=${encodeURIComponent(advId)}`}
              className="block w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium text-center transition-colors"
            >
              ▶ Play Adventure
            </Link>
          )}

          {!published && firstSlug && (
            <p className="text-center text-xs text-surface-400">Publish first to enable Play Adventure</p>
          )}

          <Link
            to={`/play/band-rpg/adventures/${encodeURIComponent(advId)}`}
            className="block w-full py-2 rounded-lg border border-surface-300 hover:bg-surface-50 text-surface-700 text-sm font-medium text-center transition-colors"
          >
            📋 Adventure Detail Page
          </Link>

          <Link
            to="/play/band-rpg/adventures"
            className="block w-full py-2 rounded-lg border border-surface-300 hover:bg-surface-50 text-surface-700 text-sm font-medium text-center transition-colors"
          >
            🗺 Adventure Browser
          </Link>

          <a
            href="/admin/band-rpg"
            className="block w-full py-2 rounded-lg border border-surface-300 hover:bg-surface-50 text-surface-500 text-xs font-medium text-center transition-colors"
          >
            ⚙ Open in Admin (Adventures tab)
          </a>
        </div>

        {publishMut.isError && (
          <p className="text-xs text-red-600">Publish failed: {publishMut.error instanceof Error ? publishMut.error.message : 'Unknown error'}</p>
        )}
      </div>
    );
  }

  // ── Pre-import panel ──
  return (
    <div className="space-y-5 max-w-lg">
      <div className="bg-surface-50 border border-surface-200 rounded-lg p-4">
        <p className="text-sm font-medium text-surface-800 mb-2">Ready to import</p>
        {preview && (
          <div className="text-xs text-surface-600 space-y-0.5">
            <div>Levels: <strong>{preview.levels}</strong></div>
            <div>Quests: <strong>{preview.quests}</strong></div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-surface-700 mb-2">Import mode</label>
        <div className="space-y-2">
          {([
            ['create',  'Create — fails if adventure slug already exists (safest)'],
            ['update',  'Update — upsert by slug, adds/updates content'],
            ['replace', 'Replace — delete all existing content, then recreate'],
          ] as const).map(([m, desc]) => (
            <label key={m} className="flex items-start gap-2 cursor-pointer">
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-0.5" />
              <span className="text-sm text-surface-700"><strong>{m}</strong> — {desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Pre-validation failure (before import was attempted) */}
      {preValidateErrors && preValidateErrors.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-orange-800">Pre-import validation failed — import blocked</p>
          <p className="text-xs text-orange-700">The adventure failed a final validation check before import. Go back and repair these errors first.</p>
          <ul className="space-y-1 mt-2">
            {preValidateErrors.map((e, i) => (
              <li key={i} className="text-xs text-orange-800 bg-orange-100/60 rounded px-2 py-1.5 font-mono">
                {e.path && <span className="font-semibold">[{e.path}]</span>}{' '}{e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Import failure with full diagnostics */}
      {importErrorDetails && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-red-800">
            {importErrorDetails.preValidatePassed
              ? 'Validation passed, but database import failed'
              : 'Import failed'}
          </p>

          <div className="text-xs font-mono bg-red-100/60 rounded p-2 space-y-0.5 text-red-700">
            {importErrorDetails.status !== undefined && (
              <div><span className="font-bold">HTTP {importErrorDetails.status}</span></div>
            )}
            <div>Endpoint: POST /api/band-rpg/adventures/import</div>
            <div>Mode: {importErrorDetails.mode}</div>
            {importErrorDetails.slug && <div>Slug: {importErrorDetails.slug}</div>}
          </div>

          <div className="text-xs text-red-800 space-y-1">
            <p className="font-semibold">Error message:</p>
            <p className="whitespace-pre-wrap font-mono bg-red-100/40 rounded p-2">{importErrorDetails.message}</p>
            {importErrorDetails.details && (
              <div>
                <p className="font-semibold mt-1">Database error:</p>
                <p className="whitespace-pre-wrap font-mono bg-red-100/40 rounded p-2 text-red-700">{importErrorDetails.details}</p>
              </div>
            )}
            {(() => {
              if (!importErrorDetails.body || typeof importErrorDetails.body !== 'object') return null;
              const b = importErrorDetails.body as { errors?: Array<{ path?: string; message: string }> };
              if (!Array.isArray(b.errors) || b.errors.length === 0) return null;
              return (
                <ul className="space-y-0.5 mt-1">
                  {b.errors.map((e, i) => (
                    <li key={i} className="font-mono bg-red-100/40 rounded px-2 py-1">
                      {e.path ? `[${e.path}] ` : ''}{e.message}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => copyToClipboard(jsonText, 'payload')}
              className="text-xs px-2.5 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100 transition-colors"
            >
              {copied === 'payload' ? '✓ Copied!' : '📋 Copy Import Payload'}
            </button>
            <button
              onClick={() => copyToClipboard(JSON.stringify(importErrorDetails, null, 2), 'error')}
              className="text-xs px-2.5 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100 transition-colors"
            >
              {copied === 'error' ? '✓ Copied!' : '📋 Copy Error Details'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="text-sm text-surface-500 hover:text-surface-700 px-4 py-2 border border-surface-300 rounded-lg">← Back</button>
        <button
          onClick={() => importMut.mutate()}
          disabled={importMut.isPending}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {importMut.isPending
            ? (preValidatePassedRef.current ? '✦ Importing…' : '✦ Pre-validating…')
            : '✦ Import Adventure'}
        </button>
      </div>
    </div>
  );
}

// ── Main CampaignGenerator component ─────────────────────────────────────────

export default function CampaignGenerator() {
  const draft = loadDraft();

  const [step, setStep]                     = useState<Step>('settings');
  const [settings, setSettings]             = useState<CampaignSettings>({ ...DEFAULT_SETTINGS, ...draft?.settings });
  const [blueprint, setBlueprint]           = useState(draft?.blueprint ?? '');
  const [jsonText, setJsonText]             = useState(draft?.jsonText ?? '');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [repairAttempt, setRepairAttempt]   = useState(0);
  const [repairHistory, setRepairHistory]   = useState<RepairHistoryEntry[]>([]);
  const [error, setError]                   = useState<string | null>(null);
  const [fixerLevel, setFixerLevel]         = useState<string | null>(null);

  const parsedLevels = useMemo((): ParsedLevel[] => {
    if (!jsonText.trim()) return [];
    try {
      const json = JSON.parse(jsonText) as {
        levels?: Array<{
          slug?: string;
          name?: string;
          mapData?: {
            width?: number; height?: number;
            tiles?: number[][];
            entities?: RawMapEntity[];
          };
        }>;
      };
      return (json.levels ?? [])
        .filter((l): l is typeof l & { slug: string } => typeof l.slug === 'string')
        .map(l => ({
          slug:    l.slug,
          name:    typeof l.name === 'string' ? l.name : l.slug,
          mapData: l.mapData ?? {},
        }));
    } catch { return []; }
  }, [jsonText]);

  useEffect(() => { saveDraft({ settings }); }, [settings]);
  useEffect(() => { if (blueprint) saveDraft({ blueprint }); }, [blueprint]);
  useEffect(() => { if (jsonText) saveDraft({ jsonText }); }, [jsonText]);

  const blueprintMut = useMutation({
    mutationFn: () => campaignGeneratorApi.blueprint(settings),
    onSuccess: ({ blueprint: bp }) => {
      setBlueprint(bp);
      setError(null);
      setStep('blueprint');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Blueprint generation failed'),
  });

  const generateMut = useMutation({
    mutationFn: () => campaignGeneratorApi.generate(blueprint, {
      bandName: settings.bandName,
      adventureTitle: settings.adventureTitle,
      slug: settings.slug,
      numLevels: settings.numLevels,
      numQuests: settings.numQuests,
      includeCompletionScreen: settings.includeCompletionScreen,
      includePuzzles: settings.includePuzzles,
      includeDoorsKeys: settings.includeDoorsKeys,
    }),
    onSuccess: ({ json }) => {
      setJsonText(JSON.stringify(json, null, 2));
      setValidationResult(null);
      setRepairAttempt(0);
      setRepairHistory([]);
      setError(null);
      setStep('json');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'JSON generation failed'),
  });

  const validateMut = useMutation({
    mutationFn: () => adventureApi.validate(JSON.parse(jsonText) as unknown),
    onSuccess: (result) => {
      setValidationResult(result);
      setRepairHistory([]);
      setError(null);
      setStep('validate');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Validation request failed'),
  });

  function handleMapSave(levelSlug: string, updatedMapData: ParsedLevel['mapData']) {
    try {
      const json = JSON.parse(jsonText) as {
        levels?: Array<{ slug?: string; mapData?: unknown }>;
      };
      if (json.levels) {
        const idx = json.levels.findIndex(l => l.slug === levelSlug);
        if (idx >= 0) {
          json.levels[idx] = { ...json.levels[idx], mapData: updatedMapData };
        }
      }
      setJsonText(JSON.stringify(json, null, 2));
      setFixerLevel(null);
      validateMut.mutate();
    } catch { /* ignore malformed JSON */ }
  }

  function recordRepair(attempt: number, type: 'full' | 'reachability', result: ValidationResult) {
    const errCount = result.errors.length;
    setRepairHistory(h => [...h, {
      attempt,
      type,
      passed: result.valid,
      errorSummary: result.valid ? 'all checks passed' : `${errCount} error${errCount !== 1 ? 's' : ''} remain`,
    }]);
  }

  const repairMut = useMutation({
    mutationFn: () => {
      const errors = (validationResult?.errors ?? []).map(e => ({ path: e.path, message: e.message }));
      return campaignGeneratorApi.repair(JSON.parse(jsonText) as unknown, errors, repairAttempt + 1);
    },
    onSuccess: ({ json }) => {
      setJsonText(JSON.stringify(json, null, 2));
      const next = repairAttempt + 1;
      setRepairAttempt(next);
      adventureApi.validate(json).then(result => {
        recordRepair(next, 'full', result);
        setValidationResult(result);
        setError(null);
      }).catch(e => setError(e instanceof Error ? e.message : 'Revalidation failed'));
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Repair failed'),
  });

  const repairReachabilityMut = useMutation({
    mutationFn: () => {
      const reachErrors = (validationResult?.errors ?? [])
        .filter(e => isReachabilityError(e.message))
        .map(e => ({ path: e.path, message: e.message }));
      return campaignGeneratorApi.repairReachability(
        JSON.parse(jsonText) as unknown,
        reachErrors,
        repairAttempt + 1,
      );
    },
    onSuccess: ({ json }) => {
      setJsonText(JSON.stringify(json, null, 2));
      const next = repairAttempt + 1;
      setRepairAttempt(next);
      adventureApi.validate(json).then(result => {
        recordRepair(next, 'reachability', result);
        setValidationResult(result);
        setError(null);
      }).catch(e => setError(e instanceof Error ? e.message : 'Revalidation failed'));
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Reachability repair failed'),
  });

  const isLoading = blueprintMut.isPending || generateMut.isPending || validateMut.isPending
    || repairMut.isPending || repairReachabilityMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-surface-900">AI Campaign Generator</h2>
          <p className="text-xs text-surface-500 mt-0.5">Generate importable Band RPG adventure JSON using GPT-4o. Draft auto-saves to browser storage.</p>
        </div>
        {(blueprint || jsonText) && (
          <button
            onClick={() => {
              if (window.confirm('Clear all draft data (settings, blueprint, JSON)?')) {
                localStorage.removeItem(DRAFT_KEY);
                setBlueprint('');
                setJsonText('');
                setSettings({ ...DEFAULT_SETTINGS });
                setValidationResult(null);
                setRepairAttempt(0);
                setRepairHistory([]);
                setStep('settings');
              }
            }}
            className="text-xs text-surface-400 hover:text-red-500 transition-colors"
          >
            ✕ Clear draft
          </button>
        )}
      </div>

      <DiagnosticsPanel />

      <StepBar current={step} />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {step === 'settings' && (
        <SettingsForm
          settings={settings}
          onChange={setSettings}
          onGenerate={() => blueprintMut.mutate()}
          isLoading={isLoading}
        />
      )}

      {step === 'blueprint' && (
        <BlueprintStep
          blueprint={blueprint}
          onChange={setBlueprint}
          onGenerateJson={() => generateMut.mutate()}
          onBack={() => setStep('settings')}
          isLoading={isLoading}
        />
      )}

      {step === 'json' && (
        <JsonEditorStep
          jsonText={jsonText}
          onChange={setJsonText}
          onValidate={() => validateMut.mutate()}
          onBack={() => setStep('blueprint')}
          isLoading={isLoading}
        />
      )}

      {step === 'validate' && validationResult && (
        <ValidationStep
          result={validationResult}
          onRepair={() => repairMut.mutate()}
          onRepairReachability={() => repairReachabilityMut.mutate()}
          onProceed={() => setStep('import')}
          onBack={() => setStep('json')}
          isRepairLoading={repairMut.isPending}
          isRepairReachabilityLoading={repairReachabilityMut.isPending}
          repairAttempt={repairAttempt}
          repairHistory={repairHistory}
          parsedLevels={parsedLevels}
          onEditMap={(slug) => setFixerLevel(slug)}
        />
      )}

      {fixerLevel && (() => {
        const level = parsedLevels.find(l => l.slug === fixerLevel);
        if (!level) return null;
        return (
          <MapFixer
            mapData={level.mapData}
            levelName={level.name}
            onSave={(updated) => handleMapSave(fixerLevel, updated)}
            onClose={() => setFixerLevel(null)}
          />
        );
      })()}

      {step === 'import' && (
        <ImportStep
          jsonText={jsonText}
          onBack={() => setStep('validate')}
          onImported={(_result) => { /* result rendered inside ImportStep */ }}
        />
      )}
    </div>
  );
}

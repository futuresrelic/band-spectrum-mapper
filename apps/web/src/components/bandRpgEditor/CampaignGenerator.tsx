import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { campaignGeneratorApi, adventureApi } from '../../api/adventureApi';
import type { CampaignSettings, ValidationResult, CampaignPingResult } from '../../api/adventureApi';
import { useAuth } from '../../contexts/AuthContext';

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
          {/* Client-side auth state */}
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

          {/* Server ping */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold text-surface-700">Server ping: POST /api/band-rpg/campaign/ping</p>
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
          <input
            value={settings.bandName}
            onChange={e => set('bandName', e.target.value)}
            placeholder="e.g. Radiohead"
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-600">Review and edit the blueprint before generating JSON. You can add or remove details freely.</p>
      </div>
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

// ── Validation step ───────────────────────────────────────────────────────────

function ValidationStep({ result, onRepair, onProceed, onBack, isRepairLoading, repairAttempt }: {
  result: ValidationResult;
  onRepair: () => void;
  onProceed: () => void;
  onBack: () => void;
  isRepairLoading: boolean;
  repairAttempt: number;
}) {
  const MAX_REPAIRS = 3;

  return (
    <div className="space-y-4">
      {result.valid ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-emerald-800 font-medium mb-3">
            <span className="text-xl">✅</span> Adventure is valid
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 font-medium mb-3">
            <span className="text-xl">❌</span> {result.errors.length} validation error{result.errors.length !== 1 ? 's' : ''}
          </div>
          <ul className="space-y-1">
            {result.errors.map((e, i) => (
              <li key={i} className="text-xs text-red-700">
                {e.path && <span className="font-medium">[{e.path}] </span>}{e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <button onClick={onBack} className="text-sm text-surface-500 hover:text-surface-700 px-4 py-2 border border-surface-300 rounded-lg">← Edit JSON</button>
        {!result.valid && repairAttempt < MAX_REPAIRS && (
          <button
            onClick={onRepair}
            disabled={isRepairLoading}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {isRepairLoading ? `✦ Auto-Repairing… (${repairAttempt}/${MAX_REPAIRS})` : `⚡ Auto-Repair (attempt ${repairAttempt + 1}/${MAX_REPAIRS})`}
          </button>
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
          <p className="text-sm text-surface-500 self-center">Max repair attempts reached. Edit JSON manually then re-validate.</p>
        )}
      </div>
    </div>
  );
}

// ── Import step ───────────────────────────────────────────────────────────────

function ImportStep({ jsonText, onBack, onImported }: {
  jsonText: string;
  onBack: () => void;
  onImported: (adventureId: string) => void;
}) {
  const [mode, setMode] = useState<'create' | 'update' | 'replace'>('create');
  const [imported, setImported] = useState(false);

  const importMut = useMutation({
    mutationFn: () => {
      const payload = JSON.parse(jsonText) as unknown;
      return adventureApi.import(payload, mode);
    },
    onSuccess: (result) => {
      if (result.ok && result.adventureId) {
        setImported(true);
        onImported(result.adventureId);
      }
    },
  });

  // Extract a human-readable message from the error — surfaces Prisma / validation details
  function importErrorMessage(): string {
    if (!importMut.isError) return '';
    const err = importMut.error;
    if (err instanceof Error) {
      // The api client attaches .body with the full JSON response
      const body = (err as Error & { body?: unknown }).body;
      if (body && typeof body === 'object') {
        const b = body as { error?: string; errors?: Array<{ path?: string; message: string }> };
        const lines: string[] = [];
        if (b.error) lines.push(b.error);
        if (Array.isArray(b.errors) && b.errors.length > 0) {
          for (const e of b.errors) {
            lines.push(e.path ? `[${e.path}] ${e.message}` : e.message);
          }
        }
        if (lines.length) return lines.join('\n');
      }
      return err.message;
    }
    return 'Unknown error';
  }

  let preview: Record<string, number> | null = null;
  try {
    const parsed = JSON.parse(jsonText) as { levels?: unknown[]; quests?: unknown[] };
    preview = {
      levels: Array.isArray(parsed.levels) ? parsed.levels.length : 0,
      quests: Array.isArray(parsed.quests) ? parsed.quests.length : 0,
    };
  } catch { /* ignore */ }

  return (
    <div className="space-y-5 max-w-lg">
      {imported ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="font-semibold text-emerald-800 text-lg mb-1">Adventure Imported!</h3>
          <p className="text-sm text-emerald-700">The adventure is now in the system. Switch to the Adventures tab to view and publish it.</p>
        </div>
      ) : (
        <>
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
                ['create', 'Create — fails if adventure slug already exists (safest)'],
                ['update', 'Update — upsert by slug, adds/updates content'],
                ['replace', 'Replace — delete all existing content, then recreate'],
              ] as const).map(([m, desc]) => (
                <label key={m} className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-0.5" />
                  <span className="text-sm text-surface-700"><strong>{m}</strong> — {desc}</span>
                </label>
              ))}
            </div>
          </div>

          {importMut.isError && (
            <div className="bg-red-50 border border-red-200 rounded p-3 space-y-1">
              <p className="text-sm font-semibold text-red-700">Import failed</p>
              <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">{importErrorMessage()}</pre>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onBack} className="text-sm text-surface-500 hover:text-surface-700 px-4 py-2 border border-surface-300 rounded-lg">← Back</button>
            <button
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              {importMut.isPending ? '✦ Importing…' : '✦ Import Adventure'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main CampaignGenerator component ─────────────────────────────────────────

export default function CampaignGenerator() {
  const draft = loadDraft();

  const [step, setStep] = useState<Step>('settings');
  const [settings, setSettings] = useState<CampaignSettings>({ ...DEFAULT_SETTINGS, ...draft?.settings });
  const [blueprint, setBlueprint] = useState(draft?.blueprint ?? '');
  const [jsonText, setJsonText] = useState(draft?.jsonText ?? '');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [repairAttempt, setRepairAttempt] = useState(0);
  const [importedId, setImportedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Persist draft on key state changes
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
      setError(null);
      setStep('json');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'JSON generation failed'),
  });

  const validateMut = useMutation({
    mutationFn: () => adventureApi.validate(JSON.parse(jsonText) as unknown),
    onSuccess: (result) => {
      setValidationResult(result);
      setError(null);
      setStep('validate');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Validation request failed'),
  });

  const repairMut = useMutation({
    mutationFn: () => {
      const errors = (validationResult?.errors ?? []).map(e => ({ path: e.path, message: e.message }));
      return campaignGeneratorApi.repair(JSON.parse(jsonText) as unknown, errors, repairAttempt + 1);
    },
    onSuccess: ({ json }) => {
      const newText = JSON.stringify(json, null, 2);
      setJsonText(newText);
      setRepairAttempt(r => r + 1);
      // Re-validate after repair
      adventureApi.validate(json).then(result => {
        setValidationResult(result);
        setError(null);
      }).catch(e => setError(e instanceof Error ? e.message : 'Revalidation failed'));
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Repair failed'),
  });

  const isLoading = blueprintMut.isPending || generateMut.isPending || validateMut.isPending || repairMut.isPending;

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
          onProceed={() => setStep('import')}
          onBack={() => setStep('json')}
          isRepairLoading={repairMut.isPending}
          repairAttempt={repairAttempt}
        />
      )}

      {step === 'import' && (
        <ImportStep
          jsonText={jsonText}
          onBack={() => setStep('validate')}
          onImported={(id) => setImportedId(id)}
        />
      )}

      {importedId && (
        <div className="text-xs text-surface-400 text-center">
          Imported adventure ID: <code className="font-mono">{importedId}</code> — switch to the Adventures tab to publish it.
        </div>
      )}
    </div>
  );
}

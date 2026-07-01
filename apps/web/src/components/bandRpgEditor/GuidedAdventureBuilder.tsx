import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { campaignGeneratorApi, adventureApi } from '../../api/adventureApi';
import type {
  GuidedAdventureSpec, GuidedLevelSpec,
  GuidedSource, ValidationResult, ImportResult,
} from '../../api/adventureApi';
import { bandsApi } from '../../api/bands';
import type { BandWithCounts } from '@band-spectrum-mapper/shared';
import { allTemplates } from '@band-spectrum-mapper/shared';

// ── Constants ─────────────────────────────────────────────────────────────────

const TEMPLATES = allTemplates();

const NPC_ROLES = [
  { value: 'quest_giver', label: 'Quest Giver', desc: 'Gives the main quest for this level' },
  { value: 'clue_giver',  label: 'Clue Giver',  desc: 'Provides hints or additional context' },
  { value: 'gatekeeper',  label: 'Gatekeeper',   desc: 'Guards a door or locked area' },
  { value: 'archivist',   label: 'Archivist',    desc: 'Holds knowledge or lore' },
  { value: 'trickster',   label: 'Trickster',    desc: 'Misleads or adds tension' },
  { value: 'witness',     label: 'Witness',      desc: 'Observed key events' },
  { value: 'final_guide', label: 'Final Guide',  desc: 'Guides the player at end of level' },
];

const PUZZLE_TYPES = [
  'key_hunt', 'switch_gate', 'two_switch', 'item_return',
  'lyric_order', 'album_match', 'phrase_bridge', 'memory_sequence',
  'pattern_lock', 'choice_riddle',
];

const ITEM_TYPES = ['key', 'tool', 'collectible', 'consumable', 'artifact'];
const RARITIES   = ['common', 'uncommon', 'rare', 'legendary'];
const LEVEL_TYPES = ['standard', 'puzzle', 'stealth', 'exploration', 'boss', 'hub'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];

const MAP_DESCRIPTIONS: Record<string, string> = {
  two_room:          'Two rooms connected by a corridor. Classic and clear.',
  l_corridor:        'Winding L-shape. Forces exploration before access.',
  three_room_spine:  'Three rooms on a spine with branching alcoves.',
  hub_spokes:        'Central hub with 3 spoke rooms. Non-linear exploration.',
  winding_path:      'Long winding path — great for pacing and tension.',
  cross_junction:    'X-shaped junction with four exits. High variety.',
  dual_chamber:      'Two large chambers with a connector. Boss-friendly.',
  corridor_alcoves:  'Long corridor with side alcoves for secrets.',
  maze_lite:         'Simple maze — puzzle-heavy but not frustrating.',
  final_chamber:     'Dramatic final ritual chamber. Best for climax levels.',
};

type WizardStep = 'source' | 'identity' | 'levels' | 'flow' | 'generate' | 'validate' | 'import';

const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'source',   label: '1. Source'   },
  { id: 'identity', label: '2. Identity' },
  { id: 'levels',   label: '3. Levels'   },
  { id: 'flow',     label: '4. Flow'     },
  { id: 'generate', label: '5. Generate' },
  { id: 'validate', label: '6. Validate' },
  { id: 'import',   label: '7. Import'   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

function makeDefaultLevel(order: number): GuidedLevelSpec {
  return {
    order,
    name: `Level ${order}`,
    slug: `level_${order}`,
    description: '',
    type: 'standard',
    mapTemplateId: 'two_room',
    mapTransform: 'rot0',
    npcs: [],
    items: [],
    puzzle: null,
    questName: `Quest ${order}`,
    questEnabled: true,
    nextLevelSlug: '',
  };
}

function makeDefaultSource(): GuidedSource {
  return { mode: 'band', bandName: '', albumName: '', songName: '', customTheme: '' };
}

function makeDefaultSpec(): GuidedAdventureSpec {
  return {
    source: makeDefaultSource(),
    adventure: { name: '', slug: '', description: '', difficulty: 'medium', tags: [] },
    levels: [makeDefaultLevel(1), makeDefaultLevel(2)],
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WizardStepBar({ current }: { current: WizardStep }) {
  const idx = WIZARD_STEPS.findIndex(s => s.id === current);
  return (
    <div className="flex items-center gap-1 mb-6 flex-wrap">
      {WIZARD_STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            i === idx  ? 'bg-indigo-600 text-white' :
            i < idx    ? 'bg-emerald-100 text-emerald-700' :
            'bg-surface-100 text-surface-400'
          }`}>
            {i < idx ? '✓ ' : ''}{s.label}
          </span>
          {i < WIZARD_STEPS.length - 1 && <span className="text-surface-300 text-xs">›</span>}
        </div>
      ))}
    </div>
  );
}

interface SuggestButtonProps {
  step: string;
  context: Record<string, unknown>;
  onSelect: (s: string) => void;
  label?: string;
}

function SuggestButton({ step, context, onSelect, label = 'AI Suggest' }: SuggestButtonProps) {
  const [open, setOpen] = useState(false);
  const mut = useMutation({
    mutationFn: () => campaignGeneratorApi.guidedSuggest(step, context),
    onSuccess: () => setOpen(true),
  });
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-100 disabled:opacity-50 transition-colors"
      >
        {mut.isPending ? '…' : `✦ ${label}`}
      </button>
      {open && mut.data && (
        <div className="absolute z-10 top-full left-0 mt-1 w-72 bg-white border border-surface-200 rounded-lg shadow-lg p-2 space-y-1">
          {(mut.data.suggestions as string[]).map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onSelect(s); setOpen(false); }}
              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-indigo-50 text-surface-800"
            >
              {s}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="w-full text-center text-xs text-surface-400 pt-1">✕ close</button>
        </div>
      )}
    </div>
  );
}

// ── Step: Source ──────────────────────────────────────────────────────────────

interface SourceStepProps {
  source: GuidedSource;
  onChange: (s: GuidedSource) => void;
  onNext: () => void;
}

function SourceStep({ source, onChange, onNext }: SourceStepProps) {
  const { data: bands = [] } = useQuery<BandWithCounts[]>({
    queryKey: ['bands-list'],
    queryFn: () => bandsApi.list(),
  });

  const valid = source.mode === 'custom' ? source.customTheme.trim().length > 0 : source.bandName.trim().length > 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-surface-700 mb-3">What is this adventure based on?</p>
        <div className="flex gap-3 mb-4">
          {(['band', 'custom'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...source, mode: m })}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                source.mode === m
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-surface-300 text-surface-600 hover:border-indigo-400'
              }`}
            >
              {m === 'band' ? '🎸 BSM Band / Album / Song' : '✏️ Custom Theme'}
            </button>
          ))}
        </div>

        {source.mode === 'band' ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Band</label>
              <select
                value={source.bandName}
                onChange={e => onChange({ ...source, bandName: e.target.value })}
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">— select a band —</option>
                {bands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Album (optional)</label>
                <input
                  value={source.albumName}
                  onChange={e => onChange({ ...source, albumName: e.target.value })}
                  placeholder="e.g. Lateralus"
                  className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Song (optional)</label>
                <input
                  value={source.songName}
                  onChange={e => onChange({ ...source, songName: e.target.value })}
                  placeholder="e.g. Schism"
                  className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Custom theme</label>
            <input
              value={source.customTheme}
              onChange={e => onChange({ ...source, customTheme: e.target.value })}
              placeholder="e.g. A haunted cathedral where lost songs echo through the halls"
              className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!valid}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors"
        >
          Next: Identity →
        </button>
      </div>
    </div>
  );
}

// ── Step: Identity ────────────────────────────────────────────────────────────

interface IdentityStepProps {
  spec: GuidedAdventureSpec;
  onChange: (s: GuidedAdventureSpec) => void;
  onNext: () => void;
  onBack: () => void;
}

function IdentityStep({ spec, onChange, onNext, onBack }: IdentityStepProps) {
  const adv = spec.adventure;
  const src = spec.source;
  const suggestCtx = { bandName: src.bandName, albumName: src.albumName, songName: src.songName, customTheme: src.customTheme };

  function setAdv(patch: Partial<typeof adv>) {
    onChange({ ...spec, adventure: { ...adv, ...patch } });
  }

  const valid = adv.name.trim().length > 0 && adv.slug.trim().length > 0;
  const levelCount = spec.levels.length;

  function setLevelCount(n: number) {
    const current = spec.levels;
    if (n > current.length) {
      const extras = Array.from({ length: n - current.length }, (_, i) => makeDefaultLevel(current.length + i + 1));
      onChange({ ...spec, levels: [...current, ...extras] });
    } else {
      onChange({ ...spec, levels: current.slice(0, n) });
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs font-medium text-surface-600">Adventure Name</label>
            <SuggestButton
              step="adventure-names"
              context={suggestCtx}
              onSelect={name => setAdv({ name, slug: slugify(name) })}
            />
          </div>
          <input
            value={adv.name}
            onChange={e => setAdv({ name: e.target.value, slug: slugify(e.target.value) })}
            placeholder="e.g. The Spiral Descent"
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Slug</label>
            <input
              value={adv.slug}
              onChange={e => setAdv({ slug: slugify(e.target.value) })}
              placeholder="the_spiral_descent"
              className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Difficulty</label>
            <select
              value={adv.difficulty}
              onChange={e => setAdv({ difficulty: e.target.value })}
              className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
            >
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs font-medium text-surface-600">Description</label>
            <SuggestButton
              step="adventure-description"
              context={suggestCtx}
              onSelect={description => setAdv({ description })}
            />
          </div>
          <textarea
            value={adv.description}
            onChange={e => setAdv({ description: e.target.value })}
            rows={3}
            placeholder="A short atmospheric description of this adventure..."
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="text-xs font-medium text-surface-600">Tags (comma-separated)</label>
            <SuggestButton
              step="adventure-tags"
              context={suggestCtx}
              onSelect={tag => setAdv({ tags: [...adv.tags, tag] })}
              label="Add tag"
            />
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {adv.tags.map((t, i) => (
              <span key={i} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                {t}
                <button type="button" onClick={() => setAdv({ tags: adv.tags.filter((_, j) => j !== i) })} className="text-indigo-400 hover:text-indigo-700">×</button>
              </span>
            ))}
          </div>
          <input
            placeholder="Press Enter to add tag"
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) { setAdv({ tags: [...adv.tags, val] }); (e.target as HTMLInputElement).value = ''; }
              }
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-600 mb-1">Number of Levels: {levelCount}</label>
          <input
            type="range" min={1} max={8} value={levelCount}
            onChange={e => setLevelCount(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-surface-400 mt-1"><span>1</span><span>8</span></div>
        </div>
      </div>

      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-surface-600 hover:text-surface-900">← Back</button>
        <button type="button" onClick={onNext} disabled={!valid} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors">
          Next: Levels →
        </button>
      </div>
    </div>
  );
}

// ── Level editor card ─────────────────────────────────────────────────────────

interface LevelEditorProps {
  level: GuidedLevelSpec;
  levelIndex: number;
  totalLevels: number;
  source: GuidedSource;
  onChange: (l: GuidedLevelSpec) => void;
}

function LevelEditor({ level, levelIndex, totalLevels, source, onChange }: LevelEditorProps) {
  const [open, setOpen] = useState(levelIndex === 0);
  const suggestCtx = { bandName: source.bandName, customTheme: source.customTheme, levelName: level.name };

  function patch(p: Partial<GuidedLevelSpec>) { onChange({ ...level, ...p }); }

  const selectedTemplate = TEMPLATES.find(t => t.templateId === level.mapTemplateId);

  return (
    <div className="border border-surface-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-50 hover:bg-surface-100 text-sm font-medium text-surface-700 transition-colors"
      >
        <span>Level {level.order}: {level.name || '(unnamed)'}</span>
        <span className="text-surface-400 text-xs">{selectedTemplate?.name ?? level.mapTemplateId} · {open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {/* Name + slug */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-medium text-surface-600">Level Name</label>
                <SuggestButton step="level-names" context={suggestCtx} onSelect={name => patch({ name, slug: slugify(name) })} />
              </div>
              <input
                value={level.name}
                onChange={e => patch({ name: e.target.value, slug: slugify(e.target.value) })}
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Slug</label>
              <input
                value={level.slug}
                onChange={e => patch({ slug: slugify(e.target.value) })}
                className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          {/* Type + next level */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Level Type</label>
              <select value={level.type} onChange={e => patch({ type: e.target.value })} className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm">
                {LEVEL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">
                {levelIndex < totalLevels - 1 ? 'Next Level Slug' : 'Final Level'}
              </label>
              {levelIndex < totalLevels - 1 ? (
                <input
                  value={level.nextLevelSlug}
                  onChange={e => patch({ nextLevelSlug: e.target.value })}
                  placeholder="auto-filled on review"
                  className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm font-mono"
                />
              ) : (
                <div className="px-3 py-2 text-xs text-surface-400 border border-surface-200 rounded-lg bg-surface-50">This is the final level</div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
            <textarea
              value={level.description}
              onChange={e => patch({ description: e.target.value })}
              rows={2}
              placeholder="What happens in this level?"
              className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Map template */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-2">Map Template</label>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {TEMPLATES.map(t => (
                <button
                  key={t.templateId}
                  type="button"
                  onClick={() => patch({ mapTemplateId: t.templateId })}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-colors ${
                    level.mapTemplateId === t.templateId
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                      : 'border-surface-200 hover:border-indigo-300 text-surface-700'
                  }`}
                >
                  <div className="font-medium">{t.name}</div>
                  <div className="text-surface-500 mt-0.5">{MAP_DESCRIPTIONS[t.templateId] ?? `${t.width}×${t.height}`}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quest */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
              <input
                type="checkbox"
                checked={level.questEnabled}
                onChange={e => patch({ questEnabled: e.target.checked })}
                className="rounded accent-indigo-600"
              />
              Enable Quest
            </label>
            {level.questEnabled && (
              <div className="flex-1 flex items-center gap-2">
                <input
                  value={level.questName}
                  onChange={e => patch({ questName: e.target.value })}
                  placeholder="Quest name"
                  className="flex-1 border border-surface-300 rounded-lg px-3 py-1.5 text-sm"
                />
                <SuggestButton step="quest-names" context={suggestCtx} onSelect={questName => patch({ questName })} />
              </div>
            )}
          </div>

          {/* NPCs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-surface-600">NPCs ({level.npcs.length})</label>
              <button
                type="button"
                onClick={() => patch({ npcs: [...level.npcs, { name: '', role: 'quest_giver', dialogueHint: '' }] })}
                className="text-xs px-2 py-1 border border-surface-300 rounded hover:border-indigo-400 text-surface-600"
              >
                + Add NPC
              </button>
            </div>
            {level.npcs.map((npc, ni) => (
              <div key={ni} className="p-3 border border-surface-200 rounded-lg mb-2 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={npc.name}
                    onChange={e => { const n = [...level.npcs]; n[ni] = { ...npc, name: e.target.value }; patch({ npcs: n }); }}
                    placeholder="NPC name"
                    className="flex-1 border border-surface-300 rounded px-2 py-1.5 text-sm"
                  />
                  <SuggestButton
                    step="npc-names"
                    context={{ ...suggestCtx, role: npc.role }}
                    onSelect={name => { const n = [...level.npcs]; n[ni] = { ...npc, name }; patch({ npcs: n }); }}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ npcs: level.npcs.filter((_, j) => j !== ni) })}
                    className="text-red-400 hover:text-red-600 text-xs px-1"
                  >✕</button>
                </div>
                <select
                  value={npc.role}
                  onChange={e => { const n = [...level.npcs]; n[ni] = { ...npc, role: e.target.value }; patch({ npcs: n }); }}
                  className="w-full border border-surface-300 rounded px-2 py-1.5 text-xs"
                >
                  {NPC_ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
                <input
                  value={npc.dialogueHint}
                  onChange={e => { const n = [...level.npcs]; n[ni] = { ...npc, dialogueHint: e.target.value }; patch({ npcs: n }); }}
                  placeholder="Dialogue hint (what should this NPC say?)"
                  className="w-full border border-surface-300 rounded px-2 py-1.5 text-xs"
                />
              </div>
            ))}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-surface-600">Items ({level.items.length})</label>
              <button
                type="button"
                onClick={() => patch({ items: [...level.items, { slug: '', name: '', type: 'key', rarity: 'common', purpose: '' }] })}
                className="text-xs px-2 py-1 border border-surface-300 rounded hover:border-indigo-400 text-surface-600"
              >
                + Add Item
              </button>
            </div>
            {level.items.map((item, ii) => (
              <div key={ii} className="p-3 border border-surface-200 rounded-lg mb-2 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={item.name}
                    onChange={e => {
                      const it = [...level.items];
                      it[ii] = { ...item, name: e.target.value, slug: slugify(e.target.value) };
                      patch({ items: it });
                    }}
                    placeholder="Item name"
                    className="flex-1 border border-surface-300 rounded px-2 py-1.5 text-sm"
                  />
                  <SuggestButton
                    step="item-names"
                    context={{ ...suggestCtx, type: item.type }}
                    onSelect={name => { const it = [...level.items]; it[ii] = { ...item, name, slug: slugify(name) }; patch({ items: it }); }}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ items: level.items.filter((_, j) => j !== ii) })}
                    className="text-red-400 hover:text-red-600 text-xs px-1"
                  >✕</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select value={item.type} onChange={e => { const it = [...level.items]; it[ii] = { ...item, type: e.target.value }; patch({ items: it }); }} className="border border-surface-300 rounded px-2 py-1.5 text-xs">
                    {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={item.rarity} onChange={e => { const it = [...level.items]; it[ii] = { ...item, rarity: e.target.value }; patch({ items: it }); }} className="border border-surface-300 rounded px-2 py-1.5 text-xs">
                    {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input value={item.purpose} onChange={e => { const it = [...level.items]; it[ii] = { ...item, purpose: e.target.value }; patch({ items: it }); }} placeholder="Purpose" className="border border-surface-300 rounded px-2 py-1.5 text-xs" />
                </div>
              </div>
            ))}
          </div>

          {/* Puzzle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-surface-600">Puzzle</label>
              {level.puzzle ? (
                <button type="button" onClick={() => patch({ puzzle: null })} className="text-xs text-red-400 hover:text-red-600">Remove puzzle</button>
              ) : (
                <button type="button" onClick={() => patch({ puzzle: { type: 'key_hunt', name: '' } })} className="text-xs px-2 py-1 border border-surface-300 rounded hover:border-indigo-400 text-surface-600">+ Add Puzzle</button>
              )}
            </div>
            {level.puzzle && (
              <div className="p-3 border border-surface-200 rounded-lg space-y-2">
                <div className="flex gap-2">
                  <input
                    value={level.puzzle.name}
                    onChange={e => patch({ puzzle: level.puzzle ? { ...level.puzzle, name: e.target.value } : null })}
                    placeholder="Puzzle name"
                    className="flex-1 border border-surface-300 rounded px-2 py-1.5 text-sm"
                  />
                  <SuggestButton step="puzzle-flavour" context={{ ...suggestCtx, name: level.puzzle.name, type: level.puzzle.type }} onSelect={name => patch({ puzzle: level.puzzle ? { ...level.puzzle, name } : null })} />
                </div>
                <select
                  value={level.puzzle.type}
                  onChange={e => patch({ puzzle: level.puzzle ? { ...level.puzzle, type: e.target.value } : null })}
                  className="w-full border border-surface-300 rounded px-2 py-1.5 text-sm"
                >
                  {PUZZLE_TYPES.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step: Levels ──────────────────────────────────────────────────────────────

interface LevelsStepProps {
  spec: GuidedAdventureSpec;
  onChange: (s: GuidedAdventureSpec) => void;
  onNext: () => void;
  onBack: () => void;
}

function LevelsStep({ spec, onChange, onNext, onBack }: LevelsStepProps) {
  function updateLevel(index: number, level: GuidedLevelSpec) {
    const levels = [...spec.levels];
    levels[index] = level;
    onChange({ ...spec, levels });
  }

  // Auto-wire nextLevelSlug before proceeding
  function handleNext() {
    const levels = spec.levels.map((l, i) => ({
      ...l,
      nextLevelSlug: i < spec.levels.length - 1 ? (spec.levels[i + 1]?.slug ?? '') : '',
    }));
    onChange({ ...spec, levels });
    onNext();
  }

  const errors: string[] = [];
  spec.levels.forEach((l, i) => {
    if (!l.name.trim()) errors.push(`Level ${i + 1}: name is required`);
    if (!l.slug.trim()) errors.push(`Level ${i + 1}: slug is required`);
    const keyItems = l.items.filter(it => it.type === 'key');
    const hasDoor = !!TEMPLATES.find(t => t.templateId === l.mapTemplateId)?.slots.doorMain;
    if (hasDoor && keyItems.length === 0) errors.push(`Level ${i + 1}: map has a door but no key item — add a key or choose a map without a door`);
    const questGivers = l.npcs.filter(n => n.role === 'quest_giver');
    if (l.questEnabled && questGivers.length === 0) errors.push(`Level ${i + 1}: quest enabled but no quest_giver NPC — add one or disable the quest`);
  });

  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          {errors.map((e, i) => <p key={i} className="text-xs text-amber-700">⚠ {e}</p>)}
        </div>
      )}

      {spec.levels.map((level, i) => (
        <LevelEditor
          key={i}
          level={level}
          levelIndex={i}
          totalLevels={spec.levels.length}
          source={spec.source}
          onChange={l => updateLevel(i, l)}
        />
      ))}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-surface-600 hover:text-surface-900">← Back</button>
        <button
          type="button"
          onClick={handleNext}
          disabled={errors.length > 0}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors"
        >
          Next: Flow Preview →
        </button>
      </div>
    </div>
  );
}

// ── Step: Flow ────────────────────────────────────────────────────────────────

interface FlowStepProps {
  spec: GuidedAdventureSpec;
  onNext: () => void;
  onBack: () => void;
}

function FlowStep({ spec, onNext, onBack }: FlowStepProps) {
  const chain = spec.levels.map((l, i) => {
    const tmpl = TEMPLATES.find(t => t.templateId === l.mapTemplateId);
    const slots = tmpl ? Object.keys(tmpl.slots) : [];
    const npcRoles = l.npcs.map(n => n.role).join(', ') || 'no NPCs';
    const items = l.items.map(it => `${it.name} [${it.type}]`).join(', ') || 'no items';
    const puzzle = l.puzzle ? `Puzzle: ${l.puzzle.name} (${l.puzzle.type})` : 'No puzzle';
    const nextArrow = i < spec.levels.length - 1 ? `→ Level ${i + 2}: ${spec.levels[i + 1]?.name ?? '?'}` : '→ Adventure Complete';
    return { l, slots, npcRoles, items, puzzle, nextArrow };
  });

  const warnings: string[] = [];
  if (spec.levels.length === 1) warnings.push('Single-level adventure — consider adding variety with at least 2-3 levels.');
  if (spec.levels.every(l => l.type === 'standard')) warnings.push('All levels are "standard" type — consider mixing in puzzle, exploration, or boss levels.');
  if (spec.levels.every(l => l.npcs.length === 0)) warnings.push('No NPCs defined in any level — the adventure will feel empty.');

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-600">Review the adventure flow before generating JSON. This is your last chance to go back and adjust.</p>

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          <p className="text-xs font-medium text-amber-700">Suggestions:</p>
          {warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">• {w}</p>)}
        </div>
      )}

      <div className="space-y-3">
        {chain.map(({ l, slots, npcRoles, items, puzzle, nextArrow }, i) => (
          <div key={i} className="border border-surface-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
              <span className="font-semibold text-sm text-indigo-900">Level {l.order}: {l.name}</span>
              <span className="ml-2 text-xs text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-200">{l.type}</span>
            </div>
            <div className="px-4 py-3 text-xs text-surface-600 space-y-1">
              <div><span className="text-surface-500">Map:</span> {TEMPLATES.find(t => t.templateId === l.mapTemplateId)?.name ?? l.mapTemplateId} <span className="text-surface-400">({slots.join(', ')})</span></div>
              <div><span className="text-surface-500">NPCs:</span> {npcRoles}</div>
              <div><span className="text-surface-500">Items:</span> {items}</div>
              <div><span className="text-surface-500">{puzzle}</span></div>
              {l.questEnabled && <div><span className="text-surface-500">Quest:</span> {l.questName}</div>}
            </div>
            <div className="px-4 py-2 bg-surface-50 text-xs text-surface-500 font-mono">{nextArrow}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-surface-600 hover:text-surface-900">← Back: Edit Levels</button>
        <button type="button" onClick={onNext} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          Looks good — Generate JSON →
        </button>
      </div>
    </div>
  );
}

// ── Step: Generate ────────────────────────────────────────────────────────────

interface GenerateStepProps {
  spec: GuidedAdventureSpec;
  jsonText: string;
  setJsonText: (s: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function GenerateStep({ spec, jsonText, setJsonText, onNext, onBack }: GenerateStepProps) {
  const mut = useMutation({
    mutationFn: () => campaignGeneratorApi.guidedGenerate(spec),
    onSuccess: ({ json }) => {
      setJsonText(JSON.stringify(json, null, 2));
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-600">
        The structure is locked. GPT will only write dialogue, descriptions, flavour text, and quest content.
        It cannot change your level order, map templates, NPC roles, or item types.
      </p>

      {mut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {mut.error instanceof Error ? mut.error.message : 'Generation failed'}
        </div>
      )}

      {!jsonText && !mut.isPending && (
        <button
          type="button"
          onClick={() => mut.mutate()}
          className="w-full py-3 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          ✦ Generate Adventure JSON
        </button>
      )}

      {mut.isPending && (
        <div className="text-center py-8 text-surface-500 text-sm">Generating… this may take 15–30 seconds</div>
      )}

      {jsonText && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-emerald-700">✓ JSON generated ({jsonText.length.toLocaleString()} chars)</p>
            <button type="button" onClick={() => mut.mutate()} disabled={mut.isPending} className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50">
              ↺ Regenerate
            </button>
          </div>
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            rows={12}
            className="w-full border border-surface-300 rounded-lg px-3 py-2 text-xs font-mono resize-y"
          />
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-surface-600 hover:text-surface-900">← Back</button>
        <button
          type="button"
          onClick={onNext}
          disabled={!jsonText}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors"
        >
          Next: Validate →
        </button>
      </div>
    </div>
  );
}

// ── Step: Validate ────────────────────────────────────────────────────────────

interface ValidateStepProps {
  jsonText: string;
  setJsonText: (s: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function ValidateStep({ jsonText, setJsonText, onNext, onBack }: ValidateStepProps) {
  const [result, setResult] = useState<ValidationResult | null>(null);

  const mut = useMutation({
    mutationFn: () => {
      const parsed: unknown = JSON.parse(jsonText);
      return adventureApi.validate(parsed);
    },
    onSuccess: (r) => setResult(r),
  });

  const repairMut = useMutation({
    mutationFn: () => {
      const parsed: unknown = JSON.parse(jsonText);
      const errors = result?.errors ?? [];
      return campaignGeneratorApi.repair(parsed, errors, 1);
    },
    onSuccess: ({ json }) => {
      setJsonText(JSON.stringify(json, null, 2));
      setResult(null);
    },
  });

  const canProceed = result?.valid === true;

  return (
    <div className="space-y-4">
      <textarea
        value={jsonText}
        onChange={e => { setJsonText(e.target.value); setResult(null); }}
        rows={8}
        className="w-full border border-surface-300 rounded-lg px-3 py-2 text-xs font-mono resize-y"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="px-4 py-2 bg-surface-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-surface-900 transition-colors"
        >
          {mut.isPending ? 'Validating…' : 'Validate'}
        </button>
        {result && !result.valid && (
          <button
            type="button"
            onClick={() => repairMut.mutate()}
            disabled={repairMut.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-amber-700 transition-colors"
          >
            {repairMut.isPending ? 'Repairing…' : '✦ AI Repair'}
          </button>
        )}
      </div>

      {result && (
        <div className={`rounded-lg p-3 border ${result.valid ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-sm font-medium ${result.valid ? 'text-emerald-700' : 'text-red-700'}`}>
            {result.valid ? '✓ Valid' : `✕ ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`}
          </p>
          {!result.valid && (
            <ul className="mt-2 space-y-1">
              {result.errors.slice(0, 10).map((e, i) => (
                <li key={i} className="text-xs text-red-600"><span className="font-mono text-red-400">{e.path}</span> {e.message}</li>
              ))}
            </ul>
          )}
          {result.gameplay && (
            <p className="text-xs text-emerald-600 mt-2">Gameplay score: {result.gameplay.total}/100</p>
          )}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-surface-600 hover:text-surface-900">← Back</button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors"
        >
          Next: Import →
        </button>
      </div>
    </div>
  );
}

// ── Step: Import ──────────────────────────────────────────────────────────────

interface ImportStepProps {
  jsonText: string;
  onBack: () => void;
  onComplete: () => void;
}

function ImportStep({ jsonText, onBack, onComplete }: ImportStepProps) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [mode, setMode] = useState<'create' | 'update' | 'replace'>('create');

  const mut = useMutation({
    mutationFn: () => {
      const parsed: unknown = JSON.parse(jsonText);
      return adventureApi.import(parsed, mode);
    },
    onSuccess: (r) => setResult(r),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-600">Choose import mode and import your adventure.</p>

      <div className="flex gap-2">
        {(['create', 'update', 'replace'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${mode === m ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-surface-300 text-surface-600 hover:border-indigo-300'}`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {mut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {mut.error instanceof Error ? mut.error.message : 'Import failed'}
        </div>
      )}

      {result?.ok && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-emerald-700">✓ Adventure imported successfully</p>
          {result.name && <p className="text-sm text-emerald-600">{result.name}</p>}
          {result.firstLevelSlug && <p className="text-xs text-emerald-500">First level: {result.firstLevelSlug}</p>}
          <button type="button" onClick={onComplete} className="mt-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
            Done — go back to Quick Generate
          </button>
        </div>
      )}

      {!result?.ok && (
        <button
          type="button"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="w-full py-3 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors"
        >
          {mut.isPending ? 'Importing…' : `Import (${mode})`}
        </button>
      )}

      {!result?.ok && (
        <div className="flex justify-between pt-2">
          <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-surface-600 hover:text-surface-900">← Back</button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface GuidedAdventureBuilderProps {
  onComplete: () => void;
}

export default function GuidedAdventureBuilder({ onComplete }: GuidedAdventureBuilderProps) {
  const [step, setStep] = useState<WizardStep>('source');
  const [spec, setSpec] = useState<GuidedAdventureSpec>(makeDefaultSpec);
  const [jsonText, setJsonText] = useState('');

  const handleReset = useCallback(() => {
    if (window.confirm('Reset all guided builder data and start over?')) {
      setSpec(makeDefaultSpec());
      setJsonText('');
      setStep('source');
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-surface-900">Guided Adventure Builder</h3>
          <p className="text-xs text-surface-500 mt-0.5">
            You design the structure. AI writes the content. Every decision is yours to approve.
          </p>
        </div>
        <button type="button" onClick={handleReset} className="text-xs text-surface-400 hover:text-red-500 transition-colors">
          ✕ Start over
        </button>
      </div>

      <WizardStepBar current={step} />

      {step === 'source' && (
        <SourceStep
          source={spec.source}
          onChange={source => setSpec(s => ({ ...s, source }))}
          onNext={() => setStep('identity')}
        />
      )}

      {step === 'identity' && (
        <IdentityStep
          spec={spec}
          onChange={setSpec}
          onNext={() => setStep('levels')}
          onBack={() => setStep('source')}
        />
      )}

      {step === 'levels' && (
        <LevelsStep
          spec={spec}
          onChange={setSpec}
          onNext={() => setStep('flow')}
          onBack={() => setStep('identity')}
        />
      )}

      {step === 'flow' && (
        <FlowStep
          spec={spec}
          onNext={() => setStep('generate')}
          onBack={() => setStep('levels')}
        />
      )}

      {step === 'generate' && (
        <GenerateStep
          spec={spec}
          jsonText={jsonText}
          setJsonText={setJsonText}
          onNext={() => setStep('validate')}
          onBack={() => setStep('flow')}
        />
      )}

      {step === 'validate' && (
        <ValidateStep
          jsonText={jsonText}
          setJsonText={setJsonText}
          onNext={() => setStep('import')}
          onBack={() => setStep('generate')}
        />
      )}

      {step === 'import' && (
        <ImportStep
          jsonText={jsonText}
          onBack={() => setStep('validate')}
          onComplete={onComplete}
        />
      )}
    </div>
  );
}

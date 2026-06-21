import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgEditorApi } from '../../api/bandRpgEditor';
import type { EditorLevel, EditorDoor, EditorSwitch, EditorPuzzle, DoorType, SwitchType } from '../../api/bandRpgEditor';

const inputCls = 'border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full';
const labelCls = 'block text-xs font-medium text-surface-700 mb-1';

const DOOR_TYPES: DoorType[] = ['key_door', 'quest_door', 'story_door', 'switch_door', 'free'];
const SWITCH_TYPES: SwitchType[] = ['switch', 'lever', 'button', 'pressure_plate'];
const PUZZLE_TRIGGERS = ['item_collected', 'quest_complete', 'quest_start', 'story_beat_seen', 'switch_activated', 'npc_talked', 'level_enter', 'always'];
const PUZZLE_ACTIONS = ['open_door', 'close_door', 'trigger_beat', 'reveal_exit', 'set_world_state', 'grant_item'];
const CONDITION_TYPES = ['always', 'never', 'item_owned', 'quest_active', 'quest_complete', 'story_beat_seen', 'switch_activated', 'door_open', 'world_state'];

// ── Empty forms ───────────────────────────────────────────────────────────────

const emptyDoor = (): Partial<EditorDoor> => ({
  name: '', tileX: 0, tileY: 0, type: 'key_door',
  lockCondition: { type: 'always' }, openedByDefault: false, label: '',
});

const emptySwitch = (): Partial<EditorSwitch> => ({
  name: '', tileX: 0, tileY: 0, type: 'switch',
  effect: { type: 'open_door', targetId: '' }, label: '',
});

const emptyPuzzle = (): Partial<EditorPuzzle> => ({
  name: '', order: 0,
  trigger: { on: 'quest_complete', targetId: '' },
  condition: { type: 'always' },
  action: { type: 'open_door', targetId: '' },
});

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorldEditor() {
  const qc = useQueryClient();
  const [levelId, setLevelId] = useState('');
  const [activeTab, setActiveTab] = useState<'doors' | 'switches' | 'puzzles'>('doors');

  const { data: levels = [] } = useQuery({
    queryKey: ['editor-levels'],
    queryFn: () => bandRpgEditorApi.listLevels(),
    staleTime: 60_000,
  });

  const selectedLevel = levels.find(l => l.id === levelId) as EditorLevel | undefined;

  return (
    <div className="space-y-4">
      {/* Level selector */}
      <div className="bg-white rounded-xl border border-surface-200 p-4">
        <label className={labelCls}>Level</label>
        <select className={inputCls} value={levelId} onChange={e => setLevelId(e.target.value)}>
          <option value="">— select a level —</option>
          {levels.map(l => (
            <option key={l.id} value={l.id}>{l.name} <span className="text-surface-400">/{l.slug}</span></option>
          ))}
        </select>
      </div>

      {selectedLevel && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-surface-200">
            {(['doors', 'switches', 'puzzles'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize rounded-t-lg ${activeTab === tab ? 'bg-white border border-b-white border-surface-200 text-indigo-600' : 'text-surface-500 hover:text-surface-700'}`}
              >
                {tab === 'doors' ? '🔒 Doors' : tab === 'switches' ? '🔘 Switches' : '🧩 Puzzles'}
              </button>
            ))}
          </div>

          {activeTab === 'doors' && <DoorsSection levelId={selectedLevel.id} qc={qc} />}
          {activeTab === 'switches' && <SwitchesSection levelId={selectedLevel.id} qc={qc} />}
          {activeTab === 'puzzles' && <PuzzlesSection levelId={selectedLevel.id} qc={qc} />}
        </>
      )}
    </div>
  );
}

// ── Doors ─────────────────────────────────────────────────────────────────────

function DoorsSection({ levelId, qc }: { levelId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [form, setForm] = useState<Partial<EditorDoor>>(emptyDoor());
  const [editId, setEditId] = useState<string | null>(null);

  const { data: doors = [] } = useQuery({
    queryKey: ['editor-doors', levelId],
    queryFn: () => bandRpgEditorApi.listDoors(levelId),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['editor-doors', levelId] });

  const save = useMutation({
    mutationFn: () => editId
      ? bandRpgEditorApi.updateDoor(levelId, editId, form)
      : bandRpgEditorApi.createDoor(levelId, form),
    onSuccess: () => { invalidate(); setForm(emptyDoor()); setEditId(null); },
  });

  const del = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteDoor(levelId, id),
    onSuccess: invalidate,
  });

  const edit = (d: EditorDoor) => {
    setEditId(d.id);
    setForm({ name: d.name, tileX: d.tileX, tileY: d.tileY, type: d.type, lockCondition: d.lockCondition, openedByDefault: d.openedByDefault, label: d.label ?? '' });
  };

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-4">
      <h3 className="font-semibold text-surface-900">Doors — {doors.length} defined</h3>

      {/* List */}
      {doors.map(d => (
        <div key={d.id} className="flex items-center justify-between p-2 border border-surface-100 rounded-lg text-sm">
          <span>
            <span className="font-medium">{d.name}</span>
            <span className="text-surface-400 ml-2">({d.tileX},{d.tileY})</span>
            <span className="ml-2 text-xs text-indigo-500 uppercase">{d.type}</span>
            {d.openedByDefault && <span className="ml-2 text-xs text-emerald-500">open by default</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => edit(d)} className="text-xs text-indigo-600 hover:underline">Edit</button>
            <button onClick={() => del.mutate(d.id)} className="text-xs text-red-500 hover:underline">Del</button>
          </div>
        </div>
      ))}

      {/* Form */}
      <div className="border border-indigo-100 bg-indigo-50 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-indigo-700">{editId ? 'Edit Door' : 'New Door'}</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select className={inputCls} value={form.type ?? 'key_door'} onChange={e => setForm(f => ({ ...f, type: e.target.value as DoorType }))}>
              {DOOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tile X</label>
            <input type="number" className={inputCls} value={form.tileX ?? 0} onChange={e => setForm(f => ({ ...f, tileX: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelCls}>Tile Y</label>
            <input type="number" className={inputCls} value={form.tileY ?? 0} onChange={e => setForm(f => ({ ...f, tileY: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelCls}>Label (display name)</label>
            <input className={inputCls} value={form.label ?? ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" id="openDefault" checked={form.openedByDefault ?? false} onChange={e => setForm(f => ({ ...f, openedByDefault: e.target.checked }))} />
            <label htmlFor="openDefault" className="text-sm text-surface-700">Open by default</label>
          </div>
        </div>
        <ConditionEditor
          label="Lock Condition (what's needed to open)"
          value={form.lockCondition ?? {}}
          onChange={v => setForm(f => ({ ...f, lockCondition: v }))}
        />
        <div className="flex gap-2 pt-1">
          <button onClick={() => save.mutate()} disabled={!form.name} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50">
            {editId ? 'Update' : 'Create'}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm(emptyDoor()); }} className="px-4 py-2 border border-surface-300 text-sm rounded-lg">Cancel</button>}
        </div>
      </div>
    </div>
  );
}

// ── Switches ──────────────────────────────────────────────────────────────────

function SwitchesSection({ levelId, qc }: { levelId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [form, setForm] = useState<Partial<EditorSwitch>>(emptySwitch());
  const [editId, setEditId] = useState<string | null>(null);

  const { data: switches = [] } = useQuery({
    queryKey: ['editor-switches', levelId],
    queryFn: () => bandRpgEditorApi.listSwitches(levelId),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['editor-switches', levelId] });

  const save = useMutation({
    mutationFn: () => editId
      ? bandRpgEditorApi.updateSwitch(levelId, editId, form)
      : bandRpgEditorApi.createSwitch(levelId, form),
    onSuccess: () => { invalidate(); setForm(emptySwitch()); setEditId(null); },
  });

  const del = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteSwitch(levelId, id),
    onSuccess: invalidate,
  });

  const edit = (s: EditorSwitch) => {
    setEditId(s.id);
    setForm({ name: s.name, tileX: s.tileX, tileY: s.tileY, type: s.type, effect: s.effect, label: s.label ?? '' });
  };

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-4">
      <h3 className="font-semibold text-surface-900">Switches — {switches.length} defined</h3>

      {switches.map(s => (
        <div key={s.id} className="flex items-center justify-between p-2 border border-surface-100 rounded-lg text-sm">
          <span>
            <span className="font-medium">{s.name}</span>
            <span className="text-surface-400 ml-2">({s.tileX},{s.tileY})</span>
            <span className="ml-2 text-xs text-amber-600 uppercase">{s.type}</span>
          </span>
          <div className="flex gap-2">
            <button onClick={() => edit(s)} className="text-xs text-indigo-600 hover:underline">Edit</button>
            <button onClick={() => del.mutate(s.id)} className="text-xs text-red-500 hover:underline">Del</button>
          </div>
        </div>
      ))}

      <div className="border border-indigo-100 bg-indigo-50 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-indigo-700">{editId ? 'Edit Switch' : 'New Switch'}</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select className={inputCls} value={form.type ?? 'switch'} onChange={e => setForm(f => ({ ...f, type: e.target.value as SwitchType }))}>
              {SWITCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tile X</label>
            <input type="number" className={inputCls} value={form.tileX ?? 0} onChange={e => setForm(f => ({ ...f, tileX: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelCls}>Tile Y</label>
            <input type="number" className={inputCls} value={form.tileY ?? 0} onChange={e => setForm(f => ({ ...f, tileY: Number(e.target.value) }))} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Label (display name)</label>
            <input className={inputCls} value={form.label ?? ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          </div>
        </div>
        <ActionEditor
          label="Effect (what happens when activated)"
          value={form.effect ?? {}}
          onChange={v => setForm(f => ({ ...f, effect: v }))}
        />
        <div className="flex gap-2 pt-1">
          <button onClick={() => save.mutate()} disabled={!form.name} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50">
            {editId ? 'Update' : 'Create'}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm(emptySwitch()); }} className="px-4 py-2 border border-surface-300 text-sm rounded-lg">Cancel</button>}
        </div>
      </div>
    </div>
  );
}

// ── Puzzles ───────────────────────────────────────────────────────────────────

function PuzzlesSection({ levelId, qc }: { levelId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [form, setForm] = useState<Partial<EditorPuzzle>>(emptyPuzzle());
  const [editId, setEditId] = useState<string | null>(null);

  const { data: puzzles = [] } = useQuery({
    queryKey: ['editor-puzzles', levelId],
    queryFn: () => bandRpgEditorApi.listPuzzles(levelId),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['editor-puzzles', levelId] });

  const save = useMutation({
    mutationFn: () => editId
      ? bandRpgEditorApi.updatePuzzle(levelId, editId, form)
      : bandRpgEditorApi.createPuzzle(levelId, form),
    onSuccess: () => { invalidate(); setForm(emptyPuzzle()); setEditId(null); },
  });

  const del = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deletePuzzle(levelId, id),
    onSuccess: invalidate,
  });

  const edit = (p: EditorPuzzle) => {
    setEditId(p.id);
    setForm({ name: p.name, order: p.order, trigger: p.trigger, condition: p.condition, action: p.action });
  };

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-4">
      <h3 className="font-semibold text-surface-900">Puzzles — {puzzles.length} rules</h3>
      <p className="text-xs text-surface-500">Each puzzle rule: when TRIGGER fires and CONDITION is met → apply ACTION.</p>

      {puzzles.map(p => (
        <div key={p.id} className="p-3 border border-surface-100 rounded-lg text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">{p.name}</span>
            <div className="flex gap-2">
              <button onClick={() => edit(p)} className="text-xs text-indigo-600 hover:underline">Edit</button>
              <button onClick={() => del.mutate(p.id)} className="text-xs text-red-500 hover:underline">Del</button>
            </div>
          </div>
          <div className="text-xs text-surface-400 font-mono">
            WHEN {(p.trigger as Record<string,string>)['on']} {(p.trigger as Record<string,string>)['targetId'] ? `(${(p.trigger as Record<string,string>)['targetId']})` : ''}
            {' → '}
            {(p.action as Record<string,string>)['type']} {(p.action as Record<string,string>)['targetId'] ? `(${(p.action as Record<string,string>)['targetId']})` : ''}
          </div>
        </div>
      ))}

      <div className="border border-indigo-100 bg-indigo-50 rounded-lg p-4 space-y-4">
        <h4 className="text-sm font-semibold text-indigo-700">{editId ? 'Edit Rule' : 'New Puzzle Rule'}</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Rule Name *</label>
            <input className={inputCls} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Switch A opens Door B" />
          </div>
          <div>
            <label className={labelCls}>Order</label>
            <input type="number" className={inputCls} value={form.order ?? 0} onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} />
          </div>
        </div>

        {/* Trigger */}
        <div className="border border-surface-200 rounded-lg p-3 space-y-2 bg-white">
          <div className="text-xs font-semibold text-surface-600 uppercase tracking-wide">Trigger — what fires this rule</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Event</label>
              <select className={inputCls}
                value={(form.trigger as Record<string,string> | undefined)?.['on'] ?? 'quest_complete'}
                onChange={e => setForm(f => ({ ...f, trigger: { ...(f.trigger as Record<string,unknown>), on: e.target.value } }))}
              >
                {PUZZLE_TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Target ID</label>
              <input className={inputCls}
                placeholder="quest ID / item ID / switch ID…"
                value={(form.trigger as Record<string,string> | undefined)?.['targetId'] ?? ''}
                onChange={e => setForm(f => ({ ...f, trigger: { ...(f.trigger as Record<string,unknown>), targetId: e.target.value } }))}
              />
            </div>
          </div>
        </div>

        {/* Condition (optional gate) */}
        <ConditionEditor
          label="Condition (optional extra gate — leave 'always' for none)"
          value={form.condition ?? {}}
          onChange={v => setForm(f => ({ ...f, condition: v }))}
        />

        {/* Action */}
        <ActionEditor
          label="Action — what happens when the rule fires"
          value={form.action ?? {}}
          onChange={v => setForm(f => ({ ...f, action: v }))}
        />

        <div className="flex gap-2 pt-1">
          <button onClick={() => save.mutate()} disabled={!form.name} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50">
            {editId ? 'Update' : 'Create'}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm(emptyPuzzle()); }} className="px-4 py-2 border border-surface-300 text-sm rounded-lg">Cancel</button>}
        </div>
      </div>
    </div>
  );
}

// ── Sub-form: Condition editor ────────────────────────────────────────────────

function ConditionEditor({ label, value, onChange }: {
  label: string;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const type = (value['type'] as string) ?? 'always';
  return (
    <div className="border border-surface-200 rounded-lg p-3 space-y-2 bg-white">
      <div className="text-xs font-semibold text-surface-600 uppercase tracking-wide">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Condition Type</label>
          <select className={inputCls} value={type} onChange={e => onChange({ ...value, type: e.target.value })}>
            {CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {!['always', 'never'].includes(type) && (
          <div>
            <label className={labelCls}>Target ID</label>
            <input className={inputCls}
              placeholder="quest ID / item ID / switch ID…"
              value={(value['targetId'] as string) ?? ''}
              onChange={e => onChange({ ...value, targetId: e.target.value })}
            />
          </div>
        )}
        {type === 'world_state' && (
          <>
            <div>
              <label className={labelCls}>Key</label>
              <input className={inputCls} value={(value['key'] as string) ?? ''} onChange={e => onChange({ ...value, key: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Expected Value</label>
              <input className={inputCls} value={String(value['value'] ?? '')} onChange={e => onChange({ ...value, value: e.target.value })} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-form: Action editor ───────────────────────────────────────────────────

function ActionEditor({ label, value, onChange }: {
  label: string;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const type = (value['type'] as string) ?? 'open_door';
  return (
    <div className="border border-surface-200 rounded-lg p-3 space-y-2 bg-white">
      <div className="text-xs font-semibold text-surface-600 uppercase tracking-wide">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Action Type</label>
          <select className={inputCls} value={type} onChange={e => onChange({ ...value, type: e.target.value })}>
            {PUZZLE_ACTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {!['set_world_state'].includes(type) && (
          <div>
            <label className={labelCls}>Target ID</label>
            <input className={inputCls}
              placeholder="door ID / beat ID / level slug / item ID…"
              value={(value['targetId'] as string) ?? ''}
              onChange={e => onChange({ ...value, targetId: e.target.value })}
            />
          </div>
        )}
        {type === 'set_world_state' && (
          <>
            <div>
              <label className={labelCls}>Key</label>
              <input className={inputCls} value={(value['key'] as string) ?? ''} onChange={e => onChange({ ...value, key: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Value</label>
              <input className={inputCls} value={String(value['value'] ?? '')} onChange={e => onChange({ ...value, value: e.target.value })} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

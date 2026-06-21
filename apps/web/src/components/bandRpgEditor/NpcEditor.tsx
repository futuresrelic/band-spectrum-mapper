import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgEditorApi, type EditorNpc, type DialogueLine } from '../../api/bandRpgEditor';

const NPC_ROLES = ['quest_giver', 'merchant', 'band_member', 'ambient'];

interface NpcFormProps {
  levelId: string;
  initial?: EditorNpc | null;
  onSaved: () => void;
  onCancel: () => void;
}

function NpcForm({ levelId, initial, onSaved, onCancel }: NpcFormProps) {
  const qc = useQueryClient();
  const [name, setName]           = useState(initial?.name ?? '');
  const [role, setRole]           = useState(initial?.role ?? 'ambient');
  const [faction, setFaction]     = useState(initial?.faction ?? '');
  const [portraitUrl, setPortrait] = useState(initial?.portraitUrl ?? '');
  const [posX, setPosX]           = useState(initial?.positionX ?? 0);
  const [posY, setPosY]           = useState(initial?.positionY ?? 0);
  const [dialogue, setDialogue]   = useState<DialogueLine[]>(
    Array.isArray(initial?.defaultDialogue) ? initial.defaultDialogue : []
  );

  const mutation = useMutation({
    mutationFn: () => {
      const data: Partial<EditorNpc> = {
        name: name.trim(),
        ...(role ? { role } : {}),
        ...(faction.trim() ? { faction: faction.trim() } : {}),
        ...(portraitUrl.trim() ? { portraitUrl: portraitUrl.trim() } : {}),
        positionX: posX, positionY: posY,
        defaultDialogue: dialogue,
      };
      return initial
        ? bandRpgEditorApi.updateNpc(levelId, initial.id, data)
        : bandRpgEditorApi.createNpc(levelId, data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['editor-npcs-all'] });
      onSaved();
    },
  });

  const addLine = () => setDialogue(prev => [...prev, { text: '', speakerName: '' }]);
  const removeLine = (i: number) => setDialogue(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof DialogueLine, val: string) =>
    setDialogue(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));

  const inputCls = 'border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full';
  const lbl = 'block text-xs font-medium text-surface-700 mb-1';

  return (
    <div className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Maynard" />
        </div>
        <div>
          <label className={lbl}>Role</label>
          <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
            {NPC_ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Faction (optional)</label>
          <input className={inputCls} value={faction} onChange={e => setFaction(e.target.value)} placeholder="Tool Collective" />
        </div>
        <div>
          <label className={lbl}>Portrait URL (optional)</label>
          <input className={inputCls} value={portraitUrl} onChange={e => setPortrait(e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Position X (map tile)</label>
          <input type="number" className={inputCls} value={posX} onChange={e => setPosX(Number(e.target.value))} />
        </div>
        <div>
          <label className={lbl}>Position Y (map tile)</label>
          <input type="number" className={inputCls} value={posY} onChange={e => setPosY(Number(e.target.value))} />
        </div>
      </div>

      {/* Dialogue Builder */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={lbl}>Dialogue Lines</label>
          <button onClick={addLine} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ Add Line</button>
        </div>
        {dialogue.length === 0 && (
          <p className="text-xs text-surface-400 italic mb-2">No dialogue lines yet.</p>
        )}
        {dialogue.map((line, i) => (
          <div key={i} className="rounded-lg border border-surface-200 bg-white p-3 mb-2 space-y-2">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-xs font-medium text-surface-600">Line {i + 1}</span>
              <button onClick={() => removeLine(i)} className="text-xs text-red-400 hover:text-red-600">✕</button>
            </div>
            <input
              className={inputCls}
              placeholder="Speaker name (optional)"
              value={line.speakerName ?? ''}
              onChange={e => updateLine(i, 'speakerName', e.target.value)}
            />
            <textarea
              className={inputCls}
              rows={2}
              placeholder="Dialogue text…"
              value={line.text}
              onChange={e => updateLine(i, 'text', e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={!name.trim() || mutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          {mutation.isPending ? 'Saving…' : initial ? 'Update NPC' : 'Create NPC'}
        </button>
        <button onClick={onCancel} className="text-sm text-surface-500 hover:text-surface-700">Cancel</button>
      </div>
    </div>
  );
}

export default function NpcEditor() {
  const qc = useQueryClient();

  const { data: levels = [] } = useQuery({
    queryKey: ['editor-levels'],
    queryFn: () => bandRpgEditorApi.listLevels(),
    staleTime: 60_000,
  });

  const [levelFilter, setLevelFilter] = useState('');
  const [editingNpc, setEditingNpc]   = useState<EditorNpc | null>(null);
  const [creating, setCreating]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const activeLevelId = levelFilter || (levels[0]?.id ?? '');

  const { data: npcs = [], isLoading } = useQuery({
    queryKey: ['editor-npcs-all', activeLevelId],
    queryFn: () => activeLevelId ? bandRpgEditorApi.listNpcs(activeLevelId) : Promise.resolve([]),
    enabled: !!activeLevelId,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ levelId, npcId }: { levelId: string; npcId: string }) =>
      bandRpgEditorApi.deleteNpc(levelId, npcId),
    onSuccess: () => { setConfirmDelete(null); void qc.invalidateQueries({ queryKey: ['editor-npcs-all'] }); },
  });

  if (!activeLevelId) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface-50 p-10 text-center">
        <p className="text-surface-400 text-sm">Create a level first to add NPCs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <select
            className="border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 min-w-48"
            value={levelFilter}
            onChange={e => { setLevelFilter(e.target.value); setCreating(false); setEditingNpc(null); }}
          >
            {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setCreating(true); setEditingNpc(null); }}
          className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New NPC
        </button>
      </div>

      {(creating || editingNpc) && (
        <NpcForm
          levelId={activeLevelId}
          initial={editingNpc}
          onSaved={() => { setCreating(false); setEditingNpc(null); }}
          onCancel={() => { setCreating(false); setEditingNpc(null); }}
        />
      )}

      {isLoading && <p className="text-sm text-surface-400 py-4">Loading NPCs…</p>}

      {!isLoading && npcs.length === 0 && !creating && (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-8 text-center">
          <p className="text-2xl mb-2">🎭</p>
          <p className="text-surface-400 text-sm">No NPCs in this level yet.</p>
        </div>
      )}

      {npcs.map(npc => (
        <div key={npc.id} className="rounded-xl border border-surface-200 bg-white p-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-semibold text-sm shrink-0">
            {npc.name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-surface-900 text-sm">{npc.name}</span>
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                {(npc.role ?? 'ambient').replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-surface-400 mt-0.5">
              ({npc.positionX}, {npc.positionY})
              {npc.faction ? ` · ${npc.faction}` : ''}
              {' · '}{Array.isArray(npc.defaultDialogue) ? npc.defaultDialogue.length : 0} dialogue lines
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingNpc(npc); setCreating(false); }}
              className="bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium px-3 py-1.5 rounded-lg"
            >
              Edit
            </button>
            {confirmDelete === npc.id ? (
              <div className="flex gap-1 items-center">
                <button
                  onClick={() => deleteMutation.mutate({ levelId: activeLevelId, npcId: npc.id })}
                  disabled={deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                >
                  {deleteMutation.isPending ? '…' : 'Delete'}
                </button>
                <button onClick={() => setConfirmDelete(null)} className="text-xs text-surface-500 px-1">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(npc.id)} className="text-red-400 hover:text-red-600 text-xs px-2">Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

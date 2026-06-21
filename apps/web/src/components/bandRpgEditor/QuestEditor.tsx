import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgEditorApi, type EditorQuest } from '../../api/bandRpgEditor';

function safeJsonStr(val: unknown): string {
  try { return JSON.stringify(val, null, 2); } catch { return '[]'; }
}

function parseJsonField(str: string): unknown {
  try { return JSON.parse(str); } catch { return null; }
}

interface QuestFormProps {
  initial?: EditorQuest | null;
  onSaved: () => void;
  onCancel: () => void;
}

function QuestForm({ initial, onSaved, onCancel }: QuestFormProps) {
  const qc = useQueryClient();
  const [slug, setSlug]                   = useState(initial?.slug ?? '');
  const [name, setName]                   = useState(initial?.name ?? '');
  const [description, setDesc]            = useState(initial?.description ?? '');
  const [giverId, setGiverId]             = useState(initial?.giverId ?? '');
  const [objectiveIds, setObjectiveIds]   = useState(safeJsonStr(initial?.objectiveIds ?? []));
  const [reward, setReward]               = useState(safeJsonStr(initial?.reward ?? {}));
  const [unlocksQuestId, setUnlocksQuest] = useState(initial?.unlocksQuestId ?? '');
  const [unlocksLevelId, setUnlocksLevel] = useState(initial?.unlocksLevelId ?? '');
  const [isOptional, setOptional]         = useState(initial?.isOptional ?? false);
  const [order, setOrder]                 = useState(initial?.order ?? 0);
  const [jsonError, setJsonError]         = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const parsedIds = parseJsonField(objectiveIds);
      const parsedReward = parseJsonField(reward);
      if (!parsedIds || !parsedReward) { setJsonError('Invalid JSON in Objective IDs or Reward.'); throw new Error('bad json'); }
      setJsonError('');
      const data: Partial<EditorQuest> = {
        slug: slug.trim(), name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(giverId.trim() ? { giverId: giverId.trim() } : {}),
        objectiveIds: parsedIds as string[],
        reward: parsedReward as Record<string, unknown>,
        ...(unlocksQuestId.trim() ? { unlocksQuestId: unlocksQuestId.trim() } : {}),
        ...(unlocksLevelId.trim() ? { unlocksLevelId: unlocksLevelId.trim() } : {}),
        isOptional, order,
      };
      return initial
        ? bandRpgEditorApi.updateQuest(initial.id, data)
        : bandRpgEditorApi.createQuest(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['editor-quests'] }); onSaved(); },
  });

  const inputCls = 'border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full';
  const labelCls = 'block text-xs font-medium text-surface-700 mb-1';
  const monoInputCls = `${inputCls} font-mono text-xs`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Slug <span className="text-red-500">*</span></label>
          <input className={inputCls} value={slug} onChange={e => setSlug(e.target.value)} placeholder="main-quest" />
        </div>
        <div>
          <label className={labelCls}>Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="The Main Quest" />
        </div>
      </div>
      <div>
        <label className={labelCls}>Description</label>
        <textarea className={inputCls} rows={2} value={description} onChange={e => setDesc(e.target.value)} placeholder="What is this quest about?" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Quest Giver NPC ID (optional)</label>
          <input className={inputCls} value={giverId} onChange={e => setGiverId(e.target.value)} placeholder="npc-id" />
        </div>
        <div>
          <label className={labelCls}>Order</label>
          <input type="number" className={inputCls} value={order} onChange={e => setOrder(Number(e.target.value))} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Objective IDs (JSON array)</label>
        <textarea className={monoInputCls} rows={3} value={objectiveIds} onChange={e => setObjectiveIds(e.target.value)} placeholder='["objective-id-1", "objective-id-2"]' />
      </div>
      <div>
        <label className={labelCls}>Reward (JSON)</label>
        <textarea className={monoInputCls} rows={3} value={reward} onChange={e => setReward(e.target.value)} placeholder='{ "xp": 100, "items": [] }' />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Unlocks Quest ID (optional)</label>
          <input className={inputCls} value={unlocksQuestId} onChange={e => setUnlocksQuest(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Unlocks Level ID (optional)</label>
          <input className={inputCls} value={unlocksLevelId} onChange={e => setUnlocksLevel(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="opt-q" checked={isOptional} onChange={e => setOptional(e.target.checked)} className="rounded" />
        <label htmlFor="opt-q" className="text-sm text-surface-700">Optional quest</label>
      </div>
      {jsonError && <p className="text-sm text-red-600">{jsonError}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={!slug.trim() || !name.trim() || mutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          {mutation.isPending ? 'Saving…' : initial ? 'Update Quest' : 'Create Quest'}
        </button>
        <button onClick={onCancel} className="text-sm text-surface-500 hover:text-surface-700 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

export default function QuestEditor() {
  const qc = useQueryClient();
  const { data: quests = [], isLoading } = useQuery({
    queryKey: ['editor-quests'],
    queryFn: () => bandRpgEditorApi.listQuests(),
    staleTime: 30_000,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteQuest(id),
    onSuccess: () => { setConfirmDelete(null); void qc.invalidateQueries({ queryKey: ['editor-quests'] }); },
  });

  const editingQuest = quests.find(q => q.id === editingId) ?? null;

  if (isLoading) return <p className="text-sm text-surface-400 py-6 text-center">Loading quests…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">{quests.length} quest{quests.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setCreating(true); setEditingId(null); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New Quest
        </button>
      </div>

      {(creating || editingId) && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <h3 className="font-semibold text-surface-900 mb-4">{editingId ? 'Edit Quest' : 'New Quest'}</h3>
          <QuestForm
            initial={editingQuest}
            onSaved={() => { setCreating(false); setEditingId(null); }}
            onCancel={() => { setCreating(false); setEditingId(null); }}
          />
        </div>
      )}

      {quests.length === 0 && !creating && (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-10 text-center">
          <p className="text-2xl mb-2">📜</p>
          <p className="text-surface-500 text-sm">No quests yet.</p>
        </div>
      )}

      {quests.map(q => (
        <div key={q.id} className="rounded-xl border border-surface-200 bg-white p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-surface-900 text-sm">{q.name}</span>
              {q.isOptional && <span className="px-1.5 py-0.5 bg-surface-100 text-surface-500 text-xs rounded">optional</span>}
            </div>
            <p className="text-xs text-surface-400 mt-0.5">
              /{q.slug} · order {q.order} · {Array.isArray(q.objectiveIds) ? q.objectiveIds.length : 0} objectives
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setEditingId(q.id); setCreating(false); }}
              className="bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium px-3 py-1.5 rounded-lg"
            >
              Edit
            </button>
            {confirmDelete === q.id ? (
              <div className="flex gap-1 items-center">
                <button
                  onClick={() => deleteMutation.mutate(q.id)}
                  disabled={deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                >
                  {deleteMutation.isPending ? '…' : 'Delete'}
                </button>
                <button onClick={() => setConfirmDelete(null)} className="text-xs text-surface-500 px-1">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(q.id)} className="text-red-500 hover:text-red-700 text-xs px-2">Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgEditorApi, type EditorTimelineEvent } from '../../api/bandRpgEditor';

const EVENT_TYPES = ['level', 'quest', 'story', 'boss', 'unlock', 'custom'];

const TYPE_COLORS: Record<string, string> = {
  level:   'bg-indigo-100 text-indigo-700',
  quest:   'bg-amber-100 text-amber-700',
  story:   'bg-purple-100 text-purple-700',
  boss:    'bg-red-100 text-red-700',
  unlock:  'bg-emerald-100 text-emerald-700',
  custom:  'bg-surface-100 text-surface-600',
};

interface EventFormProps {
  initial?: EditorTimelineEvent | null;
  onSaved: () => void;
  onCancel: () => void;
}

function EventForm({ initial, onSaved, onCancel }: EventFormProps) {
  const qc = useQueryClient();
  const [title, setTitle]         = useState(initial?.title ?? '');
  const [type, setType]           = useState(initial?.type ?? 'level');
  const [refId, setRefId]         = useState(initial?.refId ?? '');
  const [isRequired, setRequired] = useState(initial?.isRequired ?? true);

  const mutation = useMutation({
    mutationFn: () => {
      const data: Partial<EditorTimelineEvent> = {
        title: title.trim(), type, isRequired,
        ...(refId.trim() ? { refId: refId.trim() } : {}),
      };
      return initial
        ? bandRpgEditorApi.updateTimelineEvent(initial.id, data)
        : bandRpgEditorApi.createTimelineEvent(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['editor-timeline'] }); onSaved(); },
  });

  const inputCls = 'border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full';
  const lbl = 'block text-xs font-medium text-surface-700 mb-1';

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Title <span className="text-red-500">*</span></label>
          <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter the Archive" />
        </div>
        <div>
          <label className={lbl}>Type</label>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value)}>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={lbl}>Ref ID (optional — level/quest/beat ID)</label>
        <input className={inputCls} value={refId} onChange={e => setRefId(e.target.value)} placeholder="cuid or slug" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="req" checked={isRequired} onChange={e => setRequired(e.target.checked)} className="rounded" />
        <label htmlFor="req" className="text-sm text-surface-700">Required (must complete to progress)</label>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={!title.trim() || mutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg"
        >
          {mutation.isPending ? 'Saving…' : initial ? 'Update Event' : 'Add Event'}
        </button>
        <button onClick={onCancel} className="text-xs text-surface-500 hover:text-surface-700">Cancel</button>
      </div>
    </div>
  );
}

export default function TimelineEditor() {
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['editor-timeline'],
    queryFn: () => bandRpgEditorApi.listTimelineEvents(),
    staleTime: 30_000,
  });

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [adding, setAdding]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteTimelineEvent(id),
    onSuccess: () => { setConfirmDelete(null); void qc.invalidateQueries({ queryKey: ['editor-timeline'] }); },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => bandRpgEditorApi.reorderTimeline(ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['editor-timeline'] }),
  });

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const ids = events.map(e => e.id);
    const prev = ids[idx - 1];
    const curr = ids[idx];
    if (!prev || !curr) return;
    ids[idx - 1] = curr;
    ids[idx] = prev;
    reorderMutation.mutate(ids);
  };

  const moveDown = (idx: number) => {
    if (idx === events.length - 1) return;
    const ids = events.map(e => e.id);
    const curr = ids[idx];
    const next = ids[idx + 1];
    if (!curr || !next) return;
    ids[idx] = next;
    ids[idx + 1] = curr;
    reorderMutation.mutate(ids);
  };

  if (isLoading) return <p className="text-sm text-surface-400 py-6 text-center">Loading timeline…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-500">{events.length} event{events.length !== 1 ? 's' : ''} in game timeline</p>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Add Event
        </button>
      </div>

      {adding && (
        <EventForm
          onSaved={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      )}

      {events.length === 0 && !adding && (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-10 text-center">
          <p className="text-2xl mb-2">⏱️</p>
          <p className="text-surface-400 text-sm">No timeline events yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {events.map((evt, idx) => (
          <div key={evt.id}>
            {editingId === evt.id ? (
              <EventForm
                initial={evt}
                onSaved={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="rounded-xl border border-surface-200 bg-white p-3 flex items-center gap-3">
                <span className="text-xs text-surface-400 w-6 text-center font-mono shrink-0">{idx + 1}</span>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => moveUp(idx)} disabled={idx === 0 || reorderMutation.isPending} className="text-xs text-surface-400 hover:text-surface-700 disabled:opacity-20">▲</button>
                  <button onClick={() => moveDown(idx)} disabled={idx === events.length - 1 || reorderMutation.isPending} className="text-xs text-surface-400 hover:text-surface-700 disabled:opacity-20">▼</button>
                </div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded shrink-0 ${TYPE_COLORS[evt.type] ?? TYPE_COLORS['custom']!}`}>
                  {evt.type}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-surface-900">{evt.title}</span>
                  {evt.refId && <span className="ml-2 text-xs text-surface-400 font-mono">{evt.refId.slice(0, 12)}…</span>}
                </div>
                {!evt.isRequired && <span className="text-xs text-surface-400">optional</span>}
                <button onClick={() => setEditingId(evt.id)} className="text-xs text-indigo-600 hover:text-indigo-800 shrink-0">Edit</button>
                {confirmDelete === evt.id ? (
                  <div className="flex gap-1 items-center">
                    <button
                      onClick={() => deleteMutation.mutate(evt.id)}
                      disabled={deleteMutation.isPending}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs px-2 py-1 rounded"
                    >
                      {deleteMutation.isPending ? '…' : 'Delete'}
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="text-xs text-surface-500">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(evt.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">✕</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

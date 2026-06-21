import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgEditorApi, type EditorStoryArc, type EditorStoryBeat, type BeatType } from '../../api/bandRpgEditor';

const BEAT_TYPE_COLORS: Record<BeatType, string> = {
  dialogue:  'bg-blue-100 text-blue-700',
  narration: 'bg-purple-100 text-purple-700',
  cutscene:  'bg-amber-100 text-amber-700',
  choice:    'bg-emerald-100 text-emerald-700',
  unlock:    'bg-rose-100 text-rose-700',
  trigger:   'bg-surface-100 text-surface-600',
};

const BEAT_TYPES: BeatType[] = ['dialogue', 'narration', 'cutscene', 'choice', 'unlock', 'trigger'];

const BEAT_CONTENT_HINTS: Record<BeatType, string> = {
  dialogue:  '{ "text": "...", "speakerName": "..." }',
  narration: '{ "text": "..." }',
  cutscene:  '{ "text": "...", "scene": "..." }',
  choice:    '{ "text": "...", "choices": [{ "label": "...", "nextBeatId": "..." }] }',
  unlock:    '{ "what": "level-slug or quest-id" }',
  trigger:   '{ "event": "event-name" }',
};

function safeStr(val: unknown): string {
  try { return JSON.stringify(val, null, 2); } catch { return '{}'; }
}

function parseJson(str: string): unknown {
  try { return JSON.parse(str); } catch { return null; }
}

// ── Beat Form ─────────────────────────────────────────────────────────────────

interface BeatFormProps {
  arcId: string;
  initial?: EditorStoryBeat | null;
  defaultOrder: number;
  onSaved: () => void;
  onCancel: () => void;
}

function BeatForm({ arcId, initial, defaultOrder, onSaved, onCancel }: BeatFormProps) {
  const qc = useQueryClient();
  const [type, setType]           = useState<BeatType>(initial?.type ?? 'dialogue');
  const [content, setContent]     = useState(safeStr(initial?.content ?? {}));
  const [unlock, setUnlock]       = useState(safeStr(initial?.unlockCondition ?? {}));
  const [order, setOrder]         = useState(initial?.order ?? defaultOrder);
  const [jsonError, setJsonError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const c = parseJson(content);
      const u = parseJson(unlock);
      if (!c || !u) { setJsonError('Invalid JSON in Content or Unlock Condition.'); throw new Error('bad json'); }
      setJsonError('');
      const data: Partial<EditorStoryBeat> = {
        type, order,
        content: c as Record<string, unknown>,
        unlockCondition: u as Record<string, unknown>,
      };
      return initial
        ? bandRpgEditorApi.updateBeat(arcId, initial.id, data)
        : bandRpgEditorApi.createBeat(arcId, data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['editor-beats', arcId] }); onSaved(); },
  });

  const inputCls = 'border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full';
  const labelCls = 'block text-xs font-medium text-surface-700 mb-1';

  return (
    <div className="bg-surface-50 rounded-lg border border-surface-200 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value as BeatType)}>
            {BEAT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Order</label>
          <input type="number" className={inputCls} value={order} onChange={e => setOrder(Number(e.target.value))} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Content (JSON)</label>
        <p className="text-xs text-surface-400 mb-1 font-mono">{BEAT_CONTENT_HINTS[type]}</p>
        <textarea
          className={`${inputCls} font-mono text-xs`}
          rows={4}
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </div>
      <div>
        <label className={labelCls}>Unlock Condition (JSON — optional)</label>
        <textarea
          className={`${inputCls} font-mono text-xs`}
          rows={2}
          value={unlock}
          onChange={e => setUnlock(e.target.value)}
        />
      </div>
      {jsonError && <p className="text-xs text-red-600">{jsonError}</p>}
      <div className="flex gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {mutation.isPending ? 'Saving…' : initial ? 'Update Beat' : 'Add Beat'}
        </button>
        <button onClick={onCancel} className="text-xs text-surface-500 hover:text-surface-700">Cancel</button>
      </div>
    </div>
  );
}

// ── Beat List ─────────────────────────────────────────────────────────────────

function BeatList({ arc }: { arc: EditorStoryArc }) {
  const qc = useQueryClient();
  const { data: beats = [], isLoading } = useQuery({
    queryKey: ['editor-beats', arc.id],
    queryFn: () => bandRpgEditorApi.listBeats(arc.id),
    staleTime: 15_000,
  });

  const [editingBeatId, setEditingBeatId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (beatId: string) => bandRpgEditorApi.deleteBeat(arc.id, beatId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['editor-beats', arc.id] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => bandRpgEditorApi.reorderBeats(arc.id, ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['editor-beats', arc.id] }),
  });

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const ids = beats.map(b => b.id);
    const prev = ids[idx - 1];
    const curr = ids[idx];
    if (!prev || !curr) return;
    ids[idx - 1] = curr;
    ids[idx] = prev;
    reorderMutation.mutate(ids);
  };

  const moveDown = (idx: number) => {
    if (idx === beats.length - 1) return;
    const ids = beats.map(b => b.id);
    const curr = ids[idx];
    const next = ids[idx + 1];
    if (!curr || !next) return;
    ids[idx] = next;
    ids[idx + 1] = curr;
    reorderMutation.mutate(ids);
  };

  if (isLoading) return <p className="text-sm text-surface-400 py-4 text-center">Loading beats…</p>;

  const contentPreview = (beat: EditorStoryBeat): string => {
    const c = beat.content;
    if (c && typeof c === 'object' && 'text' in c) return String(c.text).slice(0, 60);
    return JSON.stringify(c).slice(0, 60);
  };

  return (
    <div className="space-y-2">
      {beats.length === 0 && !adding && (
        <p className="text-sm text-surface-400 italic">No beats yet.</p>
      )}
      {beats.map((beat, idx) => (
        <div key={beat.id}>
          {editingBeatId === beat.id ? (
            <BeatForm
              arcId={arc.id}
              initial={beat}
              defaultOrder={beat.order}
              onSaved={() => setEditingBeatId(null)}
              onCancel={() => setEditingBeatId(null)}
            />
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveUp(idx)} disabled={idx === 0} className="text-xs text-surface-400 hover:text-surface-700 disabled:opacity-20">▲</button>
                <button onClick={() => moveDown(idx)} disabled={idx === beats.length - 1} className="text-xs text-surface-400 hover:text-surface-700 disabled:opacity-20">▼</button>
              </div>
              <span className={`px-2 py-0.5 text-xs font-medium rounded shrink-0 ${BEAT_TYPE_COLORS[beat.type]}`}>
                {beat.type}
              </span>
              <span className="text-sm text-surface-600 flex-1 truncate">{contentPreview(beat)}</span>
              <button onClick={() => setEditingBeatId(beat.id)} className="text-xs text-indigo-600 hover:text-indigo-800 shrink-0">Edit</button>
              <button onClick={() => deleteMutation.mutate(beat.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">✕</button>
            </div>
          )}
        </div>
      ))}
      {adding ? (
        <BeatForm
          arcId={arc.id}
          defaultOrder={beats.length}
          onSaved={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          + Add Beat
        </button>
      )}
    </div>
  );
}

// ── Arc Form ──────────────────────────────────────────────────────────────────

interface ArcFormProps {
  initial?: EditorStoryArc | null;
  onSaved: () => void;
  onCancel: () => void;
}

function ArcForm({ initial, onSaved, onCancel }: ArcFormProps) {
  const qc = useQueryClient();
  const [slug, setSlug]      = useState(initial?.slug ?? '');
  const [title, setTitle]    = useState(initial?.title ?? '');
  const [desc, setDesc]      = useState(initial?.description ?? '');
  const [order, setOrder]    = useState(initial?.order ?? 0);

  const mutation = useMutation({
    mutationFn: () => {
      const data: Partial<EditorStoryArc> = { slug: slug.trim(), title: title.trim(), order, ...(desc.trim() ? { description: desc.trim() } : {}) };
      return initial ? bandRpgEditorApi.updateArc(initial.id, data) : bandRpgEditorApi.createArc(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['editor-arcs'] }); onSaved(); },
  });

  const cls = 'border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full';
  const lbl = 'block text-xs font-medium text-surface-700 mb-1';

  return (
    <div className="space-y-3 bg-indigo-50 rounded-lg border border-indigo-200 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Slug <span className="text-red-500">*</span></label>
          <input className={cls} value={slug} onChange={e => setSlug(e.target.value)} placeholder="act-one" />
        </div>
        <div>
          <label className={lbl}>Title <span className="text-red-500">*</span></label>
          <input className={cls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Act One" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Description</label>
          <textarea className={cls} rows={2} value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Order</label>
          <input type="number" className={cls} value={order} onChange={e => setOrder(Number(e.target.value))} />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={!slug.trim() || !title.trim() || mutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg"
        >
          {mutation.isPending ? 'Saving…' : initial ? 'Update Arc' : 'Create Arc'}
        </button>
        <button onClick={onCancel} className="text-xs text-surface-500 hover:text-surface-700">Cancel</button>
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export default function StoryEditor() {
  const qc = useQueryClient();
  const { data: arcs = [], isLoading } = useQuery({
    queryKey: ['editor-arcs'],
    queryFn: () => bandRpgEditorApi.listArcs(),
    staleTime: 30_000,
  });

  const [selectedArcId, setSelectedArcId] = useState<string | null>(null);
  const [editingArcId, setEditingArcId]   = useState<string | null>(null);
  const [creatingArc, setCreatingArc]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteArc(id),
    onSuccess: () => {
      setConfirmDelete(null);
      if (selectedArcId === confirmDelete) setSelectedArcId(null);
      void qc.invalidateQueries({ queryKey: ['editor-arcs'] });
    },
  });

  const selectedArc = arcs.find(a => a.id === selectedArcId) ?? null;
  const editingArc  = arcs.find(a => a.id === editingArcId) ?? null;

  if (isLoading) return <p className="text-sm text-surface-400 py-6 text-center">Loading story arcs…</p>;

  return (
    <div className="flex gap-6">
      {/* Arc list */}
      <div className="w-64 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-surface-600 uppercase tracking-wide">Story Arcs</p>
          <button
            onClick={() => { setCreatingArc(true); setEditingArcId(null); }}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + New Arc
          </button>
        </div>

        {creatingArc && (
          <ArcForm onSaved={() => setCreatingArc(false)} onCancel={() => setCreatingArc(false)} />
        )}

        {arcs.map(arc => (
          <div key={arc.id}>
            {editingArcId === arc.id ? (
              <ArcForm
                initial={editingArc}
                onSaved={() => setEditingArcId(null)}
                onCancel={() => setEditingArcId(null)}
              />
            ) : (
              <div
                className={`rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  selectedArcId === arc.id
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-surface-200 bg-white hover:border-surface-300'
                }`}
                onClick={() => setSelectedArcId(arc.id)}
              >
                <p className="text-sm font-medium text-surface-900">{arc.title}</p>
                <p className="text-xs text-surface-400">{arc._count?.beats ?? 0} beats</p>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={e => { e.stopPropagation(); setEditingArcId(arc.id); }}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    Edit
                  </button>
                  {confirmDelete === arc.id ? (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); deleteMutation.mutate(arc.id); }}
                        className="text-xs text-red-600 font-semibold"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}
                        className="text-xs text-surface-400"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(arc.id); }}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {arcs.length === 0 && !creatingArc && (
          <p className="text-xs text-surface-400 italic">No story arcs yet.</p>
        )}
      </div>

      {/* Beat editor */}
      <div className="flex-1 min-w-0">
        {selectedArc ? (
          <div className="rounded-xl border border-surface-200 bg-white p-5">
            <h3 className="font-semibold text-surface-900 mb-4">{selectedArc.title} — Beats</h3>
            <BeatList arc={selectedArc} />
          </div>
        ) : (
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-10 text-center">
            <p className="text-surface-400 text-sm">Select a story arc to edit its beats.</p>
          </div>
        )}
      </div>
    </div>
  );
}

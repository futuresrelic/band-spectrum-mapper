import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerApi } from '../../api/socialPlanner';
import type { ContentSeries } from '../../api/socialPlanner';

interface SeriesFormState {
  name: string;
  description: string;
  tone: string;
  visualStyleNotes: string;
  defaultCaptionStyle: string;
  hashtagSet: string;    // comma-separated
  examplePrompts: string; // newline-separated
}

const EMPTY_FORM: SeriesFormState = {
  name: '', description: '', tone: '', visualStyleNotes: '',
  defaultCaptionStyle: '', hashtagSet: '', examplePrompts: '',
};

function toForm(s: ContentSeries): SeriesFormState {
  return {
    name: s.name,
    description: s.description ?? '',
    tone: s.tone ?? '',
    visualStyleNotes: s.visualStyleNotes ?? '',
    defaultCaptionStyle: s.defaultCaptionStyle ?? '',
    hashtagSet: s.hashtagSet.join(', '),
    examplePrompts: s.examplePrompts.join('\n'),
  };
}

export default function SeriesTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null); // series id or 'new'
  const [form, setForm] = useState<SeriesFormState>(EMPTY_FORM);

  const { data: series = [], isLoading } = useQuery({
    queryKey: ['planner-series'],
    queryFn: plannerApi.listSeries,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof plannerApi.createSeries>[0]) => plannerApi.createSeries(data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['planner-series'] }); setEditing(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof plannerApi.updateSeries>[1] }) =>
      plannerApi.updateSeries(id, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['planner-series'] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: plannerApi.deleteSeries,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['planner-series'] }),
  });

  function openNew() { setForm(EMPTY_FORM); setEditing('new'); }
  function openEdit(s: ContentSeries) { setForm(toForm(s)); setEditing(s.id); }

  function save() {
    const data = {
      name: form.name,
      description: form.description || null,
      tone: form.tone || null,
      visualStyleNotes: form.visualStyleNotes || null,
      defaultCaptionStyle: form.defaultCaptionStyle || null,
      hashtagSet: form.hashtagSet.split(',').map((s) => s.trim()).filter(Boolean),
      examplePrompts: form.examplePrompts.split('\n').map((s) => s.trim()).filter(Boolean),
      bandId: null,
    };
    if (editing === 'new') {
      createMutation.mutate(data);
    } else if (editing) {
      updateMutation.mutate({ id: editing, data });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (editing) {
    return (
      <div className="max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-surface-900">
            {editing === 'new' ? 'New series' : 'Edit series'}
          </h3>
          <button onClick={() => setEditing(null)} className="text-sm text-surface-500 hover:text-surface-800">Cancel</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm" placeholder="e.g. The Teachings of TOOL" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Tone</label>
            <input value={form.tone} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm" placeholder="e.g. philosophical, intense, thought-provoking" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Visual style notes</label>
            <textarea value={form.visualStyleNotes} onChange={(e) => setForm((f) => ({ ...f, visualStyleNotes: e.target.value }))}
              rows={2} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none"
              placeholder="Dark background, golden text, radar chart overlay…" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Default caption style</label>
            <textarea value={form.defaultCaptionStyle} onChange={(e) => setForm((f) => ({ ...f, defaultCaptionStyle: e.target.value }))}
              rows={2} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none"
              placeholder="Short lyric → deeper question → CTA" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Hashtags (comma-separated)</label>
            <input value={form.hashtagSet} onChange={(e) => setForm((f) => ({ ...f, hashtagSet: e.target.value }))}
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm"
              placeholder="#TOOL, #ToolBand, #TheTeachingsOfTool" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Example prompts (one per line)</label>
            <textarea value={form.examplePrompts} onChange={(e) => setForm((f) => ({ ...f, examplePrompts: e.target.value }))}
              rows={4} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none font-mono text-xs"
              placeholder="Write a Teachings of TOOL post about Lateralus…" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={!form.name || isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              {isSaving ? 'Saving…' : 'Save series'}
            </button>
            {editing !== 'new' && (
              <button onClick={() => { if (confirm('Delete this series?')) deleteMutation.mutate(editing); }}
                className="px-4 py-2 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50">
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-surface-900">Content series</h3>
        <button onClick={openNew} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
          + New series
        </button>
      </div>

      {isLoading && <p className="text-sm text-surface-500">Loading…</p>}

      {!isLoading && series.length === 0 && (
        <div className="text-center py-12 text-surface-400">
          <p className="text-sm">No series yet. Create one to organize recurring content.</p>
        </div>
      )}

      <div className="space-y-3">
        {series.map((s) => (
          <div key={s.id} className="bg-white border border-surface-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-surface-900">{s.name}</h4>
                  <span className="text-xs text-surface-500">{s._count.posts} posts</span>
                </div>
                {s.description && <p className="text-xs text-surface-600 mt-1">{s.description}</p>}
                {s.tone && <p className="text-xs text-surface-500 mt-1">Tone: {s.tone}</p>}
                {s.hashtagSet.length > 0 && (
                  <p className="text-xs text-surface-400 mt-1">{s.hashtagSet.join(' ')}</p>
                )}
              </div>
              <button onClick={() => openEdit(s)}
                className="shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

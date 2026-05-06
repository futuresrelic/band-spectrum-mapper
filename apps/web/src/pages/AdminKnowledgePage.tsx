import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminKnowledgeApi } from '../api/adminKnowledge';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import type { AdminKnowledgeEntry } from '@band-spectrum-mapper/shared';

const SCOPE_LABELS = {
  global: 'Global — all songs',
  band:   'Band — specific artist',
  song:   'Song — one song only',
};

const SCOPE_COLORS = {
  global: 'bg-indigo-100 text-indigo-800',
  band:   'bg-amber-100 text-amber-800',
  song:   'bg-green-100 text-green-800',
};

// ---------------------------------------------------------------------------
// Editor form
// ---------------------------------------------------------------------------

type EditorState = {
  title: string;
  content: string;
  scope: 'global' | 'band' | 'song';
  scopeId: string;
  tags: string;     // comma-separated input
  isActive: boolean;
};

const BLANK: EditorState = {
  title: '', content: '', scope: 'global', scopeId: '', tags: '', isActive: true,
};

function toEditorState(e: AdminKnowledgeEntry): EditorState {
  return {
    title:    e.title,
    content:  e.content,
    scope:    e.scope,
    scopeId:  e.scopeId ?? '',
    tags:     e.tags.join(', '),
    isActive: e.isActive,
  };
}

function Editor({
  entry,
  onSave,
  onCancel,
}: {
  entry: AdminKnowledgeEntry | null;
  onSave: (data: EditorState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EditorState>(entry ? toEditorState(entry) : BLANK);

  const { data: bands } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
  });

  const set = (k: keyof EditorState, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.title.trim() && form.content.trim();

  return (
    <div className="space-y-5">
      <div>
        <label className="label">Title *</label>
        <input
          className="input"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. The Teachings of Tool"
        />
      </div>

      <div>
        <label className="label">Scope</label>
        <div className="flex gap-3">
          {(['global', 'band', 'song'] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="scope"
                value={s}
                checked={form.scope === s}
                onChange={() => set('scope', s)}
              />
              <span className="text-sm capitalize">{s}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-surface-500 mt-1">{SCOPE_LABELS[form.scope]}</p>
      </div>

      {form.scope === 'band' && (
        <div>
          <label className="label">Band</label>
          <select
            className="input"
            value={form.scopeId}
            onChange={(e) => set('scopeId', e.target.value)}
          >
            <option value="">Select a band…</option>
            {bands?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {form.scope === 'song' && (
        <div>
          <label className="label">Song ID</label>
          <input
            className="input font-mono text-sm"
            value={form.scopeId}
            onChange={(e) => set('scopeId', e.target.value)}
            placeholder="Paste the song's cuid here"
          />
          <p className="text-xs text-surface-400 mt-0.5">
            Find it in the URL when on a song's detail page: /library/songs/<strong>cuid</strong>
          </p>
        </div>
      )}

      <div>
        <label className="label">Tags</label>
        <input
          className="input"
          value={form.tags}
          onChange={(e) => set('tags', e.target.value)}
          placeholder="ego-death, transcendence, spiral (comma separated)"
        />
        <p className="text-xs text-surface-400 mt-0.5">Optional — helps with organisation</p>
      </div>

      <div>
        <label className="label">
          Knowledge Content *
          <span className="ml-2 text-surface-400 font-normal text-xs">
            Injected verbatim into the AI prompt as "Curator Knowledge"
          </span>
        </label>
        <textarea
          className="textarea w-full min-h-[280px] font-mono text-sm"
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          placeholder={`Write everything you want the AI to know and treat as authoritative.\n\nExample:\n- "Spiral out" is a directive for personal growth, not mere chaos.\n- Tool's use of Fibonacci sequences in Lateralus is literal: the syllable counts per line follow the sequence 1,1,2,3,5,8,5,3,2,1,1,2,3,5,8,13...\n- The "46 & 2" concept refers to Carl Jung's shadow work combined with the idea of humans evolving beyond 44+2 chromosomes to 46+2.`}
        />
        <p className="text-xs text-surface-400 mt-1">
          The AI will see this as authoritative context and prioritise it over its generic training.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={form.isActive}
          onChange={(e) => set('isActive', e.target.checked)}
          className="accent-indigo-600"
        />
        <label htmlFor="isActive" className="text-sm cursor-pointer">
          Active — include in AI analysis prompts
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          className="btn-primary"
          disabled={!valid}
          onClick={() => onSave(form)}
        >
          {entry ? 'Save changes' : 'Create entry'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminKnowledgePage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminKnowledgeEntry | null | 'new'>(null);

  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['admin-knowledge'],
    queryFn: () => adminKnowledgeApi.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (form: EditorState) => {
      const payload = {
        title:    form.title.trim(),
        content:  form.content,
        scope:    form.scope,
        scopeId:  form.scope !== 'global' ? (form.scopeId || null) : null,
        tags:     form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        isActive: form.isActive,
      };
      return editing === 'new'
        ? adminKnowledgeApi.create(payload)
        : adminKnowledgeApi.update((editing as AdminKnowledgeEntry).id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-knowledge'] });
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminKnowledgeApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-knowledge'] }),
  });

  const toggleActive = (entry: AdminKnowledgeEntry) =>
    adminKnowledgeApi.update(entry.id, { isActive: !entry.isActive })
      .then(() => qc.invalidateQueries({ queryKey: ['admin-knowledge'] }));

  if (editing !== null) {
    return (
      <div>
        <PageHeader
          title={editing === 'new' ? 'New Knowledge Entry' : `Edit: ${(editing as AdminKnowledgeEntry).title}`}
          actions={<button className="btn-secondary" onClick={() => setEditing(null)}>← Back</button>}
        />
        {saveMutation.isError && <ErrorMessage error={saveMutation.error} />}
        <div className="card mt-4">
          <Editor
            entry={editing === 'new' ? null : (editing as AdminKnowledgeEntry)}
            onSave={(form) => saveMutation.mutate(form)}
            onCancel={() => setEditing(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="AI Knowledge Feed"
        subtitle="Curator notes injected into AI analysis prompts — your authoritative context wins."
        actions={
          <button className="btn-primary" onClick={() => setEditing('new')}>
            + New Entry
          </button>
        }
      />

      <div className="card mt-2 bg-indigo-50 border-indigo-200 mb-6">
        <p className="text-sm text-indigo-800 leading-relaxed">
          <strong>How it works:</strong> Every active entry is appended to the AI's prompt as
          "CURATOR KNOWLEDGE — treat as authoritative." The AI prioritises this over its generic
          training data. Global entries appear for every song. Band-scoped entries appear for songs
          by that artist. Song-scoped entries appear only for that one song.
        </p>
        <p className="text-sm text-indigo-700 mt-1">
          After creating or editing an entry, regenerate a song's Philosophical Themes or Deep
          Analysis from its admin detail page to see the updated analysis.
        </p>
      </div>

      {isLoading && <p className="text-surface-700 text-sm">Loading…</p>}
      {error && <ErrorMessage error={error} />}

      {entries && entries.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-surface-500 text-sm mb-3">No knowledge entries yet.</p>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            Create your first entry
          </button>
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className={`card ${!entry.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3 justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SCOPE_COLORS[entry.scope]}`}>
                      {entry.scope}
                    </span>
                    {!entry.isActive && (
                      <span className="text-xs text-surface-400 bg-surface-100 rounded-full px-2 py-0.5">
                        inactive
                      </span>
                    )}
                    {entry.tags.length > 0 && entry.tags.map((t) => (
                      <span key={t} className="text-xs bg-surface-100 text-surface-600 rounded-full px-2 py-0.5">
                        {t}
                      </span>
                    ))}
                  </div>
                  <h3 className="font-semibold text-surface-900">{entry.title}</h3>
                  <p className="text-sm text-surface-600 mt-1 line-clamp-2">{entry.content}</p>
                  <p className="text-xs text-surface-400 mt-1">
                    Updated {new Date(entry.updatedAt).toLocaleDateString()}
                    {' · '}{entry.content.length} chars
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => toggleActive(entry)}
                    title={entry.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {entry.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => setEditing(entry)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-ghost text-xs text-red-600"
                    onClick={() => {
                      if (confirm(`Delete "${entry.title}"?`)) deleteMutation.mutate(entry.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

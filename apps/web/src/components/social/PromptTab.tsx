import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerApi } from '../../api/socialPlanner';
import type { PromptTemplate, PromptCategory } from '../../api/socialPlanner';

const CATEGORIES: { value: PromptCategory; label: string }[] = [
  { value: 'canva_gpt',          label: 'Canva GPT' },
  { value: 'image_background',   label: 'Image / Background' },
  { value: 'chatgpt_caption',    label: 'ChatGPT Caption' },
  { value: 'claude_development', label: 'Claude Development' },
  { value: 'post_generation',    label: 'Post Generation' },
  { value: 'reply_style',        label: 'Reply Style' },
];

const CATEGORY_COLORS: Record<PromptCategory, string> = {
  canva_gpt:          'bg-pink-100 text-pink-700',
  image_background:   'bg-orange-100 text-orange-700',
  chatgpt_caption:    'bg-green-100 text-green-700',
  claude_development: 'bg-purple-100 text-purple-700',
  post_generation:    'bg-blue-100 text-blue-700',
  reply_style:        'bg-teal-100 text-teal-700',
};

interface FormState {
  name: string;
  category: PromptCategory;
  prompt: string;
  description: string;
  tags: string;
}

const EMPTY: FormState = { name: '', category: 'post_generation', prompt: '', description: '', tags: '' };

function toForm(p: PromptTemplate): FormState {
  return { name: p.name, category: p.category, prompt: p.prompt, description: p.description ?? '', tags: p.tags.join(', ') };
}

export default function PromptTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<PromptCategory | ''>('');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ['planner-prompts', filter],
    queryFn: () => plannerApi.listPrompts(filter || undefined),
  });

  const createMutation = useMutation({
    mutationFn: plannerApi.createPrompt,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['planner-prompts'] }); setEditing(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof plannerApi.updatePrompt>[1] }) =>
      plannerApi.updatePrompt(id, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['planner-prompts'] }); setEditing(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: plannerApi.deletePrompt,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['planner-prompts'] }),
  });

  function save() {
    const data = {
      name: form.name,
      category: form.category,
      prompt: form.prompt,
      description: form.description || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (editing === 'new') {
      createMutation.mutate(data);
    } else if (editing) {
      updateMutation.mutate({ id: editing, data });
    }
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (editing) {
    return (
      <div className="max-w-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-surface-900">{editing === 'new' ? 'New prompt' : 'Edit prompt'}</h3>
          <button onClick={() => setEditing(null)} className="text-sm text-surface-500 hover:text-surface-800">Cancel</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm" placeholder="e.g. Lateralus radar chart description" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Category *</label>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as PromptCategory }))}
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Prompt *</label>
            <textarea value={form.prompt} onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              rows={8} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none font-mono text-xs" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Description</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm" placeholder="What this prompt is for" />
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-700 mb-1">Tags (comma-separated)</label>
            <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm" placeholder="tool, lateralus, radar" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={!form.name || !form.prompt || createMutation.isPending || updateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save prompt'}
            </button>
            {editing !== 'new' && (
              <button onClick={() => { if (confirm('Delete?')) deleteMutation.mutate(editing); }}
                className="px-4 py-2 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50">Delete</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-surface-900">Prompt library</h3>
          <select value={filter} onChange={(e) => setFilter(e.target.value as PromptCategory | '')}
            className="border border-surface-300 rounded px-2 py-1 text-sm">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <button onClick={() => { setForm(EMPTY); setEditing('new'); }}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">
          + New prompt
        </button>
      </div>

      {isLoading && <p className="text-sm text-surface-500">Loading…</p>}
      {!isLoading && prompts.length === 0 && (
        <div className="text-center py-12 text-surface-400 text-sm">No prompts yet.</div>
      )}

      <div className="space-y-3">
        {prompts.map((p) => (
          <div key={p.id} className="bg-white border border-surface-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${CATEGORY_COLORS[p.category]}`}>
                    {CATEGORIES.find((c) => c.value === p.category)?.label}
                  </span>
                  <h4 className="text-sm font-medium text-surface-900">{p.name}</h4>
                </div>
                {p.description && <p className="text-xs text-surface-500 mt-1">{p.description}</p>}
                <pre className="mt-2 text-xs text-surface-700 bg-surface-50 rounded p-2 whitespace-pre-wrap font-mono line-clamp-3">
                  {p.prompt}
                </pre>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => void copy(p.prompt, p.id)}
                  className="text-xs px-2 py-1 border border-surface-300 rounded hover:bg-surface-50 text-surface-600">
                  {copied === p.id ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={() => { setForm(toForm(p)); setEditing(p.id); }}
                  className="text-xs px-2 py-1 border border-surface-300 rounded hover:bg-surface-50 text-surface-600">
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

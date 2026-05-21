import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminKnowledgeApi } from '../api/adminKnowledge';
import { bandsApi } from '../api/bands';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import type { AdminKnowledgeEntry, KnowledgeImage } from '@band-spectrum-mapper/shared';

// ─── Display constants ────────────────────────────────────────────────────────

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

const ENTRY_TYPE_META = {
  knowledge: {
    label:    'Curator Knowledge',
    badge:    'bg-blue-100 text-blue-800',
    listBg:   '',
    banner:   'bg-indigo-50 border-indigo-200',
    bannerText: 'indigo',
  },
  social_influence: {
    label:    'Social Influence',
    badge:    'bg-purple-100 text-purple-800',
    listBg:   'border-l-4 border-l-purple-300',
    banner:   'bg-purple-50 border-purple-200',
    bannerText: 'purple',
  },
} as const;

// ─── Editor state ─────────────────────────────────────────────────────────────

type EditorState = {
  title:       string;
  content:     string;
  scope:       'global' | 'band' | 'song';
  scopeId:     string;
  tags:        string;
  images:      KnowledgeImage[];
  isActive:    boolean;
  entryType:   'knowledge' | 'social_influence';
  sourceLabel: string;
  sourceUrl:   string;
};

const BLANK: EditorState = {
  title: '', content: '', scope: 'global', scopeId: '', tags: '', images: [],
  isActive: true, entryType: 'knowledge', sourceLabel: '', sourceUrl: '',
};

const BLANK_IMAGE: KnowledgeImage = { url: '', caption: '', creditWho: '', creditPlatform: '' };

function toEditorState(e: AdminKnowledgeEntry): EditorState {
  return {
    title:       e.title,
    content:     e.content,
    scope:       e.scope,
    scopeId:     e.scopeId ?? '',
    tags:        e.tags.join(', '),
    images:      e.images ?? [],
    isActive:    e.isActive,
    entryType:   e.entryType,
    sourceLabel: e.sourceLabel ?? '',
    sourceUrl:   e.sourceUrl   ?? '',
  };
}

// ─── Image row ────────────────────────────────────────────────────────────────

function ImageRow({
  img, onChange, onRemove,
}: {
  img: KnowledgeImage; onChange: (u: KnowledgeImage) => void; onRemove: () => void;
}) {
  return (
    <div className="bg-surface-100 rounded-lg p-3 space-y-2 border border-surface-200">
      <div className="flex items-start gap-2">
        {img.url && (
          <img src={img.url} alt={img.caption || 'preview'}
            className="w-16 h-16 object-cover rounded shrink-0 bg-surface-200"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        )}
        <div className="flex-1 space-y-1.5 min-w-0">
          <input className="input text-sm" placeholder="Image URL (paste a direct link)"
            value={img.url} onChange={(e) => onChange({ ...img, url: e.target.value })} />
          <input className="input text-sm" placeholder="Caption — what does this image show? (used by AI)"
            value={img.caption} onChange={(e) => onChange({ ...img, caption: e.target.value })} />
          <div className="flex gap-2">
            <input className="input text-sm flex-1" placeholder="Credit: who posted it?"
              value={img.creditWho} onChange={(e) => onChange({ ...img, creditWho: e.target.value })} />
            <input className="input text-sm flex-1" placeholder="Platform (e.g. Reddit, X, Instagram)"
              value={img.creditPlatform} onChange={(e) => onChange({ ...img, creditPlatform: e.target.value })} />
          </div>
        </div>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 shrink-0 mt-0.5 text-sm" title="Remove image">✕</button>
      </div>
    </div>
  );
}

// ─── Editor form ──────────────────────────────────────────────────────────────

function Editor({
  entry, onSave, onCancel,
}: {
  entry: AdminKnowledgeEntry | null; onSave: (d: EditorState) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState<EditorState>(entry ? toEditorState(entry) : BLANK);
  const { data: bands } = useQuery({ queryKey: ['bands'], queryFn: () => bandsApi.list() });

  const set = (k: keyof EditorState, v: string | boolean | KnowledgeImage[]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isSocial = form.entryType === 'social_influence';
  const valid    = form.title.trim() && form.content.trim();

  return (
    <div className="space-y-6">

      {/* ── Entry type selector ── */}
      <div>
        <label className="label">Entry Type</label>
        <div className="flex gap-4">
          {(['knowledge', 'social_influence'] as const).map((t) => (
            <label key={t} className="flex items-start gap-3 cursor-pointer group">
              <input type="radio" name="entryType" value={t}
                checked={form.entryType === t}
                onChange={() => set('entryType', t)}
                className="mt-0.5" />
              <div>
                <span className={`text-sm font-medium ${form.entryType === t ? '' : 'text-surface-500 group-hover:text-surface-700'}`}>
                  {t === 'knowledge' ? 'Curator Knowledge' : 'Social Influence'}
                </span>
                <p className="text-xs text-surface-400 mt-0.5 max-w-xs">
                  {t === 'knowledge'
                    ? 'Authoritative facts, interpretations, and context. Treated as ground truth by the AI.'
                    : 'Fan reactions, community comments, reviews, and observations from external sources. Aggregated as collective audience sentiment.'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Social influence provenance ── */}
      {isSocial && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-purple-800 uppercase tracking-wide">Social Signal Provenance</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Source *</label>
              <input className="input text-sm" placeholder="e.g. Reddit r/ToolBand, YouTube comments, Facebook fan group, In-person concert"
                value={form.sourceLabel}
                onChange={(e) => set('sourceLabel', e.target.value)} />
              <p className="text-xs text-surface-400 mt-0.5">Where did this community signal come from?</p>
            </div>
            <div>
              <label className="label">Source URL <span className="text-surface-400 font-normal">(optional)</span></label>
              <input className="input text-sm" placeholder="https://reddit.com/r/…"
                value={form.sourceUrl}
                onChange={(e) => set('sourceUrl', e.target.value)} />
              <p className="text-xs text-surface-400 mt-0.5">Link to the original thread or post</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Title ── */}
      <div>
        <label className="label">Title *</label>
        <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)}
          placeholder={isSocial ? 'e.g. Reddit: fans describe Schism as their most emotionally complex' : 'e.g. The Teachings of Tool'} />
      </div>

      {/* ── Scope ── */}
      <div>
        <label className="label">Scope</label>
        <div className="flex gap-3">
          {(['global', 'band', 'song'] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="scope" value={s} checked={form.scope === s} onChange={() => set('scope', s)} />
              <span className="text-sm capitalize">{s}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-surface-500 mt-1">{SCOPE_LABELS[form.scope]}</p>
      </div>

      {form.scope === 'band' && (
        <div>
          <label className="label">Band</label>
          <select className="input" value={form.scopeId} onChange={(e) => set('scopeId', e.target.value)}>
            <option value="">Select a band…</option>
            {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {form.scope === 'song' && (
        <div>
          <label className="label">Song ID</label>
          <input className="input font-mono text-sm" value={form.scopeId}
            onChange={(e) => set('scopeId', e.target.value)}
            placeholder="Paste the song's cuid here" />
          <p className="text-xs text-surface-400 mt-0.5">
            Find it in the URL when on a song's detail page: /library/songs/<strong>cuid</strong>
          </p>
        </div>
      )}

      {/* ── Tags ── */}
      <div>
        <label className="label">Tags</label>
        <input className="input" value={form.tags} onChange={(e) => set('tags', e.target.value)}
          placeholder={isSocial ? 'positive-reception, emotional-impact, live-energy (comma separated)' : 'ego-death, transcendence, spiral (comma separated)'} />
        <p className="text-xs text-surface-400 mt-0.5">Optional — helps with organisation</p>
      </div>

      {/* ── Content ── */}
      <div>
        <label className="label">
          {isSocial ? 'Community Observations *' : 'Knowledge Content *'}
          <span className="ml-2 text-surface-400 font-normal text-xs">
            {isSocial
              ? 'What fans are saying — quotes, reactions, patterns observed'
              : 'Injected verbatim into the AI prompt as "Curator Knowledge"'}
          </span>
        </label>
        <textarea className="textarea w-full font-mono text-sm"
          style={{ minHeight: isSocial ? 200 : 280 }}
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          placeholder={isSocial
            ? `Paste or summarise what the community is saying.\n\nExamples:\n- "Multiple comments describe this song as the most emotionally devastating in their collection."\n- "Top comment (2.4k likes): 'I've listened to this 1000 times and still find new meaning. This song cured my depression.'"\n- "General consensus: the song is widely regarded as complex but accessible — even non-Tool fans mention it specifically."\n- "At live shows, audiences visibly quiet during the middle section — unusual for a metal crowd."`
            : `Write everything you want the AI to know and treat as authoritative.\n\nExample:\n- "Spiral out" is a directive for personal growth, not mere chaos.\n- Tool's use of Fibonacci sequences in Lateralus is literal: the syllable counts per line follow the sequence 1,1,2,3,5,8,5,3,2,1,1,2,3,5,8,13...\n- The "46 & 2" concept refers to Carl Jung's shadow work combined with the idea of humans evolving beyond 44+2 chromosomes to 46+2.`}
        />
        <p className="text-xs text-surface-400 mt-1">
          {isSocial
            ? 'Multiple social influence entries on the same scope compound — the AI sees them as collective audience sentiment, not a single opinion.'
            : 'The AI will see this as authoritative context and prioritise it over its generic training.'}
        </p>
      </div>

      {/* ── Images (knowledge entries only) ── */}
      {!isSocial && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Images</label>
            <button type="button"
              onClick={() => setForm((f) => ({ ...f, images: [...f.images, { ...BLANK_IMAGE }] }))}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              + Add image
            </button>
          </div>
          {form.images.length === 0 && (
            <p className="text-xs text-surface-400">
              Attach reference images — screenshots, diagrams, tour photos. Add a caption so the AI
              understands what each image shows. Images are stored by URL; you host the files yourself.
            </p>
          )}
          <div className="space-y-2 mt-1">
            {form.images.map((img, idx) => (
              <ImageRow key={idx} img={img}
                onChange={(u) => setForm((f) => { const imgs = f.images.slice(); imgs[idx] = u; return { ...f, images: imgs }; })}
                onRemove={() => setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }))} />
            ))}
          </div>
        </div>
      )}

      {/* ── Active ── */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="isActive" checked={form.isActive}
          onChange={(e) => set('isActive', e.target.checked)} className="accent-indigo-600" />
        <label htmlFor="isActive" className="text-sm cursor-pointer">
          Active — include in AI analysis prompts
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button className="btn-primary" disabled={!valid} onClick={() => onSave(form)}>
          {entry ? 'Save changes' : 'Create entry'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ListFilter = 'all' | 'knowledge' | 'social_influence';

export default function AdminKnowledgePage() {
  const qc = useQueryClient();
  const [editing,     setEditing]     = useState<AdminKnowledgeEntry | null | 'new'>(null);
  const [filter,      setFilter]      = useState<ListFilter>('all');
  const [defaultType, setDefaultType] = useState<'knowledge' | 'social_influence'>('knowledge');

  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['admin-knowledge'],
    queryFn:  () => adminKnowledgeApi.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (form: EditorState) => {
      const payload = {
        title:       form.title.trim(),
        content:     form.content,
        scope:       form.scope,
        scopeId:     form.scope !== 'global' ? (form.scopeId || null) : null,
        tags:        form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        images:      form.images.filter((img) => img.url.trim()),
        isActive:    form.isActive,
        entryType:   form.entryType,
        sourceLabel: form.sourceLabel.trim() || null,
        sourceUrl:   form.sourceUrl.trim()   || null,
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
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-knowledge'] }),
  });

  const toggleActive = (entry: AdminKnowledgeEntry) =>
    adminKnowledgeApi.update(entry.id, { isActive: !entry.isActive })
      .then(() => qc.invalidateQueries({ queryKey: ['admin-knowledge'] }));

  // Open editor — carry through the intended entry type so the form starts correctly
  function openNew(type: 'knowledge' | 'social_influence') {
    setDefaultType(type);
    setEditing('new');
  }

  const displayedEntries = entries?.filter((e) =>
    filter === 'all' ? true : e.entryType === filter,
  );

  const knowledgeCount = entries?.filter((e) => e.entryType === 'knowledge').length ?? 0;
  const socialCount    = entries?.filter((e) => e.entryType === 'social_influence').length ?? 0;

  // ── Editor view
  if (editing !== null) {
    const existing  = editing === 'new' ? null : (editing as AdminKnowledgeEntry);
    // When opening a new entry, seed the entry type from whichever button was clicked
    const seedEntry = existing ?? null;
    return (
      <div>
        <PageHeader
          title={editing === 'new'
            ? (defaultType === 'social_influence' ? 'New Social Influence Entry' : 'New Knowledge Entry')
            : `Edit: ${(editing as AdminKnowledgeEntry).title}`}
          actions={<button className="btn-secondary" onClick={() => setEditing(null)}>← Back</button>}
        />
        {saveMutation.isError && <ErrorMessage error={saveMutation.error} />}
        <div className="card mt-4">
          <Editor
            entry={seedEntry}
            onSave={(form) => saveMutation.mutate(
              editing === 'new' ? { ...form, entryType: defaultType } : form
            )}
            onCancel={() => setEditing(null)}
          />
        </div>
      </div>
    );
  }

  // ── List view
  return (
    <div>
      <PageHeader
        title="AI Knowledge Feed"
        subtitle="Curator context and community signals injected into AI analysis prompts."
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => openNew('social_influence')}>
              + Social Influence
            </button>
            <button className="btn-primary" onClick={() => openNew('knowledge')}>
              + Knowledge Entry
            </button>
          </div>
        }
      />

      {/* ── Info banners */}
      <div className="space-y-3 mt-2 mb-6">
        <div className="card bg-indigo-50 border-indigo-200">
          <p className="text-sm text-indigo-800 leading-relaxed">
            <strong>Curator Knowledge</strong> — authoritative context written by you: facts, interpretations, and analysis notes.
            The AI treats this as ground truth and prioritises it over its generic training.
            Global entries apply to every song; band or song-scoped entries apply narrowly.
          </p>
        </div>
        <div className="card bg-purple-50 border-purple-200">
          <p className="text-sm text-purple-800 leading-relaxed">
            <strong>Social Influence</strong> — fan reactions, comment sections, live observations, review excerpts,
            or anything the community is saying. Multiple entries <em>compound</em>: the AI sees them as aggregated
            audience sentiment and factors them into its assessment of emotional impact, cultural reception, and relatability.
            The more you add, the richer the community picture becomes.
          </p>
        </div>
      </div>

      {/* ── Filter tabs */}
      {entries && entries.length > 0 && (
        <div className="flex gap-1 mb-4 border-b border-surface-200">
          {([
            ['all',              `All (${entries.length})`],
            ['knowledge',        `Knowledge (${knowledgeCount})`],
            ['social_influence', `Social Influence (${socialCount})`],
          ] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
                ${filter === val
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-surface-500 hover:text-surface-700'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="text-surface-700 text-sm">Loading…</p>}
      {error && <ErrorMessage error={error} />}

      {entries && entries.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-surface-500 text-sm mb-4">No entries yet.</p>
          <div className="flex gap-3 justify-center">
            <button className="btn-secondary" onClick={() => openNew('social_influence')}>
              Add Social Influence
            </button>
            <button className="btn-primary" onClick={() => openNew('knowledge')}>
              Add Knowledge Entry
            </button>
          </div>
        </div>
      )}

      {displayedEntries && displayedEntries.length > 0 && (
        <div className="space-y-3">
          {displayedEntries.map((entry) => {
            const meta   = ENTRY_TYPE_META[entry.entryType];
            const isSocial = entry.entryType === 'social_influence';
            return (
              <div key={entry.id} className={`card ${!entry.isActive ? 'opacity-50' : ''} ${meta.listBg}`}>
                <div className="flex items-start gap-3 justify-between">
                  <div className="min-w-0 flex-1">
                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SCOPE_COLORS[entry.scope]}`}>
                        {entry.scope}
                      </span>
                      {!entry.isActive && (
                        <span className="text-xs text-surface-400 bg-surface-100 rounded-full px-2 py-0.5">inactive</span>
                      )}
                      {entry.tags.map((t) => (
                        <span key={t} className="text-xs bg-surface-100 text-surface-600 rounded-full px-2 py-0.5">{t}</span>
                      ))}
                    </div>

                    <h3 className="font-semibold text-surface-900">{entry.title}</h3>

                    {/* Source provenance for social influence */}
                    {isSocial && (entry.sourceLabel || entry.sourceUrl) && (
                      <p className="text-xs text-purple-700 mt-0.5">
                        {entry.sourceLabel && <span>📍 {entry.sourceLabel}</span>}
                        {entry.sourceLabel && entry.sourceUrl && <span className="mx-1 text-surface-300">·</span>}
                        {entry.sourceUrl && (
                          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="underline hover:text-purple-900">
                            View source ↗
                          </a>
                        )}
                      </p>
                    )}

                    <p className="text-sm text-surface-600 mt-1 line-clamp-2">{entry.content}</p>

                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-surface-400">
                        Updated {new Date(entry.updatedAt).toLocaleDateString()}
                        {' · '}{entry.content.length} chars
                      </p>
                      {!isSocial && entry.images && entry.images.length > 0 && (
                        <span className="text-xs text-surface-400">
                          · {entry.images.length} image{entry.images.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Image thumbnails (knowledge only) */}
                    {!isSocial && entry.images && entry.images.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {entry.images.map((img, i) => (
                          <img key={i} src={img.url} alt={img.caption || 'image'} title={img.caption}
                            className="w-10 h-10 object-cover rounded bg-surface-100"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button className="btn-ghost text-xs" onClick={() => toggleActive(entry)}
                      title={entry.isActive ? 'Deactivate' : 'Activate'}>
                      {entry.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn-ghost text-xs" onClick={() => setEditing(entry)}>Edit</button>
                    <button className="btn-ghost text-xs text-red-600"
                      onClick={() => { if (confirm(`Delete "${entry.title}"?`)) deleteMutation.mutate(entry.id); }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

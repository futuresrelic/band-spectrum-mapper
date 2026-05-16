import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { plannerApi } from '../../api/socialPlanner';
import type {
  SocialPost, PostStatus, AssetType, CreatePostInput, UpdatePostInput,
} from '../../api/socialPlanner';
import { STATUS_COLORS, STATUS_LABELS, POST_TYPES, PLATFORMS, ALL_STATUSES } from './PostCard';
import { api } from '../../lib/api';

interface Band  { id: string; name: string; }
interface Album { id: string; title: string; bandId: string; }
interface Song  { id: string; title: string; albumId: string | null; }

interface Props {
  postId: string | 'new' | null;
  defaultDate?: Date;
  onClose: () => void;
  onContextChange: (hint: string) => void;
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'image',         label: 'Image' },
  { value: 'video',         label: 'Video' },
  { value: 'canva_link',    label: 'Canva link' },
  { value: 'exported_file', label: 'Exported file' },
  { value: 'background',    label: 'Background' },
  { value: 'thumbnail',     label: 'Thumbnail' },
];

interface FormState {
  title: string;
  status: PostStatus;
  postType: string;
  platforms: string[];
  caption: string;
  hashtags: string;
  cta: string;
  pollOptions: string;
  notes: string;
  bandId: string;
  albumId: string;
  songId: string;
  seriesId: string;
  plannedAt: string;
  postedAt: string;
  postUrl: string;
  generatedBody: string;
  aiPromptUsed: string;
}

const EMPTY_FORM: FormState = {
  title: '', status: 'idea', postType: 'image', platforms: [],
  caption: '', hashtags: '', cta: '', pollOptions: '', notes: '',
  bandId: '', albumId: '', songId: '', seriesId: '',
  plannedAt: '', postedAt: '', postUrl: '', generatedBody: '', aiPromptUsed: '',
};

function postToForm(p: SocialPost): FormState {
  return {
    title:        p.title,
    status:       p.status,
    postType:     p.postType,
    platforms:    p.platforms,
    caption:      p.caption      ?? '',
    hashtags:     p.hashtags.join(', '),
    cta:          p.cta          ?? '',
    pollOptions:  p.pollOptions.join('\n'),
    notes:        p.notes        ?? '',
    bandId:       p.bandId       ?? '',
    albumId:      p.albumId      ?? '',
    songId:       p.songId       ?? '',
    seriesId:     p.seriesId     ?? '',
    plannedAt:    p.plannedAt    ? p.plannedAt.slice(0, 16) : '',
    postedAt:     p.postedAt     ? p.postedAt.slice(0, 16)  : '',
    postUrl:      p.postUrl      ?? '',
    generatedBody: p.generatedBody ?? '',
    aiPromptUsed:  p.aiPromptUsed  ?? '',
  };
}

// Metric form
interface MetricForm {
  likes: string; comments: string; shares: string; saves: string;
  reach: string; views: string; groupPostedTo: string; notes: string;
  bestComments: string; futureIdeas: string;
}
const EMPTY_METRIC: MetricForm = {
  likes: '', comments: '', shares: '', saves: '', reach: '', views: '',
  groupPostedTo: '', notes: '', bestComments: '', futureIdeas: '',
};

// Asset form
interface AssetForm { assetType: AssetType; label: string; url: string; canvaDesignUrl: string; imagePrompt: string; canvaPrompt: string; notes: string; }
const EMPTY_ASSET: AssetForm = { assetType: 'image', label: '', url: '', canvaDesignUrl: '', imagePrompt: '', canvaPrompt: '', notes: '' };

export default function PostEditorDrawer({ postId, defaultDate, onClose, onContextChange }: Props) {
  const qc = useQueryClient();
  const isNew = postId === 'new';

  const [form,       setForm]       = useState<FormState>(() => {
    const base = { ...EMPTY_FORM };
    if (defaultDate) base.plannedAt = defaultDate.toISOString().slice(0, 16);
    return base;
  });
  const [metricForm, setMetricForm] = useState<MetricForm>(EMPTY_METRIC);
  const [assetForm,  setAssetForm]  = useState<AssetForm>(EMPTY_ASSET);
  const [activeTab,  setActiveTab]  = useState<'content' | 'assets' | 'metrics'>('content');
  const [addingAsset, setAddingAsset] = useState(false);

  // Lookup data
  const { data: bands = [] }   = useQuery({ queryKey: ['bands-simple'], queryFn: () => api.get<Band[]>('/api/bands') });
  const { data: allAlbums = [] } = useQuery({ queryKey: ['albums-simple'], queryFn: () => api.get<Album[]>('/api/albums') });
  const { data: allSongs = [] }  = useQuery({ queryKey: ['songs-simple'],  queryFn: () => api.get<Song[]>('/api/songs') });
  const { data: seriesList = [] } = useQuery({ queryKey: ['planner-series'], queryFn: plannerApi.listSeries });

  const albums = allAlbums.filter((a) => !form.bandId || a.bandId === form.bandId);
  const songs  = allSongs.filter((s) => !form.albumId || s.albumId === form.albumId);

  // Load existing post
  const { data: existingPost, isLoading: loadingPost } = useQuery({
    queryKey: ['planner-post', postId],
    queryFn: () => plannerApi.getPost(postId as string),
    enabled: !isNew && postId !== null,
  });

  useEffect(() => {
    if (existingPost) {
      setForm(postToForm(existingPost));
      if (existingPost.metrics) {
        const m = existingPost.metrics;
        setMetricForm({
          likes:         String(m.likes),
          comments:      String(m.comments),
          shares:        String(m.shares),
          saves:         String(m.saves),
          reach:         String(m.reach),
          views:         String(m.views),
          groupPostedTo: m.groupPostedTo  ?? '',
          notes:         m.notes          ?? '',
          bestComments:  m.bestComments.join('\n'),
          futureIdeas:   m.futureIdeas.join('\n'),
        });
      }
    }
  }, [existingPost]);

  // Update AI context hint whenever relevant fields change
  useEffect(() => {
    const parts: string[] = [];
    if (form.postType) parts.push(`Post type: ${POST_TYPES.find((t) => t.value === form.postType)?.label ?? form.postType}`);
    if (form.platforms.length) parts.push(`Platforms: ${form.platforms.join(', ')}`);
    if (form.bandId) {
      const b = bands.find((b) => b.id === form.bandId);
      if (b) parts.push(`Artist: ${b.name}`);
    }
    if (form.title) parts.push(`Title: ${form.title}`);
    onContextChange(parts.join(' | '));
  }, [form.postType, form.platforms, form.bandId, form.title, bands, onContextChange]);

  const createMutation = useMutation({
    mutationFn: (data: CreatePostInput) => plannerApi.createPost(data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['planner-posts'] }); void qc.invalidateQueries({ queryKey: ['planner-calendar'] }); onClose(); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdatePostInput) => plannerApi.updatePost(postId as string, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['planner-posts'] }); void qc.invalidateQueries({ queryKey: ['planner-calendar'] }); void qc.invalidateQueries({ queryKey: ['planner-post', postId] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => plannerApi.deletePost(postId as string),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['planner-posts'] }); void qc.invalidateQueries({ queryKey: ['planner-calendar'] }); onClose(); },
  });

  const metricMutation = useMutation({
    mutationFn: () => plannerApi.upsertMetrics(postId as string, {
      likes:    Number(metricForm.likes)    || 0,
      comments: Number(metricForm.comments) || 0,
      shares:   Number(metricForm.shares)   || 0,
      saves:    Number(metricForm.saves)    || 0,
      reach:    Number(metricForm.reach)    || 0,
      views:    Number(metricForm.views)    || 0,
      groupPostedTo: metricForm.groupPostedTo || undefined,
      notes:         metricForm.notes        || undefined,
      bestComments:  metricForm.bestComments.split('\n').map((s) => s.trim()).filter(Boolean),
      futureIdeas:   metricForm.futureIdeas.split('\n').map((s) => s.trim()).filter(Boolean),
    }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['planner-post', postId] }),
  });

  const addAssetMutation = useMutation({
    mutationFn: () => plannerApi.addAsset(postId as string, {
      assetType:     assetForm.assetType,
      label:         assetForm.label         || null,
      url:           assetForm.url           || null,
      canvaDesignUrl: assetForm.canvaDesignUrl || null,
      exportedPath:  null,
      imagePrompt:   assetForm.imagePrompt   || null,
      canvaPrompt:   assetForm.canvaPrompt   || null,
      notes:         assetForm.notes         || null,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['planner-post', postId] }); setAddingAsset(false); setAssetForm(EMPTY_ASSET); },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: plannerApi.deleteAsset,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['planner-post', postId] }),
  });

  function buildPostData() {
    return {
      title:    form.title,
      status:   form.status,
      postType: form.postType,
      platforms: form.platforms,
      caption:   form.caption   || undefined,
      hashtags:  form.hashtags.split(',').map((h) => h.trim()).filter(Boolean),
      cta:       form.cta       || undefined,
      pollOptions: form.pollOptions.split('\n').map((l) => l.trim()).filter(Boolean),
      notes:     form.notes     || undefined,
      bandId:    form.bandId    || undefined,
      albumId:   form.albumId   || undefined,
      songId:    form.songId    || undefined,
      seriesId:  form.seriesId  || undefined,
      plannedAt: form.plannedAt || undefined,
      generatedBody: form.generatedBody || undefined,
      aiPromptUsed:  form.aiPromptUsed  || undefined,
    };
  }

  function save() {
    if (isNew) {
      createMutation.mutate(buildPostData() as CreatePostInput);
    } else {
      const data: UpdatePostInput = {
        ...buildPostData(),
        postedAt:  form.postedAt || null,
        postUrl:   form.postUrl  || null,
        bandId:    form.bandId   || null,
        albumId:   form.albumId  || null,
        songId:    form.songId   || null,
        seriesId:  form.seriesId || null,
        plannedAt: form.plannedAt || null,
      };
      updateMutation.mutate(data);
    }
  }

  function togglePlatform(platform: string) {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(platform)
        ? f.platforms.filter((p) => p !== platform)
        : [...f.platforms, platform],
    }));
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;

  if (loadingPost) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-surface-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between shrink-0">
        <h2 className="text-base font-semibold text-surface-900">{isNew ? 'New post' : 'Edit post'}</h2>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={() => { if (confirm('Delete this post?')) deleteMutation.mutate(); }}
              className="px-3 py-1.5 border border-red-300 text-red-600 rounded text-sm hover:bg-red-50"
            >
              Delete
            </button>
          )}
          <button onClick={save} disabled={!form.title || isBusy}
            className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            {isBusy ? 'Saving…' : isNew ? 'Create post' : 'Save'}
          </button>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-700 text-lg ml-1">✕</button>
        </div>
      </div>

      {/* Tabs (only for existing posts) */}
      {!isNew && (
        <div className="flex border-b border-surface-200 shrink-0">
          {(['content', 'assets', 'metrics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-surface-500 hover:text-surface-800'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

        {/* ── Content tab ── */}
        {(isNew || activeTab === 'content') && (
          <>
            <Field label="Title *">
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border border-surface-300 rounded px-3 py-2 text-sm"
                placeholder="e.g. Lateralus — The Teachings of TOOL" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PostStatus }))}
                  className="w-full border border-surface-300 rounded px-3 py-2 text-sm">
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Post type">
                <select value={form.postType} onChange={(e) => setForm((f) => ({ ...f, postType: e.target.value }))}
                  className="w-full border border-surface-300 rounded px-3 py-2 text-sm">
                  {POST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Platforms">
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => togglePlatform(p.value)}
                    className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                      form.platforms.includes(p.value)
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-surface-300 text-surface-600 hover:border-surface-500'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Band">
                <select value={form.bandId}
                  onChange={(e) => setForm((f) => ({ ...f, bandId: e.target.value, albumId: '', songId: '' }))}
                  className="w-full border border-surface-300 rounded px-3 py-2 text-sm">
                  <option value="">— Any —</option>
                  {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Series">
                <select value={form.seriesId} onChange={(e) => setForm((f) => ({ ...f, seriesId: e.target.value }))}
                  className="w-full border border-surface-300 rounded px-3 py-2 text-sm">
                  <option value="">— None —</option>
                  {seriesList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>

            {form.bandId && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Album">
                  <select value={form.albumId}
                    onChange={(e) => setForm((f) => ({ ...f, albumId: e.target.value, songId: '' }))}
                    className="w-full border border-surface-300 rounded px-3 py-2 text-sm">
                    <option value="">— Any —</option>
                    {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                  </select>
                </Field>
                <Field label="Song">
                  <select value={form.songId} onChange={(e) => setForm((f) => ({ ...f, songId: e.target.value }))}
                    className="w-full border border-surface-300 rounded px-3 py-2 text-sm">
                    <option value="">— Any —</option>
                    {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned date/time">
                <input type="datetime-local" value={form.plannedAt}
                  onChange={(e) => setForm((f) => ({ ...f, plannedAt: e.target.value }))}
                  className="w-full border border-surface-300 rounded px-3 py-2 text-sm" />
              </Field>
              {!isNew && (
                <Field label="Posted date/time">
                  <input type="datetime-local" value={form.postedAt}
                    onChange={(e) => setForm((f) => ({ ...f, postedAt: e.target.value }))}
                    className="w-full border border-surface-300 rounded px-3 py-2 text-sm" />
                </Field>
              )}
            </div>

            {!isNew && (
              <Field label="Post URL (after publishing)">
                <input value={form.postUrl} onChange={(e) => setForm((f) => ({ ...f, postUrl: e.target.value }))}
                  className="w-full border border-surface-300 rounded px-3 py-2 text-sm"
                  placeholder="https://www.facebook.com/…" />
              </Field>
            )}

            <Field label="Caption">
              <textarea value={form.caption} onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
                rows={4} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-y"
                placeholder="Your post caption…" />
            </Field>

            <Field label="Hashtags (comma-separated)">
              <input value={form.hashtags} onChange={(e) => setForm((f) => ({ ...f, hashtags: e.target.value }))}
                className="w-full border border-surface-300 rounded px-3 py-2 text-sm"
                placeholder="#TOOL, #ToolBand, #Lateralus" />
            </Field>

            <Field label="CTA (call to action)">
              <input value={form.cta} onChange={(e) => setForm((f) => ({ ...f, cta: e.target.value }))}
                className="w-full border border-surface-300 rounded px-3 py-2 text-sm"
                placeholder="Comment below, Share with a fan, etc." />
            </Field>

            {form.postType === 'poll' && (
              <Field label="Poll options (one per line)">
                <textarea value={form.pollOptions} onChange={(e) => setForm((f) => ({ ...f, pollOptions: e.target.value }))}
                  rows={4} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none font-mono text-xs"
                  placeholder="Option A&#10;Option B&#10;Option C" />
              </Field>
            )}

            <Field label="AI-generated body">
              <textarea value={form.generatedBody} onChange={(e) => setForm((f) => ({ ...f, generatedBody: e.target.value }))}
                rows={4} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-y"
                placeholder="AI-generated content or draft…" />
            </Field>

            <Field label="AI prompt used">
              <textarea value={form.aiPromptUsed} onChange={(e) => setForm((f) => ({ ...f, aiPromptUsed: e.target.value }))}
                rows={2} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none font-mono text-xs"
                placeholder="The prompt you used to generate this content…" />
            </Field>

            <Field label="Internal notes">
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none"
                placeholder="Design direction, reminder for review, etc." />
            </Field>
          </>
        )}

        {/* ── Assets tab ── */}
        {!isNew && activeTab === 'assets' && existingPost && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-800">Attached assets</h3>
              <button onClick={() => setAddingAsset(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
                + Add asset
              </button>
            </div>

            {existingPost.assets.length === 0 && !addingAsset && (
              <p className="text-sm text-surface-400 text-center py-8">No assets yet. Add images, Canva links, or prompts.</p>
            )}

            <div className="space-y-3">
              {existingPost.assets.map((a) => (
                <div key={a.id} className="border border-surface-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-surface-600 uppercase tracking-wide">
                        {ASSET_TYPES.find((t) => t.value === a.assetType)?.label ?? a.assetType}
                      </span>
                      {a.label && <span className="ml-2 text-sm text-surface-900">{a.label}</span>}
                      {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 hover:underline truncate mt-0.5">{a.url}</a>}
                      {a.canvaDesignUrl && <a href={a.canvaDesignUrl} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 hover:underline truncate mt-0.5">Canva design ↗</a>}
                      {a.imagePrompt && <p className="text-xs text-surface-500 mt-1 font-mono">Image prompt: {a.imagePrompt}</p>}
                      {a.canvaPrompt && <p className="text-xs text-surface-500 mt-1 font-mono">Canva GPT: {a.canvaPrompt}</p>}
                      {a.notes && <p className="text-xs text-surface-500 mt-1">{a.notes}</p>}
                    </div>
                    <button onClick={() => { if (confirm('Remove asset?')) deleteAssetMutation.mutate(a.id); }}
                      className="text-xs text-red-500 hover:text-red-700 shrink-0">Remove</button>
                  </div>
                </div>
              ))}
            </div>

            {addingAsset && (
              <div className="border border-blue-200 rounded-lg p-4 space-y-3 bg-blue-50">
                <h4 className="text-sm font-semibold text-surface-900">New asset</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <select value={assetForm.assetType} onChange={(e) => setAssetForm((f) => ({ ...f, assetType: e.target.value as AssetType }))}
                      className="w-full border border-surface-300 rounded px-3 py-2 text-sm bg-white">
                      {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Label">
                    <input value={assetForm.label} onChange={(e) => setAssetForm((f) => ({ ...f, label: e.target.value }))}
                      className="w-full border border-surface-300 rounded px-3 py-2 text-sm bg-white" placeholder="e.g. Main image" />
                  </Field>
                </div>
                <Field label="URL / file path">
                  <input value={assetForm.url} onChange={(e) => setAssetForm((f) => ({ ...f, url: e.target.value }))}
                    className="w-full border border-surface-300 rounded px-3 py-2 text-sm bg-white" placeholder="https://… or /exports/image.png" />
                </Field>
                <Field label="Canva design URL">
                  <input value={assetForm.canvaDesignUrl} onChange={(e) => setAssetForm((f) => ({ ...f, canvaDesignUrl: e.target.value }))}
                    className="w-full border border-surface-300 rounded px-3 py-2 text-sm bg-white" placeholder="https://canva.com/design/…" />
                </Field>
                <Field label="Image generation prompt">
                  <textarea value={assetForm.imagePrompt} onChange={(e) => setAssetForm((f) => ({ ...f, imagePrompt: e.target.value }))}
                    rows={2} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none bg-white font-mono text-xs" />
                </Field>
                <Field label="Canva GPT prompt">
                  <textarea value={assetForm.canvaPrompt} onChange={(e) => setAssetForm((f) => ({ ...f, canvaPrompt: e.target.value }))}
                    rows={2} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none bg-white font-mono text-xs" />
                </Field>
                <Field label="Notes">
                  <input value={assetForm.notes} onChange={(e) => setAssetForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-surface-300 rounded px-3 py-2 text-sm bg-white" />
                </Field>
                <div className="flex gap-2">
                  <button onClick={() => addAssetMutation.mutate()} disabled={addAssetMutation.isPending}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                    {addAssetMutation.isPending ? 'Saving…' : 'Add asset'}
                  </button>
                  <button onClick={() => setAddingAsset(false)} className="text-sm text-surface-500 hover:text-surface-800">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Metrics tab ── */}
        {!isNew && activeTab === 'metrics' && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-surface-800">Performance metrics</h3>
            <div className="grid grid-cols-3 gap-3">
              {(['likes', 'comments', 'shares', 'saves', 'reach', 'views'] as const).map((key) => (
                <Field key={key} label={key.charAt(0).toUpperCase() + key.slice(1)}>
                  <input type="number" min="0" value={metricForm[key]}
                    onChange={(e) => setMetricForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-surface-300 rounded px-3 py-2 text-sm" />
                </Field>
              ))}
            </div>
            <Field label="Group posted to">
              <input value={metricForm.groupPostedTo}
                onChange={(e) => setMetricForm((f) => ({ ...f, groupPostedTo: e.target.value }))}
                className="w-full border border-surface-300 rounded px-3 py-2 text-sm"
                placeholder="e.g. TOOL Fans Worldwide" />
            </Field>
            <Field label="Notes — what worked">
              <textarea value={metricForm.notes}
                onChange={(e) => setMetricForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none" />
            </Field>
            <Field label="Best comments (one per line)">
              <textarea value={metricForm.bestComments}
                onChange={(e) => setMetricForm((f) => ({ ...f, bestComments: e.target.value }))}
                rows={4} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none font-mono text-xs" />
            </Field>
            <Field label="Future content ideas from this post (one per line)">
              <textarea value={metricForm.futureIdeas}
                onChange={(e) => setMetricForm((f) => ({ ...f, futureIdeas: e.target.value }))}
                rows={3} className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none" />
            </Field>
            <button onClick={() => metricMutation.mutate()} disabled={metricMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
              {metricMutation.isPending ? 'Saving…' : 'Save metrics'}
            </button>
            {metricMutation.isSuccess && <p className="text-xs text-green-600">Metrics saved.</p>}
          </div>
        )}
      </div>

      {/* Quick status bar for existing posts */}
      {!isNew && existingPost && (
        <div className="px-5 py-3 border-t border-surface-200 bg-surface-50 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => updateMutation.mutate({ status: s })}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  form.status === s ? STATUS_COLORS[s] : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

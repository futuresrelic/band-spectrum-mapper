import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adventureApi, adventureProgressApi } from '../../api/adventureApi';
import type { Adventure, ValidationResult, ImportPreview, AdventureHealth } from '../../api/adventureApi';
import AdventureWizard from './AdventureWizard';

export default function AdventureEditor() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'adventures' | 'import'>('adventures');
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-surface-200 pb-0">
        {(['adventures', 'import'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            {t === 'adventures' ? '🗂 Adventures' : '📦 Import / Export'}
          </button>
        ))}
      </div>

      {tab === 'adventures' && (
        <AdventuresTab showCreate={showCreate} setShowCreate={setShowCreate} qc={qc} />
      )}
      {tab === 'import' && <ImportTab qc={qc} />}
    </div>
  );
}

// ── Adventures list tab ───────────────────────────────────────────────────────

function AdventuresTab({ showCreate, setShowCreate, qc }: { showCreate: boolean; setShowCreate: (v: boolean) => void; qc: ReturnType<typeof useQueryClient> }) {
  const [showWizard, setShowWizard] = useState(false);
  const { data: adventures = [], isLoading } = useQuery({
    queryKey: ['adventures'],
    queryFn: () => adventureApi.list(),
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: adventureApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adventures'] }); setShowCreate(false); },
  });

  const deleteMut = useMutation({
    mutationFn: adventureApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adventures'] }),
  });

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) return <div className="text-surface-500 text-sm">Loading adventures…</div>;

  return (
    <>
      {showWizard && <AdventureWizard onClose={() => setShowWizard(false)} />}
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-surface-900">Adventures</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowWizard(true)} className="text-sm border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50">
            ✨ Quick Start
          </button>
          <button onClick={() => setShowCreate(!showCreate)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
            + New Adventure
          </button>
        </div>
      </div>

      {showCreate && (
        <form
          className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 space-y-3"
          onSubmit={e => { e.preventDefault(); createMut.mutate({ slug, name, description: desc || undefined }); }}
        >
          <h3 className="font-medium text-indigo-900">Create Adventure</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Slug *</label>
              <input
                value={slug} onChange={e => setSlug(e.target.value)} required placeholder="my-adventure"
                pattern="[a-z0-9-]+"
                className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Name *</label>
              <input
                value={name} onChange={e => setName(e.target.value)} required placeholder="My Adventure"
                className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
            <input
              value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description"
              className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createMut.isPending} className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {createMut.isPending ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="text-sm border border-surface-300 px-4 py-1.5 rounded-lg hover:bg-surface-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {adventures.length === 0 && (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-8 text-center">
          <p className="text-surface-400 text-sm">No adventures yet. Create one or import a JSON package.</p>
        </div>
      )}

      {adventures.map(adv => (
        <AdventureCard
          key={adv.id}
          adv={adv}
          isEditing={editingId === adv.id}
          onEdit={() => setEditingId(editingId === adv.id ? null : adv.id)}
          onDelete={() => {
            if (confirm(`Delete adventure "${adv.name}"? This only removes the adventure record — level/quest/item content is preserved but unlinked.`)) {
              deleteMut.mutate(adv.id);
            }
          }}
          qc={qc}
        />
      ))}
      </div>
    </>
  );
}

function AdventureCard({ adv, isEditing, onEdit, onDelete, qc }: {
  adv: Adventure; isEditing: boolean; onEdit: () => void; onDelete: () => void; qc: ReturnType<typeof useQueryClient>;
}) {
  const [exporting, setExporting] = useState(false);
  const [health, setHealth] = useState<AdventureHealth | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const updateMut = useMutation({
    mutationFn: (data: Parameters<typeof adventureApi.update>[1]) => adventureApi.update(adv.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adventures'] }); onEdit(); },
  });

  const [editName, setEditName] = useState(adv.name);
  const [editDesc, setEditDesc] = useState(adv.description ?? '');
  const [editAuthor, setEditAuthor] = useState(adv.authorName ?? '');
  const [editCover, setEditCover] = useState(adv.coverImageUrl ?? '');
  const [editDifficulty, setEditDifficulty] = useState(adv.difficulty ?? '');
  const [editPlaytime, setEditPlaytime] = useState(String(adv.estimatedPlaytime ?? ''));
  const [editTags, setEditTags] = useState((adv.tags ?? []).join(', '));
  const [editPublished, setEditPublished] = useState(adv.isPublished);
  const [editFeatured, setEditFeatured] = useState(adv.featured ?? false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await adventureApi.exportAdventure(adv.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${adv.slug}-adventure.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleHealth = async () => {
    setLoadingHealth(true);
    try {
      const result = await adventureProgressApi.health(adv.id);
      setHealth(result);
    } catch {
      alert('Health check failed');
    } finally {
      setLoadingHealth(false);
    }
  };

  const c = adv._count;

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-5">
      {isEditing ? (
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault();
            const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
            const playTime = editPlaytime ? parseInt(editPlaytime, 10) : undefined;
            updateMut.mutate({
              name: editName,
              ...(editDesc ? { description: editDesc } : {}),
              ...(editAuthor ? { authorName: editAuthor } : {}),
              ...(editCover ? { coverImageUrl: editCover } : {}),
              ...(editDifficulty ? { difficulty: editDifficulty } : {}),
              ...(playTime ? { estimatedPlaytime: playTime } : {}),
              tags,
              isPublished: editPublished,
              featured: editFeatured,
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Name *</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} required className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Author</label>
              <input value={editAuthor} onChange={e => setEditAuthor(e.target.value)} placeholder="Creator name" className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">Description</label>
              <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Short description" className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">Cover Image URL</label>
              <input value={editCover} onChange={e => setEditCover(e.target.value)} placeholder="https://…" className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5" />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Difficulty</label>
              <select value={editDifficulty} onChange={e => setEditDifficulty(e.target.value)} className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5">
                <option value="">—</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Est. Playtime (min)</label>
              <input type="number" value={editPlaytime} onChange={e => setEditPlaytime(e.target.value)} placeholder="30" min="1" className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-surface-600 mb-1">Tags (comma-separated)</label>
              <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="music, exploration, puzzle" className="w-full text-sm border border-surface-300 rounded-lg px-3 py-1.5" />
            </div>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editPublished} onChange={e => setEditPublished(e.target.checked)} />
              <span className="text-surface-700">Published</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editFeatured} onChange={e => setEditFeatured(e.target.checked)} />
              <span className="text-surface-700">Featured</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={updateMut.isPending} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 disabled:opacity-50">
              {updateMut.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onEdit} className="text-xs border border-surface-300 px-3 py-1 rounded hover:bg-surface-50">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            {adv.coverImageUrl && (
              <img src={adv.coverImageUrl} alt={adv.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-surface-900">{adv.name}</span>
                <span className="text-xs font-mono text-surface-400 bg-surface-100 px-2 py-0.5 rounded">/{adv.slug}</span>
                {adv.isPublished && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Published</span>}
                {(adv.featured ?? false) && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Featured</span>}
                {adv.difficulty && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full capitalize">{adv.difficulty}</span>}
              </div>
              {adv.authorName && <p className="text-xs text-surface-500 mb-1">by {adv.authorName}{adv.estimatedPlaytime ? ` · ${adv.estimatedPlaytime}min` : ''}</p>}
              {adv.description && <p className="text-sm text-surface-500 mb-2">{adv.description}</p>}
              {c && (
                <div className="flex gap-3 text-xs text-surface-400">
                  <span>📍 {c.levels} levels</span>
                  <span>📜 {c.quests} quests</span>
                  <span>📖 {c.arcs} arcs</span>
                  <span>🎒 {c.items} items</span>
                  {(c.progress ?? 0) > 0 && <span>👤 {c.progress} players</span>}
                </div>
              )}
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap justify-end">
              <button onClick={handleExport} disabled={exporting} className="text-xs border border-surface-300 bg-surface-50 hover:bg-surface-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
                {exporting ? 'Exporting…' : '⬇ Export'}
              </button>
              <button onClick={handleHealth} disabled={loadingHealth} className="text-xs border border-surface-300 bg-surface-50 hover:bg-surface-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
                {loadingHealth ? 'Checking…' : '🏥 Health'}
              </button>
              <button onClick={onEdit} className="text-xs border border-surface-300 px-3 py-1.5 rounded-lg hover:bg-surface-50">Edit</button>
              <button onClick={onDelete} className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50">Delete</button>
            </div>
          </div>
          {health && <HealthPanel health={health} onClose={() => setHealth(null)} />}
        </div>
      )}
    </div>
  );
}

function HealthPanel({ health, onClose }: { health: AdventureHealth; onClose: () => void }) {
  const colour = health.score >= 80 ? 'emerald' : health.score >= 50 ? 'amber' : 'red';
  return (
    <div className={`rounded-xl border p-4 bg-${colour}-50 border-${colour}-200`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold text-${colour}-700`}>{health.score}/100</span>
          <span className={`text-sm text-${colour}-600`}>Health Score</span>
        </div>
        <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-lg">×</button>
      </div>
      <div className="space-y-1.5">
        {health.checks.map(check => (
          <div key={check.name} className="flex items-center gap-2 text-sm">
            <span>{check.passed ? '✓' : '✗'}</span>
            <span className={check.passed ? 'text-surface-700' : 'text-red-700'}>{check.name}</span>
            <span className="text-surface-400 text-xs">({check.weight}pts)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Import tab ────────────────────────────────────────────────────────────────

function ImportTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [jsonText, setJsonText] = useState('');
  const [mode, setMode] = useState<'create' | 'update' | 'replace'>('create');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; adventureId?: string; imported?: ImportPreview; errors?: { path: string; message: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleValidate = async () => {
    setValidation(null);
    setImportResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setValidation({ valid: false, errors: [{ path: 'json', message: `Invalid JSON syntax — ${String(e)}` }], preview: null });
      return;
    }

    try {
      const result = await adventureApi.validate(parsed);
      setValidation(result);
    } catch (e) {
      const err = e as Error & { status?: number };
      const isAuth = err.status === 401 || err.status === 403;
      setValidation({
        valid: false,
        errors: [{
          path: isAuth ? 'auth' : 'server',
          message: isAuth
            ? 'Authentication required. Please sign in as admin and try again.'
            : (err.message ?? 'Server error. Please try again.'),
        }],
        preview: null,
      });
    }
  };

  const handleImport = async () => {
    if (!jsonText) return;
    setImporting(true);
    setImportResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setImportResult({ ok: false, errors: [{ path: 'json', message: `Invalid JSON syntax — ${String(e)}` }] });
      setImporting(false);
      return;
    }

    try {
      const result = await adventureApi.import(parsed, mode);
      setImportResult(result);
      if (result.ok) qc.invalidateQueries({ queryKey: ['adventures'] });
    } catch (e) {
      const err = e as Error & { status?: number; body?: Record<string, unknown> };
      const isAuth = err.status === 401 || err.status === 403;
      if (isAuth) {
        setImportResult({ ok: false, errors: [{ path: 'auth', message: 'Authentication required. Please sign in as admin and try again.' }] });
      } else {
        // Surface server-provided validation errors from the 422 response body
        const rawErrors = err.body?.['errors'];
        const serverErrors: { path: string; message: string }[] | null =
          Array.isArray(rawErrors) && rawErrors.length > 0
            ? (rawErrors as { path: string; message: string }[])
            : null;
        setImportResult({
          ok: false,
          errors: serverErrors ?? [{ path: 'server', message: err.message ?? 'Server error. Please try again.' }],
        });
      }
    } finally {
      setImporting(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setJsonText(ev.target?.result as string ?? ''); setValidation(null); setImportResult(null); };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-900 mb-1">Import Adventure Package</h2>
        <p className="text-sm text-amber-800">Paste or upload a Band RPG adventure JSON package. Validate before importing to catch errors.</p>
      </div>

      {/* Mode selector */}
      <div className="rounded-xl border border-surface-200 bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold text-surface-800">Import Mode</h3>
        <div className="space-y-2">
          {([
            { value: 'create', label: 'Create New Adventure', desc: 'Fails if any slug already exists. Safest for fresh imports.' },
            { value: 'update', label: 'Update Existing Adventure', desc: 'Upserts by slug. Existing content is updated; new content is added.' },
            { value: 'replace', label: 'Replace Existing Adventure', desc: 'Deletes all existing adventure content, then recreates. Player progress is preserved.' },
          ] as const).map(({ value, label, desc }) => (
            <label key={value} className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5" />
              <div>
                <div className="text-sm font-medium text-surface-800">{label}</div>
                <div className="text-xs text-surface-500">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* JSON input */}
      <div className="rounded-xl border border-surface-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-800">Adventure JSON</h3>
          <button onClick={() => fileRef.current?.click()} className="text-xs border border-surface-300 px-3 py-1 rounded-lg hover:bg-surface-50">
            📁 Upload JSON file
          </button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
        </div>
        <textarea
          value={jsonText}
          onChange={e => { setJsonText(e.target.value); setValidation(null); setImportResult(null); }}
          placeholder={'Paste adventure JSON here…\n\nExample structure:\n{\n  "bandRpgAdventureVersion": 1,\n  "adventure": { "slug": "my-adventure", "name": "My Adventure" },\n  "items": [],\n  "quests": [],\n  "arcs": [],\n  "levels": [],\n  "timeline": []\n}'}
          className="w-full text-xs font-mono border border-surface-200 rounded-lg p-3 bg-surface-50 resize-y"
          rows={16}
          style={{ minHeight: 280 }}
        />
        <div className="flex gap-2">
          <button
            onClick={handleValidate}
            disabled={!jsonText.trim()}
            className="text-sm border border-indigo-300 text-indigo-700 px-4 py-1.5 rounded-lg hover:bg-indigo-50 disabled:opacity-40"
          >
            ✓ Validate
          </button>
          <button
            onClick={handleImport}
            disabled={!jsonText.trim() || importing || (validation !== null && !validation.valid)}
            className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-40"
          >
            {importing ? 'Importing…' : `⬆ Import (${mode})`}
          </button>
        </div>
      </div>

      {/* Validation result */}
      {validation && (
        <div className={`rounded-xl border p-5 space-y-3 ${validation.valid ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <h3 className={`font-semibold ${validation.valid ? 'text-emerald-900' : 'text-red-900'}`}>
            {validation.valid ? '✓ Validation passed' : `✗ ${validation.errors.length} validation error${validation.errors.length !== 1 ? 's' : ''}`}
          </h3>
          {validation.errors.length > 0 && (
            <ul className="space-y-1">
              {validation.errors.map((e, i) => (
                <li key={i} className="text-sm text-red-700">
                  <span className="font-mono text-red-500">{e.path}</span>: {e.message}
                </li>
              ))}
            </ul>
          )}
          {validation.preview && <ImportPreviewPanel preview={validation.preview} />}
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className={`rounded-xl border p-5 space-y-3 ${importResult.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <h3 className={`font-semibold ${importResult.ok ? 'text-emerald-900' : 'text-red-900'}`}>
            {importResult.ok
              ? '✓ Import successful'
              : `✗ Import failed${importResult.errors?.length ? ` — ${importResult.errors.length} issue${importResult.errors.length !== 1 ? 's' : ''}` : ''}`}
          </h3>
          {!importResult.ok && validation?.valid && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              Validation passed, but the server rejected the import. See details below.
            </p>
          )}
          {importResult.errors && importResult.errors.length > 0 && (
            <ul className="space-y-1">
              {importResult.errors.map((e, i) => (
                <li key={i} className="text-sm text-red-700">
                  <span className="font-mono text-red-500">{e.path}</span>: {e.message}
                </li>
              ))}
            </ul>
          )}
          {importResult.ok && importResult.imported && <ImportPreviewPanel preview={importResult.imported} />}
        </div>
      )}

      {/* Sample template reference */}
      <div className="rounded-xl border border-surface-200 bg-surface-50 p-5">
        <h3 className="text-sm font-semibold text-surface-700 mb-2">📄 Adventure JSON Reference</h3>
        <p className="text-xs text-surface-500 mb-3">
          See <code className="bg-surface-200 px-1 rounded">docs/ADVENTURE_FORMAT.md</code> for the full schema and
          {' '}<code className="bg-surface-200 px-1 rounded">docs/sample-adventure.json</code> for a working example.
        </p>
        <div className="text-xs text-surface-400 space-y-1">
          <div><strong>Required:</strong> <code>adventure.slug</code>, <code>adventure.name</code></div>
          <div><strong>Optional sections:</strong> <code>items</code>, <code>quests</code>, <code>arcs</code>, <code>levels</code>, <code>timeline</code></div>
          <div><strong>Cross-references:</strong> use <code>targetSlug</code> (items/quests) or <code>targetName</code> (doors/switches/NPCs) in conditions and actions</div>
          <div><strong>Version field:</strong> <code>bandRpgAdventureVersion: 1</code> — always include</div>
        </div>
      </div>
    </div>
  );
}

function ImportPreviewPanel({ preview }: { preview: ImportPreview }) {
  const rows = [
    ['Levels', preview.levelCount],
    ['NPCs', preview.npcCount],
    ['Objectives', preview.objectiveCount],
    ['Quests', preview.questCount],
    ['Story Arcs', preview.arcCount],
    ['Items', preview.itemCount],
    ['Story Beats', preview.beatCount],
    ['Doors', preview.doorCount],
    ['Switches', preview.switchCount],
    ['Puzzles', preview.puzzleCount],
    ['Timeline Events', preview.timelineCount],
  ] as const;

  return (
    <div>
      <div className="text-xs font-semibold text-surface-700 mb-2">This import will create:</div>
      <div className="grid grid-cols-3 gap-1">
        {rows.filter(([, v]) => v > 0).map(([label, value]) => (
          <div key={label} className="flex items-center gap-1 text-xs text-surface-700">
            <span className="font-semibold text-surface-900">{value}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

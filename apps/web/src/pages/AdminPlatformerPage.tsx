/**
 * AdminPlatformerPage — configure the BSM 2D Platformer game.
 *
 * Four sections:
 *   1. Hero & Sprites  — upload / preview / remove per-asset-type sprites
 *   2. Gameplay Config — gravity, jumpForce, playerSpeed, recordsPerLevel, enemySpeed
 *   3. Leaderboard     — top 10 scores at a glance
 *   4. Info / Tips     — static guidance for the admin
 *
 * Route: /admin/platformer  (must be registered in App.tsx)
 */

import { useState, useRef, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformerApi, type PlatformerAsset, type PlatformerMember, type CharacterSkin } from '../api/platformer';
import { api } from '../lib/api';
import { SpritePixelEditor, SPRITE_SIZES } from '../components/SpritePixelEditor';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSET_TYPES = ['hero', 'bg1', 'bg2', 'bg3', 'enemy', 'collectible'] as const;
type AssetType = (typeof ASSET_TYPES)[number];

const ASSET_LABELS: Record<AssetType, string> = {
  hero:        'Hero Character',
  bg1:         'Background Layer 1 (far)',
  bg2:         'Background Layer 2 (mid)',
  bg3:         'Background Layer 3 (near)',
  enemy:       'Enemy Character',
  collectible: 'Collectible Override (replaces vinyl record)',
};

/** Asset types that expose sprite-sheet frame fields. */
const ANIMATED_TYPES = new Set<AssetType>(['hero', 'enemy']);

interface ConfigField {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  isInt: boolean;
}

const CONFIG_FIELDS: ConfigField[] = [
  { key: 'gravity',         label: 'Gravity',           min: 0.1, max: 2.0,  step: 0.05, defaultValue: 0.6,  isInt: false },
  { key: 'jumpForce',       label: 'Jump Force',        min: 5,   max: 20,   step: 0.5,  defaultValue: 12.5, isInt: false },
  { key: 'playerSpeed',     label: 'Player Speed',      min: 1,   max: 10,   step: 0.5,  defaultValue: 4.5,  isInt: false },
  { key: 'recordsPerLevel', label: 'Records Per Level', min: 3,   max: 20,   step: 1,    defaultValue: 10,   isInt: true  },
  { key: 'enemySpeed',      label: 'Enemy Speed',       min: 0.5, max: 5,    step: 0.25, defaultValue: 1.5,  isInt: false },
];

// ---------------------------------------------------------------------------
// Helper: read a File as a base64 data URL
// ---------------------------------------------------------------------------

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Sub-component: single sprite card
// ---------------------------------------------------------------------------

interface SpriteCardProps {
  assetType: AssetType;
  existing: PlatformerAsset | null;
  onSaved: () => void;
}

function SpriteCard({ assetType, existing, onSaved }: SpriteCardProps) {
  const [preview, setPreview]         = useState<string | null>(null);
  const [name, setName]               = useState('');
  const [frameCount, setFrameCount]   = useState(1);
  const [frameWidth, setFrameWidth]   = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);
  const [saving, setSaving]           = useState(false);
  const [removing, setRemoving]       = useState(false);
  const [msg, setMsg]                 = useState<{ text: string; ok: boolean } | null>(null);
  const [editorOpen, setEditorOpen]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sw, sh] = SPRITE_SIZES[assetType] ?? [32, 32];

  const isAnimated = ANIMATED_TYPES.has(assetType);
  const hasPreview = preview !== null;
  const displayUrl = preview ?? existing?.dataUrl ?? null;

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setPreview(dataUrl);
    if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
  }

  async function handleSave() {
    if (!preview) return;
    setSaving(true);
    try {
      const metadata = isAnimated
        ? {
            ...(frameCount > 0 ? { frameCount } : {}),
            ...(frameWidth  > 0 ? { frameWidth }  : {}),
            ...(frameHeight > 0 ? { frameHeight } : {}),
          }
        : undefined;

      await platformerApi.uploadAsset({
        assetType,
        name: name.trim() || assetType,
        dataUrl: preview,
        ...(metadata ? { metadata } : {}),
      });

      setPreview(null);
      setName('');
      setFrameCount(1);
      setFrameWidth(0);
      setFrameHeight(0);
      if (fileRef.current) fileRef.current.value = '';
      flash('Saved successfully.', true);
      onSaved();
    } catch {
      flash('Save failed. Please try again.', false);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove the "${ASSET_LABELS[assetType]}" sprite? This cannot be undone.`)) return;
    setRemoving(true);
    try {
      await platformerApi.deleteAsset(assetType);
      flash('Removed.', true);
      onSaved();
    } catch {
      flash('Remove failed.', false);
    } finally {
      setRemoving(false);
    }
  }

  function handleCancel() {
    setPreview(null);
    setName('');
    setFrameCount(1);
    setFrameWidth(0);
    setFrameHeight(0);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleEditorSave(dataUrl: string) {
    await platformerApi.uploadAsset({
      assetType,
      name: assetType,
      dataUrl,
    });
    flash('Saved from editor.', true);
    onSaved();
  }

  return (
    <>
    {editorOpen && (
      <SpritePixelEditor
        assetType={assetType}
        label={ASSET_LABELS[assetType]}
        spriteW={sw}
        spriteH={sh}
        initialDataUrl={existing?.dataUrl ?? null}
        onSave={handleEditorSave}
        onClose={() => setEditorOpen(false)}
      />
    )}
    <div className="bg-white border border-surface-200 rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-surface-800">{ASSET_LABELS[assetType]}</p>
          <p className="text-xs text-surface-400 font-mono mt-0.5">{assetType}</p>
        </div>
        {existing && !hasPreview && (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 shrink-0">
            Active
          </span>
        )}
      </div>

      {/* Image preview */}
      {displayUrl ? (
        <div className="rounded-lg overflow-hidden border border-surface-200 bg-surface-50 flex items-center justify-center"
             style={{ minHeight: 96 }}>
          <img
            src={displayUrl}
            alt={assetType}
            className="max-h-40 max-w-full object-contain"
          />
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-surface-200 bg-surface-50 flex items-center justify-center text-surface-400 text-xs"
             style={{ minHeight: 96 }}>
          No sprite uploaded — game will use built-in graphics
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { void handleFile(e); }}
      />

      {/* Upload trigger */}
      {!hasPreview && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm px-4 py-2 rounded-lg bg-surface-900 hover:bg-surface-700 text-white font-medium transition-colors"
          >
            {existing ? 'Replace' : 'Upload'}
          </button>
          <button
            onClick={() => setEditorOpen(true)}
            className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            title="Open pixel editor — draw or edit the sprite directly in the browser"
          >
            Edit Pixels
          </button>
          {existing && (
            <button
              onClick={() => { void handleRemove(); }}
              disabled={removing}
              className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {removing ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      )}

      {/* Staging: name + optional frame fields + Save/Cancel */}
      {hasPreview && (
        <div className="space-y-3 border-t border-surface-100 pt-3">
          <div>
            <label className="text-xs font-medium text-surface-600 block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={assetType}
              className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {isAnimated && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-surface-600 block mb-1">Frame count</label>
                <input
                  type="number"
                  min={1}
                  value={frameCount}
                  onChange={(e) => setFrameCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600 block mb-1">Frame width px</label>
                <input
                  type="number"
                  min={0}
                  value={frameWidth || ''}
                  placeholder="auto"
                  onChange={(e) => setFrameWidth(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-surface-600 block mb-1">Frame height px</label>
                <input
                  type="number"
                  min={0}
                  value={frameHeight || ''}
                  placeholder="auto"
                  onChange={(e) => setFrameHeight(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { void handleSave(); }}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg border border-surface-300 text-surface-600 hover:bg-surface-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline feedback */}
      {msg && (
        <p className={`text-xs font-medium ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: gameplay config section
// ---------------------------------------------------------------------------

function parseConfigValue(raw: string | undefined, field: ConfigField): number {
  const n = parseFloat(raw ?? '');
  if (isNaN(n)) return field.defaultValue;
  return field.isInt ? Math.round(n) : n;
}

interface GameplayConfigProps {
  initialConfig: Record<string, string>;
}

function GameplayConfig({ initialConfig }: GameplayConfigProps) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      CONFIG_FIELDS.map((f) => [f.key, parseConfigValue(initialConfig[f.key], f)]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  function handleChange(key: string, raw: number, isInt: boolean) {
    setValues((prev) => ({ ...prev, [key]: isInt ? Math.round(raw) : raw }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, string> = Object.fromEntries(
        CONFIG_FIELDS.map((f) => [f.key, String(values[f.key] ?? f.defaultValue)]),
      );
      await platformerApi.saveConfig(payload);
      flash('Config saved.', true);
    } catch {
      flash('Save failed. Please try again.', false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-surface-200 rounded-xl p-6">
      <h2 className="text-sm font-semibold text-surface-700 mb-5">Gameplay Parameters</h2>

      <div className="space-y-5">
        {CONFIG_FIELDS.map((field) => {
          const val = values[field.key] ?? field.defaultValue;
          return (
            <div key={field.key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-surface-700">{field.label}</label>
                <span className="text-sm font-bold font-mono text-indigo-600 w-16 text-right">
                  {field.isInt ? val : val.toFixed(field.step < 0.1 ? 2 : 1)}
                </span>
              </div>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={val}
                onChange={(e) => handleChange(field.key, parseFloat(e.target.value), field.isInt)}
                className="w-full accent-indigo-600"
              />
              <div className="flex justify-between text-[11px] text-surface-400 mt-0.5">
                <span>{field.min}</span>
                <span>{field.max}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={() => { void handleSave(); }}
          disabled={saving}
          className="bg-surface-900 hover:bg-surface-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save Config'}
        </button>
        {msg && (
          <span className={`text-sm font-medium ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MembersAndSkins section
// ---------------------------------------------------------------------------

interface BandStub { id: string; name: string; }

function MembersAndSkins() {
  const queryClient = useQueryClient();
  const [addBandId, setAddBandId] = useState('');
  const [addName, setAddName]     = useState('');
  const [addRole, setAddRole]     = useState('');
  const [addMsg, setAddMsg]       = useState<{ text: string; ok: boolean } | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const { data: bands = [] } = useQuery<BandStub[]>({
    queryKey: ['bands-list'],
    queryFn: () => api.get<BandStub[]>('/api/bands'),
    staleTime: 120_000,
  });

  const { data: members = [] } = useQuery<PlatformerMember[]>({
    queryKey: ['platformer-members'],
    queryFn: () => platformerApi.getMembers(),
    staleTime: 30_000,
  });

  const { data: pendingSkins = [] } = useQuery<CharacterSkin[]>({
    queryKey: ['platformer-skins-pending'],
    queryFn: () => platformerApi.getPendingSkins(),
    staleTime: 30_000,
  });

  const { data: approvedSkins = [] } = useQuery<CharacterSkin[]>({
    queryKey: ['platformer-skins-approved'],
    queryFn: () => platformerApi.getSkins(),
    staleTime: 30_000,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['platformer-members'] });
    void queryClient.invalidateQueries({ queryKey: ['platformer-skins-pending'] });
    void queryClient.invalidateQueries({ queryKey: ['platformer-skins-approved'] });
  }

  function flash(setter: (v: { text: string; ok: boolean } | null) => void, text: string, ok: boolean) {
    setter({ text, ok });
    setTimeout(() => setter(null), 4000);
  }

  const addMemberMut = useMutation({
    mutationFn: () => platformerApi.addMember({ bandId: addBandId, name: addName.trim(), role: addRole.trim() || undefined }),
    onSuccess: () => {
      setAddName(''); setAddRole('');
      flash(setAddMsg, 'Member added.', true);
      invalidate();
    },
    onError: () => flash(setAddMsg, 'Failed to add member.', false),
  });

  const deleteMemberMut = useMutation({
    mutationFn: (id: string) => platformerApi.deleteMember(id),
    onSuccess: () => invalidate(),
  });

  const approveSkinMut = useMutation({
    mutationFn: (id: string) => platformerApi.approveSkin(id),
    onSuccess: () => invalidate(),
  });

  const deleteSkinMut = useMutation({
    mutationFn: (id: string) => platformerApi.deleteSkin(id),
    onSuccess: () => invalidate(),
  });

  async function handleAiGenerate(member: PlatformerMember) {
    const band = bands.find((b) => b.id === member.bandId);
    if (!band) return;
    setGeneratingId(member.id);
    setGenMsg(null);
    try {
      await platformerApi.aiGenerateSkin({
        memberId: member.id,
        memberName: member.name,
        memberRole: member.role,
        bandName: band.name,
      });
      flash(setGenMsg, `AI skin generated for ${member.name}.`, true);
      invalidate();
    } catch (err: unknown) {
      const msg = (err as { error?: string })?.error
        ?? (err instanceof Error ? err.message : 'Unknown error');
      flash(setGenMsg, `Failed: ${msg}`, false);
    } finally {
      setGeneratingId(null);
    }
  }

  // Group members by band for display
  const membersByBand = members.reduce<Record<string, { band: BandStub; members: PlatformerMember[] }>>((acc, m) => {
    const band = bands.find((b) => b.id === m.bandId);
    if (!band) return acc;
    if (!acc[m.bandId]) acc[m.bandId] = { band, members: [] };
    acc[m.bandId]!.members.push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-8">

      {/* ── Add member ────────────────────────────────────────────────── */}
      <div className="bg-white border border-surface-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-surface-800 mb-4">Add Band Member</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-xs text-surface-500 font-medium">Band</label>
            <select
              value={addBandId}
              onChange={(e) => setAddBandId(e.target.value)}
              className="border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— pick a band —</option>
              {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs text-surface-500 font-medium">Name</label>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Member name"
              className="border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
            <label className="text-xs text-surface-500 font-medium">Role (optional)</label>
            <input
              type="text"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              placeholder="e.g. vocals, guitar"
              className="border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={() => { void addMemberMut.mutate(); }}
            disabled={!addBandId || !addName.trim() || addMemberMut.isPending}
            className="bg-surface-900 hover:bg-surface-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors self-end"
          >
            {addMemberMut.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addMsg && (
          <p className={`text-sm mt-3 font-medium ${addMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{addMsg.text}</p>
        )}
      </div>

      {/* ── Members list with AI generate ─────────────────────────────── */}
      {Object.values(membersByBand).length > 0 && (
        <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Band Members</h3>
            {genMsg && (
              <p className={`text-xs mt-1 font-medium ${genMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{genMsg.text}</p>
            )}
          </div>
          <div className="divide-y divide-surface-100">
            {Object.values(membersByBand).map(({ band, members: bMembers }) => (
              <div key={band.id} className="px-5 py-3">
                <p className="text-xs font-bold uppercase tracking-widest text-surface-400 mb-2">{band.name}</p>
                <div className="space-y-2">
                  {bMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-surface-800">{m.name}</span>
                        {m.role && <span className="text-xs text-surface-400 ml-2">{m.role}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { void handleAiGenerate(m); }}
                          disabled={generatingId === m.id}
                          className="text-xs bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 border border-indigo-200 rounded px-3 py-1 transition-colors font-medium"
                        >
                          {generatingId === m.id ? 'Generating…' : 'AI Sprite'}
                        </button>
                        <button
                          onClick={() => { void deleteMemberMut.mutate(m.id); }}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors px-2 py-1"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {members.length === 0 && (
        <p className="text-sm text-surface-400 text-center py-4">No members added yet. Add some above.</p>
      )}

      {/* ── Pending skins ─────────────────────────────────────────────── */}
      {pendingSkins.length > 0 && (
        <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Pending Submissions ({pendingSkins.length})</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
            {pendingSkins.map((skin) => (
              <div key={skin.id} className="flex flex-col gap-2 bg-surface-50 border border-surface-200 rounded-xl p-3">
                <img
                  src={skin.dataUrl}
                  alt={skin.name}
                  className="w-full aspect-square object-cover rounded-lg"
                  style={{ imageRendering: 'pixelated' }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-surface-800 truncate">{skin.name}</p>
                  {skin.member && <p className="text-xs text-surface-500">{skin.member.name}</p>}
                  {skin.band && <p className="text-xs text-surface-400">{skin.band.name}</p>}
                  {skin.submittedBy && (
                    <p className="text-xs text-surface-400">by {skin.submittedBy.name ?? 'user'}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { void approveSkinMut.mutate(skin.id); }}
                    className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-2 py-1.5 font-medium transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { void deleteSkinMut.mutate(skin.id); }}
                    className="flex-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded px-2 py-1.5 font-medium transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Approved skins ─────────────────────────────────────────────── */}
      {approvedSkins.length > 0 && (
        <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-100">
            <h3 className="text-sm font-semibold text-surface-800">Approved Skins ({approvedSkins.length})</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-5">
            {approvedSkins.map((skin) => (
              <div key={skin.id} className="flex flex-col gap-2 bg-surface-50 border border-surface-200 rounded-xl p-3">
                <img
                  src={skin.dataUrl}
                  alt={skin.name}
                  className="w-full aspect-square object-cover rounded-lg"
                  style={{ imageRendering: 'pixelated' }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-surface-800 truncate">{skin.name}</p>
                  {skin.member && <p className="text-xs text-surface-500">{skin.member.name}</p>}
                  {skin.band && <p className="text-xs text-surface-400">{skin.band.name}</p>}
                  {skin.isAiGenerated && (
                    <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-200 rounded px-1.5 py-0.5 font-medium">AI</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${skin.name}"?`)) {
                      void deleteSkinMut.mutate(skin.id);
                    }
                  }}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPlatformerPage() {
  const queryClient = useQueryClient();

  // ── Assets ─────────────────────────────────────────────────────────────────
  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['platformer-assets'],
    queryFn: () => platformerApi.getAssets(),
    staleTime: 60_000,
  });

  function invalidateAssets() {
    void queryClient.invalidateQueries({ queryKey: ['platformer-assets'] });
  }

  function existingAsset(type: AssetType): PlatformerAsset | null {
    return assets.find((a) => a.assetType === type) ?? null;
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['platformer-config'],
    queryFn: () => platformerApi.getConfig(),
    staleTime: 60_000,
  });

  // ── Leaderboard ────────────────────────────────────────────────────────────
  const { data: scores = [], isLoading: scoresLoading } = useQuery({
    queryKey: ['platformer-scores', 10],
    queryFn: () => platformerApi.getScores(10),
    staleTime: 30_000,
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-surface-900">Platformer Admin</h1>
        <p className="text-sm text-surface-500 mt-1">Configure sprites, gameplay parameters, and review the leaderboard for the BSM 2D Platformer.</p>
      </div>

      <div className="space-y-10">

        {/* ── SECTION 1: Hero & Sprites ─────────────────────────────────── */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-bold text-surface-900">Hero &amp; Sprites</h2>
            <p className="text-sm text-surface-500 mt-0.5">
              Upload custom PNG sprites for each game element. Images are stored in the database — no external storage needed.
            </p>
          </div>

          {assetsLoading ? (
            <div className="text-sm text-surface-400 py-6 text-center">Loading assets…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ASSET_TYPES.map((type) => (
                <SpriteCard
                  key={type}
                  assetType={type}
                  existing={existingAsset(type)}
                  onSaved={invalidateAssets}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── SECTION 2: Gameplay Config ────────────────────────────────── */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-bold text-surface-900">Gameplay Config</h2>
            <p className="text-sm text-surface-500 mt-0.5">
              Tune the physics and pacing of the game. Changes take effect on the next play session.
            </p>
          </div>

          {configLoading ? (
            <div className="text-sm text-surface-400 py-6 text-center">Loading config…</div>
          ) : (
            <GameplayConfig initialConfig={config ?? {}} />
          )}
        </section>

        {/* ── SECTION 3: Members & Skins ───────────────────────────────── */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-bold text-surface-900">Band Members &amp; Character Skins</h2>
            <p className="text-sm text-surface-500 mt-0.5">
              Add band members, generate AI pixel-art sprites, and approve or reject community skin submissions.
            </p>
          </div>
          <MembersAndSkins />
        </section>

        {/* ── SECTION 4: Leaderboard Preview ───────────────────────────── */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-bold text-surface-900">Leaderboard</h2>
            <p className="text-sm text-surface-500 mt-0.5">Top 10 all-time scores.</p>
          </div>

          {scoresLoading ? (
            <div className="text-sm text-surface-400 py-6 text-center">Loading scores…</div>
          ) : scores.length === 0 ? (
            <div className="bg-white border border-surface-200 rounded-xl p-8 text-center text-surface-400 text-sm">
              No scores yet — be the first to play the BSM Platformer!
            </div>
          ) : (
            <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 border-b border-surface-200">
                    <tr className="text-left">
                      <th className="py-3 px-4 font-medium text-surface-600 w-10">Rank</th>
                      <th className="py-3 px-4 font-medium text-surface-600">Player</th>
                      <th className="py-3 px-4 font-medium text-surface-600 text-right">Score</th>
                      <th className="py-3 px-4 font-medium text-surface-600 text-right">Level</th>
                      <th className="py-3 px-4 font-medium text-surface-600 text-right">Records</th>
                      <th className="py-3 px-4 font-medium text-surface-600 whitespace-nowrap">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((entry) => (
                      <tr
                        key={entry.rank}
                        className="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors"
                      >
                        <td className="py-2.5 px-4 tabular-nums text-surface-400 font-medium">
                          {entry.rank === 1 ? (
                            <span className="text-amber-500 font-bold">#1</span>
                          ) : (
                            `#${entry.rank}`
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            {entry.avatarUrl ? (
                              <img src={entry.avatarUrl} alt="" className="w-6 h-6 rounded-full shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-surface-200 flex items-center justify-center text-xs text-surface-500 shrink-0 font-bold">
                                {entry.playerName[0]?.toUpperCase() ?? '?'}
                              </div>
                            )}
                            <span className="font-medium text-surface-800 truncate max-w-[160px]">
                              {entry.playerName}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-indigo-600 tabular-nums">
                          {entry.score.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 text-right text-surface-500 tabular-nums">
                          {entry.level}
                        </td>
                        <td className="py-2.5 px-4 text-right text-surface-500 tabular-nums">
                          {entry.recordsCollected}
                        </td>
                        <td className="py-2.5 px-4 text-surface-400 text-xs whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── SECTION 4: Info / Tips ────────────────────────────────────── */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-bold text-surface-900">Tips &amp; Notes</h2>
          </div>

          <div className="bg-surface-50 border border-surface-200 rounded-xl p-6 space-y-3 text-sm text-surface-700">
            <div className="flex gap-3">
              <span className="text-surface-400 shrink-0 mt-0.5">—</span>
              <p>
                <strong>Storage:</strong> Sprites are stored in the database as base64 images.
                No external file storage or CDN is required.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-surface-400 shrink-0 mt-0.5">—</span>
              <p>
                <strong>Hero &amp; enemy sprites:</strong> Use PNG files with a transparent background
                for the cleanest in-game appearance.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-surface-400 shrink-0 mt-0.5">—</span>
              <p>
                <strong>Background layers:</strong> Use wide images (at least 800 px) so they tile
                smoothly during horizontal scrolling. Each layer scrolls at a different speed to create
                a parallax effect (bg1 = slowest, bg3 = fastest).
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-surface-400 shrink-0 mt-0.5">—</span>
              <p>
                <strong>Default graphics:</strong> If no sprite is uploaded for a slot, the game
                renders built-in drawn characters. Custom sprites override these on a per-slot basis.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-surface-400 shrink-0 mt-0.5">—</span>
              <p>
                <strong>Sprite sheet animation:</strong> Hero and enemy sprites support horizontal
                sprite sheets. Set <em>Frame count</em> to the number of equally-sized frames arranged
                left-to-right. Optionally specify frame width and height in pixels; if omitted, the
                game divides the image width evenly.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="text-surface-400 shrink-0 mt-0.5">—</span>
              <p>
                <strong>Collectible override:</strong> By default, players collect vinyl records.
                Upload a custom collectible sprite here to replace the vinyl graphic with any image
                you like (e.g. a band logo, a guitar pick).
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

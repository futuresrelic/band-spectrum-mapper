import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgEditorApi, type EditorItem, type ItemType } from '../../api/bandRpgEditor';

const ITEM_TYPES: ItemType[] = [
  'collectible', 'key_item', 'quest_item', 'power_up',
  'lore_item', 'album_artifact', 'song_artifact', 'cosmetic',
];

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const RARITY_COLORS: Record<string, string> = {
  common:    'bg-surface-100 text-surface-600',
  uncommon:  'bg-emerald-100 text-emerald-700',
  rare:      'bg-blue-100 text-blue-700',
  epic:      'bg-purple-100 text-purple-700',
  legendary: 'bg-amber-100 text-amber-700',
};

const ITEM_TYPE_COLORS: Record<string, string> = {
  collectible:   'bg-sky-100 text-sky-700',
  key_item:      'bg-amber-100 text-amber-700',
  quest_item:    'bg-orange-100 text-orange-700',
  power_up:      'bg-emerald-100 text-emerald-700',
  lore_item:     'bg-purple-100 text-purple-700',
  album_artifact:'bg-rose-100 text-rose-700',
  song_artifact: 'bg-indigo-100 text-indigo-700',
  cosmetic:      'bg-pink-100 text-pink-700',
};

interface ItemFormProps {
  initial?: EditorItem | null;
  onSaved: () => void;
  onCancel: () => void;
}

function ItemForm({ initial, onSaved, onCancel }: ItemFormProps) {
  const qc = useQueryClient();
  const [slug, setSlug]         = useState(initial?.slug ?? '');
  const [name, setName]         = useState(initial?.name ?? '');
  const [type, setType]         = useState<ItemType>(initial?.type ?? 'collectible');
  const [description, setDesc]  = useState(initial?.description ?? '');
  const [rarity, setRarity]     = useState(initial?.rarity ?? 'common');
  const [scoreValue, setScore]  = useState(initial?.scoreValue ?? 0);
  const [iconUrl, setIconUrl]   = useState(initial?.iconUrl ?? '');
  const [spriteUrl, setSprite]  = useState(initial?.spriteUrl ?? '');
  const [bandId, setBandId]     = useState(initial?.bandId ?? '');
  const [isVisible, setVisible] = useState(initial?.isVisible ?? true);

  const mutation = useMutation({
    mutationFn: () => {
      const data: Partial<EditorItem> = {
        slug: slug.trim(), name: name.trim(), type, rarity, scoreValue, isVisible,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(iconUrl.trim() ? { iconUrl: iconUrl.trim() } : {}),
        ...(spriteUrl.trim() ? { spriteUrl: spriteUrl.trim() } : {}),
        ...(bandId.trim() ? { bandId: bandId.trim() } : {}),
      };
      return initial
        ? bandRpgEditorApi.updateItem(initial.id, data)
        : bandRpgEditorApi.createItem(data);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['editor-items'] }); onSaved(); },
  });

  const inputCls = 'border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 w-full';
  const lbl = 'block text-xs font-medium text-surface-700 mb-1';

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Slug <span className="text-red-500">*</span></label>
          <input className={inputCls} value={slug} onChange={e => setSlug(e.target.value)} placeholder="golden-vinyl" />
        </div>
        <div>
          <label className={lbl}>Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Golden Vinyl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Type</label>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value as ItemType)}>
            {ITEM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Rarity</label>
          <select className={inputCls} value={rarity} onChange={e => setRarity(e.target.value)}>
            {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={lbl}>Description</label>
        <textarea className={inputCls} rows={2} value={description} onChange={e => setDesc(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Icon URL</label>
          <input className={inputCls} value={iconUrl} onChange={e => setIconUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label className={lbl}>Sprite URL</label>
          <input className={inputCls} value={spriteUrl} onChange={e => setSprite(e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Score Value</label>
          <input type="number" className={inputCls} value={scoreValue} onChange={e => setScore(Number(e.target.value))} />
        </div>
        <div>
          <label className={lbl}>Band ID (optional)</label>
          <input className={inputCls} value={bandId} onChange={e => setBandId(e.target.value)} placeholder="cuid" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="vis" checked={isVisible} onChange={e => setVisible(e.target.checked)} className="rounded" />
        <label htmlFor="vis" className="text-sm text-surface-700">Visible to players</label>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={!slug.trim() || !name.trim() || mutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
        >
          {mutation.isPending ? 'Saving…' : initial ? 'Update Item' : 'Create Item'}
        </button>
        <button onClick={onCancel} className="text-sm text-surface-500 hover:text-surface-700">Cancel</button>
      </div>
      {mutation.isError && <p className="text-sm text-red-600">Failed to save. Check for duplicate slug.</p>}
    </div>
  );
}

export default function ItemEditor() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [editingItem, setEditingItem] = useState<EditorItem | null>(null);
  const [creating, setCreating]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['editor-items', typeFilter],
    queryFn: () => bandRpgEditorApi.listItems(typeFilter || undefined),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bandRpgEditorApi.deleteItem(id),
    onSuccess: () => { setConfirmDelete(null); void qc.invalidateQueries({ queryKey: ['editor-items'] }); },
  });

  if (isLoading) return <p className="text-sm text-surface-400 py-6 text-center">Loading items…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          className="border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          {ITEM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <p className="text-sm text-surface-500 flex-1">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setCreating(true); setEditingItem(null); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New Item
        </button>
      </div>

      {(creating || editingItem) && (
        <ItemForm
          initial={editingItem}
          onSaved={() => { setCreating(false); setEditingItem(null); }}
          onCancel={() => { setCreating(false); setEditingItem(null); }}
        />
      )}

      {items.length === 0 && !creating && (
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-10 text-center">
          <p className="text-2xl mb-2">🎒</p>
          <p className="text-surface-400 text-sm">No items yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="rounded-xl border border-surface-200 bg-white p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-surface-900 text-sm">{item.name}</span>
                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${ITEM_TYPE_COLORS[item.type] ?? 'bg-surface-100 text-surface-600'}`}>
                  {item.type.replace(/_/g, ' ')}
                </span>
                <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${RARITY_COLORS[item.rarity] ?? 'bg-surface-100 text-surface-600'}`}>
                  {item.rarity}
                </span>
                {!item.isVisible && <span className="px-1.5 py-0.5 bg-surface-100 text-surface-400 text-xs rounded">hidden</span>}
              </div>
              <p className="text-xs text-surface-400 mt-0.5">/{item.slug} · {item.scoreValue} pts</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setEditingItem(item); setCreating(false); }}
                className="bg-surface-100 hover:bg-surface-200 text-surface-700 text-xs font-medium px-3 py-1.5 rounded-lg"
              >
                Edit
              </button>
              {confirmDelete === item.id ? (
                <div className="flex gap-1 items-center">
                  <button
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                  >
                    {deleteMutation.isPending ? '…' : 'Delete'}
                  </button>
                  <button onClick={() => setConfirmDelete(null)} className="text-xs text-surface-500 px-1">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(item.id)} className="text-red-400 hover:text-red-600 text-xs px-2">Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

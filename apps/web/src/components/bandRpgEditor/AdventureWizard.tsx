import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adventureApi } from '../../api/adventureApi';

interface Props {
  onClose: () => void;
}

interface WizardState {
  // Step 1: Adventure
  slug: string;
  name: string;
  description: string;
  author: string;
  difficulty: string;
  // Step 2: First Level
  levelName: string;
  levelDesc: string;
  // Step 3: First NPC
  npcName: string;
  npcDialogue: string;
  // Step 4: First Quest
  questName: string;
  questDesc: string;
  questXp: string;
}

const INITIAL: WizardState = {
  slug: '', name: '', description: '', author: '', difficulty: 'beginner',
  levelName: '', levelDesc: '',
  npcName: '', npcDialogue: '',
  questName: '', questDesc: '', questXp: '50',
};

type Step = 1 | 2 | 3 | 4;

export default function AdventureWizard({ onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<WizardState>) {
    setState(s => ({ ...s, ...patch }));
  }

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function canAdvance() {
    if (step === 1) return state.name.trim() && state.slug.trim();
    if (step === 2) return state.levelName.trim();
    if (step === 3) return true; // NPC is optional
    return true;
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const levelSlug = `${state.slug}-level-1`;
      const npcName = state.npcName.trim() || 'Archive Guide';
      const questSlug = `${state.slug}-first-quest`;
      const arcSlug = `${state.slug}-main-arc`;

      const payload = {
        bandRpgAdventureVersion: 1,
        adventure: {
          slug: state.slug,
          name: state.name,
          ...(state.description ? { description: state.description } : {}),
          ...(state.author ? { authorName: state.author } : {}),
          difficulty: state.difficulty,
        },
        arcs: [
          { slug: arcSlug, title: 'Main Story', order: 1 },
        ],
        items: [],
        quests: state.questName.trim() ? [
          {
            slug: questSlug,
            name: state.questName.trim(),
            description: state.questDesc.trim() || state.questName.trim(),
            giverNpcName: npcName,
            giverNpcLevelSlug: levelSlug,
            reward: { xp: parseInt(state.questXp || '50', 10), message: 'Quest complete!' },
            isOptional: false,
            order: 1,
          },
        ] : [],
        levels: [
          {
            slug: levelSlug,
            name: state.levelName.trim() || 'Level One',
            ...(state.levelDesc ? { description: state.levelDesc } : {}),
            order: 1,
            spawnX: 1,
            spawnY: 4,
            isPublished: true,
            mapData: {
              width: 10,
              height: 8,
              tiles: [
                [0,0,0,0,0,0,0,0,0,0],
                [0,1,1,1,1,1,1,1,1,0],
                [0,1,1,1,1,1,1,1,1,0],
                [0,1,1,1,1,1,1,1,1,0],
                [0,1,1,1,1,1,1,1,1,0],
                [0,1,1,1,1,1,1,1,1,0],
                [0,1,1,1,1,1,1,1,1,0],
                [0,0,0,0,0,0,0,0,0,0],
              ],
              entities: [
                { id: 'spawn-1', type: 'spawn', x: 1, y: 4 },
              ],
            },
            objectives: [],
            npcs: [
              {
                name: npcName,
                role: 'quest_giver',
                positionX: 7,
                positionY: 3,
                defaultDialogue: [
                  { text: state.npcDialogue.trim() || `Welcome, traveller. I'm ${npcName}.`, speakerName: npcName },
                ],
              },
            ],
            beats: [
              {
                arcSlug,
                type: 'narration',
                content: { lines: [{ text: `You enter ${state.levelName.trim() || 'the first level'}.` }] },
                unlockCondition: { type: 'always' },
                order: 1,
              },
            ],
            doors: [],
            switches: [],
            puzzles: [],
          },
        ],
        timeline: [
          { title: state.levelName.trim() || 'Level One', type: 'level', refSlug: levelSlug, isRequired: true, order: 1 },
          ...(state.questName.trim() ? [
            { title: state.questName.trim(), type: 'quest', refSlug: questSlug, isRequired: true, order: 2 },
          ] : []),
        ],
      };

      const result = await adventureApi.import(payload, 'create');
      if (!result.ok) {
        const msgs = result.errors?.map(e => `${e.path}: ${e.message}`).join('\n') ?? 'Import failed';
        setError(msgs);
        return;
      }

      void qc.invalidateQueries({ queryKey: ['adventures'] });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Quick Start Wizard</h2>
            <button onClick={onClose} className="text-white/60 hover:text-white text-xl">×</button>
          </div>
          <div className="flex gap-1 mt-3">
            {([1,2,3,4] as Step[]).map(s => (
              <div
                key={s}
                className={`flex-1 h-1 rounded-full ${s <= step ? 'bg-white' : 'bg-white/30'}`}
              />
            ))}
          </div>
          <div className="text-xs text-indigo-200 mt-1.5">
            Step {step} of 4 — {['Adventure Details', 'First Level', 'Guide NPC', 'First Quest'][step - 1]}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-surface-700 mb-1">Adventure Name *</label>
                  <input
                    value={state.name}
                    onChange={e => { update({ name: e.target.value, slug: autoSlug(e.target.value) }); }}
                    placeholder="The Lost Recording"
                    className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-surface-700 mb-1">Slug (auto-generated) *</label>
                  <input
                    value={state.slug}
                    onChange={e => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="the-lost-recording"
                    pattern="[a-z0-9-]+"
                    className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-700 mb-1">Author</label>
                  <input
                    value={state.author}
                    onChange={e => update({ author: e.target.value })}
                    placeholder="Your name"
                    className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-surface-700 mb-1">Difficulty</label>
                  <select
                    value={state.difficulty}
                    onChange={e => update({ difficulty: e.target.value })}
                    className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="expert">Expert</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-surface-700 mb-1">Description</label>
                  <textarea
                    value={state.description}
                    onChange={e => update({ description: e.target.value })}
                    placeholder="A short description shown to players."
                    rows={2}
                    className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 resize-none"
                  />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-surface-500">Every adventure needs at least one level. We'll create a basic 10×8 room with a spawn point.</p>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">Level Name *</label>
                <input
                  value={state.levelName}
                  onChange={e => update({ levelName: e.target.value })}
                  placeholder="The Entrance"
                  className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">Level Description</label>
                <textarea
                  value={state.levelDesc}
                  onChange={e => update({ levelDesc: e.target.value })}
                  placeholder="Describe the setting for this level."
                  rows={2}
                  className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 resize-none"
                />
              </div>
              <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-xs text-indigo-700">
                The level starts as a basic empty room. You can add doors, switches, items, and puzzles from the Level Editor after creation.
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-surface-500">Add a guide NPC who greets the player. They can give quests and provide direction. (Optional — skip if you prefer to add NPCs manually.)</p>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">NPC Name</label>
                <input
                  value={state.npcName}
                  onChange={e => update({ npcName: e.target.value })}
                  placeholder="The Guide"
                  className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">Opening Dialogue</label>
                <textarea
                  value={state.npcDialogue}
                  onChange={e => update({ npcDialogue: e.target.value })}
                  placeholder="Welcome, traveller. I've been expecting you."
                  rows={3}
                  className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 resize-none"
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-sm text-surface-500">Create the first quest given by your NPC. (Optional — you can skip and create quests later.)</p>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">Quest Name</label>
                <input
                  value={state.questName}
                  onChange={e => update({ questName: e.target.value })}
                  placeholder="The First Task"
                  className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">Quest Description</label>
                <textarea
                  value={state.questDesc}
                  onChange={e => update({ questDesc: e.target.value })}
                  placeholder="Describe what the player needs to do."
                  rows={2}
                  className="w-full text-sm border border-surface-300 rounded-lg px-3 py-2 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1">XP Reward</label>
                <input
                  type="number"
                  value={state.questXp}
                  onChange={e => update({ questXp: e.target.value })}
                  min="0"
                  className="w-32 text-sm border border-surface-300 rounded-lg px-3 py-2"
                />
              </div>
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700 whitespace-pre-wrap">{error}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(s => (s - 1) as Step)}
              className="px-4 py-2 border border-surface-300 text-surface-600 rounded-lg text-sm hover:bg-surface-50"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {step < 4 ? (
            <button
              onClick={() => { if (step === 3 || step === 4) { setStep(s => (s + 1) as Step); } else if (canAdvance()) { setStep(s => (s + 1) as Step); } }}
              disabled={!canAdvance()}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40"
            >
              {creating ? 'Creating…' : '✓ Create Adventure'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

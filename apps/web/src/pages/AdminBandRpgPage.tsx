import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { bandRpgApi } from '../api/bandRpg';
import { bandsApi } from '../api/bands';

type Tab =
  | 'overview'
  | 'levels'
  | 'objectives'
  | 'quests'
  | 'storyline'
  | 'timeline'
  | 'characters'
  | 'items'
  | 'graphics'
  | 'settings'
  | 'leaderboard'
  | 'testing';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview',    label: 'Overview',    icon: '🗺️'  },
  { id: 'levels',      label: 'Levels',      icon: '🏔️'  },
  { id: 'objectives',  label: 'Objectives',  icon: '🎯'  },
  { id: 'quests',      label: 'Quests',      icon: '📜'  },
  { id: 'storyline',   label: 'Storyline',   icon: '📖'  },
  { id: 'timeline',    label: 'Timeline',    icon: '⏱️'  },
  { id: 'characters',  label: 'Characters',  icon: '🎭'  },
  { id: 'items',       label: 'Items',       icon: '🎒'  },
  { id: 'graphics',    label: 'Graphics',    icon: '🎨'  },
  { id: 'settings',    label: 'Settings',    icon: '⚙️'  },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆'  },
  { id: 'testing',     label: 'Testing',     icon: '🧪'  },
];

function ComingSoonPlaceholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50 p-10 text-center">
      <p className="text-2xl mb-3">🚧</p>
      <h3 className="font-semibold text-surface-800 mb-2">{title}</h3>
      <p className="text-sm text-surface-500 leading-relaxed max-w-sm mx-auto">{desc}</p>
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <h2 className="font-semibold text-surface-900 mb-4">Band RPG — Game Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Levels', value: '0', color: 'text-indigo-600' },
            { label: 'Quests', value: '0', color: 'text-emerald-600' },
            { label: 'Objectives', value: '0', color: 'text-amber-600' },
            { label: 'Items', value: '0', color: 'text-rose-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-surface-50 border border-surface-200 p-4 text-center">
              <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
              <div className="text-xs text-surface-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h3 className="font-semibold text-amber-900 mb-2">Phase A — Skeleton Active</h3>
        <p className="text-sm text-amber-800 leading-relaxed mb-4">
          Band RPG is in Phase A: the database models, admin scaffold, and game route are live.
          Editors for levels, quests, storyline, and gameplay will be built in Phase B and beyond.
        </p>
        <div className="space-y-2 text-sm text-amber-800">
          {[
            { done: true,  label: 'Database models (BandRpgLevel, BandRpgObjective, BandRpgQuest, etc.)' },
            { done: true,  label: 'Admin scaffold with tab navigation' },
            { done: true,  label: 'Public game route at /play/band-rpg' },
            { done: true,  label: 'Game added to games directory and leaderboard system' },
            { done: false, label: 'Phase B: Playable level + Vinyl Runner character reuse + basic collision' },
            { done: false, label: 'Phase C: Level editor, objectives editor, items editor, save/load from DB' },
            { done: false, label: 'Phase D: Quest system, storyline editor, timeline, dialogue' },
            { done: false, label: 'Phase E: Cross-game objectives, leaderboard polish, mobile controls' },
          ].map(({ done, label }) => (
            <div key={label} className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">{done ? '✅' : '⬜'}</span>
              <span className={done ? 'line-through opacity-60' : ''}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TestingTab() {
  const [resetConfirmed,      setResetConfirmed]      = useState(false);
  const [resetResult,         setResetResult]         = useState<string | null>(null);
  const [randomizeBandId,     setRandomizeBandId]     = useState('');
  const [randomizeConfirmed,  setRandomizeConfirmed]  = useState(false);
  const [randomizeResult,     setRandomizeResult]     = useState<string | null>(null);

  const { data: bands = [] } = useQuery({
    queryKey: ['bands'],
    queryFn: () => bandsApi.list(),
    staleTime: 5 * 60_000,
  });

  const resetMutation = useMutation({
    mutationFn: () => bandRpgApi.adminResetMyData(),
    onSuccess: (r) => { setResetResult(r.message); setResetConfirmed(false); },
    onError:   () => { setResetResult('Reset failed. Check the console for details.'); setResetConfirmed(false); },
  });

  const randomizeMutation = useMutation({
    mutationFn: (bandId: string) => bandRpgApi.adminRandomizeRarities(bandId),
    onSuccess: (r) => {
      setRandomizeResult(`Randomized rarities for ${r.updated} songs.`);
      setRandomizeConfirmed(false);
    },
    onError: () => {
      setRandomizeResult('Randomization failed. Check the console.');
      setRandomizeConfirmed(false);
    },
  });

  const selectedBandName = bands.find((b) => b.id === randomizeBandId)?.name ?? '';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <h2 className="font-semibold text-surface-900 mb-1">Developer Testing</h2>
        <p className="text-sm text-surface-500 mb-6">
          Tools for testing Band RPG locally. These actions only affect your own account or song data.
        </p>

        {/* Reset collection */}
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 mb-5">
          <h3 className="font-semibold text-red-900 mb-1">Reset My Band RPG Collection</h3>
          <p className="text-sm text-red-700 leading-relaxed mb-3">
            Clears your recovered song collection and Band RPG player progress.
          </p>
          <ul className="text-xs text-red-600 space-y-1 mb-4 list-disc list-inside">
            <li>Clears: recovered song collection, player progress &amp; stats</li>
            <li>Does NOT clear: leaderboard scores, band data, song data, other users' data</li>
          </ul>

          {resetResult && (
            <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
              ✓ {resetResult}
            </div>
          )}

          {!resetConfirmed ? (
            <button
              onClick={() => setResetConfirmed(true)}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Reset My Collection
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-800 font-medium">Are you sure?</span>
              <button
                onClick={() => { setResetResult(null); resetMutation.mutate(); }}
                disabled={resetMutation.isPending}
                className="bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {resetMutation.isPending ? 'Clearing…' : 'Yes, Clear It'}
              </button>
              <button onClick={() => setResetConfirmed(false)} className="text-sm text-surface-500 hover:text-surface-700 transition-colors">Cancel</button>
            </div>
          )}
        </div>

        {/* Randomize rarities */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-semibold text-amber-900 mb-1">Randomize Band Song Rarities</h3>
          <p className="text-sm text-amber-800 leading-relaxed mb-3">
            Assigns random rarities to every song in a band. Useful for testing weighted song
            discovery without manually editing each song. Distribution: 50% Common, 25% Uncommon,
            15% Rare, 7% Legendary, 3% Mythic.
          </p>
          <ul className="text-xs text-amber-700 space-y-1 mb-4 list-disc list-inside">
            <li>Overwrites existing rarities for every song in the selected band</li>
            <li>Does NOT affect other bands</li>
            <li>Can be re-run to re-randomize</li>
          </ul>

          <div className="mb-3">
            <label className="block text-xs font-medium text-amber-900 mb-1">Select band</label>
            <select
              value={randomizeBandId}
              onChange={(e) => { setRandomizeBandId(e.target.value); setRandomizeConfirmed(false); setRandomizeResult(null); }}
              className="border border-amber-300 bg-white rounded-lg px-3 py-2 text-sm text-surface-800 focus:outline-none focus:border-amber-500 min-w-48"
            >
              <option value="">— choose a band —</option>
              {bands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {randomizeResult && (
            <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
              ✓ {randomizeResult}
            </div>
          )}

          {!randomizeBandId ? null : !randomizeConfirmed ? (
            <button
              onClick={() => setRandomizeConfirmed(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Randomize Rarities for {selectedBandName}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-amber-900 font-medium">This will overwrite existing rarities.</span>
              <button
                onClick={() => { setRandomizeResult(null); randomizeMutation.mutate(randomizeBandId); }}
                disabled={randomizeMutation.isPending}
                className="bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {randomizeMutation.isPending ? 'Randomizing…' : 'Yes, Randomize'}
              </button>
              <button onClick={() => setRandomizeConfirmed(false)} className="text-sm text-surface-500 hover:text-surface-700 transition-colors">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminBandRpgPage() {
  const [tab, setTab] = useState<Tab>('overview');

  const PLACEHOLDER_CONTENT: Partial<Record<Tab, { title: string; desc: string }>> = {
    levels:      { title: 'Level Editor', desc: 'Create and edit tile-based RPG maps. Assign backgrounds, collision zones, spawn points, NPC placements, objective markers, and trigger zones. Save/load levels from the database.' },
    objectives:  { title: 'Objectives Editor', desc: 'Define objectives: find items, talk to NPCs, reach locations, trigger song/album/band nodes, solve clues, play linked mini-games, or hit score thresholds in other BSM games.' },
    quests:      { title: 'Quests Editor', desc: 'Combine objectives into quests. Define quest givers, required sequences, branching paths, rewards, unlock conditions, and story beat triggers.' },
    storyline:   { title: 'Storyline Editor', desc: 'Write the RPG narrative: story arcs, chapters, dialogue scenes, narration boxes, choice prompts, branching paths, and cutscene text. No code required.' },
    timeline:    { title: 'Timeline Editor', desc: 'Organize game progression: chapters, levels, quests, story beats, boss moments, linked songs/albums/bands, and required completion order.' },
    characters:  { title: 'Characters & NPCs', desc: 'Assign Vinyl Runner character assets to Band RPG. Create NPCs from existing band members, set dialogue portraits, factions, and default dialogue lines.' },
    items:       { title: 'Items & Collectibles', desc: 'Manage the item system: collectibles, key items, quest items, power-ups, lore items, album artifacts, song artifacts, and cosmetic unlocks.' },
    graphics:    { title: 'Graphics & Theme', desc: 'Edit the main palette, background colors, UI panel colors, dialogue box style, sprite scale, tile size, player movement speed, camera behavior, and marker colors.' },
    settings:    { title: 'Game Settings', desc: 'Configure lives, health system, timer, score multipliers, movement speed, controls, quest log, minimap, inventory, dialogue speed, difficulty, and save progress options.' },
    leaderboard: { title: 'Leaderboard', desc: 'View and manage Band RPG scores: total score, completion percentage, fastest run, quests completed, items collected, levels cleared, and player rankings.' },
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-surface-900 flex items-center gap-2">
          🗺️ Band RPG Admin
        </h1>
        <p className="text-sm text-surface-500 mt-1">
          Configure levels, quests, storyline, characters, items, and game settings for Band RPG.
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-surface-200 pb-2">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-surface-900 text-white'
                : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'testing'  && <TestingTab />}
      {tab !== 'overview' && tab !== 'testing' && PLACEHOLDER_CONTENT[tab] && (
        <ComingSoonPlaceholder
          title={PLACEHOLDER_CONTENT[tab]!.title}
          desc={PLACEHOLDER_CONTENT[tab]!.desc}
        />
      )}
    </div>
  );
}

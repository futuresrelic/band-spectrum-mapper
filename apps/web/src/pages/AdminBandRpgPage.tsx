import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { bandRpgApi } from '../api/bandRpg';
import { bandRpgEditorApi } from '../api/bandRpgEditor';
import { bandsApi } from '../api/bands';
import LevelEditor from '../components/bandRpgEditor/LevelEditor';
import QuestEditor from '../components/bandRpgEditor/QuestEditor';
import StoryEditor from '../components/bandRpgEditor/StoryEditor';
import NpcEditor from '../components/bandRpgEditor/NpcEditor';
import ItemEditor from '../components/bandRpgEditor/ItemEditor';
import TimelineEditor from '../components/bandRpgEditor/TimelineEditor';
import LeaderboardTab from '../components/bandRpgEditor/LeaderboardTab';

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
  | 'testing'
  | 'live';

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
  { id: 'live',        label: 'Live Data',   icon: '🌐'  },
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
  const { data: counts } = useQuery({
    queryKey: ['band-rpg-editor-counts'],
    queryFn: async () => {
      const [levels, quests, items] = await Promise.all([
        bandRpgEditorApi.listLevels(),
        bandRpgEditorApi.listQuests(),
        bandRpgEditorApi.listItems(),
      ]);
      const totalObjectives = levels.reduce((sum, l) => sum + (l._count?.objectives ?? 0), 0);
      return { levels: levels.length, quests: quests.length, objectives: totalObjectives, items: items.length };
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <h2 className="font-semibold text-surface-900 mb-4">Band RPG — Game Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Levels',     value: counts?.levels     ?? '—', color: 'text-indigo-600' },
            { label: 'Quests',     value: counts?.quests     ?? '—', color: 'text-emerald-600' },
            { label: 'Objectives', value: counts?.objectives ?? '—', color: 'text-amber-600' },
            { label: 'Items',      value: counts?.items      ?? '—', color: 'text-rose-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-surface-50 border border-surface-200 p-4 text-center">
              <div className={`text-3xl font-bold mb-1 ${color}`}>{value}</div>
              <div className="text-xs text-surface-500">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <h3 className="font-semibold text-emerald-900 mb-2">Phase Z.0 — Creator Toolkit Active</h3>
        <p className="text-sm text-emerald-800 leading-relaxed mb-4">
          The Creator Toolkit is live. Build levels, quests, storylines, NPCs, items, and timelines — no code required.
        </p>
        <div className="space-y-2 text-sm text-emerald-800">
          {[
            { done: true,  label: 'Database models (BandRpgLevel, BandRpgObjective, BandRpgQuest, etc.)' },
            { done: true,  label: 'Admin scaffold with tab navigation' },
            { done: true,  label: 'Public game route at /play/band-rpg' },
            { done: true,  label: 'Game added to games directory and leaderboard system' },
            { done: true,  label: 'Phase Z.0: Creator Toolkit — Level, Quest, Story, NPC, Item editors' },
            { done: false, label: 'Phase B: Playable level + Vinyl Runner character reuse + basic collision' },
            { done: false, label: 'Phase C: In-editor playtest mode (requires Phase B game engine)' },
            { done: false, label: 'Phase D: Quest system runtime, dialogue UI, inventory, save/load' },
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

function ObjectivesTab() {
  const { data: levels = [] } = useQuery({
    queryKey: ['editor-levels'],
    queryFn: () => bandRpgEditorApi.listLevels(),
    staleTime: 60_000,
  });

  const [levelId, setLevelId] = useState('');
  const activeLevelId = levelId || (levels[0]?.id ?? '');

  if (levels.length === 0) {
    return (
      <div className="rounded-xl border border-surface-200 bg-surface-50 p-10 text-center">
        <p className="text-surface-400 text-sm">Create a level first to manage objectives. Go to the Levels tab.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-surface-500">Objectives are managed inside each level. Select a level to open its full editor.</p>
      <select
        className="border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 min-w-56"
        value={levelId}
        onChange={e => setLevelId(e.target.value)}
      >
        {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      {activeLevelId && (
        <div className="rounded-xl border border-surface-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-surface-900">
              {levels.find(l => l.id === activeLevelId)?.name ?? ''} — Objectives
            </h3>
            <a
              href={`/admin/band-rpg`}
              className="text-xs text-indigo-600 hover:text-indigo-800 underline"
            >
              Open Level Editor →
            </a>
          </div>
          <p className="text-sm text-surface-500">
            Open the Level Editor above and navigate to the Objectives tab for this level to add, edit, and reorder objectives.
          </p>
        </div>
      )}
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

const STATUS_COLOR: Record<string, string> = {
  never:       'text-surface-400',
  in_progress: 'text-blue-600',
  complete:    'text-emerald-600',
  failed:      'text-red-600',
};
const STATUS_LABEL: Record<string, string> = {
  never:       'Never fetched',
  in_progress: 'In progress',
  complete:    'Complete',
  failed:      'Failed',
};

function LiveDataTab() {
  const [selectedBandId, setSelectedBandId] = useState('');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<Array<{ mbid: string; name: string; sortName: string; disambiguation?: string }>>([]);
  const [fetchResult,    setFetchResult]    = useState<{ ok: boolean; songsUpdated: number; totalShows: number; fetchedShows: number; message?: string } | null>(null);
  const [storeMessage,   setStoreMessage]   = useState<string | null>(null);

  const { data: bands = [] } = useQuery({
    queryKey: ['bands'],
    queryFn:  () => bandsApi.list(),
    staleTime: 5 * 60_000,
  });

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['live-data-status', selectedBandId],
    queryFn:  () => bandRpgApi.getLiveDataStatus(selectedBandId),
    enabled:  !!selectedBandId,
    staleTime: 10_000,
  });

  const searchMutation = useMutation({
    mutationFn: (artistName: string) => bandRpgApi.searchSetlistFmArtist(artistName),
    onSuccess:  (r) => setSearchResults(r.results),
    onError:    () => setSearchResults([]),
  });

  const storeMutation = useMutation({
    mutationFn: ({ mbid, name }: { mbid: string; name: string }) =>
      bandRpgApi.storeBandArtistMatch(selectedBandId, mbid, name),
    onSuccess: () => {
      setStoreMessage('Artist linked successfully.');
      setSearchResults([]);
      void refetchStatus();
    },
    onError: () => setStoreMessage('Failed to link artist. Check server logs.'),
  });

  const fetchMutation = useMutation({
    mutationFn: () => bandRpgApi.fetchBandLiveData(selectedBandId),
    onSuccess:  (r) => { setFetchResult(r); void refetchStatus(); },
  });

  const selectedBandName = bands.find((b) => b.id === selectedBandId)?.name ?? '';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <h2 className="font-semibold text-surface-900 mb-1">Live Intelligence — Setlist.fm</h2>
        <p className="text-sm text-surface-500 mb-5 leading-relaxed">
          Connect each band to their Setlist.fm artist profile to download real performance history.
          Band RPG uses this data to compute Live Rarity, Live Value, and Concert Realism scores.
          Requires a valid <code className="bg-surface-100 px-1 rounded text-xs">SETLISTFM_API_KEY</code> environment variable.
        </p>

        <div>
          <label className="block text-xs font-medium text-surface-700 mb-1">Select band</label>
          <select
            value={selectedBandId}
            onChange={(e) => {
              setSelectedBandId(e.target.value);
              setSearchResults([]);
              setStoreMessage(null);
              setFetchResult(null);
            }}
            className="border border-surface-300 bg-white rounded-lg px-3 py-2 text-sm text-surface-800 focus:outline-none focus:border-indigo-500 min-w-56"
          >
            <option value="">— choose a band —</option>
            {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {selectedBandId && status !== undefined && (
        <div className="rounded-xl border border-surface-200 bg-white p-6">
          <h3 className="font-semibold text-surface-900 mb-3">
            Live Data Status — {selectedBandName}
          </h3>
          {!status ? (
            <p className="text-sm text-surface-400">
              No live data record yet. Search for the artist below to get started.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-center">
                  <div className={`text-base font-bold ${STATUS_COLOR[status.fetchStatus] ?? 'text-surface-600'}`}>
                    {STATUS_LABEL[status.fetchStatus] ?? status.fetchStatus}
                  </div>
                  <div className="text-xs text-surface-400 mt-1">Status</div>
                </div>
                <div className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-center">
                  <div className="text-lg font-bold text-indigo-600">{status.profileCount}</div>
                  <div className="text-xs text-surface-400 mt-1">Song profiles</div>
                </div>
                <div className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-center">
                  <div className="text-lg font-bold text-surface-700">{status.totalShows.toLocaleString()}</div>
                  <div className="text-xs text-surface-400 mt-1">Total shows</div>
                </div>
                <div className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-center">
                  <div className="text-lg font-bold text-surface-700">{status.fetchedShows.toLocaleString()}</div>
                  <div className="text-xs text-surface-400 mt-1">Shows analyzed</div>
                </div>
              </div>
              {status.setlistFmName && (
                <p className="text-sm text-surface-600">
                  Linked to: <span className="font-medium text-surface-900">{status.setlistFmName}</span>
                  <span className="ml-2 text-xs text-surface-400">MBID: {status.setlistFmMbid}</span>
                </p>
              )}
              {status.lastFetchedAt && (
                <p className="text-xs text-surface-400 mt-1">
                  Last fetched: {new Date(status.lastFetchedAt).toLocaleString()}
                </p>
              )}
              {status.errorMessage && (
                <p className="text-xs text-red-600 mt-2">Error: {status.errorMessage}</p>
              )}
            </>
          )}
        </div>
      )}

      {selectedBandId && (
        <div className="rounded-xl border border-surface-200 bg-white p-6">
          <h3 className="font-semibold text-surface-900 mb-1">Link Setlist.fm Artist</h3>
          <p className="text-sm text-surface-500 mb-4">
            Search by artist name, then click Select to link the correct result.
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  setSearchResults([]);
                  searchMutation.mutate(searchQuery.trim());
                }
              }}
              placeholder={`e.g. "${selectedBandName}"`}
              className="flex-1 border border-surface-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={() => { setSearchResults([]); if (searchQuery.trim()) searchMutation.mutate(searchQuery.trim()); }}
              disabled={searchMutation.isPending || !searchQuery.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {searchMutation.isPending ? 'Searching…' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((r) => (
                <div key={r.mbid} className="flex items-center justify-between rounded-lg border border-surface-200 px-4 py-3 bg-surface-50">
                  <div>
                    <span className="font-medium text-surface-900 text-sm">{r.name}</span>
                    {r.disambiguation && (
                      <span className="ml-2 text-xs text-surface-400">({r.disambiguation})</span>
                    )}
                    <div className="text-xs text-surface-400 mt-0.5">{r.mbid}</div>
                  </div>
                  <button
                    onClick={() => { setStoreMessage(null); storeMutation.mutate({ mbid: r.mbid, name: r.name }); }}
                    disabled={storeMutation.isPending}
                    className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {storeMutation.isPending ? '…' : 'Select'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {searchMutation.isError && (
            <p className="text-sm text-red-600 mt-2">Search failed. Is SETLISTFM_API_KEY set?</p>
          )}
          {storeMessage && (
            <p className="text-sm text-emerald-700 font-medium mt-3">{storeMessage}</p>
          )}
        </div>
      )}

      {selectedBandId && status?.setlistFmMbid && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
          <h3 className="font-semibold text-indigo-900 mb-1">Fetch Live Performance Data</h3>
          <p className="text-sm text-indigo-800 leading-relaxed mb-4">
            Downloads up to 1,500 setlists for <strong>{status.setlistFmName}</strong> and updates
            live rarity scores, Live Value, and performance history for every matched song.
            For very large catalogs (Phish, Dead) this can take 2–3 minutes.
            Re-running is safe and will overwrite previous results.
          </p>
          <button
            onClick={() => { setFetchResult(null); fetchMutation.mutate(); }}
            disabled={fetchMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {fetchMutation.isPending ? 'Fetching… (please wait)' : 'Fetch Live Data Now'}
          </button>
          {fetchMutation.isPending && (
            <p className="mt-3 text-xs text-indigo-600 animate-pulse">
              Downloading setlists from Setlist.fm — this may take a couple of minutes…
            </p>
          )}
          {fetchResult && (
            <div className="mt-4 rounded-lg bg-white border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              <div className="font-semibold mb-1">Fetch complete</div>
              <div>Songs updated: <strong>{fetchResult.songsUpdated}</strong></div>
              <div>Shows analyzed: <strong>{fetchResult.fetchedShows.toLocaleString()}</strong> of {fetchResult.totalShows.toLocaleString()} total</div>
              {fetchResult.message && <div className="mt-1 text-xs text-surface-500">{fetchResult.message}</div>}
            </div>
          )}
          {fetchMutation.isError && (
            <p className="mt-3 text-sm text-red-700">Fetch failed. Check server logs for details.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminBandRpgPage() {
  const [tab, setTab] = useState<Tab>('overview');

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
      {tab === 'overview'    && <OverviewTab />}
      {tab === 'levels'      && <LevelEditor />}
      {tab === 'objectives'  && <ObjectivesTab />}
      {tab === 'quests'      && <QuestEditor />}
      {tab === 'storyline'   && <StoryEditor />}
      {tab === 'timeline'    && <TimelineEditor />}
      {tab === 'characters'  && (
        <div className="space-y-6">
          <NpcEditor />
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-5">
            <h3 className="font-semibold text-surface-800 mb-1">Avatar System 2.0</h3>
            <p className="text-sm text-surface-500 mb-3">
              Manage character portraits, reference images, and AI-generated sprites in Vinyl Runner Skins.
            </p>
            <a href="/admin/platformer" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 underline">
              Open Vinyl Runner — Skins &amp; Config →
            </a>
          </div>
        </div>
      )}
      {tab === 'items'       && <ItemEditor />}
      {tab === 'graphics'    && (
        <ComingSoonPlaceholder
          title="Graphics & Theme"
          desc="Background and atmosphere settings are configured per-level in the Level Editor's Map tab. Global palette settings coming in a future update."
        />
      )}
      {tab === 'settings'    && (
        <ComingSoonPlaceholder
          title="Game Settings"
          desc="Configure lives, health system, timer, score multipliers, movement speed, controls, quest log, minimap, inventory, dialogue speed, difficulty, and save progress options."
        />
      )}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'testing'     && <TestingTab />}
      {tab === 'live'        && <LiveDataTab />}
    </div>
  );
}

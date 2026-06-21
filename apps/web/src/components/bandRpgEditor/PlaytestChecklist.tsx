import { useState } from 'react';

type Status = 'untested' | 'pass' | 'fail' | 'skip';

interface CheckItem {
  id: string;
  category: string;
  label: string;
  hint: string;
}

const ITEMS: CheckItem[] = [
  // Core navigation
  { id: 'load-level',     category: 'Core',     label: 'Load level',           hint: 'Open /play/band-rpg/game/<slug>. Level renders without errors.' },
  { id: 'move-desktop',   category: 'Core',     label: 'Move player (desktop)', hint: 'Arrow keys or WASD. Player moves on floor tiles, blocked by walls.' },
  { id: 'move-mobile',    category: 'Core',     label: 'Move player (mobile)',  hint: 'D-pad overlay appears. Tap arrows to move.' },
  { id: 'camera',         category: 'Core',     label: 'Camera follows player', hint: 'Player stays centred as map scrolls.' },

  // NPCs
  { id: 'talk-npc',       category: 'NPCs',     label: 'Talk to NPC',          hint: 'Stand adjacent to NPC, press E. Dialogue box opens.' },
  { id: 'dialogue-advance', category: 'NPCs',   label: 'Advance dialogue',     hint: 'Press E/Enter/Space to advance lines. Dialogue closes at end.' },
  { id: 'dialogue-choice', category: 'NPCs',    label: 'Dialogue choices',     hint: 'Choice options appear and are clickable. Selecting a choice continues correctly.' },
  { id: 'npc-invisible',  category: 'NPCs',     label: 'Conditional NPC',      hint: 'NPC with visibilityCondition is hidden until condition is met.' },

  // Quests
  { id: 'accept-quest',   category: 'Quests',   label: 'Accept quest',         hint: 'Talk to quest-giver NPC. "Accept Quest" choice appears. Accepting adds quest to HUD.' },
  { id: 'objective',      category: 'Quests',   label: 'Complete objective',   hint: 'Perform the objective action. Objective checks off in HUD.' },
  { id: 'complete-quest', category: 'Quests',   label: 'Complete quest',       hint: 'All objectives done. Quest completes. Reward notification appears.' },

  // Items
  { id: 'collect-item',   category: 'Items',    label: 'Collect item',         hint: 'Walk onto item tile. Item added to inventory. Tile disappears.' },
  { id: 'item-hud',       category: 'Items',    label: 'Inventory in HUD',     hint: 'Collected item shows in HUD sidebar.' },
  { id: 'cond-item',      category: 'Items',    label: 'Conditional item',     hint: 'Item with spawnCondition only appears when condition is met.' },

  // World systems
  { id: 'door-locked',    category: 'World',    label: 'Locked door blocks',   hint: 'Walk into locked door tile. Player is blocked. [E] Try hint appears when adjacent.' },
  { id: 'door-open-key',  category: 'World',    label: 'Unlock door (key)',    hint: 'Have required item. Press E adjacent to key door. Door opens, becomes passable.' },
  { id: 'switch-activate', category: 'World',   label: 'Activate switch',      hint: 'Stand adjacent to switch. Press E. Switch changes colour. Effect fires.' },
  { id: 'puzzle-trigger', category: 'World',    label: 'Puzzle trigger fires', hint: 'Trigger condition met (e.g. item collected). Puzzle action executes (door opens, beat plays, etc.).' },
  { id: 'world-state',    category: 'World',    label: 'World state persists', hint: 'Opened door / activated switch remembered after save and reload.' },

  // Exits and level transitions
  { id: 'exit-visible',   category: 'Exits',    label: 'Exit marker visible',  hint: 'Exit tile shows 🚪 marker on map.' },
  { id: 'change-level',   category: 'Exits',    label: 'Change level',         hint: 'Walk onto exit tile. New level loads and player spawns at correct position.' },
  { id: 'cond-exit',      category: 'Exits',    label: 'Conditional exit',     hint: 'Exit with condition is hidden/locked until condition met.' },

  // Save / resume
  { id: 'save',           category: 'Save',     label: 'Save progress',        hint: 'Complete objective or collect item. "Saving…" appears in title bar.' },
  { id: 'reload',         category: 'Save',     label: 'Reload progress',      hint: 'Refresh page. Return to same level. Completed quests and items still done.' },
  { id: 'resume',         category: 'Save',     label: 'Resume correctly',     hint: 'Opened doors and activated switches still open/active after reload.' },

  // Story
  { id: 'story-beat',     category: 'Story',    label: 'Story beat plays',     hint: 'Beat trigger condition met. Beat dialogue shows automatically.' },
  { id: 'level-enter',    category: 'Story',    label: 'Level enter beat',     hint: 'Level with level_enter beat shows it on first entry.' },
];

const CATEGORIES = [...new Set(ITEMS.map(i => i.category))];

const STATUS_LABELS: Record<Status, string> = { untested: '—', pass: '✓', fail: '✗', skip: '⊘' };
const STATUS_COLORS: Record<Status, string> = {
  untested: 'bg-surface-100 text-surface-400',
  pass: 'bg-emerald-100 text-emerald-700',
  fail: 'bg-red-100 text-red-600',
  skip: 'bg-surface-100 text-surface-400',
};
const NEXT_STATUS: Record<Status, Status> = { untested: 'pass', pass: 'fail', fail: 'skip', skip: 'untested' };

export default function PlaytestChecklist() {
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setStatuses(s => ({ ...s, [id]: NEXT_STATUS[s[id] ?? 'untested'] }));
  };

  const resetAll = () => {
    if (!confirm('Reset all checklist results?')) return;
    setStatuses({});
    setNotes({});
  };

  const passCount = Object.values(statuses).filter(s => s === 'pass').length;
  const failCount = Object.values(statuses).filter(s => s === 'fail').length;
  const total = ITEMS.length;
  const doneCount = Object.values(statuses).filter(s => s !== 'untested').length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-xl border border-surface-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-surface-900">Playtest Checklist</h2>
          <button onClick={resetAll} className="text-xs text-surface-400 hover:text-surface-600 border border-surface-200 px-3 py-1 rounded">Reset all</button>
        </div>
        <p className="text-sm text-surface-500 mb-4">
          Test each item manually on desktop and mobile. Click the status badge to cycle: — (untested) → ✓ pass → ✗ fail → ⊘ skip.
        </p>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', value: total, color: 'text-surface-700' },
            { label: 'Tested', value: doneCount, color: 'text-indigo-600' },
            { label: 'Pass', value: passCount, color: 'text-emerald-600' },
            { label: 'Fail', value: failCount, color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-surface-50 border border-surface-200 p-3 text-center">
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-surface-500">{label}</div>
            </div>
          ))}
        </div>
        {failCount > 0 && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="text-xs font-semibold text-red-700 mb-1">Failed items:</div>
            {ITEMS.filter(i => (statuses[i.id] ?? 'untested') === 'fail').map(i => (
              <div key={i.id} className="text-xs text-red-600">• {i.label}</div>
            ))}
          </div>
        )}
      </div>

      {/* Checklist by category */}
      {CATEGORIES.map(cat => {
        const catItems = ITEMS.filter(i => i.category === cat);
        const catPass = catItems.filter(i => (statuses[i.id] ?? 'untested') === 'pass').length;
        const catFail = catItems.filter(i => (statuses[i.id] ?? 'untested') === 'fail').length;
        return (
          <div key={cat} className="rounded-xl border border-surface-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-100 flex items-center justify-between bg-surface-50">
              <span className="font-semibold text-surface-800">{cat}</span>
              <span className="text-xs text-surface-400">
                {catPass}/{catItems.length} pass {catFail > 0 && <span className="text-red-500 ml-1">{catFail} fail</span>}
              </span>
            </div>
            <div className="divide-y divide-surface-100">
              {catItems.map(item => {
                const status: Status = statuses[item.id] ?? 'untested';
                const isExpanded = expandedId === item.id;
                return (
                  <div key={item.id} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggle(item.id)}
                        className={`shrink-0 w-8 h-8 rounded-lg text-sm font-bold transition-colors ${STATUS_COLORS[status]}`}
                        title="Click to cycle status"
                      >
                        {STATUS_LABELS[status]}
                      </button>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="flex-1 text-left text-sm font-medium text-surface-800 hover:text-surface-600"
                      >
                        {item.label}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 ml-11 space-y-2">
                        <p className="text-xs text-surface-500 leading-relaxed">{item.hint}</p>
                        <textarea
                          value={notes[item.id] ?? ''}
                          onChange={e => setNotes(n => ({ ...n, [item.id]: e.target.value }))}
                          placeholder="Add notes (optional)"
                          rows={2}
                          className="w-full text-xs border border-surface-200 rounded px-2 py-1 resize-none"
                        />
                      </div>
                    )}
                    {notes[item.id] && !isExpanded && (
                      <div className="mt-1 ml-11 text-xs text-surface-400 italic">{notes[item.id]}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

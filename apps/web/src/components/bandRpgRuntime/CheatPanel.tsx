import { useState } from 'react';
import type { RuntimeLevel } from '../../api/bandRpgRuntime';
import type { GameState } from './useGameEngine';
import { analyzeProgression } from './WorldEngine';
import type { WorldSnapshot, ProgressionBlocker } from './WorldEngine';

interface Props {
  state: GameState;
  level: RuntimeLevel;
  onCompleteQuest: (questId: string) => void;
  onGrantItem: (itemId: string, itemName: string) => void;
  onUnlockLevel: (slug: string) => void;
  onTeleport: (x: number, y: number) => void;
  onOpenDoor: (doorId: string) => void;
  onActivateSwitch: (switchId: string) => void;
  onResetSave: () => void;
  onClose: () => void;
}

export default function CheatPanel({ state, level, onCompleteQuest, onGrantItem, onUnlockLevel, onTeleport, onOpenDoor, onActivateSwitch, onResetSave, onClose }: Props) {
  const [itemId, setItemId] = useState('');
  const [itemName, setItemName] = useState('');
  const [levelSlug, setLevelSlug] = useState('');
  const [tpX, setTpX] = useState(String(level.spawnX));
  const [tpY, setTpY] = useState(String(level.spawnY));
  const [stuckReport, setStuckReport] = useState<ProgressionBlocker[] | null>(null);

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 280,
        backgroundColor: 'rgba(0,0,0,0.92)',
        border: '1px solid rgba(34,197,94,0.5)',
        borderRadius: 8,
        padding: 14,
        zIndex: 300,
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#d1fae5',
        overflowY: 'auto',
        maxHeight: '90vh',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: '#22c55e', fontWeight: 700, letterSpacing: '0.1em' }}>⚙ CHEAT PANEL [F4]</span>
        <button onClick={onClose} style={{ color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Quests */}
      <Section label="Quests">
        {level.quests.length === 0 && <div style={{ color: '#374151' }}>No quests in this level</div>}
        {level.quests.map(q => {
          const isActive = state.activeQuestIds.includes(q.id);
          const isDone = state.completedQuests.includes(q.id);
          return (
            <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ color: isDone ? '#374151' : '#d1fae5', fontSize: 11, flex: 1 }}>
                {isDone ? '✅' : isActive ? '⚡' : '📋'} {q.name}
              </span>
              {!isDone && (
                <button
                  onClick={() => onCompleteQuest(q.id)}
                  style={{ ...btnStyle, marginLeft: 8 }}
                >
                  Done
                </button>
              )}
            </div>
          );
        })}
      </Section>

      {/* Items */}
      <Section label="Grant Item">
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input
            placeholder="Item ID"
            value={itemId}
            onChange={e => setItemId(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Label"
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
        <button
          onClick={() => { if (itemId) { onGrantItem(itemId, itemName || itemId); setItemId(''); setItemName(''); } }}
          disabled={!itemId}
          style={{ ...btnStyle, width: '100%' }}
        >
          Grant Item
        </button>
        {/* Quick-grant items from this level */}
        {level.items.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ color: '#4b5563', marginBottom: 3 }}>Level items:</div>
            {level.items.map(item => (
              <button
                key={item.id}
                onClick={() => onGrantItem(item.id, item.name)}
                style={{ ...btnStyle, marginBottom: 2, width: '100%', textAlign: 'left' }}
              >
                {item.name} <span style={{ color: '#4b5563' }}>[{item.id}]</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* Unlock level */}
      <Section label="Unlock Level">
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            placeholder="level-slug"
            value={levelSlug}
            onChange={e => setLevelSlug(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={() => { if (levelSlug) { onUnlockLevel(levelSlug); setLevelSlug(''); } }}
            disabled={!levelSlug}
            style={btnStyle}
          >
            Unlock
          </button>
        </div>
      </Section>

      {/* Teleport */}
      <Section label="Teleport">
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ color: '#4b5563' }}>X</span>
          <input value={tpX} onChange={e => setTpX(e.target.value)} style={{ ...inputStyle, width: 50 }} />
          <span style={{ color: '#4b5563' }}>Y</span>
          <input value={tpY} onChange={e => setTpY(e.target.value)} style={{ ...inputStyle, width: 50 }} />
          <button
            onClick={() => {
              const x = parseInt(tpX, 10);
              const y = parseInt(tpY, 10);
              if (!isNaN(x) && !isNaN(y)) onTeleport(x, y);
            }}
            style={btnStyle}
          >
            Go
          </button>
        </div>
        <div style={{ color: '#374151', fontSize: 10, marginTop: 3 }}>
          Spawn: ({level.spawnX}, {level.spawnY}) · Map: {level.mapData.width}×{level.mapData.height}
        </div>
      </Section>

      {/* Doors */}
      {level.doors.length > 0 && (
        <Section label="Doors">
          {level.doors.map(door => {
            const isOpen = state.openedDoors.includes(door.id) || door.openedByDefault;
            return (
              <div key={door.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: isOpen ? '#4b5563' : '#d1fae5', fontSize: 11, flex: 1 }}>
                  {isOpen ? '🔓' : '🔒'} {door.name}
                </span>
                {!isOpen && (
                  <button onClick={() => onOpenDoor(door.id)} style={{ ...btnStyle, marginLeft: 8 }}>Open</button>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* Switches */}
      {level.switches.length > 0 && (
        <Section label="Switches">
          {level.switches.map(sw => {
            const isOn = state.activatedSwitches.includes(sw.id);
            return (
              <div key={sw.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: isOn ? '#4b5563' : '#d1fae5', fontSize: 11, flex: 1 }}>
                  {isOn ? '✅' : '🔘'} {sw.name}
                </span>
                {!isOn && (
                  <button onClick={() => onActivateSwitch(sw.id)} style={{ ...btnStyle, marginLeft: 8 }}>Fire</button>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* Stuck? */}
      <Section label="🔍 Stuck? Progression Check">
        <button
          onClick={() => {
            const snap: WorldSnapshot = {
              inventory: state.inventory,
              activeQuestIds: state.activeQuestIds,
              completedQuests: state.completedQuests,
              unlockedBeats: state.unlockedBeats,
              activatedSwitches: state.activatedSwitches,
              openedDoors: state.openedDoors,
              worldState: state.worldState,
            };
            setStuckReport(analyzeProgression(level.doors, level.exits, snap));
          }}
          style={{ ...btnStyle, width: '100%' }}
        >
          Analyze Progression
        </button>
        {stuckReport !== null && (
          <div style={{ marginTop: 6 }}>
            {stuckReport.length === 0 ? (
              <div style={{ color: '#34d399', fontSize: 10 }}>✓ No blockers found — all doors and exits passable</div>
            ) : (
              stuckReport.map((b, i) => (
                <div key={i} style={{ marginTop: 4, fontSize: 10, borderLeft: '2px solid #ef4444', paddingLeft: 6 }}>
                  <div style={{ color: '#fca5a5', fontWeight: 600 }}>{b.category === 'door' ? '🔒' : '🚪'} {b.entityName}</div>
                  <div style={{ color: '#6b7280' }}>{b.reason}</div>
                </div>
              ))
            )}
          </div>
        )}
      </Section>

      {/* Danger Zone */}
      <Section label="⚠ Danger Zone">
        <button
          onClick={() => {
            if (window.confirm('Reset ALL game progress for this save? This cannot be undone.')) {
              onResetSave();
            }
          }}
          style={{ ...btnStyle, width: '100%', borderColor: 'rgba(239,68,68,0.4)', color: '#fca5a5', backgroundColor: 'rgba(239,68,68,0.1)' }}
        >
          Reset Save Progress
        </button>
        <div style={{ color: '#374151', fontSize: 10, marginTop: 4 }}>
          Wipes all quests, inventory, objectives, doors and switches. Use to clear corrupted test state.
        </div>
      </Section>

      {/* State summary */}
      <Section label="State">
        <div style={{ color: '#4b5563', lineHeight: 1.7 }}>
          <div>Player: ({state.playerX}, {state.playerY})</div>
          <div>Objectives done: {state.completedObjectives.length}</div>
          <div>Quests active: {state.activeQuestIds.length}</div>
          <div>Inventory: {state.inventory.length} items</div>
          <div>Unlocked levels: {state.unlockedLevelSlugs.length}</div>
          <div>Beats shown: {state.unlockedBeats.length}</div>
          <div>Doors open: {state.openedDoors.length}</div>
          <div>Switches on: {state.activatedSwitches.length}</div>
        </div>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ color: '#22c55e', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid rgba(34,197,94,0.2)', paddingBottom: 3, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'rgba(34,197,94,0.15)',
  border: '1px solid rgba(34,197,94,0.3)',
  borderRadius: 4,
  color: '#86efac',
  fontSize: 11,
  padding: '3px 8px',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  backgroundColor: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(34,197,94,0.25)',
  borderRadius: 4,
  color: '#d1fae5',
  fontSize: 11,
  padding: '3px 6px',
  flex: 1,
  fontFamily: 'monospace',
};

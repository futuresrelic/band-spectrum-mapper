import type { RuntimeLevel } from '../../api/bandRpgRuntime';
import type { GameState } from './useGameEngine';
import { canOpenDoor, isDoorOpen } from './WorldEngine';
import type { WorldSnapshot } from './WorldEngine';

interface Props {
  state: GameState;
  level: RuntimeLevel;
}

export default function DebugPanel({ state, level }: Props) {
  const snap: WorldSnapshot = {
    inventory: state.inventory,
    activeQuestIds: state.activeQuestIds,
    completedQuests: state.completedQuests,
    unlockedBeats: state.unlockedBeats,
    activatedSwitches: state.activatedSwitches,
    openedDoors: state.openedDoors,
    worldState: state.worldState,
  };

  const rows: [string, string][] = [
    ['Level', `${level.name} (${level.slug})`],
    ['Player', `tile (${state.playerX}, ${state.playerY})`],
    ['Map', `${level.mapData.width}×${level.mapData.height}`],
    ['Dialogue', `${state.dialogueMode} · line ${state.dialogueIndex}/${state.dialogueLines.length}`],
    ['NPCs', `${level.npcs.length}`],
    ['Items on map', `${level.items.length} / ${state.collectedEntityIds.size} collected`],
    ['Exits', `${level.exits.length}`],
    ['Quests active', `${state.activeQuestIds.length} / ${level.quests.length} total`],
    ['Quests done', `${state.completedQuests.length}`],
    ['Objectives done', `${state.completedObjectives.length}`],
    ['Inventory slots', `${state.inventory.length}`],
    ['Unlocked levels', `${state.unlockedLevelSlugs.length}`],
    ['Beats shown', `${state.unlockedBeats.length} / ${level.beats.length} total`],
    ['Pending beats', `${state.pendingBeats.length}`],
    ['Doors', `${level.doors.length} total / ${state.openedDoors.length} open`],
    ['Door collision', level.doors.length === 0 ? 'none' : `${level.doors.filter(d => isDoorOpen(d, snap)).length}/${level.doors.length} passable`],
    ['Switches', `${level.switches.length} total / ${state.activatedSwitches.length} on`],
    ['Puzzles', `${level.puzzles.length}`],
    ['World keys', `${Object.keys(state.worldState).length}`],
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.92)',
        border: '1px solid rgba(34,197,94,0.4)',
        borderRadius: 6,
        padding: '8px 12px',
        zIndex: 200,
        minWidth: 320,
        maxHeight: '90vh',
        overflowY: 'auto',
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: '#22c55e', fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: '0.1em' }}>
        ⚙ DEBUG [F3] · CHEAT [F4]
      </div>

      {/* Summary */}
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, fontSize: 10, lineHeight: 1.65 }}>
          <span style={{ color: '#6b7280', minWidth: 100 }}>{label}</span>
          <span style={{ color: '#d1fae5' }}>{value}</span>
        </div>
      ))}

      {/* Inventory detail */}
      {state.inventory.length > 0 && (
        <Sec label="INVENTORY (itemId = slug)">
          {state.inventory.map(e => (
            <Row key={e.itemId} label={e.itemId} value={`×${e.quantity}`} />
          ))}
        </Sec>
      )}

      {/* Items on this level */}
      {level.items.length > 0 && (
        <Sec label="LEVEL ITEMS">
          {level.items.map(item => {
            const collected = state.collectedEntityIds.has(item.entityId);
            const inInv = state.inventory.some(e => e.itemId === item.id);
            return (
              <div key={item.entityId} style={{ fontSize: 10, color: collected ? '#4b5563' : '#d1fae5', lineHeight: 1.6 }}>
                {collected ? '✓' : '○'} <span style={{ color: '#86efac' }}>{item.id}</span> — {item.name} @ ({item.tileX},{item.tileY})
                {inInv ? ' [in inv]' : ''}
              </div>
            );
          })}
        </Sec>
      )}

      {/* Active quest objectives */}
      {state.activeQuestIds.length > 0 && (
        <Sec label="ACTIVE OBJECTIVES">
          {state.activeQuestIds.map(qId => {
            const q = level.quests.find(q2 => q2.id === qId);
            if (!q) return <Row key={qId} label="?" value={qId} />;
            const ids: string[] = Array.isArray(q.objectiveIds) ? q.objectiveIds as string[] : [];
            return ids.map(oId => {
              const obj = level.objectives.find(o => o.id === oId);
              if (!obj) return null;
              const done = state.completedObjectives.includes(oId) || (state.objectiveProgress[oId] ?? 0) >= 1;
              const prog = state.objectiveProgress[oId] ?? 0;
              return (
                <div key={oId} style={{ fontSize: 10, lineHeight: 1.6, color: done ? '#4b5563' : '#fde68a' }}>
                  {done ? '✓' : `${prog}/1`} <span style={{ color: '#94a3b8' }}>{obj.type}</span>:{obj.target ?? '(no target!)'} — {obj.name}
                </div>
              );
            });
          })}
        </Sec>
      )}

      {/* Adjacent NPCs */}
      {level.npcs.filter(n => Math.abs(state.playerX - n.tileX) + Math.abs(state.playerY - n.tileY) <= 1).length > 0 && (
        <Sec label="ADJACENT NPCs">
          {level.npcs
            .filter(n => Math.abs(state.playerX - n.tileX) + Math.abs(state.playerY - n.tileY) <= 1)
            .map(n => (
              <div key={n.id} style={{ fontSize: 10, color: '#d1fae5' }}>
                {n.name} @ ({n.tileX},{n.tileY}) · {n.dialogue.length} lines · role:{n.role ?? 'none'}
              </div>
            ))}
        </Sec>
      )}

      {/* Doors with condition evaluation */}
      {level.doors.length > 0 && (
        <Sec label="DOORS (condition eval)">
          {level.doors.map(door => {
            const open = isDoorOpen(door, snap);
            const canOpen = canOpenDoor(door, snap);
            const cond = door.lockCondition;
            const condStr = cond
              ? `${cond.type}=${cond.targetId ?? cond.targetSlug ?? '?'}`
              : 'none';
            const tileVal = level.mapData.tiles[door.tileY]?.[door.tileX] ?? '?';
            return (
              <div key={door.id} style={{ fontSize: 10, lineHeight: 1.6, color: open ? '#4b5563' : canOpen ? '#34d399' : '#f87171' }}>
                {open ? '🔓 OPEN' : canOpen ? '✓ CAN OPEN' : '🔒 LOCKED'} {door.name} [{door.type}]
                {!open && <span style={{ color: '#6b7280' }}> · {condStr}</span>}
                <span style={{ color: '#374151' }}> · tile={tileVal} · {open ? 'PASSABLE' : 'BLOCKED'}</span>
              </div>
            );
          })}
        </Sec>
      )}

      {/* World state */}
      {Object.keys(state.worldState).length > 0 && (
        <Sec label="WORLD STATE">
          {Object.entries(state.worldState).map(([k, v]) => (
            <Row key={k} label={k} value={String(v)} />
          ))}
        </Sec>
      )}
    </div>
  );
}

function Sec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid rgba(34,197,94,0.2)' }}>
      <div style={{ color: '#6b7280', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 10, lineHeight: 1.65 }}>
      <span style={{ color: '#6b7280', minWidth: 80 }}>{label}</span>
      <span style={{ color: '#d1fae5' }}>{value}</span>
    </div>
  );
}

import type { RuntimeLevel } from '../../api/bandRpgRuntime';
import type { GameState } from './useGameEngine';

interface Props {
  state: GameState;
  level: RuntimeLevel;
}

export default function DebugPanel({ state, level }: Props) {
  const row: [string, string][] = [
    ['Level', `${level.name} (${level.slug})`],
    ['Player', `tile (${state.playerX}, ${state.playerY})`],
    ['Map', `${level.mapData.width}×${level.mapData.height}`],
    ['NPCs', `${level.npcs.length}`],
    ['Items', `${level.items.length} total / ${state.collectedEntityIds.size} collected`],
    ['Exits', `${level.exits.length}`],
    ['Quests', `${level.quests.length} / ${state.completedQuests.length} done`],
    ['Objectives', `${state.completedObjectives.length} done`],
    ['Inventory', `${state.inventory.length} slots`],
    ['Story Beats', `${state.unlockedBeats.length} unlocked`],
    ['Active NPC', state.activeNpc ? `${state.activeNpc.name} (line ${state.dialogueIndex + 1}/${state.activeNpc.dialogue.length})` : 'none'],
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(34,197,94,0.4)',
        borderRadius: 6,
        padding: '8px 12px',
        zIndex: 200,
        minWidth: 260,
        fontFamily: 'monospace',
      }}
    >
      <div style={{ color: '#22c55e', fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: '0.1em' }}>
        ⚙ DEBUG [F3 to toggle]
      </div>
      {row.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, fontSize: 10, lineHeight: 1.6 }}>
          <span style={{ color: '#6b7280', minWidth: 80 }}>{label}</span>
          <span style={{ color: '#d1fae5' }}>{value}</span>
        </div>
      ))}
      <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(34,197,94,0.2)' }}>
        <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 3 }}>ADJACENT NPCs</div>
        {level.npcs
          .filter(n => Math.abs(state.playerX - n.tileX) + Math.abs(state.playerY - n.tileY) <= 1)
          .map(n => (
            <div key={n.id} style={{ color: '#d1fae5', fontSize: 10 }}>
              {n.name} @ ({n.tileX},{n.tileY}) — {n.dialogue.length} lines
            </div>
          ))}
      </div>
    </div>
  );
}

import type { RuntimeLevel } from '../../api/bandRpgRuntime';
import type { GameState } from './useGameEngine';

interface Props {
  state: GameState;
  level: RuntimeLevel;
}

export default function DebugPanel({ state, level }: Props) {
  const rows: [string, string][] = [
    ['Level', `${level.name} (${level.slug})`],
    ['Player', `tile (${state.playerX}, ${state.playerY})`],
    ['Map', `${level.mapData.width}×${level.mapData.height}`],
    ['Dialogue', `${state.dialogueMode} · line ${state.dialogueIndex}/${state.dialogueLines.length}`],
    ['NPCs', `${level.npcs.length}`],
    ['Items', `${level.items.length} / ${state.collectedEntityIds.size} collected`],
    ['Exits', `${level.exits.length}`],
    ['Quests active', `${state.activeQuestIds.length} / ${level.quests.length} total`],
    ['Quests done', `${state.completedQuests.length}`],
    ['Objectives', `${state.completedObjectives.length} done`],
    ['Inventory', `${state.inventory.length} slots`],
    ['Unlocked levels', `${state.unlockedLevelSlugs.length}`],
    ['Beats shown', `${state.unlockedBeats.length} / ${level.beats.length} total`],
    ['Pending beats', `${state.pendingBeats.length}`],
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.88)',
        border: '1px solid rgba(34,197,94,0.4)',
        borderRadius: 6,
        padding: '8px 12px',
        zIndex: 200,
        minWidth: 280,
        fontFamily: 'monospace',
        pointerEvents: 'none',
      }}
    >
      <div style={{ color: '#22c55e', fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: '0.1em' }}>
        ⚙ DEBUG [F3] · CHEAT [F4]
      </div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, fontSize: 10, lineHeight: 1.65 }}>
          <span style={{ color: '#6b7280', minWidth: 88 }}>{label}</span>
          <span style={{ color: '#d1fae5' }}>{value}</span>
        </div>
      ))}

      {level.npcs.filter(n => Math.abs(state.playerX - n.tileX) + Math.abs(state.playerY - n.tileY) <= 1).length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 3 }}>ADJACENT NPCs</div>
          {level.npcs
            .filter(n => Math.abs(state.playerX - n.tileX) + Math.abs(state.playerY - n.tileY) <= 1)
            .map(n => (
              <div key={n.id} style={{ color: '#d1fae5', fontSize: 10 }}>
                {n.name} @ ({n.tileX},{n.tileY}) — {n.dialogue.length} lines · role: {n.role ?? 'none'}
              </div>
            ))}
        </div>
      )}

      {state.activeQuestIds.length > 0 && (
        <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ color: '#6b7280', fontSize: 9, marginBottom: 3 }}>ACTIVE QUESTS</div>
          {state.activeQuestIds.map(id => {
            const q = level.quests.find(q2 => q2.id === id);
            return <div key={id} style={{ color: '#d1fae5', fontSize: 10 }}>{q?.name ?? id}</div>;
          })}
        </div>
      )}
    </div>
  );
}

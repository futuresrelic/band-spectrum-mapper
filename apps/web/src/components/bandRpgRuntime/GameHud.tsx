import type { RuntimeLevel, RuntimeQuest, InventoryEntry } from '../../api/bandRpgRuntime';

const RARITY_COLOR: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#34d399',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

interface Props {
  level: RuntimeLevel;
  completedQuests: string[];
  completedObjectives: string[];
  inventory: InventoryEntry[];
  notification: string | null;
}

export default function GameHud({ level, completedQuests, completedObjectives, inventory, notification }: Props) {
  const activeQuests = level.quests.filter(q => !completedQuests.includes(q.id));
  const doneQuests = level.quests.filter(q => completedQuests.includes(q.id));

  return (
    <div
      style={{
        width: 220,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '12px 0',
        overflowY: 'auto',
      }}
    >
      {/* Level name */}
      <div style={{ padding: '0 12px' }}>
        <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
          Current Level
        </div>
        <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600 }}>{level.name}</div>
      </div>

      <Divider />

      {/* Notification */}
      {notification && (
        <div style={{ padding: '0 12px' }}>
          <div style={{ backgroundColor: 'rgba(253,230,138,0.12)', border: '1px solid rgba(253,230,138,0.3)', borderRadius: 6, padding: '6px 10px' }}>
            <span style={{ color: '#fde68a', fontSize: 12 }}>{notification}</span>
          </div>
        </div>
      )}

      {/* Quests */}
      <div style={{ padding: '0 12px' }}>
        <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Quests
        </div>
        {activeQuests.length === 0 && doneQuests.length === 0 && (
          <p style={{ color: '#475569', fontSize: 12, fontStyle: 'italic' }}>No quests in this level.</p>
        )}
        {activeQuests.map(q => (
          <QuestEntry key={q.id} quest={q} completedObjectives={completedObjectives} done={false} />
        ))}
        {doneQuests.map(q => (
          <QuestEntry key={q.id} quest={q} completedObjectives={completedObjectives} done />
        ))}
      </div>

      <Divider />

      {/* Inventory */}
      <div style={{ padding: '0 12px' }}>
        <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Inventory
        </div>
        {inventory.length === 0 && (
          <p style={{ color: '#475569', fontSize: 12, fontStyle: 'italic' }}>Empty.</p>
        )}
        {inventory.map(entry => {
          const item = level.items.find(i => i.id === entry.itemId);
          const name = item?.name ?? entry.itemId;
          const rarity = item?.rarity ?? 'common';
          return (
            <div key={entry.itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: RARITY_COLOR[rarity] ?? '#9ca3af' }}>{name}</span>
              {entry.quantity > 1 && (
                <span style={{ fontSize: 11, color: '#64748b' }}>×{entry.quantity}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ padding: '0 12px', marginTop: 'auto' }}>
        <Divider />
        <div style={{ color: '#475569', fontSize: 10, lineHeight: 1.7, marginTop: 8 }}>
          <div>WASD / Arrows — Move</div>
          <div>E / Enter — Interact</div>
          <div>Esc — Close dialogue</div>
        </div>
      </div>
    </div>
  );
}

function QuestEntry({ quest, completedObjectives, done }: { quest: RuntimeQuest; completedObjectives: string[]; done: boolean }) {
  const objectiveIds: string[] = Array.isArray(quest.objectiveIds) ? (quest.objectiveIds as string[]) : [];
  const doneCount = objectiveIds.filter(id => completedObjectives.includes(id)).length;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12 }}>{done ? '✅' : '📋'}</span>
        <span style={{ fontSize: 12, color: done ? '#64748b' : '#e2e8f0', textDecoration: done ? 'line-through' : 'none' }}>
          {quest.name}
        </span>
      </div>
      {!done && objectiveIds.length > 0 && (
        <div style={{ color: '#64748b', fontSize: 11, paddingLeft: 18, marginTop: 2 }}>
          {doneCount}/{objectiveIds.length} objectives
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '0 12px' }} />;
}

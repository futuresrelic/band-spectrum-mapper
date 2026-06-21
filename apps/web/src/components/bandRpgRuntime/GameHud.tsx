import type { RuntimeLevel, RuntimeQuest, InventoryEntry } from '../../api/bandRpgRuntime';
import { getQuestState, areAllQuestObjectivesDone, isObjectiveDone } from './QuestEngine';

const RARITY_COLOR: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#34d399',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

const ITEM_TYPE_ICON: Record<string, string> = {
  collectible: '💿', key_item: '🗝️', quest_item: '📜',
  power_up: '⚡', lore_item: '📖', album_artifact: '🎵',
  song_artifact: '🎶', cosmetic: '🎨',
};


interface Props {
  level: RuntimeLevel;
  adventureName?: string | null;
  activeQuestIds: string[];
  completedQuests: string[];
  completedObjectives: string[];
  objectiveProgress: Record<string, number>;
  inventory: InventoryEntry[];
  notification: string | null;
  unlockedLevelSlugs: string[];
}

export default function GameHud({
  level, adventureName, activeQuestIds, completedQuests, completedObjectives,
  objectiveProgress, inventory, notification, unlockedLevelSlugs,
}: Props) {
  const allQuests = level.quests;
  const activeQuests = allQuests.filter(q => activeQuestIds.includes(q.id));
  const completedQuestsList = allQuests.filter(q => completedQuests.includes(q.id));
  const availableQuests = allQuests.filter(q => {
    const state = getQuestState(q, activeQuestIds, completedQuests, allQuests);
    return state === 'available';
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', color: 'white' }}>

      {/* Adventure name — shown when playing an adventure */}
      {adventureName && (
        <div style={{ padding: '10px 12px 4px' }}>
          <div style={{ color: '#4f46e5', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
            Adventure
          </div>
          <div style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{adventureName}</div>
        </div>
      )}

      {/* Level name */}
      <div style={{ padding: adventureName ? '4px 12px 8px' : '12px 12px 8px' }}>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
          Location
        </div>
        <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{level.name}</div>
      </div>

      <Divider />

      {/* Notification */}
      {notification && (
        <div style={{ padding: '6px 12px' }}>
          <div style={{ backgroundColor: 'rgba(253,230,138,0.1)', border: '1px solid rgba(253,230,138,0.25)', borderRadius: 6, padding: '5px 9px' }}>
            <span style={{ color: '#fde68a', fontSize: 12 }}>{notification}</span>
          </div>
        </div>
      )}

      {/* Active Quests */}
      {activeQuests.length > 0 && (
        <div style={{ padding: '8px 12px 4px' }}>
          <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Active Quests
          </div>
          {activeQuests.map(q => (
            <ActiveQuestCard
              key={q.id}
              quest={q}
              objectives={level.objectives}
              completedObjectives={completedObjectives}
              objectiveProgress={objectiveProgress}
            />
          ))}
        </div>
      )}

      {/* Available Quests */}
      {availableQuests.length > 0 && (
        <div style={{ padding: '4px 12px' }}>
          <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Available
          </div>
          {availableQuests.map(q => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontSize: 11 }}>📋</span>
              <span style={{ fontSize: 12, color: '#fbbf24' }}>{q.name}</span>
              <span style={{ fontSize: 10, color: '#4b5563' }}>· talk to NPC</span>
            </div>
          ))}
        </div>
      )}

      {/* Completed */}
      {completedQuestsList.length > 0 && (
        <div style={{ padding: '4px 12px' }}>
          {completedQuestsList.map(q => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <span style={{ fontSize: 11 }}>✅</span>
              <span style={{ fontSize: 12, color: '#374151', textDecoration: 'line-through' }}>{q.name}</span>
            </div>
          ))}
        </div>
      )}

      {allQuests.length === 0 && (
        <div style={{ padding: '0 12px' }}>
          <p style={{ color: '#374151', fontSize: 12, fontStyle: 'italic' }}>No quests in this level.</p>
        </div>
      )}

      <Divider />

      {/* Inventory */}
      <div style={{ padding: '8px 12px 4px' }}>
        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          Inventory
        </div>
        {inventory.length === 0 && (
          <p style={{ color: '#374151', fontSize: 12, fontStyle: 'italic' }}>Empty.</p>
        )}
        {inventory.map(entry => {
          const item = level.items.find(i => i.id === entry.itemId);
          const name = item?.name ?? entry.itemId;
          const rarity = item?.rarity ?? 'common';
          const icon = item ? (ITEM_TYPE_ICON[item.rarity] ?? '●') : '●';
          return (
            <div key={entry.itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 12 }}>{icon}</span>
                <span style={{ fontSize: 12, color: RARITY_COLOR[rarity] ?? '#9ca3af' }}>{name}</span>
              </div>
              {entry.quantity > 1 && <span style={{ fontSize: 11, color: '#4b5563' }}>×{entry.quantity}</span>}
            </div>
          );
        })}
      </div>

      {/* Level exits */}
      {level.exits.length > 0 && (
        <>
          <Divider />
          <div style={{ padding: '6px 12px' }}>
            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Exits
            </div>
            {level.exits.map((exit, i) => {
              const locked = unlockedLevelSlugs.length > 0 && !unlockedLevelSlugs.includes(exit.targetLevelSlug);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 11 }}>{locked ? '🔒' : '🚪'}</span>
                  <span style={{ fontSize: 12, color: locked ? '#4b5563' : '#94a3b8' }}>
                    {exit.label ?? exit.targetLevelSlug}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Controls */}
      <div style={{ padding: '8px 12px', marginTop: 'auto' }}>
        <Divider />
        <div style={{ color: '#374151', fontSize: 10, lineHeight: 1.8, marginTop: 6 }}>
          <div>WASD / Arrows — Move</div>
          <div>E / Enter — Interact / Next</div>
          <div>Esc — Close dialogue</div>
        </div>
      </div>
    </div>
  );
}

// ── Active quest card ─────────────────────────────────────────────────────────

interface ActiveQuestCardProps {
  quest: RuntimeQuest;
  objectives: RuntimeLevel['objectives'];
  completedObjectives: string[];
  objectiveProgress: Record<string, number>;
}

function ActiveQuestCard({ quest, objectives, completedObjectives, objectiveProgress }: ActiveQuestCardProps) {
  const allDone = areAllQuestObjectivesDone(quest, objectives, completedObjectives, objectiveProgress);
  const ids: string[] = Array.isArray(quest.objectiveIds) ? quest.objectiveIds as string[] : [];
  const questObjs = ids.map(id => objectives.find(o => o.id === id)).filter(Boolean) as typeof objectives;

  return (
    <div style={{ marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 11 }}>{allDone ? '⚡✅' : '⚡'}</span>
        <span style={{ fontSize: 12, color: allDone ? '#34d399' : '#60a5fa', fontWeight: 600 }}>{quest.name}</span>
      </div>
      {allDone && (
        <div style={{ color: '#fde68a', fontSize: 11, paddingLeft: 16 }}>
          Ready to turn in! Talk to quest giver.
        </div>
      )}
      {!allDone && questObjs.map(obj => {
        const done = isObjectiveDone(obj, completedObjectives, objectiveProgress);
        const progress = objectiveProgress[obj.id] ?? 0;
        const required = typeof (obj.condition as Record<string, unknown>)['required'] === 'number'
          ? (obj.condition as Record<string, unknown>)['required'] as number
          : 1;
        const showProgress = required > 1;
        return (
          <div key={obj.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: 10 }}>{done ? '✓' : '○'}</span>
            <span style={{ fontSize: 11, color: done ? '#4b5563' : '#94a3b8', textDecoration: done ? 'line-through' : 'none' }}>
              {obj.name}
              {showProgress && !done && ` (${progress}/${required})`}
            </span>
            {obj.isOptional && <span style={{ fontSize: 9, color: '#374151' }}>opt</span>}
          </div>
        );
      })}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', margin: '4px 12px' }} />;
}

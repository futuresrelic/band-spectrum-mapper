import type { RuntimeQuest, RuntimeBeat, RuntimeObjective, DialogueLine } from '../../api/bandRpgRuntime';

// ── Quest State ────────────────────────────────────────────────────────────────

export type QuestState = 'locked' | 'available' | 'active' | 'completed';

export function getQuestState(
  quest: RuntimeQuest,
  activeQuestIds: string[],
  completedQuests: string[],
  allQuests: RuntimeQuest[],
): QuestState {
  if (completedQuests.includes(quest.id)) return 'completed';
  if (activeQuestIds.includes(quest.id)) return 'active';
  // A quest is locked when another quest's unlocksQuestId points to it and that quest isn't done
  const unlocker = allQuests.find(q => q.unlocksQuestId === quest.id);
  if (unlocker && !completedQuests.includes(unlocker.id)) return 'locked';
  return 'available';
}

// ── Rewards ───────────────────────────────────────────────────────────────────

export interface QuestReward {
  xp?: number;
  archivePoints?: number;
  items?: Array<{ itemId: string; quantity: number; itemName?: string }>;
  unlockQuestId?: string;
  unlockLevelSlug?: string;
  unlockBeatId?: string;
  message?: string;
}

export function parseReward(raw: Record<string, unknown>): QuestReward {
  return {
    ...(typeof raw['xp'] === 'number' ? { xp: raw['xp'] } : {}),
    ...(typeof raw['archivePoints'] === 'number' ? { archivePoints: raw['archivePoints'] } : {}),
    ...(Array.isArray(raw['items']) ? { items: raw['items'] as QuestReward['items'] } : {}),
    ...(typeof raw['unlockQuestId'] === 'string' ? { unlockQuestId: raw['unlockQuestId'] } : {}),
    ...(typeof raw['unlockLevelSlug'] === 'string' ? { unlockLevelSlug: raw['unlockLevelSlug'] } : {}),
    ...(typeof raw['unlockBeatId'] === 'string' ? { unlockBeatId: raw['unlockBeatId'] } : {}),
    ...(typeof raw['message'] === 'string' ? { message: raw['message'] } : {}),
  };
}

// ── Objectives ────────────────────────────────────────────────────────────────

export type ObjectiveEventType =
  | 'collect_item' | 'talk_to_npc' | 'reach_location'
  | 'visit_level' | 'complete_quest' | 'recover_song';

export interface ObjectiveEvent {
  type: ObjectiveEventType;
  npcId?: string;
  itemId?: string;
  x?: number;
  y?: number;
  levelSlug?: string;
  questId?: string;
  songId?: string;
}

export function getRequiredCount(objective: RuntimeObjective): number {
  const cond = objective.condition as Record<string, unknown>;
  const req = cond['required'];
  return typeof req === 'number' ? req : 1;
}

export function isObjectiveDone(
  objective: RuntimeObjective,
  completedObjectives: string[],
  objectiveProgress: Record<string, number>,
): boolean {
  if (completedObjectives.includes(objective.id)) return true;
  return (objectiveProgress[objective.id] ?? 0) >= getRequiredCount(objective);
}

export function getObjectiveProgressDelta(
  objective: RuntimeObjective,
  event: ObjectiveEvent,
): number {
  const target = objective.target ?? '';
  switch (objective.type) {
    case 'talk_to_npc':
      return event.type === 'talk_to_npc' && event.npcId === target ? 1 : 0;

    // find_item / collect_item / CollectItem — JSON type aliases for the same behaviour.
    // Requires a non-empty target; an objective without a specific target slug NEVER
    // auto-completes (prevents corrupted state when target is missing from the DB record).
    case 'find_item':
    case 'collect_item':
    case 'CollectItem':
      if (event.type !== 'collect_item') return 0;
      if (!target) return 0; // guard: never match without a specific target
      return event.itemId === target ? 1 : 0;

    // collect_objects is intentionally looser — any item satisfies it when target is empty
    case 'collect_objects':
      if (event.type !== 'collect_item') return 0;
      return (target === '' || event.itemId === target) ? 1 : 0;

    case 'reach_location': {
      if (event.type !== 'reach_location') return 0;
      const parts = target.split(',');
      const tx = Number(parts[0]);
      const ty = Number(parts[1]);
      return (event.x === tx && event.y === ty) ? 1 : 0;
    }
    case 'inspect_object':
      return event.type === 'visit_level' && event.levelSlug === target ? 1 : 0;
    case 'complete_sequence':
      return event.type === 'complete_quest' && event.questId === target ? 1 : 0;
    case 'trigger_music_node':
      if (event.type !== 'recover_song') return 0;
      return (target === '' || event.songId === target) ? 1 : 0;
    default:
      return 0;
  }
}

export function areAllQuestObjectivesDone(
  quest: RuntimeQuest,
  objectives: RuntimeObjective[],
  completedObjectives: string[],
  objectiveProgress: Record<string, number>,
): boolean {
  const ids: string[] = Array.isArray(quest.objectiveIds) ? quest.objectiveIds as string[] : [];
  if (ids.length === 0) return true;
  return ids.every(id => {
    const obj = objectives.find(o => o.id === id);
    if (!obj || obj.isOptional) return true;
    return isObjectiveDone(obj, completedObjectives, objectiveProgress);
  });
}

// ── Story Beat Triggers ───────────────────────────────────────────────────────

export type BeatTriggerType =
  | 'quest_start' | 'quest_complete' | 'item_collected' | 'npc_interact'
  | 'level_enter' | 'level_exit' | 'objective_complete' | 'always';

export interface TriggerEvent {
  type: BeatTriggerType;
  targetId?: string;
}

export function findTriggeredBeats(
  event: TriggerEvent,
  beats: RuntimeBeat[],
  unlockedBeats: string[],
): RuntimeBeat[] {
  return beats.filter(beat => {
    if (unlockedBeats.includes(beat.id)) return false;
    const trigger = beat.unlockCondition as Record<string, unknown>;
    const on = trigger['on'] as string | undefined;
    const targetId = trigger['targetId'] as string | undefined;
    if (!on || on === 'always') return true;
    if (on !== event.type) return false;
    if (targetId && targetId !== event.targetId) return false;
    return true;
  });
}

export function beatToDialogueLines(beat: RuntimeBeat): DialogueLine[] {
  const c = beat.content as Record<string, unknown>;
  if (Array.isArray(c['lines'])) return c['lines'] as DialogueLine[];
  const text = typeof c['text'] === 'string' ? c['text'] : '';
  if (!text) return [];
  const line: DialogueLine = { text };
  if (typeof c['speakerName'] === 'string') line.speakerName = c['speakerName'];
  if (Array.isArray(c['choices'])) line.choices = c['choices'] as typeof line.choices;
  return [line];
}

// ── Dynamic NPC Dialogue ──────────────────────────────────────────────────────

export function buildNpcDialogue(
  npcId: string,
  npcName: string,
  npcPortrait: string | null,
  defaultLines: DialogueLine[],
  quests: RuntimeQuest[],
  activeQuestIds: string[],
  completedQuests: string[],
  objectives: RuntimeObjective[],
  completedObjectives: string[],
  objectiveProgress: Record<string, number>,
): DialogueLine[] {
  const npcQuests = quests.filter(q => q.giverId === npcId);

  if (npcQuests.length === 0) {
    return defaultLines.length > 0
      ? defaultLines
      : [{ text: '...', speakerName: npcName }];
  }

  const base = {
    speakerName: npcName,
    ...(npcPortrait ? { portraitUrl: npcPortrait } : {}),
  };

  const questLines: DialogueLine[] = [];
  for (const quest of npcQuests) {
    const state = getQuestState(quest, activeQuestIds, completedQuests, quests);
    if (state === 'locked') continue;

    if (state === 'available') {
      questLines.push({
        ...base,
        text: quest.description ?? `I have a task for you: ${quest.name}.`,
        choices: [
          { text: `Accept: "${quest.name}"`, action: { type: 'accept_quest', targetId: quest.id } },
          { text: 'Not right now', action: { type: 'close' } },
        ],
      });
      continue;
    }

    if (state === 'active') {
      const allDone = areAllQuestObjectivesDone(quest, objectives, completedObjectives, objectiveProgress);
      if (allDone) {
        questLines.push({
          ...base,
          text: `Excellent! You've done everything. Claim your reward.`,
          choices: [
            { text: 'Complete Quest', action: { type: 'complete_quest', targetId: quest.id } },
          ],
        });
      } else {
        const ids: string[] = Array.isArray(quest.objectiveIds) ? quest.objectiveIds as string[] : [];
        const done = ids.filter(id => {
          const obj = objectives.find(o => o.id === id);
          return obj && !obj.isOptional && isObjectiveDone(obj, completedObjectives, objectiveProgress);
        }).length;
        const total = ids.filter(id => objectives.find(o => o.id === id && !o.isOptional)).length;
        questLines.push({
          ...base,
          text: `Keep going — ${done}/${total} objectives complete.`,
        });
      }
      continue;
    }

    if (state === 'completed') {
      questLines.push({ ...base, text: `Thank you for your help.` });
    }
  }

  const lines = [...defaultLines, ...questLines];
  return lines.length > 0 ? lines : [{ text: '...', speakerName: npcName }];
}

// ── Future Foundation Types ───────────────────────────────────────────────────
// Stubs for Enemies, Bosses, Puzzles, Keys, Doors, Abilities, Companions, Combat

export interface FutureFoundation {
  enemies: 'not_implemented';
  bosses: 'not_implemented';
  puzzles: 'not_implemented';
  keys: 'not_implemented';
  doors: 'not_implemented';
  abilities: 'not_implemented';
  companions: 'not_implemented';
  combat: 'not_implemented';
}

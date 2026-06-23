import { Router } from 'express';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { HttpError } from '../middleware/errorHandler.js';
import { pickTemplates, applyTransform, formatTemplateForPrompt } from '@band-spectrum-mapper/shared';
import type { Transform } from '@band-spectrum-mapper/shared';

export const campaignGeneratorRouter = Router();

// All campaign generator endpoints require an authenticated admin session
campaignGeneratorRouter.use(requireAuth, requireAdmin);

const MODEL = 'gpt-4o';
const MAX_REPAIR_ATTEMPTS = 10; // frontend controls the visible limit; this is a safety cap

function getClient(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new HttpError(503, 'OPENAI_API_KEY missing from Railway environment — set it in Railway → Variables');
  return new OpenAI({ apiKey });
}

// ── Adventure format system prompt ────────────────────────────────────────────

const SCHEMA_REFERENCE = `
# Band RPG Adventure JSON Format — Schema Reference

## Top-level Structure
{
  "bandRpgAdventureVersion": 1,
  "exportedAt": "ISO date string",
  "adventure": { "slug", "name", "description", "isPublished", "difficulty", "estimatedPlaytime", "tags" },
  NOTE: estimatedPlaytime MUST be an INTEGER number of MINUTES. Examples: 30, 45, 60, 90, 120.
  NEVER use strings like "2-3 hours", "45 minutes", or "1 hour". Output the bare integer only.
  "items": [...],
  "arcs": [...],
  "quests": [...],
  "levels": [...],
  "timeline": [...]
}

## Items
{ "slug", "name", "description", "type", "rarity", "scoreValue", "isVisible" }
ITEM_TYPES: collectible, key_item, quest_item, power_up, lore_item, album_artifact, song_artifact, cosmetic
ITEM_RARITIES: common, uncommon, rare, epic, legendary

## Arcs
{ "slug", "title", "description", "order" }
Arcs are narrative chapters that group quests and story beats.

## Quests
{ "slug", "name", "description", "giverNpcName", "giverNpcLevelSlug", "reward": { "xp", "message", "items"?, "unlockLevelSlug"? }, "isOptional", "order" }
giverNpcLevelSlug must be the slug of an existing level in this adventure.
giverNpcName must match an NPC name in that level exactly.

## Levels
{ "slug", "name", "description", "order", "spawnX", "spawnY", "isPublished", "mapData": { "width", "height", "tiles", "entities" }, "objectives", "npcs", "beats", "doors", "switches", "puzzles" }

### Map Tiles (tiles array)
- Outer array = rows (Y), inner = columns (X). tiles[y][x]
- 0 = wall (impassable), 1 = floor (walkable), 2 = elevated/decorative floor, 3 = special/highlighted floor
- Border tiles (first/last row, first/last column) are typically walls
- Typical map size: 9x9 to 15x15 tiles

### Map Entities (entities array)
ENTITY TYPES: spawn, exit, item, door, switch, npc
- spawn: { "id", "type": "spawn", "x", "y" } — REQUIRED, exactly one per level, sets player start
- exit: { "id", "type": "exit", "x", "y", "targetLevelSlug", "label" } — place on border wall tile
  - Use targetLevelSlug: "__adventure_complete__" for final exit that ends the adventure
- item: { "id", "type": "item", "x", "y", "refId" } — refId is the item slug
- door: { "id", "type": "door", "x", "y", "refId" } — refId is the door id within this level
- switch: { "id", "type": "switch", "x", "y", "refId" } — refId is the switch id
- npc: { "id", "type": "npc", "x", "y", "refId" } — refId is the npc id within this level

### Objectives (within each level)
{ "name", "description", "type", "target", "condition": {}, "reward": {}, "isOptional", "order" }
OBJECTIVE_TYPES: talk_to_npc, find_item, collect_objects, reach_location, complete_quest, activate_switch, open_door
- talk_to_npc: target = NPC name (must exactly match the NPC's "name" field in this level's npcs[])
- find_item: target = item slug (must exactly match a slug in the top-level items[] array)
- collect_objects: target = item slug (or omit for "any item")
- reach_location: target = "x,y" string (e.g. "5,3")
- activate_switch: target = switch name (must exactly match the switch's "name" field in this level's switches[])
- open_door: target = door name (must exactly match the door's "name" field in this level's doors[])
- complete_quest: target = quest slug (must exactly match a slug in the top-level quests[] array)
IMPORTANT: For activate_switch, target is the switch's "name" string (e.g. "Frequency Lever"), NOT a slug or display label you invent. It must match the switch's "name" field exactly.

### NPCs (within each level)
{ "name", "role": "quest_giver" | "merchant" | "ambient" | null, "positionX", "positionY", "defaultDialogue": [{ "text", "speakerName" }] }
NPC positions are tile coordinates. Must NOT be a wall tile.

### Story Beats (beats within each level)
{ "arcSlug", "type": "dialogue" | "narration" | "cutscene" | "choice" | "unlock" | "trigger", "content": { "lines": [{ "text", "speakerName"? }] }, "unlockCondition": <WorldCondition>, "order" }
IMPORTANT: Use "dialogue" for NPC speech beats — "npc_dialogue" is NOT a valid value and will fail import.

### Doors (within each level)
{ "id", "name", "label", "tileX", "tileY", "type", "lockCondition": <WorldCondition> | null, "openedByDefault" }
DOOR_TYPES: free, key_door, quest_door, story_door, switch_door

### Switches (within each level)
{ "id", "name", "tileX", "tileY", "type": "switch" | "lever" | "button" | "pressure_plate" }

### Puzzles (within each level)
{ "name", "trigger": { "on": <TriggerType>, "targetId"? }, "condition": <WorldCondition>, "action": <PuzzleAction>, "order" }
TRIGGER_TYPES: always, level_enter, npc_interact, item_collected, quest_start, quest_complete, objective_complete, switch_activated, door_opened

## WorldCondition
{ "type": <ConditionType>, "targetSlug"? | "targetId"?, "key"?, "value"? }
CONDITION_TYPES: always, never, item_owned, quest_active, quest_complete, story_beat_seen, switch_activated, door_open, world_state
- Use targetSlug (NOT targetId) for item_owned, quest_complete, quest_active conditions
- For world_state: include "key" and "value" fields

## PuzzleAction
{ "type": <ActionType>, "targetId"? | "targetSlug"?, "key"?, "value"? }
ACTION_TYPES: open_door, close_door, trigger_beat, reveal_exit, set_world_state, grant_item

## Timeline
[{ "title", "type": "level" | "quest", "refSlug", "isRequired", "order" }]
One entry per level and per required quest. type="level" references a level slug; type="quest" references a quest slug.

## Slug Rules
- All slugs: lowercase letters, numbers, hyphens only. Pattern: [a-z0-9-]+
- ALL slugs must be globally unique across the whole BSM system — prefix with a short band code
- Recommended prefix format: 2-4 letter band code + "-" (e.g. "rh-" for Radiohead, "tc-" for Tool, "pk-" for Pink Floyd)
- Adventure slug example: "rh-ok-computer-depths"
- Level slugs are URL-navigable — must be unique across all adventures

## Cross-reference IDs
Entity refId in mapData MUST match the "name" field of the door/switch/NPC, or the "slug" of the item.
- Door entity refId = door's "name" field exactly.    E.g. door named "Vault Gate" → refId: "Vault Gate"
- Switch entity refId = switch's "name" field exactly. E.g. switch named "Power Lever" → refId: "Power Lever"
- NPC entity refId = NPC's "name" field exactly.       E.g. NPC named "Archivist Mira" → refId: "Archivist Mira"
- Item entity refId = item's "slug" field.             E.g. item slug "apc-echo-key" → refId: "apc-echo-key"
NEVER invent a separate ID string for refId — use the name or slug of the thing it references.

## EXIT GATING — MANDATORY (gameplay validator enforces this)
Every non-final level (every level except the one with targetLevelSlug:"__adventure_complete__") MUST
require player action before the exit is reachable. An "ungated" level (spawn → walk to exit) WILL FAIL.

REQUIRED gating mechanisms — use at least ONE per non-final level:
  (A) KEY HUNT (most common):
      1. Add an item entity: {id:"item-e1",type:"item",x:4,y:8,refId:"<item-slug>"}
      2. Add a key_door blocking path to exit:
         { name:"Vault Gate", tileX:8, tileY:1, type:"key_door", openedByDefault:false,
           lockCondition:{type:"item_owned",targetSlug:"<item-slug>"} }
      3. Add door entity at same tile: {id:"door-e1",type:"door",x:8,y:1,refId:"Vault Gate"}
      Result: player must find item → door unlocks → exit accessible.
  (B) SWITCH PUZZLE:
      1. Add a switch: { name:"Power Lever", tileX:3, tileY:5, type:"lever", effect:{type:"open_door",targetName:"Circuit Door"} }
      2. Add a switch_door blocking exit: { name:"Circuit Door", tileX:9,tileY:1,type:"switch_door",openedByDefault:false,lockCondition:{} }
      3. Add entities: switch entity with refId:"Power Lever", door entity with refId:"Circuit Door"
      Result: player must activate switch → door opens → exit accessible.
  (C) QUEST GATE:
      1. Create quest with objective (talk_to_npc, find_item, etc.)
      2. Place quest giver NPC BEFORE the quest door — the NPC must be accessible from spawn
         WITHOUT passing through the quest door.
      3. Add quest_door: { name:"Archive Door", type:"quest_door", openedByDefault:false,
           lockCondition:{type:"quest_complete",targetSlug:"<quest-slug>"} }
      Result: player must complete quest → door unlocks → exit accessible.

      ⚠ CRITICAL ANTI-SOFTLOCK RULE — quest gates:
      NEVER place the quest giver NPC behind the door that requires that quest.
      The quest giver MUST be reachable from spawn before the player crosses the quest door.
      REQUIRED order: Spawn → quest giver NPC → objective target → quest completion → quest door → exit
      FORBIDDEN order: Spawn → quest door → quest giver NPC (player can NEVER start the quest)

FORBIDDEN pattern (will fail gameplay validation):
  Spawn tile → open floor → exit entity (player walks through without doing anything)
  Levels where the ONLY content is an NPC and an exit — these score 0/20 on Progression.

## Adventure Completion (REQUIRED)
The final level MUST include an exit entity with targetLevelSlug: "__adventure_complete__"
This triggers the completion screen. Do NOT create a level named "__adventure_complete__".
`;

const SECURITY_GUIDELINES = `
## Content Guidelines (STRICT — follow exactly)
1. DO NOT embed copyrighted lyrics. Never quote song lyrics verbatim.
2. DO NOT impersonate real musicians or band members as NPCs.
3. NPCs should be fictional characters (archivists, fans, collectors, sound engineers, etc.)
4. You MAY reference band names, album titles, and song titles by name.
5. Dialogue should reference the music/themes abstractly, not quote lyrics.
6. Generate unique, evocative content appropriate for a music fan.
`;

function buildSystemPrompt(): string {
  return `You are an expert Band RPG adventure designer for the Band Spectrum Mapper system.
You create immersive, lore-rich adventures themed around specific bands for music fans.

${SCHEMA_REFERENCE}

${SECURITY_GUIDELINES}

## Output Rules
- Generate valid JSON that exactly matches the schema above.
- All slugs must be globally unique — always use the provided band prefix.
- Every level must have exactly one spawn entity in its mapData.entities.
- The final level must have a completion exit (targetLevelSlug: "__adventure_complete__").
- Maps must be valid: tiles array dimensions must match width/height, tile values must be 0-3.
- Keep entity IDs short and descriptive, not CUIDs.
- NPC positions must be on walkable tiles (tile value 1, 2, or 3).
- Door and switch tile positions must be on otherwise-walkable tiles.
- REACHABILITY (CRITICAL — a BFS validator runs on every map):
  * Every NPC, item, door, switch, and exit MUST be reachable from spawn via a continuous chain
    of walkable tiles (value 1, 2, or 3). No exceptions.
  * FORBIDDEN: placing any entity inside a room that has all-wall (0) borders with no corridor out.
  * QUEST GATE ORDER (CRITICAL — a progression validator enforces this):
    Quest giver NPCs MUST be accessible from spawn BEFORE the quest door that requires their quest.
    REQUIRED: Spawn → quest giver NPC → objective → quest complete → quest_door → exit
    FORBIDDEN: Spawn → quest_door → quest giver NPC (player can never start the quest — immediate softlock)
    If a quest_door uses lockCondition type "quest_complete", the quest giver NPC for that quest
    must NOT be placed in an area only reachable by passing through that quest_door.
  * GOOD MAP PATTERN — open floor plan with walls only on outer border:
      0 0 0 0 0 0 0
      0 1 1 1 1 1 0
      0 1 1 1 1 1 0
      0 1 1 1 1 1 0
      0 0 0 0 0 0 0
  * ACCEPTABLE — inner room WITH a corridor (at least one tile-wide opening):
      0 0 0 0 0 0 0
      0 1 1 0 1 1 0
      0 1 0 0 0 1 0   ← inner chamber, but row 4 has opening at col 3
      0 1 1 1 1 1 0
      0 0 0 0 0 0 0
  * FORBIDDEN — inner room with no opening (any NPC/item inside is unreachable):
      0 0 0 0 0 0 0
      0 1 1 0 1 1 0
      0 1 0 0 0 1 0   ← fully sealed inner room — NEVER DO THIS
      0 1 1 0 1 1 0
      0 0 0 0 0 0 0
  * If you want a "secret chamber", use a door entity (type:"free") on a wall tile between
    the chamber and the main floor, NOT a solid wall with no opening.
- Every non-final level must have at least one exit entity in mapData.entities placed on a border tile.
- adventure.estimatedPlaytime MUST be a bare integer (minutes). E.g. 45. NEVER a string like "2-3 hours".
`;
}

// ── GET /ping — connection test (no GPT call) ─────────────────────────────────

campaignGeneratorRouter.get('/ping', (req, res): void => {
  const hasKey = !!process.env['OPENAI_API_KEY'];
  res.json({
    authenticated: true,
    userId: req.user!.userId,
    email: req.user!.email,
    isAdmin: true,
    openAiKeyConfigured: hasKey,
    model: MODEL,
    status: hasKey ? 'ready' : 'missing_openai_key',
    message: hasKey
      ? 'AI Campaign Generator is ready'
      : 'OPENAI_API_KEY is not set in the Railway environment',
  });
});

// ── POST /blueprint ───────────────────────────────────────────────────────────

campaignGeneratorRouter.post('/blueprint', async (req, res, next): Promise<void> => {
  try {
    const {
      bandName, adventureTitle, slug, theme, difficulty, estimatedPlaytime,
      numLevels, numQuests, tone, includeCompletionScreen, includePuzzles,
      includeDoorsKeys, songRecovery, extraInstructions,
    } = req.body as {
      bandName: string;
      adventureTitle: string;
      slug?: string;
      theme?: string;
      difficulty?: string;
      estimatedPlaytime?: number;
      numLevels?: number;
      numQuests?: number;
      tone?: string;
      includeCompletionScreen?: boolean;
      includePuzzles?: boolean;
      includeDoorsKeys?: boolean;
      songRecovery?: boolean;
      extraInstructions?: string;
    };

    if (!bandName || !adventureTitle) {
      res.status(400).json({ error: 'bandName and adventureTitle are required' }); return;
    }

    const client = getClient();

    const userPrompt = `Generate a Band RPG adventure blueprint for the following:

Band: ${bandName}
Adventure Title: ${adventureTitle}
${slug ? `Preferred slug prefix: ${slug}` : ''}
Theme: ${theme ?? 'not specified'}
Tone: ${tone ?? 'mysterious, atmospheric'}
Difficulty: ${difficulty ?? 'normal'}
Estimated Playtime: ${estimatedPlaytime ? `${estimatedPlaytime} minutes` : 'not specified'}
Number of Levels: ${numLevels ?? 3}
Number of Quests: ${numQuests ?? 2}
Include completion screen: ${includeCompletionScreen !== false ? 'YES (REQUIRED — final level must have __adventure_complete__ exit)' : 'no'}
Include puzzles/switches: ${includePuzzles !== false ? 'yes' : 'no'}
Include doors/key items: ${includeDoorsKeys !== false ? 'yes' : 'no'}
Song recovery mechanic: ${songRecovery ? 'yes — the adventure theme involves collecting/recovering songs or album artifacts' : 'no'}
${extraInstructions ? `Extra instructions: ${extraInstructions}` : ''}

Generate a readable adventure blueprint (NOT JSON yet) with:
1. **Story Premise** — 2-3 sentence narrative hook
2. **Level List** — each level with: name, slug, brief description, atmosphere
3. **Quest List** — each quest with: name, giver NPC, objective, reward
4. **NPC List** — all NPCs with: name, role, which level they appear in, personality
5. **Item List** — all items with: name, slug, type, purpose in story
6. **Puzzle/Door Gating** — how doors/switches/keys connect levels
7. **Story Arc** — narrative thread connecting all levels
8. **Ending** — how the adventure concludes (completion screen text)

Format as clean readable text with bold headers. Be creative and music-themed.
Remember: NPCs must be fictional characters, NOT real band members.
Do NOT include lyrics or quotes from songs.`;

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.8,
    });

    const blueprint = response.choices[0]?.message?.content?.trim() ?? '';
    if (!blueprint) {
      res.status(502).json({ error: 'GPT returned empty response' }); return;
    }

    res.json({ blueprint, model: MODEL }); return;
  } catch (err) { next(err); return; }
});

// ── POST /generate ────────────────────────────────────────────────────────────

campaignGeneratorRouter.post('/generate', async (req, res, next): Promise<void> => {
  try {
    const {
      blueprint, bandName, adventureTitle, slug, numLevels, numQuests,
      includeCompletionScreen, includePuzzles, includeDoorsKeys,
    } = req.body as {
      blueprint: string;
      bandName: string;
      adventureTitle: string;
      slug?: string;
      numLevels?: number;
      numQuests?: number;
      includeCompletionScreen?: boolean;
      includePuzzles?: boolean;
      includeDoorsKeys?: boolean;
    };

    if (!blueprint || !bandName || !adventureTitle) {
      res.status(400).json({ error: 'blueprint, bandName, and adventureTitle are required' }); return;
    }

    const client = getClient();

    // Pick one template per level, cycling through the template bank.
    // Apply a random transform to add visual variety while preserving BFS validity.
    const TRANSFORMS: Transform[] = ['rot0', 'rot90', 'rot180', 'rot270', 'flipH', 'flipV'];
    const levelCount = numLevels ?? 3;
    const templates  = pickTemplates(levelCount);
    const templateBlock = templates.map((rawTemplate, idx) => {
      const t = TRANSFORMS[idx % TRANSFORMS.length] ?? 'rot0';
      const template = applyTransform(rawTemplate, t);
      return formatTemplateForPrompt(template, idx + 1);
    }).join('\n\n');

    const userPrompt = `Convert the following adventure blueprint into a complete, valid Band RPG adventure JSON.

Band: ${bandName}
Adventure Title: ${adventureTitle}
${slug ? `Adventure slug: ${slug}` : ''}
Levels: ${levelCount}
Quests: ${numQuests ?? 2}
Include completion screen: ${includeCompletionScreen !== false ? 'YES — final level MUST have an exit entity with targetLevelSlug: "__adventure_complete__"' : 'no'}
Include puzzles/switches: ${includePuzzles !== false ? 'yes' : 'no'}
Include doors/key items: ${includeDoorsKeys !== false ? 'yes' : 'no'}

## PRE-VALIDATED MAP TEMPLATES — MANDATORY

These tile arrays have been mathematically verified for BFS connectivity.
You MUST use them exactly as provided. DO NOT invent your own tile arrays.

${templateBlock}

CRITICAL MAP RULES:
- Copy each tile array VERBATIM into mapData.tiles. Do not modify any tile values.
- Set mapData.width and mapData.height to the values shown.
- Place the spawn entity at the spawn slot position shown above.
- Place the exit entity at the exitMain slot position (this is a border tile — already verified reachable).
- Place other entities at the recommended slot positions (all verified reachable from spawn).
- spawnX/spawnY on the level object must match the spawn slot x/y.
- You may add NPCs at npcQuestGiver/npcHint slots, items at itemKey/itemOptional slots, etc.
- If a template has a doorMain slot: place a locked door entity there + define it in doors[].
- If a template has a switchA slot: place a switch entity there + define it in switches[].
- Do NOT place any entity on a wall tile (value 0) — only use the named slot positions.

## Blueprint to Convert
${blueprint}

## Requirements
- Output ONLY valid JSON — no markdown, no explanation, no code fences
- Set bandRpgAdventureVersion: 1
- Set exportedAt to today's date in ISO format
- Each level needs: slug, name, description, order, spawnX, spawnY, isPublished:true, mapData, objectives, npcs, beats, doors, switches, puzzles
- Every mapData MUST have a spawn entity (type: "spawn")
- Final level MUST have exit entity with targetLevelSlug: "__adventure_complete__"
- All tile arrays must have exactly width×height values
- NPC positionX/positionY must be on walkable tiles (not walls)
- Include a timeline array listing all levels and required quests in order
- All slugs must be globally unique — use the band's prefix consistently
- Use targetSlug (not targetId) for all WorldCondition references to items and quests
- adventure.estimatedPlaytime MUST be a bare integer (minutes). Example: 45. NEVER a string like "2-3 hours"

## MAP LAYOUT RULES — READ CAREFULLY (BFS validator will reject sealed rooms)
EVERY entity (NPC, item, switch, exit) must connect to spawn via floor tiles (1/2/3).
Maps MUST be at least 11×11. PREFERRED layout for a 13×13 map with corridors:
  0 0 0 0 0 0 0 0 0 0 0 0 0
  0 1 1 1 0 1 1 1 1 1 1 1 0
  0 1 0 1 0 1 0 0 0 0 1 0 0
  0 1 0 1 1 1 0 1 1 0 1 0 0
  0 1 0 0 0 0 0 1 0 0 1 0 0
  0 1 1 1 1 0 0 1 1 1 1 0 0
  0 0 0 0 1 0 0 0 0 0 0 0 0  ← exit on border at col 4
Place NPCs, items, switches on interior floor tiles. Place exits on border tiles.
If you want a chamber, connect it with a corridor (never a fully-walled inner room).
DO NOT put any entity inside a region of all-0 tiles with no floor path out.

## GAMEPLAY REQUIREMENTS — MANDATORY (scored 0-100; must reach 60 to import)
CRITICAL: Every non-final level MUST gate the exit. "Spawn → walk to exit" = automatic fail.

### REQUIRED LEVEL STRUCTURE (use this exact template):

LEVEL 1 — Exploration & First Puzzle:
  - 12×12+ map with interior walls creating corridors and side rooms
  - Place key item in a dead-end side room: {type:"item",refId:"<item-slug>"}
  - Gate exit with key_door: {name:"Chamber Gate",type:"key_door",openedByDefault:false,
      lockCondition:{type:"item_owned",targetSlug:"<item-slug>"}}
  - NPC who gives a quest to find the item (giverNpcLevelSlug = this level's slug)
  - Spawn-to-exit path MUST be ≥10 tiles

LEVEL 2 — Puzzle Escalation:
  - 13×13+ map, more complex corridors than Level 1
  - Switch-door combo OR second key hunt with a different item
  - Quest requiring find_item or activate_switch (NOT just talk_to_npc)
  - Locked exit requires item from this level OR quest completion

LEVEL 3+ — Story Climax:
  - Final confrontation or discovery scene with NPCs
  - Optional: one more puzzle or switch before the final door
  - MUST end with exit entity: {targetLevelSlug:"__adventure_complete__"}

### FORBIDDEN (gameplay validator WILL reject these):
  ✗ Level where player can walk from spawn to exit without any action
  ✗ Level with only NPCs and no locked door/switch/puzzle
  ✗ Empty room with an exit (open floor plan, no gating mechanism)
  ✗ Objective type values outside the exact list below — any other value causes import failure:
    find_item, talk_to_npc, reach_location, collect_objects, inspect_object,
    trigger_music_node, complete_sequence, survive_timer, solve_clue, play_minigame,
    score_threshold, activate_switch, open_door, complete_quest
  ✗ Beat type "npc_dialogue" — use "dialogue" instead. Only valid: dialogue, narration, cutscene, choice, unlock, trigger
  ✗ Door type values outside: free, key_door, quest_door, story_door, switch_door
  ✗ Switch type values outside: switch, lever, button, pressure_plate

### ITEMS — place 3+ items across the adventure:
  - Add items to top-level items[]: {slug:"<prefix>-key-name",name:"...",type:"key_item",rarity:"rare"}
  - Place each in level mapData.entities: {id:"item-e1",type:"item",x:4,y:8,refId:"<item-slug>"}
  - refId MUST equal the item slug exactly

### ENTITY REFS — must match name/slug exactly:
  - Door entity refId = door's "name" field (e.g. refId:"Chamber Gate")
  - Switch entity refId = switch's "name" field (e.g. refId:"Power Lever")
  - NPC entity refId = NPC's "name" field (e.g. refId:"Archivist Mira")
  - Item entity refId = item slug (e.g. refId:"apc-crystal-key")`;

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8000,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    if (!raw) {
      res.status(502).json({ error: 'GPT returned empty response' }); return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: 'GPT returned invalid JSON', raw }); return;
    }

    res.json({ json: parsed, raw, model: MODEL }); return;
  } catch (err) { next(err); return; }
});

// ── POST /repair ──────────────────────────────────────────────────────────────

campaignGeneratorRouter.post('/repair', async (req, res, next): Promise<void> => {
  try {
    const { json, errors, attempt = 1 } = req.body as {
      json: unknown;
      errors: Array<{ path?: string; message: string }>;
      attempt?: number;
    };

    if (!json || !errors || errors.length === 0) {
      res.status(400).json({ error: 'json and errors are required' }); return;
    }

    if (attempt > MAX_REPAIR_ATTEMPTS) {
      res.status(400).json({ error: `Maximum repair attempts (${MAX_REPAIR_ATTEMPTS}) reached` }); return;
    }

    const client = getClient();

    const errorList = errors.map(e => `- ${e.path ? `[${e.path}] ` : ''}${e.message}`).join('\n');

    const userPrompt = `The following Band RPG adventure JSON has validation errors. Fix ALL the errors listed.
Do not change any other content. Output only the corrected complete JSON — no markdown, no explanation.

## Critical type rules (always enforce, even if not in error list)
- adventure.estimatedPlaytime MUST be a bare integer (minutes). E.g. 45. NEVER "2-3 hours" or "45 minutes".

## Reachability rules (for any "unreachable" or "sealed room" or "no exit" errors)
The game uses a BFS flood-fill from the spawn tile. An entity is unreachable if no walkable path
(floor tiles 1/2/3 + exit tiles + door tiles) connects it to spawn.

To fix reachability errors:
- Move the unreachable entity to a tile within the walkable area (tile value 1, 2, or 3).
- OR carve a floor corridor: change wall tiles (0) between spawn and the entity to floor tiles (1).
- OR if an entity is in a separate room with no door, add a door entity to a shared wall tile AND add
  that wall tile as a "free" type door (openedByDefault: true) in the level's doors array.
- For "no exit entity" errors: add an exit entity on a border tile (row 0, last row, col 0, last col)
  AND include it in mapData.entities. The final level's exit must use targetLevelSlug: "__adventure_complete__".
- NEVER delete required entities (NPCs, items) to fix reachability — always move or add paths.
- After fixing, verify the fixed entity's position is on a tile with value 1, 2, or 3, OR adjacent to one.

## Campaign connectivity rules (for "not reachable from the starting level" errors)
- Every level must have at least one exit entity whose targetLevelSlug points to the next level's slug.
- Check each level's mapData.entities for type="exit" and ensure targetLevelSlug is set correctly.

## Quest gate softlock rules (for "SOFTLOCK: Door ... requires quest ... but the quest giver ... is behind that door" errors)
- The quest giver NPC must be placed BEFORE the quest_door that requires that quest.
- Required order: Spawn → quest giver NPC (accessible) → objective target → quest complete → quest_door → exit
- FIX: Move the quest giver NPC to a tile that is reachable from spawn WITHOUT passing through the quest_door.
  1. Find the NPC's positionX/positionY in level.npcs[] and the entity x/y in mapData.entities[]
  2. Move both to a floor tile (value 1/2/3) on the SPAWN SIDE of the quest_door
  3. Do NOT move the quest_door — keep it where it blocks the exit
- If the NPC is in a sealed room behind the door, also update positionX/positionY in npcs[] and x/y in entities[].

## Gameplay quality rules (for gameplay.* errors — scored 0-100, need 60 to import)

gameplay.gating (CRITICAL — fix first): Levels have ungated exits. Player walks through without doing anything.
  FIX: For EACH non-final level, add a locked door that blocks the path to the exit:
    Step 1 — Add item to items[]: {slug:"<prefix>-key",name:"...",type:"key_item",rarity:"rare"}
    Step 2 — Place item entity in level: {id:"item-e1",type:"item",x:4,y:4,refId:"<item-slug>"}
    Step 3 — Add key_door to level.doors[]: {name:"Gate",tileX:8,tileY:1,type:"key_door",openedByDefault:false,lockCondition:{type:"item_owned",targetSlug:"<item-slug>"}}
    Step 4 — Add door entity: {id:"door-e1",type:"door",x:8,y:1,refId:"Gate"}
    Step 5 — Place item in a side room so the player must explore to find it.
  OR use switch-door: add switch to switches[] + switch_door to doors[] + switch entity in map.

gameplay.variety: All levels are boring "NPC → exit". Same fix as gameplay.gating.
gameplay.puzzles: Add items[] and locked doors. Min: 1 key_door (openedByDefault:false) + 1 item entity.
gameplay.items: Add 3+ items to items[] array and place {type:"item",x,y,refId:"<slug>"} entities.
gameplay.exploration: Expand maps to 12×12+. Add interior walls for corridors. Spawn-to-exit ≥10 tiles.
  Example 12×12 map with corridor and dead-end side rooms:
    [0,0,0,0,0,0,0,0,0,0,0,0]
    [0,1,1,1,1,1,0,1,1,1,1,0]
    [0,1,0,0,0,1,0,1,0,0,1,0]
    [0,1,0,1,1,1,1,1,0,1,1,0]
    [0,1,0,1,0,0,0,0,0,1,0,0]
    [0,1,1,1,0,1,1,1,1,1,0,0]
    [0,0,0,0,0,1,0,0,0,0,0,0]  ← exit at (5,6) border

## CRITICAL: entity refId rules (for refId mismatch errors)
  - door entity refId MUST equal the door's "name" field exactly (NOT an "id" you invented)
  - switch entity refId MUST equal the switch's "name" field exactly
  - NPC entity refId MUST equal the NPC's "name" field exactly
  - item entity refId MUST equal the item slug from items[]

## Enum values — ONLY use these exactly (any other value causes a 500 on import):
  objective.type: find_item, talk_to_npc, reach_location, collect_objects, inspect_object,
    trigger_music_node, complete_sequence, survive_timer, solve_clue, play_minigame,
    score_threshold, activate_switch, open_door, complete_quest
  beat.type: dialogue, narration, cutscene, choice, unlock, trigger
    ← "npc_dialogue" is INVALID — use "dialogue" for any NPC speech beat
  door.type: free, key_door, quest_door, story_door, switch_door
  switch.type: switch, lever, button, pressure_plate

## Validation Errors (fix these)
${errorList}

## JSON to Repair
${JSON.stringify(json, null, 2)}`;

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    if (!raw) {
      res.status(502).json({ error: 'GPT returned empty response' }); return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: 'GPT returned invalid JSON after repair', raw }); return;
    }

    res.json({ json: parsed, raw, model: MODEL, attempt }); return;
  } catch (err) { next(err); return; }
});

// ── POST /repair-reachability — focused map-surgery repair ────────────────────
// Only fixes map tiles and entity positions. Never touches slugs, dialogue,
// quests, items, arcs, or any non-map field.

campaignGeneratorRouter.post('/repair-reachability', async (req, res, next): Promise<void> => {
  try {
    const { json, errors, attempt = 1 } = req.body as {
      json: unknown;
      errors: Array<{ path?: string; message: string }>;
      attempt?: number;
    };

    if (!json || !errors || errors.length === 0) {
      res.status(400).json({ error: 'json and errors are required' }); return;
    }

    const client = getClient();

    const errorList = errors.map(e => `- ${e.path ? `[${e.path}] ` : ''}${e.message}`).join('\n');

    const userPrompt = `A Band RPG adventure JSON has MAP REACHABILITY errors. Your ONLY task is to fix the map layouts so all entities are reachable from spawn.

## STRICT CONSTRAINTS — read before touching anything
- DO NOT change: slugs, names, descriptions, dialogue, quests, items, arcs, beats, timeline, tags, or any non-map field.
- DO NOT rename or delete any NPC, item, switch, or exit.
- DO NOT rewrite story content.
- ONLY modify: mapData.tiles arrays and entity x/y coordinates within mapData.entities, and NPC positionX/positionY.

## HOW TO FIX REACHABILITY
The validator runs BFS flood-fill from the spawn tile. Any entity not connected to spawn via floor tiles (1/2/3) fails.

Fix strategies (use whichever is simplest):
1. MOVE THE ENTITY: Change the entity's x/y (or positionX/Y for NPCs) to a floor tile that IS reachable from spawn.
2. CARVE A CORRIDOR: Change wall tiles (0) between spawn and the entity to floor tiles (1) to create a walkable path.
3. ADD A DOOR OPENING: Change a shared wall tile between two rooms to value 1 (or add a free door there).

Rules:
- Exit entities sit on border tiles (row 0, last row, col 0, last col) — those are always crossable. Make sure the interior tile adjacent to the exit is a floor tile (1) so the player can approach it.
- After moving an entity, verify its new position has tile value 1, 2, or 3 in the tiles array.
- NPCs: update both positionX/positionY (level.npcs array) AND the npc entity x/y in mapData.entities.
- The spawn entity itself must be on a floor tile.

## Reachability Errors to Fix
${errorList}

## Adventure JSON (only change maps and coordinates)
${JSON.stringify(json, null, 2)}

Output ONLY the complete corrected JSON — no markdown, no explanation, no code fences.`;

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8000,
      temperature: 0.05, // very low — we want precise surgical edits
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    if (!raw) {
      res.status(502).json({ error: 'GPT returned empty response' }); return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: 'GPT returned invalid JSON after reachability repair', raw }); return;
    }

    res.json({ json: parsed, raw, model: MODEL, attempt }); return;
  } catch (err) { next(err); return; }
});

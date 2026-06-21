# Band RPG Adventure Format — v1

This document describes the JSON format for Band RPG adventure packages. Adventures can be:

- **Exported** from the admin panel → Adventures tab → Export JSON
- **Authored by AI** and imported via the admin panel → Import tab
- **Hand-authored** by a creator familiar with this format

See `docs/sample-adventure.json` for a complete working example.

---

## Top-level structure

```json
{
  "bandRpgAdventureVersion": 1,
  "exportedAt": "2026-06-21T00:00:00.000Z",
  "adventure": { ... },
  "items": [ ... ],
  "arcs": [ ... ],
  "quests": [ ... ],
  "levels": [ ... ],
  "timeline": [ ... ]
}
```

| Field | Required | Description |
|---|---|---|
| `bandRpgAdventureVersion` | Yes | Always `1`. Used for format migrations. |
| `exportedAt` | No | ISO date string. Informational only. |
| `adventure` | Yes | Adventure metadata. |
| `items` | No | Global items used in this adventure. |
| `arcs` | No | Story arcs (groups of story beats). |
| `quests` | No | Quests given by NPCs. |
| `levels` | No | Levels with all nested content. |
| `timeline` | No | Ordered list of adventure milestones. |

---

## `adventure`

```json
{
  "slug": "my-adventure",
  "name": "My Adventure",
  "description": "Optional description"
}
```

| Field | Required | Notes |
|---|---|---|
| `slug` | Yes | Unique identifier. Lowercase letters, numbers, hyphens only. `[a-z0-9-]+` |
| `name` | Yes | Display name shown in the admin panel. |
| `description` | No | Short description. |

---

## `items`

Items are globally scoped objects that can be placed on level maps and referenced by quests and conditions.

```json
{
  "slug": "old-key",
  "name": "Old Key",
  "description": "A rusted key.",
  "type": "key_item",
  "rarity": "common",
  "scoreValue": 10,
  "isVisible": true
}
```

| Field | Required | Values |
|---|---|---|
| `slug` | Yes | Unique across the entire database. |
| `name` | Yes | Display name. |
| `type` | No | `collectible`, `key_item`, `quest_item`, `power_up`, `lore_item`, `album_artifact`, `song_artifact`, `cosmetic` |
| `rarity` | No | `common`, `uncommon`, `rare`, `epic`, `legendary` |
| `scoreValue` | No | Points awarded when collected. Default `0`. |
| `isVisible` | No | Whether the item appears in inventories. Default `true`. |

---

## `arcs`

Story arcs group story beats together.

```json
{
  "slug": "archive-intro",
  "title": "The Archive Opens",
  "description": "Optional description",
  "order": 1
}
```

---

## `quests`

Quests are given by NPCs and tracked in the player HUD.

```json
{
  "slug": "find-the-key",
  "name": "Find the Key",
  "description": "Find the old key near the north wall.",
  "giverNpcName": "Archive Keeper",
  "giverNpcLevelSlug": "archive-entrance",
  "reward": {
    "xp": 50,
    "message": "Key found!"
  },
  "isOptional": false,
  "order": 1
}
```

| Field | Required | Notes |
|---|---|---|
| `slug` | Yes | Unique. |
| `name` | Yes | Display name. |
| `giverNpcName` | No | Exact name of the NPC who gives this quest. |
| `giverNpcLevelSlug` | No | Slug of the level that NPC lives in. Required if `giverNpcName` is set. |
| `reward.xp` | No | XP awarded on completion. |
| `reward.message` | No | Notification shown on completion. |
| `reward.unlockLevelSlug` | No | Level to unlock on completion. |
| `reward.unlockBeatId` | No | Beat ID to trigger on completion (advanced). |
| `isOptional` | No | Default `false`. |
| `order` | No | Display order in HUD. |

---

## `levels`

Levels contain all the map data and nested entities (NPCs, objectives, beats, doors, switches, puzzles).

```json
{
  "slug": "archive-entrance",
  "name": "Archive Entrance",
  "description": "Optional",
  "order": 1,
  "spawnX": 1,
  "spawnY": 7,
  "isPublished": true,
  "background": null,
  "mapData": { ... },
  "objectives": [ ... ],
  "npcs": [ ... ],
  "beats": [ ... ],
  "doors": [ ... ],
  "switches": [ ... ],
  "puzzles": [ ... ]
}
```

### `mapData`

```json
{
  "width": 12,
  "height": 10,
  "tiles": [[0,1,1,...], ...],
  "entities": [
    { "id": "spawn-1", "type": "spawn", "x": 1, "y": 7 },
    { "id": "item-key", "type": "item", "x": 9, "y": 3, "refId": "old-key" },
    { "id": "exit-1", "type": "exit", "x": 5, "y": 4, "targetLevelSlug": "archive-inner", "label": "Inner Archive" }
  ]
}
```

**Tile values:**
- `0` = wall / void (impassable)
- `1` = floor (walkable)
- `2` = bookshelf/wall prop
- `3` = highlighted floor

**Entity types:**
- `spawn` — Player start position. `x`, `y` required.
- `exit` — Level exit tile. `targetLevelSlug` required.
- `item` — Item spawn. `refId` = item slug (resolved to DB id on import).
- `npc` — NPC placement. `refId` = NPC name in this level (resolved after NPC creation).

### `objectives`

Objectives belong to a level. Referenced by quests via `objectiveIds`.

```json
{
  "name": "Collect the Old Key",
  "description": "Optional",
  "type": "find_item",
  "target": "old-key",
  "condition": {},
  "reward": {},
  "dialogueText": "Got it!",
  "isOptional": false,
  "order": 1,
  "prerequisiteName": "Name of prerequisite objective"
}
```

**Objective types:** `find_item`, `talk_to_npc`, `reach_location`, `collect_objects`, `inspect_object`, `trigger_music_node`, `complete_sequence`, `survive_timer`, `solve_clue`, `play_minigame`, `score_threshold`

**`target` field meaning by type:**
- `find_item` → item slug
- `talk_to_npc` → NPC name in this level
- `reach_location` → `"x,y"` tile coordinate

### `npcs`

```json
{
  "name": "Archive Keeper",
  "role": "quest_giver",
  "faction": "Archivists",
  "portraitUrl": null,
  "positionX": 3,
  "positionY": 5,
  "defaultDialogue": [
    { "text": "Hello traveller.", "speakerName": "Archive Keeper" }
  ],
  "visibilityCondition": {
    "type": "quest_active",
    "targetSlug": "find-the-key"
  }
}
```

**Roles:** `quest_giver`, `merchant`, `band_member`, `ambient`

### `beats`

Story beats play as dialogue cutscenes.

```json
{
  "arcSlug": "archive-intro",
  "type": "narration",
  "content": {
    "lines": [
      { "text": "You step into the archive.", "speakerName": null }
    ]
  },
  "unlockCondition": { "type": "always" },
  "order": 1
}
```

**Beat types:** `dialogue`, `narration`, `cutscene`, `choice`, `unlock`, `trigger`

### `doors`

```json
{
  "name": "Inner Archive Door",
  "tileX": 5,
  "tileY": 4,
  "type": "key_door",
  "lockCondition": {
    "type": "item_owned",
    "targetSlug": "old-key"
  },
  "openedByDefault": false,
  "label": "Inner Archive"
}
```

**Door types:** `key_door`, `quest_door`, `story_door`, `switch_door`, `free`

### `switches`

```json
{
  "name": "Stone Lever",
  "tileX": 9,
  "tileY": 7,
  "type": "lever",
  "effect": {
    "type": "open_door",
    "targetName": "Inner Archive Door"
  },
  "label": "Lever"
}
```

**Switch types:** `switch`, `lever`, `button`, `pressure_plate`

### `puzzles`

Puzzles are Trigger → Condition → Action chains that fire automatically.

```json
{
  "name": "Lever pulled → open door",
  "trigger": {
    "on": "switch_activated",
    "targetName": "Stone Lever"
  },
  "condition": { "type": "always" },
  "action": {
    "type": "open_door",
    "targetName": "Inner Archive Door"
  },
  "order": 1
}
```

---

## `timeline`

```json
{
  "title": "Archive Entrance",
  "type": "level",
  "refSlug": "archive-entrance",
  "isRequired": true,
  "order": 1
}
```

**Types:** `level`, `quest`, `story`, `boss`, `unlock`

---

## Conditions (`WorldCondition`)

Used in door `lockCondition`, NPC `visibilityCondition`, puzzle `condition`, beat `unlockCondition`.

| type | Fields | Description |
|---|---|---|
| `always` | — | Always true. |
| `never` | — | Always false. Never shown/passable. |
| `item_owned` | `targetSlug` | Player has the item in inventory. |
| `quest_active` | `targetSlug` | Quest is currently in progress. |
| `quest_complete` | `targetSlug` | Quest has been completed. |
| `story_beat_seen` | — | Beat has been shown (use `targetId` = DB id, advanced). |
| `switch_activated` | `targetName` | Switch of this name (in same level) has been activated. |
| `door_open` | `targetName` | Door of this name (in same level) is open. |
| `world_state` | `key`, `value` | `worldState[key] === value`. |

**Note:** For `switch_activated` and `door_open`, use `targetName` (the entity name within the level). The import engine resolves names to database IDs. For `item_owned` and `quest_active`/`quest_complete`, use `targetSlug`.

---

## Actions (`PuzzleAction`)

Used in switch `effect` and puzzle `action`.

| type | Fields | Description |
|---|---|---|
| `open_door` | `targetName` | Opens a door in the same level. |
| `close_door` | `targetName` | Closes a door in the same level. |
| `trigger_beat` | `targetId` | Triggers a story beat (advanced — requires DB beat ID). |
| `reveal_exit` | `targetSlug` | Unlocks a level exit (adds to `unlockedLevelSlugs`). |
| `grant_item` | `targetSlug` | Adds an item to the player's inventory. |
| `set_world_state` | `key`, `value` | Sets `worldState[key] = value`. |

---

## Cross-reference cheat sheet

When authoring adventure JSON, use these human-readable references:

| Entity | Reference field | Example |
|---|---|---|
| Item | `targetSlug` | `"targetSlug": "old-key"` |
| Quest | `targetSlug` | `"targetSlug": "find-the-key"` |
| Level | `targetSlug` | `"targetSlug": "archive-inner"` |
| Story Arc | `arcSlug` | `"arcSlug": "archive-intro"` |
| NPC (within level) | `giverNpcName` | `"giverNpcName": "Archive Keeper"` |
| Door (within level) | `targetName` | `"targetName": "Inner Archive Door"` |
| Switch (within level) | `targetName` | `"targetName": "Stone Lever"` |

---

## Import modes

| Mode | Behaviour |
|---|---|
| `create` | Strict — fails if any slug already exists. Use for fresh imports. |
| `update` | Upserts by slug. Existing entities are updated; new ones are created. Level-scoped content (NPCs, objectives, etc.) is always created fresh. |
| `replace` | Deletes all existing adventure-scoped content, then creates everything new. Player progress is never deleted. |

---

## AI authoring tips

When generating an adventure with an AI:

1. Always include `"bandRpgAdventureVersion": 1`
2. Use lowercase, hyphenated slugs (`my-adventure`, `find-the-key`)
3. Keep slugs globally unique — prefix with adventure slug if unsure (`the-first-archive-old-key`)
4. Use `targetSlug` (not `targetId`) for items and quests in conditions/actions
5. Use `targetName` for doors and switches in conditions/actions
6. Reference door names exactly as they appear in the `doors` array
7. Reference NPC names exactly as they appear in the `npcs` array
8. Validate JSON before importing using the Validate button in the admin panel
9. Start with Create mode for first imports; use Update/Replace for revisions
10. The `mapData.tiles` grid: row 0 is the top. `0` = wall, `1` = floor.

---

## Validation errors

The import validator checks:

- `adventure.slug` is present and matches `[a-z0-9-]+`
- No duplicate slugs within the package (levels, quests, items, arcs)
- Beat `arcSlug` references exist in the `arcs` section
- Quest `giverNpcLevelSlug` references a level slug in the package
- All required fields (`name`, `slug`, `type`) are present
- No existing slugs conflict in the database (create mode only)

---

## Limitations

- `trigger_beat` actions require a database beat ID (`targetId`). This is an advanced feature not yet resolved by name on import. Use `set_world_state` + `story_beat_seen` conditions as an alternative.
- Items placed on maps via `mapData.entities` use `refId = item slug` — the import engine resolves this after item creation.
- NPC `mapData.entities` placements use `refId = NPC name` — resolved after NPC creation.
- Timeline events are created fresh on every import (no slug deduplication).

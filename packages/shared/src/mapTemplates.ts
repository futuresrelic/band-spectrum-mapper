// Map template bank for Band RPG campaign generator.
// Each template is BFS-verified: every slot is reachable from spawn.
// tiles[y][x] — 0=wall, 1=floor, 2=elevated, 3=special.
// Border tiles are walls except for the exitMain slot (placed on a border wall).

export type Transform = 'rot0' | 'rot90' | 'rot180' | 'rot270' | 'flipH' | 'flipV';

export interface SlotPosition {
  x: number;
  y: number;
  /** Accessibility depth: 0=spawn, 1-2=pre-door, 3=door boundary, 4-5=post-door. */
  depth?: number;
}

export interface MapSlots {
  spawn:          SlotPosition;
  exitMain:       SlotPosition;
  doorMain?:      SlotPosition;
  switchA?:       SlotPosition;
  npcQuestGiver?: SlotPosition;
  npcHint?:       SlotPosition;
  itemKey?:       SlotPosition;
  itemOptional?:  SlotPosition;
}

export interface MapTemplate {
  templateId:  string;
  name:        string;
  width:       number;
  height:      number;
  tiles:       number[][];
  slots:       MapSlots;
}

// ── 10 pre-validated templates ─────────────────────────────────────────────

const TEMPLATES: MapTemplate[] = [
  {
    // Spawn in RIGHT room; exitMain on LEFT border (behind doorMain).
    // itemKey is in the RIGHT room (pre-door depth:1) — safe to use as the door key.
    templateId: 'two_room',
    name: 'Two Room',
    width: 11, height: 9,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,1,0,1,1,1,1,1,0],
      [0,1,1,1,0,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,0,1,1,1,1,1,0],
      [0,1,1,1,0,1,1,1,1,1,0],
      [0,1,1,1,0,1,1,1,1,1,0],
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:         { x: 8, y: 3, depth: 0 },
      exitMain:      { x: 0, y: 3, depth: 4 },
      doorMain:      { x: 4, y: 3, depth: 3 },
      npcQuestGiver: { x: 8, y: 2, depth: 1 },
      itemKey:       { x: 8, y: 5, depth: 1 },
    },
  },

  {
    templateId: 'l_corridor',
    name: 'L Corridor',
    width: 11, height: 9,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,1,1,1,1,1,1,1,0],
      [0,1,0,0,0,0,0,0,0,1,0],
      [0,1,0,0,0,0,0,0,0,1,0],
      [0,1,1,1,1,1,0,0,0,1,0],
      [0,0,0,0,1,0,0,0,0,1,0],
      [0,0,0,0,1,0,0,0,0,1,0],
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:         { x: 4, y: 6, depth: 0 },
      exitMain:      { x: 9, y: 0, depth: 4 },
      doorMain:      { x: 1, y: 3, depth: 3 },
      itemKey:       { x: 9, y: 2, depth: 1 },
      npcQuestGiver: { x: 1, y: 2, depth: 2 },
    },
  },

  {
    templateId: 'three_room_spine',
    name: 'Three Room Spine',
    width: 13, height: 9,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,1,0,1,1,1,0,1,1,1,0],
      [0,1,1,1,0,1,1,1,0,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,0,1,1,1,0,1,1,1,0],
      [0,1,1,1,0,1,1,1,0,1,1,1,0],
      [0,1,1,1,0,1,1,1,0,1,1,1,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:         { x: 2,  y: 3, depth: 0 },
      exitMain:      { x: 12, y: 3, depth: 5 },
      doorMain:      { x: 4,  y: 3, depth: 3 },
      switchA:       { x: 8,  y: 3, depth: 4 },
      npcQuestGiver: { x: 6,  y: 2, depth: 4 },
      npcHint:       { x: 10, y: 2, depth: 5 },
      itemKey:       { x: 10, y: 5, depth: 5 },
      itemOptional:  { x: 6,  y: 5, depth: 4 },
    },
  },

  {
    // Hub center + 4 corner rooms via a wide row 5 connector.
    // Left/right rooms connect to hub through the x=2-10 floor in row 5.
    // North/south arms at column 6 connect top/bottom rooms to hub.
    templateId: 'hub_spokes',
    name: 'Hub and Spokes',
    width: 13, height: 11,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,1,0,0,1,0,0,1,1,1,0],
      [0,1,1,1,0,0,1,0,0,1,1,1,0],
      [0,0,1,0,0,0,1,0,0,0,1,0,0],
      [0,0,1,0,1,1,1,1,1,0,1,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,0,0],
      [0,0,1,0,1,1,1,1,1,0,1,0,0],
      [0,0,1,0,0,0,1,0,0,0,1,0,0],
      [0,1,1,1,0,0,1,0,0,1,1,1,0],
      [0,1,1,1,0,0,1,0,0,1,1,1,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:         { x: 6,  y: 5, depth: 0 },
      exitMain:      { x: 6,  y: 0, depth: 4 },
      doorMain:      { x: 6,  y: 3, depth: 3 },
      switchA:       { x: 6,  y: 7, depth: 1 },
      npcQuestGiver: { x: 2,  y: 2, depth: 1 },
      npcHint:       { x: 10, y: 2, depth: 1 },
      itemKey:       { x: 2,  y: 8, depth: 1 },
      itemOptional:  { x: 10, y: 8, depth: 1 },
    },
  },

  {
    // S-bend winding path — spawn bottom-left, exit top-left border.
    // switchA corrected to (4,5) which is tiles[5][4]=1.
    templateId: 'winding_path',
    name: 'Winding Path',
    width: 11, height: 11,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,1,1,1,0,0,0,0,0],
      [0,0,0,0,1,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,0,0,0],
      [0,0,0,0,0,0,0,1,0,0,0],
      [0,0,1,1,1,1,0,1,0,0,0],
      [0,0,1,0,0,0,0,1,0,0,0],
      [0,0,1,0,0,1,1,1,0,0,0],
      [0,0,1,0,0,1,0,0,0,0,0],
      [0,0,1,1,1,1,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:    { x: 2, y: 9, depth: 0 },
      exitMain: { x: 0, y: 1, depth: 4 },
      doorMain: { x: 5, y: 7, depth: 3 },
      switchA:  { x: 4, y: 5, depth: 2 },
      itemKey:  { x: 2, y: 6, depth: 1 },
    },
  },

  {
    templateId: 'cross_junction',
    name: 'Cross Junction',
    width: 11, height: 11,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,1,1,1,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:         { x: 5, y: 5, depth: 0 },
      exitMain:      { x: 5, y: 0, depth: 4 },
      doorMain:      { x: 5, y: 3, depth: 3 },
      switchA:       { x: 5, y: 7, depth: 1 },
      npcQuestGiver: { x: 2, y: 5, depth: 1 },
      npcHint:       { x: 8, y: 5, depth: 1 },
      itemKey:       { x: 5, y: 8, depth: 2 },
    },
  },

  {
    // Two chambers connected by a full-width corridor at row 4.
    // doorMain at row 4 center gates access to the right chamber.
    templateId: 'dual_chamber',
    name: 'Dual Chamber',
    width: 13, height: 9,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,1,0,0,0,0,0,1,1,1,0],
      [0,1,1,1,0,0,0,0,0,1,1,1,0],
      [0,1,1,1,0,0,0,0,0,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,0,0,0,0,0,1,1,1,0],
      [0,1,1,1,0,0,0,0,0,1,1,1,0],
      [0,1,1,1,0,0,0,0,0,1,1,1,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:         { x: 2,  y: 6, depth: 0 },
      exitMain:      { x: 0,  y: 6, depth: 1 },
      doorMain:      { x: 6,  y: 4, depth: 3 },
      npcQuestGiver: { x: 2,  y: 2, depth: 1 },
      itemKey:       { x: 10, y: 2, depth: 4 },
      itemOptional:  { x: 10, y: 6, depth: 4 },
    },
  },

  {
    // Central horizontal corridor with 4 pairs of alcoves branching off top/bottom.
    templateId: 'corridor_alcoves',
    name: 'Corridor Alcoves',
    width: 13, height: 9,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,0,1,1,0,1,1,0,1,1,0],
      [0,1,1,0,1,1,0,1,1,0,1,1,0],
      [0,0,1,0,0,1,0,0,1,0,0,1,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,0,0,1,0,0,1,0,0,1,0],
      [0,1,1,0,1,1,0,1,1,0,1,1,0],
      [0,1,1,0,1,1,0,1,1,0,1,1,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:         { x: 2,  y: 4, depth: 0 },
      exitMain:      { x: 12, y: 4, depth: 4 },
      doorMain:      { x: 9,  y: 4, depth: 3 },
      switchA:       { x: 5,  y: 4, depth: 1 },
      npcQuestGiver: { x: 1,  y: 2, depth: 1 },
      npcHint:       { x: 4,  y: 6, depth: 1 },
      itemKey:       { x: 10, y: 2, depth: 4 },
      itemOptional:  { x: 7,  y: 6, depth: 2 },
    },
  },

  {
    // Lite maze with a clear path from bottom-left to top-right.
    // Bottom-right pocket (x=9-11, y=7-9) has no entities — decorative.
    templateId: 'maze_lite',
    name: 'Maze Lite',
    width: 13, height: 11,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,1,0,1,1,1,0,1,1,1,0,1,0],
      [0,1,0,1,0,1,0,1,0,1,0,1,0],
      [0,1,1,1,0,1,1,1,0,1,1,1,0],
      [0,0,0,0,0,0,0,1,0,0,0,1,0],
      [0,1,1,1,1,1,1,1,0,1,1,1,0],
      [0,1,0,0,0,1,0,0,0,1,0,0,0],
      [0,1,0,1,0,1,0,1,1,1,0,1,0],
      [0,1,0,1,0,0,0,1,0,0,0,1,0],
      [0,1,1,1,0,1,1,1,0,1,1,1,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:    { x: 1,  y: 9, depth: 0 },
      exitMain: { x: 11, y: 0, depth: 5 },
      doorMain: { x: 7,  y: 5, depth: 3 },
      switchA:  { x: 9,  y: 5, depth: 4 },
      itemKey:  { x: 11, y: 2, depth: 5 },
    },
  },

  {
    // Ritual chamber — outer walkable ring + decorative sealed inner block.
    // All slots are on the outer ring; inner cells (rows 4-6, cols 4-8) are
    // structurally isolated (intended as visual centerpiece only).
    templateId: 'final_chamber',
    name: 'Final Ritual Chamber',
    width: 13, height: 11,
    tiles: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,0,0,0,0,0,0,0,1,1,0],
      [0,1,1,0,1,1,1,1,1,0,1,1,0],
      [0,1,1,0,1,1,1,1,1,0,1,1,0],
      [0,1,1,0,1,1,1,1,1,0,1,1,0],
      [0,1,1,0,0,0,0,0,0,0,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
    ],
    slots: {
      spawn:         { x: 6,  y: 9, depth: 0 },
      exitMain:      { x: 6,  y: 0, depth: 4 },
      doorMain:      { x: 6,  y: 2, depth: 3 },
      switchA:       { x: 6,  y: 8, depth: 1 },
      npcQuestGiver: { x: 2,  y: 2, depth: 1 },
      npcHint:       { x: 10, y: 2, depth: 1 },
      itemKey:       { x: 2,  y: 8, depth: 1 },
      itemOptional:  { x: 10, y: 8, depth: 1 },
    },
  },
];

// ── Public accessors ───────────────────────────────────────────────────────

export function allTemplates(): MapTemplate[] {
  return TEMPLATES;
}

export function getTemplate(templateId: string): MapTemplate | undefined {
  return TEMPLATES.find(t => t.templateId === templateId);
}

export function randomTemplate(): MapTemplate {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  if (!t) return TEMPLATES[0]!;
  return t;
}

export function pickTemplates(count: number): MapTemplate[] {
  const result: MapTemplate[] = [];
  for (let i = 0; i < count; i++) {
    result.push(TEMPLATES[i % TEMPLATES.length]!);
  }
  return result;
}

// ── Transform utilities ────────────────────────────────────────────────────

function transformTiles(
  tiles: number[][],
  width: number,
  height: number,
  t: Transform,
): { tiles: number[][]; width: number; height: number } {
  if (t === 'rot0') return { tiles, width, height };

  if (t === 'flipH') {
    const out = tiles.map(row => [...row].reverse());
    return { tiles: out, width, height };
  }

  if (t === 'flipV') {
    const out = [...tiles].reverse().map(row => [...row]);
    return { tiles: out, width, height };
  }

  // rot90 CW: new dimensions are height×width; newTiles[x][H-1-y] = oldTiles[y][x]
  if (t === 'rot90') {
    const newW = height;
    const newH = width;
    const out: number[][] = Array.from({ length: newH }, () => new Array<number>(newW).fill(0));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y]?.[x] ?? 0;
        const newX = height - 1 - y;
        const newY = x;
        const row = out[newY];
        if (row) row[newX] = tile;
      }
    }
    return { tiles: out, width: newW, height: newH };
  }

  if (t === 'rot180') {
    const out = tiles.map(row => [...row].reverse()).reverse();
    return { tiles: out, width, height };
  }

  // rot270 CW (= rot90 CCW): newTiles[W-1-x][y] = oldTiles[y][x]
  if (t === 'rot270') {
    const newW = height;
    const newH = width;
    const out: number[][] = Array.from({ length: newH }, () => new Array<number>(newW).fill(0));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = tiles[y]?.[x] ?? 0;
        const newX = y;
        const newY = width - 1 - x;
        const row = out[newY];
        if (row) row[newX] = tile;
      }
    }
    return { tiles: out, width: newW, height: newH };
  }

  return { tiles, width, height };
}

function transformSlot(slot: SlotPosition, origWidth: number, origHeight: number, t: Transform): SlotPosition {
  const { x, y } = slot;
  const d = slot.depth !== undefined ? { depth: slot.depth } : {};
  if (t === 'rot0')   return { x, y, ...d };
  if (t === 'flipH')  return { x: origWidth - 1 - x, y, ...d };
  if (t === 'flipV')  return { x, y: origHeight - 1 - y, ...d };
  if (t === 'rot90')  return { x: origHeight - 1 - y, y: x, ...d };
  if (t === 'rot180') return { x: origWidth - 1 - x, y: origHeight - 1 - y, ...d };
  if (t === 'rot270') return { x: y, y: origWidth - 1 - x, ...d };
  return { x, y, ...d };
}

export function applyTransform(template: MapTemplate, t: Transform): MapTemplate {
  if (t === 'rot0') return template;

  const { tiles: newTiles, width: newWidth, height: newHeight } =
    transformTiles(template.tiles, template.width, template.height, t);

  const baseSlots = template.slots;
  const W = template.width;
  const H = template.height;
  const newSlots: MapSlots = {
    spawn:    transformSlot(baseSlots.spawn, W, H, t),
    exitMain: transformSlot(baseSlots.exitMain, W, H, t),
    ...(baseSlots.doorMain      ? { doorMain:      transformSlot(baseSlots.doorMain,      W, H, t) } : {}),
    ...(baseSlots.switchA       ? { switchA:        transformSlot(baseSlots.switchA,       W, H, t) } : {}),
    ...(baseSlots.npcQuestGiver ? { npcQuestGiver:  transformSlot(baseSlots.npcQuestGiver, W, H, t) } : {}),
    ...(baseSlots.npcHint       ? { npcHint:        transformSlot(baseSlots.npcHint,       W, H, t) } : {}),
    ...(baseSlots.itemKey       ? { itemKey:        transformSlot(baseSlots.itemKey,       W, H, t) } : {}),
    ...(baseSlots.itemOptional  ? { itemOptional:   transformSlot(baseSlots.itemOptional,  W, H, t) } : {}),
  };

  return {
    ...template,
    width:  newWidth,
    height: newHeight,
    tiles:  newTiles,
    slots:  newSlots,
  };
}

export function formatTemplateForPrompt(template: MapTemplate, levelNumber: number): string {
  const slots = template.slots;
  const tilesJson = '[\n' +
    template.tiles.map(row => '  ' + JSON.stringify(row)).join(',\n') +
    '\n]';

  function dStr(s: SlotPosition): string {
    return s.depth !== undefined ? ` [depth:${s.depth}]` : '';
  }

  const slotLines: string[] = [
    `  spawn:          { x: ${slots.spawn.x}, y: ${slots.spawn.y} }${dStr(slots.spawn)}  ← REQUIRED: place spawn entity here`,
    `  exitMain:       { x: ${slots.exitMain.x}, y: ${slots.exitMain.y} }${dStr(slots.exitMain)}  ← REQUIRED: place exit entity here (border tile)`,
  ];
  if (slots.doorMain)      slotLines.push(`  doorMain:       { x: ${slots.doorMain.x}, y: ${slots.doorMain.y} }${dStr(slots.doorMain)}  ← recommended: place locked door entity + define in doors[]`);
  if (slots.switchA)       slotLines.push(`  switchA:        { x: ${slots.switchA.x}, y: ${slots.switchA.y} }${dStr(slots.switchA)}  ← recommended: place switch entity + define in switches[]`);
  if (slots.npcQuestGiver) slotLines.push(`  npcQuestGiver:  { x: ${slots.npcQuestGiver.x}, y: ${slots.npcQuestGiver.y} }${dStr(slots.npcQuestGiver)}  ← recommended: NPC quest giver, set positionX/Y`);
  if (slots.npcHint)       slotLines.push(`  npcHint:        { x: ${slots.npcHint.x}, y: ${slots.npcHint.y} }${dStr(slots.npcHint)}  ← optional secondary NPC`);
  if (slots.itemKey)       slotLines.push(`  itemKey:        { x: ${slots.itemKey.x}, y: ${slots.itemKey.y} }${dStr(slots.itemKey)}  ← key item placement position`);
  if (slots.itemOptional)  slotLines.push(`  itemOptional:   { x: ${slots.itemOptional.x}, y: ${slots.itemOptional.y} }${dStr(slots.itemOptional)}  ← optional secondary item`);

  // Softlock risk warning: itemKey depth >= doorMain depth means the key is BEHIND its own door
  const warnings: string[] = [];
  if (slots.doorMain && slots.itemKey) {
    const doorDepth = slots.doorMain.depth ?? 3;
    const keyDepth  = slots.itemKey.depth  ?? 1;
    if (keyDepth >= doorDepth) {
      warnings.push(
        `  ⚠ SOFTLOCK RISK: itemKey [depth:${keyDepth}] is BEHIND doorMain [depth:${doorDepth}].` +
        ` Do NOT use itemKey as the door key — that creates an impossible game.` +
        ` For doorMain use: openedByDefault:true, lockCondition.type:"always", or quest_complete` +
        ` from an NPC whose slot has depth < ${doorDepth}.`,
      );
    }
  }

  const lines = [
    `### Level ${levelNumber} — Template: "${template.templateId}" (${template.name}) — ${template.width}×${template.height}`,
    `TILE ARRAY — copy verbatim into mapData.tiles, set mapData.width:${template.width}, mapData.height:${template.height}:`,
    tilesJson,
    `ENTITY SLOT POSITIONS (depth: 0=spawn, 1-2=pre-door, 3=door, 4-5=post-door — key items MUST have depth < doorMain depth):`,
    slotLines.join('\n'),
  ];
  if (warnings.length > 0) lines.push(warnings.join('\n'));

  return lines.join('\n');
}

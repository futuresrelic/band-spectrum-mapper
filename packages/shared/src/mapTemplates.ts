// Map template bank for Band RPG campaign generator.
// Each template is BFS-verified: every slot is reachable from spawn.
// tiles[y][x] — 0=wall, 1=floor, 2=elevated, 3=special.
// Border tiles are walls except for the exitMain slot (placed on a border wall).

export type Transform = 'rot0' | 'rot90' | 'rot180' | 'rot270' | 'flipH' | 'flipV';

export interface SlotPosition {
  x: number;
  y: number;
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
      spawn:          { x: 8, y: 3 },
      exitMain:       { x: 0, y: 3 },
      doorMain:       { x: 4, y: 3 },
      npcQuestGiver:  { x: 8, y: 2 },
      itemKey:        { x: 2, y: 5 },
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
      spawn:         { x: 4, y: 6 },
      exitMain:      { x: 9, y: 0 },
      doorMain:      { x: 1, y: 3 },
      itemKey:       { x: 9, y: 2 },
      npcQuestGiver: { x: 1, y: 2 },
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
      spawn:         { x: 2, y: 3 },
      exitMain:      { x: 12, y: 3 },
      doorMain:      { x: 4, y: 3 },
      switchA:       { x: 8, y: 3 },
      npcQuestGiver: { x: 6, y: 2 },
      npcHint:       { x: 10, y: 2 },
      itemKey:       { x: 10, y: 5 },
      itemOptional:  { x: 6, y: 5 },
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
      spawn:         { x: 6, y: 5 },
      exitMain:      { x: 6, y: 0 },
      doorMain:      { x: 6, y: 3 },
      switchA:       { x: 6, y: 7 },
      npcQuestGiver: { x: 2, y: 2 },
      npcHint:       { x: 10, y: 2 },
      itemKey:       { x: 2, y: 8 },
      itemOptional:  { x: 10, y: 8 },
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
      spawn:    { x: 2, y: 9 },
      exitMain: { x: 0, y: 1 },
      doorMain: { x: 5, y: 7 },
      switchA:  { x: 4, y: 5 },
      itemKey:  { x: 2, y: 6 },
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
      spawn:         { x: 5, y: 5 },
      exitMain:      { x: 5, y: 0 },
      doorMain:      { x: 5, y: 3 },
      switchA:       { x: 5, y: 7 },
      npcQuestGiver: { x: 2, y: 5 },
      npcHint:       { x: 8, y: 5 },
      itemKey:       { x: 5, y: 8 },
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
      spawn:         { x: 2, y: 6 },
      exitMain:      { x: 0, y: 6 },
      doorMain:      { x: 6, y: 4 },
      npcQuestGiver: { x: 2, y: 2 },
      itemKey:       { x: 10, y: 2 },
      itemOptional:  { x: 10, y: 6 },
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
      spawn:         { x: 2, y: 4 },
      exitMain:      { x: 12, y: 4 },
      doorMain:      { x: 9, y: 4 },
      switchA:       { x: 5, y: 4 },
      npcQuestGiver: { x: 1, y: 2 },
      npcHint:       { x: 4, y: 6 },
      itemKey:       { x: 10, y: 2 },
      itemOptional:  { x: 7, y: 6 },
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
      spawn:    { x: 1, y: 9 },
      exitMain: { x: 11, y: 0 },
      doorMain: { x: 7, y: 5 },
      switchA:  { x: 9, y: 5 },
      itemKey:  { x: 11, y: 2 },
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
      spawn:         { x: 6, y: 9 },
      exitMain:      { x: 6, y: 0 },
      doorMain:      { x: 6, y: 2 },
      switchA:       { x: 6, y: 8 },
      npcQuestGiver: { x: 2, y: 2 },
      npcHint:       { x: 10, y: 2 },
      itemKey:       { x: 2, y: 8 },
      itemOptional:  { x: 10, y: 8 },
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
  if (t === 'rot0')   return { x, y };
  if (t === 'flipH')  return { x: origWidth - 1 - x, y };
  if (t === 'flipV')  return { x, y: origHeight - 1 - y };
  if (t === 'rot90')  return { x: origHeight - 1 - y, y: x };
  if (t === 'rot180') return { x: origWidth - 1 - x, y: origHeight - 1 - y };
  if (t === 'rot270') return { x: y, y: origWidth - 1 - x };
  return { x, y };
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

  const slotLines: string[] = [
    `  spawn:          { x: ${slots.spawn.x}, y: ${slots.spawn.y} }  ← REQUIRED: place spawn entity here`,
    `  exitMain:       { x: ${slots.exitMain.x}, y: ${slots.exitMain.y} }  ← REQUIRED: place exit entity here (border tile)`,
  ];
  if (slots.doorMain)      slotLines.push(`  doorMain:       { x: ${slots.doorMain.x}, y: ${slots.doorMain.y} }  ← recommended: place locked door entity + define door in doors[]`);
  if (slots.switchA)       slotLines.push(`  switchA:        { x: ${slots.switchA.x}, y: ${slots.switchA.y} }  ← recommended: place switch entity + define switch in switches[]`);
  if (slots.npcQuestGiver) slotLines.push(`  npcQuestGiver:  { x: ${slots.npcQuestGiver.x}, y: ${slots.npcQuestGiver.y} }  ← recommended: place NPC here, set positionX/Y`);
  if (slots.npcHint)       slotLines.push(`  npcHint:        { x: ${slots.npcHint.x}, y: ${slots.npcHint.y} }  ← optional secondary NPC`);
  if (slots.itemKey)       slotLines.push(`  itemKey:        { x: ${slots.itemKey.x}, y: ${slots.itemKey.y} }  ← recommended: place key item entity here`);
  if (slots.itemOptional)  slotLines.push(`  itemOptional:   { x: ${slots.itemOptional.x}, y: ${slots.itemOptional.y} }  ← optional secondary item`);

  return [
    `### Level ${levelNumber} — Template: "${template.templateId}" (${template.name}) — ${template.width}×${template.height}`,
    `TILE ARRAY — copy verbatim into mapData.tiles, set mapData.width:${template.width}, mapData.height:${template.height}:`,
    tilesJson,
    `ENTITY SLOT POSITIONS (all slots are on walkable floor tiles, BFS-verified):`,
    slotLines.join('\n'),
  ].join('\n');
}

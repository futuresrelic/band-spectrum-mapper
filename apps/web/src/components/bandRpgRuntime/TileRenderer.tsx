import { useMemo } from 'react';
import type { RuntimeLevel, RuntimeNpc } from '../../api/bandRpgRuntime';
import { isAdjacent } from './useGameEngine';

// ── Constants ─────────────────────────────────────────────────────────────────

export const CELL = 32;
export const VIEWPORT_W = 640;
export const VIEWPORT_H = 480;

// ── Tile visuals ──────────────────────────────────────────────────────────────

const TILE_BG: Record<number, string> = {
  0: '#111827',  // void / wall
  1: '#374151',  // floor
  2: '#78350f',  // bookshelf / wall prop
  3: '#1e3a5f',  // shelf / highlight floor
};

const RARITY_GLOW: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#34d399',
  rare: '#60a5fa',
  epic: '#c084fc',
  legendary: '#fbbf24',
};

// ── Camera ────────────────────────────────────────────────────────────────────

function computeCamera(
  playerX: number, playerY: number,
  mapW: number, mapH: number,
): { cx: number; cy: number } {
  const maxCamX = Math.max(0, mapW * CELL - VIEWPORT_W);
  const maxCamY = Math.max(0, mapH * CELL - VIEWPORT_H);
  const rawCX = VIEWPORT_W / 2 - playerX * CELL - CELL / 2;
  const rawCY = VIEWPORT_H / 2 - playerY * CELL - CELL / 2;
  return {
    cx: Math.min(0, Math.max(-maxCamX, rawCX)),
    cy: Math.min(0, Math.max(-maxCamY, rawCY)),
  };
}

// ── TileRenderer ──────────────────────────────────────────────────────────────

interface Props {
  level: RuntimeLevel;
  playerX: number;
  playerY: number;
  collectedEntityIds: Set<string>;
  onCellClick?: (x: number, y: number) => void;
}

export default function TileRenderer({
  level, playerX, playerY, collectedEntityIds, onCellClick,
}: Props) {
  const { mapData, npcs, items, exits } = level;
  const { cx, cy } = useMemo(
    () => computeCamera(playerX, playerY, mapData.width, mapData.height),
    [playerX, playerY, mapData.width, mapData.height],
  );

  const mapW = mapData.width * CELL;
  const mapH = mapData.height * CELL;

  return (
    <div
      style={{ width: VIEWPORT_W, height: VIEWPORT_H, overflow: 'hidden', position: 'relative' }}
      className="bg-gray-950"
    >
      {/* Map container — moves with camera */}
      <div
        style={{
          position: 'absolute',
          width: mapW,
          height: mapH,
          transform: `translate(${cx}px,${cy}px)`,
          transition: 'transform 60ms linear',
        }}
      >
        {/* Tile grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${mapData.width}, ${CELL}px)`,
            gridTemplateRows: `repeat(${mapData.height}, ${CELL}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {mapData.tiles.flatMap((row, y) =>
            row.map((tile, x) => (
              <div
                key={`${x}-${y}`}
                onClick={() => onCellClick?.(x, y)}
                style={{
                  width: CELL,
                  height: CELL,
                  backgroundColor: TILE_BG[tile] ?? TILE_BG[0],
                  borderRight: '1px solid rgba(255,255,255,0.03)',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  boxSizing: 'border-box',
                }}
              />
            ))
          )}
        </div>

        {/* Exit markers */}
        {exits.map((exit, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: exit.tileX * CELL,
              top: exit.tileY * CELL,
              width: CELL,
              height: CELL,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(59,130,246,0.3)',
              border: '2px solid #3b82f6',
              boxSizing: 'border-box',
              borderRadius: 2,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>🚪</span>
          </div>
        ))}

        {/* Items */}
        {items
          .filter(item => !collectedEntityIds.has(item.entityId))
          .map(item => {
            const glow = RARITY_GLOW[item.rarity] ?? RARITY_GLOW['common'];
            return (
              <div
                key={item.entityId}
                style={{
                  position: 'absolute',
                  left: item.tileX * CELL,
                  top: item.tileY * CELL,
                  width: CELL,
                  height: CELL,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.iconUrl ? (
                  <img
                    src={item.iconUrl}
                    alt={item.name}
                    style={{ width: 20, height: 20, objectFit: 'contain', filter: `drop-shadow(0 0 4px ${glow})` }}
                  />
                ) : (
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: glow,
                      boxShadow: `0 0 8px ${glow}`,
                    }}
                  />
                )}
              </div>
            );
          })}

        {/* NPCs */}
        {npcs.map(npc => {
          const adjacent = isAdjacent(playerX, playerY, npc.tileX, npc.tileY);
          return (
            <NpcSprite key={npc.id} npc={npc} adjacent={adjacent} />
          );
        })}

        {/* Player */}
        <PlayerSprite x={playerX} y={playerY} />
      </div>
    </div>
  );
}

// ── Player sprite ─────────────────────────────────────────────────────────────

function PlayerSprite({ x, y }: { x: number; y: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x * CELL,
        top: y * CELL,
        width: CELL,
        height: CELL,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          backgroundColor: '#818cf8',
          border: '2px solid #c7d2fe',
          boxShadow: '0 0 8px rgba(129,140,248,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
        }}
      >
        ●
      </div>
    </div>
  );
}

// ── NPC sprite ────────────────────────────────────────────────────────────────

function NpcSprite({ npc, adjacent }: { npc: RuntimeNpc; adjacent: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: npc.tileX * CELL,
        top: npc.tileY * CELL,
        width: CELL,
        height: CELL,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          backgroundColor: adjacent ? '#fde68a' : '#d97706',
          border: `2px solid ${adjacent ? '#f59e0b' : '#b45309'}`,
          boxShadow: adjacent ? '0 0 10px rgba(253,230,138,0.9)' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
        }}
      >
        👤
      </div>
      {/* Name label */}
      <div
        style={{
          position: 'absolute',
          bottom: CELL + 2,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: '#fde68a',
          fontSize: 9,
          fontWeight: 600,
          padding: '1px 4px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {npc.name}
      </div>
      {/* Interact hint */}
      {adjacent && (
        <div
          style={{
            position: 'absolute',
            top: -18,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(253,230,138,0.15)',
            color: '#fde68a',
            fontSize: 9,
            padding: '1px 4px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
            border: '1px solid rgba(253,230,138,0.4)',
          }}
        >
          [E] Talk
        </div>
      )}
    </div>
  );
}

/**
 * MapPreview — read-only mini-map rendered from a level's mapData.
 * Tiles are drawn as a small SVG grid; entity icons are overlaid at their positions.
 */

interface RawEntity {
  type?: string;
  x?: number;
  y?: number;
  refId?: string;
  label?: string;
  targetLevelSlug?: string;
}

interface MapData {
  width?: number;
  height?: number;
  tiles?: number[][];
  entities?: RawEntity[];
}

interface MapPreviewProps {
  mapData: MapData;
  levelName: string;
  hasErrors?: boolean;
  onEdit?: () => void;
  className?: string;
}

const ENTITY_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  spawn:  { label: 'S', bg: 'bg-green-500',  text: 'text-white' },
  exit:   { label: 'E', bg: 'bg-blue-500',   text: 'text-white' },
  npc:    { label: 'N', bg: 'bg-purple-500', text: 'text-white' },
  item:   { label: 'I', bg: 'bg-yellow-400', text: 'text-gray-900' },
  door:   { label: 'D', bg: 'bg-red-500',    text: 'text-white' },
  switch: { label: 'W', bg: 'bg-orange-400', text: 'text-white' },
};

const TILE_PX = 5; // pixels per tile cell

export function MapPreview({ mapData, levelName, hasErrors, onEdit, className }: MapPreviewProps) {
  const tiles   = mapData.tiles ?? [];
  const width   = mapData.width ?? (tiles[0]?.length ?? 0);
  const height  = mapData.height ?? tiles.length;
  const entities = mapData.entities ?? [];

  if (width === 0 || height === 0) {
    return (
      <div className={`text-xs text-surface-400 italic ${className ?? ''}`}>
        No map data for {levelName}
      </div>
    );
  }

  const svgW = width  * TILE_PX;
  const svgH = height * TILE_PX;

  // Render entity badges as small SVG foreignObjects would be complex; use overlay divs instead.
  // The tile grid is SVG; entities are absolutely positioned divs on top.
  return (
    <div className={`${className ?? ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-surface-700 truncate">{levelName}</span>
        {hasErrors && <span className="text-xs text-orange-600 font-medium">⚠ unreachable</span>}
        {onEdit && (
          <button
            onClick={onEdit}
            className="ml-auto text-xs px-2 py-0.5 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
          >
            ✏ Fix Map
          </button>
        )}
      </div>

      <div className="relative inline-block" style={{ width: svgW, height: svgH }}>
        {/* Tile grid as SVG */}
        <svg
          width={svgW}
          height={svgH}
          className="block"
          style={{ imageRendering: 'pixelated' }}
        >
          {tiles.map((row, y) =>
            (row ?? []).map((tile, x) => (
              <rect
                key={`${y}-${x}`}
                x={x * TILE_PX}
                y={y * TILE_PX}
                width={TILE_PX}
                height={TILE_PX}
                fill={
                  tile === 1 ? '#e5e7eb'  // floor — gray-200
                  : tile === 2 ? '#d1d5db' // elevated floor — gray-300
                  : tile === 3 ? '#93c5fd' // special floor — blue-300
                  : '#374151'              // wall — gray-700
                }
              />
            ))
          )}
        </svg>

        {/* Entity dots overlaid */}
        {entities.map((e, idx) => {
          const t = (e.type ?? '') as string;
          const style = ENTITY_STYLES[t];
          if (!style) return null;
          const ex = typeof e.x === 'number' ? e.x : -1;
          const ey = typeof e.y === 'number' ? e.y : -1;
          if (ex < 0 || ey < 0) return null;
          return (
            <div
              key={idx}
              title={`${t}${e.refId ? ` (${e.refId})` : ''}${e.targetLevelSlug ? ` → ${e.targetLevelSlug}` : ''}`}
              className={`absolute ${style.bg} ${style.text} flex items-center justify-center font-bold`}
              style={{
                left: ex * TILE_PX,
                top:  ey * TILE_PX,
                width: TILE_PX,
                height: TILE_PX,
                fontSize: 3,
                lineHeight: 1,
              }}
            >
              {style.label}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {Object.entries(ENTITY_STYLES).map(([t, s]) => {
          const hasAny = entities.some(e => e.type === t);
          if (!hasAny) return null;
          return (
            <span key={t} className="flex items-center gap-0.5 text-xs text-surface-500">
              <span className={`inline-block w-3 h-3 rounded-sm ${s.bg} flex-shrink-0`} />
              {t}
            </span>
          );
        })}
      </div>
    </div>
  );
}

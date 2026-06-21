interface Props {
  onMove: (dx: number, dy: number) => void;
  onInteract: () => void;
  compact?: boolean;
}

export default function MobileControls({ onMove, onInteract, compact = false }: Props) {
  const btnSize = compact ? 38 : 44;
  const gap = compact ? 3 : 4;
  const edge = compact ? 8 : 16;

  const makeBtn = (label: string, onClick: () => void, area: string) => (
    <div style={{ gridArea: area }}>
      <button
        onPointerDown={e => { e.preventDefault(); onClick(); }}
        style={{
          width: btnSize,
          height: btnSize,
          backgroundColor: 'rgba(99,102,241,0.25)',
          border: '2px solid rgba(99,102,241,0.5)',
          borderRadius: 8,
          color: '#c7d2fe',
          fontSize: compact ? 15 : 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        {label}
      </button>
    </div>
  );

  // D-pad height = 3*btnSize + 2*gap; vertically centre E button with middle D-pad row
  const dpadH = 3 * btnSize + 2 * gap;
  const eMidOffset = edge + Math.floor(dpadH / 2) - Math.floor(btnSize / 2);

  return (
    <>
      {/* D-pad — bottom-left, respects safe-area-inset-left/bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${edge}px)`,
          left: `calc(env(safe-area-inset-left, 0px) + ${edge}px)`,
          display: 'grid',
          gridTemplateAreas: '". up ." "left . right" ". down ."',
          gridTemplateColumns: `${btnSize}px ${btnSize}px ${btnSize}px`,
          gridTemplateRows: `${btnSize}px ${btnSize}px ${btnSize}px`,
          gap,
          pointerEvents: 'auto',
        }}
      >
        {makeBtn('▲', () => onMove(0, -1), 'up')}
        {makeBtn('◀', () => onMove(-1, 0), 'left')}
        {makeBtn('▶', () => onMove(1, 0), 'right')}
        {makeBtn('▼', () => onMove(0, 1), 'down')}
      </div>

      {/* Interact — bottom-right, vertically centred with D-pad middle row */}
      <button
        onPointerDown={e => { e.preventDefault(); onInteract(); }}
        style={{
          position: 'absolute',
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${eMidOffset}px)`,
          right: `calc(env(safe-area-inset-right, 0px) + ${edge}px)`,
          width: compact ? 56 : 64,
          height: btnSize,
          backgroundColor: 'rgba(34,197,94,0.25)',
          border: '2px solid rgba(34,197,94,0.5)',
          borderRadius: 8,
          color: '#86efac',
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          letterSpacing: '0.05em',
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
        }}
      >
        [E]
      </button>
    </>
  );
}

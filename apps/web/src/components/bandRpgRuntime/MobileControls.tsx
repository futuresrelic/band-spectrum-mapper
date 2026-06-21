interface Props {
  onMove: (dx: number, dy: number) => void;
  onInteract: () => void;
}

export default function MobileControls({ onMove, onInteract }: Props) {
  const btn = (label: string, onClick: () => void, style?: React.CSSProperties) => (
    <button
      onPointerDown={e => { e.preventDefault(); onClick(); }}
      style={{
        width: 44,
        height: 44,
        backgroundColor: 'rgba(99,102,241,0.25)',
        border: '2px solid rgba(99,102,241,0.5)',
        borderRadius: 10,
        color: '#c7d2fe',
        fontSize: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        touchAction: 'none',
        cursor: 'pointer',
        ...style,
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        zIndex: 200,
        display: 'grid',
        gridTemplateAreas: `". up ." "left . right" ". down ."`,
        gridTemplateColumns: '44px 44px 44px',
        gridTemplateRows: '44px 44px 44px',
        gap: 4,
      }}
    >
      <div style={{ gridArea: 'up' }}>{btn('▲', () => onMove(0, -1))}</div>
      <div style={{ gridArea: 'left' }}>{btn('◀', () => onMove(-1, 0))}</div>
      <div style={{ gridArea: 'right' }}>{btn('▶', () => onMove(1, 0))}</div>
      <div style={{ gridArea: 'down' }}>{btn('▼', () => onMove(0, 1))}</div>
      <button
        onPointerDown={e => { e.preventDefault(); onInteract(); }}
        style={{
          position: 'absolute',
          bottom: -54,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 64,
          height: 44,
          backgroundColor: 'rgba(34,197,94,0.25)',
          border: '2px solid rgba(34,197,94,0.5)',
          borderRadius: 10,
          color: '#86efac',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.05em',
          userSelect: 'none',
          touchAction: 'none',
          cursor: 'pointer',
        }}
      >
        [E]
      </button>
    </div>
  );
}

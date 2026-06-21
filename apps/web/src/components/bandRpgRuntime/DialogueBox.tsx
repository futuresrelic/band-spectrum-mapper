import type { RuntimeNpc } from '../../api/bandRpgRuntime';

interface Props {
  npc: RuntimeNpc;
  dialogueIndex: number;
  onNext: () => void;
  onClose: () => void;
}

export default function DialogueBox({ npc, dialogueIndex, onNext, onClose }: Props) {
  const line = npc.dialogue[dialogueIndex];
  const isLast = dialogueIndex >= npc.dialogue.length - 1;

  if (!line) {
    onClose();
    return null;
  }

  const speaker = line.speakerName ?? npc.name;
  const portrait = line.portraitUrl ?? npc.portraitUrl;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '0 16px 16px',
        zIndex: 100,
      }}
      onClick={onNext}
    >
      <div
        style={{
          backgroundColor: 'rgba(15,23,42,0.97)',
          border: '1px solid rgba(253,230,138,0.25)',
          borderRadius: 10,
          padding: '14px 16px',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          userSelect: 'none',
          cursor: 'pointer',
        }}
      >
        {/* Portrait */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 6,
            backgroundColor: '#1e293b',
            border: '2px solid rgba(253,230,138,0.3)',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {portrait ? (
            <img src={portrait} alt={speaker} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 28 }}>👤</span>
          )}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fde68a', fontSize: 12, fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {speaker}
          </div>
          <div style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.55 }}>
            {line.text}
          </div>
        </div>

        {/* Advance indicator */}
        <div style={{ color: '#94a3b8', fontSize: 11, alignSelf: 'flex-end', flexShrink: 0, paddingBottom: 2 }}>
          {isLast ? (
            <span style={{ color: '#fde68a' }}>[E] Done</span>
          ) : (
            <span>[E] Next ▶</span>
          )}
        </div>
      </div>
    </div>
  );
}

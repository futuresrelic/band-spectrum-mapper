import type { DialogueLine, DialogueChoiceAction } from '../../api/bandRpgRuntime';

interface Props {
  lines: DialogueLine[];
  index: number;
  mode: 'npc' | 'beat';
  onNext: () => void;
  onClose: () => void;
  onChoose: (action: DialogueChoiceAction) => void;
}

export default function DialogueBox({ lines, index, mode, onNext, onClose, onChoose }: Props) {
  const line = lines[index];
  if (!line) { onClose(); return null; }

  const isLast = index >= lines.length - 1;
  const hasChoices = (line.choices?.length ?? 0) > 0;
  const borderColor = mode === 'beat' ? 'rgba(167,139,250,0.4)' : 'rgba(253,230,138,0.25)';
  const nameColor = mode === 'beat' ? '#c4b5fd' : '#fde68a';
  const portrait = line.portraitUrl;
  const speaker = line.speakerName ?? (mode === 'beat' ? 'Narrator' : '');

  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 16px 16px', zIndex: 100 }}>
      <div
        onClick={hasChoices ? undefined : onNext}
        style={{
          cursor: hasChoices ? 'default' : 'pointer',
          backgroundColor: 'rgba(15,23,42,0.97)',
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          userSelect: 'none',
        }}
      >
        {/* Portrait + text row */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 6,
              backgroundColor: '#1e293b',
              border: `2px solid ${borderColor}`,
              overflow: 'hidden', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {portrait ? (
              <img src={portrait} alt={speaker} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: mode === 'beat' ? 22 : 28 }}>{mode === 'beat' ? '📖' : '👤'}</span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {speaker && (
              <div style={{ color: nameColor, fontSize: 11, fontWeight: 700, marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {speaker}
              </div>
            )}
            <div style={{ color: '#e2e8f0', fontSize: 14, lineHeight: 1.6 }}>
              {line.text}
            </div>
          </div>

          {!hasChoices && (
            <div style={{ color: '#64748b', fontSize: 11, alignSelf: 'flex-end', flexShrink: 0 }}>
              {isLast
                ? <span style={{ color: nameColor }}>[E] Done</span>
                : <span>[E] Next ▶</span>
              }
            </div>
          )}
        </div>

        {/* Choices */}
        {hasChoices && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {line.choices!.map((choice, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); choice.action ? onChoose(choice.action) : onNext(); }}
                style={{
                  backgroundColor: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.4)',
                  borderRadius: 6,
                  padding: '7px 12px',
                  color: '#c7d2fe',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                ▸ {choice.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Headliner — Concert Stage (Phase Z.17.17)
 *
 * Simplified, generic performers — never a likeness of a real musician.
 * Each slot (vocalist/guitarist/bassist/drummer/keyboardist) renders a
 * plain CSS silhouette by default, or an admin-configured sprite image.
 * Idle animation loops are restrained CSS keyframes, scaled by
 * idleMotionIntensity and the player's animation-quality setting.
 */
import type { PerformerSlot, PerformerSprites } from '../../api/crowdVisualConfig';

const SLOT_ORDER: readonly PerformerSlot[] = ['drummer', 'bassist', 'guitarist', 'vocalist', 'keyboardist'];
const SLOT_LABEL: Record<PerformerSlot, string> = {
  vocalist: 'Vocalist', guitarist: 'Guitarist', bassist: 'Bassist', drummer: 'Drummer', keyboardist: 'Keyboardist',
};
/** Generic silhouette shapes — width/height/color, deliberately abstract. */
const SLOT_SHAPE: Record<PerformerSlot, { w: number; h: number; color: string }> = {
  vocalist: { w: 18, h: 46, color: '#f472b6' },
  guitarist: { w: 18, h: 42, color: '#38bdf8' },
  bassist: { w: 18, h: 42, color: '#4ade80' },
  drummer: { w: 22, h: 34, color: '#facc15' },
  keyboardist: { w: 18, h: 40, color: '#a78bfa' },
};
const SLOT_ANIMATION: Record<PerformerSlot, string> = {
  vocalist: 'headliner-sway',
  guitarist: 'headliner-strum',
  bassist: 'headliner-strum',
  drummer: 'headliner-drum',
  keyboardist: 'headliner-sway',
};

export default function ConcertStage({
  activeSlots, sprites, backdropUrl, animate, idleMotionIntensity,
}: {
  activeSlots: readonly PerformerSlot[];
  sprites: PerformerSprites;
  backdropUrl: string | null;
  animate: boolean;
  idleMotionIntensity: number;
}) {
  const ordered = SLOT_ORDER.filter((s) => activeSlots.includes(s));
  const durationScale = 1 / Math.max(0.2, idleMotionIntensity);

  return (
    <div
      aria-hidden
      className="relative h-20 rounded-t-xl overflow-hidden flex items-end justify-center gap-3 px-4 pb-1"
      style={{
        backgroundImage: backdropUrl ? `url(${backdropUrl})` : 'linear-gradient(180deg, #1f2937 0%, #111827 100%)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <style>{`
        @keyframes headliner-sway { 0%, 100% { transform: translateX(0) rotate(0deg); } 50% { transform: translateX(1.5px) rotate(1.5deg); } }
        @keyframes headliner-strum { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
        @keyframes headliner-drum { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.9); } }
      `}</style>
      {ordered.map((slot) => {
        const sprite = sprites[slot];
        const shape = SLOT_SHAPE[slot];
        const anim = animate ? `${SLOT_ANIMATION[slot]} ${1.1 * durationScale}s ease-in-out infinite` : 'none';
        return (
          <div key={slot} className="flex flex-col items-center gap-0.5" title={SLOT_LABEL[slot]}>
            {sprite ? (
              <img
                src={sprite} alt=""
                className="motion-reduce:animate-none"
                style={{ width: shape.w * 1.6, height: shape.h * 1.4, animation: anim, transformOrigin: 'bottom center' }}
              />
            ) : (
              <span
                className="block rounded-t-full motion-reduce:animate-none"
                style={{
                  width: shape.w, height: shape.h, backgroundColor: shape.color, opacity: 0.85,
                  animation: anim, transformOrigin: 'bottom center',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

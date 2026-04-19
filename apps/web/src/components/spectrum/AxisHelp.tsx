import { useState } from 'react';
import type { ScoreAxis } from '@band-spectrum-mapper/shared';

interface AxisDef {
  short: string;
  long: string;
}

const AXIS_HELP: Record<string, AxisDef> = {
  aggression: {
    short: 'How intense, forceful, confrontational, or heavy the song feels.',
    long:  'Measures intensity, attack, anger, confrontation, and force. High scores suggest punishing, explosive, or hostile energy; low scores suggest restraint or softness.',
  },
  complexity: {
    short: 'How intricate the song is rhythmically, structurally, and instrumentally.',
    long:  'Measures structural, rhythmic, and instrumental intricacy. High scores suggest technical interplay, odd meters, and evolving arrangements; low scores suggest straightforward construction.',
  },
  atmosphere: {
    short: 'How immersive, moody, spacious, or sonically enveloping the song feels.',
    long:  'Measures the strength of mood, texture, sonic space, and immersion. High scores suggest haunting, cinematic, or enveloping sound worlds; low scores suggest a more direct presentation.',
  },
  emotion: {
    short: 'How much emotional weight, vulnerability, catharsis, or feeling the song carries.',
    long:  'Measures emotional weight and expressive impact. High scores suggest vulnerability, grief, catharsis, yearning, or inner conflict; low scores suggest emotional distance or neutrality.',
  },
  psychedelic: {
    short: 'How hypnotic, surreal, trance-like, or mind-expanding the song feels.',
    long:  'Measures surreal, hypnotic, altered-state, or visionary qualities. High scores suggest trance, ritual, dreamlike flow, or mind-expanding feel; low scores suggest grounded directness.',
  },
  concept: {
    short: 'How deep, layered, philosophical, symbolic, or idea-driven the song is.',
    long:  'Measures thematic and interpretive depth. High scores suggest symbolism, philosophy, metaphysics, or layered ideas; low scores suggest a simpler or more literal theme.',
  },
};

export const DISCLAIMER = 'These scores are subjective descriptors used for exploration and comparison, not objective measurements.';

// Inline help below a single axis label
export function AxisDescription({ axis }: { axis: ScoreAxis }) {
  const [expanded, setExpanded] = useState(false);
  const def = AXIS_HELP[axis];
  if (!def) return null;
  return (
    <div className="text-xs text-surface-600 mt-0.5">
      <span>{def.short}</span>{' '}
      <button
        className="text-surface-400 hover:text-surface-700 underline underline-offset-2"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'less' : 'more'}
      </button>
      {expanded && <p className="mt-1 text-surface-500">{def.long}</p>}
    </div>
  );
}

// Collapsible panel showing all 6 axes
export function AxisHelpPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        className="text-surface-500 hover:text-surface-800 underline underline-offset-2"
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide axis guide' : 'What do these axes mean?'}
      </button>
      {open && (
        <div className="mt-3 space-y-3 border border-surface-200 rounded-lg p-4 bg-surface-50">
          {Object.entries(AXIS_HELP).map(([axis, def]) => (
            <div key={axis}>
              <p className="font-medium capitalize text-surface-900">{axis}</p>
              <p className="text-surface-600">{def.long}</p>
            </div>
          ))}
          <p className="text-surface-400 italic border-t border-surface-200 pt-3">{DISCLAIMER}</p>
        </div>
      )}
    </div>
  );
}

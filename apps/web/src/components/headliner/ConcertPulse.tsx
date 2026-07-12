/**
 * Headliner — Concert Pulse (Creative Bible §14)
 *
 * Compact, glanceable read of the room: a central pulse that settles
 * after each song (no constant flashing), the top live reaction line, a
 * momentum direction indicator, and subtle per-faction arrows for the
 * three most relevant factions right now. Every signal pairs an icon/
 * label with color so it survives grayscale; all motion respects
 * prefers-reduced-motion (Tailwind's motion-reduce: variant).
 */
import type { ConcertPulseState, FactionPulseSummary } from '../../api/headliner';
import { FACTION_LABELS } from './factionLabels';

const DIRECTION_GLYPH: Record<ConcertPulseState['momentumDirection'], string> = {
  rising: '▲', falling: '▼', steady: '▬',
};
const DIRECTION_LABEL: Record<ConcertPulseState['momentumDirection'], string> = {
  rising: 'Rising', falling: 'Falling', steady: 'Steady',
};
const DIRECTION_COLOR: Record<ConcertPulseState['momentumDirection'], string> = {
  rising: 'text-emerald-400', falling: 'text-rose-400', steady: 'text-gray-400',
};

const FACTION_DIRECTION_GLYPH: Record<FactionPulseSummary['direction'], string> = {
  up: '▲', down: '▼', flat: '–',
};

function pulseSizeClass(intensity: ConcertPulseState['momentumIntensity']): string {
  if (intensity === 'high') return 'w-5 h-5';
  if (intensity === 'medium') return 'w-4 h-4';
  return 'w-3 h-3';
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: 'positive' | 'warning' | 'neutral' }) {
  const toneClass = tone === 'positive' ? 'border-emerald-800 text-emerald-400'
    : tone === 'warning' ? 'border-amber-800 text-amber-400'
      : 'border-gray-800 text-gray-400';
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide border rounded-full px-2 py-0.5 ${toneClass}`}>
      {children}
    </span>
  );
}

export default function ConcertPulse({ pulse }: { pulse: ConcertPulseState | null }) {
  if (!pulse || !pulse.hasPlayedASong) {
    return (
      <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4 flex items-center gap-3">
        <span className="w-3 h-3 rounded-full bg-gray-700" aria-hidden />
        <span className="text-xs text-gray-500">The room is waiting for your first song.</span>
      </div>
    );
  }

  const topFactions = [...pulse.factions].sort((a, b) => a.relevanceRank - b.relevanceRank).slice(0, 3);

  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full transition-all duration-500 motion-reduce:transition-none ${pulseSizeClass(pulse.momentumIntensity)} ${
            pulse.momentumDirection === 'rising' ? 'bg-emerald-500' : pulse.momentumDirection === 'falling' ? 'bg-rose-500' : 'bg-gray-500'
          }`}
          aria-hidden
        />
        <span className={`text-sm font-semibold ${DIRECTION_COLOR[pulse.momentumDirection]}`}>
          {DIRECTION_GLYPH[pulse.momentumDirection]} {DIRECTION_LABEL[pulse.momentumDirection]}
        </span>
        <span className="text-[11px] text-gray-500 uppercase tracking-wide">{pulse.momentumIntensity} intensity</span>
      </div>

      {pulse.topLine && <p className="text-sm text-sky-400 italic">{pulse.topLine}</p>}

      <div className="flex flex-wrap gap-1.5">
        {pulse.isNewShowHigh && <StatusBadge tone="positive">New show high</StatusBadge>}
        {pulse.isNewShowLow && <StatusBadge tone="warning">New show low</StatusBadge>}
        {pulse.isRecovery && <StatusBadge tone="positive">Recovery</StatusBadge>}
        {pulse.isSplitRoom && <StatusBadge tone="neutral">Split room</StatusBadge>}
        {pulse.walkoutRisk && <StatusBadge tone="warning">Walkout risk</StatusBadge>}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-gray-800">
        {topFactions.map((f) => (
          <span key={f.id} className={`text-xs flex items-center gap-1 ${
            f.direction === 'up' ? 'text-emerald-400' : f.direction === 'down' ? 'text-rose-400' : 'text-gray-500'
          }`}
          >
            <span aria-hidden>{FACTION_DIRECTION_GLYPH[f.direction]}</span>
            {FACTION_LABELS[f.id]}
          </span>
        ))}
      </div>
    </div>
  );
}

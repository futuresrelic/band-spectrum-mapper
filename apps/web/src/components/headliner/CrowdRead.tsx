/**
 * Headliner — compact Crowd Read (Creative Bible §14: "no more than three
 * always-visible meters"). Shows the three most relevant factions
 * persistently (ranked server-side by Concert Pulse — largest share of
 * the crowd, largest change this song, strongest deviation from neutral;
 * a faction at walkout risk always ranks first so a real warning is
 * never hidden by ranking), with the other two available on demand. All
 * five factions keep their full numerical detail and explanation text —
 * nothing is summarized away, just deferred behind one tap.
 */
import { useState } from 'react';
import type { FactionId, FactionReaction, ConcertPulseState } from '../../api/headliner';
import { FACTION_LABELS } from './factionLabels';

const DECLARED_ORDER: readonly FactionId[] = ['casual', 'hardcore', 'deepCut', 'progHeads', 'firstTimers'];

function FactionBar({ id, reaction }: { id: FactionId; reaction: FactionReaction | undefined }) {
  const score = reaction?.score ?? 0;
  const pct = Math.max(0, Math.min(100, (score + 100) / 2));
  const positive = score >= 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="text-gray-400">{FACTION_LABELS[id]}</span>
        {reaction && <span className={positive ? 'text-emerald-400' : 'text-rose-400'}>{positive ? '+' : ''}{Math.round(score)}</span>}
      </div>
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {reaction && <p className="text-[11px] text-gray-500 mt-1">{reaction.explanation}</p>}
    </div>
  );
}

export default function CrowdRead({
  reactions, pulse,
}: {
  reactions: Record<FactionId, FactionReaction> | null;
  pulse: ConcertPulseState | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const rankedIds = pulse ? [...pulse.factions].sort((a, b) => a.relevanceRank - b.relevanceRank).map((f) => f.id) : DECLARED_ORDER;
  const topThree = rankedIds.slice(0, 3);
  const rest = DECLARED_ORDER.filter((id) => !topThree.includes(id));

  return (
    <div className="space-y-2">
      {topThree.map((id) => <FactionBar key={id} id={id} reaction={reactions?.[id]} />)}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-[11px] text-gray-400 hover:text-white underline underline-offset-2"
      >
        {expanded ? 'Hide full crowd read' : 'Full crowd read (all 5 factions)'}
      </button>
      {expanded && (
        <div className="space-y-2 pt-1">
          {rest.map((id) => <FactionBar key={id} id={id} reaction={reactions?.[id]} />)}
        </div>
      )}
    </div>
  );
}

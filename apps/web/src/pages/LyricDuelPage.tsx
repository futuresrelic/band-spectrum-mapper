import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { platformerApi, type BodySkin } from '../api/platformer';
import {
  lyricDuelApi,
  type DuelBand,
  type MatchSetup,
  type RoundResult,
  type DuelScore,
  type DuelRule,
} from '../api/lyricDuel';

// ---------------------------------------------------------------------------
// Types + constants
// ---------------------------------------------------------------------------

type Phase = 'setup' | 'pregame' | 'battling' | 'gameover';
type GameMode = 'challenge' | 'custom' | 'ai-showdown';
type Difficulty = 'friendly' | 'normal' | 'ruthless' | 'legendary';

const MODES: { id: GameMode; label: string; desc: string; icon: string }[] = [
  { id: 'challenge',   label: 'Challenge',   icon: '🎯', desc: 'Pick your band — AI picks your rival' },
  { id: 'custom',      label: 'Custom Duel', icon: '⚔️', desc: 'You choose both sides' },
  { id: 'ai-showdown', label: 'AI Showdown', icon: '🤖', desc: 'AI picks both — just watch the carnage' },
];

const DIFFICULTIES: { id: Difficulty; label: string; desc: string; color: string }[] = [
  { id: 'friendly', label: 'Friendly',  desc: '3 rounds · AI generous with both sides',       color: 'border-green-500/50 bg-green-950/30 text-green-300' },
  { id: 'normal',   label: 'Normal',    desc: '3 rounds · Fair and balanced scoring',           color: 'border-sky-500/50 bg-sky-950/30 text-sky-300' },
  { id: 'ruthless', label: 'Ruthless',  desc: '5 rounds · AI holds you to a strict standard',  color: 'border-orange-500/50 bg-orange-950/30 text-orange-300' },
  { id: 'legendary',label: 'Legendary', desc: '5 rounds · The rival is a living legend',       color: 'border-rose-500/50 bg-rose-950/30 text-rose-300' },
];

const ALBUM_TYPES = [
  { value: 'studio',      label: 'Studio' },
  { value: 'lp',          label: 'LP' },
  { value: 'ep',          label: 'EP' },
  { value: 'single',      label: 'Single' },
  { value: 'live',        label: 'Live' },
  { value: 'remix',       label: 'Remix' },
  { value: 'compilation', label: 'Compilation' },
  { value: 'demo',        label: 'Demo' },
  { value: 'acoustic',    label: 'Acoustic' },
  { value: 'mixtape',     label: 'Mixtape' },
  { value: 'bootleg',     label: 'Bootleg' },
  { value: 'soundtrack',  label: 'Soundtrack' },
];

const ALL_ALBUM_TYPE_VALUES = ALBUM_TYPES.map((t) => t.value);

// ---------------------------------------------------------------------------
// Rule item with caveman short desc + expandable full info
// ---------------------------------------------------------------------------

function RuleItem({ rule, idx }: { rule: DuelRule; idx: number }) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <li className="flex gap-3">
      <span className="text-xs font-bold text-rose-400 w-5 shrink-0 mt-0.5">{idx + 1}.</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-white">{rule.name}</span>
          <span className="text-xs text-gray-400">{rule.shortDesc}</span>
          <button
            onClick={() => setShowInfo((v) => !v)}
            aria-label="More info"
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300 text-[10px] font-bold shrink-0 transition-colors"
          >
            i
          </button>
        </div>
        {showInfo && (
          <p className="text-xs text-gray-400 mt-1.5 pl-2 border-l-2 border-gray-600 leading-relaxed">
            {rule.description}
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Band face avatar
// ---------------------------------------------------------------------------

function BandAvatar({ skinUrl, size = 56 }: { skinUrl: string | null; size?: number }) {
  if (!skinUrl) return null;
  return (
    <div
      className="rounded-xl border-2 border-gray-600 overflow-hidden bg-gray-800 shrink-0"
      style={{ width: size, height: size }}
    >
      <img
        src={skinUrl}
        alt="avatar"
        style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BandGrid
// ---------------------------------------------------------------------------

function BandGrid({ bands, selectedId, onSelect, label }: {
  bands: DuelBand[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  label: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
        {bands.map((b) => (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            className={`text-left px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
              selectedId === b.id
                ? 'border-rose-500 bg-rose-950/60 text-rose-200'
                : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:text-white'
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Album type filter
// ---------------------------------------------------------------------------

function AlbumTypeFilter({ selected, onChange }: {
  selected: string[];
  onChange: (types: string[]) => void;
}) {
  const allSelected = selected.length === ALL_ALBUM_TYPE_VALUES.length;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Song Sources</p>
        <button
          onClick={() => onChange(allSelected ? [] : [...ALL_ALBUM_TYPE_VALUES])}
          className="text-[11px] text-gray-500 hover:text-gray-300 underline underline-offset-2"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {ALBUM_TYPES.map((t) => {
          const checked = selected.includes(t.value);
          return (
            <button
              key={t.value}
              onClick={() => toggle(t.value)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                checked
                  ? 'border-rose-500/60 bg-rose-950/40 text-rose-300'
                  : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-500'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-[11px] text-amber-500 mt-2">
          ⚠️ No types selected — all songs will be used (no filter applied).
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VS banner with optional face avatars
// ---------------------------------------------------------------------------

function VSBanner({ playerName, rivalName, theme, playerSkinUrl, rivalSkinUrl }: {
  playerName: string;
  rivalName: string;
  theme: string;
  playerSkinUrl: string | null;
  rivalSkinUrl: string | null;
}) {
  return (
    <div className="text-center py-8">
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <div className="flex flex-col items-end gap-2">
          {playerSkinUrl && (
            <div className="self-end">
              <BandAvatar skinUrl={playerSkinUrl} size={64} />
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Challenger</p>
            <p className="text-2xl sm:text-3xl font-black text-white leading-tight">{playerName}</p>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-4xl sm:text-5xl">⚔️</span>
          <span className="text-lg font-black text-rose-400 mt-1">VS</span>
        </div>
        <div className="flex flex-col items-start gap-2">
          {rivalSkinUrl && (
            <div className="self-start" style={{ transform: 'scaleX(-1)' }}>
              <BandAvatar skinUrl={rivalSkinUrl} size={64} />
            </div>
          )}
          <div className="text-left">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Rival</p>
            <p className="text-2xl sm:text-3xl font-black text-white leading-tight">{rivalName}</p>
          </div>
        </div>
      </div>
      <div className="mt-6 inline-block bg-gray-900 border border-rose-500/40 rounded-xl px-6 py-3">
        <p className="text-xs text-rose-400 uppercase tracking-widest mb-1">Battle Theme</p>
        <p className="text-xl sm:text-2xl font-black text-rose-300">{theme}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score bar
// ---------------------------------------------------------------------------

function ScoreBar({ playerWins, rivalWins, totalRounds, playerPoints, rivalPoints, playerName, rivalName }: {
  playerWins: number; rivalWins: number; totalRounds: number;
  playerPoints: number; rivalPoints: number; playerName: string; rivalName: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 text-center bg-gray-900 rounded-xl p-4 border border-gray-700">
      <div>
        <p className="text-xs text-gray-400 truncate">{playerName}</p>
        <p className="text-2xl font-black text-white">{playerWins}</p>
        <p className="text-xs text-gray-500">rounds</p>
        <p className="text-sm text-rose-400 font-bold mt-1">{playerPoints} pts</p>
      </div>
      <div className="flex flex-col items-center justify-center">
        <p className="text-xs text-gray-500 mb-1">of {totalRounds} rounds</p>
        <p className="text-lg font-black text-gray-400">VS</p>
      </div>
      <div>
        <p className="text-xs text-gray-400 truncate">{rivalName}</p>
        <p className="text-2xl font-black text-white">{rivalWins}</p>
        <p className="text-xs text-gray-500">rounds</p>
        <p className="text-sm text-amber-400 font-bold mt-1">{rivalPoints} pts</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round card
// ---------------------------------------------------------------------------

function RoundCard({ round, roundNum, playerName, rivalName }: {
  round: RoundResult; roundNum: number; playerName: string; rivalName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const winnerColor = round.roundWinner === 'player'
    ? 'text-rose-400' : round.roundWinner === 'rival'
    ? 'text-amber-400' : 'text-gray-400';
  const winnerLabel = round.roundWinner === 'player'
    ? `${playerName} wins` : round.roundWinner === 'rival'
    ? `${rivalName} wins` : 'Draw';

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 text-left hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400 uppercase">Round {roundNum}</span>
            <span className={`text-sm font-black ${winnerColor}`}>{winnerLabel}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-rose-400">{round.playerScore}</span>
            <span className="text-xs text-gray-500">vs</span>
            <span className="text-sm font-bold text-amber-400">{round.rivalScore}</span>
            <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        <div className="flex gap-4 mt-1 text-xs text-gray-500 truncate">
          <span>🎵 {playerName}: "{round.playerSongTitle}"</span>
          <span className="hidden sm:inline">🎵 {rivalName}: "{round.rivalSongTitle}"</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          <blockquote className="border-l-4 border-rose-500/60 pl-4 text-sm text-gray-300 italic">
            {round.commentary}
          </blockquote>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-1">
                {playerName} · Killer Line
              </p>
              <p className="text-sm text-gray-200 italic">"{round.playerHighlight}"</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                {rivalName} · Killer Line
              </p>
              <p className="text-sm text-gray-200 italic">"{round.rivalHighlight}"</p>
            </div>
          </div>

          {round.breakdown.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-400 py-1 pr-2">Rule</th>
                    <th className="text-center text-rose-400 py-1 px-2 w-12">{playerName.split(' ')[0]}</th>
                    <th className="text-center text-amber-400 py-1 px-2 w-12">{rivalName.split(' ')[0]}</th>
                    <th className="text-left text-gray-500 py-1 pl-2 hidden sm:table-cell">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {round.breakdown.map((b, i) => {
                    const pWins = b.playerScore > b.rivalScore;
                    const rWins = b.rivalScore > b.playerScore;
                    return (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="text-gray-300 py-1 pr-2">{b.ruleName}</td>
                        <td className={`text-center py-1 px-2 font-bold ${pWins ? 'text-rose-300' : 'text-gray-500'}`}>
                          {b.playerScore}
                        </td>
                        <td className={`text-center py-1 px-2 font-bold ${rWins ? 'text-amber-300' : 'text-gray-500'}`}>
                          {b.rivalScore}
                        </td>
                        <td className="text-gray-500 py-1 pl-2 hidden sm:table-cell">{b.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-1">
                "{round.playerSongTitle}"
              </p>
              <pre className="text-xs text-gray-500 whitespace-pre-wrap font-sans leading-relaxed max-h-32 overflow-y-auto">
                {round.playerLyricsExcerpt}
              </pre>
            </div>
            <div>
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
                "{round.rivalSongTitle}"
              </p>
              <pre className="text-xs text-gray-500 whitespace-pre-wrap font-sans leading-relaxed max-h-32 overflow-y-auto">
                {round.rivalLyricsExcerpt}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typewriter hook — types text one character at a time
// ---------------------------------------------------------------------------

const CHAR_SPEED = 15; // ms per character (~67 chars/sec, medium-high)

function useTypewriter(text: string, active: boolean): { output: string; done: boolean } {
  const [output, setOutput] = useState(() => (active ? '' : text));

  useEffect(() => {
    if (!active) { setOutput(text); return; }
    setOutput('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOutput(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, CHAR_SPEED);
    return () => clearInterval(id);
  }, [text, active]);

  return { output, done: output.length >= text.length };
}

// ---------------------------------------------------------------------------
// RevealPanel — animated round-result reveal with optional skip
// ---------------------------------------------------------------------------

type RevealPhase = 'matchup' | 'commentary' | 'breakdown' | 'done';

function getExcerptLines(text: string, max: number): string[] {
  const LEADING_TAG  = /^\[.*?\]\s*/;
  const PAREN_MULTI  = /\(\s*[x×]\s*\d+\s*\)|\(\s*\d+\s*[x×]\s*\)/gi;
  const PAREN_REPEAT = /\(\s*repeat(?:s)?\s*\)/gi;
  return text
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.replace(LEADING_TAG, '').replace(PAREN_MULTI, '').replace(PAREN_REPEAT, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function RevealPanel({ round, roundNum, playerName, rivalName, onContinue }: {
  round: RoundResult;
  roundNum: number;
  playerName: string;
  rivalName: string;
  onContinue: () => void;
}) {
  const [phase, setPhase]           = useState<RevealPhase>('matchup');
  const [skipped, setSkipped]       = useState(false);
  const [linesShown, setLinesShown] = useState(0);
  const [rulesShown, setRulesShown] = useState(0);

  // Build interleaved lyric lines (max 2 per side → max 4 total)
  const pLines = getExcerptLines(round.playerLyricsExcerpt, 2);
  const rLines = getExcerptLines(round.rivalLyricsExcerpt, 2);
  const maxPairs = Math.min(pLines.length, rLines.length);
  const interleaved: { side: 'player' | 'rival'; text: string }[] = [];
  for (let i = 0; i < maxPairs; i++) {
    if (pLines[i]) interleaved.push({ side: 'player', text: pLines[i]! });
    if (rLines[i]) interleaved.push({ side: 'rival',  text: rLines[i]! });
  }
  const totalLines = interleaved.length;

  function doSkip() {
    setSkipped(true);
    setLinesShown(totalLines);
    setRulesShown(round.breakdown.length);
    setPhase('done');
  }

  // matchup phase: advance lyric lines every 240ms, then→commentary
  useEffect(() => {
    if (phase !== 'matchup' || skipped) return;
    if (linesShown < totalLines) {
      const id = setTimeout(() => setLinesShown((n) => n + 1), 240);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setPhase('commentary'), 480);
    return () => clearTimeout(id);
  }, [phase, linesShown, totalLines, skipped]);

  // commentary typewriter
  const { output: commentaryOut, done: commentaryDone } = useTypewriter(
    round.commentary,
    phase === 'commentary' && !skipped,
  );

  // commentary done → breakdown
  useEffect(() => {
    if (phase !== 'commentary' || !commentaryDone || skipped) return;
    const id = setTimeout(() => setPhase('breakdown'), 380);
    return () => clearTimeout(id);
  }, [phase, commentaryDone, skipped]);

  // breakdown: reveal rules one by one, 105ms apart
  useEffect(() => {
    if (phase !== 'breakdown' || skipped) return;
    if (rulesShown >= round.breakdown.length) { setPhase('done'); return; }
    const id = setTimeout(() => setRulesShown((n) => n + 1), 105);
    return () => clearTimeout(id);
  }, [phase, rulesShown, round.breakdown.length, skipped]);

  const winnerColor = round.roundWinner === 'player' ? 'text-rose-400'
    : round.roundWinner === 'rival' ? 'text-amber-400' : 'text-gray-400';
  const winnerLabel = round.roundWinner === 'player' ? `${playerName} wins round ${roundNum}!`
    : round.roundWinner === 'rival' ? `${rivalName} wins round ${roundNum}!` : 'Round drawn!';

  const showCommentary = phase !== 'matchup' || skipped;
  const showScores     = (phase === 'breakdown' || phase === 'done') || skipped;
  const showBreakdown  = phase === 'breakdown' || phase === 'done' || skipped;
  const isDone         = phase === 'done' || skipped;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-800/60 border-b border-gray-700">
        <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Round {roundNum}</span>
        {!isDone && (
          <button
            onClick={doSkip}
            className="text-xs text-gray-500 hover:text-white transition-colors px-2.5 py-1 rounded border border-gray-700 hover:border-gray-500"
          >
            Skip →
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">

        {/* Song matchup */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{playerName}</p>
            <p className="text-sm font-bold text-rose-300 leading-snug">"{round.playerSongTitle}"</p>
          </div>
          <div className="text-lg text-gray-600 pt-4">⚔️</div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{rivalName}</p>
            <p className="text-sm font-bold text-amber-300 leading-snug">"{round.rivalSongTitle}"</p>
          </div>
        </div>

        {/* Lyric battle: alternating lines from each side */}
        {totalLines > 0 && (
          <div className="space-y-2 border-t border-b border-gray-800 py-4 min-h-[4rem]">
            {interleaved.slice(0, skipped ? totalLines : linesShown).map((line, i) => (
              <p
                key={i}
                className={`text-xs italic leading-relaxed ${
                  line.side === 'player'
                    ? 'text-rose-300/80 pl-3 border-l-2 border-rose-800'
                    : 'text-amber-300/80 pr-3 border-r-2 border-amber-800 text-right'
                }`}
              >
                {line.text}
              </p>
            ))}
          </div>
        )}

        {/* Commentary — types in progressively */}
        {showCommentary && (
          <p className="text-sm text-gray-100 italic leading-relaxed min-h-[3em]">
            {skipped ? round.commentary : commentaryOut}
            {!skipped && phase === 'commentary' && !commentaryDone && (
              <span className="animate-pulse ml-0.5 not-italic text-rose-400">▋</span>
            )}
          </p>
        )}

        {/* Winner + scores */}
        {showScores && (
          <div className="space-y-2">
            <p className={`text-base font-black ${winnerColor}`}>{winnerLabel}</p>
            <div className="flex gap-8">
              <div>
                <p className="text-[10px] text-gray-500 uppercase">{playerName}</p>
                <p className="text-2xl font-black text-rose-400">
                  {round.playerScore} <span className="text-xs font-normal text-gray-500">pts</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase">{rivalName}</p>
                <p className="text-2xl font-black text-amber-400">
                  {round.rivalScore} <span className="text-xs font-normal text-gray-500">pts</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Rule breakdown — rules appear one by one */}
        {showBreakdown && round.breakdown.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-gray-800">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Rule Breakdown</p>
            {round.breakdown.slice(0, skipped ? round.breakdown.length : rulesShown).map((b, i) => {
              const pWins = b.playerScore > b.rivalScore;
              const rWins = b.rivalScore > b.playerScore;
              return (
                <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center text-xs">
                  <span className={`font-bold w-5 text-center ${pWins ? 'text-rose-300' : 'text-gray-600'}`}>
                    {b.playerScore}
                  </span>
                  <span className="text-gray-500 text-center truncate">{b.ruleName}</span>
                  <span className={`font-bold w-5 text-center ${rWins ? 'text-amber-300' : 'text-gray-600'}`}>
                    {b.rivalScore}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Continue button — appears when animation is complete or skipped */}
        {isDone && (
          <button
            onClick={onContinue}
            className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-colors"
          >
            Continue →
          </button>
        )}

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Face-off animation — Mortal Kombat style fight sequence from completed rounds
// ---------------------------------------------------------------------------

interface FightEvent {
  type: 'round-start' | 'hit' | 'clash' | 'round-end' | 'finale';
  attacker?: 'player' | 'rival';
  ruleName?: string;
  roundNum?: number;
  playerHp: number;
  rivalHp: number;
  caption: string;
}

const EVENT_DURATIONS: Record<string, number> = {
  'round-start': 1200,
  'hit': 1400,
  'clash': 1100,
  'round-end': 2800,
  'finale': 99999,
};

function buildFightEvents(
  rounds: RoundResult[],
  playerName: string,
  rivalName: string,
): FightEvent[] {
  const events: FightEvent[] = [];

  // Compute total raw damage to each side to derive a damage scale
  let rawDmgToPlayer = 0;
  let rawDmgToRival  = 0;
  for (const round of rounds) {
    for (const b of round.breakdown) {
      if (b.playerScore > b.rivalScore) rawDmgToRival  += b.playerScore - b.rivalScore;
      else if (b.rivalScore > b.playerScore) rawDmgToPlayer += b.rivalScore - b.playerScore;
    }
  }
  const maxRaw = Math.max(rawDmgToPlayer, rawDmgToRival, 1);
  const scale  = 80 / maxRaw; // loser ends around 20 HP

  let playerHp = 100;
  let rivalHp  = 100;

  for (let ri = 0; ri < rounds.length; ri++) {
    const round = rounds[ri];
    if (!round) continue;

    events.push({
      type: 'round-start',
      roundNum: ri + 1,
      playerHp,
      rivalHp,
      caption: `ROUND ${ri + 1} — ${playerName} vs ${rivalName}`,
    });

    for (let bi = 0; bi < round.breakdown.length; bi++) {
      const b = round.breakdown[bi];
      if (!b) continue;

      if (b.playerScore > b.rivalScore) {
        const dmg = Math.max(1, Math.round((b.playerScore - b.rivalScore) * scale));
        rivalHp = Math.max(rivalHp - dmg, 1);
        events.push({
          type: 'hit',
          attacker: 'player',
          ruleName: b.ruleName,
          playerHp,
          rivalHp,
          caption: b.note || `${playerName} lands "${b.ruleName}"!`,
        });
      } else if (b.rivalScore > b.playerScore) {
        const dmg = Math.max(1, Math.round((b.rivalScore - b.playerScore) * scale));
        playerHp = Math.max(playerHp - dmg, 1);
        events.push({
          type: 'hit',
          attacker: 'rival',
          ruleName: b.ruleName,
          playerHp,
          rivalHp,
          caption: b.note || `${rivalName} counters with "${b.ruleName}"!`,
        });
      } else {
        playerHp = Math.max(playerHp - 1, 1);
        rivalHp  = Math.max(rivalHp  - 1, 1);
        events.push({
          type: 'clash',
          ruleName: b.ruleName,
          playerHp,
          rivalHp,
          caption: b.note || `"${b.ruleName}" — CLASH!`,
        });
      }
    }

    events.push({
      type: 'round-end',
      roundNum: ri + 1,
      playerHp,
      rivalHp,
      caption: round.commentary,
    });
  }

  const pWins = rounds.filter((r) => r.roundWinner === 'player').length;
  const rWins = rounds.filter((r) => r.roundWinner === 'rival').length;
  const finaleCaption = pWins > rWins
    ? `${playerName.toUpperCase()} WINS THE DUEL!`
    : rWins > pWins
    ? `${rivalName.toUpperCase()} WINS THE DUEL!`
    : 'THE DUEL IS A DRAW!';

  events.push({ type: 'finale', playerHp, rivalHp, caption: finaleCaption });

  return events;
}

// ---------------------------------------------------------------------------
// CharacterCanvas — canvas-rendered puppet with body parts + face + animation
// ---------------------------------------------------------------------------

type FightAction = 'idle' | 'lunge' | 'shake' | 'clash' | 'victory' | 'defeat';

const CANVAS_W = 128;
const CANVAS_H = 165;

function CharacterCanvas({
  faceUrl, torsoUrl, armUrl, legUrl, action, mirrored,
}: {
  faceUrl:  string | null;
  torsoUrl: string | null;
  armUrl:   string | null;
  legUrl:   string | null;
  action:   FightAction;
  mirrored: boolean;
}) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const imgs         = useRef<{ face: HTMLImageElement | null; torso: HTMLImageElement | null; arm: HTMLImageElement | null; leg: HTMLImageElement | null }>({ face: null, torso: null, arm: null, leg: null });
  const frameRef     = useRef(0);
  const actionRef    = useRef<FightAction>(action);
  const actionMs     = useRef(performance.now());
  const mirroredRef  = useRef(mirrored);
  const rafRef       = useRef(0);

  useEffect(() => { mirroredRef.current = mirrored; }, [mirrored]);

  useEffect(() => {
    actionRef.current = action;
    actionMs.current  = performance.now();
  }, [action]);

  // Load sprite images whenever URLs change
  useEffect(() => {
    let live = true;
    function loadImg(src: string | null): Promise<HTMLImageElement | null> {
      if (!src) return Promise.resolve(null);
      return new Promise((res) => {
        const img = new Image();
        img.onload  = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
      });
    }
    void Promise.all([loadImg(faceUrl), loadImg(torsoUrl), loadImg(armUrl), loadImg(legUrl)])
      .then(([face, torso, arm, leg]) => {
        if (live) imgs.current = { face, torso, arm, leg };
      });
    return () => { live = false; };
  }, [faceUrl, torsoUrl, armUrl, legUrl]);

  // Draw loop — runs once, reads everything from refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function part(
      img: HTMLImageElement | null, fill: string,
      tx: number, ty: number, w: number, h: number, rot: number,
    ) {
      ctx!.save();
      ctx!.translate(tx, ty);
      if (rot) ctx!.rotate(rot);
      if (img) { ctx!.drawImage(img, -w / 2, 0, w, h); }
      else      { ctx!.fillStyle = fill; ctx!.fillRect(-w / 2, 0, w, h); }
      ctx!.restore();
    }

    function draw() {
      const W = CANVAS_W, H = CANVAS_H;
      ctx!.clearRect(0, 0, W, H);
      ctx!.save();
      ctx!.imageSmoothingEnabled = false;

      const isM    = mirroredRef.current;
      const f      = frameRef.current;
      const act    = actionRef.current;
      const elapsed = performance.now() - actionMs.current;

      if (isM) { ctx!.translate(W, 0); ctx!.scale(-1, 1); }

      // Reference point = feet
      const feetX = W / 2;
      const feetY = H - 12;

      // Sprite sizes (≈2× the Vinyl Runner game scale)
      const TW = 40, TH = 52;  // torso
      const AW = 16, AH = 26;  // arm
      const LW = 12, LH = 30;  // leg
      const FW = 48, FH = 48;  // face
      const LO = 9;             // leg lateral offset from centre

      // Y offsets (relative to feet = 0, negative = up)
      const legY   = -LH;
      const torsoY = legY - TH + 12;   // legs tuck 12px into torso base
      const armY   = torsoY + 8;
      const faceY  = torsoY - FH + 10; // face overlaps 10px of torso top

      // Idle pendulum
      const sp       = 0.10;
      const legSwing = Math.sin(f * sp) * 0.35;
      const armSwing = Math.sin(f * sp + Math.PI) * 0.28;

      // Action modifiers
      let dx = 0, dy = 0, lean = 0, punch = 0;
      if (act === 'lunge') {
        const t     = Math.min(elapsed / 1400, 1);
        const curve = Math.sin(t * Math.PI);   // 0→peak→0
        dx    = curve * 26;
        lean  = curve * 0.22;
        punch = curve * 0.75;
      } else if (act === 'shake') {
        const t = Math.min(elapsed / 900, 1);
        dx = Math.sin(t * Math.PI * 9) * 10 * (1 - t);
      } else if (act === 'clash') {
        const t = Math.min(elapsed / 1100, 1);
        dy = -Math.sin(t * Math.PI) * 20;
      } else if (act === 'victory') {
        dy = Math.sin(f * 0.18) * 5;
      } else if (act === 'defeat') {
        lean = 0.3;
        dy   = 10;
      }

      ctx!.translate(feetX + dx, feetY + dy);
      if (lean) ctx!.rotate(lean);

      // Left leg
      part(imgs.current.leg,   '#1e3a8a', -LO, legY,   LW, LH,  legSwing + (act === 'lunge' ? 0.18 : 0));
      // Right leg
      part(imgs.current.leg,   '#1e3a8a',  LO, legY,   LW, LH, -legSwing - (act === 'lunge' ? 0.18 : 0));
      // Torso
      part(imgs.current.torso, '#27272a',   0, torsoY, TW, TH,  0);
      // Left arm
      part(imgs.current.arm,   '#3f3f46', -TW / 2, armY, AW, AH,  armSwing + punch);
      // Right arm (extends during lunge punch)
      part(imgs.current.arm,   '#3f3f46',  TW / 2, armY, AW, AH, -(armSwing + punch));
      // Face (always on top)
      part(imgs.current.face,  '#374151',   0, faceY,  FW, FH,  0);

      ctx!.restore();
      frameRef.current += 1;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // intentional: loop runs once, reads state via refs

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  );
}

// ---------------------------------------------------------------------------
// FaceOffArena — full-screen animated duel overlay
// ---------------------------------------------------------------------------

function FaceOffArena({
  rounds, playerName, rivalName, playerSkinUrl, rivalSkinUrl, bodySkin, onClose,
}: {
  rounds: RoundResult[];
  playerName: string;
  rivalName: string;
  playerSkinUrl: string | null;
  rivalSkinUrl: string | null;
  bodySkin: BodySkin | null;
  onClose: () => void;
}) {
  const events = useMemo(
    () => buildFightEvents(rounds, playerName, rivalName),
    [rounds, playerName, rivalName],
  );

  const [eventIndex, setEventIndex] = useState(0);
  const [done, setDone] = useState(false);

  const current = events[eventIndex];

  useEffect(() => {
    if (done || !current || current.type === 'finale') { setDone(true); return; }
    const duration = EVENT_DURATIONS[current.type] ?? 1400;
    const id = setTimeout(() => {
      setEventIndex((i) => {
        const next = i + 1;
        if (next >= events.length) { setDone(true); return i; }
        return next;
      });
    }, duration);
    return () => clearTimeout(id);
  }, [eventIndex, done, current, events.length]);

  function doSkip() {
    setEventIndex(events.length - 1);
    setDone(true);
  }

  if (!current) return null;

  const playerAnimating = !done && current.type === 'hit' && current.attacker === 'player';
  const rivalAnimating  = !done && current.type === 'hit' && current.attacker === 'rival';
  const isClash         = !done && current.type === 'clash';

  // Derive per-character action for the canvas puppets
  const pWins = rounds.filter((r) => r.roundWinner === 'player').length;
  const rWins = rounds.filter((r) => r.roundWinner === 'rival').length;

  const playerAction: FightAction = done
    ? (pWins >= rWins ? 'victory' : 'defeat')
    : playerAnimating ? 'lunge'
    : rivalAnimating  ? 'shake'
    : isClash         ? 'clash'
    : 'idle';

  const rivalAction: FightAction = done
    ? (rWins > pWins ? 'victory' : 'defeat')
    : rivalAnimating  ? 'lunge'
    : playerAnimating ? 'shake'
    : isClash         ? 'clash'
    : 'idle';

  function hpColor(hp: number): string {
    if (hp > 60) return 'bg-green-500';
    if (hp > 30) return 'bg-amber-500';
    return 'bg-rose-500';
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">

        <p className="text-center text-xs font-black text-gray-500 uppercase tracking-widest">
          ⚔️ Face-Off
        </p>

        {/* HP bars */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-rose-300 w-24 truncate shrink-0">{playerName}</span>
            <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${hpColor(current.playerHp)}`}
                style={{ width: `${current.playerHp}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 w-6 text-right shrink-0">{current.playerHp}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-amber-300 w-24 truncate shrink-0">{rivalName}</span>
            <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden flex justify-end">
              <div
                className={`h-full rounded-full transition-all duration-700 ${hpColor(current.rivalHp)}`}
                style={{ width: `${current.rivalHp}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 w-6 text-right shrink-0">{current.rivalHp}</span>
          </div>
        </div>

        {/* Arena — relative container so characters can be absolutely positioned */}
        <div className="relative" style={{ height: CANVAS_H + 24 }}>

          {/* Player (left) — faces RIGHT by default */}
          <div className="absolute flex flex-col items-center" style={{ left: 0, bottom: 0 }}>
            <CharacterCanvas
              faceUrl={playerSkinUrl}
              torsoUrl={bodySkin?.torsoUrl ?? null}
              armUrl={bodySkin?.armUrl ?? null}
              legUrl={bodySkin?.legUrl ?? null}
              action={playerAction}
              mirrored={false}
            />
            <p className="text-[10px] text-rose-300 text-center truncate mt-1" style={{ maxWidth: CANVAS_W }}>
              {playerName}
            </p>
          </div>

          {/* Centre event flash */}
          <div
            className="absolute flex flex-col items-center justify-center"
            style={{ left: '50%', top: '40%', transform: 'translate(-50%, -50%)' }}
          >
            {current.type === 'round-start' && (
              <p className="text-base font-black text-white leading-none">RND {current.roundNum}</p>
            )}
            {current.type === 'hit'       && <p className="text-4xl leading-none">💥</p>}
            {current.type === 'clash'     && <p className="text-4xl leading-none">⚡</p>}
            {current.type === 'round-end' && <p className="text-2xl text-gray-600 leading-none">—</p>}
            {current.type === 'finale'    && <p className="text-4xl leading-none">🏆</p>}
          </div>

          {/* Rival (right) — mirrored in canvas so faces LEFT toward player */}
          <div className="absolute flex flex-col items-center" style={{ right: 0, bottom: 0 }}>
            <CharacterCanvas
              faceUrl={rivalSkinUrl}
              torsoUrl={bodySkin?.torsoUrl ?? null}
              armUrl={bodySkin?.armUrl ?? null}
              legUrl={bodySkin?.legUrl ?? null}
              action={rivalAction}
              mirrored={true}
            />
            <p className="text-[10px] text-amber-300 text-center truncate mt-1" style={{ maxWidth: CANVAS_W }}>
              {rivalName}
            </p>
          </div>

        </div>

        {/* Caption box */}
        <div className="min-h-[4rem] bg-gray-900/80 rounded-xl border border-gray-700 p-4 text-center space-y-1">
          {current.ruleName && (
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">{current.ruleName}</p>
          )}
          <p className="text-sm text-gray-100 italic leading-relaxed">{current.caption}</p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1 flex-wrap">
          {events.slice(0, 24).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i <= eventIndex ? 'bg-rose-500' : 'bg-gray-700'
              }`}
            />
          ))}
          {events.length > 24 && (
            <span className="text-[10px] text-gray-600 self-center ml-1">+{events.length - 24}</span>
          )}
        </div>

        {/* Skip / close */}
        <button
          onClick={done ? onClose : doSkip}
          className={`w-full py-3 rounded-xl font-bold transition-colors ${
            done
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'border border-gray-700 text-gray-500 hover:text-white hover:border-gray-500'
          }`}
        >
          {done ? '✕ Close' : 'Skip →'}
        </button>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

function Leaderboard({ difficulty }: { difficulty: string }) {
  const { data: scores = [], isLoading } = useQuery<DuelScore[]>({
    queryKey: ['lyric-duel-scores', difficulty],
    queryFn: () => lyricDuelApi.getScores(difficulty, 10),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="text-xs text-gray-500 text-center py-4">Loading leaderboard…</div>;
  if (scores.length === 0) return <div className="text-xs text-gray-500 text-center py-4">No scores yet — be the first to win!</div>;

  return (
    <div className="space-y-2">
      {scores.map((s) => (
        <div key={s.rank} className="flex items-center gap-3 bg-gray-900 rounded-lg px-3 py-2 border border-gray-700">
          <span className="text-xs font-bold text-gray-500 w-5 text-right">#{s.rank}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{s.playerDisplayName}</p>
            <p className="text-[10px] text-gray-500 truncate">
              {s.playerName} def. {s.rivalName} · {s.playerWins}-{s.rivalWins}
            </p>
            <p className="text-[10px] text-rose-400 truncate italic">"{s.theme}"</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-black text-rose-300">{s.playerPoints}</p>
            <p className="text-[10px] text-gray-500">pts</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LyricDuelPage() {
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<GameMode>('challenge');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [playerBandId, setPlayerBandId] = useState<string | null>(null);
  const [rivalBandId, setRivalBandId] = useState<string | null>(null);
  const [selectedAlbumTypes, setSelectedAlbumTypes] = useState<string[]>([...ALL_ALBUM_TYPE_VALUES]);

  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [rounds, setRounds] = useState<RoundResult[]>([]);
  const [pendingRound, setPendingRound] = useState<RoundResult | null>(null);
  const [currentRoundLoading, setCurrentRoundLoading] = useState(false);
  const usedPlayerSongIds = useRef<string[]>([]);
  const usedRivalSongIds  = useRef<string[]>([]);

  const [startLoading, setStartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRank, setSavedRank] = useState<number | null>(null);

  // Character skin avatars fetched after match starts
  const [playerSkinUrl, setPlayerSkinUrl] = useState<string | null>(null);
  const [rivalSkinUrl, setRivalSkinUrl]   = useState<string | null>(null);

  const [faceOffOpen, setFaceOffOpen]       = useState(false);
  const [defaultBodySkin, setDefaultBodySkin] = useState<BodySkin | null>(null);

  const playerWins   = rounds.filter((r) => r.roundWinner === 'player').length;
  const rivalWins    = rounds.filter((r) => r.roundWinner === 'rival').length;
  const playerPoints = rounds.reduce((s, r) => s + r.playerScore, 0);
  const rivalPoints  = rounds.reduce((s, r) => s + r.rivalScore, 0);
  const matchWon     = match ? playerWins > rivalWins : false;

  const { data: bands = [], isLoading: bandsLoading } = useQuery<DuelBand[]>({
    queryKey: ['lyric-duel-bands'],
    queryFn: () => lyricDuelApi.getBands(),
    staleTime: 60_000,
  });

  // Effective album types to send: empty = no filter (all included)
  const effectiveAlbumTypes = selectedAlbumTypes.length === ALL_ALBUM_TYPE_VALUES.length
    ? []
    : selectedAlbumTypes;

  async function handleStart() {
    if (mode !== 'ai-showdown' && !playerBandId) { setError('Pick your band first.'); return; }
    if (mode === 'custom' && !rivalBandId) { setError('Pick a rival band too.'); return; }
    setError(null);
    setStartLoading(true);
    try {
      const setup = await lyricDuelApi.startMatch({
        playerBandId: playerBandId ?? '',
        ...(rivalBandId && mode === 'custom' ? { rivalBandId } : {}),
        mode,
        difficulty,
      });
      setMatch(setup);
      setRounds([]);
      usedPlayerSongIds.current = [];
      usedRivalSongIds.current  = [];
      setSavedRank(null);
      setPhase('pregame');

      // Fetch Vinyl Runner face avatars + default body skin (non-critical, purely cosmetic)
      setPlayerSkinUrl(null);
      setRivalSkinUrl(null);
      platformerApi.getSkins({ bandIds: [setup.playerBandId, setup.rivalBandId] })
        .then((skins) => {
          const pSkin = skins.find((s) => s.bandId === setup.playerBandId);
          const rSkin = skins.find((s) => s.bandId === setup.rivalBandId);
          setPlayerSkinUrl(pSkin?.dataUrl ?? null);
          setRivalSkinUrl(rSkin?.dataUrl ?? null);
        })
        .catch(() => { /* avatars are purely cosmetic */ });
      platformerApi.getBodySkins()
        .then((skins) => {
          setDefaultBodySkin(skins.find((s) => s.isDefault) ?? skins[0] ?? null);
        })
        .catch(() => { /* body skin is purely cosmetic */ });
    } catch {
      setError('Could not start the match. Make sure your selected bands have lyrics in the database.');
    } finally {
      setStartLoading(false);
    }
  }

  async function handlePlayRound() {
    if (!match) return;
    setCurrentRoundLoading(true);
    setError(null);
    try {
      const result = await lyricDuelApi.playRound({
        playerBandId: match.playerBandId,
        rivalBandId: match.rivalBandId,
        theme: match.theme,
        themeDescription: match.themeDescription,
        rules: match.rules,
        difficulty: match.difficulty,
        roundIndex: rounds.length,
        usedPlayerSongIds: usedPlayerSongIds.current,
        usedRivalSongIds:  usedRivalSongIds.current,
        playerBandName: match.playerBandName,
        rivalBandName:  match.rivalBandName,
        ...(effectiveAlbumTypes.length > 0 ? { albumTypes: effectiveAlbumTypes } : {}),
      });
      usedPlayerSongIds.current = [...usedPlayerSongIds.current, result.playerSongId];
      usedRivalSongIds.current  = [...usedRivalSongIds.current,  result.rivalSongId];
      setPendingRound(result); // trigger animated reveal
    } catch {
      setError('The judge stepped out. Try again.');
    } finally {
      setCurrentRoundLoading(false);
    }
  }

  async function handleRevealDone() {
    if (!match || !pendingRound) return;
    const newRounds = [...rounds, pendingRound];
    setRounds(newRounds);
    setPendingRound(null);

    if (newRounds.length >= match.totalRounds) {
      setPhase('gameover');
      if (user && match.mode !== 'ai-showdown') {
        const pW = newRounds.filter((r) => r.roundWinner === 'player').length;
        const rW = newRounds.filter((r) => r.roundWinner === 'rival').length;
        const pP = newRounds.reduce((s, r) => s + r.playerScore, 0);
        const rP = newRounds.reduce((s, r) => s + r.rivalScore, 0);
        try {
          const saved = await lyricDuelApi.saveScore({
            playerBandId: match.playerBandId,
            rivalBandId:  match.rivalBandId,
            playerName:   match.playerBandName,
            rivalName:    match.rivalBandName,
            playerPoints: pP,
            rivalPoints:  rP,
            playerWins:   pW,
            rivalWins:    rW,
            totalRounds:  match.totalRounds,
            difficulty:   match.difficulty,
            mode:         match.mode,
            theme:        match.theme,
            won:          pW > rW,
          });
          if (pW > rW) setSavedRank(saved.rank);
        } catch { /* non-critical */ }
      }
    }
  }

  function handleReset() {
    setPhase('setup');
    setMatch(null);
    setRounds([]);
    setPendingRound(null);
    setError(null);
    setSavedRank(null);
    setPlayerSkinUrl(null);
    setRivalSkinUrl(null);
    setFaceOffOpen(false);
    usedPlayerSongIds.current = [];
    usedRivalSongIds.current  = [];
  }

  const isLastRound    = match ? rounds.length === match.totalRounds - 1 : false;
  const currentRoundNum = rounds.length + 1;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* ── SETUP ── */}
        {phase === 'setup' && (
          <div className="space-y-8">
            <div className="text-center">
              <p className="text-4xl mb-2">⚔️</p>
              <h1 className="text-3xl sm:text-4xl font-black text-white">Lyric Duel</h1>
              <p className="text-gray-400 mt-2">Celebrity Deathmatch · AI Judge · 10 Rules per Match</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Game Mode</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {MODES.map((m) => (
                  <button key={m.id} onClick={() => setMode(m.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      mode === m.id
                        ? 'border-rose-500 bg-rose-950/40'
                        : 'border-gray-700 bg-gray-900 hover:border-gray-500'
                    }`}>
                    <span className="text-2xl">{m.icon}</span>
                    <p className="text-sm font-bold text-white mt-2">{m.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Difficulty</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {DIFFICULTIES.map((d) => (
                  <button key={d.id} onClick={() => setDifficulty(d.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      difficulty === d.id
                        ? `${d.color} border-opacity-100`
                        : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500'
                    }`}>
                    <p className="text-sm font-bold">{d.label}</p>
                    <p className="text-xs mt-0.5 opacity-80">{d.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Album type filter */}
            <AlbumTypeFilter selected={selectedAlbumTypes} onChange={setSelectedAlbumTypes} />

            {bandsLoading ? (
              <div className="text-sm text-gray-500 text-center py-4">Loading bands…</div>
            ) : (
              <div className="space-y-4">
                {mode !== 'ai-showdown' && (
                  <BandGrid bands={bands} selectedId={playerBandId} onSelect={setPlayerBandId} label="Your Band" />
                )}
                {mode === 'custom' && (
                  <BandGrid
                    bands={bands.filter((b) => b.id !== playerBandId)}
                    selectedId={rivalBandId}
                    onSelect={setRivalBandId}
                    label="Rival Band"
                  />
                )}
                {mode === 'challenge' && (
                  <p className="text-xs text-gray-500 italic text-center">The AI will pick your rival once the match starts.</p>
                )}
                {mode === 'ai-showdown' && (
                  <p className="text-xs text-gray-500 italic text-center">The AI will pick both bands — sit back and watch the duel unfold.</p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-rose-400 text-center">{error}</p>}

            <button
              onClick={handleStart}
              disabled={startLoading || (mode !== 'ai-showdown' && !playerBandId) || (mode === 'custom' && !rivalBandId)}
              className="w-full py-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-black text-lg rounded-xl transition-colors"
            >
              {startLoading ? '⏳ Setting the stage…' : 'ENTER THE ARENA'}
            </button>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Leaderboard · {difficulty}</p>
              <Leaderboard difficulty={difficulty} />
            </div>

            <div className="text-center">
              <Link to="/games" className="text-xs text-gray-500 hover:text-gray-300">← Back to Games</Link>
            </div>
          </div>
        )}

        {/* ── PREGAME ── */}
        {phase === 'pregame' && match && (
          <div className="space-y-6">
            <VSBanner
              playerName={match.playerBandName}
              rivalName={match.rivalBandName}
              theme={match.theme}
              playerSkinUrl={playerSkinUrl}
              rivalSkinUrl={rivalSkinUrl}
            />

            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Theme</p>
              <p className="text-gray-300 text-sm">{match.themeDescription}</p>
            </div>

            {match.rivalPickReason && (
              <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4">
                <p className="text-xs text-rose-400 uppercase tracking-wider mb-1">The Rival Steps Forward</p>
                <p className="text-sm text-rose-200 italic">"{match.rivalPickReason}"</p>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">🎤 Announcer</p>
              <p className="text-base text-white italic leading-relaxed">"{match.introSpeech}"</p>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">
                The 10 Rules · {match.difficulty.toUpperCase()} · {match.totalRounds} Rounds
              </p>
              <p className="text-[11px] text-gray-500 mb-3">
                Tap <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-600 text-[10px]">i</span> next to any rule to read the full explanation.
              </p>
              <ol className="space-y-3">
                {match.rules.map((r: DuelRule, i: number) => (
                  <RuleItem key={r.id} rule={r} idx={i} />
                ))}
              </ol>
            </div>

            <button
              onClick={() => setPhase('battling')}
              className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-black text-lg rounded-xl transition-colors"
            >
              ⚔️ FIGHT!
            </button>
          </div>
        )}

        {/* ── BATTLING ── */}
        {phase === 'battling' && match && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <BandAvatar skinUrl={playerSkinUrl} size={40} />
                <p className="text-sm font-bold text-white leading-snug">{match.playerBandName}</p>
              </div>
              <div className="shrink-0 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Theme</p>
                <p className="text-xs font-black text-rose-300">"{match.theme}"</p>
              </div>
              <div className="flex items-center gap-3 min-w-0">
                <p className="text-sm font-bold text-white text-right leading-snug">{match.rivalBandName}</p>
                <div style={{ transform: 'scaleX(-1)' }}>
                  <BandAvatar skinUrl={rivalSkinUrl} size={40} />
                </div>
              </div>
            </div>

            <ScoreBar
              playerWins={playerWins} rivalWins={rivalWins} totalRounds={match.totalRounds}
              playerPoints={playerPoints} rivalPoints={rivalPoints}
              playerName={match.playerBandName} rivalName={match.rivalBandName}
            />

            {rounds.length > 0 && (
              <div className="space-y-3">
                {rounds.map((r, i) => (
                  <RoundCard
                    key={i} round={r} roundNum={i + 1}
                    playerName={match.playerBandName} rivalName={match.rivalBandName}
                  />
                ))}
              </div>
            )}

            {error && <p className="text-sm text-rose-400 text-center">{error}</p>}

            {pendingRound ? (
              <RevealPanel
                round={pendingRound}
                roundNum={rounds.length + 1}
                playerName={match.playerBandName}
                rivalName={match.rivalBandName}
                onContinue={() => { void handleRevealDone(); }}
              />
            ) : (
              <button
                onClick={handlePlayRound}
                disabled={currentRoundLoading}
                className="w-full py-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-black text-lg rounded-xl transition-colors"
              >
                {currentRoundLoading
                  ? '⚖️ Judge reviewing lyrics…'
                  : isLastRound
                    ? '⚔️ FINAL ROUND — FIGHT!'
                    : `⚔️ ROUND ${currentRoundNum} — FIGHT!`
                }
              </button>
            )}
          </div>
        )}

        {/* ── GAMEOVER ── */}
        {phase === 'gameover' && match && (
          <div className="space-y-6">
            <div className={`text-center py-8 rounded-2xl border-2 ${
              matchWon
                ? 'border-rose-500/60 bg-rose-950/30'
                : playerWins === rivalWins
                  ? 'border-gray-600 bg-gray-900'
                  : 'border-amber-500/60 bg-amber-950/20'
            }`}>
              <div className="flex items-center justify-center gap-4 mb-4">
                <BandAvatar skinUrl={playerSkinUrl} size={48} />
                <p className="text-5xl">{matchWon ? '🏆' : playerWins === rivalWins ? '🤝' : '💀'}</p>
                <div style={{ transform: 'scaleX(-1)' }}>
                  <BandAvatar skinUrl={rivalSkinUrl} size={48} />
                </div>
              </div>
              <h2 className={`text-3xl font-black ${
                matchWon ? 'text-rose-300' : playerWins === rivalWins ? 'text-gray-300' : 'text-amber-400'
              }`}>
                {matchWon ? 'VICTORY!' : playerWins === rivalWins ? 'DRAW!' : 'DEFEATED!'}
              </h2>
              <p className="text-gray-400 mt-2 text-sm">
                {matchWon
                  ? `${match.playerBandName} wins ${playerWins}–${rivalWins}`
                  : playerWins === rivalWins
                    ? `${playerWins}–${rivalWins} — the crowd can't decide`
                    : `${match.rivalBandName} wins ${rivalWins}–${playerWins}`}
              </p>
              {savedRank && (
                <p className="text-xs text-rose-400 mt-2 font-semibold">
                  Score saved! You rank #{savedRank} on the {match.difficulty} leaderboard.
                </p>
              )}
              {!user && match.mode !== 'ai-showdown' && (
                <p className="text-xs text-gray-500 mt-2">Sign in to save your score to the leaderboard.</p>
              )}
            </div>

            <ScoreBar
              playerWins={playerWins} rivalWins={rivalWins} totalRounds={match.totalRounds}
              playerPoints={playerPoints} rivalPoints={rivalPoints}
              playerName={match.playerBandName} rivalName={match.rivalBandName}
            />

            <button
              onClick={() => setFaceOffOpen(true)}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-rose-500/50 text-white font-bold rounded-xl transition-colors"
            >
              ⚔️ Watch the Face-Off
            </button>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">All Rounds</p>
              {rounds.map((r, i) => (
                <RoundCard
                  key={i} round={r} roundNum={i + 1}
                  playerName={match.playerBandName} rivalName={match.rivalBandName}
                />
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Leaderboard · {match.difficulty}
              </p>
              <Leaderboard difficulty={match.difficulty} />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-colors"
              >
                ⚔️ New Duel
              </button>
              <Link to="/games"
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition-colors text-center"
              >
                ← Games
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Face-off overlay — fixed, covers everything */}
      {faceOffOpen && match && rounds.length > 0 && (
        <FaceOffArena
          rounds={rounds}
          playerName={match.playerBandName}
          rivalName={match.rivalBandName}
          playerSkinUrl={playerSkinUrl}
          rivalSkinUrl={rivalSkinUrl}
          bodySkin={defaultBodySkin}
          onClose={() => setFaceOffOpen(false)}
        />
      )}

    </div>
  );
}

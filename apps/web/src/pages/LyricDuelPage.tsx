import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { platformerApi } from '../api/platformer';
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
  const [currentRoundLoading, setCurrentRoundLoading] = useState(false);
  const usedPlayerSongIds = useRef<string[]>([]);
  const usedRivalSongIds  = useRef<string[]>([]);

  const [startLoading, setStartLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRank, setSavedRank] = useState<number | null>(null);

  // Character skin avatars fetched after match starts
  const [playerSkinUrl, setPlayerSkinUrl] = useState<string | null>(null);
  const [rivalSkinUrl, setRivalSkinUrl] = useState<string | null>(null);

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

      // Fetch Vinyl Runner face avatars for both bands (non-critical)
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
      const newRounds = [...rounds, result];
      setRounds(newRounds);

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
    } catch {
      setError('The judge stepped out. Try again.');
    } finally {
      setCurrentRoundLoading(false);
    }
  }

  function handleReset() {
    setPhase('setup');
    setMatch(null);
    setRounds([]);
    setError(null);
    setSavedRank(null);
    setPlayerSkinUrl(null);
    setRivalSkinUrl(null);
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
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <BandAvatar skinUrl={playerSkinUrl} size={40} />
                <p className="text-sm font-bold text-white truncate">{match.playerBandName}</p>
              </div>
              <div className="shrink-0 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">Theme</p>
                <p className="text-xs font-black text-rose-300">"{match.theme}"</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-white truncate text-right">{match.rivalBandName}</p>
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
    </div>
  );
}

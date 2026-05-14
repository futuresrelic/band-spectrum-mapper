import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { gameApi, type GameAlbum, type LeaderboardEntry } from '../api/game';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j]!;
    a[j] = tmp!;
  }
  return a;
}

function pickDistractors(correct: string, allBandNames: string[], count = 3): string[] {
  return shuffle(allBandNames.filter((n) => n !== correct)).slice(0, count);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GamePhase = 'idle' | 'playing' | 'gameover';

interface RoundState {
  album: GameAlbum;
  options: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_LIVES = 3;
const POINTS_CORRECT = 10;
const POINTS_STREAK = 5;
const BASE_COUNTDOWN = 5;
const MIN_COUNTDOWN = 2;

// ---------------------------------------------------------------------------
// Leaderboard panel
// ---------------------------------------------------------------------------

function LeaderboardPanel({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Leaderboard</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-center text-gray-600 text-sm py-6">No scores yet — be the first!</p>
      ) : (
        <div className="divide-y divide-gray-800">
          {entries.slice(0, 10).map((entry, i) => (
            <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
              <span className={`w-6 text-sm font-bold tabular-nums ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-600'}`}>
                {i + 1}
              </span>
              {entry.user.avatarUrl ? (
                <img src={entry.user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                  {(entry.user.name ?? '?')[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{entry.user.name ?? 'Unknown'}</p>
                <p className="text-xs text-gray-500">Level {entry.level}</p>
              </div>
              <span className="text-sm font-bold text-indigo-400 tabular-nums">{entry.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main game component
// ---------------------------------------------------------------------------

export default function PlayPage() {
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [roundIdx, setRoundIdx] = useState(0);
  const [rounds, setRounds] = useState<RoundState[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [answered, setAnswered] = useState(false);
  const [countdown, setCountdown] = useState(BASE_COUNTDOWN);
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const gameStartRef = useRef<number>(Date.now());
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: albums = [], isLoading } = useQuery({
    queryKey: ['game-albums'],
    queryFn: () => gameApi.getAlbums(),
  });

  const { data: leaderboard = [], refetch: refetchLeaderboard } = useQuery({
    queryKey: ['game-leaderboard'],
    queryFn: () => gameApi.getLeaderboard(),
  });

  const saveScoreMutation = useMutation({
    mutationFn: ({ s, l, d }: { s: number; l: number; d: number }) =>
      gameApi.saveScore(s, l, d),
    onSuccess: (data) => {
      setSavedRank(data.rank);
      void refetchLeaderboard();
    },
  });

  const countdownTime = Math.max(MIN_COUNTDOWN, BASE_COUNTDOWN - Math.floor(level / 3));

  function buildRounds(albumPool: GameAlbum[]): RoundState[] {
    const allBandNames = [...new Set(albumPool.map((a) => a.band.name))];
    if (allBandNames.length < 4) return [];
    return shuffle(albumPool).slice(0, 20).map((album) => ({
      album,
      options: shuffle([album.band.name, ...pickDistractors(album.band.name, allBandNames)]),
    }));
  }

  function startGame() {
    const newRounds = buildRounds(albums);
    if (newRounds.length === 0) return;
    setRounds(newRounds);
    setRoundIdx(0);
    setLives(MAX_LIVES);
    setScore(0);
    setLevel(1);
    setStreak(0);
    setAnswered(false);
    setFeedback(null);
    setSavedRank(null);
    gameStartRef.current = Date.now();
    setPhase('playing');
  }

  function startCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(countdownTime);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          handleTimeUp();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  const handleTimeUp = useCallback(() => {
    if (answered) return;
    setAnswered(true);
    setFeedback('wrong');
    setStreak(0);
    setLives((l) => {
      const next = l - 1;
      if (next <= 0) endGame(score);
      return Math.max(0, next);
    });
  }, [answered, score]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAnswer(option: string) {
    if (answered) return;
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setAnswered(true);

    const current = rounds[roundIdx];
    if (!current) return;

    const isCorrect = option === current.album.band.name;
    if (isCorrect) {
      setFeedback('correct');
      const streakBonus = streak >= 2 ? POINTS_STREAK : 0;
      const gained = POINTS_CORRECT + streakBonus;
      setScore((s) => s + gained);
      setStreak((st) => st + 1);
      setLevel((l) => Math.floor(roundIdx / 5) + 1 > l ? Math.floor(roundIdx / 5) + 1 : l);
    } else {
      setFeedback('wrong');
      setStreak(0);
      setLives((l) => {
        const next = l - 1;
        if (next <= 0) {
          setTimeout(() => endGame(score + (isCorrect ? POINTS_CORRECT : 0)), 800);
        }
        return Math.max(0, next);
      });
    }
  }

  function endGame(finalScore: number) {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setPhase('gameover');
    const duration = Math.floor((Date.now() - gameStartRef.current) / 1000);
    saveScoreMutation.mutate({ s: finalScore, l: level, d: Math.max(1, duration) });
  }

  function advanceRound() {
    setAnswered(false);
    setFeedback(null);
    const nextIdx = roundIdx + 1;
    if (nextIdx >= rounds.length) {
      // Rebuild more rounds
      const more = buildRounds(albums);
      setRounds(more);
      setRoundIdx(0);
    } else {
      setRoundIdx(nextIdx);
    }
  }

  // Start countdown when a new round begins
  useEffect(() => {
    if (phase === 'playing' && !answered) {
      startCountdown();
    }
    return () => {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    };
  }, [phase, roundIdx, answered]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentRound = rounds[roundIdx];

  // Feedback auto-advance
  useEffect(() => {
    if (feedback && lives > 0 && phase === 'playing') {
      const t = setTimeout(advanceRound, 900);
      return () => clearTimeout(t);
    }
  }, [feedback, lives, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* ── Game area ── */}
          <div className="flex-1 min-w-0">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Album Art Quiz</h1>
              <p className="text-sm text-gray-400 mt-1">
                Which band is this album from? Answer before the time runs out.
              </p>
            </div>

            {/* Idle */}
            {phase === 'idle' && (
              <div className="rounded-2xl bg-gray-900 border border-gray-800 p-10 text-center">
                <div className="text-5xl mb-4">🎵</div>
                <h2 className="text-xl font-semibold text-white mb-2">Ready to play?</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Identify albums from your library. Gain extra lives by leaving comments on songs.
                </p>
                {albums.length < 4 ? (
                  <p className="text-amber-400 text-sm">
                    Not enough albums with artwork in your library. Add artwork to at least 4 albums to play.
                  </p>
                ) : (
                  <button
                    onClick={startGame}
                    disabled={isLoading}
                    className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-lg transition-colors disabled:opacity-50"
                  >
                    {isLoading ? 'Loading…' : 'Start Game'}
                  </button>
                )}
              </div>
            )}

            {/* Playing */}
            {phase === 'playing' && currentRound && (
              <div className={`rounded-2xl border overflow-hidden transition-all duration-150 ${
                feedback === 'correct' ? 'border-green-500 shadow-green-900/50 shadow-xl' :
                feedback === 'wrong'   ? 'border-red-500 shadow-red-900/50 shadow-xl' :
                'border-gray-800'
              } bg-gray-900`}>
                {/* HUD */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900/80">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: MAX_LIVES }).map((_, i) => (
                      <span key={i} className={`text-xl ${i < lives ? 'text-red-400' : 'text-gray-700'}`}>♥</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-5 text-sm">
                    {streak >= 2 && (
                      <span className="text-amber-400 font-semibold">🔥 {streak}× streak</span>
                    )}
                    <span className="text-gray-400">Level <span className="text-white font-bold">{level}</span></span>
                    <span className="font-bold text-indigo-400">{score.toLocaleString()} pts</span>
                  </div>
                </div>

                {/* Countdown bar */}
                <div className="h-1.5 bg-gray-800">
                  <div
                    className={`h-full transition-all ${
                      countdown <= 2 ? 'bg-red-500' : countdown <= 3 ? 'bg-amber-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${(countdown / countdownTime) * 100}%`, transition: 'width 1s linear' }}
                  />
                </div>

                {/* Album art */}
                <div className="relative">
                  {currentRound.album.artworkUrl ? (
                    <img
                      src={currentRound.album.artworkUrl}
                      alt="Album art"
                      className="w-full aspect-square object-cover max-h-72"
                    />
                  ) : (
                    <div className="w-full aspect-square max-h-72 bg-gray-800 flex items-center justify-center text-gray-600 text-4xl">
                      🎵
                    </div>
                  )}
                  {/* Feedback overlay */}
                  {feedback && (
                    <div className={`absolute inset-0 flex items-center justify-center text-6xl font-bold transition-opacity ${
                      feedback === 'correct' ? 'text-green-400 bg-green-900/30' : 'text-red-400 bg-red-900/30'
                    }`}>
                      {feedback === 'correct' ? '✓' : '✗'}
                    </div>
                  )}
                  {/* Countdown number */}
                  {!answered && (
                    <div className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                      countdown <= 2 ? 'bg-red-600' : countdown <= 3 ? 'bg-amber-600' : 'bg-gray-800/80'
                    }`}>
                      {countdown}
                    </div>
                  )}
                  {feedback === 'correct' && (
                    <div className="absolute bottom-3 left-3 text-sm bg-gray-900/80 text-green-400 px-3 py-1 rounded-full font-semibold">
                      {currentRound.album.band.name}
                      {streak >= 2 && <span className="ml-2 text-amber-400">+{POINTS_STREAK} streak bonus!</span>}
                    </div>
                  )}
                  {feedback === 'wrong' && (
                    <div className="absolute bottom-3 left-3 text-sm bg-gray-900/80 text-red-400 px-3 py-1 rounded-full">
                      Was: <span className="font-semibold text-white">{currentRound.album.band.name}</span>
                    </div>
                  )}
                </div>

                {/* Options */}
                <div className="grid grid-cols-2 gap-3 p-6">
                  {currentRound.options.map((option) => {
                    const isCorrect = option === currentRound.album.band.name;
                    let cls = 'py-4 rounded-xl border text-sm font-semibold transition-all ';
                    if (!answered) {
                      cls += 'border-gray-700 bg-gray-800 text-gray-200 hover:border-indigo-500 hover:bg-gray-700 cursor-pointer';
                    } else if (isCorrect) {
                      cls += 'border-green-500 bg-green-900/20 text-green-300 cursor-default';
                    } else {
                      cls += 'border-gray-800 bg-gray-900 text-gray-600 cursor-default';
                    }
                    return (
                      <button key={option} className={cls} onClick={() => handleAnswer(option)} disabled={answered}>
                        {option}
                      </button>
                    );
                  })}
                </div>

                {/* Life hint */}
                <div className="px-6 pb-4 text-center">
                  <p className="text-xs text-gray-600">
                    Leave a comment on a song page to earn an extra life next round.
                  </p>
                </div>
              </div>
            )}

            {/* Game over */}
            {phase === 'gameover' && (
              <div className="rounded-2xl bg-gray-900 border border-gray-800 p-10 text-center space-y-4">
                <div className="text-5xl">🎸</div>
                <h2 className="text-2xl font-bold text-white">Game Over</h2>
                <div className="text-4xl font-bold text-indigo-400">{score.toLocaleString()}</div>
                <p className="text-gray-400">Level {level} · {rounds.length} rounds</p>
                {savedRank !== null && (
                  <p className="text-sm text-green-400">
                    You rank <span className="font-bold">#{savedRank}</span> on the leaderboard!
                  </p>
                )}
                <button
                  onClick={startGame}
                  className="px-8 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold transition-colors"
                >
                  Play again
                </button>
              </div>
            )}
          </div>

          {/* ── Sidebar: leaderboard ── */}
          <div className="w-72 shrink-0 hidden lg:block">
            <LeaderboardPanel entries={leaderboard} />
          </div>
        </div>
      </div>
    </div>
  );
}

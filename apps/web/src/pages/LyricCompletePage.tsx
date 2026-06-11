/**
 * LyricCompletePage — word-by-word lyric completion game.
 * Route: /play/lyric-complete
 * Auth: any user (score submission requires auth)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DifficultyId = 'super-easy' | 'easy' | 'medium' | 'hard' | 'very-hard';

interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  timerSec: number;
  choices: number;
  scoreFactor: number;
  activeClass: string;
  description: string;
}

const DIFFICULTIES: DifficultyConfig[] = [
  { id: 'super-easy', label: 'Super Easy', timerSec: 8, choices: 4, scoreFactor: 1.0, activeClass: 'bg-emerald-700 text-white', description: '4 choices · 8s per word' },
  { id: 'easy',       label: 'Easy',       timerSec: 6, choices: 4, scoreFactor: 1.2, activeClass: 'bg-blue-700   text-white', description: '4 choices · 6s per word' },
  { id: 'medium',     label: 'Medium',     timerSec: 5, choices: 3, scoreFactor: 1.5, activeClass: 'bg-indigo-600 text-white', description: '3 choices · 5s per word' },
  { id: 'hard',       label: 'Hard',       timerSec: 4, choices: 3, scoreFactor: 2.0, activeClass: 'bg-orange-700 text-white', description: '3 choices · 4s per word' },
  { id: 'very-hard',  label: 'Very Hard',  timerSec: 3, choices: 2, scoreFactor: 3.0, activeClass: 'bg-rose-700   text-white', description: '2 choices · 3s per word' },
];

interface RoundStep {
  answer: string;
  options: string[];
}

interface Round {
  songId: string;
  songTitle: string;
  bandName: string;
  contextWords: string[];
  steps: RoundStep[];
}

interface GameData {
  difficulty: DifficultyId;
  timerSec: number;
  scoreFactor: number;
  rounds: Round[];
}

interface LeaderboardEntry {
  rank: number;
  playerName: string;
  avatarUrl?: string | null;
  score: number;
  wordsCompleted: number;
  maxStreak: number;
  difficulty: string;
  bandScopeNames?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

function calcWordScore(
  correct: boolean,
  timeUsedMs: number,
  timerSec: number,
  streak: number,
  scoreFactor: number,
): number {
  if (!correct) return 0;
  const base = 100;
  const timeBonus = Math.round(Math.max(0, (1 - timeUsedMs / (timerSec * 1000)) * 80));
  const streakBonus = Math.min(streak, 10) * 20;
  return Math.round((base + timeBonus + streakBonus) * scoreFactor);
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

interface SetupProps {
  bands: { id: string; name: string }[];
  selectedBandIds: string[];
  toggleBand: (id: string) => void;
  difficulty: DifficultyId;
  setDifficulty: (d: DifficultyId) => void;
  onStart: () => void;
  isLoading: boolean;
}

function SetupScreen({ bands, selectedBandIds, toggleBand, difficulty, setDifficulty, onStart, isLoading }: SetupProps) {
  return (
    <div className="max-w-xl mx-auto text-center">
      <div className="text-6xl mb-4">📝</div>
      <h1 className="text-3xl font-bold text-white mb-2">Lyric Complete</h1>
      <p className="text-gray-400 mb-8 leading-relaxed">
        A snippet from real song lyrics appears. Fill in the missing words one at a time — beat the timer and keep your streak going for big scores.
      </p>

      {/* Band selector */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6 text-left">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Bands to draw from</h2>
        {bands.length === 0 ? (
          <p className="text-sm text-gray-500">Loading bands…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bands.map((b) => {
              const sel = selectedBandIds.includes(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => toggleBand(b.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    sel
                      ? 'bg-violet-700 border-violet-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {b.name}
                </button>
              );
            })}
          </div>
        )}
        {selectedBandIds.length === 0 && (
          <p className="text-xs text-amber-400 mt-2">Select at least one band to play.</p>
        )}
      </div>

      {/* Difficulty */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-8 text-left">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Difficulty</h2>
        <div className="grid grid-cols-5 gap-2">
          {DIFFICULTIES.map((d) => {
            const sel = difficulty === d.id;
            return (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id)}
                className={`py-2 px-1 rounded-lg text-xs font-semibold border transition-colors text-center ${
                  sel
                    ? `${d.activeClass} border-transparent`
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                <div>{d.label}</div>
                <div className={`text-[10px] mt-0.5 font-normal ${sel ? 'text-white/70' : 'text-gray-600'}`}>{d.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={onStart}
        disabled={selectedBandIds.length === 0 || isLoading}
        className="bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white font-bold px-10 py-4 rounded-2xl text-lg transition-colors"
      >
        {isLoading ? 'Loading…' : 'Start Game →'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timer ring
// ---------------------------------------------------------------------------

function TimerRing({ sec, total }: { sec: number; total: number }) {
  const pct = sec / total;
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * pct;
  const color = pct > 0.5 ? 'stroke-emerald-400' : pct > 0.25 ? 'stroke-amber-400' : 'stroke-rose-400';

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg className="-rotate-90" width="64" height="64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(55 65 81)" strokeWidth="4" />
        <circle
          cx="32" cy="32" r={r} fill="none" strokeWidth="4"
          strokeDasharray={`${dash} ${circumference}`}
          className={`transition-all duration-100 ${color}`}
        />
      </svg>
      <span className="absolute text-lg font-bold text-white">{sec}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play screen
// ---------------------------------------------------------------------------

interface PlayProps {
  gameData: GameData;
  onFinish: (score: number, wordsCompleted: number, maxStreak: number) => void;
}

function PlayScreen({ gameData, onFinish }: PlayProps) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [completedWords, setCompletedWords] = useState<string[]>([]); // words answered so far in current round
  const [timeLeft, setTimeLeft] = useState(gameData.timerSec);
  const [totalScore, setTotalScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'timeout' | null>(null);
  const [lastPoints, setLastPoints] = useState(0);
  const wordStartTime = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancedRef = useRef(false); // guard double-advance

  const round = gameData.rounds[roundIdx];
  const step = round?.steps[stepIdx];
  const diffConfig = DIFFICULTIES.find((d) => d.id === gameData.difficulty) ?? DIFFICULTIES[2]!;

  // Start timer when step changes
  useEffect(() => {
    if (!step || feedback !== null) return;

    setTimeLeft(gameData.timerSec);
    wordStartTime.current = Date.now();
    advancedRef.current = false;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleAnswer(null, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundIdx, stepIdx]);

  const handleAnswer = useCallback((chosen: string | null, timedOut = false) => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);

    const correct = !timedOut && chosen === step?.answer;
    const elapsed = Date.now() - wordStartTime.current;
    const points = calcWordScore(correct, elapsed, gameData.timerSec, streak, diffConfig.scoreFactor);

    if (correct) {
      setTotalScore((s) => s + points);
      setStreak((prev) => {
        const next = prev + 1;
        setMaxStreak((m) => Math.max(m, next));
        return next;
      });
      setTotalWords((w) => w + 1);
      setLastPoints(points);
      setFeedback('correct');
      setCompletedWords((prev) => [...prev, step?.answer ?? '']);
    } else {
      setStreak(0);
      setLastPoints(0);
      setFeedback(timedOut ? 'timeout' : 'wrong');
      if (!timedOut) setTotalWords((w) => w + 1); // still counts as attempted
    }

    setTimeout(() => {
      setFeedback(null);
      advance(correct || timedOut);
    }, 900);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, streak, diffConfig.scoreFactor, gameData.timerSec, roundIdx, stepIdx]);

  function advance(keepPhrase: boolean) {
    if (!round) return;

    const nextStep = stepIdx + 1;
    // Proceed to next word only if answered correctly (keepPhrase) and more steps remain
    if (keepPhrase && nextStep < round.steps.length) {
      setStepIdx(nextStep);
      return;
    }

    // Move to next round
    const nextRound = roundIdx + 1;
    if (nextRound < gameData.rounds.length) {
      setRoundIdx(nextRound);
      setStepIdx(0);
      setCompletedWords([]);
    } else {
      // Game over
      onFinish(totalScore, totalWords, maxStreak);
    }
  }

  if (!round || !step) {
    onFinish(totalScore, totalWords, maxStreak);
    return null;
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* HUD */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Round</p>
          <p className="text-lg font-bold text-white">{roundIdx + 1} / {gameData.rounds.length}</p>
        </div>
        <TimerRing sec={timeLeft} total={gameData.timerSec} />
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Score</p>
          <p className="text-lg font-bold text-white">{totalScore.toLocaleString()}</p>
        </div>
      </div>

      {/* Streak */}
      {streak >= 2 && (
        <div className="text-center mb-2">
          <span className="text-xs font-semibold bg-amber-900/40 border border-amber-700/40 text-amber-300 px-3 py-1 rounded-full">
            🔥 {streak} streak
          </span>
        </div>
      )}

      {/* Song info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5 text-center">
        <p className="text-xs text-gray-500 mb-1">From the song…</p>
        <p className="text-lg font-bold text-white">{round.songTitle}</p>
        <p className="text-sm text-gray-400">{round.bandName}</p>
      </div>

      {/* Lyric context */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 mb-6 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Complete the lyric</p>
        <div className="flex flex-wrap gap-2 justify-center items-center">
          {/* Context words (shown) */}
          {round.contextWords.map((w, i) => (
            <span key={`ctx-${i}`} className="text-white font-medium text-lg">{w}</span>
          ))}
          {/* Completed words this round */}
          {completedWords.map((w, i) => (
            <span key={`done-${i}`} className="text-emerald-400 font-medium text-lg">{w}</span>
          ))}
          {/* Blank for current word */}
          <span className={`inline-block w-20 h-8 rounded-lg border-2 align-middle ${
            feedback === 'correct' ? 'border-emerald-500 bg-emerald-900/30' :
            feedback === 'wrong' || feedback === 'timeout' ? 'border-rose-500 bg-rose-900/30' :
            'border-violet-500 bg-violet-900/20 animate-pulse'
          }`} />
        </div>

        {/* Feedback */}
        {feedback === 'correct' && (
          <p className="text-emerald-400 text-sm font-semibold mt-3">
            ✓ Correct! +{lastPoints.toLocaleString()} pts
          </p>
        )}
        {feedback === 'wrong' && (
          <p className="text-rose-400 text-sm font-semibold mt-3">
            ✗ Wrong — it was &ldquo;{step.answer}&rdquo;
          </p>
        )}
        {feedback === 'timeout' && (
          <p className="text-amber-400 text-sm font-semibold mt-3">
            ⏱ Time's up — it was &ldquo;{step.answer}&rdquo;
          </p>
        )}
      </div>

      {/* Word options */}
      {feedback === null && (
        <div className={`grid gap-3 ${step.options.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
          {step.options.map((opt) => (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              className="bg-gray-800 hover:bg-violet-800 border border-gray-700 hover:border-violet-500 text-white font-semibold py-4 rounded-xl transition-colors text-base"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Skip phrase */}
      {feedback === null && (
        <div className="text-center mt-4">
          <button
            onClick={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              if (advancedRef.current) return;
              advancedRef.current = true;
              setStreak(0);
              setFeedback('wrong');
              setTimeout(() => {
                setFeedback(null);
                const nextRound = roundIdx + 1;
                if (nextRound < gameData.rounds.length) {
                  setRoundIdx(nextRound);
                  setStepIdx(0);
                  setCompletedWords([]);
                } else {
                  onFinish(totalScore, totalWords, maxStreak);
                }
              }, 600);
            }}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Skip phrase →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score screen
// ---------------------------------------------------------------------------

interface ScoreProps {
  score: number;
  wordsCompleted: number;
  maxStreak: number;
  difficulty: DifficultyId;
  bandIds: string[];
  onPlayAgain: () => void;
  leaderboard: LeaderboardEntry[];
  leaderboardLoading: boolean;
  leaderboardDiff: DifficultyId;
  setLeaderboardDiff: (d: DifficultyId) => void;
}

function ScoreScreen({
  score, wordsCompleted, maxStreak, difficulty, bandIds,
  onPlayAgain, leaderboard, leaderboardLoading, leaderboardDiff, setLeaderboardDiff,
}: ScoreProps) {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [rank, setRank] = useState<number | null>(null);
  const diffLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;

  async function submit() {
    try {
      const res = await api.post('/api/lyric-complete/scores', {
        score, wordsCompleted, maxStreak, difficulty, bandIds,
      }) as { rank: number };
      setRank(res.rank);
      setSubmitted(true);
    } catch {
      setSubmitError('Could not save score. Try again?');
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center mb-8">
        <div className="text-5xl mb-4">🎤</div>
        <h2 className="text-2xl font-bold text-white mb-1">Game Over</h2>
        <p className="text-gray-400 text-sm mb-6">{diffLabel} difficulty</p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-white">{score.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Total Score</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-white">{wordsCompleted}</p>
            <p className="text-xs text-gray-500 mt-1">Words Hit</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-amber-400">{maxStreak}</p>
            <p className="text-xs text-gray-500 mt-1">Best Streak</p>
          </div>
        </div>

        {rank !== null && (
          <p className="text-emerald-400 font-semibold mb-4">You ranked #{rank} on the leaderboard!</p>
        )}

        {!submitted && user && (
          <div className="mb-4">
            <button
              onClick={submit}
              className="bg-violet-700 hover:bg-violet-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Save Score
            </button>
            {submitError && <p className="text-rose-400 text-sm mt-2">{submitError}</p>}
          </div>
        )}
        {!user && (
          <p className="text-sm text-gray-500 mb-4">
            <a href="/api/auth/google" className="text-violet-400 hover:text-violet-300 underline">Sign in</a> to save your score.
          </p>
        )}

        <button
          onClick={onPlayAgain}
          className="bg-gray-700 hover:bg-gray-600 text-white font-medium px-6 py-2.5 rounded-xl transition-colors"
        >
          Play Again
        </button>
      </div>

      {/* Leaderboard */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Leaderboard</h3>
          <select
            value={leaderboardDiff}
            onChange={(e) => setLeaderboardDiff(e.target.value as DifficultyId)}
            className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1"
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
        {leaderboardLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : leaderboard.length === 0 ? (
          <p className="text-sm text-gray-500">No scores yet for this difficulty.</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((e) => (
              <div key={e.rank} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-400 w-5 text-center">
                    {e.rank <= 3 ? ['🥇','🥈','🥉'][e.rank - 1] : e.rank}
                  </span>
                  {e.avatarUrl && (
                    <img src={e.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{e.playerName}</p>
                    {e.bandScopeNames && (
                      <p className="text-xs text-gray-500">{e.bandScopeNames}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{e.score.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{e.wordsCompleted}w · 🔥{e.maxStreak}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Phase = 'setup' | 'playing' | 'score';

export default function LyricCompletePage() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedBandIds, setSelectedBandIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyId>('medium');
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Results
  const [finalScore, setFinalScore] = useState(0);
  const [finalWords, setFinalWords] = useState(0);
  const [finalStreak, setFinalStreak] = useState(0);

  // Leaderboard
  const [leaderboardDiff, setLeaderboardDiff] = useState<DifficultyId>('medium');

  const { data: bands = [] } = useQuery<{ id: string; name: string; slug: string }[]>({
    queryKey: ['bands'],
    queryFn: () => api.get('/api/bands'),
    staleTime: 300_000,
  });

  const { data: leaderboard = [], isLoading: lbLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['lyric-complete-scores', leaderboardDiff],
    queryFn: () => api.get(`/api/lyric-complete/scores?difficulty=${leaderboardDiff}&limit=15`),
    staleTime: 30_000,
  });

  function toggleBand(id: string) {
    setSelectedBandIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function startGame() {
    setLoadError('');
    setIsLoading(true);
    try {
      const data = await api.get(
        `/api/lyric-complete/round?bandIds=${selectedBandIds.join(',')}&difficulty=${difficulty}`,
      ) as GameData;
      setGameData(data);
      setPhase('playing');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Failed to load game';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFinish(score: number, words: number, streak: number) {
    setFinalScore(score);
    setFinalWords(words);
    setFinalStreak(streak);
    setLeaderboardDiff(difficulty);
    setPhase('score');
  }

  function handlePlayAgain() {
    setGameData(null);
    setPhase('setup');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Back link */}
        <div className="mb-8">
          <Link to="/games" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to Games
          </Link>
        </div>

        {phase === 'setup' && (
          <>
            <SetupScreen
              bands={bands}
              selectedBandIds={selectedBandIds}
              toggleBand={toggleBand}
              difficulty={difficulty}
              setDifficulty={setDifficulty}
              onStart={startGame}
              isLoading={isLoading}
            />
            {loadError && (
              <p className="text-rose-400 text-sm text-center mt-4">{loadError}</p>
            )}
          </>
        )}

        {phase === 'playing' && gameData && (
          <PlayScreen
            gameData={gameData}
            onFinish={handleFinish}
          />
        )}

        {phase === 'score' && (
          <ScoreScreen
            score={finalScore}
            wordsCompleted={finalWords}
            maxStreak={finalStreak}
            difficulty={difficulty}
            bandIds={selectedBandIds}
            onPlayAgain={handlePlayAgain}
            leaderboard={leaderboard}
            leaderboardLoading={lbLoading}
            leaderboardDiff={leaderboardDiff}
            setLeaderboardDiff={setLeaderboardDiff}
          />
        )}
      </main>
    </div>
  );
}

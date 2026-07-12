/**
 * Headliner — build a real concert setlist, watch five crowd factions react,
 * chase (or ruin) the encore. Route: /play/headliner
 *
 * A completely standalone game from Band RPG, Vinyl Runner, and every other
 * game mode — see docs/proposals/CONCERT_ARCHITECT.md. Quick Show plays the
 * full catalog; Campaign plays only songs recovered in Band RPG's
 * Collection, up the stage ladder defined in campaignStages.ts. Daily
 * Challenge is one shared, server-verified puzzle per UTC date — every
 * player gets the identical band/venue/context/seed; the server, never the
 * client, computes and stores the authoritative score.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import {
  headlinerApi, type CandidateSong, type PickResult, type ConcertReport,
  type LiveFrequencyTier, type Venue, type ConcertMode,
  type StageKey, type StageCard as StageCardData, type CampaignFinishResult,
  type DailyFinishResult, type ReactionLogEntry, type ConcertPulseState,
} from '../api/headliner';
import ConcertPulse from '../components/headliner/ConcertPulse';
import CrowdRead from '../components/headliner/CrowdRead';
import { LIVE_FREQUENCY_COLOR, LIVE_FREQUENCY_EMOJI } from '@band-spectrum-mapper/shared';

type Screen =
  | 'mode-select' | 'setup' | 'campaign-band-select' | 'campaign-ladder'
  | 'daily-briefing' | 'daily-leaderboard' | 'live' | 'report';

function msUntilNextUtcMidnight(now: Date): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function useCountdown(): string {
  const [ms, setMs] = useState(() => msUntilNextUtcMidnight(new Date()));
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextUtcMidnight(new Date())), 30000);
    return () => clearInterval(id);
  }, []);
  return formatCountdown(ms);
}

/** "Today's show holds the stage for another Xh Ym. A new room, a new band, a new puzzle at the reset (00:00 UTC)." */
function Countdown() {
  const remaining = useCountdown();
  return <span>{remaining} until next challenge (00:00 UTC)</span>;
}

/** Bare "Xh Ym" for embedding inline inside another sentence. */
function CountdownInline() {
  return <>{useCountdown()}</>;
}

function yesterdayUtcDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const METRIC_LABELS: Record<string, string> = {
  spectrumMatch: 'Spectrum Match',
  energyCurveFit: 'Energy Curve',
  emotionalJourney: 'Emotional Journey',
  audienceRetention: 'Audience Retention',
  rarityExcitement: 'Rarity Excitement',
  diversity: 'Setlist Diversity',
  authenticity: 'Authenticity',
  encoreQuality: 'Encore Quality',
  paceDiscipline: 'Pace Discipline',
  crowdPeak: 'Crowd Peak',
};

// Sourced verbatim from the Creative Bible §10 (Tutorial Writing) for the concepts
// already shown at this surface — candidate songs, Current Concert Spectrum, crowd
// factions, authenticity, pacing, recovered songs. The authenticity tip is adapted
// (not copied verbatim) to reference Attendance rather than Bible §10 item 5's
// "Satisfaction," since Satisfaction is a Daily Challenge-only composite metric that
// doesn't exist on a Campaign show's report — copying it here would name a field
// this screen can't actually show.
const TUTORIAL_TIPS = [
  'These are your options for the next call. Each shows what it would bring — the skill is choosing for the show you\'re building, not just the best song.',
  'This is what your show sounds like so far, updated with every song you call. Watch how each pick pulls it toward or away from the band\'s identity.',
  'Five kinds of fan share this room, and each hears every song differently. No group is wrong — they just came for different things.',
  'Authenticity measures how much of your set was built on fully-analyzed songs rather than neutral estimates. Attendance measures whether the room stuck around — you can have one without the other.',
  'Crowds feel rhythm across songs, not just within them. Vary the energy — three similar songs in a row starts to sound like one long one.',
  'Songs you\'ve recovered in Band RPG make up your Collection — Campaign shows are built only from these. The deeper your Collection, the bigger the rooms you can book.',
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function LiveBadge({ tier, source }: { tier: LiveFrequencyTier; source: 'live' | 'estimated' }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide ${LIVE_FREQUENCY_COLOR[tier]}`}>
      {LIVE_FREQUENCY_EMOJI[tier]} {tier}{source === 'estimated' ? ' (est.)' : ''}
    </span>
  );
}

function StarRow({ stars, max = 3 }: { stars: number; max?: number }) {
  return (
    <span className="text-amber-400 text-sm tracking-wider">
      {Array.from({ length: max }, (_, i) => (i < stars ? '★' : '☆')).join('')}
    </span>
  );
}

function CandidateCard({ song, onPick, disabled }: { song: CandidateSong; onPick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className="text-left rounded-xl bg-gray-900 border border-gray-800 hover:border-rose-500/60 p-4 flex flex-col gap-2 transition-colors disabled:opacity-50"
    >
      <div className="font-semibold text-white">{song.title}</div>
      <div className="text-xs text-gray-500">
        {song.albumTitle ?? 'Non-album'} · {formatDuration(song.durationSeconds)}
      </div>
      <LiveBadge tier={song.liveTier} source={song.liveSource} />
      {song.audienceIsFallback && (
        <div className="text-[10px] text-gray-600">No identity data yet — neutral estimate used</div>
      )}
    </button>
  );
}

function ReportRadar({ metrics }: { metrics: Record<string, number> }) {
  const data = Object.entries(metrics).map(([key, value]) => ({ axis: METRIC_LABELS[key] ?? key, value }));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: '#9ca3af' }} />
        <Radar name="show" dataKey="value" stroke="#fb7185" fill="#fb7185" fillOpacity={0.35} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function StageCardTile({ stage, onPlay }: { stage: StageCardData; onPlay: () => void }) {
  const locked = stage.status === 'locked';
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <div
      className={`rounded-2xl border p-5 flex flex-col gap-3 ${
        locked ? 'bg-gray-900/40 border-gray-800/60 opacity-60' : 'bg-gray-900 border-gray-800'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white">{stage.order}. {stage.name}</h3>
            {stage.status === 'cleared' && <span className="text-[10px] uppercase tracking-widest text-emerald-400 border border-emerald-800 rounded-full px-2 py-0.5">Cleared</span>}
            {locked && <span className="text-[10px] uppercase tracking-widest text-gray-600 border border-gray-800 rounded-full px-2 py-0.5">Locked</span>}
          </div>
          <p className="text-xs text-gray-500 italic mt-0.5">"{stage.copy.titleTagline}"</p>
          <p className="text-xs text-gray-500 mt-1">{stage.description}</p>
        </div>
        {stage.bestStars > 0 && <StarRow stars={stage.bestStars} />}
      </div>

      {locked && stage.lockedExplanation && (
        <p className="text-xs text-gray-500">{stage.lockedExplanation}</p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>Capacity: {stage.capacity.toLocaleString()}</span>
        <span>Length: ~{stage.showLengthMinutes} min</span>
        <span>Needs: {stage.requiredRecoveredSongs}+ songs</span>
        {stage.bestScore !== null && <span>Best: {stage.bestScore}</span>}
      </div>

      {stage.objectives.length > 0 && (
        <ul className="text-[11px] text-gray-500 space-y-0.5">
          {stage.objectives.map((o) => <li key={o.key}>• {o.label}</li>)}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setAboutOpen((v) => !v)}
        className="text-left text-[11px] text-gray-400 hover:text-white underline underline-offset-2 self-start"
      >
        {aboutOpen ? 'Hide room details' : 'About this room'}
      </button>
      {aboutOpen && (
        <div className="text-xs text-gray-400 space-y-2 bg-black/20 rounded-xl p-3">
          <p>{stage.copy.intro}</p>
          <p><span className="text-gray-500">The crowd:</span> {stage.copy.audienceFeeling}</p>
          <p><span className="text-gray-500">Why it matters:</span> {stage.copy.whyItMatters}</p>
        </div>
      )}

      {!locked && !stage.readiness.eligible && stage.readiness.message && (
        <p className="text-xs text-amber-400">{stage.readiness.message}</p>
      )}

      {!locked && (
        <button
          onClick={onPlay}
          disabled={!stage.readiness.eligible}
          className="mt-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-xl transition-colors text-sm"
        >
          {stage.status === 'cleared' ? 'Replay Show →' : 'Play Show →'}
        </button>
      )}
    </div>
  );
}

export default function HeadlinerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [screen, setScreen] = useState<Screen>('mode-select');
  const [bandId, setBandId] = useState<string>('');
  const [venueId, setVenueId] = useState<string>('');
  const [campaignBandId, setCampaignBandId] = useState<string>('');
  const [activeStageKey, setActiveStageKey] = useState<StageKey | null>(null);
  const [runMode, setRunMode] = useState<ConcertMode>('quick');
  const [runId, setRunId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateSong[]>([]);
  const [encoreCandidates, setEncoreCandidates] = useState<CandidateSong[] | null>(null);
  const [lastResult, setLastResult] = useState<PickResult | null>(null);
  const [reactionLogHistory, setReactionLogHistory] = useState<{ songTitle: string; entries: ReactionLogEntry[] }[]>([]);
  const [reactionLogExpanded, setReactionLogExpanded] = useState(false);
  const [pulse, setPulse] = useState<ConcertPulseState | null>(null);
  const [playedTitles, setPlayedTitles] = useState<string[]>([]);
  const [report, setReport] = useState<ConcertReport | null>(null);
  const [campaignResult, setCampaignResult] = useState<CampaignFinishResult | null>(null);
  const [dailyResult, setDailyResult] = useState<DailyFinishResult | null>(null);
  const [isPractice, setIsPractice] = useState(false);
  const [leaderboardDate, setLeaderboardDate] = useState<'today' | 'yesterday'>('today');
  const [tutorialDismissed, setTutorialDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bandsQuery = useQuery({
    queryKey: ['headliner-bands'],
    queryFn: () => headlinerApi.getBands(),
    enabled: !!user && screen === 'setup',
  });
  const venuesQuery = useQuery({
    queryKey: ['headliner-venues'],
    queryFn: () => headlinerApi.getVenues(),
    enabled: !!user && screen === 'setup',
  });
  const campaignBandsQuery = useQuery({
    queryKey: ['headliner-campaign-bands'],
    queryFn: () => headlinerApi.getCampaignBands(),
    enabled: !!user && screen === 'campaign-band-select',
  });
  const ladderQuery = useQuery({
    queryKey: ['headliner-campaign-ladder', campaignBandId],
    queryFn: () => headlinerApi.getCampaignLadder(campaignBandId),
    enabled: !!user && !!campaignBandId && (screen === 'campaign-ladder' || screen === 'live' || screen === 'report'),
  });
  const ladder = ladderQuery.data;

  const dailyTodayQuery = useQuery({
    queryKey: ['headliner-daily-today'],
    queryFn: () => headlinerApi.getDailyToday(),
    enabled: !!user && (screen === 'mode-select' || screen === 'daily-briefing' || screen === 'report'),
  });
  const dailyToday = dailyTodayQuery.data;

  const leaderboardDateStr = leaderboardDate === 'today' ? undefined : yesterdayUtcDateString();
  const dailyLeaderboardQuery = useQuery({
    queryKey: ['headliner-daily-leaderboard', leaderboardDate],
    queryFn: () => headlinerApi.getDailyLeaderboard(leaderboardDateStr),
    enabled: !!user && screen === 'daily-leaderboard',
  });

  async function startShow() {
    if (!bandId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await headlinerApi.startRun(bandId, venueId || null, 'quick');
      setRunMode('quick');
      setRunId(res.runId);
      setCandidates(res.candidates);
      setPlayedTitles([]);
      setLastResult(null);
      setPulse(null);
      setReactionLogHistory([]);
      setReport(null);
      setCampaignResult(null);
      setScreen('live');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the show');
    } finally {
      setBusy(false);
    }
  }

  async function startCampaignStage(stageKey: StageKey) {
    if (!campaignBandId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await headlinerApi.startRun(campaignBandId, null, 'campaign', stageKey);
      setRunMode('campaign');
      setActiveStageKey(stageKey);
      setRunId(res.runId);
      setCandidates(res.candidates);
      setPlayedTitles([]);
      setLastResult(null);
      setPulse(null);
      setReactionLogHistory([]);
      setReport(null);
      setCampaignResult(null);
      setTutorialDismissed(false);
      setScreen('live');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the show');
    } finally {
      setBusy(false);
    }
  }

  async function startDaily() {
    setBusy(true);
    setError(null);
    try {
      const res = await headlinerApi.startRun(null, null, 'daily');
      setRunMode('daily');
      setActiveStageKey(null);
      setRunId(res.runId);
      setCandidates(res.candidates);
      setPlayedTitles([]);
      setLastResult(null);
      setPulse(null);
      setReactionLogHistory([]);
      setReport(null);
      setCampaignResult(null);
      setDailyResult(null);
      setIsPractice(res.isPractice);
      setScreen('live');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start today\'s challenge');
    } finally {
      setBusy(false);
    }
  }

  async function pickSong(songId: string) {
    if (!runId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await headlinerApi.pick(runId, songId);
      setLastResult(res.result);
      setPulse(res.pulse ?? null);
      if (res.reactionLog && res.reactionLog.length > 0) {
        setReactionLogHistory((prev) => [...prev, { songTitle: res.result.song.title, entries: res.reactionLog! }]);
      }
      setPlayedTitles((prev) => [...prev, res.result.song.title]);
      if (res.finished && res.report) {
        setReport(res.report);
        setCampaignResult(res.campaignResult ?? null);
        setDailyResult(res.dailyResult ?? null);
        setCandidates([]);
        setEncoreCandidates(null);
        setScreen('report');
        if (runMode === 'campaign' && campaignBandId) {
          queryClient.invalidateQueries({ queryKey: ['headliner-campaign-ladder', campaignBandId] });
        }
        if (runMode === 'daily') {
          queryClient.invalidateQueries({ queryKey: ['headliner-daily-today'] });
        }
      } else if (res.encoreCandidates) {
        setEncoreCandidates(res.encoreCandidates);
        setCandidates([]);
      } else {
        setCandidates(res.candidates ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply that pick');
    } finally {
      setBusy(false);
    }
  }

  async function copySummary(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable — non-critical */ }
  }

  async function dismissTutorial() {
    setTutorialDismissed(true);
    if (campaignBandId) {
      try { await headlinerApi.markTutorialCompleted(campaignBandId); } catch { /* non-critical */ }
      queryClient.invalidateQueries({ queryKey: ['headliner-campaign-ladder', campaignBandId] });
    }
  }

  function resetToModeSelect() {
    setScreen('mode-select');
    setBandId('');
    setVenueId('');
    setCampaignBandId('');
    setActiveStageKey(null);
    setRunId(null);
    setCandidates([]);
    setEncoreCandidates(null);
    setLastResult(null);
    setPulse(null);
    setReactionLogHistory([]);
    setPlayedTitles([]);
    setReport(null);
    setCampaignResult(null);
    setDailyResult(null);
    setIsPractice(false);
    setError(null);
  }

  function backToLadder() {
    setRunId(null);
    setCandidates([]);
    setEncoreCandidates(null);
    setLastResult(null);
    setPulse(null);
    setReactionLogHistory([]);
    setPlayedTitles([]);
    setReport(null);
    setCampaignResult(null);
    setActiveStageKey(null);
    setScreen('campaign-ladder');
  }

  const showTutorial = runMode === 'campaign' && activeStageKey === 'rehearsal_room'
    && !tutorialDismissed && ladder?.tutorialCompleted === false;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">🎤 Headliner</h1>
          <p className="text-gray-400 text-sm sm:text-base max-w-xl mx-auto">
            Build the setlist. Read the crowd. Chase the encore.
          </p>
        </div>

        {!user && (
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 text-center mb-8">
            <p className="text-gray-300 mb-4">Sign in to play Headliner and save your shows.</p>
            <a
              href="/api/auth/google"
              className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
            >
              Sign in with Google
            </a>
          </div>
        )}

        {user && screen === 'mode-select' && (
          <div className="grid grid-cols-1 gap-5">
            <div className="rounded-2xl bg-gray-900 border border-rose-500/40 p-6">
              <div className="text-2xl mb-2">🎸</div>
              <h2 className="text-xl font-bold mb-1">Quick Show</h2>
              <p className="text-sm text-gray-400 mb-4">
                Pick any band with enough spectrum data, build a full setlist from their whole catalog,
                and see how the crowd reacts. Results save automatically since you're signed in.
              </p>
              <button
                onClick={() => setScreen('setup')}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Play Quick Show →
              </button>
            </div>

            <div className="rounded-2xl bg-gray-900 border border-sky-500/40 p-6">
              <div className="text-2xl mb-2">📅</div>
              <h2 className="text-xl font-bold mb-1">Daily Challenge</h2>
              {dailyToday ? (
                <>
                  <p className="text-sm text-gray-400 mb-1">
                    Today: <span className="text-white font-semibold">{dailyToday.bandName}</span> · {dailyToday.contextLabel}
                  </p>
                  <p className="text-xs text-gray-500 mb-3">{dailyToday.contextDescription}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-4">
                    <span>👥 {dailyToday.participantCount} played today</span>
                    <span><Countdown /></span>
                    {dailyToday.myResult && (
                      <span className="text-emerald-400">
                        ✓ Official score: {dailyToday.myResult.score}{dailyToday.myResult.rank ? ` (rank #${dailyToday.myResult.rank})` : ''}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 mb-4">Loading today's challenge…</p>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setScreen('daily-briefing')}
                  className="bg-sky-600 hover:bg-sky-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
                >
                  {dailyToday?.myResult ? 'View / Practice →' : 'Play Daily Challenge →'}
                </button>
                <button
                  onClick={() => setScreen('daily-leaderboard')}
                  className="text-xs text-sky-400 hover:text-sky-300 self-center"
                >
                  View Leaderboard →
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-gray-900 border border-emerald-500/40 p-6">
              <div className="text-2xl mb-2">🗺️</div>
              <h2 className="text-xl font-bold mb-1">Campaign</h2>
              <p className="text-sm text-gray-400 mb-4">
                Play shows built only from the songs you've recovered in Band RPG — from the Rehearsal
                Room up to a Major Theatre. Each band has its own ladder.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setScreen('campaign-band-select')}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
                >
                  Play Campaign →
                </button>
                <Link to="/play/band-rpg/collection" className="text-xs text-emerald-400 hover:text-emerald-300 self-center">
                  Recover songs in Band RPG's Collection →
                </Link>
              </div>
            </div>
          </div>
        )}

        {user && screen === 'campaign-band-select' && (
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Choose a band</h2>
              <button onClick={() => setScreen('mode-select')} className="text-xs text-gray-400 hover:text-white">← Back</button>
            </div>

            {campaignBandsQuery.isLoading && <p className="text-sm text-gray-500">Loading your recovered bands…</p>}

            {campaignBandsQuery.data && campaignBandsQuery.data.bands.length === 0 && (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-gray-400 max-w-md mx-auto">
                  Your Collection is empty — Campaign shows are built entirely from songs you've recovered in Band RPG.
                  Recover your first few songs there, and the Rehearsal Room will be waiting.
                  <span className="text-gray-500"> (Quick Show doesn't need recoveries, if you want to play tonight.)</span>
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link to="/play/band-rpg" className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                    Play Band RPG →
                  </Link>
                  <Link to="/wiki" className="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                    Browse Wiki
                  </Link>
                </div>
              </div>
            )}

            {campaignBandsQuery.data && campaignBandsQuery.data.bands.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {campaignBandsQuery.data.bands.map((b) => (
                  <button
                    key={b.bandId}
                    onClick={() => { setCampaignBandId(b.bandId); setScreen('campaign-ladder'); }}
                    className="text-left rounded-xl bg-gray-800/60 hover:bg-gray-800 border border-gray-700 p-4 transition-colors"
                  >
                    <div className="font-semibold text-white">{b.bandName}</div>
                    <div className="text-xs text-gray-500 mt-1">{b.recoveredCount} song{b.recoveredCount === 1 ? '' : 's'} recovered</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {user && screen === 'campaign-ladder' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <button onClick={() => setScreen('campaign-band-select')} className="text-xs text-gray-400 hover:text-white">← Choose another band</button>
            </div>

            {ladderQuery.isLoading && <p className="text-sm text-gray-500 text-center py-8">Loading Campaign progress…</p>}

            {ladder && (
              <>
                <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5">
                  <h2 className="text-lg font-bold text-white mb-1">{ladder.bandName} — Campaign</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-500 mt-3">
                    <div><div className="text-white font-semibold">{ladder.recoveredCount}</div>songs recovered</div>
                    <div><div className="text-white font-semibold">{ladder.totalShowsCompleted}</div>shows played</div>
                    <div><div className="text-white font-semibold">{ladder.starsEarned}</div>stars earned</div>
                    <div><div className="text-white font-semibold">{ladder.totalAudienceReached.toLocaleString()}</div>total audience</div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <Link to="/play/band-rpg/collection" className="text-xs text-emerald-400 hover:text-emerald-300">View Collection →</Link>
                    <Link to={`/wiki/bands/${ladder.bandSlug}`} className="text-xs text-sky-400 hover:text-sky-300">View Song Cards →</Link>
                    <Link to="/play/band-rpg" className="text-xs text-gray-400 hover:text-gray-300">Play Band RPG →</Link>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {ladder.stages.map((stage) => (
                    <StageCardTile
                      key={stage.key}
                      stage={stage}
                      onPlay={() => startCampaignStage(stage.key)}
                    />
                  ))}
                </div>
              </>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>
        )}

        {user && screen === 'daily-briefing' && (
          <div className="rounded-2xl bg-gray-900 border border-sky-500/40 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Daily Briefing</h2>
              <button onClick={() => setScreen('mode-select')} className="text-xs text-gray-400 hover:text-white">← Back</button>
            </div>

            {dailyToday && (
              <>
                <div>
                  <div className="text-2xl font-bold text-white">{dailyToday.bandName}</div>
                  <div className="text-sm text-sky-400 mt-1">{dailyToday.contextLabel} · {dailyToday.difficulty}</div>
                  <p className="text-xs text-gray-500 mt-2">{dailyToday.contextDescription}</p>
                </div>

                <p className="text-sm text-gray-300 border-t border-gray-800 pt-4">
                  Today's show: {dailyToday.bandName} for a {dailyToday.contextLabel} crowd. Everyone playing today gets
                  this exact room, this exact catalog, these exact conditions — one shared puzzle, one official
                  attempt. Read the house, build your set, take the stage.
                </p>

                <ul className="text-sm text-gray-400 space-y-1.5">
                  <li>• Your first completed run is your Official Attempt — it's the one that goes on the leaderboard, and it can't be re-run.</li>
                  <li>• Practice attempts use today's exact show — same crowd, same candidates — but never touch the leaderboard. Rehearse freely.</li>
                  <li>• No pressure to be perfect; every player faces this room exactly once for real. The server computes and verifies your score.</li>
                </ul>

                {dailyToday.myResult && (
                  <div className="rounded-xl bg-sky-950/40 border border-sky-800/50 p-4 text-sm">
                    <div className="text-gray-300">
                      Your Official Attempt for today is in the books — {dailyToday.myResult.score}
                      {dailyToday.myResult.rank ? `, rank #${dailyToday.myResult.rank}` : ''}. The room stays open for
                      practice attempts until the reset in <CountdownInline />; practice never changes your official result.
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-rose-400">{error}</p>}

                <button
                  onClick={startDaily}
                  disabled={busy}
                  className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  {busy ? 'Starting…' : dailyToday.myResult ? 'Play Practice Run →' : 'Take the Stage →'}
                </button>
              </>
            )}
          </div>
        )}

        {user && screen === 'daily-leaderboard' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Daily Leaderboard</h2>
              <button onClick={() => setScreen('mode-select')} className="text-xs text-gray-400 hover:text-white">← Back</button>
            </div>

            <div className="flex gap-2">
              {(['today', 'yesterday'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setLeaderboardDate(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    leaderboardDate === d ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {dailyLeaderboardQuery.isLoading && <p className="text-sm text-gray-500 text-center py-8">Loading leaderboard…</p>}

            {dailyLeaderboardQuery.data && (
              <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden">
                {dailyLeaderboardQuery.data.bandName && (
                  <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">
                    {dailyLeaderboardQuery.data.bandName}
                  </div>
                )}
                {dailyLeaderboardQuery.data.entries.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8 max-w-sm mx-auto">
                    No verified results yet for this show — the board fills as players complete their Official Attempts. Play yours and this list starts with you.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-800">
                          <th className="px-4 py-2">Rank</th>
                          <th className="px-4 py-2">Player</th>
                          <th className="px-4 py-2">Score</th>
                          <th className="px-4 py-2">Attendance</th>
                          <th className="px-4 py-2">Authenticity</th>
                          <th className="px-4 py-2">Encore</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyLeaderboardQuery.data.entries.map((e) => (
                          <tr key={e.rank} className="border-b border-gray-800/60">
                            <td className="px-4 py-2 text-gray-400">#{e.rank}</td>
                            <td className="px-4 py-2 text-white font-medium">{e.playerName}</td>
                            <td className="px-4 py-2 text-white">{e.score}</td>
                            <td className="px-4 py-2 text-gray-400">{Math.round(e.finalAttendance)}%</td>
                            <td className="px-4 py-2 text-gray-400">{Math.round(e.authenticity)}%</td>
                            <td className="px-4 py-2 text-gray-400">{Math.round(e.encoreQuality)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {user && screen === 'setup' && (
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 space-y-5">
            <h2 className="text-lg font-semibold">Set up your show</h2>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Band</label>
              <select
                value={bandId}
                onChange={(e) => setBandId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Choose a band…</option>
                {(bandsQuery.data?.bands ?? []).map((b) => (
                  <option key={b.bandId} value={b.bandId} disabled={!b.eligible}>
                    {b.bandName}{!b.eligible ? ` — ${b.reason}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Venue (optional)</label>
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">No specific venue</option>
                {(venuesQuery.data?.venues ?? []).map((v: Venue) => (
                  <option key={v.id} value={v.id}>{v.name} (cap. {v.capacity})</option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setScreen('mode-select')}
                className="px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white"
              >
                ← Back
              </button>
              <button
                onClick={startShow}
                disabled={!bandId || busy}
                className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                {busy ? 'Starting…' : 'Take the Stage →'}
              </button>
            </div>
          </div>
        )}

        {user && screen === 'live' && (
          <div className="space-y-5">
            {runMode === 'campaign' && activeStageKey && ladder && (
              <div className="rounded-2xl bg-gray-900/60 border border-emerald-800/40 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wide">Campaign · {ladder.stages.find((s) => s.key === activeStageKey)?.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{ladder.stages.find((s) => s.key === activeStageKey)?.contextLabel}</div>
                </div>
              </div>
            )}

            {runMode === 'daily' && dailyToday && (
              <div className="rounded-2xl bg-gray-900/60 border border-sky-800/40 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-sky-400 font-semibold uppercase tracking-wide">Daily Challenge · {dailyToday.bandName}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{dailyToday.contextLabel}</div>
                </div>
                {isPractice && (
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400 border border-amber-800 rounded-full px-2 py-0.5 shrink-0">
                    Practice
                  </span>
                )}
              </div>
            )}

            {showTutorial && (
              <div className="rounded-2xl bg-emerald-950/40 border border-emerald-800/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Rehearsal Room tips</span>
                  <button onClick={dismissTutorial} className="text-xs text-gray-400 hover:text-white">Got it ✕</button>
                </div>
                <ul className="text-xs text-gray-400 space-y-1">
                  {TUTORIAL_TIPS.map((t, i) => <li key={i}>• {t}</li>)}
                </ul>
              </div>
            )}

            <ConcertPulse pulse={pulse} />

            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-300">Crowd read</h2>
                <span className="text-xs text-gray-500">{playedTitles.length} song{playedTitles.length === 1 ? '' : 's'} played</span>
              </div>
              <CrowdRead reactions={lastResult?.factionReactions ?? null} pulse={pulse} />
              {lastResult && (
                <div className="mt-4 space-y-1.5 text-sm text-gray-400 border-t border-gray-800 pt-3">
                  <div className="font-semibold text-white">{lastResult.song.title}</div>
                  {lastResult.rarityMoment && (
                    <div className="text-amber-400">⚡ A rare live moment — the crowd knows what this is.</div>
                  )}
                </div>
              )}
            </div>

            {reactionLogHistory.length > 0 && (
              <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
                <button
                  type="button"
                  onClick={() => setReactionLogExpanded((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-gray-300"
                >
                  <span>Reaction Log</span>
                  <span className="text-gray-500">{reactionLogExpanded ? 'Hide ▲' : 'Show ▼'}</span>
                </button>
                {reactionLogExpanded && (
                  <ul className="mt-3 space-y-2 text-xs text-gray-400 max-h-64 overflow-y-auto">
                    {reactionLogHistory.map((song, i) => (
                      <li key={i}>
                        <span className="text-gray-500">{song.songTitle}</span>
                        {song.entries.map((entry, j) => (
                          <div key={j} className="text-sky-400 italic">{entry.text}</div>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}

            {encoreCandidates && encoreCandidates.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-400 mb-3">🔥 The Encore Call</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {encoreCandidates.map((c) => (
                    <CandidateCard key={c.id} song={c} onPick={() => pickSong(c.id)} disabled={busy} />
                  ))}
                </div>
              </div>
            )}

            {!encoreCandidates && candidates.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Call the next song</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {candidates.map((c) => (
                    <CandidateCard key={c.id} song={c} onPick={() => pickSong(c.id)} disabled={busy} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {user && screen === 'report' && report && (
          <div className="space-y-5">
            <div className="text-center text-xs font-semibold uppercase tracking-widest text-gray-600">Show Report</div>
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 text-center">
              <div className="text-4xl font-bold text-rose-400 mb-1">{report.overallScore}</div>
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-4">Overall Score</div>
              <p className="text-sm text-gray-300 leading-relaxed">{report.reviewText}</p>
            </div>

            {campaignResult && (
              <div className="rounded-2xl bg-gray-900 border border-emerald-800/50 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wide">{campaignResult.stageName}</div>
                    <div className="text-lg font-bold text-white">{campaignResult.stars > 0 ? 'Stage Cleared' : 'Stage Not Cleared'}</div>
                  </div>
                  <StarRow stars={campaignResult.stars} />
                </div>

                <p className="text-sm text-gray-300 leading-relaxed">{campaignResult.resultText}</p>

                {campaignResult.objectiveResults.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {campaignResult.objectiveResults.map((o) => (
                      <li key={o.key} className={o.met ? 'text-emerald-400' : 'text-gray-500'}>
                        {o.met ? '✓' : '○'} {o.label}{!o.wasRequired && ' (not required — not enough recovered songs to attempt this)'}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="text-xs text-gray-400 space-y-1">
                  {campaignResult.isNewBest && <div className="text-amber-400">🏆 New best score for {campaignResult.stageName}!</div>}
                  {campaignResult.previousBest !== null && !campaignResult.isNewBest && (
                    <div>Previous best: {campaignResult.previousBest}</div>
                  )}
                  {campaignResult.firstClear && <div className="text-emerald-400">🎉 First clear of {campaignResult.stageName}!</div>}
                  {campaignResult.unlockText && (
                    <div className="text-emerald-400 mt-2">🔓 {campaignResult.unlockText}</div>
                  )}
                  {campaignResult.recoverySuggestion && (
                    <div className="text-amber-400 mt-2">{campaignResult.recoverySuggestion}</div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button onClick={backToLadder} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                    Continue Campaign
                  </button>
                  <button
                    onClick={() => activeStageKey && startCampaignStage(activeStageKey)}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Replay Stage
                  </button>
                  <Link to="/play/band-rpg/collection" className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                    Recover More Songs
                  </Link>
                </div>
              </div>
            )}

            {dailyResult && (
              <div className="rounded-2xl bg-gray-900 border border-sky-800/50 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-sky-400 font-semibold uppercase tracking-wide">Verified Result</div>
                    <div className="text-lg font-bold text-white">
                      {dailyResult.isOfficial ? 'Official Attempt' : 'Practice Attempt'}
                    </div>
                  </div>
                  {dailyResult.rank !== null && (
                    <div className="text-2xl font-bold text-sky-400">#{dailyResult.rank}</div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 text-center text-xs text-gray-500 border-y border-gray-800 py-3">
                  <div><div className="text-white font-semibold text-sm">{Math.round(dailyResult.finalAttendance)}%</div>Final Attendance</div>
                  <div><div className="text-white font-semibold text-sm">{Math.round(dailyResult.satisfaction)}%</div>Satisfaction</div>
                  <div><div className="text-white font-semibold text-sm">{dailyResult.score}</div>Score</div>
                </div>

                <div className="text-sm text-gray-400 space-y-1">
                  {dailyResult.isOfficial ? (
                    <p>Verified Result — official and final. Same show, same rules, everyone: this is where your night stands.</p>
                  ) : (
                    <p>
                      This was a Practice run and does not affect the leaderboard. Your official score remains{' '}
                      <span className="text-white font-semibold">{dailyResult.officialScore}</span>.
                    </p>
                  )}
                  <p className="text-xs text-gray-600">Satisfaction averages all ten measures equally; Score weights what this crowd cared about.</p>
                  <p>{dailyResult.participantCount} player{dailyResult.participantCount === 1 ? '' : 's'} have played today's challenge.</p>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={() => setScreen('daily-leaderboard')}
                    className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    View Leaderboard
                  </button>
                  <button
                    onClick={startDaily}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Play Practice Run
                  </button>
                  <button
                    onClick={() => copySummary(dailyResult.shareText)}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Copy Summary
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
              <ReportRadar metrics={report.metrics} />
            </div>

            {report.highlights.length > 0 && (
              <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Highlights</h3>
                <ul className="space-y-1.5">
                  {report.highlights.map((h, i) => (
                    <li key={i} className="text-sm text-gray-400 flex gap-2">
                      <span className="text-rose-400">›</span>{h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.usedFallbackData && (
              <p className="text-xs text-gray-600 text-center">
                {report.fallbackSongCount} song{report.fallbackSongCount === 1 ? '' : 's'} in this show used neutral
                estimates because they don't have full identity data yet.
              </p>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={resetToModeSelect}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Play Again
              </button>
              <Link
                to="/games"
                className="bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                Back to Games
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

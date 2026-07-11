/**
 * Headliner — build a real concert setlist, watch five crowd factions react,
 * chase (or ruin) the encore. Route: /play/headliner
 *
 * A completely standalone game from Band RPG, Vinyl Runner, and every other
 * game mode — see docs/proposals/CONCERT_ARCHITECT.md. Quick Show plays the
 * full catalog; Campaign plays only songs recovered in Band RPG's
 * Collection, up the stage ladder defined in campaignStages.ts. Daily
 * Challenge remains an honest "coming soon" card.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import {
  headlinerApi, type CandidateSong, type PickResult, type ConcertReport,
  type FactionId, type LiveFrequencyTier, type Venue, type ConcertMode,
  type StageKey, type StageCard as StageCardData, type CampaignFinishResult,
} from '../api/headliner';
import { LIVE_FREQUENCY_COLOR, LIVE_FREQUENCY_EMOJI } from '@band-spectrum-mapper/shared';

type Screen = 'mode-select' | 'setup' | 'campaign-band-select' | 'campaign-ladder' | 'live' | 'report';

const FACTION_LABELS: Record<FactionId, string> = {
  casual: 'Casual Listeners',
  hardcore: 'Hardcore Fans',
  deepCut: 'Deep-Cut Hunters',
  progHeads: 'Prog Heads',
  firstTimers: 'First-Timers',
};

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

const TUTORIAL_TIPS = [
  'Each round offers 2-4 candidate songs — the single "best" pick is deliberately left out, so read the crowd instead of chasing a number.',
  'Every pick nudges your running spectrum average toward (or away from) this band\'s true identity — watch Spectrum Match in the final report.',
  'Five crowd factions react differently to the same song — a Casual-Listener favorite can bore Deep-Cut Hunters.',
  'Authenticity and Audience Retention are different things: authenticity rewards real identity data, retention rewards keeping the crowd engaged.',
  'Pacing matters — a run of similar-energy songs back to back costs you, even if each song is individually great.',
  'Only songs you\'ve recovered in Band RPG are playable here — recover more to unlock bigger, more flexible shows.',
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

function FactionBars({ reactions }: { reactions: Record<FactionId, { score: number; explanation: string }> | null }) {
  const ids = Object.keys(FACTION_LABELS) as FactionId[];
  return (
    <div className="space-y-2">
      {ids.map((id) => {
        const r = reactions?.[id];
        const score = r?.score ?? 0;
        const pct = Math.max(0, Math.min(100, (score + 100) / 2));
        const positive = score >= 0;
        return (
          <div key={id}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-gray-400">{FACTION_LABELS[id]}</span>
              {r && <span className={positive ? 'text-emerald-400' : 'text-rose-400'}>{Math.round(score)}</span>}
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
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
          <p className="text-xs text-gray-500 mt-1">{stage.description}</p>
        </div>
        {stage.bestStars > 0 && <StarRow stars={stage.bestStars} />}
      </div>

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
  const [playedTitles, setPlayedTitles] = useState<string[]>([]);
  const [report, setReport] = useState<ConcertReport | null>(null);
  const [campaignResult, setCampaignResult] = useState<CampaignFinishResult | null>(null);
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

  async function pickSong(songId: string) {
    if (!runId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await headlinerApi.pick(runId, songId);
      setLastResult(res.result);
      setPlayedTitles((prev) => [...prev, res.result.song.title]);
      if (res.finished && res.report) {
        setReport(res.report);
        setCampaignResult(res.campaignResult ?? null);
        setCandidates([]);
        setEncoreCandidates(null);
        setScreen('report');
        if (runMode === 'campaign' && campaignBandId) {
          queryClient.invalidateQueries({ queryKey: ['headliner-campaign-ladder', campaignBandId] });
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
    setPlayedTitles([]);
    setReport(null);
    setCampaignResult(null);
    setError(null);
  }

  function backToLadder() {
    setRunId(null);
    setCandidates([]);
    setEncoreCandidates(null);
    setLastResult(null);
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

            <div className="rounded-2xl bg-gray-900/60 border border-gray-800 p-6 opacity-70">
              <div className="text-2xl mb-2">📅</div>
              <h2 className="text-lg font-semibold mb-1">Daily Challenge</h2>
              <p className="text-sm text-gray-500 mb-2">
                A shared setlist puzzle, same seed for everyone, once a day. Coming soon.
              </p>
              <span className="text-[10px] font-medium uppercase tracking-widest text-gray-600 border border-gray-800 rounded-full px-2 py-0.5">
                In preparation
              </span>
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
                <p className="text-sm text-gray-400">You have not recovered any songs for any band yet.</p>
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
                    <StageCardTile key={stage.key} stage={stage} onPlay={() => startCampaignStage(stage.key)} />
                  ))}
                </div>
              </>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}
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

            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-300">Crowd reaction</h2>
                <span className="text-xs text-gray-500">{playedTitles.length} song{playedTitles.length === 1 ? '' : 's'} played</span>
              </div>
              <FactionBars reactions={lastResult?.factionReactions ?? null} />
              {lastResult && (
                <div className="mt-4 space-y-1 text-xs text-gray-400 border-t border-gray-800 pt-3">
                  <div className="font-semibold text-white">{lastResult.song.title}</div>
                  {Object.values(lastResult.factionReactions).slice(0, 2).map((r, i) => (
                    <div key={i}>{r.explanation}</div>
                  ))}
                  {lastResult.rarityMoment && (
                    <div className="text-amber-400">⚡ A rare live moment — the crowd knows what this is.</div>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            {encoreCandidates && encoreCandidates.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-400 mb-3">🔥 Encore — one last song</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {encoreCandidates.map((c) => (
                    <CandidateCard key={c.id} song={c} onPick={() => pickSong(c.id)} disabled={busy} />
                  ))}
                </div>
              </div>
            )}

            {!encoreCandidates && candidates.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">What's next?</h3>
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
                  {campaignResult.nextStageUnlocked && (
                    <div className="text-emerald-400">🔓 Unlocked: {campaignResult.nextStageUnlocked.replace(/_/g, ' ')}</div>
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

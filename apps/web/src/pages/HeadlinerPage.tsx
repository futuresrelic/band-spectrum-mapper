/**
 * Headliner — build a real concert setlist, watch five crowd factions react,
 * chase (or ruin) the encore. Route: /play/headliner
 *
 * A completely standalone game from Band RPG, Vinyl Runner, and every other
 * game mode — see docs/proposals/CONCERT_ARCHITECT.md. Phase 1 ships Quick
 * Show only; Daily Challenge and Campaign are shown as honest "coming soon"
 * cards on the mode-select screen, never buried or faked as playable.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import {
  headlinerApi, type CandidateSong, type PickResult, type ConcertReport,
  type FactionId, type LiveFrequencyTier, type Venue,
} from '../api/headliner';
import { LIVE_FREQUENCY_COLOR, LIVE_FREQUENCY_EMOJI } from '@band-spectrum-mapper/shared';

type Screen = 'mode-select' | 'setup' | 'live' | 'report';

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

export default function HeadlinerPage() {
  const { user } = useAuth();
  const [screen, setScreen] = useState<Screen>('mode-select');
  const [bandId, setBandId] = useState<string>('');
  const [venueId, setVenueId] = useState<string>('');
  const [runId, setRunId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateSong[]>([]);
  const [encoreCandidates, setEncoreCandidates] = useState<CandidateSong[] | null>(null);
  const [lastResult, setLastResult] = useState<PickResult | null>(null);
  const [playedTitles, setPlayedTitles] = useState<string[]>([]);
  const [report, setReport] = useState<ConcertReport | null>(null);
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

  async function startShow() {
    if (!bandId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await headlinerApi.startRun(bandId, venueId || null, 'quick');
      setRunId(res.runId);
      setCandidates(res.candidates);
      setPlayedTitles([]);
      setLastResult(null);
      setReport(null);
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
        setCandidates([]);
        setEncoreCandidates(null);
        setScreen('report');
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

  function resetToModeSelect() {
    setScreen('mode-select');
    setBandId('');
    setVenueId('');
    setRunId(null);
    setCandidates([]);
    setEncoreCandidates(null);
    setLastResult(null);
    setPlayedTitles([]);
    setReport(null);
    setError(null);
  }

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

            <div className="rounded-2xl bg-gray-900/60 border border-gray-800 p-6 opacity-70">
              <div className="text-2xl mb-2">🗺️</div>
              <h2 className="text-lg font-semibold mb-1">Campaign</h2>
              <p className="text-sm text-gray-500 mb-2">
                Play shows using only the songs you've recovered in Band RPG — from the Rehearsal Room
                up to a Historic Venue. Coming soon.
              </p>
              <span className="text-[10px] font-medium uppercase tracking-widest text-gray-600 border border-gray-800 rounded-full px-2 py-0.5">
                In preparation
              </span>
              <div className="mt-3">
                <Link to="/play/band-rpg/collection" className="text-xs text-emerald-400 hover:text-emerald-300">
                  Recover songs in Band RPG's Collection →
                </Link>
              </div>
            </div>
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

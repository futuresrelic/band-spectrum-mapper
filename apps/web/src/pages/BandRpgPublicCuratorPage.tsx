import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bandRpgApi } from '../api/bandRpg';
import SiteHeader from '../components/layout/SiteHeader';

function ScoreBadge({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-gray-900/60 rounded-xl border border-gray-800 px-3 py-2 min-w-[72px]">
      <span className="text-white text-lg font-bold leading-tight">{value}</span>
      <span className="text-gray-500 text-[10px] uppercase tracking-wide text-center">{label}</span>
    </div>
  );
}

export default function BandRpgPublicCuratorPage() {
  const { userId } = useParams<{ userId: string }>();

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['publicCurator', userId],
    queryFn:  () => bandRpgApi.getPublicCuratorProfile(userId!),
    enabled:  !!userId,
    retry:    false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500/60 border-t-indigo-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <p className="text-gray-400 text-base text-center">This curator profile is private or does not exist.</p>
          <Link to="/games" className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors">← Back to Games</Link>
        </div>
      </div>
    );
  }

  const displayName  = profile.selectedCharacterName ?? 'Curator';
  const badgesCount  = profile.badgeCount;

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <SiteHeader theme="dark" active="games" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

          {/* Profile header */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-950 border-2 border-indigo-700 flex items-center justify-center text-4xl select-none">
              🎵
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{displayName}</h1>
              {profile.currentTitle && (
                <p className="text-indigo-300 text-sm mt-0.5 font-medium">{profile.currentTitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <span className="bg-indigo-900/60 text-indigo-300 text-xs font-bold px-3 py-1 rounded-full border border-indigo-700/50">
                Level {profile.level} · {profile.levelTitle}
              </span>
              {badgesCount > 0 && (
                <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded-full border border-gray-700">
                  {badgesCount} badge{badgesCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* XP bar */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>XP Progress</span>
              <span>{profile.xpProgressPct}%</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all"
                style={{ width: `${profile.xpProgressPct}%` }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div>
            <h2 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Legacy Stats</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ScoreBadge value={profile.stats.songsRecovered}  label="Songs" />
              <ScoreBadge value={profile.stats.albumsCompleted} label="Albums" />
              <ScoreBadge value={profile.stats.toursCreated}    label="Tours" />
              <ScoreBadge value={profile.stats.challengesCompleted} label="Challenges" />
              <ScoreBadge value={profile.stats.festivalsCreated} label="Festivals" />
              <ScoreBadge value={profile.stats.concertsCreated} label="Concerts" />
              <ScoreBadge value={profile.stats.setlistsCreated} label="Setlists" />
              <ScoreBadge value={`${profile.stats.correctGuessPct}%`} label="Guess %" />
            </div>
          </div>

          {/* Badges */}
          {profile.badges.length > 0 && (
            <div>
              <h2 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Badges Earned</h2>
              <div className="flex flex-wrap gap-2">
                {profile.badges.map((b) => (
                  <div
                    key={b.key}
                    title={`${b.name}: ${b.description}`}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl border bg-indigo-950/50 border-indigo-700/50 w-[60px]"
                  >
                    <span className="text-xl">{b.icon}</span>
                    <span className="text-[9px] font-semibold text-indigo-300 text-center leading-tight">{b.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent activity */}
          {profile.recentActivity.length > 0 && (
            <div>
              <h2 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Recent Activity</h2>
              <div className="flex flex-col gap-1.5">
                {profile.recentActivity.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-800/60 last:border-0">
                    <span className="text-base w-6 text-center shrink-0">{a.icon}</span>
                    <span className="text-gray-300 text-sm flex-1">{a.label}</span>
                    <span className="text-gray-600 text-xs shrink-0">
                      {new Date(a.date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-gray-700 text-xs pt-4 border-t border-gray-800">
            Band RPG · The Archive
          </div>
        </div>
      </div>
    </div>
  );
}

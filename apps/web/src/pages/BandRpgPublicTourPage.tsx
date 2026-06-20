import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgApi } from '../api/bandRpg';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';

function ScoreBar({ value, label, colour }: { value: number; label: string; colour: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-xs">{label}</span>
        <span className="text-white text-sm font-bold">{value}</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${colour} rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function BandRpgPublicTourPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tour, isLoading, error } = useQuery({
    queryKey: ['publicTour', id],
    queryFn:  () => bandRpgApi.getPublicTour(id!),
    enabled:  !!id,
    retry:    false,
  });

  const { data: appStatus } = useQuery({
    queryKey: ['appreciationStatus', 'tour', id],
    queryFn:  () => bandRpgApi.getAppreciationStatus('tour', [id!]),
    enabled:  !!id && !!user,
  });

  const myStatus = id && appStatus ? (appStatus[id] ?? null) : null;

  const favMutation = useMutation({
    mutationFn: () => bandRpgApi.toggleFavorite('favorite', 'tour', id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appreciationStatus', 'tour', id] });
      void queryClient.invalidateQueries({ queryKey: ['publicTour', id] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => bandRpgApi.toggleFavorite('saved', 'tour', id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appreciationStatus', 'tour', id] });
      void queryClient.invalidateQueries({ queryKey: ['publicTour', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-teal-500/60 border-t-teal-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !tour) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <p className="text-gray-400 text-base text-center">This tour is private or does not exist.</p>
          <Link to="/games" className="text-teal-400 text-sm hover:text-teal-300 transition-colors">← Back to Games</Link>
        </div>
      </div>
    );
  }

  const unlockedAchievements = tour.achievements.filter((a) => a.unlocked);
  const distinctions = tour.distinctions ?? [];

  const routeStr = [tour.firstCity, tour.lastCity]
    .filter(Boolean)
    .join(' → ');

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <SiteHeader theme="dark" active="games" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

          {/* Header */}
          <div className="text-center flex flex-col items-center gap-2">
            <span className="text-3xl">{tour.personalityIcon}</span>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">{tour.name}</h1>
            <p className="text-teal-400 text-sm font-semibold">{tour.personality}</p>
            {routeStr && (
              <p className="text-gray-500 text-sm">{routeStr}</p>
            )}
            {tour.description && (
              <p className="text-gray-400 text-sm max-w-md">{tour.description}</p>
            )}

            {/* Distinction badges */}
            {distinctions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {distinctions.map((d) => (
                  <span key={d} className="bg-yellow-900/40 text-yellow-300 text-[10px] font-semibold px-2.5 py-1 rounded-full border border-yellow-700/40 uppercase tracking-wide">
                    {d}
                  </span>
                ))}
              </div>
            )}

            {/* Community counts */}
            <div className="flex items-center gap-4 text-sm">
              {(tour.favoriteCount ?? 0) > 0 && (
                <span className="text-gray-400">♥ <span className="text-white font-semibold">{tour.favoriteCount}</span> favorites</span>
              )}
              {(tour.savedCount ?? 0) > 0 && (
                <span className="text-gray-400">🔖 <span className="text-white font-semibold">{tour.savedCount}</span> saved</span>
              )}
            </div>

            {/* Action buttons */}
            {user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void favMutation.mutate()}
                  disabled={favMutation.isPending}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${
                    myStatus?.favorited
                      ? 'bg-pink-900/50 text-pink-300 border-pink-700/50 hover:bg-pink-900/30'
                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <span>{myStatus?.favorited ? '♥' : '♡'}</span>
                  <span>{myStatus?.favorited ? 'Favorited' : 'Favorite'}</span>
                </button>
                <button
                  onClick={() => void saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${
                    myStatus?.saved
                      ? 'bg-blue-900/50 text-blue-300 border-blue-700/50 hover:bg-blue-900/30'
                      : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <span>🔖</span>
                  <span>{myStatus?.saved ? 'Saved' : 'Save'}</span>
                </button>
              </div>
            ) : (
              <p className="text-gray-600 text-xs">Log in to favorite or save this tour</p>
            )}
          </div>

          {/* Key stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center gap-0.5 bg-gray-900/60 rounded-xl border border-gray-800 px-3 py-3">
              <span className="text-white text-2xl font-bold">{tour.stopCount}</span>
              <span className="text-gray-500 text-[11px] uppercase tracking-wide">Cities</span>
            </div>
            <div className="flex flex-col items-center gap-0.5 bg-gray-900/60 rounded-xl border border-gray-800 px-3 py-3">
              <span className="text-white text-2xl font-bold">{tour.bands.length}</span>
              <span className="text-gray-500 text-[11px] uppercase tracking-wide">Band{tour.bands.length !== 1 ? 's' : ''}</span>
            </div>
            {tour.historicalScore !== null ? (
              <div className="flex flex-col items-center gap-0.5 bg-gray-900/60 rounded-xl border border-gray-800 px-3 py-3">
                <span className="text-white text-2xl font-bold">{tour.historicalScore}</span>
                <span className="text-gray-500 text-[11px] uppercase tracking-wide">{tour.historicalLabel ?? 'History'}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-0.5 bg-gray-900/60 rounded-xl border border-gray-800 px-3 py-3">
                <span className="text-white text-2xl font-bold">{tour.bands.length > 0 ? tour.bands[0]![0] ?? '🎸' : '🎸'}</span>
                <span className="text-gray-500 text-[11px] uppercase tracking-wide">Headline</span>
              </div>
            )}
          </div>

          {/* Score bars */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
            <h2 className="text-gray-400 text-xs uppercase tracking-widest">Tour Analysis</h2>
            <ScoreBar value={tour.momentum} label="Momentum"   colour="bg-teal-500"  />
            <ScoreBar value={tour.variety}  label="Variety"    colour="bg-purple-500" />
          </div>

          {/* Story */}
          {tour.story && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <p className="text-gray-300 text-sm leading-relaxed">{tour.story}</p>
            </div>
          )}

          {/* Achievements */}
          {unlockedAchievements.length > 0 && (
            <div>
              <h2 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Achievements</h2>
              <div className="flex flex-wrap gap-2">
                {unlockedAchievements.map((a) => (
                  <div
                    key={a.key}
                    title={a.description}
                    className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-sm">{a.icon}</span>
                    <span className="text-gray-200 text-xs font-medium">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stops */}
          {tour.stops.length > 0 && (
            <div>
              <h2 className="text-gray-400 text-xs uppercase tracking-widest mb-3">
                Tour Stops ({tour.stops.length})
              </h2>
              <div className="flex flex-col gap-1">
                {tour.stops.map((stop, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 py-2.5 border-b border-gray-800/60 last:border-0"
                  >
                    <span className="text-gray-600 text-xs w-5 text-right shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 text-sm font-medium truncate">{stop.concertName}</p>
                      <p className="text-gray-500 text-xs">
                        {[stop.cityName, stop.countryName].filter(Boolean).join(', ')}
                        {stop.songCount > 0 && ` · ${stop.songCount} songs`}
                      </p>
                    </div>
                    <span className="text-gray-600 text-xs shrink-0">{stop.bandName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share */}
          <div className="flex justify-center">
            <button
              onClick={() => { void navigator.clipboard.writeText(window.location.href); }}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-2.5 rounded-xl border border-gray-700 transition-colors"
            >
              <span>🔗</span>
              <span>Copy Link</span>
            </button>
          </div>

          {/* Footer */}
          <div className="text-center text-gray-700 text-xs pt-4 border-t border-gray-800">
            Band RPG · {new Date(tour.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

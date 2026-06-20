import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandRpgApi } from '../api/bandRpg';
import { useAuth } from '../contexts/AuthContext';
import SiteHeader from '../components/layout/SiteHeader';

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-gray-900/60 rounded-xl border border-gray-800 px-3 py-3">
      <span className="text-white text-2xl font-bold leading-tight">{value}</span>
      <span className="text-gray-500 text-[11px] uppercase tracking-wide text-center">{label}</span>
    </div>
  );
}

export default function BandRpgPublicFestivalPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: festival, isLoading, error } = useQuery({
    queryKey: ['publicFestival', id],
    queryFn:  () => bandRpgApi.getPublicFestival(id!),
    enabled:  !!id,
    retry:    false,
  });

  const { data: appStatus } = useQuery({
    queryKey: ['appreciationStatus', 'festival', id],
    queryFn:  () => bandRpgApi.getAppreciationStatus('festival', [id!]),
    enabled:  !!id && !!user,
  });

  const myStatus = id && appStatus ? (appStatus[id] ?? null) : null;

  const favMutation = useMutation({
    mutationFn: () => bandRpgApi.toggleFavorite('favorite', 'festival', id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appreciationStatus', 'festival', id] });
      void queryClient.invalidateQueries({ queryKey: ['publicFestival', id] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => bandRpgApi.toggleFavorite('saved', 'festival', id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appreciationStatus', 'festival', id] });
      void queryClient.invalidateQueries({ queryKey: ['publicFestival', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500/60 border-t-amber-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !festival) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950">
        <SiteHeader theme="dark" active="games" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <p className="text-gray-400 text-base text-center">This festival is private or does not exist.</p>
          <Link to="/games" className="text-amber-400 text-sm hover:text-amber-300 transition-colors">← Back to Games</Link>
        </div>
      </div>
    );
  }

  const deepCutLabel =
    festival.avgDeepCut >= 60 ? 'Deep Archive' :
    festival.avgDeepCut >= 35 ? 'Balanced'     : 'Fan Favourite';

  const fanSvcLabel =
    festival.avgFanService >= 65 ? 'Fan Favourite' :
    festival.avgFanService >= 40 ? 'Balanced'      : 'Collector\'s Pick';

  const distinctions = festival.distinctions ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <SiteHeader theme="dark" active="games" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

          {/* Festival header */}
          <div className="text-center flex flex-col items-center gap-2">
            {festival.isDream && (
              <span className="bg-gradient-to-r from-yellow-600 to-amber-500 text-black text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest">
                ✦ Dream Festival
              </span>
            )}
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">{festival.name}</h1>
            <p className="text-amber-400 text-sm font-semibold">{festival.personality}</p>
            {festival.description && (
              <p className="text-gray-400 text-sm max-w-md">{festival.description}</p>
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
              {(festival.favoriteCount ?? 0) > 0 && (
                <span className="text-gray-400">♥ <span className="text-white font-semibold">{festival.favoriteCount}</span> favorites</span>
              )}
              {(festival.savedCount ?? 0) > 0 && (
                <span className="text-gray-400">🔖 <span className="text-white font-semibold">{festival.savedCount}</span> saved</span>
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
                  <span>{myStatus?.saved ? '🔖' : '🔖'}</span>
                  <span>{myStatus?.saved ? 'Saved' : 'Save'}</span>
                </button>
              </div>
            ) : (
              <p className="text-gray-600 text-xs">Log in to favorite or save this festival</p>
            )}
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat value={festival.concertCount} label="Concerts" />
            <Stat value={festival.bandCount}    label="Bands"    />
            <Stat value={festival.totalSongs}   label="Songs"    />
            <Stat value={festival.rareSongs}    label="Rare Tracks" />
          </div>

          {/* Character labels */}
          <div className="flex flex-wrap gap-2 justify-center">
            <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1.5 rounded-full border border-gray-700">
              Deep Cuts: {festival.avgDeepCut}% · {deepCutLabel}
            </span>
            <span className="bg-gray-800 text-gray-300 text-xs px-3 py-1.5 rounded-full border border-gray-700">
              Fan Service: {festival.avgFanService}% · {fanSvcLabel}
            </span>
          </div>

          {/* Story */}
          {festival.story && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5">
              <p className="text-gray-300 text-sm leading-relaxed">{festival.story}</p>
            </div>
          )}

          {/* Band lineup */}
          {festival.bands.length > 0 && (
            <div>
              <h2 className="text-gray-400 text-xs uppercase tracking-widest mb-3">Lineup</h2>
              <div className="flex flex-wrap gap-2">
                {festival.bands.map((band) => (
                  <span key={band} className="bg-gray-800 text-gray-200 text-sm px-3 py-1.5 rounded-lg border border-gray-700">
                    {band}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Share nudge */}
          <div className="flex justify-center">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href);
              }}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-2.5 rounded-xl border border-gray-700 transition-colors"
            >
              <span>🔗</span>
              <span>Copy Link</span>
            </button>
          </div>

          {/* Footer */}
          <div className="text-center text-gray-700 text-xs pt-4 border-t border-gray-800">
            Band RPG · {new Date(festival.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

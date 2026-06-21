import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SiteHeader from '../components/layout/SiteHeader';
import { useAuth } from '../contexts/AuthContext';
import { adventureProgressApi } from '../api/adventureApi';
import type { BrowseAdventure } from '../api/adventureApi';

type HubTab = 'browse' | 'my-adventures';

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

const DIFFICULTY_COLOURS: Record<string, string> = {
  beginner: 'bg-emerald-900/60 text-emerald-300',
  intermediate: 'bg-blue-900/60 text-blue-300',
  advanced: 'bg-amber-900/60 text-amber-300',
  expert: 'bg-red-900/60 text-red-300',
};

export default function BandRpgCampaignPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<HubTab>('browse');
  const [difficultyFilter, setDifficultyFilter] = useState('');

  const { data: browseData, isLoading: browseLoading } = useQuery({
    queryKey: ['adventures-browse', user?.userId, difficultyFilter],
    queryFn: () => adventureProgressApi.browse({
      ...(user?.userId ? { userId: user.userId } : {}),
      ...(difficultyFilter ? { difficulty: difficultyFilter } : {}),
    }),
    staleTime: 30_000,
  });

  const { data: myData, isLoading: myLoading } = useQuery({
    queryKey: ['adventures-my'],
    queryFn: () => adventureProgressApi.my(),
    enabled: !!user && tab === 'my-adventures',
    staleTime: 30_000,
  });

  const adventures = browseData?.adventures ?? [];
  const featured = adventures.filter(a => a.featured);
  const rest = adventures.filter(a => !a.featured);

  const myAdventures = myData?.adventures ?? [];
  const active = myAdventures.filter(a => !a.progress?.isCompleted);
  const completed = myAdventures.filter(a => a.progress?.isCompleted);

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-black/50 border-b border-gray-800 shrink-0">
        <button onClick={() => navigate('/play/band-rpg')} className="text-gray-500 hover:text-gray-300 text-sm">←</button>
        <span className="text-white font-semibold text-sm">Adventure Hub</span>
        {user && <span className="text-emerald-400 text-xs ml-auto">● {user.username ?? user.name ?? 'Player'}</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

          {/* Tab bar */}
          <div className="flex gap-1 bg-gray-900 rounded-xl p-1 w-fit">
            {([['browse', 'Browse Adventures'], ['my-adventures', 'My Adventures']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Browse tab ── */}
          {tab === 'browse' && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                {['', 'beginner', 'intermediate', 'advanced', 'expert'].map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficultyFilter(d)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      difficultyFilter === d
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {d ? DIFFICULTY_LABELS[d] : 'All'}
                  </button>
                ))}
              </div>

              {browseLoading && <LoadingGrid />}

              {!browseLoading && adventures.length === 0 && (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-lg mb-2">No adventures yet.</p>
                  <p className="text-sm">Adventures are published by admins. Check back soon!</p>
                </div>
              )}

              {/* Featured */}
              {featured.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">Featured</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {featured.map(adv => (
                      <AdventureCard key={adv.id} adv={adv} onStart={() => navigate(`/play/band-rpg/adventures/${adv.id}`)} />
                    ))}
                  </div>
                </section>
              )}

              {/* All others */}
              {rest.length > 0 && (
                <section>
                  {featured.length > 0 && (
                    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">All Adventures</h2>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {rest.map(adv => (
                      <AdventureCard key={adv.id} adv={adv} onStart={() => navigate(`/play/band-rpg/adventures/${adv.id}`)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── My Adventures tab ── */}
          {tab === 'my-adventures' && (
            <div className="space-y-6">
              {myLoading && <LoadingGrid />}

              {!myLoading && myAdventures.length === 0 && (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-lg mb-2">No adventures started yet.</p>
                  <button
                    onClick={() => setTab('browse')}
                    className="text-sm text-indigo-400 hover:text-indigo-300"
                  >
                    Browse Adventures →
                  </button>
                </div>
              )}

              {active.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-3">In Progress</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {active.map(({ adventure, progress }) => (
                      <AdventureCard
                        key={adventure.id}
                        adv={{ ...adventure, progress }}
                        onStart={() => navigate(`/play/band-rpg/adventures/${adventure.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {completed.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-emerald-500 uppercase tracking-widest mb-3">Completed</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {completed.map(({ adventure, progress }) => (
                      <AdventureCard
                        key={adventure.id}
                        adv={{ ...adventure, progress }}
                        onStart={() => navigate(`/play/band-rpg/adventures/${adventure.id}`)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdventureCard({
  adv,
  onStart,
}: {
  adv: BrowseAdventure;
  onStart: () => void;
}) {
  const hasProgress = adv.progress !== null;
  const isCompleted = adv.progress?.isCompleted ?? false;
  const pct = adv.progress?.completionPct ?? 0;

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-gray-800 bg-gray-900 hover:border-indigo-700/60 transition-colors cursor-pointer group"
      onClick={onStart}
    >
      {/* Cover image or placeholder */}
      {adv.coverImageUrl ? (
        <div className="h-32 overflow-hidden">
          <img src={adv.coverImageUrl} alt={adv.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center bg-gradient-to-br from-indigo-950 to-gray-900">
          <span className="text-4xl opacity-30">🗺️</span>
        </div>
      )}

      {/* Badges */}
      <div className="absolute top-3 right-3 flex gap-1.5">
        {adv.featured && (
          <span className="bg-amber-500/90 text-amber-950 text-xs font-bold px-2 py-0.5 rounded-full">Featured</span>
        )}
        {isCompleted && (
          <span className="bg-emerald-600/90 text-white text-xs font-bold px-2 py-0.5 rounded-full">✓ Done</span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-white text-sm leading-tight">{adv.name}</h3>
          {adv.difficulty && (
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${DIFFICULTY_COLOURS[adv.difficulty] ?? 'bg-gray-800 text-gray-400'}`}>
              {DIFFICULTY_LABELS[adv.difficulty] ?? adv.difficulty}
            </span>
          )}
        </div>

        {adv.description && (
          <p className="text-gray-400 text-xs mb-3 line-clamp-2">{adv.description}</p>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <div className="flex gap-3">
            {(adv._count?.levels ?? 0) > 0 && <span>📍 {adv._count?.levels} levels</span>}
            {(adv._count?.quests ?? 0) > 0 && <span>📜 {adv._count?.quests} quests</span>}
            {adv.estimatedPlaytime && <span>⏱ {adv.estimatedPlaytime}min</span>}
          </div>
          {adv.authorName && <span className="text-gray-600">by {adv.authorName}</span>}
        </div>

        {/* Progress bar (only if started) */}
        {hasProgress && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{isCompleted ? 'Completed' : 'In progress'}</span>
              <span>{Math.round(pct)}%</span>
            </div>
            <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-2xl border border-gray-800 bg-gray-900 h-48 animate-pulse" />
      ))}
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adventureProgressApi } from '../../api/adventureApi';
import type { BrowseAdventure } from '../../api/adventureApi';

interface Props {
  userId?: string;
}

export default function RecommendationsPanel({ userId }: Props) {
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['adventures-browse-recs', userId],
    queryFn: () => adventureProgressApi.browse({ ...(userId ? { userId } : {}) }),
    staleTime: 60_000,
  });

  const adventures = data?.adventures ?? [];
  const starter = adventures.find(a => a.slug === 'the-sound-archive');
  const featured = adventures.filter(a => a.featured && a.slug !== 'the-sound-archive').slice(0, 2);

  if (adventures.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-indigo-400 uppercase tracking-widest">Recommended</h2>
        <div className="flex-1 h-px bg-indigo-900/50" />
      </div>

      {starter && (
        <div className="rounded-2xl overflow-hidden border border-indigo-700/40 bg-gradient-to-br from-indigo-950 to-gray-900">
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="text-3xl shrink-0">🎵</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-semibold text-sm">{starter.name}</span>
                  <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">Starter</span>
                </div>
                <p className="text-gray-400 text-xs mb-3 line-clamp-2">{starter.description}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  {starter.estimatedPlaytime && <span>⏱ {starter.estimatedPlaytime} min</span>}
                  <span>📍 {starter._count?.levels ?? 0} levels</span>
                  <span>📜 {starter._count?.quests ?? 0} quests</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate(`/play/band-rpg/adventures/${starter.id}`)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors"
            >
              Start This Adventure
            </button>
          </div>
        </div>
      )}

      {featured.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {featured.map(adv => (
            <FeaturedCard key={adv.id} adv={adv} onSelect={() => navigate(`/play/band-rpg/adventures/${adv.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeaturedCard({ adv, onSelect }: { adv: BrowseAdventure; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="text-left rounded-xl border border-gray-800 bg-gray-900 hover:border-indigo-700/60 p-4 transition-colors"
    >
      <div className="text-white font-medium text-sm mb-1">{adv.name}</div>
      {adv.authorName && <div className="text-gray-500 text-xs mb-2">by {adv.authorName}</div>}
      {adv.description && <p className="text-gray-400 text-xs line-clamp-2">{adv.description}</p>}
    </button>
  );
}

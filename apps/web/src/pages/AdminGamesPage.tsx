import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api/settings';

const ALL_GAMES = [
  { id: 'quiz',             icon: '🖼️', title: 'Album Art Quiz',    href: '/play' },
  { id: 'lyric-dissection', icon: '🎵', title: 'Lyric Dissection',  href: '/play/lyric-dissection' },
  { id: 'timeline',         icon: '🗓️', title: 'Timeline Challenge', href: '/play/timeline' },
  { id: '2048',             icon: '🎮', title: 'Band 2048',          href: '/play/2048' },
  { id: 'wordhunt',         icon: '🔤', title: 'Word Hunt',          href: '/play/word-hunt' },
  { id: 'lyricchain',       icon: '🔗', title: 'Lyric Chain',        href: '/play/lyric-chain' },
  { id: 'graphhunt',        icon: '🌐', title: '3D Graph Hunt',      href: '/graph-hunt' },
  { id: 'spectrum-guesser', icon: '📡', title: 'Spectrum Guesser',   href: '/play/spectrum-guesser' },
  { id: 'lyric-match',      icon: '🧩', title: 'Lyric Match',        href: '/play/lyric-match' },
  { id: 'album-bracket',    icon: '🏟️', title: 'Album Bracket',      href: '/play/bracket' },
  { id: 'lyric-complete',   icon: '📝', title: 'Lyric Complete',     href: '/play/lyric-complete' },
  { id: 'crossword',        icon: '🧩', title: 'BSM Crossword',      href: '/play/crossword' },
  { id: 'word-search',      icon: '🔍', title: 'BSM Word Search',    href: '/play/word-search' },
  { id: 'record-catcher',   icon: '💿', title: 'Record Catcher',     href: '/play/record-catcher' },
  { id: 'platformer',       icon: '🕹️', title: 'Vinyl Runner',        href: '/play/platformer' },
  { id: 'lyric-duel',      icon: '⚔️', title: 'Lyric Duel',          href: '/play/lyric-duel' },
  { id: 'minesweeper',     icon: '💣', title: 'Flop Sweeper',         href: '/play/minesweeper' },
];

export default function AdminGamesPage() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['game-visibility'],
    queryFn: () => settingsApi.getGameVisibility(),
  });

  const [localHidden, setLocalHidden] = useState<string[] | null>(null);

  const hiddenIds = localHidden ?? data?.hiddenIds ?? [];

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => settingsApi.setGameVisibility(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['game-visibility'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function toggle(id: string) {
    const current = localHidden ?? data?.hiddenIds ?? [];
    setLocalHidden(
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
    setSaved(false);
  }

  function handleSave() {
    saveMutation.mutate(hiddenIds);
  }

  const isDirty = localHidden !== null;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-surface-900 mb-1">Game Visibility</h1>
      <p className="text-sm text-surface-500 mb-6">
        Hide games from the public <code className="font-mono bg-surface-100 px-1 rounded">/games</code> page.
        Hidden games still work if someone navigates directly to the URL.
      </p>

      {isLoading ? (
        <p className="text-sm text-surface-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {ALL_GAMES.map((g) => {
            const isHidden = hiddenIds.includes(g.id);
            return (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{g.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-surface-800">{g.title}</p>
                    <p className="text-xs text-surface-400 font-mono">{g.href}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggle(g.id)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ${
                    isHidden ? 'bg-surface-300' : 'bg-emerald-500'
                  }`}
                  role="switch"
                  aria-checked={!isHidden}
                  title={isHidden ? 'Hidden — click to show' : 'Visible — click to hide'}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      isHidden ? 'translate-x-1' : 'translate-x-6'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="bg-surface-900 hover:bg-surface-700 disabled:opacity-40 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
        {saveMutation.isError && (
          <span className="text-sm text-red-600">Failed to save</span>
        )}
        {isDirty && !saved && (
          <span className="text-sm text-amber-600">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}

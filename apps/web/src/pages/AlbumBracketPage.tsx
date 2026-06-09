/**
 * Album Bracket — head-to-head knockout tournament of albums.
 * Route: /play/bracket
 *
 * Select a band (or multiple), pick ≥4 albums to seed the bracket,
 * vote in each round until one album reigns supreme.
 * Pure frontend — uses /api/public/graph/scopes for album data.
 */
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import SiteHeader from '../components/layout/SiteHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Band  { id: string; name: string }
interface Album { id: string; title: string; year: number | null; artworkUrl: string | null; band: { id: string; name: string } }

interface Match { a: Album; b: Album }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Round up to next power-of-2, capped at 16 */
function bracketSize(n: number): number {
  if (n <= 4)  return 4;
  if (n <= 8)  return 8;
  if (n <= 16) return 16;
  return 16;
}

function buildFirstRound(albums: Album[]): Match[] {
  const size  = bracketSize(albums.length);
  const pool  = shuffle(albums).slice(0, size);
  const matches: Match[] = [];
  for (let i = 0; i < pool.length; i += 2) {
    if (pool[i] && pool[i + 1]) {
      matches.push({ a: pool[i]!, b: pool[i + 1]! });
    }
  }
  return matches;
}

function roundName(matchesInRound: number): string {
  if (matchesInRound === 1) return 'Final';
  if (matchesInRound === 2) return 'Semi-Finals';
  if (matchesInRound === 4) return 'Quarter-Finals';
  return `Round of ${matchesInRound * 2}`;
}

// ---------------------------------------------------------------------------
// Album card
// ---------------------------------------------------------------------------

function AlbumCard({ album, onClick, dim }: { album: Album; onClick?: () => void; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`group relative rounded-2xl overflow-hidden aspect-square w-full transition-all
        ${onClick ? 'hover:scale-105 hover:ring-4 ring-white/30 cursor-pointer' : 'cursor-default'}
        ${dim ? 'opacity-30 grayscale' : ''}`}
    >
      {album.artworkUrl ? (
        <img src={album.artworkUrl} alt={album.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <span className="text-4xl">💿</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="text-white font-bold text-sm leading-tight line-clamp-2">{album.title}</p>
        <p className="text-white/50 text-xs mt-0.5">{album.band.name}{album.year ? ` · ${album.year}` : ''}</p>
      </div>
      {onClick && (
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-2xl drop-shadow">Vote</span>
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

function SetupScreen({ bands, allAlbums, onStart }: {
  bands: Band[];
  allAlbums: Album[];
  onStart: (albums: Album[]) => void;
}) {
  const [selBands, setSelBands] = useState<string[]>([]);

  function toggleBand(id: string) {
    setSelBands((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  const filtered = selBands.length
    ? allAlbums.filter((a) => selBands.includes(a.band.id))
    : allAlbums;

  const size = bracketSize(filtered.length);
  const eligible = filtered.length >= 4;

  return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <div className="text-6xl mb-4">🏟️</div>
      <h1 className="text-3xl font-bold text-white mb-2">Album Bracket</h1>
      <p className="text-white/50 text-sm mb-8 leading-relaxed max-w-md mx-auto">
        Head-to-head tournament. Vote for your favourite album each round until
        one reigns supreme.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-5 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Filter by band (optional)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
          {bands.map((b) => {
            const checked = selBands.includes(b.id);
            return (
              <label key={b.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors
                ${checked ? 'bg-rose-600/30 border border-rose-500/50' : 'bg-white/5 border border-white/10 hover:border-white/20'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggleBand(b.id)} className="accent-rose-500" />
                <span className={`text-sm truncate ${checked ? 'text-white' : 'text-white/50'}`}>{b.name}</span>
              </label>
            );
          })}
        </div>
        {eligible ? (
          <p className="text-xs text-rose-400/70 mt-3">
            {filtered.length} albums → {size}-team bracket
          </p>
        ) : (
          <p className="text-xs text-amber-400/70 mt-3">
            {filtered.length > 0 ? 'Need at least 4 albums' : 'No albums in selection'}
          </p>
        )}
      </div>
      <button
        className="w-full py-3.5 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white font-bold text-sm rounded-xl transition-colors"
        onClick={() => onStart(filtered)}
        disabled={!eligible}
      >
        Start Bracket →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AlbumBracketPage() {
  const [phase, setPhase]         = useState<'setup' | 'playing' | 'champion'>('setup');
  const [matches, setMatches]     = useState<Match[]>([]);
  const [matchIdx, setMatchIdx]   = useState(0);
  const [winners, setWinners]     = useState<Album[]>([]);
  const [champion, setChampion]   = useState<Album | null>(null);
  const [allAlbumsForGame, setAllAlbumsForGame] = useState<Album[]>([]);
  const [roundLabel, setRoundLabel] = useState('');
  const [history, setHistory]     = useState<{ round: string; winner: Album; loser: Album }[]>([]);

  const { data: scopes } = useQuery({
    queryKey: ['album-bracket-scopes'],
    queryFn: () => api.get<{
      bands: Band[];
      albums: Album[];
    }>('/api/public/graph/scopes'),
  });

  const bands = scopes?.bands ?? [];
  const allAlbums = scopes?.albums ?? [];

  const startBracket = useCallback((albums: Album[]) => {
    const firstRound = buildFirstRound(albums);
    setMatches(firstRound);
    setMatchIdx(0);
    setWinners([]);
    setHistory([]);
    setChampion(null);
    setAllAlbumsForGame(albums);
    setRoundLabel(roundName(firstRound.length));
    setPhase('playing');
  }, []);

  function vote(winner: Album, loser: Album) {
    const newHistory = [...history, { round: roundLabel, winner, loser }];
    setHistory(newHistory);

    const newWinners = [...winners, winner];
    const nextIdx = matchIdx + 1;

    if (nextIdx < matches.length) {
      // More matches in this round
      setWinners(newWinners);
      setMatchIdx(nextIdx);
      return;
    }

    // Round over
    if (newWinners.length === 1) {
      // Champion!
      setChampion(newWinners[0]!);
      setPhase('champion');
      return;
    }

    // Build next round
    const nextMatches: Match[] = [];
    for (let i = 0; i < newWinners.length; i += 2) {
      if (newWinners[i] && newWinners[i + 1]) {
        nextMatches.push({ a: newWinners[i]!, b: newWinners[i + 1]! });
      } else if (newWinners[i]) {
        // Odd winner — auto-advance
        nextMatches.push({ a: newWinners[i]!, b: newWinners[i]! }); // bye handled in render
      }
    }

    if (nextMatches.length === 0) {
      setChampion(newWinners[0]!);
      setPhase('champion');
      return;
    }

    setMatches(nextMatches);
    setMatchIdx(0);
    setWinners([]);
    setRoundLabel(roundName(nextMatches.length));
  }

  const currentMatch = matches[matchIdx];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <SiteHeader theme="dark" active="games" />

      <div className="border-b border-white/10 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/games" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Games</Link>
          <span className="text-white/20">·</span>
          <h1 className="text-sm font-semibold text-white/80">Album Bracket</h1>
        </div>
        {phase === 'playing' && (
          <div className="text-xs text-white/40">
            {roundLabel} · Match {matchIdx + 1}/{matches.length}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">

        {phase === 'setup' && (
          <SetupScreen bands={bands} allAlbums={allAlbums} onStart={startBracket} />
        )}

        {phase === 'playing' && currentMatch && (
          <div className="space-y-6">
            {/* Round label */}
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-rose-900/30 border border-rose-500/30 rounded-full">
                <span className="text-rose-400 font-bold text-sm">{roundLabel}</span>
                <span className="text-white/30 text-xs">Match {matchIdx + 1} of {matches.length}</span>
              </div>
            </div>

            {/* VS layout */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <AlbumCard album={currentMatch.a} onClick={() => vote(currentMatch.a, currentMatch.b)} />
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-white/20">VS</span>
              </div>
              {/* Handle bye: same album on both sides means auto-advance */}
              {currentMatch.a.id === currentMatch.b.id ? (
                <div className="aspect-square w-full rounded-2xl bg-gray-900 border border-white/10 flex flex-col items-center justify-center gap-2">
                  <span className="text-3xl">🚪</span>
                  <p className="text-white/30 text-xs">Bye round</p>
                </div>
              ) : (
                <AlbumCard album={currentMatch.b} onClick={() => vote(currentMatch.b, currentMatch.a)} />
              )}
            </div>

            <p className="text-center text-xs text-white/20">Click an album to vote it through</p>

            {/* Previous winners */}
            {winners.length > 0 && (
              <div>
                <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Through from this round</p>
                <div className="flex flex-wrap gap-2">
                  {winners.map((w) => (
                    <div key={w.id} className="flex items-center gap-2 bg-green-900/30 border border-green-500/30 rounded-lg px-3 py-1.5">
                      {w.artworkUrl && <img src={w.artworkUrl} alt="" className="w-5 h-5 rounded object-cover" />}
                      <span className="text-xs text-green-300">{w.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {phase === 'champion' && champion && (
          <div className="text-center py-8 space-y-6">
            <div className="text-5xl mb-2">🏆</div>
            <h2 className="text-xl font-bold text-white">Champion</h2>
            <div className="max-w-xs mx-auto">
              <AlbumCard album={champion} />
            </div>
            <p className="text-white/50 text-sm">{champion.band.name}{champion.year ? ` · ${champion.year}` : ''}</p>

            {/* Results */}
            {history.length > 0 && (
              <details className="bg-gray-900 rounded-xl border border-white/10 text-left overflow-hidden">
                <summary className="px-4 py-3 text-xs font-semibold text-white/40 cursor-pointer">
                  Full bracket results ({history.length} matches)
                </summary>
                <div className="px-4 pb-3 space-y-1.5">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="text-white/20 w-24 shrink-0">{h.round}</span>
                      <span className="text-green-400 flex-1 truncate">{h.winner.title}</span>
                      <span className="text-white/20">beat</span>
                      <span className="text-white/30 flex-1 truncate text-right">{h.loser.title}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setPhase('setup')}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                Change Bands
              </button>
              <button
                onClick={() => startBracket(allAlbumsForGame)}
                className="flex-1 py-3 bg-rose-700 hover:bg-rose-600 text-white font-bold text-sm rounded-xl transition-colors"
              >
                Reshuffle →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

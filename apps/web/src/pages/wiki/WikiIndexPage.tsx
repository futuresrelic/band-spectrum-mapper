import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SiteHeader from '../../components/layout/SiteHeader';
import { wikiSearch, type WikiSearchResult } from '../../api/wiki';

export default function WikiIndexPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<WikiSearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await wikiSearch(q, 8));
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const total = results
    ? results.bands.length + results.albums.length + results.songs.length
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <SiteHeader active="wiki" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-indigo-400 mb-3">
            Band Spectrum Mapper
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Music Wiki
          </h1>
          <p className="text-gray-400 leading-relaxed max-w-lg mx-auto">
            An encyclopedic view of every band, album, song, and artist in the collection —
            with spectrum analysis, live performance data, and knowledge confidence ratings.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bands, albums, songs…"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
          {loading && (
            <div className="absolute inset-y-0 right-4 flex items-center">
              <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Results */}
        {results && total === 0 && (
          <p className="text-center text-gray-500 text-sm py-6">No results for "{q}"</p>
        )}

        {results && total > 0 && (
          <div className="space-y-6">
            {results.bands.length > 0 && (
              <ResultGroup title="Bands">
                {results.bands.map((b) => (
                  <Link
                    key={b.id}
                    to={`/wiki/bands/${b.slug}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-colors group"
                  >
                    {b.logoUrl ? (
                      <img src={b.logoUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">
                        {b.name[0]}
                      </div>
                    )}
                    <span className="text-sm font-medium group-hover:text-white transition-colors">{b.name}</span>
                    <svg className="w-3.5 h-3.5 text-gray-600 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </ResultGroup>
            )}

            {results.albums.length > 0 && (
              <ResultGroup title="Albums">
                {results.albums.map((a) => (
                  <Link
                    key={a.id}
                    to={`/wiki/albums/${a.band.slug}/${a.slug}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-colors group"
                  >
                    {a.artworkUrl ? (
                      <img src={a.artworkUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-gray-800 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium group-hover:text-white transition-colors truncate">{a.title}</div>
                      <div className="text-xs text-gray-500">{a.band.name}{a.year ? ` · ${a.year}` : ''}</div>
                    </div>
                    <svg className="w-3.5 h-3.5 text-gray-600 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </ResultGroup>
            )}

            {results.songs.length > 0 && (
              <ResultGroup title="Songs">
                {results.songs.map((s) => (
                  <Link
                    key={s.id}
                    to={`/wiki/songs/${s.id}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium group-hover:text-white transition-colors truncate">{s.title}</div>
                      <div className="text-xs text-gray-500">
                        {s.band.name}
                        {s.album ? ` · ${s.album.title}` : ''}
                      </div>
                    </div>
                    <span className={`text-[10px] font-medium uppercase tracking-widest shrink-0 ${rarityColor(s.rarity)}`}>
                      {s.rarity}
                    </span>
                  </Link>
                ))}
              </ResultGroup>
            )}
          </div>
        )}

        {/* Browse entry points — shown when not searching */}
        {!q && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-widest text-gray-600 mb-4">Browse by type</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Bands',   to: '/wiki/bands',   icon: '🎸' },
                { label: 'Albums',  to: '/wiki/albums',  icon: '💿' },
                { label: 'Songs',   to: '/wiki/songs',   icon: '🎵' },
                { label: 'Artists', to: '/wiki/artists', icon: '🎤' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.to)}
                  className="flex flex-col items-center gap-2 py-6 rounded-lg border border-gray-800 bg-gray-900 hover:border-indigo-800 hover:bg-gray-800/80 transition-colors cursor-pointer"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs font-medium text-gray-300">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function rarityColor(rarity: string): string {
  switch (rarity) {
    case 'Mythic':    return 'text-pink-400';
    case 'Legendary': return 'text-yellow-400';
    case 'Rare':      return 'text-violet-400';
    case 'Uncommon':  return 'text-sky-400';
    default:          return 'text-gray-500';
  }
}

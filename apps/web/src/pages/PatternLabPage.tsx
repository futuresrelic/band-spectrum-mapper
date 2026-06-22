import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  patternLabApi,
  type WordOccurrence,
  type PhraseOccurrence,
  type RecurringWordsResult,
  type RecurringPhrasesResult,
  type AlbumDnaResult,
  type ArtistDnaResult,
  type UniversalConnectorsResult,
  type PatternLabScopes,
  type PhraseContext,
  type PhraseSearchResult,
  type PhraseBridge,
  type PhraseBridgesResult,
  type PhraseDnaResult,
} from '../api/patternLab';
import { pushCinemaHandoff } from '../cinema/cinemaHandoff';

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function downloadCsv(rows: Record<string, string | number>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

type Tab = 'recurrence' | 'phrases' | 'album-dna' | 'artist-dna' | 'connectors';

function TabBar({ active, setActive }: { active: Tab; setActive: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'recurrence',  label: '🔁 Recurrence' },
    { id: 'phrases',     label: '🗣 Phrases' },
    { id: 'album-dna',   label: '💿 Album DNA' },
    { id: 'artist-dna',  label: '🎸 Artist DNA' },
    { id: 'connectors',  label: '🔗 Connectors' },
  ];
  return (
    <div className="flex gap-1 flex-wrap border-b border-surface-800 pb-0 mb-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setActive(t.id)}
          className={`px-3 py-2 text-xs font-semibold rounded-t transition-colors -mb-px border-b-2 ${
            active === t.id
              ? 'border-indigo-500 text-white bg-surface-900'
              : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-900/50'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function BandPicker({
  scopes, selected, setSelected, label = 'Artists',
}: {
  scopes: PatternLabScopes;
  selected: string[];
  setSelected: (ids: string[]) => void;
  label?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">{label}</span>
        {selected.length > 0 && (
          <button className="text-xs text-surface-500 hover:text-surface-200" onClick={() => setSelected([])}>Clear</button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 max-h-40 overflow-y-auto">
        {scopes.bands.map((b) => (
          <label key={b.id} className="flex items-center gap-1.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.includes(b.id)}
              onChange={() => setSelected(selected.includes(b.id) ? selected.filter((x) => x !== b.id) : [...selected, b.id])}
              className="accent-indigo-500"
            />
            <span className={`text-xs transition-colors truncate ${selected.includes(b.id) ? 'text-white' : 'text-surface-400 group-hover:text-surface-200'}`}>
              {b.name}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function ExportBar({ label, onCsv, onJson }: { label: string; onCsv: () => void; onJson: () => void }) {
  return (
    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-surface-800">
      <span className="text-[10px] text-surface-600 mr-1">{label}</span>
      <button onClick={onCsv}  className="px-2 py-1 text-[10px] bg-surface-800 hover:bg-surface-700 text-surface-300 rounded transition-colors">⬇ CSV</button>
      <button onClick={onJson} className="px-2 py-1 text-[10px] bg-surface-800 hover:bg-surface-700 text-surface-300 rounded transition-colors">⬇ JSON</button>
    </div>
  );
}

// Expandable word row for tables
function WordRow({ occ, onWordClick }: { occ: WordOccurrence; onWordClick?: (w: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-b border-surface-800/60 hover:bg-surface-900/40 transition-colors">
        <td className="py-2 px-3">
          <span
            className={`text-xs font-mono text-indigo-300 ${onWordClick ? 'cursor-pointer hover:text-indigo-100' : ''}`}
            onClick={() => onWordClick?.(occ.word)}
          >
            {occ.word}
          </span>
        </td>
        <td className="py-2 px-3 text-xs text-center text-white font-semibold">{occ.songCount}</td>
        <td className="py-2 px-3 text-xs text-center text-surface-400">{occ.albumCount}</td>
        <td className="py-2 px-3 text-xs text-surface-500 truncate max-w-xs">
          {occ.albums.map((a) => a.title).join(', ') || '—'}
        </td>
        <td className="py-2 px-3 text-xs text-right">
          <button onClick={() => setOpen(!open)} className="text-surface-600 hover:text-surface-300 transition-colors">
            {open ? '▲' : '▼'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-900/60">
          <td colSpan={5} className="px-4 pb-3 pt-1.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
              {occ.songs.map((s) => (
                <div key={s.id} className="text-[11px] text-surface-300">
                  <span className="text-surface-500">{s.band}</span>
                  {' — '}{s.title}
                  {s.albumTitle && <span className="text-surface-600"> ({s.albumTitle})</span>}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function WordTable({ words, onWordClick }: { words: WordOccurrence[]; onWordClick?: (w: string) => void }) {
  const [filter, setFilter] = useState('');
  const visible = filter ? words.filter((w) => w.word.includes(filter.toLowerCase())) : words;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter words…"
          className="bg-surface-800 border border-surface-700 rounded px-2 py-1 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-indigo-500 w-48"
        />
        <span className="text-[10px] text-surface-600">{visible.length} words</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-surface-800">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-surface-700 bg-surface-900">
              <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Word</th>
              <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 uppercase tracking-wider text-center">Songs</th>
              <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 uppercase tracking-wider text-center">Albums</th>
              <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Album list</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 200).map((occ) => (
              <WordRow key={occ.word} occ={occ} onWordClick={onWordClick} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Recurrence Explorer
// ---------------------------------------------------------------------------

function RecurrenceTab({ scopes }: { scopes: PatternLabScopes }) {
  const navigate = useNavigate();
  const [bandIds, setBandIds]               = useState<string[]>([]);
  const [albumIds, setAlbumIds]             = useState<string[]>([]);
  const [minSongs, setMinSongs]             = useState(2);
  const [requireAllAlbums, setReqAll]       = useState(false);
  const [limit, setLimit]                   = useState(150);
  const [params, setParams]                 = useState<null | Parameters<typeof patternLabApi.findRecurringWords>[0]>(null);

  const { data, isFetching } = useQuery<RecurringWordsResult>({
    queryKey: ['pl-recurring', params],
    queryFn: () => patternLabApi.findRecurringWords(params!),
    enabled: params !== null,
    staleTime: 5 * 60_000,
  });

  // Album picker filtered by selected bands
  const filteredAlbums = useMemo(
    () => scopes.albums.filter((a) => !bandIds.length || bandIds.includes(a.band.id)),
    [scopes.albums, bandIds],
  );

  function run() {
    if (!bandIds.length && !albumIds.length) return;
    setParams({
      ...(bandIds.length  ? { bandIds  } : {}),
      ...(albumIds.length ? { albumIds } : {}),
      minSongs,
      requireAllAlbums,
      limit,
    });
  }

  const canRun = bandIds.length > 0 || albumIds.length > 0;

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      data.words.map((w) => ({ word: w.word, songs: w.songCount, albums: w.albumCount, songList: w.songs.map((s) => s.title).join('; '), albumList: w.albums.map((a) => a.title).join('; ') })),
      'recurring-words.csv',
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">🔁 Recurrence Explorer</h3>
        <p className="text-[11px] text-surface-500">Find words that appear across multiple songs or albums. Great for identifying recurring themes.</p>

        <BandPicker scopes={scopes} selected={bandIds} setSelected={(ids) => { setBandIds(ids); setAlbumIds([]); }} />

        {filteredAlbums.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Narrow to specific albums (optional)</span>
              {albumIds.length > 0 && <button className="text-xs text-surface-500 hover:text-surface-200" onClick={() => setAlbumIds([])}>Clear</button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 max-h-36 overflow-y-auto">
              {filteredAlbums.map((a) => (
                <label key={a.id} className="flex items-center gap-1.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={albumIds.includes(a.id)}
                    onChange={() => setAlbumIds(albumIds.includes(a.id) ? albumIds.filter((x) => x !== a.id) : [...albumIds, a.id])}
                    className="accent-indigo-500"
                  />
                  <span className={`text-xs truncate transition-colors ${albumIds.includes(a.id) ? 'text-white' : 'text-surface-400 group-hover:text-surface-200'}`}>
                    {bandIds.length > 1 ? `${a.band.name} / ` : ''}{a.title}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-surface-500 mb-1">Min songs: <span className="text-indigo-400 font-mono">{minSongs}</span></div>
            <input type="range" min={1} max={20} value={minSongs} onChange={(e) => setMinSongs(Number(e.target.value))} className="w-full accent-indigo-500" />
          </div>
          <div>
            <div className="text-[10px] text-surface-500 mb-1">Max results: <span className="text-indigo-400 font-mono">{limit}</span></div>
            <input type="range" min={25} max={300} step={25} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full accent-indigo-500" />
          </div>
          <div className="flex items-end">
            <label className="flex items-start gap-2 cursor-pointer group">
              <input type="checkbox" checked={requireAllAlbums} onChange={(e) => setReqAll(e.target.checked)} className="accent-indigo-500 mt-0.5" disabled={!bandIds.length} />
              <span className={`text-[11px] leading-tight transition-colors ${bandIds.length ? 'text-surface-400 group-hover:text-surface-200' : 'text-surface-700 cursor-not-allowed'}`}>
                Word must appear in every album of selected artists
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={run}
            disabled={!canRun || isFetching}
            className={`px-4 py-2 rounded text-xs font-semibold transition-colors ${canRun && !isFetching ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-surface-800 text-surface-600 cursor-not-allowed'}`}
          >
            {isFetching ? 'Searching…' : '🔁 Find Recurring Words'}
          </button>
          {bandIds.length > 0 && (
            <button
              onClick={() => {
                pushCinemaHandoff({ label: `Pattern Lab: Recurrence · ${bandIds.length} artist${bandIds.length !== 1 ? 's' : ''}`, bandIds });
                navigate('/cinema');
              }}
              className="px-3 py-2 rounded text-xs font-medium bg-violet-900/60 hover:bg-violet-800/70 text-violet-300 transition-colors"
            >
              🎬 Cinema
            </button>
          )}
        </div>
      </div>

      {isFetching && <Spinner />}

      {data && !isFetching && (
        <div>
          <div className="text-xs text-surface-500 mb-3">
            <span className="text-white font-semibold">{data.words.length}</span> words found · {data.totalSongs} songs · {data.totalAlbums} albums scanned
          </div>
          {data.words.length === 0
            ? <p className="text-surface-500 text-sm text-center py-8">No words match those criteria — try lowering "Min songs".</p>
            : <WordTable words={data.words} />
          }
          {data.words.length > 0 && (
            <ExportBar
              label="Export recurring words"
              onCsv={exportCsv}
              onJson={() => downloadJson(data, 'recurring-words.json')}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phrase context renderer (highlights **phrase**)
// ---------------------------------------------------------------------------

function ContextSnippet({ context }: { context: string }) {
  // Split on **...**  markers and render highlighted sections
  const parts = context.split(/(\*\*[^*]+\*\*)/);
  return (
    <span className="text-[11px] text-surface-400 leading-relaxed font-mono">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <span key={i} className="text-yellow-300 font-bold not-italic">
              {part.slice(2, -2)}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Phrase DNA inline panel
// ---------------------------------------------------------------------------

function PhraseDnaPanel({
  phrase,
  bandIds,
  albumIds,
  onClose,
}: {
  phrase: string;
  bandIds?: string[];
  albumIds?: string[];
  onClose: () => void;
}) {
  const { data, isFetching, isError } = useQuery<PhraseDnaResult>({
    queryKey: ['pl-phrase-dna', phrase, bandIds?.join(','), albumIds?.join(',')],
    queryFn: () => patternLabApi.phraseDna({
      phrase,
      ...(bandIds?.length  ? { bandIds  } : {}),
      ...(albumIds?.length ? { albumIds } : {}),
    }),
    staleTime: 5 * 60_000,
  });

  function copyDnaReport() {
    if (!data) return;
    const lines = [
      `PHRASE DNA: "${data.phrase}"`,
      `Songs: ${data.songCount}  Albums: ${data.albumCount}  Occurrences: ${data.totalOccurrences}  Bridge Strength: ${data.bridgeStrength}`,
      `Bands: ${data.bandNames.join(', ')}`,
      `Nearby words: ${data.nearbyWords.join(', ')}`,
      '',
      'MATCHES:',
      ...data.matches.map((m) => `  ${m.band} — ${m.songTitle}${m.albumTitle ? ` (${m.albumTitle})` : ''} [×${m.occurrences}]\n    ${m.context.replace(/\*\*/g, '')}`),
    ];
    navigator.clipboard.writeText(lines.join('\n')).catch(() => undefined);
  }

  function copySocialCaption() {
    if (!data) return;
    const caption = `"${data.phrase}" appears in ${data.songCount} songs across ${data.albumCount} albums — bridge strength ${data.bridgeStrength}. Nearby themes: ${data.nearbyWords.slice(0, 5).join(', ')}.`;
    navigator.clipboard.writeText(caption).catch(() => undefined);
  }

  return (
    <div className="bg-surface-900/80 border border-indigo-800/40 rounded-lg p-4 mt-2 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Phrase DNA</span>
          <span className="ml-2 text-sm font-mono text-white">"{phrase}"</span>
        </div>
        <button onClick={onClose} className="text-surface-600 hover:text-surface-300 text-xs transition-colors shrink-0">✕ Close</button>
      </div>

      {isFetching && (
        <div className="flex gap-1.5 py-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      )}

      {isError && <p className="text-red-400 text-xs">Failed to load phrase DNA.</p>}

      {data && !isFetching && (
        <>
          {/* Stats */}
          <div className="flex flex-wrap gap-4 text-[11px]">
            <span className="text-surface-400">Songs: <span className="text-white font-semibold">{data.songCount}</span></span>
            <span className="text-surface-400">Albums: <span className="text-white font-semibold">{data.albumCount}</span></span>
            <span className="text-surface-400">Occurrences: <span className="text-white font-semibold">{data.totalOccurrences}</span></span>
            <span className="text-surface-400">Bridge Strength: <span className="text-amber-400 font-semibold">{data.bridgeStrength}</span></span>
          </div>

          {/* Nearby words */}
          {data.nearbyWords.length > 0 && (
            <div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Nearby words</div>
              <div className="flex flex-wrap gap-1.5">
                {data.nearbyWords.map((w) => (
                  <span key={w} className="px-2 py-0.5 text-[11px] bg-surface-800 text-indigo-200 rounded-full border border-surface-700">
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Song matches */}
          {data.matches.length > 0 && (
            <div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Song contexts</div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {data.matches.slice(0, 20).map((m) => (
                  <div key={m.songId} className="text-[11px] space-y-0.5">
                    <div className="text-surface-300">
                      <span className="text-surface-500">{m.band}</span>
                      {' — '}{m.songTitle}
                      {m.albumTitle && <span className="text-surface-600"> ({m.albumTitle})</span>}
                      {m.occurrences > 1 && <span className="ml-1 text-indigo-400 text-[10px]">×{m.occurrences}</span>}
                    </div>
                    <div className="pl-2 border-l border-surface-700">
                      <ContextSnippet context={m.context} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1 border-t border-surface-800">
            <button
              onClick={copyDnaReport}
              className="px-3 py-1.5 text-[11px] bg-surface-800 hover:bg-surface-700 text-surface-300 rounded transition-colors"
            >
              📋 Copy DNA Report
            </button>
            <button
              onClick={copySocialCaption}
              className="px-3 py-1.5 text-[11px] bg-surface-800 hover:bg-surface-700 text-surface-300 rounded transition-colors"
            >
              📣 Copy Social Caption
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Phrase Discovery (enhanced — Exact Search + Discovery sub-tabs)
// ---------------------------------------------------------------------------

// PhraseRow for discovery table (with DNA expansion)
function PhraseRow({
  p,
  showBridgeStrength,
  bandIds,
}: {
  p: PhraseOccurrence | PhraseBridge;
  showBridgeStrength: boolean;
  bandIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [showDna, setShowDna] = useState(false);

  const isBridge = 'bridgeStrength' in p;
  const bridgeStrength = isBridge ? (p as PhraseBridge).bridgeStrength : null;

  return (
    <>
      <tr className="border-b border-surface-800/60 hover:bg-surface-900/40 transition-colors">
        <td className="py-2 px-3">
          <button
            onClick={() => setShowDna(!showDna)}
            className="text-xs font-mono text-indigo-200 hover:text-indigo-100 transition-colors text-left"
            title="Click to view Phrase DNA"
          >
            {p.phrase}
          </button>
        </td>
        <td className="py-2 px-3 text-xs text-center text-white font-semibold">{p.songCount}</td>
        <td className="py-2 px-3 text-xs text-center text-surface-400">{p.albumCount}</td>
        <td className="py-2 px-3 text-xs text-center text-surface-600">{p.totalCount}</td>
        {showBridgeStrength && (
          <td className="py-2 px-3 text-xs text-center text-amber-400 font-semibold">
            {bridgeStrength ?? '—'}
          </td>
        )}
        <td className="py-2 px-3 text-xs text-right">
          <button onClick={() => setOpen(!open)} className="text-surface-600 hover:text-surface-300 transition-colors">{open ? '▲' : '▼'}</button>
        </td>
      </tr>
      {(open || showDna) && (
        <tr className="bg-surface-900/60">
          <td colSpan={showBridgeStrength ? 6 : 5} className="px-4 pb-3 pt-1.5">
            {open && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 mb-2">
                {p.songs.map((s) => (
                  <div key={s.id} className="text-[11px] text-surface-300">
                    <span className="text-surface-500">{s.band}</span>
                    {' — '}{s.title}
                    {s.albumTitle && <span className="text-surface-600"> ({s.albumTitle})</span>}
                  </div>
                ))}
              </div>
            )}
            {showDna && (
              <PhraseDnaPanel
                phrase={p.phrase}
                bandIds={bandIds}
                onClose={() => setShowDna(false)}
              />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// Exact Search sub-tab
function ExactSearchSubTab({ scopes }: { scopes: PatternLabScopes }) {
  const [query, setQuery]       = useState('');
  const [bandIds, setBandIds]   = useState<string[]>([]);
  const [params, setParams]     = useState<null | { q: string; bandIds?: string[] }>(null);

  const { data, isFetching, isError } = useQuery<PhraseSearchResult>({
    queryKey: ['pl-phrase-search', params],
    queryFn: () => patternLabApi.phraseSearch({ ...params!, limit: 100 }),
    enabled: params !== null,
    staleTime: 5 * 60_000,
  });

  const wordCount = query.trim().split(/\s+/).filter(Boolean).length;
  const tooFewWords = query.trim().length > 0 && wordCount < 2;

  function run() {
    if (wordCount < 2) return;
    setParams({
      q: query.trim(),
      ...(bandIds.length ? { bandIds } : {}),
    });
  }

  function copyAllText() {
    if (!data) return;
    const lines = [
      `Phrase Search: "${data.phrase}"`,
      `${data.songCount} songs · ${data.totalOccurrences} occurrences`,
      '',
      ...data.matches.map((m) =>
        `${m.band} — ${m.songTitle}${m.albumTitle ? ` (${m.albumTitle})` : ''} [×${m.occurrences}]\n  ${m.context.replace(/\*\*/g, '')}`,
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n')).catch(() => undefined);
  }

  return (
    <div className="space-y-5">
      <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
        <h4 className="text-xs font-semibold text-white">🔍 Exact Phrase Search</h4>
        <p className="text-[11px] text-surface-500">
          Search for an exact phrase across all lyrics. Results show context snippets with the phrase highlighted.
        </p>

        <div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            placeholder="Type a phrase to search… e.g. drags down like"
            className="w-full bg-surface-800 border border-surface-700 rounded px-3 py-2 text-sm text-white placeholder-surface-600 focus:outline-none focus:border-indigo-500"
          />
          {tooFewWords && (
            <p className="text-amber-400 text-[11px] mt-1.5">
              Use Word Search for single words. Phrase Finder is designed for 2+ word phrases.
            </p>
          )}
        </div>

        <div>
          <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1.5">Artists (optional — searches all if none selected)</div>
          <BandPicker scopes={scopes} selected={bandIds} setSelected={setBandIds} />
        </div>

        <button
          onClick={run}
          disabled={wordCount < 2 || isFetching}
          className={`px-4 py-2 rounded text-xs font-semibold transition-colors ${wordCount >= 2 && !isFetching ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-surface-800 text-surface-600 cursor-not-allowed'}`}
        >
          {isFetching ? 'Searching…' : '🔍 Search'}
        </button>
      </div>

      {isFetching && <Spinner />}
      {isError && <p className="text-red-400 text-sm">Search failed. Check your phrase and try again.</p>}

      {data && !isFetching && (
        <div>
          {data.songCount === 0 ? (
            <div className="text-center py-12">
              <p className="text-surface-400 text-sm mb-1">No exact match found for "{data.phrase}".</p>
              <p className="text-surface-600 text-xs">Try fewer words or switch to Discovery mode.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-surface-500">
                  <span className="text-white font-semibold">{data.songCount}</span> songs ·{' '}
                  <span className="text-white font-semibold">{data.totalOccurrences}</span> occurrences
                </span>
                <div className="flex gap-2">
                  <button onClick={copyAllText} className="px-2 py-1 text-[10px] bg-surface-800 hover:bg-surface-700 text-surface-300 rounded transition-colors">📋 Copy all</button>
                  <button
                    onClick={() => downloadCsv(
                      data.matches.map((m) => ({ phrase: data.phrase, band: m.band, song: m.songTitle, album: m.albumTitle ?? '', occurrences: m.occurrences, context: m.context.replace(/\*\*/g, '') })),
                      `phrase-search-${data.normalizedPhrase.replace(/\s+/g, '-')}.csv`,
                    )}
                    className="px-2 py-1 text-[10px] bg-surface-800 hover:bg-surface-700 text-surface-300 rounded transition-colors"
                  >
                    ⬇ CSV
                  </button>
                  <button
                    onClick={() => downloadJson(data, `phrase-search-${data.normalizedPhrase.replace(/\s+/g, '-')}.json`)}
                    className="px-2 py-1 text-[10px] bg-surface-800 hover:bg-surface-700 text-surface-300 rounded transition-colors"
                  >
                    ⬇ JSON
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {data.matches.map((m) => (
                  <SearchMatchCard key={m.songId} match={m} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SearchMatchCard({ match }: { match: PhraseContext }) {
  return (
    <div className="bg-surface-900 border border-surface-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="text-xs font-semibold text-white">{match.songTitle}</span>
          <span className="text-[11px] text-surface-500 ml-2">{match.band}</span>
          {match.albumTitle && <span className="text-[11px] text-surface-600 ml-1">· {match.albumTitle}</span>}
        </div>
        {match.occurrences > 1 && (
          <span className="text-[10px] text-indigo-400 font-mono shrink-0 ml-2">×{match.occurrences}</span>
        )}
      </div>
      <div className="pl-3 border-l-2 border-indigo-800/50">
        <ContextSnippet context={match.context} />
      </div>
    </div>
  );
}

// Discovery sub-tab
function DiscoverySubTab({ scopes }: { scopes: PatternLabScopes }) {
  const navigate = useNavigate();
  const [bandIds, setBandIds]           = useState<string[]>([]);
  const [phraseLength, setPhraseLength] = useState(2);
  const [minSongCount, setMin]          = useState(2);
  const [limit, setLimit]               = useState(100);
  const [mode, setMode]                 = useState<'content' | 'all'>('content');
  const [excludeStop, setExcludeStop]   = useState(true);
  const [filter, setFilter]             = useState('');

  // Content phrases (tokenized, stopwords removed)
  const [contentParams, setContentParams] = useState<null | { bandIds: string[]; phraseLength: number; minSongCount: number; limit: number }>(null);
  const { data: contentData, isFetching: contentFetching } = useQuery<RecurringPhrasesResult>({
    queryKey: ['pl-phrases', contentParams],
    queryFn: () => patternLabApi.findRecurringPhrases(contentParams!),
    enabled: contentParams !== null && mode === 'content',
    staleTime: 5 * 60_000,
  });

  // All phrases / bridges (raw text)
  const [bridgeParams, setBridgeParams] = useState<null | { bandIds?: string[]; phraseLength: number; minSongCount: number; limit: number; excludeStopPhrases: boolean }>(null);
  const { data: bridgeData, isFetching: bridgeFetching } = useQuery<PhraseBridgesResult>({
    queryKey: ['pl-phrase-bridges', bridgeParams],
    queryFn: () => patternLabApi.phraseBridges(bridgeParams!),
    enabled: bridgeParams !== null && mode === 'all',
    staleTime: 5 * 60_000,
  });

  const isFetching = mode === 'content' ? contentFetching : bridgeFetching;

  const rawPhrases: Array<PhraseOccurrence | PhraseBridge> = useMemo(() => {
    if (mode === 'content') return contentData?.phrases ?? [];
    return bridgeData?.bridges ?? [];
  }, [mode, contentData, bridgeData]);

  const visible = useMemo(
    () => filter ? rawPhrases.filter((p) => p.phrase.includes(filter.toLowerCase())) : rawPhrases,
    [rawPhrases, filter],
  );

  const totalSongs = mode === 'content' ? (contentData?.totalSongs ?? 0) : (bridgeData?.totalSongs ?? 0);

  function run() {
    if (!bandIds.length) return;
    if (mode === 'content') {
      setContentParams({ bandIds, phraseLength, minSongCount, limit });
    } else {
      setBridgeParams({ bandIds, phraseLength, minSongCount, limit, excludeStopPhrases: excludeStop });
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
        <h4 className="text-xs font-semibold text-white">🗣 Phrase Discovery</h4>
        <p className="text-[11px] text-surface-500">
          Discover recurring multi-word sequences. Content phrases strip stopwords first; All phrases scan raw text.
          Click any phrase to view its DNA.
        </p>

        <BandPicker scopes={scopes} selected={bandIds} setSelected={setBandIds} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-surface-500 mb-1.5">Phrase length</div>
            <div className="flex gap-1">
              {[2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setPhraseLength(n)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${phraseLength === n ? 'bg-indigo-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
                  {n}w
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-surface-500 mb-1">Min songs: <span className="text-indigo-400 font-mono">{minSongCount}</span></div>
            <input type="range" min={1} max={15} value={minSongCount} onChange={(e) => setMin(Number(e.target.value))} className="w-full accent-indigo-500" />
          </div>
          <div>
            <div className="text-[10px] text-surface-500 mb-1">Max results: <span className="text-indigo-400 font-mono">{limit}</span></div>
            <input type="range" min={25} max={200} step={25} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full accent-indigo-500" />
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="text-[10px] text-surface-500 mb-1.5">Mode</div>
            <div className="flex gap-1">
              <button
                onClick={() => setMode('content')}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${mode === 'content' ? 'bg-indigo-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}
              >
                Content phrases
              </button>
              <button
                onClick={() => setMode('all')}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${mode === 'all' ? 'bg-indigo-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}
              >
                All phrases
              </button>
            </div>
          </div>

          {mode === 'all' && (
            <label className="flex items-center gap-2 cursor-pointer group mt-4">
              <input
                type="checkbox"
                checked={excludeStop}
                onChange={(e) => setExcludeStop(e.target.checked)}
                className="accent-indigo-500"
              />
              <span className="text-[11px] text-surface-400 group-hover:text-surface-200 transition-colors">
                Exclude stop phrases (phrases where every word is a stopword)
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={run}
            disabled={!bandIds.length || isFetching}
            className={`px-4 py-2 rounded text-xs font-semibold transition-colors ${bandIds.length && !isFetching ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-surface-800 text-surface-600 cursor-not-allowed'}`}
          >
            {isFetching ? 'Searching…' : '🗣 Find Phrases'}
          </button>
          {bandIds.length > 0 && (
            <button
              onClick={() => {
                pushCinemaHandoff({ label: `Pattern Lab: Phrases · ${bandIds.length} artist${bandIds.length !== 1 ? 's' : ''}`, bandIds });
                navigate('/cinema');
              }}
              className="px-3 py-2 rounded text-xs font-medium bg-violet-900/60 hover:bg-violet-800/70 text-violet-300 transition-colors"
            >
              🎬 Cinema
            </button>
          )}
        </div>
      </div>

      {isFetching && <Spinner />}

      {rawPhrases.length > 0 && !isFetching && (
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-xs text-surface-500">
              <span className="text-white font-semibold">{rawPhrases.length}</span> phrases · {totalSongs} songs scanned
              <span className="ml-2 text-surface-600 text-[10px]">(click a phrase to open DNA panel)</span>
            </span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter phrases…"
              className="bg-surface-800 border border-surface-700 rounded px-2 py-1 text-xs text-white placeholder-surface-600 focus:outline-none focus:border-indigo-500 w-48"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-surface-800">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-700 bg-surface-900">
                  <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Phrase</th>
                  <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 text-center">Songs</th>
                  <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 text-center">Albums</th>
                  <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 text-center">Count</th>
                  {mode === 'all' && (
                    <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 text-center">Bridge Strength</th>
                  )}
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 200).map((p) => (
                  <PhraseRow key={p.phrase} p={p} showBridgeStrength={mode === 'all'} bandIds={bandIds.length ? bandIds : undefined} />
                ))}
              </tbody>
            </table>
          </div>

          <ExportBar
            label="Export phrases"
            onCsv={() => downloadCsv(
              rawPhrases.map((p) => ({
                phrase: p.phrase,
                songs: p.songCount,
                albums: p.albumCount,
                count: p.totalCount,
                ...('bridgeStrength' in p ? { bridgeStrength: (p as PhraseBridge).bridgeStrength } : {}),
                songList: p.songs.map((s) => s.title).join('; '),
              })),
              mode === 'all' ? 'phrase-bridges.csv' : 'recurring-phrases.csv',
            )}
            onJson={() => downloadJson(
              mode === 'all' ? bridgeData : contentData,
              mode === 'all' ? 'phrase-bridges.json' : 'recurring-phrases.json',
            )}
          />
        </div>
      )}

      {!isFetching && rawPhrases.length === 0 && (contentParams !== null || bridgeParams !== null) && (
        <p className="text-surface-500 text-sm text-center py-8">No recurring phrases found — try lowering "Min songs" or phrase length.</p>
      )}
    </div>
  );
}

function PhrasesTab({ scopes }: { scopes: PatternLabScopes }) {
  const [subTab, setSubTab] = useState<'search' | 'discovery'>('search');

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-surface-800 pb-0">
        {([
          { id: 'search'    as const, label: '🔍 Exact Search' },
          { id: 'discovery' as const, label: '🗣 Discovery'    },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold rounded-t transition-colors -mb-px border-b-2 ${
              subTab === t.id
                ? 'border-indigo-500 text-white bg-surface-900'
                : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-900/50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'search'    && <ExactSearchSubTab scopes={scopes} />}
      {subTab === 'discovery' && <DiscoverySubTab   scopes={scopes} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Album DNA
// ---------------------------------------------------------------------------

function AlbumDnaTab({ scopes }: { scopes: PatternLabScopes }) {
  const navigate = useNavigate();
  const [bandId, setBandId]   = useState('');
  const [albumId, setAlbumId] = useState('');
  const [params, setParams]   = useState<string | null>(null);

  const { data, isFetching } = useQuery<AlbumDnaResult>({
    queryKey: ['pl-album-dna', params],
    queryFn: () => patternLabApi.getAlbumDna(params!),
    enabled: params !== null,
    staleTime: 5 * 60_000,
  });

  const filteredAlbums = scopes.albums.filter((a) => a.band.id === bandId);

  return (
    <div className="space-y-6">
      <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">💿 Album DNA</h3>
        <p className="text-[11px] text-surface-500">
          Discover what makes an album unique — words exclusive to it — and what it shares with the rest of the discography.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">Artist</div>
            <select
              className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
              value={bandId}
              onChange={(e) => { setBandId(e.target.value); setAlbumId(''); setParams(null); }}
            >
              <option value="">— pick an artist —</option>
              {scopes.bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {bandId && (
            <div>
              <div className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1.5">Album</div>
              <select
                className="w-full bg-surface-800 border border-surface-700 rounded px-2 py-1.5 text-xs text-white"
                value={albumId}
                onChange={(e) => { setAlbumId(e.target.value); setParams(null); }}
              >
                <option value="">— pick an album —</option>
                {filteredAlbums.map((a) => <option key={a.id} value={a.id}>{a.title}{a.year ? ` (${a.year})` : ''}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { if (albumId) setParams(albumId); }}
            disabled={!albumId || isFetching}
            className={`px-4 py-2 rounded text-xs font-semibold transition-colors ${albumId && !isFetching ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-surface-800 text-surface-600 cursor-not-allowed'}`}
          >
            {isFetching ? 'Analyzing…' : '💿 Analyze Album'}
          </button>
          {bandId && (
            <button
              onClick={() => {
                pushCinemaHandoff({ label: `Pattern Lab: Album DNA · ${scopes.bands.find(b => b.id === bandId)?.name ?? 'Artist'}`, bandIds: [bandId] });
                navigate('/cinema');
              }}
              className="px-3 py-2 rounded text-xs font-medium bg-violet-900/60 hover:bg-violet-800/70 text-violet-300 transition-colors"
            >
              🎬 Cinema
            </button>
          )}
        </div>
      </div>

      {isFetching && <Spinner />}

      {data && !isFetching && (
        <div className="space-y-6">
          <div className="text-xs text-surface-500">
            <span className="text-white font-semibold">{data.album.title}</span> by {data.album.band} ·
            compared against {data.artistAlbumCount - 1} other album{data.artistAlbumCount !== 2 ? 's' : ''}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">
                Unique to this album ({data.uniqueWords.length})
              </h4>
              <p className="text-[10px] text-surface-600 mb-2">Words that appear ONLY in {data.album.title} — not found in any other album by this artist.</p>
              <WordTable words={data.uniqueWords} />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">
                Shared with discography ({data.sharedWords.length})
              </h4>
              <p className="text-[10px] text-surface-600 mb-2">Words in {data.album.title} that also appear in at least one other album.</p>
              <WordTable words={data.sharedWords} />
            </div>
          </div>

          <ExportBar
            label="Export album DNA"
            onCsv={() => downloadCsv(
              [
                ...data.uniqueWords.map((w) => ({ album: data.album.title, type: 'unique', word: w.word, songs: w.songCount })),
                ...data.sharedWords.map((w) => ({ album: data.album.title, type: 'shared', word: w.word, songs: w.songCount })),
              ],
              `album-dna-${data.album.title.replace(/[^a-z0-9]+/gi, '-')}.csv`,
            )}
            onJson={() => downloadJson(data, `album-dna-${data.album.title.replace(/[^a-z0-9]+/gi, '-')}.json`)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Artist DNA
// ---------------------------------------------------------------------------

function ArtistDnaTab({ scopes }: { scopes: PatternLabScopes }) {
  const navigate = useNavigate();
  const [bandIds, setBandIds] = useState<string[]>([]);
  const [params, setParams]   = useState<string[] | null>(null);

  const { data, isFetching } = useQuery<ArtistDnaResult>({
    queryKey: ['pl-artist-dna', params?.join(',')],
    queryFn: () => patternLabApi.getArtistDna(params!),
    enabled: params !== null,
    staleTime: 5 * 60_000,
  });

  const [activeView, setActiveView] = useState<'words' | 'connectors' | 'phrases'>('words');

  return (
    <div className="space-y-6">
      <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">🎸 Artist DNA</h3>
        <p className="text-[11px] text-surface-500">
          Top recurring words, album connectors (words in every album), and recurring phrases for selected artists.
        </p>

        <BandPicker scopes={scopes} selected={bandIds} setSelected={setBandIds} />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { if (bandIds.length) setParams([...bandIds]); }}
            disabled={!bandIds.length || isFetching}
            className={`px-4 py-2 rounded text-xs font-semibold transition-colors ${bandIds.length && !isFetching ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-surface-800 text-surface-600 cursor-not-allowed'}`}
          >
            {isFetching ? 'Analyzing…' : '🎸 Analyze Artist'}
          </button>
          {bandIds.length > 0 && (
            <button
              onClick={() => {
                pushCinemaHandoff({ label: `Pattern Lab: Artist DNA · ${bandIds.length} artist${bandIds.length !== 1 ? 's' : ''}`, bandIds });
                navigate('/cinema');
              }}
              className="px-3 py-2 rounded text-xs font-medium bg-violet-900/60 hover:bg-violet-800/70 text-violet-300 transition-colors"
            >
              🎬 Cinema
            </button>
          )}
        </div>
      </div>

      {isFetching && <Spinner />}

      {data && !isFetching && (
        <div>
          <div className="text-xs text-surface-500 mb-4">
            <span className="text-white font-semibold">{data.bands.join(' + ')}</span> ·
            {data.totalSongs} songs · {data.totalAlbums} albums
          </div>

          <div className="flex gap-1 mb-4 border-b border-surface-800 pb-0">
            {([
              { id: 'words', label: `Top Words (${data.topWords.length})` },
              { id: 'connectors', label: `Album Connectors (${data.albumConnectors.length})` },
              { id: 'phrases', label: `Recurring Phrases (${data.topPhrases.length})` },
            ] as const).map((v) => (
              <button key={v.id} onClick={() => setActiveView(v.id)}
                className={`px-3 py-1.5 text-xs rounded-t transition-colors -mb-px border-b-2 ${activeView === v.id ? 'border-indigo-500 text-white' : 'border-transparent text-surface-400 hover:text-surface-200'}`}>
                {v.label}
              </button>
            ))}
          </div>

          {activeView === 'words' && (
            <div>
              <p className="text-[10px] text-surface-600 mb-3">Words appearing in 2+ songs, sorted by frequency.</p>
              <WordTable words={data.topWords} />
            </div>
          )}

          {activeView === 'connectors' && (
            <div>
              {data.albumConnectors.length === 0
                ? <p className="text-surface-500 text-sm text-center py-8">No words found in every album — select a single artist to check their discography connectors.</p>
                : <>
                  <p className="text-[10px] text-surface-600 mb-3">Words appearing in at least one song from EVERY album of the selected artists.</p>
                  <WordTable words={data.albumConnectors} />
                </>
              }
            </div>
          )}

          {activeView === 'phrases' && (
            <div>
              {data.topPhrases.length === 0
                ? <p className="text-surface-500 text-sm text-center py-8">No recurring 2-word phrases found.</p>
                : (
                  <div className="overflow-x-auto rounded-lg border border-surface-800">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-surface-700 bg-surface-900">
                          <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Phrase</th>
                          <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 text-center">Songs</th>
                          <th className="py-2 px-3 text-[10px] font-semibold text-surface-400 text-center">Albums</th>
                          <th className="py-2 px-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.topPhrases.map((p) => <PhraseRow key={p.phrase} p={p} showBridgeStrength={false} />)}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}

          <ExportBar
            label="Export artist DNA"
            onCsv={() => downloadCsv(
              data.topWords.map((w) => ({ word: w.word, songs: w.songCount, albums: w.albumCount, albumList: w.albums.map((a) => a.title).join('; ') })),
              `artist-dna-${data.bands.join('-').replace(/[^a-z0-9-]+/gi, '')}.csv`,
            )}
            onJson={() => downloadJson(data, `artist-dna.json`)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Universal Connectors
// ---------------------------------------------------------------------------

function ConnectorsTab({ scopes }: { scopes: PatternLabScopes }) {
  const navigate = useNavigate();
  const [bandIds, setBandIds] = useState<string[]>([]);
  const [params, setParams]   = useState<string[] | null>(null);

  const { data, isFetching } = useQuery<UniversalConnectorsResult>({
    queryKey: ['pl-connectors', params?.join(',')],
    queryFn: () => patternLabApi.findConnectors(params!),
    enabled: params !== null,
    staleTime: 5 * 60_000,
  });

  const [activeView, setActiveView] = useState<'shared' | 'partial' | 'unique'>('shared');

  return (
    <div className="space-y-6">
      <div className="bg-surface-900 border border-surface-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-white">🔗 Universal Connectors</h3>
        <p className="text-[11px] text-surface-500">
          For 2+ artists: find words shared across ALL of them, words unique to each, and words shared partially.
          Ideal for Maynard-style cross-project analysis.
        </p>

        <BandPicker scopes={scopes} selected={bandIds} setSelected={setBandIds} label="Artists (select 2+)" />

        {bandIds.length === 1 && (
          <p className="text-[10px] text-amber-500">Select at least two artists to compare.</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { if (bandIds.length >= 2) setParams([...bandIds]); }}
            disabled={bandIds.length < 2 || isFetching}
            className={`px-4 py-2 rounded text-xs font-semibold transition-colors ${bandIds.length >= 2 && !isFetching ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-surface-800 text-surface-600 cursor-not-allowed'}`}
          >
            {isFetching ? 'Analyzing…' : '🔗 Find Connectors'}
          </button>
          {bandIds.length >= 2 && (
            <button
              onClick={() => {
                pushCinemaHandoff({ label: `Pattern Lab: Connectors · ${bandIds.length} artists`, bandIds });
                navigate('/cinema');
              }}
              className="px-3 py-2 rounded text-xs font-medium bg-violet-900/60 hover:bg-violet-800/70 text-violet-300 transition-colors"
            >
              🎬 Cinema
            </button>
          )}
        </div>
      </div>

      {isFetching && <Spinner />}

      {data && !isFetching && (
        <div>
          <div className="text-xs text-surface-500 mb-4">
            Comparing: <span className="text-white font-semibold">{data.bandNames.join(' · ')}</span>
          </div>

          <div className="flex gap-1 mb-4 border-b border-surface-800 pb-0 flex-wrap">
            {([
              { id: 'shared',  label: `Shared by all (${data.sharedAll.length})` },
              { id: 'partial', label: `Shared by some (${data.partialShared.length})` },
              { id: 'unique',  label: `Unique per artist` },
            ] as const).map((v) => (
              <button key={v.id} onClick={() => setActiveView(v.id)}
                className={`px-3 py-1.5 text-xs rounded-t transition-colors -mb-px border-b-2 ${activeView === v.id ? 'border-indigo-500 text-white' : 'border-transparent text-surface-400 hover:text-surface-200'}`}>
                {v.label}
              </button>
            ))}
          </div>

          {activeView === 'shared' && (
            <div>
              {data.sharedAll.length === 0
                ? <p className="text-surface-500 text-sm text-center py-8">No words found in all selected artists' lyrics.</p>
                : <>
                  <p className="text-[10px] text-surface-600 mb-3">Words appearing in at least one song from every selected artist.</p>
                  <WordTable words={data.sharedAll} />
                </>
              }
            </div>
          )}

          {activeView === 'partial' && (
            <div>
              <p className="text-[10px] text-surface-600 mb-3">Words shared by some (not all) of the selected artists.</p>
              <WordTable words={data.partialShared} />
            </div>
          )}

          {activeView === 'unique' && (
            <div className="space-y-6">
              {data.uniquePerBand.map((b) => (
                <div key={b.bandId}>
                  <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">
                    Unique to {b.bandName} ({b.words.length})
                  </h4>
                  <WordTable words={b.words} />
                </div>
              ))}
            </div>
          )}

          <ExportBar
            label="Export connectors"
            onCsv={() => downloadCsv(
              data.sharedAll.map((w) => ({ word: w.word, songs: w.songCount, type: 'shared-all' })),
              `connectors-${data.bandNames.join('-').replace(/[^a-z0-9-]+/gi, '')}.csv`,
            )}
            onJson={() => downloadJson(data, 'connectors.json')}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PatternLabPage() {
  const [activeTab, setActiveTab] = useState<Tab>('recurrence');

  const { data: scopes, isLoading: scopesLoading } = useQuery<PatternLabScopes>({
    queryKey: ['pattern-lab-scopes'],
    queryFn: patternLabApi.getScopes,
    staleTime: 10 * 60_000,
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-white tracking-tight">Pattern Lab</h1>
          <p className="text-xs text-surface-500 mt-1">
            Admin-only deep analysis — discover recurring words, phrases, album DNA, and cross-artist patterns.
            Everything runs on demand; nothing is cached or visible to public users.
          </p>
        </div>

        {scopesLoading ? (
          <Spinner />
        ) : !scopes ? (
          <p className="text-red-400 text-sm">Failed to load scope data.</p>
        ) : (
          <>
            <TabBar active={activeTab} setActive={setActiveTab} />
            {activeTab === 'recurrence'  && <RecurrenceTab  scopes={scopes} />}
            {activeTab === 'phrases'     && <PhrasesTab     scopes={scopes} />}
            {activeTab === 'album-dna'   && <AlbumDnaTab    scopes={scopes} />}
            {activeTab === 'artist-dna'  && <ArtistDnaTab   scopes={scopes} />}
            {activeTab === 'connectors'  && <ConnectorsTab  scopes={scopes} />}
          </>
        )}
      </div>
    </div>
  );
}

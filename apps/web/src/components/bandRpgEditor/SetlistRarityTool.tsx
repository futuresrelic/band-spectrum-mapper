import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { bandRpgApi, type RaritySuggestion, type RarityThresholds, type SongRarityValue } from '../../api/bandRpg';
import { bandsApi } from '../../api/bands';

const SONG_RARITIES: SongRarityValue[] = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];

const RARITY_BADGE: Record<SongRarityValue, string> = {
  Common:    'bg-emerald-100 text-emerald-800 border border-emerald-200',
  Uncommon:  'bg-blue-100 text-blue-800 border border-blue-200',
  Rare:      'bg-purple-100 text-purple-800 border border-purple-200',
  Legendary: 'bg-amber-100 text-amber-800 border border-amber-200',
  Mythic:    'bg-rose-100 text-rose-800 border border-rose-200',
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
  none:   'No data',
};

const CONFIDENCE_STYLE: Record<string, string> = {
  high:   'text-emerald-600 font-medium',
  medium: 'text-amber-600',
  low:    'text-orange-500',
  none:   'text-surface-400',
};

const DEFAULT_THRESHOLDS: RarityThresholds = { common: 30, uncommon: 10, rare: 3, legendary: 0.5 };

function RarityBadge({ value }: { value: SongRarityValue | null }) {
  if (!value) return <span className="text-surface-400 text-xs">—</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${RARITY_BADGE[value]}`}>
      {value}
    </span>
  );
}

function ThresholdInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-surface-600 w-32 flex-shrink-0">{label}</label>
      <input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 border border-surface-200 rounded px-2 py-1 text-xs text-surface-800 focus:outline-none focus:border-indigo-400"
      />
      <span className="text-xs text-surface-400">%</span>
    </div>
  );
}

export default function SetlistRarityTool() {
  const [selectedBandId, setSelectedBandId]   = useState('');
  const [thresholds, setThresholds]           = useState<RarityThresholds>(DEFAULT_THRESHOLDS);
  const [showThresholds, setShowThresholds]   = useState(false);
  const [filter, setFilter]                   = useState<'all' | 'changed' | 'unmatched'>('all');
  const [selected, setSelected]               = useState<Set<string>>(new Set());
  const [overrides, setOverrides]             = useState<Map<string, SongRarityValue>>(new Map());
  const [confirmApply, setConfirmApply]       = useState(false);
  const [applyResult, setApplyResult]         = useState<{ updated: number } | null>(null);

  const { data: bands = [] } = useQuery({
    queryKey: ['bands'],
    queryFn:  () => bandsApi.list(),
    staleTime: 5 * 60_000,
  });

  const { data: liveStatus } = useQuery({
    queryKey: ['live-data-status', selectedBandId],
    queryFn:  () => bandRpgApi.getLiveDataStatus(selectedBandId),
    enabled:  !!selectedBandId,
    staleTime: 15_000,
  });

  const {
    mutate:     loadSuggestions,
    data:       suggestions,
    isPending:  isLoading,
    isError:    isLoadError,
    reset:      resetSuggestions,
  } = useMutation({
    mutationFn: () => bandRpgApi.getRaritySuggestions(selectedBandId, thresholds),
    onSuccess:  () => {
      setSelected(new Set());
      setOverrides(new Map());
      setConfirmApply(false);
      setApplyResult(null);
    },
  });

  const applyMutation = useMutation({
    mutationFn: (entries: Array<{ songId: string; rarity: SongRarityValue }>) =>
      bandRpgApi.applySongRarities(entries),
    onSuccess: (r) => {
      setApplyResult(r);
      setConfirmApply(false);
      setSelected(new Set());
    },
  });

  const effectiveRarity = (s: RaritySuggestion): SongRarityValue | null =>
    overrides.get(s.songId) ?? s.suggestedRarity ?? null;

  const filteredSongs = (suggestions?.songs ?? []).filter((s) => {
    if (filter === 'changed')   return effectiveRarity(s) !== null && effectiveRarity(s) !== s.currentRarity;
    if (filter === 'unmatched') return !s.hasProfile;
    return true;
  });

  const entriesToApply: Array<{ songId: string; rarity: SongRarityValue }> = [];
  for (const songId of selected) {
    const song = suggestions?.songs.find((s) => s.songId === songId);
    if (!song) continue;
    const rarity = effectiveRarity(song);
    if (rarity) entriesToApply.push({ songId, rarity });
  }

  function toggleAll() {
    if (selected.size === 0) {
      const ids = (suggestions?.songs ?? [])
        .filter((s) => s.suggestedRarity !== null || overrides.has(s.songId))
        .map((s) => s.songId);
      setSelected(new Set(ids));
    } else {
      setSelected(new Set());
    }
  }

  const hasLiveData = liveStatus && liveStatus.fetchStatus === 'complete' && liveStatus.fetchedShows > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-200 bg-white p-6">
        <h2 className="font-semibold text-surface-900 mb-1">Song Rarity — Setlist.fm Suggestions</h2>
        <p className="text-sm text-surface-500 leading-relaxed">
          Uses real performance history to suggest a rarity tier for each song.
          Requires live data to have been fetched for the band first (Live Data tab).
        </p>
      </div>

      {/* Band picker */}
      <div className="rounded-xl border border-surface-200 bg-white p-5">
        <label className="block text-xs font-medium text-surface-700 mb-1">Select band</label>
        <select
          value={selectedBandId}
          onChange={(e) => {
            setSelectedBandId(e.target.value);
            resetSuggestions();
            setSelected(new Set());
            setOverrides(new Map());
            setConfirmApply(false);
            setApplyResult(null);
          }}
          className="border border-surface-300 bg-white rounded-lg px-3 py-2 text-sm text-surface-800 focus:outline-none focus:border-indigo-500 min-w-56"
        >
          <option value="">— choose a band —</option>
          {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {selectedBandId && (
        <>
          {/* Live data gate */}
          {liveStatus === undefined ? (
            <p className="text-sm text-surface-400 animate-pulse">Checking live data status…</p>
          ) : !liveStatus ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No live data record for this band. Go to the <strong>Live Data</strong> tab to connect a
              Setlist.fm artist and fetch performance history first.
            </div>
          ) : liveStatus.fetchStatus !== 'complete' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Live data status: <strong>{liveStatus.fetchStatus}</strong>. Suggestions require a completed
              fetch. Go to the <strong>Live Data</strong> tab to run the fetch.
            </div>
          ) : null}

          {/* Shows analyzed line */}
          {liveStatus && (
            <div className="flex items-center gap-4 text-sm text-surface-500">
              <span>
                Shows analyzed:{' '}
                <strong className="text-surface-800">{liveStatus.fetchedShows.toLocaleString()}</strong>
                {' / '}{liveStatus.totalShows.toLocaleString()} total
              </span>
              {liveStatus.lastFetchedAt && (
                <span className="text-surface-400 text-xs">
                  Last fetched: {new Date(liveStatus.lastFetchedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          )}

          {/* Threshold configurator */}
          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <button
              onClick={() => setShowThresholds((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-surface-700 hover:text-surface-900"
            >
              <span>{showThresholds ? '▾' : '▸'}</span>
              Rarity Thresholds (% of shows)
              {!showThresholds && (
                <span className="text-xs text-surface-400 font-normal ml-2">
                  Common≥{thresholds.common}% · Uncommon≥{thresholds.uncommon}% · Rare≥{thresholds.rare}% · Legendary≥{thresholds.legendary}%
                </span>
              )}
            </button>
            {showThresholds && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-surface-500 mb-3">
                  A song played in ≥X% of analyzed shows gets that rarity. Songs below all thresholds → Mythic.
                </p>
                <ThresholdInput label="Common (≥)" value={thresholds.common} onChange={(v) => setThresholds((t) => ({ ...t, common: v }))} />
                <ThresholdInput label="Uncommon (≥)" value={thresholds.uncommon} onChange={(v) => setThresholds((t) => ({ ...t, uncommon: v }))} />
                <ThresholdInput label="Rare (≥)" value={thresholds.rare} onChange={(v) => setThresholds((t) => ({ ...t, rare: v }))} />
                <ThresholdInput label="Legendary (≥)" value={thresholds.legendary} onChange={(v) => setThresholds((t) => ({ ...t, legendary: v }))} />
                <p className="text-xs text-surface-400 mt-1">Below {thresholds.legendary}% (or never played) → <strong>Mythic</strong></p>
                <button
                  onClick={() => setThresholds(DEFAULT_THRESHOLDS)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                >
                  Reset to defaults
                </button>
              </div>
            )}
          </div>

          {/* Load button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadSuggestions()}
              disabled={isLoading || !hasLiveData}
              title={!hasLiveData ? 'Fetch live data first in the Live Data tab' : undefined}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              {isLoading ? 'Loading…' : suggestions ? 'Recalculate' : 'Load Suggestions'}
            </button>
            {isLoading && (
              <span className="text-xs text-surface-400 animate-pulse">Analyzing performance data…</span>
            )}
            {isLoadError && (
              <span className="text-sm text-red-600">Failed to load. Check server logs.</span>
            )}
          </div>
        </>
      )}

      {/* Results */}
      {suggestions && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total songs',  value: suggestions.totalSongs,    color: 'text-surface-900' },
              { label: 'Matched',      value: suggestions.matchedSongs,  color: 'text-emerald-700' },
              { label: 'Unmatched',    value: suggestions.unmatchedSongs, color: 'text-amber-700' },
              { label: 'Have changes', value: suggestions.songs.filter((s) => s.changed).length, color: 'text-indigo-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-surface-200 bg-white p-4 text-center">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-surface-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Apply result toast */}
          {applyResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-medium">
              ✓ Applied rarity to {applyResult.updated} song{applyResult.updated !== 1 ? 's' : ''} successfully.
            </div>
          )}

          {/* Filter tabs + select all */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1">
              {([['all', 'All'], ['changed', 'Has changes'], ['unmatched', 'Unmatched']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === id ? 'bg-surface-900 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-800 underline">
                {selected.size === 0 ? 'Select all with suggestions' : 'Deselect all'}
              </button>
              <span className="text-xs text-surface-400">{selected.size} selected</span>
            </div>
          </div>

          {/* Song table */}
          <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
            <div className="overflow-x-auto" style={{ maxHeight: 520 }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-50 border-b border-surface-200 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-surface-600 w-8">✓</th>
                    <th className="text-left px-3 py-2 font-medium text-surface-600">Song</th>
                    <th className="text-left px-3 py-2 font-medium text-surface-600">Album</th>
                    <th className="text-left px-3 py-2 font-medium text-surface-600">Current</th>
                    <th className="text-left px-3 py-2 font-medium text-surface-600">Suggested</th>
                    <th className="text-right px-3 py-2 font-medium text-surface-600">Plays</th>
                    <th className="text-right px-3 py-2 font-medium text-surface-600">%</th>
                    <th className="text-left px-3 py-2 font-medium text-surface-600">Conf</th>
                    <th className="text-left px-3 py-2 font-medium text-surface-600">Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {filteredSongs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-surface-400">
                        No songs match this filter.
                      </td>
                    </tr>
                  )}
                  {filteredSongs.map((s) => {
                    const effective  = effectiveRarity(s);
                    const isSelected = selected.has(s.songId);
                    const rowChanged = effective !== null && effective !== s.currentRarity;
                    return (
                      <tr
                        key={s.songId}
                        className={`transition-colors ${isSelected ? 'bg-indigo-50' : rowChanged ? 'bg-amber-50/40' : 'hover:bg-surface-50'}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={effective === null}
                            onChange={(e) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(s.songId) : next.delete(s.songId);
                                return next;
                              });
                            }}
                            className="rounded cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-surface-800 max-w-48 truncate" title={s.songTitle}>
                          {s.songTitle}
                        </td>
                        <td className="px-3 py-2 text-surface-500 max-w-32 truncate" title={s.albumTitle ?? ''}>
                          {s.albumTitle ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <RarityBadge value={s.currentRarity} />
                        </td>
                        <td className="px-3 py-2">
                          <RarityBadge value={s.suggestedRarity} />
                          {!s.hasProfile && (
                            <span className="ml-1 text-amber-500" title="No Setlist.fm profile for this song">⚠</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-surface-600 tabular-nums">
                          {s.hasProfile ? s.totalPerformances : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-surface-600 tabular-nums">
                          {s.hasProfile ? `${s.performancePct.toFixed(1)}%` : '—'}
                        </td>
                        <td className={`px-3 py-2 ${CONFIDENCE_STYLE[s.confidence] ?? 'text-surface-400'}`}>
                          {CONFIDENCE_LABEL[s.confidence] ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={overrides.get(s.songId) ?? ''}
                            onChange={(e) => {
                              const v = e.target.value as SongRarityValue | '';
                              setOverrides((prev) => {
                                const next = new Map(prev);
                                if (v) { next.set(s.songId, v); } else { next.delete(s.songId); }
                                return next;
                              });
                              if (v) {
                                setSelected((prev) => { const next = new Set(prev); next.add(s.songId); return next; });
                              }
                            }}
                            className="border border-surface-200 rounded px-1 py-0.5 text-xs text-surface-700 bg-white focus:outline-none focus:border-indigo-400"
                          >
                            <option value="">{s.suggestedRarity ?? 'no suggestion'}</option>
                            {SONG_RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Apply section */}
          <div className="rounded-xl border border-surface-200 bg-white p-5">
            <h3 className="font-semibold text-surface-900 mb-1">Apply Rarity Changes</h3>
            <p className="text-sm text-surface-500 mb-4">
              {entriesToApply.length === 0
                ? 'Select songs above to enable applying.'
                : `${entriesToApply.length} song${entriesToApply.length !== 1 ? 's' : ''} will have their rarity updated. This overwrites existing rarity values.`}
            </p>

            {!confirmApply ? (
              <button
                onClick={() => setConfirmApply(true)}
                disabled={entriesToApply.length === 0 || applyMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                Apply {entriesToApply.length > 0 ? `${entriesToApply.length} ` : ''}Changes
              </button>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-surface-700 font-medium">
                  This will overwrite {entriesToApply.length} song rarity value{entriesToApply.length !== 1 ? 's' : ''}. Continue?
                </span>
                <button
                  onClick={() => { applyMutation.mutate(entriesToApply); }}
                  disabled={applyMutation.isPending}
                  className="bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
                >
                  {applyMutation.isPending ? 'Applying…' : 'Yes, Apply'}
                </button>
                <button onClick={() => setConfirmApply(false)} className="text-sm text-surface-500 hover:text-surface-700">
                  Cancel
                </button>
              </div>
            )}
            {applyMutation.isError && (
              <p className="mt-3 text-sm text-red-600">Apply failed. Check server logs.</p>
            )}
          </div>

          {/* Unmatched songs notice */}
          {suggestions.unmatchedSongs > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <strong>{suggestions.unmatchedSongs} songs</strong> have no Setlist.fm profile.
              They may be studio-only tracks, or their titles didn't match during the live data fetch.
              Use the <strong>Unmatched</strong> filter to review them.
              You can still assign rarities manually using the Override column.
            </div>
          )}
        </>
      )}
    </div>
  );
}

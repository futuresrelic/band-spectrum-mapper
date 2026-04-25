import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { bandsApi } from '../api/bands';
import { analysisApi } from '../api/analysis';
import RadarChart from '../components/charts/RadarChart';
import WordFrequencyTable from '../components/charts/WordFrequencyTable';
import WordCloudChart from '../components/charts/WordCloudChart';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import type { CompareQueryInput, AxisScoreMap, WordSongLink } from '@band-spectrum-mapper/shared';

type CompareMode = 'band' | 'album';

const COLORS = { A: '#374151', B: '#6366f1', C: '#f97316' };

// ─── word-click panel ─────────────────────────────────────────────────────────

function WordSongsPanel({
  word,
  links,
  onClose,
}: {
  word: string;
  links: WordSongLink[];
  onClose: () => void;
}) {
  const link = links.find((l) => l.word === word);
  return (
    <div className="card border-indigo-200 bg-indigo-50 mt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-sm">
          Songs containing <code className="font-mono bg-indigo-100 px-1.5 py-0.5 rounded">{word}</code>
          {link && <span className="text-surface-500 font-normal ml-2">({link.totalCount} total occurrences)</span>}
        </p>
        <button className="text-xs text-surface-500 hover:text-surface-800" onClick={onClose}>✕ Close</button>
      </div>
      {!link ? (
        <p className="text-sm text-surface-500 italic">
          This word isn't in the top-N list — try increasing Top N Words.
        </p>
      ) : (
        <ul className="space-y-1">
          {link.songs.sort((a, b) => b.count - a.count).map((s) => (
            <li key={s.songId} className="flex items-center gap-2 text-xs">
              <Link to={`/library/songs/${s.songId}`} className="font-medium hover:underline text-surface-900">
                {s.title}
              </Link>
              {s.bandName && <span className="text-surface-500">· {s.bandName}</span>}
              {s.albumTitle && <span className="text-surface-400">/ {s.albumTitle}</span>}
              <span className="ml-auto tabular-nums text-surface-400">×{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── selection column ─────────────────────────────────────────────────────────

interface SelectionConfig {
  bandId: string;
  albumId: string;
  label: string;
  color: string;
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const [mode, setMode] = useState<CompareMode>('band');
  const [showC, setShowC] = useState(false);

  const [cfgA, setCfgA] = useState<SelectionConfig>({ bandId: '', albumId: '', label: 'Selection A', color: COLORS.A });
  const [cfgB, setCfgB] = useState<SelectionConfig>({ bandId: '', albumId: '', label: 'Selection B', color: COLORS.B });
  const [cfgC, setCfgC] = useState<SelectionConfig>({ bandId: '', albumId: '', label: 'Selection C', color: COLORS.C });

  const [topN, setTopN] = useState(30);
  const [clickedWord, setClickedWord] = useState<string | null>(null);
  const [wordPanelSource, setWordPanelSource] = useState<'A' | 'B' | 'C' | null>(null);

  const { data: bands } = useQuery({ queryKey: ['bands'], queryFn: () => bandsApi.list() });

  const { data: albumsA } = useQuery({
    queryKey: ['albums', cfgA.bandId],
    queryFn: () => bandsApi.listAlbums(cfgA.bandId),
    enabled: !!cfgA.bandId && mode === 'album',
  });
  const { data: albumsB } = useQuery({
    queryKey: ['albums', cfgB.bandId],
    queryFn: () => bandsApi.listAlbums(cfgB.bandId),
    enabled: !!cfgB.bandId && mode === 'album',
  });
  const { data: albumsC } = useQuery({
    queryKey: ['albums', cfgC.bandId],
    queryFn: () => bandsApi.listAlbums(cfgC.bandId),
    enabled: !!cfgC.bandId && mode === 'album' && showC,
  });

  const buildLabel = useCallback((cfg: SelectionConfig, albums: typeof albumsA) => {
    if (mode === 'band') return bands?.find((b) => b.id === cfg.bandId)?.name ?? cfg.label;
    return albums?.find((a) => a.id === cfg.albumId)?.title ?? cfg.label;
  }, [mode, bands]);

  const compareMutation = useMutation({
    mutationFn: () => {
      const query: CompareQueryInput = {
        topN,
        minWordLength: 2,
        selectionA: {
          label: buildLabel(cfgA, albumsA),
          ...(mode === 'band' ? { bandIds: [cfgA.bandId] } : { albumIds: [cfgA.albumId] }),
        },
        selectionB: {
          label: buildLabel(cfgB, albumsB),
          ...(mode === 'band' ? { bandIds: [cfgB.bandId] } : { albumIds: [cfgB.albumId] }),
        },
        ...(showC && (mode === 'band' ? cfgC.bandId : cfgC.albumId) ? {
          selectionC: {
            label: buildLabel(cfgC, albumsC),
            ...(mode === 'band' ? { bandIds: [cfgC.bandId] } : { albumIds: [cfgC.albumId] }),
          },
        } : {}),
      };
      return analysisApi.compare(query);
    },
    onSuccess: () => { setClickedWord(null); setWordPanelSource(null); },
  });

  const result = compareMutation.data;

  const canRun = mode === 'band'
    ? !!cfgA.bandId && !!cfgB.bandId && (!showC || !!cfgC.bandId)
    : !!cfgA.albumId && !!cfgB.albumId && (!showC || !!cfgC.albumId);

  const handleWordClick = useCallback((word: string, source: 'A' | 'B' | 'C') => {
    if (clickedWord === word && wordPanelSource === source) {
      setClickedWord(null); setWordPanelSource(null);
    } else {
      setClickedWord(word); setWordPanelSource(source);
    }
  }, [clickedWord, wordPanelSource]);

  const getLinksForSource = (src: 'A' | 'B' | 'C') => {
    if (!result) return [];
    const analysis = src === 'A' ? result.selectionA.analysis
      : src === 'B' ? result.selectionB.analysis
      : result.selectionC?.analysis;
    return analysis?.wordSongLinks ?? [];
  };

  // Radar datasets
  const radarDatasets = result ? [
    { label: result.selectionA.label, scores: result.selectionA.scores as AxisScoreMap, color: COLORS.A },
    { label: result.selectionB.label, scores: result.selectionB.scores as AxisScoreMap, color: COLORS.B },
    ...(result.selectionC ? [{ label: result.selectionC.label, scores: result.selectionC.scores as AxisScoreMap, color: COLORS.C }] : []),
  ] : [];

  const SelectionColumn = ({ cfg, setCfg, label, color, albums }: {
    cfg: SelectionConfig;
    setCfg: (c: SelectionConfig) => void;
    label: string;
    color: string;
    albums: typeof albumsA;
  }) => (
    <div className="space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-2">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        {label}
      </h3>
      <div>
        <label className="label">Band</label>
        <select className="input" value={cfg.bandId} onChange={(e) => setCfg({ ...cfg, bandId: e.target.value, albumId: '' })}>
          <option value="">Select…</option>
          {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {mode === 'album' && albums && (
        <div>
          <label className="label">Album</label>
          <select className="input" value={cfg.albumId} onChange={(e) => setCfg({ ...cfg, albumId: e.target.value })}>
            <option value="">Select…</option>
            {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title="Compare" subtitle="Compare two or three bands or albums — spectrum, word clouds, shared vocabulary" />

      <div className="card mb-6 space-y-4">
        {/* Mode + 3-band toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          {(['band', 'album'] as CompareMode[]).map((m) => (
            <button key={m} className={m === mode ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode(m)}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
          <div className="ml-auto">
            <button
              className={showC ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
              onClick={() => { setShowC((v) => !v); setClickedWord(null); }}
            >
              {showC ? '✕ Remove 3rd band' : '+ Add 3rd band'}
            </button>
          </div>
        </div>

        {/* Selection columns */}
        <div className={`grid gap-4 ${showC ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <SelectionColumn cfg={cfgA} setCfg={setCfgA} label="Selection A" color={COLORS.A} albums={albumsA} />
          <SelectionColumn cfg={cfgB} setCfg={setCfgB} label="Selection B" color={COLORS.B} albums={albumsB} />
          {showC && <SelectionColumn cfg={cfgC} setCfg={setCfgC} label="Selection C" color={COLORS.C} albums={albumsC} />}
        </div>

        {/* Top N + run */}
        <div className="flex items-end gap-4">
          <div>
            <label className="label">Top N Words <span className="text-surface-400 font-normal">(max 500)</span></label>
            <input
              className="input w-28"
              type="number"
              min="5"
              max="500"
              value={topN}
              onChange={(e) => setTopN(Math.min(500, parseInt(e.target.value) || 30))}
            />
          </div>
          <button className="btn-primary" disabled={!canRun || compareMutation.isPending} onClick={() => compareMutation.mutate()}>
            {compareMutation.isPending ? 'Comparing…' : 'Compare'}
          </button>
        </div>

        <p className="text-xs text-surface-500">
          Click any word in the clouds below to see which songs contain it.
        </p>
      </div>

      {compareMutation.isError && <ErrorMessage error={compareMutation.error} />}

      {result && (
        <div className="space-y-6">
          {/* Radar */}
          {radarDatasets.length > 0 && (
            <div className="card">
              <h2 className="mb-4">Spectrum Comparison</h2>
              <RadarChart datasets={radarDatasets} />
            </div>
          )}

          {/* Word clouds */}
          <div className={`grid gap-4 ${result.selectionC ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {([
              { key: 'A' as const, sel: result.selectionA, color: COLORS.A },
              { key: 'B' as const, sel: result.selectionB, color: COLORS.B },
              ...(result.selectionC ? [{ key: 'C' as const, sel: result.selectionC, color: COLORS.C }] : []),
            ]).map(({ key, sel, color }) => (
              <div key={key} className="card">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <h3 className="text-sm font-semibold">{sel.label}</h3>
                </div>
                <p className="text-xs text-surface-500 mb-3">
                  {sel.analysis.totalWords.toLocaleString()} words · {sel.analysis.uniqueWords.toLocaleString()} unique
                </p>
                <WordCloudChart
                  data={sel.analysis.wordCloudData}
                  height={180}
                  onWordClick={(word) => handleWordClick(word, key)}
                />
                {clickedWord && wordPanelSource === key && (
                  <WordSongsPanel
                    word={clickedWord}
                    links={getLinksForSource(key)}
                    onClose={() => { setClickedWord(null); setWordPanelSource(null); }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Shared & unique word tables */}
          <div className={`grid gap-4 ${result.selectionC ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <div className="card">
              <WordFrequencyTable words={result.sharedTopWords} title={result.selectionC ? 'Shared (all 3)' : 'Shared Top Words'} />
            </div>
            <div className="card">
              <WordFrequencyTable
                words={result.uniqueToA}
                title={`Unique to ${result.selectionA.label}`}
                songLinks={result.selectionA.analysis.wordSongLinks}
              />
            </div>
            <div className="card">
              <WordFrequencyTable
                words={result.uniqueToB}
                title={`Unique to ${result.selectionB.label}`}
                songLinks={result.selectionB.analysis.wordSongLinks}
              />
            </div>
            {result.selectionC && result.uniqueToC && (
              <div className="card">
                <WordFrequencyTable
                  words={result.uniqueToC}
                  title={`Unique to ${result.selectionC.label}`}
                  songLinks={result.selectionC.analysis.wordSongLinks}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

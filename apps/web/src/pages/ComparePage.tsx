import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import { analysisApi } from '../api/analysis';
import RadarChart from '../components/charts/RadarChart';
import WordFrequencyTable from '../components/charts/WordFrequencyTable';
import WordCloudChart from '../components/charts/WordCloudChart';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import type { CompareQueryInput, AxisScoreMap } from '@band-spectrum-mapper/shared';

type CompareMode = 'band' | 'album';

const COLORS = { A: '#374151', B: '#6366f1' };

export default function ComparePage() {
  const [mode, setMode] = useState<CompareMode>('band');
  const [bandA, setBandA] = useState('');
  const [bandB, setBandB] = useState('');
  const [albumA, setAlbumA] = useState('');
  const [albumB, setAlbumB] = useState('');
  const [topN, setTopN] = useState(30);

  const { data: bands } = useQuery({ queryKey: ['bands'], queryFn: () => bandsApi.list() });

  const { data: albumsA } = useQuery({
    queryKey: ['albums', bandA],
    queryFn: () => bandsApi.listAlbums(bandA),
    enabled: !!bandA && mode === 'album',
  });
  const { data: albumsB } = useQuery({
    queryKey: ['albums', bandB],
    queryFn: () => bandsApi.listAlbums(bandB),
    enabled: !!bandB && mode === 'album',
  });

  const compareMutation = useMutation({
    mutationFn: () => {
      const labelA = mode === 'band'
        ? bands?.find((b) => b.id === bandA)?.name ?? 'Selection A'
        : albumsA?.find((a) => a.id === albumA)?.title ?? 'Selection A';
      const labelB = mode === 'band'
        ? bands?.find((b) => b.id === bandB)?.name ?? 'Selection B'
        : albumsB?.find((a) => a.id === albumB)?.title ?? 'Selection B';

      const query: CompareQueryInput = {
        topN,
        minWordLength: 2,
        selectionA: {
          label: labelA,
          ...(mode === 'band' ? { bandIds: [bandA] } : { albumIds: [albumA] }),
        },
        selectionB: {
          label: labelB,
          ...(mode === 'band' ? { bandIds: [bandB] } : { albumIds: [albumB] }),
        },
      };
      return analysisApi.compare(query);
    },
  });

  const result = compareMutation.data;
  const canRun = mode === 'band' ? !!bandA && !!bandB : !!albumA && !!albumB;

  const scoresA: AxisScoreMap | null = result
    ? result.selectionA.scores
    : null;
  const scoresB: AxisScoreMap | null = result ? result.selectionB.scores : null;

  return (
    <div>
      <PageHeader title="Compare" subtitle="Compare two bands, albums, or custom selections" />

      <div className="card mb-6 space-y-4">
        <div className="flex gap-2">
          {(['band', 'album'] as CompareMode[]).map((m) => (
            <button
              key={m}
              className={m === mode ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setMode(m)}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-surface-700">Selection A</h3>
            <div>
              <label className="label">Band</label>
              <select className="input" value={bandA} onChange={(e) => { setBandA(e.target.value); setAlbumA(''); }}>
                <option value="">Select...</option>
                {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {mode === 'album' && albumsA && (
              <div>
                <label className="label">Album</label>
                <select className="input" value={albumA} onChange={(e) => setAlbumA(e.target.value)}>
                  <option value="">Select...</option>
                  {albumsA.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-surface-700">Selection B</h3>
            <div>
              <label className="label">Band</label>
              <select className="input" value={bandB} onChange={(e) => { setBandB(e.target.value); setAlbumB(''); }}>
                <option value="">Select...</option>
                {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {mode === 'album' && albumsB && (
              <div>
                <label className="label">Album</label>
                <select className="input" value={albumB} onChange={(e) => setAlbumB(e.target.value)}>
                  <option value="">Select...</option>
                  {albumsB.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div>
            <label className="label">Top N Words</label>
            <input
              className="input w-24"
              type="number"
              min="5"
              max="100"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value) || 30)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!canRun || compareMutation.isPending}
            onClick={() => compareMutation.mutate()}
          >
            {compareMutation.isPending ? 'Comparing...' : 'Compare'}
          </button>
        </div>
      </div>

      {compareMutation.isError && <ErrorMessage error={compareMutation.error} />}

      {result && (
        <div className="space-y-6">
          {/* Radar comparison */}
          {scoresA && scoresB && (
            <div className="card">
              <h2 className="mb-4">Spectrum Comparison</h2>
              <RadarChart
                datasets={[
                  { label: result.selectionA.label, scores: scoresA, color: COLORS.A },
                  { label: result.selectionB.label, scores: scoresB, color: COLORS.B },
                ]}
              />
            </div>
          )}

          {/* Word clouds side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <h3 className="mb-3">{result.selectionA.label}</h3>
              <div className="text-xs text-surface-700 mb-2">
                {result.selectionA.analysis.totalWords} words / {result.selectionA.analysis.uniqueWords} unique
              </div>
              <WordCloudChart data={result.selectionA.analysis.wordCloudData} height={180} />
            </div>
            <div className="card">
              <h3 className="mb-3">{result.selectionB.label}</h3>
              <div className="text-xs text-surface-700 mb-2">
                {result.selectionB.analysis.totalWords} words / {result.selectionB.analysis.uniqueWords} unique
              </div>
              <WordCloudChart data={result.selectionB.analysis.wordCloudData} height={180} />
            </div>
          </div>

          {/* Shared and unique words */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card">
              <WordFrequencyTable words={result.sharedTopWords} title="Shared Top Words" />
            </div>
            <div className="card">
              <WordFrequencyTable
                words={result.uniqueToA}
                title={`Unique to ${result.selectionA.label}`}
              />
            </div>
            <div className="card">
              <WordFrequencyTable
                words={result.uniqueToB}
                title={`Unique to ${result.selectionB.label}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

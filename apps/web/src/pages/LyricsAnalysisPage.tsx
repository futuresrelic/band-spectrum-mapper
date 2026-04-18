import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import { analysisApi } from '../api/analysis';
import WordCloudChart from '../components/charts/WordCloudChart';
import WordFrequencyTable from '../components/charts/WordFrequencyTable';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';

type Scope = 'song' | 'album' | 'band';

export default function LyricsAnalysisPage() {
  const [scope, setScope] = useState<Scope>('band');
  const [bandId, setBandId] = useState('');
  const [albumId, setAlbumId] = useState('');
  const [songId, setSongId] = useState('');
  const [topN, setTopN] = useState(50);
  const [runAnalysis, setRunAnalysis] = useState(false);

  const { data: bands } = useQuery({ queryKey: ['bands'], queryFn: () => bandsApi.list() });
  const { data: albums } = useQuery({
    queryKey: ['albums', bandId],
    queryFn: () => bandsApi.listAlbums(bandId),
    enabled: !!bandId && scope !== 'band',
  });
  const { data: songs } = useQuery({
    queryKey: ['songs', bandId],
    queryFn: () => bandsApi.listSongs(bandId),
    enabled: !!bandId && scope === 'song',
  });

  const targetId = scope === 'band' ? bandId : scope === 'album' ? albumId : songId;

  const {
    data: analysis,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['analysis', scope, targetId, topN],
    queryFn: () => {
      if (scope === 'band') return analysisApi.analyzeBand(bandId, topN);
      if (scope === 'album') return analysisApi.analyzeAlbum(albumId, topN);
      return analysisApi.analyzeSong(songId, topN);
    },
    enabled: false,
  });

  const canRun = scope === 'band' ? !!bandId : scope === 'album' ? !!albumId : !!songId;

  return (
    <div>
      <PageHeader title="Lyrics Analysis" subtitle="Word frequency, top words, and word cloud" />

      <div className="card mb-6 space-y-4">
        <div className="flex gap-2">
          {(['band', 'album', 'song'] as Scope[]).map((s) => (
            <button
              key={s}
              className={s === scope ? 'btn-primary' : 'btn-secondary'}
              onClick={() => { setScope(s); setSongId(''); setAlbumId(''); }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Band</label>
            <select className="input" value={bandId} onChange={(e) => { setBandId(e.target.value); setSongId(''); setAlbumId(''); }}>
              <option value="">Select...</option>
              {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {scope !== 'band' && albums && (
            <div>
              <label className="label">Album</label>
              <select className="input" value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
                <option value="">Select...</option>
                {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>
          )}

          {scope === 'song' && songs && (
            <div>
              <label className="label">Song</label>
              <select className="input" value={songId} onChange={(e) => setSongId(e.target.value)}>
                <option value="">Select...</option>
                {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">Top N Words</label>
            <input
              className="input"
              type="number"
              min="10"
              max="200"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value) || 50)}
            />
          </div>
        </div>

        <button
          className="btn-primary"
          disabled={!canRun || isLoading}
          onClick={() => refetch()}
        >
          {isLoading ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      {error && <ErrorMessage error={error} />}

      {analysis && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Total Words</p>
              <p className="text-2xl font-bold">{analysis.totalWords.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Unique Words</p>
              <p className="text-2xl font-bold">{analysis.uniqueWords.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Top Words</p>
              <p className="text-2xl font-bold">{analysis.topWords.length}</p>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4">Word Cloud</h2>
            <WordCloudChart data={analysis.wordCloudData} />
          </div>

          <div className="card">
            <WordFrequencyTable words={analysis.topWords} title="Top Words" />
          </div>
        </div>
      )}
    </div>
  );
}

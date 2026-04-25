import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import { analysisApi } from '../api/analysis';
import WordCloudChart from '../components/charts/WordCloudChart';
import WordFrequencyTable from '../components/charts/WordFrequencyTable';
import WordSongGraph from '../components/charts/WordSongGraph';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';
import type { WordFrequency } from '@band-spectrum-mapper/shared';

type Scope = 'song' | 'album' | 'band';
type ResultTab = 'cloud' | 'graph' | 'phrases' | 'table';
type SortOrder = 'desc' | 'asc';

function sortWords(words: WordFrequency[], order: SortOrder): WordFrequency[] {
  return order === 'desc' ? words : [...words].reverse();
}

export default function LyricsAnalysisPage() {
  const [scope, setScope] = useState<Scope>('band');
  const [bandId, setBandId] = useState('');
  const [albumId, setAlbumId] = useState('');
  const [songId, setSongId] = useState('');

  // Query parameters (trigger re-fetch)
  const [topN, setTopN] = useState(50);
  const [minCount, setMinCount] = useState(2);
  const [ngramN, setNgramN] = useState<2 | 3>(2);

  // Client-side filters (no re-fetch needed)
  const [wordFilter, setWordFilter] = useState('');
  const [maxCount, setMaxCount] = useState(0);   // 0 = no upper limit
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Result view
  const [resultTab, setResultTab] = useState<ResultTab>('cloud');

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
  const isMultiSong = scope === 'band' || scope === 'album';

  const {
    data: analysis,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['analysis', scope, targetId, topN, minCount, ngramN],
    queryFn: () => {
      const opts = {
        topN,
        minCount,
        includeNgrams: true,
        ngramN,
        includeWordSongLinks: isMultiSong,
      };
      if (scope === 'band') return analysisApi.analyzeBand(bandId, opts);
      if (scope === 'album') return analysisApi.analyzeAlbum(albumId, opts);
      return analysisApi.analyzeSong(songId, opts);
    },
    enabled: false,
  });

  const canRun = scope === 'band' ? !!bandId : scope === 'album' ? !!albumId : !!songId;

  // Apply text filter and optional max-count cap, then sort
  const applyFilters = (words: WordFrequency[]) => {
    let result = words;
    if (wordFilter.trim()) {
      const terms = wordFilter.toLowerCase().split(/[,\s]+/).filter(Boolean);
      result = result.filter((w) => terms.some((t) => w.word.includes(t)));
    }
    if (maxCount > 0) {
      result = result.filter((w) => w.count <= maxCount);
    }
    return sortWords(result, sortOrder);
  };

  const filteredTopWords = useMemo(
    () => (analysis ? applyFilters(analysis.topWords) : []),
    [analysis, wordFilter, maxCount, sortOrder],
  );

  const filteredCloudData = useMemo(
    () => filteredTopWords.map((w) => ({ text: w.word, value: w.count })),
    [filteredTopWords],
  );

  const filteredPhrases = useMemo(
    () => sortWords(analysis?.topPhrases ?? [], sortOrder),
    [analysis, sortOrder],
  );

  const filteredLinks = useMemo(() => {
    let result = analysis?.wordSongLinks ?? [];
    if (wordFilter.trim()) {
      const terms = wordFilter.toLowerCase().split(/[,\s]+/).filter(Boolean);
      result = result.filter((l) => terms.some((t) => l.word.includes(t)));
    }
    if (maxCount > 0) {
      result = result.filter((l) => l.totalCount <= maxCount);
    }
    return result; // order handled by WordSongGraph via reversed prop
  }, [analysis, wordFilter, maxCount]);

  const tabs: { id: ResultTab; label: string; disabled?: boolean }[] = [
    { id: 'cloud', label: 'Word Cloud' },
    { id: 'graph', label: 'Word-Song Graph', disabled: !isMultiSong },
    { id: 'phrases', label: `Phrases (${ngramN === 2 ? 'bi' : 'tri'}grams)` },
    { id: 'table', label: 'Frequency Table' },
  ];

  return (
    <div>
      <PageHeader title="Lyrics Analysis" subtitle="Word frequency, phrases, and word-song relationships" />

      {/* Query controls */}
      <div className="card mb-6 space-y-4">
        {/* Scope selector */}
        <div className="flex flex-wrap gap-2">
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

        {/* Entity selectors */}
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
        </div>

        {/* Fetch params */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Top N Words <span className="text-surface-400 font-normal">(max 2000)</span></label>
            <input className="input" type="number" min="10" max="2000" value={topN}
              onChange={(e) => setTopN(Math.min(2000, parseInt(e.target.value) || 50))} />
          </div>
          <div>
            <label className="label">Min Occurrences</label>
            <input className="input" type="number" min="0" max="999" value={minCount}
              onChange={(e) => setMinCount(parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Phrase Size</label>
            <select className="input" value={ngramN} onChange={(e) => setNgramN(parseInt(e.target.value) as 2 | 3)}>
              <option value={2}>Bigrams (2 words)</option>
              <option value={3}>Trigrams (3 words)</option>
            </select>
          </div>
        </div>

        <button className="btn-primary" disabled={!canRun || isLoading} onClick={() => refetch()}>
          {isLoading ? 'Analyzing...' : 'Run Analysis'}
        </button>
      </div>

      {error && <ErrorMessage error={error} />}

      {analysis && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card text-center">
              <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Total Words</p>
              <p className="text-2xl font-bold">{analysis.totalWords.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Unique Words</p>
              <p className="text-2xl font-bold">{analysis.uniqueWords.toLocaleString()}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Shown Words</p>
              <p className="text-2xl font-bold">{filteredTopWords.length}</p>
            </div>
            <div className="card text-center">
              <p className="text-xs text-surface-700 uppercase tracking-wide mb-1">Top Phrases</p>
              <p className="text-2xl font-bold">{filteredPhrases.length}</p>
            </div>
          </div>

          {/* Result view */}
          <div className="card">
            {/* Tab row */}
            <div className="flex flex-wrap gap-1 mb-4 border-b border-surface-200 pb-3">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  disabled={tab.disabled}
                  className={
                    tab.id === resultTab
                      ? 'btn-primary text-sm'
                      : tab.disabled
                        ? 'btn-secondary text-sm opacity-40 cursor-not-allowed'
                        : 'btn-secondary text-sm'
                  }
                  onClick={() => !tab.disabled && setResultTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Client-side filter + sort toolbar */}
            <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-surface-50 rounded border border-surface-200">
              <div>
                <label className="label">Word Filter</label>
                <input className="input" type="text" placeholder="e.g. fire, stone"
                  value={wordFilter} onChange={(e) => setWordFilter(e.target.value)} />
              </div>
              <div>
                <label className="label">Max Occurrences</label>
                <input className="input" type="number" min="0" placeholder="No limit"
                  value={maxCount || ''} onChange={(e) => setMaxCount(parseInt(e.target.value) || 0)}
                  style={{ width: 100 }} />
              </div>
              <div>
                <label className="label">Sort</label>
                <div className="flex gap-1">
                  <button
                    className={sortOrder === 'desc' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                    onClick={() => setSortOrder('desc')}
                    title="Most frequent first"
                  >
                    High → Low
                  </button>
                  <button
                    className={sortOrder === 'asc' ? 'btn-primary text-sm' : 'btn-secondary text-sm'}
                    onClick={() => setSortOrder('asc')}
                    title="Least frequent first"
                  >
                    Low → High
                  </button>
                </div>
              </div>
            </div>

            {/* Result content */}
            {resultTab === 'cloud' && (
              filteredCloudData.length > 0
                ? <WordCloudChart
                    data={filteredCloudData}
                    reversed={sortOrder === 'asc'}
                    onWordClick={(word) => {
                      setWordFilter(word);
                      setResultTab('table');
                    }}
                  />
                : <p className="text-sm text-surface-700">No words match current filters.</p>
            )}

            {resultTab === 'graph' && (
              filteredLinks.length > 0
                ? <WordSongGraph links={filteredLinks} maxWords={40} reversed={sortOrder === 'asc'} />
                : <p className="text-sm text-surface-700">
                    {isMultiSong ? 'No word-song link data. Run analysis first.'
                      : 'Word-song graph requires band or album scope.'}
                  </p>
            )}

            {resultTab === 'phrases' && (
              filteredPhrases.length > 0
                ? <WordFrequencyTable
                    words={filteredPhrases}
                    title={`Top ${ngramN === 2 ? 'Bigrams' : 'Trigrams'}`}
                    songLinks={analysis?.phraseSongLinks}
                  />
                : <p className="text-sm text-surface-700">No repeating phrases found. Try a larger scope or lower min occurrences.</p>
            )}

            {resultTab === 'table' && (
              filteredTopWords.length > 0
                ? <WordFrequencyTable
                    words={filteredTopWords}
                    title="Top Words"
                    songLinks={filteredLinks}
                  />
                : <p className="text-sm text-surface-700">No words match current filters.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

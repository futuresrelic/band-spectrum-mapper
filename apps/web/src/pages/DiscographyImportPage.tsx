import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { discographyApi } from '../api/discography';
import type { DiscographyImportResult } from '../api/discography';
import PageHeader from '../components/layout/PageHeader';

const SCORE_KEYS = ['aggression', 'complexity', 'atmosphere', 'emotion', 'psychedelic', 'concept'] as const;
const SCORE_ABBR: Record<string, string> = {
  aggression: 'Agg',
  complexity: 'Cpl',
  atmosphere: 'Atm',
  emotion: 'Emo',
  psychedelic: 'Psy',
  concept: 'Con',
};

const ACTION_CLS: Record<string, string> = {
  create:    'text-green-700 font-medium',
  update:    'text-blue-700 font-medium',
  existing:  'text-surface-400',
  unchanged: 'text-surface-300',
};

export default function DiscographyImportPage() {
  const [paste, setPaste] = useState('');
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<DiscographyImportResult | null>(null);
  const [op, setOp] = useState<'preview' | 'import' | null>(null);

  const mutation = useMutation({
    mutationFn: ({ payload, dryRun }: { payload: unknown; dryRun: boolean }) =>
      discographyApi.run(payload, dryRun),
    onSuccess: (data) => { setResult(data); setParseError(''); },
    onError: (e) => { setParseError(e instanceof Error ? e.message : 'Request failed'); setOp(null); },
    onSettled: () => setOp(null),
  });

  const tryParse = (): unknown | null => {
    try {
      return JSON.parse(paste.trim());
    } catch {
      setParseError('Invalid JSON — check for syntax errors');
      return null;
    }
  };

  const handlePreview = () => {
    setParseError('');
    const payload = tryParse();
    if (!payload) return;
    setOp('preview');
    mutation.mutate({ payload, dryRun: true });
  };

  const handleImport = () => {
    setParseError('');
    const payload = tryParse();
    if (!payload) return;
    setOp('import');
    mutation.mutate({ payload, dryRun: false });
  };

  const isPending = mutation.isPending;

  return (
    <div>
      <PageHeader
        title="Discography Import"
        subtitle="Paste a full discography JSON to seed or update bands, albums, songs, and scores"
      />

      <div className="card mb-6 space-y-4">
        <div>
          <label className="label">JSON Payload</label>
          <textarea
            className="input font-mono text-xs leading-relaxed"
            rows={14}
            spellCheck={false}
            placeholder={'{ "artist": "Tool", "albums": [{ "album_title": "Undertow", "album_slug": "undertow", "year": 1993, "tracks": [{ "track_number": 1, "song_title": "Intolerance", "song_slug": "intolerance", "Aggression": 8, "Complexity": 6, "Atmosphere": 4, "Emotion": 8, "Psychedelic": 2, "Concept": 6 }] }] }'}
            value={paste}
            onChange={(e) => { setPaste(e.target.value); setResult(null); setParseError(''); }}
          />
        </div>

        <div className="text-xs text-surface-700 space-y-0.5">
          <p>Required fields: <code>artist</code>, <code>albums[].album_title</code>, <code>albums[].album_slug</code>, <code>tracks[].song_title</code>, <code>tracks[].track_number</code></p>
          <p>Score keys: <code>Aggression</code>, <code>Complexity</code>, <code>Atmosphere</code>, <code>Emotion</code>, <code>Psychedelic</code>, <code>Concept</code> (0–10 integers, capitalised or lowercase)</p>
          <p>Re-import is safe: existing songs are matched by track number and scores are updated only when changed.</p>
        </div>

        {parseError && <p className="text-red-600 text-sm">{parseError}</p>}

        <div className="flex gap-3">
          <button
            className="btn-secondary"
            onClick={handlePreview}
            disabled={isPending || !paste.trim()}
          >
            {isPending && op === 'preview' ? 'Previewing...' : 'Preview (dry run)'}
          </button>
          <button
            className="btn-primary"
            onClick={handleImport}
            disabled={isPending || !paste.trim()}
          >
            {isPending && op === 'import' ? 'Importing...' : 'Import Now'}
          </button>
          {paste && (
            <button
              className="btn-ghost text-sm"
              onClick={() => { setPaste(''); setResult(null); setParseError(''); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {result && (
        <>
          {/* Summary banner */}
          <div className={`card mb-4 border-l-4 ${result.dryRun ? 'border-yellow-400' : 'border-green-500'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-sm mb-1">
                  {result.dryRun
                    ? 'Dry run preview — nothing was written'
                    : 'Import complete'}
                </p>
                <p className="text-sm text-surface-700">
                  Band: <strong>{result.band.name}</strong>{' '}
                  <span className={result.band.action === 'create' ? 'text-green-700' : 'text-surface-400'}>
                    ({result.band.action === 'create' ? 'will be created' : 'already exists'})
                  </span>
                </p>
                <div className="flex flex-wrap gap-6 text-sm mt-2">
                  <span>
                    Albums:{' '}
                    <strong className="text-green-700">{result.totals.albums.created}</strong> new,{' '}
                    <strong className="text-surface-400">{result.totals.albums.existing}</strong> existing
                  </span>
                  <span>
                    Songs:{' '}
                    <strong className="text-green-700">{result.totals.songs.created}</strong> new,{' '}
                    <strong className="text-surface-400">{result.totals.songs.existing}</strong> existing
                  </span>
                  <span>
                    Scores:{' '}
                    <strong className="text-green-700">{result.totals.scores.created}</strong> new,{' '}
                    <strong className="text-blue-700">{result.totals.scores.updated}</strong> updated,{' '}
                    <strong className="text-surface-400">{result.totals.scores.unchanged}</strong> unchanged
                  </span>
                </div>
              </div>
              {!result.dryRun && (
                <Link to="/library" className="btn-secondary text-sm shrink-0">
                  View Library →
                </Link>
              )}
            </div>
            {result.dryRun && (
              <p className="text-xs text-yellow-700 mt-3">
                Click <strong>Import Now</strong> to write these changes.
              </p>
            )}
          </div>

          {/* Per-row table */}
          <div className="card overflow-hidden">
            <div className="text-xs text-surface-700 mb-2 px-1">
              <strong>Agg</strong> Aggression · <strong>Cpl</strong> Complexity · <strong>Atm</strong> Atmosphere · <strong>Emo</strong> Emotion · <strong>Psy</strong> Psychedelic · <strong>Con</strong> Concept
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-50 z-10">
                  <tr className="border-b border-surface-200 text-left">
                    <th className="py-2 px-3 font-medium">Album</th>
                    <th className="py-2 px-2 font-medium text-right">#</th>
                    <th className="py-2 px-3 font-medium">Song</th>
                    <th className="py-2 px-3 font-medium">Song</th>
                    <th className="py-2 px-3 font-medium">Score</th>
                    {SCORE_KEYS.map((k) => (
                      <th key={k} className="py-2 px-2 font-medium text-right">{SCORE_ABBR[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-surface-100 hover:bg-surface-50">
                      <td className="py-1.5 px-3 text-surface-600 whitespace-nowrap">{row.albumTitle}</td>
                      <td className="py-1.5 px-2 text-surface-500 text-right">{row.trackNumber}</td>
                      <td className="py-1.5 px-3 font-medium whitespace-nowrap">{row.songTitle}</td>
                      <td className={`py-1.5 px-3 whitespace-nowrap ${ACTION_CLS[row.songAction]}`}>
                        {row.songAction}
                      </td>
                      <td className={`py-1.5 px-3 whitespace-nowrap ${ACTION_CLS[row.scoreAction]}`}>
                        {row.scoreAction}
                      </td>
                      {SCORE_KEYS.map((k) => (
                        <td key={k} className="py-1.5 px-2 text-right font-mono text-surface-700">
                          {row.scores[k]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

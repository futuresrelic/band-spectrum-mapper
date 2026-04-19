import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bandsApi } from '../api/bands';
import { importsApi } from '../api/imports';
import type { ScoreImportResult } from '../api/imports';
import PageHeader from '../components/layout/PageHeader';
import type { ImportSummary } from '@band-spectrum-mapper/shared';

const STATUS_COLORS: Record<string, string> = {
  success: 'text-green-700 bg-green-50',
  partial: 'text-yellow-700 bg-yellow-50',
  failed: 'text-red-700 bg-red-50',
  pending: 'text-surface-700 bg-surface-100',
  processing: 'text-blue-700 bg-blue-50',
};

export default function ImportsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [bandId, setBandId] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Score paste import state
  const [scoreBandId, setScoreBandId] = useState('');
  const [scorePaste, setScorePaste] = useState('');
  const [scoreParseError, setScoreParseError] = useState('');
  const [scoreResult, setScoreResult] = useState<ScoreImportResult | null>(null);

  const scoreMutation = useMutation({
    mutationFn: ({ bandId, scores }: { bandId: string; scores: unknown[] }) =>
      importsApi.importScores(bandId, scores),
    onSuccess: (data) => {
      setScoreResult(data);
      setScoreParseError('');
      qc.invalidateQueries({ queryKey: ['songs'] });
    },
    onError: (e) => setScoreParseError(e instanceof Error ? e.message : 'Import failed'),
  });

  const handleScoreImport = () => {
    setScoreResult(null);
    setScoreParseError('');
    if (!scoreBandId) { setScoreParseError('Please select a band'); return; }
    let parsed: unknown;
    try {
      parsed = JSON.parse(scorePaste.trim());
    } catch {
      setScoreParseError('Invalid JSON — paste a valid JSON array');
      return;
    }
    if (!Array.isArray(parsed)) { setScoreParseError('JSON must be an array of song score objects'); return; }
    scoreMutation.mutate({ bandId: scoreBandId, scores: parsed });
  };

  const { data: bands } = useQuery({ queryKey: ['bands'], queryFn: () => bandsApi.list() });
  const { data: imports, isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: () => importsApi.list(),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => importsApi.upload(bandId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imports'] });
      if (fileRef.current) fileRef.current.value = '';
      setUploadError('');
    },
    onError: (e) => setUploadError(e instanceof Error ? e.message : 'Upload failed'),
  });

  const handleUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setUploadError('Please select a file'); return; }
    if (!bandId) { setUploadError('Please select a band'); return; }
    uploadMutation.mutate(file);
  };

  return (
    <div>
      <PageHeader
        title="Imports"
        subtitle="Import lyrics from .txt, .md, .csv, or .json files"
      />

      <div className="card mb-6 space-y-4">
        <h2>Upload Lyrics File</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Band *</label>
            <select className="input" value={bandId} onChange={(e) => setBandId(e.target.value)}>
              <option value="">Select band...</option>
              {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">File *</label>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.csv,.json"
              className="input py-1"
            />
          </div>
        </div>

        <div className="text-xs text-surface-700 space-y-1">
          <p><strong>.txt / .md</strong> — whole file becomes one lyric record; song title = filename</p>
          <p><strong>.csv</strong> — columns: <code>songTitle</code>, <code>lyrics</code>, <code>albumTitle</code> (optional)</p>
          <p><strong>.json</strong> — array of <code>{"{ songTitle, lyrics, albumTitle? }"}</code></p>
        </div>

        {uploadError && <p className="text-red-600 text-sm">{uploadError}</p>}

        <button
          className="btn-primary"
          onClick={handleUpload}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? 'Uploading...' : 'Upload File'}
        </button>

        {uploadMutation.isSuccess && uploadMutation.data && (
          <div className={`rounded p-3 text-sm ${STATUS_COLORS[uploadMutation.data.status] ?? ''}`}>
            <p className="font-medium capitalize">{uploadMutation.data.status}</p>
            {uploadMutation.data.summary && (
              <p>
                {(uploadMutation.data.summary as ImportSummary).successRows} rows imported,{' '}
                {(uploadMutation.data.summary as ImportSummary).failedRows} failed
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card mb-6 space-y-4">
        <h2>Paste Score Data</h2>
        <p className="text-sm text-surface-700">
          Paste a JSON array of song scores (e.g. from ChatGPT). Each object needs a <code>song</code> field
          and axis scores: <code>Aggression</code>, <code>Complexity</code>, <code>Atmosphere</code>,{' '}
          <code>Emotion</code>, <code>Psychedelic</code>, <code>Concept</code> (0–10).
        </p>

        <div>
          <label className="label">Band *</label>
          <select className="input" value={scoreBandId} onChange={(e) => setScoreBandId(e.target.value)}>
            <option value="">Select band...</option>
            {bands?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">JSON Scores *</label>
          <textarea
            className="input font-mono text-xs"
            rows={10}
            placeholder={'[\n  { "song": "Undertow", "Aggression": 7.5, "Complexity": 8, "Atmosphere": 6, "Emotion": 5, "Psychedelic": 4, "Concept": 6 }\n]'}
            value={scorePaste}
            onChange={(e) => { setScorePaste(e.target.value); setScoreResult(null); setScoreParseError(''); }}
          />
        </div>

        {scoreParseError && <p className="text-red-600 text-sm">{scoreParseError}</p>}

        <button
          className="btn-primary"
          onClick={handleScoreImport}
          disabled={scoreMutation.isPending || !scorePaste.trim()}
        >
          {scoreMutation.isPending ? 'Importing...' : 'Import Scores'}
        </button>

        {scoreResult && (
          <div className="rounded p-4 bg-surface-50 border border-surface-200 text-sm space-y-2">
            <div className="flex gap-6">
              <span><strong>{scoreResult.total}</strong> rows in paste</span>
              <span className="text-green-700"><strong>{scoreResult.matched}</strong> matched &amp; updated</span>
              {scoreResult.notFound.length > 0 && (
                <span className="text-yellow-700"><strong>{scoreResult.notFound.length}</strong> not found</span>
              )}
            </div>
            {scoreResult.updated.length > 0 && (
              <div>
                <p className="text-xs font-medium text-surface-700 mb-1">Updated songs:</p>
                <p className="text-xs text-surface-900">{scoreResult.updated.join(', ')}</p>
              </div>
            )}
            {scoreResult.notFound.length > 0 && (
              <div>
                <p className="text-xs font-medium text-yellow-700 mb-1">Not found (title mismatch):</p>
                <p className="text-xs text-yellow-800">{scoreResult.notFound.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <h2 className="mb-4">Import History</h2>

      {isLoading && <p className="text-surface-700 text-sm">Loading...</p>}

      {imports && imports.length === 0 && (
        <p className="text-surface-700 text-sm">No imports yet.</p>
      )}

      {imports && imports.length > 0 && (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left">
                <th className="pb-2 pr-4 font-medium text-surface-700">File</th>
                <th className="pb-2 pr-4 font-medium text-surface-700">Type</th>
                <th className="pb-2 pr-4 font-medium text-surface-700">Status</th>
                <th className="pb-2 pr-4 font-medium text-surface-700">Result</th>
                <th className="pb-2 font-medium text-surface-700">Date</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => {
                const summary = imp.summary as ImportSummary | null;
                return (
                  <tr key={imp.id} className="border-b border-surface-100">
                    <td className="py-2 pr-4 font-mono text-xs">{imp.filename}</td>
                    <td className="py-2 pr-4 capitalize">{imp.importType}</td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${STATUS_COLORS[imp.status] ?? 'badge-gray'}`}>
                        {imp.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-surface-700">
                      {summary
                        ? `${summary.successRows}/${summary.totalRows} rows`
                        : '—'}
                    </td>
                    <td className="py-2 text-xs text-surface-700">
                      {new Date(imp.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {imports?.some((imp) => {
        const s = imp.summary as ImportSummary | null;
        return s && s.errors.length > 0;
      }) && (
        <div className="card mt-4">
          <h3 className="mb-3">Import Errors</h3>
          {imports
            .filter((imp) => {
              const s = imp.summary as ImportSummary | null;
              return s && s.errors.length > 0;
            })
            .map((imp) => {
              const s = imp.summary as ImportSummary;
              return (
                <div key={imp.id} className="mb-4">
                  <p className="text-xs font-medium mb-1">{imp.filename}</p>
                  <ul className="space-y-1">
                    {s.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-700">
                        Row {err.row}{err.field ? ` (${err.field})` : ''}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../api/settings';
import PageHeader from '../components/layout/PageHeader';
import ErrorMessage from '../components/layout/ErrorMessage';

export default function SettingsPage() {
  const qc = useQueryClient();
  const [newWord, setNewWord] = useState('');
  const [addError, setAddError] = useState('');

  const { data: stopwords, isLoading, error } = useQuery({
    queryKey: ['stopwords'],
    queryFn: () => settingsApi.getStopwords(),
  });

  const addMutation = useMutation({
    mutationFn: (word: string) => settingsApi.addStopword(word),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stopwords'] });
      setNewWord('');
      setAddError('');
    },
    onError: (e) => setAddError(e instanceof Error ? e.message : 'Failed to add stopword'),
  });

  const removeMutation = useMutation({
    mutationFn: (word: string) => settingsApi.removeStopword(word),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stopwords'] }),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newWord.trim().toLowerCase();
    if (!trimmed) { setAddError('Enter a word'); return; }
    addMutation.mutate(trimmed);
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure analysis behavior" />

      <div className="card mb-6">
        <h2 className="mb-1">Custom Stopwords</h2>
        <p className="text-xs text-surface-700 mb-4">
          Words added here will be excluded from lyrics analysis in addition to the built-in English stopword list.
          Changes take effect on the next analysis run.
        </p>

        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            className="input"
            placeholder="Add a stopword..."
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
          />
          <button className="btn-primary shrink-0" type="submit" disabled={addMutation.isPending}>
            Add
          </button>
        </form>

        {addError && <p className="text-red-600 text-sm mb-3">{addError}</p>}
        {error && <ErrorMessage error={error} />}

        {isLoading && <p className="text-surface-700 text-sm">Loading...</p>}

        {stopwords && stopwords.length === 0 && (
          <p className="text-surface-700 text-sm">
            No custom stopwords added yet. The built-in English stopword list is always applied.
          </p>
        )}

        {stopwords && stopwords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stopwords.map((sw) => (
              <span
                key={sw.id}
                className="inline-flex items-center gap-1 rounded bg-surface-100 px-2 py-1 text-sm font-mono"
              >
                {sw.word}
                <button
                  className="text-surface-700 hover:text-red-600 transition-colors ml-1"
                  onClick={() => removeMutation.mutate(sw.word)}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-1">About</h2>
        <p className="text-sm text-surface-700">
          Band Spectrum Mapper — a reusable music analysis platform for bands, albums, lyrics, and style scoring.
        </p>
        <p className="text-xs text-surface-700 mt-2">
          Built with React, Express, Prisma, PostgreSQL, and Recharts.
        </p>
      </div>
    </div>
  );
}

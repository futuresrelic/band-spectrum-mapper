import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plannerApi } from '../../api/socialPlanner';
import type { CommentInsight } from '../../api/socialPlanner';

interface Band { id: string; name: string; }

interface Props {
  bands: Band[];
}

export default function CommentMiningTab({ bands }: Props) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState('');
  const [bandId, setBandId] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [selected, setSelected] = useState<CommentInsight | null>(null);

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ['planner-comments'],
    queryFn: plannerApi.listInsights,
  });

  const analyzeMutation = useMutation({
    mutationFn: plannerApi.analyzeComments,
    onSuccess: (insight) => {
      void qc.invalidateQueries({ queryKey: ['planner-comments'] });
      setSelected(insight);
      setRaw('');
      setSourceUrl('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: plannerApi.deleteInsight,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['planner-comments'] });
      setSelected(null);
    },
  });

  function analyze() {
    if (!raw.trim()) return;
    analyzeMutation.mutate({
      rawComments: raw,
      ...(bandId    ? { bandId }    : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: input + history */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-surface-900 mb-3">Analyze fan comments</h3>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select value={bandId} onChange={(e) => setBandId(e.target.value)}
                className="flex-1 border border-surface-300 rounded px-3 py-2 text-sm">
                <option value="">Band (optional)</option>
                {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="Post URL (optional)"
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm"
            />
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Paste fan comments here — one per line or copied from Facebook/Instagram…"
              rows={10}
              className="w-full border border-surface-300 rounded px-3 py-2 text-sm resize-none font-mono text-xs"
            />
            <button
              onClick={analyze}
              disabled={!raw.trim() || analyzeMutation.isPending}
              className="w-full py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
            >
              {analyzeMutation.isPending ? 'Analyzing with AI…' : 'Analyze comments'}
            </button>
            {analyzeMutation.isError && (
              <p className="text-xs text-red-500">Analysis failed. Check your OpenAI API key.</p>
            )}
          </div>
        </div>

        {/* Past analyses */}
        <div>
          <h4 className="text-sm font-semibold text-surface-700 mb-2">Past analyses</h4>
          {isLoading && <p className="text-sm text-surface-400">Loading…</p>}
          <div className="space-y-2">
            {insights.map((insight) => (
              <button
                key={insight.id}
                onClick={() => setSelected(insight)}
                className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${
                  selected?.id === insight.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-surface-200 bg-white hover:border-surface-400'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-surface-800 font-medium truncate">
                    {new Date(insight.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="text-xs text-surface-400 shrink-0">
                    {insight.futurePostIdeas.length} ideas
                  </span>
                </div>
                <p className="text-xs text-surface-500 mt-0.5 truncate">
                  {insight.rawComments.slice(0, 80)}…
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: analysis results */}
      {selected && (
        <div className="bg-white border border-surface-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-surface-900">Analysis results</h4>
            <div className="flex gap-2">
              <button
                onClick={() => { if (confirm('Delete this analysis?')) deleteMutation.mutate(selected.id); }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Delete
              </button>
              <button onClick={() => setSelected(null)} className="text-xs text-surface-400 hover:text-surface-700">✕</button>
            </div>
          </div>

          {selected.engagementNotes && (
            <Section title="Engagement summary" items={[selected.engagementNotes]} prose />
          )}
          <Section title="Future post ideas" items={selected.futurePostIdeas} />
          <Section title="Recurring themes" items={selected.recurringThemes} />
          <Section title="Fan phrasing" items={selected.fanPhrasing} mono />
          <Section title="Poll questions" items={selected.pollQuestions} />
          <Section title="Suggested lyrics / quotes" items={selected.suggestedLyrics} mono />
          <Section title="Corrections / misconceptions" items={selected.corrections} />

          {selected.sourceUrl && (
            <p className="text-xs text-surface-400 pt-2 border-t border-surface-100">
              Source: <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="underline">{selected.sourceUrl}</a>
            </p>
          )}
        </div>
      )}

      {!selected && !analyzeMutation.isPending && (
        <div className="hidden lg:flex items-center justify-center text-surface-400 text-sm border border-dashed border-surface-200 rounded-lg">
          Select an analysis or run a new one to see results here.
        </div>
      )}
    </div>
  );
}

function Section({ title, items, mono, prose }: { title: string; items: string[]; mono?: boolean; prose?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h5 className="text-xs font-semibold text-surface-600 uppercase tracking-wide mb-1">{title}</h5>
      {prose ? (
        <p className="text-sm text-surface-800 leading-relaxed">{items[0]}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className={`text-sm text-surface-800 ${mono ? 'font-mono text-xs bg-surface-50 px-2 py-1 rounded' : ''}`}>
              {!mono && '• '}{item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface Message { role: 'user' | 'assistant'; content: string; }

interface Props {
  contextHint?: string;  // e.g. "Working on a poll about Lateralus for Instagram"
}

const STARTERS = [
  'Write a Facebook caption for this post',
  'Give me 3 poll question options',
  'Generate Instagram hashtags',
  'Write a hook for a Reel',
  'Suggest follow-up post ideas',
  'Create a discussion starter for a Facebook group',
  'Write a comment response template',
  'Help me brainstorm a content series',
];

export default function PlannerAiPanel({ contextHint }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    // Reset chat when context changes significantly
    setMessages([]);
    setError('');
  }, [contextHint]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = { role: 'user', content };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const systemContext = contextHint
        ? `You are a social media content strategist for a music analysis platform. Context: ${contextHint}`
        : 'You are a social media content strategist for a music analysis platform.';

      const reply = await api.post<{ reply: string }>('/api/social/chat', {
        messages: [
          { role: 'user', content: systemContext + '\n\n' + content },
          ...next.slice(1),
        ],
      });
      setMessages([...next, { role: 'assistant', content: reply.reply }]);
    } catch {
      setError('Failed to get a response. Check your API key.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-surface-200">
      <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
        <h3 className="text-sm font-semibold text-surface-900">AI Assistant</h3>
        {contextHint && (
          <p className="text-xs text-surface-500 mt-0.5 truncate" title={contextHint}>{contextHint}</p>
        )}
      </div>

      {/* Starter prompts when empty */}
      {messages.length === 0 && (
        <div className="px-3 py-3 flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-full px-2.5 py-1 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            <span
              className={`inline-block px-3 py-2 rounded-lg max-w-[90%] whitespace-pre-wrap text-left ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-100 text-surface-900'
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}
        {loading && (
          <div className="text-left">
            <span className="inline-block px-3 py-2 rounded-lg bg-surface-100 text-surface-500 text-sm">
              Thinking…
            </span>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-surface-200">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Ask for help with captions, polls, hashtags…"
            rows={2}
            className="flex-1 border border-surface-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors self-end"
          >
            Send
          </button>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="mt-1.5 text-xs text-surface-400 hover:text-surface-600"
          >
            Clear chat
          </button>
        )}
      </div>
    </div>
  );
}

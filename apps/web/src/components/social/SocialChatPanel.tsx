import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  songId?: string;
  songLabel?: string;
}

const STARTERS = [
  'Write a Facebook group post about this radar',
  'Give me 3 Instagram captions — dark tone',
  'Make a poll for Threads',
  'Create a discussion starter',
  'Write a Reddit analysis post',
  'What angle would work best for this song?',
];

export default function SocialChatPanel({ songId, songLabel }: Props) {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      inputRef.current?.focus();
    }
  }, [open, messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = { role: 'user', content };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const result = await api.post<{ reply: string }>('/api/social/chat', {
        messages: nextMessages,
        songId: songId ?? undefined,
      });
      setMessages([...nextMessages, { role: 'assistant', content: result.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="AI Social Strategist"
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all ${
          open ? 'bg-indigo-700 hover:bg-indigo-600' : 'bg-indigo-600 hover:bg-indigo-500'
        }`}
      >
        {open ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl bg-gray-950 border border-white/10 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">AI Social Strategist</p>
              {songLabel && (
                <p className="text-xs text-indigo-400 truncate">{songLabel}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-white/30 hover:text-white/70 ml-1 text-lg leading-none"
              >×</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {isEmpty && (
              <div className="space-y-4 pt-2">
                <p className="text-xs text-white/40 leading-relaxed">
                  Your AI content strategist — generates social posts, iterates on drafts, and advises on platform strategy.
                  {songLabel && ` Context: ${songLabel}.`}
                </p>
                <div className="space-y-1.5">
                  <p className="text-xs text-white/25 uppercase tracking-widest">Try asking</p>
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      className="w-full text-left text-xs text-white/50 hover:text-white/80 hover:bg-white/5 px-3 py-2 rounded-lg transition-colors border border-white/5 hover:border-white/15"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-white/8 text-white/90 rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/8 rounded-2xl rounded-tl-sm px-3.5 py-3 flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 px-1">{error}</p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-1 shrink-0 border-t border-white/8">
            <div className="flex gap-2 items-end bg-white/5 rounded-xl border border-white/10 px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask for posts, edits, strategy…"
                rows={1}
                className="flex-1 bg-transparent text-sm text-white placeholder-white/25 resize-none outline-none min-h-[24px] max-h-[120px]"
                style={{ overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
              />
              <button
                onClick={() => void send()}
                disabled={!input.trim() || loading}
                className="shrink-0 w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 flex items-center justify-center transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14m-7-7l7 7-7 7" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-white/20 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
          </div>
        </div>
      )}
    </>
  );
}

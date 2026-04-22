import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { songsApi } from '../api/songs';
import { useAuth } from '../contexts/AuthContext';
import type { SongComment } from '@band-spectrum-mapper/shared';
import ErrorMessage from './layout/ErrorMessage';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface Props {
  songId: string;
  /** If true, render as a collapsible card with a header (for song detail page).
   *  If false, render inline without extra chrome (for viewer page). */
  card?: boolean;
}

export default function CommentSection({ songId, card = true }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['comments', songId],
    queryFn: () => songsApi.getComments(songId),
  });

  const post = useMutation({
    mutationFn: () => songsApi.postComment(songId, text.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['comments', songId] });
      setText('');
    },
  });

  const del = useMutation({
    mutationFn: (commentId: string) => songsApi.deleteComment(songId, commentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['comments', songId] }),
  });

  const body = (
    <div className="space-y-4">
      {isLoading && <p className="text-sm text-surface-500">Loading comments…</p>}

      {comments.length === 0 && !isLoading && (
        <p className="text-sm text-surface-500 italic">
          No comments yet. Be the first to share your interpretation.
        </p>
      )}

      {comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c: SongComment) => (
            <li key={c.id} className="flex gap-3 text-sm">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-surface-200 flex items-center justify-center text-xs font-medium text-surface-600 overflow-hidden">
                {c.user.avatarUrl ? (
                  <img src={c.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  (c.user.name?.[0] ?? '?').toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium text-surface-900">{c.user.name ?? 'Anonymous'}</span>
                  <span className="text-xs text-surface-400">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-surface-700 whitespace-pre-wrap break-words">{c.text}</p>
              </div>
              {(user?.userId === c.userId || user?.isAdmin) && (
                <button
                  className="flex-shrink-0 text-xs text-surface-400 hover:text-red-500 transition-colors self-start mt-0.5"
                  title="Delete comment"
                  onClick={() => del.mutate(c.id)}
                  disabled={del.isPending}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {del.isError && <ErrorMessage error={del.error} />}

      {user ? (
        <div className="space-y-2 border-t border-surface-100 pt-4">
          <textarea
            className="textarea w-full text-sm"
            rows={3}
            placeholder="Share your interpretation…"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button
              className="btn-primary text-sm"
              disabled={!text.trim() || post.isPending}
              onClick={() => post.mutate()}
            >
              {post.isPending ? 'Posting…' : 'Post'}
            </button>
            <span className="text-xs text-surface-400 ml-auto">{text.length}/2000</span>
          </div>
          {post.isError && <ErrorMessage error={post.error} />}
        </div>
      ) : (
        <div className="border-t border-surface-100 pt-4">
          <p className="text-sm text-surface-500">
            <a href="/dashboard" className="text-indigo-600 hover:underline font-medium">Sign in</a>{' '}
            to join the discussion.
          </p>
        </div>
      )}
    </div>
  );

  if (!card) return <div>{body}</div>;

  return (
    <div className="card mt-6 p-0 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          Discussion{comments.length > 0 ? ` (${comments.length})` : ''}
        </span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-4 pb-4 border-t border-surface-100">{body}</div>}
    </div>
  );
}

import type { SocialPost, CalendarPost, PostStatus } from '../../api/socialPlanner';

export const STATUS_COLORS: Record<PostStatus, string> = {
  idea:            'bg-gray-100 text-gray-600',
  drafted:         'bg-blue-100 text-blue-700',
  designed:        'bg-purple-100 text-purple-700',
  scheduled:       'bg-yellow-100 text-yellow-700',
  posted:          'bg-green-100 text-green-700',
  needs_follow_up: 'bg-red-100 text-red-700',
  archived:        'bg-gray-100 text-gray-400',
};

export const STATUS_LABELS: Record<PostStatus, string> = {
  idea:            'Idea',
  drafted:         'Drafted',
  designed:        'Designed',
  scheduled:       'Scheduled',
  posted:          'Posted',
  needs_follow_up: 'Follow-up needed',
  archived:        'Archived',
};

export const PLATFORM_LABELS: Record<string, string> = {
  facebook_page:  'FB Page',
  facebook_group: 'FB Group',
  instagram:      'Instagram',
  tiktok:         'TikTok',
  youtube_shorts: 'YT Shorts',
};

export const POST_TYPES = [
  { value: 'image',             label: 'Image post' },
  { value: 'video',             label: 'Video / Reel' },
  { value: 'poll',              label: 'Poll' },
  { value: 'carousel',          label: 'Carousel' },
  { value: 'radar_chart',       label: 'Radar chart' },
  { value: 'album_theme_map',   label: 'Album theme map' },
  { value: 'lyric_philosophy',  label: 'Lyric / Philosophy' },
  { value: 'discussion_prompt', label: 'Discussion prompt' },
  { value: 'comment_response',  label: 'Comment response' },
  { value: 'follow_up',         label: 'Follow-up post' },
];

export const PLATFORMS = [
  { value: 'facebook_page',  label: 'Facebook Page' },
  { value: 'facebook_group', label: 'Facebook Group' },
  { value: 'instagram',      label: 'Instagram' },
  { value: 'tiktok',         label: 'TikTok' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
];

export const ALL_STATUSES: PostStatus[] = [
  'idea', 'drafted', 'designed', 'scheduled', 'posted', 'needs_follow_up', 'archived',
];

type PostCardPost = Pick<SocialPost, 'id' | 'title' | 'status' | 'postType' | 'platforms' | 'plannedAt' | 'band' | 'album' | 'song' | 'series'> |
  CalendarPost;

interface PostCardProps {
  post: PostCardPost;
  onClick: () => void;
  compact?: boolean;
}

export default function PostCard({ post, onClick, compact }: PostCardProps) {
  const postDate = post.plannedAt ? new Date(post.plannedAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' }) : null;

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={`w-full text-left px-1.5 py-0.5 rounded text-xs truncate leading-tight font-medium ${STATUS_COLORS[post.status]}`}
        title={post.title}
      >
        {post.title}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-surface-200 rounded-lg p-4 hover:border-surface-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[post.status]}`}>
              {STATUS_LABELS[post.status]}
            </span>
            <span className="text-xs text-surface-500 bg-surface-100 px-2 py-0.5 rounded">
              {POST_TYPES.find((t) => t.value === post.postType)?.label ?? post.postType}
            </span>
            {post.platforms.map((p) => (
              <span key={p} className="text-xs text-surface-500">{PLATFORM_LABELS[p] ?? p}</span>
            ))}
          </div>
          <p className="mt-1.5 text-sm font-medium text-surface-900 truncate">{post.title}</p>
          {'band' in post && post.band && (
            <p className="text-xs text-surface-500 mt-0.5">{post.band.name}</p>
          )}
        </div>
        {postDate && (
          <span className="text-xs text-surface-500 shrink-0 mt-0.5">{postDate}</span>
        )}
      </div>
    </button>
  );
}

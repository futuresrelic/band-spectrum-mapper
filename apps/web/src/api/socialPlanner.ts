import { api } from '../lib/api';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type PostStatus =
  | 'idea' | 'drafted' | 'designed' | 'scheduled'
  | 'posted' | 'needs_follow_up' | 'archived';

export type AssetType =
  | 'image' | 'video' | 'canva_link' | 'exported_file' | 'background' | 'thumbnail';

export type PromptCategory =
  | 'canva_gpt' | 'image_background' | 'chatgpt_caption'
  | 'claude_development' | 'post_generation' | 'reply_style';

export interface BandRef  { id: string; name: string; }
export interface AlbumRef { id: string; title: string; }
export interface SongRef  { id: string; title: string; }
export interface SeriesRef { id: string; name: string; }

export interface MediaAsset {
  id: string;
  postId: string;
  assetType: AssetType;
  label: string | null;
  url: string | null;
  canvaDesignUrl: string | null;
  exportedPath: string | null;
  imagePrompt: string | null;
  canvaPrompt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PostMetric {
  id: string;
  postId: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  views: number;
  groupPostedTo: string | null;
  notes: string | null;
  bestComments: string[];
  futureIdeas: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SocialPost {
  id: string;
  title: string;
  status: PostStatus;
  postType: string;
  platforms: string[];
  caption: string | null;
  hashtags: string[];
  cta: string | null;
  pollOptions: string[];
  notes: string | null;
  bandId: string | null;
  albumId: string | null;
  songId: string | null;
  seriesId: string | null;
  plannedAt: string | null;
  postedAt: string | null;
  postUrl: string | null;
  generatedBody: string | null;
  aiPromptUsed: string | null;
  createdAt: string;
  updatedAt: string;
  band: BandRef | null;
  album: AlbumRef | null;
  song: SongRef | null;
  series: SeriesRef | null;
  assets: MediaAsset[];
  metrics: PostMetric | null;
}

export interface CalendarPost {
  id: string;
  title: string;
  status: PostStatus;
  postType: string;
  platforms: string[];
  plannedAt: string | null;
  band: BandRef | null;
}

export interface ContentSeries {
  id: string;
  name: string;
  description: string | null;
  tone: string | null;
  visualStyleNotes: string | null;
  defaultCaptionStyle: string | null;
  hashtagSet: string[];
  examplePrompts: string[];
  bandId: string | null;
  createdAt: string;
  updatedAt: string;
  band: BandRef | null;
  _count: { posts: number };
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: PromptCategory;
  prompt: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CommentInsight {
  id: string;
  rawComments: string;
  bandId: string | null;
  sourceUrl: string | null;
  suggestedLyrics: string[];
  recurringThemes: string[];
  fanPhrasing: string[];
  futurePostIdeas: string[];
  pollQuestions: string[];
  corrections: string[];
  engagementNotes: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Post CRUD
// ---------------------------------------------------------------------------

export type CreatePostInput = {
  title: string;
  status?: PostStatus;
  postType: string;
  platforms?: string[];
  caption?: string;
  hashtags?: string[];
  cta?: string;
  pollOptions?: string[];
  notes?: string;
  bandId?: string;
  albumId?: string;
  songId?: string;
  seriesId?: string;
  plannedAt?: string;
  generatedBody?: string;
  aiPromptUsed?: string;
};

export type UpdatePostInput = {
  title?: string;
  status?: PostStatus;
  postType?: string;
  platforms?: string[];
  caption?: string;
  hashtags?: string[];
  cta?: string;
  pollOptions?: string[];
  notes?: string;
  bandId?: string | null;
  albumId?: string | null;
  songId?: string | null;
  seriesId?: string | null;
  plannedAt?: string | null;
  postedAt?: string | null;
  postUrl?: string | null;
  generatedBody?: string;
  aiPromptUsed?: string;
};

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const plannerApi = {
  // Posts
  listPosts: (params?: { status?: PostStatus; bandId?: string; month?: string }) =>
    api.get<SocialPost[]>(`/api/planner/posts${qs(params ?? {})}`),

  createPost: (data: CreatePostInput) =>
    api.post<SocialPost>('/api/planner/posts', data),

  getPost: (id: string) =>
    api.get<SocialPost>(`/api/planner/posts/${id}`),

  updatePost: (id: string, data: UpdatePostInput) =>
    api.put<SocialPost>(`/api/planner/posts/${id}`, data),

  updateStatus: (id: string, status: PostStatus) =>
    api.patch<SocialPost>(`/api/planner/posts/${id}/status`, { status }),

  deletePost: (id: string) =>
    api.delete<void>(`/api/planner/posts/${id}`),

  // Calendar
  getCalendar: (month: string) =>
    api.get<CalendarPost[]>(`/api/planner/calendar${qs({ month })}`),

  // Metrics
  upsertMetrics: (postId: string, data: Partial<PostMetric>) =>
    api.put<PostMetric>(`/api/planner/posts/${postId}/metrics`, data),

  // Assets
  addAsset: (postId: string, data: Omit<MediaAsset, 'id' | 'postId' | 'createdAt'>) =>
    api.post<MediaAsset>(`/api/planner/posts/${postId}/assets`, data),

  deleteAsset: (assetId: string) =>
    api.delete<void>(`/api/planner/assets/${assetId}`),

  // Series
  listSeries: () =>
    api.get<ContentSeries[]>('/api/planner/series'),

  createSeries: (data: Omit<ContentSeries, 'id' | 'createdAt' | 'updatedAt' | 'band' | '_count'>) =>
    api.post<ContentSeries>('/api/planner/series', data),

  updateSeries: (id: string, data: Partial<Omit<ContentSeries, 'id' | 'createdAt' | 'updatedAt' | 'band' | '_count'>>) =>
    api.put<ContentSeries>(`/api/planner/series/${id}`, data),

  deleteSeries: (id: string) =>
    api.delete<void>(`/api/planner/series/${id}`),

  // Prompts
  listPrompts: (category?: PromptCategory) =>
    api.get<PromptTemplate[]>(`/api/planner/prompts${qs(category ? { category } : {})}`),

  createPrompt: (data: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<PromptTemplate>('/api/planner/prompts', data),

  updatePrompt: (id: string, data: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>>) =>
    api.put<PromptTemplate>(`/api/planner/prompts/${id}`, data),

  deletePrompt: (id: string) =>
    api.delete<void>(`/api/planner/prompts/${id}`),

  // Comment mining
  listInsights: () =>
    api.get<CommentInsight[]>('/api/planner/comments'),

  analyzeComments: (data: { rawComments: string; bandId?: string; sourceUrl?: string }) =>
    api.post<CommentInsight>('/api/planner/comments/analyze', data),

  deleteInsight: (id: string) =>
    api.delete<void>(`/api/planner/comments/${id}`),
};

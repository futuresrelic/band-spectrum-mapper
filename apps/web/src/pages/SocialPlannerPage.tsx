import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { plannerApi } from '../api/socialPlanner';
import type { PostStatus } from '../api/socialPlanner';
import { api } from '../lib/api';
import PostCard, { STATUS_LABELS } from '../components/social/PostCard';
import PostEditorDrawer from '../components/social/PostEditorDrawer';
import CalendarTab from '../components/social/CalendarTab';
import SeriesTab from '../components/social/SeriesTab';
import PromptTab from '../components/social/PromptTab';
import CommentMiningTab from '../components/social/CommentMiningTab';
import PlannerAiPanel from '../components/social/PlannerAiPanel';

type Tab = 'calendar' | 'ideas' | 'drafts' | 'designed' | 'posted' | 'series' | 'prompts' | 'comments';

const TAB_STATUS: Partial<Record<Tab, PostStatus[]>> = {
  ideas:    ['idea'],
  drafts:   ['drafted'],
  designed: ['designed', 'scheduled'],
  posted:   ['posted', 'needs_follow_up', 'archived'],
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'ideas',    label: 'Ideas' },
  { id: 'drafts',   label: 'Drafts' },
  { id: 'designed', label: 'Designed / Scheduled' },
  { id: 'posted',   label: 'Posted' },
  { id: 'series',   label: 'Series' },
  { id: 'prompts',  label: 'Prompts' },
  { id: 'comments', label: 'Comment Mining' },
];

interface Band { id: string; name: string; }

export default function SocialPlannerPage() {
  const [activeTab,     setActiveTab]     = useState<Tab>('calendar');
  const [editingPost,   setEditingPost]   = useState<string | 'new' | null>(null);
  const [defaultDate,   setDefaultDate]   = useState<Date | undefined>();
  const [aiHint,        setAiHint]        = useState('');
  const [aiPanelOpen,   setAiPanelOpen]   = useState(true);
  const [filterBand,    setFilterBand]    = useState('');

  const { data: bands = [] } = useQuery({
    queryKey: ['bands-simple'],
    queryFn: () => api.get<Band[]>('/api/bands'),
  });

  // Post list for list-style tabs
  const listStatuses = TAB_STATUS[activeTab];
  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['planner-posts', activeTab, filterBand],
    queryFn: () => listStatuses
      ? plannerApi.listPosts({ status: listStatuses[0], ...(filterBand ? { bandId: filterBand } : {}) })
      : Promise.resolve([]),
    enabled: !!listStatuses,
  });

  // For "designed" tab we need to also fetch scheduled posts and merge
  const { data: scheduledPosts = [] } = useQuery({
    queryKey: ['planner-posts-scheduled', filterBand],
    queryFn: () => plannerApi.listPosts({ status: 'scheduled', ...(filterBand ? { bandId: filterBand } : {}) }),
    enabled: activeTab === 'designed',
  });

  // For "posted" tab we need needs_follow_up and archived too
  const { data: followUpPosts = [] } = useQuery({
    queryKey: ['planner-posts-followup', filterBand],
    queryFn: () => plannerApi.listPosts({ status: 'needs_follow_up', ...(filterBand ? { bandId: filterBand } : {}) }),
    enabled: activeTab === 'posted',
  });
  const { data: archivedPosts = [] } = useQuery({
    queryKey: ['planner-posts-archived', filterBand],
    queryFn: () => plannerApi.listPosts({ status: 'archived', ...(filterBand ? { bandId: filterBand } : {}) }),
    enabled: activeTab === 'posted',
  });

  const displayPosts = activeTab === 'designed'
    ? [...posts, ...scheduledPosts].sort((a, b) => (a.plannedAt ?? '').localeCompare(b.plannedAt ?? ''))
    : activeTab === 'posted'
    ? [...posts, ...followUpPosts, ...archivedPosts].sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
    : posts;

  const handleAiHint = useCallback((hint: string) => setAiHint(hint), []);

  function openNewPost(date?: Date) {
    setDefaultDate(date);
    setEditingPost('new');
  }

  function closeDrawer() {
    setEditingPost(null);
    setDefaultDate(undefined);
  }

  const showListFilter = !!listStatuses;
  const isListTab = !!listStatuses;

  return (
    <div className="flex h-full min-h-screen bg-surface-50">

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Page header */}
        <div className="bg-white border-b border-surface-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-surface-900">Content Planner</h1>
              <p className="text-sm text-surface-500 mt-0.5">Plan, draft, and track social media posts</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAiPanelOpen((v) => !v)}
                className={`px-3 py-1.5 border rounded text-sm font-medium transition-colors ${
                  aiPanelOpen
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-surface-300 text-surface-600 hover:bg-surface-50'
                }`}
              >
                AI Assistant
              </button>
              <button
                onClick={() => openNewPost()}
                className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                + New post
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 mt-4 -mb-4 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-surface-500 hover:text-surface-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab body */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Filter bar for list tabs */}
          {showListFilter && (
            <div className="flex items-center gap-3 mb-4">
              <select value={filterBand} onChange={(e) => setFilterBand(e.target.value)}
                className="border border-surface-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">All bands</option>
                {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <span className="text-xs text-surface-400">
                {displayPosts.length} {displayPosts.length === 1 ? 'post' : 'posts'}
              </span>
            </div>
          )}

          {activeTab === 'calendar' && (
            <CalendarTab
              onPostClick={(id) => setEditingPost(id)}
              onDayClick={(date) => openNewPost(date)}
            />
          )}

          {isListTab && (
            <div>
              {postsLoading && <p className="text-sm text-surface-400">Loading…</p>}
              {!postsLoading && displayPosts.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-surface-400 text-sm">
                    No {STATUS_LABELS[listStatuses![0]!]?.toLowerCase()} posts yet.
                  </p>
                  <button onClick={() => openNewPost()} className="mt-3 text-sm text-blue-600 hover:underline">
                    Create a post
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {displayPosts.map((p) => (
                  <PostCard key={p.id} post={p} onClick={() => setEditingPost(p.id)} />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'series'   && <SeriesTab />}
          {activeTab === 'prompts'  && <PromptTab />}
          {activeTab === 'comments' && <CommentMiningTab bands={bands} />}
        </div>
      </div>

      {/* ── AI assistant panel ── */}
      {aiPanelOpen && (
        <div className="w-80 shrink-0 border-l border-surface-200 flex flex-col h-full sticky top-0">
          <PlannerAiPanel contextHint={aiHint || undefined} />
        </div>
      )}

      {/* ── Post editor drawer ── */}
      {editingPost !== null && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} />
          <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <PostEditorDrawer
              postId={editingPost}
              defaultDate={defaultDate}
              onClose={closeDrawer}
              onContextChange={handleAiHint}
            />
          </div>
        </div>
      )}
    </div>
  );
}

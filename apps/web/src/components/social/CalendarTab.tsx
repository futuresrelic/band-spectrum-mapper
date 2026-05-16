import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { plannerApi } from '../../api/socialPlanner';
import type { CalendarPost } from '../../api/socialPlanner';
import PostCard from './PostCard';

interface Props {
  onPostClick: (postId: string) => void;
  onDayClick: (date: Date) => void;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CalendarTab({ onPostClick, onDayClick }: Props) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const month = monthKey(cursor);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['planner-calendar', month],
    queryFn: () => plannerApi.getCalendar(month),
  });

  // Build a map: "YYYY-MM-DD" → posts
  const byDay = new Map<string, CalendarPost[]>();
  for (const p of posts) {
    if (!p.plannedAt) continue;
    const d = new Date(p.plannedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const arr = byDay.get(key) ?? [];
    arr.push(p);
    byDay.set(key, arr);
  }

  // Build grid cells
  const year  = cursor.getFullYear();
  const mon   = cursor.getMonth();
  const firstDow = new Date(year, mon, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() === mon && today.getDate() === day;

  const monthLabel = cursor.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  function prev() { setCursor(new Date(year, mon - 1, 1)); }
  function next() { setCursor(new Date(year, mon + 1, 1)); }

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={prev} className="px-3 py-1.5 border border-surface-300 rounded hover:bg-surface-50 text-sm">← Prev</button>
        <h2 className="text-base font-semibold text-surface-900 min-w-[160px] text-center">{monthLabel}</h2>
        <button onClick={next} className="px-3 py-1.5 border border-surface-300 rounded hover:bg-surface-50 text-sm">Next →</button>
        {isLoading && <span className="text-xs text-surface-400 ml-2">Loading…</span>}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-px mb-px">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-surface-500 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-surface-200 border border-surface-200 rounded-lg overflow-hidden">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="bg-surface-50 min-h-[100px]" />;

          const dateKey = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayPosts = byDay.get(dateKey) ?? [];

          return (
            <div
              key={i}
              className="bg-white min-h-[100px] p-1.5 hover:bg-surface-50 cursor-pointer group"
              onClick={() => onDayClick(new Date(year, mon, day))}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday(day) ? 'bg-blue-600 text-white' : 'text-surface-600'
                  }`}
                >
                  {day}
                </span>
                <span className="text-xs text-surface-400 opacity-0 group-hover:opacity-100">+</span>
              </div>
              <div className="space-y-0.5">
                {dayPosts.slice(0, 3).map((p) => (
                  <div key={p.id} onClick={(e) => e.stopPropagation()}>
                    <PostCard
                      post={p}
                      compact
                      onClick={() => onPostClick(p.id)}
                    />
                  </div>
                ))}
                {dayPosts.length > 3 && (
                  <p className="text-xs text-surface-400 pl-1">+{dayPosts.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

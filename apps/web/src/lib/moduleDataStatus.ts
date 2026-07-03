// Shared shape for "does this Song Card module have data, and what can an
// admin do about it if not." One pattern, reused across Spectrum, Lyrics,
// Live Data, and Rhythm Lab rather than one-off buttons per module.
//
// This intentionally stays lightweight — a status descriptor + one optional
// action — not a task queue or job-tracking system. If a module needs more
// than "click a button, wait, refresh," it should keep using its existing
// dedicated admin page (e.g. /admin/lyrics-batch) and point here via a
// route-kind action instead of a handler-kind one.

import type { ConfidenceLevel } from '../components/wiki/KnowledgeConfidenceBadge';

export type ModuleStatus = 'ready' | 'missing' | 'partial' | 'stale' | 'error';

export type ModuleAdminAction =
  | { kind: 'route'; label: string; to: string }
  | { kind: 'handler'; label: string; onRun: () => Promise<unknown>; confirmMessage?: string };

export interface ModuleDataStatus {
  moduleKey: string;
  hasData: boolean;
  status: ModuleStatus;
  source: string | null;
  lastUpdated: string | null;
  confidence: ConfidenceLevel | null;
  /** null when there's nothing an admin can do beyond what already exists elsewhere */
  adminAction: ModuleAdminAction | null;
}

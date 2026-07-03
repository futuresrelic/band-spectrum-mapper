// Renders the admin action described by a server-computed ModuleDataStatus —
// either a link to an existing admin tool ('route') or a direct API call
// ('endpoint'), with its own pending/success/error state. One component so
// every "fill this in" button behaves identically, and new modules need
// zero new frontend code: the server's ModuleAdminActionDescriptor is fully
// self-describing (method + path), so this component can execute it without
// knowing what it does.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ModuleAdminActionDescriptor } from '@band-spectrum-mapper/shared';
import { api } from '../../lib/api';

interface Props {
  action: ModuleAdminActionDescriptor;
  onSuccess?: () => void;
  className?: string;
}

export default function ModuleAdminActionButton({ action, onSuccess, className = '' }: Props) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');

  const base = `inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${className}`;

  if (action.kind === 'route' && action.to) {
    return (
      <Link
        to={action.to}
        className={`${base} bg-amber-950/40 border border-amber-900/50 text-amber-300 hover:bg-amber-900/40`}
      >
        {action.label} →
      </Link>
    );
  }

  async function handleClick() {
    if (action.kind !== 'endpoint' || !action.path) return;
    setState('pending');
    try {
      if (action.method === 'PUT') await api.put(action.path, {});
      else if (action.method === 'GET') await api.get(action.path);
      else await api.post(action.path, {});
      setState('done');
      onSuccess?.();
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return <span className={`${base} bg-emerald-950/40 border border-emerald-800/50 text-emerald-300`}>✓ Done</span>;
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={state === 'pending'}
      className={`${base} ${
        state === 'error'
          ? 'bg-red-950/40 border border-red-900/50 text-red-300 hover:bg-red-900/40'
          : 'bg-amber-950/40 border border-amber-900/50 text-amber-300 hover:bg-amber-900/40'
      } disabled:opacity-60 disabled:cursor-wait`}
    >
      {state === 'pending' && (
        <span aria-hidden className="w-3 h-3 rounded-full border-2 border-amber-700 border-t-amber-300 animate-spin motion-reduce:animate-none" />
      )}
      {state === 'pending' ? 'Working…' : state === 'error' ? `${action.label} (retry)` : action.label}
    </button>
  );
}

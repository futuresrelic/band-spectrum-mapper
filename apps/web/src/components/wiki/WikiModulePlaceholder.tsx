// Empty-state tile for wiki modules that exist in the design but have no data yet.
// Every placeholder should look intentional — like a gallery wall awaiting its
// next acquisition, never like a broken widget.

import type { ReactNode } from 'react';

interface Props {
  icon: string;
  title: string;
  description: string;
  comingSoon?: boolean;
  /** Optional admin (or navigational) action rendered below the description — a real Link/button, not a fake clickable state. */
  action?: ReactNode;
}

export default function WikiModulePlaceholder({ icon, title, description, comingSoon = false, action }: Props) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-800/80 bg-gradient-to-b from-gray-900/40 to-transparent p-5">
      {/* faint corner glow so the tile reads as "reserved", not "missing" */}
      <div
        aria-hidden
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-[0.05] bg-white blur-2xl"
      />
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-lg shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
            {comingSoon && (
              <span className="text-[9px] font-medium uppercase tracking-widest text-gray-600 border border-gray-800 rounded-full px-2 py-0.5">
                In preparation
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';

interface Props {
  tip: string;
  href?: string;
  hrefLabel?: string;
  /** Position relative to anchor: default 'top', fallback to 'bottom' */
  position?: 'top' | 'bottom';
  dark?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps any inline element with a hover/click tooltip.
 * - Desktop: opens on mouseenter, closes on mouseleave
 * - Mobile: toggles on click, dismisses on outside click or Escape
 * - href opens in a new tab (stopPropagation so the tooltip doesn't close)
 */
export default function InfoTooltip({ tip, href, hrefLabel = 'Learn more →', position = 'top', dark, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const bg    = dark ? 'bg-slate-900 border-slate-700' : 'bg-surface-900 border-surface-700';
  const text  = dark ? 'text-slate-200'                : 'text-white';
  const link  = dark ? 'text-indigo-300 hover:text-indigo-200' : 'text-indigo-300 hover:text-indigo-200';
  const pos   = position === 'top'
    ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
    : 'top-full mt-2 left-1/2 -translate-x-1/2';

  return (
    <span
      ref={ref}
      className="relative inline-flex items-baseline gap-0.5 cursor-pointer"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
    >
      {children}
      {/* Info indicator — subtle ⓘ dot */}
      <span
        className={`text-[9px] leading-none select-none ${dark ? 'text-slate-600' : 'text-surface-300'}`}
        aria-hidden="true"
      >
        ⓘ
      </span>

      {open && (
        <span
          className={`absolute ${pos} z-50 w-56 rounded-lg border shadow-xl px-3 py-2.5 pointer-events-auto ${bg}`}
          onClick={(e) => e.stopPropagation()}
        >
          <span className={`text-xs leading-relaxed block ${text}`}>{tip}</span>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs mt-2 block ${link}`}
              onClick={(e) => e.stopPropagation()}
            >
              {hrefLabel}
            </a>
          )}
        </span>
      )}
    </span>
  );
}
